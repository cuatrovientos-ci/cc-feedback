'use strict';
const form = document.getElementById('main-form'),
  input = document.getElementById('data'),
  list = document.getElementById('results'),
  status = document.getElementById('status'),
  results = document.getElementById('results-container'),
  loading = document.getElementById('loading-overlay');

let pendingInput = '', elapsedTimer, started = 0;
let identities = new Map(), records = [], request = null, currentEnhanceRequest = null, last = Date.now(), timeout;
const studentCards = new Map();

function send(data) { parent.postMessage(data, '*'); }

function updateSelectedCount() {
  const checked = list.querySelectorAll('.ai-select-check:checked').length;
  const countEl = document.getElementById('selected-count');
  if (countEl) countEl.textContent = checked;
  const runBtn = document.getElementById('run-selected-ai');
  if (runBtn && !currentEnhanceRequest) runBtn.disabled = checked === 0;
}

function setAiButtonsDisabled(disabled) {
  const runBtn = document.getElementById('run-selected-ai');
  const selAll = document.getElementById('select-all-ai');
  const deselAll = document.getElementById('deselect-all-ai');
  if (runBtn) runBtn.disabled = disabled;
  if (selAll) selAll.disabled = disabled;
  if (deselAll) deselAll.disabled = disabled;
  list.querySelectorAll('.btn-ai-single').forEach(b => { b.disabled = disabled; });
  list.querySelectorAll('.ai-select-check').forEach(c => { c.disabled = disabled; });
}

function runEnhanceBatch(targetRecords) {
  if (currentEnhanceRequest) return;
  if (parent === window) {
    const statusEl = document.getElementById('ai-batch-status');
    if (statusEl) statusEl.textContent = 'Abre index.html para usar el motor de IA.';
    return;
  }
  currentEnhanceRequest = crypto.randomUUID();
  setAiButtonsDisabled(true);
  const statusEl = document.getElementById('ai-batch-status');
  if (statusEl) {
    statusEl.className = 'small mt-2 text-primary';
    statusEl.textContent = `Iniciando mejora con IA para ${targetRecords.length} alumno(s)...`;
  }
  for (const r of targetRecords) {
    const cardObj = studentCards.get(r.id);
    if (cardObj) {
      cardObj.methodBadge.textContent = 'En cola para IA... ⏳';
      cardObj.methodBadge.className = 'badge bg-warning text-dark border method-badge';
    }
  }
  send({
    type: 'enhance-batch',
    request: currentEnhanceRequest,
    records: targetRecords
  });
}

function reset(message = '') {
  last = Date.now();
  clearInterval(elapsedTimer);
  pendingInput = '';
  form.setAttribute('aria-busy', 'false');
  clearTimeout(timeout);
  request = null;
  currentEnhanceRequest = null;
  identities.clear();
  records = [];
  studentCards.clear();
  input.value = '';
  list.querySelectorAll('textarea').forEach(t => t.value = '');
  list.replaceChildren();
  results.style.display = 'none';
  loading.style.display = 'none';
  form.style.display = 'block';
  status.textContent = message;
  const batchStatus = document.getElementById('ai-batch-status');
  if (batchStatus) { batchStatus.textContent = ''; batchStatus.className = 'small mt-2'; }
  updateSelectedCount();
  send({ type: 'cancel' });
}

const failures = {
  not_connected: 'El motor local no está listo. Vuelve a intentarlo.',
  busy: 'Ya hay una generación en curso.',
  cancelled: 'Generación detenida.',
  invalid_input: 'Usa como máximo 40 filas válidas por lote.',
  model: 'No se pudo inicializar el modelo en este equipo.',
  provider: 'No se pudo completar la generación.',
  invalid_response: 'El formato no pudo procesarse. Reintenta con menos filas.',
  timeout: 'Se ha agotado el tiempo de respuesta. Puedes volver a intentarlo.'
};

function fail(code, detail = '') {
  const retained = pendingInput;
  const safe = Object.hasOwn(failures, code) ? code : 'provider';
  const detailText = detail ? ` [Detalle: ${detail}]` : '';
  reset(failures[safe] + ' [GENERACION_' + safe.toUpperCase() + ']' + detailText);
  input.value = retained;
  status.className = 'alert alert-danger';
  status.setAttribute('role', 'alert');
  status.tabIndex = -1;
  status.focus();
  status.scrollIntoView({ block: 'center' });
}

function progress(stage) {
  document.getElementById('progress-detail').textContent = ({
    waiting: 'Generando en este dispositivo…',
    receiving: 'Recibiendo las recomendaciones…',
    validating: 'Comprobando que cada respuesta corresponde a su alumno…'
  })[stage] || 'Generando recomendaciones…';
}

function expire() { if (Date.now() - last >= 900000) reset('Datos retirados por inactividad.'); }
['pointerdown', 'keydown', 'input'].forEach(type => document.addEventListener(type, () => { expire(); last = Date.now(); }, true));
setInterval(expire, 15000);
document.addEventListener('visibilitychange', expire);
window.addEventListener('pagehide', () => reset());
window.addEventListener('pageshow', e => { if (e.persisted) reset(); });
['clear', 'erase', 'cancel-loading'].forEach(id => document.getElementById(id).addEventListener('click', () => reset('Datos locales retirados. Los correos ya abiertos en Gmail no se eliminan.')));
document.getElementById('example').addEventListener('click', () => { reset(); input.value = 'Alumno1 5 5 6 4 6 7\nAlumno2 6 5 4 3 4 5'; });

const selectAllBtn = document.getElementById('select-all-ai');
const deselectAllBtn = document.getElementById('deselect-all-ai');
const runSelectedBtn = document.getElementById('run-selected-ai');

if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    list.querySelectorAll('.ai-select-check').forEach(cb => { cb.checked = true; });
    updateSelectedCount();
  });
}
if (deselectAllBtn) {
  deselectAllBtn.addEventListener('click', () => {
    list.querySelectorAll('.ai-select-check').forEach(cb => { cb.checked = false; });
    updateSelectedCount();
  });
}
if (runSelectedBtn) {
  runSelectedBtn.addEventListener('click', () => {
    const checkedBoxes = Array.from(list.querySelectorAll('.ai-select-check:checked'));
    const statusEl = document.getElementById('ai-batch-status');
    if (checkedBoxes.length === 0) {
      if (statusEl) {
        statusEl.className = 'small mt-2 text-warning';
        statusEl.textContent = 'Selecciona al menos un alumno marcando su casilla para mejorar con IA.';
      }
      return;
    }
    const selectedIds = checkedBoxes.map(cb => cb.dataset.id);
    const selectedRecords = records.filter(r => selectedIds.includes(r.id));
    if (selectedRecords.length > 0) {
      runEnhanceBatch(selectedRecords);
    }
  });
}

function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (parent === window) { status.textContent = 'Abre index.html para trabajar en la zona aislada.'; return; }
  try {
    pendingInput = input.value; status.className = ''; status.setAttribute('role', 'status');
    const batch = Feedback.prepare(Feedback.parseStudents(input.value));
    if (batch.records.length > 40) throw new Error('Máximo 40 filas por lote.');
    identities = batch.identities; records = batch.records; request = crypto.randomUUID();
    send({ type: 'generate', request, records, model: 'local-pedagogico' });
    input.value = ''; form.style.display = 'none'; loading.style.display = 'flex'; status.textContent = '';
    form.setAttribute('aria-busy', 'true'); progress('waiting'); started = Date.now();
    document.getElementById('elapsed').textContent = 'Tiempo transcurrido: 0 s';
    elapsedTimer = setInterval(() => {
      document.getElementById('elapsed').textContent = `Tiempo transcurrido: ${Math.floor((Date.now() - started) / 1000)} s`;
    }, 1000);
    timeout = setTimeout(() => fail('timeout'), 600000);
  } catch {
    status.textContent = 'Máximo 40 filas por lote. Revisa cabeceras, columnas, correos y valores. Sin cabecera, escribe seis notas, con nombre opcional numéricas 0–10, con total opcional; no se ha enviado esta tabla.';
  }
});

window.addEventListener('message', event => {
  if (event.source !== parent) return;
  expire();
  const message = event.data;
  if (!message) return;

  // Handle selective AI enhancement messages
  if (message.type === 'enhance-progress') {
    if (message.request !== currentEnhanceRequest) return;
    const statusEl = document.getElementById('ai-batch-status');
    if (statusEl) {
      statusEl.className = 'small mt-2 text-primary';
      statusEl.textContent = `Generando con IA para alumno ${message.current} de ${message.total}... (~15 s por alumno)`;
    }
    const cardObj = studentCards.get(message.id);
    if (cardObj) {
      cardObj.methodBadge.textContent = 'Generando con IA... ⏳';
      cardObj.methodBadge.className = 'badge bg-primary text-white border method-badge';
    }
    return;
  }

  if (message.type === 'enhance-student-result') {
    if (message.request !== currentEnhanceRequest) return;
    const cardObj = studentCards.get(message.id);
    if (cardObj && message.studentResponse) {
      const person = identities.get(message.id);
      const resp = message.studentResponse;
      let body = `Hola, ${person.name}:\n\n${resp.intro}\n\n`;
      for (const c of resp.competencias_evaluadas) {
        const val = person.values.find(v => v.competencia === c.nombre_competencia)?.valor ?? '';
        body += `${c.nombre_competencia}\nCalificación: ${val}\nValoración: ${c.rubrica}\nSugerencia: ${c.recomendaciones}\n\n`;
      }
      if (person.total !== null) body += `Nota final introducida por el docente: ${person.total}\n\n`;
      body += `${resp.conclusion}\n\nAtentamente,\nEl Equipo Docente de Cuatrovientos.\n\nMétodo de elaboración: Con IA local ✨. Revisión docente requerida antes de su envío.`;

      cardObj.area.value = body;
      cardObj.methodBadge.textContent = 'Con IA local ✨';
      cardObj.methodBadge.className = 'badge bg-success text-white border method-badge';
      cardObj.check.checked = false;
      cardObj.gmail.disabled = true;
      cardObj.selectCheck.checked = false;
      updateSelectedCount();
    }
    return;
  }

  if (message.type === 'enhance-complete') {
    if (message.request !== currentEnhanceRequest) return;
    currentEnhanceRequest = null;
    setAiButtonsDisabled(false);
    updateSelectedCount();
    const statusEl = document.getElementById('ai-batch-status');
    if (statusEl) {
      statusEl.className = 'small mt-2 text-success fw-bold';
      statusEl.textContent = '✓ Mejora con IA completada para los alumnos seleccionados. Revisa los borradores.';
    }
    return;
  }

  if (message.type === 'enhance-failure') {
    if (message.request !== currentEnhanceRequest) return;
    currentEnhanceRequest = null;
    setAiButtonsDisabled(false);
    updateSelectedCount();
    const statusEl = document.getElementById('ai-batch-status');
    if (statusEl) {
      statusEl.className = 'small mt-2 text-danger fw-bold';
      statusEl.textContent = (message.detail || failures[message.code] || 'No se pudo generar con IA.');
    }
    studentCards.forEach(c => {
      if (c.methodBadge.textContent.includes('...')) {
        c.methodBadge.textContent = 'Propuestas por reglas';
        c.methodBadge.className = 'badge bg-light text-secondary border method-badge';
      }
    });
    return;
  }

  // Handle initial batch generation messages
  if (!request || message.request !== request) return;
  if (message.type === 'progress') {
    progress(message.stage);
    if (message.current && message.total) {
      document.getElementById('progress-detail').textContent += ` Fila ${message.current} de ${message.total}.`;
      if (message.estimate) document.getElementById('progress-detail').textContent += ` Tiempo restante orientativo: ${message.estimate} s.`;
      if (message.stage === 'waiting') {
        clearTimeout(timeout);
        timeout = setTimeout(() => fail('timeout'), 600000);
      }
    }
    return;
  }
  if (message.type === 'failure') { fail(message.code, message.detail); return; }
  if (message.type !== 'result') return;

  try {
    const responses = Feedback.response(JSON.stringify(message.result), records);
    clearTimeout(timeout);
    clearInterval(elapsedTimer);
    pendingInput = '';
    form.setAttribute('aria-busy', 'false');
    loading.style.display = 'none';
    results.style.display = 'block';
    studentCards.clear();

    for (const response of responses) {
      const person = identities.get(response.id);
      const info = message.provenance?.[response.id] || {};
      const method = ({ rules: 'Propuestas por reglas', ai: 'Con IA local', mixed: 'Mixto: IA local y reglas' })[info.method] || 'Propuestas por reglas';
      const reason = ({ not_loaded: 'La IA no estaba cargada.', inference_failed: 'La IA falló; se aplicaron reglas.', incomplete: 'La respuesta de IA se completó con reglas.' })[info.reason] || '';

      let body = `Hola, ${person.name}:\n\n${response.intro}\n\n`;
      for (const c of response.competencias_evaluadas) {
        const value = person.values.find(v => v.competencia === c.nombre_competencia).valor;
        body += `${c.nombre_competencia}\nCalificación: ${value}\nValoración: ${c.rubrica}\nSugerencia: ${c.recomendaciones}\n\n`;
      }
      if (person.total !== null) body += `Nota final introducida por el docente: ${person.total}\n\n`;
      body += `${response.conclusion}\n\nAtentamente,\nEl Equipo Docente de Cuatrovientos.\n\nMétodo de elaboración: ${method}. Revisión docente requerida antes de su envío.`;

      const card = node('article', '', 'list-group-item p-3 mb-3');

      const topBar = node('div', '', 'd-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 pb-2 border-bottom');
      const checkWrap = node('div', '', 'form-check d-flex align-items-center mb-0');
      const selectCheck = node('input', '', 'form-check-input me-2 ai-select-check');
      selectCheck.type = 'checkbox';
      selectCheck.id = `select-ai-${response.id}`;
      selectCheck.dataset.id = response.id;
      const nameLabel = node('label', person.name, 'form-check-label fw-bold mb-0');
      nameLabel.htmlFor = selectCheck.id;
      nameLabel.style.cursor = 'pointer';
      checkWrap.append(selectCheck, nameLabel);

      const actions = node('div', '', 'd-flex align-items-center gap-2');
      const methodBadge = node('span', method + (reason ? ' · ' + reason : ''), 'badge bg-light text-secondary border method-badge');
      const singleAiBtn = node('button', '✨ Mejorar con IA', 'btn btn-sm btn-outline-primary py-0 px-2 btn-ai-single');
      singleAiBtn.type = 'button';
      actions.append(methodBadge, singleAiBtn);
      topBar.append(checkWrap, actions);

      selectCheck.addEventListener('change', updateSelectedCount);
      singleAiBtn.addEventListener('click', () => {
        const target = records.find(r => r.id === response.id);
        if (target) runEnhanceBatch([target]);
      });

      const details = node('details', '', 'draft-details');
      const summary = node('summary');
      const identity = node('span', '', 'draft-identity');
      const email = node('p', person.email + (person.emailExample ? ' (correo de ejemplo: sustituir en Gmail antes de enviar)' : ''));
      const hint = node('span', 'Revisar borrador', 'draft-toggle');
      identity.append(email);
      summary.append(identity, hint);
      details.append(summary);
      details.addEventListener('toggle', () => { hint.textContent = details.open ? 'Cerrar borrador' : 'Revisar borrador'; });

      const label = node('label', 'Revisa y adapta el borrador:');
      const area = node('textarea', '', 'result-text form-control');
      area.value = body;
      area.spellcheck = false;
      area.autocomplete = 'off';
      area.id = 'draft-' + list.childElementCount;
      label.htmlFor = area.id;

      const review = node('label', '', 'd-block my-3');
      const check = node('input');
      check.type = 'checkbox';
      review.append(check, document.createTextNode(' He revisado el contenido, las notas y el destinatario.'));

      const gmail = node('button', 'Generar Gmail', 'btn btn-outline-danger');
      gmail.type = 'button';
      gmail.disabled = true;

      check.addEventListener('change', () => { gmail.disabled = !check.checked || !person.email || !area.value.trim(); });
      area.addEventListener('input', () => { check.checked = false; gmail.disabled = true; });
      gmail.addEventListener('click', () => {
        expire();
        if (!card.isConnected || !check.checked || !person.email) return;
        const url = new URL('https://mail.google.com/mail/');
        url.search = new URLSearchParams({
          view: 'cm',
          fs: '1',
          to: person.email,
          su: 'Retroalimentación: Competencias Clave',
          body: area.value
        });
        window.open(url.href, '_blank', 'noopener,noreferrer');
      });

      details.append(label, area, review, gmail, node('p', 'Al abrir Gmail, el texto y el destinatario se incluyen en su URL y pasan a Google. Comprueba la cuenta institucional y revisa antes de enviar.', 'small mt-2'));
      card.append(topBar, details);
      list.append(card);

      studentCards.set(response.id, { card, area, methodBadge, check, gmail, selectCheck, singleAiBtn, person });
    }

    request = null;
    status.textContent = 'Recomendaciones preparadas. Revisa cada borrador o selecciona alumnos para mejorar con IA.';
    updateSelectedCount();
  } catch (err) {
    console.error('Error procesando respuesta en editor.js:', err);
    fail('invalid_response', err?.message || String(err));
  }
});
