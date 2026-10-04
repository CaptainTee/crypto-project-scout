import { timingSafeEqual } from 'node:crypto';
export function monitorAuthorization(authorization,{production=process.env.NODE_ENV==='production',secret=process.env.CAPTAINSCOUT_MONITOR_SECRET}={}) {
  if(!secret)return 503;
  const supplied=authorization?.startsWith('Bearer ')?authorization.slice(7):'';
  const a=Buffer.from(supplied),b=Buffer.from(secret);
  return a.length===b.length && timingSafeEqual(a,b)?200:401;
}
export async function boundedJson(request,max=2048) {
  if(Number(request.headers.get('content-length'))>max)throw Error('BODY_LIMIT');
  const reader=request.body?.getReader();if(!reader)throw Error('BODY_REQUIRED');
  let size=0;const chunks=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw Error('BODY_LIMIT');chunks.push(value);}}
  finally {await reader.cancel();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
