// The map: a relief survey of how I think about AI, seen at an angle like a model on a table.
// The land is the real Karkonosze, drawn at night from the Jelenia Góra basin: Copernicus
// GLO-30 elevation, features from OpenStreetMap. Height is value, distance is readiness.
// Raw WebGL2, no libraries. Progressive enhancement: the page is complete without it.

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

// ---------------- the sheet ----------------
// 29.6 x 22.2 km of the Karkonosze, lon 15.430-15.850, lat 50.7000-50.9005, at 246.33 m
// per world unit. East is -x (the camera looks south), north is +z (towards the viewer).
const N = SMALL ? 320 : 448;
const W = 120, D = 90, CX = 0, CZ = 0;
const DATA = new URL('../data/', import.meta.url);
const KX = 285.6189, KZ = 448.9185, LON0 = 15.640, LAT0 = 50.80025;   // world units per degree
const lonAt = x => LON0 - x / KX, latAt = z => LAT0 + z / KZ;
const xOf = lon => (LON0 - lon) * KX, zOf = lat => (lat - LAT0) * KZ;
const VS_REF = 300, VS_K = 0.0175;                      // height in units = (metres - 300) * k
const hOf = m => (m - VS_REF) * VS_K;

let F = null;            // the real features, fetched below
let WAY = [], LABELS = [], GRAT = [];

// Stops: what the camera looks at, from how far, how steeply, through what lens. A tall
// (phone) screen composes the same stop again: pt target, pd distance, pp pitch, py bearing,
// pf lens. Its frame is narrow, so most stops turn to look along the range instead of across.
function buildStory() {
  const S = {};
  for (const s of F.shelters) S[s.n] = s;
  const sz = S['Schronisko na Szrenicy'], hs = S['Hala Szrenicka'], ka = S['Kamienczyk'];
  const PK = {};
  for (const p of F.peaks) PK[p.n] = p;
  const sn = PK['Śnieżka'], sr = PK['Szrenica'];
  const rt = F.landmarks.rton;
  const asc = F.trails.find(t => t.k === 'ascent');
  const at = name => { const m = asc.m.find(w => w.n === name); return asc.p[m.i]; };
  const kp = at('Szklarska Poreba');   // the stop-3 trailhead, in the town

  WAY = [
    // the postcard: the whole range from the basin, Śnieżka at the far left
    { t: [4, 11, -11], dist: 106, pitch: 24, yaw: -3, fov: 30, pt: [6, 14, -12], pd: .62, pp: 24, py: 46, pf: 34 },
    // along the crest from the west, the camera low so the range stands against the sky:
    // Szrenica near and lower at the right, Śnieżka far and higher at the left
    { t: [5.5, 13, -12], dist: 72, pitch: 13, yaw: 55, fov: 27, pt: [10, 11, -11], pd: .64, pp: 12, py: 72, pf: 36 },
    // the Śnieżne Kotły: the rim seen edge-on, with the relay on it and nothing else up there
    { t: [24, 16, -8], dist: 44, pitch: 9, yaw: 22, fov: 30, pt: [24.5, 16, -8], pd: 1.05, pp: 11, py: 24, pf: 37 },
    // the climb out of Szklarska Poręba to the Szrenica shelter
    { t: [27, 11, 2], dist: 58, pitch: 38, yaw: -4, fov: 30, pt: [34, 9.6, 9], pd: .86, pp: 44, py: -14, pf: 36 },
    // dawn: the range from the basin, first light from the east
    { t: [-17, 13, -19], dist: 104, pitch: 19, yaw: -5, fov: 30, pt: [-15, 13, -14], pd: .95, pp: 21, py: -12, pf: 40 },
  ];
  if (OG) WAY[0] = { t: [-4, 12, -14], dist: 106, pitch: 26, yaw: 8, fov: 30 };
  // ?still=N&cam=tx,ty,tz,dist,pitch,yaw,fov - for composing a stop against the real land
  if (STILL !== null && Q.has('cam')) {
    const c = Q.get('cam').split(',').map(Number);
    if (c.length === 7 && c.every(v => Number.isFinite(v))) WAY[STILL] = { t: c.slice(0, 3), dist: c[3], pitch: c[4], yaw: c[5], fov: c[6], pd: 1, pp: c[4], py: c[5], pf: c[6], pt: c.slice(0, 3) };
  }

  LABELS = [
    { stop: [0], kind: 'place', mark: 'peak', at: [sn.x, sn.z], b: 'Śnieżka', s: '1603 m' },
    { stop: [0], kind: 'place', mark: 'peak', at: [sr.x, sr.z], b: 'Szrenica', s: '1362 m' },
    { stop: [0], kind: 'place', mark: 'town', at: [-32.6, -11.4], b: 'Karpacz' },
    { stop: [0], kind: 'place', mark: 'town', at: [33.7, 11.9], b: 'Szklarska Poręba' },
    { stop: [0], kind: 'place', mark: 'city', at: [-27, 41.5], b: 'Jelenia Góra', s: 'beyond the sheet' },
    { stop: [1], peak: [sr.x, sr.z], b: 'Ready now', i: 'close, and worth doing' },
    { stop: [1], peak: [sn.x, sn.z], b: 'The big bet', i: 'worth more, further away' },
    { stop: [2], at: [rt.x, rt.z], dy: 1.5, b: 'Background agents', i: 'working before anyone asks' },
    { stop: [3], at: kp, dy: .5, i: 'discovery' },
    { stop: [3], at: [ka.x, ka.z], dy: .5, i: 'rough prototype' },
    { stop: [3], at: [hs.x, hs.z], dy: .6, i: 'measured' },
    { stop: [3], at: [sz.x, sz.z], dy: 1.6, b: 'Live', i: 'in production' },
    { stop: [4], kind: 'place', mark: 'peak', at: [sn.x, sn.z], b: 'Śnieżka', s: '1603 m' },
  ];

  // a real graticule: every second arcminute, labelled where it leaves the sheet
  GRAT = [];
  const pad = v => String(v).padStart(2, '0');
  for (let m = 926; m <= 950; m += 2) {
    const x = xOf(m / 60);
    if (Math.abs(x) < 54) GRAT.push({ at: [x, 36], txt: `${(m / 60 | 0)}°${pad(m % 60)}′E` });
  }
  for (let m = 3042; m <= 3054; m += 2) {
    const z = zOf(m / 60);
    if (Math.abs(z) < 41) GRAT.push({ at: [54, z], txt: `${(m / 60 | 0)}°${pad(m % 60)}′N`, side: 'w' });
  }
}

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
uniform sampler2D uMap; uniform sampler2D uAux;
uniform vec2 uTexel; uniform vec4 uRect; uniform vec3 uCam;
uniform vec3 uLamp; uniform float uLampOn; uniform float uDawn; uniform float uReveal;
uniform float uBeat; uniform float uGain; uniform float uFine; uniform vec4 uPanel; uniform float uPanelK;
uniform vec3 uLit;      // how brightly the shelters, the stations and the towns are burning
in vec2 vUv; in vec3 vW;
out vec4 o;
float iso(float v, float w){ float f = abs(fract(v - .5) - .5) / max(fwidth(v), 1e-4); return 1. - smoothstep(0., w, f); }
void main(){
  // where the words are, the drawing goes quiet: on a phone the panel covers the map and a
  // contour through a line of type is the one place this map is harder to read than paper
  float quiet = uPanelK <= 0. ? 0. : uPanelK * (1. - smoothstep(0., 110.,
    max(0., max(max(uPanel.x - gl_FragCoord.x, gl_FragCoord.x - uPanel.z), max(uPanel.y - gl_FragCoord.y, gl_FragCoord.y - uPanel.w)))));
  vec4 m = texture(uMap, vUv);
  vec4 a = texture(uAux, vUv);
  float h = m.r;
  float hl = texture(uMap, vUv - vec2(uTexel.x, 0.)).r, hr = texture(uMap, vUv + vec2(uTexel.x, 0.)).r;
  float hd = texture(uMap, vUv - vec2(0., uTexel.y)).r, hu = texture(uMap, vUv + vec2(0., uTexel.y)).r;
  float sx = uRect.z * uTexel.x, sz = uRect.w * uTexel.y;
  vec3 n = normalize(vec3(-(hr - hl) / (2. * sx), 1., (hu - hd) / (2. * sz)));
  float slope = length(vec2((hr - hl) / (2. * sx), (hu - hd) / (2. * sz)));
  // curvature, from the samples already taken: positive on a spur, negative in a gully.
  // A hillshade alone leaves a 66 m grid looking moulded; this is what gives it grain.
  float curv = clamp((h - (hl + hr + hd + hu) * .25) * 2.6, -1., 1.);
  float alt = smoothstep(7., 22.4, h);                       // 0 in the basin, 1 on the summit
  float reveal = smoothstep(h - 1.6, h, uReveal);

  // night: a low moon in the north-north-west, so the front of the range faces the light
  // and its Czech side falls away dark. dawn: the sun just north of east, very low.
  float dn = clamp(dot(n, normalize(vec3(.36, .53, .77))), 0., 1.);
  float dd = clamp(dot(n, normalize(vec3(-.95, .17, .26))), 0., 1.);
  // first light walks down the range: Śnieżka has it while the basin is still blue
  float sun = clamp((uDawn * 1.6 - .46 * (1. - alt)) / .55, 0., 1.);
  vec3 base = mix(vec3(.020, .052, .060), vec3(.080, .164, .171), alt);
  vec3 night = base * (.24 + dn * 2.05);
  vec3 dawn = mix(vec3(.072, .066, .078), vec3(.185, .155, .145), alt) * (.30 + dd * 1.15 * sun)
    + vec3(1., .56, .32) * pow(dd, 2.) * .92 * sun;
  vec3 col = mix(night, dawn, uDawn);
  col *= 1. + curv * .42;
  col += mix(vec3(.028, .05, .055), vec3(.085, .05, .034), uDawn) * max(curv, 0.) * .55;
  // light spilling out of the valleys, the way a town lifts its own sky
  col += mix(vec3(1., .74, .46), vec3(.65, .52, .5), uDawn) * a.b * uLit.z * .18 * (1. - alt * .72);

  // contours: 50 m apart, every fifth (250 m) heavier - the intervals a walking map uses.
  // Close in, the 25 m lines fade up between them: the line density then does the texturing
  // a 30 m heightmap cannot, instead of advertising how smooth the surface is.
  float f = h / .875;
  // crowded lines are dropped, and harder at dawn: on a shaded headwall a cluster of them
  // goes pale against a warm range and reads as a tear in the picture instead of as rock
  float dens = clamp(1.3 - fwidth(f) * (.8 + uDawn * 1.3), 0., 1.);
  float minor = iso(f, .85) * dens;
  float fine = uFine * iso(f * 2., .8) * clamp(1.25 - fwidth(f * 2.) * .8, 0., 1.);
  float major = iso(f / 5., .95) * clamp(1.35 - fwidth(f / 5.) * (.5 + uDawn * 1.1), 0., 1.);
  // the soft band around an index line is dropped where the lines crowd, or a headwall
  // turns into a pale wash instead of rock
  float halo = iso(f / 5., 4.5) * .085 * clamp(1.3 - fwidth(f / 5.) * 1.7, 0., 1.);
  // the lines take the light with the ground: a shaded flank keeps its drawing, but quietly,
  // so the massif has a form and is not a flat lace of rings
  float ink = (.58 + .72 * alt) * mix(.42 + .78 * dn, .5 + .85 * dd * sun, uDawn) * (1. - quiet * .82);
  float lamp = uLampOn * smoothstep(14., 0., distance(vW.xz, uLamp.xz));
  float warm = min(a.r * uLit.x, 1.), cool = min(a.g * uLit.y, 1.);
  // at first light the ink goes over to the warm ramp early and completely: a residual cool
  // term on a crowded headwall reads as a tear in the picture, not as shadowed rock
  float dw = smoothstep(0., .5, uDawn);
  vec3 lc = mix(vec3(.31, .52, .48), vec3(.86, 1., .94), lamp);
  lc = mix(lc, vec3(1., .74, .44), smoothstep(.03, .8, warm) * .95);
  lc = mix(lc, vec3(.76, .88, 1.), smoothstep(.03, .75, cool - warm) * .9);
  lc = mix(lc, mix(vec3(.5, .4, .32), vec3(1., .84, .64), clamp(dd * 1.3 * sun + lamp, 0., 1.)), dw);
  float pulse = 1. + uBeat * .9;
  // the pools brighten the fine rings but barely the heavy fifth line, so a shelter is not
  // outshone by the lasso around it; and they favour level ground, so a lamp above a drop
  // lights a slope instead of flaring its crowded contours into a fan of stripes
  float wo = (warm + cool * .8) * (.25 + .75 * (1. - smoothstep(1.6, 3.2, slope)));
  // the glow a lit window throws on the ground, cubed so it has no rim of its own
  col += vec3(1., .42, .12) * warm * warm * warm * .11 * reveal;
  col += lc * ((minor + fine * .62) * ink * (.52 + .5 * lamp + .55 * wo) + major * ink * (.60 + .45 * lamp + .18 * wo) * pulse
    + halo * ink * (1. - uDawn * .55) * (.5 + lamp + .3 * wo) * pulse) * reveal * uGain;
  // steep ground reads as rock: a cool grey, so a headwall is stone and not an absence
  col += mix(vec3(.115, .128, .142), vec3(.135, .105, .086), uDawn) * smoothstep(1.8, 3.3, slope) * reveal;
  // the highest ground keeps a little starlight on it, and takes the sun first
  col += mix(vec3(.055, .095, .105), vec3(.34, .22, .18), uDawn) * smoothstep(.55, 1., alt) * .55 * reveal;

  // the graticule, every second arcminute of real longitude and latitude
  vec2 g = vec2(469.2 - vW.x / 9.52063, 1524.0075 + vW.z / 14.96395);
  col += vec3(.93, .9, .84) * max(iso(g.x, .8), iso(g.y, .8)) * .055 * reveal * (1. - quiet * .8);

  // the water takes the contours off the ground it covers; its surface is drawn over this
  float wet = smoothstep(.3, .7, a.a);
  col = mix(col, mix(vec3(.026, .052, .072), vec3(.085, .062, .066), dw), wet * .95 * reveal);

  // depth haze, and the edge of the sheet fading out
  float dist = length(vW - uCam);
  col = mix(col, vec3(.028, .068, .076) + uDawn * vec3(.16, .085, .06), smoothstep(75., 255., dist) * (.68 - uDawn * .3));
  float e = min(min(vUv.x, 1. - vUv.x), min(vUv.y, 1. - vUv.y));
  float al = smoothstep(0., .085, e);
  o = vec4(col * al, al);
}`;
// The line work: streams, shorelines, paths, and the surface of each lake. A distance field
// sampled at 66 m draws these as blocks, so they are real geometry, widened in screen space
// so a stream stays a hairline however close the camera comes.
const RVS = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aDir; in float aSide; in float aArc; in float aSty; in float aGlow;
uniform mat4 uVP; uniform vec2 uPix; uniform float uWid[8];
out float vArc; out float vSide; out float vW; out float vGlow; out vec3 vP;
flat out int vSty;
void main(){
  vSty = int(aSty + .5); vArc = aArc; vSide = aSide; vGlow = aGlow; vP = aPos;
  vW = uWid[vSty];
  vec4 c = uVP * vec4(aPos, 1.);
  if (aSide != 0. && c.w > .02) {
    vec4 c2 = uVP * vec4(aPos + vec3(aDir.x, 0., aDir.y), 1.);
    vec2 d = c2.xy / max(c2.w, .02) - c.xy / c.w;
    d /= uPix;
    float l = length(d);
    if (l > 1e-5) { vec2 nm = vec2(-d.y, d.x) / l * uPix; c.xy += nm * vW * aSide * c.w; }
  }
  gl_Position = c;
}`;
const RFS = `#version 300 es
precision highp float;
in float vArc; in float vSide; in float vW; in float vGlow; in vec3 vP;
flat in int vSty;
uniform vec4 uCol[8]; uniform float uDawn; uniform float uReveal; uniform vec3 uCam; uniform float uWarm;
uniform vec4 uPanel; uniform float uPanelK;
out vec4 o;
void main(){
  vec4 s = uCol[vSty];
  float a = s.a;
  float d = length(vP - uCam);
  vec3 c = s.rgb;
  if (vSty == 7) {
    // a tarn: dark looking into it, pale where the sky skims off it, and broken into bands
    // so it reads as water and not as a hole. Where a shelter stands on the shore, its
    // light lies on the surface - at Mały Staw that is Samotnia, and it is the whole picture.
    vec3 V = normalize(uCam - vP);
    float fres = pow(1. - clamp(V.y, 0., 1.), 3.);
    float rip = .62 + .38 * sin(vP.x * 8.3 + vP.z * 3.7) * sin(vP.z * 6.1 - vP.x * 2.9);
    rip = mix(1., rip, smoothstep(110., 45., d));
    c = mix(c, vec3(.19, .31, .385) * rip, clamp(.42 + fres * .58, 0., 1.));
    c += vec3(1., .45, .16) * vGlow * vGlow * uWarm * (.5 + fres * 1.3);
    a *= 1. - vGlow * .2;
  } else {
    a *= clamp((1. - abs(vSide)) * vW, 0., 1.);
    // only the crest route is dashed. Two waymarked paths that share a route were drawn in
    // step, so their dashes interleaved and read as a glitch; the rest are drawn thin and
    // whole. The dash grows with distance, so a near path and a far one keep one cadence.
    if (vSty == 6) { float ph = fract(vArc / (1.6 + d * .016)); a *= smoothstep(.34, .46, ph) * (1. - smoothstep(.86, .96, ph)); }
    if (vSty == 3) c = mix(c, vec3(1., .78, .5), vGlow * uWarm * .7);
  }
  // at dawn the line work takes the light too: it keeps its weight and loses its colour,
  // or a blue stream sits in a warm range like a scratch
  float dw = smoothstep(0., .5, uDawn);
  float lum = dot(c, vec3(.3, .59, .11));
  c = mix(c, vec3(lum) * vec3(1.35, 1., .72) + vec3(.05, .03, .02), dw);
  a *= smoothstep(vP.y - 1.6, vP.y, uReveal);
  c = mix(c, vec3(.028, .068, .076) + uDawn * vec3(.16, .085, .06), smoothstep(75., 255., d) * (.68 - uDawn * .3));
  vec2 u = vec2((vP.x + 60.) / 120., (45. - vP.z) / 90.);
  a *= smoothstep(0., .085, min(min(u.x, 1. - u.x), min(u.y, 1. - u.y)));
  if (uPanelK > 0.) a *= 1. - uPanelK * .75 * (1. - smoothstep(0., 110.,
    max(0., max(max(uPanel.x - gl_FragCoord.x, gl_FragCoord.x - uPanel.z), max(uPanel.y - gl_FragCoord.y, gl_FragCoord.y - uPanel.w)))));
  o = vec4(c * a, a);
}`;
// every light and every built mark on the map, as one buffer and one draw call:
// 0 a walker's headlamp, 1 a shelter window, 2 a station window, 3 the mast beacon,
// 4 a light in a valley town, 5 the city beyond the north edge, and then the drawn marks -
// 6 a shelter, 7 a smaller shelter, 8 the observatory on Śnieżka, 9 the relay mast.
// The marks keep a size in pixels, so a hut stays a hut however far away the camera stands.
const PVS = `#version 300 es
in vec3 aPos; in float aA; in float aK; uniform mat4 uVP; uniform vec2 uScale;
out float vA; out float vK; out float vPx;
const float SZ[10] = float[10](.52, .95, .8, 1.5, .78, 9., 3.1, 2.3, 3.0, 3.2);
const float MN[10] = float[10](0., 0., 0., 7., 0., 0., 13., 9.5, 13., 14.);
const float MX[10] = float[10](6.5, 11.5, 8., 17., 8., 54., 34., 22., 30., 34.);
void main(){ vK = aK; vA = aA; vec4 c = uVP * vec4(aPos, 1.); gl_Position = c;
  int k = int(aK + .5);
  gl_PointSize = vPx = clamp(SZ[k] * uScale.x / max(c.w, .1), MN[k] * uScale.y, MX[k] * uScale.y); }`;
const PFS = `#version 300 es
precision mediump float; in float vA; in float vK; in float vPx; uniform float uDawn; out vec4 o;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
vec3 warmth(vec3 c){ return mix(c, vec3(dot(c, vec3(.34))) * vec3(1.3, 1., .74), uDawn * .9); }
void main(){
  vec2 q = gl_PointCoord - .5;                      // -.5 .. .5, y downwards
  float r = length(q);
  int k = int(vK + .5);
  if (k < 6) {
    float a = smoothstep(.5, 0., r); a *= k == 5 ? a * a * 1.6 : a;
    vec3 c = a * (k == 5 ? vec3(1., .72, .45) : k == 4 ? vec3(1., .78, .5) : k == 3 ? vec3(1., .3, .16)
      : k == 2 ? vec3(.79, .89, 1.) : k == 1 ? vec3(1., .69, .35) : vec3(.86, .95, 1.));
    if (k == 3) c += vec3(1., .3, .14) * smoothstep(.17, 0., r);     // the beacon keeps a hot core
    c = warmth(c);                 // at first light nothing stays cool, not even a headlamp
    o = vec4(c * vA, max(c.r, max(c.g, c.b)) * vA); return;
  }
  // a drawn mark: the glyph a walking map would print, lit from inside. Its stroke keeps a
  // constant width in pixels, so it is a symbol and never a smear.
  float lw = .8 / max(vPx, 8.), aa = 1.3 / max(vPx, 8.);
  float d = 9., win = 0., bloom = exp(-r * r * 13.);
  vec3 ink = vec3(1., .9, .76), lit = vec3(1., .72, .38), glow = vec3(1., .46, .16);
  if (k == 6 || k == 7) {                            // a shelter: a gable, with a lit window
    vec2 a0 = vec2(-.23, .23), a1 = vec2(-.23, .01), a2 = vec2(0., -.22), a3 = vec2(.23, .01), a4 = vec2(.23, .23);
    d = min(min(seg(q, a0, a1), seg(q, a1, a2)), min(min(seg(q, a2, a3), seg(q, a3, a4)), seg(q, a4, a0)));
    win = 1. - smoothstep(.055, .105, length((q - vec2(0., .11)) * vec2(1., 1.25)));
  } else if (k == 8) {                               // the observatory: discs on the summit
    ink = vec3(.84, .93, 1.); lit = vec3(.9, .96, 1.); glow = vec3(.42, .62, .9);
    d = min(min(seg(q, vec2(-.25, .2), vec2(.25, .2)), seg(q, vec2(-.19, .03), vec2(.19, .03))),
            min(seg(q, vec2(-.12, -.12), vec2(.12, -.12)), seg(q, vec2(0., -.12), vec2(0., -.3))));
    win = 1. - smoothstep(.03, .07, length(q - vec2(0., -.32)));
  } else {                                           // the relay: a guyed mast, hut beside it
    ink = vec3(.84, .93, 1.); lit = vec3(.86, .94, 1.); glow = vec3(.42, .62, .9); bloom *= .6;
    d = min(min(seg(q, vec2(-.08, .3), vec2(0., -.45)), seg(q, vec2(.08, .3), vec2(0., -.45))),
            min(min(seg(q, vec2(-.055, .06), vec2(.055, .06)), seg(q, vec2(-.03, -.18), vec2(.03, -.18))),
                min(seg(q, vec2(.15, .3), vec2(.15, .15)), min(seg(q, vec2(.15, .15), vec2(.37, .15)), seg(q, vec2(.37, .15), vec2(.37, .3))))));
    win = 1. - smoothstep(.035, .07, length(q - vec2(.26, .23)));
  }
  float line = 1. - smoothstep(lw, lw + aa, d);
  // the sprite is a light, never a shadow: its own alpha follows its brightest channel, so
  // a glow that falls on the sky adds to it instead of punching a dark square in it
  vec3 c = warmth(ink * line * .85 + lit * win * 1.25 + glow * bloom * .34);
  o = vec4(c * vA, max(c.r, max(c.g, c.b)) * vA); }`;

function start(bake, gl) {
  if (!gl) throw new Error('no webgl2');
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
  const land = program(VS, FS), dots = program(PVS, PFS), ribs = program(RVS, RFS);
  const uni = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  const UL = uni(land, ['uMap', 'uAux', 'uVP', 'uRect', 'uTexel', 'uCam', 'uLamp', 'uLampOn', 'uDawn', 'uReveal', 'uBeat', 'uGain', 'uLit', 'uFine', 'uPanel', 'uPanelK']);
  const UP = uni(dots, ['uVP', 'uScale', 'uDawn']);
  const UR = uni(ribs, ['uVP', 'uPix', 'uWid', 'uCol', 'uDawn', 'uReveal', 'uCam', 'uWarm', 'uPanel', 'uPanelK']);

  // the sheet: a grid of (u, v) points, displaced in the vertex shader
  const S = SMALL ? 224 : 320;
  const uv = new Float32Array((S + 1) * (S + 1) * 2);
  for (let j = 0, k = 0; j <= S; j++) for (let i = 0; i <= S; i++) { uv[k++] = i / S; uv[k++] = j / S; }
  const idx = new Uint32Array(S * S * 6);
  for (let j = 0, k = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1; idx[k] = a; idx[k + 1] = c; idx[k + 2] = b; idx[k + 3] = b; idx[k + 4] = c; idx[k + 5] = d; k += 6; }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const aUv = gl.getAttribLocation(land, 'aUv'); gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const mkTex = src => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, N, 0, gl.RGBA, gl.HALF_FLOAT, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const tex = mkTex(bake.tex), aux = mkTex(bake.aux);

  // ---------------- the line work ----------------
  // 0-2 streams by size, 3 a shoreline, 4 a path, 5 the blue route from Karpacz,
  // 6 the red-marked crest route, 7 the surface of a lake
  const RV = [], RI = [];
  const warmAt = (x, z) => {   // how much shelter light falls here, for a glint on the water
    let s = 0;
    for (const sh of F.shelters) { const d = Math.hypot(x - sh.x, z - sh.z), r = sh.p ? 2.3 : 1.7; if (d < r) { const q = 1 - d / r; s += (sh.p ? 1 : .62) * q * q; } }
    return Math.min(1, s);
  };
  const ribbon = (pts, sty, lift, flatY) => {
    const n = pts.length; if (n < 2) return;
    const base = RV.length / 9;
    let arc = 0;
    for (let k = 0; k < n; k++) {
      const [x, z] = pts[k];
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (k) arc += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]);
      const y = (flatY === undefined ? heightAt(x, z) : flatY) + lift, g = warmAt(x, z);
      RV.push(x, y, z, dx, dz, 1, arc, sty, g, x, y, z, dx, dz, -1, arc, sty, g);
    }
    for (let k = 0; k < n - 1; k++) {
      const a = base + k * 2;
      RI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  // a lake's surface: one flat polygon at the water's own level, ear-clipped
  const fill = (poly, y, sty) => {
    const p = poly.slice(0, -1), n = p.length; if (n < 3) return;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const idx = [...p.keys()]; if (area < 0) idx.reverse();
    const base = RV.length / 9;
    for (const [x, z] of p) RV.push(x, y, z, 1, 0, 0, 0, sty, warmAt(x, z));
    const cross = (a, b, c) => (p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) - (p[b][1] - p[a][1]) * (p[c][0] - p[a][0]);
    let guard = n + 4;
    while (idx.length > 3 && guard-- > 0) {
      let cut = -1, widest = -1, wide = -Infinity;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
        const x = cross(a, b, c);
        if (x > wide) { wide = x; widest = i; }
        if (x <= 0) continue;
        let ok = true;
        for (const q of idx) {
          if (q === a || q === b || q === c) continue;
          if (cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0) { ok = false; break; }
        }
        if (ok) { cut = i; break; }
      }
      if (cut < 0) cut = widest;            // a rounded outline can leave no clean ear: force one
      const i = cut, a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      RI.push(base + a, base + b, base + c); idx.splice(i, 1);
    }
    if (idx.length === 3) RI.push(base + idx[0], base + idx[1], base + idx[2]);
  };
  for (const s of F.streams) ribbon(s.p, s.w - 1, .06);
  F.lakes.forEach((lk, i) => {
    const y = bake.levels && bake.levels[i] ? bake.levels[i] : heightAt(lk.x, lk.z);
    fill(lk.o, y + .05, 7);
    ribbon(lk.o, 3, .10, y + .05);
  });
  for (const t of F.trails) ribbon(t.p, t.k === 'ridge' ? 6 : t.w ? 5 : 4, .07);
  const RN = RI.length;
  const rvao = gl.createVertexArray(); gl.bindVertexArray(rvao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(RV), gl.STATIC_DRAW);
  [['aPos', 3, 0], ['aDir', 2, 12], ['aSide', 1, 20], ['aArc', 1, 24], ['aSty', 1, 28], ['aGlow', 1, 32]]
    .forEach(([nm, sz, off]) => { const l = gl.getAttribLocation(ribs, nm); if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 36, off); } });
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(RI), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const RWID = [.6, .85, 1.2, 1.3, .9, .9, 1.5, 0], RW = new Float32Array(8);
  const RCOL = new Float32Array([
    .28, .56, .70, .50,   .28, .58, .72, .60,   .34, .62, .76, .72,   // the streams
    .60, .86, .96, .95,                                               // a shoreline
    .95, .90, .80, .60,   .62, .82, .98, .56,   1., .78, .66, .90,    // the paths
    .042, .082, .112, .95,                                            // a lake
  ]);

  // ---------------- the lights ----------------
  // No buildings: a shelter is two or three warm windows and the pool they throw on the
  // ground. PTS: [x, y, z, brightness, kind, dim group]
  const PTS = [], LAMPS = [];
  const put = (x, z, lift, a, k, grp) => { PTS.push([x, heightAt(x, z) + lift, z, a, k, grp === undefined ? -1 : grp]); };
  for (const s of F.shelters) {
    const g = LAMPS.length; LAMPS.push([s.x, s.z]);
    put(s.x, s.z, s.p ? .42 : .33, s.p ? 1 : .6, s.p ? 6 : 7, g);     // the hut itself
    const n = s.p ? 2 : 1, sp = s.p ? .17 : .13, br = s.p ? .85 : .5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.2832 + s.x;
      put(s.x + Math.cos(a) * sp, s.z + Math.sin(a) * sp * .7, .18 + (k % 2) * .09, br * (.78 + .22 * ((k * 7) % 3) / 2), 1, g);
    }
  }
  // the relay above the Śnieżne Kotły: a mast on an empty rim, cool windows, and one slow
  // red light high enough to sit against the sky rather than against the rock
  const RT = F.landmarks.rton, grt = LAMPS.length; LAMPS.push([RT.x, RT.z]);
  put(RT.x, RT.z, .5, 1, 9, grt);
  put(RT.x + .22, RT.z + .1, .22, .45, 2, grt);
  const beaconAt0 = PTS.length;
  put(RT.x, RT.z, .95, 1, 3, grt);
  // the observatory on Śnieżka: the discs every local looks for, drawn small and cool
  const OB = F.landmarks.obs, gob = LAMPS.length; LAMPS.push([OB.x, OB.z]);
  put(OB.x, OB.z, .44, 1, 8, gob);
  for (let k = 0; k < 2; k++) put(OB.x + Math.cos(k * 2.4) * .16, OB.z + Math.sin(k * 2.4) * .16, .22 + k * .08, .8, 2, gob);
  const MARKN = LAMPS.length;
  // the valley towns: lights scattered on the real settlements, thickest where the people are
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const t of F.towns) {
    const s = Math.sqrt(t.p), n = Math.min(16, Math.max(2, Math.round(s / 3.4))), r = .5 + s * .052;
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * r;
      put(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d * .8, .12, .3 + rnd() * .4 + t.k * .1, 4);
    }
  }
  // Jelenia Góra is 300 m past the north edge: an arc of glow, not a cluster
  for (let k = 0; k < 5; k++) PTS.push([F.offscreen.x + (k - 2) * 6.5, 1.4, 42.5 - Math.abs(k - 2) * .7, .1 + (2 - Math.abs(k - 2)) * .035, 5, -1]);

  // ---------------- walkers on the real paths ----------------
  const pathOf = pts => { const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { P: pts, acc, L: acc[acc.length - 1] }; };
  const TP = {}; for (const t of F.trails) TP[t.k] = pathOf(t.p);
  const AG = [['karpacz', 0, 1.3], ['karpacz', 15, 1.05], ['karpacz', 30, 1.45], ['ascent', 1, 1.15],
    ['ascent', 12, .95], ['ridge', 3, 1.6], ['ridge', 31, 1.3], ['ridge', 60, 1.5]]
    .map(([k, off, sp]) => ({ path: TP[k], off, sp }));
  const TAIL = 5, AN = AG.length * TAIL;

  const ap = new Float32Array((AN + PTS.length) * 5);
  PTS.forEach((p, i) => { const o = (AN + i) * 5; ap[o] = p[0]; ap[o + 1] = p[1]; ap[o + 2] = p[2]; ap[o + 4] = p[4]; });
  const avao = gl.createVertexArray(); gl.bindVertexArray(avao);
  const abuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, abuf); gl.bufferData(gl.ARRAY_BUFFER, ap.byteLength, gl.DYNAMIC_DRAW);
  const aPos = gl.getAttribLocation(dots, 'aPos'), aA = gl.getAttribLocation(dots, 'aA'), aK = gl.getAttribLocation(dots, 'aK');
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(aA); gl.vertexAttribPointer(aA, 1, gl.FLOAT, false, 20, 12);
  gl.enableVertexAttribArray(aK); gl.vertexAttribPointer(aK, 1, gl.FLOAT, false, 20, 16);
  gl.bindVertexArray(null);
  const along = (path, s) => {
    const { P, acc, L } = path;
    s = Math.max(0, Math.min(L, s));
    let k = 0; while (k < acc.length - 2 && acc[k + 1] < s) k++;
    const t = (s - acc[k]) / Math.max(1e-6, acc[k + 1] - acc[k]);
    const x = P[k][0] + (P[k + 1][0] - P[k][0]) * t, z = P[k][1] + (P[k + 1][1] - P[k][1]) * t;
    return [x, heightAt(x, z) + .3, z];
  };
  const placeAgents = (time, gain) => {
    AG.forEach((g, i) => {
      const L = g.path.L, s0 = (time * g.sp + g.off) % (L + 6);
      for (let k = 0; k < TAIL; k++) {
        const s = s0 - k * .4, p = along(g.path, s), o = (i * TAIL + k) * 5;
        const ends = Math.max(0, Math.min(1, s / 2, (L - s) / 2));
        let near = 1;   // a walker gives way near a shelter, so its own windows read first
        for (let q = 0; q < MARKN; q++) { const d = Math.hypot(p[0] - LAMPS[q][0], p[2] - LAMPS[q][1]); if (d < 2.2) near = Math.min(near, .25 + .75 * d / 2.2); }
        ap[o] = p[0]; ap[o + 1] = p[1]; ap[o + 2] = p[2]; ap[o + 3] = (k === 0 ? 1 : .5 * (1 - k / TAIL)) * ends * near * gain;
      }
    });
  };

  // ---------------- labels pinned to the land ----------------
  const top = (x, z) => { let b = [x, -1e9, z]; for (let dx = -1.2; dx <= 1.2; dx += .3) for (let dz = -1.2; dz <= 1.2; dz += .3) { const h = heightAt(x + dx, z + dz); if (h > b[1]) b = [x + dx, h, z + dz]; } return b; };
  const MARK = {
    peak: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.6 10.6 9.6H1.4z" fill="none" stroke="#ece7da" stroke-width="1.2"/></svg>',
    // a filled square for a town, two for a city: a ring with a dot in it reads as ©
    town: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="3.2" y="3.2" width="5.6" height="5.6" fill="#ece7da"/></svg>',
    city: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="4.6" width="4.6" height="4.6" fill="#ffb27a"/><rect x="6.8" y="2.1" width="4.2" height="4.2" fill="#ffb27a" opacity=".7"/></svg>',
  };
  const pins = [];
  const addPin = (el, p, stop, mode) => { labelsEl.appendChild(el); pins.push({ el, p, stop, mode, o: -1 }); };
  for (const l of LABELS) {
    const el = document.createElement('div');
    if (l.kind === 'place') {
      el.className = 'lbl place' + (l.mark === 'peak' ? ' pk' : '');
      el.innerHTML = `${MARK[l.mark]}<span><b>${l.b}</b>${l.s ? `<small>${l.s}</small>` : ''}</span>`;
      const p = l.mark === 'peak' ? top(l.at[0], l.at[1]) : [l.at[0], heightAt(l.at[0], l.at[1]), l.at[1]];
      addPin(el, p, l.stop, 'place');
    } else {
      el.className = 'lbl' + (l.b ? ' stem' : ' quiet');
      el.innerHTML = (l.b ? `<b>${l.b}</b>` : '') + (l.i ? `<i>${l.i}</i>` : '');
      const p = l.peak ? top(l.peak[0], l.peak[1]) : [l.at[0], heightAt(l.at[0], l.at[1]) + (l.dy || 0), l.at[1]];
      if (l.peak) p[1] += .7;
      addPin(el, p, l.stop, 'pin');
    }
  }
  for (const g of GRAT) {
    const el = document.createElement('div'); el.className = 'lbl grat' + (g.side === 'w' ? ' w' : ''); el.textContent = g.txt;
    addPin(el, [g.at[0], heightAt(g.at[0], g.at[1]), g.at[1]], [0], 'grat');
  }
  // placed in this order, so that what the stop is about takes the space it needs first
  const order = pins.slice().sort((a, b) =>
    (a.mode === 'grat' ? 3 : a.mode === 'place' ? 2 : a.el.querySelector('b') ? 0 : 1) -
    (b.mode === 'grat' ? 3 : b.mode === 'place' ? 2 : b.el.querySelector('b') ? 0 : 1));

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
  const portrait = () => cw / ch < .8;
  const camAt = u => {
    const i = Math.min(n - 2, Math.floor(u)), f = u - i, A = WAY[i], B = WAY[i + 1], tall = portrait();
    const ta = tall && A.pt ? A.pt : A.t, tb = tall && B.pt ? B.pt : B.t;
    const t = [0, 1, 2].map(k => lerp(ta[k], tb[k], f));
    const travel = Math.hypot(B.t[0] - A.t[0], B.t[2] - A.t[2]);
    const dist = lerp(A.dist, B.dist, f) + Math.sin(Math.PI * f) * travel * .4;
    const pick = (k, pk, d) => tall ? lerp(A[pk] === undefined ? (A[k] === undefined ? d : A[k]) : A[pk], B[pk] === undefined ? (B[k] === undefined ? d : B[k]) : B[pk], f)
      : lerp(A[k] === undefined ? d : A[k], B[k] === undefined ? d : B[k], f);
    return {
      t, dist, pd: lerp(A.pd || 1.2, B.pd || 1.2, f),
      pitch: pick('pitch', 'pp', 30), yaw: pick('yaw', 'py', 0), fov: pick('fov', 'pf', 30),
    };
  };

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
    const t = (9 - eye[1]) / d[1];
    lamp = [eye[0] + d[0] * t, 9, eye[2] + d[2] * t]; lampTarget = 1;
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
  const P2 = [0, 0, 0];
  const mdim = new Float32Array(LAMPS.length).fill(1);
  const c01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  // the aviation light: a slow blink, steady when motion is reduced
  const blink = t => { const u = (t / 3.4) % 1; return c01(u / .07) * c01((.24 - u) / .07); };
  const loop = now => {
    rafId = 0;
    const wasDirty = dirty; dirty = false;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    const p = progress(), goal = dwell(p);
    cur = (reduce || STILL !== null) ? (STILL !== null ? STILL : Math.round(goal)) : cur + (goal - cur) * (1 - Math.pow(.002, dt));
    const c = camAt(Math.min(n - 1 - 1e-4, Math.max(0, cur)));
    const dist = c.dist * (portrait() ? c.pd : 1), pr = c.pitch * Math.PI / 180, yr = c.yaw * Math.PI / 180;
    eye = [c.t[0] + Math.sin(yr) * Math.cos(pr) * dist, c.t[1] + Math.sin(pr) * dist, c.t[2] + Math.cos(yr) * Math.cos(pr) * dist];
    const fov = c.fov * Math.PI / 180, aspect = cw / ch;
    const V = M.look(eye, c.t, [0, 1, 0]), Pm = M.persp(fov, aspect, 1, 700);
    VP = M.mul(Pm, V);
    const fwd = [c.t[0] - eye[0], c.t[1] - eye[1], c.t[2] - eye[2]], fl = Math.hypot(...fwd); fwd.forEach((v, k) => fwd[k] = v / fl);
    const right = [-fwd[2], 0, fwd[0]], rl = Math.hypot(...right); right.forEach((v, k) => right[k] = v / rl);
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    basis = { r: right, u: up, f: fwd, th: Math.tan(fov / 2), a: aspect };

    const dawn = Math.max(0, Math.min(1, (cur - (n - 1.85)) / .85));
    root.style.setProperty('--dawn', dawn.toFixed(3));
    lampOn += (lampTarget - lampOn) * Math.min(1, dt * 5);
    const reveal = reduce ? 999 : (revealStart ? -4 + (now - revealStart) / 1000 * 20 : -4);
    const revealed = reduce || reveal > maxH * .5;
    const rects = textBlocks.map(b => b.getBoundingClientRect()).filter(r => r.bottom > -40 && r.top < ch + 40 && r.width > 0);
    const onText = (x, y, w, h) => rects.some(r => x + w / 2 > r.left - 16 && x - w / 2 < r.right + 16 && y > r.top - 24 - h && y < r.bottom + 24);
    const onWords = (x, y) => rects.some(r => x > r.left - 10 && x < r.right + 10 && y > r.top - 6 && y < r.bottom + 10);

    // the lights fade at dawn but never quite go out: a shelter still has someone in it at
    // first light, and the frame the film ends on needs them
    // on a phone the words lie over the map: fade the drawing under the block they occupy,
    // so a contour never runs through a line of type. A wide screen has room and keeps all
    // of its lines - the panel's own scrim is enough there.
    let panelK = 0;
    if (portrait() && rects.length) {
      let l = 1e9, r = -1e9, t = 1e9, b = -1e9;
      for (const q of rects) { l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); b = Math.max(b, q.bottom); }
      const sc = canvas.height / ch;
      gl.useProgram(land); gl.uniform4f(UL.uPanel, (l - 14) * sc, (ch - b - 18) * sc, (r + 14) * sc, (ch - t + 18) * sc);
      gl.useProgram(ribs); gl.uniform4f(UR.uPanel, (l - 14) * sc, (ch - b - 18) * sc, (r + 14) * sc, (ch - t + 18) * sc);
      panelK = 1;
    }

    const k0 = revealed ? 1 : 0;
    const warmK = (1 - dawn * .84) * k0, coolK = (1 - dawn * .72) * k0, townK = (1 - dawn * .88) * k0;
    const hikeK = (1 - dawn * .6) * k0, markK = (1 - dawn * .5) * k0, markC = (1 - dawn * .55) * k0;
    for (let i = 0; i < LAMPS.length; i++) {
      project([LAMPS[i][0], heightAt(LAMPS[i][0], LAMPS[i][1]), LAMPS[i][1]], P2);
      const k = P2[2] <= 0 ? 0 : (onWords(P2[0], P2[1]) ? .28 : 1);
      mdim[i] += (k - mdim[i]) * (reduce ? 1 : Math.min(1, dt * 4));   // no fades when motion is reduced
    }
    const beacon = (reduce ? .8 : .42 + .58 * blink(time)) * (1 - dawn * .5) * k0;
    const KBY = [hikeK, warmK, coolK, k0, townK, townK, markK, markK, markC, markC];
    for (let i = 0; i < PTS.length; i++) {
      const q = PTS[i];
      ap[(AN + i) * 5 + 3] = (i === beaconAt0 ? beacon : q[3] * KBY[q[4]]) * (q[5] < 0 ? 1 : mdim[q[5]]);
    }

    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(land);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(UL.uMap, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, aux); gl.uniform1i(UL.uAux, 1);
    gl.uniformMatrix4fv(UL.uVP, false, VP);
    gl.uniform4f(UL.uRect, CX, CZ, W, D); gl.uniform2f(UL.uTexel, 1 / N, 1 / N);
    gl.uniform3f(UL.uCam, eye[0], eye[1], eye[2]); gl.uniform3f(UL.uLamp, lamp[0], lamp[1], lamp[2]);
    gl.uniform1f(UL.uLampOn, lampOn); gl.uniform1f(UL.uDawn, dawn); gl.uniform1f(UL.uReveal, reveal);
    MW.beatSmooth = (MW.beatSmooth || 0) + ((MW.beat || 0) - (MW.beatSmooth || 0)) * Math.min(1, dt * 8);
    gl.uniform1f(UL.uBeat, MW.beatSmooth); gl.uniform1f(UL.uGain, OG ? 1.22 : 1);
    gl.uniform3f(UL.uLit, warmK, coolK, townK);
    // the 25 m lines come up as the camera closes in
    gl.uniform1f(UL.uFine, Math.max(0, Math.min(1, (74 - dist) / 26)));
    gl.uniform1f(UL.uPanelK, panelK);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);

    // the line work, over the land but under the lights
    gl.useProgram(ribs); gl.uniformMatrix4fv(UR.uVP, false, VP);
    gl.uniform2f(UR.uPix, 2 / canvas.width, 2 / canvas.height);
    for (let i = 0; i < 8; i++) RW[i] = RWID[i] * (canvas.height / ch);
    gl.uniform1fv(UR.uWid, RW);
    gl.uniform4fv(UR.uCol, RCOL);
    gl.uniform1f(UR.uDawn, dawn); gl.uniform1f(UR.uReveal, reveal); gl.uniform1f(UR.uWarm, warmK);
    gl.uniform1f(UR.uPanelK, panelK);
    gl.uniform3f(UR.uCam, eye[0], eye[1], eye[2]);
    // the line work keeps its own ground but wins the depth test, so a path on a steep
    // slope is never half-swallowed by the quad it lies on
    gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -220);
    gl.bindVertexArray(rvao); gl.drawElements(gl.TRIANGLES, RN, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true);

    placeAgents(reduce ? 7 : time, hikeK);
    gl.bindBuffer(gl.ARRAY_BUFFER, abuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ap);
    gl.useProgram(dots); gl.uniformMatrix4fv(UP.uVP, false, VP); gl.uniform1f(UP.uDawn, dawn);
    gl.uniform2f(UP.uScale, canvas.height * .9, canvas.height / ch);
    gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(avao); gl.drawArrays(gl.POINTS, 0, AN + PTS.length);
    gl.depthMask(true); gl.bindVertexArray(null);

    // labels: never on top of the words, never off the edge, never on each other. The ones
    // that carry the story are placed first and the rest give way to them.
    const railR = cw > 860 ? 58 : 10; // keep clear of the route dots on the right
    const taken = [];
    for (const pin of order) {
      project(pin.p, P2);
      const near = Math.min(...pin.stop.map(s => Math.abs(cur - s)));
      let o = P2[2] <= 0 ? 0 : Math.max(0, 1 - Math.max(0, near - .22) / .32);
      if (!revealed) o = 0;
      if (pin.w === undefined || pin.w === 0) { pin.w = pin.el.offsetWidth; pin.h = pin.el.offsetHeight; }
      if (pin.mode === 'grat') { const safe = cw >= 760 && !portrait() && P2[0] > cw * .46 && P2[0] < cw - railR - 20 && P2[1] > 80 && P2[1] < ch - 30 && !onText(P2[0], P2[1], 90, 16); o *= safe ? .85 : 0; }
      if (pin.mode === 'pin' || pin.mode === 'place') {
        const half = pin.mode === 'pin' ? pin.w / 2 : 0;
        const lo = 12 + half, hi = cw - railR - (pin.mode === 'pin' ? half : pin.w);
        if (hi > lo) P2[0] = Math.min(hi, Math.max(lo, P2[0]));
        // the bar at the top is 64 px of sticky header and the route dots sit at the foot of
        // a phone: a label is held clear of both rather than dropped, and only let go when
        // the thing it names has genuinely left the frame
        const tg = pin.mode === 'place' ? 74 + pin.h / 2 : 86;
        const bg = ch - (portrait() ? 54 : 14) - (pin.mode === 'place' ? pin.h / 2 : 0);
        if (P2[1] < tg) { if (P2[1] < tg - 170) o = 0; else P2[1] = tg; }
        if (P2[1] > bg) { if (P2[1] > bg + 130) o = 0; else P2[1] = bg; }
        if (onText(P2[0] + (pin.mode === 'place' ? pin.w / 2 : 0), P2[1], pin.w, pin.h)) o = 0;
      }
      let tf = `translate(${P2[0].toFixed(1)}px,${P2[1].toFixed(1)}px)`;
      let below = false;
      if (pin.mode === 'pin') {
        below = P2[1] < (pin.el.offsetHeight || 70) + 78;
        if (below !== pin.below) { pin.el.classList.toggle('below', below); pin.below = below; }
        tf += below ? ' translate(-50%,10px)' : ' translate(-50%,-100%)';
      }
      if (o > .02 && pin.mode !== 'grat') {        // one label to a patch of sky
        const bx = pin.mode === 'place' ? P2[0] - 6 : P2[0] - pin.w / 2;
        const by = pin.mode === 'place' ? P2[1] - pin.h / 2 : (below ? P2[1] + 10 : P2[1] - pin.h);
        if (taken.some(r => bx < r.x + r.w + 10 && bx + pin.w > r.x - 10 && by < r.y + r.h + 6 && by + pin.h > r.y - 6)) o = 0;
        else taken.push({ x: bx, y: by, w: pin.w, h: pin.h });
      }
      if (pin.mode === 'grat') tf += ' translate(-50%,-100%)';
      if (pin.mode === 'place') tf += ' translate(-6px,-50%)';
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
  root.style.setProperty('--dawn', '0');   // the flat sheet has no dawn, and --dawn starts as a colour
  const { heights } = bake;
  const shadeCanvas = document.createElement('canvas');
  shadeCanvas.width = N; shadeCanvas.height = N;
  const sctx = shadeCanvas.getContext('2d');
  const img = sctx.createImageData(N, N);
  const sx = W / N, sz = D / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const hl = heights[j * N + Math.max(0, i - 1)], hr = heights[j * N + Math.min(N - 1, i + 1)];
      const hd = heights[Math.max(0, j - 1) * N + i], hu = heights[Math.min(N - 1, j + 1) * N + i];
      let nx = -(hr - hl) / (2 * sx), nz = (hu - hd) / (2 * sz), ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const lum = Math.max(0, nx * .36 + ny * .53 + nz * .77);
      const t = Math.max(0, Math.min(1, (heights[k] - .6) / 21));
      const sh = .3 + lum * 1.5;
      const o = ((N - 1 - j) * N + i) * 4;
      img.data[o] = Math.min(255, (4 + 15 * t) * sh * 1.15);
      img.data[o + 1] = Math.min(255, (11 + 33 * t) * sh * 1.15);
      img.data[o + 2] = Math.min(255, (13 + 34 * t) * sh * 1.15);
      img.data[o + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  let hi = 0; for (let k = 0; k < heights.length; k++) if (heights[k] > hi) hi = heights[k];

  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight, small = w < 760;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.max(w / 92, h / 62) * (small ? 1.35 : 1.02);
    const ox = w * (small ? .52 : .63), oy = h * (small ? .36 : .52), wx0 = 2, wz0 = -8;
    const X = x => ox + (x - wx0) * s, Y = z => oy + (z - wz0) * s;
    ctx.fillStyle = '#081416'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadeCanvas, X(CX - W / 2), Y(CZ - D / 2), W * s, D * s);
    // contour lines (marching squares on every second sample)
    const step = 2, cols = Math.floor((N - 1) / step), rows = Math.floor((N - 1) / step);
    const at = (i, j) => heights[(N - 1 - j * step) * N + i * step];
    const px = i => X(CX - W / 2 + (i * step + .5) * sx), pz = j => Y(CZ - D / 2 + (j * step + .5) * sz);
    for (let lv = .875, k = 1; lv < hi; lv += .875, k++) {
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
      ctx.strokeStyle = k % 5 === 0 ? 'rgba(150,205,192,.52)' : 'rgba(110,160,152,.2)';
      ctx.lineWidth = k % 5 === 0 ? 1.1 : .7;
      ctx.stroke();
    }
    // the streams
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const st of F.streams) {
      ctx.beginPath(); st.p.forEach(([x, z], q) => q ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)));
      ctx.strokeStyle = 'rgba(88,166,201,.6)'; ctx.lineWidth = .5 + st.w * .4; ctx.stroke();
    }
    // the lakes, laid over the contours the way a printed map masks them
    for (const lk of F.lakes) {
      ctx.beginPath(); lk.o.forEach(([x, z], q) => q ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z))); ctx.closePath();
      ctx.fillStyle = '#0b2330'; ctx.fill();
      ctx.strokeStyle = 'rgba(140,198,220,.8)'; ctx.lineWidth = .9; ctx.stroke();
    }
    // the paths, dashed, with the crest route drawn heavier
    ctx.setLineDash([5, 4]);
    for (const t of F.trails) {
      ctx.strokeStyle = t.w ? 'rgba(140,186,232,.6)' : 'rgba(236,231,218,.5)';
      ctx.lineWidth = t.k === 'ridge' ? 1.9 : 1.2;
      ctx.beginPath(); t.p.forEach(([x, z], k) => k ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z))); ctx.stroke();
    }
    ctx.setLineDash([]);
    // the towns, as a scatter of lights
    for (const t of F.towns) {
      const r = .5 + Math.sqrt(t.p) * .052, n = Math.min(10, Math.max(1, Math.round(Math.sqrt(t.p) / 5)));
      ctx.fillStyle = 'rgba(255,196,130,.5)';
      for (let k = 0; k < n; k++) {
        const a = k * 2.4 + t.x, d = (k / n) * r;
        ctx.beginPath(); ctx.arc(X(t.x + Math.cos(a) * d), Y(t.z + Math.sin(a) * d * .8), 1.1, 0, 6.284); ctx.fill();
      }
    }
    // the shelters, as a walking map's gabled symbols; the relay with its red light
    const hut = (x, y) => {
      ctx.strokeStyle = '#ece7da'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(x - 3.4, y + 3.4); ctx.lineTo(x - 3.4, y); ctx.lineTo(x, y - 3.4); ctx.lineTo(x + 3.4, y); ctx.lineTo(x + 3.4, y + 3.4);
      ctx.closePath(); ctx.stroke();
    };
    for (const s of F.shelters) {
      const x = X(s.x), y = Y(s.z);
      hut(x, y);
      ctx.fillStyle = s.p ? 'rgba(255,178,122,.95)' : 'rgba(255,178,122,.5)';
      ctx.beginPath(); ctx.arc(x, y + 1.4, s.p ? 1.9 : 1.3, 0, 6.284); ctx.fill();
    }
    const rx = X(F.landmarks.rton.x), ry = Y(F.landmarks.rton.z);
    hut(rx, ry);
    ctx.strokeStyle = '#ece7da'; ctx.beginPath(); ctx.moveTo(rx + 6, ry + 3.4); ctx.lineTo(rx + 6, ry - 7); ctx.stroke();
    ctx.fillStyle = '#ff1210'; ctx.beginPath(); ctx.arc(rx + 6, ry - 8.4, 1.7, 0, 6.284); ctx.fill();
    const ox2 = X(F.landmarks.obs.x), oy2 = Y(F.landmarks.obs.z);
    ctx.strokeStyle = '#dfeaf4'; ctx.beginPath();
    for (let k = 0; k < 3; k++) { const q = 4.4 - k * 1.3; ctx.moveTo(ox2 - q, oy2 - k * 2.1); ctx.lineTo(ox2 + q, oy2 - k * 2.1); }
    ctx.moveTo(ox2, oy2 - 4.4); ctx.lineTo(ox2, oy2 - 8.6); ctx.stroke();
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

// ---------------- boot ----------------
// If the browser has no OffscreenCanvas in workers, the page decodes the tile itself and
// hands the bytes over; the bake asks for exactly that.
async function decodeHere(url) {
  const img = new Image();
  img.decoding = 'sync'; img.src = url;
  await (img.decode ? img.decode() : new Promise((ok, no) => { img.onload = ok; img.onerror = no; }));
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { pixels: new Uint8ClampedArray(d.data), w: c.width, h: c.height };
}

(async () => {
  let glctx = null;
  try { glctx = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' }); } catch (e) { glctx = null; }
  const hm = new URL(`karkonosze-${N}.png`, DATA).href;
  try {
    const res = await fetch(new URL('karkonosze.json', DATA));
    if (!res.ok) throw new Error('features ' + res.status);
    F = await res.json();
    // the Śnieżne Stawki are 40 to 70 m across - under one cell of this map, so they could
    // only ever draw as two scratches on the ground. Real water starts above that.
    F.lakes = F.lakes.filter(l => {
      let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
      for (const [x, z] of l.o) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); }
      return Math.max(b - a, d - c) > .6;
    });
    buildStory();
    const worker = new Worker(new URL('./world-bake.js', import.meta.url));
    worker.onmessage = async e => {
      if (e.data.needPixels) {
        try { const p = await decodeHere(hm); worker.postMessage(p, [p.pixels.buffer]); }
        catch (err) { worker.terminate(); root.style.setProperty('--dawn', '0'); root.classList.add('no-world'); console.warn('the map could not be read', err); }
        return;
      }
      if (e.data.failed) { worker.terminate(); root.style.setProperty('--dawn', '0'); root.classList.add('no-world'); console.warn('the map could not be read', e.data.failed); return; }
      worker.terminate();
      if (!glctx) { flat2D(e.data); return; }
      try { start(e.data, glctx); } catch (err) {
        console.warn('3D map unavailable, drawing the flat map instead.', err);
        const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); flat2D(e.data, fresh);
      }
    };
    worker.onerror = () => { root.style.setProperty('--dawn', '0'); root.classList.add('no-world'); };
    worker.postMessage({ N, W, D, cx: CX, cz: CZ, hm, F });
  } catch (err) {
    root.style.setProperty('--dawn', '0');
    root.classList.add('no-world');
    console.warn('the map could not be read', err);
  }
})();
