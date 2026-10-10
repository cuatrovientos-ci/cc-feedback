"use strict";
const frame = document.getElementById('editor');
const connection = document.getElementById('connection');
const button = document.getElementById('connect');
const label = document.getElementById('connect-label');
const spinner = document.getElementById('connect-spinner');
const unload = document.getElementById('unload');
const cleanCache = document.getElementById('clean-cache');

let aiLoaded = false, busy = false, active = null;
let loadingModel = false, stopping = null, generationController = null;
let generationTask = null, lastRowSeconds = null, sdkTask = null;
const config = globalThis.CC_PUTER;
function readyLabel() { return 'Puter conectado'; }
function state(text, working = false) {
  label.textContent = text;
  spinner.hidden = !working;
  button.disabled = working || aiLoaded || busy || Boolean(stopping);
  button.setAttribute('aria-busy', String(working));
  unload.disabled = !busy;
  cleanCache.disabled = loadingModel || busy || Boolean(stopping);
}
function send(message) { frame.contentWindow.postMessage(message, '*'); }

// Puter does not document remote cancellation. Abort/timeout discards the local
// result and stops the queue, but cannot retract a request already sent.
function waitForProvider(promise, signal, timeoutMs = config.timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason || new DOMException('Cancelled', 'AbortError')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, {once: true});
    timer = setTimeout(() => { cleanup(); reject(new Error('Tiempo de respuesta de Puter agotado.')); }, timeoutMs);
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
async function stop() {
  if (stopping) return stopping;
  active = null;
  generationController?.abort();
  stopping = Promise.allSettled([generationTask].filter(Boolean));
  state('Cancelando…', true);
  try { await stopping; } finally {
    stopping = null; busy = false;
    state(aiLoaded ? readyLabel() : (globalThis.puter ? 'Acceder a Puter' : 'Conectar con Puter'));
  }
}
async function clearStorageQuota() {
  if (!globalThis.caches) throw new Error('Este navegador no permite gestionar la caché.');
  await caches.delete('cc-feedback-model-v1');
  if ((await caches.keys()).includes('cc-feedback-model-v1')) throw new Error('No se pudo verificar el borrado.');
}
function loadPuter() {
  if (globalThis.puter) return Promise.resolve();
  if (sdkTask) return sdkTask;
  const script = document.createElement('script');
  script.src = config.sdk; script.async = true; script.referrerPolicy = 'no-referrer';
  sdkTask = waitForProvider(new Promise((resolve, reject) => {
    script.onload = () => globalThis.puter ? resolve() : reject(new Error('Puter no disponible.'));
    script.onerror = () => reject(new Error('No se pudo cargar Puter.'));
    document.head.append(script);
  }), null, 20000).catch(error => { script.remove(); sdkTask = null; throw error; });
  return sdkTask;
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
  const customAdvice = globalThis.LOCAL_ADVICE;
  const suffix = globalThis.LOCAL_SETTINGS?.advice_suffix || 'Ajusta la dificultad y los apoyos con tu docente según las evidencias de aprendizaje.';
  
  if (Array.isArray(customAdvice) && customAdvice.length > 0) {
    for (const item of customAdvice) {
      try {
        const regex = new RegExp(item.pattern, 'i');
        if (regex.test(c)) {
          return `${item.advice} ${suffix}`.trim();
        }
      } catch {}
    }
  }

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
  return `${action} ${suffix}`.trim();
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
    t.includes('sugerencia formativa') ||
    t.includes('contextualización') ||
    t.includes('motivadora') ||
    t.includes('saludo') ||
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
      const k = trimmed.slice(0, sepIdx).replace(/[*_`]/g, '').trim();
      const v = trimmed.slice(sepIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && v && v.length >= 10) {
        recMap.set(norm(k), v);
      }
    }
  }

  let aiParts = 0, ruleParts = 0;
  provenance.aiCompetencies = [];
  const fixedCompetencias = record.competencias.map(recComp => {
    const expectedNorm = norm(recComp.competencia);
    
    let recText = '';
    const code = `c${record.competencias.indexOf(recComp) + 1}`;
    for (const [k, v] of recMap.entries()) {
      if (k === code || k === expectedNorm || (k.length > 3 && (k.includes(expectedNorm) || expectedNorm.includes(k)))) {
        recText = v;
        break;
      }
    }

    if (isInvalidRecommendation(recText)) {
      recText = getPedagogicalAdvice(recComp.competencia, recComp.valor);
      ruleParts++;
    } else { aiParts++; provenance.aiCompetencies.push(recComp.competencia); }

    // Match de rúbrica asignado 100% por programación de forma determinista
    const rubricText = getRubricDescriptor(recComp.competencia, recComp.valor);

    return {
      nombre_competencia: recComp.competencia,
      rubrica: String(rubricText).slice(0, 3000),
      recomendaciones: String(recText).slice(0, 3000)
    };
  });

  const intro = globalThis.LOCAL_SETTINGS?.intro_text || 'A continuación se detalla la retroalimentación formativa de las competencias evaluadas en este periodo:';
  const conclusion = globalThis.LOCAL_SETTINGS?.conclusion_text || 'Revisa estas propuestas con tu docente y elige un objetivo concreto para el próximo proyecto.';
  provenance.method = aiParts ? (ruleParts ? 'mixed' : 'ai') : 'rules';
  if (ruleParts && !provenance.reason) provenance.reason = 'incomplete';

  return [{
    id: record.id,
    intro,
    competencias_evaluadas: fixedCompetencias,
    conclusion
  }];
}

button.addEventListener('click', async () => {
  if (loadingModel || busy || stopping || aiLoaded) return;
  loadingModel = true; connection.hidden = true;
  try {
    if (!globalThis.puter) {
      state('Preparando Puter…', true);
      await loadPuter();
      // A second explicit click keeps signIn inside a browser user gesture.
      connection.textContent = 'Puter preparado. Pulsa «Acceder a Puter» para iniciar sesión. No se han enviado notas.';
    } else {
      state('Accediendo a Puter…', true);
      if (!puter.auth.isSignedIn()) await waitForProvider(puter.auth.signIn(), null);
      if (!puter.auth.isSignedIn()) throw new Error('No se ha completado el acceso a Puter.');
      aiLoaded = true;
      connection.textContent = `Puter conectado. Modelo: ${config.model}. Solo se envían competencias y notas al solicitar una mejora.`;
    }
    connection.className = 'alert alert-info mt-2';
  } catch {
    aiLoaded = false;
    connection.className = 'alert alert-warning mt-2';
    connection.textContent = 'No se pudo conectar con Puter. Revisa la conexión, permite la ventana de acceso y vuelve a intentarlo.';
  } finally {
    loadingModel = false;
    connection.hidden = !aiLoaded && Boolean(globalThis.puter) && connection.className.includes('alert-info');
    state(aiLoaded ? readyLabel() : (globalThis.puter ? 'Acceder a Puter' : 'Conectar con Puter'));
  }
});
cleanCache.addEventListener('click', async () => {
  if (busy || loadingModel || stopping) return;
  state('Limpiando caché antigua…', true);
  try { await clearStorageQuota(); connection.textContent = 'Caché cc-feedback-model-v1 eliminada. No se han borrado datos de Puter ni otras cachés.'; }
  catch { connection.textContent = 'No se pudo verificar el borrado de la caché antigua.'; }
  finally { connection.hidden = false; state(aiLoaded ? readyLabel() : 'Conectar con Puter'); }
});
unload.addEventListener('click', async () => {
  const request = active;
  if (request) send({type:'enhance-failure', request, code:'cancelled'});
  await stop();
  connection.hidden = false;
  connection.textContent = 'Cola cancelada. Una solicitud ya enviada puede continuar en Puter, pero su respuesta no se aplicará.';
});
frame.addEventListener('load', () => { if (busy) void stop(); });
window.addEventListener('pagehide', () => { void stop(); });

async function generateStudentWithAI(record, signal, onProgress = () => {}) {
  const accepted = {};
  let inferenceFailed = false;
  // Preserve per-competency generation and progress. No identity, total,
  // draft or free-text administration content is included in the prompt.
  for (let i = 0; i < record.competencias.length; i++) {
    signal.throwIfAborted();
    const competency = record.competencias[i];
    onProgress(i + 1, record.competencias.length, competency.competencia);
    const single = {id: record.id, competencias: [competency]};
    try {
    const response = await waitForProvider(puter.ai.chat([
        {role: 'system', content: 'Eres tutor de Formación Profesional. Responde en español con una sola acción práctica, sin introducción ni listas.'},
        {role: 'user', content: `Competencia: ${competency.competencia}. Nota: ${competency.valor}/10. Objetivo: ${getRubricMatch(competency.competencia, competency.valor).level <= 2 ? 'practicar con pautas y apoyos' : 'desarrollar mayor autonomía y nuevos retos'}. Escribe una sugerencia concreta de 12 a 20 palabras dirigida al estudiante. Devuelve solo la frase completa.`}
      ], {model: config.model, normalize: true, stream: false, max_tokens: 160, temperature: 0.5}), signal);
    signal.throwIfAborted();
    const choice = response;
    if (choice?.finish_reason === 'length') continue;
    const raw = String(choice?.message?.content || '').trim();
    const partInfo = {};
    const structured = adaptModelOutputToFeedback(raw, single, partInfo)[0];
    if (partInfo.aiCompetencies.length) {
      accepted[competency.competencia] = structured.competencias_evaluadas[0].recomendaciones;
    } else if (!/[\n{}\[\]<>:]/.test(raw) && !isInvalidRecommendation(raw) && /[.!?…]["”']?$/.test(raw)) {
      accepted[competency.competencia] = raw;
    }
    } catch {
      signal.throwIfAborted();
      inferenceFailed = true;
      break; // Avoid repeating a failed authentication, quota or network request.
    }
  }
  signal.throwIfAborted();
  const info = inferenceFailed ? {reason: 'inference_failed'} : {};
  const normalized = adaptModelOutputToFeedback(JSON.stringify(accepted), record, info);
  return { normalized: normalized[0], info };
}

window.addEventListener('message', async ({source, data}) => {
  if (source !== frame.contentWindow) return;
  if (data?.type === 'cancel') {
    if (busy) {
      void stop();
    }
    return;
  }
  if (data?.type === 'enhance-batch') {
    const request = data.request;
    if (typeof request !== 'string') return;
    if (busy || stopping || loadingModel) { send({type: 'enhance-failure', request, code: 'busy'}); return; }
    if (!aiLoaded || !globalThis.puter?.auth.isSignedIn()) {
      aiLoaded = false;
      state(globalThis.puter ? 'Acceder a Puter' : 'Conectar con Puter');
      send({
        type: 'enhance-failure',
        request,
        code: 'not_connected',
        detail: 'Conecta y accede a Puter desde la barra superior antes de solicitar sugerencias.'
      });
      return;
    }
    busy = true; active = request;
    const controller = new AbortController(); generationController = controller;
    state('Generando sugerencias con Puter…', true);
    generationTask = (async () => {
      const records = Feedback.validateRecords(data.records);
      for (let i = 0; i < records.length; i++) {
        controller.signal.throwIfAborted();
        const record = records[i], started = performance.now();
        send({type: 'enhance-progress', request, current: i + 1, total: records.length, id: record.id});
        const { normalized, info } = await generateStudentWithAI(record, controller.signal, (competencyCurrent, competencyTotal, competency) => {
          send({type: 'enhance-progress', request, current: i + 1, total: records.length, id: record.id, competencyCurrent, competencyTotal, competency});
        });
        lastRowSeconds = Math.max(1, Math.round((performance.now() - started) / 1000));
        controller.signal.throwIfAborted();
        send({
          type: 'enhance-student-result',
          request,
          id: record.id,
          studentResponse: normalized,
          provenance: info
        });
      }
      if (active === request) {
        send({type: 'enhance-complete', request});
      }
    })();
    try { await generationTask; }
    catch (err) {
      if (active === request && !controller.signal.aborted) {
        send({type: 'enhance-failure', request, code: 'invalid_response', detail: err?.message || String(err)});
      }
    } finally {
      generationTask = null;
      if (!stopping) {
        busy = false; active = null; generationController = null;
        state(aiLoaded ? readyLabel() : 'Conectar con Puter');
      }
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
    const wantsAI = data.model === 'puter';
    const useAI = wantsAI && aiLoaded && Boolean(globalThis.puter?.auth.isSignedIn());
    for (let i = 0; i < records.length; i++) {
      controller.signal.throwIfAborted();
      const record = records[i], started = performance.now();
      send({type:'progress', request, stage:'waiting', current:i+1, total:records.length, estimate:useAI && lastRowSeconds ? Math.ceil(lastRowSeconds * (records.length-i)) : null});
      let normalized, info;
      if (useAI) {
        const generated = await generateStudentWithAI(record, controller.signal);
        normalized = [generated.normalized];
        info = generated.info;
        lastRowSeconds = Math.max(1, Math.round((performance.now()-started)/1000));
      } else {
        info = {reason: wantsAI ? 'not_loaded' : ''};
        normalized = adaptModelOutputToFeedback('', record, info);
      }
      controller.signal.throwIfAborted();
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
      state(aiLoaded ? readyLabel() : 'Conectar con Puter');
    }
  }
});
state('Conectar con Puter');
