const assert=require('node:assert/strict');
const {response,empty}=require('./fixtures/radar.cjs');
exports.mock=async(route,state)=>{
 const req=route.request(),url=new URL(req.url());if(!url.pathname.startsWith('/api/radar'))return false;
 state.calls.push({path:url.pathname,method:req.method()});
 if(url.pathname==='/api/radar')await route.fulfill({json:state.empty?empty:state.onlyUnclassified?{...response,discoveries:[response.discoveries[3]]}:response});
 else if(url.pathname.endsWith('/refresh'))await route.fulfill(state.failRefresh?{status:503,json:{error:'secret stack'}}:{json:response});
 else {const id=req.postDataJSON().ids[0];await route.fulfill({json:{results:[state.failClassify?{id,status:'FAILED',error:'secret stack'}:{id,status:'CLASSIFIED',classification:{...response.discoveries[0].classification},classificationEvidence:[]}]}});}
 return true;
};
exports.check=async(page,state,output,width)=>{
 const radar=page.locator('.captain-radar');await radar.getByRole('heading',{name:'Captain’s Radar',exact:true}).waitFor();await radar.getByText('Signal a',{exact:true}).waitFor();
 assert.deepEqual(state.calls,[{path:'/api/radar',method:'GET'}]);
 assert.equal(await radar.locator('.radar-card').count(),12);
 await radar.getByRole('button',{name:/Show more/}).click();assert.equal(await radar.locator('.radar-card').count(),17);
 await radar.getByLabel('Non-Crypto',{exact:true}).check();assert.equal(await radar.getByText('Signal c',{exact:true}).count(),1);
 await radar.getByLabel('Unclassified',{exact:true}).check();assert.equal(await radar.getByText('Signal d',{exact:true}).count(),1);
 const card=id=>radar.locator('.radar-card').filter({has:page.getByRole('heading',{name:'Signal '+id,exact:true})});
 await card('a').getByRole('button',{name:'Evidence & details'}).click();assert.equal(await card('a').getByRole('button',{name:'Hide details'}).getAttribute('aria-expanded'),'true');
 for(const link of await card('a').locator('a').all()){assert.equal(await link.getAttribute('rel'),'noopener noreferrer');assert.match(await link.getAttribute('href'),/^https?:/);}
 await card('a').getByRole('button',{name:'Hide details'}).click();
 await radar.getByLabel('Search Radar').fill('trajectory');assert.equal(await card('b').count(),0);await radar.getByLabel('Search Radar').fill('');
 await radar.getByLabel('Network',{exact:true}).selectOption('Base');assert.equal(await card('b').count(),0);await radar.getByLabel('Network',{exact:true}).selectOption('');
 await radar.getByLabel('Needs Review',{exact:true}).check();assert.equal(await radar.locator('.radar-card').count(),1);await radar.getByLabel('Needs Review',{exact:true}).uncheck();
 await radar.getByLabel('Source',{exact:true}).selectOption('FrontRun X');assert(await radar.locator('.radar-card').count());await radar.getByLabel('Source',{exact:true}).selectOption('');
 await radar.getByLabel('Funding mention',{exact:true}).check();assert.equal(await radar.locator('.radar-card').count(),1);await radar.getByLabel('Funding mention',{exact:true}).uncheck();
 await radar.getByLabel('Sort by').selectOption('funding');assert.equal(await radar.locator('.radar-card h3').first().textContent(),'Signal a');
 if(await radar.getByRole('button',{name:/Show more/}).count())await radar.getByRole('button',{name:/Show more/}).click();
 await card('a').getByRole('button',{name:'Research Project',exact:true}).click();assert.equal(await page.locator('#project-url').inputValue(),'https://official.example/');
 await card('b').getByRole('button',{name:'Research Project',exact:true}).click();assert.equal(await page.locator('#project-url').inputValue(),'@signal_b');
 assert(await card('e').getByRole('button',{name:'Research Project',exact:true}).isDisabled());assert(await card('f').getByRole('button',{name:'Research Project',exact:true}).isDisabled());
 assert.equal(await page.evaluate(()=>window.__qa.calls.length),0);
 state.failClassify=true;await card('d').getByRole('button',{name:'Classify',exact:true}).click();await card('d').getByRole('alert').waitFor();assert.equal(await card('a').getByRole('alert').count(),0);assert.equal(await card('d').getByText('Unclassified',{exact:true}).count(),1);
 state.failClassify=false;await card('d').getByRole('button',{name:'Classify',exact:true}).click();await card('d').getByRole('button',{name:'Refresh Classification'}).waitFor();
 state.failRefresh=true;await radar.getByRole('button',{name:'Refresh Radar',exact:true}).click();await radar.getByText('Radar refresh unavailable. Existing discoveries remain available.').waitFor();assert(await card('a').count());
 state.failRefresh=false;await radar.getByRole('button',{name:'Refresh Radar',exact:true}).click();await radar.getByRole('button',{name:'Refresh Radar',exact:true}).waitFor();
 assert.equal(await radar.getByText('FrontRun X: Partial',{exact:true}).count(),1);assert(await radar.getByText(/Radar refreshed:/).count());
 await radar.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await radar.screenshot({path:require('node:path').join(output,`radar-${width}.png`)});
 await page.locator('#project-url').fill('');
 console.log(`PASS Radar ${width}px: cached GET only, filters/search/sorts, Show more, disclosures, safe links, health/freshness, classification failure isolation, explicit refresh, research identity, no transaction, wrapping.`);
};
exports.emptyChecks=async(page,state)=>{
 state.empty=true;await page.reload();await page.getByText('No Radar discoveries loaded yet. Use Refresh Radar to scout trusted sources.').waitFor();
 state.empty=false;state.onlyUnclassified=true;await page.reload();await page.getByText(/Radar has discoveries waiting/).waitFor();await page.getByRole('heading',{name:'Signal d',exact:true}).waitFor();state.onlyUnclassified=false;await page.reload();const radar=page.locator('.captain-radar');await radar.getByText('Signal a',{exact:true}).waitFor();
 await radar.getByLabel('Search Radar').fill('no match');await radar.getByText('No discoveries match these filters.').waitFor();await radar.getByRole('button',{name:'Reset filters',exact:true}).last().click();await radar.getByText('Signal a',{exact:true}).waitFor();
};
