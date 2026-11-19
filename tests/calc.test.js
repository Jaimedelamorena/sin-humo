// Pruebas de los cálculos: node --test tests/calc.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

// Noviembre de 2026: dom 15, lun 16, mar 17, mié 18, jue 19, vie 20, sáb 21
// (y la semana anterior: vie 13, sáb 14)
const S = { ...C.DEFAULT_SETTINGS, startDate: '2026-11-01' };
const mk = (days, startDate = '2026-11-01', celebrated = {}) => ({
  settings: { ...C.DEFAULT_SETTINGS, startDate },
  days,
  celebrated,
});
const zero = { smoked: 0, party: false };
const one = { smoked: 1, party: false };

test('fechas de referencia', () => {
  assert.equal(C.weekday('2026-11-13'), 5); // viernes
  assert.equal(C.weekday('2026-11-14'), 6); // sábado
  assert.equal(C.weekday('2026-11-15'), 0); // domingo
  assert.equal(C.weekday('2026-11-17'), 2); // martes
  assert.equal(C.weekday('2026-11-19'), 4); // jueves
  assert.equal(C.sundayOf('2026-11-19'), '2026-11-15');
  assert.equal(C.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(C.addDays('2026-03-28', 2), '2026-03-30'); // cambio de hora
});

test('precio por cigarro: 5 € / 20 = 0,25 €', () => {
  assert.equal(C.moneyFor(1, S), 0.25);
  assert.equal(C.moneyFor(20, S), 5);
});

// ---------- Los tres ejemplos del enunciado
test('Ejemplo: viernes, he salido y no me he fumado ninguno → 20 cigarros y 5 €', () => {
  assert.deepEqual(C.daySavings('2026-11-13', { smoked: 0, party: true }, S), { expected: 20, cigs: 20, money: 5 });
});
test('Ejemplo: martes, me he fumado 1 → 9 cigarros y 2,25 €', () => {
  assert.deepEqual(C.daySavings('2026-11-17', { smoked: 1, party: false }, S), { expected: 10, cigs: 9, money: 2.25 });
});
test('Ejemplo: sábado, no he salido y no me he fumado ninguno → 10 cigarros y 2,50 €', () => {
  assert.deepEqual(C.daySavings('2026-11-14', { smoked: 0, party: false }, S), { expected: 10, cigs: 10, money: 2.5 });
});

// ---------- Resto de reglas de ahorro
test('día normal sin fumar → 10 cigarros y 2,50 €', () => {
  assert.deepEqual(C.daySavings('2026-11-18', zero, S), { expected: 10, cigs: 10, money: 2.5 });
});
test('domingo a jueves son siempre normales aunque se marque fiesta', () => {
  for (const d of ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']) {
    assert.equal(C.expectedCigs(d, true, S), 10, d);
  }
  assert.equal(C.expectedCigs('2026-11-20', true, S), 20);
  assert.equal(C.expectedCigs('2026-11-21', true, S), 20);
  assert.equal(C.expectedCigs('2026-11-20', false, S), 10);
});
test('viernes de fiesta con 1 → 19 cigarros y 4,75 €', () => {
  assert.deepEqual(C.daySavings('2026-11-20', { smoked: 1, party: true }, S), { expected: 20, cigs: 19, money: 4.75 });
});
test('fumar más de lo normal cuenta 0 y no resta', () => {
  assert.deepEqual(C.daySavings('2026-11-17', { smoked: 14, party: false }, S), { expected: 10, cigs: 0, money: 0 });
  assert.deepEqual(C.daySavings('2026-11-17', { smoked: 10, party: false }, S), { expected: 10, cigs: 0, money: 0 });
});

test('totales: suma de los días, sin contar antes del inicio ni el futuro', () => {
  const st = mk(
    {
      '2026-11-10': zero,                       // antes del inicio: no cuenta
      '2026-11-13': { smoked: 0, party: true }, // 20
      '2026-11-14': { smoked: 0, party: false },// 10
      '2026-11-17': one,                        // 9
      '2026-11-18': { smoked: 14, party: false },// 0 (no resta)
      '2026-11-25': zero,                       // futuro: no cuenta
    },
    '2026-11-12'
  );
  const t = C.totals(st, '2026-11-19');
  assert.equal(t.cigs, 39);
  assert.equal(t.money, 9.75);
  assert.equal(t.clean, 2);
  assert.equal(t.one, 1);
  assert.equal(t.broken, 1);
});

test('dinero con otro precio no tiene errores de redondeo', () => {
  const s = { ...S, packPrice: 5.3, packSize: 20 };
  assert.equal(C.moneyFor(3, s), 0.8);
  assert.equal(C.moneyFor(20, s), 5.3);
  assert.equal(C.moneyFor(1000, S), 250);
});

// ---------- Estados del calendario
test('estado del día: 0 sin fumar, 1 solo uno, 2+ rompe, pendiente, hoy, futuro, antes', () => {
  const st = mk({ '2026-11-16': zero, '2026-11-17': one, '2026-11-18': { smoked: 2, party: false } }, '2026-11-15');
  const t = '2026-11-19';
  assert.equal(C.dayStatus('2026-11-14', st, t), 'before');
  assert.equal(C.dayStatus('2026-11-15', st, t), 'pending');
  assert.equal(C.dayStatus('2026-11-16', st, t), 'clean');
  assert.equal(C.dayStatus('2026-11-17', st, t), 'one');
  assert.equal(C.dayStatus('2026-11-18', st, t), 'broken');
  assert.equal(C.dayStatus('2026-11-19', st, t), 'today');
  assert.equal(C.dayStatus('2026-11-20', st, t), 'future');
  assert.deepEqual(C.pendingDays(st, t), ['2026-11-15']);
});

// ---------- Rachas
test('racha: 1 cigarro no rompe, 2 sí', () => {
  const t = '2026-11-19';
  const base = { '2026-11-15': zero, '2026-11-16': one, '2026-11-17': zero, '2026-11-18': one, '2026-11-19': zero };
  assert.equal(C.currentStreak(mk(base, '2026-11-15'), t), 5);
  const roto = { ...base, '2026-11-17': { smoked: 2, party: false } };
  assert.equal(C.currentStreak(mk(roto, '2026-11-15'), t), 2);
  assert.equal(C.bestStreak(mk(roto, '2026-11-15'), t), 2);
});
test('racha: hoy sin apuntar no la rompe; un día pasado sin apuntar sí', () => {
  const t = '2026-11-19';
  const st = mk({ '2026-11-15': zero, '2026-11-16': zero, '2026-11-17': zero, '2026-11-18': zero }, '2026-11-15');
  assert.equal(C.currentStreak(st, t), 4); // hoy (jueves) aún sin apuntar
  delete st.days['2026-11-16']; // se me olvida el lunes
  assert.equal(C.currentStreak(st, t), 2);
  assert.equal(C.bestStreak(st, t), 2);
  st.days['2026-11-16'] = one; // lo relleno después: la racha vuelve
  assert.equal(C.currentStreak(st, t), 4);
});
test('racha: cuenta también los findes; 2+ un sábado de fiesta la rompe', () => {
  const t = '2026-11-16';
  const st = mk({
    '2026-11-12': zero,
    '2026-11-13': { smoked: 0, party: true },
    '2026-11-14': { smoked: 3, party: true },
    '2026-11-15': zero,
    '2026-11-16': zero,
  }, '2026-11-12');
  assert.equal(C.currentStreak(st, t), 2);
  assert.equal(C.bestStreak(st, t), 2);
});
test('racha: hoy con 2+ la deja a 0', () => {
  const st = mk({ '2026-11-18': zero, '2026-11-19': { smoked: 4, party: false } }, '2026-11-18');
  assert.equal(C.currentStreak(st, '2026-11-19'), 0);
});

// ---------- Semana limpia (domingo a jueves)
const fullWeek = { '2026-11-15': zero, '2026-11-16': one, '2026-11-17': zero, '2026-11-18': one, '2026-11-19': zero };
test('semana dom–jue con 0 o 1 cada día → semana limpia', () => {
  assert.deepEqual(C.completedWeeks(mk(fullWeek), '2026-11-19'), ['2026-11-15']);
});
test('semana con un 2, con un día sin apuntar o sin terminar → no', () => {
  assert.deepEqual(C.completedWeeks(mk({ ...fullWeek, '2026-11-17': { smoked: 2, party: false } }), '2026-11-19'), []);
  const sinMartes = { ...fullWeek };
  delete sinMartes['2026-11-17'];
  assert.deepEqual(C.completedWeeks(mk(sinMartes), '2026-11-19'), []);
  const sinJueves = { ...fullWeek };
  delete sinJueves['2026-11-19'];
  assert.deepEqual(C.completedWeeks(mk(sinJueves), '2026-11-19'), []); // jueves = hoy, aún sin apuntar
});
test('el finde no afecta a la semana limpia', () => {
  const st = mk({ ...fullWeek, '2026-11-20': { smoked: 15, party: true }, '2026-11-21': { smoked: 8, party: false } });
  assert.deepEqual(C.completedWeeks(st, '2026-11-21'), ['2026-11-15']);
});
test('semana que empieza antes de la fecha de inicio no cuenta', () => {
  assert.deepEqual(C.completedWeeks(mk(fullWeek, '2026-11-16'), '2026-11-19'), []);
});
test('5 días entre semana repartidos entre dos semanas no cuentan', () => {
  const st = mk({
    '2026-11-11': zero, '2026-11-12': zero, // mié, jue
    '2026-11-15': zero, '2026-11-16': zero, '2026-11-17': zero, // dom, lun, mar
  }, '2026-11-11');
  assert.deepEqual(C.completedWeeks(st, '2026-11-17'), []);
});

// ---------- Mega racha (cada noche de fiesta con 0)
test('mega racha: cada viernes o sábado de fiesta con 0', () => {
  const st = mk({
    '2026-11-13': { smoked: 0, party: true },  // sí
    '2026-11-14': { smoked: 0, party: true },  // sí (dos en el mismo finde)
    '2026-11-20': { smoked: 0, party: false }, // no salí: no
    '2026-11-21': { smoked: 1, party: true },  // 1 cigarro: no
  });
  assert.deepEqual(C.megaNights(st, '2026-11-21'), ['2026-11-13', '2026-11-14']);
});

// ---------- Celebraciones
test('celebraciones: no se repiten y van primero semanas y luego megas', () => {
  const st = mk({ ...fullWeek, '2026-11-20': { smoked: 0, party: true } });
  const t = '2026-11-20';
  assert.deepEqual(C.newAchievements(st, t), ['week:2026-11-15', 'mega:2026-11-20']);
  st.celebrated['week:2026-11-15'] = true;
  assert.deepEqual(C.newAchievements(st, t), ['mega:2026-11-20']);
  st.celebrated['mega:2026-11-20'] = true;
  assert.deepEqual(C.newAchievements(st, t), []);
});
