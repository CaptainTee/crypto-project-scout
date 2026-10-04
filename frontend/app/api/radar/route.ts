import { NextResponse } from "next/server";
import { radarService } from "@/lib/radar/discovery.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(radarService.get(), {headers:{"Cache-Control":"no-store"}});
}
