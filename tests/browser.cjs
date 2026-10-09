const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const files=new Set(['index.html','editor.html','style.css','shell.css','core.js','app.js','editor.js','rubricas.js','privacidad.html','assets/bootstrap.min.css']);
const server=http.createServer((req,res)=>{
 const name=req.url==='/'?'index.html':req.url.slice(1);
 if(!files.has(name)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(path.join(root,name)));
});
const fakeWllama=String.raw`
export const WasmCompatFromCDN = {};
export class Wllama {
  constructor(config) {}
  async loadModelFromHF(repo, file, options) {
    if (window.__wllamaFailLoad) throw new Error('load failed');
    options?.progressCallback?.({ loaded: 50, total: 100 });
  }
  async createChatCompletion(options) {
    const text = options.messages[0].content;
    if (text.includes('IDENTIDAD_SECRETA') || text.includes('secreto@example.es')) throw Error('identity leak');
    const records = JSON.parse(text.split('\nRegistros: ')[1]);
    if (records.length !== 1) throw Error('invalid batch');
    const r = records[0];
    if (r.competencias[0].valor === 9) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (r.competencias[0].valor === 0) return { choices: [{ message: { content: '{}' } }] };
    return {
      choices: [{
        message: {
          content: JSON.stringify([{
            id: r.id,
            intro: 'Texto local de prueba',
            competencias_evaluadas: r.competencias.map(c => ({
              nombre_competencia: c.competencia,
              rubrica: 'Valoración local',
              recomendaciones: 'Consejo local de prueba'
            })),
            conclusion: 'Cierre local'
          }])
        }
      }]
    };
  }
  async exit() {}
}
`;

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CC_BROWSER?{executablePath:process.env.CC_BROWSER}:{})});
  const context=await browser.newContext();
  let downloads=0,gmail='';const external=[];
  await context.route('https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js',route=>{downloads++;return route.fulfill({contentType:'text/javascript',body:fakeWllama});});
  await context.route('https://mail.google.com/**',route=>{gmail=route.request().url();return route.abort();});
  context.on('request',r=>{if(r.url().startsWith('https://'))external.push(r.url());});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/`;await page.clock.install();await page.goto(url);
  const frame=page.frameLocator('#editor');assert.equal(downloads,0);
  await frame.locator('#data').fill('1 2 3 4 5 6');await frame.locator('button[type=submit]').click();
  await frame.getByText('[GENERACION_NOT_CONNECTED]',{exact:false}).waitFor();
  assert.equal(await frame.locator('#data').inputValue(),'1 2 3 4 5 6');

  await page.locator('#connect').click();await page.getByRole('button',{name:'Modelo listo:',exact:false}).waitFor();
  assert.equal(downloads,1);
  assert.equal(await page.evaluate(()=>{try{document.querySelector('iframe').contentWindow.document.body;return false;}catch{return true;}}),true);

  await frame.locator('#data').fill('Nombre\tEmail\tInnovación\tTotal\nIDENTIDAD_SECRETA\tsecreto@example.es\t7\t8');
  await frame.locator('button[type=submit]').click();await frame.locator('article').waitFor();
  const card=frame.locator('article');assert.equal(await card.locator('details').getAttribute('open'),null);
  await card.locator('summary').click();assert.ok((await card.locator('textarea').inputValue()).includes('Consejo local'));
  assert.equal(await card.locator('button').isDisabled(),true);await card.locator('input').check();
  await card.locator('textarea').fill('Texto revisado');assert.equal(await card.locator('button').isDisabled(),true);
  await card.locator('input').check();const popup=context.waitForEvent('page');await card.locator('button').click();const mail=await popup;await mail.waitForLoadState().catch(()=>{});await mail.close();
  assert.equal(new URL(gmail).searchParams.get('to'),'secreto@example.es');
  assert.equal(new URL(gmail).searchParams.get('body'),'Texto revisado');

  await frame.locator('#erase').click();await frame.locator('#data').fill('1 2 3 4 5 6\n2 3 4 3 2 2');
  await frame.locator('button[type=submit]').click();await frame.locator('article').nth(1).waitFor();assert.equal(await frame.locator('article').count(),2);
  await page.setViewportSize({width:390,height:844});assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.CC_SCREENSHOTS){fs.mkdirSync(process.env.CC_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.CC_SCREENSHOTS,'wllama-mobile.png'),fullPage:true});}

  await frame.locator('#erase').click();await frame.locator('#data').fill('0 2 3 4 5 6');await frame.locator('button[type=submit]').click();await frame.getByText('[GENERACION_INVALID_RESPONSE]',{exact:false}).waitFor();assert.equal(await frame.locator('article').count(),0);

  await frame.locator('#data').fill('9 2 3 4 5 6');await frame.locator('button[type=submit]').click();await frame.locator('#loading-overlay').waitFor();await frame.locator('#cancel-loading').click();
  await page.getByRole('button',{name:'Cargar modelo Wllama',exact:true}).waitFor();assert.equal(await frame.locator('#data').inputValue(),'');

  await page.locator('#connect').click();await page.getByRole('button',{name:'Modelo listo:',exact:false}).waitFor();
  await frame.locator('#data').fill('1 2 3 4 5 6');await frame.locator('button[type=submit]').click();await frame.locator('article').waitFor();
  await page.clock.fastForward(16*60*1000);assert.equal(await frame.locator('article').count(),0);

  await page.locator('#unload').click();
  await page.evaluate(()=>window.__wllamaFailLoad=true);
  await page.locator('#connect').click();
  await page.getByText('No se pudo cargar o ejecutar',{exact:false}).waitFor();

  assert.ok(external.every(u=>u.startsWith('https://cdn.jsdelivr.net/')||u.startsWith('https://mail.google.com/')));
  assert.deepEqual(errors,[]);
  console.log('PASS: real worker with simulated Wllama module; isolation, local results, Gmail review, batches, errors, cancellation/reload, idle cleanup and mobile layout.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
