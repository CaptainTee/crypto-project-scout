import type { ScoutResult } from "../contracts/CryptoProjectScout";

export const MAX_PROJECTS = 5;
export const WEBSITE_ACCESS_MESSAGE =
  "Analysis could not be completed. The website may be blocking GenLayer validators or may be temporarily inaccessible.";

export type ProjectState = "waiting" | "submitting" | "analyzing" | "complete" | "failed";
export type ProjectSource = { url: string; label: string };
export type BatchProject = ProjectSource & {
  state: ProjectState;
  message?: string;
  result?: ScoutResult;
};

export const PROJECT_STATE_LABELS: Record<ProjectState, string> = {
  waiting: "Waiting",
  submitting: "Awaiting wallet / submitting",
  analyzing: "Analyzing",
  complete: "Complete",
  failed: "Failed",
};

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const X_HOSTS = new Set(["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
const X_ROUTES = new Set(["home", "explore", "search", "i", "intent", "compose", "messages", "notifications", "settings", "login", "logout", "signup", "tos", "privacy", "about", "share", "download", "hashtag"]);
const X_SHARING_PARAMS = new Set(["s", "t", "ref_src", "ref_url", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]);

export function normalizeProjectSource(input: string): ProjectSource {
  // Preserve Phase 2's surrounding-whitespace trimming; whitespace inside a
  // handle is invalid. Only an explicit @ prefix opts into handle parsing.
  const label = input.trim();
  if (label.startsWith("@")) {
    const handle = label.slice(1);
    if (!X_HANDLE.test(handle)) {
      throw new Error("Invalid X handle. Use @ followed by 1–15 letters, numbers, or underscores; no spaces or punctuation.");
    }
    return { url: `https://x.com/${handle.toLowerCase()}`, label };
  }

  let parsed: URL;
  try {
    if (!/^https?:\/\/[^/?#\s]+/.test(label) || /\s/.test(label)) throw new Error();
    parsed = new URL(label);
    if (!parsed.hostname) throw new Error();
  } catch {
    throw new Error("Enter a valid website URL beginning with http:// or https://, or an X handle beginning with @.");
  }

  // Canonicalize only recognizable profile URLs. Posts, navigation routes,
  // unknown query parameters, custom ports, and credentials retain their URL.
  const profile = /^\/([A-Za-z0-9_]{1,15})\/?$/.exec(parsed.pathname);
  if (X_HOSTS.has(parsed.hostname) && profile && !X_ROUTES.has(profile[1].toLowerCase()) &&
      !parsed.port && !parsed.username && !parsed.password &&
      [...parsed.searchParams.keys()].every((key) => X_SHARING_PARAMS.has(key))) {
    return { url: `https://x.com/${profile[1].toLowerCase()}`, label };
  }
  return { url: label, label };
}

export function parseProjectInput(input: string) {
  const seen = new Map<string, number>();
  const projects: ProjectSource[] = [];
  const errors: string[] = [];
  let duplicateCount = 0;
  let validCount = 0;

  input.split(/\r?\n/).forEach((line, index) => {
    const label = line.trim();
    if (!label) return;
    let source: ProjectSource;
    let valid = true;
    try {
      source = normalizeProjectSource(label);
    } catch (error) {
      valid = false;
      source = { url: label, label };
      errors.push(`Line ${index + 1}: ${(error as Error).message}`);
    }
    const existing = seen.get(source.url);
    if (existing !== undefined) {
      duplicateCount++;
      // Prefer a friendly shorthand label even if the full URL came first.
      if (valid && label.startsWith("@")) projects[existing].label = label;
      return;
    }
    seen.set(source.url, projects.length);
    projects.push(source);
    if (valid) validCount++;
  });

  if (projects.length > MAX_PROJECTS) {
    errors.push(`A batch can contain up to ${MAX_PROJECTS} unique projects. You entered ${projects.length}; remove ${projects.length - MAX_PROJECTS} to continue.`);
  }
  return { projects, urls: projects.map((project) => project.url), errors, validCount, duplicateCount };
}

export function analysisErrorMessage(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message || "") : typeof error === "string" ? error : "";
  const inaccessible = ["no new analysis was stored", "not persisted onchain", "Website inaccessible", "WEBPAGE_LOAD_FAILED"]
    .some((text) => message.includes(text));
  return inaccessible ? WEBSITE_ACCESS_MESSAGE : message || "Analysis failed. Please try again.";
}

// The client retains its existing transaction and receipt checks. The optional
// notification only lets the UI distinguish wallet submission from consensus.
export interface BatchContract {
  getAnalysisCount(): Promise<number>;
  analyzeProject(url: string, onSubmitted?: () => void): Promise<unknown>;
  getLatestForUrl(url: string): Promise<ScoutResult | null>;
}

export async function runProjectBatch(
  urls: readonly string[],
  contract: BatchContract,
  callbacks: {
    onUpdate: (index: number, update: Omit<BatchProject, "url" | "label">) => void;
    onSuccess: (result: ScoutResult) => Promise<void>;
    canSubmit: () => boolean;
  },
) {
  // Validate the complete snapshot defensively before any contract call.
  const parsed = parseProjectInput(urls.join("\n"));
  if (!parsed.urls.length || parsed.errors.length || parsed.urls.length !== urls.length ||
      parsed.urls.some((url, index) => url !== urls[index])) {
    throw new Error("Submit between 1 and 5 unique, valid project URLs.");
  }
  let completed = 0;
  let failed = 0;
  const checkWallet = () => {
    if (!callbacks.canSubmit()) {
      throw new Error("Wallet connection or network changed. Reconnect the original wallet and submit this project again.");
    }
  };

  for (const [index, url] of urls.entries()) {
    try {
      checkWallet();
      callbacks.onUpdate(index, { state: "submitting" });
      const countBefore = await contract.getAnalysisCount();
      checkWallet();
      await contract.analyzeProject(url, () => {
        callbacks.onUpdate(index, { state: "analyzing", message: "Submitted. Waiting for GenLayer consensus..." });
      });
      callbacks.onUpdate(index, { state: "analyzing", message: "Consensus accepted. Verifying stored result..." });
      const countAfter = await contract.getAnalysisCount();
      if (countAfter <= countBefore) {
        throw new Error("Transaction reached consensus but no new analysis was stored.");
      }
      const latest = await contract.getLatestForUrl(url);
      if (!latest || latest.url !== url) {
        throw new Error("Transaction completed but the submitted URL was not persisted onchain.");
      }
      await callbacks.onSuccess(latest);
      completed++;
      callbacks.onUpdate(index, { state: "complete", result: latest });
    } catch (error) {
      failed++;
      callbacks.onUpdate(index, { state: "failed", message: analysisErrorMessage(error) });
    }
  }
  return { completed, failed };
}
