import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { radarPoolOptions } from '../lib/radar/repository.mjs';
const columns={radar_projects:'id,canonical_identity_key,record,created_at,updated_at',radar_identity_aliases:'identity_key,project_id',radar_discovery_events:'event_id,project_id,content_fingerprint,retrieved_at,record',radar_classifications:'id,sequence,project_id,classified_at,record',radar_review_state:'project_id,state,updated_at',radar_monitor_runs:'run_id,started_at,record'};
export const tables=['radar_projects','radar_identity_aliases','radar_discovery_events','radar_classifications','radar_review_state','radar_monitor_runs'];
export async function databaseCommand(command,{url=process.env.CAPTAINSCOUT_RADAR_DATABASE_URL,createPool}={}) {
  if(!url)return {ok:false,persistenceMode:'MEMORY',error:'CAPTAINSCOUT_RADAR_DATABASE_URL required'};
  if(!['migrate','verify'].includes(command))return {ok:false,error:'Use migrate or verify'};
  let pool,reachable=false;
  try {
    if(!createPool){const {Pool}=await import('pg');createPool=options=>new Pool(options);}
    pool=createPool({...radarPoolOptions(url),max:1});
    if(command==='migrate') {
      await pool.query(await readFile(new URL('../lib/radar/migrations/001_radar.sql',import.meta.url),'utf8'));
      return {ok:true,persistenceMode:'POSTGRES',migrationApplied:true};
    }
    // Verification is one read-only transaction, with no user data returned.
    const client=await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query('SELECT 1');reachable=true;
      const found=[];
      for(const table of tables) {
        const result=await client.query('SELECT to_regclass($1) AS name',[`public.${table}`]);
        if(result.rows[0]?.name)found.push(table);
      }
      let schemaReady=found.length===tables.length;
      if(schemaReady) {
        // Validate columns used by the adapter without reading private rows.
        for(const table of tables)await client.query(`SELECT ${columns[table]} FROM ${table} LIMIT 0`);
        await client.query('SELECT sequence FROM radar_classifications LIMIT 0');
      }
      await client.query('COMMIT');
      return {ok:schemaReady,persistenceMode:'POSTGRES',databaseReachable:true,schemaReady,basicQuerySucceeds:true,expectedTablesFound:found};
    } finally {client.release();}
  } catch {return {ok:false,persistenceMode:'POSTGRES',databaseReachable:reachable,schemaReady:false,basicQuerySucceeds:reachable,error:'Radar database operation unavailable'};}
  finally {if(pool)try{await pool.end();}catch{ /* Never expose driver errors. */ }}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await databaseCommand(process.argv[2]);
  console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;
}
