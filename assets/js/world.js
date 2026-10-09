// The map: a relief survey of how I think about AI, seen at an angle like a model on a table.
// Height is value, distance is readiness. Raw WebGL2, no libraries. Progressive enhancement:
// the page is complete without it; this only draws the land behind the text.

const root = document.documentElement;
const canvas = document.getElementById('world');
const labelsEl = document.getElementById('labels');
const flight = document.querySelector('.flight');
const stops = [...document.querySelectorAll('.flight .stop')];
const routeLinks = [...document.querySelectorAll('.route a')];
// every block of words on the map; labels keep out of all of them, not just the current stop's
const textBlocks = [...document.querySelectorAll('.flight .panel, .flight .legend')];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MW = (window.MW = window.MW || { beat: 0 });
const SMALL = innerWidth < 760;
const Q = new URLSearchParams(location.search);
const OG = Q.has('og');
const STILL = Q.has('still') ? Math.max(0, Math.min(4, +Q.get('still') || 0)) : null;

// ---------------- the land ----------------
const N = SMALL ? 320 : 448;
const W = 120, D = 90, CX = 0, CZ = 0;
const F = {
  peaks: [
    { x: -2, z: 0, a: 8.5, s: 5.6, base: .82, rough: .34, f: .2, seed: 1 },     // ready now
    { x: 28, z: -27, a: 17, s: 7.6, base: .55, rough: .85, f: .12, seed: 2 },   // the big bet
    { x: -34, z: -31, a: 9, s: 7.5, base: .5, rough: .8, f: .11, seed: 3 },
    { x: 46, z: 4, a: 7, s: 7, base: .5, rough: .7, f: .12, seed: 4 },
    { x: -50, z: 0, a: 6, s: 7, base: .5, rough: .7, f: .12, seed: 5 },
    { x: 8, z: -38, a: 10, s: 8, base: .5, rough: .8, f: .1, seed: 6 },
    { x: -12, z: -40, a: 8, s: 7, base: .5, rough: .8, f: .11, seed: 7 },
  ],
  friction: { x: 0, z: 0, s: 1, a: 0 },
  mesa: { x: -30, z: -11, rx: 9.5, rz: 7.5, h: 10.5 },
  far: { z0: 27, span: 15, a: 6.5 },
  river: [[-66, 23], [-52, 17], [-38, 24], [-24, 18], [-10, 22], [4, 16], [18, 21], [32, 14], [46, 18], [66, 12]],
  trails: [
    [[-9, 13], [-7.5, 9.5], [-5.5, 6.5], [-3.8, 3.4], [-2.2, .4]],                            // the route up "ready now"
    [[-9, 13], [-14, 8], [-19, 2], [-24, -4], [-28, -8]],                                      // to the plateau
    [[-36, -13.6], [-30.8, -17], [-24.9, -14], [-24.5, -9], [-30, -6], [-36, -9], [-36, -13.6]], // the plateau loop
    [[-31, -11.5], [-24.9, -14]],
    [[-31, -11.5], [-36, -9]],
  ],
};

// stops: what the camera looks at, from how far, how steeply
const WAY = [
  { t: [-17, 3, -5], dist: 104, pitch: 50, yaw: -24 },  // overview
  { t: [-3, 8, -23], dist: 100, pitch: 42, yaw: -30 },  // value and readiness
  { t: [-41, 8.5, -9.5], pt: [-33, 8.5, -10.5], dist: 60, pitch: 50, yaw: 14 }, // background agents (pt: on tall screens, centre the plateau)
  { t: [-12, 7, 0], dist: 56, pitch: 42, yaw: -15 },    // build, then measure
  { t: [10, 6, -14], dist: 120, pitch: 30, yaw: 3 },    // dawn
];

const LABELS = [
  { stop: 0, kind: 'flag', at: [-9.5, 13.2] },
  { stop: 0, kind: 'river', at: [25, 17.5], to: [32, 14] },
  { stop: 1, peak: [-2, 0], b: 'Ready now', i: 'close, and worth doing' },
  { stop: 1, peak: [28, -27], b: 'The big bet', i: 'worth more, further away' },
  { stop: 2, at: [-30, -11.5], dy: 3, b: 'Background agents', i: 'working before anyone asks' },
  { stop: 3, at: [-8.4, 11.6], dy: .6, i: 'discovery' },
  { stop: 3, at: [-6.4, 7.8], dy: .6, i: 'rough prototype' },
  { stop: 3, at: [-4.6, 4.8], dy: .6, i: 'measured' },
  { stop: 3, peak: [-2, 0], b: 'Live', i: 'in production' },
];
const GRAT = [];
for (let x = -50; x <= 50; x += 10) GRAT.push({ at: [x, 42], txt: lon(x) });
for (let z = -40; z <= 30; z += 10) GRAT.push({ at: [-57, z], txt: lat(z), side: 'w' });
function lon(x) { const v = 17.035 + (x + 9.5) * .0105; let d = Math.floor(v), m = Math.round((v - d) * 60); if (m === 60) { d++; m = 0; } return `${d}°${String(m).padStart(2, '0')}′E`; }
function lat(z) { const v = 51.11 - (z - 13.2) * .0068; let d = Math.floor(v), m = Math.round((v - d) * 60); if (m === 60) { d++; m = 0; } return `${d}°${String(m).padStart(2, '0')}′N`; }

// ---------------- tiny matrix kit ----------------
const M = {
  persp(fovy, a, n, f) { const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]); },
  look(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
};

// ---------------- shaders ----------------
const VS = `#version 300 es
precision highp float;
in vec2 aUv;
uniform sampler2D uMap; uniform mat4 uVP; uniform vec4 uRect;
out vec2 vUv; out vec3 vW;
void main(){
  vUv = aUv;
  float h = texture(uMap, aUv).r;
  vW = vec3(uRect.x - uRect.z * .5 + aUv.x * uRect.z, h, uRect.y + uRect.w * .5 - aUv.y * uRect.w);
  gl_Position = uVP * vec4(vW, 1.);
}`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uMap; uniform vec2 uTexel; uniform vec4 uRect; uniform vec3 uCam;
uniform vec3 uLamp; uniform float uLampOn; uniform float uDawn; uniform float uReveal; uniform float uBeat; uniform float uTime; uniform float uGain;
in vec2 vUv; in vec3 vW;
out vec4 o;
float iso(float v, float w){ float f = abs(fract(v - .5) - .5) / max(fwidth(v), 1e-4); return 1. - smoothstep(0., w, f); }
void main(){
  vec4 m = texture(uMap, vUv);
  float h = m.r;
  float hl = texture(uMap, vUv - vec2(uTexel.x, 0.)).r, hr = texture(uMap, vUv + vec2(uTexel.x, 0.)).r;
  float hd = texture(uMap, vUv - vec2(0., uTexel.y)).r, hu = texture(uMap, vUv + vec2(0., uTexel.y)).r;
  float sx = uRect.z * uTexel.x, sz = uRect.w * uTexel.y;
  vec3 n = normalize(vec3(-(hr - hl) / (2. * sx), 1., (hu - hd) / (2. * sz)));

  // night: a cool moon from the north-west. dawn: a low warm sun from the east.
  float dn = clamp(dot(n, normalize(vec3(-.55, .62, -.55))), 0., 1.);
  float dd = clamp(dot(n, normalize(vec3(.92, .2, -.32))), 0., 1.);
  float t = smoothstep(-.5, 17., h);
  vec3 night = mix(vec3(.016, .046, .052), vec3(.078, .165, .17), t) * (.3 + dn * 1.55);
  vec3 dawn = mix(vec3(.05, .055, .065), vec3(.17, .145, .13), t) * (.2 + dd * 1.05) + vec3(1., .6, .36) * pow(dd, 2.2) * .5;
  vec3 col = mix(night, dawn, uDawn);

  // contours: one line every 0.7 m of height, every fifth stronger
  float f = h / .7;
  float dens = clamp(1.25 - fwidth(f) * .8, 0., 1.);
  float minor = iso(f, 1.05) * dens;
  float major = iso(f / 5., 1.4) * clamp(1.3 - fwidth(f / 5.) * .5, 0., 1.);
  float halo = iso(f / 5., 6.) * .22;
  float lamp = uLampOn * smoothstep(13., 0., distance(vW.xz, uLamp.xz));
  vec3 lc = mix(vec3(.31, .52, .48), vec3(.86, 1., .94), lamp);
  lc = mix(lc, mix(vec3(.5, .4, .32), vec3(1., .82, .62), clamp(dd * 1.4 + lamp, 0., 1.)), uDawn);
  float pulse = 1. + uBeat * .9;
  float reveal = smoothstep(h - 1.4, h, uReveal);
  col += lc * (minor * (.2 + .6 * lamp) + major * (.42 + .5 * lamp) * pulse + halo * (.45 + lamp) * pulse) * reveal * uGain;

  // graticule, like a survey sheet
  vec2 g = vW.xz / 10.;
  col += vec3(.93, .9, .84) * max(iso(g.x, .8), iso(g.y, .8)) * .06 * reveal;

  // the river
  float water = 1. - smoothstep(.42, .7 + fwidth(m.g), m.g);
  float core = 1. - smoothstep(0., .12 + fwidth(m.g) * 1.5, m.g);
  vec3 wc = mix(vec3(.06, .19, .26), vec3(.16, .17, .2), uDawn) + mix(vec3(.24, .52, .64), vec3(.95, .66, .45), uDawn) * core * (.45 + .3 * sin(uTime * .7 + vW.x * .3));
  col = mix(col, wc, water * .75 * reveal);

  // trails, dashed like a walking map
  float tw = fwidth(m.b);
  float trail = 1. - smoothstep(.045, .045 + tw * 1.3, m.b);
  float dash = smoothstep(.5, .54, fract(m.a / 1.3)) * (1. - smoothstep(.86, .9, fract(m.a / 1.3)));
  col += vec3(.93, .89, .81) * trail * dash * .36 * reveal;

  // depth haze, and the edge of the sheet fading out
  float dist = length(vW - uCam);
  col = mix(col, vec3(.03, .075, .082) + uDawn * vec3(.16, .08, .05), smoothstep(110., 240., dist) * .7);
  float e = min(min(vUv.x, 1. - vUv.x), min(vUv.y, 1. - vUv.y));
  float a = smoothstep(0., .075, e);
  o = vec4(col * a, a);
}`;
const PVS = `#version 300 es
in vec3 aPos; in float aA; uniform mat4 uVP; uniform float uScale; out float vA;
void main(){ vA = aA; vec4 c = uVP * vec4(aPos, 1.); gl_Position = c; gl_PointSize = (aA > .9 ? 1. : .6) * uScale / max(c.w, .1); }`;
const PFS = `#version 300 es
precision mediump float; in float vA; out vec4 o;
void main(){ float r = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., r); a *= a; o = vec4(vec3(1., .93, .8) * a * vA, a * vA); }`;

function start(bake, gl) {
  if (!gl) throw new Error('no webgl2');
  if (OG) WAY[0] = { t: [-25, 3, -7], dist: 94, pitch: 48, yaw: -24 };
  const { heights } = bake;
  const heightAt = (x, z) => {
    const fx = ((x - (CX - W / 2)) / W) * N - .5, fz = ((CZ + D / 2 - z) / D) * N - .5;
    const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const k = j * N + i;
    return heights[k] * (1 - u) * (1 - v) + heights[k + 1] * u * (1 - v) + heights[k + N] * (1 - u) * v + heights[k + N + 1] * u * v;
  };
  let maxH = 0; for (let k = 0; k < heights.length; k++) if (heights[k] > maxH) maxH = heights[k];

  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const program = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  const land = program(VS, FS), dots = program(PVS, PFS);
  const uni = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  const UL = uni(land, ['uMap', 'uVP', 'uRect', 'uTexel', 'uCam', 'uLamp', 'uLampOn', 'uDawn', 'uReveal', 'uBeat', 'uTime', 'uGain']);
  const UP = uni(dots, ['uVP', 'uScale']);

  // the sheet: a grid of (u, v) points, displaced in the vertex shader
  const S = SMALL ? 200 : 300;
  const uv = new Float32Array((S + 1) * (S + 1) * 2);
  for (let j = 0, k = 0; j <= S; j++) for (let i = 0; i <= S; i++) { uv[k++] = i / S; uv[k++] = j / S; }
  const idx = new Uint32Array(S * S * 6);
  for (let j = 0, k = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1; idx[k] = a; idx[k + 1] = c; idx[k + 2] = b; idx[k + 3] = b; idx[k + 4] = c; idx[k + 5] = d; k += 6; }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const aUv = gl.getAttribLocation(land, 'aUv'); gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, N, 0, gl.RGBA, gl.HALF_FLOAT, bake.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // background agents: small lights on the plateau trails
  const pathOf = pts => { const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { P: pts, acc, L: acc[acc.length - 1], loop: pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] }; };
  const AG = [[2, 0, 1.6], [2, 6.5, 1.3], [2, 13, 1.9], [1, 0, 1.4], [1, 9, 1.4], [3, 0, .9], [4, 2, .9]].map(([k, off, sp]) => ({ path: pathOf(F.trails[k]), off, sp }));
  const TAIL = 6, AN = AG.length * TAIL;
  const ap = new Float32Array(AN * 4);
  const avao = gl.createVertexArray(); gl.bindVertexArray(avao);
  const abuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, abuf); gl.bufferData(gl.ARRAY_BUFFER, ap.byteLength, gl.DYNAMIC_DRAW);
  const aPos = gl.getAttribLocation(dots, 'aPos'), aA = gl.getAttribLocation(dots, 'aA');
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aA); gl.vertexAttribPointer(aA, 1, gl.FLOAT, false, 16, 12);
  gl.bindVertexArray(null);
  const along = (path, s) => {
    const { P, acc, L, loop } = path;
    s = loop ? ((s % L) + L) % L : Math.max(0, Math.min(L, s));
    let k = 0; while (k < acc.length - 2 && acc[k + 1] < s) k++;
    const t = (s - acc[k]) / Math.max(1e-6, acc[k + 1] - acc[k]);
    const x = P[k][0] + (P[k + 1][0] - P[k][0]) * t, z = P[k][1] + (P[k + 1][1] - P[k][1]) * t;
    return [x, heightAt(x, z) + .35, z];
  };
  const placeAgents = time => {
    AG.forEach((g, i) => {
      const L = g.path.L, s0 = g.path.loop ? time * g.sp + g.off : (time * g.sp + g.off) % (L + 5);
      for (let k = 0; k < TAIL; k++) {
        const s = s0 - k * .45, p = along(g.path, s), o = (i * TAIL + k) * 4;
        const ends = g.path.loop ? 1 : Math.max(0, Math.min(1, s / 1.5, (L - s) / 1.5));
        ap[o] = p[0]; ap[o + 1] = p[1]; ap[o + 2] = p[2]; ap[o + 3] = (k === 0 ? 1 : .55 * (1 - k / TAIL)) * ends;
      }
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, abuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ap);
  };

  // labels pinned to the land
  const top = (x, z) => { let b = [x, -1e9, z]; for (let dx = -4; dx <= 4; dx += .4) for (let dz = -4; dz <= 4; dz += .4) { const h = heightAt(x + dx, z + dz); if (h > b[1]) b = [x + dx, h, z + dz]; } return b; };
  const flagSVG = '<svg viewBox="0 0 16 28" aria-hidden="true"><path d="M1.5 27V1.5" stroke="#ece7da" stroke-width="1.5"/><path d="M2.2 2h12l-3.4 4.3 3.4 4.3h-12z" fill="#ff5c8a"/></svg>';
  const pins = [];
  const addPin = (el, p, stop, mode) => { labelsEl.appendChild(el); pins.push({ el, p, stop, mode, o: -1 }); };
  for (const l of LABELS) {
    const el = document.createElement('div');
    if (l.kind === 'flag') {
      el.className = 'lbl flag';
      el.innerHTML = `${flagSVG}<span><b>Wrocław</b><small>51°06′N 17°02′E</small></span>`;
      addPin(el, [l.at[0], heightAt(l.at[0], l.at[1]), l.at[1]], [0, 1], 'flag');
    } else if (l.kind === 'river') {
      el.className = 'lbl river'; el.textContent = 'Odra';
      const p = [l.at[0], heightAt(l.at[0], l.at[1]), l.at[1]], q = [l.to[0], heightAt(l.to[0], l.to[1]), l.to[1]];
      addPin(el, p, [0], 'river'); pins.at(-1).q = q;
    } else {
      el.className = 'lbl' + (l.b ? ' stem' : ' quiet');
      el.innerHTML = (l.b ? `<b>${l.b}</b>` : '') + (l.i ? `<i>${l.i}</i>` : '');
      const p = l.peak ? top(l.peak[0], l.peak[1]) : [l.at[0], heightAt(l.at[0], l.at[1]) + (l.dy || 0), l.at[1]];
      if (l.peak) p[1] += .8;
      addPin(el, p, [l.stop], 'pin');
    }
  }
  for (const g of GRAT) {
    const el = document.createElement('div'); el.className = 'lbl grat' + (g.side === 'w' ? ' w' : ''); el.textContent = g.txt;
    addPin(el, [g.at[0], 0, g.at[1]], [0], 'grat');
  }
  // ---------------- camera ----------------
  const n = WAY.length;
  let cw = 0, ch = 0, VP = null, eye = [0, 0, 0];
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, w < 760 ? 1.5 : 1.75);
    cw = w; ch = h;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  fit();
  const lerp = (a, b, t) => a + (b - a) * t;
  const camAt = u => {
    const i = Math.min(n - 2, Math.floor(u)), f = u - i, A = WAY[i], B = WAY[i + 1], tall = portrait();
    const ta = tall && A.pt ? A.pt : A.t, tb = tall && B.pt ? B.pt : B.t;
    const t = [0, 1, 2].map(k => lerp(ta[k], tb[k], f));
    const travel = Math.hypot(B.t[0] - A.t[0], B.t[2] - A.t[2]);
    const dist = lerp(A.dist, B.dist, f) + Math.sin(Math.PI * f) * travel * .55;
    return { t, dist, pitch: lerp(A.pitch, B.pitch, f), yaw: lerp(A.yaw, B.yaw, f) };
  };
  const portrait = () => cw / ch < .8;

  const centers = new Array(n).fill(0);
  const measure = () => { for (let i = 0; i < n; i++) { const r = stops[i].getBoundingClientRect(); centers[i] = r.top + scrollY + r.height * .5; } };
  measure();
  if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe(flight);
  document.fonts?.ready.then(measure);
  const progress = () => {
    if (STILL !== null) return STILL;
    const mid = scrollY + innerHeight * .5;
    if (mid <= centers[0]) return 0;
    if (mid >= centers[n - 1]) return n - 1;
    for (let i = 0; i < n - 1; i++) if (mid >= centers[i] && mid <= centers[i + 1]) return i + (mid - centers[i]) / (centers[i + 1] - centers[i]);
    return 0;
  };
  const dwell = p => { const i = Math.floor(p), f = p - i, s = Math.min(1, Math.max(0, (f - .15) / .7)); return Math.min(n - 1, i + s * s * (3 - 2 * s)); };

  // the survey lamp: where the pointer meets the ground (a plane at mid height is close enough)
  let lamp = [999, 0, 999], lampTarget = 0, lampOn = 0, basis = null;
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !basis) return;
    const nx = e.clientX / cw * 2 - 1, ny = -(e.clientY / ch) * 2 + 1;
    const { r, u, f, th, a } = basis;
    const d = [f[0] + nx * th * a * r[0] + ny * th * u[0], f[1] + nx * th * a * r[1] + ny * th * u[1], f[2] + nx * th * a * r[2] + ny * th * u[2]];
    if (d[1] >= -1e-3) { lampTarget = 0; return; }
    const t = (4 - eye[1]) / d[1];
    lamp = [eye[0] + d[0] * t, 4, eye[2] + d[2] * t]; lampTarget = 1;
    dirty = true; kick();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { lampTarget = 0; });

  const project = (p, out) => {
    const x = p[0], y = p[1], z = p[2];
    const cx = VP[0] * x + VP[4] * y + VP[8] * z + VP[12], cy = VP[1] * x + VP[5] * y + VP[9] * z + VP[13], cwv = VP[3] * x + VP[7] * y + VP[11] * z + VP[15];
    out[0] = (cx / cwv * .5 + .5) * cw; out[1] = (-cy / cwv * .5 + .5) * ch; out[2] = cwv;
    return out;
  };

  let cur = STILL !== null ? STILL : 0, last = performance.now(), t0 = last, visible = true, rafId = 0, revealStart = 0, dirty = true;
  const P2 = [0, 0, 0], Q2 = [0, 0, 0];
  const loop = now => {
    rafId = 0;
    const wasDirty = dirty; dirty = false;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    const p = progress(), goal = dwell(p);
    cur = (reduce || STILL !== null) ? (STILL !== null ? STILL : Math.round(goal)) : cur + (goal - cur) * (1 - Math.pow(.002, dt));
    const c = camAt(Math.min(n - 1 - 1e-4, Math.max(0, cur)));
    const dist = c.dist * (portrait() ? 1.3 : 1), pr = c.pitch * Math.PI / 180, yr = c.yaw * Math.PI / 180;
    if (portrait()) {
      // on a tall screen the text owns the lower half, so let the land sit higher
      c.t[0] += Math.sin(yr) * dist * .2; c.t[2] += Math.cos(yr) * dist * .2;
    }
    eye = [c.t[0] + Math.sin(yr) * Math.cos(pr) * dist, c.t[1] + Math.sin(pr) * dist, c.t[2] + Math.cos(yr) * Math.cos(pr) * dist];
    const fov = (portrait() ? 44 : 30) * Math.PI / 180, aspect = cw / ch;
    const V = M.look(eye, c.t, [0, 1, 0]), Pm = M.persp(fov, aspect, 1, 600);
    VP = M.mul(Pm, V);
    const fwd = [c.t[0] - eye[0], c.t[1] - eye[1], c.t[2] - eye[2]], fl = Math.hypot(...fwd); fwd.forEach((v, k) => fwd[k] = v / fl);
    const right = [-fwd[2], 0, fwd[0]], rl = Math.hypot(...right); right.forEach((v, k) => right[k] = v / rl);
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    basis = { r: right, u: up, f: fwd, th: Math.tan(fov / 2), a: aspect };

    const dawn = Math.max(0, Math.min(1, (cur - (n - 1.85)) / .85));
    root.style.setProperty('--dawn', dawn.toFixed(3));
    lampOn += (lampTarget - lampOn) * Math.min(1, dt * 5);
    const reveal = reduce ? 999 : (revealStart ? -4 + (now - revealStart) / 1000 * 18 : -4);

    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(land);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(UL.uMap, 0);
    gl.uniformMatrix4fv(UL.uVP, false, VP);
    gl.uniform4f(UL.uRect, CX, CZ, W, D); gl.uniform2f(UL.uTexel, 1 / N, 1 / N);
    gl.uniform3f(UL.uCam, eye[0], eye[1], eye[2]); gl.uniform3f(UL.uLamp, lamp[0], lamp[1], lamp[2]);
    gl.uniform1f(UL.uLampOn, lampOn); gl.uniform1f(UL.uDawn, dawn); gl.uniform1f(UL.uReveal, reveal);
    MW.beatSmooth = (MW.beatSmooth || 0) + ((MW.beat || 0) - (MW.beatSmooth || 0)) * Math.min(1, dt * 8);
    gl.uniform1f(UL.uBeat, MW.beatSmooth); gl.uniform1f(UL.uTime, reduce ? 0 : time); gl.uniform1f(UL.uGain, OG ? 1.55 : 1);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);

    placeAgents(reduce ? 4 : time);
    gl.useProgram(dots); gl.uniformMatrix4fv(UP.uVP, false, VP); gl.uniform1f(UP.uScale, canvas.height * .9);
    gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(avao); gl.drawArrays(gl.POINTS, 0, AN);
    gl.depthMask(true); gl.bindVertexArray(null);

    // labels: never on top of the words, never off the edge
    const revealed = reduce || reveal > maxH * .55;
    const rects = textBlocks.map(b => b.getBoundingClientRect()).filter(r => r.bottom > -40 && r.top < ch + 40 && r.width > 0);
    const onText = (x, y, w, h) => rects.some(r => x + w / 2 > r.left - 16 && x - w / 2 < r.right + 16 && y > r.top - 24 - h && y < r.bottom + 24);
    const railR = cw > 860 ? 58 : 10; // keep clear of the route dots on the right
    for (const pin of pins) {
      project(pin.p, P2);
      const near = Math.min(...pin.stop.map(s => Math.abs(cur - s)));
      let o = P2[2] <= 0 ? 0 : Math.max(0, 1 - Math.max(0, near - .22) / .32);
      if (!revealed) o = 0;
      if (pin.mode === 'grat') { const safe = cw >= 760 && !portrait() && P2[0] > cw * .5 && P2[0] < cw - railR - 20 && P2[1] > 80 && P2[1] < ch - 30 && !onText(P2[0], P2[1], 90, 16); o *= safe ? .9 : 0; }
      if (pin.mode === 'pin' || pin.mode === 'flag') {
        if (pin.w === undefined || pin.w === 0) { pin.w = pin.el.offsetWidth; pin.h = pin.el.offsetHeight; }
        const half = pin.mode === 'pin' ? pin.w / 2 : 0;
        const lo = 10 + half, hi = cw - railR - (pin.mode === 'pin' ? half : pin.w);
        if (hi > lo) P2[0] = Math.min(hi, Math.max(lo, P2[0]));
        if (onText(P2[0] + (pin.mode === 'flag' ? pin.w / 2 : 0), P2[1], pin.w, pin.h)) o = 0;
      }
      let tf = `translate(${P2[0].toFixed(1)}px,${P2[1].toFixed(1)}px)`;
      if (pin.mode === 'pin') {
        const below = P2[1] < (pin.el.offsetHeight || 70) + 78;
        if (below !== pin.below) { pin.el.classList.toggle('below', below); pin.below = below; }
        tf += below ? ' translate(-50%,10px)' : ' translate(-50%,-100%)';
      }
      if (pin.mode === 'grat') tf += ' translate(-50%,-100%)';
      if (pin.mode === 'flag') tf = `translate(${(P2[0] - 3).toFixed(1)}px,${(P2[1] - 28).toFixed(1)}px)`;
      if (pin.mode === 'river' && (P2[0] < 40 || P2[0] > cw - railR - 40 || P2[1] > ch - 30)) o = 0;
      if (pin.mode === 'river') { project(pin.q, Q2); tf += ` translate(-50%,-50%) rotate(${Math.atan2(Q2[1] - P2[1], Q2[0] - P2[0]).toFixed(3)}rad)`; }
      pin.el.style.transform = tf;
      if (Math.abs(o - pin.o) > .01) { pin.el.style.opacity = o.toFixed(3); pin.o = o; }
    }
    const here = Math.min(n - 1, Math.max(0, Math.round(p)));
    routeLinks.forEach((a, i) => a.setAttribute('aria-current', String(i === here)));
    const settling = Math.abs(lampTarget - lampOn) > .01 || (MW.beat || 0) > .01 || !(reduce || reveal > maxH + 2);
    if (visible && !document.hidden && (!reduce || wasDirty || settling)) rafId = requestAnimationFrame(loop);
  };
  const kick = () => { if (!rafId && visible && !document.hidden) { last = performance.now(); rafId = requestAnimationFrame(loop); } };

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    document.querySelector('.route')?.classList.toggle('on', visible);
    labelsEl.style.visibility = visible ? '' : 'hidden';
    canvas.style.visibility = visible ? '' : 'hidden';
    if (visible) kick();
  }).observe(flight);
  document.addEventListener('visibilitychange', kick);
  addEventListener('resize', () => { if (canvas.clientWidth !== cw || canvas.clientHeight !== ch) fit(); measure(); dirty = true; kick(); });
  addEventListener('scroll', () => { dirty = true; kick(); }, { passive: true });
  // if the GPU resets, fall back to the flat map instead of leaving an empty box
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); visible = false;
    if (rafId) cancelAnimationFrame(rafId); rafId = 0;
    labelsEl.style.visibility = 'hidden';
    const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh);
    root.classList.remove('has-world');
    flat2D(bake, fresh);
  });

  root.classList.add('has-world');
  requestAnimationFrame(() => { canvas.classList.add('on'); revealStart = performance.now(); kick(); });
}

// ---------------- no WebGL: the same land as a flat survey sheet ----------------
function flat2D(bake, cv = canvas) {
  const ctx = cv.getContext('2d');
  if (!ctx) { root.classList.add('no-world'); return; }
  root.classList.add('flat-world');
  const { heights } = bake;
  const shadeCanvas = document.createElement('canvas');
  shadeCanvas.width = N; shadeCanvas.height = N;
  const sctx = shadeCanvas.getContext('2d');
  const img = sctx.createImageData(N, N);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < heights.length; k++) { const v = heights[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const sx = W / N, sz = D / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const hl = heights[j * N + Math.max(0, i - 1)], hr = heights[j * N + Math.min(N - 1, i + 1)];
      const hd = heights[Math.max(0, j - 1) * N + i], hu = heights[Math.min(N - 1, j + 1) * N + i];
      let nx = -(hr - hl) / (2 * sx), nz = (hu - hd) / (2 * sz), ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const lum = Math.max(0, nx * -.55 + ny * .62 + nz * -.55) / Math.hypot(.55, .62, .55);
      const t = (heights[k] - lo) / (hi - lo);
      const sh = .3 + lum * 1.55;
      const o = ((N - 1 - j) * N + i) * 4;
      img.data[o] = Math.min(255, (4 + 16 * t) * sh * 1.1);
      img.data[o + 1] = Math.min(255, (12 + 30 * t) * sh * 1.1);
      img.data[o + 2] = Math.min(255, (13 + 31 * t) * sh * 1.1);
      img.data[o + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);

  const river = [];
  const R0 = F.river;
  for (let i = 0; i < R0.length - 1; i++) {
    const p0 = R0[Math.max(0, i - 1)], p1 = R0[i], p2 = R0[i + 1], p3 = R0[Math.min(R0.length - 1, i + 2)];
    for (let q = 0; q < 10; q++) {
      const t = q / 10, t2 = t * t, t3 = t2 * t;
      river.push([0, 1].map(c => .5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  river.push(R0[R0.length - 1]);

  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight, small = w < 760;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.max(w / 100, h / 70) * (small ? 1.5 : 1.08);
    const ox = w * (small ? .55 : .66), oy = h * (small ? .32 : .5), wx0 = -6, wz0 = -4;
    const X = x => ox + (x - wx0) * s, Y = z => oy + (z - wz0) * s;
    ctx.fillStyle = '#081416'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadeCanvas, X(CX - W / 2), Y(CZ - D / 2), W * s, D * s);
    // contour lines (marching squares on every second sample)
    const step = 2, cols = Math.floor((N - 1) / step), rows = Math.floor((N - 1) / step);
    const at = (i, j) => heights[(N - 1 - j * step) * N + i * step];
    const px = i => X(CX - W / 2 + (i * step + .5) * sx), pz = j => Y(CZ - D / 2 + (j * step + .5) * sz);
    for (let lv = .7, k = 1; lv < hi; lv += .7, k++) {
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const tl = at(i, j), tr = at(i + 1, j), bl = at(i, j + 1), br = at(i + 1, j + 1);
          const idx = (tl > lv ? 8 : 0) | (tr > lv ? 4 : 0) | (br > lv ? 2 : 0) | (bl > lv ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x0 = px(i), x1 = px(i + 1), y0 = pz(j), y1 = pz(j + 1);
          const T = [x0 + (x1 - x0) * (lv - tl) / (tr - tl), y0], Rr = [x1, y0 + (y1 - y0) * (lv - tr) / (br - tr)];
          const B = [x0 + (x1 - x0) * (lv - bl) / (br - bl), y1], L = [x0, y0 + (y1 - y0) * (lv - tl) / (bl - tl)];
          const seg = (a, b) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
          switch (idx) {
            case 1: case 14: seg(L, B); break; case 2: case 13: seg(B, Rr); break; case 3: case 12: seg(L, Rr); break;
            case 4: case 11: seg(T, Rr); break; case 6: case 9: seg(T, B); break; case 7: case 8: seg(L, T); break;
            case 5: seg(L, T); seg(B, Rr); break; case 10: seg(T, Rr); seg(L, B); break;
          }
        }
      }
      ctx.strokeStyle = k % 5 === 0 ? 'rgba(150,205,192,.5)' : 'rgba(110,160,152,.24)';
      ctx.lineWidth = k % 5 === 0 ? 1.15 : .8;
      ctx.stroke();
    }
    // the Odra
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath(); river.forEach(([x, z], q) => q ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)));
    ctx.strokeStyle = 'rgba(88,166,201,.18)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = 'rgba(88,166,201,.85)'; ctx.lineWidth = 2; ctx.stroke();
    // edge vignette so the sheet sits in the night
    const g = ctx.createRadialGradient(w * .6, h * .5, Math.min(w, h) * .3, w * .6, h * .5, Math.max(w, h) * .8);
    g.addColorStop(0, 'rgba(8,20,22,0)'); g.addColorStop(1, 'rgba(8,20,22,.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  draw();
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 200); });
  cv.classList.add('on');
  railOnly();
}

function railOnly() {
  const route = document.querySelector('.route');
  if (!route) return;
  new IntersectionObserver(([e]) => route.classList.toggle('on', e.isIntersecting)).observe(flight);
  const update = () => {
    const mid = innerHeight * .5; let best = 0, bd = Infinity;
    stops.forEach((st, i) => { const r = st.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = i; } });
    routeLinks.forEach((a, i) => a.setAttribute('aria-current', String(i === best)));
  };
  addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  update();
}

let glctx = null;
try { glctx = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' }); } catch (e) { glctx = null; }
try {
  const worker = new Worker(new URL('./world-bake.js', import.meta.url));
  worker.onmessage = e => {
    worker.terminate();
    if (!glctx) { flat2D(e.data); return; }
    try { start(e.data, glctx); } catch (err) {
      console.warn('3D map unavailable, drawing the flat map instead.', err);
      const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); flat2D(e.data, fresh);
    }
  };
  worker.onerror = () => root.classList.add('no-world');
  worker.postMessage({ N, W, D, cx: CX, cz: CZ, F });
} catch (err) { root.classList.add('no-world'); }
