/*
 * 화면·허브로 내보내는 Kubernetes 객체의 정리(spec/rules.md#RULE-SECRET). Wake는 Secret API를 부르지 않지만, 어떤 길로든 Secret 모양이 들어오면
 * 값(data·stringData)과 값을 담을 수 있는 주석(kubectl last-applied 등 허용 목록 밖 전부)을 버리고 키 이름만 남긴다.
 *   sanitize(object, keepManaged) -> 정리한 사본   secretPath(path) -> Secret API 경로인지(요청 전에 거절)
 */
/* Secret에 남겨도 값이 아닌 주석: 소유 관계·발급자 이름만 */
const SECRET_ANNOTATIONS = new Set(['kubernetes.io/service-account.name', 'kubernetes.io/service-account.uid', 'meta.helm.sh/release-name', 'meta.helm.sh/release-namespace',
  'cert-manager.io/certificate-name', 'cert-manager.io/issuer-name', 'cert-manager.io/issuer-kind', 'cert-manager.io/issuer-group']);

function sanitize(o, keepManaged = false) {
  if (!o || typeof o !== 'object') return o;
  const c = { ...o, metadata: { ...(o.metadata || {}) } };
  if (!keepManaged) delete c.metadata.managedFields;
  if (c.kind === 'Secret') {
    /* 값은 메인 프로세스 밖으로 나가지 않는다: 키 이름만(값은 빈 글자) */
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) c.data = Object.fromEntries(Object.keys(o.data).map(k => [k, ''])); else delete c.data;
    delete c.stringData;
    delete c.metadata.managedFields;
    const annotations = c.metadata.annotations;
    if (annotations && typeof annotations === 'object') {
      const kept = Object.fromEntries(Object.entries(annotations).filter(([k]) => SECRET_ANNOTATIONS.has(k)));
      if (Object.keys(kept).length) c.metadata.annotations = kept; else delete c.metadata.annotations;
    } else delete c.metadata.annotations;
  }
  return c;
}
/** Secret API 경로(목록·하나·watch, 모든 API 그룹의 secrets 리소스) */
const secretPath = path => /(^|\/)secrets(\/|\?|$)/.test(String(path).split('?')[0] + (String(path).includes('?') ? '?' : ''));

module.exports = { sanitize, secretPath, SECRET_ANNOTATIONS };
