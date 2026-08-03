export interface RcaReport {
  id: number;
  correlation_id: string;
  analysis_status: "completed" | "blocked";
  root_cause: string;
  action: string;
  incident_id: string | null;
  cluster_id: string | null;
  symptom: string | null;
  severity: string | null;
  confidence: number | null;
  reason: string | null;
  evidence_ref: string | null;
  supporting_evidence: string[];
  missing_evidence: string[];
  resource_kind: string | null;
  resource_name: string | null;
  namespace: string | null;
  created_at: string | null;
}

export interface RecoveryCandidate {
  action_id: string;
  title: string;
  description: string;
  route: string;
  risk_level: string;
  blast_radius: string;
  approval_required: boolean;
  rollback_plan: string;
  prerequisites: string[];
  validation_checks: string[];
  evidence_refs: string[];
}

export interface RemediationBundle {
  meta: {
    correlation_id: string;
    incident_id: string | null;
    cluster_id: string;
    created_at: string | null;
  };
  diagnosis: {
    root_cause: string;
    confidence: number | null;
    supporting_evidence: string[];
    missing_evidence: string[];
    selected_candidate_id: string | null;
  };
  remediation: {
    status: string;
    selected_action_id: string | null;
    selected_by: string | null;
    candidates: RecoveryCandidate[];
    evidence_ref: string;
  } | null;
}

export async function listRcaReports(signal?: AbortSignal): Promise<RcaReport[]> {
  const value = await getJson("/api/rca-reports?limit=50", signal);
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("RCA report response is invalid.");
  }
  return value.items.filter(isRcaReport);
}

export async function getRemediationBundle(
  correlationId: string,
  signal?: AbortSignal,
): Promise<RemediationBundle> {
  const value = await getJson(
    `/api/rca/bundles/${encodeURIComponent(correlationId)}`,
    signal,
  );
  if (!isRemediationBundle(value)) {
    throw new Error("Remediation bundle response is invalid.");
  }
  return value;
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    const hint = response.status === 401 ? "로그인이 필요합니다." : `HTTP ${response.status}`;
    throw new Error(hint);
  }
  return response.json() as Promise<unknown>;
}

function isRcaReport(value: unknown): value is RcaReport {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "number"
    && typeof value.correlation_id === "string"
    && (value.analysis_status === "completed" || value.analysis_status === "blocked")
    && typeof value.root_cause === "string"
    && typeof value.action === "string"
    && Array.isArray(value.supporting_evidence)
    && Array.isArray(value.missing_evidence)
  );
}

function isRemediationBundle(value: unknown): value is RemediationBundle {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.diagnosis)) {
    return false;
  }
  return (
    typeof value.meta.correlation_id === "string"
    && typeof value.meta.cluster_id === "string"
    && typeof value.diagnosis.root_cause === "string"
    && Array.isArray(value.diagnosis.supporting_evidence)
    && Array.isArray(value.diagnosis.missing_evidence)
    && (value.remediation === null || isRemediation(value.remediation))
  );
}

function isRemediation(value: unknown): boolean {
  return (
    isRecord(value)
    && typeof value.status === "string"
    && Array.isArray(value.candidates)
    && value.candidates.every((candidate) => (
      isRecord(candidate)
      && typeof candidate.action_id === "string"
      && typeof candidate.title === "string"
      && typeof candidate.route === "string"
    ))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
