'use strict';
const frame = document.getElementById('editor');
const send = data => frame.contentWindow.postMessage(data, '*');
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
  const suffix = globalThis.LOCAL_SETTINGS?.advice_suffix ?? 'Ajusta la dificultad y los apoyos con tu docente según las evidencias de aprendizaje.';
  const action = AdviceBank.select(compName, Number(score));
  return `${action} ${suffix}`.trim();
}


window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (data?.type !== 'generate' || typeof data.request !== 'string') return;
  const request = data.request;
  try {
    const records = Feedback.validateRecords(data.records);
    if (!records.length || records.length > 40) throw new Error('Lote inválido');
    const result = records.map(record => ({
      id: record.id,
      intro: globalThis.LOCAL_SETTINGS?.intro_text || 'A continuación se detalla la retroalimentación formativa de las competencias evaluadas en este periodo:',
      competencias_evaluadas: record.competencias.map(c => ({
        nombre_competencia: c.competencia,
        rubrica: String(getRubricDescriptor(c.competencia, c.valor)).slice(0, 3000),
        recomendaciones: String(getPedagogicalAdvice(c.competencia, c.valor)).slice(0, 3000)
      })),
      conclusion: globalThis.LOCAL_SETTINGS?.conclusion_text || 'Revisa estas propuestas con tu docente y elige un objetivo concreto para el próximo proyecto.'
    }));
    send({type: 'result', request, result: Feedback.response(JSON.stringify(result), records)});
  } catch { send({type: 'failure', request, code: 'invalid_response'}); }
});
