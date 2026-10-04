import { NextResponse } from "next/server";
import { broaderResearchProvider } from "@/lib/scout/orchestrator.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw Error();
    if (Number(request.headers.get("content-length")) > 4096 || !request.body) throw Error();
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw Error(); }
      chunks.push(value);
    }
    const {sourceUrl, refresh} = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof sourceUrl !== "string" || sourceUrl.length > 2048) throw Error();
    const data = await broaderResearchProvider.enrichProject(sourceUrl, {refresh:refresh === true});
    return NextResponse.json({...data, sourceUrl}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return NextResponse.json({error: "Official source could not be researched safely. Please try again shortly."}, {status: 400});
  }
}
