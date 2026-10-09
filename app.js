"use strict";
const frame = document.getElementById('editor');
const connection = document.getElementById('connection');
const button = document.getElementById('connect');
const label = document.getElementById('connect-label');
const spinner = document.getElementById('connect-spinner');
const unload = document.getElementById('unload');
const cleanCache = document.getElementById('clean-cache');

let engine = null, ready = false, busy = false, active = null, abortGeneration = null, loadTimer = null;

const MODELS = {
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 0.5B (WebGPU · ~350 MB, ultrarrápido)'
  },
  'SmolLM2-360M-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 360M (WebGPU · ~200 MB, ultraligero)'
  },
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 1B (WebGPU · ~880 MB)'
  },
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 1.5B (WebGPU · ~1.1 GB)'
  }
};

// Aliases para compatibilidad con selectores anteriores
const MODEL_ALIASES = {
  'qwen-0.5b': 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'qwen-1.5b': 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'smollm-360m': 'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'llama-1b': 'Llama-3.2-1B-Instruct-q4f16_1-MLC'
};

let selectedModel = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

function resolveModelId(key) {
  if (MODELS[key]) return key;
  if (MODEL_ALIASES[key]) return MODEL_ALIASES[key];
  return 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
}

function state(text, working = false) {
  label.textContent = text;
  spinner.hidden = !working;
  button.disabled = working || ready;
  button.setAttribute('aria-busy', String(working));
  unload.disabled = !engine;
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
  if (engine) {
    try { await engine.unload(); } catch {}
    engine = null;
  }
  ready = false;
  busy = false;
  active = null;
  state('Cargar modelo WebLLM (WebGPU)');
}

async function clearStorageQuota() {
  let cleared = false;
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        await caches.delete(k);
        cleared = true;
      }
    } catch (e) {
      console.warn('Error al limpiar Cache Storage:', e);
    }
  }

  if (navigator.storage && navigator.storage.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root.entries()) {
        try {
          await root.removeEntry(name, { recursive: true });
          cleared = true;
        } catch {}
      }
    } catch (e) {
      console.warn('Error al limpiar OPFS:', e);
    }
  }

  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          try { indexedDB.deleteDatabase(db.name); cleared = true; } catch {}
        }
      }
    } catch (e) {
      console.warn('Error al limpiar IndexedDB:', e);
    }
  }

  return cleared;
}

function error(code, detail = '') {
  const request = active;
  stop();
  if (request) send({type: 'failure', request, code, detail});
  connection.hidden = false;
  const msg = ({
    unsupported: 'Tu navegador o dispositivo no soporta WebGPU. Asegúrate de usar Google Chrome o Microsoft Edge actualizados en Windows.',
    timeout: 'La carga o descarga del modelo ha superado diez minutos. Comprueba la conexión y vuelve a intentarlo.',
    model: 'No se pudo cargar o ejecutar el modelo WebGPU en este equipo.',
    cancelled: 'Generación cancelada por el usuario.'
  })[code] || 'No se pudo completar la generación local con WebLLM. Vuelve a cargar el modelo.';

  const detailLower = String(detail || '').toLowerCase();
  if (detailLower.includes('quota') || detailLower.includes('space') || detailLower.includes('storage')) {
    connection.className = 'alert alert-warning mt-2';
    connection.textContent = `Cuota de almacenamiento del navegador agotada (Quota exceeded). Pulsa el botón "Liberar espacio / limpiar caché" de arriba para eliminar residuos anteriores, o selecciona el modelo SmolLM2 (180 MB). [Detalle: ${detail}]`;
  } else {
    connection.className = 'alert alert-danger mt-2';
    connection.textContent = detail ? `${msg} [Detalle: ${detail}]` : msg;
  }
}

function getRubricDescriptor(compName, score) {
  const rubrics = globalThis.LOCAL_RUBRICS || [];
  if (!rubrics.length) {
    return `Desempeño observado en ${compName} con calificación ${score}.`;
  }
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const target = norm(compName);
  
  let found = rubrics.find(r => {
    const rName = norm(r.name);
    return target === rName || target.includes(rName) || rName.includes(target);
  });
  
  if (!found) {
    if (target.includes('innovacion')) found = rubrics.find(r => norm(r.name).includes('innovacion'));
    else if (target.includes('comunica')) found = rubrics.find(r => norm(r.name).includes('comunicacion oral'));
    else if (target.includes('autonomia')) found = rubrics.find(r => norm(r.name).includes('autonomia'));
  }
  
  if (!found || !Array.isArray(found.levels) || !found.levels.length) {
    return `Demuestra un desempeño adecuado según el trabajo observado en ${compName}.`;
  }
  
  const val = Number(score) || 0;
  let levelIdx = 0;
  if (val >= 8.5) levelIdx = 3;
  else if (val >= 7.0) levelIdx = 2;
  else if (val >= 5.0) levelIdx = 1;
  else levelIdx = 0;
  
  return found.levels[levelIdx] || found.levels[0];
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

function isInvalidRecommendation(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim().toLowerCase();
  if (t.length < 15) return true;
  if (t.includes('tu consejo') || t.includes('consejo formativo') || t.includes('1-2 frases') || t.includes('1 frase') || t.includes('contextualización') || t.includes('motivadora') || t.includes('saludo') || t.includes('aquí') || t.includes('...')) {
    return true;
  }
  return false;
}

function getPedagogicalAdvice(compName, score) {
  const val = Number(score) || 0;
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const c = norm(compName);

  if (c.includes('innova') || c.includes('emprend')) {
    if (val < 5) return 'Atrévete a proponer ideas en los proyectos y participa activamente en las sesiones de ideación sin temor a equivocarte.';
    if (val < 7) return 'Buen trabajo siguiendo las pautas dadas; da un paso más proponiendo mejoras creativas y soluciones propias.';
    return 'Excelente iniciativa y visión innovadora. Sigue liderando la búsqueda de soluciones creativas y compartiendo tus ideas con el grupo.';
  }

  if (c.includes('equipo')) {
    if (val < 5) return 'Es fundamental mejorar la comunicación con tus compañeros, cumplir los plazos acordados en el grupo y escuchar las distintas opiniones.';
    if (val < 7) return 'Colaboras bien en el equipo; procura asumir un rol más participativo en la organización y en la toma de decisiones compartidas.';
    return 'Gran capacidad de trabajo cooperativo, facilitando el buen clima y apoyando al resto del equipo en los momentos clave.';
  }

  if (c.includes('comunica')) {
    if (val < 5) return 'Cuida la estructuración de tus exposiciones y escritos, adaptando el registro al entorno profesional y prestando atención a la claridad.';
    if (val < 7) return 'Te expresas con claridad; para seguir avanzando, practica una escucha activa más reflexiva y enriquece tu vocabulario técnico.';
    return 'Comunicación muy eficaz y asertiva, adecuando perfectamente el lenguaje tanto en intervenciones orales como en entregas escritas.';
  }

  if (c.includes('digital')) {
    if (val < 5) return 'Practica más con las herramientas digitales del curso y asegúrate de verificar la calidad y rigor de los resultados obtenidos.';
    if (val < 7) return 'Utilizas las plataformas digitales con soltura; profundiza en el uso crítico y seguro de nuevas herramientas para optimizar tu trabajo.';
    return 'Dominio óptimo y con sentido crítico de los entornos y herramientas digitales, aprovechándolas al máximo en tus entregas.';
  }

  if (c.includes('entorno') || c.includes('adaptaci')) {
    if (val < 5) return 'Intenta afrontar los cambios imprevistos con flexibilidad y disposición de aprendizaje, buscando apoyo cuando surjan dudas.';
    if (val < 7) return 'Te adaptas adecuadamente a situaciones nuevas; mantén una actitud abierta y proactiva ante los ajustes que requieran los proyectos.';
    return 'Excelente flexibilidad y resiliencia ante cambios o retos imprevistos, respondiendo de forma constructiva y rápida.';
  }

  if (c.includes('autonom') || c.includes('responsa')) {
    if (val < 5) return 'Organiza mejor tus tiempos de entrega y planifica tus tareas diarias de forma más independiente sin esperar recordatorios.';
    if (val < 7) return 'Cumples con tus compromisos habitualmente; busca anticiparte a los problemas gestionando tus recursos con mayor autonomía.';
    return 'Gran nivel de autonomía y responsabilidad, gestionando con madurez tus tiempos y asumiendo con rigor cada uno de tus compromisos.';
  }

  if (val < 5) return `Conviene repasar los puntos clave de ${compName}, consultar dudas de inmediato y apoyarse en las dinámicas de clase para afianzar el aprendizaje.`;
  if (val < 7) return `Continúa trabajando con regularidad en ${compName} y busca momentos para tomar mayor iniciativa en las tareas prácticas.`;
  return `Excelente nivel en ${compName}. Sigue manteniendo esta implicación y comparte tus buenas prácticas con el grupo.`;
}

function adaptModelOutputToFeedback(raw, record) {
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
    }

    const rubricText = getRubricDescriptor(recComp.competencia, recComp.valor);

    return {
      nombre_competencia: recComp.competencia,
      rubrica: String(rubricText).slice(0, 3000),
      recomendaciones: String(recText).slice(0, 3000)
    };
  });

  let intro = String(parsed.intro || parsed.introduccion || '').trim();
  if (isInvalidRecommendation(intro) || intro.length < 15) {
    intro = 'A continuación se detalla la retroalimentación formativa de las competencias evaluadas en este periodo:';
  }

  let conclusion = String(parsed.conclusion || parsed.conclusiones || parsed.cierre || '').trim();
  if (isInvalidRecommendation(conclusion) || conclusion.length < 15) {
    conclusion = 'Sigue mostrando constancia y dedicación para consolidar tu progreso en los próximos proyectos.';
  }

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
Escribe una recomendación pedagógica real, útil y personalizada para este alumno según sus notas en competencias (escala 0 a 10):
${compLines}

Para notas bajas (< 5), da pautas claras de recuperación y trabajo en clase.
Para notas medias (5 a 7), anima a participar más y asumir iniciativa.
Para notas altas (> 7), felicita y sugiere liderar o consolidar.

Responde ÚNICAMENTE en JSON válido con este formato:
{
  "intro": "saludo cordial y breve contexto",
  "recomendaciones": {
${record.competencias.map(c => `    "${c.competencia}": "tu consejo concreto para ${c.competencia}"`).join(',\n')}
  },
  "conclusion": "cierre motivador para el alumno"
}`;
}

button.addEventListener('click', async () => {
  connection.hidden = true;
  if (!navigator.gpu) {
    error('unsupported');
    return;
  }
  await stop();
  state('Cargando motor WebLLM (WebGPU)…', true);
  try {
    loadTimer = setTimeout(() => { error('timeout', 'Tiempo de espera agotado'); }, 600000);

    let webllm;
    try {
      webllm = await import('https://esm.run/@mlc-ai/web-llm');
    } catch {
      webllm = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm');
    }

    const modelId = resolveModelId(selectedModel);
    const cfg = MODELS[modelId] || { name: modelId };
    try {
      engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          const text = report?.text || 'Cargando modelo en GPU…';
          state(text, true);
        }
      });
    } catch (createErr) {
      const errStr = String(createErr?.message || createErr).toLowerCase();
      if (errStr.includes('quota') || errStr.includes('space') || errStr.includes('storage')) {
        console.warn('Detectada cuota excedida. Limpiando almacenamiento residual...');
        state('Cuota excedida. Liberando caché antigua y reintentando…', true);
        await clearStorageQuota();
        engine = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback: (report) => {
            const text = report?.text || 'Cargando modelo en GPU…';
            state(text, true);
          }
        });
      } else {
        throw createErr;
      }
    }

    clearTimeout(loadTimer);
    ready = true;
    unload.disabled = false;
    state(`Modelo listo: ${cfg.name}`);
  } catch (err) {
    console.error('Error al inicializar WebLLM:', err);
    error('model', err?.message || String(err));
  }
});

if (cleanCache) {
  cleanCache.addEventListener('click', async () => {
    cleanCache.disabled = true;
    state('Liberando espacio de almacenamiento…', true);
    await clearStorageQuota();
    await stop();
    cleanCache.disabled = false;
    connection.hidden = false;
    connection.className = 'alert alert-info mt-2';
    connection.textContent = 'Almacenamiento y caché liberados. Ahora puedes pulsar «Cargar modelo WebLLM (WebGPU)».';
    state('Cargar modelo WebLLM (WebGPU)');
  });
}

unload.addEventListener('click', async () => {
  const request = active;
  await stop();
  if (request) send({type: 'failure', request, code: 'cancelled'});
  connection.hidden = false;
  connection.textContent = 'Modelo descargado de memoria.';
});

frame.addEventListener('load', () => { if (busy) stop(); });
window.addEventListener('pagehide', stop);

window.addEventListener('message', async ({source, origin, data}) => {
  if (source !== frame.contentWindow || origin !== 'null') return;
  if (data?.type === 'model-select' && typeof data.model === 'string') {
    selectedModel = resolveModelId(data.model);
    if (!ready && !busy) {
      const cfg = MODELS[selectedModel] || { name: selectedModel };
      state(`Cargar modelo: ${cfg.name}`);
    }
    return;
  }
  if (data?.type === 'cancel') {
    if (busy && abortGeneration) abortGeneration();
    busy = false;
    active = null;
    return;
  }
  if (data?.type !== 'generate' || typeof data.request !== 'string') return;
  if (data.model) {
    selectedModel = resolveModelId(data.model);
  }
  if (!ready || !engine || busy) {
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

      send({type: 'progress', request, stage: 'waiting', current: i + 1, total: records.length});

      const promptContent = buildCompactPrompt(record);

      const response = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: 'Eres un tutor docente en España. Responde exclusivamente con un JSON válido y conciso.' },
          { role: 'user', content: promptContent }
        ],
        max_tokens: 500,
        temperature: 0.2
      });

      if (aborted || active !== request) throw new Error('aborted');
      const raw = response?.choices?.[0]?.message?.content || '';
      console.log('Salida de WebLLM para fila ' + (i + 1) + ':', raw);

      const normalized = adaptModelOutputToFeedback(raw, record);
      result.push(...Feedback.response(JSON.stringify(normalized), [record]));
    }

    if (active === request) {
      send({type: 'result', request, result: Feedback.response(JSON.stringify(result), records)});
    }
  } catch (err) {
    console.error('Error detallado en generación WebLLM en app.js:', err);
    if (active === request) {
      send({type: 'failure', request, code: 'invalid_response', detail: err?.message || String(err)});
    }
  } finally {
    if (active === request) {
      busy = false;
      active = null;
      abortGeneration = null;
    }
  }
});

state('Cargar modelo WebLLM (WebGPU)');
