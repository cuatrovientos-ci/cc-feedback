"use strict";
const frame = document.getElementById('editor');
const connection = document.getElementById('connection');
const button = document.getElementById('connect');
const label = document.getElementById('connect-label');
const spinner = document.getElementById('connect-spinner');
const unload = document.getElementById('unload');
const cleanCache = document.getElementById('clean-cache');

let wllama = null, aiLoaded = false, busy = false, active = null;
let loadingModel = false, stopping = null, loadController = null, generationController = null;
let loadTask = null, generationTask = null, loadTimer = null, lastRowSeconds = null;
const config = globalThis.CC_MODEL;
let loadedMode = 'cpu', offloadedLayers = 0;
function readyLabel() { return loadedMode === 'gpu' ? 'IA Wllama lista (GPU activa)' : 'IA Wllama lista (CPU)'; }
function backendLabel() {
  return loadedMode === 'gpu' ? (offloadedLayers > 0 ? `GPU activa (${offloadedLayers} capas transferidas)` : 'GPU activa') : 'CPU (sin aceleración GPU)';
}
async function checkWebGPUAvailable() {
  if (!isSecureContext || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if (!adapter || adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter) return false;
    const device = await adapter.requestDevice();
    device.destroy();
    return true;
  } catch {
    return false;
  }
}

function state(text, working = false) {
  label.textContent = text;
  spinner.hidden = !working;
  button.disabled = working || aiLoaded || busy || Boolean(stopping);
  button.setAttribute('aria-busy', String(working));
  unload.disabled = !(wllama || loadingModel || busy);
  cleanCache.disabled = loadingModel || busy || Boolean(stopping);
}
function send(message) { frame.contentWindow.postMessage(message, '*'); }

async function stop() {
  if (stopping) return stopping;
  clearTimeout(loadTimer);
  active = null;
  loadController?.abort();
  generationController?.abort();
  stopping = (async () => {
    // Wait until abort has been observed before releasing or reusing the engine.
    await Promise.allSettled([loadTask, generationTask].filter(Boolean));
    const engine = wllama;
    wllama = null;
    if (engine) { try { await engine.exit(); } catch {} }
    aiLoaded = false; busy = false; loadingModel = false;
  })();
  state('Deteniendo…', true);
  try { await stopping; } finally {
    stopping = null;
    state('Cargar IA Wllama (GPU/CPU auto)');
  }
}

async function clearStorageQuota() {
  if (!globalThis.caches) throw new Error('Este navegador no permite gestionar la caché.');
  // This app only owns its explicitly named cache. Never clear an entire origin.
  await caches.delete(config.cache);
  if ((await caches.keys()).includes(config.cache)) throw new Error('No se pudo verificar el borrado.');
}

function getRubricMatch(compName, score) {
  const rubrics = globalThis.LOCAL_RUBRICS || [];
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const target = norm(compName);

  let found = rubrics.find(r => norm(r.name) === target);
  if (!found) {
    if (target.includes('innova')) found = rubrics.find(r => norm(r.name).includes('innovacion'));
    else if (target.includes('emprend')) found = rubrics.find(r => norm(r.name).includes('emprendimiento'));
    else if (target.includes('comunica')) found = rubrics.find(r => norm(r.name).includes('comunicacion oral'));
    else if (target.includes('equipo')) found = rubrics.find(r => norm(r.name).includes('equipo'));
    else if (target.includes('digital')) found = rubrics.find(r => norm(r.name).includes('digital'));
    else if (target.includes('entorno') || target.includes('adaptaci')) found = rubrics.find(r => norm(r.name).includes('entorno'));
    else if (target.includes('autonom')) found = rubrics.find(r => norm(r.name).includes('autonomia'));
    else if (target.includes('responsa')) found = rubrics.find(r => norm(r.name).includes('responsabilidad'));
  }

  const val = Number(score) || 0;
  let level = 1;
  if (val >= 8.5) level = 4;
  else if (val >= 7.0) level = 3;
  else if (val >= 5.0) level = 2;
  else level = 1;

  const levelIdx = level - 1;
  const descriptor = (found && Array.isArray(found.levels) && found.levels[levelIdx])
    ? found.levels[levelIdx]
    : `Nivel ${level}: Desempeño observado en ${compName} con calificación ${score}/10.`;

  return { level, descriptor };
}

function getRubricDescriptor(compName, score) {
  return getRubricMatch(compName, score).descriptor;
}

function getPedagogicalAdvice(compName, score) {
  const c = compName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const exercises = [
    [/innova|emprend/, 'Propón dos soluciones a un problema del proyecto y compara sus ventajas antes de elegir una.'],
    [/equipo/, 'Acuerda con el equipo una tarea, un plazo y una forma de revisar juntos su cumplimiento.'],
    [/comunica/, 'Prepara una exposición con introducción, dos ideas principales y cierre; solicita una sugerencia de mejora.'],
    [/digital/, 'Contrasta una fuente digital y comprueba el resultado de una herramienta antes de incorporarlo al trabajo.'],
    [/entorno|adaptaci/, 'Ante un cambio del proyecto, anota dos alternativas y explica cómo adaptarías tu planificación.'],
    [/autonom|responsa/, 'Planifica las entregas con una lista semanal y reserva un momento para revisar tus avances.']
  ];
  const action = exercises.find(([pattern]) => pattern.test(c))?.[1]
    || `Elige con tu docente una actividad de ${compName} y acuerda cómo comprobar el progreso.`;
  return `${action} Ajusta la dificultad y los apoyos con tu docente según las evidencias de aprendizaje.`;
}

function isInvalidRecommendation(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim().toLowerCase();
  if (t.length < 20) return true;
  if (
    t.includes('tu consejo') ||
    t.includes('consejo formativo') ||
    t.includes('1-2 frases') ||
    t.includes('1 frase') ||
    t.includes('sugerencia práctica') ||
    t.includes('sugerencia de mejora') ||
    t.includes('sugerencia formativa') ||
    t.includes('contextualización') ||
    t.includes('motivadora') ||
    t.includes('saludo') ||
    t.includes('aquí') ||
    t.includes('...')
  ) {
    return true;
  }
  return false;
}

function extractJsonBlock(raw) {
  let text = String(raw || '').trim();
  const codeMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (codeMatch) text = codeMatch[1].trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }

  return text;
}

function adaptModelOutputToFeedback(raw, record, provenance) {
  let parsed = null;
  const clean = extractJsonBlock(raw);
  try {
    parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) parsed = parsed[0];
  } catch {
    try {
      const match = /\{[\s\S]*\}/.exec(raw);
      if (match) parsed = JSON.parse(match[0]);
    } catch {}
  }

  if (!parsed || typeof parsed !== 'object') {
    parsed = {};
  }

  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const recMap = new Map();
  // Formato directo: { "Competencia": "Sugerencia..." }
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string' && v.trim()) recMap.set(norm(k), v.trim());
  }
  // Formato anidado: { recomendaciones: { "Competencia": "Sugerencia..." } }
  if (parsed.recomendaciones && typeof parsed.recomendaciones === 'object' && !Array.isArray(parsed.recomendaciones)) {
    for (const [k, v] of Object.entries(parsed.recomendaciones)) {
      if (typeof v === 'string' && v.trim()) recMap.set(norm(k), v.trim());
    }
  }
  // Formato array: { competencias_evaluadas: [ { nombre_competencia, recomendaciones } ] }
  const rawComps = Array.isArray(parsed.competencias_evaluadas)
    ? parsed.competencias_evaluadas
    : (Array.isArray(parsed.competencias) ? parsed.competencias : []);
  for (const c of rawComps) {
    const key = norm(c?.nombre_competencia || c?.competencia || c?.nombre || '');
    const val = c?.recomendaciones || c?.recomendacion || c?.sugerencias || c?.sugerencia || '';
    if (key && val) recMap.set(key, String(val).trim());
  }

  // Soporte para formato compacto TOON / líneas clave-valor: "Competencia: Sugerencia"
  const rawLines = String(raw || '').split('\n');
  for (const line of rawLines) {
    const trimmed = line.replace(/^[-*•\d.)\s]+/, '').trim();
    if (!trimmed) continue;
    const sepIdx = trimmed.indexOf(':') !== -1 ? trimmed.indexOf(':') : trimmed.indexOf('|');
    if (sepIdx > 0) {
      const k = trimmed.slice(0, sepIdx).trim();
      const v = trimmed.slice(sepIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && v && v.length >= 10) {
        recMap.set(norm(k), v);
      }
    }
  }

  let aiParts = 0, ruleParts = 0;
  const fixedCompetencias = record.competencias.map(recComp => {
    const expectedNorm = norm(recComp.competencia);
    
    let recText = '';
    for (const [k, v] of recMap.entries()) {
      if (k === expectedNorm || k.includes(expectedNorm) || expectedNorm.includes(k)) {
        recText = v;
        break;
      }
    }

    if (isInvalidRecommendation(recText)) {
      recText = getPedagogicalAdvice(recComp.competencia, recComp.valor);
      ruleParts++;
    } else { aiParts++; }

    // Match de rúbrica asignado 100% por programación de forma determinista
    const rubricText = getRubricDescriptor(recComp.competencia, recComp.valor);

    return {
      nombre_competencia: recComp.competencia,
      rubrica: String(rubricText).slice(0, 3000),
      recomendaciones: String(recText).slice(0, 3000)
    };
  });

  const intro = 'A continuación se detalla la retroalimentación formativa de las competencias evaluadas en este periodo:';
  const conclusion = 'Revisa estas propuestas con tu docente y elige un objetivo concreto para el próximo proyecto.';
  provenance.method = aiParts ? (ruleParts ? 'mixed' : 'ai') : 'rules';

  return [{
    id: record.id,
    intro,
    competencias_evaluadas: fixedCompetencias,
    conclusion
  }];
}

function buildSuggestionPrompt(record) {
  const compLines = record.competencias.map(c => {
    const match = getRubricMatch(c.competencia, c.valor);
    const focus = match.level <= 2 ? 'acordar pautas y apoyos' : (match.level === 3 ? 'mayor iniciativa y autonomía' : 'liderazgo y reto de ampliación');
    return `- ${c.competencia} (${c.valor}/10, Nivel ${match.level}): objetivo ${focus}`;
  }).join('\n');

  return `Como docente de Formación Profesional en Cuatrovientos, redacta un consejo de mejora pedagógico, constructivo y motivador de 1 frase (12 a 16 palabras) para cada competencia:
${compLines}

Ejemplos de estilo:
- Acuerda con tu equipo una tarea semanal con plazo y revisad juntos su entrega.
- Contrasta dos herramientas digitales antes de decidir y compara sus ventajas en el trabajo.

Escribe directamente una línea por competencia (sin texto introductorio):
${record.competencias.map(c => `${c.competencia}: `).join('\n')}`;
}

async function modelBlob(signal) {
  let cache;
  try {
    cache = await caches.open(config.cache);
    const stored = await cache.match(config.url);
    if (stored) return await stored.blob();
  } catch { /* Storage may be disabled; memory-only loading remains available. */ }
  signal.throwIfAborted();
  const response = await fetch(config.url, {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
  if (!response.ok) throw new Error(`Descarga HTTP ${response.status}`);
  const reader = response.body.getReader(), chunks = [];
  const total = Number(response.headers.get('content-length') || 0);
  let loaded = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    signal.throwIfAborted(); chunks.push(value); loaded += value.length;
    state(total ? `Descargando modelo: ${Math.round(100 * loaded / total)} %` : `Descargando: ${Math.round(loaded / 1048576)} MB`, true);
  }
  signal.throwIfAborted();
  const blob = new Blob(chunks);
  try {
    if (cache) {
      try { await cache.delete(config.url); } catch {}
      await cache.put(config.url, new Response(blob));
    }
  } catch {
    connection.hidden = false;
    connection.className = 'alert alert-info mt-2';
    connection.textContent = 'Aviso: La caché en disco está llena. El modelo se carga directamente en memoria RAM.';
  }
  signal.throwIfAborted();
  return blob;
}

button.addEventListener('click', async () => {
  if (loadingModel || busy || stopping || aiLoaded) return;
  loadingModel = true; connection.hidden = true;
  const controller = new AbortController(); loadController = controller;
  state('Iniciando Wllama…', true);
  loadTimer = setTimeout(() => controller.abort(new Error('Tiempo de carga agotado.')), 600000);
  loadTask = (async () => {
    const {Wllama} = await import(config.runtime);
    controller.signal.throwIfAborted();
    state('Detectando aceleración GPU…', true);
    const hasGPU = await checkWebGPUAvailable();
    loadedMode = hasGPU ? 'gpu' : 'cpu';
    offloadedLayers = 0;
    lastRowSeconds = null;
    controller.signal.throwIfAborted();
    const captureLog = (...args) => {
      // Only inspect backend initialization messages; never persist prompts or outputs.
      const line = args.filter(v => typeof v === 'string').join(' ');
      const match = /offloaded\s+(\d+)\s*\/\s*\d+\s+layers/i.exec(line);
      if (match) offloadedLayers = Number(match[1]);
    };
    const engine = new Wllama({default: config.wasm}, {logger:{debug:captureLog,log:captureLog,info:captureLog,warn:captureLog,error:captureLog}}); wllama = engine;
    if (!globalThis.crossOriginIsolated) {
      engine.setCompat({worker: config.compatWorker, wasm: config.compatWasm}, 'all');
    }
    const blob = await modelBlob(controller.signal);
    controller.signal.throwIfAborted();
    state('Preparando modelo en memoria…', true);
    const numThreads = navigator.hardwareConcurrency || 4;
    try {
      await engine.loadModel([blob], {n_ctx: 512, n_threads: numThreads, n_gpu_layers: loadedMode === 'gpu' ? 99999 : 0});
    } catch (err) {
      if (loadedMode === 'gpu' && !controller.signal.aborted) {
        loadedMode = 'cpu';
        await engine.loadModel([blob], {n_ctx: 512, n_threads: numThreads, n_gpu_layers: 0});
      } else {
        throw err;
      }
    }
    controller.signal.throwIfAborted();
    aiLoaded = true;
    connection.hidden = false;
    connection.className = 'alert alert-success mt-2';
    connection.textContent = `Modelo Qwen 0.5B listo. ${backendLabel()}.`;
  })();
  try { await loadTask; }
  catch {
    if (!stopping) {
      connection.hidden = false; connection.className = 'alert alert-warning mt-2';
      connection.textContent = controller.signal.aborted ? 'Carga interrumpida o tiempo agotado.' : 'No se pudo cargar el modelo en este navegador.';
      const engine = wllama; wllama = null;
      if (engine) { try { await engine.exit(); } catch {} }
      aiLoaded = false;
    }
  } finally {
    clearTimeout(loadTimer); loadingModel = false; loadTask = null;
    if (!stopping) state(aiLoaded ? readyLabel() : 'Cargar IA Wllama (GPU/CPU auto)');
  }
});

cleanCache.addEventListener('click', async () => {
  if (busy || loadingModel || stopping) return;
  await stop(); state('Limpiando caché del modelo…', true); cleanCache.disabled = true;
  try {
    await clearStorageQuota();
    connection.textContent = 'Caché de esta versión eliminada y borrado verificado. Las cachés de versiones anteriores no se modifican.';
  } catch { connection.textContent = 'No se pudo verificar el borrado de la caché. Revisa el almacenamiento del sitio en el navegador.'; }
  finally { connection.hidden = false; state('Cargar IA Wllama (CPU · Opcional)'); }
});
unload.addEventListener('click', async () => {
  const request = active;
  if (request) send({type:'failure', request, code:'cancelled'});
  await stop();
  connection.hidden = false; connection.textContent = 'Modelo retirado de memoria. Puedes continuar con propuestas por reglas.';
});
frame.addEventListener('load', () => { if (busy) void stop(); });
window.addEventListener('pagehide', () => { void stop(); });

window.addEventListener('message', async ({source, data}) => {
  if (source !== frame.contentWindow) return;
  if (data?.type === 'cancel') {
    if (busy) {
      generationController?.abort();
      busy = false;
      active = null;
    }
    return;
  }
  if (data?.type !== 'generate' || typeof data.request !== 'string') return;
  const request = data.request;
  if (busy || stopping || loadingModel) { send({type:'failure', request, code:'busy'}); return; }
  busy = true; active = request;
  const controller = new AbortController(); generationController = controller;
  state(aiLoaded ? readyLabel() : 'Generando propuestas…');
  generationTask = (async () => {
    const records = Feedback.validateRecords(data.records);
    if (records.length > 40) throw new Error('Lote demasiado grande');
    const result = [], provenance = {};
    const wantsAI = data.model === 'qwen' || data.model === 'qwen-cpu';
    const useAI = wantsAI && aiLoaded && Boolean(wllama);
    for (let i = 0; i < records.length; i++) {
      controller.signal.throwIfAborted();
      const record = records[i], started = performance.now();
      send({type:'progress', request, stage:'waiting', current:i+1, total:records.length, estimate:useAI && lastRowSeconds ? Math.ceil(lastRowSeconds * (records.length-i)) : null});
      let raw = '';
      const info = {reason: wantsAI && !useAI ? 'not_loaded' : ''};
      if (useAI) {
        try {
          const response = await wllama.createChatCompletion({
            abortSignal: controller.signal, cache_prompt: true,
            messages:[{role:'system', content:'Eres tutor docente de Formación Profesional en Cuatrovientos. Redactas propuestas formativas prácticas, constructivas y motivadoras en formato de una línea por competencia sin introducciones.'}, {role:'user', content:buildSuggestionPrompt(record)}],
            max_tokens: 115, temperature:0.35,
            stop: ['\n\n\n', '<|im_end|>', '<|endoftext|>', '---']
          });
          raw = response?.choices?.[0]?.message?.content || '';
        } catch {
          controller.signal.throwIfAborted();
          info.reason = 'inference_failed';
        }
        lastRowSeconds = Math.max(1, Math.round((performance.now()-started)/1000));
      }
      controller.signal.throwIfAborted();
      const normalized = adaptModelOutputToFeedback(raw, record, info);
      if (useAI && info.method !== 'ai' && !info.reason) info.reason = 'incomplete';
      provenance[record.id] = info;
      result.push(...Feedback.response(JSON.stringify(normalized), [record]));
    }
    if (active === request) send({type:'result', request, result:Feedback.response(JSON.stringify(result), records), provenance});
  })();
  try { await generationTask; }
  catch { if (active === request && !controller.signal.aborted) send({type:'failure', request, code:'invalid_response'}); }
  finally {
    generationTask = null;
    if (!stopping) {
      busy = false; active = null; generationController = null;
      state(aiLoaded ? readyLabel() : 'Cargar IA Wllama (GPU/CPU auto)');
    }
  }
});
state('Cargar IA Wllama (GPU/CPU auto)');
