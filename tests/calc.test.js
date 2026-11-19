// Pruebas de los cálculos: node --test tests/calc.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

// Noviembre de 2026: lun 16, mar 17, mié 18, jue 19, vie 20, sáb 21, dom 22
const S = { ...C.DEFAULT_SETTINGS, startDate: '2026-11-01' };
const mk = (days, startDate = '2026-11-01', celebrated = {}) => ({
  settings: { ...C.DEFAULT_SETTINGS, startDate },
  days,
  celebrated,
});
const TUE = '2026-11-17';
const THU = '2026-11-19';
const pick = (c) => ({
  base: c.base, saved: c.saved, savedMoney: c.savedMoney,
  spent: c.spent, spentMoney: c.spentMoney, color: c.color, trophy: c.trophy,
});

test('fechas de referencia', () => {
  assert.equal(C.weekday('2026-11-16'), 1); // lunes
  assert.equal(C.weekday(THU), 4);
  assert.equal(C.weekday('2026-11-22'), 0); // domingo
  assert.equal(C.mondayOf('2026-11-22'), '2026-11-16');
  assert.equal(C.mondayOf('2026-11-16'), '2026-11-16');
  assert.equal(C.mondayOf(THU), '2026-11-16');
  assert.deepEqual(['2026-11-18', THU, '2026-11-20', '2026-11-21', '2026-11-22'].map(C.isPartyDay), [false, true, true, true, false]);
  assert.equal(C.addDays('2026-03-28', 2), '2026-03-30'); // cambio de hora
});

// ---------- Los 8 ejemplos del enunciado
const EJEMPLOS = [
  ['Día normal, 1', TUE, { smoked: 1 }, { base: 10, saved: 9, savedMoney: 2.25, spent: 1, spentMoney: 0.25, color: 'green', trophy: false }],
  ['Día normal, 4', TUE, { smoked: 4 }, { base: 10, saved: 6, savedMoney: 1.5, spent: 4, spentMoney: 1, color: 'red', trophy: false }],
  ['Día normal, 12', TUE, { smoked: 12 }, { base: 10, saved: -2, savedMoney: -0.5, spent: 12, spentMoney: 3, color: 'red', trophy: false }],
  ['Jueves de fiesta, 10', THU, { smoked: 10, party: true }, { base: 20, saved: 10, savedMoney: 2.5, spent: 10, spentMoney: 2.5, color: 'green', trophy: false }],
  ['Jueves de fiesta, 20', THU, { smoked: 20, party: true }, { base: 20, saved: 0, savedMoney: 0, spent: 20, spentMoney: 5, color: 'amber', trophy: false }],
  ['Jueves de fiesta, 0 → 🏆', THU, { smoked: 0, party: true }, { base: 20, saved: 20, savedMoney: 5, spent: 0, spentMoney: 0, color: 'green', trophy: true }],
  ['3 cervezas, 5', TUE, { smoked: 5, beers: 3 }, { base: 15, saved: 10, savedMoney: 2.5, spent: 5, spentMoney: 1.25, color: 'green', trophy: false }],
  ['Jueves sin salir, 2', THU, { smoked: 2, party: false }, { base: 10, saved: 8, savedMoney: 2, spent: 2, spentMoney: 0.5, color: 'red', trophy: false }],
];
for (const [name, date, entry, want] of EJEMPLOS) {
  test(`Ejemplo: ${name}`, () => {
    assert.deepEqual(pick(C.dayCalc(date, entry, S)), want);
  });
}

// ---------- Base del día
test('base = el mayor entre 10, 20 si fiesta y 5 × cervezas', () => {
  assert.equal(C.baseFor(TUE, { smoked: 0 }, S), 10);
  assert.equal(C.baseFor(TUE, { smoked: 0, beers: 2 }, S), 10);
  assert.equal(C.baseFor(TUE, { smoked: 0, beers: 3 }, S), 15);
  assert.equal(C.baseFor(THU, { smoked: 0, party: true, beers: 3 }, S), 20);
  assert.equal(C.baseFor(THU, { smoked: 0, party: true, beers: 6 }, S), 30);
});
test('la fiesta solo cuenta jueves, viernes y sábado', () => {
  assert.equal(C.baseFor('2026-11-18', { smoked: 0, party: true }, S), 10); // miércoles
  assert.equal(C.baseFor('2026-11-22', { smoked: 0, party: true }, S), 10); // domingo
  assert.equal(C.baseFor('2026-11-20', { smoked: 0, party: true }, S), 20); // viernes
  assert.equal(C.baseFor('2026-11-21', { smoked: 0, party: true }, S), 20); // sábado
  assert.equal(C.isTrophy('2026-11-18', { smoked: 0, party: true }), false);
});
test('días guardados con la versión anterior: sin cervezas ni fiesta cuentan como 0 y no', () => {
  assert.deepEqual(pick(C.dayCalc(THU, { smoked: 0 }, S)), { base: 10, saved: 10, savedMoney: 2.5, spent: 0, spentMoney: 0, color: 'green', trophy: false });
  assert.equal(C.dayCalc('2026-11-20', { smoked: 0, party: true }, S).trophy, true); // viernes de fiesta antiguo
});

// ---------- Color
test('día normal: verde con 0 o 1, rojo con 2 o más (aunque sea 10)', () => {
  assert.equal(C.colorFor(TUE, { smoked: 0 }, S), 'green');
  assert.equal(C.colorFor(TUE, { smoked: 1 }, S), 'green');
  assert.equal(C.colorFor(TUE, { smoked: 2 }, S), 'red');
  assert.equal(C.colorFor(TUE, { smoked: 10 }, S), 'red');
});
test('con 1 sola cerveza ya es día de cervezas: verde < base, ámbar = base, rojo > base', () => {
  assert.equal(C.colorFor(TUE, { smoked: 9, beers: 1 }, S), 'green');
  assert.equal(C.colorFor(TUE, { smoked: 10, beers: 1 }, S), 'amber');
  assert.equal(C.colorFor(TUE, { smoked: 11, beers: 1 }, S), 'red');
  assert.equal(C.colorFor(TUE, { smoked: 15, beers: 3 }, S), 'amber');
});

// ---------- Dinero
test('dinero sin errores de redondeo, también en negativo', () => {
  assert.equal(C.moneyFor(1, S), 0.25);
  assert.equal(C.moneyFor(-2, S), -0.5);
  assert.equal(C.moneyFor(1000, S), 250);
  const s = { ...S, packPrice: 5.3 };
  assert.equal(C.moneyFor(3, s), 0.8);
  assert.equal(C.moneyFor(-3, s), -0.8);
});

// ---------- Resúmenes: ahorro solo positivo, balance con todo, sin restar dos veces
test('resumen: ahorrado solo suma lo positivo; el balance suma (base − fumadas) de todo', () => {
  const st = mk({
    '2026-11-16': { smoked: 1 },                 // +9
    '2026-11-17': { smoked: 12 },                // −2
    '2026-11-19': { smoked: 0, party: true },    // +20 🏆
    '2026-11-20': { smoked: 20, party: true },   // 0 ámbar
    '2026-11-21': { smoked: 5, beers: 3 },       // +10
  }, '2026-11-16');
  const r = C.totals(st, '2026-11-22');
  assert.equal(r.saved, 39);
  assert.equal(r.savedMoney, 9.75);
  assert.equal(r.smoked, 38);
  assert.equal(r.spentMoney, 9.5);
  assert.equal(r.balance, 37);          // 9 − 2 + 20 + 0 + 10
  assert.equal(r.balanceMoney, 9.25);
  assert.notEqual(r.balance, r.saved - r.smoked); // el balance NO es ahorro − gasto
  assert.equal(r.green, 3);
  assert.equal(r.amber, 1);
  assert.equal(r.red, 1);
  assert.equal(r.trophies, 1);
  assert.equal(r.packsSmoked, 1.9);
});
test('el total puede quedar en negativo y los días sin apuntar no cuentan', () => {
  const st = mk({ '2026-11-16': { smoked: 15 }, '2026-11-18': { smoked: 11 } }, '2026-11-16');
  const r = C.totals(st, '2026-11-18');
  assert.equal(r.balance, -6);
  assert.equal(r.balanceMoney, -1.5);
  assert.equal(r.saved, 0);
  assert.deepEqual(C.pendingDays(st, '2026-11-18'), ['2026-11-17']);
});
test('no cuentan días antes del inicio ni futuros', () => {
  const st = mk({ '2026-11-10': { smoked: 0 }, '2026-11-17': { smoked: 0 }, '2026-11-25': { smoked: 0 } }, '2026-11-16');
  assert.equal(C.totals(st, '2026-11-19').balance, 10);
});

// ---------- ⭐ Semana (lunes a domingo)
test('⭐ con el 5.º día verde de la semana, aunque no haya terminado; los 🏆 cuentan', () => {
  const st = mk({
    '2026-11-16': { smoked: 0 },
    '2026-11-17': { smoked: 3 },                // rojo, no cuenta pero no reinicia
    '2026-11-18': { smoked: 1 },
    '2026-11-19': { smoked: 0, party: true },   // 🏆 (verde)
    '2026-11-20': { smoked: 20, party: true },  // ámbar, no cuenta
    '2026-11-21': { smoked: 9, beers: 2 },      // verde
  });
  assert.equal(C.weekStarDate('2026-11-16', st, '2026-11-21'), null); // 4 verdes
  st.days['2026-11-22'] = { smoked: 1 };
  assert.equal(C.weekStarDate('2026-11-16', st, '2026-11-22'), '2026-11-22');
  assert.deepEqual(C.starWeeks(st, '2026-11-22'), [{ monday: '2026-11-16', date: '2026-11-22' }]);
});
test('⭐ como máximo una por semana y no se juntan semanas distintas', () => {
  const days = {};
  for (let i = 0; i < 7; i++) days[C.addDays('2026-11-16', i)] = { smoked: 0 };
  const st = mk(days);
  assert.equal(C.starWeeks(st, '2026-11-22').length, 1);
  assert.equal(C.weekStarDate('2026-11-16', st, '2026-11-22'), '2026-11-20');
  const split = mk({
    '2026-11-13': { smoked: 0 }, '2026-11-14': { smoked: 0 }, '2026-11-15': { smoked: 0 }, // vie–dom
    '2026-11-16': { smoked: 0 }, '2026-11-17': { smoked: 0 },                               // lun–mar
  });
  assert.equal(C.starWeeks(split, '2026-11-17').length, 0);
});

// ---------- Celebraciones
test('celebraciones: no se repiten; primero ⭐ y luego 🏆', () => {
  const days = {};
  for (let i = 0; i < 4; i++) days[C.addDays('2026-11-16', i)] = { smoked: 0 };
  days['2026-11-20'] = { smoked: 0, party: true };
  const st = mk(days);
  const t = '2026-11-20';
  assert.deepEqual(C.newAchievements(st, t), ['star:2026-11-16', 'trophy:2026-11-20']);
  st.celebrated['star:2026-11-16'] = true;
  st.celebrated['trophy:2026-11-20'] = true;
  assert.deepEqual(C.newAchievements(st, t), []);
});
