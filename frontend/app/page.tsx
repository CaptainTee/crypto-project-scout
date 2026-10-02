"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Wallet,
  CheckCircle2,
  History,
  RefreshCw,
  Radar,
  CircleX,
  Database,
  Network,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";

import CryptoProjectScout, {
  ScoutResult,
} from "@/lib/contracts/CryptoProjectScout";

import {
  getContractAddress,
  getStudioUrl,
} from "@/lib/genlayer/client";

import { useWallet } from "@/lib/genlayer/wallet";
import { Button } from "@/components/ui/button";
import {
  BatchProject,
  parseProjectInput,
  PROJECT_STATE_LABELS,
  runProjectBatch,
} from "@/lib/scout/batch";

export default function HomePage() {
  const {
    address,
    isConnected,
    chainId,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScoutResult | null>(null);
  const [history, setHistory] = useState<ScoutResult[]>([]);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [status, setStatus] = useState("");
  const [queue, setQueue] = useState<BatchProject[]>([]);
  const runningRef = useRef(false);
  const walletRef = useRef({ address, isConnected, chainId });
  walletRef.current = { address, isConnected, chainId };
  const inputRevision = useRef(0);
  const parsedInput = useMemo(() => parseProjectInput(url), [url]);
  const completedCount = queue.filter((item) => item.state === "complete").length;
  const failedCount = queue.filter((item) => item.state === "failed").length;
  const processedCount = completedCount + failedCount;

  useEffect(() => {
    // A wrapped textarea placeholder can otherwise remain scrolled out of view.
    if (!url && inputRef.current) inputRef.current.scrollTop = 0;
  }, [url]);

  const contract = useMemo(() => {
    const contractAddress = getContractAddress();

    if (!contractAddress) {
      return null;
    }

    return new CryptoProjectScout(
      contractAddress,
      address,
      getStudioUrl()
    );
  }, [address]);

  const loadHistory = async () => {
    if (!contract) return;

    try {
      setIsLoadingHistory(true);

      const count = await contract.getAnalysisCount();
      setAnalysisCount(count);

      const items: ScoutResult[] = [];

      for (let i = count - 1; i >= 0; i--) {
        const item = await contract.getAnalysisAt(i);
        items.push(item);
      }

      setHistory(items);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [contract]);

  const handleAnalyze = async () => {
    // A synchronous lock also protects against repeated clicks before React renders.
    if (runningRef.current) return;
    if (!parsedInput.urls.length || parsedInput.errors.length) {
      setStatus(parsedInput.errors.length ? "Fix the input errors before starting the batch." : "Enter at least one project website URL or @Xhandle.");
      inputRef.current?.focus();
      return;
    }
    if (!contract) {
      setStatus("Contract address is not configured.");
      return;
    }
    if (!isConnected) {
      setStatus("Connect your wallet first.");
      return;
    }

    const urls = [...parsedInput.urls];
    const submittedWallet = { address, chainId };
    const revision = inputRevision.current;
    runningRef.current = true;
    setIsAnalyzing(true);
    setStatus("");
    setResult(null);
    setQueue(parsedInput.projects.map((project) => ({ ...project, state: "waiting" })));
    try {
      const summary = await runProjectBatch(urls, contract, {
        canSubmit: () => walletRef.current.isConnected &&
          walletRef.current.address === submittedWallet.address &&
          walletRef.current.chainId === submittedWallet.chainId,
        onUpdate: (index, update) => setQueue((items) => items.map((item, i) =>
          i === index ? { url: item.url, label: item.label, ...update } : item)),
        onSuccess: async (latest) => {
          setResult(latest);
          await loadHistory();
        },
      });
      if (revision === inputRevision.current) {
        setStatus(summary.failed
          ? `Batch finished: ${summary.completed} complete, ${summary.failed} failed. See project details below.`
          : urls.length === 1 ? "Analysis completed successfully."
          : `All ${summary.completed} projects completed successfully.`);
      }
    } finally {
      runningRef.current = false;
      setIsAnalyzing(false);
    }
  };

  return (
    <main className="scout-shell">
      <div className="scout-container">
        <header className="scout-header">
          <div className="scout-brand">
            <span className="scout-mark" aria-hidden="true"><Radar /></span>
            <div>
              <h1>CaptainScout</h1>
              <p>CRYPTO INTELLIGENCE</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="wallet-button"
            aria-label={isConnected ? `Disconnect wallet ${address}` : "Connect Wallet"}
            onClick={() => isConnected ? disconnectWallet() : connectWallet()}
          >
            <Wallet aria-hidden="true" />
            {isConnected
              ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
              : "Connect Wallet"}
          </Button>
        </header>

        <section className="scout-intro" aria-labelledby="command-heading">
          <p className="eyebrow"><span /> YOUR SCOUTING COMMAND CENTER</p>
          <h2 id="command-heading">Find the signal.<br /><span>Understand the project.</span></h2>
          <p className="intro-description">AI-powered crypto project intelligence, classified through GenLayer consensus.</p>
        </section>

        <section className="brand-card scan-panel" aria-labelledby="scan-heading">
          <div className="radar-decoration" aria-hidden="true"><i /><i /><i /><span /></div>
          <div className="scan-heading">
            <span className="section-icon" aria-hidden="true"><Search /></span>
            <div>
              <p className="eyebrow">PROJECT RECONNAISSANCE</p>
              <h2 id="scan-heading">Analyze projects</h2>
            </div>
          </div>
          <p id="project-help" className="scan-description">Enter a project website or @Xhandle. Add up to 5 projects, one per line.</p>
          <label htmlFor="project-url" className="input-label">Project websites or X handles</label>
          <div className="scan-controls">
            <div className="project-input-wrap">
              <textarea
                ref={inputRef}
                id="project-url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setStatus("");
                  inputRevision.current++;
                }}
                placeholder={"https://ethereum.org/\n@flop_labs\n@base"}
                rows={3}
                aria-describedby="project-help project-validation project-ready batch-authorization"
                aria-invalid={parsedInput.errors.length > 0}
                autoCapitalize="none"
                spellCheck={false}
                className="project-input batch-input"
              />
              {url.length > 0 && (
                <button
                  type="button"
                  className="clear-input"
                  aria-label="Clear project input"
                  onClick={() => {
                    setUrl("");
                    setStatus("");
                    inputRevision.current++;
                    if (!runningRef.current) setQueue([]);
                    inputRef.current?.focus();
                  }}
                >
                  <CircleX size={18} aria-hidden="true" />
                </button>
              )}
            </div>
            <Button className="analyze-button" disabled={isAnalyzing} onClick={handleAnalyze}>
              <Search aria-hidden="true" />
              {isAnalyzing ? "Analyzing..." : parsedInput.urls.length > 1
                ? `Analyze ${parsedInput.urls.length} Projects` : "Analyze Project"}
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </div>
          <div id="project-ready" className="batch-ready" aria-live="polite">
            {parsedInput.validCount} {parsedInput.validCount === 1 ? "project" : "projects"}
            {parsedInput.errors.length ? " valid · resolve errors before analysis" : " ready for analysis"}
            {parsedInput.duplicateCount > 0 && ` · ${parsedInput.duplicateCount} duplicate ${parsedInput.duplicateCount === 1 ? "source" : "sources"} ignored`}
          </div>
          <div id="project-validation" aria-live="polite">
            {parsedInput.errors.length > 0 && <ul className="batch-validation">
              {parsedInput.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>}
          </div>
          <p id="batch-authorization" className="batch-help">Projects run one at a time. Each may require its own wallet approval.</p>
          <div className="scan-footnote"><ShieldCheck size={15} aria-hidden="true" /> Powered by GenLayer consensus <span>•</span> Results stored onchain</div>
          <div role="status" aria-live="polite" aria-atomic="true">
            {status && <p className="analysis-status">{status}</p>}
          </div>
        </section>

        {queue.length > 0 && (
          <section className="brand-card batch-progress" aria-labelledby="batch-heading">
            <div className="batch-heading">
              <div><p className="eyebrow">SCOUTING QUEUE</p><h2 id="batch-heading">Batch progress</h2></div>
              <p role="status" aria-live="polite">{completedCount} of {queue.length} completed{failedCount > 0 && ` · ${failedCount} failed`}</p>
            </div>
            <progress value={processedCount} max={queue.length} aria-label={`${processedCount} of ${queue.length} projects processed`} />
            {isAnalyzing && <p className="batch-help">Keep this page open. Clearing or editing the input does not cancel the running queue.</p>}
            <ol className="batch-list">
              {queue.map((item, index) => (
                <li key={item.url} className="batch-item">
                  <div className="batch-item-heading">
                    <span className="batch-number" aria-hidden="true">{index + 1}</span>
                    <span className="batch-url" title={item.url}>{item.label}</span>
                    <span role="status" aria-label={`${item.label}: ${PROJECT_STATE_LABELS[item.state]}`} className={`batch-state state-${item.state}`}>{PROJECT_STATE_LABELS[item.state]}</span>
                  </div>
                  {item.message && <p className={`batch-message ${item.state === "failed" ? "batch-error" : ""}`}>{item.message}</p>}
                  {item.result && <details className="batch-result">
                    <summary>View analysis: {item.result.project_name}</summary>
                    <ResultCard title={`Batch Analysis #${index + 1}`} result={item.result} />
                  </details>}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="stats-grid" aria-label="Scouting overview">
          <div className="brand-card stat-card">
            <div className="stat-label"><span>Stored Analyses</span><Database aria-hidden="true" /></div>
            <div className="stat-value stat-count">{analysisCount}</div>
            <p>Project intelligence on record</p>
          </div>
          <div className="brand-card stat-card">
            <div className="stat-label"><span>Network</span><Network aria-hidden="true" /></div>
            <div className="stat-value">GenLayer Studio</div>
            <p>AI-powered consensus network</p>
          </div>
          <div className="brand-card stat-card">
            <div className="stat-label"><span>Contract</span><ShieldCheck aria-hidden="true" /></div>
            <div className="stat-value">V3 <span className="detail-chip">Intelligent contract</span></div>
            <p>Onchain project classification</p>
          </div>
        </section>

        {result && <ResultCard title="Latest Analysis" result={result} />}

        <section className="history-section" aria-labelledby="history-heading">
          <div className="history-heading">
            <div>
              <p className="eyebrow">INTELLIGENCE ARCHIVE</p>
              <h2 id="history-heading"><History aria-hidden="true" /> Analysis History</h2>
            </div>
            <Button variant="outline" size="sm" className="refresh-button" onClick={loadHistory} disabled={isLoadingHistory}>
              <RefreshCw className={isLoadingHistory ? "animate-spin" : ""} aria-hidden="true" />
              Refresh
            </Button>
          </div>
          {history.length === 0 ? (
            <div className="brand-card empty-history">
              <span className="empty-icon" aria-hidden="true"><Radar /></span>
              <h3>No stored analyses yet.</h3>
              <p>Start with a project website above. Your intelligence archive begins here.</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item, index) => (
                <ResultCard key={`${item.project_name}-${index}`} title={`Analysis #${analysisCount - index}`} result={item} />
              ))}
            </div>
          )}
        </section>
        <footer className="scout-footer"><span>CaptainScout</span><span>Project intelligence · Powered by GenLayer</span></footer>
      </div>
    </main>
  );
}

function ResultCard({
  title,
  result,
}: {
  title: string;
  result: ScoutResult;
}) {
  return (
    <section className="brand-card result-card space-y-6">
      <div>
        <div className="eyebrow mb-3">
          {title}
        </div>

        <div className="flex items-center gap-2">
          <CheckCircle2 className="result-check shrink-0" aria-hidden="true" />

          <h3 className="text-2xl font-bold break-words min-w-0">
            {result.project_name}
          </h3>
        </div>
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">
          Source URL
        </div>

        {result.url ? (
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="source-link break-all"
          >
            {result.url}
          </a>
        ) : (
          <p className="text-muted-foreground">
            Legacy record — URL was not stored in V2.
          </p>
        )}
      </div>

      <div className="result-fields">
        <Field
          title="Uses Crypto"
          value={
            result.uses_crypto ? "Yes" : "No"
          }
        />

        <Field
          title="Category"
          value={result.category}
        />

        <Field
          title="Chain"
          value={result.chain}
        />

        <Field
          title="Token Status"
          value={result.token_status}
        />

        <Field
          title="Development Stage"
          value={result.development_stage}
        />

        <Field
          title="Confidence"
          value={`${result.confidence}%`}
        />
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">
          Use Case
        </div>

        <p className="result-prose">{result.use_case}</p>
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">
          Crypto Integration
        </div>

        <p className="result-prose">{result.crypto_integration}</p>
      </div>
    </section>
  );
}

function Field({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="result-field">
      <div className="text-sm text-muted-foreground">
        {title}
      </div>

      <div className="font-semibold mt-1 break-words">
        {value}
      </div>
    </div>
  );
}
