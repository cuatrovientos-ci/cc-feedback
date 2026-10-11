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
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
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
    const external = [], errors = [];
    page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:')) external.push(req.url()); });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.locator('#connect').count(), 0);
    const editor = page.frameLocator('#editor');
    await editor.locator('#example').click();
    await editor.locator('button[type=submit]').click();
    const draft = editor.locator('.result-text').first();
    await draft.waitFor({state:'attached'});
    assert.equal(await editor.locator('.result-text').count(), 2);
    assert.equal(await editor.locator('.btn-ai-single, #run-selected-ai').count(), 0);
    const before = await draft.inputValue();
    assert.equal((before.match(/Sugerencia:/g)||[]).length, 6);
    assert.equal((before.match(/Valoración:/g)||[]).length, 6);
    assert.match(before, /Rúbricas y banco local/);
    assert.equal(await editor.locator('details.draft-details[open]').count(), 0);
    await editor.locator('.draft-details summary').first().click();
    const gmail = editor.getByRole('button', {name:'Generar Gmail'}).first();
    assert.equal(await gmail.isDisabled(), true);
    const review = editor.locator('.draft-details input[type=checkbox]').first();
    await review.check();
    assert.equal(await gmail.isEnabled(), true);
    await draft.fill(before + ' Revisión personal.');
    assert.equal(await review.isChecked(), false);
    assert.equal(await gmail.isDisabled(), true);
    await page.evaluate(() => {
      const iframe = document.getElementById('editor');
      iframe.contentWindow.postMessage({type:'enhance-student-result', request:'stale', studentResponse:{}}, '*');
      if (iframe.contentDocument) throw new Error('Editor no aislado');
    });
    assert.equal(await draft.inputValue(), before + ' Revisión personal.');
    await editor.locator('#erase').click();
    assert.equal(await editor.locator('.result-text').count(), 0);
    assert.equal(await editor.locator('#data').inputValue(), '');
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('PASS: generación local, cero peticiones externas, sin controles IA, aislamiento, revisión, edición y borrado');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
