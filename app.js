"use strict";
const frame = document.getElementById('editor');
const connection = document.getElementById('connection');
const button = document.getElementById('connect');
const label = document.getElementById('connect-label');
const spinner = document.getElementById('connect-spinner');
const unload = document.getElementById('unload');
let worker = null, ready = false, busy = false, active = null, loadTimer;
function state(text, working = false) {
  label.textContent = text; spinner.hidden = !working; button.disabled = working || ready;
  button.setAttribute('aria-busy', String(working)); unload.disabled = !worker;
}
function send(message) { frame.contentWindow.postMessage(message, '*'); }
function stop() {
  clearTimeout(loadTimer); if (worker) worker.terminate();
  worker = null; ready = false; busy = false; active = null;
  state('Cargar modelo local');
}
function error(code) {
  const request = active;
  stop();
  if (request) send({type: 'failure', request, code});
  connection.hidden = false;
  connection.textContent = ({unsupported: 'Este navegador o equipo no ofrece WebGPU. Usa un navegador compatible con aceleración gráfica.',
    timeout: 'La carga ha superado diez minutos. Comprueba la conexión y vuelve a intentarlo.',
    model: 'No se pudo cargar o ejecutar el modelo local. Comprueba la conexión y la memoria disponible; cierra otras pestañas y reintenta.'})[code] || 'No se pudo completar la generación local. Vuelve a cargar el modelo.';
}
button.addEventListener('click', async () => {
  connection.hidden = true;
  if (!navigator.gpu || !window.isSecureContext) { error('unsupported'); return; }
  stop(); state('Descargando y preparando modelo…', true);
  try {
    const current = new Worker('llm-worker.js', {type: 'module'}); worker = current; unload.disabled = false;
    loadTimer = setTimeout(() => { if (worker === current) error('timeout'); }, 600000);
    current.onerror = () => { if (worker === current) error('model'); };
    current.onmessage = ({data}) => {
      if (worker !== current) return;
      if (data.type === 'load-progress') {
        const n = Math.max(0, Math.min(100, Math.round(Number(data.progress || 0) * 100)));
        state(`Preparando modelo local: ${n} %`, true); return;
      }
      if (data.type === 'ready') { clearTimeout(loadTimer); ready = true; state('Modelo local listo'); return; }
      if (data.type === 'load-error') { error(data.code); return; }
      if (!active || data.request !== active) return;
      if (data.type === 'result' || data.type === 'failure') { busy = false; active = null; }
      send(data);
    };
    current.postMessage({type: 'load'});
  } catch { error('model'); }
});
unload.addEventListener('click', () => {
  const request = active; stop();
  if (request) send({type: 'failure', request, code: 'cancelled'});
  connection.hidden = false; connection.textContent = 'Modelo descargado de memoria. Los archivos del modelo pueden seguir en la caché del navegador.';
});
frame.addEventListener('load', () => { if (busy) stop(); });
window.addEventListener('pagehide', stop);
window.addEventListener('message', ({source, origin, data}) => {
  if (source !== frame.contentWindow || origin !== 'null') return;
  if (data?.type === 'cancel') { if (busy) stop(); return; }
  if (data?.type !== 'generate' || typeof data.request !== 'string') return;
  if (!ready || busy) { send({type: 'failure', request: data.request, code: ready ? 'busy' : 'not_connected'}); return; }
  try {
    const records = Feedback.validateRecords(data.records);
    if (records.length > 10) throw new Error('Batch too large');
    busy = true; active = data.request;
    worker.postMessage({type: 'generate', request: active, records});
  } catch { send({type: 'failure', request: data.request, code: 'invalid_input'}); }
});
state('Cargar modelo local');
