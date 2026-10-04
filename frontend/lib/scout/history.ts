import type { ScoutResult } from "../contracts/CryptoProjectScout";

export const FILTER_FIELDS = ["category", "chain", "token_status", "development_stage"] as const;
export type HistoryFilters = {
  search: string;
  category: string;
  chain: string;
  token_status: string;
  development_stage: string;
  crypto: string;
  minConfidence: number;
  sort: string;
};
export const EMPTY_FILTERS: HistoryFilters = {
  search: "", category: "", chain: "", token_status: "", development_stage: "",
  crypto: "", minConfidence: 0, sort: "recent",
};
export function filterHistory(items: readonly ScoutResult[], filters: HistoryFilters) {
  const query = filters.search.trim().toLowerCase();
  const matches = items.filter(item =>
    (!query || `${item.project_name} ${item.url ?? ""}`.toLowerCase().includes(query)) &&
    FILTER_FIELDS.every(field => !filters[field] || item[field] === filters[field]) &&
    (!filters.crypto || String(item.uses_crypto) === filters.crypto) &&
    item.confidence >= filters.minConfidence);
  return filters.sort === "recent" ? matches : matches.sort((a, b) =>
    filters.sort === "confidence-low" ? a.confidence - b.confidence : b.confidence - a.confidence);
}
export function filterOptions(items: readonly ScoutResult[], field: typeof FILTER_FIELDS[number]) {
  return [...new Set(items.map(item => item[field]).filter(Boolean))].sort();
}
export const COMPARISON_FIELDS = [
  ["project_name", "Project"], ["uses_crypto", "Uses Crypto"], ["category", "Category"],
  ["chain", "Chain"], ["token_status", "Token Status"], ["development_stage", "Development Stage"],
  ["confidence", "Confidence"], ["use_case", "Use Case"],
] as const;
export function comparisonValue(result: ScoutResult, field: typeof COMPARISON_FIELDS[number][0]) {
  if (field === "uses_crypto") return result.uses_crypto ? "Yes" : "No";
  if (field === "confidence") return `${result.confidence}%`;
  return result[field] || "Not provided";
}
export function toggleComparison(selected: readonly number[], index: number) {
  return selected.includes(index) ? selected.filter(id => id !== index)
    : selected.length < 5 ? [...selected, index] : [...selected];
}
