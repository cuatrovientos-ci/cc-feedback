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
const computeMode = document.getElementById('compute-mode');
const checkGPU = document.getElementById('check-gpu');
const benchmark = document.getElementById('benchmark');
const gpuStatus = document.getElementById('gpu-status');
const benchmarkStatus = document.getElementById('benchmark-status');
let loadedMode = 'cpu', offloadedLayers = 0, checkingGPU = false;
function readyLabel() { return loadedMode === 'gpu' ? 'IA Wllama cargada · GPU solicitada' : 'IA Wllama cargada en CPU'; }
function backendLabel() {
  return loadedMode === 'cpu' ? 'CPU (GPU desactivada)' : offloadedLayers > 0 ? `GPU confirmada por el motor: ${offloadedLayers} capas transferidas` : 'GPU solicitada; aceleración efectiva no confirmada por el motor';
}
async function probeGPU() {
  if (!isSecureContext || !navigator.gpu) throw new Error('WebGPU no está disponible en este navegador o contexto.');
  const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if (!adapter || adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter) throw new Error('No se ha obtenido una GPU física compatible.');
  const device = await adapter.requestDevice();
  device.destroy();
  return adapter.info?.description || adapter.info?.device || adapter.info?.vendor || 'Adaptador disponible';
}
checkGPU.addEventListener('click', async () => {
  if (checkingGPU || busy || loadingModel || stopping) return;
  checkingGPU = true; checkGPU.disabled = true;
  gpuStatus.textContent = 'Comprobando acceso a WebGPU…';
  try { gpuStatus.textContent = `WebGPU disponible: ${await probeGPU()}. Falta comprobar que el modelo se acelera y medir su tiempo.`; }
  catch (err) { gpuStatus.textContent = `${err.message} Si está restringido, consulta con informática; no se cambian políticas del navegador.`; }
  finally { checkingGPU = false; checkGPU.disabled = busy || loadingModel || Boolean(stopping); }
});
computeMode.addEventListener('change', () => { lastRowSeconds = null; });

function state(text, working = false) {
  label.textContent = text;
  spinner.hidden = !working;
  button.disabled = working || aiLoaded || busy || Boolean(stopping);
  button.setAttribute('aria-busy', String(working));
  unload.disabled = !(wllama || loadingModel || busy);
  cleanCache.disabled = loadingModel || busy || Boolean(stopping);
  computeMode.disabled = loadingModel || busy || aiLoaded || Boolean(stopping);
  benchmark.disabled = !aiLoaded || loadingModel || busy || Boolean(stopping);
  checkGPU.disabled = checkingGPU || loadingModel || busy || Boolean(stopping);
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
    state('Cargar IA Wllama (CPU · Opcional)');
  }
}

async function clearStorageQuota() {
  if (!globalThis.caches) throw new Error('Este navegador no permite gestionar la caché.');
  // This app only owns its explicitly named cache. Never clear an entire origin.
  await caches.delete(config.cache);
  if ((await caches.keys()).includes(config.cache)) throw new Error('No se pudo verificar el borrado.');
}

function getRubricDescriptor(compName, score) {
  return `Calificación registrada: ${score}/10. La nota no asigna por sí sola un nivel de rúbrica ni acredita conductas concretas.`;
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
  if (t.length < 15) return true;
  if (t.includes('tu consejo') || t.includes('consejo formativo') || t.includes('1-2 frases') || t.includes('1 frase') || t.includes('contextualización') || t.includes('motivadora') || t.includes('saludo') || t.includes('aquí') || t.includes('...')) {
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
  if (parsed.recomendaciones && typeof parsed.recomendaciones === 'object' && !Array.isArray(parsed.recomendaciones)) {
    for (const [k, v] of Object.entries(parsed.recomendaciones)) {
      if (v) recMap.set(norm(k), String(v).trim());
    }
  }

  const rawComps = Array.isArray(parsed.competencias_evaluadas)
    ? parsed.competencias_evaluadas
    : (Array.isArray(parsed.competencias) ? parsed.competencias : []);

  for (const c of rawComps) {
    const key = norm(c?.nombre_competencia || c?.competencia || c?.nombre || '');
    const val = c?.recomendaciones || c?.recomendacion || c?.sugerencias || c?.sugerencia || '';
    if (key && val) recMap.set(key, String(val).trim());
  }

  let aiParts = 0, ruleParts = 0;
  const fixedCompetencias = record.competencias.map(recComp => {
    const expectedNorm = norm(recComp.competencia);
    
    let recText = '';
    for (const [k, v] of recMap.entries()) {
      if (k === expectedNorm) {
        recText = v;
        break;
      }
    }

    if (isInvalidRecommendation(recText)) {
      recText = getPedagogicalAdvice(recComp.competencia, recComp.valor);
      ruleParts++;
    } else { aiParts++; }

    const rubricText = getRubricDescriptor(recComp.competencia, recComp.valor);

    return {
      nombre_competencia: recComp.competencia,
      rubrica: String(rubricText).slice(0, 3000),
      recomendaciones: String(recText).slice(0, 3000)
    };
  });

  let intro = String(parsed.intro || parsed.introduccion || '').trim();
  if (isInvalidRecommendation(intro) || intro.length < 15) {
    ruleParts++;
    intro = 'A continuación se detalla la retroalimentación formativa de las competencias evaluadas en este periodo:';
  } else { aiParts++; }

  let conclusion = String(parsed.conclusion || parsed.conclusiones || parsed.cierre || '').trim();
  if (isInvalidRecommendation(conclusion) || conclusion.length < 15) {
    ruleParts++;
    conclusion = 'Revisa estas propuestas con tu docente y elige un objetivo concreto para el próximo proyecto.';
  } else { aiParts++; }
  provenance.method = aiParts ? (ruleParts ? 'mixed' : 'ai') : 'rules';

  return [{
    id: record.id,
    intro: intro.slice(0, 3000),
    competencias_evaluadas: fixedCompetencias,
    conclusion: conclusion.slice(0, 3000)
  }];
}

function buildCompactPrompt(record) {
  const compLines = record.competencias.map(c => `- ${c.competencia}: ${c.valor}/10`).join('\n');
  return `Eres docente en el Centro Integrado Cuatrovientos.
Propón acciones concretas de mejora. No afirmes hábitos, personalidad, diagnósticos ni conductas observadas: solo dispones de notas. No asignes niveles de rúbrica.\nEscribe una recomendación pedagógica breve y constructiva para este alumno según sus notas en competencias (escala 0 a 10):
${compLines}

Responde ÚNICAMENTE en JSON válido con este formato:
{
  "intro": "saludo cordial y breve contexto",
  "recomendaciones": {
${record.competencias.map(c => `    "${c.competencia}": "tu consejo concreto para ${c.competencia}"`).join(',\n')}
  },
  "conclusion": "cierre motivador para el alumno"
}`;
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
  try { if (cache) await cache.put(config.url, new Response(blob)); }
  catch { connection.hidden = false; connection.textContent = 'Sin espacio para guardar el modelo: se usará solo en memoria.'; }
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
    loadedMode = computeMode.value; offloadedLayers = 0; lastRowSeconds = null;
    if (loadedMode === 'gpu') {
      gpuStatus.textContent = `WebGPU: ${await probeGPU()}. Preparando prueba con el modelo…`;
      controller.signal.throwIfAborted();
    }
    const captureLog = (...args) => {
      // Only inspect backend initialization messages; never persist prompts or outputs.
      const line = args.filter(v => typeof v === 'string').join(' ');
      const match = /offloaded\s+(\d+)\s*\/\s*\d+\s+layers/i.exec(line);
      if (match) offloadedLayers = Number(match[1]);
    };
    const engine = new Wllama({default: config.wasm}, {logger:{debug:captureLog,log:captureLog,info:captureLog,warn:captureLog,error:captureLog}}); wllama = engine;
    engine.setCompat({worker: config.compatWorker, wasm: config.compatWasm}, 'all');
    const blob = await modelBlob(controller.signal);
    controller.signal.throwIfAborted();
    state('Preparando modelo en memoria…', true);
    await engine.loadModel([blob], {n_ctx: 2048, n_gpu_layers: loadedMode === 'gpu' ? 99999 : 0});
    controller.signal.throwIfAborted();
    aiLoaded = true;
    const threads = engine.getNumThreads?.();
    connection.hidden = false;
    connection.className = 'alert alert-success mt-2';
    connection.textContent = `Modelo Qwen 0.5B listo. ${backendLabel()}. ${threads ? `${threads} hilo(s) de ejecución.` : 'Número de hilos no disponible.'} Prueba una fila para medir el tiempo en este equipo.`;
  })();
  try { await loadTask; }
  catch {
    if (!stopping) {
      connection.hidden = false; connection.className = 'alert alert-warning mt-2';
      connection.textContent = controller.signal.aborted ? 'Carga interrumpida o tiempo agotado.' : 'No se pudo cargar el modelo en el modo elegido. Puedes seleccionar CPU y reintentar; no se cambia a CPU automáticamente.';
      const engine = wllama; wllama = null;
      if (engine) { try { await engine.exit(); } catch {} }
      aiLoaded = false;
    }
  } finally {
    clearTimeout(loadTimer); loadingModel = false; loadTask = null;
    if (!stopping) state(aiLoaded ? readyLabel() : 'Cargar IA Wllama (CPU · Opcional)');
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
    if (busy || aiLoaded || loadingModel) void stop();
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
    const useAI = data.model === 'qwen-cpu' && aiLoaded && wllama;
    for (let i = 0; i < records.length; i++) {
      controller.signal.throwIfAborted();
      const record = records[i], started = performance.now();
      send({type:'progress', request, stage:'waiting', current:i+1, total:records.length, estimate:useAI && lastRowSeconds ? Math.ceil(lastRowSeconds * (records.length-i)) : null});
      let raw = '';
      const info = {reason: data.model === 'qwen-cpu' && !useAI ? 'not_loaded' : ''};
      if (useAI) {
        try {
          const response = await wllama.createChatCompletion({
            abortSignal: controller.signal, cache_prompt: false,
            messages:[{role:'system', content:'Propón actividades formativas, sin inventar observaciones sobre el alumno. Responde en JSON.'}, {role:'user', content:buildCompactPrompt(record)}],
            max_tokens: Math.min(1000, 160 + record.competencias.length * 90), temperature:0.2,
            response_format: {type:'json_object'}
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
      state(aiLoaded ? readyLabel() : 'Cargar IA Wllama (CPU · Opcional)');
    }
  }
});
state('Cargar IA Wllama (CPU · Opcional)');

benchmark.addEventListener('click', async () => {
  if (!aiLoaded || busy || loadingModel || stopping) return;
  busy = true;
  const controller = new AbortController(); generationController = controller;
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), 120000);
  const ticker = setInterval(() => { benchmarkStatus.textContent = `Prueba en curso: ${Math.round((performance.now()-started)/1000)} s. ${backendLabel()}. Puedes detenerla con «Retirar modelo».`; }, 1000);
  state('Probando fila ficticia…', true);
  generationTask = (async () => {
    const record = Feedback.prepare(Feedback.parseStudents('5 6 4 7 5 6')).records[0];
    const response = await wllama.createChatCompletion({
      abortSignal:controller.signal, cache_prompt:false,
      messages:[{role:'system',content:'Propón actividades formativas, sin inventar observaciones sobre el alumno. Responde en JSON.'},{role:'user',content:buildCompactPrompt(record)}],
      max_tokens:Math.min(1000,160+record.competencias.length*90), temperature:0.2, response_format:{type:'json_object'}
    });
    controller.signal.throwIfAborted();
    const info = {};
    adaptModelOutputToFeedback(response?.choices?.[0]?.message?.content || '',record,info);
    const elapsed = ((performance.now()-started)/1000).toFixed(1);
    const method = info.method === 'ai' ? 'Respuesta completa de IA' : 'Respuesta incompleta: requiere sustitución por reglas';
    benchmarkStatus.textContent = `${elapsed} s por fila ficticia. ${backendLabel()}. ${method}. Tiempo de generación, sin descarga ni carga del modelo. Para comparar, retira el modelo y elige el otro modo.`;
  })();
  try { await generationTask; }
  catch { benchmarkStatus.textContent = controller.signal.aborted ? 'Prueba interrumpida o límite de 120 s alcanzado. No es una medición completada.' : 'La prueba falló. No se ha sustituido la IA por reglas ni cambiado automáticamente a CPU.'; }
  finally {
    clearTimeout(timer); clearInterval(ticker); generationTask = null;
    if (!stopping) { busy = false; generationController = null; state(aiLoaded ? readyLabel() : 'Cargar IA Wllama (CPU · Opcional)'); }
  }
});
