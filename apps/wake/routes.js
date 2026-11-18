/* Wake 화면 주소 표(순수 데이터). 데스크톱 주 프로세스와 app.config.js가 같이 읽는다 */
export const ROUTES = [
  { id: 'cluster', pattern: 'cluster/:cluster', page: 'cluster-home' },
  /* 클러스터 구역(사이드바 클러스터 구역과 경로 막대의 구역 칸): 한 페이지가 주소로 화면을 고른다 */
  { id: 'resources', pattern: 'cluster/:cluster/resources', page: 'resource-list' },
  { id: 'network', pattern: 'cluster/:cluster/network', page: 'network' },
  { id: 'gitops', pattern: 'cluster/:cluster/gitops', page: 'gitops' },
  { id: 'gitops-detail', pattern: 'cluster/:cluster/gitops/:ns/:kind/:name', page: 'gitops-detail' },
  { id: 'logs', pattern: 'cluster/:cluster/logs', page: 'logs' },
  { id: 'alerts', pattern: 'cluster/:cluster/alerts', page: 'alerts' },
  { id: 'alert', pattern: 'cluster/:cluster/alerts/:id', page: 'alert-detail' },
  { id: 'incidents', pattern: 'cluster/:cluster/incidents', page: 'cluster-home' },
  { id: 'metric', pattern: 'cluster/:cluster/metrics/:metric', page: 'cluster-home' },
  { id: 'incident', pattern: 'cluster/:cluster/incidents/:id', page: 'incident-detail' },
  { id: 'evidence', pattern: 'cluster/:cluster/incidents/:id/evidence/:n', page: 'incident-evidence' },
  /* 보고서 칸: 인시던트의 상황 공유·사후 분석, 인시던트가 없는 날의 점검 보고서 */
  { id: 'report', pattern: 'cluster/:cluster/incidents/:id/report', page: 'incident-report' },
  { id: 'check-report', pattern: 'cluster/:cluster/report', page: 'incident-report' },
  { id: 'costs', pattern: 'cluster/:cluster/costs', page: 'costs' },
  /* AI 작업 기록(감사 기록), 설정 › 도구·에이전트: 클러스터 본문 화면과 그 상세 칸 */
  { id: 'ailog', pattern: 'cluster/:cluster/ailog', page: 'ailog' },
  { id: 'ailog-detail', pattern: 'cluster/:cluster/ailog/:id', page: 'ailog-detail' },
  { id: 'tools', pattern: 'cluster/:cluster/tools', page: 'tools' },
  { id: 'tool', pattern: 'cluster/:cluster/tools/:tool', page: 'tool-detail' },
  { id: 'agent', pattern: 'cluster/:cluster/agent', page: 'agent' },
  { id: 'agent-detail', pattern: 'cluster/:cluster/agent/:name', page: 'agent-detail' },
  { id: 'tool-api', pattern: 'cluster/:cluster/api/:tool', page: 'tool-api' },
  { id: 'list', pattern: 'cluster/:cluster/ns/:ns/:kind', page: 'resource-list' },
  { id: 'detail', pattern: 'cluster/:cluster/ns/:ns/:kind/:name', page: 'resource-detail' },
  { id: 'settings', pattern: 'settings/:page', page: 'settings', kind: 'settings' },
  { id: 'chat', pattern: 'chat/:id', page: 'chat', kind: 'chat' },
];
