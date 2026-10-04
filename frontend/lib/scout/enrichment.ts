import type { ScoutResult } from "../contracts/CryptoProjectScout";

export const TRUST_LABELS = {
  VERIFIED: "Verified", INFERRED: "Inferred", UNVERIFIED: "Unverified",
  UNAVAILABLE: "No reliable information found",
} as const;
export type VerificationStatus = keyof typeof TRUST_LABELS;
export interface EvidenceSource {
  id: string;
  url: string;
  name: string;
  checkedAt: string;
  verification: Exclude<VerificationStatus, "UNAVAILABLE">;
}
export interface Claim<T> {
  verification: VerificationStatus;
  value: T | null;
  evidenceIds: string[];
}
export interface FeatureService {
  title: string;
  description: string;
  availability: "Offered" | "Announced";
  targetUsers: Claim<string>;
}
export interface SimilarProject {
  name: string;
  url: string;
  similarity: string;
  differentiators: string;
}
export type OriginalitySignal = "Common model" | "Differentiated implementation" | "Highly differentiated" | "Potentially novel";
export interface Opportunity {
  title: string;
  type: "Active campaign" | "Testnet" | "Points program" | "Node opportunity" | "Waitlist" | "Ambassador/community program" | "Incentivized activity" | "Other";
  status: "Active" | "Announced" | "Ended" | "Unknown";
  description: string;
  participationUrl: string;
  sourceUrl: string;
  lastChecked: string;
  deadline?: string;
}
export interface FundingRound {
  round: string;
  amount: Claim<string>;
  date: Claim<string>;
  investors: Claim<string[]>;
}
export interface Funding {
  totalKnown: Claim<string>;
  rounds: Claim<FundingRound>[];
}
/** Sidecar data: never merged into or persisted as a V3 ScoutResult. */
export interface ProjectEnrichment {
  schemaVersion: 1;
  sourceUrl: string;
  featuresAndServices: Claim<FeatureService>[];
  similarProjects: Claim<SimilarProject>[];
  originalitySignal: Claim<OriginalitySignal>;
  opportunities: Claim<Opportunity>[];
  funding: Funding;
  evidence: EvidenceSource[];
  lastUpdated: string;
}
export interface EnrichmentProvider {
  enrichProject(sourceUrl: string, currentAnalysis: Readonly<ScoutResult>): Promise<unknown>;
}
// No live research provider is configured in Phase 5A.
export const enrichmentProvider: EnrichmentProvider = {
  async enrichProject() { return null; },
};
export function safeSourceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const timestamp = (value: unknown): value is string => text(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const oneOf = (value: unknown, options: readonly string[]) => typeof value === "string" && options.includes(value);

/** Reject malformed provider payloads at the boundary, including unsupported verified claims. */
export function parseEnrichment(input: unknown, sourceUrl: string): ProjectEnrichment | null {
  if (!object(input) || input.schemaVersion !== 1 || input.sourceUrl !== sourceUrl || !safeSourceUrl(input.sourceUrl) || !timestamp(input.lastUpdated) || !Array.isArray(input.evidence)) return null;
  const evidence = input.evidence;
  if (!evidence.every(e => object(e) && text(e.id) && safeSourceUrl(e.url) && text(e.name) && timestamp(e.checkedAt) && oneOf(e.verification, ["VERIFIED", "INFERRED", "UNVERIFIED"])) || new Set(evidence.map(e => e.id)).size !== evidence.length) return null;
  const claim = (c: unknown, validate: (v: unknown) => boolean): boolean => {
    if (!object(c) || !oneOf(c.verification, Object.keys(TRUST_LABELS)) || !Array.isArray(c.evidenceIds) || !c.evidenceIds.every(id => text(id) && evidence.some(e => e.id === id))) return false;
    if (c.verification === "UNAVAILABLE") return c.value === null && c.evidenceIds.length === 0;
    return validate(c.value) && c.evidenceIds.length > 0 && (c.verification !== "VERIFIED" || c.evidenceIds.some(id => evidence.some(e => e.id === id && e.verification === "VERIFIED")));
  };
  const claims = (items: unknown, validate: (v: unknown) => boolean) => Array.isArray(items) && items.every(c => claim(c, validate));
  const feature = (v: unknown) => object(v) && text(v.title) && text(v.description) && oneOf(v.availability, ["Offered", "Announced"]) && claim(v.targetUsers, text);
  const similar = (v: unknown) => object(v) && text(v.name) && safeSourceUrl(v.url) && text(v.similarity) && text(v.differentiators);
  const opportunity = (v: unknown) => object(v) && text(v.title) && oneOf(v.type, ["Active campaign", "Testnet", "Points program", "Node opportunity", "Waitlist", "Ambassador/community program", "Incentivized activity", "Other"]) && oneOf(v.status, ["Active", "Announced", "Ended", "Unknown"]) && text(v.description) && safeSourceUrl(v.participationUrl) && safeSourceUrl(v.sourceUrl) && timestamp(v.lastChecked) && (v.deadline === undefined || timestamp(v.deadline));
  const round = (v: unknown) => object(v) && text(v.round) && claim(v.amount, text) && claim(v.date, text) && claim(v.investors, names => Array.isArray(names) && names.length > 0 && names.every(text));
  if (!claims(input.featuresAndServices, feature) || !claims(input.similarProjects, similar) || !claim(input.originalitySignal, v => oneOf(v, ["Common model", "Differentiated implementation", "Highly differentiated", "Potentially novel"])) || !claims(input.opportunities, opportunity) || !object(input.funding) || !claim(input.funding.totalKnown, text) || !claims(input.funding.rounds, round)) return null;
  return structuredClone(input) as unknown as ProjectEnrichment;
}
export type EnrichmentState = { status: "Available" | "Partial" | "Not yet enriched" | "Unable to verify"; data: ProjectEnrichment | null };
export function enrichmentState(data: ProjectEnrichment | null): EnrichmentState {
  if (!data) return {status: "Not yet enriched", data: null};
  const groups = [data.featuresAndServices, data.similarProjects, [data.originalitySignal], data.opportunities, [data.funding.totalKnown, ...data.funding.rounds]];
  const all: Claim<unknown>[] = groups.flat();
  const usable = all.some(c => c.verification === "VERIFIED" || c.verification === "INFERRED");
  const complete = groups.every(g => g.length && g.every(c => c.verification === "VERIFIED" || c.verification === "INFERRED")) && data.featuresAndServices.every(c => c.value?.targetUsers.verification !== "UNAVAILABLE" && c.value?.targetUsers.verification !== "UNVERIFIED") && data.funding.rounds.every(c => c.value && [c.value.amount, c.value.date, c.value.investors].every(v => v.verification === "VERIFIED" || v.verification === "INFERRED"));
  return {status: !usable ? "Unable to verify" : complete ? "Available" : "Partial", data};
}
export async function loadEnrichment(provider: EnrichmentProvider, analysis: Readonly<ScoutResult>): Promise<EnrichmentState> {
  if (!analysis.url) return enrichmentState(null);
  try {
    const payload = await provider.enrichProject(analysis.url, structuredClone(analysis));
    if (payload == null) return enrichmentState(null);
    const data = parseEnrichment(payload, analysis.url);
    return data ? enrichmentState(data) : {status: "Unable to verify", data: null};
  } catch { return {status: "Unable to verify", data: null}; }
}
