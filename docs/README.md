# Kubernetes 장애 분석·GitOps 변경 제안 도구 문서

Kubernetes 장애 증거를 보존하고 제한된 변경안을 GitOps Draft PR로 제안한 뒤 배포 결과를 다시 검증합니다.

- [Golden Path](./GOLDEN-PATH.md): ImagePullBackOff 증거부터 배포 후 검증까지의 이벤트·안전 계약
- [학습 아카이브](./LEARNING-ARCHIVE.md): 구현 판단, 코드 경로와 대표 검증
- [Project Map](./PROJECT-MAP.md): runtime, route, 저장소 디렉터리의 현재 책임
- [Cleanup Matrix](./CLEANUP-MATRIX.md): 제거한 제품 표면과 migration 호환을 위해 격리한 코드

빠른 실행과 전체 검증 명령은 저장소 루트 [README](../README.md)를 기준으로 합니다.
