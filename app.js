"use strict";
const frame = document.getElementById('editor');
const connection = document.getElementById('connection');
const button = document.getElementById('connect');
const label = document.getElementById('connect-label');
const spinner = document.getElementById('connect-spinner');
const unload = document.getElementById('unload');

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

function error(code, detail = '') {
  const request = active;
  stop();
  if (request) send({type: 'failure', request, code, detail});
  connection.hidden = false;
  const msg = ({
    unsupported: 'Tu navegador o dispositivo no soporta WebGPU. Asegúrate de usar Google Chrome o Microsoft Edge actualizados en Windows.',
    timeout: 'La carga o descarga del modelo ha superado diez minutos. Comprueba la conexión y vuelve a intentarlo.',
    model: 'No se pudo cargar o ejecutar el modelo WebGPU en este equipo. Comprueba la conexión y la memoria de vídeo; cierra otras pestañas y reintenta.',
    cancelled: 'Generación cancelada por el usuario.'
  })[code] || 'No se pudo completar la generación local con WebLLM. Vuelve a cargar el modelo.';
  connection.textContent = detail ? `${msg} [Detalle: ${detail}]` : msg;
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

  // Mapeo flexible de recomendaciones según el formato devuelto por el modelo
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
    
    // Buscar recomendación en el mapa
    let recText = '';
    for (const [k, v] of recMap.entries()) {
      if (k === expectedNorm || k.includes(expectedNorm) || expectedNorm.includes(k)) {
        recText = v;
        break;
      }
    }

    // Si el modelo no dio consejo concreto, generar uno pedagógico coherente con la nota
    if (!recText || recText.length < 5) {
      const val = Number(recComp.valor) || 0;
      if (val < 5) {
        recText = `Conviene repasar los puntos clave de ${recComp.competencia}, consultar dudas de inmediato y apoyarse en las dinámicas de clase para afianzar el aprendizaje.`;
      } else if (val < 7) {
        recText = `Continúa trabajando con regularidad en ${recComp.competencia} y busca momentos para tomar mayor iniciativa en las tareas prácticas.`;
      } else {
        recText = `Excelente nivel en ${recComp.competencia}. Sigue manteniendo esta implicación y comparte tus buenas prácticas con el grupo.`;
      }
    }

    // Obtener la valoración oficial de la rúbrica según la calificación
    const rubricText = getRubricDescriptor(recComp.competencia, recComp.valor);

    return {
      nombre_competencia: recComp.competencia,
      rubrica: String(rubricText).slice(0, 3000),
      recomendaciones: String(recText).slice(0, 3000)
    };
  });

  const intro = String(parsed.intro || parsed.introduccion || '').trim() ||
    'A continuación se detalla la retroalimentación formativa de las competencias evaluadas en este periodo:';
  const conclusion = String(parsed.conclusion || parsed.conclusiones || parsed.cierre || '').trim() ||
    'Sigue mostrando constancia y dedicación para consolidar tu progreso en los próximos proyectos.';

  return [{
    id: record.id,
    intro: intro.slice(0, 3000),
    competencias_evaluadas: fixedCompetencias,
    conclusion: conclusion.slice(0, 3000)
  }];
}

function buildCompactPrompt(record) {
  const compLines = record.competencias.map(c => `- ${c.competencia}: ${c.valor}/10`).join('\n');
  return `Actúa como tutor docente de Formación Profesional en España.
Redacta retroalimentación formativa personalizada, constructiva y respetuosa para un estudiante según sus calificaciones:
${compLines}

Responde ÚNICAMENTE con este objeto JSON sin explicaciones adicionales:
{
  "intro": "Breve contextualización cordial de 1 frase.",
  "recomendaciones": {
${record.competencias.map(c => `    "${c.competencia}": "Consejo formativo breve y práctico para progresar o consolidar (1-2 frases)."`).join(',\n')}
  },
  "conclusion": "Breve frase motivadora de cierre (1 frase)."
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
    state(`Iniciando ${cfg.name}…`, true);

    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const text = report?.text || 'Cargando modelo en GPU…';
        state(text, true);
      }
    });

    clearTimeout(loadTimer);
    ready = true;
    unload.disabled = false;
    state(`Modelo listo: ${cfg.name}`);
  } catch (err) {
    console.error('Error al inicializar WebLLM:', err);
    error('model', err?.message || String(err));
  }
});

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
