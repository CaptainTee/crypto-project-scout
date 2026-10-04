/** Read-only source claims. These are independent of the onchain analysis schema. */
export interface RadarEvidence {
  eventId: string;
  sourceId: string;
  source: "FrontRun Website" | "FrontRun X";
  sourceType: "WEBSITE" | "X";
  sourceUrl: string;
  sourceTitle: string;
  sourcePublishedAt: string | null;
  checkedAt: string;
  lastCheckedAt?: string;
  verification: "FETCH_VERIFIED" | "UNVERIFIED";
  originatingPostUrl: string | null;
  text: string;
  provider?: string;
  evidenceKind?: "DISCOVERY_ONLY";
}
export interface RadarDiscovery {
  reviewState?: "NEW" | "SEEN" | "REVIEWED" | "DISMISSED";
  id: string;
  source: RadarEvidence["source"];
  sourceType: RadarEvidence["sourceType"];
  sourceUrl: string;
  sourcePublishedAt: string | null;
  discoveredAt: string;
  projectName: string;
  projectHandle: string | null;
  projectWebsite: string | null;
  rawCategory: string | null;
  rawDescription: string;
  founderNames: string[];
  founderHandles: string[];
  followerCount: number | null;
  fundingMention: string | null;
  fundingAmount: string | null;
  fundingRound: string | null;
  investors: string[];
  frontRunFlaggedAt: string | null;
  frontRunLeadTimeDays: number | null;
  evidence: RadarEvidence[];
  identityKeys: string[];
  classificationStatus: RadarClassification["status"];
  classification?: RadarClassification;
  classificationEvidence?: ClassificationEvidence[];
  classificationCache?: {status: "MISS" | "FRESH" | "STALE"; expiresAt: string | null};
}
export interface RadarSourceAdapter {
  id: string;
  discover(context: {checkedAt: string; deadline: number}): Promise<{
    events: Omit<RadarDiscovery, "id" | "identityKeys" | "source" | "sourceType" | "sourceUrl" | "sourcePublishedAt" | "discoveredAt">[];
    diagnostics: RadarSourceDiagnostic;
  }>;
}
export interface RadarSourceDiagnostic {
  status: string;
  checkedAt: string | null;
  pagesRequested: number;
  pagesSuccessful: number;
  queriesAttempted: number;
  queriesSuccessful: number;
  resultsReturned: number;
  accepted: number;
  rejected: number;
  itemsFound: number;
  pages?: {path: string; timeout: number; elapsed: number; category: string}[];
  homepageDiscoveries?: number;
  indexDiscoveries?: number;
  articleReceiptDiscoveries?: number;
  statusDiscoveries?: {
    sourceUrl: string;
    sourceTitle: string;
    snippet: string;
    sourcePublishedAt: string | null;
    checkedAt: string;
    verification: "UNVERIFIED";
    evidenceKind: "DISCOVERY_ONLY";
    lastCheckedAt?: string;
  }[];
  projectIdentities?: number;
  duplicateMerges?: number;
  issues: string[];
}
export interface RadarResponse {
  persistenceMode?: "MEMORY" | "POSTGRES";
  totalProjects?: number;
  newCount?: number;
  discoveries: RadarDiscovery[];
  sources: Record<string, RadarSourceDiagnostic>;
  refreshedAt: string | null;
  issues: string[];
  counts: {rawEvents: number; projectIdentities: number; duplicateMerges: number};
}

export interface RadarClassification {
  status: "CRYPTO_RELEVANT" | "POSSIBLY_CRYPTO" | "NON_CRYPTO" | "UNCLASSIFIED";
  confidence: number | null;
  reason: string | null;
  cryptoSignals: string[];
  networks: string[];
  evidenceIds: string[];
  classifiedAt: string | null;
  sourceCoverage: {frontrun: boolean; officialProject: boolean; broaderWeb: boolean};
  needsReview: boolean;
  tokenStatus: "LIVE" | "ANNOUNCED" | "PLANNED" | "UNKNOWN" | "NO_TOKEN_EVIDENCE";
}
export interface ClassificationEvidence {
  id: string;
  sourceType: "FRONTRUN" | "OFFICIAL" | "PROJECT_X" | "WEB";
  sourceUrl: string;
  title: string;
  snippet: string;
  provider: string;
  verification: "VERIFIED" | "INFERRED" | "UNVERIFIED" | "UNAVAILABLE";
  checkedAt: string;
  signalType: string;
  signalStrength: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
  stale: boolean;
}
