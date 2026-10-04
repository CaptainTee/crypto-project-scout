"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ScoutResult } from "@/lib/contracts/CryptoProjectScout";
import { enrichmentProvider, loadEnrichment, TRUST_LABELS, type Claim, type EnrichmentState, type ProjectEnrichment } from "@/lib/scout/enrichment";

export function EnrichedIntelligence({ analysis }: { analysis: ScoutResult }) {
  const [loaded, setLoaded] = useState<{analysis: ScoutResult; state: EnrichmentState} | null>(null);
  useEffect(() => {
    let active = true;
    loadEnrichment(enrichmentProvider, analysis).then(state => { if (active) setLoaded({analysis, state}); });
    return () => { active = false; };
  }, [analysis]);
  const state = loaded?.analysis === analysis ? loaded.state : {status: "Not yet enriched", data: null};
  return <div className="enriched-intelligence">
    <div className="intelligence-status"><span>Onchain analysis: <strong>Complete</strong></span><span>Enriched intelligence: <strong>{state.status}</strong></span></div>
    <p className="intelligence-note">Additional research is separate from the GenLayer onchain analysis.</p>
    {state.data ? <EnrichmentSections data={state.data} /> : <p className="intelligence-note">{state.status === "Unable to verify" ? "Additional intelligence could not be verified." : "Additional intelligence has not been enriched yet."}</p>}
  </div>;
}

export function EnrichmentSections({ data }: { data: ProjectEnrichment }) {
  function ClaimView<T>({claim, children}: {claim: Claim<T>; children: (value: T) => ReactNode}) {
    return <div className="enrichment-claim"><span className={`trust-label trust-${claim.verification.toLowerCase()}`}>{TRUST_LABELS[claim.verification]}</span>
      {claim.value !== null && children(claim.value)}
      {claim.evidenceIds.length > 0 && <div className="claim-sources">Sources: {claim.evidenceIds.map(id => {
        const source = data.evidence.find(e => e.id === id)!;
        return <a key={id} href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ({new URL(source.url).hostname})</a>;
      })}</div>}
    </div>;
  }
  const section = (title: string, content: ReactNode) => <details className="intelligence-section"><summary>{title}</summary>{content}</details>;
  const empty = <p className="intelligence-note">No reliable information found</p>;
  return <>
    <p className="intelligence-note">Research last updated: {data.lastUpdated}</p>
    {section("Features & Services", data.featuresAndServices.length ? data.featuresAndServices.map((claim, i) => <ClaimView key={i} claim={claim}>{v => <><h4>{v.title} · {v.availability}</h4><p>{v.description}</p><div>Target users: <ClaimView claim={v.targetUsers}>{users => <p>{users}</p>}</ClaimView></div></>}</ClaimView>) : empty)}
    {section("Competitive Landscape", <>{data.similarProjects.length ? data.similarProjects.map((claim, i) => <ClaimView key={i} claim={claim}>{v => <><h4><a href={v.url} target="_blank" rel="noopener noreferrer">{v.name}</a></h4><p>Similarity: {v.similarity}</p><p>Differentiators: {v.differentiators}</p></>}</ClaimView>) : empty}<h4>Originality Signal</h4><ClaimView claim={data.originalitySignal}>{v => <p>{v}</p>}</ClaimView><p className="intelligence-note">This signal does not establish global uniqueness.</p></>)}
    {section("Opportunities", data.opportunities.length ? data.opportunities.map((claim, i) => <ClaimView key={i} claim={claim}>{v => <><h4>{v.title}</h4><p>{v.type} · {v.status}</p><p>{v.description}</p><p><a href={v.participationUrl} target="_blank" rel="noopener noreferrer">Participation details</a> · <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Opportunity source</a></p><p>Last checked: {v.lastChecked}{v.deadline && ` · Deadline: ${v.deadline}`}</p></>}</ClaimView>) : empty)}
    {section("Funding & Investors", <><h4>Total known funding</h4><ClaimView claim={data.funding.totalKnown}>{v => <p>{v}</p>}</ClaimView>{data.funding.rounds.map((claim, i) => <ClaimView key={i} claim={claim}>{v => <><h4>{v.round}</h4><p>Amount</p><ClaimView claim={v.amount}>{amount => <p>{amount}</p>}</ClaimView><p>Date</p><ClaimView claim={v.date}>{date => <p>{date}</p>}</ClaimView><p>Investors</p><ClaimView claim={v.investors}>{names => <p>{names.join(", ")}</p>}</ClaimView></>}</ClaimView>)}</>)}
    {section("Evidence & Sources", data.evidence.length ? data.evidence.map(source => <div className="enrichment-claim" key={source.id}><span className="trust-label">{TRUST_LABELS[source.verification]}</span><p><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} · {new URL(source.url).hostname}</a></p><p>Checked: {source.checkedAt}</p></div>) : empty)}
  </>;
}
