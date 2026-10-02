// Run with Node 22.18+ / Node 24: node --test frontend/tests/batch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseProjectInput, runProjectBatch, WEBSITE_ACCESS_MESSAGE, analysisErrorMessage } from '../lib/scout/batch.ts';

const urls = ['https://ethereum.org/', 'https://endure.network/', 'https://hub.axisrobotics.ai/'];
const resultFor = (url) => ({ url, project_name: new URL(url).hostname, uses_crypto: true, category: 'Infrastructure', chain: 'Ethereum', token_status: 'Live', development_stage: 'Mainnet', use_case: 'Project intelligence', crypto_integration: 'Onchain infrastructure', confidence: 90 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(overrides = {}) {
  const stored = [];
  const calls = [];
  const updates = [];
  const successes = [];
  const contract = {
    async getAnalysisCount() { return stored.length; },
    async analyzeProject(url, onSubmitted) { calls.push(url); onSubmitted?.(); stored.push(resultFor(url)); },
    async getLatestForUrl(url) { return stored.findLast(item => item.url === url) ?? null; },
    ...overrides,
  };
  const callbacks = {
    canSubmit: () => true,
    onUpdate: (index, update) => updates.push({ index, ...update }),
    onSuccess: async result => { successes.push(result); },
  };
  return { stored, calls, updates, successes, contract, callbacks };
}

test('trims whitespace, ignores blank lines, removes exact duplicates, preserves URL spelling', () => {
  const parsed = parseProjectInput(` \n ${urls[0]} \r\n\n${urls[1]}\n${urls[0]}\nhttps://ethereum.org`);
  assert.deepEqual(parsed.urls, [urls[0], urls[1], 'https://ethereum.org']);
  assert.equal(parsed.validCount, 3);
  assert.equal(parsed.duplicateCount, 1);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parseProjectInput(' \n\t').urls, []);
});

test('validates every line and the unique limit before a batch can start', () => {
  for (const invalid of ['ethereum.org', 'ftp://example.com', 'https://', 'https:///example.com', 'https://bad host/', 'not a URL']) {
    const parsed = parseProjectInput(`${urls[0]}\n\n${invalid}`);
    assert.equal(parsed.validCount, 1);
    assert.match(parsed.errors[0], /^Line 3:/);
  }
  const five = Array.from({length: 5}, (_,i) => `https://project${i}.example/`);
  assert.equal(parseProjectInput([...five, five[0]].join('\n')).errors.length, 0);
  assert.match(parseProjectInput([...five, 'https://six.example/'].join('\n')).errors[0], /up to 5/);
});

test('invalid, empty, duplicate, and oversized snapshots make zero contract calls', async () => {
  const f = fixture();
  f.contract.getAnalysisCount = async () => { throw new Error('Must not read'); };
  for (const input of [[], [urls[0], 'bad'], [urls[0], urls[0]], Array.from({length:6},(_,i)=>`https://p${i}.example/`)]) {
    await assert.rejects(runProjectBatch(input, f.contract, f.callbacks), /1 and 5/);
  }
  assert.deepEqual(f.calls, []);
});

test('one valid URL retains submission, consensus, persistence, and result stages', async () => {
  const f = fixture();
  assert.deepEqual(await runProjectBatch([urls[0]], f.contract, f.callbacks), {completed: 1, failed: 0});
  assert.deepEqual(f.updates.map(u=>u.state), ['submitting', 'analyzing', 'analyzing', 'complete']);
  assert.equal(f.successes[0].url, urls[0]);
});

test('three URLs run sequentially, including persistence verification and history refresh', async () => {
  const f = fixture();
  const transaction = deferred(), verification = deferred(), refresh = deferred();
  let active = 0, maxActive = 0;
  f.contract.analyzeProject = async (url, onSubmitted) => {
    f.calls.push(url); active++; maxActive = Math.max(active, maxActive); onSubmitted();
    if (url === urls[0]) await transaction.promise;
    f.stored.push(resultFor(url)); active--;
  };
  f.contract.getLatestForUrl = async url => {
    if (url === urls[0]) await verification.promise;
    return resultFor(url);
  };
  f.callbacks.onSuccess = async result => {
    f.successes.push(result);
    if (result.url === urls[0]) await refresh.promise;
  };
  const run = runProjectBatch(urls, f.contract, f.callbacks);
  await tick(); assert.deepEqual(f.calls, [urls[0]]);
  transaction.resolve(); await tick(); assert.deepEqual(f.calls, [urls[0]]);
  verification.resolve(); await tick(); assert.deepEqual(f.calls, [urls[0]]);
  refresh.resolve();
  assert.deepEqual(await run, {completed: 3, failed: 0});
  assert.deepEqual(f.calls, urls); assert.equal(maxActive, 1);
});

test('an inaccessible middle URL fails independently and the next URL completes', async () => {
  const f = fixture(); const original = f.contract.analyzeProject;
  f.contract.analyzeProject = async (url, notify) => {
    if (url === urls[1]) { f.calls.push(url); throw new Error('WEBPAGE_LOAD_FAILED'); }
    return original(url, notify);
  };
  assert.deepEqual(await runProjectBatch(urls, f.contract, f.callbacks), {completed: 2, failed: 1});
  assert.deepEqual(f.calls, urls);
  assert.equal(f.updates.find(u=>u.state==='failed').message, WEBSITE_ACCESS_MESSAGE);
  assert.deepEqual(f.successes.map(r=>r.url), [urls[0], urls[2]]);
});

test('wallet rejection and execution errors are per-project failures, not queue stops', async () => {
  const f = fixture(); const original = f.contract.analyzeProject;
  f.contract.analyzeProject = async (url, notify) => {
    if (url !== urls[2]) throw new Error(url === urls[0] ? 'User rejected the request.' : 'GenLayer execution failed: ERROR');
    return original(url, notify);
  };
  assert.deepEqual(await runProjectBatch(urls, f.contract, f.callbacks), {completed:1, failed:2});
  assert.match(f.updates.find(u=>u.index===0 && u.state==='failed').message,/rejected/);
  assert.match(f.updates.find(u=>u.index===1 && u.state==='failed').message,/execution failed/);
});

test('missing count increase, missing results, and mismatched URLs cannot count as success', async () => {
  for (const mode of ['count', 'missing', 'mismatch']) {
    const f = fixture();
    if (mode === 'count') f.contract.getAnalysisCount = async () => 0;
    else f.contract.getLatestForUrl = async () => mode === 'missing' ? null : resultFor('https://other.example/');
    assert.deepEqual(await runProjectBatch([urls[0]], f.contract, f.callbacks), {completed:0, failed:1});
    assert.equal(f.updates.at(-1).message, WEBSITE_ACCESS_MESSAGE);
    assert.equal(f.successes.length, 0);
  }
});

test('wallet changes prevent remaining transactions and retain completed results', async () => {
  const f = fixture();let connected = true;
  f.callbacks.canSubmit = () => connected;
  f.callbacks.onSuccess = async result => { f.successes.push(result); connected = false; };
  assert.deepEqual(await runProjectBatch(urls, f.contract, f.callbacks), {completed:1, failed:2});
  assert.deepEqual(f.calls, [urls[0]]);
  assert.equal(f.successes.length, 1);
});

test('friendly error mapping retains existing website failure cases', () => {
  for (const message of ['no new analysis was stored','not persisted onchain','Website inaccessible','WEBPAGE_LOAD_FAILED']) {
    assert.equal(analysisErrorMessage(new Error(message)), WEBSITE_ACCESS_MESSAGE);
  }
  assert.equal(analysisErrorMessage(null),'Analysis failed. Please try again.');
});

// Exercise the real client with mocked SDK boundaries; never connect to a chain.
const require = createRequire(import.meta.url);
const ts = require('typescript');
function realClient(sdk) {
  const source = readFileSync(new URL('../lib/contracts/CryptoProjectScout.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports = {};
  new Function('require','exports',compiled)(name => {
    if(name==='genlayer-js') return {createClient:()=>sdk};
    if(name==='genlayer-js/chains') return {studionet:{}};
    if(name==='../genlayer/fees') return {estimateWriteFeePreset:async()=>({}),feePresetToTransactionFees:()=>undefined};
    throw new Error(name);
  },exports);
  return new exports.default('0x0000000000000000000000000000000000000001');
}

test('client progress fires only after wallet submission; receipt settings and execution checks remain intact', async () => {
  const order=[];
  const client=realClient({
    writeContract:async args=>{assert.equal(args.functionName,'analyze_project');assert.deepEqual(args.args,[urls[0]]);order.push('write');return '0xabc';},
    waitForTransactionReceipt:async args=>{order.push('receipt');assert.equal(args.status,'ACCEPTED');assert.equal(args.retries,40);assert.equal(args.interval,5000);return {txExecutionResultName:'FINISHED_WITH_RETURN'};},
  });
  await client.analyzeProject(urls[0],()=>order.push('submitted'));
  assert.deepEqual(order,['write','submitted','receipt']);
  await client.analyzeProject(urls[0]); // Existing callers still work.
  const originalLog = console.error;
  try {
    console.error = () => {};
    await client.analyzeProject(urls[0], () => { throw new Error('UI observer failed'); });
    assert.equal(order.at(-1), 'receipt');
  } finally { console.error = originalLog; }
  const failed=realClient({writeContract:async()=> '0xabc',waitForTransactionReceipt:async()=>({txExecutionResultName:'ERROR'})});
  await assert.rejects(failed.analyzeProject(urls[0]),/GenLayer execution failed/);
  let notified=false;
  const rejected=realClient({writeContract:async()=>{throw new Error('Rejected');}});
  await assert.rejects(rejected.analyzeProject(urls[0],()=>{notified=true;}),/Rejected/);
  assert.equal(notified,false);
});
