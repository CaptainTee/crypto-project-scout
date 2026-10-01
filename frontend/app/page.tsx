"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Wallet,
  CheckCircle2,
  History,
  RefreshCw,
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
import { Input } from "@/components/ui/input";

export default function HomePage() {
  const {
    address,
    isConnected,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScoutResult | null>(null);
  const [history, setHistory] = useState<ScoutResult[]>([]);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [status, setStatus] = useState("");

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
    if (!contract) {
      setStatus("Contract address is not configured.");
      return;
    }

    if (!isConnected) {
      setStatus("Connect your wallet first.");
      return;
    }

    if (
      !url.startsWith("http://") &&
      !url.startsWith("https://")
    ) {
      setStatus("Enter a valid http:// or https:// URL.");
      return;
    }

    try {
      setIsAnalyzing(true);
      setResult(null);
      setStatus(
        "Submitting analysis to GenLayer validators..."
      );

      const countBefore =
        await contract.getAnalysisCount();

      await contract.analyzeProject(url);

      setStatus(
        "Consensus accepted. Verifying stored result..."
      );

      const countAfter =
        await contract.getAnalysisCount();

      if (countAfter <= countBefore) {
        throw new Error(
          "Transaction reached consensus but no new analysis was stored."
        );
      }

      const latest =
        await contract.getLatestForUrl(url);

      if (!latest || latest.url !== url) {
        throw new Error(
          "Transaction completed but the submitted URL was not persisted onchain."
        );
      }

      setResult(latest);

      await loadHistory();

      setStatus(
        "Analysis completed successfully."
      );
    } catch (err: any) {
      console.error(err);

      const message = String(err?.message || "");

      const likelyWebsiteAccessIssue =
        message.includes("no new analysis was stored") ||
        message.includes("not persisted onchain") ||
        message.includes("Website inaccessible") ||
        message.includes("WEBPAGE_LOAD_FAILED");

      setResult(null);

      setStatus(
        likelyWebsiteAccessIssue
          ? "Analysis could not be completed. The website may be blocking GenLayer validators or may be temporarily inaccessible."
          : message || "Analysis failed. Please try again."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="max-w-5xl mx-auto space-y-8">

        <header className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold">
              Crypto Project Scout
            </h1>

            <p className="text-muted-foreground mt-2">
              AI-powered crypto project classification
              using GenLayer consensus.
            </p>
          </div>

          <Button
            variant={
              isConnected ? "outline" : "gradient"
            }
            onClick={() =>
              isConnected
                ? disconnectWallet()
                : connectWallet()
            }
          >
            <Wallet className="w-4 h-4" />

            {isConnected
              ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
              : "Connect Wallet"}
          </Button>
        </header>

        <section className="brand-card p-6 space-y-5">
          <div>
            <h2 className="text-2xl font-bold">
              Analyze a project
            </h2>

            <p className="text-sm text-muted-foreground mt-1">
              Enter an official project website.
              GenLayer validators will analyze
              and classify it.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <Input
              value={url}
              onChange={(e) =>
                setUrl(e.target.value)
              }
              placeholder="https://example.com/"
              className="h-11"
            />

            <Button
              variant="gradient"
              className="h-11"
              disabled={isAnalyzing}
              onClick={handleAnalyze}
            >
              <Search className="w-4 h-4" />

              {isAnalyzing
                ? "Analyzing..."
                : "Analyze Project"}
            </Button>
          </div>

          {status && (
            <div className="text-sm text-muted-foreground">
              {status}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="brand-card p-5">
            <div className="text-sm text-muted-foreground">
              Stored analyses
            </div>

            <div className="text-3xl font-bold mt-2">
              {analysisCount}
            </div>
          </div>

          <div className="brand-card p-5">
            <div className="text-sm text-muted-foreground">
              Network
            </div>

            <div className="text-xl font-bold mt-2">
              GenLayer Studio
            </div>
          </div>

          <div className="brand-card p-5">
            <div className="text-sm text-muted-foreground">
              Contract
            </div>

            <div className="text-xl font-bold mt-2">
              V3
            </div>
          </div>
        </section>

        {result && (
          <ResultCard
            title="Latest Analysis"
            result={result}
          />
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5" />

              <h2 className="text-2xl font-bold">
                Analysis History
              </h2>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              disabled={isLoadingHistory}
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  isLoadingHistory
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh
            </Button>
          </div>

          {history.length === 0 ? (
            <div className="brand-card p-6 text-muted-foreground">
              No stored analyses yet.
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item, index) => (
                <ResultCard
                  key={`${item.project_name}-${index}`}
                  title={`Analysis #${
                    analysisCount - index
                  }`}
                  result={item}
                />
              ))}
            </div>
          )}
        </section>
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
    <section className="brand-card p-6 space-y-6">
      <div>
        <div className="text-sm text-muted-foreground mb-2">
          {title}
        </div>

        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-green-500" />

          <h3 className="text-2xl font-bold">
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
            className="underline break-all"
          >
            {result.url}
          </a>
        ) : (
          <p className="text-muted-foreground">
            Legacy record — URL was not stored in V2.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

        <p>{result.use_case}</p>
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">
          Crypto Integration
        </div>

        <p>{result.crypto_integration}</p>
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
    <div>
      <div className="text-sm text-muted-foreground">
        {title}
      </div>

      <div className="font-semibold mt-1">
        {value}
      </div>
    </div>
  );
}
