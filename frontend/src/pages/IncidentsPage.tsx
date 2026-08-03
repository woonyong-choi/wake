import { useEffect, useState } from "react";
import { listRcaReports, type RcaReport } from "../api";

export default function IncidentsPage() {
  const [reports, setReports] = useState<RcaReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    listRcaReports(abort.signal)
      .then(setReports)
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "RCA 목록을 불러오지 못했습니다.");
        }
      });
    return () => abort.abort();
  }, []);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DETERMINISTIC RCA</span>
          <h1>Incident evidence</h1>
        </div>
        <p>원문 secret을 노출하지 않는 화이트리스트 RCA projection입니다.</p>
      </div>

      {error ? <Message title="API 연결을 확인하세요." detail={error} /> : null}
      {!error && reports === null ? <Message title="RCA report를 불러오는 중입니다." /> : null}
      {reports?.length === 0 ? (
        <Message
          title="아직 수집된 RCA가 없습니다."
          detail="ImagePullBackOff evidence를 수신하면 이 목록에 결정론적 분석 결과가 나타납니다."
        />
      ) : null}
      {reports && reports.length > 0 ? (
        <div className="report-list">
          {reports.map((report) => (
            <a
              className="report-row"
              href={`/incidents/${encodeURIComponent(report.correlation_id)}`}
              key={`${report.id}-${report.correlation_id}`}
            >
              <div>
                <span className={`status ${report.analysis_status === "blocked" ? "status-blocked" : "status-complete"}`}>
                  {report.analysis_status.toUpperCase()}
                </span>
                <span className="mono">{report.cluster_id ?? "unknown cluster"}</span>
              </div>
              <h2>{report.root_cause}</h2>
              <p>{report.reason ?? report.symptom ?? "근거 요약 없음"}</p>
              <dl>
                <div><dt>Resource</dt><dd>{resourceLabel(report)}</dd></div>
                <div><dt>Confidence</dt><dd>{confidenceLabel(report.confidence)}</dd></div>
                <div><dt>Evidence</dt><dd>{report.supporting_evidence.length} items</dd></div>
                <div><dt>Observed</dt><dd>{dateLabel(report.created_at)}</dd></div>
              </dl>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Message({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="message">
      <h2>{title}</h2>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

function resourceLabel(report: RcaReport): string {
  const identity = [report.namespace, report.resource_name].filter(Boolean).join("/");
  return [report.resource_kind, identity].filter(Boolean).join(" · ") || "unknown";
}

function confidenceLabel(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("ko-KR");
}
