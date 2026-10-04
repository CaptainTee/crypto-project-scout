import { NextResponse } from "next/server";
import { radarService } from "@/lib/radar/discovery.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({error:"Radar refresh request rejected"}, {status:403});
  }
  try {
    return NextResponse.json(await radarService.refresh(), {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Radar refresh unavailable"}, {status:503});
  }
}
