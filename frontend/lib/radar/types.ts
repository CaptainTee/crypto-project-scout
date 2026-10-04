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
  classificationStatus: "UNCLASSIFIED";
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
  discoveries: RadarDiscovery[];
  sources: Record<string, RadarSourceDiagnostic>;
  refreshedAt: string | null;
  issues: string[];
  counts: {rawEvents: number; projectIdentities: number; duplicateMerges: number};
}
