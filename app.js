/* Sin Humo — interfaz. Los cálculos viven en calc.js */
(() => {
  'use strict';

  const C = window.Calc;
  const KEY = 'sinhumo.v1';
  const HINT_KEY = 'sinhumo.hint-closed';
  const $ = (id) => document.getElementById(id);

  // ---------- Formatos
  const fmtMoney = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const fmtInt = new Intl.NumberFormat('es-ES');
  const fmtDec1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtDayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = (d) => fmtLong.format(C.parse(d)).replace(',', '');
  const plural = (n, one, many) => `${fmtInt.format(n)} ${n === 1 ? one : many}`;
  const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const COLS = [1, 2, 3, 4, 5, 7, 8]; // columna de la rejilla para cada día (6 = separación del finde)
  const STATUS_TEXT = {
    clean: 'sin fumar', one: 'solo 1', broken: '2 o más', pending: 'sin apuntar',
    today: 'hoy, sin apuntar', future: 'todavía no ha llegado', before: 'antes de empezar',
  };

  // ---------- Datos
  const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  function emptyState() {
    return { version: 1, settings: { ...C.DEFAULT_SETTINGS }, days: {}, celebrated: {} };
  }
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
    };
    for (const [d, e] of Object.entries(raw.days || {})) {
      if (isISO(d) && e && Number.isInteger(e.smoked) && e.smoked >= 0) {
        st.days[d] = { smoked: e.smoked, party: C.isFriSat(d) && !!e.party };
      }
    }
    for (const k of Object.keys(raw.celebrated || {})) st.celebrated[k] = true;
    return st;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyState();
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
    const s = state.settings;
    const tot = C.totals(state, t);

    $('stat-money').textContent = fmtMoney.format(tot.money);
    $('stat-cigs').textContent = fmtInt.format(tot.cigs);
    $('stat-packs').textContent = fmtDec1.format(tot.cigs / s.packSize);

    const streak = C.currentStreak(state, t);
    $('stat-streak').textContent = plural(streak, 'día', 'días');
    $('stat-best').textContent = plural(C.bestStreak(state, t), 'día', 'días');
    $('flame').classList.toggle('off', streak === 0);

    $('stat-weeks').textContent = fmtInt.format(C.completedWeeks(state, t).length);
    $('stat-megas').textContent = fmtInt.format(C.megaNights(state, t).length);
    $('stat-clean').textContent = fmtInt.format(tot.clean);

    renderWeek(t);
    renderPending(t);
    renderTodayButton(t);
    renderCalendar(t);
  }

  function renderWeek(t) {
    const start = state.settings.startDate;
    const sun = C.sundayOf(t);
    const block = C.weekBlock(sun, state, t);
    const wrap = $('week-dots');
    wrap.replaceChildren(
      ...block.map((d, i) => {
        const el = document.createElement('div');
        el.className = `wdot s-${d.status}`;
        el.textContent = DOW[i];
        el.title = `${cap(longDate(d.date))}: ${STATUS_TEXT[d.status]}`;
        return el;
      })
    );
    const good = block.filter((d) => C.keepsStreak(d.status)).length;
    $('week-count').textContent = `${good}/5`;

    let msg = '';
    if (!start) msg = '';
    else if (sun < start) msg = `Tu primera semana completa empieza el domingo ${fmtDayMonth.format(C.parse(C.addDays(sun, 7)))}.`;
    else if (block.some((d) => d.status === 'broken')) msg = 'Esta semana se ha cortado. El domingo empieza otra 💪';
    else if (good === 5) msg = '¡Semana completa! 🏆';
    else if (block.some((d) => d.status === 'pending')) msg = 'Te falta apuntar algún día de esta semana.';
    else {
      const left = 5 - good;
      msg = `Llevas ${good} de 5. ${left === 1 ? 'Te falta 1 día' : `Te faltan ${left} días`} para celebrarlo.`;
    }
    if (start && C.isFriSat(t)) msg += ' Finde: si sales y no fumas ninguno, ¡MEGA RACHA! 🪩';
    $('week-msg').textContent = msg.trim();
  }

  function renderPending(t) {
    const pend = C.pendingDays(state, t);
    const banner = $('pending-banner');
    banner.hidden = pend.length === 0;
    if (pend.length) {
      $('pending-text').textContent =
        pend.length === 1
          ? `Te falta apuntar el ${longDate(pend[0])}`
          : `Tienes ${pend.length} días sin apuntar`;
      banner.dataset.date = pend[0];
    }
  }

  function renderTodayButton(t) {
    const e = state.days[t];
    $('btn-today').textContent = e
      ? `Hoy: ${plural(e.smoked, 'cigarro', 'cigarros')} · Editar`
      : 'Apuntar hoy';
    $('btn-today').disabled = !state.settings.startDate;
  }

  // ---------- Calendario
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
    const weekThursdays = new Set(C.completedWeeks(state, t).map((sun) => C.addDays(sun, 4)));

    const cells = [];
    for (let n = 1; n <= daysInMonth; n++) {
      const d = C.fmt(new Date(Date.UTC(view.y, view.m, n)));
      const st = C.dayStatus(d, state, t);
      const e = state.days[d];
      const wd = C.weekday(d);
      const party = !!(e && e.party && C.isFriSat(d));
      const mega = C.isMegaNight(d, e);

      const b = document.createElement('button');
      b.type = 'button';
      b.className = `day s-${st}`;
      if (wd >= 5) b.classList.add('wk');
      if (d === t) b.classList.add('is-today');
      if (mega) b.classList.add('mega');
      b.style.gridColumn = String(COLS[wd]);
      b.dataset.date = d;
      b.disabled = st === 'before' || st === 'future';

      const num = document.createElement('span');
      num.textContent = n;
      b.append(num);
      if (party || weekThursdays.has(d)) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = party ? '🎉' : '🏆';
        b.append(badge);
      }

      let label = `${longDate(d)}: ${STATUS_TEXT[st]}`;
      if (e && st !== 'before' && st !== 'future') label += ` (${plural(e.smoked, 'cigarro', 'cigarros')})`;
      if (party) label += ', saliste de fiesta';
      if (mega) label += ', mega racha';
      if (weekThursdays.has(d)) label += ', semana limpia';
      if (d === t) label += ', hoy';
      b.setAttribute('aria-label', label);
      cells.push(b);
    }
    $('cal-days').replaceChildren(...cells);

    const cur = view.y * 12 + view.m;
    const minM = monthIndex(state.settings.startDate || t);
    $('cal-prev').disabled = cur <= minM;
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
        s.style.gridColumn = String(COLS[i]);
        if (i >= 5) s.className = 'wk';
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

  // ---------- Apuntar un día
  const CHIPS = [0, 1, 2, 3, 5, 10, 20];
  let edit = null; // { date, smoked, party: true | false | null }

  function openDay(d) {
    const t = today();
    const st = C.dayStatus(d, state, t);
    if (st === 'before' || st === 'future') return;
    const e = state.days[d];
    const fs = C.isFriSat(d);
    edit = {
      date: d,
      smoked: e ? e.smoked : 0,
      party: fs ? (e ? !!e.party : null) : false,
    };
    $('day-title').textContent = cap(longDate(d)) + (d === t ? ' · hoy' : '');
    $('party-row').hidden = !fs;
    $('day-delete').hidden = !e;
    renderEditor();
    openSheet($('sheet-day'));
  }

  function renderEditor() {
    const fs = C.isFriSat(edit.date);
    $('step-value').textContent = edit.smoked;
    $('step-minus').disabled = edit.smoked <= 0;
    $('step-plus').disabled = edit.smoked >= 99;

    document.querySelectorAll('#party-row [data-party]').forEach((b) => {
      const v = b.dataset.party === '1';
      b.setAttribute('aria-checked', String(edit.party === v));
    });
    document.querySelector('#party-row .seg').classList.toggle('need', fs && edit.party === null);

    document.querySelectorAll('#chips .chip').forEach((c) => {
      c.classList.toggle('on', Number(c.dataset.n) === edit.smoked);
    });

    const pv = $('day-preview');
    if (fs && edit.party === null) {
      pv.innerHTML = '<p>Dime si has salido de fiesta para calcular lo que te ahorras.</p>';
      $('day-save').disabled = true;
      $('day-save').textContent = 'Elige si has salido';
      return;
    }
    $('day-save').disabled = false;
    $('day-save').textContent = 'Guardar';

    const sv = C.daySavings(edit.date, { smoked: edit.smoked, party: edit.party }, state.settings);
    const pills = [];
    if (edit.smoked === 0) pills.push('<span class="pill p-clean">✓ Día sin fumar</span>');
    else if (edit.smoked === 1) pills.push('<span class="pill p-one">Solo 1 · la racha sigue</span>');
    else pills.push('<span class="pill p-broken">Rompe la racha</span>');
    if (C.isMegaNight(edit.date, edit)) pills.push('<span class="pill p-mega">🪩 MEGA RACHA</span>');

    const line =
      `Te habrías fumado <b>${sv.expected}</b>. ` +
      (sv.cigs > 0
        ? `Ahorras <b>${plural(sv.cigs, 'cigarro', 'cigarros')}</b> y <b>${fmtMoney.format(sv.money)}</b>.`
        : 'Este día no suma ahorro (pero tampoco resta).');
    pv.innerHTML = `<div class="pills">${pills.join('')}</div><p>${line}</p>`;
  }

  function setSmoked(n) {
    edit.smoked = Math.max(0, Math.min(99, n));
    renderEditor();
  }

  function saveDay() {
    if (!edit) return;
    const fs = C.isFriSat(edit.date);
    if (fs && edit.party === null) return;
    state.days[edit.date] = { smoked: edit.smoked, party: fs && !!edit.party };
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

  // ---------- Celebraciones
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
    box.classList.toggle('mega', type === 'mega');
    // reinicia las animaciones
    box.hidden = true;
    void box.offsetHeight;
    box.hidden = false;

    if (type === 'week') {
      const days = C.weekBlock(date, state, t);
      const cigs = days.reduce((a, d) => a + C.savedCigs(d.date, state.days[d.date], state.settings), 0);
      const n = C.completedWeeks(state, t).length;
      $('cel-emoji').textContent = '🏆';
      $('cel-kicker').textContent = 'Racha conseguida';
      $('cel-title').textContent = '¡Semana limpia!';
      $('cel-text').textContent =
        `Del ${weekRange(date)} sin pasar de uno. ` +
        `Esos 5 días te has ahorrado ${plural(cigs, 'cigarro', 'cigarros')} y ${fmtMoney.format(C.moneyFor(cigs, state.settings))}. ` +
        (n === 1 ? '¡Tu primera semana limpia!' : `Ya llevas ${n} semanas limpias.`);
      $('cel-ok').textContent = '¡Seguimos! 💪';
      if (!reducedMotion) Confetti.cannons(1);
      vibrate([60, 40, 60]);
    } else {
      const sv = C.daySavings(date, state.days[date], state.settings);
      const n = C.megaNights(state, t).length;
      const dayName = C.weekday(date) === 5 ? 'viernes' : 'sábado';
      $('cel-emoji').textContent = '🪩';
      $('cel-kicker').textContent = 'Noche de fiesta sin fumar';
      $('cel-title').textContent = 'MEGA RACHA';
      $('cel-text').textContent =
        `Saliste de fiesta el ${dayName} ${fmtDayMonth.format(C.parse(date))} y no te fumaste ni uno. ` +
        `${plural(sv.cigs, 'cigarro', 'cigarros')} y ${fmtMoney.format(sv.money)} que se quedan en tu bolsillo. ` +
        (n === 1 ? '¡Tu primera mega racha!' : `Llevas ${n} mega rachas.`);
      $('cel-ok').textContent = '¡A por la siguiente! 🪩';
      if (!reducedMotion) Confetti.mega();
      vibrate([100, 60, 100, 60, 300]);
    }
    box.scrollTop = 0;
    // sin preventScroll, enfocar el botón durante la animación de entrada desplaza la tarjeta
    setTimeout(() => $('cel-ok').focus({ preventScroll: true }), 50);
  }

  /** "domingo 8 al jueves 12 de noviembre" (o con los dos meses si cambia) */
  function weekRange(sunday) {
    const a = C.parse(sunday);
    const b = C.parse(C.addDays(sunday, 4));
    if (a.getUTCMonth() === b.getUTCMonth()) return `domingo ${a.getUTCDate()} al jueves ${fmtDayMonth.format(b)}`;
    return `domingo ${fmtDayMonth.format(a)} al jueves ${fmtDayMonth.format(b)}`;
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

    function spawn(x, y, n, angle, spread, speed, emoji) {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = speed * (0.45 + Math.random() * 0.75);
        const useEmoji = emoji && Math.random() < 0.1;
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
          color: pick(COLORS),
          shape: useEmoji ? 'emoji' : Math.random() < 0.3 ? 'circle' : 'rect',
          emoji: useEmoji ? pick(emoji) : '',
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

    function cannons(power, emoji) {
      size();
      const n = Math.round(70 * power);
      const sp = Math.max(14, H / 42);
      spawn(-10, H * 0.82, n, -Math.PI / 3.2, 0.7, sp, emoji);
      spawn(W + 10, H * 0.82, n, -Math.PI + Math.PI / 3.2, 0.7, sp, emoji);
    }

    // fuegos arriba y abajo, para no tapar el texto del centro
    let fwTop = true;
    function firework(emoji) {
      const y = fwTop ? 0.06 + Math.random() * 0.14 : 0.78 + Math.random() * 0.12;
      fwTop = !fwTop;
      spawn(W * (0.12 + Math.random() * 0.76), H * y, 55, 0, Math.PI * 2, 8, emoji);
    }

    function mega() {
      const emoji = ['🎉', '🪩', '✨', '⭐', '💸'];
      cannons(1.6, emoji);
      for (let i = 0; i < 40; i++) spawn(Math.random() * W, -20 - Math.random() * 80, 1, Math.PI / 2, 0.6, 3, emoji);
      let k = 0;
      const timer = setInterval(() => {
        k++;
        firework(emoji);
        if (k % 2 === 0) cannons(0.8, emoji);
        if (k >= 8) clearInterval(timer);
      }, 380);
    }

    return { cannons, mega };
  })();

  // ---------- Ajustes
  const parseNum = (v) => Number(String(v).trim().replace(',', '.'));
  const priceText = (n) => n.toFixed(2).replace('.', ',');

  function updateDerived() {
    const price = parseNum($('set-price').value);
    const pack = parseNum($('set-pack').value);
    $('set-derived').textContent =
      price > 0 && Number.isInteger(pack) && pack > 0
        ? `Cada cigarro vale ${fmtMoney.format(price / pack)}.`
        : '';
  }

  function openSettings() {
    const s = state.settings;
    $('set-start').value = s.startDate || today();
    $('set-start').max = today();
    $('set-price').value = priceText(s.packPrice);
    $('set-pack').value = s.packSize;
    $('set-normal').value = s.normalDay;
    $('set-party').value = s.partyDay;
    updateDerived();
    openSheet($('sheet-settings'));
  }

  function saveSettings() {
    const start = $('set-start').value;
    const price = parseNum($('set-price').value);
    const pack = parseNum($('set-pack').value);
    const normal = parseNum($('set-normal').value);
    const party = parseNum($('set-party').value);
    if (!isISO(start) || start > today()) return toast('Elige una fecha de inicio que no sea futura');
    if (!(price > 0)) return toast('El precio del paquete tiene que ser mayor que 0');
    if (!Number.isInteger(pack) || pack < 1) return toast('Cigarros por paquete: un número entero');
    if (!Number.isInteger(normal) || normal < 0) return toast('Día normal: un número entero');
    if (!Number.isInteger(party) || party < 0) return toast('Día de fiesta: un número entero');
    state.settings = { startDate: start, packPrice: Math.round(price * 100) / 100, packSize: pack, normalDay: normal, partyDay: party };
    save();
    closeSheet();
    view = null;
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
      // lo que ya estaba conseguido en la copia no se vuelve a celebrar
      for (const k of C.achievementKeys(next, today())) next.celebrated[k] = true;
      state = next;
      save();
      closeSheet();
      view = null;
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
        c.setAttribute('aria-label', plural(n, 'cigarro', 'cigarros'));
        c.addEventListener('click', () => setSmoked(n));
        return c;
      })
    );
    $('step-minus').addEventListener('click', () => setSmoked(edit.smoked - 1));
    $('step-plus').addEventListener('click', () => setSmoked(edit.smoked + 1));
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
