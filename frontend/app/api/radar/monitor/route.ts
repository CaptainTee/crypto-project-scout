import { NextResponse } from 'next/server';
import { monitorAuthorization } from '@/lib/radar/auth.mjs';
import { runRadarMonitoring } from '@/lib/radar/monitoring.mjs';
export const runtime='nodejs';
export async function POST(request:Request) {
  const status=monitorAuthorization(request.headers.get('authorization'));
  if(status!==200)return NextResponse.json({error:status===503?'Monitoring unavailable':'Unauthorized'},{status});
  if(request.body) {await request.body.cancel();return NextResponse.json({error:'Monitoring does not accept a request body'},{status:400});}
  try {return NextResponse.json(await runRadarMonitoring({trigger:'SCHEDULED',classifyNewProjects:true}),{headers:{'Cache-Control':'no-store'}});}
  catch {return NextResponse.json({error:'Monitoring unavailable or busy'},{status:503});}
}
