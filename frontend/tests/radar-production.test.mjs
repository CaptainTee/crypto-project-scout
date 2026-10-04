import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseCommand,tables } from '../scripts/radar-db.mjs';
import { radarPoolOptions,PostgresRadarRepository } from '../lib/radar/repository.mjs';
test('commands require configuration and never create unconfigured connections',async()=>{
 for(const command of ['migrate','verify'])assert.equal((await databaseCommand(command,{url:'',createPool:()=>{throw Error('must not connect');}})).persistenceMode,'MEMORY');
});
test('repeat migration is additive, explicit and safe',async()=>{
 const queries=[];let ended=0;const createPool=()=>({query:async sql=>{queries.push(sql);},end:async()=>{ended++;}});
 for(let i=0;i<2;i++)assert.equal((await databaseCommand('migrate',{url:'fixture',createPool})).ok,true);
 assert.equal(queries[0],queries[1]);assert.doesNotMatch(queries[0],/DROP|TRUNCATE|DELETE/);assert.equal(ended,2);
});
test('verification is read-only, reports safe tables and no private rows',async()=>{
 const queries=[];const client={query:async(sql,args)=>{queries.push(sql);return {rows:sql.includes('to_regclass')?[{name:args[0]}]:[]};},release(){}};
 const result=await databaseCommand('verify',{url:'private-fixture-url',createPool:()=>({connect:async()=>client,end:async()=>{}})});
 assert.equal(result.ok,true);assert.deepEqual(result.expectedTablesFound,tables);assert.equal(queries[0],'BEGIN READ ONLY');assert.doesNotMatch(JSON.stringify(result),/private-fixture-url/);
});
test('missing schema and configured connection failures never report memory or success',async()=>{
 const missing=await databaseCommand('verify',{url:'private',createPool:()=>({connect:async()=>({query:async()=>({rows:[]}),release(){}}),end:async()=>{}})});assert.equal(missing.schemaReady,false);
 for(const command of ['verify','migrate']) {
  const result=await databaseCommand(command,{url:'private-password',createPool:()=>{throw Error('private-password');}});
  assert.equal(result.ok,false);assert.equal(result.persistenceMode,'POSTGRES');assert.doesNotMatch(JSON.stringify(result),/password/);
 }
});
test('bounded pools preserve TLS URL options and advisory busy never executes operation',async()=>{
 const options=radarPoolOptions('fixture?sslmode=require');assert.equal(options.max,3);assert.equal(options.idleTimeoutMillis,10000);assert.match(options.connectionString,/sslmode=require/);
 let called=false,released=false;const client={query:async sql=>({rows:sql.includes('pg_try')?[{acquired:false}]:[]}),release(){released=true;}};
 await assert.rejects(new PostgresRadarRepository({connect:async()=>client}).transaction(async()=>{called=true;}),/RADAR_BUSY/);assert.equal(called,false);assert.equal(released,true);
});
test('overlapping Postgres repository instances share transaction lock and only one ingests',async()=>{
 let locked=false,releaseGate;const gate=new Promise(resolve=>{releaseGate=resolve;});let entered;
 const started=new Promise(resolve=>{entered=resolve;});let operations=0;
 const pool={async connect(){let owns=false;return {async query(sql){if(sql.includes('pg_try')){owns=!locked;if(owns)locked=true;return {rows:[{acquired:owns}]};}if(['COMMIT','ROLLBACK'].includes(sql)&&owns)locked=false;return {rows:[]};},release(){}};}};
 const first=new PostgresRadarRepository(pool).transaction(async()=>{operations++;entered();await gate;});await started;
 await assert.rejects(new PostgresRadarRepository(pool).transaction(async()=>{operations++;}),/RADAR_BUSY/);releaseGate();await first;assert.equal(operations,1);assert.equal(locked,false);
});
test('configured repository failure stays POSTGRES and never switches to memory',async()=>{
 const {getRadarRepository}=await import('../lib/radar/repository.mjs');
 const key=Symbol.for('captainscout.radar.repository');const old=globalThis[key];const previous=process.env.CAPTAINSCOUT_RADAR_DATABASE_URL;
 try {
  process.env.CAPTAINSCOUT_RADAR_DATABASE_URL='fixture';globalThis[key]=new PostgresRadarRepository({query:async()=>{throw Error('fixture outage');}});
  const repo=await getRadarRepository();await assert.rejects(repo.listProjects());assert.equal((await getRadarRepository()).persistenceMode,'POSTGRES');
 } finally {if(old===undefined)delete globalThis[key];else globalThis[key]=old;if(previous===undefined)delete process.env.CAPTAINSCOUT_RADAR_DATABASE_URL;else process.env.CAPTAINSCOUT_RADAR_DATABASE_URL=previous;}
});
test('explicit restart helper closes and recreates instances, preserves controlled fixture',async()=>{
 const {checkRadarRestart}=await import('../scripts/radar-restart-check.mjs');
 const {createMemoryStore,InMemoryRadarRepository}=await import('../lib/radar/repository.mjs');
 await assert.rejects(checkRadarRestart(),/approval/);const store=createMemoryStore();let creates=0,closes=0;
 const result=await checkRadarRestart({approved:true,createRepository:async()=>{creates++;return {repository:new InMemoryRadarRepository(store),close:async()=>{closes++;}};}});
 assert.equal(result.verified,true);assert.equal(creates,2);assert.equal(closes,2);assert.equal(store.projects.size,1);
});
