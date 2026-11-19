/* Sin Humo — interfaz. Los cálculos viven en calc.js */
(() => {
  'use strict';

  const C = window.Calc;
  const KEY = 'sinhumo.v1'; // misma clave de siempre: así no se pierde nada de lo apuntado
  const VERSION = 2;
  const HINT_KEY = 'sinhumo.hint-closed';
  const $ = (id) => document.getElementById(id);

  // ---------- Formatos
  const fmtMoney = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const fmtMoneySigned = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
  const fmtInt = new Intl.NumberFormat('es-ES');
  const fmtIntSigned = new Intl.NumberFormat('es-ES', { signDisplay: 'exceptZero' });
  const fmtDec1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtDayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = (d) => fmtLong.format(C.parse(d)).replace(',', '');
  const plural = (n, one, many) => `${fmtInt.format(n)} ${Math.abs(n) === 1 ? one : many}`;
  const tereas = (n) => plural(n, 'terea', 'tereas');
  const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const colOf = (date) => ((C.weekday(date) + 6) % 7) + 1; // lunes = 1 … domingo = 7
  const STATUS_TEXT = {
    green: 'día verde', amber: 'justo lo normal', red: 'día rojo', pending: 'sin apuntar',
    today: 'hoy, sin apuntar', future: 'todavía no ha llegado', before: 'antes de empezar',
  };

  // ---------- Datos
  const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  function emptyState() {
    return { version: VERSION, settings: { ...C.DEFAULT_SETTINGS }, days: {}, celebrated: {} };
  }
  /** Limpia y completa datos (también los de la versión 1: sin cervezas → 0, sin fiesta → no) */
  function normalize(raw) {
    const st = emptyState();
    if (!raw || typeof raw !== 'object') return st;
    const s = raw.settings || {};
    const num = (v, min, int, def) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && (!int || Number.isInteger(n)) ? n : def;
    };
    const D = C.DEFAULT_SETTINGS;
    st.settings = {
      startDate: isISO(s.startDate) ? s.startDate : null,
      packPrice: num(s.packPrice, 0.01, false, D.packPrice),
      packSize: num(s.packSize, 1, true, D.packSize),
      normalDay: num(s.normalDay, 0, true, D.normalDay),
      partyDay: num(s.partyDay, 0, true, D.partyDay),
      perBeer: num(s.perBeer, 0, true, D.perBeer),
    };
    for (const [d, e] of Object.entries(raw.days || {})) {
      if (isISO(d) && e && Number.isInteger(e.smoked) && e.smoked >= 0) {
        st.days[d] = {
          smoked: e.smoked,
          beers: Number.isInteger(e.beers) && e.beers >= 0 ? e.beers : 0,
          party: C.isPartyDay(d) && !!e.party,
        };
      }
    }
    for (const k of Object.keys(raw.celebrated || {})) {
      if (k.startsWith('star:') || k.startsWith('trophy:')) st.celebrated[k] = true;
    }
    return st;
  }
  /** Los logros que ya existían con las reglas nuevas se cuentan, pero no se celebran */
  function markAllCelebrated(st) {
    for (const k of C.achievementKeys(st, C.todayISO())) st.celebrated[k] = true;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const data = JSON.parse(raw);
      const st = normalize(data);
      if (data.version !== VERSION) {
        markAllCelebrated(st);
        localStorage.setItem(KEY, JSON.stringify(st));
      }
      return st;
    } catch (_) {
      return emptyState();
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      toast('⚠️ No se ha podido guardar en este dispositivo');
      return false;
    }
  }

  let state = load();
  const today = () => C.todayISO();
  let lastToday = today();

  // ---------- Pantalla principal
  function render() {
    const t = today();
    lastToday = t;
    const tot = C.totals(state, t);

    $('stat-balance').textContent = fmtMoneySigned.format(tot.balanceMoney);
    $('stat-balance-cigs').textContent = !tot.logged
      ? 'Apunta tu primer día para empezar'
      : tot.balance >= 0
        ? `${tereas(tot.balance)} menos de lo que fumarías normalmente`
        : `${tereas(-tot.balance)} más de lo normal. Se anota y seguimos 💪`;
    $('stat-saved-money').textContent = fmtMoney.format(tot.savedMoney);
    $('stat-saved-cigs').textContent = tereas(tot.saved);
    $('stat-spent-money').textContent = fmtMoney.format(tot.spentMoney);
    $('stat-spent-cigs').textContent = `${tereas(tot.smoked)} · ${fmtDec1.format(tot.packsSmoked)} cajetillas`;

    $('stat-trophies').textContent = fmtInt.format(tot.trophies);
    $('stat-stars').textContent = fmtInt.format(tot.stars);
    $('stat-green').textContent = fmtInt.format(tot.green);

    renderWeek(t);
    renderPending(t);
    renderTodayButton(t);
    renderCalendar(t);
  }

  // ---------- Resumen de la semana (lunes a domingo)
  let weekMonday = null; // null = la semana de hoy

  function weekRange(monday) {
    const a = C.parse(monday);
    const b = C.parse(C.addDays(monday, 6));
    return a.getUTCMonth() === b.getUTCMonth()
      ? `${a.getUTCDate()} al ${fmtDayMonth.format(b)}`
      : `${fmtDayMonth.format(a)} al ${fmtDayMonth.format(b)}`;
  }

  function renderWeek(t) {
    const start = state.settings.startDate;
    const current = C.mondayOf(t);
    const monday = weekMonday || current;
    const w = C.weekSummary(monday, state, t);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = C.addDays(monday, i);
      days.push({ date, status: C.dayStatus(date, state, t), entry: state.days[date] });
    }

    $('week-title').textContent =
      monday === current ? 'Esta semana' : monday === C.addDays(current, -7) ? 'Semana pasada' : 'Semana';
    $('week-range').textContent = `Del lunes ${weekRange(monday)}`;

    $('week-dots').replaceChildren(
      ...days.map((d, i) => {
        const el = document.createElement('div');
        el.className = `wdot s-${d.status}`;
        el.textContent = DOW[i];
        const trophy = d.entry && C.isTrophy(d.date, d.entry);
        if (trophy) el.classList.add('trophy');
        if (d.date === w.starDate || trophy) {
          const b = document.createElement('span');
          b.className = 'badge';
          b.textContent = trophy ? '🏆' : '⭐';
          el.append(b);
        }
        el.title = `${cap(longDate(d.date))}: ${STATUS_TEXT[d.status]}`;
        return el;
      })
    );

    let msg = '';
    if (start) {
      const open = days.filter((d) => ['today', 'future', 'pending'].includes(d.status)).length;
      if (w.starDate) msg = '⭐ ¡Semana conseguida! 5 días verdes.';
      else if (w.green + open >= 5) {
        const left = 5 - w.green;
        msg = `Llevas ${w.green} de 5 días verdes: ${left === 1 ? 'te falta 1' : `te faltan ${left}`} para la ⭐.`;
      } else if (monday === current) msg = `Llevas ${w.green} de 5 días verdes. Esta semana ya no da para la ⭐, pero cada día verde suma 💪`;
      else msg = `Esta semana se quedó en ${w.green} de 5 días verdes.`;
    }
    $('week-msg').textContent = msg;

    $('w-saved').textContent = fmtInt.format(w.saved);
    $('w-saved-money').textContent = fmtMoney.format(w.savedMoney);
    $('w-spent').textContent = fmtInt.format(w.smoked);
    $('w-spent-money').textContent = fmtMoney.format(w.spentMoney);
    $('w-balance').textContent = fmtIntSigned.format(w.balance);
    $('w-balance-money').textContent = fmtMoneySigned.format(w.balanceMoney);

    const parts = [`✅ ${plural(w.green, 'día verde', 'días verdes')}`];
    if (w.amber) parts.push(`${w.amber} ámbar`);
    if (w.red) parts.push(`${w.red} ${w.red === 1 ? 'rojo' : 'rojos'}`);
    $('w-days').textContent = parts.join(' · ');
    const ach = [];
    if (w.trophies) ach.push(`🏆 ×${w.trophies}`);
    if (w.starDate) ach.push('⭐');
    $('w-achievements').textContent = ach.length ? `Logros: ${ach.join(' · ')}` : 'Sin logros todavía';

    $('week-prev').disabled = !start || monday <= C.mondayOf(start);
    $('week-next').disabled = monday >= current;
  }

  function shiftWeek(delta) {
    const t = today();
    const next = C.addDays(weekMonday || C.mondayOf(t), 7 * delta);
    weekMonday = next >= C.mondayOf(t) ? null : next;
    renderWeek(t);
  }

  function renderPending(t) {
    const pend = C.pendingDays(state, t);
    const banner = $('pending-banner');
    banner.hidden = pend.length === 0;
    if (pend.length) {
      $('pending-text').textContent =
        pend.length === 1 ? `Te falta apuntar el ${longDate(pend[0])}` : `Tienes ${pend.length} días sin apuntar`;
      banner.dataset.date = pend[0];
    }
  }

  function renderTodayButton(t) {
    const e = state.days[t];
    $('btn-today').textContent = e ? `Hoy: ${tereas(e.smoked)} · Editar` : 'Apuntar hoy';
    $('btn-today').disabled = !state.settings.startDate;
  }

  // ---------- Calendario (lunes a domingo)
  let view = null; // { y, m } con m de 0 a 11
  const monthIndex = (iso) => {
    const d = C.parse(iso);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };

  function renderCalendar(t) {
    if (!view) {
      const d = C.parse(t);
      view = { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    }
    const first = new Date(Date.UTC(view.y, view.m, 1));
    $('cal-title').textContent = cap(fmtMonth.format(first));
    const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const starDates = new Set(C.starWeeks(state, t).map((w) => w.date));

    const cells = [];
    for (let n = 1; n <= daysInMonth; n++) {
      const d = C.fmt(new Date(Date.UTC(view.y, view.m, n)));
      const st = C.dayStatus(d, state, t);
      const e = state.days[d];
      const counted = st !== 'before' && st !== 'future';
      const info = e && counted ? C.dayCalc(d, e, state.settings) : null;

      const b = document.createElement('button');
      b.type = 'button';
      b.className = `day s-${st}`;
      if (C.isPartyDay(d)) b.classList.add('wk');
      if (d === t) b.classList.add('is-today');
      if (info && info.trophy) b.classList.add('trophy');
      b.style.gridColumn = String(colOf(d));
      b.dataset.date = d;
      b.disabled = !counted;

      const num = document.createElement('span');
      num.textContent = n;
      b.append(num);
      const badge = (text, cls) => {
        const s = document.createElement('span');
        s.className = `badge ${cls || ''}`;
        s.textContent = text;
        b.append(s);
      };
      if (info && info.trophy) badge('🏆', 'big');
      else if (info && info.party) badge('🎉');
      else if (info && info.beers > 0) badge('🍺');
      if (starDates.has(d)) badge('⭐', 'star');

      let label = `${longDate(d)}: ${STATUS_TEXT[st]}`;
      if (info) {
        label += ` (${tereas(info.smoked)}, lo normal ${info.base})`;
        if (info.party) label += ', saliste de fiesta';
        if (info.beers) label += `, ${plural(info.beers, 'cerveza', 'cervezas')}`;
        if (info.trophy) label += ', mayor logro';
      }
      if (starDates.has(d)) label += ', ⭐ semana conseguida';
      if (d === t) label += ', hoy';
      b.setAttribute('aria-label', label);
      cells.push(b);
    }
    $('cal-days').replaceChildren(...cells);

    const cur = view.y * 12 + view.m;
    $('cal-prev').disabled = cur <= monthIndex(state.settings.startDate || t);
    $('cal-next').disabled = cur >= monthIndex(t);
  }

  function shiftMonth(delta) {
    const i = view.y * 12 + view.m + delta;
    view = { y: Math.floor(i / 12), m: i % 12 };
    renderCalendar(today());
  }

  function renderDow() {
    $('cal-dow').replaceChildren(
      ...DOW.map((l, i) => {
        const s = document.createElement('span');
        s.textContent = l;
        if (i >= 3 && i <= 5) s.className = 'wk'; // jueves, viernes, sábado
        return s;
      })
    );
  }

  // ---------- Hojas inferiores
  let openSheetEl = null;
  let sheetDismissable = true;

  function openSheet(el, dismissable = true) {
    if (openSheetEl && openSheetEl !== el) closeSheet();
    const scrim = $('scrim');
    scrim.hidden = false;
    el.hidden = false;
    void el.offsetHeight; // fuerza el reflow para que se vea la animación
    scrim.classList.add('show');
    el.classList.add('show');
    el.scrollTop = 0;
    openSheetEl = el;
    sheetDismissable = dismissable;
    document.body.classList.add('locked');
  }

  function closeSheet() {
    const el = openSheetEl;
    if (!el) return;
    openSheetEl = null;
    el.classList.remove('show');
    $('scrim').classList.remove('show');
    document.body.classList.remove('locked');
    setTimeout(() => {
      if (openSheetEl !== el) el.hidden = true;
      if (!openSheetEl) $('scrim').hidden = true;
    }, 300);
  }

  // ---------- Apuntar un día: cervezas → fiesta (jue–sáb) → tereas
  const CHIPS = [0, 1, 2, 3, 5, 10, 20];
  let edit = null; // { date, beers, party: true | false | null, smoked }

  function openDay(d) {
    const t = today();
    const st = C.dayStatus(d, state, t);
    if (st === 'before' || st === 'future') return;
    const e = state.days[d];
    const pd = C.isPartyDay(d);
    edit = {
      date: d,
      beers: e ? e.beers || 0 : 0,
      party: pd ? (e ? !!e.party : null) : false,
      smoked: e ? e.smoked : 0,
    };
    $('day-title').textContent = cap(longDate(d)) + (d === t ? ' · hoy' : '');
    $('party-row').hidden = !pd;
    $('smoked-label').textContent = `${pd ? 3 : 2}. ¿Cuántas tereas fumaste?`;
    $('day-delete').hidden = !e;
    renderEditor();
    openSheet($('sheet-day'));
  }

  function baseReason(c) {
    const s = state.settings;
    const beerBase = s.perBeer * c.beers;
    if (c.party && s.partyDay >= beerBase && s.partyDay > s.normalDay) return 'por la fiesta';
    if (beerBase > s.normalDay) return `${plural(c.beers, 'cerveza', 'cervezas')} × ${s.perBeer}`;
    return 'día normal';
  }

  function renderEditor() {
    const pd = C.isPartyDay(edit.date);
    $('beer-value').textContent = edit.beers;
    $('beer-minus').disabled = edit.beers <= 0;
    $('beer-plus').disabled = edit.beers >= 30;
    $('step-value').textContent = edit.smoked;
    $('step-minus').disabled = edit.smoked <= 0;
    $('step-plus').disabled = edit.smoked >= 99;

    document.querySelectorAll('#party-row [data-party]').forEach((b) => {
      b.setAttribute('aria-checked', String(edit.party === (b.dataset.party === '1')));
    });
    document.querySelector('#party-row .seg').classList.toggle('need', pd && edit.party === null);
    document.querySelectorAll('#chips .chip').forEach((c) => {
      c.classList.toggle('on', Number(c.dataset.n) === edit.smoked);
    });

    const pv = $('day-preview');
    if (pd && edit.party === null) {
      pv.innerHTML = '<p>Dime si saliste de fiesta para calcular lo normal de hoy.</p>';
      $('day-save').disabled = true;
      $('day-save').textContent = 'Elige si saliste';
      return;
    }
    $('day-save').disabled = false;
    $('day-save').textContent = 'Guardar';

    const c = C.dayCalc(edit.date, edit, state.settings);
    const pills = [];
    if (c.trophy) pills.push('<span class="pill p-trophy">🏆 MAYOR LOGRO: fiesta sin fumar</span>');
    if (c.color === 'green') pills.push('<span class="pill p-green">✓ Día verde</span>');
    else if (c.color === 'amber') pills.push('<span class="pill p-amber">Justo lo normal</span>');
    else pills.push('<span class="pill p-red">Día rojo · se anota y seguimos</span>');

    let note = '';
    if (!c.special) note = 'Día normal: verde con 0 o 1 tereas.';
    else if (c.color !== 'red') note = `Con fiesta o cervezas: verde si fumas menos de ${c.base}.`;

    pv.innerHTML =
      `<div class="pills">${pills.join('')}</div>` +
      '<div class="calc-grid">' +
      `<div><span>Lo normal</span><b>${c.base}</b><small>${baseReason(c)}</small></div>` +
      `<div><span>Ahorro</span><b>${fmtIntSigned.format(c.saved)}</b><small>${fmtMoneySigned.format(c.savedMoney)}</small></div>` +
      `<div><span>Gasto</span><b>${c.spent}</b><small>${fmtMoney.format(c.spentMoney)}</small></div>` +
      '</div>' +
      (note ? `<p class="preview-note">${note}</p>` : '');
  }

  function setSmoked(n) {
    edit.smoked = Math.max(0, Math.min(99, n));
    renderEditor();
  }
  function setBeers(n) {
    edit.beers = Math.max(0, Math.min(30, n));
    renderEditor();
  }

  function saveDay() {
    if (!edit) return;
    const pd = C.isPartyDay(edit.date);
    if (pd && edit.party === null) return;
    state.days[edit.date] = { smoked: edit.smoked, beers: edit.beers, party: pd && !!edit.party };
    if (!save()) return;
    closeSheet();
    render();
    toast('Guardado ✓');
    setTimeout(checkCelebrations, 350);
  }

  function deleteDay() {
    if (!edit || !state.days[edit.date]) return;
    if (!confirm(`¿Borrar lo apuntado el ${longDate(edit.date)}?`)) return;
    delete state.days[edit.date];
    save();
    closeSheet();
    render();
    toast('Día borrado');
  }

  // ---------- Celebraciones: ⭐ semana (normal) y 🏆 mayor logro (dorada y más grande)
  const queue = [];
  let celebrating = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function checkCelebrations() {
    const fresh = C.newAchievements(state, today());
    if (!fresh.length) return;
    for (const k of fresh) state.celebrated[k] = true;
    save();
    queue.push(...fresh);
    if (!celebrating) nextCelebration();
  }

  function nextCelebration() {
    Confetti.stop();
    const key = queue.shift();
    const box = $('celebrate');
    if (!key) {
      celebrating = false;
      box.hidden = true;
      return;
    }
    celebrating = true;
    const [type, date] = key.split(':');
    const t = today();
    box.classList.toggle('trophy', type === 'trophy');
    // reinicia las animaciones
    box.hidden = true;
    void box.offsetHeight;
    box.hidden = false;

    if (type === 'star') {
      const n = C.starWeeks(state, t).length;
      $('cel-emoji').textContent = '⭐';
      $('cel-kicker').textContent = 'Logro de semana';
      $('cel-title').textContent = '¡5 días verdes!';
      $('cel-text').textContent =
        `Semana del lunes ${weekRange(date)}: ya tienes 5 días verdes. ` +
        (n === 1 ? '¡Tu primera semana con ⭐!' : `Llevas ${n} semanas con ⭐.`);
      $('cel-ok').textContent = '¡Seguimos! 💪';
      if (!reducedMotion) Confetti.cannons(1);
      vibrate([60, 40, 60]);
    } else {
      const c = C.dayCalc(date, state.days[date], state.settings);
      const n = C.trophyDays(state, t).length;
      $('cel-emoji').textContent = '🏆';
      $('cel-kicker').textContent = 'Saliste de fiesta y 0 tereas';
      $('cel-title').textContent = 'MAYOR LOGRO';
      $('cel-text').textContent =
        `El ${longDate(date)} saliste de fiesta y no fumaste ninguna. ` +
        `${tereas(c.saved)} y ${fmtMoney.format(c.savedMoney)} que se quedan en tu bolsillo. ` +
        (n === 1 ? '¡Tu primer 🏆!' : `Ya llevas ${n} 🏆.`);
      $('cel-ok').textContent = '¡A por el siguiente! 🏆';
      if (!reducedMotion) Confetti.mega();
      vibrate([100, 60, 100, 60, 300]);
    }
    box.scrollTop = 0;
    // sin preventScroll, enfocar el botón durante la animación de entrada desplaza la tarjeta
    setTimeout(() => $('cel-ok').focus({ preventScroll: true }), 50);
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) { /* no disponible */ }
  }

  // ---------- Confeti (canvas, sin librerías)
  const Confetti = (() => {
    const canvas = $('confetti');
    const ctx = canvas.getContext('2d');
    const COLORS = ['#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#f87171', '#fde68a', '#2dd4bf'];
    const GOLD = ['#fde68a', '#fbbf24', '#f59e0b', '#fff7d6', '#fcd34d', '#ffffff'];
    const pick = (a) => a[(Math.random() * a.length) | 0];
    let parts = [];
    let raf = 0;
    let W = 0;
    let H = 0;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(x, y, n, angle, spread, speed, opts = {}) {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = speed * (0.45 + Math.random() * 0.75);
        const useEmoji = opts.emoji && Math.random() < 0.1;
        parts.push({
          x, y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          w: 6 + Math.random() * 6,
          h: 9 + Math.random() * 8,
          rot: Math.random() * 6.28,
          vr: (Math.random() - 0.5) * 0.3,
          tilt: Math.random() * 6.28,
          vt: 0.05 + Math.random() * 0.1,
          color: pick(opts.colors || COLORS),
          shape: useEmoji ? 'emoji' : Math.random() < 0.3 ? 'circle' : 'rect',
          emoji: useEmoji ? pick(opts.emoji) : '',
          life: 0,
          max: 220 + Math.random() * 140,
        });
      }
      if (!raf) {
        canvas.classList.add('on');
        raf = requestAnimationFrame(tick);
      }
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);
      parts = parts.filter((p) => p.y < H + 40 && p.life < p.max);
      for (const p of parts) {
        p.life++;
        p.vy += 0.17;
        p.vx *= 0.986;
        p.vy *= 0.986;
        p.x += p.vx + Math.sin(p.life * 0.06 + p.tilt) * 0.5;
        p.y += p.vy;
        p.rot += p.vr;
        p.tilt += p.vt;
        ctx.globalAlpha = p.life > p.max - 40 ? Math.max(0, (p.max - p.life) / 40) : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'emoji') {
          ctx.font = '24px system-ui, sans-serif';
          ctx.fillText(p.emoji, -12, 8);
        } else {
          ctx.fillStyle = p.color;
          if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.w / 2, 0, 6.283);
            ctx.fill();
          } else {
            ctx.scale(1, Math.cos(p.tilt));
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (parts.length) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        ctx.clearRect(0, 0, W, H);
        canvas.classList.remove('on');
      }
    }

    function cannons(power, opts) {
      size();
      const n = Math.round(70 * power);
      const sp = Math.max(14, H / 42);
      spawn(-10, H * 0.82, n, -Math.PI / 3.2, 0.7, sp, opts);
      spawn(W + 10, H * 0.82, n, -Math.PI + Math.PI / 3.2, 0.7, sp, opts);
    }

    // fuegos arriba y abajo, para no tapar el texto del centro
    let fwTop = true;
    function firework(opts) {
      const y = fwTop ? 0.06 + Math.random() * 0.14 : 0.78 + Math.random() * 0.12;
      fwTop = !fwTop;
      spawn(W * (0.12 + Math.random() * 0.76), H * y, 55, 0, Math.PI * 2, 8, opts);
    }

    function mega() {
      const opts = { emoji: ['🏆', '✨', '⭐', '🎉', '💸'], colors: GOLD.concat(COLORS) };
      cannons(1.6, opts);
      for (let i = 0; i < 40; i++) spawn(Math.random() * W, -20 - Math.random() * 80, 1, Math.PI / 2, 0.6, 3, opts);
      let k = 0;
      clearInterval(timer);
      timer = setInterval(() => {
        k++;
        firework(opts);
        if (k % 2 === 0) cannons(0.8, opts);
        if (k >= 8) clearInterval(timer);
      }, 380);
    }
    let timer = 0;
    /** Deja de lanzar fuegos (lo que ya está en el aire termina de caer) */
    function stop() {
      clearInterval(timer);
    }

    return { cannons, mega, stop };
  })();

  // ---------- Ajustes
  const parseNum = (v) => Number(String(v).trim().replace(',', '.'));
  const priceText = (n) => n.toFixed(2).replace('.', ',');

  function updateDerived() {
    const price = parseNum($('set-price').value);
    const pack = parseNum($('set-pack').value);
    $('set-derived').textContent =
      price > 0 && Number.isInteger(pack) && pack > 0 ? `Cada terea vale ${fmtMoney.format(price / pack)}.` : '';
  }

  function openSettings() {
    const s = state.settings;
    $('set-start').value = s.startDate || today();
    $('set-start').max = today();
    $('set-price').value = priceText(s.packPrice);
    $('set-pack').value = s.packSize;
    $('set-normal').value = s.normalDay;
    $('set-party').value = s.partyDay;
    $('set-beer').value = s.perBeer;
    updateDerived();
    openSheet($('sheet-settings'));
  }

  function saveSettings() {
    const start = $('set-start').value;
    const price = parseNum($('set-price').value);
    const pack = parseNum($('set-pack').value);
    const normal = parseNum($('set-normal').value);
    const party = parseNum($('set-party').value);
    const beer = parseNum($('set-beer').value);
    const isCount = (n) => Number.isInteger(n) && n >= 0;
    if (!isISO(start) || start > today()) return toast('Elige una fecha de inicio que no sea futura');
    if (!(price > 0)) return toast('El precio de la cajetilla tiene que ser mayor que 0');
    if (!Number.isInteger(pack) || pack < 1) return toast('Tereas por cajetilla: un número entero');
    if (!isCount(normal)) return toast('Día normal: un número entero');
    if (!isCount(party)) return toast('Día de fiesta: un número entero');
    if (!isCount(beer)) return toast('Por cada cerveza: un número entero');
    state.settings = {
      startDate: start, packPrice: Math.round(price * 100) / 100, packSize: pack,
      normalDay: normal, partyDay: party, perBeer: beer,
    };
    save();
    closeSheet();
    view = null;
    weekMonday = null;
    render();
    toast('Ajustes guardados');
    setTimeout(checkCelebrations, 350);
  }

  async function exportData() {
    const json = JSON.stringify({ app: 'sin-humo', exportedAt: new Date().toISOString(), ...state }, null, 2);
    const name = `sin-humo-copia-${today()}.json`;
    let file = null;
    try {
      file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Copia de Sin Humo' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    const blob = file || new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function importData(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || typeof data.days !== 'object' || !data.settings) throw new Error('formato');
      const next = normalize(data);
      const n = Object.keys(next.days).length;
      if (!confirm(`Esta copia tiene ${plural(n, 'día apuntado', 'días apuntados')}. ¿Reemplazar los datos actuales?`)) return;
      markAllCelebrated(next); // lo que ya estaba conseguido en la copia no se vuelve a celebrar
      state = next;
      save();
      closeSheet();
      view = null;
      weekMonday = null;
      render();
      toast('Copia importada ✓');
      if (!state.settings.startDate) openWelcome();
    } catch (_) {
      toast('Ese archivo no parece una copia de Sin Humo');
    }
  }

  function resetAll() {
    if (!confirm('¿Borrar todos los datos? Esto no se puede deshacer.')) return;
    state = emptyState();
    save();
    closeSheet();
    view = null;
    weekMonday = null;
    render();
    setTimeout(openWelcome, 320);
  }

  // ---------- Bienvenida
  function openWelcome() {
    $('wel-start').value = today();
    $('wel-start').max = today();
    openSheet($('sheet-welcome'), false);
  }
  function startApp() {
    const start = $('wel-start').value;
    if (!isISO(start) || start > today()) return toast('Elige una fecha que no sea futura');
    state.settings.startDate = start;
    save();
    closeSheet();
    view = null;
    render();
    toast('¡A por ello! 💪');
  }

  // ---------- Avisos
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }

  function setupInstallHint() {
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    let closed = false;
    try { closed = localStorage.getItem(HINT_KEY) === '1'; } catch (_) { /* sin almacenamiento */ }
    $('install-hint').hidden = !(isIOS && !standalone && !closed);
    $('hint-close').addEventListener('click', () => {
      $('install-hint').hidden = true;
      try { localStorage.setItem(HINT_KEY, '1'); } catch (_) { /* sin almacenamiento */ }
    });
  }

  // ---------- Eventos
  function bind() {
    $('cal-days').addEventListener('click', (ev) => {
      const b = ev.target.closest('.day');
      if (b && !b.disabled) openDay(b.dataset.date);
    });
    $('cal-prev').addEventListener('click', () => shiftMonth(-1));
    $('cal-next').addEventListener('click', () => shiftMonth(1));
    $('week-prev').addEventListener('click', () => shiftWeek(-1));
    $('week-next').addEventListener('click', () => shiftWeek(1));
    $('btn-today').addEventListener('click', () => openDay(today()));
    $('pending-banner').addEventListener('click', (ev) => {
      const d = ev.currentTarget.dataset.date;
      if (!d) return;
      const p = C.parse(d);
      view = { y: p.getUTCFullYear(), m: p.getUTCMonth() };
      renderCalendar(today());
      openDay(d);
    });

    $('chips').replaceChildren(
      ...CHIPS.map((n) => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'chip';
        c.dataset.n = n;
        c.textContent = n;
        c.setAttribute('aria-label', tereas(n));
        c.addEventListener('click', () => setSmoked(n));
        return c;
      })
    );
    $('step-minus').addEventListener('click', () => setSmoked(edit.smoked - 1));
    $('step-plus').addEventListener('click', () => setSmoked(edit.smoked + 1));
    $('beer-minus').addEventListener('click', () => setBeers(edit.beers - 1));
    $('beer-plus').addEventListener('click', () => setBeers(edit.beers + 1));
    document.querySelectorAll('#party-row [data-party]').forEach((b) =>
      b.addEventListener('click', () => {
        edit.party = b.dataset.party === '1';
        renderEditor();
      })
    );
    $('day-save').addEventListener('click', saveDay);
    $('day-delete').addEventListener('click', deleteDay);

    $('btn-settings').addEventListener('click', openSettings);
    $('set-save').addEventListener('click', saveSettings);
    $('set-close').addEventListener('click', closeSheet);
    ['set-price', 'set-pack'].forEach((id) => $(id).addEventListener('input', updateDerived));
    $('btn-export').addEventListener('click', exportData);
    $('file-import').addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (f) importData(f);
    });
    $('btn-reset').addEventListener('click', resetAll);

    $('wel-go').addEventListener('click', startApp);
    $('cel-ok').addEventListener('click', nextCelebration);

    $('scrim').addEventListener('click', () => { if (sheetDismissable) closeSheet(); });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && openSheetEl && sheetDismissable) closeSheet();
    });

    // Si cambia el día con la app abierta (o al volver a ella), se refresca
    const refreshIfNewDay = () => {
      if (today() !== lastToday) {
        view = null;
        weekMonday = null;
        render();
      }
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfNewDay(); });
    setInterval(refreshIfNewDay, 60 * 1000);

    // Si otra pestaña cambia los datos
    window.addEventListener('storage', (ev) => {
      if (ev.key === KEY) {
        state = load();
        render();
      }
    });
  }

  // ---------- Arranque
  renderDow();
  bind();
  setupInstallHint();
  render();
  if (!state.settings.startDate) openWelcome();
  else setTimeout(checkCelebrations, 400);

  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (_) { /* opcional */ }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* sin modo sin conexión */ });
    });
  }
})();
