# 도구 사용자 항목과 보관 정책

연결한 도구에서 사용자가 만든 항목(경보 규칙, 무음, 알림 경로, 동기화 창, 대시보드)을 읽어 인시던트 작업에 쓰고, 허브 저장소에 남기는 자료를 등급으로 나눈다. 기간 값은 → [RULE-RETENTION](rules.md#RULE-RETENTION)이 소유하고, 이 문서는 등급·크기 상한·저장 금지·연결 해제·내보내기·도구 항목 계약을 소유한다. 실행 작업은 [tasks.md의 도구 사용자 항목과 보관 정책](tasks.md#tool-items-retention)이다.

<a id="DP-CLASS"></a>

## DP-CLASS 저장 등급

허브 저장소(`apps/wake/desktop/hub-store.cjs`)의 묶음은 모두 `apps/wake/desktop/data-policy.cjs`의 POLICY 표에 등급·모양(log·docs)·한 행 상한·묶음 상한을 선언한다. 선언 없는 이름은 저장소가 열지 않는다.

| 등급 | 뜻 | 묶음 | 기간 | 묶음 상한 | 정리 |
|---|---|---|---|---|---|
| archive | 인시던트와 함께 남는 기록. 원본에서 다시 만들 수 없다 | incidents, evidence(근거 스냅샷), audit, approvals, conversations | → [RULE-RETENTION](rules.md#RULE-RETENTION). evidence·audit·approvals는 그 인시던트가 남아 있는 동안 함께 남는다 | 없음(밀어내지 않음). 한 행 상한만 | 기간 정리 |
| cache | 원본이 다시 주거나 잃어도 되는 관측 기록 | alert-history, events, source-checks | → [RULE-RETENTION](rules.md#RULE-RETENTION) | alert-history 16 MiB, events 32 MiB, source-checks 8 MiB | 기간 정리 + 오래된 행부터 밀어냄 + 파일 다시 쓰기 |
| reference | 도구 사용자 항목의 목록: 참조·이름·내용 해시만 | tool-catalog | → [RULE-RETENTION](rules.md#RULE-RETENTION) | 8 MiB | 기간 정리 + 오래된 문서부터 밀어냄 |
| config | 설정과 번호 | meta(인시던트 번호), ai-prefs, ai-clients, ai-server | 기간으로 지우지 않음 | 없음 | 사용자가 지울 때 |
| never | 저장 금지(묶음 없음) | Secret 값, 토큰·비밀번호 필드, kubeconfig 자격, 2,000줄을 넘는 원본 로그, 가리지 않은 모델 입력 | 저장하지 않음 | 해당 없음 | 저장 직전 거절 |

- 목표: 입력: 선언 없는 묶음 이름, 선언과 다른 모양으로 열기, 저장소를 여는 코드의 모든 묶음 이름 → 기대: 선언 없는 이름과 다른 모양은 오류로 끝나고, 앱 코드가 여는 모든 이름이 선언돼 있다 → 실패: 등급 없는 묶음이 디스크에 생기면 실패.
- 목표: 입력: 열린 인시던트의 근거·감사 행이 기간을 넘김, 해결 뒤 기간을 넘긴 인시던트, 인시던트 번호 문서가 오래됨 → 기대: 열린(open·mitigated) 인시던트와 그 근거·감사·승인은 남고, 해결 뒤 기간을 넘긴 인시던트는 근거와 함께 지워지며, 번호는 지워지지 않아 INC 번호가 다시 1부터 시작하지 않는다 → 실패: 열린 인시던트의 근거가 먼저 지워지거나 번호가 되돌아가면 실패.
- 목표: 입력: cache·reference 묶음이 상한을 넘김 → 기대: 오래된 행(at)부터 빼서 상한 안으로 다시 쓰고, 덧붙이기가 상한의 1.25배를 넘기면 그 자리에서 정리한다 → 실패: 파일이 상한을 넘어 계속 자라거나 새 행이 먼저 빠지면 실패.
- 현재: `apps/wake/desktop/data-policy.cjs:19` POLICY, `apps/wake/desktop/hub-store.cjs:57` cutoff, `:71` anchorOf(열린 인시던트 보호, 클러스터 삭제 뒤 orphanedAt), `:79` keepRow(인시던트를 따라 남음), `:85` fit(크기 상한), `:131` 덧붙이기 때 정리, `:184` prune(인시던트 먼저). 정리 시점은 허브 시작과 하루 한 번(`apps/wake/desktop/hub.cjs`의 store.prune), 읽기 서비스의 events 주기 수집 때다.
- 차이: 묶음별 크기와 등급을 보여 주는 화면은 없다(`stats()`만 있음). 설정 › 보관 자료 화면 연결은 → [작업](tasks.md#tool-items-retention).
- 고정 장치: `apps/wake/desktop/data-policy.test.cjs` — every_collection_declares_a_class_and_an_undeclared_name_is_refused, cache_rows_past_ttl_are_purged_while_archive_rows_follow_their_incident, incident_counter_is_configuration_and_never_pruned, size_cap_evicts_oldest_cache_rows_first_and_compacts_the_file, size_cap_evicts_oldest_catalogue_documents. `apps/wake/desktop/hub-store.test.cjs`의 기존 기간 시험.
- 출처: 2026-11-18 소유자 결정(도구의 사용자 생성 항목도 조회·활용하고 보관 대상을 구분하며 정책은 앱이 정함), D-USR-2026-11-16-4.

<a id="DP-NEVER"></a>

## DP-NEVER 저장 금지와 가리기

모든 행은 저장 전에 글 값 전부를 `maskText`(`apps/wake/data/mask.js`)로 가린다. 가린 뒤에도 남은 비밀은 `guard`가 거절한다(never_store). 식별 필드(id, cluster, scope, target, incident, contextId)는 가리지 않는다: eksctl context 이름 `admin@prod.us-west-2.eksctl.io`가 이메일처럼 가려지면 행을 찾지 못한다.

| 거절 사유 | 입력 예 | 통과하는 것 |
|---|---|---|
| secret_field | 키가 password·token·authorization·api-key·client-key-data 등이고 값이 남은 글 | 가린 표시(••••)만 남은 값, 빈 값, tokenHash 같은 다른 키, 숫자(input_tokens) |
| secret_object | kind Secret이고 data·stringData에 값이 있음 | 키 이름만 남은 Secret |
| raw_logs | lines가 2,000줄을 넘음 | 발췌·꼬리 500줄 같은 경계 있는 근거 |
| too_large | 한 행 JSON이 그 묶음의 recordBytes를 넘음 | 상한 안의 행 |

- 목표: 입력: 위 표의 거절 입력 → 기대: 디스크에 한 바이트도 쓰지 않고 kind never_store와 사유·경로로 끝난다. 도구 층 감사 행은 인자가 거절되면 행을 버리지 않고 인자를 `{ refused: 'never_store' }`로 바꿔 남긴다 → 실패: 비밀 값이 파일에 남거나 감사 행이 사라지면 실패.
- 목표: 입력: 깨진 문서 파일(JSON 해석 실패) → 기대: 내용을 `<이름>.json.corrupt-<해시>`로 옮겨 두고 원본은 그대로, 그 묶음 쓰기는 store_corrupt로 거절, 읽기는 빈 묶음 → 실패: 빈 묶음으로 덮어써 남은 기록을 잃으면 실패.
- 현재: `apps/wake/desktop/data-policy.cjs:41` guard, `apps/wake/desktop/hub-store.cjs:93` admit, `:24` IDENT, `:103` quarantine, `:117` writable, `apps/wake/desktop/hub-tools.cjs:246` 감사 행 대체. 쓰기는 임시 파일 + fsync + rename + 폴더 fsync다.
- 차이: settings.json·desktop.json(`kit/desktop/main.cjs`)의 깨진 파일 처리는 이 저장소 밖이다 → [작업](tasks.md#tool-items-retention).
- 고정 장치: `apps/wake/desktop/data-policy.test.cjs` never_store_guard_rejects_secret_like_payloads_before_anything_is_written, `apps/wake/desktop/tool-items.test.cjs` an_audit_row_whose_arguments_would_be_refused_is_kept_without_them, `apps/wake/desktop/hub-review.test.cjs` K01_identifier_fields_are_not_masked_but_text_is, K12_a_corrupt_document_file_is_quarantined_and_not_overwritten.
- 출처: 2026-11-18 사용자 요청, 백엔드·보안 검토 K-01·K-12, [RULE-SECRET](rules.md#RULE-SECRET).

<a id="DP-LIFE"></a>

## DP-LIFE 연결 해제·클러스터 삭제·내보내기·지우기

| 사건 | cache·reference | archive | config |
|---|---|---|---|
| 도구 연결 해제(forgetSource(cluster, source)) | 그 클러스터·출처의 행 삭제(tool-catalog, source-checks) | 남음(근거 스냅샷은 내용과 해시를 들고 있어 원본 없이 읽힘) | 남음 |
| 클러스터 삭제(forgetCluster(cluster)) | 그 클러스터의 행 전부 삭제 | 기간 동안 남음. 열린 인시던트는 그 시각(orphanedAt)부터 기간을 셈 | 남음 |
| 내 자료 내보내기(exportAll) | 빼냄(원본에서 다시 만듦) | 전부(이미 가린 값) | 전부 |
| 내 자료 지우기(deleteAll) | 삭제 | 삭제 | 삭제(격리 사본·임시 파일 포함) |

- 목표: 입력: 위 표의 사건 → 기대: 표의 열대로 남고 지워진다 → 실패: 연결 해제가 근거 스냅샷을 지우거나 내보내기에 cache·비밀이 들어가면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:190` forgetSource, `:199` forgetCluster, `:210` exportAll, `:221` deleteAll. 허브(`apps/wake/desktop/hub.cjs`)가 forgetSource·forgetCluster·exportData·deleteData(confirm: true일 때만)를 내놓는다.
- 차이: 서비스 등록(services.cjs)과 도구 연결 해제·클러스터 삭제 흐름의 호출, 설정 화면 단추가 없다 → [작업](tasks.md#tool-items-retention).
- 고정 장치(허브): `apps/wake/desktop/hub-wiring.test.cjs` tool_disconnect_and_cluster_delete_clean_cache_and_references_but_keep_the_archive, export_and_delete_my_data_are_services.
- 고정 장치: `apps/wake/desktop/data-policy.test.cjs` disconnecting_a_tool_or_deleting_a_cluster_drops_cache_and_references_but_keeps_the_archive, export_gives_the_archive_and_settings_masked_and_delete_all_leaves_nothing, incident_archive_keeps_referenced_snapshot_after_catalogue_purge.
- 출처: 2026-11-18 사용자 요청.

<a id="DP-ITEMS"></a>

## DP-ITEMS 도구 사용자 항목

앱이 연결하는 도구(`apps/wake/desktop/tools.cjs` KNOWN과 도구 질의 경로)마다 사용자가 만든 항목과 쓰임이다. 읽기만 하고, 모든 읽기는 도구 층(`apps/wake/desktop/hub-tools.cjs`)의 같은 입력 검사·범위·가림·감사를 지난다. 항목마다 ref(도구·종류·id)와 내용 해시를 붙이고, 목록 저장은 참조·이름·해시만(reference 등급)이다. 내용은 인시던트 근거로 붙일 때만 스냅샷(archive)으로 남는다.

| 도구 | 항목 | 끝점·권한 | 크기·변화 | Wake 쓰임 | 구현 |
|---|---|---|---|---|---|
| Prometheus | 경보·기록 규칙 그룹 | `GET /api/v1/rules`(type, rule_name[], rule_group[], exclude_alerts), 질의 경로 허용 목록 안, 인증 없음(클러스터 안 Service 포트 포워딩) | 수백 규칙·수백 KB. 배포 때 바뀜 | 울린 알림의 식으로 설명, 인시던트 근거(role rule), AI 도구 list_alert_rules | 됨 |
| Prometheus | PrometheusRule CR | Kubernetes `GET /apis/monitoring.coreos.com/v1/prometheusrules`, RBAC list | 규칙 그룹과 같음 | 고칠 원본(CR) 연결 | 안 함: 규칙 file 경로로 대신 |
| Alertmanager | 무음(silences) | `GET /api/v2/silences`, 허용 목록 안 | 수십 개. 장애·배포 때 바뀜 | 인시던트 근거(role silences), 알림이 가려진 이유, list_silences | 됨 |
| Alertmanager | 경로·수신처·억제 규칙 | `GET /api/v2/status`의 config.original. 주소·자격은 버림 | 수 KB. 드물게 바뀜 | 누가 알림을 받았나, get_alert_routing(receiversFor) | 됨 |
| Grafana | 대시보드 | `GET /api/search?type=dash-db`, Viewer 서비스 계정 토큰(키체인) | 수백 개. 자주 바뀜 | 워크로드 관련 대시보드 연결, search_dashboards | 읽기 함수만. 메인 프로세스 질의 경로가 없어 unconfigured → [작업](tasks.md#tool-items-retention) |
| Grafana | 경보 규칙·주석(annotations) | `/api/v1/provisioning/alert-rules`, `/api/annotations` | 중간 | 배포 표식·경보 설명 | 안 함: 질의 경로 없음 |
| Loki | ruler 규칙 | `/loki/api/v1/rules`(YAML) | 작음 | 로그 경보 설명 | 안 함: 질의 경로 허용 목록 밖 |
| Argo CD | Application | Kubernetes `applications`(이미 list_apps·근거 app) | 앱 수만큼 | 소유 관계, 동기화 이력 | 기존 |
| Argo CD | AppProject 동기화 창 | Kubernetes `GET /apis/argoproj.io/v1alpha1/appprojects`, RBAC list | 작음. 드물게 바뀜 | 지금 막힌 앱(조치 전 확인), list_sync_windows | 됨 |
| Argo CD | ApplicationSet | Kubernetes `applicationsets` | 작음 | 앱을 만드는 생성기 연결 | 됨(list_sync_windows 결과) |
| GitHub·GitOps 저장소 | 매니페스트를 바꾼 커밋·PR | GitHub API(키체인 토큰), gitops-deployment.cjs | 많음 | 변경 타임라인 | 안 함: 기존 GitOps 경로가 소유 |
| OpenCost | 사용자 항목 없음(할당 결과만) | `/allocation` | 해당 없음 | 비용 화면 | 해당 없음 |

- 목표: 입력: 가짜 HTTP 서버의 규칙·무음·설정·AppProject·대시보드 응답 → 기대: 규칙은 식·for·라벨·상태·울림 수·ref·해시, 무음은 활성·대기만(기본)과 matcher 판정(정규식 전체 일치, != 반전, 없는 라벨은 빈 값), 경로는 수신처 이름·통합 종류 수·억제 규칙만(주소·비밀 0), 동기화 창은 시간대별 cron으로 지금 열림과 막힌 앱, 대시보드는 제목·폴더·태그·경로 → 실패: 주소·비밀이 결과에 남거나 다른 namespace 무음이 섞이면 실패.
- 목표: 입력: 알림으로 생긴 인시던트의 단계 근거 수집 → 기대: 울린 규칙의 식을 kind object, role rule, target PrometheusRule로 고정하고, 그 알림을 가리는 활성 무음을 role silences로 고정한다. 알림 없는 인시던트는 namespace matcher만 있는 무음만 붙인다. 원본이 닿지 않으면 근거 조각이 아니라 실패 행(종류·이유)이다 → 실패: 읽기 실패를 근거로 저장하거나 규칙 조각을 Pod 재시작 관측으로 세면 실패.
- 현재: `apps/wake/desktop/tool-items.cjs:127` rules, `:142` silences, `:156` routing, `:168` syncWindows, `:196` dashboards, `:71` windowActive, `:97` receiversFor, `:117` remember; `apps/wake/desktop/hub-tools.cjs:192`~`:206` 도구 다섯, `:151` collect_evidence rule·silences; `apps/wake/desktop/incident-hub.cjs:164` citeRule, `:175` citeSilences, `:279` 단계 수집, `:304` objectEv.
- 차이: 도구 GET(`sources.tool`, `sources.toolKinds`)을 클러스터 읽기 층이 아직 내보내지 않아 실제 앱에서는 규칙·무음·경로가 unconfigured다. 인시던트 원인 칸의 관측 문장(규칙 식·무음)과 화면 연결은 없다 → [작업](tasks.md#tool-items-retention).
- 고정 장치: `apps/wake/desktop/tool-items.test.cjs` 전체 열세 시험(가짜 HTTP 서버).
- 출처: 2026-11-18 사용자 요청.

<a id="DP-REVIEW"></a>

## DP-REVIEW 백엔드·보안 검토 반영

| 지적 | 반례 입력 | 고친 동작 | 위치 | 시험 |
|---|---|---|---|---|
| P-01 | 30초마다 클러스터 전체 목록을 한 번에, list_incidents가 모든 클러스터를 다시 감지 | 공유 감시 캐시(sources.cached)가 있으면 그것, 없으면 limit 500·continue 페이지(최대 40), 감지에 쓰는 필드만 남김. list_incidents는 저장된 인시던트만 | `incident-hub.cjs:59`, `hub-tools.cjs:168` | `hub-review.test.cjs` P01_detection_reads_lists_in_pages_and_prefers_the_shared_watch_cache, P01_list_incidents_returns_stored_incidents_without_scanning_clusters |
| S-01 | ConfigMap·Secret의 last-applied 주석에 값 | 도구 층 객체에서 last-applied·managedFields 삭제, Secret은 키 이름만 | `hub-tools.cjs:34` | S01_get_resource_never_returns_last_applied_or_secret_values |
| S-04 | 범위 없는 내장 AI 호출, 읽기 권한 AI의 propose_action | AI·외부는 범위 필수, 내장 AI 범위는 물은 대상(없으면 고른 범위), permission read는 제안 거절 | `hub-tools.cjs:220`, `:250`, `ai-run.cjs:206` | S04_built_in_ai_without_scope_is_refused_and_read_permission_cannot_propose, S04_the_built_in_ai_caller_carries_the_asked_scope_and_permission |
| S-05 | MCP의 화면 상태 도구, namespace 범위의 Node 읽기, app 근거의 namespace 불일치 | 외부는 화면 상태 거절, namespace 범위는 클러스터 범위 종류·클러스터 전체 항목 거절, app 근거는 읽는 namespace(기본 argocd)로 범위 검사 | `hub-tools.cjs:220`, collect_evidence scopeOf | S05_external_clients_… |
| S-14 | 묶음 17개, 10초 50회 초과, 요청마다 디스크 쓰기, 만료·교체 없는 토큰 | 묶음 16개까지, 429, 마지막 호출 1분마다 저장, 토큰 만료(기본 90일, 옛 클라이언트는 만료 없음)·rotateClient | `hub-server.cjs:20`, `:61`, `:78`, `:83`, `:101` | S14_external_server_… |
| S-15 | 인시던트 열기만으로 관측이 모델에 감 | autoInterpret()가 참일 때만(기본 꺼짐) | `ai-run.cjs:281` | S15_incident_interpretation_sends_nothing_unless_turned_on |
| K-09 | 시간대 없는 ISO 시각 | invalid_request | `hub-tools.cjs:27` | K09_a_window_without_a_time_zone_offset_is_refused |
| K-10 | 30일 구간 30초 step(89,280점) | step = max(30초, 구간/10,000), 최댓값은 reduce | `hub-tools.cjs:42`, `incident-hub.cjs:32`·`:34` | K10_metric_evidence_step_keeps_a_long_window_under_the_point_limit |
| K-11 | 구간 시작 전 꼬리만 읽음, 잘림 표시 없음 | sinceTime·limitBytes, truncated | `hub-tools.cjs:113` | K11_read_logs_starts_at_the_window_and_says_when_it_was_cut |

- 목표: 입력: 위 표의 반례 입력 → 기대: 표의 고친 동작 → 실패: 하나라도 수정 전 동작으로 돌아가면 실패.
- 현재: 표의 위치. 각 시험은 고친 줄을 되돌리면 실패함을 확인했다(2026-11-18, 되돌림 20건 모두 실패).
- 차이: 감지의 JSON 해석은 여전히 메인 스레드다(공유 감시 캐시 연결 뒤 다시 측정). 클라이언트 토큰 교체·자동 해석 설정은 화면·허브 연결이 없다 → [작업](tasks.md#tool-items-retention).
- 고정 장치: `apps/wake/desktop/hub-review.test.cjs`.
- 출처: 2026-11-18 백엔드·보안 검토(P-01, S-01, S-04, S-05, S-14, S-15, K-01, K-09~K-12).
