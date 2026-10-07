/* Station Halcyon: Split Signal
 * A two-player co-op escape room. Each player runs the game on their own
 * device; the rooms hold each other's clues, so players must talk.
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
    cross:    { cat: 5, lines: [[[50, 8], [50, 50], [50, 92]], [[15, 38], [50, 38], [85, 38]]] },
    ex:       { cat: 8, lines: [[[15, 15], [50, 50], [85, 85]], [[85, 15], [15, 85]]] },
    kite:     { cat: 3, lines: [[[50, 8], [85, 45], [50, 82], [15, 45], [50, 8]], [[50, 82], [50, 96]]] },
    kiteUp:   { cat: 6, lines: [[[50, 18], [85, 55], [50, 92], [15, 55], [50, 18]], [[50, 18], [50, 4]]] },
    tri:      { cat: 1, lines: [[[20, 80], [50, 20], [80, 80], [20, 80]], [[80, 80], [95, 60]]] },
  };
  const LOCKER_PLATES = ['zigzag', 'dipperR', 'cross', 'kite'];
  const LOCKER_CODE = LOCKER_PLATES.map(k => CONSTELLATIONS[k].cat).join(''); // 7453
  const CHART_ORDER = ['kiteUp', 'zigzagUp', 'dipperL', 'cross', 'tri', 'zigzag', 'ex', 'kite', 'dipperR'];

  const COLORS = { R: '#f56565', G: '#48bb78', B: '#4299e1', Y: '#ecc94b' };
  const COLOR_NAMES = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' };
  const BEACON_SEQ = ['Y', 'B', 'R', 'B', 'G'];

  const LETTER_GRID = [
    'XQCLA',
    'RTSPO',
    'MIVKD',
    'HAYER',
    'GTWSN',
  ];
  const HOLES = [[0, 2], [1, 4], [2, 0], [3, 3], [4, 1]]; // spells COMET
  const PASSWORD = 'COMET';

  // Course as the Commander sees it (north = up). Engineer sees it rotated.
  const COURSE = [[3, 1], [3, 0], [2, 0], [1, 0], [1, 1], [1, 2], [2, 2], [2, 3]];

  // Valves / gauges
  const PRESSURES = { tri: 6, circ: 2, sq: 9 };
  const SHAPE_SYM = { tri: '▲', circ: '●', sq: '■' };
  const GAUGE_ORDER = ['sq', 'circ', 'tri'];
  const VALVE_ORDER = ['tri', 'circ', 'sq'];

  // Cipher wheel: symbol -> digit
  const CIPHER = [
    ['☉', 4], ['☾', 7], ['★', 1], ['☄', 9], ['♄', 2],
    ['♃', 6], ['♂', 3], ['♀', 8], ['⊕', 5], ['✦', 0],
  ];
  const HATCH_SYMBOLS = ['♂', '♃', '☾', '♄'];
  const CMD_AIRLOCK = HATCH_SYMBOLS.map(s => CIPHER.find(c => c[0] === s)[1]).join(''); // 3672

  const MORSE = ['-----', '.----', '..---', '...--', '....-', '.....', '-....', '--...', '---..', '----.'];
  const ENG_AIRLOCK = '3806';

  // ---------- State ----------

  const SAVE_PREFIX = 'halcyon-save-v1-';
  let role = null;
  let state = null;

  function freshState() {
    return { solved: {}, items: [], start: Date.now(), end: null };
  }
  function load(r) {
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + r);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(SAVE_PREFIX + role, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  const isSolved = id => !!state.solved[id];
  const hasItem = id => state.items.includes(id);
  function solve(id) { state.solved[id] = true; save(); renderRoom(); }
  function giveItem(id) {
    if (!hasItem(id)) { state.items.push(id); save(); renderInventory(); toast(`Picked up: ${ITEMS[id].name}`); }
  }

  // ---------- DOM helpers ----------

  const $ = sel => document.querySelector(sel);
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // Digit keypad. Calls onSolve() when the right code is entered.
  function keypad({ length, answer, onSolve }) {
    let entry = '';
    const display = el('div', { class: 'code-display' });
    const draw = () => {
      display.innerHTML = '';
      for (let i = 0; i < length; i++) display.append(el('div', { class: 'code-slot' }, entry[i] || ''));
    };
    const submit = () => {
      if (entry.length !== length) return;
      if (entry === answer) {
        display.classList.add('ok');
        setTimeout(onSolve, 450);
      } else {
        display.classList.add('err');
        setTimeout(() => { display.classList.remove('err'); entry = ''; draw(); }, 600);
      }
    };
    const keys = el('div', { class: 'keys' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⏎']) {
      keys.append(el('button', {
        class: 'key',
        onclick: () => {
          if (k === 'C') entry = '';
          else if (k === '⏎') return submit();
          else if (entry.length < length) entry += k;
          draw();
        },
      }, k));
    }
    draw();
    return el('div', { class: 'keypad' }, display, keys);
  }

  function constellationSVG(key, { plate = false } = {}) {
    const c = CONSTELLATIONS[key];
    const pts = new Map();
    let paths = '';
    for (const line of c.lines) {
      paths += `<polyline points="${line.map(p => p.join(',')).join(' ')}" fill="none" stroke="${plate ? '#9fb3e8' : '#5a6fa8'}" stroke-width="1.6" stroke-linejoin="round"/>`;
      for (const p of line) pts.set(p.join(','), p);
    }
    // Don't draw a star at the crossing point of the cross / X shapes.
    let stars = '';
    for (const [k, p] of pts) {
      if (k === '50,50' && (key === 'ex' || key === 'cross')) continue;
      if (k === '50,38' && key === 'cross') continue;
      stars += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#fff" />`;
    }
    return `<svg viewBox="-4 -4 108 108" aria-hidden="true">${paths}${stars}</svg>`;
  }

  function gaugeSVG(shape, value) {
    // 0..9 across a 240° sweep
    const angle = -120 + (value / 9) * 240;
    let ticks = '';
    for (let i = 0; i <= 9; i++) {
      const a = (-120 + (i / 9) * 240 - 90) * Math.PI / 180;
      const r1 = 62, r2 = i % 9 === 0 ? 50 : 55;
      ticks += `<line x1="${80 + r1 * Math.cos(a)}" y1="${80 + r1 * Math.sin(a)}" x2="${80 + r2 * Math.cos(a)}" y2="${80 + r2 * Math.sin(a)}" stroke="#9fb3e8" stroke-width="${i % 9 === 0 ? 3 : 2}"/>`;
    }
    return `<svg viewBox="0 0 160 170">
      <circle cx="80" cy="80" r="72" fill="#0a0f1e" stroke="#3b4670" stroke-width="6"/>
      ${ticks}
      <text x="40" y="128" fill="#8a97b8" font-size="11" font-family="monospace">MIN</text>
      <text x="104" y="128" fill="#8a97b8" font-size="11" font-family="monospace">MAX</text>
      <g transform="rotate(${angle} 80 80)"><line x1="80" y1="88" x2="80" y2="26" stroke="#fc8181" stroke-width="3" stroke-linecap="round"/></g>
      <circle cx="80" cy="80" r="6" fill="#dfe7ff"/>
      <text x="80" y="164" text-anchor="middle" fill="#f6ad55" font-size="20">${SHAPE_SYM[shape]}</text>
    </svg>`;
  }

  function cipherSVG() {
    let s = '<svg viewBox="0 0 300 300">';
    s += '<circle cx="150" cy="150" r="140" fill="#1b2238" stroke="#7f9cf5" stroke-width="3"/>';
    s += '<circle cx="150" cy="150" r="88" fill="#0f1628" stroke="#4fd1c5" stroke-width="2"/>';
    s += '<circle cx="150" cy="150" r="14" fill="#7f9cf5"/>';
    CIPHER.forEach(([sym, digit], i) => {
      const a = (i / CIPHER.length) * Math.PI * 2 - Math.PI / 2;
      const a2 = a + Math.PI / CIPHER.length;
      const sx = 150 + 115 * Math.cos(a), sy = 150 + 115 * Math.sin(a);
      const dx = 150 + 62 * Math.cos(a), dy = 150 + 62 * Math.sin(a);
      s += `<line x1="${150 + 88 * Math.cos(a2)}" y1="${150 + 88 * Math.sin(a2)}" x2="${150 + 140 * Math.cos(a2)}" y2="${150 + 140 * Math.sin(a2)}" stroke="#3b4670"/>`;
      s += `<line x1="${150 + 14 * Math.cos(a2)}" y1="${150 + 14 * Math.sin(a2)}" x2="${150 + 88 * Math.cos(a2)}" y2="${150 + 88 * Math.sin(a2)}" stroke="#24304f"/>`;
      s += `<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="central" font-size="28" font-family="Segoe UI Symbol, DejaVu Sans, Noto Sans Symbols, sans-serif" fill="#f6ad55">${sym}${VS}</text>`;
      s += `<text x="${dx}" y="${dy}" text-anchor="middle" dominant-baseline="central" font-size="22" font-family="monospace" fill="#4fd1c5">${digit}</text>`;
    });
    return s + '</svg>';
  }

  // ---------- Items ----------

  const ITEMS = {
    uvtorch: {
      name: 'UV Torch', icon: '🔦',
      inspect: body => body.append(el('p', {}, 'A small ultraviolet torch. Good for showing up markings you can\'t normally see.')),
    },
    cipher: {
      name: 'Cipher Wheel', icon: '🧭',
      inspect: body => {
        body.append(el('p', { class: 'flavor' }, 'A brass decoder wheel from the navigation drawer. Stamped on the back: "OVERRIDE GLYPHS".'));
        body.append(el('div', { class: 'cipher', html: cipherSVG() }));
      },
    },
    punchcard: {
      name: 'Punch Card', icon: '🎫',
      inspect: body => {
        const grid = el('div', { class: 'punch-grid' });
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
          grid.append(el('div', { class: HOLES.some(([hr, hc]) => hr === r && hc === c) ? 'hole' : '' }));
        }
        body.append(el('p', { class: 'flavor' }, 'A stiff card with holes punched through it. Not much use by itself.'));
        body.append(el('div', { class: 'punch' },
          el('div', { class: 'punch-top' }, '▲ THIS SIDE UP ▲'),
          grid,
          el('div', { class: 'small', style: 'color:#6b5a38;margin-top:8px;text-align:center' }, 'MASK 05 · read left to right, top to bottom'),
        ));
      },
    },
    morsecard: {
      name: 'Morse Card', icon: '📇',
      inspect: body => {
        body.append(el('p', { class: 'flavor' }, 'A laminated reference card for the emergency radio.'));
        const t = el('div', { class: 'morse-table' });
        MORSE.forEach((m, d) => t.append(el('div', {}, `${d}  ${prettyMorse(m)}`)));
        body.append(t);
      },
    },
  };

  function prettyMorse(m) { return m.split('').map(ch => (ch === '.' ? '•' : '—')).join(' '); }

  // ---------- Rooms ----------

  const ROOMS = {
    commander: {
      name: 'Command Deck',
      tag: 'Commander',
      desc: 'Emergency lighting only. The bulkhead to Engineering is sealed. Your partner is on the other side, and the intercom still works.',
      hotspots: [
        {
          id: 'locker', icon: '🗄️', name: 'Personal Locker',
          blurb: 'Four engraved plates above a keypad.',
          status: () => (isSolved('locker') ? 'solved' : 'locked'),
          hints: [
            'The plates show star patterns. You don\'t have a star chart, but maybe Engineering does.',
            'Describe each pattern carefully. Some patterns on a chart can look very similar, just flipped or upside down.',
            'Every constellation on the Engineer\'s chart has a catalogue number. Put the four numbers in plate order, left to right.',
          ],
          open(body) {
            if (isSolved('locker')) {
              body.append(el('p', { class: 'center' }, 'The locker hangs open. It\'s empty now.'));
              return;
            }
            body.append(el('p', {}, 'Four brushed-metal plates are riveted above the keypad, each engraved with a pattern of stars.'));
            const g = el('div', { class: 'const-grid four' });
            LOCKER_PLATES.forEach(k => g.append(el('div', { class: 'const-card plate', html: constellationSVG(k, { plate: true }) })));
            body.append(g);
            body.append(keypad({
              length: 4, answer: LOCKER_CODE,
              onSolve: () => { solve('locker'); giveItem('uvtorch'); openHotspot('locker'); },
            }));
          },
        },
        {
          id: 'beacon', icon: '🚨', name: 'Status Beacon',
          blurb: 'A warning lamp, blinking in different colours.',
          status: () => 'live',
          hints: [
            'The beacon repeats the same sequence over and over. The long dark pause is where the sequence starts and ends.',
            'Colours are no use to you here. Ask the Engineer if anything on their side takes colours.',
          ],
          open(body) {
            body.append(el('p', {}, 'A ceiling-mounted fault beacon. The label reads "ENG. TOOL STORE: ACCESS SEQUENCE BROADCAST".'));
            const lamp = el('div', { class: 'beacon' });
            body.append(el('div', { class: 'beacon-wrap' }, lamp));
            let i = 0, timer;
            const step = () => {
              if (i < BEACON_SEQ.length) {
                const c = COLORS[BEACON_SEQ[i]];
                lamp.style.background = c;
                lamp.style.boxShadow = `0 0 40px ${c}`;
                timer = setTimeout(() => {
                  lamp.style.background = '';
                  lamp.style.boxShadow = '';
                  i++;
                  timer = setTimeout(step, 280);
                }, 650);
              } else {
                i = 0;
                timer = setTimeout(step, 2400);
              }
            };
            timer = setTimeout(step, 900);
            return () => clearTimeout(timer);
          },
        },
        {
          id: 'wall', icon: '🧱', name: 'Bulkhead Wall',
          blurb: 'Scuffed panels. Something might be written there.',
          status: () => (hasItem('uvtorch') ? 'live' : ''),
          hints: [
            'There\'s something on the wall that you can only see in the right light.',
            'The letters on their own mean nothing. Engineering may have a card that tells you which ones matter.',
            'The punch card\'s holes line up with the grid. Read the letters under the holes, left to right and top to bottom. That word is useful to the Engineer.',
          ],
          open(body) {
            const grid = el('div', { class: 'letter-grid' });
            LETTER_GRID.forEach(row => row.split('').forEach(ch => grid.append(el('div', {}, ch))));
            const wall = el('div', { class: 'wall dark' }, grid);
            body.append(el('p', {}, 'Faint smudges cover a 5 × 5 section of the wall panel, too faint to make out.'));
            body.append(wall);
            if (hasItem('uvtorch')) {
              const btn = el('button', {
                class: 'btn', onclick: () => {
                  const on = wall.classList.toggle('uv');
                  wall.classList.toggle('dark', !on);
                  btn.textContent = on ? 'Switch off UV torch' : 'Shine UV torch';
                },
              }, 'Shine UV torch');
              body.append(el('div', { class: 'row', style: 'margin-top:14px' }, btn));
            } else {
              body.append(el('p', { class: 'flavor center' }, 'You\'d need some kind of special light to read this.'));
            }
          },
        },
        {
          id: 'gauges', icon: '⏲️', name: 'Coolant Gauges',
          blurb: 'Three pressure dials, needles twitching.',
          status: () => '',
          hints: [
            'The dials show pressure readings. Count the tick marks from MIN, which is 0.',
            'There\'s nothing to adjust here. The valves must be somewhere else.',
          ],
          open(body) {
            body.append(el('p', {}, 'A panel labelled "COOLANT LOOP: TARGET PRESSURE". Each dial has ten tick marks running from MIN (0) to MAX.'));
            const g = el('div', { class: 'gauges' });
            GAUGE_ORDER.forEach(s => g.append(el('div', { html: gaugeSVG(s, PRESSURES[s]) })));
            body.append(g);
          },
        },
        {
          id: 'nav', icon: '🧭', name: 'Navigation Console',
          blurb: 'A 4 × 4 grid of buttons. Screen: "AWAITING COURSE".',
          status: () => (isSolved('nav') ? 'solved' : 'locked'),
          hints: [
            'The course has to be plotted from Engineering. Their terminal might have it.',
            'Check which way north is on both screens. They might not match.',
            'Press the cells in the order the course runs, starting from the marked start, then press ENGAGE.',
          ],
          open(body) {
            if (isSolved('nav')) {
              body.append(el('p', {}, 'The course is locked in. The console\'s drawer slid open, and the screen is now looping a transmission:'));
              body.append(el('div', { class: 'morse-screen' }, ENG_AIRLOCK.split('').map(d => prettyMorse(MORSE[d])).join('   /   ')));
              body.append(el('p', { class: 'small center' }, 'Header: "ENGINEERING AIRLOCK OVERRIDE: TRANSMITTING"'));
              if (!hasItem('cipher')) giveItem('cipher');
              return;
            }
            body.append(el('p', {}, 'Plot the course by pressing cells in order, then ENGAGE.'));
            let path = [];
            const grid = el('div', { class: 'nav-grid' });
            const cells = [];
            for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
              const b = el('button', {
                class: 'nav-cell', onclick: () => {
                  if (path.some(([pr, pc]) => pr === r && pc === c)) return;
                  path.push([r, c]);
                  b.classList.add('on');
                  b.textContent = path.length;
                },
              });
              cells.push(b);
              grid.append(b);
            }
            const reset = () => { path = []; cells.forEach(b => { b.classList.remove('on'); b.textContent = ''; }); };
            body.append(el('div', { class: 'compass' }, 'N ↑'));
            body.append(grid);
            body.append(el('div', { class: 'row', style: 'margin-top:14px' },
              el('button', { class: 'btn secondary', onclick: reset }, 'Clear'),
              el('button', {
                class: 'btn', onclick: () => {
                  const ok = path.length === COURSE.length && path.every(([r, c], i) => r === COURSE[i][0] && c === COURSE[i][1]);
                  if (ok) { solve('nav'); toast('Course accepted. A drawer slides open.'); openHotspot('nav'); } else { toast('COURSE REJECTED'); reset(); }
                },
              }, 'ENGAGE'),
            ));
          },
        },
        {
          id: 'airlock', icon: '🚪', name: 'Airlock (Command side)',
          blurb: 'Override keypad. Your way out.',
          status: () => (isSolved('airlock') ? 'solved' : 'locked'),
          hints: [
            'The override code is shown as glyphs somewhere in Engineering, probably once their systems are stable.',
            'You have something that turns glyphs into digits.',
          ],
          open(body) {
            if (isSolved('airlock')) return showWin(body);
            body.append(el('p', {}, 'A heavy door marked "EVA AIRLOCK". The panel reads "MANUAL OVERRIDE: ENTER 4-DIGIT CODE".'));
            body.append(keypad({ length: 4, answer: CMD_AIRLOCK, onSolve: () => { win(); openHotspot('airlock'); } }));
          },
        },
      ],
    },

    engineer: {
      name: 'Engineering Bay',
      tag: 'Engineer',
      desc: 'Alarms are flashing and the coolant loop is unstable. The bulkhead to Command is sealed, but you can hear your Commander over the intercom.',
      hotspots: [
        {
          id: 'chart', icon: '🌌', name: 'Star Chart',
          blurb: 'A framed sky survey with catalogue numbers.',
          status: () => '',
          hints: [
            'There\'s nothing to unlock here, but this chart is probably the key to something in Command.',
            'Watch out: several patterns are mirror images or upside-down versions of each other.',
          ],
          open(body) {
            body.append(el('p', {}, 'A survey chart titled "HALCYON NAVIGATION REFERENCE". Each constellation has a catalogue number.'));
            const g = el('div', { class: 'const-grid nine' });
            CHART_ORDER.forEach(k => g.append(el('div', { class: 'const-card' },
              el('div', { html: constellationSVG(k) }),
              el('div', { class: 'cat' }, `CAT-${CONSTELLATIONS[k].cat}`),
            )));
            body.append(g);
          },
        },
        {
          id: 'toolbox', icon: '🧰', name: 'Tool Store',
          blurb: 'A locker with four coloured buttons.',
          status: () => (isSolved('toolbox') ? 'solved' : 'locked'),
          hints: [
            'The lock wants a sequence of colours. You don\'t have any colours to go on, but the Commander might.',
            'The sequence is five colours long. The Commander needs to find where it starts.',
          ],
          open(body) {
            if (isSolved('toolbox')) {
              body.append(el('p', { class: 'center' }, 'The tool store is open. You already took everything useful.'));
              return;
            }
            body.append(el('p', {}, 'A sticker on the lock: "ACCESS SEQUENCE IS BROADCAST ON COMMAND DECK BEACON".'));
            let entry = [];
            const slots = el('div', { class: 'color-slots' });
            const draw = () => {
              slots.innerHTML = '';
              for (let i = 0; i < BEACON_SEQ.length; i++) {
                const s = el('div', { class: 'color-slot' });
                if (entry[i]) s.style.background = COLORS[entry[i]];
                slots.append(s);
              }
            };
            const keys = el('div', { class: 'color-keys' });
            for (const k of ['R', 'G', 'B', 'Y']) {
              keys.append(el('button', {
                class: 'color-key', style: `background:${COLORS[k]}`, 'aria-label': COLOR_NAMES[k],
                onclick: () => {
                  if (entry.length >= BEACON_SEQ.length) return;
                  entry.push(k); draw();
                  if (entry.length === BEACON_SEQ.length) {
                    if (entry.join('') === BEACON_SEQ.join('')) {
                      setTimeout(() => { solve('toolbox'); giveItem('punchcard'); giveItem('morsecard'); openHotspot('toolbox'); }, 300);
                    } else {
                      slots.style.animation = 'shake .35s';
                      setTimeout(() => { slots.style.animation = ''; entry = []; draw(); }, 500);
                    }
                  }
                },
              }));
            }
            draw();
            body.append(slots, keys);
            body.append(el('div', { class: 'row', style: 'margin-top:12px' }, el('button', { class: 'btn secondary', onclick: () => { entry = []; draw(); } }, 'Clear')));
          },
        },
        {
          id: 'terminal', icon: '💻', name: 'Engineering Terminal',
          blurb: 'Password protected.',
          status: () => (isSolved('terminal') ? 'solved' : 'locked'),
          hints: [
            'The password is a five-letter word. It\'s hidden in Command, but you have the thing that shows which letters to read.',
            'Describe the punch card\'s hole positions to the Commander row by row.',
            'Once you\'re in, read everything. The course diagram is for the Commander, and north isn\'t "up" on your screen.',
          ],
          open(body) {
            const term = el('div', { class: 'terminal' });
            body.append(term);
            if (!isSolved('terminal')) {
              term.append(el('p', {}, 'HALCYON ENGINEERING OS v4.2'));
              term.append(el('p', {}, 'Password hint: MASK 05'));
              const input = el('input', { maxlength: '12', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Password' });
              const msg = el('p', {});
              const tryIt = () => {
                if (input.value.trim().toUpperCase() === PASSWORD) { solve('terminal'); openHotspot('terminal'); } else { msg.className = 'err'; msg.textContent = 'ACCESS DENIED'; input.value = ''; }
              };
              input.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
              term.append(el('p', {}, '> PASSWORD: ', input), msg);
              body.append(el('div', { class: 'row', style: 'margin-top:12px' }, el('button', { class: 'btn', onclick: tryIt }, 'Log in')));
              setTimeout(() => input.focus(), 50);
              return;
            }
            term.append(el('p', {}, 'ACCESS GRANTED. WELCOME, ENGINEER.'));
            term.append(el('p', {}, '[LOG 1] Collision course detected. Navigation correction plotted. Command must enter it manually:'));
            const grid = el('div', { class: 'nav-grid', style: 'margin:12px 0' });
            // Engineer's display is rotated: north points right.
            const rot = ([r, c]) => [c, 3 - r];
            const cellsMap = {};
            COURSE.forEach((p, i) => { const [r, c] = rot(p); cellsMap[`${r},${c}`] = i; });
            for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
              const i = cellsMap[`${r},${c}`];
              const label = i === undefined ? '' : i === 0 ? 'S' : i === COURSE.length - 1 ? 'E' : '•';
              grid.append(el('div', { class: `nav-cell view ${i !== undefined ? 'path' : ''}` }, label));
            }
            term.append(el('div', { class: 'nav-wrap' }, grid, el('div', { class: 'compass' }, 'N →')));
            term.append(el('p', {}, '(S = start, E = end. Follow the lit path.)'));
            term.append(el('p', {}, '[LOG 2] WARNING: Coolant loop unstable. Set valves to the TARGET PRESSURES on the Command Deck coolant gauges.'));
            term.append(el('p', {}, '[LOG 3] Maintenance hatch will unseal once the coolant loop is stable.'));
          },
        },
        {
          id: 'valves', icon: '🔩', name: 'Coolant Valves',
          blurb: 'Three valves marked with shapes.',
          status: () => (isSolved('valves') ? 'solved' : 'locked'),
          hints: [
            'You need target pressures. They aren\'t in this room.',
            'Match each valve to the gauge with the same shape. The gauges may not be in the same order as your valves.',
          ],
          open(body) {
            if (isSolved('valves')) {
              body.append(el('p', { class: 'center' }, 'Coolant loop stable. Pressure locked.'));
              return;
            }
            body.append(el('p', {}, 'Three manual valves, each with a pressure setting from 0 to 9.'));
            const vals = { tri: 0, circ: 0, sq: 0 };
            const wrap = el('div', { class: 'valves' });
            VALVE_ORDER.forEach(s => {
              const out = el('div', { class: 'val' }, '0');
              const bump = d => { vals[s] = (vals[s] + d + 10) % 10; out.textContent = vals[s]; };
              wrap.append(el('div', { class: 'valve' },
                el('div', { class: 'sym', style: 'color:var(--warn)' }, SHAPE_SYM[s]),
                el('button', { class: 'key', onclick: () => bump(1), 'aria-label': 'Increase' }, '▲'),
                out,
                el('button', { class: 'key', onclick: () => bump(-1), 'aria-label': 'Decrease' }, '▼'),
              ));
            });
            body.append(wrap);
            body.append(el('div', { class: 'row', style: 'margin-top:14px' }, el('button', {
              class: 'btn', onclick: () => {
                if (VALVE_ORDER.every(s => vals[s] === PRESSURES[s])) { solve('valves'); toast('Coolant stable. You hear a hatch unseal.'); openHotspot('valves'); } else toast('Pressure mismatch. The loop is still unstable.');
              },
            }, 'Open flow')));
          },
        },
        {
          id: 'hatch', icon: '🛠️', name: 'Maintenance Hatch',
          blurb: 'A small service hatch with a warning light.',
          status: () => (isSolved('valves') ? 'live' : 'locked'),
          hints: [
            'The hatch only opens when the coolant loop is stable.',
            'These glyphs mean nothing to you, but the Commander might have a way to decode them.',
          ],
          open(body) {
            if (!isSolved('valves')) {
              body.append(el('p', {}, 'A red light glows above the hatch: "SEALED: COOLANT PRESSURE UNSTABLE".'));
              return;
            }
            body.append(el('p', {}, 'The hatch has swung open. Inside, a small amber screen reads "COMMAND AIRLOCK OVERRIDE":'));
            body.append(el('div', { class: 'symbol-screen' }, HATCH_SYMBOLS.map(s => s + VS).join(' ')));
          },
        },
        {
          id: 'airlock', icon: '🚪', name: 'Airlock (Engineering side)',
          blurb: 'Override keypad. Your way out.',
          status: () => (isSolved('airlock') ? 'solved' : 'locked'),
          hints: [
            'Command is transmitting your override code once their navigation is fixed.',
            'Dots and dashes... you have a card for that.',
          ],
          open(body) {
            if (isSolved('airlock')) return showWin(body);
            body.append(el('p', {}, 'A heavy door marked "EVA AIRLOCK". The panel reads "MANUAL OVERRIDE: CODE TRANSMITTED FROM COMMAND".'));
            body.append(keypad({ length: 4, answer: ENG_AIRLOCK, onSolve: () => { win(); openHotspot('airlock'); } }));
          },
        },
      ],
    },
  };

  // ---------- Rendering ----------

  function renderRoom() {
    const room = ROOMS[role];
    $('#room-name').textContent = room.name;
    $('#role-tag').textContent = room.tag;
    $('#room-desc').textContent = room.desc;
    const wrap = $('#room');
    wrap.innerHTML = '';
    for (const h of room.hotspots) {
      const st = h.status();
      const label = { solved: 'Solved', locked: 'Locked', live: 'Active' }[st];
      wrap.append(el('button', { class: 'hotspot', onclick: () => openHotspot(h.id) },
        label ? el('span', { class: `badge ${st}` }, label) : null,
        el('span', { class: 'hs-icon' }, h.icon),
        el('span', { class: 'hs-name' }, h.name),
        el('span', { class: 'hs-blurb' }, h.blurb),
      ));
    }
    renderInventory();
  }

  function renderInventory() {
    const inv = $('#inventory');
    inv.innerHTML = '';
    if (!state.items.length) { inv.append(el('span', { class: 'inv-empty' }, 'Empty')); return; }
    for (const id of state.items) {
      const it = ITEMS[id];
      inv.append(el('button', { class: 'inv-item', onclick: () => openItem(id) }, el('span', {}, it.icon), it.name));
    }
  }

  let cleanup = null;
  let hintIndex = 0;
  let currentHints = [];

  function openModal(title, fill, hints = []) {
    if (cleanup) { cleanup(); cleanup = null; }
    $('#modal-title').textContent = title;
    const body = $('#modal-body');
    body.innerHTML = '';
    cleanup = fill(body) || null;
    currentHints = hints;
    hintIndex = 0;
    $('#hint-box').innerHTML = '';
    $('#hint-btn').classList.toggle('hidden', !hints.length);
    $('#hint-btn').textContent = 'Need a hint?';
    $('#modal').classList.remove('hidden');
  }
  function closeModal() {
    if (cleanup) { cleanup(); cleanup = null; }
    $('#modal').classList.add('hidden');
  }
  function openHotspot(id) {
    const h = ROOMS[role].hotspots.find(x => x.id === id);
    openModal(h.name, body => h.open(body), h.hints);
  }
  function openItem(id) {
    const it = ITEMS[id];
    openModal(`${it.icon} ${it.name}`, body => it.inspect(body));
  }

  function showHint() {
    if (hintIndex >= currentHints.length) return;
    $('#hint-box').append(el('p', {}, `💡 ${currentHints[hintIndex]}`));
    hintIndex++;
    $('#hint-btn').textContent = hintIndex < currentHints.length ? 'Another hint' : 'No more hints';
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function tick() {
    if (!state) return;
    $('#timer').textContent = fmtTime((state.end || Date.now()) - state.start);
  }

  function win() {
    state.solved.airlock = true;
    state.end = Date.now();
    save();
    renderRoom();
  }
  function showWin(body) {
    const partner = role === 'commander' ? 'Engineer' : 'Commander';
    body.append(el('div', { class: 'win' },
      el('div', { style: 'font-size:3rem' }, '🌍'),
      el('h3', {}, 'Airlock open. You escaped!'),
      el('p', {}, `Your time: ${fmtTime(state.end - state.start)}`),
      el('p', { class: 'flavor' }, `If the ${partner} isn't through yet, help them. The escape pod won't launch without both of you.`),
    ));
  }

  // ---------- Boot ----------

  function startRole(r) {
    role = r;
    state = load(r) || freshState();
    save();
    try { localStorage.setItem(SAVE_PREFIX + 'last', r); } catch (e) { /* ignore */ }
    $('#intro').classList.add('hidden');
    $('#game').classList.remove('hidden');
    renderRoom();
    tick();
  }

  document.querySelectorAll('.role-btn').forEach(b => b.addEventListener('click', () => startRole(b.dataset.role)));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
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
    renderRoom();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); $('#menu').classList.add('hidden'); }
  });
  setInterval(tick, 1000);

  let last = null;
  try { last = localStorage.getItem(SAVE_PREFIX + 'last'); } catch (e) { /* ignore */ }
  if (last && ROOMS[last]) startRole(last);
})();
