import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  estimateWriteFeePreset,
  feePresetToTransactionFees,
} from "../genlayer/fees";

export interface ScoutResult {
  url?: string;
  project_name: string;
  uses_crypto: boolean;
  category: string;
  chain: string;
  token_status: string;
  development_stage: string;
  use_case: string;
  crypto_integration: string;
  confidence: number;
}

export default class CryptoProjectScout {
  private contractAddress: `0x${string}`;
  private client: any;
  private studioUrl?: string;

  constructor(
    contractAddress: string,
    address?: string | null,
    studioUrl?: string
  ) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.studioUrl = studioUrl;

    const config: any = {
      chain: studionet,
    };

    if (address) {
      config.account = address as `0x${string}`;
    }

    if (studioUrl) {
      config.endpoint = studioUrl;
    }

    this.client = createClient(config);
  }

  async analyzeProject(url: string) {
    const feePreset = await estimateWriteFeePreset(
      this.client,
      {
        address: this.contractAddress,
        functionName: "analyze_project",
        args: [url],
        value: 0n,
      },
      "standard"
    );

    const fees = feePresetToTransactionFees(feePreset);

    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "analyze_project",
      args: [url],
      value: 0n,
      ...(fees ? { fees } : {}),
    });

    return this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED" as any,
      retries: 40,
      interval: 5000,
    });
  }

  async getAnalysisCount(): Promise<number> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_analysis_count",
      args: [],
    });

    return Number(result);
  }

  async getAnalysisAt(index: number): Promise<ScoutResult> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_analysis_at",
      args: [index],
    });

    return JSON.parse(String(result));
  }

  async getLatestForUrl(url: string): Promise<ScoutResult | null> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_latest_for_url",
      args: [url],
    });

    const raw = String(result);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  }

  async getLastResult(): Promise<ScoutResult | null> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_last_result",
      args: [],
    });

    const raw = String(result);

    if (!raw || raw === "{}") {
      return null;
    }

    return JSON.parse(raw);
  }
}
