import { NextResponse } from 'next/server';
import { boundedJson } from '@/lib/radar/auth.mjs';
import { getRadarRepository, InMemoryRadarRepository, REVIEW_STATES } from '@/lib/radar/repository.mjs';
export const runtime='nodejs';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return NextResponse.json({error:'Review request rejected'},{status:403});
  let body;
  try {body=await boundedJson(request);if(!body || typeof body.projectId!=='string' || body.projectId.length>100 || !REVIEW_STATES.includes(body.state) || Object.keys(body).some(k=>!['projectId','state'].includes(k)))throw Error();}
  catch {return NextResponse.json({error:'Provide projectId and a valid review state'},{status:400});}
  try {const repo=await getRadarRepository();const result=await repo.transaction((tx: InMemoryRadarRepository)=>tx.updateReviewState(body.projectId,body.state));return NextResponse.json(result);}
  catch(error) {return NextResponse.json({error:'Review update unavailable'},{status:error instanceof Error && error.message==='UNKNOWN_PROJECT'?404:503});}
}
