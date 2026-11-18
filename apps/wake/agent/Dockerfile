# wake-agent 이미지: Node 표준 모듈만 쓰는 파일 하나(의존 패키지 없음). 기반 이미지는 digest 고정.
# 실행 이미지에는 node 실행 파일과 그것이 쓰는 라이브러리(musl, libstdc++, libgcc)만 둔다: 셸·패키지 관리자 없음,
# GPL-2.0 전용 구성 요소(busybox, apk-tools 등) 없음. API 서버 인증서는 서비스 계정의 ca.crt를 쓰므로 CA 묶음도 두지 않는다.
# 빌드: docker build -t <저장소>/wake-agent:<버전> apps/wake/agent
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base

FROM scratch
COPY --from=base /lib/ld-musl-*.so.1 /lib/
COPY --from=base /usr/lib/libstdc++.so.6* /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY licenses/ /licenses/
COPY agent.mjs /agent/agent.mjs
LABEL org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="wake-agent" \
      org.opencontainers.image.source="https://github.com/woonyong-choi/wake"
USER 10001:10001
WORKDIR /agent
ENTRYPOINT ["/usr/local/bin/node", "/agent/agent.mjs"]
