import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProjectSource, parseProjectInput, runProjectBatch, WEBSITE_ACCESS_MESSAGE } from '../lib/scout/batch.ts';

const parse = (...lines) => parseProjectInput(lines.join('\n'));

test('@flop_labs normalizes to the expected URL and retains its friendly label', () => {
  assert.deepEqual(normalizeProjectSource('@flop_labs'), {url:'https://x.com/flop_labs',label:'@flop_labs'});
  for (const handle of ['@ethereum','@base','@project123','@a','@_']) {
    assert.equal(parse(handle).errors.length,0);
  }
});

test('a valid 15-character handle is accepted', () => {
  assert.equal(normalizeProjectSource('@abcdefghijklmno').url,'https://x.com/abcdefghijklmno');
});

test('an empty @ is rejected with a useful handle-specific error', () => {
  assert.match(parse('@').errors[0],/Line 1: Invalid X handle.*1–15/);
});

test('handles longer than 15 characters are rejected', () => {
  for (const value of ['@abcdefghijklmnop','@this_handle_is_far_too_long']) {
    assert.match(parse(value).errors[0],/Invalid X handle/);
  }
});

test('dash, dot, and other punctuation in shorthand handles are rejected', () => {
  for (const value of ['@project-name','@project.name','@@project','@project!','@project/path']) {
    assert.match(parse(value).errors[0],/Invalid X handle/);
  }
});

test('whitespace inside a handle is rejected; surrounding input whitespace is trimmed', () => {
  for (const value of ['@project name','@project\tname','@ project','@project\u00a0name']) {
    assert.match(parse(value).errors[0],/Invalid X handle/);
  }
  assert.deepEqual(parse('  @flop_labs  ').urls,['https://x.com/flop_labs']);
});

test('ordinary website URLs remain unchanged, including paths, queries, and fragments', () => {
  for (const value of ['https://ethereum.org/','http://example.org/A?q=B#section','https://example.com/@base']) {
    assert.equal(normalizeProjectSource(value).url,value);
  }
});

test('full x.com and twitter.com profile URLs remain supported', () => {
  assert.equal(normalizeProjectSource('https://x.com/flop_labs').url,'https://x.com/flop_labs');
  assert.equal(normalizeProjectSource('https://twitter.com/flop_labs').url,'https://x.com/flop_labs');
});

test('mixed website and handle batches keep the original order and labels', () => {
  const parsed=parse('https://ethereum.org/','@flop_labs','https://endure.network/','@base');
  assert.deepEqual(parsed.errors,[]);
  assert.deepEqual(parsed.urls,['https://ethereum.org/','https://x.com/flop_labs','https://endure.network/','https://x.com/base']);
  assert.deepEqual(parsed.projects.map(p=>p.label),['https://ethereum.org/','@flop_labs','https://endure.network/','@base']);
});

test('shorthand and its full X URL deduplicate after normalization, in either order', () => {
  for (const lines of [['@flop_labs','https://x.com/flop_labs'],['https://x.com/flop_labs','@flop_labs']]) {
    const parsed=parse(...lines);
    assert.deepEqual(parsed.projects,[{url:'https://x.com/flop_labs',label:'@flop_labs'}]);
    assert.equal(parsed.validCount,1);
    assert.equal(parsed.duplicateCount,1);
  }
});

test('five mixed normalized unique inputs are accepted, even with extra equivalent lines', () => {
  const parsed=parse('https://ethereum.org/','@flop_labs','https://endure.network/','@base','@project123','https://twitter.com/Base/?s=20');
  assert.equal(parsed.validCount,5);
  assert.equal(parsed.urls.length,5);
  assert.deepEqual(parsed.errors,[]);
});

test('more than five normalized unique sources are rejected', () => {
  const parsed=parse('https://ethereum.org/','@flop_labs','https://endure.network/','@base','@project123','@sixth');
  assert.equal(parsed.validCount,6);
  assert.match(parsed.errors[0],/up to 5 unique projects/);
});

test('bare words never become X handles, and error line numbers include blank lines', () => {
  const parsed=parse('@base','','flop_labs');
  assert.match(parsed.errors[0],/Line 3:.*beginning with @/);
  assert.equal(parsed.validCount,1);
});

test('common X profile aliases, casing, slash, and sharing parameters deduplicate', () => {
  const parsed=parse('@Flop_Labs','https://twitter.com/FLOP_LABS/','http://www.x.com/flop_labs?s=20&t=share','https://mobile.twitter.com/flop_labs?utm_source=share#top');
  assert.deepEqual(parsed.urls,['https://x.com/flop_labs']);
  assert.equal(parsed.duplicateCount,3);
  assert.equal(normalizeProjectSource(parsed.urls[0]).url,parsed.urls[0]);
});

test('non-profile X URLs and unrelated domains are not rewritten or merged', () => {
  for (const value of [
    'https://x.com/base/status/123','https://twitter.com/search?q=base',
    'https://twitter.com/home','https://x.com/base?lang=ja',
    'https://x.com/base/with_replies','https://x.com.evil.example/base',
    'https://twitter.com:8443/base','https://user:password@twitter.com/base',
  ]) assert.equal(normalizeProjectSource(value).url,value);
  assert.equal(parse('@base','https://x.com/base/status/123','https://x.com/base?lang=ja').urls.length,3);
});

test('mixed queue submits only normalized URLs and continues after an inaccessible X page', async () => {
  const parsed=parse('https://ethereum.org/','@flop_labs','https://x.com/flop_labs','@base');
  const writes=[],reads=[],updates=[],stored=[];
  const summary=await runProjectBatch(parsed.urls,{
    getAnalysisCount:async()=>stored.length,
    analyzeProject:async(url,notify)=>{
      writes.push(url);notify?.();
      if(url==='https://x.com/flop_labs')throw new Error('WEBPAGE_LOAD_FAILED');
      stored.push({url,project_name:url});
    },
    getLatestForUrl:async(url)=>{reads.push(url);return stored.findLast(r=>r.url===url);},
  },{
    canSubmit:()=>true,onSuccess:async()=>{},onUpdate:(index,update)=>updates.push({index,...update}),
  });
  assert.deepEqual(writes,['https://ethereum.org/','https://x.com/flop_labs','https://x.com/base']);
  assert.deepEqual(reads,['https://ethereum.org/','https://x.com/base']);
  assert.deepEqual(summary,{completed:2,failed:1});
  assert.equal(updates.find(u=>u.state==='failed').message,WEBSITE_ACCESS_MESSAGE);
});

test('the execution boundary refuses unnormalized handles before any contract calls', async () => {
  let called=false;
  await assert.rejects(runProjectBatch(['@base'],{
    getAnalysisCount:async()=>{called=true;return 0;},
    analyzeProject:async()=>{called=true;},getLatestForUrl:async()=>null,
  },{canSubmit:()=>true,onUpdate:()=>{},onSuccess:async()=>{}}),/unique, valid project URLs/);
  assert.equal(called,false);
});
