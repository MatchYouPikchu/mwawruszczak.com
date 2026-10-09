/* -------------------------------------------------------------------------
   The trust ladder.
   Forty bank lines, forty ledger entries, one agent proposing a match for
   each. You choose how far up the ladder the agent may go; the figure shows
   what that costs and what it lets through.
   Invented data, deterministic, no dependencies, no network.
   ------------------------------------------------------------------------- */

const N = 40;

/* bank line, ledger entry it should be matched to, how sure the agent is,
   and — for the four it gets wrong — the index of the entry it proposes instead. */
const DATA = [
  {b:'PRZELEW ODRA LOGISTICS SP Z O O FV 2026/10/114', l:'Invoice 2026/10/114, Odra Logistics, 4 820,00 PLN',       c:97},
  {b:'BACS FENWICK & DAUGHTERS INV 2231',              l:'Invoice 2231, Fenwick & Daughters, 1,240.00 GBP',          c:98},
  {b:'PRZELEW NOWAK BAKERY FV 2026/10/116',            l:'Invoice 2026/10/116, Nowak Bakery, 1 145,00 PLN',          c:96},
  {b:'FPS HARBOUR LANE STUDIO INV 2244',               l:'Invoice 2244, Harbour Lane Studio, 3,180.00 GBP',          c:95},
  {b:'PRZELEW KLECZKOW CATERING SP Z O O FV 2026/10/129', l:'Invoice 2026/10/129, Kleczków Catering, 1 260,00 PLN',  c:96},
  {b:'PRZELEW KLECZKOW CATERING SP Z O O FV 2026/10/131', l:'Invoice 2026/10/131, Kleczków Catering, 1 260,00 PLN',  c:93, w:4},
  {b:'PRZELEW TUMSKI PRINT HOUSE FV 2026/10/118',      l:'Invoice 2026/10/118, Tumski Print House, 2 390,00 PLN',    c:94},
  {b:'BACS THACKERAY JOINERY INV 2251',                l:'Invoice 2251, Thackeray Joinery, 7,420.00 GBP',            c:99},
  {b:'PRZELEW KOWALCZYK ELECTRICAL FV 2026/10/121',    l:'Invoice 2026/10/121, Kowalczyk Electrical, 6 075,00 PLN',  c:93},
  {b:'PRZELEW BRZOZOWA DENTAL CZESC FV 2026/10/122',   l:'Invoice 2026/10/122, Brzozowa Dental, 3 400,00 PLN',       c:68},
  {b:'BACS PENNINE COLDSTORE INV 2258',                l:'Invoice 2258, Pennine Coldstore, 12,650.00 GBP',           c:98},
  {b:'PRZELEW SOWA ACCOUNTING FV 2026-10-127',         l:'Invoice 2026/10/127, Sowa Accounting, 980,00 PLN',         c:79},
  {b:'BACS MARLOW CERAMICS 4418',                      l:'Invoice 4418, Marlow Ceramics, 865.00 GBP',                c:74},
  {b:'FPS CALDWELL SIGNAGE INV 2266',                  l:'Invoice 2266, Caldwell Signage, 2,040.00 GBP',             c:97},
  {b:'PRZELEW WISNICKA STUDIO FV 2026/10/133',         l:'Invoice 2026/10/133, Wiśnicka Studio, 5 500,00 PLN',       c:92},
  {b:'FPS WHITMORE TILES INV 2187',                    l:'Invoice 2187, Whitmore Tiles, 640.00 GBP',                 c:97},
  {b:'BACS WHITMORE TILES INV 2187',                   l:'Invoice 2187A, Whitmore Tiles, 1,980.00 GBP',              c:71, w:15},
  {b:'BACS RAVENSBOURNE BOOKS INV 2290 2291',          l:'Invoice 2290, Ravensbourne Books, 1,415.00 GBP',           c:82},
  {b:'PRZELEW RAKOWIEC PLUMBING FV 2026/10/136',       l:'Invoice 2026/10/136, Rakowiec Plumbing, 2 870,00 PLN',     c:95},
  {b:'BACS STONEGATE TIMBERWORKS INV 2298',            l:'Invoice 2298, Stonegate Timberworks, 9,330.00 GBP',        c:99},
  {b:'PRZELEW KARLOWICE TEXTILES FV 2026/10/140 KOREKTA', l:'Invoice 2026/10/140, Karłowice Textiles, 4 115,00 PLN', c:85},
  {b:'FPS ALDERLEY FENCING INV 2304',                  l:'Invoice 2304, Alderley Fencing, 1,755.00 GBP',             c:94},
  {b:'PRZELEW OSTROW TIMBER SP Z O O FV 2026/10/144',  l:'Invoice 2026/10/144, Ostrów Timber, 8 240,00 PLN',         c:96},
  {b:'BACS KINGSMEAD DAIRY INV 2317',                  l:'Invoice 2317, Kingsmead Dairy, 3,960.00 GBP',              c:98},
  {b:'PRZELEW GRABISZYN GLASSWORKS FV 2026/10/154',    l:'Invoice 2026/10/154, Grabiszyn Glassworks, 7 630,00 PLN',  c:93},
  {b:'FPS LYDGATE CYCLES INV 2322',                    l:'Invoice 2322, Lydgate Cycles, 1,090.00 GBP',               c:92},
  {b:'BACS BRAMHALL AUDIO INV 3104',                   l:'Invoice 3104, Bramhall Audio, 2,310.00 GBP',               c:95},
  {b:'FPS BRAMHALL AUDIO',                             l:'Invoice 3118, Bramhall Audio, 2,310.00 GBP',               c:64, w:26},
  {b:'FPS ASHBOURNE LINEN',                            l:'Invoice 4071, Ashbourne Linen, 735.00 GBP',                c:62},
  {b:'PRZELEW ZACISZE GARDENS FV 2026/10/157',         l:'Invoice 2026/10/157, Zacisze Gardens, 2 205,00 PLN',       c:91},
  {b:'BACS TEWKESBURY SAILS INV 2331',                 l:'Invoice 2331, Tewkesbury Sails, 5,845.00 GBP',             c:99},
  {b:'PRZELEW BISKUPIN PHARMACY FV 2026/10/160',       l:'Invoice 2026/10/160, Biskupin Pharmacy, 1 480,00 PLN',     c:86},
  {b:'FPS NETHERBY TOOLING INV 2338',                  l:'Invoice 2338, Netherby Tooling, 4,270.00 GBP',             c:87},
  {b:'PRZELEW ODRA LOGISTICS SP Z O O FV 2026/10/149', l:'Invoice 2026/10/149, Odra Logistics, 9 150,00 PLN',        c:97},
  {b:'PRZELEW ODRA GROUP SP Z O O PLATNOSC ZBIORCZA',  l:'Invoice 2026/10/152, Odra Group, 9 150,00 PLN',            c:88, w:33},
  {b:'PRZELEW PSIE POLE MOTORS FV 2026/10/163',        l:'Invoice 2026/10/163, Psie Pole Motors, 11 900,00 PLN',     c:88},
  {b:'BACS CALDER VALE MILL INV 2345',                 l:'Invoice 2345, Calder Vale Mill, 2,615.00 GBP',             c:89},
  {b:'PRZELEW SRODMIESCIE LEGAL FV 2026/10/166',       l:'Invoice 2026/10/166, Śródmieście Legal, 6 450,00 PLN',     c:94},
  {b:'FPS ILKLEY STONEWORKS INV 2351',                 l:'Invoice 2351, Ilkley Stoneworks, 1,920.00 GBP',            c:96},
  {b:'PRZELEW MUCHOBOR FREIGHT FV 2026/10/169',        l:'Invoice 2026/10/169, Muchobór Freight, 3 745,00 PLN',      c:90}
];

/* what the agent actually proposes for each bank line */
const PROP = DATA.map((d, i) => (d.w == null ? i : d.w));
const WRONG = DATA.map(d => d.w != null);

/* the ledger is not in the same order as the statement. A seeded braid:
   mostly local displacement, a few longer sweeps, identical on every load. */
function braid(n, seed) {
  const a = Array.from({length: n}, (_, i) => i);
  let s = seed;
  const rnd = () => {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const j = Math.min(n - 1, i + 1 + Math.floor(rnd() * 6));
      if (rnd() < 0.8) { const t = a[i]; a[i] = a[j]; a[j] = t; }
    }
  }
  return a;
}
const ORDER = braid(N, 11);          // ORDER[row] = ledger entry shown there
const ROW = [];                      // ROW[entry]  = the row it is shown on
ORDER.forEach((entry, row) => { ROW[entry] = row; });

const RUNGS = {
  suggests:   {label: 'Suggests'},
  drafts:     {label: 'Drafts'},
  reconciles: {label: 'Reconciles'},
  decides:    {label: 'Decides'}
};
const RANK = {sugg: 0, wait: 1, ok: 2, wrong: 3};
const NS = 'http://www.w3.org/2000/svg';

const make = (name, attrs) => {
  const e = document.createElementNS(NS, name);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

const root = document.getElementById('lad');
if (root) start(root);

function start(root) {
  const plot = root.querySelector('#lad-plot');
  const radios = Array.from(root.querySelectorAll('input[name="lad-rung"]'));
  const slider = root.querySelector('#lad-thr-input');
  const sliderOut = root.querySelector('#lad-thr-out');
  const outChecks = root.querySelector('#lad-ro-wait');
  const outWrong = root.querySelector('#lad-ro-wrong');
  const outTime = root.querySelector('#lad-ro-time');
  const live = root.querySelector('#lad-live');
  const srList = root.querySelector('#lad-lines');
  if (!plot || radios.length !== 4 || !slider) return;

  /* the fixed slot under the figure that describes the line you are pointing at */
  const detail = root.querySelector('#lad-detail');
  const dHint = root.querySelector('#lad-detail-hint');
  if (dHint && matchMedia('(hover: none)').matches) dHint.textContent = 'Tap a line to see what the agent proposed, and whether it was right.';
  const dBody = root.querySelector('#lad-detail-body');
  const dBank = root.querySelector('#lad-d-bank');
  const dLed = root.querySelector('#lad-d-led');
  const dConf = root.querySelector('#lad-d-conf');
  const dState = root.querySelector('#lad-d-state');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    rung: (radios.find(r => r.checked) || radios[2]).value,
    thr: +slider.value || 90
  };

  /* ---------- the picture ---------- */
  const svg = make('svg', {class: 'lad-svg', role: 'group', 'aria-label': ''});
  const defs = make('defs');
  const clip = make('clipPath', {id: 'lad-wipe', clipPathUnits: 'userSpaceOnUse'});
  const wipe = make('rect', {x: '0', y: '-40', width: '0', height: '0'});
  clip.appendChild(wipe);
  /* pointing at a curve picks that curve, but only out in the open middle:
     next to the columns the lines are stacked a few pixels apart, and there
     the row band underneath is the honest target. */
  const clipMid = make('clipPath', {id: 'lad-mid', clipPathUnits: 'userSpaceOnUse'});
  const midRect = make('rect', {x: '0', y: '0', width: '0', height: '0'});
  clipMid.appendChild(midRect);
  defs.append(clip, clipMid);

  const gHead = make('g');
  const headBank = make('text', {class: 'lad-colh', 'text-anchor': 'middle'});
  headBank.textContent = 'Bank statement';
  const headLed = make('text', {class: 'lad-colh', 'text-anchor': 'middle'});
  headLed.textContent = 'Ledger';
  const ruleTop = make('line', {class: 'lad-crule'});
  const ruleBot = make('line', {class: 'lad-crule lad-crule-b'});
  gHead.append(headBank, headLed, ruleTop, ruleBot);

  const gWipe = make('g', {'clip-path': 'url(#lad-wipe)'});
  const gLines = make('g');
  const gHint = make('g');
  const gDots = make('g');
  const hint = make('path', {class: 'lad-hint'});
  const ring = make('circle', {class: 'lad-ring'});
  gHint.append(hint, ring);
  gWipe.append(gLines, gHint, gDots);

  /* the group itself must not be a tab stop: Chrome offers one for a group
     that handles keys, and it would announce nothing. */
  const gHits = make('g', {tabindex: '-1', focusable: 'false'});
  const gHitLines = make('g', {'clip-path': 'url(#lad-mid)', focusable: 'false'});

  const lines = [], bankDots = [], ledDots = [], hits = [], hitLines = [];
  for (let i = 0; i < N; i++) {
    lines[i] = make('path', {class: 'lad-ln'});
    gLines.appendChild(lines[i]);
    bankDots[i] = make('circle', {class: 'lad-dot'});
    ledDots[i] = make('circle', {class: 'lad-dot'});
    hits[i] = make('rect', {
      class: 'lad-hit', rx: '2', role: 'img',
      'data-row': i, tabindex: i === 0 ? '0' : '-1'
    });
    gHits.appendChild(hits[i]);
    hitLines[i] = make('path', {class: 'lad-hitln', 'data-row': i});
    gHitLines.appendChild(hitLines[i]);
  }
  gHits.appendChild(gHitLines);
  bankDots.forEach(d => gDots.appendChild(d));
  ledDots.forEach(d => gDots.appendChild(d));

  svg.append(defs, gHead, gWipe, gHits);

  plot.textContent = '';
  plot.append(svg);
  root.classList.add('is-live');

  const srItems = [];
  if (srList) {
    srList.textContent = '';
    for (let i = 0; i < N; i++) { srItems[i] = el('li'); srList.appendChild(srItems[i]); }
  }

  /* ---------- geometry ---------- */
  let geom = null;
  let relaying = false;

  function layout() {
    const w = Math.max(260, Math.round(plot.clientWidth || 0));
    const compact = w < 520;
    const h = compact ? 520 : 460;
    const x1 = Math.round(w * (compact ? 0.17 : 0.22));
    const x2 = Math.round(w * (compact ? 0.83 : 0.78));
    const padT = compact ? 42 : 46;
    const gap = (h - padT - 12) / (N - 1);
    const r = compact ? 2.7 : 2.95;
    geom = {w, h, x1, x2, padT, gap, r, compact, y: i => padT + i * gap};

    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    wipe.setAttribute('height', h + 80);
    if (wipeDone) wipe.setAttribute('width', w + 40);

    const hy = compact ? 16 : 18;
    headBank.setAttribute('x', x1); headBank.setAttribute('y', hy);
    headLed.setAttribute('x', x2); headLed.setAttribute('y', hy);

    /* the hairlines frame the drawing, not the container */
    const frameL = Math.max(0, x1 - (compact ? 30 : 44));
    const frameR = Math.min(w, x2 + (compact ? 30 : 44));
    const ry = (compact ? 26 : 28) + 0.5;
    ruleTop.setAttribute('x1', frameL); ruleTop.setAttribute('x2', frameR);
    ruleTop.setAttribute('y1', ry); ruleTop.setAttribute('y2', ry);
    const by = h - 3.5;
    ruleBot.setAttribute('x1', frameL); ruleBot.setAttribute('x2', frameR);
    ruleBot.setAttribute('y1', by); ruleBot.setAttribute('y2', by);

    const inset = compact ? 20 : 26;
    midRect.setAttribute('x', x1 + inset);
    midRect.setAttribute('y', 0);
    midRect.setAttribute('width', Math.max(0, (x2 - inset) - (x1 + inset)));
    midRect.setAttribute('height', h);

    for (let i = 0; i < N; i++) {
      const d = curve(i, PROP[i]);
      lines[i].setAttribute('d', d);
      hitLines[i].setAttribute('d', d);
      bankDots[i].setAttribute('cx', x1);
      bankDots[i].setAttribute('cy', geom.y(i).toFixed(1));
      bankDots[i].setAttribute('r', r);
      ledDots[i].setAttribute('cx', x2);
      ledDots[i].setAttribute('cy', geom.y(ROW[i]).toFixed(1));
      ledDots[i].setAttribute('r', r);
      hits[i].setAttribute('x', 0);
      hits[i].setAttribute('y', (geom.y(i) - gap / 2).toFixed(1));
      hits[i].setAttribute('width', w);
      hits[i].setAttribute('height', gap.toFixed(1));
    }
    if (picked != null) drawHint(picked);

    // the box can still be settling (fonts, scrollbars, a sibling resizing):
    // if it moved under us, lay out once more on the next frame.
    if (Math.abs((plot.clientWidth || w) - w) > 1 && !relaying) {
      relaying = true;
      requestAnimationFrame(() => { relaying = false; layout(); });
    }
  }

  function curve(i, entry) {
    const dx = (geom.x2 - geom.x1) * 0.46;
    const y1 = geom.y(i), y2 = geom.y(ROW[entry]);
    return 'M' + geom.x1 + ' ' + y1.toFixed(1) +
      'C' + (geom.x1 + dx).toFixed(1) + ' ' + y1.toFixed(1) +
      ',' + (geom.x2 - dx).toFixed(1) + ' ' + y2.toFixed(1) +
      ',' + geom.x2 + ' ' + y2.toFixed(1);
  }

  /* ---------- what each line is doing ---------- */
  function statusOf(i) {
    if (state.rung === 'suggests') return 'sugg';
    if (state.rung === 'drafts') return 'wait';
    if (state.rung !== 'decides' && DATA[i].c < state.thr) return 'wait';
    return WRONG[i] ? 'wrong' : 'ok';
  }

  function sentence(i, st) {
    if (st === 'sugg') return 'Suggested. A person decides.';
    if (st === 'wait') return 'Waiting for a person.';
    if (st === 'ok') return 'Posted by the agent.';
    return 'Posted by the agent, but wrong. The right match was ' + DATA[i].l + '.';
  }

  function duration(min) {
    if (min <= 0) return 'none';
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return 'about ' + m + ' min';
    if (!m) return 'about ' + h + ' h';
    return 'about ' + h + ' h ' + m + ' min';
  }

  /* ---------- draw the current state ---------- */
  function render() {
    const best = new Array(N).fill(-1);
    let checks = 0, wrong = 0;

    for (let i = 0; i < N; i++) {
      const st = statusOf(i);
      lines[i].setAttribute('class', 'lad-ln is-' + st);
      bankDots[i].setAttribute('class', 'lad-dot is-' + st);
      if (st === 'wait' || st === 'sugg') checks++;
      if (st === 'wrong') wrong++;
      const e = PROP[i];
      if (RANK[st] > best[e]) best[e] = RANK[st];

      const text = 'Bank line ' + (i + 1) + ' of ' + N + ': ' + DATA[i].b +
        '. Proposed match: ' + DATA[e].l + '. ' + DATA[i].c + '% sure. ' + sentence(i, st);
      hits[i].setAttribute('aria-label', text);
      if (srItems[i]) srItems[i].textContent = text;
    }
    for (let e = 0; e < N; e++) {
      const st = best[e] < 0 ? 'none'
        : ['sugg', 'wait', 'ok', 'wrong'][best[e]];
      ledDots[e].setAttribute('class', 'lad-dot is-' + st);
    }

    const minutes = state.rung === 'suggests' ? N * 3
      : state.rung === 'drafts' ? N * 1
      : state.rung === 'decides' ? 0
      : checks * 2;
    const time = duration(minutes);

    outChecks.textContent = checks;
    const suffix = outChecks.nextElementSibling;
    if (suffix) suffix.textContent = checks === 1 ? 'line' : 'lines';
    outWrong.textContent = wrong;
    outChecks.parentNode.parentNode.classList.toggle('is-zero', checks === 0);
    outWrong.parentNode.parentNode.classList.toggle('is-zero', wrong === 0);
    outTime.textContent = 'Time spent checking: ' + time;

    const posted = N - checks;
    let summary;
    if (state.rung === 'suggests') {
      summary = 'Forty bank lines, each with a suggested match drawn to a ledger entry. ' +
        'Nothing is posted; a person decides all forty.';
    } else if (state.rung === 'drafts') {
      summary = 'Forty bank lines, each with a match drafted and waiting for a person to confirm it.';
    } else if (state.rung === 'decides') {
      summary = 'Forty bank lines. The agent posts all forty matches, ' + wrong +
        ' of them wrong, and leaves nothing for a person to check.';
    } else {
      summary = 'Forty bank lines. The agent posts the ' + posted + ' matches it is at least ' +
        state.thr + '% sure about, ' + (wrong === 0 ? 'none' : wrong) +
        ' of them wrong, and leaves ' + checks + ' for a person to check.';
    }
    svg.setAttribute('aria-label', summary);

    announce(RUNGS[state.rung].label + '. A person still checks ' + checks +
      (checks === 1 ? ' line. ' : ' lines. ') + 'Wrong matches approved: ' + wrong +
      '. Time spent checking: ' + time + '.');

    root.classList.toggle('at-reconciles', state.rung === 'reconciles');
    if (picked != null) showDetail(picked);
  }

  /* the readouts are announced once the dragging stops, not on every tick,
     and never on load. */
  let touched = false, liveTimer = 0;
  function announce(text) {
    if (!live || !touched) return;
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => { live.textContent = text; }, 500);
  }

  /* ---------- singling out one line ---------- */
  let picked = null;

  function drawHint(i) {
    const st = statusOf(i);
    if (st === 'wrong' && geom) {
      hint.setAttribute('d', curve(i, i));
      ring.setAttribute('cx', geom.x2);
      ring.setAttribute('cy', geom.y(ROW[i]).toFixed(1));
      ring.setAttribute('r', (geom.r + 3.6).toFixed(1));
      hint.classList.add('is-on');
      ring.classList.add('is-on');
    } else {
      hint.classList.remove('is-on');
      ring.classList.remove('is-on');
    }
  }

  function pick(i) {
    if (picked === i) return;
    if (picked != null) unmark(picked);
    picked = i;
    svg.classList.add('is-picking');
    lines[i].classList.add('is-on');
    bankDots[i].classList.add('is-on');
    ledDots[PROP[i]].classList.add('is-on');
    drawHint(i);
    showDetail(i);
  }

  function unmark(i) {
    lines[i].classList.remove('is-on');
    bankDots[i].classList.remove('is-on');
    ledDots[PROP[i]].classList.remove('is-on');
  }

  function drop() {
    if (picked == null) return;
    unmark(picked);
    picked = null;
    svg.classList.remove('is-picking');
    hint.classList.remove('is-on');
    ring.classList.remove('is-on');
    clearDetail();
  }

  function showDetail(i) {
    if (!detail) return;
    const st = statusOf(i);
    dBank.textContent = DATA[i].b;
    dLed.textContent = DATA[PROP[i]].l;
    dConf.textContent = DATA[i].c + '%';
    dState.textContent = sentence(i, st);
    detail.className = 'lad-detail s-' + st;
    dHint.hidden = true;
    dBody.hidden = false;
  }

  function clearDetail() {
    if (!detail) return;
    detail.className = 'lad-detail';
    dBody.hidden = true;
    dHint.hidden = false;
  }

  /* ---------- input ---------- */
  const rowOf = node => {
    const v = node && node.getAttribute && node.getAttribute('data-row');
    return v == null ? null : +v;
  };

  gHits.addEventListener('pointerover', e => {
    const i = rowOf(e.target);
    if (i != null) pick(i);
  });
  gHits.addEventListener('pointerleave', () => {
    if (!gHits.contains(document.activeElement)) drop();
  });
  gHits.addEventListener('focusin', e => {
    const i = rowOf(e.target);
    if (i != null) { roving(i); pick(i); }
  });
  gHits.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!gHits.contains(document.activeElement)) drop();
    }, 0);
  });
  document.addEventListener('pointerdown', e => {
    if (!plot.contains(e.target)) drop();
  });

  function roving(i) {
    hits.forEach((h, n) => h.setAttribute('tabindex', n === i ? '0' : '-1'));
  }

  gHits.addEventListener('keydown', e => {
    const i = rowOf(e.target);
    if (i == null) return;
    let n = null;
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': n = Math.min(N - 1, i + 1); break;
      case 'ArrowUp': case 'ArrowLeft': n = Math.max(0, i - 1); break;
      case 'Home': n = 0; break;
      case 'End': n = N - 1; break;
      case 'Escape': drop(); return;
      default: return;
    }
    e.preventDefault();
    roving(n);
    hits[n].focus();
  });

  radios.forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    touched = true;
    state.rung = r.value;
    render();
  }));

  function markSlider() {
    const lo = +slider.min, hi = +slider.max;
    slider.style.setProperty('--p', ((state.thr - lo) / (hi - lo) * 100).toFixed(1) + '%');
    slider.setAttribute('aria-valuetext', state.thr + ' percent');
  }

  slider.addEventListener('input', () => {
    touched = true;
    state.thr = +slider.value;
    if (sliderOut) sliderOut.textContent = state.thr;
    markSlider();
    render();
  });

  /* ---------- the agent draws the connections, once ---------- */
  let wipeDone = reduced || !('IntersectionObserver' in window);

  function finish() {
    wipeDone = true;
    wipe.setAttribute('width', geom ? geom.w + 40 : 4000);
  }

  function sweep() {
    if (reduced) { finish(); return; }
    const total = 950, t0 = performance.now(), W = geom.w + 40;
    const step = now => {
      const p = Math.min(1, (now - t0) / total);
      wipe.setAttribute('width', (W * (1 - Math.pow(1 - p, 3))).toFixed(1));
      if (p < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    window.setTimeout(finish, total + 800);
  }

  /* ---------- go ---------- */
  if (sliderOut) sliderOut.textContent = state.thr;
  markSlider();
  clearDetail();
  layout();
  render();
  if (wipeDone) finish();
  else {
    const io = new IntersectionObserver((entries, obs) => {
      if (entries.some(en => en.isIntersecting)) { obs.disconnect(); sweep(); }
    }, {rootMargin: '0px 0px -12% 0px'});
    io.observe(plot);
    window.setTimeout(() => { if (!wipeDone) { io.disconnect(); finish(); } }, 8000);
  }

  let pending = 0;
  const relayout = () => {
    window.clearTimeout(pending);
    pending = window.setTimeout(layout, 70);
  };
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(plot);
  window.addEventListener('resize', relayout);
}
