// Run after the production build: node frontend/tests/browser-qa.cjs
// Requires the QA environment's Playwright + Chromium; adds no app dependency.
// Uses the actual page and build CSS with isolated wallet/contract fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'captainscout-browser-'));
const output = path.join(work, 'screenshots');
fs.mkdirSync(output);

async function buildFixture() {
  const fixtures = {
    'loader.cjs': `const ts=require(${JSON.stringify(require.resolve('typescript'))});
      module.exports=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;`,
    'wallet.js': `import {useState} from 'react';
      export function useWallet(){const [connected,setConnected]=useState(true);return {
        address:connected?'0x1234567890123456789012345678901234567890':null,
        isConnected:connected,chainId:'0xf22f',connectWallet:()=>setConnected(true),disconnectWallet:()=>setConnected(false)
      };}`,
    'client.js': `export const getContractAddress=()=> '0x0000000000000000000000000000000000000001';
      export const getStudioUrl=()=> 'mock-only';`,
    'contract.js': `const result=url=>({url,project_name:new URL(url).pathname==='/'?new URL(url).hostname:new URL(url).pathname.slice(1),uses_crypto:true,category:'Infrastructure',chain:'Ethereum',token_status:'Live',development_stage:'Mainnet',confidence:90,use_case:'Project intelligence with a longer description for narrow-screen readability.',crypto_integration:'Blockchain infrastructure, payments, and decentralized applications.'});
      window.__qa={stored:[result('https://stored.example/')],calls:[],active:0,maxActive:0,approve:null,finish:null};
      export default class Contract {
        async getAnalysisCount(){return window.__qa.stored.length;}
        async getAnalysisAt(i){return window.__qa.stored[i];}
        async getLatestForUrl(url){return window.__qa.stored.findLast(r=>r.url===url)??null;}
        async analyzeProject(url,onSubmitted){
          const q=window.__qa;q.calls.push(url);q.active++;q.maxActive=Math.max(q.maxActive,q.active);
          try {
            await new Promise((resolve,reject)=>q.approve=(ok=true)=>{q.approve=null;ok?resolve():reject(new Error('User rejected the request.'));});
            onSubmitted?.();
            const mode=await new Promise(resolve=>q.finish=(mode='success')=>{q.finish=null;resolve(mode);});
            if(mode==='inaccessible')throw new Error('WEBPAGE_LOAD_FAILED');
            if(mode!=='missing')q.stored.push(result(url));
          } finally {q.active--;}
        }
      }`,
    'enrichment.js': `export * from ${JSON.stringify(path.join(root, 'frontend/lib/scout/enrichment.ts'))};
      export const enrichmentProvider={async enrichProject(url,_analysis,options){window.__lastRefresh=options?.refresh;window.__researchCalls=(window.__researchCalls||0)+1;if(window.__researchFailure)throw Error('blocked');if(window.__officialOnly)return {...${JSON.stringify(require('./fixtures/enrichment.json'))},similarProjects:[],researchAvailability:{official:'AVAILABLE',broader:'NOT_CONFIGURED'}};return window.__enrichmentMock && url==='https://stored.example/' ? {...${JSON.stringify(require('./fixtures/enrichment.json'))},researchAvailability:{official:window.__partialOfficial?'PARTIAL':'AVAILABLE',broader:window.__providerFailed?'UNAVAILABLE':'AVAILABLE'},evidence:${JSON.stringify(require('./fixtures/enrichment.json'))}.evidence.map((e,i)=>({...e,sourceClass:i?'PRIMARY':'OFFICIAL',provider:i?'mock-search':'official',evidenceKind:'FETCH_VERIFIED'})).concat([{id:'discovery',url:'https://discovery.example/report',name:'Discovery report',domain:'discovery.example',provider:'tavily',sourceClass:'UNKNOWN',checkedAt:'2026-10-04T12:00:00Z',verification:'UNVERIFIED',evidenceKind:'DISCOVERY',queryTypes:['funding'],snippet:'Discovery only'}])} : null;}};`,
    'entry.tsx': `import React from 'react';import {createRoot} from 'react-dom/client';
      import HomePage from ${JSON.stringify(path.join(root, 'frontend/app/page'))};
      createRoot(document.getElementById('root')).render(<HomePage/>);`,
  };
  for (const [name, source] of Object.entries(fixtures)) fs.writeFileSync(path.join(work, name), source);
  await new Promise((resolve, reject) => {
    webpack({
      mode: 'development', entry: path.join(work, 'entry.tsx'), devtool: false,
      output: {path: work, filename: 'bundle.js'},
      resolve: {
        extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')],
        alias: {
          '@/lib/contracts/CryptoProjectScout': path.join(work, 'contract.js'),
          '@/lib/genlayer/wallet': path.join(work, 'wallet.js'),
          '@/lib/genlayer/client': path.join(work, 'client.js'),
          '@/lib/scout/enrichment': path.join(work, 'enrichment.js'),
          '@': path.join(root, 'frontend'),
        },
      },
      module: {rules: [{test: /\.tsx?$/, exclude: /node_modules/, use: path.join(work, 'loader.cjs')}]},
    }, (error, stats) => error || stats.hasErrors()
      ? reject(error || new Error(stats.toString({all: false, errors: true}))) : resolve());
  });
}

async function checkWidth(browser, width, css, bundle) {
  const page = await browser.newPage({viewport: {width, height: 1100}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url === 'http://captainscout.test/bundle.js') return route.fulfill({contentType: 'application/javascript; charset=utf-8', body: bundle});
    if (url === 'http://captainscout.test/') return route.fulfill({contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`});
    if (url.startsWith('http://captainscout.test/branding/')) {
      const asset = path.basename(new URL(url).pathname);
      return route.fulfill({contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'frontend/public/branding', asset))});
    }
    return route.abort(); // No live requests or transactions from this harness.
  });
  await page.goto('http://captainscout.test/');
  const input = page.getByRole('textbox', {name: 'Project websites or X handles'});
  const clear = page.getByRole('button', {name: 'Clear project input'});
  const analyze = page.locator('.analyze-button');
  const states = page.locator('.batch-state');
  const ready = page.locator('#project-ready');
  const validation = page.locator('#project-validation');
  const waitApproval = () => page.waitForFunction(() => typeof window.__qa.approve === 'function');
  const approve = async () => {
    await page.evaluate(() => window.__qa.approve());
    await page.waitForFunction(() => typeof window.__qa.finish === 'function');
  };
  await page.waitForFunction(() => document.querySelector('.stat-count')?.textContent === '1');

  assert.equal(await page.locator('.scout-mark img').evaluate(img => img.complete && img.naturalWidth > 0), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const brand = await page.locator('.scout-brand').boundingBox();
  const wallet = await page.locator('.wallet-button').boundingBox();
  assert(brand.y + brand.height <= wallet.y || brand.x + brand.width <= wallet.x, 'Brand and wallet must not collide');
  await page.screenshot({path: path.join(output, `branding-${width}.png`)});

  assert.match(await page.locator('.intelligence-status').first().innerText(), /Onchain analysis: Complete.*Enriched intelligence: Not yet enriched/s);
  assert.equal(await page.locator('.intelligence-section').count(), 0);
  assert.match(await page.locator('.enriched-intelligence').innerText(), /Additional intelligence has not been enriched yet/);
  await page.evaluate(() => { window.__enrichmentMock = true; });
  await page.getByRole('button', {name:'View History'}).click();
  const enriched = page.locator('.history-list .enriched-intelligence');
  assert.equal(await page.evaluate(() => window.__researchCalls || 0), 0);
  await enriched.getByRole('button', {name:'Research Project'}).click();
  await page.waitForFunction(() => document.querySelector('.history-list .intelligence-status')?.textContent.includes('Available'));
  assert.equal(await page.evaluate(() => window.__researchCalls), 1);
  for (const title of ['Features & Services','Competitive Landscape','Opportunities','Funding & Investors','Evidence & Sources']) await enriched.getByText(title, {exact:true}).click();
  assert.match(await enriched.innerText(), /Verified/);
  assert.match(await enriched.innerText(), /Inferred/);
  assert.equal(await enriched.getByRole('link', {name:'Participation details'}).getAttribute('href'), 'https://research.example/join');
  assert.match(await enriched.innerText(), /Mock investor/);
  assert.match(await enriched.innerText(), /Broader research: available/);
  assert.match(await enriched.innerText(), /PRIMARY/);
  assert.match(await enriched.innerText(), /Discovery only \(page not verified\)/);
  assert.match(await enriched.innerText(), /tavily/);
  assert.doesNotMatch(await enriched.innerText(), /providerStatus|rejectedBeforeFetch|NON_PUBLIC_DNS/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await enriched.screenshot({path:path.join(output, `enrichment-${width}.png`)});
  await page.evaluate(() => {window.__partialOfficial=true;});
  await enriched.getByRole('button', {name:'Refresh Research'}).click();
  await page.waitForFunction(() => document.querySelector('.history-list .enriched-intelligence')?.textContent.includes('Official research: partial'));
  assert.equal(await page.evaluate(() => window.__lastRefresh), true);
  assert.match(await enriched.innerText(), /Broader research: available/);
  await page.evaluate(() => {window.__providerFailed=true;});
  await enriched.getByRole('button', {name:'Refresh Research'}).click();
  await page.waitForFunction(() => document.querySelector('.history-list .enriched-intelligence')?.textContent.includes('Broader research: unable to verify'));
  assert.match(await enriched.innerText(), /Mock investor/);
  assert.match(await enriched.innerText(), /Enriched intelligence: Partial/);
  await page.evaluate(() => {window.__partialOfficial=false;window.__providerFailed=false;window.__researchFailure=true;});
  await enriched.getByRole('button', {name:'Refresh Research'}).click();
  await page.waitForFunction(() => document.querySelector('.history-list .intelligence-status')?.textContent.includes('Unable to verify'));
  assert.match(await enriched.innerText(), /Onchain analysis: Complete/);
  await page.evaluate(() => {window.__researchFailure=false;window.__officialOnly=true;});
  await enriched.getByRole('button', {name:'Research Project'}).click();
  await page.waitForFunction(() => document.querySelector('.history-list .enriched-intelligence')?.textContent.includes('Broader research provider is not configured'));
  assert.match(await enriched.innerText(), /Official research: available/);
  assert.match(await enriched.innerText(), /Enriched intelligence: Partial/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await enriched.screenshot({path:path.join(output, `official-only-${width}.png`)});
  await page.evaluate(() => {window.__officialOnly=false;});
  await page.getByRole('button', {name:'Close History'}).click();
  await page.evaluate(() => { window.__enrichmentMock = false; });

  assert.equal(await page.locator('.history-list').count(), 0);
  assert.equal(await page.getByRole('button', {name:'View History'}).getAttribute('aria-expanded'), 'false');
  await page.getByRole('button', {name:'View History'}).click();
  assert.equal(await page.locator('.history-list .result-card').count(), 1);
  await page.getByRole('button', {name:'Close History'}).click();
  assert.equal(await page.locator('.history-list').count(), 0);
  await page.getByRole('button', {name:'View History'}).click();

  // Invalid entries block the whole mixed batch, even with a connected wallet.
  for (const value of ['@', '@abcdefghijklmnop', '@project-name', '@project.name', '@project name', 'flop_labs']) {
    await input.fill(`https://ethereum.org/\n${value}`);
    await analyze.click();
    assert.match(await validation.innerText(), /Line 2:/);
    assert.equal(await page.evaluate(() => window.__qa.calls.length), 0);
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
  }
  await input.fill('https://ethereum.org/\n@project name');
  await page.locator('.scan-panel').screenshot({path: path.join(output, `validation-${width}.png`)});
  await clear.click();
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.locator('.analysis-status').count(), 0);
  assert.equal(await validation.innerText(), '');

  // Limits are applied after normalization, not to the number of input lines.
  const five = 'https://ethereum.org/\n@flop_labs\nhttps://endure.network/\n@base\n@project123';
  await input.fill(`${five}\nhttps://twitter.com/BASE/?s=20`);
  assert.match(await ready.innerText(), /5 projects ready.*1 duplicate source ignored/);
  assert.equal(await analyze.innerText(), 'Analyze 5 Projects');
  await input.fill(`${five}\n@sixth`);
  await analyze.click();
  assert.match(await validation.innerText(), /up to 5 unique projects/);
  assert.equal(await page.evaluate(() => window.__qa.calls.length), 0);

  // Single shorthand + equivalent URL submits exactly one normalized URL.
  await input.fill('@flop_labs\nhttps://x.com/flop_labs');
  assert.equal(await analyze.innerText(), 'Analyze Project');
  await analyze.click();
  await waitApproval();
  assert.equal(await page.locator('.batch-url').innerText(), '@flop_labs');
  assert.deepEqual(await page.evaluate(() => window.__qa.calls), ['https://x.com/flop_labs']);
  await approve();
  assert.equal(await states.innerText(), 'Analyzing');
  await page.evaluate(() => window.__qa.finish());
  await page.waitForFunction(() => document.querySelector('.batch-state')?.textContent === 'Complete');
  assert.equal(await page.locator('.stat-count').innerText(), '2');
  assert.equal(await page.locator('.batch-message').count(), 0);

  // Regression: clearing a populated handle batch preserves actual rendered history.
  const history = await page.locator('.history-list').innerText();
  await clear.click();
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.locator('.batch-progress').count(), 1);
  assert.equal(await page.locator('.history-list').innerText(), history);
  assert.equal(await page.locator('.stat-count').innerText(), '2');
  assert.equal(await input.evaluate(el => el === document.activeElement), true);

  // Mixed URL/handle queue: friendly labels survive every update; one failure
  // cannot erase earlier results or block subsequent projects.
  await input.fill(' \nhttps://ethereum.org/\n@flop_labs\n\nhttps://twitter.com/FLOP_LABS/?s=20\n@base\n');
  assert.match(await ready.innerText(), /3 projects ready.*1 duplicate source ignored/);
  await analyze.evaluate(button => {button.click(); button.click();});
  await waitApproval();
  assert.deepEqual(await states.allTextContents(), ['Awaiting wallet / submitting', 'Waiting', 'Waiting']);
  await approve();
  assert.deepEqual(await page.locator('.batch-url').allTextContents(), ['https://ethereum.org/', '@flop_labs', '@base']);
  await page.locator('.batch-progress').screenshot({path: path.join(output, `running-${width}.png`)});
  await clear.click();
  assert.equal(await page.locator('.batch-item').count(), 3);
  assert.equal(await page.locator('.history-list').innerText(), history);
  assert.equal(await input.evaluate(el => el.scrollTop), 0);
  await page.evaluate(() => window.__qa.finish());
  await waitApproval();
  await approve();
  await page.evaluate(() => window.__qa.finish('inaccessible'));
  await waitApproval();
  assert.deepEqual(await states.allTextContents(), ['Complete', 'Failed', 'Awaiting wallet / submitting']);
  assert.match(await page.locator('.batch-error').innerText(), /website may be blocking GenLayer validators/);
  await approve();
  await page.evaluate(() => window.__qa.finish());
  await page.waitForFunction(() => document.querySelectorAll('.state-complete').length === 2);
  assert.match(await page.locator('.batch-heading').innerText(), /2 of 3 completed · 1 failed/);
  assert.deepEqual(await page.evaluate(() => window.__qa.calls.slice(1)), ['https://ethereum.org/', 'https://x.com/flop_labs', 'https://x.com/base']);
  assert.equal(await page.evaluate(() => window.__qa.maxActive), 1);
  assert.equal(await page.locator('.history-list .result-card').count(), 4);
  assert.equal(await page.locator('.scout-container > .result-card .source-link').getAttribute('href'), 'https://x.com/base');
  assert.equal(await page.locator('.analysis-status').count(), 0);
  await page.locator('.batch-result > summary').last().click();
  assert.equal(await page.locator('.batch-result[open] .source-link').getAttribute('href'), 'https://x.com/base');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('.batch-progress').screenshot({path: path.join(output, `complete-${width}.png`)});
  await page.getByRole('button', {name:'Retry @flop_labs', exact:true}).click();
  await waitApproval(); await page.evaluate(() => window.__qa.approve(false));
  await page.waitForFunction(() => document.querySelector('.state-failed'));
  await page.getByRole('button', {name:'Retry Failed', exact:true}).click();
  await waitApproval(); await approve(); await page.evaluate(() => window.__qa.finish());
  await page.waitForFunction(() => document.querySelectorAll('.state-complete').length === 3);
  assert.equal(await page.locator('.batch-result').count(), 3);
  const search = page.getByRole('searchbox', {name:'Project / source'});
  await search.fill('stored.example'); assert.equal(await page.locator('.history-list .result-card').count(),1);
  await search.fill('no-match'); assert.equal(await page.locator('.history-list .result-card').count(),0);
  await page.getByRole('button', {name:'Reset filters'}).click();
  await page.locator('.compare-select input').nth(0).check();
  await page.locator('.compare-select input').nth(1).check();
  await page.getByRole('button', {name:'Compare Selected'}).click();
  assert.equal(await page.locator('.comparison-scroll tbody tr').count(),8);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('.archive-panel').screenshot({path:path.join(output, `archive-${width}.png`)});
  await page.getByRole('button', {name:'Close History'}).click();
  assert.equal(await page.locator('.history-list').count(),0);
  await input.fill('https://ethereum.org/\n@flop_labs\n@base');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({path: path.join(output, `homepage-${width}.png`)});
  assert.deepEqual(errors, []);
  console.log(`PASS ${width}px: handle validation, mixed batches, normalized submissions/deduplication, limits, sequential failure recovery, friendly labels, latest/expandable results, hidden/revealed history, search/reset, comparison, individual retry, Retry Failed, clear preserves results/history, no overflow or runtime errors.`);
  await page.close();
}

(async () => {
  await buildFixture();
  const staticRoot = path.join(root, 'frontend/.next/static');
  const css = fs.readdirSync(staticRoot, {recursive: true}).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(staticRoot, file), 'utf8')).join('\n');
  assert(css, 'Run the production build first to generate CSS.');
  const bundle = fs.readFileSync(path.join(work, 'bundle.js'), 'utf8');
  const systemChromium = '/usr/bin/chromium';
  const browser = await chromium.launch({headless: true, ...(fs.existsSync(systemChromium) ? {executablePath: systemChromium} : {}), args: ['--no-sandbox']});
  try {
    const icons = await browser.newPage({viewport: {width: 420, height: 160}, deviceScaleFactor: 2});
    const iconData = fs.readFileSync(path.join(root, 'frontend/public/branding/captainscout-mark.svg')).toString('base64');
    await icons.setContent(`<body style="background:#111e2a;color:#eaf0f5;font-family:system-ui;display:flex;gap:40px;align-items:center">${[16,32,64].map(size => `<div><img alt="CaptainScout" width="${size}" height="${size}" src="data:image/svg+xml;base64,${iconData}"><p>${size}px</p></div>`).join('')}</body>`);
    await icons.screenshot({path: path.join(output, 'icon-sizes.png')});
    await icons.close();
    for (const width of [1440, 768, 390, 320]) await checkWidth(browser, width, css, bundle);
    console.log(`QA screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
