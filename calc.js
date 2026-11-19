/*
 * Sin Humo — lógica de cálculo (sin dependencias).
 * La usa la app en el navegador (window.Calc) y los tests en Node (require).
 *
 * Reglas (versión 2):
 *  - Cada día se apunta: cervezas (0 o más), si saliste de fiesta (solo jueves,
 *    viernes y sábado) y cuántas tereas fumaste.
 *  - Base del día (lo que habría fumado) = el MAYOR de:
 *      10 (día normal) · 20 (si salí de fiesta) · 5 × cervezas
 *  - Ahorro del día = base − fumadas (puede ser negativo).
 *    Gasto del día = fumadas. Dinero = tereas × (precio cajetilla / tereas por cajetilla).
 *  - Totales: "ahorrado" suma solo los días en positivo; "balance" suma
 *    (base − fumadas) de todos los días, también los negativos. Nada se resta dos veces.
 *  - Color: día normal → verde con 0 o 1, rojo con más.
 *           día con fiesta o cervezas (aunque sea 1) → verde si fumé menos que la base,
 *           ámbar si fumé justo la base, rojo si fumé más.
 *  - 🏆 Mayor logro: salí de fiesta y fumé 0.
 *  - ⭐ Logro de semana: 5 días verdes en la misma semana (lunes a domingo).
 *    Se consigue el día del quinto verde. Como máximo una por semana.
 *  - Un día sin apuntar no cuenta para nada (ni suma ni resta).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    startDate: null, // 'YYYY-MM-DD' desde el que se cuenta
    packPrice: 5,    // € por cajetilla
    packSize: 20,    // tereas por cajetilla
    normalDay: 10,   // tereas en un día normal
    partyDay: 20,    // tereas si salgo de fiesta
    perBeer: 5,      // tereas por cada cerveza
  });

  // ---------- Fechas: siempre 'YYYY-MM-DD'; aritmética en UTC (sin líos de horario de verano)
  function parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function fmt(date) {
    return date.toISOString().slice(0, 10);
  }
  function addDays(s, n) {
    const d = parse(s);
    d.setUTCDate(d.getUTCDate() + n);
    return fmt(d);
  }
  /** 0 = domingo … 6 = sábado */
  function weekday(s) {
    return parse(s).getUTCDay();
  }
  /** Jueves, viernes o sábado: los días en los que se pregunta por la fiesta */
  function isPartyDay(s) {
    const w = weekday(s);
    return w === 4 || w === 5 || w === 6;
  }
  /** Lunes que abre la semana de esa fecha */
  function mondayOf(s) {
    return addDays(s, -((weekday(s) + 6) % 7));
  }
  /** Fecha local de hoy en 'YYYY-MM-DD' */
  function todayISO(now) {
    const d = now || new Date();
    return (
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  // ---------- Un día
  /** Datos del día completos: lo que falte cuenta como 0 cervezas y sin fiesta */
  function clean(date, entry) {
    return {
      smoked: entry.smoked,
      beers: entry.beers || 0,
      party: isPartyDay(date) && !!entry.party,
    };
  }
  function baseFor(date, entry, s) {
    const e = clean(date, entry);
    return Math.max(s.normalDay, e.party ? s.partyDay : 0, s.perBeer * e.beers);
  }
  /** Euros de N tereas, redondeado a céntimos (también negativos) sin errores de coma flotante */
  function moneyFor(n, s) {
    const packCents = Math.round(s.packPrice * 100);
    const cents = Math.round((Math.abs(n) * packCents) / s.packSize);
    return (n < 0 ? -cents : cents) / 100;
  }
  function colorFor(date, entry, s) {
    const e = clean(date, entry);
    if (!e.party && e.beers === 0) return e.smoked <= 1 ? 'green' : 'red';
    const base = baseFor(date, e, s);
    if (e.smoked < base) return 'green';
    if (e.smoked === base) return 'amber';
    return 'red';
  }
  function isTrophy(date, entry) {
    const e = clean(date, entry);
    return e.party && e.smoked === 0;
  }
  /** Todo lo de un día: base, ahorro (con signo), gasto, color y si es 🏆 */
  function dayCalc(date, entry, s) {
    const e = clean(date, entry);
    const base = baseFor(date, e, s);
    const saved = base - e.smoked;
    return {
      ...e,
      base,
      saved,
      savedMoney: moneyFor(saved, s),
      spent: e.smoked,
      spentMoney: moneyFor(e.smoked, s),
      color: colorFor(date, e, s),
      special: e.party || e.beers > 0,
      trophy: isTrophy(date, e),
    };
  }

  // ---------- Estado de un día en el calendario
  /**
   * 'before'  antes de empezar a contar
   * 'future'  todavía no ha llegado
   * 'today'   hoy, sin apuntar
   * 'pending' día pasado sin apuntar
   * 'green' | 'amber' | 'red'
   */
  function dayStatus(date, state, today) {
    const start = state.settings.startDate;
    if (!start || date < start) return 'before';
    if (date > today) return 'future';
    const e = state.days[date];
    if (!e) return date === today ? 'today' : 'pending';
    return colorFor(date, e, state.settings);
  }

  // ---------- Resúmenes
  /** Suma de los días apuntados entre from y to (ambos incluidos), sin salirse de inicio–hoy */
  function summarize(state, from, to, today) {
    const s = state.settings;
    const start = s.startDate;
    const r = { saved: 0, smoked: 0, balance: 0, green: 0, amber: 0, red: 0, logged: 0, trophies: 0 };
    if (!start) return withMoney(r, s);
    for (const [d, entry] of Object.entries(state.days)) {
      if (d < start || d > today || d < from || d > to) continue;
      const c = dayCalc(d, entry, s);
      r.logged++;
      if (c.saved > 0) r.saved += c.saved;
      r.smoked += c.smoked;
      r.balance += c.saved;
      r[c.color]++;
      if (c.trophy) r.trophies++;
    }
    return withMoney(r, s);
  }
  function withMoney(r, s) {
    r.savedMoney = moneyFor(r.saved, s);
    r.spentMoney = moneyFor(r.smoked, s);
    r.balanceMoney = moneyFor(r.balance, s);
    r.packsSmoked = r.smoked / s.packSize;
    return r;
  }

  /** Día en que se consiguió la ⭐ de la semana que empieza ese lunes (el 5.º verde), o null */
  function weekStarDate(monday, state, today) {
    let greens = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (dayStatus(d, state, today) === 'green') {
        greens++;
        if (greens === 5) return d;
      }
    }
    return null;
  }
  /** Semanas con ⭐: [{ monday, date }] */
  function starWeeks(state, today) {
    const start = state.settings.startDate;
    if (!start) return [];
    const out = [];
    for (let m = mondayOf(start); m <= today; m = addDays(m, 7)) {
      const date = weekStarDate(m, state, today);
      if (date) out.push({ monday: m, date });
    }
    return out;
  }
  /** Días 🏆 (fiesta y 0 tereas) */
  function trophyDays(state, today) {
    const start = state.settings.startDate;
    if (!start) return [];
    return Object.keys(state.days)
      .filter((d) => d >= start && d <= today && isTrophy(d, state.days[d]))
      .sort();
  }
  function weekSummary(monday, state, today) {
    const r = summarize(state, monday, addDays(monday, 6), today);
    r.monday = monday;
    r.starDate = weekStarDate(monday, state, today);
    return r;
  }
  function totals(state, today) {
    const start = state.settings.startDate || today;
    const r = summarize(state, start, today, today);
    r.stars = starWeeks(state, today).length;
    return r;
  }
  /** Días pasados (desde el inicio hasta ayer) sin apuntar */
  function pendingDays(state, today) {
    const start = state.settings.startDate;
    if (!start) return [];
    const out = [];
    for (let d = start; d < today; d = addDays(d, 1)) if (!state.days[d]) out.push(d);
    return out;
  }

  // ---------- Celebraciones
  /** Logros conseguidos: 'star:<lunes>' y 'trophy:<fecha>' */
  function achievementKeys(state, today) {
    return [
      ...starWeeks(state, today).map((w) => 'star:' + w.monday),
      ...trophyDays(state, today).map((d) => 'trophy:' + d),
    ];
  }
  /** Logros que todavía no se han celebrado (primero ⭐, luego 🏆, que es el más grande) */
  function newAchievements(state, today) {
    const done = state.celebrated || {};
    return achievementKeys(state, today).filter((k) => !done[k]);
  }

  return {
    DEFAULT_SETTINGS,
    parse, fmt, addDays, weekday, isPartyDay, mondayOf, todayISO,
    clean, baseFor, moneyFor, colorFor, isTrophy, dayCalc,
    dayStatus,
    summarize, weekStarDate, starWeeks, trophyDays, weekSummary, totals, pendingDays,
    achievementKeys, newAchievements,
  };
});
