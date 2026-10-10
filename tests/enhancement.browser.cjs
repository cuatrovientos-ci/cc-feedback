// Run with Playwright available in NODE_PATH and optional BROWSER_EXECUTABLE.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url));
  if (!file.startsWith(root + path.sep) || !/\.(html|js|css|png)$/.test(file) || !fs.existsSync(file)) {res.writeHead(404); return res.end();}
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png'})[path.extname(file)]);
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
    const page = await browser.newPage();
    const external = [];
    page.on('request', r => { if (r.url().startsWith('https:')) external.push(r.url()); });
    await page.route('https://js.puter.com/v2/', route => route.fulfill({contentType:'text/javascript', body: `globalThis.puter={auth:{isSignedIn:()=>Boolean(globalThis.signedIn),signIn:async()=>{globalThis.signedIn=true;}},ai:{}};`}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const editor = page.frameLocator('#editor');
    await editor.locator('#example').click();
    await editor.locator('button[type=submit]').click();
    const draft = editor.locator('.result-text').first();
    await draft.waitFor({state:'attached'});
    const before = await draft.inputValue();
    assert.deepEqual(external, []);
    await page.locator('#connect').click();
    await page.locator('#connect-label').filter({hasText:'Acceder a Puter'}).waitFor();
    await page.locator('#connect').click();
    await page.locator('#connect-label').filter({hasText:'Puter conectado'}).waitFor();
    assert.deepEqual(external, ['https://js.puter.com/v2/']);
    assert.equal(await page.evaluate(() => {try {document.querySelector('iframe').contentWindow.document; return false;} catch {return true;}}), true);

    async function improve(mode) {
      await page.evaluate(mode => {
        aiLoaded = true;
        let calls = 0;
        globalThis.testCalls = 0;
        puter.ai.chat = async (messages, options) => {
          globalThis.testPayloads ??= [];
          globalThis.testPayloads.push({messages, options});
          const index = ++calls;
          globalThis.testCalls = calls;
          if (mode === 'failure') throw new Error('Test failure');
          const content = mode === 'partial' ? (index === 1 ? '**C1**: Compara dos propuestas del proyecto y justifica tu elección con una prueba práctica.' : 'Lo siento.')
            : mode === 'invalid' ? 'Lo siento.'
            : `Practica la actividad ${index} con tu equipo y registra una evidencia concreta del progreso.`;
          if (options.max_tokens !== 160 || !options.normalize || options.model !== CC_PUTER.model) throw new Error('Unexpected output budget');
          return {message:{content}, finish_reason:mode === 'truncated' ? 'length' : 'stop'};
        };
      }, mode);
      await editor.locator('.btn-ai-single').first().click();
      await page.waitForFunction(() => !busy);
      await editor.locator('#ai-batch-status').filter({hasText:/actualizada|conservan/}).waitFor();
      assert.equal(await page.evaluate(() => globalThis.testCalls), mode === 'failure' ? 1 : 6);
    }
    await improve('failure');
    assert.equal(await draft.inputValue(), before);
    assert.match(await editor.locator('.method-badge').first().innerText(), /Sin cambios/);
    await improve('invalid');
    assert.equal(await draft.inputValue(), before);
    await improve('truncated');
    assert.equal(await draft.inputValue(), before);
    await improve('partial');
    const partial = await draft.inputValue();
    assert.ok(partial.includes('Compara dos propuestas'));
    assert.match(partial, /Mixto: Puter y reglas/);
    assert.deepEqual(partial.match(/Valoración: .*/g), before.match(/Valoración: .*/g));
    assert.equal(partial.match(/Sugerencia: .*/g).filter((v,i)=>v !== before.match(/Sugerencia: .*/g)[i]).length, 1);
    await editor.locator('details.draft-details').first().evaluate(e => e.open = true);
    await editor.locator('details.draft-details').first().locator('input[type=checkbox]').check();
    assert.ok(await editor.getByRole('button',{name:'Generar Gmail', includeHidden:true}).first().isEnabled());
    await improve('all');
    const enhanced = await draft.inputValue();
    assert.equal((enhanced.match(/Sugerencia: Practica/g)||[]).length, 6);
    assert.match(enhanced, /Método de elaboración: Con IA mediante Puter/);
    assert.deepEqual(enhanced.match(/Valoración: .*/g), before.match(/Valoración: .*/g));
    assert.ok(await editor.getByRole('button',{name:'Generar Gmail', includeHidden:true}).first().isDisabled());
    await improve('all');
    assert.equal(await draft.inputValue(), enhanced);
    assert.match(await editor.locator('.method-badge').first().innerText(), /Sin cambios/);
    await editor.locator('details.draft-details').first().evaluate(e => e.open = true);
    const edited = enhanced.replace(/Sugerencia: [^\n]+/, 'Sugerencia: Consejo editado personalmente por el docente.');
    await draft.fill(edited);
    await improve('partial');
    assert.equal(await draft.inputValue(), edited);
    // Responses use text nodes/textarea, never HTML, and stale requests cannot overwrite drafts.
    await page.evaluate(() => send({type:'enhance-student-result', request:'stale', studentResponse:{}}));
    assert.equal(await draft.inputValue(), edited);
    await page.evaluate(() => {
      globalThis.testCalls = 0;
      puter.ai.chat = () => {
        globalThis.testCalls++;
        return new Promise(resolve => {globalThis.testResolveLate = resolve;});
      };
    });
    await editor.locator('.btn-ai-single').first().click();
    await page.waitForFunction(() => globalThis.testCalls === 1);
    await editor.locator('#erase').click();
    await page.waitForFunction(() => !stopping && !busy);
    assert.equal(await page.evaluate(() => globalThis.testCalls), 1);
    assert.equal(await editor.locator('.result-text').count(), 0);
    await page.evaluate(() => globalThis.testResolveLate({message:{content:'Una respuesta tardía no puede restaurar los datos borrados.'}}));
    assert.equal(await editor.locator('.result-text').count(), 0);
    const payloads = JSON.stringify(await page.evaluate(() => globalThis.testPayloads));
    for (const secret of ['Alumno1','Alumno2','example.invalid','Nota final','id:']) assert.ok(!payloads.includes(secret));
    console.log('PASS: failures, invalid/partial/full output, unchanged rubric, identical output, teacher edits, review reset, stale results');
  } finally {if(browser) await browser.close(); await new Promise(r=>server.close(r));}
})().catch(err => {console.error(err);process.exitCode=1;});
