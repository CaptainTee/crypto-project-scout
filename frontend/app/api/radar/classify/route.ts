import { NextResponse } from "next/server";
import { readRadar, persistClassification } from "@/lib/radar/monitoring.mjs";
import { getRadarRepository, InMemoryRadarRepository } from "@/lib/radar/repository.mjs";
import { boundedJson } from "@/lib/radar/auth.mjs";
import { classificationService } from "@/lib/radar/classification.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({error:"Classification request rejected"}, {status:403});
  }
  let body;
  try {
    body = await boundedJson(request);
    if (!body || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 5 ||
        body.ids.some((id: unknown) => typeof id !== "string" || id.length > 100) ||
        new Set(body.ids).size !== body.ids.length || (body.refresh !== undefined && typeof body.refresh !== "boolean")) throw Error();
  } catch {
    return NextResponse.json({error:"Provide 1–5 unique Radar ids and optional boolean refresh"}, {status:400});
  }
  try {
    const repo = await getRadarRepository();
    const discoveries = (await readRadar(repo)).discoveries;
    const selected = body.ids.map((id: string) => discoveries.find((d: {id: string}) => d.id === id));
    if (selected.some((d: unknown) => !d)) return NextResponse.json({error:"Unknown Radar identity; refresh discoveries explicitly first"}, {status:404});
    const result = await classificationService.batch(selected, {refresh:body.refresh === true});
    await repo.transaction(async (tx: InMemoryRadarRepository) => { for (const item of result.results) await persistClassification(tx,item.id,item); });
    return NextResponse.json(result, {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Classification is busy; retry shortly"}, {status:503});
  }
}
