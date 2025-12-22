export type ProofSystem = "TEE" | "SP1" | "RISC0";

export type BatchStatus = "proposed" | "proven" | "verified";

export interface BatchSummary {
  batchId: string;
  proposer: string;
  status: BatchStatus;
  proofSystems: ProofSystem[];
  proposedAt: string;
  provenAt?: string | null;
  verifiedAt?: string | null;
  isContested?: boolean;
}

export interface BatchDetail extends BatchSummary {
  proposedBlock: string;
  provenBlock?: string | null;
  verifiedBlock?: string | null;
  proofTxHash?: string | null;
  verifierAddress?: string | null;
  transitionParentHash?: string | null;
  transitionBlockHash?: string | null;
  transitionStateRoot?: string | null;
  proofLinks?: {
    tx?: string;
    verifier?: string;
  };
}

export interface RangeResponse {
  start: string;
  end: string;
}

export interface ZkSharePoint {
  date: string;
  provenTotal: number;
  zkProvenTotal: number;
  zkPercent: number;
}

export interface ZkShareResponse {
  range: RangeResponse;
  points: ZkSharePoint[];
}

export interface ProofSystemPoint {
  date: string;
  tee: number;
  sp1: number;
  risc0: number;
}

export interface ProofSystemResponse {
  range: RangeResponse;
  points: ProofSystemPoint[];
}

export interface LatencyStats {
  avgSeconds: number;
  medianSeconds: number;
  p99Seconds: number;
}

export interface LatencySeriesPoint {
  date: string;
  avgSeconds: number;
  medianSeconds?: number;
}

export interface LatencyResponse {
  range: RangeResponse;
  stats: LatencyStats;
  series: LatencySeriesPoint[];
}

export interface BatchesResponse {
  range: RangeResponse;
  page: number;
  pageSize: number;
  total: number;
  items: BatchSummary[];
}

export interface BatchDetailResponse {
  batch: BatchDetail;
}
