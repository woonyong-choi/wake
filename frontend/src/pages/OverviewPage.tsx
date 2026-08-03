import type { AppRoute } from "../router";

const STEPS = [
  {
    number: "01",
    title: "증거 보존",
    detail: "read-only agent가 Pod 상태, Kubernetes Event, image reference를 같은 correlation에 묶습니다.",
    output: "immutable evidence",
  },
  {
    number: "02",
    title: "결정론적 RCA",
    detail: "ImagePullBackOff 규칙이 근거와 누락된 검사를 분리하고, 설명 가능한 원인을 선택합니다.",
    output: "bounded diagnosis",
  },
  {
    number: "03",
    title: "안전한 수정안",
    detail: "허용된 image source 필드만 구조화된 patch로 만들고 blast radius와 rollback을 명시합니다.",
    output: "reviewable patch",
  },
  {
    number: "04",
    title: "GitOps Draft PR",
    detail: "검증한 base SHA에 변경을 고정하고 사람이 검토할 Draft PR까지만 생성합니다.",
    output: "human approval",
  },
  {
    number: "05",
    title: "재검증",
    detail: "외부 reconciler의 배포 뒤 증거를 다시 수집해 증상 해소를 확인합니다.",
    output: "closed loop",
  },
] as const;

export function OverviewPage({ route }: { route: AppRoute }) {
  if (route.kind === "not-found") {
    return (
      <section className="state-panel">
        <span className="eyebrow">404</span>
        <h1>Golden Path 밖의 화면입니다.</h1>
        <p>현재 ImagePullBackOff의 증거 → RCA → Draft PR → 검증 흐름에 집중합니다.</p>
        <a className="button" href="/">Golden Path 보기</a>
      </section>
    );
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">KUBERNETES RECOVERY, WITH RECEIPTS</span>
          <h1>장애를 고치는 것보다<br />고친 근거를 남깁니다.</h1>
          <p>
            Kubernetes 장애 증거를 보존하고 제한된 변경안을 GitOps Draft PR로
            제안한 뒤 배포 결과를 다시 검증합니다.
          </p>
          <div className="hero-actions">
            <a className="button" href="/incidents">실제 RCA 보기</a>
            <a className="text-link" href="#safety">안전 모델 ↓</a>
          </div>
        </div>
        <div className="signal-card" aria-label="Golden Path 상태 예시">
          <div className="signal-head">
            <span>imagepull-demo</span>
            <span className="status status-open">EVIDENCE RECEIVED</span>
          </div>
          <dl>
            <div><dt>Symptom</dt><dd>ImagePullBackOff</dd></div>
            <div><dt>Cause</dt><dd>image tag not found</dd></div>
            <div><dt>Mutation</dt><dd>Deployment image only</dd></div>
            <div><dt>Delivery</dt><dd>Draft PR · base SHA pinned</dd></div>
          </dl>
          <div className="signal-footer">
            <span className="pulse" /> waiting for post-deploy evidence
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="flow-title">
        <div className="section-heading">
          <span className="eyebrow">GOLDEN PATH</span>
          <h2 id="flow-title">하나의 장애를 끝까지 닫는 흐름</h2>
          <p>범용 운영 대시보드 대신, ImagePullBackOff 한 종류의 성공 경로를 완결합니다.</p>
        </div>
        <ol className="flow-grid">
          {STEPS.map((step) => (
            <li key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
              <code>{step.output}</code>
            </li>
          ))}
        </ol>
      </section>

      <section className="safety-section" id="safety">
        <div>
          <span className="eyebrow">SAFETY MODEL</span>
          <h2>클러스터에는 읽기만,<br />소스에는 제안만.</h2>
        </div>
        <div className="safety-grid">
          <article>
            <span>01</span>
            <h3>Read-only collection</h3>
            <p>agent는 허용된 namespace의 관측 증거만 수집합니다. 임의 명령 실행 경로가 없습니다.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Bounded mutation</h3>
            <p>구조화된 allowlist가 Deployment image 변경 범위와 source authority를 검증합니다.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Human + GitOps</h3>
            <p>이 도구는 Draft PR까지만 만듭니다. 병합과 실제 배포는 사람과 외부 reconciler의 권한입니다.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Evidence after deploy</h3>
            <p>PR 생성은 성공이 아닙니다. 새 증거가 ImagePullBackOff 해소를 확인해야 incident를 닫습니다.</p>
          </article>
        </div>
      </section>
    </>
  );
}
