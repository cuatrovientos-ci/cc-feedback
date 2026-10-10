const {chromium}=require('playwright');

const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');

const server=http.createServer((req,res)=>{

 const name=req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0].slice(1));

 const file=path.resolve(root,name);

 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}

 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':name.endsWith('.css')?'text/css':'text/html');

 res.end(fs.readFileSync(file));

});

const fakeWllama=String.raw`

export class Wllama {

  setCompat() {}

  getNumThreads() { return 1; }

  async loadModel() { if(window.__wllamaFailLoad) throw Error('load failed'); }

  async createChatCompletion(options) {

    const text=JSON.stringify(options.messages);

    if(text.includes('IDENTIDAD_SECRETA')||text.includes('secreto@example.es')) throw Error('identity leak');

    window.__calls=(window.__calls||0)+1;

    window.__prompt=text;

    if(window.__slow) await new Promise((resolve,reject)=>{

      const timer=setTimeout(resolve,30000);

      options.abortSignal.addEventListener('abort',()=>{ clearTimeout(timer);window.__aborted=true;reject(Error('aborted')); },{once:true});

    });

    if(window.__invalid) return {choices:[{message:{content:'{}'}}]};

    const names=[...options.messages[1].content.matchAll(/^- (.+): [0-9.]+\/10$/gm)].map(m=>m[1]);

    return {choices:[{message:{content:JSON.stringify({intro:'Propuestas para revisar con tu docente.',recomendaciones:Object.fromEntries((window.__partial?names.slice(0,1):names).map(n=>[n,'Consejo local de prueba para practicar esta competencia.'])),conclusion:'Elige una actividad para el próximo proyecto.'})}}]};

  }

  async exit() { window.__exits=(window.__exits||0)+1; }

}

`;

(async()=>{

 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;

 try{

  browser=await chromium.launch({headless:true,...(process.env.CC_BROWSER?{executablePath:process.env.CC_BROWSER}:{})});

  const context=await browser.newContext();

  let downloads=0,gmail='';const external=[];

  await context.route('**/assets/vendor/wllama-3.8.1/esm/index.js',route=>{downloads++;return route.fulfill({contentType:'text/javascript',body:fakeWllama});});

  await context.route('https://huggingface.co/**',route=>route.fulfill({contentType:'application/octet-stream',body:'fake GGUF'}));

  await context.route('https://mail.google.com/**',route=>{gmail=route.request().url();return route.abort();});

  context.on('request',r=>{if(r.url().startsWith('https://'))external.push(r.url());});

  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));

  const url=`http://127.0.0.1:${server.address().port}/`;await page.clock.install();await page.goto(url);

  const frame=page.frameLocator('#editor');assert.equal(downloads,0);

  const generate=async (text)=>{await frame.locator('#data').fill(text);await frame.locator('button[type=submit]').click();await frame.locator('article').first().waitFor();};

  await generate('1 2 3 4 5 6');

  assert.match(await frame.locator('article').innerText(),/Propuestas por reglas/);

  assert.equal(external.length,0);

  const rules=await frame.locator('textarea.result-text').inputValue();

  assert.ok(!rules.includes('apoyo de inteligencia artificial'));

  assert.ok(!rules.includes('Demuestra un desempeño'));

  await frame.locator('#erase').click();

  await frame.locator('#form-select').selectOption('qwen-cpu');

  await generate('1 2 3 4 5 6');assert.match(await frame.locator('article').innerText(),/IA no estaba cargada/);

  await frame.locator('#erase').click();

  await page.locator('#connect').click();await page.getByRole('button',{name:'IA Wllama cargada en CPU',exact:true}).waitFor();

  assert.equal(downloads,1);

  assert.equal(await page.evaluate(()=>{try{document.querySelector('iframe').contentWindow.document.body;return false;}catch{return true;}}),true);

  const networkBefore=external.length;

  await generate('Nombre\tEmail\tInnovación\tTotal\nIDENTIDAD_SECRETA\tsecreto@example.es\t7\t8');

  const card=frame.locator('article');assert.equal(await card.locator('details').getAttribute('open'),null);

  assert.match(await card.innerText(),/Con IA local/);

  assert.equal(external.length,networkBefore);

  assert.ok(!(await page.evaluate(()=>window.__prompt)).includes('IDENTIDAD_SECRETA'));

  await card.locator('summary').click();assert.ok((await card.locator('textarea').inputValue()).includes('Consejo local'));

  assert.equal(await card.locator('button').isDisabled(),true);await card.locator('input').check();

  await card.locator('textarea').fill('Texto revisado');assert.equal(await card.locator('button').isDisabled(),true);

  await card.locator('input').check();const popup=context.waitForEvent('page');await card.locator('button').click();const mail=await popup;await mail.waitForLoadState().catch(()=>{});await mail.close();

  assert.equal(new URL(gmail).searchParams.get('to'),'secreto@example.es');assert.equal(new URL(gmail).searchParams.get('body'),'Texto revisado');

  const reload=async()=>{await page.getByRole('button',{name:'Cargar IA Wllama (CPU · Opcional)',exact:true}).waitFor();await page.locator('#connect').click();await page.getByRole('button',{name:'IA Wllama cargada en CPU',exact:true}).waitFor();};

  await frame.locator('#erase').click();await reload();await page.evaluate(()=>window.__invalid=true);

  await generate('0 2 3 4 5 6');assert.match(await frame.locator('article').innerText(),/completó con reglas/);

  await frame.locator('#erase').click();await reload();await page.evaluate(()=>{window.__invalid=false;window.__partial=true;});

  await generate('1 2 3 4 5 6');assert.match(await frame.locator('article').innerText(),/Mixto: IA local y reglas/);

  await frame.locator('#erase').click();await reload();await page.evaluate(()=>{window.__partial=false;window.__slow=true;});

  await frame.locator('#data').fill('9 2 3 4 5 6');await frame.locator('button[type=submit]').click();

  await page.waitForFunction(()=>window.__calls===4);

  await frame.locator('#cancel-loading').click();

  await page.getByRole('button',{name:'Cargar IA Wllama (CPU · Opcional)',exact:true}).waitFor();

  assert.equal(await page.evaluate(()=>window.__aborted),true);assert.equal(await frame.locator('article').count(),0);

  await page.evaluate(()=>window.__slow=false);

  await page.locator('#connect').click();await page.getByRole('button',{name:'IA Wllama cargada en CPU',exact:true}).waitFor();

  await generate('1 2 3 4 5 6\n2 3 4 3 2 2');assert.equal(await frame.locator('article').count(),2);

  await page.setViewportSize({width:390,height:844});assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

  await page.clock.fastForward(16*60*1000);assert.equal(await frame.locator('article').count(),0);await page.clock.resume();

  await page.evaluate(async()=>{const c=await caches.open('another-app');await c.put('/keep',new Response('keep'));});

  await page.locator('#clean-cache').click();await page.getByText('borrado verificado',{exact:false}).waitFor();

  const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.includes('another-app'));assert.ok(!keys.includes('cc-feedback-model-v1'));

  assert.ok(external.every(u=>u.startsWith('https://huggingface.co/')||u.startsWith('https://mail.google.com/')));

  // Cancelling a pending download must return to idle and ignore late completion.
  let releaseDownload;
  await context.unroute('https://huggingface.co/**');
  const pendingDownload=new Promise(resolve=>releaseDownload=resolve);
  await context.route('https://huggingface.co/**',async route=>{await pendingDownload;await route.abort().catch(()=>{});});
  const downloadStarted=page.waitForRequest(r=>r.url().startsWith('https://huggingface.co/'));
  await page.locator('#connect').click();await downloadStarted;
  await page.locator('#unload').click();
  await page.getByRole('button',{name:'Cargar IA Wllama (CPU · Opcional)',exact:true}).waitFor();
  releaseDownload();assert.equal(await page.locator('#connect').isEnabled(),true);
  await context.unroute('**/assets/vendor/wllama-3.8.1/esm/index.js');

  const runtime=await page.evaluate(async()=>{

    const {Wllama}=await import(CC_MODEL.runtime+'?verify=1');

    const engine=new Wllama({default:CC_MODEL.wasm});

    engine.setCompat({worker:CC_MODEL.compatWorker,wasm:CC_MODEL.compatWasm},'all');

    const binaries=await Promise.all([CC_MODEL.wasm,CC_MODEL.compatWasm].map(async url=>{

      const response=await fetch(url);return response.ok && Array.from(new Uint8Array(await response.arrayBuffer()).slice(0,4)).join(',')==='0,97,115,109';

    }));

    await engine.exit();return binaries.every(Boolean);

  });assert.equal(runtime,true);

  assert.deepEqual(errors,[]);

  console.log('PASS: rules, AI, fallback labels, isolation, review/Gmail, abort and reload, batches, inactivity, scoped cache and mobile. Wllama simulated.');

 }finally{if(browser)await browser.close();server.close();}

})().catch(e=>{console.error(e);process.exitCode=1;});
