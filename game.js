/* Station Halcyon: Split Signal
 * A two-player co-op, point-and-click escape room. Each player runs the game
 * on their own device; the rooms hold each other's clues, so players must talk.
 */
(() => {
  'use strict';

  const VS = '︎'; // force text (non-emoji) rendering for symbols

  // ---------- Puzzle data ----------

  // Constellations: polylines in a 100x100 box. `cat` = catalogue number.
  const CONSTELLATIONS = {
    zigzag:   { cat: 7, lines: [[[10, 30], [30, 70], [50, 40], [70, 70], [90, 30]]] },
    zigzagUp: { cat: 2, lines: [[[10, 70], [30, 30], [50, 60], [70, 30], [90, 70]]] },
    dipperR:  { cat: 4, lines: [[[10, 50], [10, 80], [40, 80], [40, 50], [10, 50]], [[40, 50], [60, 40], [75, 25], [92, 20]]] },
    dipperL:  { cat: 9, lines: [[[90, 50], [90, 80], [60, 80], [60, 50], [90, 50]], [[60, 50], [40, 40], [25, 25], [8, 20]]] },
    cross:    { cat: 5, lines: [[[50, 8], [50, 92]], [[15, 38], [85, 38]]] },
    ex:       { cat: 8, lines: [[[15, 15], [85, 85]], [[85, 15], [15, 85]]] },
    kite:     { cat: 3, lines: [[[50, 8], [85, 45], [50, 82], [15, 45], [50, 8]], [[50, 82], [50, 96]]] },
    kiteUp:   { cat: 6, lines: [[[50, 18], [85, 55], [50, 92], [15, 55], [50, 18]], [[50, 18], [50, 4]]] },
    tri:      { cat: 1, lines: [[[20, 80], [50, 20], [80, 80], [20, 80]], [[80, 80], [95, 60]]] },
  };
  const LOCKER_PLATES = ['zigzag', 'dipperR', 'cross', 'kite'];
  const LOCKER_CODE = LOCKER_PLATES.map(k => CONSTELLATIONS[k].cat).join(''); // 7453
  const CHART_ORDER = ['kiteUp', 'zigzagUp', 'dipperL', 'cross', 'tri', 'zigzag', 'ex', 'kite', 'dipperR'];

  const COLORS = { R: '#f56565', G: '#48bb78', B: '#4299e1', Y: '#ecc94b' };
  const BEACON_SEQ = ['Y', 'B', 'R', 'B', 'G'];

  const LETTER_GRID = ['XQCLA', 'RTSPO', 'MIVKD', 'HAYER', 'GTWSN'];
  const HOLES = [[0, 2], [1, 4], [2, 0], [3, 3], [4, 1]]; // spells COMET
  const PASSWORD = 'COMET';

  // Course as the Commander sees it (north = up). The Engineer sees it rotated.
  const COURSE = [[3, 1], [3, 0], [2, 0], [1, 0], [1, 1], [1, 2], [2, 2], [2, 3]];

  const PRESSURES = { tri: 6, circ: 2, sq: 9 };
  const SHAPE_SYM = { tri: '▲', circ: '●', sq: '■' };
  const GAUGE_ORDER = ['sq', 'circ', 'tri'];
  const VALVE_ORDER = ['tri', 'circ', 'sq'];

  const CIPHER = [
    ['☉', 4], ['☾', 7], ['★', 1], ['☄', 9], ['♄', 2],
    ['♃', 6], ['♂', 3], ['♀', 8], ['⊕', 5], ['✦', 0],
  ];
  const HATCH_SYMBOLS = ['♂', '♃', '☾', '♄'];
  const CMD_AIRLOCK = HATCH_SYMBOLS.map(s => CIPHER.find(c => c[0] === s)[1]).join(''); // 3672

  const MORSE = ['-----', '.----', '..---', '...--', '....-', '.....', '-....', '--...', '---..', '----.'];
  const ENG_AIRLOCK = '3806';

  // ---------- State ----------

  const SAVE_PREFIX = 'halcyon-save-v2-';
  let role = null;
  let state = null;
  let view = 'w1';
  let prevView = 'w1';
  let ui = {}; // transient per-view state (keypad entry etc.)
  let selected = null; // selected inventory item

  function freshState() {
    return { solved: {}, items: [], taken: {}, start: Date.now(), end: null };
  }
  function load(r) {
    try { const raw = localStorage.getItem(SAVE_PREFIX + r); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(SAVE_PREFIX + role, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  const isSolved = id => !!state.solved[id];
  const hasItem = id => state.items.includes(id);
  function solve(id) { state.solved[id] = true; save(); }
  function take(id) {
    if (state.taken[id]) return;
    state.taken[id] = true;
    state.items.push(id);
    save();
    renderInventory();
    say(`Picked up: ${ITEMS[id].name}. Click it in your inventory to select it, and click again to look closer.`);
  }

  // ---------- Small helpers ----------

  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const prettyMorse = m => m.split('').map(ch => (ch === '.' ? '•' : '—')).join(' ');

  let captionTimer;
  function say(msg, kind = '') {
    const c = $('#caption');
    c.textContent = msg;
    c.className = `caption show ${kind}`;
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => c.classList.remove('show'), kind === 'hint' ? 9000 : 4200);
  }

  function rng(seed) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  // ---------- SVG building blocks ----------

  const DEFS = `<defs>
    <linearGradient id="gWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262e45"/><stop offset="1" stop-color="#171c2c"/></linearGradient>
    <linearGradient id="gWallEng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2a2a"/><stop offset="1" stop-color="#1a1818"/></linearGradient>
    <linearGradient id="gFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2030"/><stop offset="1" stop-color="#090b12"/></linearGradient>
    <linearGradient id="gMetal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4b5470"/><stop offset=".5" stop-color="#7c87a6"/><stop offset="1" stop-color="#454d66"/></linearGradient>
    <linearGradient id="gMetalV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c7694"/><stop offset="1" stop-color="#3a4157"/></linearGradient>
    <linearGradient id="gDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#323a50"/><stop offset="1" stop-color="#1c2131"/></linearGradient>
    <linearGradient id="gPipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3b8"/><stop offset=".45" stop-color="#5d667d"/><stop offset="1" stop-color="#2f3545"/></linearGradient>
    <linearGradient id="gPipeV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa3b8"/><stop offset=".45" stop-color="#5d667d"/><stop offset="1" stop-color="#2f3545"/></linearGradient>
    <linearGradient id="gPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe3c4"/><stop offset="1" stop-color="#d9c9a2"/></linearGradient>
    <radialGradient id="gSpace" cx=".3" cy=".3" r="1"><stop offset="0" stop-color="#1d2a5e"/><stop offset=".6" stop-color="#0a0e22"/><stop offset="1" stop-color="#03040a"/></radialGradient>
    <radialGradient id="gPlanet" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#90cdf4"/><stop offset=".5" stop-color="#2b6cb0"/><stop offset="1" stop-color="#0c1b3a"/></radialGradient>
    <radialGradient id="gVignette" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>
    <radialGradient id="gUV" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#9f7aea" stop-opacity=".45"/><stop offset="1" stop-color="#9f7aea" stop-opacity="0"/></radialGradient>
    <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="fSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <pattern id="pHaz" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="24" fill="#d69e2e"/><rect x="12" width="12" height="24" fill="#1a1a1a"/></pattern>
    <pattern id="pGrate" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#141824"/><rect x="1" y="1" width="8" height="8" fill="#0a0d15"/></pattern>
    <clipPath id="cWin"><rect x="208" y="88" width="384" height="194" rx="24"/></clipPath>
  </defs>`;

  function roomShell(eng) {
    let s = `<rect width="800" height="600" fill="url(#${eng ? 'gWallEng' : 'gWall'})"/>`;
    for (let x = 100; x < 800; x += 100) s += `<line x1="${x}" y1="56" x2="${x}" y2="500" stroke="#0006" stroke-width="2"/><line x1="${x + 2}" y1="56" x2="${x + 2}" y2="500" stroke="#ffffff0a" stroke-width="1"/>`;
    s += `<rect width="800" height="56" fill="#10131d"/><rect y="50" width="800" height="6" fill="#2e3550"/>`;
    s += `<rect x="150" y="16" width="160" height="10" rx="5" fill="${eng ? '#f6ad5555' : '#bee3f855'}"/><rect x="490" y="16" width="160" height="10" rx="5" fill="${eng ? '#f6ad5555' : '#bee3f855'}"/>`;
    s += `<polygon points="0,500 800,500 800,600 0,600" fill="url(#gFloor)"/><rect y="496" width="800" height="6" fill="#2e3550"/>`;
    for (let i = -6; i <= 14; i++) s += `<line x1="${i * 60}" y1="502" x2="${400 + (i * 60 - 400) * 1.6}" y2="600" stroke="#ffffff08"/>`;
    return s;
  }
  const closeBg = (c1 = '#1d2336', c2 = '#0b0e17') => `<defs><radialGradient id="gClose" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect width="800" height="600" fill="url(#gClose)"/>`;
  const vignette = '<rect width="800" height="600" fill="url(#gVignette)" pointer-events="none"/>';

  function constellationG(key, x, y, size, { line = '#5a6fa8', star = '#fff', width = 2 } = {}) {
    const c = CONSTELLATIONS[key];
    const pts = new Map();
    let s = `<g transform="translate(${x},${y}) scale(${size / 100})">`;
    for (const l of c.lines) {
      s += `<polyline points="${l.map(p => p.join(',')).join(' ')}" fill="none" stroke="${line}" stroke-width="${width}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
      for (const p of l) pts.set(p.join(','), p);
    }
    for (const p of pts.values()) s += `<circle cx="${p[0]}" cy="${p[1]}" r="${Math.max(2.2, 300 / size)}" fill="${star}"/>`;
    return s + '</g>';
  }

  function gaugeG(shape, value, cx, cy, r, labels = true) {
    const ang = v => (-120 + (v / 9) * 240 - 90) * Math.PI / 180;
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0a0f1e" stroke="#59637d" stroke-width="${r * 0.09}"/>`;
    for (let i = 0; i <= 9; i++) {
      const a = ang(i), big = i % 9 === 0;
      s += `<line x1="${cx + r * 0.85 * Math.cos(a)}" y1="${cy + r * 0.85 * Math.sin(a)}" x2="${cx + r * (big ? 0.66 : 0.73) * Math.cos(a)}" y2="${cy + r * (big ? 0.66 : 0.73) * Math.sin(a)}" stroke="#9fb3e8" stroke-width="${big ? r * 0.045 : r * 0.03}"/>`;
    }
    if (labels) {
      s += `<text x="${cx - r * 0.45}" y="${cy + r * 0.62}" fill="#8a97b8" font-size="${r * 0.15}" class="mono" text-anchor="middle">MIN</text>`;
      s += `<text x="${cx + r * 0.45}" y="${cy + r * 0.62}" fill="#8a97b8" font-size="${r * 0.15}" class="mono" text-anchor="middle">MAX</text>`;
    }
    const a = ang(value);
    s += `<line x1="${cx - r * 0.12 * Math.cos(a)}" y1="${cy - r * 0.12 * Math.sin(a)}" x2="${cx + r * 0.78 * Math.cos(a)}" y2="${cy + r * 0.78 * Math.sin(a)}" stroke="#fc8181" stroke-width="${r * 0.05}" stroke-linecap="round"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${r * 0.08}" fill="#dfe7ff"/>`;
    s += `<text x="${cx}" y="${cy + r * 1.38}" fill="#f6ad55" font-size="${r * 0.32}" text-anchor="middle">${SHAPE_SYM[shape]}</text>`;
    return s;
  }

  function cipherG(cx, cy, R) {
    const k = R / 140;
    let s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#b7791f" stroke="#744210" stroke-width="${6 * k}"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${R - 8 * k}" fill="#2a2216"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${88 * k}" fill="#d69e2e" stroke="#744210" stroke-width="${3 * k}"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${16 * k}" fill="#744210"/>`;
    CIPHER.forEach(([sym, digit], i) => {
      const a = (i / CIPHER.length) * Math.PI * 2 - Math.PI / 2;
      const a2 = a + Math.PI / CIPHER.length;
      s += `<line x1="${cx + 88 * k * Math.cos(a2)}" y1="${cy + 88 * k * Math.sin(a2)}" x2="${cx + (R - 8 * k) * Math.cos(a2)}" y2="${cy + (R - 8 * k) * Math.sin(a2)}" stroke="#5a4520" stroke-width="${2 * k}"/>`;
      s += `<line x1="${cx + 16 * k * Math.cos(a2)}" y1="${cy + 16 * k * Math.sin(a2)}" x2="${cx + 88 * k * Math.cos(a2)}" y2="${cy + 88 * k * Math.sin(a2)}" stroke="#975a16" stroke-width="${1.5 * k}"/>`;
      s += `<text x="${cx + 112 * k * Math.cos(a)}" y="${cy + 112 * k * Math.sin(a)}" text-anchor="middle" dominant-baseline="central" font-size="${26 * k}" fill="#fbd38d" class="sym">${sym}${VS}</text>`;
      s += `<text x="${cx + 62 * k * Math.cos(a)}" y="${cy + 62 * k * Math.sin(a)}" text-anchor="middle" dominant-baseline="central" font-size="${22 * k}" fill="#2a2216" class="mono" font-weight="700">${digit}</text>`;
    });
    return s;
  }

  // Generic SVG button. `act`/`arg` are dispatched via data attributes.
  function btn(x, y, w, h, label, act, arg = '', { fill = '#2a3350', color = '#dfe7ff', size = 20, rx = 8, stroke = '#4a5578' } = {}) {
    return `<g class="btn-g" data-act="${act}" data-arg="${esc(arg)}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${size}" fill="${color}" font-weight="700" class="mono">${label}</text>
    </g>`;
  }

  // Numeric keypad at (x, y). Its config lives in `kpConf` for the current view.
  let kpConf = null;
  function keypadG(x, y, conf) {
    kpConf = conf;
    const entry = ui.entry || '';
    const col = ui.kpState === 'err' ? '#fc8181' : ui.kpState === 'ok' ? '#68d391' : '#4fd1c5';
    const slotW = 40, gap = 8, dispW = conf.len * slotW + (conf.len - 1) * gap;
    let s = `<rect x="${x - 18}" y="${y - 18}" width="232" height="324" rx="14" fill="#151a28" stroke="#3b4462" stroke-width="3"/>`;
    for (let i = 0; i < conf.len; i++) {
      const sx = x + 98 - dispW / 2 + i * (slotW + gap);
      s += `<rect x="${sx}" y="${y}" width="${slotW}" height="50" rx="6" fill="#050810" stroke="${col}" stroke-width="2"/>`;
      s += `<text x="${sx + slotW / 2}" y="${y + 27}" text-anchor="middle" dominant-baseline="central" font-size="28" fill="${col}" class="mono">${entry[i] || ''}</text>`;
    }
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⏎'];
    keys.forEach((k, i) => {
      const kx = x + (i % 3) * 68, ky = y + 66 + Math.floor(i / 3) * 56;
      s += btn(kx, ky, 60, 48, k, 'kp', k, { fill: k === '⏎' ? '#22543d' : k === 'C' ? '#63171b' : '#2a3350', size: 22 });
    });
    return s;
  }

  // Simple circular arrow buttons
  const arrowL = `<g class="arrow" data-act="turn"><circle cx="38" cy="300" r="26" fill="#000a" stroke="#fff6" stroke-width="2"/><path d="M45 285 L28 300 L45 315" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const arrowR = `<g class="arrow" data-act="turn"><circle cx="762" cy="300" r="26" fill="#000a" stroke="#fff6" stroke-width="2"/><path d="M755 285 L772 300 L755 315" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const arrowBack = `<g class="arrow" data-act="back"><circle cx="400" cy="568" r="24" fill="#000a" stroke="#fff6" stroke-width="2"/><path d="M386 562 L400 576 L414 562" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;

  // ---------- Items ----------

  const ITEMS = {
    uvtorch: {
      name: 'UV Torch',
      icon: () => `<g transform="rotate(-35 50 50)"><rect x="40" y="30" width="20" height="58" rx="5" fill="#4a5568" stroke="#1a202c" stroke-width="2"/><rect x="34" y="12" width="32" height="22" rx="4" fill="#718096" stroke="#1a202c" stroke-width="2"/><rect x="38" y="8" width="24" height="6" rx="2" fill="#b794f4"/><rect x="46" y="48" width="8" height="10" rx="2" fill="#9f7aea"/></g>`,
      view: () => `${closeBg()}<g transform="translate(250,100) scale(3)">${ITEMS.uvtorch.icon()}</g>
        <ellipse cx="560" cy="150" rx="140" ry="80" fill="url(#gUV)"/>
        <text x="400" y="470" text-anchor="middle" fill="#cbd5e0" font-size="20">A small ultraviolet torch. Select it, then look at things that might hide markings.</text>`,
    },
    cipher: {
      name: 'Cipher Wheel',
      icon: () => cipherG(50, 50, 44).replace(/font-size="[\d.]+"/g, 'font-size="0"'),
      view: () => `${closeBg('#2a2216', '#0e0b07')}${cipherG(400, 285, 230)}
        <text x="400" y="560" text-anchor="middle" fill="#fbd38d" font-size="18" class="mono">STAMPED ON THE BACK: "OVERRIDE GLYPHS"</text>`,
    },
    punchcard: {
      name: 'Punch Card',
      icon: () => {
        let s = '<path d="M14 22 H90 V82 H8 V28 Z" fill="url(#gPaper)" stroke="#8a7a55" stroke-width="2"/>';
        HOLES.forEach(([r, c]) => { s += `<circle cx="${22 + c * 14}" cy="${33 + r * 10.5}" r="3.2" fill="#0b0e17"/>`; });
        return s;
      },
      view: () => {
        let s = `${closeBg()}<path d="M200 70 H620 V540 H170 V100 Z" fill="url(#gPaper)" stroke="#8a7a55" stroke-width="4"/>`;
        s += `<text x="395" y="110" text-anchor="middle" fill="#4a3d25" font-size="22" font-weight="700" class="mono">▲ THIS SIDE UP ▲</text>`;
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
          const x = 225 + c * 70, y = 140 + r * 70;
          const hole = HOLES.some(([hr, hc]) => hr === r && hc === c);
          s += hole
            ? `<circle cx="${x + 30}" cy="${y + 30}" r="24" fill="#0b0e17"/>`
            : `<rect x="${x + 6}" y="${y + 6}" width="48" height="48" rx="4" fill="none" stroke="#b9a985" stroke-dasharray="5 4" stroke-width="2"/>`;
        }
        s += `<text x="395" y="515" text-anchor="middle" fill="#6b5a38" font-size="16" class="mono">MASK 05 · read left to right, top to bottom</text>`;
        return s;
      },
    },
    morsecard: {
      name: 'Morse Card',
      icon: () => '<rect x="10" y="20" width="80" height="60" rx="6" fill="#f3efe2" stroke="#8a8a8a" stroke-width="2"/><text x="50" y="45" text-anchor="middle" font-size="16" fill="#222" class="mono">• —</text><text x="50" y="66" text-anchor="middle" font-size="16" fill="#222" class="mono">— • •</text>',
      view: () => {
        let s = `${closeBg()}<rect x="180" y="40" width="440" height="500" rx="16" fill="#f3efe2" stroke="#8a8a8a" stroke-width="4"/>`;
        s += `<text x="400" y="88" text-anchor="middle" font-size="22" fill="#222" font-weight="700">EMERGENCY RADIO: DIGITS</text>`;
        MORSE.forEach((m, d) => {
          const col = d < 5 ? 0 : 1, row = d % 5;
          s += `<text x="${230 + col * 200}" y="${150 + row * 76}" font-size="30" fill="#222" class="mono" font-weight="700">${d}</text>`;
          s += `<text x="${262 + col * 200}" y="${150 + row * 76}" font-size="22" fill="#222" class="mono">${prettyMorse(m)}</text>`;
        });
        return s;
      },
    },
  };

  // ---------- Commander views ----------

  function airlockScene(solved) {
    let s = `<rect x="525" y="76" width="250" height="424" rx="18" fill="url(#pHaz)"/>`;
    s += `<rect x="545" y="96" width="210" height="404" rx="12" fill="#0b0e17"/>`;
    if (solved) {
      s += `<rect x="549" y="100" width="202" height="400" rx="10" fill="url(#gSpace)"/>`;
      s += `<circle cx="650" cy="250" r="40" fill="#e2e8f0" opacity=".85"/><rect x="630" y="290" width="40" height="70" rx="10" fill="#cbd5e0"/>`;
    } else {
      s += `<rect x="552" y="104" width="196" height="392" rx="40" fill="url(#gMetal)" stroke="#2d3448" stroke-width="4"/>`;
      s += `<circle cx="650" cy="210" r="44" fill="#0b0f1c" stroke="#2d3448" stroke-width="8"/><circle cx="650" cy="210" r="36" fill="url(#gSpace)"/>`;
      s += `<rect x="572" y="300" width="156" height="12" rx="6" fill="#2d3448"/><rect x="572" y="330" width="156" height="12" rx="6" fill="#2d3448"/>`;
    }
    s += `<rect x="560" y="30" width="180" height="30" rx="6" fill="#742a2a"/><text x="650" y="45" text-anchor="middle" dominant-baseline="central" font-size="15" fill="#fed7d7" font-weight="700" class="mono">EVA AIRLOCK</text>`;
    s += `<rect x="486" y="250" width="30" height="46" rx="5" fill="#1a202c" stroke="#4a5568" stroke-width="2"/><rect x="491" y="256" width="20" height="10" rx="2" fill="${solved ? '#68d391' : '#fc8181'}"/>`;
    for (let i = 0; i < 6; i++) s += `<rect x="${492 + (i % 3) * 7}" y="${272 + Math.floor(i / 3) * 9}" width="5" height="6" fill="#718096"/>`;
    return s;
  }

  const CMD = {
    w1: {
      title: 'Command Deck · Forward',
      art() {
        const r = rng(7);
        let s = roomShell(false);
        // window
        s += `<rect x="200" y="80" width="400" height="210" rx="30" fill="#0b0f1c" stroke="url(#gMetal)" stroke-width="16"/>`;
        s += `<g clip-path="url(#cWin)"><rect x="200" y="80" width="400" height="210" fill="url(#gSpace)"/>`;
        for (let i = 0; i < 70; i++) s += `<circle cx="${208 + r() * 384}" cy="${88 + r() * 194}" r="${r() * 1.4 + 0.3}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`;
        s += `<circle cx="520" cy="330" r="130" fill="url(#gPlanet)"/><path d="M400 300 Q520 250 650 300" stroke="#bee3f833" stroke-width="6" fill="none"/></g>`;
        s += `<rect x="396" y="80" width="8" height="210" fill="#5a6480"/>`;
        // beacon
        s += `<g class="hs" data-act="go" data-arg="beacon">
          <circle class="beacon-glow" cx="100" cy="86" r="60" fill="transparent" filter="url(#fGlow)"/>
          <rect x="78" y="56" width="44" height="12" rx="3" fill="#4a5568"/>
          <path d="M80 68 h40 v10 a20 20 0 0 1 -40 0 z" class="beacon-lamp" fill="#2a2f3e" stroke="#4a5568" stroke-width="3"/>
          <rect x="40" y="120" width="120" height="22" rx="4" fill="#1a202c" stroke="#4a5568"/>
          <text x="100" y="131" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#cbd5e0" class="mono">STATUS BEACON</text>
        </g>`;
        // nav console
        const solved = isSolved('nav');
        s += `<g class="hs" data-act="go" data-arg="nav">
          <polygon points="150,430 650,430 690,500 110,500" fill="url(#gDark)" stroke="#11141d" stroke-width="2"/>
          <polygon points="200,360 600,360 650,430 150,430" fill="#3a4360" stroke="#11141d" stroke-width="2"/>
          <polygon points="280,300 520,300 540,358 260,358" fill="#020a06" stroke="#4a5578" stroke-width="5"/>
          <text x="400" y="330" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#6ee7a8" class="mono">${solved ? 'TRANSMITTING…' : 'AWAITING COURSE'}</text>`;
        for (let rr = 0; rr < 4; rr++) for (let c = 0; c < 4; c++) {
          const on = solved && COURSE.some(([a, b]) => a === rr && b === c);
          s += `<rect x="${352 + c * 25 - rr * 4}" y="${370 + rr * 14}" width="${20 + rr * 1.5}" height="11" rx="2" fill="${on ? '#4fd1c5' : '#141a28'}" stroke="#596482"/>`;
        }
        s += `<rect x="190" y="385" width="90" height="30" rx="4" fill="#232a3d"/><circle cx="210" cy="400" r="6" fill="#68d391"/><circle cx="232" cy="400" r="6" fill="#f6ad55"/><circle cx="254" cy="400" r="6" fill="#fc8181"/>`;
        s += `<rect x="520" y="385" width="90" height="30" rx="4" fill="#232a3d"/><rect x="530" y="393" width="70" height="4" fill="#4a5578"/><rect x="530" y="403" width="50" height="4" fill="#4a5578"/>`;
        s += solved ? `<rect x="330" y="455" width="140" height="34" rx="4" fill="#0b0e17"/>` : `<rect x="330" y="455" width="140" height="34" rx="4" fill="#232a3d" stroke="#11141d"/><rect x="385" y="468" width="30" height="6" rx="3" fill="#596482"/>`;
        s += '</g>';
        // gauges panel
        s += `<g class="hs" data-act="go" data-arg="gauges">
          <rect x="590" y="130" width="120" height="250" rx="10" fill="url(#gDark)" stroke="#4a5578" stroke-width="3"/>
          <text x="650" y="150" text-anchor="middle" font-size="10" fill="#cbd5e0" class="mono">COOLANT</text>`;
        GAUGE_ORDER.forEach((sh, i) => { s += gaugeG(sh, PRESSURES[sh], 650, 195 + i * 70, 24, false).replace(/<text[^>]*>[▲●■]<\/text>/, `<text x="692" y="${200 + i * 70}" fill="#f6ad55" font-size="10" text-anchor="middle">${SHAPE_SYM[sh]}</text>`); });
        s += '</g>';
        // decor
        s += `<rect x="30" y="200" width="140" height="34" rx="4" fill="#1a202c" stroke="#4a5568"/><text x="100" y="217" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#90cdf4" class="mono" font-weight="700">COMMAND DECK</text>`;
        s += `<rect x="40" y="380" width="120" height="80" rx="6" fill="url(#pGrate)" stroke="#2d3448" stroke-width="3"/>`;
        return s;
      },
    },
    w2: {
      title: 'Command Deck · Aft',
      art() {
        let s = roomShell(false);
        // locker
        const open = isSolved('locker');
        s += `<g class="hs" data-act="go" data-arg="locker">
          <rect x="70" y="100" width="180" height="400" rx="6" fill="#20263a" stroke="#11141d" stroke-width="3"/>`;
        if (open) {
          s += `<rect x="80" y="110" width="160" height="380" fill="#0b0e17"/><rect x="80" y="250" width="160" height="8" fill="#4a5578"/>`;
          if (!state.taken.uvtorch) s += `<g transform="translate(115,180) scale(.7)">${ITEMS.uvtorch.icon()}</g>`;
          s += `<polygon points="70,100 30,120 30,480 70,500" fill="url(#gMetal)" stroke="#11141d" stroke-width="2"/>`;
        } else {
          s += `<rect x="80" y="110" width="160" height="380" rx="4" fill="url(#gMetal)" stroke="#2d3448" stroke-width="2"/>`;
          for (let i = 0; i < 5; i++) s += `<rect x="110" y="${125 + i * 9}" width="100" height="4" rx="2" fill="#2d3448"/>`;
          for (let i = 0; i < 4; i++) s += `<rect x="${92 + i * 36}" y="185" width="30" height="30" rx="3" fill="#2a3350" stroke="#9fb3e8" stroke-width="1"/>`;
          s += `<rect x="195" y="290" width="30" height="40" rx="4" fill="#1a202c"/><rect x="200" y="295" width="20" height="8" fill="#4fd1c5"/>`;
          s += `<rect x="95" y="280" width="10" height="60" rx="5" fill="#2d3448"/>`;
        }
        s += '</g>';
        // marked wall panel
        s += `<g class="hs" data-act="go" data-arg="marks">
          <rect x="300" y="150" width="180" height="190" rx="4" fill="#232a3f" stroke="#151927" stroke-width="3"/>
          <circle cx="310" cy="160" r="3" fill="#596482"/><circle cx="470" cy="160" r="3" fill="#596482"/><circle cx="310" cy="330" r="3" fill="#596482"/><circle cx="470" cy="330" r="3" fill="#596482"/>
          <path d="M330 200 l40 6 M360 250 l60 -10 M340 300 l30 4 M420 210 l20 18" stroke="#ffffff10" stroke-width="5" stroke-linecap="round"/>
          <text x="390" y="356" text-anchor="middle" font-size="11" fill="#718096" class="mono">PANEL 7</text>
        </g>`;
        // airlock
        s += `<g class="hs" data-act="go" data-arg="airlock">${airlockScene(isSolved('airlock'))}</g>`;
        s += `<rect x="300" y="400" width="180" height="70" rx="6" fill="url(#pGrate)" stroke="#2d3448" stroke-width="3"/>`;
        return s;
      },
    },
    beacon: {
      title: 'Status Beacon', parent: 'w1',
      art() {
        return `${closeBg()}
          <rect x="300" y="40" width="200" height="40" rx="6" fill="#4a5568"/>
          <circle class="beacon-glow" cx="400" cy="200" r="190" fill="transparent" filter="url(#fGlow)"/>
          <path d="M290 80 h220 v70 a110 110 0 0 1 -220 0 z" class="beacon-lamp" fill="#2a2f3e" stroke="#4a5568" stroke-width="8"/>
          <path d="M320 100 q30 -10 40 30" stroke="#ffffff30" stroke-width="10" fill="none" stroke-linecap="round"/>
          <rect x="220" y="380" width="360" height="90" rx="8" fill="#1a202c" stroke="#4a5568" stroke-width="3"/>
          <text x="400" y="410" text-anchor="middle" font-size="16" fill="#cbd5e0" class="mono">ENG. TOOL STORE</text>
          <text x="400" y="440" text-anchor="middle" font-size="16" fill="#cbd5e0" class="mono">ACCESS SEQUENCE BROADCAST</text>`;
      },
    },
    gauges: {
      title: 'Coolant Gauges', parent: 'w1',
      art() {
        let s = `${closeBg()}<rect x="40" y="90" width="720" height="420" rx="18" fill="url(#gDark)" stroke="#4a5578" stroke-width="4"/>`;
        s += `<text x="400" y="135" text-anchor="middle" font-size="20" fill="#cbd5e0" class="mono">COOLANT LOOP · TARGET PRESSURE</text>`;
        GAUGE_ORDER.forEach((sh, i) => { s += gaugeG(sh, PRESSURES[sh], 170 + i * 230, 290, 95); });
        return s;
      },
    },
    nav: {
      title: 'Navigation Console', parent: 'w1',
      art() {
        let s = `${closeBg()}`;
        if (isSolved('nav')) {
          s += `<rect x="90" y="40" width="620" height="230" rx="14" fill="#020a06" stroke="#4a5578" stroke-width="8"/>`;
          s += `<text x="400" y="85" text-anchor="middle" font-size="18" fill="#6ee7a8" class="mono">ENGINEERING AIRLOCK OVERRIDE · TRANSMITTING</text>`;
          ENG_AIRLOCK.split('').forEach((d, i) => {
            const x = 112 + i * 148;
            s += `<rect x="${x}" y="125" width="132" height="70" rx="8" fill="#041a0d" stroke="#2c6b48" stroke-width="2"/>`;
            s += `<text x="${x + 66}" y="161" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#6ee7a8" class="mono" font-weight="700">${prettyMorse(MORSE[+d])}</text>`;
          });
          s += `<text x="400" y="235" text-anchor="middle" font-size="14" fill="#2f855a" class="mono">(repeating)</text>`;
          s += `<rect x="200" y="320" width="400" height="200" rx="8" fill="#232a3d" stroke="#11141d" stroke-width="3"/>`;
          s += `<rect x="215" y="335" width="370" height="170" rx="4" fill="#0b0e17"/>`;
          if (!state.taken.cipher) s += `<g class="hs" data-act="take" data-arg="cipher">${cipherG(400, 420, 70)}</g>`;
          else s += `<text x="400" y="425" text-anchor="middle" font-size="16" fill="#4a5568" class="mono">(empty drawer)</text>`;
          return s;
        }
        s += `<rect x="150" y="30" width="500" height="70" rx="10" fill="#020a06" stroke="#4a5578" stroke-width="6"/>`;
        s += `<text x="400" y="66" text-anchor="middle" dominant-baseline="central" font-size="20" fill="#6ee7a8" class="mono">AWAITING COURSE · ${(ui.path || []).length}/8</text>`;
        s += `<rect x="230" y="120" width="340" height="340" rx="14" fill="#151a28" stroke="#3b4462" stroke-width="3"/>`;
        s += `<text x="400" y="145" text-anchor="middle" font-size="18" fill="#7f9cf5" class="mono" font-weight="700">N ↑</text>`;
        const path = ui.path || [];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          const idx = path.findIndex(([a, b]) => a === r && b === c);
          const x = 262 + c * 72, y = 162 + r * 72;
          s += `<g data-act="nav" data-arg="${r},${c}" class="btn-g"><rect x="${x}" y="${y}" width="62" height="62" rx="8" fill="${idx >= 0 ? '#4fd1c5' : '#0a0e1a'}" stroke="#4a5578" stroke-width="2"/>`;
          s += `<text x="${x + 31}" y="${y + 32}" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#062723" font-weight="700" class="mono">${idx >= 0 ? idx + 1 : ''}</text></g>`;
        }
        s += btn(250, 480, 130, 50, 'CLEAR', 'navClear', '', { fill: '#2a3350' });
        s += btn(420, 480, 130, 50, 'ENGAGE', 'navEngage', '', { fill: '#22543d' });
        return s;
      },
    },
    locker: {
      title: 'Personal Locker', parent: 'w2',
      art() {
        let s = closeBg();
        if (isSolved('locker')) {
          s += `<rect x="220" y="20" width="360" height="560" rx="8" fill="#0b0e17" stroke="#2d3448" stroke-width="8"/>`;
          s += `<rect x="230" y="300" width="340" height="12" fill="#4a5578"/>`;
          s += `<polygon points="220,20 120,60 120,540 220,580" fill="url(#gMetal)" stroke="#11141d" stroke-width="3"/>`;
          if (!state.taken.uvtorch) s += `<g class="hs" data-act="take" data-arg="uvtorch" transform="translate(320,170) scale(1.4)">${ITEMS.uvtorch.icon()}</g>`;
          else s += `<text x="400" y="280" text-anchor="middle" font-size="16" fill="#4a5568" class="mono">(empty)</text>`;
          return s;
        }
        s += `<rect x="190" y="10" width="420" height="580" rx="10" fill="url(#gMetal)" stroke="#2d3448" stroke-width="5"/>`;
        LOCKER_PLATES.forEach((k, i) => {
          const x = 208 + i * 98;
          s += `<rect x="${x}" y="40" width="90" height="90" rx="5" fill="#2a3350" stroke="#9fb3e8" stroke-width="2"/>`;
          s += `<circle cx="${x + 6}" cy="46" r="2" fill="#9fb3e8"/><circle cx="${x + 84}" cy="46" r="2" fill="#9fb3e8"/><circle cx="${x + 6}" cy="124" r="2" fill="#9fb3e8"/><circle cx="${x + 84}" cy="124" r="2" fill="#9fb3e8"/>`;
          s += constellationG(k, x + 7, 47, 76, { line: '#b8c6f0', star: '#fff' });
        });
        s += keypadG(302, 180, { len: 4, answer: LOCKER_CODE, onSolve: () => { solve('locker'); say('Click! The locker door swings open.'); } });
        return s;
      },
    },
    marks: {
      title: 'Panel 7', parent: 'w2',
      art() {
        const uv = selected === 'uvtorch';
        let s = `${closeBg('#232a3f', '#10131d')}<g data-act="marks"><rect x="140" y="40" width="520" height="500" rx="8" fill="#232a3f" stroke="#151927" stroke-width="6"/>`;
        s += `<path d="M190 120 l120 16 M260 300 l200 -30 M220 460 l90 10 M480 140 l60 50 M560 420 l40 -40" stroke="#ffffff0d" stroke-width="12" stroke-linecap="round"/>`;
        if (uv) s += `<rect x="140" y="40" width="520" height="500" fill="url(#gUV)"/>`;
        LETTER_GRID.forEach((row, r) => row.split('').forEach((ch, c) => {
          s += `<text x="${250 + c * 75}" y="${140 + r * 75}" text-anchor="middle" dominant-baseline="central" font-size="46" font-weight="700" class="mono" fill="${uv ? '#e9d8fd' : '#ffffff'}" opacity="${uv ? 1 : 0.035}" ${uv ? 'filter="url(#fSoft)"' : ''}>${ch}</text>`;
          if (uv) s += `<text x="${250 + c * 75}" y="${140 + r * 75}" text-anchor="middle" dominant-baseline="central" font-size="46" font-weight="700" class="mono" fill="#d6bcfa">${ch}</text>`;
        }));
        s += '</g>';
        return s;
      },
    },
    airlock: {
      title: 'Airlock', parent: 'w2',
      art: () => airlockClose(CMD_AIRLOCK),
    },
  };

  function airlockClose(code) {
    let s = closeBg();
    const done = isSolved('airlock');
    s += `<rect x="40" y="30" width="400" height="540" rx="24" fill="url(#pHaz)"/>`;
    s += `<rect x="62" y="52" width="356" height="496" rx="18" fill="#0b0e17"/>`;
    if (done) {
      const r = rng(3);
      s += `<rect x="66" y="56" width="348" height="488" rx="16" fill="url(#gSpace)"/>`;
      for (let i = 0; i < 50; i++) s += `<circle cx="${70 + r() * 340}" cy="${60 + r() * 480}" r="${r() * 1.5 + 0.3}" fill="#fff"/>`;
      s += `<clipPath id="cDoor"><rect x="66" y="56" width="348" height="488" rx="16"/></clipPath><circle cx="240" cy="470" r="150" fill="url(#gPlanet)" clip-path="url(#cDoor)"/>`;
      s += `<rect x="470" y="150" width="300" height="300" rx="16" fill="#0b0e17" stroke="#68d391" stroke-width="3"/>`;
      s += `<text x="620" y="215" text-anchor="middle" font-size="30" fill="#68d391" font-weight="700">YOU ESCAPED!</text>`;
      s += `<text x="620" y="265" text-anchor="middle" font-size="18" fill="#dfe7ff" class="mono">TIME ${fmtTime(state.end - state.start)}</text>`;
      const partner = role === 'commander' ? 'Engineer' : 'Commander';
      s += `<text x="620" y="320" text-anchor="middle" font-size="15" fill="#a0aec0">If the ${partner} isn't out yet,</text>`;
      s += `<text x="620" y="344" text-anchor="middle" font-size="15" fill="#a0aec0">help them through. The pod</text>`;
      s += `<text x="620" y="368" text-anchor="middle" font-size="15" fill="#a0aec0">won't launch without you both.</text>`;
      return s;
    }
    s += `<rect x="70" y="60" width="340" height="480" rx="60" fill="url(#gMetal)" stroke="#2d3448" stroke-width="6"/>`;
    s += `<circle cx="240" cy="220" r="80" fill="#0b0f1c" stroke="#2d3448" stroke-width="14"/><circle cx="240" cy="220" r="66" fill="url(#gSpace)"/>`;
    s += `<rect x="100" y="360" width="280" height="18" rx="9" fill="#2d3448"/><rect x="100" y="400" width="280" height="18" rx="9" fill="#2d3448"/>`;
    s += `<text x="597" y="70" text-anchor="middle" font-size="16" fill="#fed7d7" class="mono" font-weight="700">MANUAL OVERRIDE</text>`;
    s += keypadG(500, 130, { len: 4, answer: code, onSolve: () => { state.solved.airlock = true; state.end = Date.now(); save(); } });
    return s;
  }

  // ---------- Engineer views ----------

  const ENG = {
    w1: {
      title: 'Engineering Bay · Port',
      art() {
        let s = roomShell(true);
        // star chart
        s += `<g class="hs" data-act="go" data-arg="chart">
          <rect x="50" y="90" width="250" height="230" rx="4" fill="#3b2f1e" stroke="#1a140b" stroke-width="3"/>
          <rect x="62" y="102" width="226" height="206" fill="#0b1230"/>`;
        CHART_ORDER.forEach((k, i) => { s += constellationG(k, 70 + (i % 3) * 72, 108 + Math.floor(i / 3) * 66, 56, { line: '#4c5f99', star: '#e2e8f0', width: 1 }); });
        s += `</g>`;
        // tool store
        const open = isSolved('toolbox');
        s += `<g class="hs" data-act="go" data-arg="toolbox">
          <rect x="340" y="90" width="190" height="250" rx="6" fill="#2d3748" stroke="#11141d" stroke-width="3"/>`;
        if (open) {
          s += `<rect x="350" y="100" width="170" height="230" fill="#0b0e17"/><rect x="350" y="200" width="170" height="6" fill="#4a5568"/>`;
          if (!state.taken.punchcard) s += `<g transform="translate(360,140) scale(.5)">${ITEMS.punchcard.icon()}</g>`;
          if (!state.taken.morsecard) s += `<g transform="translate(440,140) scale(.5)">${ITEMS.morsecard.icon()}</g>`;
          s += `<polygon points="340,90 300,110 300,320 340,340" fill="#c53030" stroke="#11141d" stroke-width="2"/>`;
        } else {
          s += `<rect x="350" y="100" width="82" height="230" fill="#c53030" stroke="#742a2a" stroke-width="2"/><rect x="438" y="100" width="82" height="230" fill="#c53030" stroke="#742a2a" stroke-width="2"/>`;
          s += `<text x="435" y="140" text-anchor="middle" font-size="13" fill="#fff5f5" font-weight="700" class="mono">TOOL STORE</text>`;
          for (let i = 0; i < 5; i++) s += `<circle cx="${395 + i * 20}" cy="175" r="6" fill="#1a202c" stroke="#742a2a"/>`;
          ['R', 'G', 'B', 'Y'].forEach((k, i) => { s += `<circle cx="${390 + i * 30}" cy="290" r="10" fill="${COLORS[k]}" stroke="#1a202c" stroke-width="2"/>`; });
        }
        s += `</g>`;
        // terminal
        s += `<g class="hs" data-act="go" data-arg="terminal">
          <rect x="560" y="400" width="210" height="100" fill="#3a3530" stroke="#1a1818" stroke-width="2"/>
          <rect x="550" y="390" width="230" height="14" rx="3" fill="#4a4540"/>
          <rect x="650" y="350" width="30" height="42" fill="#2d3748"/>
          <rect x="585" y="230" width="160" height="125" rx="8" fill="#1a202c" stroke="#2d3748" stroke-width="4"/>
          <rect x="595" y="240" width="140" height="105" rx="3" fill="#020a06"/>
          <text x="665" y="${isSolved('terminal') ? 270 : 292}" text-anchor="middle" font-size="12" fill="#6ee7a8" class="mono">${isSolved('terminal') ? 'LOGGED IN' : 'PASSWORD:'}</text>
          ${isSolved('terminal') ? '<rect x="610" y="285" width="110" height="5" fill="#2c6b48"/><rect x="610" y="297" width="80" height="5" fill="#2c6b48"/><rect x="610" y="309" width="95" height="5" fill="#2c6b48"/>' : '<rect x="640" y="302" width="50" height="3" fill="#6ee7a8"/>'}
          <rect x="595" y="408" width="140" height="18" rx="3" fill="#2d3748"/>
        </g>`;
        // decor
        s += `<rect x="60" y="410" width="120" height="90" fill="#5f4b32" stroke="#2d2416" stroke-width="3"/><path d="M60 410 L180 500 M180 410 L60 500" stroke="#2d2416" stroke-width="3"/>`;
        s += `<rect x="150" y="440" width="80" height="60" fill="#6b5538" stroke="#2d2416" stroke-width="3"/>`;
        s += `<rect x="350" y="380" width="160" height="40" rx="4" fill="url(#pHaz)"/><rect x="358" y="388" width="144" height="24" fill="#1a1a1a"/><text x="430" y="400" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#ecc94b" font-weight="700" class="mono">ENGINEERING</text>`;
        return s;
      },
    },
    w2: {
      title: 'Engineering Bay · Starboard',
      art() {
        let s = roomShell(true);
        const stable = isSolved('valves');
        // pipes and valves
        s += `<rect x="0" y="120" width="520" height="34" fill="url(#gPipe)"/>`;
        s += `<g class="hs" data-act="go" data-arg="valves">
          <rect x="60" y="200" width="290" height="230" rx="8" fill="#2a2d36" stroke="#11141d" stroke-width="3"/>`;
        VALVE_ORDER.forEach((sh, i) => {
          const cx = 120 + i * 85;
          s += `<rect x="${cx - 10}" y="150" width="20" height="90" fill="url(#gPipeV)"/>`;
          s += `<circle cx="${cx}" cy="280" r="34" fill="none" stroke="#c53030" stroke-width="8"/>`;
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4 + (ui.valveSpin || 0); s += `<line x1="${cx + 34 * Math.cos(a)}" y1="${280 + 34 * Math.sin(a)}" x2="${cx - 34 * Math.cos(a)}" y2="${280 - 34 * Math.sin(a)}" stroke="#c53030" stroke-width="5"/>`; }
          s += `<circle cx="${cx}" cy="280" r="9" fill="#742a2a"/>`;
          s += `<text x="${cx}" y="345" text-anchor="middle" font-size="20" fill="#f6ad55">${SHAPE_SYM[sh]}</text>`;
          s += `<rect x="${cx - 22}" y="360" width="44" height="30" rx="4" fill="#050810"/><text x="${cx}" y="376" text-anchor="middle" dominant-baseline="central" font-size="18" fill="${stable ? '#68d391' : '#4fd1c5'}" class="mono">${stable ? PRESSURES[sh] : (state.valves || {})[sh] || 0}</text>`;
        });
        s += `<circle cx="330" cy="215" r="7" fill="${stable ? '#68d391' : '#fc8181'}"/></g>`;
        // hatch
        s += `<g class="hs" data-act="go" data-arg="hatch">
          <rect x="390" y="330" width="120" height="120" rx="6" fill="#3a3f4c" stroke="#11141d" stroke-width="3"/>
          <rect x="402" y="342" width="96" height="96" rx="4" fill="${stable ? '#0b0e17' : 'url(#gMetalV)'}" stroke="#2d3448" stroke-width="2"/>
          ${stable ? '<rect x="420" y="372" width="60" height="30" rx="3" fill="#140d02" stroke="#5a3b10"/>' : '<circle cx="410" cy="350" r="3" fill="#2d3448"/><circle cx="490" cy="350" r="3" fill="#2d3448"/><circle cx="410" cy="430" r="3" fill="#2d3448"/><circle cx="490" cy="430" r="3" fill="#2d3448"/>'}
          <circle cx="450" cy="315" r="8" fill="${stable ? '#68d391' : '#fc8181'}"/>
        </g>`;
        s += `<g class="hs" data-act="go" data-arg="airlock">${airlockScene(isSolved('airlock'))}</g>`;
        return s;
      },
    },
    chart: {
      title: 'Star Chart', parent: 'w1',
      art() {
        let s = `${closeBg('#2a2216', '#0e0b07')}<rect x="70" y="10" width="660" height="580" rx="6" fill="#3b2f1e" stroke="#1a140b" stroke-width="5"/>`;
        s += `<rect x="90" y="30" width="620" height="540" fill="#0b1230"/>`;
        s += `<text x="400" y="56" text-anchor="middle" font-size="16" fill="#a3bffa" class="mono">HALCYON NAVIGATION REFERENCE</text>`;
        CHART_ORDER.forEach((k, i) => {
          const x = 110 + (i % 3) * 200, y = 72 + Math.floor(i / 3) * 165;
          s += constellationG(k, x + 35, y, 120, { line: '#5a6fa8', star: '#fff', width: 2 });
          s += `<text x="${x + 95}" y="${y + 142}" text-anchor="middle" font-size="16" fill="#7f9cf5" class="mono">CAT-${CONSTELLATIONS[k].cat}</text>`;
        });
        return s;
      },
    },
    toolbox: {
      title: 'Tool Store', parent: 'w1',
      art() {
        let s = closeBg('#2c2a2a', '#0e0d0d');
        if (isSolved('toolbox')) {
          s += `<rect x="200" y="30" width="400" height="540" rx="6" fill="#0b0e17" stroke="#2d3748" stroke-width="10"/>`;
          s += `<rect x="210" y="300" width="380" height="12" fill="#4a5568"/>`;
          s += `<polygon points="200,30 120,70 120,530 200,570" fill="#c53030" stroke="#742a2a" stroke-width="3"/>`;
          if (!state.taken.punchcard) s += `<g class="hs" data-act="take" data-arg="punchcard" transform="translate(230,180) scale(1.2)">${ITEMS.punchcard.icon()}</g>`;
          if (!state.taken.morsecard) s += `<g class="hs" data-act="take" data-arg="morsecard" transform="translate(440,180) scale(1.2)">${ITEMS.morsecard.icon()}</g>`;
          if (state.taken.punchcard && state.taken.morsecard) s += `<text x="400" y="260" text-anchor="middle" font-size="16" fill="#4a5568" class="mono">(empty)</text>`;
          return s;
        }
        s += `<rect x="180" y="20" width="440" height="560" rx="10" fill="#c53030" stroke="#742a2a" stroke-width="6"/>`;
        s += `<line x1="400" y1="20" x2="400" y2="580" stroke="#742a2a" stroke-width="4"/>`;
        s += `<rect x="240" y="60" width="320" height="60" rx="6" fill="#fefcbf" stroke="#975a16"/>`;
        s += `<text x="400" y="84" text-anchor="middle" font-size="14" fill="#744210" class="mono">ACCESS SEQUENCE BROADCAST</text>`;
        s += `<text x="400" y="104" text-anchor="middle" font-size="14" fill="#744210" class="mono">ON COMMAND DECK BEACON</text>`;
        s += `<rect x="230" y="160" width="340" height="80" rx="10" fill="#1a202c" stroke="#742a2a" stroke-width="3"/>`;
        const entry = ui.colors || [];
        for (let i = 0; i < 5; i++) {
          s += `<circle cx="${270 + i * 65}" cy="200" r="22" fill="${entry[i] ? COLORS[entry[i]] : '#0b0e17'}" stroke="${ui.colErr ? '#fc8181' : '#4a5568'}" stroke-width="3"/>`;
        }
        ['R', 'G', 'B', 'Y'].forEach((k, i) => {
          const x = 250 + (i % 2) * 170, y = 290 + Math.floor(i / 2) * 120;
          s += `<g class="btn-g" data-act="col" data-arg="${k}"><circle cx="${x + 50}" cy="${y + 45}" r="48" fill="#1a202c"/><circle cx="${x + 50}" cy="${y + 42}" r="40" fill="${COLORS[k]}" stroke="#0006" stroke-width="4"/></g>`;
        });
        s += btn(350, 530, 100, 36, 'CLEAR', 'colClear', '', { fill: '#1a202c', size: 16 });
        return s;
      },
    },
    terminal: {
      title: 'Engineering Terminal', parent: 'w1',
      art() {
        let s = `${closeBg()}<rect x="40" y="20" width="720" height="520" rx="20" fill="#1a202c" stroke="#2d3748" stroke-width="6"/>`;
        s += `<rect x="70" y="50" width="660" height="460" rx="8" fill="#020a06"/>`;
        const T = (x, y, t, size = 16, fill = '#6ee7a8') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" class="mono">${esc(t)}</text>`;
        if (!isSolved('terminal')) {
          s += T(100, 90, 'HALCYON ENGINEERING OS v4.2');
          s += T(100, 120, 'PASSWORD HINT: MASK 05');
          s += T(100, 170, '> ENTER PASSWORD:');
          const letters = ui.letters || [0, 0, 0, 0, 0];
          letters.forEach((li, i) => {
            const x = 175 + i * 95;
            s += `<g class="btn-g arrow-up" data-act="lc" data-arg="${i}:-1"><polygon points="${x + 35},210 ${x + 60},240 ${x + 10},240" fill="#2c6b48"/></g>`;
            s += `<rect x="${x}" y="250" width="70" height="90" rx="6" fill="#041a0d" stroke="${ui.lcErr ? '#fc8181' : '#2c6b48'}" stroke-width="3"/>`;
            s += `<text x="${x + 35}" y="297" text-anchor="middle" dominant-baseline="central" font-size="48" fill="#6ee7a8" class="mono" font-weight="700">${String.fromCharCode(65 + li)}</text>`;
            s += `<g class="btn-g" data-act="lc" data-arg="${i}:1"><polygon points="${x + 10},350 ${x + 60},350 ${x + 35},380" fill="#2c6b48"/></g>`;
          });
          s += btn(320, 410, 160, 50, 'ENTER', 'lcEnter', '', { fill: '#22543d', color: '#c6f6d5' });
          if (ui.lcErr) s += T(330, 490, 'ACCESS DENIED', 18, '#fc8181');
          return s;
        }
        const lines = [
          'ACCESS GRANTED. WELCOME, ENGINEER.',
          '',
          '[LOG 1] Collision course detected.',
          'Correction plotted. Command must',
          'enter it manually on the',
          'navigation console.',
          '',
          '[LOG 2] WARNING: coolant loop',
          'unstable. Set valves to TARGET',
          'PRESSURES on the Command Deck',
          'coolant gauges.',
          '',
          '[LOG 3] Maintenance hatch unseals',
          'when the coolant loop is stable.',
        ];
        lines.forEach((l, i) => { s += T(95, 85 + i * 28, l, 15); });
        // rotated course: north points right
        const rot = ([r, c]) => [c, 3 - r];
        const cells = {};
        COURSE.forEach((p, i) => { const [r, c] = rot(p); cells[`${r},${c}`] = i; });
        s += `<rect x="455" y="120" width="250" height="250" rx="8" fill="#041a0d" stroke="#2c6b48" stroke-width="2"/>`;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          const i = cells[`${r},${c}`];
          const x = 470 + c * 56, y = 135 + r * 56;
          s += `<rect x="${x}" y="${y}" width="50" height="50" rx="5" fill="${i === undefined ? '#020a06' : '#1d4d33'}" stroke="#2c6b48"/>`;
          if (i !== undefined) s += `<text x="${x + 25}" y="${y + 26}" text-anchor="middle" dominant-baseline="central" font-size="${i === 0 || i === COURSE.length - 1 ? 22 : 26}" fill="#9ae6b4" class="mono" font-weight="700">${i === 0 ? 'S' : i === COURSE.length - 1 ? 'E' : '•'}</text>`;
        }
        s += T(540, 108, 'NORTH →', 18, '#7f9cf5');
        s += T(470, 400, 'S = START   E = END', 15);
        return s;
      },
    },
    valves: {
      title: 'Coolant Valves', parent: 'w2',
      art() {
        const stable = isSolved('valves');
        const vals = state.valves || (state.valves = { tri: 0, circ: 0, sq: 0 });
        let s = `${closeBg('#2c2a2a', '#0e0d0d')}<rect x="0" y="40" width="800" height="60" fill="url(#gPipe)"/>`;
        VALVE_ORDER.forEach((sh, i) => {
          const cx = 170 + i * 230;
          const v = stable ? PRESSURES[sh] : vals[sh];
          s += `<rect x="${cx - 20}" y="95" width="40" height="110" fill="url(#gPipeV)"/>`;
          s += `<g transform="rotate(${v * 36} ${cx} 250)"><circle cx="${cx}" cy="250" r="78" fill="none" stroke="#c53030" stroke-width="16"/>`;
          for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; s += `<line x1="${cx + 78 * Math.cos(a)}" y1="${250 + 78 * Math.sin(a)}" x2="${cx - 78 * Math.cos(a)}" y2="${250 - 78 * Math.sin(a)}" stroke="#c53030" stroke-width="10"/>`; }
          s += `<circle cx="${cx}" cy="250" r="20" fill="#742a2a"/></g>`;
          s += `<rect x="${cx - 30}" y="345" width="60" height="44" rx="6" fill="#1a1a1a"/><text x="${cx}" y="368" text-anchor="middle" dominant-baseline="central" font-size="30" fill="#f6ad55">${SHAPE_SYM[sh]}</text>`;
          s += `<rect x="${cx - 45}" y="400" width="90" height="70" rx="8" fill="#050810" stroke="#4a5568" stroke-width="2"/>`;
          s += `<text x="${cx}" y="437" text-anchor="middle" dominant-baseline="central" font-size="40" fill="${stable ? '#68d391' : '#4fd1c5'}" class="mono" font-weight="700">${v}</text>`;
          if (!stable) {
            s += btn(cx - 100, 410, 46, 50, '−', 'valve', `${sh}:-1`, { size: 26 });
            s += btn(cx + 54, 410, 46, 50, '+', 'valve', `${sh}:1`, { size: 26 });
          }
        });
        s += stable
          ? `<text x="400" y="530" text-anchor="middle" font-size="22" fill="#68d391" class="mono" font-weight="700">COOLANT LOOP STABLE</text>`
          : btn(310, 500, 180, 54, 'OPEN FLOW', 'flow', '', { fill: '#22543d', color: '#c6f6d5' });
        return s;
      },
    },
    hatch: {
      title: 'Maintenance Hatch', parent: 'w2',
      art() {
        let s = closeBg();
        s += `<rect x="150" y="40" width="500" height="500" rx="16" fill="#3a3f4c" stroke="#11141d" stroke-width="6"/>`;
        if (!isSolved('valves')) {
          s += `<rect x="190" y="80" width="420" height="420" rx="10" fill="url(#gMetalV)" stroke="#2d3448" stroke-width="4"/>`;
          [[215, 105], [585, 105], [215, 475], [585, 475]].forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="10" fill="#2d3448"/>`; });
          s += `<circle cx="400" cy="160" r="22" fill="#fc8181" filter="url(#fSoft)"/><circle cx="400" cy="160" r="16" fill="#fc8181"/>`;
          s += `<rect x="250" y="260" width="300" height="80" rx="6" fill="#1a202c"/>`;
          s += `<text x="400" y="292" text-anchor="middle" font-size="18" fill="#fc8181" class="mono" font-weight="700">SEALED</text>`;
          s += `<text x="400" y="320" text-anchor="middle" font-size="14" fill="#fc8181" class="mono">COOLANT PRESSURE UNSTABLE</text>`;
          return s;
        }
        s += `<rect x="190" y="80" width="420" height="420" rx="10" fill="#0b0e17"/>`;
        s += `<rect x="230" y="180" width="340" height="190" rx="10" fill="#140d02" stroke="#5a3b10" stroke-width="4"/>`;
        s += `<text x="400" y="220" text-anchor="middle" font-size="15" fill="#f6ad55" class="mono">COMMAND AIRLOCK OVERRIDE</text>`;
        HATCH_SYMBOLS.forEach((sym, i) => { s += `<text x="${280 + i * 80}" y="300" text-anchor="middle" dominant-baseline="central" font-size="54" fill="#f6ad55" class="sym">${sym}${VS}</text>`; });
        s += `<circle cx="400" cy="120" r="14" fill="#68d391"/>`;
        return s;
      },
    },
    airlock: {
      title: 'Airlock', parent: 'w2',
      art: () => airlockClose(ENG_AIRLOCK),
    },
  };

  const ROOMS = {
    commander: { name: 'Command Deck', tag: 'Commander', views: CMD },
    engineer: { name: 'Engineering Bay', tag: 'Engineer', views: ENG },
  };

  // Hints per view (walls get general hints).
  const HINTS = {
    commander: {
      w1: ['Look around both walls. Use the arrows on the sides to turn.', 'Most of what you see is useful to the Engineer. Describe everything to them.'],
      w2: ['Look around both walls. Use the arrows on the sides to turn.', 'The locker, the scuffed panel and the airlock all need something from Engineering.'],
      locker: ['The plates show star patterns. Engineering may have a star chart.', 'Describe each pattern carefully. Some patterns on a chart can look very similar, just flipped or upside down.', 'Each constellation on the Engineer\'s chart has a catalogue number. Use those four numbers in plate order.'],
      beacon: ['The beacon repeats the same sequence. The long dark pause marks the start and end.', 'Colours are no use to you here. Ask the Engineer whether anything on their side takes colours.'],
      marks: ['Something is written here that only shows up in the right light.', 'Select the UV torch in your inventory and come back.', 'The letters alone mean nothing. Engineering has a card that tells you which ones to read. The word you get is for them.'],
      gauges: ['Count the tick marks from MIN (0) to where the needle points.', 'There\'s nothing to adjust here. The valves must be somewhere else.'],
      nav: ['The course has to be plotted from Engineering. Their terminal might have it.', 'Check which way north is on both screens.', 'Press the cells in order from the start, then press ENGAGE.'],
      airlock: ['The override code is shown as glyphs somewhere in Engineering.', 'You have something that turns glyphs into digits.'],
    },
    engineer: {
      w1: ['Look around both walls. Use the arrows on the sides to turn.', 'Describe everything you find to the Commander. Your clues are for them.'],
      w2: ['Look around both walls. Use the arrows on the sides to turn.', 'The valves need numbers from Command.'],
      chart: ['There\'s nothing to unlock here, but this chart is the key to something in Command.', 'Careful: several patterns are mirror images or upside-down versions of each other.'],
      toolbox: ['The lock wants a sequence of colours. The Commander might be able to see them.', 'The sequence is five colours long. The Commander needs to find where it starts.'],
      terminal: ['The password is five letters. It\'s hidden in Command, but you have the card that shows which letters to read.', 'Describe the punch card\'s hole positions to the Commander row by row.', 'Once you\'re in, the course diagram is for the Commander. North isn\'t "up" on your screen.'],
      valves: ['You need target pressures. They aren\'t in this room.', 'Match each valve to the gauge with the same shape. The gauges may be in a different order.'],
      hatch: ['The hatch only opens when the coolant loop is stable.', 'These glyphs mean nothing to you, but the Commander might be able to decode them.'],
      airlock: ['Command is transmitting your override code once their navigation is fixed.', 'Dots and dashes: you have a card for that.'],
    },
  };
  let hintCount = {};

  // ---------- Actions ----------

  const ACTS = {
    go(arg) { prevView = view; setView(arg); },
    turn() { setView(view === 'w1' ? 'w2' : 'w1'); },
    back() {
      if (view.startsWith('item:')) setView(prevView);
      else setView(ROOMS[role].views[view].parent || 'w1');
    },
    take(id) { take(id); render(); },
    kp(k) {
      if (ui.kpState) return;
      const entry = ui.entry || '';
      if (k === 'C') ui.entry = '';
      else if (k === '⏎') {
        if (entry.length !== kpConf.len) return;
        const conf = kpConf;
        if (entry === conf.answer) {
          ui.kpState = 'ok'; render();
          setTimeout(() => { ui = {}; conf.onSolve(); render(); }, 500);
        } else {
          ui.kpState = 'err'; render();
          setTimeout(() => { ui.kpState = null; ui.entry = ''; render(); }, 600);
        }
        return;
      } else if (entry.length < kpConf.len) ui.entry = entry + k;
      render();
    },
    col(k) {
      ui.colors = ui.colors || [];
      if (ui.colors.length >= BEACON_SEQ.length || ui.colErr) return;
      ui.colors.push(k);
      render();
      if (ui.colors.length === BEACON_SEQ.length) {
        if (ui.colors.join('') === BEACON_SEQ.join('')) {
          setTimeout(() => { solve('toolbox'); ui = {}; say('The tool store doors pop open.'); render(); }, 400);
        } else {
          ui.colErr = true; render();
          setTimeout(() => { ui.colors = []; ui.colErr = false; render(); }, 700);
        }
      }
    },
    colClear() { ui.colors = []; render(); },
    lc(arg) {
      const [i, d] = arg.split(':').map(Number);
      ui.letters = ui.letters || [0, 0, 0, 0, 0];
      ui.letters[i] = (ui.letters[i] + d + 26) % 26;
      ui.lcErr = false;
      render();
    },
    lcEnter() {
      const word = (ui.letters || [0, 0, 0, 0, 0]).map(n => String.fromCharCode(65 + n)).join('');
      if (word === PASSWORD) { solve('terminal'); ui = {}; } else ui.lcErr = true;
      render();
    },
    nav(arg) {
      const [r, c] = arg.split(',').map(Number);
      ui.path = ui.path || [];
      if (ui.path.some(([a, b]) => a === r && b === c) || ui.path.length >= 16) return;
      ui.path.push([r, c]);
      render();
    },
    navClear() { ui.path = []; render(); },
    navEngage() {
      const p = ui.path || [];
      if (p.length === COURSE.length && p.every(([r, c], i) => r === COURSE[i][0] && c === COURSE[i][1])) {
        solve('nav'); ui = {}; say('Course accepted. A drawer slides open below the console.');
      } else { ui.path = []; say('COURSE REJECTED'); }
      render();
    },
    valve(arg) {
      const [sh, d] = arg.split(':');
      state.valves[sh] = (state.valves[sh] + Number(d) + 10) % 10;
      save(); render();
    },
    flow() {
      if (VALVE_ORDER.every(s => state.valves[s] === PRESSURES[s])) { solve('valves'); say('The coolant loop stabilises. Somewhere nearby, a hatch unseals.'); } else say('Pressure mismatch. The loop is still unstable.');
      render();
    },
    marks() {
      if (selected !== 'uvtorch') say(hasItem('uvtorch') ? 'Faint smudges. Maybe some light would help. Try selecting the torch.' : 'Faint smudges, too faint to read. You\'d need some kind of special light.');
    },
  };

  // ---------- Rendering ----------

  function setView(v) {
    view = v;
    ui = {};
    render();
  }

  function render() {
    const room = ROOMS[role];
    let inner;
    if (view.startsWith('item:')) {
      inner = ITEMS[view.slice(5)].view() + vignette + arrowBack;
    } else {
      const v = room.views[view];
      kpConf = null;
      inner = v.art() + vignette + (v.parent ? arrowBack : arrowL + arrowR);
    }
    $('#stage').innerHTML = `<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">${DEFS}${inner}</svg>`;
    $('#room-name').textContent = room.name;
    $('#role-tag').textContent = room.tag;
  }

  function renderInventory() {
    const inv = $('#inventory');
    inv.innerHTML = '<div class="inv-title">Inventory</div>';
    const n = Math.max(6, state.items.length);
    for (let i = 0; i < n; i++) {
      const id = state.items[i];
      const b = document.createElement('button');
      b.className = 'slot' + (id && id === selected ? ' sel' : '');
      if (id) {
        b.title = ITEMS[id].name;
        b.setAttribute('aria-label', ITEMS[id].name);
        b.innerHTML = `<svg viewBox="0 0 100 100">${DEFS}${ITEMS[id].icon()}</svg>`;
        b.addEventListener('click', () => {
          if (selected === id) {
            if (!view.startsWith('item:')) prevView = view;
            setView('item:' + id);
          } else {
            selected = id;
            say(`${ITEMS[id].name} selected. Click it again to look closer.`);
            if (view === 'marks') render();
          }
          renderInventory();
        });
      }
      inv.append(b);
    }
  }

  // Beacon animation (runs continuously, updates whatever beacon is on screen)
  (function beaconLoop() {
    let i = 0;
    const set = c => {
      document.querySelectorAll('.beacon-lamp').forEach(n => n.setAttribute('fill', c || '#2a2f3e'));
      document.querySelectorAll('.beacon-glow').forEach(n => n.setAttribute('fill', c ? c + 'aa' : 'transparent'));
    };
    const step = () => {
      if (i < BEACON_SEQ.length) {
        set(COLORS[BEACON_SEQ[i]]);
        setTimeout(() => { set(null); i++; setTimeout(step, 280); }, 650);
      } else { i = 0; set(null); setTimeout(step, 2400); }
    };
    setTimeout(step, 900);
  })();

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function tick() {
    if (state) $('#timer').textContent = fmtTime((state.end || Date.now()) - state.start);
  }

  function showHint() {
    const key = view.startsWith('item:') ? prevView : view;
    const list = (HINTS[role] || {})[key] || [];
    if (!list.length) return say('No hints for this.', 'hint');
    const n = hintCount[key] || 0;
    say(`💡 ${list[n % list.length]}`, 'hint');
    hintCount[key] = n + 1;
  }

  // ---------- Boot ----------

  function startRole(r) {
    role = r;
    state = load(r) || freshState();
    save();
    try { localStorage.setItem(SAVE_PREFIX + 'last', r); } catch (e) { /* ignore */ }
    view = 'w1'; prevView = 'w1'; ui = {}; selected = null; hintCount = {};
    $('#intro').classList.add('hidden');
    $('#game').classList.remove('hidden');
    render();
    renderInventory();
    tick();
    say(r === 'commander' ? 'You\'re on the Command Deck. Click things to inspect them. Use the side arrows to turn around.' : 'You\'re in the Engineering Bay. Click things to inspect them. Use the side arrows to turn around.');
  }

  $('#stage').addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (t && ACTS[t.dataset.act]) ACTS[t.dataset.act](t.dataset.arg);
  });
  document.querySelectorAll('.role-btn').forEach(b => b.addEventListener('click', () => startRole(b.dataset.role)));
  $('#hint-btn').addEventListener('click', showHint);
  $('#menu-btn').addEventListener('click', () => $('#menu').classList.remove('hidden'));
  document.querySelectorAll('[data-close-menu]').forEach(b => b.addEventListener('click', () => $('#menu').classList.add('hidden')));
  $('#menu').addEventListener('click', e => { if (e.target.id === 'menu') $('#menu').classList.add('hidden'); });
  $('#switch-role').addEventListener('click', () => {
    $('#menu').classList.add('hidden');
    $('#game').classList.add('hidden');
    $('#intro').classList.remove('hidden');
    try { localStorage.removeItem(SAVE_PREFIX + 'last'); } catch (e) { /* ignore */ }
    role = null; state = null;
  });
  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('Reset all progress for this role?')) return;
    state = freshState();
    save();
    $('#menu').classList.add('hidden');
    view = 'w1'; ui = {}; selected = null;
    render(); renderInventory();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('#menu').classList.add('hidden');
  });
  setInterval(tick, 1000);

  let last = null;
  try { last = localStorage.getItem(SAVE_PREFIX + 'last'); } catch (e) { /* ignore */ }
  if (last && ROOMS[last]) startRole(last);
})();
