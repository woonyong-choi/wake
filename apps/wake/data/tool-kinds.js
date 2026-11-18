/* 클러스터 안 도구의 종류 정의(이름, 아이콘, 역할). 자료가 아니라 화면이 도구를 부르는 이름표다 */
export const TOOL_KINDS = [
  { id: 'prometheus', name: 'Prometheus', icon: 'brand-prometheus', role: 'metrics' },
  { id: 'loki', name: 'Loki', icon: 'brand-loki', role: 'logs' },
  { id: 'tempo', name: 'Tempo', icon: 'brand-tempo', role: 'traces' },
  { id: 'grafana', name: 'Grafana', icon: 'brand-grafana', role: 'dashboards' },
  { id: 'argocd', name: 'Argo CD', icon: 'brand-argo', role: 'gitops' },
  { id: 'flux', name: 'Flux', icon: 'brand-flux', role: 'gitops' },
  { id: 'alertmanager', name: 'Alertmanager', icon: 'brand-prometheus', role: 'alerts' },
];
/** 종류 id -> 정의(모르는 종류는 이름 그대로, 기본 아이콘) */
export const toolKind = (id, icon = 'puzzle') => TOOL_KINDS.find(k => k.id === id) || { id, name: id, icon };
