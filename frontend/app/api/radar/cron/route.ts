import { NextResponse } from 'next/server';
import { monitorAuthorization } from '@/lib/radar/auth.mjs';
import { runRadarMonitoring } from '@/lib/radar/monitoring.mjs';
export const runtime='nodejs';
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const status=monitorAuthorization(request.headers.get('authorization'),{secret:process.env.CRON_SECRET});
  if(status!==200)return NextResponse.json({error:status===503?'Monitoring unavailable':'Unauthorized'},{status});
  try {return NextResponse.json(await runRadarMonitoring({trigger:'SCHEDULED',classifyNewProjects:true}),{headers:{'Cache-Control':'no-store'}});}
  catch {return NextResponse.json({error:'Monitoring unavailable or busy'},{status:503});}
}
