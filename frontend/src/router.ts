export type AppRoute =
  | { kind: "overview" }
  | { kind: "incidents" }
  | { kind: "incident"; correlationId: string }
  | { kind: "not-found" };

export function resolveRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  if (normalized === "/") return { kind: "overview" };
  if (normalized === "/incidents") return { kind: "incidents" };

  const match = normalized.match(/^\/incidents\/([^/]+)$/u);
  if (match) {
    try {
      return { kind: "incident", correlationId: decodeURIComponent(match[1]) };
    } catch {
      return { kind: "not-found" };
    }
  }
  return { kind: "not-found" };
}
