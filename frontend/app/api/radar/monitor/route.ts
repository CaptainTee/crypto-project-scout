import { NextResponse } from 'next/server';
import { monitorAuthorization } from '@/lib/radar/auth.mjs';
import { runRadarMonitoring } from '@/lib/radar/monitoring.mjs';
export const runtime='nodejs';
async function hasBodyBytes(request:Request) {
  const reader=request.body?.getReader();
  if(!reader)return false;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done)return false;
      if(value.byteLength>0)return true;
    }
  } catch {return true;}
  finally {
    // Stop at the first actual bytes; never buffer or drain an unwanted body.
    void reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
export async function POST(request:Request) {
  const status=monitorAuthorization(request.headers.get('authorization'));
  if(status!==200)return NextResponse.json({error:status===503?'Monitoring unavailable':'Unauthorized'},{status});
  if(await hasBodyBytes(request))return NextResponse.json({error:'Monitoring does not accept a request body'},{status:400});
  try {return NextResponse.json(await runRadarMonitoring({trigger:'MANUAL',classifyNewProjects:true}),{headers:{'Cache-Control':'no-store'}});}
  catch {return NextResponse.json({error:'Monitoring unavailable or busy'},{status:503});}
}
