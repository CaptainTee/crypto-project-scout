import { NextResponse } from "next/server";
import { radarService } from "@/lib/radar/discovery.mjs";
import { classificationService } from "@/lib/radar/classification.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({error:"Classification request rejected"}, {status:403});
  }
  let body;
  try {
    if (Number(request.headers.get("content-length")) > 2048) throw Error();
    const text = await request.text();
    if (text.length > 2048) throw Error();
    body = JSON.parse(text);
    if (!body || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 5 ||
        body.ids.some((id: unknown) => typeof id !== "string" || id.length > 100) ||
        new Set(body.ids).size !== body.ids.length || (body.refresh !== undefined && typeof body.refresh !== "boolean")) throw Error();
  } catch {
    return NextResponse.json({error:"Provide 1–5 unique Radar ids and optional boolean refresh"}, {status:400});
  }
  const discoveries = radarService.get().discoveries;
  const selected = body.ids.map((id: string) => discoveries.find((d: {id: string}) => d.id === id));
  if (selected.some((d: unknown) => !d)) return NextResponse.json({error:"Unknown Radar identity; refresh discoveries explicitly first"}, {status:404});
  try {
    return NextResponse.json(await classificationService.batch(selected, {refresh:body.refresh === true}), {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Classification is busy; retry shortly"}, {status:503});
  }
}
