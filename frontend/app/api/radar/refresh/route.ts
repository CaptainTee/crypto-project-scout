import { NextResponse } from "next/server";
import { readRadar, runRadarMonitoring } from "@/lib/radar/monitoring.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({error:"Radar refresh request rejected"}, {status:403});
  try {
    await runRadarMonitoring({trigger:'MANUAL',classifyNewProjects:false});
    return NextResponse.json(await readRadar(), {headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    if(error instanceof Error && error.message==='RADAR_COOLDOWN') {
      try {return NextResponse.json(await readRadar());} catch {return NextResponse.json({error:'Radar storage unavailable'},{status:503});}
    }
    return NextResponse.json({error:"Radar refresh unavailable"}, {status:503});
  }
}
