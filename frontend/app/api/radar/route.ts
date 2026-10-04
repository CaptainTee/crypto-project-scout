import { NextResponse } from "next/server";
import { readRadar } from "@/lib/radar/monitoring.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await readRadar(), {headers:{"Cache-Control":"no-store"}}); }
  catch { return NextResponse.json({error:"Radar storage unavailable"},{status:503}); }
}
