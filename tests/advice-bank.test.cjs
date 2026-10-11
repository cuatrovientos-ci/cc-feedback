const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bank, level, createSelector } = require('../advice-bank.js');
const names = ['Innovación y emprendimiento', 'Trabajo en equipo', 'Capacidad comunicativa', 'Competencia digital', 'Adaptación al entorno', 'Autonomía y responsabilidad'];
test('192 distinct actionable suggestions cover every family and rubric level', () => {
  const all = Object.values(bank).flat(2);
  assert.equal(all.length, 192);
  assert.equal(new Set(all).size, 192);
  for (const tiers of Object.values(bank)) {
    assert.equal(tiers.length, 4);
    for (const variants of tiers) {
      assert.equal(variants.length, 8);
      variants.forEach(text => assert.ok(text.length >= 50 && text.endsWith('.')));
    }
  }
});
test('grade boundaries match rubric levels and invalid grades fail closed', () => {
  [0, 4.99, 5, 6.99, 7, 8.49, 8.5, 10].forEach((n, i) => assert.equal(level(n), Math.floor(i / 2)));
  for (const n of [-1, 11, NaN, Infinity, null, '5']) assert.throws(() => level(n), RangeError);
});
test('every family and level exhausts its variants before repeating, including cycle boundaries', () => {
  const select = createSelector(() => 0.4);
  names.forEach((name, family) => {
    [2, 5, 7, 9].forEach((score, tier) => {
      const first = Array.from({ length: 8 }, () => select(name, score));
      assert.equal(new Set(first).size, 8);
      first.forEach(text => assert.ok(Object.values(bank)[family][tier].includes(text)));
      const second = Array.from({ length: 8 }, () => select(name, score));
      assert.equal(new Set(second).size, 8);
      assert.notEqual(first[7], second[0]);
    });
  });
});
test('custom admin advice wins; seed entries and invalid patterns do not mask the bank', () => {
  const select = createSelector();
  const seed = { pattern: 'equipo', advice: 'Acuerda con el equipo una tarea, un plazo y una forma de revisar juntos su cumplimiento.' };
  assert.ok(bank.teamwork[0].includes(select(names[1], 2, [seed])));
  const custom = { pattern: 'equipo', advice: 'Consejo propio del centro.' };
  for (const grade of [2, 5, 7, 9]) assert.equal(select(names[1], grade, [seed, { pattern: '[' , advice: 'Incorrecto' }, custom]), custom.advice);
  assert.ok(bank.digital[2].includes(select(names[3], 7, null)));
});
test('individual subcompetencies map to their families', () => {
  const select = createSelector();
  for (const [name, key] of [['Emprendimiento', 'innovation'], ['Comunicación escrita', 'communication'], ['Responsabilidad', 'autonomy']]) {
    assert.ok(bank[key][3].includes(select(name, 9)));
  }
});

test('uses administrator edits distributed by the server for the selected level', () => {
  globalThis.LOCAL_ADVICE_BANK = {teamwork: [[], ['Sugerencia guardada por el docente.'], [], []]};
  try {
    const select = createSelector();
    assert.equal(select('Trabajo en equipo', 6), 'Sugerencia guardada por el docente.');
    assert.ok(bank.teamwork[0].includes(select('Trabajo en equipo', 2)));
  } finally { delete globalThis.LOCAL_ADVICE_BANK; }
});
