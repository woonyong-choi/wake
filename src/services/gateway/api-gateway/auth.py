from __future__ import annotations

from fastapi import HTTPException, Request
from passwords import normalize_email, verify_password
from rate_limits import (
    AuthenticatedRequestRateLimiter,
    AuthRateLimiter,
    login_rate_limit_policy,
)
from settings import Settings

from packages.config.constants import Auth
from packages.contracts.identity import ServiceRole, UserStatus
from packages.contracts.interfaces import SessionStore, UserStore
from packages.security.trusted_proxy import TRUSTED_PROXY_SESSION_TOKEN, trusted_proxy_identity
from packages.storage.sessions import AuthSession


def extract_session_token(request: Request) -> str | None:
    tokens = extract_session_tokens(request)
    return tokens[0] if tokens else None


def extract_session_tokens(request: Request) -> tuple[str, ...]:
    candidates: list[str] = []
    authorization = request.headers.get(Settings.AUTHORIZATION_HEADER, "")
    if authorization.lower().startswith(Settings.BEARER_PREFIX):
        candidates.append(authorization.split(" ", 1)[1].strip())
    if request.headers.get(Settings.SESSION_TOKEN_HEADER):
        candidates.append(request.headers[Settings.SESSION_TOKEN_HEADER])
    if request.cookies.get(Auth.SESSION_COOKIE_NAME):
        candidates.append(request.cookies[Auth.SESSION_COOKIE_NAME])
    return tuple(dict.fromkeys(token for token in candidates if token))


class SessionAuthService:
    def __init__(self, sessions: SessionStore) -> None:
        self.sessions = sessions
        self.rate_limiter = AuthenticatedRequestRateLimiter(sessions)

    async def require_session(self, request: Request) -> AuthSession:
        for token in extract_session_tokens(request):
            session = await self.sessions.get_session(token)
            if session is not None:
                await self.rate_limiter.check(
                    request,
                    token=session.token,
                    user_id=session.user_id,
                )
                return session
        proxy_identity = trusted_proxy_identity(request.headers)
        if proxy_identity is not None:
            return AuthSession(
                token=TRUSTED_PROXY_SESSION_TOKEN,
                user_id=proxy_identity.user_id,
                roles=[ServiceRole.SERVICE_ADMIN.value],
                workspace_id=proxy_identity.workspace_id,
                auth_mode="trusted_proxy",
            )
        raise HTTPException(status_code=401, detail=Settings.AUTHENTICATION_REQUIRED_MESSAGE)


class PasswordAuthService:
    def __init__(self, db: UserStore, sessions: SessionStore) -> None:
        self.db = db
        self.sessions = sessions
        self.rate_limiter = AuthRateLimiter(sessions)

    async def login(self, email: str, password: str, client_key: str) -> AuthSession:
        await self.rate_limiter.check(login_rate_limit_policy(), email, client_key)
        user = self.db.get_user_by_email(normalize_email(email))
        if user is None:
            raise auth_http_error(
                401, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다."
            )
        if not verify_password(password, str(user["password_hash"])):
            raise auth_http_error(
                401, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다."
            )
        status = str(user["status"])
        if status == UserStatus.PENDING_EMAIL_VERIFICATION.value:
            raise auth_http_error(403, "email_unverified", "이메일 인증이 필요합니다.")
        if status == UserStatus.PENDING_APPROVAL.value:
            raise auth_http_error(403, "approval_pending", "관리자 승인을 기다리는 계정입니다.")
        if status != UserStatus.ACTIVE.value:
            raise auth_http_error(
                401, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다."
            )
        user_id = user_id_from_record(user)
        return await self.sessions.create_session(
            user_id,
            roles_from_record(user),
            workspace_id_from_record(user) or self.db.get_default_workspace_id_for_user(user_id),
            display_name=str(user["display_name"]),
            email=str(user["email"]),
        )

    async def approve_user(self, user_id: str, workspace_id: str) -> dict[str, object]:
        user = self.db.approve_user(user_id, workspace_id)
        if user is None:
            raise HTTPException(status_code=404, detail=Settings.USER_NOT_FOUND_MESSAGE)
        return user

    async def logout(self, token: str | None) -> None:
        if token:
            await self.sessions.delete_session(token)

    def list_authorized_workspaces(self, session: AuthSession) -> list[dict[str, object]]:
        roles = self._effective_roles(session)
        return self.db.list_authorized_workspaces(
            session.user_id,
            service_admin=ServiceRole.SERVICE_ADMIN.value in roles,
        )

    async def switch_workspace(
        self,
        session: AuthSession,
        workspace_id: str,
    ) -> AuthSession:
        roles = self._effective_roles(session)
        allowed = {
            str(workspace["workspace_id"])
            for workspace in self.db.list_authorized_workspaces(
                session.user_id,
                service_admin=ServiceRole.SERVICE_ADMIN.value in roles,
            )
        }
        if workspace_id not in allowed:
            raise HTTPException(status_code=403, detail=Settings.WORKSPACE_ACCESS_DENIED_MESSAGE)

        identity = self.user_identity(session.user_id) or {}
        next_session = await self.sessions.create_session(
            session.user_id,
            roles,
            workspace_id,
            display_name=str(identity.get("display_name") or session.display_name or "") or None,
            email=str(identity.get("email") or session.email or "") or None,
            auth_mode=session.auth_mode,
        )
        if session.token != TRUSTED_PROXY_SESSION_TOKEN:
            await self.sessions.delete_session(session.token)
        return next_session

    def _effective_roles(self, session: AuthSession) -> list[str]:
        if session.auth_mode == "trusted_proxy":
            return [ServiceRole.SERVICE_ADMIN.value]
        identity = self.session_identity(session.user_id, session.workspace_id)
        if identity is None:
            raise HTTPException(status_code=401, detail=Settings.AUTHENTICATION_REQUIRED_MESSAGE)
        return [str(role) for role in identity.get("roles", [])]

    def user_identity(self, user_id: str) -> dict[str, str] | None:
        user = self.db.get_user_by_id(user_id)
        if user is None:
            return None
        return {
            "display_name": str(user["display_name"]),
            "email": str(user["email"]),
        }

    def session_identity(self, user_id: str, workspace_id: str) -> dict[str, object] | None:
        """Resolve profile and RBAC identity from persistent authority, not browser/session hints."""

        user = self.db.get_user_by_id(user_id)
        if user is None or str(user.get("status")) != UserStatus.ACTIVE.value:
            return None
        role = str(user.get("role") or "").strip()
        if not role:
            return None
        groups = sorted(
            {
                str(group_id).strip()
                for group_id in self.db.list_active_group_ids_for_user(user_id, workspace_id)
                if str(group_id).strip()
            }
        )
        return {
            "display_name": str(user["display_name"]),
            "email": str(user["email"]) if user.get("email") is not None else None,
            "groups": groups,
            "roles": [role],
        }


def user_id_from_record(user: dict[str, object]) -> str:
    return str(user.get("user_id") or user["id"])


def roles_from_record(user: dict[str, object]) -> list[str]:
    role = user.get("role") or ServiceRole.USER.value
    if isinstance(role, ServiceRole):
        return [role.value]
    return [str(role)]


def workspace_id_from_record(user: dict[str, object]) -> str | None:
    workspace_id = user.get("workspace_id")
    return str(workspace_id) if workspace_id else None


def auth_http_error(status_code: int, code: str, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "detail": detail})
