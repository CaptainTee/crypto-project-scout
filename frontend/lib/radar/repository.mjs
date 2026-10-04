import { randomUUID } from 'node:crypto';
export const REVIEW_STATES = Object.freeze(['NEW','SEEN','REVIEWED','DISMISSED']);
const clone = value => structuredClone(value);
export function createMemoryStore() { return {projects:new Map(),events:new Map(),classifications:new Map(),reviews:new Map(),runs:new Map(),locked:false}; }
/** All domain operations use this interface; adapters own storage and transaction details. */
export class InMemoryRadarRepository {
  constructor(store=createMemoryStore()) { this.store=store; this.persistenceMode='MEMORY'; }
  async transaction(operation) {
    if(this.store.locked) throw Error('RADAR_BUSY');
    this.store.locked=true;
    const snapshot=clone(this.store);
    try { return await operation(this); } catch(error) { Object.assign(this.store,snapshot); throw error; }
    finally { this.store.locked=false; }
  }
  async getProject(id) { return clone(this.store.projects.get(id) || null); }
  async listProjects() { return clone([...this.store.projects.values()]); }
  async upsertProject(project) { this.store.projects.set(project.id,clone(project)); }
  async appendDiscoveryEvent(event) { if(this.store.events.has(event.contentFingerprint))return false; this.store.events.set(event.contentFingerprint,clone(event)); return true; }
  async listDiscoveryEvents(projectId) { return clone([...this.store.events.values()].filter(e=>!projectId || e.projectId===projectId)); }
  async saveClassification(projectId,result) {
    const history=this.store.classifications.get(projectId)||[];
    history.push({id:randomUUID(),projectId,...clone(result)});this.store.classifications.set(projectId,history);
  }
  async listClassifications(projectId) { return clone(this.store.classifications.get(projectId)||[]); }
  async getClassification(projectId) { return (await this.listClassifications(projectId)).at(-1)||null; }
  async updateReviewState(projectId,state,updatedAt=new Date().toISOString()) {
    if(!REVIEW_STATES.includes(state))throw Error('INVALID_REVIEW_STATE');
    if(!await this.getProject(projectId))throw Error('UNKNOWN_PROJECT');
    const review={projectId,state,updatedAt};this.store.reviews.set(projectId,review);return clone(review);
  }
  async getReviewState(projectId) { return clone(this.store.reviews.get(projectId)||{projectId,state:'NEW'}); }
  async beginMonitoringRun(run) { this.store.runs.set(run.runId,clone(run)); }
  async finishMonitoringRun(run) { this.store.runs.set(run.runId,clone(run)); }
  async getLatestMonitoringRun() { return clone([...this.store.runs.values()].at(-1)||null); }
}
/** Pool is injectable for deterministic SQL contract tests. No query text contains caller data. */
export class PostgresRadarRepository {
  constructor(pool,client=null) { this.pool=pool;this.client=client;this.persistenceMode='POSTGRES'; }
  query(sql,values=[]) { return (this.client||this.pool).query(sql,values); }
  async transaction(operation) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lock=await client.query('SELECT pg_try_advisory_xact_lock(684601) AS acquired');
      if(!lock.rows[0]?.acquired)throw Error('RADAR_BUSY');
      const result=await operation(new PostgresRadarRepository(this.pool,client));
      await client.query('COMMIT');return result;
    } catch(error) { await client.query('ROLLBACK');throw error; } finally { client.release(); }
  }
  async getProject(id) { return (await this.query('SELECT record FROM radar_projects WHERE id = $1',[id])).rows[0]?.record||null; }
  async listProjects() { return (await this.query('SELECT record FROM radar_projects ORDER BY created_at, id')).rows.map(r=>r.record); }
  async upsertProject(p) {
    await this.query('INSERT INTO radar_projects (id, canonical_identity_key, record, created_at, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET canonical_identity_key=EXCLUDED.canonical_identity_key, record=EXCLUDED.record, updated_at=EXCLUDED.updated_at',[p.id,p.canonicalIdentityKey,p,p.createdAt,p.updatedAt]);
    for(const key of p.identityKeys)await this.query('INSERT INTO radar_identity_aliases (identity_key, project_id) VALUES ($1,$2) ON CONFLICT (identity_key) DO NOTHING',[key,p.id]);
  }
  async appendDiscoveryEvent(e) { return (await this.query('INSERT INTO radar_discovery_events (event_id, project_id, content_fingerprint, retrieved_at, record) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (content_fingerprint) DO NOTHING RETURNING event_id',[e.eventId,e.projectId,e.contentFingerprint,e.retrievedAt,e])).rows.length>0; }
  async listDiscoveryEvents(id) { return (await this.query('SELECT record FROM radar_discovery_events WHERE ($1::text IS NULL OR project_id = $1) ORDER BY retrieved_at, event_id',[id||null])).rows.map(r=>r.record); }
  async saveClassification(id,result) { await this.query('INSERT INTO radar_classifications (id, project_id, classified_at, record) VALUES ($1,$2,$3,$4)',[randomUUID(),id,result.classification.classifiedAt||new Date().toISOString(),result]); }
  async listClassifications(id) { return (await this.query('SELECT record FROM radar_classifications WHERE project_id=$1 ORDER BY sequence',[id])).rows.map(r=>r.record); }
  async getClassification(id) { return (await this.query('SELECT record FROM radar_classifications WHERE project_id=$1 ORDER BY sequence DESC LIMIT 1',[id])).rows[0]?.record||null; }
  async updateReviewState(id,state,updatedAt=new Date().toISOString()) {
    if(!REVIEW_STATES.includes(state))throw Error('INVALID_REVIEW_STATE');
    if(!await this.getProject(id))throw Error('UNKNOWN_PROJECT');
    await this.query('INSERT INTO radar_review_state (project_id, state, updated_at) VALUES ($1,$2,$3) ON CONFLICT (project_id) DO UPDATE SET state=EXCLUDED.state, updated_at=EXCLUDED.updated_at',[id,state,updatedAt]);return {projectId:id,state,updatedAt};
  }
  async getReviewState(id) { const row=(await this.query('SELECT state, updated_at FROM radar_review_state WHERE project_id=$1',[id])).rows[0];return {projectId:id,state:row?.state||'NEW',updatedAt:row?.updated_at}; }
  async beginMonitoringRun(run) { await this.finishMonitoringRun(run); }
  async finishMonitoringRun(run) { await this.query('INSERT INTO radar_monitor_runs (run_id, started_at, record) VALUES ($1,$2,$3) ON CONFLICT (run_id) DO UPDATE SET record=EXCLUDED.record',[run.runId,run.startedAt,run]); }
  async getLatestMonitoringRun() { return (await this.query('SELECT record FROM radar_monitor_runs ORDER BY started_at DESC, run_id DESC LIMIT 1')).rows[0]?.record||null; }
}
const key=Symbol.for('captainscout.radar.repository');
export async function getRadarRepository() {
  if(!globalThis[key]) {
    if(process.env.CAPTAINSCOUT_RADAR_DATABASE_URL) {
      const {Pool}=await import('pg');
      globalThis[key]=new PostgresRadarRepository(new Pool({connectionString:process.env.CAPTAINSCOUT_RADAR_DATABASE_URL,max:3,connectionTimeoutMillis:5000,query_timeout:10000}));
    } else globalThis[key]=new InMemoryRadarRepository();
  }
  return globalThis[key];
}
