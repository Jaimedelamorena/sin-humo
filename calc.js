/*
 * Sin Humo — lógica de cálculo (sin dependencias).
 * La usa la app en el navegador (window.Calc) y los tests en Node (require).
 *
 * Reglas:
 *  - Cigarros que me habría fumado: 10 un día normal; 20 un viernes o sábado
 *    en el que salgo de fiesta. Domingo a jueves siempre son días normales.
 *  - Ahorro del día = máx(0, habría fumado − he fumado). Fumar de más no resta.
 *  - Dinero = cigarros ahorrados × (precio del paquete / cigarros por paquete).
 *  - 0 cigarros = "sin fumar", 1 = "solo 1" (no rompe la racha), 2+ rompe.
 *  - Un día pasado sin apuntar rompe la racha hasta que se rellena.
 *    Hoy sin apuntar todavía no rompe nada.
 *  - Semana limpia: domingo a jueves de una misma semana, todos con 0 o 1.
 *  - Mega racha: cada viernes o sábado de fiesta con 0 cigarros.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    startDate: null, // 'YYYY-MM-DD' desde el que se cuenta
    packPrice: 5,    // € por paquete
    packSize: 20,    // cigarros por paquete
    normalDay: 10,   // cigarros que me fumaría un día normal
    partyDay: 20,    // cigarros que me fumaría un viernes/sábado de fiesta
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
  function isFriSat(s) {
    const w = weekday(s);
    return w === 5 || w === 6;
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
  /** Domingo que abre la semana de esa fecha */
  function sundayOf(s) {
    return addDays(s, -weekday(s));
  }

  // ---------- Ahorro de un día
  function expectedCigs(date, party, settings) {
    return isFriSat(date) && party ? settings.partyDay : settings.normalDay;
  }
  function savedCigs(date, entry, settings) {
    return Math.max(0, expectedCigs(date, entry.party, settings) - entry.smoked);
  }
  /** Euros que valen esos cigarros, redondeado a céntimos sin errores de coma flotante */
  function moneyFor(cigs, settings) {
    const packCents = Math.round(settings.packPrice * 100);
    return Math.round((cigs * packCents) / settings.packSize) / 100;
  }
  function daySavings(date, entry, settings) {
    const cigs = savedCigs(date, entry, settings);
    return {
      expected: expectedCigs(date, entry.party, settings),
      cigs,
      money: moneyFor(cigs, settings),
    };
  }

  // ---------- Estado de un día
  /**
   * 'before'  antes de empezar a contar
   * 'future'  todavía no ha llegado
   * 'today'   hoy, sin apuntar (no rompe la racha)
   * 'pending' día pasado sin apuntar (rompe la racha hasta rellenarlo)
   * 'clean'   0 cigarros
   * 'one'     1 cigarro (no rompe la racha)
   * 'broken'  2 o más (rompe la racha)
   */
  function dayStatus(date, state, today) {
    const start = state.settings.startDate;
    if (!start || date < start) return 'before';
    if (date > today) return 'future';
    const e = state.days[date];
    if (!e) return date === today ? 'today' : 'pending';
    if (e.smoked === 0) return 'clean';
    if (e.smoked === 1) return 'one';
    return 'broken';
  }
  function keepsStreak(status) {
    return status === 'clean' || status === 'one';
  }

  // ---------- Rachas
  /** Días seguidos con 0 o 1 que llegan hasta hoy (o hasta ayer si hoy aún no está apuntado) */
  function currentStreak(state, today) {
    let d = today;
    if (dayStatus(d, state, today) === 'today') d = addDays(d, -1);
    let n = 0;
    while (keepsStreak(dayStatus(d, state, today))) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }
  function bestStreak(state, today) {
    const start = state.settings.startDate;
    if (!start) return 0;
    let best = 0;
    let run = 0;
    for (let d = start; d <= today; d = addDays(d, 1)) {
      const st = dayStatus(d, state, today);
      if (keepsStreak(st)) {
        run++;
        if (run > best) best = run;
      } else if (st !== 'today') {
        run = 0;
      }
    }
    return best;
  }

  // ---------- Semana limpia (domingo a jueves)
  function weekBlock(sunday, state, today) {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(sunday, i);
      days.push({ date, status: dayStatus(date, state, today) });
    }
    return days;
  }
  /** Domingos de las semanas dom–jue completadas con 0 o 1 cada día */
  function completedWeeks(state, today) {
    const start = state.settings.startDate;
    if (!start) return [];
    const out = [];
    let sun = sundayOf(start);
    if (sun < start) sun = addDays(sun, 7);
    for (; sun <= today; sun = addDays(sun, 7)) {
      if (weekBlock(sun, state, today).every((d) => keepsStreak(d.status))) out.push(sun);
    }
    return out;
  }

  // ---------- Mega racha (cada viernes/sábado de fiesta con 0)
  function isMegaNight(date, entry) {
    return !!entry && isFriSat(date) && !!entry.party && entry.smoked === 0;
  }
  function megaNights(state, today) {
    const start = state.settings.startDate;
    if (!start) return [];
    return Object.keys(state.days)
      .filter((d) => d >= start && d <= today && isMegaNight(d, state.days[d]))
      .sort();
  }

  // ---------- Totales
  function totals(state, today) {
    const start = state.settings.startDate;
    let cigs = 0, clean = 0, one = 0, broken = 0, logged = 0;
    for (const [d, e] of Object.entries(state.days)) {
      if (!start || d < start || d > today) continue;
      logged++;
      cigs += savedCigs(d, e, state.settings);
      if (e.smoked === 0) clean++;
      else if (e.smoked === 1) one++;
      else broken++;
    }
    return { cigs, money: moneyFor(cigs, state.settings), clean, one, broken, logged };
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
  /** Logros conseguidos: 'week:<domingo>' y 'mega:<fecha>'. Primero semanas, luego megas. */
  function achievementKeys(state, today) {
    return [
      ...completedWeeks(state, today).map((d) => 'week:' + d),
      ...megaNights(state, today).map((d) => 'mega:' + d),
    ];
  }
  /** Logros que todavía no se han celebrado */
  function newAchievements(state, today) {
    const done = state.celebrated || {};
    return achievementKeys(state, today).filter((k) => !done[k]);
  }

  return {
    DEFAULT_SETTINGS,
    parse, fmt, addDays, weekday, isFriSat, todayISO, sundayOf,
    expectedCigs, savedCigs, moneyFor, daySavings,
    dayStatus, keepsStreak,
    currentStreak, bestStreak,
    weekBlock, completedWeeks,
    isMegaNight, megaNights,
    totals, pendingDays,
    achievementKeys, newAchievements,
  };
});
