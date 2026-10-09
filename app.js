"use strict";
const frame = document.getElementById('editor');
const connection = document.getElementById('connection');
const button = document.getElementById('connect');
const label = document.getElementById('connect-label');
const spinner = document.getElementById('connect-spinner');
const unload = document.getElementById('unload');

let wllama = null, ready = false, busy = false, active = null, abortGeneration = null, loadTimer = null;

const MODELS = {
  'qwen-1.5b': { repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', name: 'Qwen 2.5 1.5B' },
  'qwen-0.5b': { repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', name: 'Qwen 2.5 0.5B' }
};

function state(text, working = false) {
  label.textContent = text;
  spinner.hidden = !working;
  button.disabled = working || ready;
  button.setAttribute('aria-busy', String(working));
  unload.disabled = !wllama;
}

function send(message) {
  frame.contentWindow.postMessage(message, '*');
}

async function stop() {
  clearTimeout(loadTimer);
  if (abortGeneration) {
    try { abortGeneration(); } catch {}
    abortGeneration = null;
  }
  if (wllama) {
    try { await wllama.exit(); } catch {}
    wllama = null;
  }
  ready = false;
  busy = false;
  active = null;
  state('Cargar modelo Wllama');
}

function error(code) {
  const request = active;
  stop();
  if (request) send({type: 'failure', request, code});
  connection.hidden = false;
  connection.textContent = ({
    unsupported: 'Este navegador o equipo no soporta WebAssembly. Usa un navegador moderno actualizado.',
    timeout: 'La carga o descarga del modelo ha superado diez minutos. Comprueba la conexión y vuelve a intentarlo.',
    model: 'No se pudo cargar o ejecutar el modelo local con Wllama. Comprueba la conexión y la memoria disponible; cierra otras pestañas y reintenta.',
    cancelled: 'Generación cancelada por el usuario.'
  })[code] || 'No se pudo completar la generación local con Wllama. Vuelve a cargar el modelo.';
}

button.addEventListener('click', async () => {
  connection.hidden = true;
  if (!window.WebAssembly || !window.isSecureContext) {
    error('unsupported');
    return;
  }
  await stop();
  state('Descargando Wllama (WASM)…', true);
  try {
    loadTimer = setTimeout(() => { error('timeout'); }, 600000);

    const { Wllama } = await import('https://cdn.jsdelivr.net/npm/@wllama/wllama@2.2.1/esm/index.js');
    const { default: WasmFromCDN } = await import('https://cdn.jsdelivr.net/npm/@wllama/wllama@2.2.1/esm/wasm-from-cdn.js');

    wllama = new Wllama(WasmFromCDN);
    unload.disabled = false;

    // Modelo predeterminado: Qwen 2.5 1.5B Instruct GGUF Q4_K_M
    const modelKey = 'qwen-1.5b';
    const cfg = MODELS[modelKey];

    await wllama.loadModelFromHF(cfg.repo, cfg.file, {
      n_ctx: 4096,
      progressCallback: ({ loaded, total }) => {
        const pct = total ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0;
        state(`Descargando ${cfg.name}: ${pct} %`, true);
      }
    });

    clearTimeout(loadTimer);
    ready = true;
    state('Modelo Wllama listo');
  } catch {
    error('model');
  }
});

unload.addEventListener('click', async () => {
  const request = active;
  await stop();
  if (request) send({type: 'failure', request, code: 'cancelled'});
  connection.hidden = false;
  connection.textContent = 'Modelo Wllama descargado de memoria. Los archivos pueden permanecer en la caché del navegador.';
});

frame.addEventListener('load', () => { if (busy) stop(); });
window.addEventListener('pagehide', stop);

window.addEventListener('message', async ({source, origin, data}) => {
  if (source !== frame.contentWindow || origin !== 'null') return;
  if (data?.type === 'cancel') {
    if (busy && abortGeneration) abortGeneration();
    busy = false;
    active = null;
    return;
  }
  if (data?.type !== 'generate' || typeof data.request !== 'string') return;
  if (!ready || !wllama || busy) {
    send({type: 'failure', request: data.request, code: ready ? 'busy' : 'not_connected'});
    return;
  }

  const request = data.request;
  try {
    const records = Feedback.validateRecords(data.records);
    if (records.length > 10) throw new Error('Batch too large');

    busy = true;
    active = request;
    let aborted = false;
    abortGeneration = () => { aborted = true; };
    const result = [];

    for (let i = 0; i < records.length; i++) {
      if (aborted || active !== request) throw new Error('aborted');
      const record = records[i];
      const groups = {
        'Innovación y emprendimiento': ['Innovación', 'Emprendimiento'],
        'Capacidad comunicativa': ['Comunicación oral', 'Comunicación escrita'],
        'Autonomía y responsabilidad': ['Autonomía', 'Responsabilidad']
      };
      const names = new Set(record.competencias.flatMap(c => groups[c.competencia] || [c.competencia]));
      const rubrics = (globalThis.LOCAL_RUBRICS || []).filter(r => names.has(r.name));

      send({type: 'progress', request, stage: 'waiting', current: i + 1, total: records.length});

      const promptText = 'Sé conciso: introducción y cierre de una frase; valoración y recomendación de una o dos frases por competencia.\n' + Feedback.prompt([record], rubrics);

      const raw = await wllama.createChatCompletion([
        { role: 'user', content: promptText }
      ], {
        nPredict: 1536,
        sampling: { temp: 0.3 },
        onNewToken: (token, piece, currentText, { abortSignal }) => {
          if (aborted || active !== request) {
            abortSignal();
            return;
          }
          send({type: 'progress', request, stage: 'receiving', current: i + 1, total: records.length});
        }
      });

      if (aborted || active !== request) throw new Error('aborted');
      result.push(...Feedback.response(raw, [record]));
    }

    if (active === request) {
      send({type: 'result', request, result: Feedback.response(JSON.stringify(result), records)});
    }
  } catch {
    if (active === request) {
      send({type: 'failure', request, code: 'invalid_response'});
    }
  } finally {
    if (active === request) {
      busy = false;
      active = null;
      abortGeneration = null;
    }
  }
});

state('Cargar modelo Wllama');
