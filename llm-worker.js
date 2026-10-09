// WebLLM runs in a disposable worker; identities never enter this scope.
import './core.js';
import './rubricas.js';
let engine, running = false;
const MODEL = 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC';
self.onmessage = async ({data}) => {
  if (data?.type === 'load') {
    try {
      const {CreateMLCEngine} = await import('https://esm.run/@mlc-ai/web-llm@0.2.85');
      engine = await CreateMLCEngine(MODEL, {
        initProgressCallback: p => self.postMessage({type: 'load-progress', progress: p.progress}),
        logLevel: 'SILENT'
      }, {context_window_size: 8192});
      self.postMessage({type: 'ready'});
    } catch { self.postMessage({type: 'load-error', code: 'model'}); }
    return;
  }
  if (data?.type !== 'generate' || !engine || running) return;
  running = true;
  const request = data.request;
  try {
    const records = Feedback.validateRecords(data.records);
    if (records.length > 10) throw new Error('Batch too large');
    const result = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const groups = {
        'Innovación y emprendimiento': ['Innovación', 'Emprendimiento'],
        'Capacidad comunicativa': ['Comunicación oral', 'Comunicación escrita'],
        'Autonomía y responsabilidad': ['Autonomía', 'Responsabilidad']
      };
      const names = new Set(record.competencias.flatMap(c => groups[c.competencia] || [c.competencia]));
      const rubrics = globalThis.LOCAL_RUBRICS.filter(r => names.has(r.name));
      self.postMessage({type: 'progress', request, stage: 'waiting', current: i + 1, total: records.length});
      await engine.resetChat();
      const stream = await engine.chat.completions.create({
        messages: [{role: 'user', content: 'Sé conciso: introducción y cierre de una frase; valoración y recomendación de una o dos frases por competencia.\n' + Feedback.prompt([record], rubrics)}],
        temperature: 0.3, max_tokens: Math.min(2048, 256 + record.competencias.length * 192), stream: true,
        response_format: {type: 'json_object', schema: JSON.stringify({type: 'array', minItems: 1, maxItems: 1,
          items: {type: 'object', properties: {id: {type: 'string', enum: [record.id]}, intro: {type: 'string'},
            competencias_evaluadas: {type: 'array', minItems: record.competencias.length, maxItems: record.competencias.length,
              items: {type: 'object', properties: {nombre_competencia: {type: 'string', enum: record.competencias.map(c => c.competencia)},
                rubrica: {type: 'string'}, recomendaciones: {type: 'string'}},
                required: ['nombre_competencia', 'rubrica', 'recomendaciones'], additionalProperties: false}},
            conclusion: {type: 'string'}}, required: ['id', 'intro', 'competencias_evaluadas', 'conclusion'], additionalProperties: false}})}
      });
      let raw = '';
      for await (const chunk of stream) {
        raw += chunk.choices?.[0]?.delta?.content || '';
        if (raw.length > 500000) throw new Error('Output limit');
        self.postMessage({type: 'progress', request, stage: 'receiving', current: i + 1, total: records.length});
      }
      result.push(...Feedback.response(raw, [record]));
    }
    await engine.resetChat();
    self.postMessage({type: 'result', request, result: Feedback.response(JSON.stringify(result), records)});
  } catch {
    // Never forward model errors or prompts containing assessment data.
    try { await engine.resetChat(); } catch {}
    self.postMessage({type: 'failure', request, code: 'invalid_response'});
  } finally { running = false; }
};
