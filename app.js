"use strict";
const frame = document.getElementById('editor');
const connection = document.getElementById('connection');
const button = document.getElementById('connect');
const label = document.getElementById('connect-label');
const spinner = document.getElementById('connect-spinner');
const unload = document.getElementById('unload');

let wllama = null, ready = false, busy = false, active = null, abortGeneration = null, loadTimer = null;

const MODELS = {
  'qwen-0.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    name: 'Qwen 2.5 0.5B (398 MB)'
  },
  'qwen-1.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    name: 'Qwen 2.5 1.5B (1.1 GB)'
  }
};

let selectedModel = 'qwen-0.5b';

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

function error(code, detail = '') {
  const request = active;
  stop();
  if (request) send({type: 'failure', request, code});
  connection.hidden = false;
  const msg = ({
    unsupported: 'Este navegador o equipo no soporta WebAssembly. Usa un navegador moderno actualizado.',
    timeout: 'La carga o descarga del modelo ha superado diez minutos. Comprueba la conexión y vuelve a intentarlo.',
    model: 'No se pudo cargar o ejecutar el modelo local con Wllama. Comprueba la conexión y la memoria disponible; cierra otras pestañas y reintenta.',
    cancelled: 'Generación cancelada por el usuario.'
  })[code] || 'No se pudo completar la generación local con Wllama. Vuelve a cargar el modelo.';
  connection.textContent = detail ? `${msg} [Detalle: ${detail}]` : msg;
}

async function downloadModelToMemoryBlob(url, modelName) {
  state(`Descargando en RAM ${modelName}…`, true);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Error HTTP al descargar modelo: ${resp.status} ${resp.statusText}`);
  const total = Number(resp.headers.get('content-length') || 0);
  const reader = resp.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const pct = total ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0;
    state(`Descargando en RAM ${modelName}: ${pct} %`, true);
  }
  return new Blob(chunks);
}

function extractJsonArray(raw) {
  let text = String(raw || '').trim();
  // 1. Extraer bloque markdown ```json ... ``` si existe
  const codeMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (codeMatch) text = codeMatch[1].trim();

  // 2. Extraer array JSON [ ... ]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }

  // 3. Si el modelo devolvió un único objeto { ... } en vez de array, envolverlo
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return `[${text.slice(firstBrace, lastBrace + 1)}]`;
  }
  return text;
}

button.addEventListener('click', async () => {
  connection.hidden = true;
  if (!window.WebAssembly || !window.isSecureContext) {
    error('unsupported');
    return;
  }
  await stop();
  state('Iniciando runtime Wllama (WASM)…', true);
  try {
    loadTimer = setTimeout(() => { error('timeout', 'Tiempo de espera agotado'); }, 600000);

    const { Wllama } = await import('https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js');

    const pathConfig = {
      default: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/src/wasm/wllama.wasm'
    };

    wllama = new Wllama(pathConfig);
    wllama.setCompat({
      worker: 'https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.8.1/wasm/wllama.js',
      wasm: 'https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.8.1/wasm/wllama.wasm'
    }, 'all');

    unload.disabled = false;

    const cfg = MODELS[selectedModel] || MODELS['qwen-0.5b'];
    state(`Conectando con ${cfg.name}…`, true);

    try {
      await wllama.loadModelFromUrl(cfg.url, {
        n_ctx: 2048,
        progressCallback: ({ loaded, total }) => {
          const pct = total ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0;
          state(`Descargando ${cfg.name}: ${pct} %`, true);
        }
      });
    } catch (cacheErr) {
      const errText = String(cacheErr?.message || cacheErr);
      if (errText.includes('space') || errText.includes('write') || errText.includes('FileSystem') || errText.includes('Quota')) {
        console.warn('Almacenamiento OPFS sin cuota suficiente. Fallback a descarga directa en memoria RAM:', errText);
        const blob = await downloadModelToMemoryBlob(cfg.url, cfg.name);
        state(`Cargando ${cfg.name} en el motor…`, true);
        await wllama.loadModel([blob], { n_ctx: 2048 });
      } else {
        throw cacheErr;
      }
    }

    clearTimeout(loadTimer);
    ready = true;
    state(`Modelo listo: ${cfg.name}`);
  } catch (err) {
    console.error('Error al inicializar Wllama:', err);
    error('model', err?.message || String(err));
  }
});

unload.addEventListener('click', async () => {
  const request = active;
  await stop();
  if (request) send({type: 'failure', request, code: 'cancelled'});
  connection.hidden = false;
  connection.textContent = 'Modelo Wllama descargado de memoria.';
});

frame.addEventListener('load', () => { if (busy) stop(); });
window.addEventListener('pagehide', stop);

window.addEventListener('message', async ({source, origin, data}) => {
  if (source !== frame.contentWindow || origin !== 'null') return;
  if (data?.type === 'model-select' && typeof data.model === 'string') {
    if (MODELS[data.model]) selectedModel = data.model;
    return;
  }
  if (data?.type === 'cancel') {
    if (busy && abortGeneration) abortGeneration();
    busy = false;
    active = null;
    return;
  }
  if (data?.type !== 'generate' || typeof data.request !== 'string') return;
  if (data.model && MODELS[data.model]) {
    selectedModel = data.model;
  }
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

      const promptContent = Feedback.prompt([record], rubrics);

      const response = await wllama.createChatCompletion({
        messages: [
          { role: 'system', content: 'Eres un evaluador educativo constructivo. Tu respuesta debe ser ÚNICAMENTE un array JSON válido sin ningún texto explicativo previo ni posterior.' },
          { role: 'user', content: promptContent }
        ],
        max_tokens: 1536,
        temperature: 0.2,
        onData: () => {
          if (aborted || active !== request) return;
          send({type: 'progress', request, stage: 'receiving', current: i + 1, total: records.length});
        }
      });

      if (aborted || active !== request) throw new Error('aborted');
      const raw = response?.choices?.[0]?.message?.content || '';
      console.log('Salida sin procesar de Wllama (fila ' + (i + 1) + '):', raw);
      const cleanJson = extractJsonArray(raw);
      result.push(...Feedback.response(cleanJson, [record]));
    }

    if (active === request) {
      send({type: 'result', request, result: Feedback.response(JSON.stringify(result), records)});
    }
  } catch (err) {
    console.error('Error detallado en generación Wllama:', err);
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
