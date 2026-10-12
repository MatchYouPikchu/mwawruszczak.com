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
// The moon: 13 degrees up in the east, a little north of it - where a waning crescent stands
// in the hours before the sun comes up in the same quarter. East is -x and north is +z, so
// this rakes the length of the range instead of facing it: the north walls of the Śnieżne
// Kotły are cut out of their own shadow, every spur throws one, and the Czech side of the
// crest goes dark. Tried against the land at five bearings; nearer north flattens the
// cirques, and from the west the stops look straight down the beam and lose their modelling.
const MOON = (() => {
  const d = (Q.get('moon') || '').split(',').map(Number);
  const v = d.length === 3 && d.every(Number.isFinite) ? d : [-0.93, 0.26, 0.30];
  const l = Math.hypot(...v) || 1;
  return v.map(k => k / l);
})();

// ---------------- the sea of fog ----------------
// A clear October night ends with the valleys full. The ground gives its heat up to the
// sky, the cold air runs downhill, and an hour before dawn the basin is a lake of fog with
// the range standing out of it. It is the sight these mountains are known for and half the
// reason anyone walks up Śnieżka in the dark.
// Each drainage holds its own pool and fills to its own brim. There are two here: the
// Jelenia Góra basin on the Polish side, whose floor lies at 350-450 m and which fills to
// about 620 - which is why Szklarska Poręba at 630-700 m is a resort above the fog, and why
// the trailhead the third stop is about stands clear of it - and the Czech valleys behind
// the crest, the Labe above Špindlerův Mlýn and the Mumlava at Harrachov, whose floors are
// at 700-900 m already and which fill to about 900.
const FOG_N = hOf(620), FOG_S = hOf(900);
// The crest as a line in plan, Szrenica to Śnieżka: how far north of it a point lies says
// which pool it drains into. The brim changes across the crest itself, where both of them
// are three hundred metres underground, so no valley ever sees the seam.
const FOG_CZ = 17.74, FOG_CK = .3845;
// The basin does not end where the survey does: it runs on past the north edge of the sheet
// to Jelenia Góra and beyond, and so does the fog in it. The layer is drawn over that much
// more ground than the map holds, standing on the height the edge of the map last had, so
// the sea reaches the horizon instead of stopping at a line ruled across it.
const FOG_EXT = 24;
// a smoothstep out here, where the drawing has not started and start()'s own one is not in scope
const sst0 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// where the top of the layer stands over a point of the map, the same answer the two fog
// shaders work out for themselves, without the swell on it
const fogTopAt = (x, z) => FOG_N + (FOG_S - FOG_N) * sst0(2, -7, z + FOG_CZ - FOG_CK * x);
// how far under the brim a light stands, 0 above it and 1 once the layer has swallowed it
const drownAt = (x, y, z) => sst0(-.1, 1., fogTopAt(x, z) - y);

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
    { t: [27, 11, 2], dist: 58, pitch: 38, yaw: -4, fov: 30, pt: [34, 12.5, 6], pd: .86, pp: 40, py: -14, pf: 36 },
    // The finale: from the Szrenica shelter along the crest on the red-marked trail, the whole
    // way, to Śnieżka as the sun comes up. The camera rises off the third stop, turns to look
    // down the range and keeps the head of the walk in front of it; it lands below the summit
    // on the Silesian side, with the cone lit from the east and the observatory on top.
    { t: [-30.97, 18.5, -26.86], dist: 30, pitch: 14, yaw: 38, fov: 32, pt: [-29.5, 16.2, -27], pd: .933, pp: 14, py: 36, pf: 44,
      via: [
        { t: [30, 17, -8], dist: 40, pitch: 22, yaw: 40, fov: 32 },
        { t: [18, 19, -11], dist: 34, pitch: 17, yaw: 62, fov: 32 },
        { t: [2, 17, -16], dist: 34, pitch: 15, yaw: 66, fov: 32 },
        { t: [-14, 19, -21], dist: 32, pitch: 14, yaw: 55, fov: 32 },
      ] },
  ];
  // how far along the crest trail each key of the finale looks: the walk keeps pace with it
  {
    const rp = F.trails.find(t => t.k === 'ridge').p, acc = [0];
    for (let i = 1; i < rp.length; i++) acc.push(acc[i - 1] + Math.hypot(rp[i][0] - rp[i - 1][0], rp[i][1] - rp[i - 1][1]));
    const arcAt = (x, z) => { let b = 0, bd = 1e9; rp.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - z); if (d < bd) { bd = d; b = i; } }); return acc[b]; };
    const fin = WAY[WAY.length - 1];
    WAY[WAY.length - 2].arc = 0; fin.arc = acc[acc.length - 1];
    let last = 0;
    for (const v of fin.via) last = v.arc = Math.max(last, arcAt(v.t[0], v.t[2]));
  }
  if (OG) WAY[0] = { t: [-4, 12, -14], dist: 106, pitch: 26, yaw: 8, fov: 30 };
  // ?still=N&cam=tx,ty,tz,dist,pitch,yaw,fov - for composing a stop against the real land
  if (STILL !== null && Q.has('cam')) {
    const c = Q.get('cam').split(',').map(Number);
    if (c.length === 7 && c.every(v => Number.isFinite(v))) WAY[STILL] = { t: c.slice(0, 3), dist: c[3], pitch: c[4], yaw: c[5], fov: c[6], pd: 1, pp: c[4], py: c[5], pf: c[6], pt: c.slice(0, 3) };
  }

  // Only the story is written on the land. The range names itself to anyone who knows it,
  // and to anyone who does not a caption reading ŚNIEŻKA 1603 m is a tourist sign nailed to
  // a mountain: it tells them what to look at instead of letting them look.
  LABELS = [
    { stop: [1], peak: [sr.x, sr.z], b: 'Ready now', i: 'close, and worth doing' },
    { stop: [1], peak: [sn.x, sn.z], b: 'The big bet', i: 'worth more, further away' },
    { stop: [2], at: [rt.x, rt.z], dy: 1.5, b: 'Background agents', i: 'working before anyone asks' },
    { stop: [3], at: kp, dy: .5, i: 'discovery' },
    { stop: [3], at: [ka.x, ka.z], dy: .5, i: 'rough prototype' },
    { stop: [3], at: [hs.x, hs.z], dy: .6, i: 'measured' },
    { stop: [3], at: [sz.x, sz.z], dy: 1.1, b: 'Live', i: 'in production', stem: 78 },
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
// The lit air at first light, as a function of how far round the sky you are looking from
// the sun: 1 straight into it, 0 with it behind you. Three stops and not two, because a
// straight ramp from gold to night-blue runs through brick - which is the colour this whole
// frame used to be - and a sky does not: it goes gold, then salmon, then lilac, then blue,
// and the pink in the middle is the half of it anyone remembers. The sky, the haze between
// one ridge and the next, and the air a building stands in all read it from here, so the
// land never fades into a colour the sky above it is not.
const DAWNAIR = `
vec3 airAt(float tow){
  float k = pow(clamp(tow, 0., 1.), 1.9);
  return mix(mix(vec3(.044, .058, .130), vec3(.272, .150, .212), clamp(k * 2., 0., 1.)),
             vec3(.720, .360, .215), clamp(k * 2. - 1., 0., 1.));
}
// how far round the sky, in plan, a direction is from the sun: 1 into it, 0 away from it
float towardSun(vec2 dxz){ return clamp(.5 + .5 * dot(normalize(dxz + vec2(1e-6)), normalize(vec2(-.95, .26))), 0., 1.); }`;
// The sky, drawn first across the whole frame from the camera's own basis: deep at the
// zenith, lifting to a cold band at the horizon so the crest in front of it reads as a
// silhouette, with the moon where the land says it is. It gives way to the dawn behind it.
const SVS = `#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vNdc = p * 2. - 1.;
  gl_Position = vec4(vNdc, 1., 1.);
}`;
const SFS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRx; uniform vec3 uRy; uniform vec3 uFw; uniform vec3 uMoon; uniform float uDawn;
uniform float uPre;     // how far into the hour before sunrise: 0 at the first stop, 1 at the last
uniform vec4 uPanel; uniform float uPanelK;   // the block of type on screen, in device pixels
out vec4 o;
${DAWNAIR}
float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract(p.x * p.y); }
void main(){
  vec3 d = normalize(uFw + vNdc.x * uRx + vNdc.y * uRy);
  float up = d.y;
  // above the skyline: deep overhead, lifting to a cold band at the horizon. Below it: the
  // same air the far ridges are already fading into, so the edge of the sheet dissolves
  // into distance instead of ending at a black wall.
  // deep overhead, a cold band at the skyline so the crest is cut out of it, and below the
  // skyline the colour the far ridges are already fading into - the stops that look down on
  // the range from the basin see no horizon at all, and what is past the sheet should read
  // as more air and more distance, not as a hole cut in the picture
  vec3 zen = vec3(.016, .026, .050), hor = vec3(.088, .122, .172), deep = vec3(.040, .062, .098);
  vec3 c = mix(hor, zen, pow(clamp(up, 0., 1.), .55));
  c = mix(c, deep, smoothstep(.01, -.09, up));
  c = mix(c, deep * .42, smoothstep(-.13, -.75, up));
  // the moon is low and well off to one side at every stop, so what the sky shows of it is
  // the glow it lays along the horizon in its own quarter, not the disc
  vec2 md = normalize(uMoon.xz);
  float az = max(dot(normalize(d.xz + vec2(1e-6)), md), 0.);
  c += vec3(.085, .110, .160) * pow(az, 2.6) * exp(-max(up, 0.) * 7.) * .85;
  float m = dot(d, uMoon);
  c += vec3(.62, .68, .80) * pow(max(m, 0.), 1400.) * 2.4;   // the disc, if a stop ever turns to it
  c += vec3(.20, .26, .38) * pow(max(m, 0.), 46.) * .45;     // the ring close around it
  // The hour before. The sun is still well under the rim but it is coming up in this same
  // quarter, behind Śnieżka at the east end of the range, and over the five stops the sky
  // there stops being only moonlit. It is kept lower and much tighter than the moon's wash
  // so the two read as different things: a cold glow standing over the whole east, and
  // under it a thin warm line that was not there when the page opened.
  // The east stands square to every stop on this flight: the camera looks south at the
  // range and the sun will come up off its left shoulder, ninety degrees away, which is
  // also where Śnieżka is. So this is not a patch of sky but a gradient across the whole
  // dome, brightest where the frame runs out on the left. And it has to sit low: every
  // stop looks down on the model, so the horizon is above the top of the picture and the
  // sky anyone actually sees here is all of it below that line.
  float azS = .5 + .5 * dot(normalize(d.xz + vec2(1e-6)), md);
  float hgt = up + .12;
  float prof = exp(-max(hgt, 0.) * 3.1) * exp(-max(-hgt, 0.) * 2.4) * smoothstep(-.70, -.34, up);
  vec3 ember = mix(vec3(.052, .064, .086), vec3(.235, .105, .060), uPre * uPre);
  float glow = prof * (pow(azS, mix(1.45, 1.95, uPre)) * (.78 + .46 * uPre) + pow(azS, 7.) * (.18 + .90 * uPre)) * (1. - uDawn);
  // the blue goes out of the sky where this comes up, or the two together make violet, and
  // violet over a silver range is a postcard
  c = mix(c, c * vec3(1.18, 1., .74), min(1., glow * 2.4));
  c += ember * glow;
  // stars: a scatter, not a planetarium - thinned where the moon washes them out, gone below
  // the skyline, and going out of their own accord as the sky in the east comes up
  vec2 sp = d.xz / max(up, .07) * 34.;
  vec2 ci = floor(sp), cf = fract(sp) - .5;
  float keep = step(.9925, h21(ci));
  float rad = length(cf - (vec2(h21(ci + 11.7), h21(ci + 4.3)) - .5) * .66);
  float star = keep * smoothstep(.075, .010, rad) * (.40 + .60 * h21(ci + 2.1));
  c += vec3(.76, .82, .95) * star * smoothstep(.004, .085, up) * (1. - .7 * pow(az, 3.))
    * .62 * (1. - uPre * .72);

  // ---- and the sky the sun comes up into ----
  // Until now this gave way to a flat wash behind the canvas, which is why the end of the
  // film had a brown ceiling over it. A real sunrise sky is the most graded thing in the
  // frame and all of its grading is in one quarter: gold on the horizon under the sun,
  // pink standing above that, the blue of the night still holding at the zenith, and in the
  // west the earth's own shadow going down. Every stop here looks down on the range, so the
  // horizon is off the top of the picture and nearly all the sky anyone sees is the lit air
  // below it - which is the part that has to be right.
  // the gold is held close round the sun's own quarter and everything else is left to the
  // violet: spread evenly it is one orange wash across the whole dome, which is a filter
  float ad = towardSun(d.xz), tow = pow(ad, 2.6);
  vec3 hi = mix(vec3(.040, .058, .122), vec3(.160, .125, .185), tow);   // the zenith, warming towards the sun
  // the horizon: violet in the west, gold in the east. Gold, and not a lamp - the band over
  // the sun is the brightest thing in the sky and it still has to sit under the brightest
  // thing on the mountain, or the eye goes to an empty corner of the frame and stays there
  vec3 lo = mix(vec3(.120, .098, .158), vec3(.680, .345, .165), tow);
  vec3 cd = mix(hi, lo, exp(-max(up, 0.) * 3.2));
  // the belt of pink that stands over the band itself, which is the colour everybody
  // remembers from the one morning they were up for it
  cd += vec3(.50, .22, .21) * tow * exp(-abs(up - .085) * 9.) * .62;
  // Below the skyline: the lit air the far ridges are dissolving into, the same mix the
  // land fades to, so the sheet runs out into distance and not into a painted backdrop.
  // Looking into the sun across twenty kilometres of basin air, it glows - brightest just
  // under the skyline, and falling away as the eye goes down into the basin, or the whole
  // upper half of the frame comes out as one flat sheet of orange.
  // Held well under the full strength of that air, and not for want of nerve: the subject
  // of this frame is a mountain catching its first light, and lit air twenty kilometres off
  // has no business being nine times brighter than the brightest rock. Cut like this the
  // range keeps the frame and the sky is what stands behind it.
  cd = mix(cd, airAt(ad) * (.48 + .44 * smoothstep(-.34, .02, up)), smoothstep(.03, -.22, up));
  // and straight down off the edge of the sheet it goes out again: there is no light under
  // the frame, and a floor of glowing air would read as a lit table the model stands on
  cd = mix(cd, mix(vec3(.030, .036, .060), vec3(.130, .082, .074), tow), smoothstep(-.26, -.74, up));
  // Where the words are, the sunrise steps back. Every other pass on this map already does
  // it - the land, the line work, the buildings and the light on the ground all take uPanel
  // - and the sky was the one layer that did not. That stopped being harmless the moment it
  // went from a dark wash to the brightest thing in the frame: at the landing the gold
  // stands directly behind the counter and the first line of the heading. So the gold is
  // held down over the block of type, over a skirt two thirds as deep as the block itself -
  // a couple of hundred pixels at this size - which is wide enough that what the eye reads
  // is deeper air on that side of the frame and not a rectangle cut out of the sky. The
  // distance out of the block is taken as a length rather than as the larger of the two
  // sides, so the corners come off round; a square corner drawn across an empty sky is
  // exactly the thing an eye finds, and there is nothing in air that has corners. And the
  // red comes down hardest of the three, so what is left behind the type is the violet the
  // rest of the dome is already in, rather than a grey hole in a warm sky.
  float fw = max(.62 * (uPanel.w - uPanel.y), 1.);
  vec2 od = max(uPanel.xy - gl_FragCoord.xy, gl_FragCoord.xy - uPanel.zw);
  float q = uPanelK <= 0. ? 0. : uPanelK * (1. - smoothstep(0., fw, length(max(od, vec2(0.)))));
  cd *= 1. - q * vec3(.52, .44, .30);
  // eased in, so the first part of the last flight is still a night sky with a rumour in
  // the east rather than a lit one: the colour should arrive while the camera is moving
  c = mix(c, cd, pow(uDawn, 1.3));
  o = vec4(c, 1.);
}`;
// ---------------- what the light cannot reach ----------------
// Both the lights in this picture stand about ten degrees over the horizon in the same
// quarter of the sky, and a light that low does not simply shade a range, it shadows it:
// every spur throws its own length across the ground behind it, the Śnieżne Kotły lie in
// the dark under their own rims, and the basins are still out of the sun a quarter of an
// hour after the summits have had it. Without this the dawn lights every slope that merely
// faces the right way, which is why it came out as one flat brown.
// The height field is the land, so the whole of it is a march up the ray towards the light:
// step out, read the ground under the ray, and if the ground stands above the ray then
// something between here and the light is in the way. How close the ray came to the ground
// gives the penumbra for nothing - a shadow edge a kilometre from the ridge that casts it
// is soft, which is what a real one does, and a hard-edged shadow at this scale would read
// as a decal laid on the map. The steps grow as they go: close in the ground has to be read
// finely or a kerb of rock lets the light through, far out it is a whole ridge doing the
// blocking and a coarse step finds it just as well.
// Used by the land and by the buildings, which march from their own walls and roofs, so an
// upper storey can stand in the light while the ground floor is still in the shadow of the
// cone above it - which is exactly what you see at Dom Śląski on a clear morning.
// Twenty-four steps, each about a sixth longer than the last, reach some 72 world units -
// seventeen kilometres, more than the sheet is wide, so nothing standing on it can cast a
// shadow this march fails to find. A phone takes twelve, growing rather faster, and reaches
// about 32 units: eight kilometres, every ridge that matters at that size, at half the fill.
const SHADOW = `
#define SH_STEPS ${SMALL ? 12 : 24}
vec2 shUv(vec2 p){ return vec2((p.x - uRect.x) / uRect.z + .5, .5 - (p.y - uRect.y) / uRect.w); }
float shadeAt(vec3 p, vec3 n, vec3 L, float far){
  float t = ${SMALL ? '.56' : '.44'}, st = ${SMALL ? '.56' : '.36'}, res = 1.;
  // start on the height field itself and not on the drawn surface: the sheet is drawn from
  // a coarser mesh than the texture the march reads, so a ridge is a few metres lower in
  // the one than in the other, and a ray leaving the mesh begins underground and shadows
  // the whole range. A building passes its own point, which stands above both.
  p.y = max(p.y, texture(uMap, shUv(p.xz)).r);
  p += n * .05;                                  // off the face, or a slope shadows itself
  int ns = far > 150. ? SH_STEPS / 2 : SH_STEPS; // a ridge ten kilometres off is half haze anyway
  for (int i = 0; i < ns; i++){
    vec3 q = p + L * t;
    if (q.y > uTop) break;                       // out over the top of everything the sheet holds
    vec2 uv = shUv(q.xz);
    if (min(uv.x, uv.y) < 0. || max(uv.x, uv.y) > 1.) break;   // off the sheet: nothing out there
    res = min(res, 5.4 * (q.y + .035 - texture(uMap, uv).r) / t);
    if (res < .004) return 0.;
    t += st; st *= ${SMALL ? '1.27' : '1.155'};
  }
  return clamp(res, 0., 1.);
}`;
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
uniform vec2 uTexel; uniform vec4 uRect; uniform vec3 uCam; uniform vec3 uMoon;
uniform vec3 uLamp; uniform float uLampOn; uniform float uDawn; uniform float uReveal;
uniform float uBeat; uniform float uGain; uniform float uFine; uniform vec4 uPanel; uniform float uPanelK;
uniform vec3 uLit;      // how brightly the shelters, the stations and the towns are burning
uniform float uPre;     // how far into the hour before sunrise: 0 at the first stop, 1 at the last
uniform float uTop;     // the highest ground on the sheet: a ray above it can hit nothing
in vec2 vUv; in vec3 vW;
out vec4 o;
${DAWNAIR}
float iso(float v, float w){ float f = abs(fract(v - .5) - .5) / max(fwidth(v), 1e-4); return 1. - smoothstep(0., w, f); }
float h12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
${SHADOW}
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
  float dist = length(vW - uCam);

  // night: a low moon raking in from the east-north-east, so the north faces and the
  // headwalls of the Śnieżne Kotły are carved out of their own shadow and the Czech side of
  // the crest falls away dark. dawn: the sun just north of east, very low.
  vec3 sunD = normalize(vec3(-.95, .17, .26));
  float dn = clamp(dot(n, uMoon), 0., 1.);
  float dd = clamp(dot(n, sunD), 0., 1.);
  // First light walks down the range: Śnieżka has it while the basin is still blue, and it
  // takes the whole of this flight to get down there. The cast shadows below say where the
  // light cannot reach; this says where it has not reached yet, which on a mountain at
  // sunrise is the larger half of the answer - the summits are in the sun for a quarter of
  // an hour before anything in the valleys is, and at the end of this film the Jelenia Góra
  // basin is still holding the night.
  float sun = clamp((uDawn * 1.45 - 1.12 * (1. - alt)) / .55, 0., 1.);
  // One march for both lights. The moon and the sun of this hour stand three degrees apart
  // in the same quarter - the dawn was drawn under the moon on purpose - so a ray towards
  // the one is a ray towards the other, and turning it over as the night ends costs nothing
  // and shows nothing. Ground that faces away from the light is already dark: it never asks.
  vec3 LD = normalize(mix(uMoon, sunD, uDawn));
  float shd = max(dn, dd) > .004 ? shadeAt(vW, n, LD, dist) : 1.;
  // The moon's shadows are the same shadows, but moonlight is not a spotlight: the sky is
  // half the light on a clear night and what the snowfields opposite throw back is the rest,
  // so a slope the moon cannot see is dimmer, not black. The sun is the opposite - out of
  // its reach there is nothing but sky.
  float shdN = mix(1., shd, .74);
  // Moonlight is a quarter of a millionth of noon, and the picture should say so: only a
  // face turned square to the moon comes up to silver, everything a little off it falls
  // away fast, and a slope that turns from it goes properly dark rather than the even grey
  // a high lamp leaves on everything.
  // Close in, the light is broken up by the ground the survey could not record: a 30 m grid
  // gives a flank no scree, no heather and no crag, so under a raking light it comes out as
  // pressed satin. The grain goes into the light rather than onto the colour, so it is the
  // moon finding texture, strongest where the terminator runs and gone at hero distance.
  float gk = smoothstep(92., 28., dist) * smoothstep(.18, 1.1, slope);
  vec2 gq = vW.xz * 9.;                         // about a 27 m cell: scree, not weather
  // and one octave cut on a vertical plane, or a slope laid out in plan stretches the grain
  // down its own fall line and the flank comes out combed instead of rough
  vec2 gh = vec2(vW.x * 6.4 + vW.z * 6.9, h * 9.);
  float grain = ((vn(gq) - .5) + (vn(gq * 2.6) - .5) * .58 + (vn(gh) - .5) * .80) * gk;
  float form = pow(clamp(dn + grain * .15, 0., 1.), 1.6) * shdN;
  float sky = clamp(n.y * .5 + .5, 0., 1.);        // how much open sky this face can see
  // a glance of silver where the moon catches bare rock. Kept on the convex side only: tied
  // to slope alone it picks out every fall line and lays comet streaks down the flanks.
  float sheen = pow(dn, 6.) * smoothstep(1.5, 3.2, slope) * smoothstep(-.1, .55, curv) * shd;
  // the basin keeps almost nothing; the crest keeps what the open sky gives it, so the range
  // stands up out of its own valley before a single contour is drawn
  vec3 shade = mix(vec3(.010, .019, .035), vec3(.031, .056, .084), alt);
  vec3 silver = mix(vec3(.34, .45, .58), vec3(.78, .88, 1.02), alt);
  // the sky itself is the fill, and what the snowfields opposite throw back is the rest of
  // it: enough that a shaded flank keeps its shape, far too little to compete with the moon
  float fill = clamp(dot(n, normalize(vec3(.62, .46, -.64))), 0., 1.);
  vec3 night = shade * (.46 + sky * 1.30) + vec3(.016, .026, .044) * fill
    + silver * (form * 1.06 + sheen * .30);
  // The east is already a light, a long time before the sun is. It comes from exactly where
  // the sun will - just under the moon, and rather lower - so it finds the same faces and
  // adds nothing anywhere else; and over the five stops it goes from the colour of the sky
  // to the colour of what is behind the sky. At the first stop it is a twentieth of the
  // moon. By the fourth it is enough that the dawn, when it comes, finishes a sentence
  // rather than starting one.
  float de = clamp(dot(n, normalize(vec3(-.95, .12, .28))), 0., 1.);
  vec3 ember = mix(vec3(.30, .42, .66), vec3(1., .49, .25), uPre * uPre);
  // it comes from a quarter of the sky rather than from a point in it, so the ridges in
  // front of it soften what they block instead of cutting it off
  float shdE = mix(1., shd, .5);
  night += ember * de * de * (.014 + .074 * uPre) * (1. - uDawn) * shdE;
  night += ember * pow(de, 8.) * (.010 + .055 * uPre) * (1. - uDawn) * shdE;
  // a shoulder on the highlights: a crag turned square to the moon should read as the
  // brightest thing in the frame, not as a hole burnt through it
  night /= 1. + night * .72;
  // First light is two lights of opposite colour, and that is the whole of why a sunrise on
  // a range looks like this and not like a brown lamp. The sun has come the long way round
  // through the air and arrives pink-gold; everything it has not reached is lit only by the
  // sky, and the sky before the sun is properly up is blue-violet. Warm faces against cold
  // shadow. Painting the shadows warm too - one light, one hue - is what turned this frame
  // into mud, and no amount of contrast laid on top of that fixes it.
  // The scree and the grain go into the sun term, not onto the colour, so the lit flanks
  // keep the texture the moon was finding in them an hour earlier. It multiplies the light
  // instead of adding to it: added, every positive grain of noise on a face the sun cannot
  // see lights up on its own, and a shaded flank comes out mottled like damp plaster.
  float ddg = clamp(dd * (1. + grain * .30), 0., 1.);
  float lit = ddg * sun * shd;
  // The sun is not the only warm thing in the sky at this hour: there is a bright aureole
  // of air round it, a good thirty degrees across, and a slope turned part of the way
  // towards it picks that up. It is what keeps the half-lit faces from falling straight off
  // a hard terminator into blue, and it is why a photograph of a sunrise has a broad warm
  // side to every ridge rather than a bright edge and nothing.
  // A ridge in the way blocks the disc long before it blocks thirty degrees of sky, so the
  // aureole only half goes out in a cast shadow. It must stop doing even that where the
  // march was never run: ground turned from the light returns shd = 1 without marching, so
  // the shadow's share of the aureole is faded in with the same geometry that decides
  // whether to march at all, and nothing steps where a terminator crosses a cast shadow.
  float lf = smoothstep(0., .06, max(dn, dd));
  float aur = pow(clamp(dot(n, sunD) * .56 + .44, 0., 1.), 2.4) * sun * mix(1., mix(.45, 1., shd), lf);
  // How much of the warm light has got to this piece of ground: the sun itself, and the
  // aureole of air round it that reaches a flank the sun has not quite turned on to yet.
  // The ground's own colour is mixed from both, so everything drawn over the ground has to
  // be mixed from both as well - the contours, the rock grey, the catchlight on a fold, the
  // wash on the highest ground. Keyed to the direct sun alone, a flank the aureole has
  // warmed to orange comes out wearing cold grey lines, which is this file's old mint-lace
  // fault in another key. It is also what puts the first warmth on the summit: the crown of
  // Śnieżka is turned away from the sun, but it is high, convex and open to the whole of
  // that bright quarter of sky, and it comes up warm a long time before the face below it.
  float reach = clamp(lit * 1.5 + aur * .6, 0., 1.);
  // the sun reddens hardest when it is lowest: the faces it finds first are pink, and the
  // same faces are gold ten minutes later
  vec3 sunCol = mix(vec3(1., .34, .18), vec3(1., .64, .40), smoothstep(.28, 1.7, uDawn));
  // What the light is falling on. Heather, grass, scree and bare granite: even where it is
  // brightest this ground is a dark warm grey, and lighting it as though its albedo were
  // one is what brought the lit flanks up to the top of the scale - a range in cream and
  // blue, which is a glacier in the Alps and not the Karkonosze in October.
  vec3 albD = mix(vec3(.50, .44, .38), vec3(.58, .54, .50), alt);
  // what the open sky gives a slope in shadow - more of it the higher and the flatter the
  // ground, and under it the cold the valleys hold until the sun gets down into them.
  // High ground is not only given more of that light, it is given warmer light: a summit
  // sees the whole eastern quarter of the sky and that quarter is already salmon, while down
  // in the basin the range itself still holds it out. It is why the crown of a mountain is
  // lilac a long while before any of it is in the sun, and why the valley under it is blue.
  vec3 shadeD = mix(vec3(.046, .050, .100), mix(vec3(.074, .086, .150), vec3(.112, .082, .136), sun), alt);
  vec3 dawn = shadeD * (.34 + .78 * sky) + vec3(.036, .042, .062) * fill
    + albD * sunCol * (lit * 1.15 + pow(lit, 3.) * .28 + aur * .20);
  vec3 col = mix(night, dawn, uDawn);
  col *= 1. + curv * mix(.58, .42, uDawn);
  // the catchlight on a convex fold takes the colour of whatever light is reaching it: the
  // sun on a lit spur, the sky on one in shadow, and in between the aureole - which is why
  // at first light the tops of things come up warm before their sides do
  col += mix(vec3(.030, .046, .062) * (.2 + form), mix(vec3(.032, .042, .066), sunCol * .128, reach), uDawn)
    * max(curv, 0.) * .55;
  // light spilling out of the valleys, the way a town lifts its own sky
  col += mix(vec3(1., .74, .46), vec3(.65, .52, .5), uDawn) * a.b * uLit.z * .18 * (1. - alt * .72);

  // contours: 50 m apart, every fifth (250 m) heavier - the intervals a walking map uses.
  // Close in, the 25 m lines fade up between them: the line density then does the texturing
  // a 30 m heightmap cannot, instead of advertising how smooth the surface is.
  float f = h / .875;
  // crowded lines are dropped, and harder at dawn: on a shaded headwall a cluster of them
  // goes pale against a warm range and reads as a tear in the picture instead of as rock
  float dens = clamp(1.3 - fwidth(f) * (.8 + uDawn * 1.3), 0., 1.);
  // at night the lines are drawn finer: the moon is doing the describing and a heavy ring
  // every fifty metres only corrugates the slope it is meant to explain
  float minor = iso(f, mix(.56, .85, uDawn)) * dens;
  float fine = uFine * iso(f * 2., mix(.52, .8, uDawn)) * clamp(1.25 - fwidth(f * 2.) * .8, 0., 1.);
  float major = iso(f / 5., mix(.72, .95, uDawn)) * clamp(1.35 - fwidth(f / 5.) * (.5 + uDawn * 3.4), 0., 1.);
  // the soft band around an index line is dropped where the lines crowd, or a headwall
  // turns into a pale wash instead of rock
  float halo = iso(f / 5., 4.5) * mix(.030, .085, uDawn) * clamp(1.3 - fwidth(f / 5.) * 1.7, 0., 1.);
  // the lines take the light with the ground, and at night they take it completely: a face
  // the moon has left goes dark and keeps no drawing at all, so the relief is what carries
  // the picture and the contours only sharpen what the light has already said. They fade
  // with distance too, into the haze, instead of ruling the far ridge as hard as the near one.
  // keyed off the raw light rather than the carved form: a shaded flank keeps a trace of its
  // drawing - it is still a survey sheet - while a moonlit face is three or four times as
  // strongly ruled, which is what stops the massif reading as corrugated plastic
  float lamp = uLampOn * smoothstep(14., 0., distance(vW.xz, uLamp.xz));
  // the survey lamp brings the drawing back where it is held, even on a face the moon has
  // left - that is what a lamp held over a sheet does, and it is the one way to read the
  // contours in a shadowed cirque
  float inkLit = clamp(reach + lamp, 0., 1.);
  float inkNight = (.15 + 1.05 * pow(dn, 1.2) * shdN + lamp * .62) * (.42 + .58 * smoothstep(250., 58., dist));
  // and at dawn the line follows the ground down into cast shadow with it. The weight was
  // levelled when a shadowed flank at dawn was still bronze-bright; under cast shadows that
  // ground is five times darker, and a contour held at full strength over it stops
  // describing rock and becomes wire laid over a cone - worst of all on Śnieżka, which is
  // the one thing this whole film climbs to. In shadow it keeps a quiet tracery, because it
  // is still a survey sheet; in the sun it keeps every bit of its weight.
  float ink = (.58 + .72 * alt) * mix(inkNight, (.5 + .85 * lit) * mix(.35, 1., inkLit), uDawn) * (1. - quiet * .82);
  float warm = min(a.r * uLit.x, 1.), cool = min(a.g * uLit.y, 1.);
  // at first light the ink goes over to the warm ramp early and completely: a residual cool
  // term on a crowded headwall reads as a tear in the picture, not as shadowed rock
  float dw = smoothstep(0., .5, uDawn);
  vec3 lc = mix(mix(vec3(.50, .60, .74), vec3(.62, .60, .66), uPre * uPre * .8), vec3(.86, .94, 1.), lamp);
  lc = mix(lc, vec3(1., .74, .44), smoothstep(.03, .8, warm) * .95);
  lc = mix(lc, vec3(.76, .88, 1.), smoothstep(.03, .75, cool - warm) * .9);
  // At first light the ink is lit by the same sun as the ground it is drawn on, and it has
  // to be warmer than that ground, not merely warm: the land goes to R/B near 1.9, and ink
  // at 1.5 laid over it reads as mint lace - which is what a crowded headwall wore in the
  // frame this whole film ends on.
  // and it is lit by whichever of the two lights has got to that piece of ground: warm ink
  // on a sunlit flank, and on one still in shadow the same blue the ground itself has gone,
  // because a copper line ruled across cold rock reads as rust, not as a contour.
  lc = mix(lc, mix(vec3(.58, .69, .92), vec3(1., .67, .42), inkLit) * (.52 + .72 * inkLit), dw);
  float pulse = 1. + uBeat * .9;
  // the pools brighten the fine rings but barely the heavy fifth line, so a shelter is not
  // outshone by the lasso around it; and they favour level ground, so a lamp above a drop
  // lights a slope instead of flaring its crowded contours into a fan of stripes
  float wo = (warm + cool * .8) * (.25 + .75 * (1. - smoothstep(1.6, 3.2, slope)));
  // The ground round a lit shelter. Two terms: the hot patch the windows throw on the
  // stones just outside them, cubed so it has no rim of its own, and over a much wider
  // radius the soft wash that is actually what you read from a mile off - a hut at night is
  // a light with a piece of the mountain lit under it. Level ground keeps more of the wash
  // than a drop does, so the light lies where it would lie.
  col += vec3(1., .40, .11) * warm * warm * warm * .118 * reveal;
  col += vec3(1., .50, .20) * warm * warm * (1. - .52 * smoothstep(1.7, 3.5, slope)) * .058 * reveal;
  // The ink can only be as bright as the ground will take. At dawn a lit flank is already
  // near the top of the scale, and a contour laid on at full weight runs all three channels
  // through the ceiling at once - which is white. On a crowded headwall, where minor, fine
  // and major all land together, that is how a copper range ends up wearing mint lace.
  float head = clamp(1.04 - max(col.r, max(col.g, col.b)), 0., 1.);
  float inkK = mix(1., .30 + .70 * head, dw);
  col += lc * inkK * ((minor * mix(.84, 1., uDawn) + fine * .62) * ink * (.52 + .5 * lamp + .55 * wo) + major * ink * (.60 + .45 * lamp + .18 * wo) * pulse
    + halo * ink * (1. - uDawn * .55) * (.5 + lamp + .3 * wo) * pulse) * reveal * uGain;
  // steep ground reads as rock: a cool grey, so a headwall is stone and not an absence - but
  // at night only where the moon reaches it, or every crag in the range glows the same grey
  col += mix(vec3(.085, .100, .125) * (.12 + 1.15 * form), mix(vec3(.050, .060, .082), vec3(.150, .104, .080), reach), uDawn)
    * smoothstep(1.8, 3.3, slope) * reveal;
  // the highest ground keeps a little starlight on it, and takes the sun first - but only
  // the part of it the light has actually got to: a summit crest warm along its crown with
  // the hollow behind it still cold is the whole of what first light looks like. The last
  // two hundred metres of Śnieżka are where this lands, and it is what puts the warmth on
  // the summit rocks under the observatory while the face below them is still out of it.
  col += mix(vec3(.040, .062, .088) * (.35 + .85 * form), mix(vec3(.048, .060, .092), sunCol * .46, reach), uDawn)
    * smoothstep(.55, 1., alt) * .55 * reveal;

  // A crest seen edge-on with the sun behind it is lit through. The heather, the grass and
  // the scree standing on the skyline scatter the light forward past themselves, so the very
  // edge of a ridge comes up warm while the whole face below it is still in shadow - on a
  // backlit slope it is the only warm thing there is, and it is what draws the crest of this
  // range at the moment the sun clears the horizon. Only where the ridge actually stands
  // between the eye and the sun, and only where the light reaches the crest at all.
  // Kept deliberately tight and deliberately small. It is driven by the view and not by
  // the sun's own geometry, so a loose exponent spreads it over the whole of a face that
  // merely happens to lie near grazing, and that is rim light off a game engine, not a
  // crest. At the seventh power it is the last few pixels of a skyline and nothing else.
  float edgeOn = pow(1. - abs(dot(n, normalize(uCam - vW))), 7.);
  col += sunCol * edgeOn * pow(towardSun(vW.xz - uCam.xz), 3.) * sun * shd * .20 * uDawn * reveal;

  // the graticule, every second arcminute of real longitude and latitude
  vec2 g = vec2(469.2 - vW.x / 9.52063, 1524.0075 + vW.z / 14.96395);
  col += mix(vec3(.80, .86, .96), vec3(.93, .9, .84), uDawn) * max(iso(g.x, .8), iso(g.y, .8))
    * mix(.040, .055, uDawn) * reveal * (1. - quiet * .8);

  // the water takes the contours off the ground it covers; its surface is drawn over this
  float wet = smoothstep(.3, .7, a.a);
  col = mix(col, mix(vec3(.018, .038, .066), vec3(.062, .068, .098), dw), wet * .95 * reveal);

  // aerial perspective: the air between one ridge and the next, cold and a shade under the
  // horizon sky so a far crest reads against it instead of dissolving into it.
  // At dawn that air is lit, and lit from one side: look into the sun and the haze standing
  // between the ridges glows; turn ninety degrees and the same haze is the cold the valleys
  // are still holding. It is most of what makes a photograph of a sunrise read as a sunrise
  // rather than as an orange filter laid over a grey morning.
  col = mix(col, mix(vec3(.040, .064, .102), airAt(towardSun(vW.xz - uCam.xz)), uDawn),
    smoothstep(mix(46., 75., uDawn), mix(236., 255., uDawn), dist) * (.74 - uDawn * .36));
  // A shoulder on the whole sheet. First light on a flank square to the sun is the
  // brightest thing on this map and it should come up to the top of the scale, not go
  // through it: without this the red channel pins across half the range at the last stop,
  // every hue up there collapses to white, and a contour or a stream drawn over it has
  // nowhere left to go, so the line work reads as cold lace on warm ground.
  // It is taken off the brightest channel and applied to all three together. Rolled off
  // channel by channel it eats the red first, which is the colour of the light: a flank
  // with the sun full on it came out white, and a white mountain at sunrise is a snowfield
  // at noon. This way a highlight keeps its hue all the way up and only loses intensity.
  // Below .72 nothing is touched at all. Above it the night moves a little too - a crag
  // square to the moon loses about a twentieth of its red - because the roll-off now scales
  // the three channels together where it used to take each in turn; it is the same shoulder
  // on the same highlights, and at the top of the night scale it reads as slightly cooler.
  float mx = max(col.r, max(col.g, col.b));
  float ov = max(mx - .72, 0.);
  col *= mx > 1e-4 ? 1. - (ov * ov / (ov + .30)) / mx : 1.;
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
uniform mat4 uVP; uniform vec2 uPix; uniform float uWid[8]; uniform float uWalk;
out float vArc; out float vSide; out float vW; out float vGlow; out vec3 vP;
flat out int vSty;
void main(){
  vSty = int(aSty + .5); vArc = aArc; vSide = aSide; vGlow = aGlow; vP = aPos;
  vW = uWid[vSty];
  // the crest trail the finale has walked is drawn heavier, and heaviest at its head
  if (vSty == 6 && uWalk > .01) {
    float wk = 1. - smoothstep(uWalk - 1., uWalk + .3, aArc), hd = exp(-(aArc - uWalk) * (aArc - uWalk) / 1.6);
    vW *= 1. + wk * .35 + hd * 1.4;
  }
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
uniform float uWalk;   // how far along the crest trail the finale has come
uniform vec4 uPanel; uniform float uPanelK;
uniform vec4 uShore;    // the one shelter that stands on a shore: x, z, how brightly it burns
uniform vec4 uShoreD;   // and the way its light lies out over the water, from here
uniform float uT;
out vec4 o;
${DAWNAIR}
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
    // looking down into it there is nothing to see; it is only where the sky skims off the
    // surface that a tarn lights up at all, and that is what makes it water and not a plate
    c = mix(c, vec3(.125, .185, .250) * rip, clamp(.10 + fres * .86, 0., 1.));
    c += vec3(1., .45, .16) * vGlow * vGlow * uWarm * (.34 + fres * .9);
    // Samotnia stands on the shore of Mały Staw, and on a still night its windows lie out
    // across the water towards whoever is looking: not a wash over the surface but a column
    // that broadens as it comes, cut into bars by the ripple, and never quite still.
    vec2 toC = uShoreD.xy;
    vec2 rel = vP.xz - uShore.xy;
    float along = dot(rel, toC), across = dot(rel, vec2(-toC.y, toC.x));
    float wid = .026 + .135 * max(along, 0.);
    // it has to die out well before the far shore, or the column ends where the lake's
    // outline ends and the whole thing reads as an orange wedge cut to fit a polygon
    float lane = exp(-(across * across) / (wid * wid)) * exp(-max(along, 0.) * 2.45) * smoothstep(-.10, .03, along);
    float trem = .20 + .80 * abs(sin(along * 34. - uT * 2.1 + sin(across * 15. + uT * .8)));
    c += vec3(1., .52, .24) * lane * trem * uShore.z * uWarm * (1.15 + fres * 2.1);
    a *= 1. - vGlow * .2;
  } else {
    float wk = 0., hd = 0.;
    if (vSty == 6 && uWalk > .01) { wk = 1. - smoothstep(uWalk - 1., uWalk + .3, vArc); hd = exp(-(vArc - uWalk) * (vArc - uWalk) / 1.6); }
    a *= clamp((1. - abs(vSide)) * vW, 0., 1.);
    // only the crest route is dashed. Two waymarked paths that share a route were drawn in
    // step, so their dashes interleaved and read as a glitch; the rest are drawn thin and
    // whole. The dash grows with distance, so a near path and a far one keep one cadence.
    if (vSty == 6) { float ph = fract(vArc / (1.6 + d * .016)); a *= mix(smoothstep(.34, .46, ph) * (1. - smoothstep(.86, .96, ph)), 1., wk); }
    if (vSty == 3) c = mix(c, vec3(1., .78, .5), vGlow * uWarm * .7);
  }
  // at dawn the line work takes the light too: it keeps its weight and loses its colour,
  // or a blue stream sits in a warm range like a scratch
  float dw = smoothstep(0., .5, uDawn);
  float lum = dot(c, vec3(.3, .59, .11));
  c = mix(c, vec3(lum) * vec3(1.35, 1., .72) + vec3(.05, .03, .02), dw);
  // what has been walked keeps a warm line of its own to the summit, and its head is a light
  if (vSty == 6 && uWalk > .01) {
    float wk = 1. - smoothstep(uWalk - 1., uWalk + .3, vArc), hd = exp(-(vArc - uWalk) * (vArc - uWalk) / 1.6);
    c = mix(c, vec3(1., .74, .44), wk * .80) + vec3(1., .66, .36) * hd * .80;
    a = min(1., a * (1. + wk * .6 + hd * 1.2));
  }
  a *= smoothstep(vP.y - 1.6, vP.y, uReveal);
  c = mix(c, mix(vec3(.040, .064, .102), airAt(towardSun(vP.xz - uCam.xz)), uDawn),
    smoothstep(mix(46., 75., uDawn), mix(236., 255., uDawn), d) * (.74 - uDawn * .36));
  vec2 u = vec2((vP.x + 60.) / 120., (45. - vP.z) / 90.);
  a *= smoothstep(0., .085, min(min(u.x, 1. - u.x), min(u.y, 1. - u.y)));
  if (uPanelK > 0.) a *= 1. - uPanelK * .75 * (1. - smoothstep(0., 110.,
    max(0., max(max(uPanel.x - gl_FragCoord.x, gl_FragCoord.x - uPanel.z), max(uPanel.y - gl_FragCoord.y, gl_FragCoord.y - uPanel.w)))));
  o = vec4(c * a, a);
}`;
// every light and every built mark on the map, as one buffer and one draw call:
// 0 a walker's headlamp, 1 a shelter window, 2 a station window, 3 the mast beacon,
// 4 a light in a valley town, 5 the city beyond the north edge, then the drawn marks -
// 6 a shelter, 7 a smaller shelter, 8 the observatory on Śnieżka, 9 the relay mast - and
// 10 a puff of chimney smoke. The marks keep a size in pixels, so a hut stays a hut
// however far away the camera stands. aQ carries a puff's age, 0 for everything else.
const PVS = `#version 300 es
in vec3 aPos; in float aA; in float aK; in float aQ; uniform mat4 uVP; uniform vec3 uScale; uniform vec3 uCamP;
out float vA; out float vK; out float vPx; out float vNear; out float vQ; out float vHut;
const float SZ[11] = float[11](.52, .95, .8, 1.5, .78, 9., 3.1, 2.3, 3.0, 3.2, 1.55);
const float MN[11] = float[11](0., 0., 0., 7., 0., 0., 15., 11., 13., 14., 3.);
// The halo is held to about twice the building it stands round. Wider than that and the
// hut reads as a hat on a ball - a small dark glyph marooned in the middle of a lantern -
// which is the one thing a schronisko never looks like from the valley.
const float MX[11] = float[11](6.5, 13., 8., 17., 8., 54., 70., 52., 42., 46., 26.);
// The range over which a mark stops being only a light. Far off, a shelter is what you
// really see from the basin: a window burning, with the air glowing round it. Closer in,
// the roof comes up as a shape in front of its own glow - never a lit model, just the
// gable standing dark on its cushion of light. The observatory and the relay keep their
// drawn outlines: those two shapes are the reason anyone looks up at that rim at all.
// A puff of smoke uses the same pair as a fade, so it only shows where it could be seen.
const float NF[11] = float[11](1., 1., 1., 1., 1., 1., 86., 78., 88., 88., 104.);
const float NN[11] = float[11](0., 0., 0., 0., 0., 0., 48., 42., 44., 44., 50.);
void main(){ vK = aK; vA = aA; vQ = aQ;
  int k = int(aK + .5);
  // A hut's point is the foot of its walls, on the ground. It is nudged half a unit along the
  // line of sight, which leaves it exactly where it was on screen but in front of the slope it
  // stands on, so the hillside never cuts into the building and the building never floats.
  vec3 P = aPos;
  if (k >= 6 && k <= 9) P += normalize(uCamP - aPos) * .55;
  vec4 c = uVP * vec4(P, 1.); gl_Position = c;
  vNear = smoothstep(NF[k], NN[k], max(c.w, .1));
  // A shelter's halo opens out as the camera closes in - far more than perspective alone
  // would give it. That is honest: the glow in the air round a hut is hundreds of metres
  // wide and only resolves into air when you are near enough for it to have any size.
  float sz = SZ[k] * (k == 6 || k == 7 ? 1. + .80 * vNear : k == 10 ? .50 + 1.25 * aQ : 1.);
  float px = clamp(sz * uScale.x / max(c.w, .1), MN[k] * uScale.y, MX[k] * uScale.y * uScale.z);
  // The relay keeps a size in the world, with its foot on the rim, so it stands on the land
  // and not over it. The limits keep it legible far off and from turning into a model close in.
  float hutPx = 0.;
  if (k == 9) {
    hutPx = clamp(2.4 * uScale.x / max(c.w, .1), 12. * uScale.y, 58. * uScale.y * uScale.z);
    px = max(px, hutPx * 1.62);                        // the mast is tall: it needs the room
  }
  gl_PointSize = vPx = px;
  vHut = k == 9 ? clamp(hutPx / max(vPx, 1.), .10, .617) : .3; }`;
const PFS = `#version 300 es
precision mediump float;
in float vA; in float vK; in float vPx; in float vNear; in float vQ; in float vHut;
uniform float uDawn; uniform float uDpr; uniform vec2 uMoonS;   // the moon, in screen pixels
uniform int uPass;   // 0: the relay, solid, over the land; 1: every light, added
out vec4 o;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
float box(vec2 p, vec2 b){ vec2 d = abs(p) - b; return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
vec3 warmth(vec3 c){ return mix(c, vec3(dot(c, vec3(.34))) * vec3(1.3, 1., .74), uDawn * .9); }
void main(){
  vec2 q = gl_PointCoord - .5;                      // -.5 .. .5, y downwards
  float r = length(q);
  int k = int(vK + .5);
  // A point sprite is a square and every halo in here is round. The window that keeps the
  // light inside the sprite has to be round too: a Chebyshev window - max(|x|,|y|) - has a
  // square for its iso-contour, so cutting a round glow with it draws a box in light
  // instead of removing one. That is what Śnieżka wore in the hero.
  float edge = 1. - smoothstep(.38, .50, r);
  // the solid pass draws only the huts themselves; everything else is light
  if (uPass == 0 && k != 9) discard;
  if (k == 10) {
    // Chimney smoke. One soft puff, raked cool by the moon on the side the moon is on and
    // warm underneath from the window it has just left: the only thing in this picture lit
    // by both lights at once, which is the whole reason to draw it.
    float s = 1. - smoothstep(0., .5, r); s *= s * s;
    float side = .34 + .66 * clamp(.5 + .5 * dot(q / max(r, 1e-4), uMoonS), 0., 1.);
    float under = smoothstep(-.06, .44, q.y) * (1. - vQ) * (1. - vQ);
    vec3 c = warmth(vec3(.58, .63, .72) * side * s + vec3(1., .52, .22) * under * s * .90) * vNear * edge;
    o = vec4(c * vA, max(c.r, max(c.g, c.b)) * vA); return;
  }
  if (k < 6) {
    float a = smoothstep(.5, 0., r); a *= k == 5 ? a * a * 1.6 : a;
    vec3 c = a * (k == 5 ? vec3(1., .72, .45) : k == 4 ? vec3(1., .78, .5) : k == 3 ? vec3(1., .3, .16)
      : k == 2 ? vec3(.79, .89, 1.) : k == 1 ? vec3(1., .69, .35) : vec3(.86, .95, 1.));
    // the beacon: a hot core and the red bloom the air puts round it, so one slow light
    // sits above the crest and is read as a light and not as a dot
    if (k == 3) c += vec3(1., .27, .12) * smoothstep(.21, 0., r) * 1.35 + vec3(.95, .17, .07) * exp(-r * r * 8.) * .55;
    c = warmth(c) * edge;          // at first light nothing stays cool, not even a headlamp
    o = vec4(c * vA, max(c.r, max(c.g, c.b)) * vA); return;
  }
  if (k == 6 || k == 7 || k == 8) {
    // The light a building puts in the air round it. The building itself is drawn as a
    // building; from the basin this glow is all of a hut there is, close in it is a warmth
    // lying round the walls - the stencil keeps it off them. The observatory's is cool.
    if (uPass == 0) discard;
    float big = 1. - vNear;
    float fall = 1. - smoothstep(0., .50, r), f2 = fall * fall, core = smoothstep(.16, 0., r);
    vec3 c = k == 8 ? vec3(.80, .89, 1.) * (core * .55 * big + f2 * fall * (.30 + .40 * big)) + vec3(.42, .62, .9) * f2 * .16
      : vec3(1., .80, .52) * core * 1.15 * big + vec3(1., .72, .36) * f2 * fall * (.26 + .40 * big) + vec3(1., .54, .22) * f2 * (.14 + .04 * big);
    c /= 1. + c * .62;
    if (k != 8) c *= 1. + (vQ - 1.) * .7;               // the stove's breath reaches the air too
    // and once the sun is on the range it goes: a lit window still reads at first light,
    // the halo of air round it does not - there is nothing left for it to stand out of, and
    // held on through the dawn it lies over the slope behind as a grey veil
    c *= 1. - uDawn * .78;
    c = warmth(c) * edge;
    o = vec4(c * vA, max(c.r, max(c.g, c.b)) * vA); return;
  }
  // The two instruments on the crest. The same language as the huts, not line art: a cool
  // glow in the air and the thing itself standing dark inside it, with the one edge the
  // moon finds on steel. The strokes are held at a width in CSS pixels rather than device
  // pixels, so a sharp screen gets a finer line and not a crisper drawing.
  // The drawing stands on the sprite's centre, which is the ground: its own units are the
  // sprite's divided by the share of it the building takes, with the foot at the middle.
  float hv = vHut;
  vec2 qd = q / hv + vec2(0., .30);
  float px = uDpr / max(vPx * hv, 8.);
  float d, win;
  vec3 ink = vec3(.84, .93, 1.), lit = vec3(.9, .96, 1.), glow = vec3(.42, .62, .9);
  {                                             // the relay: a tapering mast, the hut beside it
    lit = vec3(.86, .94, 1.);
    float t = clamp((.30 - qd.y) / .76, 0., 1.);
    d = min(seg(qd, vec2(0., .30), vec2(0., -.46)) - mix(.046, .006, t * t),
            box(qd - vec2(.235, .225), vec2(.135, .072)));
    win = 1. - smoothstep(.014, .036, box(qd - vec2(.262, .212), vec2(.034, .016)));
  }
  float sil = (1. - smoothstep(-px * .6, px * .9, d)) * vNear;
  if (uPass == 0) {
    // the thing itself, solid: dark steel and concrete, with the one edge the moon finds on
    // it at night and the sun at dawn, and a little shadow where it meets the rock
    float rim = 1. - smoothstep(px * .5, px * 3.2, -d);
    vec3 body = vec3(.024, .028, .036) + mix(vec3(.50, .60, .78) * .30, vec3(1., .70, .46) * .55, uDawn) * rim;
    vec2 cq = vec2(qd.x / .34, (qd.y - .30) / .045);
    float contact = exp(-dot(cq, cq)) * vNear * .5;
    float a = sil * clamp(.55 + vA + uDawn, 0., 1.);
    o = vec4(warmth(body) * a, a + contact * (1. - a));
    return;
  }
  // the air round it is centred on the building, not on its foot
  float lift = .38 * hv;
  r = length(q + vec2(0., lift)) * .5 / (.5 - lift);
  float far = 1. - vNear;
  // every glow here is round and every one of them reaches zero at the sprite's edge of its
  // own accord, so nothing has to be cut off at a boundary and nothing wears a box
  float fall = 1. - smoothstep(0., .50, r), f2 = fall * fall;
  float core = smoothstep(.20, 0., r), air = f2 * fall, haze = f2;
  vec3 c = vec3(.80, .89, 1.) * (core * (.34 + .80 * far) + air * (.80 + .40 * far))
    + glow * haze * (.18 + .30 * vNear);
  c *= 1. - sil * .97;                            // it stands in its own light, not on it
  c += lit * win * .95 * vNear * (1. - uDawn * .6);
  c *= 1. - uDawn * .70;                          // as with the huts: the air stops glowing
  c /= 1. + c * .62;
  c = warmth(c) * edge;
  o = vec4(c * vA, max(c.r, max(c.g, c.b)) * vA); }`;

// The shelters' buildings, wing by wing, in the land's own units: each wing's centre, the
// way its ridge runs and the way across it, its half-length and half-width in metres, its
// storeys, and its scale. The bake levels a terrace under each wing; the mesh stands on it.
// About seven times life size, so a hut reads as a building from a kilometre off and the
// big ones stay bigger than the small.
const BK = .027;                                     // world units to a metre of building
function wingsOf(s) {
  const b = s.b;
  if (!b) return [];
  const ca = Math.cos(b.a), sa = Math.sin(b.a);
  // a small hut is held to a size that still reads as a building
  const m = BK * Math.max(1, 22 / Math.max(...b.w.map(w => 2 * Math.max(w[2], w[3]))));
  const Uw = [-ca, sa], Vw = [sa, ca];               // its own axes on the land: east is -x, north is +z
  return b.w.map(([cu, cv, hu, hv, lv]) => {
    const alongU = hu >= hv;
    return { x: b.x - (cu * ca - cv * sa) * m, z: b.z + (cu * sa + cv * ca) * m, A: alongU ? Uw : Vw, B: alongU ? Vw : [-Uw[0], -Uw[1]],
      ha: alongU ? hu : hv, hb: alongU ? hv : hu, lv, m };
  });
}

// ---------------- the buildings ----------------
// Every shelter is drawn as its own building: the real footprint from the survey, cut into
// wings, each with its storeys and its roof. What the walls and the light they throw on the
// ground have to agree on is which windows are burning, so that is written once, here.
const WIN = `
${DAWNAIR}
float hh(vec4 p){ p = fract(p * vec4(.1031, .1030, .0973, .1099)); p += dot(p, p.wzxy + 33.33); return fract((p.x + p.y) * p.z + p.w); }
// how a wall of this finish is windowed: the spacing, and half a pane's width
vec2 winSpec(float tone){ return tone > 1.5 ? vec2(3.1, .85) : tone > .5 ? vec2(2.3, .55) : vec2(2.7, .60); }
// which column of windows a point along a wall falls in, and how far it is from that
// column's centre; -1 past the last one. The row is centred, a metre clear of each corner.
vec2 winCol(float u, float hl, float P){
  float n = max(1., floor((2. * hl - 2.2) / P));
  float c = floor((u + n * P * .5) / P);
  return vec2(c >= 0. && c < n ? c : -1., u + n * P * .5 - (c + .5) * P);
}
// Whether one window is burning. Some rooms are empty. Each lit one comes on at its own
// moment as the hut wakes and goes out at its own moment as the day reaches it, and a few
// hold on through the dawn; now and then one goes dark for a while and comes back.
float winLit(float hut, float face, float s, float c, vec4 H, float lv, float t){
  float h1 = hh(vec4(hut, face, s, c)), h2 = hh(vec4(c + 3.1, hut + 7., face, s)), h3 = hh(vec4(s, c, hut + 3., face + 5.));
  float p = s < .5 ? .86 : s > lv - .5 ? .46 : .64;
  float lit = step(h1, p) * step(h2 * .92, H.x);
  lit *= 1. - step(h3 * 1.15, H.y) * step(h3, .82);
  lit *= step(.035, fract(h2 * 7.31 + h3 + t / 67.));
  return lit;
}
// a room's own light: most of them lamp-warm, a few behind a red curtain
vec3 winTint(float hut, float face, float s, float c){
  float h = hh(vec4(face + 2., s + 9., c, hut));
  return h < .16 ? vec3(1., .46, .20) * .62 : mix(vec3(1., .62, .31), vec3(1., .80, .54), h);
}
// the fog and the dawn of the land, so a building sits in the same air as its hillside -
// and the wall knows which way it is being looked at, so a hut a mile off fades into the
// lit air on the sun's side and into the cold away from it, exactly as its own slope does
vec3 airOf(float d, float dawn, vec2 vdir){ return mix(vec3(.040, .064, .102), airAt(towardSun(vdir)), dawn); }
float fogOf(float d, float dawn){ return smoothstep(mix(46., 75., dawn), mix(236., 255., dawn), d) * (.74 - dawn * .36); }
float quietOf(vec4 P, float K){
  return K <= 0. ? 0. : K * (1. - smoothstep(0., 110., max(0., max(max(P.x - gl_FragCoord.x, gl_FragCoord.x - P.z), max(P.y - gl_FragCoord.y, gl_FragCoord.y - P.w)))));
}`;
const BVS = `#version 300 es
precision highp float;
in vec3 aPos; in vec3 aNrm; in vec2 aUv; in vec4 aInf; in vec3 aFt;
uniform mat4 uVP;
out vec3 vP; out vec3 vN; out vec2 vUv; flat out vec4 vInf; flat out vec3 vFt;
void main(){ vP = aPos; vN = aNrm; vUv = aUv; vInf = aInf; vFt = aFt; gl_Position = uVP * vec4(aPos, 1.); }`;
// aInf: the face's half-length in metres (a roof's slope length; the observatory's glazing),
// the material, the hut, its storeys. aFt: which face, the finish (render 0, timber 1,
// concrete 2, the observatory 3, plus 4 for a red roof), and one more number a face needs.
const BFS = `#version 300 es
precision highp float;
in vec3 vP; in vec3 vN; in vec2 vUv; flat in vec4 vInf; flat in vec3 vFt;
uniform vec3 uMoon; uniform float uDawn; uniform float uPre; uniform vec3 uCam; uniform float uT;
uniform float uReveal; uniform vec4 uHut[24]; uniform vec4 uPanel; uniform float uPanelK;
uniform sampler2D uMap; uniform vec4 uRect; uniform float uTop;   // the land, for the shadow it throws
out vec4 o;
${WIN}
${SHADOW}
void main(){
  int mat = int(vInf.y + .5), hut = int(vInf.z + .5);
  float hl = vInf.x, lv = vInf.w, fh = vInf.z, face = vFt.x;
  float tone = mod(vFt.y, 4.), red = step(3.5, vFt.y);
  vec4 H = uHut[hut];
  vec3 N = normalize(vN), V = normalize(uCam - vP);
  float u = vUv.x, v = vUv.y;
  float px = max(max(fwidth(u), fwidth(v)), 1e-4);      // how many metres one pixel holds here
  float top = lv * 3. + .4;
  vec3 alb = vec3(.2), em = vec3(0.);
  float gloss = 0.;
  if (mat <= 1) {
    // the finish: pale render; dark boarding over a rendered ground floor; or concrete
    if (tone < .5) alb = vec3(.54, .52, .49);
    else if (tone < 1.5) alb = v < 3.1 ? vec3(.40, .38, .35)
      : vec3(.20, .15, .11) * (.80 + .20 * mix(1., smoothstep(0., .05 + px, abs(fract(u / .34) - .5) * .34), smoothstep(.09, .03, px)));
    else alb = vec3(.40, .41, .43) * (.90 + .10 * mix(1., smoothstep(0., .05 + px, abs(fract(v / 3.) - .5) * 3.), smoothstep(.12, .04, px)));
    // under the ground floor, where the slope falls away: the stone the house stands on
    if (v < 0.) alb = vec3(.25, .24, .23) * (.80 + .20 * hh(vec4(floor(u / 1.2 + floor(v / .55) * .5), floor(v / .55), fh, 1.)));
    vec2 ws = winSpec(tone);
    float P = ws.x, hw = ws.y, s = floor(v / 3.), y = v - s * 3., span = hl;
    float cy = 1.65, ch = .72;                            // a pane's centre and half-height
    bool row = v > .2 && s < lv;
    if (mat == 1 && v > top) {
      // the gable: a row of attic windows in the triangle under the roof
      float rise = min(hl * 1.05, 9.);
      s = lv; y = v - top; cy = 1.45; ch = .55;
      span = hl * (1. - 2.4 / rise) - .3;
      row = span > 1.3;
    }
    vec2 cx = winCol(u, max(span, 0.), P);
    float detail = smoothstep(2.2, 4.5, P / px);          // a window has to be wide enough to draw
    if (row && cx.x >= 0.) {
      float d = max(abs(cx.y) - hw, abs(y - cy) - ch), aa = px * .8;
      float pane = 1. - smoothstep(-aa, aa, d);
      float lit = winLit(fh, face, s, cx.x, H, lv, uT);
      vec3 tint = winTint(fh, face, s, cx.x);
      // the glazing bars, where there is room to see them
      float bars = min(1., smoothstep(.05 + px, .025, abs(cx.y)) + smoothstep(.05 + px, .025, abs(y - cy - .22))) * smoothstep(.10, .04, px);
      float bri = s < .5 ? 1.2 * H.z : 1.;               // the room with the stove in it breathes
      em += tint * pane * lit * bri * (1. - .8 * bars) * 1.5 * detail;
      // and the light it puts on its own wall round it
      em += tint * lit * exp(-max(d, 0.) / .5) * (1. - pane) * .10 * detail;
      alb = mix(alb, vec3(.025, .032, .045), pane * (1. - lit) * detail);
      gloss = pane * (1. - lit) * detail;
    }
    // From far off a pane is smaller than a pixel, and what is left is how lit the wall is.
    float avg = .66 * (2. * hw * 2. * ch) / (P * 3.) * H.x * (1. - .8 * H.y);
    em += vec3(1., .68, .38) * avg * 1.5 * (1. - detail) * step(.2, v) * step(v, lv * 3.);
    // the door, on the front of the main wing, with its lamp
    if (face < .5) {
      float du = u + hl * .3;
      float door = (1. - smoothstep(.62, .62 + px, abs(du))) * step(0., v) * (1. - smoothstep(2.25, 2.25 + px, v));
      alb = mix(alb, vec3(.09, .065, .045), door);
      em *= 1. - door;
      vec2 lq = vec2(du, v - 2.75);
      em += vec3(1., .76, .46) * exp(-dot(lq, lq) / max(.035, px * px * 2.)) * 2.4 * H.x * (1. - .85 * H.y);
    }
  } else if (mat == 2) {
    // slate or shingle laid in courses; the red roof is the one on the saddle under Śnieżka
    alb = red > .5 ? vec3(.32, .12, .08) : vec3(.15, .155, .17);
    alb *= .82 + .18 * mix(1., smoothstep(0., .05 + px, abs(fract(v / .42) - .5) * .42), smoothstep(.12, .04, px));
    gloss = .55;
    // the ridge and the eaves catch more light than the slope between them
    alb += vec3(.08, .09, .10) * (smoothstep(.5 + px, .1, hl - v) + smoothstep(.35 + px, .05, v));
    // A few attic rooms have a window in the roof. From the basin the camera looks down on
    // the roofs more than at the walls, so this is where most of a hut's light is seen.
    float ra = vFt.z;
    if (ra > 6. && hl > 6.) {
      vec2 cx = winCol(u, ra - 1., 4.6);
      float y = v - hl * .38;
      if (cx.x >= 0.) {
        float d = max(abs(cx.y) - .48, abs(y) - .62), aa = px * .8;
        float pane = 1. - smoothstep(-aa, aa, d);
        float lit = step(hh(vec4(fh, face + 20., cx.x, 3.)), .42) * winLit(fh, face + 20., lv, cx.x, H, lv + 1., uT);
        float detail = smoothstep(2.2, 4.5, 4.6 / px);
        em += winTint(fh, face + 20., lv, cx.x) * pane * lit * 1.35 * detail;
        alb = mix(alb, vec3(.03, .035, .05), pane * (1. - lit) * detail);
        em += vec3(1., .68, .38) * .06 * H.x * (1. - .8 * H.y) * (1. - detail);
      }
    }
  } else if (mat == 3) {
    alb = vec3(.24, .23, .22) * (vFt.z > .5 ? .35 : 1.);   // the stack, and the dark of its mouth
  } else if (mat == 4) {
    // a flat roof: gravel, and the lighter coping round its edge
    float e = min(hl - abs(u), vFt.z - abs(v));
    alb = mix(vec3(.30, .30, .31), vec3(.19, .19, .20), smoothstep(.3, .6 + px, e));
  } else {
    // the observatory: pale metal discs, each with its band of glass
    alb = vec3(.56, .58, .61);
    gloss = .35;
    if (hl > .5) {
      float yb = v - vFt.z;
      float mull = smoothstep(.06 + px, .03, abs(fract(u / 1.7) - .5) * 1.7) * smoothstep(.10, .04, px);
      float pane = smoothstep(.12, .28, yb);
      float lit = step(hh(vec4(floor(u / 1.7), hl, 5., 1.)), .82) * H.x;
      vec3 tint = hl < 1.5 ? vec3(1., .70, .42) : vec3(.82, .90, 1.);
      em += tint * pane * lit * (1. - .8 * mull) * 1.25;
      alb = mix(alb, vec3(.04, .05, .07), pane * (1. - lit));
      gloss = mix(gloss, 1., pane);
    }
  }
  // The light: the same moon as the land, with the same fill and the east coming up under
  // it; and at dawn the low sun, which reaches the high buildings before the low ones.
  float alt = smoothstep(7., 22.4, vP.y);
  float dn = max(dot(N, uMoon), 0.), sky = clamp(N.y * .5 + .5, 0., 1.);
  float fill = max(dot(N, normalize(vec3(.62, .46, -.64))), 0.);
  // The same march the hillside makes, except that it starts at this wall and not at the
  // ground: a building stands up out of the terrain, so its roof and its upper storeys can
  // be in the light with its own ground floor still in the shadow of the cone above it. At
  // Dom Śląski, in under the summit, that is exactly what the morning does.
  vec3 sunD = normalize(vec3(-.95, .17, .26));
  float dd = max(dot(N, sunD), 0.);
  float shd = max(dn, dd) > .004 ? shadeAt(vP, N, normalize(mix(uMoon, sunD, uDawn)), length(vP - uCam)) : 1.;
  float shdN = mix(1., shd, .74);
  vec3 silver = mix(vec3(.34, .45, .58), vec3(.78, .88, 1.02), alt);
  // the sky, the moonlit slopes round it throwing their light back up at the walls, and the moon
  vec3 night = alb * (vec3(.075, .105, .155) * (.45 + sky) + silver * .13 * (1. - sky) + vec3(.016, .026, .044) * fill * 2.4
    + silver * pow(dn, 1.2) * 1.6 * shdN);
  // and the edge of every face against the night, which is what the eye finds first
  night += silver * pow(1. - abs(dot(N, V)), 4.) * .05;
  float de = max(dot(N, normalize(vec3(-.95, .12, .28))), 0.);
  vec3 ember = mix(vec3(.30, .42, .66), vec3(1., .49, .25), uPre * uPre);
  night += alb * ember * de * de * (.03 + .18 * uPre) * (1. - uDawn) * mix(1., shd, .5);
  night += silver * pow(max(dot(reflect(-uMoon, N), V), 0.), 16.) * gloss * .42 * shdN;   // the moon off slate and glass
  // and the sky off them, strongest where a roof is seen at a slant: what tells a roof from a wall
  night += vec3(.075, .100, .150) * (.25 + 1.2 * pow(1. - max(dot(N, V), 0.), 3.)) * gloss * step(1.5, float(mat)) * step(float(mat), 2.5);
  float sun = clamp((uDawn * 1.45 - 1.12 * (1. - alt)) / .55, 0., 1.);
  float lit = dd * sun * shd;
  // the same two lights as the hillside and the same colours: a pink-gold sun that has come
  // the long way through the air, and for everything out of its reach the blue-violet of
  // the sky. A wall in shadow at sunrise is cold, not brown.
  vec3 sunCol = mix(vec3(1., .34, .18), vec3(1., .64, .40), smoothstep(.28, 1.7, uDawn));
  // The sky a building on the summit stands in is not the sky one in the basin stands in.
  // Up there the whole eastern quarter is alight and nothing is in the way of it; down in
  // the valley the ridge holds that light out for another quarter of an hour. So the shaded
  // side of the observatory is lilac at this moment and the shaded side of a hut in the
  // woods is still blue - and the discs, which are flat plates open to all of it, take the
  // grazing sun and that lit quarter of sky together and are the first warm thing up there.
  vec3 ambD = mix(vec3(.125, .150, .250), vec3(.205, .158, .208), smoothstep(.45, 1., alt) * sun);
  vec3 day = alb * (ambD * (.40 + .60 * sky) + vec3(.075, .060, .058) * fill
      + sunCol * (lit * 1.45 + pow(clamp(dot(N, sunD) * .56 + .44, 0., 1.), 2.4) * sun * .24))
    // and off the glass: the observatory's bands and the panes of an east wall take the sun
    // as a reflection and not as a shading, which from the Silesian side is the first thing
    // on the mountain to light up
    + sunCol * pow(max(dot(reflect(-sunD, N), V), 0.), 26.) * gloss * (.55 + .85 * lit) * sun * shd
    // and a mirror does not only return the disc. The bands on the observatory give back the
    // whole lit quarter of the sky, hardest where they are seen most nearly edge-on, which
    // is why a glazed thing on a summit changes colour a good quarter of an hour before the
    // rock it stands on does - and why the three discs come up warm while the cone they
    // stand on is still in shadow.
    + sunCol * gloss * pow(1. - max(dot(N, V), 0.), 2.4) * sun * (.085 + .175 * shd);
  vec3 col = mix(night, day, uDawn);
  // the shoulder off the brightest channel and not off each in turn, as on the land: rolled
  // off channel by channel it takes the red out of the light first, and a wall with the
  // first sun full on it comes out white instead of gold
  float cmx = max(col.r, max(col.g, col.b));
  col *= cmx > 1e-4 ? 1. / (1. + cmx * .7) : 1.;
  float d = length(vP - uCam), fog = fogOf(d, uDawn);
  col = mix(col, airOf(d, uDawn, vP.xz - uCam.xz), fog);
  em *= H.w * (1. - fog * .55);
  col += em / (1. + em * .5);
  float a = smoothstep(vP.y - 1.6, vP.y, uReveal) * (1. - quietOf(uPanel, uPanelK) * .75);
  o = vec4(col * a, a);
}`;
// What the windows throw on the ground outside: a patch of light for each lit window on the
// ground floor, spreading as it goes out, a longer and fainter one from the floor above, and
// the wash of all of them together. Laid on the land round each wing and added to it.
const DVS = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aL; in vec4 aW; in vec2 aF;
uniform mat4 uVP;
out vec3 vP; out vec2 vL; flat out vec4 vW; flat out vec2 vF;
void main(){ vP = aPos; vL = aL; vW = aW; vF = aF; gl_Position = uVP * vec4(aPos, 1.); }`;
const DFS = `#version 300 es
precision highp float;
in vec3 vP; in vec2 vL; flat in vec4 vW; flat in vec2 vF;
uniform vec4 uHut[24]; uniform float uT; uniform float uDawn; uniform float uReveal; uniform vec3 uCam;
uniform vec4 uPanel; uniform float uPanelK;
out vec4 o;
${WIN}
float wallLight(float d, float t, float hl, float face, float hut, float lv, vec4 H, vec2 ws){
  if (d < 0.) return 0.;
  vec2 cx = winCol(t, hl, ws.x);
  float L = 0.;
  if (cx.x >= 0.) {
    float w0 = ws.y + d * .45;
    L += winLit(hut, face, 0., cx.x, H, lv, uT) * .62 * (1. - smoothstep(w0 - .55, w0 + 1.1, abs(cx.y))) * exp(-d / 2.8) * smoothstep(0., .9, d);
    if (lv > 1.5) {
      float w1 = ws.y + d * .30;
      L += winLit(hut, face, 1., cx.x, H, lv, uT) * .26 * (1. - smoothstep(w1 - .6, w1 + 1.2, abs(cx.y))) * exp(-d / 5.) * smoothstep(1.5, 4.5, d);
    }
  }
  return L + .22 * exp(-d / 3.2) * (1. - smoothstep(hl - 1., hl + 5., abs(t))) * H.x * (1. - .8 * H.y);
}
void main(){
  float ha = vW.x, hb = vW.y, hut = vW.z, lv = vW.w, f0 = vF.x;
  vec4 H = uHut[int(hut + .5)];
  vec2 ws = winSpec(vF.y);
  float L = wallLight(vL.y - hb, vL.x, ha, f0, hut, lv, H, ws) + wallLight(-vL.y - hb, vL.x, ha, f0 + 1., hut, lv, H, ws)
          + wallLight(vL.x - ha, vL.y, hb, f0 + 2., hut, lv, H, ws) + wallLight(-vL.x - ha, vL.y, hb, f0 + 3., hut, lv, H, ws);
  // the door lamp, on the front of the main wing
  if (f0 < .5) { vec2 dq = vec2(vL.x + ha * .3, vL.y - hb - 1.2); L += 1.1 * exp(-dot(dq, dq) / 5.) * H.x * (1. - .85 * H.y); }
  L *= 1. - smoothstep(9., 13., max(abs(vL.x) - ha, abs(vL.y) - hb));
  float d = length(vP - uCam), fog = fogOf(d, uDawn);
  float k = smoothstep(vP.y - 1.6, vP.y, uReveal) * H.w * (1. - .78 * uDawn) * (1. - fog) * (1. - quietOf(uPanel, uPanelK) * .75);
  vec3 c = vec3(1., .56, .26) * L * .62 * k;
  o = vec4(c / (1. + c * .6), 0.);
}`;

// ---------------- the fog, as a surface ----------------
// Where the top of the layer stands, shared by the two shaders that draw it. A cold pool's
// surface is nearly flat - that is what tells you at a glance that it is fog and not cloud -
// so the swell on it is twenty-odd metres over two kilometres, with finer ripples riding on
// that. It comes back with its own gradient, because the only thing that can model a
// surface this flat is a moon thirteen degrees above the horizon, and the moon needs a normal.
const FOGG = `
float fh(vec2 p){ p = fract(p * vec2(127.31, 311.7)); p += dot(p, p.yx + 41.17); return fract(p.x * p.y * 95.43); }
// value noise, with the gradient that goes with it
vec3 vnd(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = fh(i), b = fh(i + vec2(1, 0)), c = fh(i + vec2(0, 1)), d = fh(i + vec2(1, 1));
  vec2 u = f * f * (3. - 2. * f), du = 6. * f * (1. - f);
  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y,
    du.x * ((b - a) + (a - b - c + d) * u.y),
    du.y * ((c - a) + (a - b - c + d) * u.x));
}
// which pool this point lies in, and how high that one fills
float fogBrim(vec2 p){
  return mix(${FOG_N.toFixed(4)}, ${FOG_S.toFixed(4)}, smoothstep(2., -7., p.y + ${FOG_CZ} - ${FOG_CK} * p.x));
}
// x: the top, in the land's own units. yz: the way it leans, in x and in z.
vec3 fogTop(vec2 p, float t){
  float brim = fogBrim(p);
  // The swell, drifting with the same light air off the Czech side that carries the smoke
  // from the chimneys. Slowly: a pool of cold air an hour before dawn does not run anywhere,
  // it changes shape over minutes, and anything faster reads as cotton wool rolling downhill.
  // Three scales: a swell three kilometres long and twenty metres high, a one-kilometre one
  // riding on it, and a last fine one which is there to make the shoreline wander rather than
  // to be seen - a fog top broken into anything smaller than that reads as cloud from above.
  // A phone gets the first two: it is the shoreline that would miss the third, and a phone
  // holds the whole range in four hundred pixels.
  vec2 w = vec2(-.837, .546);
  vec3 a = vnd(p * .085 + w * (t * .013));
  vec3 b = vnd(p * .210 - w.yx * (t * .009));
${SMALL ? `  return vec3(brim + (a.x - .5) * .68 + (b.x - .5) * .30, a.yz * .0578 + b.yz * .0630);`
    : `  vec3 c = vnd(p * .520 + w * (t * .020));
  return vec3(brim + (a.x - .5) * .68 + (b.x - .5) * .28 + (c.x - .5) * .09,
    a.yz * .0578 + b.yz * .0588 + c.yz * .0281);`}
}`;
// The sheet itself: one horizontal mesh over the whole map at the brim of whichever pool it
// is over. It is fine enough that the swell on it reads as a curve rather than as folds;
// nothing else here needs resolution, because where the fog ends is worked out per pixel
// from the height map and not from this mesh.
const IVS = `#version 300 es
precision highp float;
in vec2 aXZ;
uniform mat4 uVP; uniform float uT;
out vec3 vP;
${FOGG}
void main(){
  vP = vec3(aXZ.x, fogTop(aXZ, uT).x, aXZ.y);
  gl_Position = uVP * vec4(vP, 1.);
}`;
const IFS = `#version 300 es
precision highp float;
in vec3 vP;
uniform sampler2D uMap; uniform sampler2D uAux; uniform vec4 uRect;
uniform vec3 uCam; uniform vec3 uMoon; uniform float uDawn; uniform float uPre; uniform float uT;
uniform vec3 uLit;      // how brightly the shelters, the stations and the towns are burning
uniform float uReveal;
out vec4 o;
${FOGG}
void main(){
  vec2 p = vP.xz;
  vec3 s = fogTop(p, uT);
  vec2 uv = vec2((p.x - uRect.x) / uRect.z + .5, .5 - (p.y - uRect.y) / uRect.w);
  float th = s.x - texture(uMap, uv).r;         // how deep the layer stands over this ground
  if (th <= .004) discard;                      // the land here is out in the clear air
  vec3 V = vP - uCam; float d = length(V); V /= d;
  // What anyone actually sees is the air they are looking through, so the sea thickens
  // towards its far shore of its own accord: the same forty metres of fog are a haze looked
  // down into and a solid floor looked along. It is also what keeps the near edge honest -
  // a bank lying thin over a shoulder of the hill stays see-through there and nowhere else.
  float a = 1. - exp(-th * 1.5 / max(-V.y, .055));
  // the top as a surface, and the light on it
  vec3 N = normalize(vec3(-s.y, 1., -s.z));
  float moon = max(dot(N, uMoon), 0.), sky = clamp(N.y * .5 + .5, 0., 1.);
  // What the moon does to it. A fog top is a horizontal surface and the moon stands thirteen
  // degrees up, so it takes a sixth of what a flank turned square to the moon takes - which
  // is why the sea reads as a pale floor under a silver range and never brighter than the
  // crest, however white the fog itself is. The swells are the whole of its modelling: tip
  // a surface this flat by four degrees and the light on it changes by a third.
  vec3 night = vec3(.075, .095, .125) * (.40 + .60 * sky)
    + vec3(.52, .60, .74) * pow(moon, 1.9) * 4.4;
  // and where the layer has piled deeper it gives a little more back, so the sea is not one
  // tone from end to end
  night *= .93 + .16 * smoothstep(-.45, .45, s.x - fogBrim(p));
  // The east is already a light. The glow standing over Śnieżka before the sun is up reaches
  // the sea first of all, because the sea is the thing nearest to it.
  float de = max(dot(N, normalize(vec3(-.95, .12, .28))), 0.);
  vec3 ember = mix(vec3(.30, .42, .66), vec3(1., .49, .25), uPre * uPre);
  night += ember * (de * de * .40 + smoothstep(26., -46., p.x) * .034) * (.25 + .75 * uPre) * (1. - uDawn);
  // What a town under the fog does to it: the light never gets out, it fills the layer and
  // the layer glows. From up here that is a soft warm patch, wider and weaker the deeper the
  // fog lying over it, and it is the only way of knowing a town is down there at all.
${SMALL ? `  float tw = texture(uAux, uv).b;` : `  vec2 e = vec2(.0035 + th * .0006, 0.);    // a town's own cell is 66 m: take the edge off it
  float tw = texture(uAux, uv).b * .34 + (texture(uAux, uv + e).b + texture(uAux, uv - e).b
    + texture(uAux, uv + e.yx).b + texture(uAux, uv - e.yx).b) * .165;`}
  night += vec3(1., .47, .17) * tw * tw * (1.4 - .4 * tw) * uLit.z * (.78 / (.7 + th * .30)) * (1. - uDawn * .7);
  // First light reaches the sea last: it is the lowest thing on the map and the sun has to
  // clear the range to touch it. When it does, the top goes pink-gold all at once and the
  // folds stay blue with the sky in them, which is the whole picture from the summit.
  float alt = smoothstep(7., 22.4, s.x);
  float sun = clamp((uDawn * 1.6 - .46 * (1. - alt)) / .55, 0., 1.);
  float dd = max(dot(N, normalize(vec3(-.95, .17, .26))), 0.);
  vec3 day = vec3(.15, .21, .38) * (.42 + .58 * sky) * (1. - .72 * smoothstep(.04, .28, dd) * sun)
    + vec3(1., .62, .34) * dd * 4.3 * sun + vec3(1., .38, .18) * pow(dd, 3.) * 2.4 * sun;
  vec3 col = mix(night, day, uDawn);
  col /= 1. + col * .55;
  // the same air between here and the camera as the land is seen through, so the far end of
  // the sea goes into the horizon haze instead of ending somewhere
  col = mix(col, mix(vec3(.040, .064, .102), vec3(.188, .153, .136), uDawn),
    smoothstep(mix(46., 75., uDawn), mix(236., 255., uDawn), d) * (.74 - uDawn * .36));
  // the edges: the sheet's own, where the drawing runs out, and out in the basin the far
  // one, where the sea is simply too distant to be anything but air
  vec2 hw = vec2(uRect.z, uRect.w) * .5;
  float ed = min(min(hw.x - abs(p.x - uRect.x), p.y - uRect.y + hw.y) / 9.,
    (uRect.y + hw.y + ${FOG_EXT.toFixed(1)} - p.y) / 13.);
  a *= smoothstep(0., 1., clamp(ed, 0., 1.));
  a *= smoothstep(s.x - 1.6, s.x, uReveal);     // it comes in with the land it is lying on
  o = vec4(col * a, a);
}`;

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
  const land = program(VS, FS), dots = program(PVS, PFS), ribs = program(RVS, RFS), sky = program(SVS, SFS);
  const uni = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  const UL = uni(land, ['uMap', 'uAux', 'uVP', 'uRect', 'uTexel', 'uCam', 'uMoon', 'uLamp', 'uLampOn', 'uDawn', 'uReveal', 'uBeat', 'uGain', 'uLit', 'uFine', 'uPanel', 'uPanelK', 'uPre', 'uTop']);
  const UP = uni(dots, ['uVP', 'uScale', 'uDawn', 'uMoonS', 'uDpr', 'uCamP', 'uPass']);
  const UR = uni(ribs, ['uVP', 'uPix', 'uWid', 'uCol', 'uDawn', 'uReveal', 'uCam', 'uWarm', 'uPanel', 'uPanelK', 'uShore', 'uShoreD', 'uT', 'uWalk']);
  const US = uni(sky, ['uRx', 'uRy', 'uFw', 'uMoon', 'uDawn', 'uPre', 'uPanel', 'uPanelK']);
  const skyVao = gl.createVertexArray();      // three vertices made out of gl_VertexID alone

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
  // Drawn finer and cooler than a daylight sheet would print them: under a moon a salmon
  // waymark across a silver range reads as a scratch on the picture, so the routes keep
  // their weight and give up most of their colour. Dawn takes them to luminance anyway.
  // A shoreline is drawn as the edge of a thing that is there, not as an outline round a
  // shape: an hour before dawn a reservoir is a near-black mirror, and a bright pale rim
  // laid round it is the one object on a moonlit relief that reads as pasted vector.
  const RWID = [.55, .78, 1.1, .70, .78, .8, 1.15, 0], RW = new Float32Array(8);
  const RCOL = new Float32Array([
    .26, .52, .70, .44,   .27, .55, .74, .52,   .32, .60, .78, .64,   // the streams
    .48, .68, .82, .30,                                               // a shoreline
    .80, .86, .92, .40,   .60, .78, .98, .44,   .94, .82, .74, .58,   // the paths
    .022, .044, .072, .95,                                            // a lake
  ]);

  // ---------------- the sea of fog ----------------
  // One sheet over the whole map, at the brim of whichever pool it is over. The land cuts
  // through it wherever it stands higher - that is the depth test doing it, not a mask - and
  // what is left is the surface of the fog, drawn from above.
  const fogP = program(IVS, IFS);
  const UF = uni(fogP, ['uVP', 'uMap', 'uAux', 'uRect', 'uCam', 'uMoon', 'uDawn', 'uPre', 'uT', 'uLit', 'uReveal']);
  const FG = SMALL ? 80 : 128, FGZ = Math.round(FG * (D + FOG_EXT) / W);
  const fv = new Float32Array((FG + 1) * (FGZ + 1) * 2);
  for (let j = 0, k = 0; j <= FGZ; j++) for (let i = 0; i <= FG; i++) {
    fv[k++] = CX - W / 2 + W * i / FG; fv[k++] = CZ + D / 2 + FOG_EXT - (D + FOG_EXT) * j / FGZ;
  }
  const fi = new Uint32Array(FG * FGZ * 6);
  for (let j = 0, k = 0; j < FGZ; j++) for (let i = 0; i < FG; i++) {
    const a = j * (FG + 1) + i, b = a + 1, c = a + FG + 1, d = c + 1;
    fi[k] = a; fi[k + 1] = c; fi[k + 2] = b; fi[k + 3] = b; fi[k + 4] = c; fi[k + 5] = d; k += 6;
  }
  const FN = fi.length;
  const fvao = gl.createVertexArray(); gl.bindVertexArray(fvao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, fv, gl.STATIC_DRAW);
  {
    const l = gl.getAttribLocation(fogP, 'aXZ');
    if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); }
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fi, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  // ---------------- the lights ----------------
  // A shelter is a warm core, the glow the night air puts round it, the pool it throws on
  // the ground, a gable standing dark in front of all three, and a thread of smoke. None of
  // that is a building: it is what a building does to the dark around it.
  // PTS: [x, y, z, brightness, kind, group, lights at, goes out at, how low it goes]
  const PTS = [], LAMPS = [], GRP = [];
  const SH = F.shelters;
  let xlo = 1e9, xhi = -1e9;
  for (const s of SH) { xlo = Math.min(xlo, s.x); xhi = Math.max(xhi, s.x); }
  // ---------------- the shelters, as buildings ----------------
  // Each one is its real building: the survey's footprint cut into wings, turned the way it
  // stands, on the terrace the bake levelled for it. Storeys of windows, a roof, a chimney,
  // and a plinth of stone where the slope still falls away under it. Its windows throw their
  // light on the ground outside (DV), and its smoke leaves from its chimney (CHIM).
  const BV = [], BI = [], DV = [], DI = [], CHIM = [], HUTC = [];
  const OBG = SH.length + 1;                          // the observatory's light group, after the relay's
  const vtx = (p, n, u, v, inf, ft) => { BV.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, inf[0], inf[1], inf[2], inf[3], ft[0], ft[1], ft[2]); return BV.length / 15 - 1; };
  const quadI = (a, b, c, d) => BI.push(a, b, c, a, c, d);
  const face4 = (P, n, U, W, inf, ft) => quadI(...P.map((p, k) => vtx(p, n, U[k], W[k], inf, ft)));
  const unit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  SH.forEach((s, hut) => {
    const b = s.b;
    if (!b) { HUTC.push([s.x, heightAt(s.x, s.z) + .2, s.z]); CHIM.push(null); return; }
    const tone = { p: 0, t: 1, c: 2 }[b.tone] || 0, fin = tone + (s.n === 'Dom Slaski' ? 4 : 0);
    let light = null, chim = null;
    wingsOf(s).forEach(({ x, z, A, B, ha, hb, lv, m }, wi) => {
      const P = (al, ac, y) => [x + (A[0] * al + B[0] * ac) * m, y, z + (A[1] * al + B[1] * ac) * m];
      const gs = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]
        .map(([i, j]) => { const p = P(i * ha, j * hb, 0); return heightAt(p[0], p[2]); });
      // The ground floor is set into the slope, the way a mountain hut is built: dug in on the
      // uphill side, on a plinth of stone on the downhill one. The land here is drawn four
      // times as steep as it is, so a floor level with the uphill corner stood the big huts on
      // stone towers.
      const floorY = gs.reduce((a, g) => a + g, 0) / gs.length + .01, baseY = Math.min(...gs) - .3;
      const H = lv * 3 + .4, top = floorY + H * m;
      const flat = b.roof === 'f', hip = b.roof === 'h';
      const rise = flat ? 0 : Math.min(hb * 1.05, 9), ridgeY = top + rise * m;
      const vb = (baseY - floorY) / m;
      const nA = [A[0], 0, A[1]], nB = [B[0], 0, B[1]];
      const ft = (f, z) => [wi * 4 + f, fin, z || 0];
      // the long walls, and the ends: a gable up to the ridge, or plain under a hip or a flat roof
      for (const sg of [1, -1]) {
        face4([P(-ha, sg * hb, baseY), P(ha, sg * hb, baseY), P(ha, sg * hb, top), P(-ha, sg * hb, top)],
          nB.map(x => x * sg), [-ha, ha, ha, -ha], [vb, vb, H, H], [ha, 0, hut, lv], ft(sg > 0 ? 0 : 1));
        const n = nA.map(x => x * sg), I = [hb, 1, hut, lv], F2 = ft(sg > 0 ? 2 : 3);
        const k = [P(sg * ha, -hb, baseY), P(sg * ha, hb, baseY), P(sg * ha, hb, top), P(sg * ha, -hb, top)]
          .map((p, j) => vtx(p, n, [-hb, hb, hb, -hb][j], [vb, vb, H, H][j], I, F2));
        quadI(...k);
        if (!flat && !hip) BI.push(k[3], k[2], vtx(P(sg * ha, 0, ridgeY), n, 0, H + rise, I, F2));
      }
      // the roof, overhanging its walls
      const o = .8, sl = rise / Math.max(hb, .1), eY = top - o * sl * m;
      const slen = Math.hypot(hb + o, rise + o * sl);
      if (flat) {
        quadI(...[P(-ha, -hb, top), P(ha, -hb, top), P(ha, hb, top), P(-ha, hb, top)]
          .map((p, j) => vtx(p, [0, 1, 0], [-ha, ha, ha, -ha][j], [-hb, -hb, hb, hb][j], [ha, 4, hut, lv], ft(0, hb))));
      } else {
        const rl = hip ? Math.max(ha - hb, ha * .3) : ha + o;
        for (const sg of [1, -1]) {
          const n = unit([B[0] * sg * sl, 1, B[1] * sg * sl]);
          quadI(...[P(-(ha + o), sg * (hb + o), eY), P(ha + o, sg * (hb + o), eY), P(rl, 0, ridgeY), P(-rl, 0, ridgeY)]
            .map((p, j) => vtx(p, n, [-(ha + o), ha + o, rl, -rl][j], [0, 0, slen, slen][j], [slen, 2, hut, lv], ft(sg > 0 ? 0 : 1, hip ? 0 : ha + o))));
          if (hip) {
            // the hipped ends come down to the eaves too
            const run = ha + o - rl, s2 = Math.hypot(run, rise + o * sl), g2 = (ridgeY - eY) / (run * m);
            const n2 = unit([A[0] * sg * g2, 1, A[1] * sg * g2]), I2 = [s2, 2, hut, lv], F2 = ft(sg > 0 ? 2 : 3);
            BI.push(vtx(P(sg * (ha + o), -(hb + o), eY), n2, -(hb + o), 0, I2, F2), vtx(P(sg * (ha + o), hb + o, eY), n2, hb + o, 0, I2, F2),
              vtx(P(sg * rl, 0, ridgeY), n2, 0, s2, I2, F2));
          }
        }
      }
      // the chimney, on the main wing, a stack wide enough to be seen
      if (wi === 0 && !flat) {
        const al = ha * .38, ac = hb * .45, cw = 1.3, yr = top + rise * .55 * m - .4 * m, yt = ridgeY + 1.6 * m;
        const C = (i, j, y) => P(al + i * cw, ac + j * cw, y);
        for (const [[i0, j0], [i1, j1], n] of [[[-1, -1], [1, -1], nB.map(x => -x)], [[1, -1], [1, 1], nA], [[1, 1], [-1, 1], nB], [[-1, 1], [-1, -1], nA.map(x => -x)]])
          face4([C(i0, j0, yr), C(i1, j1, yr), C(i1, j1, yt), C(i0, j0, yt)], n, [0, 1, 1, 0], [0, 0, 1, 1], [cw, 3, hut, lv], [99, fin, 0]);
        face4([C(-1, -1, yt), C(1, -1, yt), C(1, 1, yt), C(-1, 1, yt)], [0, 1, 0], [0, 1, 1, 0], [0, 0, 1, 1], [cw, 3, hut, lv], [99, fin, 1]);
        chim = P(al, ac, yt);
      }
      if (wi === 0) light = P(0, 0, floorY + H * .55 * m);
      // the ground round the wing, for the light its windows throw
      const M = 13, G = 14, base = DV.length / 11;
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
        const al = -(ha + M) + 2 * (ha + M) * i / G, ac = -(hb + M) + 2 * (hb + M) * j / G, p = P(al, ac, 0);
        DV.push(p[0], heightAt(p[0], p[2]) + .02, p[2], al, ac, ha, hb, hut, lv, wi * 4, tone);
      }
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = base + j * (G + 1) + i; DI.push(a, a + 1, a + G + 2, a, a + G + 2, a + G + 1); }
    });
    HUTC.push(light); CHIM.push(chim);
  });
  // Śnieżka's observatory: three discs, each smaller than the one under it and each with its
  // band of glass - the restaurant's warm at the bottom, the instruments' cool above.
  {
    const OBc = F.landmarks.obs, og = heightAt(OBc.x, OBc.z), m = BK, segs = 44;
    const prof = [[9.5, -14, 0], [9.5, 2.2, 0], [18, 4.2, 0], [18, 6.4, 1], [10.5, 7.8, 0], [7, 8, 0], [7, 9.6, 0], [13.5, 11, 0], [13.5, 12.9, 2],
      [7.5, 14, 0], [4.6, 14.2, 0], [4.6, 15.6, 0], [9, 16.6, 0], [9, 18.1, 2], [3.5, 19, 0], [.01, 19.3, 0]];
    const Q = (r, y, a) => [OBc.x + Math.cos(a) * r * m, og + y * m, OBc.z + Math.sin(a) * r * m];
    for (let j = 1; j < prof.length; j++) {
      const [r0, y0] = prof[j - 1], [r1, y1, gz] = prof[j];
      const nr = y1 - y0, ny = -(r1 - r0), nl = Math.hypot(nr, ny) || 1, am = (r0 + r1) / 2;
      for (let k = 0; k < segs; k++) {
        const a0 = k / segs * 2 * Math.PI, a1 = (k + 1) / segs * 2 * Math.PI;
        quadI(...[[r0, y0, a0], [r0, y0, a1], [r1, y1, a1], [r1, y1, a0]]
          .map(([r, y, a]) => vtx(Q(r, y, a), [Math.cos(a) * nr / nl, ny / nl, Math.sin(a) * nr / nl], a * am, y, [gz, 5, OBG, 3], [k, 3, y0])));
      }
    }
    // and the mast on top
    const C = (i, j, y) => [OBc.x + i * .7 * m, og + y * m, OBc.z + j * .7 * m];
    for (const [[i0, j0], [i1, j1], n] of [[[-1, -1], [1, -1], [0, 0, -1]], [[1, -1], [1, 1], [1, 0, 0]], [[1, 1], [-1, 1], [0, 0, 1]], [[-1, 1], [-1, -1], [-1, 0, 0]]])
      face4([C(i0, j0, 19), C(i1, j1, 19), C(i1, j1, 26), C(i0, j0, 26)], n, [0, 1, 1, 0], [0, 0, 1, 1], [.7, 3, OBG, 3], [99, 3, 0]);
  }
  const bld = program(BVS, BFS), dec = program(DVS, DFS);
  const UB = uni(bld, ['uVP', 'uMoon', 'uDawn', 'uPre', 'uCam', 'uT', 'uReveal', 'uHut', 'uPanel', 'uPanelK', 'uMap', 'uRect', 'uTop']);
  const UD = uni(dec, ['uVP', 'uHut', 'uT', 'uDawn', 'uReveal', 'uCam', 'uPanel', 'uPanelK']);
  const mkMesh = (prog, V, I, stride, attrs) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
    attrs.forEach(([nm, sz, off]) => { const l = gl.getAttribLocation(prog, nm); if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, stride, off); } });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(I), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return vao;
  };
  const bvao = mkMesh(bld, BV, BI, 60, [['aPos', 3, 0], ['aNrm', 3, 12], ['aUv', 2, 24], ['aInf', 4, 32], ['aFt', 3, 48]]), BN = BI.length;
  const dvao = mkMesh(dec, DV, DI, 44, [['aPos', 3, 0], ['aL', 2, 12], ['aW', 4, 20], ['aF', 2, 36]]), DN = DI.length;
  const HU = new Float32Array(24 * 4);              // each hut: woken, put out by the day, breath, dimmed under words
  // the order the huts light up in, as the land comes up under them: lowest first
  const byH = SH.map((s, i) => i).sort((a, b) => heightAt(SH[a].x, SH[a].z) - heightAt(SH[b].x, SH[b].z));
  const rank = new Array(SH.length); byH.forEach((i, r) => rank[i] = r / Math.max(1, SH.length - 1));
  const put = (x, z, lift, a, k, grp, on, out, floor) =>
    PTS.push([x, heightAt(x, z) + lift, z, a, k, grp === undefined ? -1 : grp, on || 0, out === undefined ? .3 : out, floor === undefined ? .16 : floor]);
  SH.forEach((s, i) => {
    const g = LAMPS.length, hc = HUTC[i]; LAMPS.push([hc[0], hc[2]]);
    // Each hearth keeps its own time: a phase for the breathing, a moment at which it is
    // lit, and the moment the day reaches it. East is -x, so the east end goes out first.
    GRP.push({ home: 1, ph: (i * 2.39996) % 6.2832 });
    const on = .22 + 1.80 * (rank[i] * .80 + ((i * 7919) % 101) / 101 * .20);
    const out = .20 + .62 * (s.x - xlo) / (xhi - xlo) + .11 * rank[i];
    // the glow of the hut in the air, from inside the building: its windows are its lights
    put(hc[0], hc[2], hc[1] - heightAt(hc[0], hc[2]), s.p ? 1 : .6, s.p ? 6 : 7, g, on, out, .17);
  });
  // The relay above the Śnieżne Kotły and the observatory on Śnieżka are instruments, not
  // homes. They do not breathe, they do not smoke, and they do not go out when the day
  // comes: they come on together, early, and they stay.
  const RT = F.landmarks.rton, grt = LAMPS.length; LAMPS.push([RT.x, RT.z]); GRP.push({ home: 0, ph: 0 });
  put(RT.x, RT.z, -.04, 1, 9, grt, .10, .42, .44);
  const beaconAt0 = PTS.length;
  put(RT.x, RT.z, .88, 1, 3, grt, .06, 1.2, 1);    // the top of the mast as it is drawn
  const OB = F.landmarks.obs, gob = LAMPS.length; LAMPS.push([OB.x, OB.z]); GRP.push({ home: 0, ph: 0 });
  if (gob !== OBG) console.warn('the observatory light group moved');
  put(OB.x, OB.z, .22, 1, 8, gob, .10, .42, .44);   // the glow round the discs, from their middle
  // The walker of the finale: one lamp that goes the length of the crest trail with the
  // camera, from the Szrenica shelter to the summit, and is put out there by the day.
  const walkerAt = PTS.length;
  put(F.trails.find(t => t.k === 'ridge').p[0][0], F.trails.find(t => t.k === 'ridge').p[0][1], .35, 1, 1, -1, 0, 9, 1);
  const MARKN = LAMPS.length;
  // the valley towns: lights scattered on the real settlements, thickest where the people
  // are, and switched off the same way round as the huts - the east end of the basin first
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const t of F.towns) {
    const s = Math.sqrt(t.p), n = Math.min(16, Math.max(2, Math.round(s / 3.4))), r = .5 + s * .052;
    const out = .17 + .56 * Math.max(0, Math.min(1, (t.x + 60) / 120));
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * r;
      put(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d * .8, .12, .3 + rnd() * .4 + t.k * .1, 4,
        -1, .05 + rnd() * .9, out + rnd() * .12, .10);
    }
  }
  // Jelenia Góra is 300 m past the north edge: an arc of glow, not a cluster
  for (let k = 0; k < 5; k++) PTS.push([F.offscreen.x + (k - 2) * 6.5, 1.4, 42.5 - Math.abs(k - 2) * .7,
    .1 + (2 - Math.abs(k - 2)) * .035, 5, -1, .1 + k * .08, .30, .10]);

  // ---------------- the smoke ----------------
  // A few soft puffs leaving each chimney, drifting with a light air off the Czech side and
  // thinning as they climb. They are faded out beyond about six kilometres: at hero distance
  // a thread of woodsmoke is not a thing you can see, and pretending otherwise is kitsch.
  // Enough of them, close enough together, that they join into a thread. Four puffs spread
  // over a whole climb is a string of beads, which is what it looked like; eight small ones
  // overlapping is smoke. They are drawn smaller to pay for the extra count, and each one
  // thins as it rises instead of swelling and fading like a ring of breath.
  const SMOKE = [];
  SH.forEach((s, i) => {
    const n = s.p ? 8 : 3;
    const ch = CHIM[i] || [s.x, heightAt(s.x, s.z) + .5, s.z];     // the top of its chimney
    for (let k = 0; k < n; k++) SMOKE.push({
      g: i, x: ch[0], y: ch[1], z: ch[2],
      ph: k / n + ((i * 37 + k * 11) % 23) / 460,
      rate: (s.p ? .135 : .115) * (.88 + ((i * 13 + k * 5) % 7) / 26),
      rise: s.p ? 1.30 : .92,
      dx: -.95 + (((i * 5 + k * 3) % 9) - 4) * .09,
      dz: .62 + (((i * 11 + k * 7) % 9) - 4) * .075,
      a: s.p ? .54 : .34,
    });
  });
  // Samotnia is the one hut on this map that stands on a shore. Mały Staw is forty metres
  // below its windows and dead still on a cold night, so the light goes out across it.
  const samI = SH.findIndex(s => s.n === 'Samotnia');
  const mStaw = F.lakes.find(l => l.n === 'Maly Staw');
  const SHORE = samI >= 0 && mStaw
    ? { x: SH[samI].x, z: SH[samI].z, cx: mStaw.x, cz: mStaw.z, g: samI } : null;

  // ---------------- walkers on the real paths ----------------
  const pathOf = pts => { const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { P: pts, acc, L: acc[acc.length - 1] }; };
  const TP = {}; for (const t of F.trails) TP[t.k] = pathOf(t.p);
  // Walking up, every one of them: the two valley paths run from the town to the hut and
  // the crest route runs west to east, and the arc length only ever increases. Two more on
  // the climb out of Szklarska Poręba, because that climb is what the third stop is about.
  const AG = [['karpacz', 0, 1.10], ['karpacz', 15, .90], ['karpacz', 30, 1.22], ['ascent', 1, .98],
    ['ascent', 12, .82], ['ascent', 25, 1.08], ['ascent', 38, .88], ['ridge', 3, 1.35],
    ['ridge', 31, 1.10], ['ridge', 60, 1.28]]
    .map(([k, off, sp], i) => ({ path: TP[k], off, sp, ph: i * 1.7 }));
  const TAIL = 5, AN = AG.length * TAIL;
  const SN0 = AN + PTS.length;                    // where the smoke starts in the buffer

  // Every light the fog has closed over stops being a light. What is left of a window in the
  // basin, seen from up here, is the patch of the layer it is lighting from the inside - and
  // the sheet draws that. So each of them is dimmed to a trace by how deep it lies under the
  // brim, instead of being left burning on top of the fog like a sticker on the picture.
  // Jelenia Góra is the exception: that one is not a light but the glow it puts into the sky
  // over itself, and fog makes more of that, not less.
  const drown = PTS.map(q => 1 - (q[4] === 5 ? .25 : .94) * drownAt(q[0], q[1], q[2]));

  const ap = new Float32Array((SN0 + SMOKE.length) * 6);
  PTS.forEach((p, i) => { const o = (AN + i) * 6; ap[o] = p[0]; ap[o + 1] = p[1]; ap[o + 2] = p[2]; ap[o + 4] = p[4]; });
  for (let i = 0; i < SMOKE.length; i++) ap[(SN0 + i) * 6 + 4] = 10;
  const avao = gl.createVertexArray(); gl.bindVertexArray(avao);
  const abuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, abuf); gl.bufferData(gl.ARRAY_BUFFER, ap.byteLength, gl.DYNAMIC_DRAW);
  [['aPos', 3, 0], ['aA', 1, 12], ['aK', 1, 16], ['aQ', 1, 20]].forEach(([nm, sz, off]) => {
    const l = gl.getAttribLocation(dots, nm);
    if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 24, off); }
  });
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
      // a headlamp rides on somebody's forehead, so it rises and falls with the stride
      const bob = reduce ? 0 : Math.sin(time * 4.3 + g.ph) * .035;
      for (let k = 0; k < TAIL; k++) {
        const s = s0 - k * .4, p = along(g.path, s), o = (i * TAIL + k) * 6;
        const ends = Math.max(0, Math.min(1, s / 2, (L - s) / 2));
        let near = 1;   // a walker gives way near a shelter, so its own windows read first
        for (let q = 0; q < MARKN; q++) { const d = Math.hypot(p[0] - LAMPS[q][0], p[2] - LAMPS[q][1]); if (d < 2.2) near = Math.min(near, .25 + .75 * d / 2.2); }
        ap[o] = p[0]; ap[o + 1] = p[1] + bob * (1 - k / TAIL); ap[o + 2] = p[2];
        // and a headlamp that walks down into the fog goes with it: a diffused smudge, not a
        // point. Every path on this map starts above the brim, so this only ever has anything
        // to do if a walk is added lower down.
        ap[o + 3] = (k === 0 ? 1 : .5 * (1 - k / TAIL)) * ends * near * gain * (1 - .85 * drownAt(p[0], p[1], p[2]));
      }
    });
  };
  // the smoke, placed the same way: an age that cycles, a climb that slows, a drift that does
  // not. Under reduced motion the clock stands still and each puff keeps the age it has.
  const placeSmoke = (time, lit) => {
    for (let i = 0; i < SMOKE.length; i++) {
      const s = SMOKE[i], age = (time * s.rate + s.ph) % 1, o = (SN0 + i) * 6;
      const w = Math.sin(age * 4.1 + s.ph * 6.2832) * .06 * age;
      ap[o] = s.x + s.dx * age * age + w;
      ap[o + 1] = s.y + s.rise * age * (1.35 - .35 * age);
      ap[o + 2] = s.z + s.dz * age * age + w * .6;
      // up out of the flue at full strength and thinning the whole way, which is what a
      // chimney does; a puff that fades in from nothing starts in mid-air
      const up = 1 - age;
      ap[o + 3] = s.a * up * up * Math.sqrt(up) * Math.min(1, age * 11) * lit[s.g];
      ap[o + 5] = age;
    }
  };

  // ---------------- labels pinned to the land ----------------
  const top = (x, z) => { let b = [x, -1e9, z]; for (let dx = -1.2; dx <= 1.2; dx += .3) for (let dz = -1.2; dz <= 1.2; dz += .3) { const h = heightAt(x + dx, z + dz); if (h > b[1]) b = [x + dx, h, z + dz]; } return b; };
  const pins = [];
  const addPin = (el, p, stop, mode) => { labelsEl.appendChild(el); pins.push({ el, p, stop, mode, o: -1 }); };
  for (const l of LABELS) {
    const el = document.createElement('div');
    el.className = 'lbl' + (l.b ? ' stem' : ' quiet');
    el.innerHTML = (l.b ? `<b>${l.b}</b>` : '') + (l.i ? `<i>${l.i}</i>` : '');
    // The one label on the page that has to read sits over a lit shelter, so it is given a
    // stem long enough to stand off the halo instead of a shadow to fight it with: cream
    // type on a cream-white light is unreadable whichever way the shadow is pushed.
    if (l.stem) el.style.setProperty('--stem', l.stem + 'px');
    const p = l.peak ? top(l.peak[0], l.peak[1]) : [l.at[0], heightAt(l.at[0], l.at[1]) + (l.dy || 0), l.at[1]];
    if (l.peak) p[1] += .7;
    addPin(el, p, l.stop, 'pin');
  }
  for (const g of GRAT) {
    const el = document.createElement('div'); el.className = 'lbl grat' + (g.side === 'w' ? ' w' : ''); el.textContent = g.txt;
    addPin(el, [g.at[0], heightAt(g.at[0], g.at[1]), g.at[1]], [0], 'grat');
  }
  // placed in this order, so that what the stop is about takes the space it needs first
  const order = pins.slice().sort((a, b) =>
    (a.mode === 'grat' ? 2 : a.el.querySelector('b') ? 0 : 1) -
    (b.mode === 'grat' ? 2 : b.el.querySelector('b') ? 0 : 1));

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
  // A flight with waypoints - the last one, along the crest - is one smooth curve through all
  // of its keys, paced by how far the camera actually travels between them, so it neither
  // dawdles over the first summit nor rushes the last.
  const chains = {};
  const keyOf = (k, tall, inner) => {
    const v = tall ? { t: k.pt || k.t, dist: k.dist, pd: k.pd || (inner ? 1.15 : 1.2), pitch: k.pp ?? k.pitch, yaw: k.py ?? k.yaw, fov: k.pf ?? (k.fov + (inner ? 8 : 0)) }
      : { t: k.t, dist: k.dist, pd: k.pd || 1.2, pitch: k.pitch, yaw: k.yaw, fov: k.fov };
    const d = v.dist * (tall ? v.pd : 1), pr = v.pitch * Math.PI / 180, yr = v.yaw * Math.PI / 180;
    v.eye = [v.t[0] + Math.sin(yr) * Math.cos(pr) * d, v.t[1] + Math.sin(pr) * d, v.t[2] + Math.cos(yr) * Math.cos(pr) * d];
    v.arc = k.arc || 0;
    return v;
  };
  const chainOf = (i, tall) => {
    const id = i + (tall ? 'p' : 'l');
    if (chains[id]) return chains[id];
    const B = WAY[i + 1], ks = [WAY[i], ...B.via, B];
    const K = ks.map((k, j) => keyOf(k, tall, j > 0 && j < ks.length - 1));
    const S = [0];
    for (let j = 1; j < K.length; j++) {
      const a = K[j - 1], b = K[j];
      S.push(S[j - 1] + (Math.hypot(b.t[0] - a.t[0], b.t[1] - a.t[1], b.t[2] - a.t[2]) + Math.hypot(b.eye[0] - a.eye[0], b.eye[1] - a.eye[1], b.eye[2] - a.eye[2])) / 2);
    }
    return (chains[id] = { K, S });
  };
  const cr = (a, b, c, d, w) => .5 * (2 * b + (c - a) * w + (2 * a - 5 * b + 4 * c - d) * w * w + (3 * b - a - 3 * c + d) * w * w * w);
  const viaAt = (i, f, tall) => {
    const { K, S } = chainOf(i, tall), m = K.length - 1, at = f * S[m];
    let j = 0; while (j < m - 1 && S[j + 1] < at) j++;
    const w = Math.min(1, Math.max(0, (at - S[j]) / Math.max(1e-6, S[j + 1] - S[j])));
    // the ends are reflected, so the curve leaves the first stop and reaches the last at speed
    // and the easing is left to the scroll
    const P = q => q < 0 ? null : q > m ? null : K[q];
    const g = (q, get) => { const k = P(q); if (k) return get(k); return q < 0 ? 2 * get(K[0]) - get(K[1]) : 2 * get(K[m]) - get(K[m - 1]); };
    const v = get => cr(g(j - 1, get), g(j, get), g(j + 1, get), g(j + 2, get), w);
    return {
      t: [0, 1, 2].map(x => v(k => k.t[x])), dist: v(k => k.dist), pd: v(k => k.pd),
      pitch: v(k => k.pitch), yaw: v(k => k.yaw), fov: v(k => k.fov),
      arc: K[j].arc + (K[j + 1].arc - K[j].arc) * w,
    };
  };
  const camAt = u => {
    const i = Math.min(n - 2, Math.floor(u)), f = u - i, A = WAY[i], B = WAY[i + 1], tall = portrait();
    if (B.via) return viaAt(i, f, tall);
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
  const live = new Float32Array(LAMPS.length).fill(1);   // breathing × giving way to a label
  const breath = new Float32Array(LAMPS.length).fill(1); // the hearth's own rise and fall
  const shLit = new Float32Array(SH.length).fill(1);     // how brightly each hut is burning
  const c01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const sst = (a, b, x) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  // the aviation light on the mast: slow, and with the soft tail a real one has - a flash,
  // then a few seconds of nearly nothing. Steady when motion is reduced.
  const blink = t => { const u = (t / 4.6) % 1; return c01(u / .045) * c01((.14 - u) / .075) + .30 * Math.exp(-Math.max(0, u - .13) * 6.5); };
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

    // Spread across the whole of the last flight and starting the moment the camera begins
    // to pull back, so the colour arrives while the camera is still moving and the huts have
    // the room to go out in order. Packed into the last tenth it arrived as a cut, and took
    // the one sequence on the page - the lights going out from the east - down with it.
    // It holds back for the first part of the crest: the walk starts in moonlight, and the
    // colour comes into the land as the summit comes into view.
    const dawn = Math.pow(c01(cur - (n - 2)), 1.7);
    // how far along the crest the walk has come: nowhere before the last flight, the whole
    // trail to the summit once it lands
    const walk = cur <= n - 2 ? 0 : (c.arc === undefined ? TP.ridge.L : c.arc);
    // The hour before. The sky in the east comes up a stop at a time, so the sun at the last
    // stop finishes something that started on the first screen instead of arriving from
    // nowhere. It is full by the fourth stop, where the dawn itself takes the picture over.
    const pre = .20 + .80 * c01(cur / (n - 2));
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
    // The sky is the exception, and it is the exception at every width. Its scrim was sized
    // against a dark wash, and once the sky became a sunrise the brightest thing in the
    // whole frame stood behind the smallest type in it. So the sky takes the rectangle
    // wherever there are words, desktop as well as phone; the drawing underneath still only
    // goes quiet where the words actually cover it, which is on a phone.
    let panelK = 0, skyK = 0;
    if (rects.length) {
      let l = 1e9, r = -1e9, t = 1e9, b = -1e9;
      for (const q of rects) { l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); b = Math.max(b, q.bottom); }
      const sc = canvas.height / ch;
      const px = [(l - 14) * sc, (ch - b - 18) * sc, (r + 14) * sc, (ch - t + 18) * sc];
      gl.useProgram(sky); gl.uniform4f(US.uPanel, px[0], px[1], px[2], px[3]);
      skyK = 1;
      if (portrait()) {
        gl.useProgram(land); gl.uniform4f(UL.uPanel, px[0], px[1], px[2], px[3]);
        gl.useProgram(ribs); gl.uniform4f(UR.uPanel, px[0], px[1], px[2], px[3]);
        gl.useProgram(bld); gl.uniform4f(UB.uPanel, px[0], px[1], px[2], px[3]);
        gl.useProgram(dec); gl.uniform4f(UD.uPanel, px[0], px[1], px[2], px[3]);
        panelK = 1;
      }
    }

    // The lights come on one at a time as the land rises under them - low huts first, with
    // enough wander in the order that it reads as twenty separate decisions and not as a
    // sweep - and they go out the same way at dawn, from the east end of the range, where
    // the light actually arrives first. None of them goes out completely: there is still
    // somebody in a shelter at first light, and the frame the film ends on needs them.
    const lu = reduce ? 99 : (revealStart ? (now - revealStart) / 1000 : 0);
    const hikeK = (1 - dawn * .6) * (reduce ? 1 : sst(.45, 1.5, lu));
    for (let i = 0; i < LAMPS.length; i++) {
      project([LAMPS[i][0], heightAt(LAMPS[i][0], LAMPS[i][1]), LAMPS[i][1]], P2);
      const k = P2[2] <= 0 ? 0 : (onWords(P2[0], P2[1]) ? .28 : 1);
      mdim[i] += (k - mdim[i]) * (reduce ? 1 : Math.min(1, dt * 4));   // no fades when motion is reduced
      // A stove is not a lamp: a slow swell with something irregular riding on it, and
      // never a tidy sine. Every hearth on its own phase, or twenty huts pulse together and
      // the range looks electrified. This goes to the panes and the pool a hut throws, not
      // to the air round it - the glow stays still, which is what keeps the range calm.
      const G = GRP[i];
      breath[i] = (reduce || !G.home) ? 1
        : 1 + .128 * Math.sin(time * .38 + G.ph) + .073 * Math.sin(time * .97 + G.ph * 2.7)
        + .039 * Math.sin(time * 2.31 + G.ph * 1.3) + .034 * Math.sin(time * .17 + G.ph * 4.1);
      live[i] = mdim[i] * breath[i];
    }
    const beacon = (reduce ? .8 : .20 + .80 * blink(time)) * (1 - dawn * .40) * (reduce ? 1 : sst(.06, .5, lu));
    let warmS = 0, coolS = 0, townS = 0, townN = 0;
    for (let i = 0; i < PTS.length; i++) {
      const q = PTS[i], k = q[4];
      let a = q[3];
      if (i === beaconAt0) a = beacon;
      else {
        // it waits its turn, and it waits for the ground under it: nothing lights in mid-air
        const on = reduce ? 1 : sst(q[6], q[6] + .55, lu) * sst(q[1] - .7, q[1] + .3, reveal);
        const burn = on * (1 - (1 - q[8]) * sst(q[7], q[7] + .26, dawn));
        a *= burn;
        if (k === 6 || k === 7) { warmS += burn; shLit[q[5]] = burn; }
        // its windows come on one by one over a couple of seconds from its turn, and go out
        // one by one as the day reaches it; the observatory's never do
        if (k >= 6 && k <= 8) {
          const g = q[5] * 4;
          HU[g] = reduce ? 1 : sst(q[6], q[6] + 2.4, lu) * sst(q[1] - .7, q[1] + .3, reveal);
          HU[g + 1] = k === 8 ? 0 : sst(q[7] - .04, q[7] + .34, dawn);
        }
        else if (k === 8 || k === 9) coolS += burn;
        else if (k === 4) { townS += burn; townN++; }
      }
      // a hut carries its breath in aQ instead, so only its panes and its pool move
      const home = k === 6 || k === 7;
      if (q[5] >= 0) a *= home ? mdim[q[5]] : live[q[5]];
      a *= drown[i];                     // and what the fog has closed over barely shows
      const ao = (AN + i) * 6;
      ap[ao + 3] = a;
      if (home) ap[ao + 5] = breath[q[5]];
    }
    {
      const o = (AN + walkerAt) * 6, w = along(TP.ridge, walk), L = TP.ridge.L;
      ap[o] = w[0]; ap[o + 1] = w[1] + .12; ap[o + 2] = w[2];
      ap[o + 3] = sst(0, 2, walk) * (1 - .8 * sst(L - 5, L, walk)) * .75;
    }
    for (let i = 0; i < LAMPS.length && i < 24; i++) { HU[i * 4 + 2] = breath[i]; HU[i * 4 + 3] = mdim[i]; }
    // what the ground under them is given: the average of what is actually burning
    const warmK = warmS / SH.length, coolK = coolS * .5, townK = townN ? townS / townN : 0;

    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // the sky first, across the whole frame and writing no depth, so the crest has something
    // to stand against. It is opaque at every hour: the night sky is drawn here and so is
    // the sunrise, and nothing behind the canvas is ever meant to show through.
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(sky);
    gl.uniform3f(US.uFw, fwd[0], fwd[1], fwd[2]);
    gl.uniform3f(US.uRx, right[0] * basis.th * aspect, right[1] * basis.th * aspect, right[2] * basis.th * aspect);
    gl.uniform3f(US.uRy, up[0] * basis.th, up[1] * basis.th, up[2] * basis.th);
    gl.uniform3f(US.uMoon, MOON[0], MOON[1], MOON[2]);
    gl.uniform1f(US.uDawn, dawn); gl.uniform1f(US.uPre, pre); gl.uniform1f(US.uPanelK, skyK);
    gl.bindVertexArray(skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);

    gl.useProgram(land);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(UL.uMap, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, aux); gl.uniform1i(UL.uAux, 1);
    gl.uniformMatrix4fv(UL.uVP, false, VP);
    gl.uniform4f(UL.uRect, CX, CZ, W, D); gl.uniform2f(UL.uTexel, 1 / N, 1 / N);
    gl.uniform3f(UL.uCam, eye[0], eye[1], eye[2]); gl.uniform3f(UL.uLamp, lamp[0], lamp[1], lamp[2]);
    gl.uniform3f(UL.uMoon, MOON[0], MOON[1], MOON[2]);
    gl.uniform1f(UL.uLampOn, lampOn); gl.uniform1f(UL.uDawn, dawn); gl.uniform1f(UL.uReveal, reveal);
    MW.beatSmooth = (MW.beatSmooth || 0) + ((MW.beat || 0) - (MW.beatSmooth || 0)) * Math.min(1, dt * 8);
    gl.uniform1f(UL.uBeat, MW.beatSmooth); gl.uniform1f(UL.uGain, OG ? 1.22 : 1);
    gl.uniform3f(UL.uLit, warmK, coolK, townK); gl.uniform1f(UL.uPre, pre);
    gl.uniform1f(UL.uTop, maxH + .6);   // where a shadow ray has cleared the whole sheet
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
    gl.uniform1f(UR.uT, reduce ? 0 : time);
    gl.uniform1f(UR.uWalk, walk);
    if (SHORE) {
      // Which way Samotnia's windows lie out over Mały Staw. On a flat mirror the answer is
      // straight at the viewer, but the tarn is two hundred metres across and every stop on
      // this flight stands a kilometre north of it and half a kilometre above, so that
      // answer is a glint on the shore and nothing else. So it is bent onto the water: the
      // column anyone has ever seen from a lakeside window, pointing the way it is seen.
      let ax = eye[0] - SHORE.x, az = eye[2] - SHORE.z; const al = Math.hypot(ax, az) || 1;
      let bx = SHORE.cx - SHORE.x, bz = SHORE.cz - SHORE.z; const bl = Math.hypot(bx, bz) || 1;
      let dx = ax / al + bx / bl * 1.45, dz = az / al + bz / bl * 1.45;
      const dl = Math.hypot(dx, dz) || 1;
      gl.uniform4f(UR.uShore, SHORE.x, SHORE.z, shLit[SHORE.g], 0);
      gl.uniform4f(UR.uShoreD, dx / dl, dz / dl, 0, 0);
    } else { gl.uniform4f(UR.uShore, 1e5, 1e5, 0, 0); gl.uniform4f(UR.uShoreD, 1, 0, 0, 0); }
    // the line work keeps its own ground but wins the depth test, so a path on a steep
    // slope is never half-swallowed by the quad it lies on
    gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -220);
    gl.bindVertexArray(rvao); gl.drawElements(gl.TRIANGLES, RN, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true);

    // the buildings: solid, over the land and under every light. Each marks the stencil, so
    // the glow in the air round a hut can lie round it and never on its walls.
    gl.useProgram(bld); gl.uniformMatrix4fv(UB.uVP, false, VP);
    gl.uniform3f(UB.uMoon, MOON[0], MOON[1], MOON[2]); gl.uniform1f(UB.uDawn, dawn); gl.uniform1f(UB.uPre, pre);
    gl.uniform3f(UB.uCam, eye[0], eye[1], eye[2]); gl.uniform1f(UB.uT, reduce ? 0 : time); gl.uniform1f(UB.uReveal, reveal);
    // the walls read the land's own height field, so the mountain above a hut can put it in
    // the shade exactly as it shades the slope it stands on
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(UB.uMap, 0);
    gl.uniform4f(UB.uRect, CX, CZ, W, D); gl.uniform1f(UB.uTop, maxH + .6);
    gl.uniform4fv(UB.uHut, HU); gl.uniform1f(UB.uPanelK, panelK);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.bindVertexArray(bvao); gl.drawElements(gl.TRIANGLES, BN, gl.UNSIGNED_INT, 0);
    gl.disable(gl.STENCIL_TEST);
    // and what their windows throw on the ground outside, added to the land
    gl.useProgram(dec); gl.uniformMatrix4fv(UD.uVP, false, VP);
    gl.uniform4fv(UD.uHut, HU); gl.uniform1f(UD.uT, reduce ? 0 : time); gl.uniform1f(UD.uDawn, dawn);
    gl.uniform1f(UD.uReveal, reveal); gl.uniform3f(UD.uCam, eye[0], eye[1], eye[2]); gl.uniform1f(UD.uPanelK, panelK);
    gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -160);
    gl.bindVertexArray(dvao); gl.drawElements(gl.TRIANGLES, DN, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true);

    // The sea of fog: over everything that stands in it and under every light, because it is
    // air. It takes no part in the stencil and writes no depth - what rises out of it has
    // already been drawn, and what lies under it the depth test has already hidden.
    gl.useProgram(fogP); gl.uniformMatrix4fv(UF.uVP, false, VP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(UF.uMap, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, aux); gl.uniform1i(UF.uAux, 1);
    gl.uniform4f(UF.uRect, CX, CZ, W, D);
    gl.uniform3f(UF.uCam, eye[0], eye[1], eye[2]);
    gl.uniform3f(UF.uMoon, MOON[0], MOON[1], MOON[2]);
    gl.uniform1f(UF.uDawn, dawn); gl.uniform1f(UF.uPre, pre); gl.uniform1f(UF.uT, reduce ? 0 : time);
    gl.uniform3f(UF.uLit, warmK, coolK, townK); gl.uniform1f(UF.uReveal, reveal);
    gl.depthMask(false);
    gl.bindVertexArray(fvao); gl.drawElements(gl.TRIANGLES, FN, gl.UNSIGNED_INT, 0);
    gl.depthMask(true); gl.bindVertexArray(null);

    placeAgents(reduce ? 7 : time, hikeK);
    placeSmoke(reduce ? 11 : time, shLit);
    gl.bindBuffer(gl.ARRAY_BUFFER, abuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ap);
    gl.useProgram(dots); gl.uniformMatrix4fv(UP.uVP, false, VP); gl.uniform1f(UP.uDawn, dawn);
    gl.uniform3f(UP.uScale, canvas.height * .9, canvas.height / ch, SMALL ? .72 : 1);
    gl.uniform1f(UP.uDpr, canvas.height / ch);
    // which way the moon lies, in the sprite's own pixels, so a puff of smoke is lit on the
    // side the moon is actually on however the camera is turned
    const msx = MOON[0] * right[0] + MOON[1] * right[1] + MOON[2] * right[2];
    const msy = -(MOON[0] * up[0] + MOON[1] * up[1] + MOON[2] * up[2]);
    const msl = Math.hypot(msx, msy) || 1;
    gl.uniform2f(UP.uMoonS, msx / msl, msy / msl);
    gl.uniform3f(UP.uCamP, eye[0], eye[1], eye[2]);
    gl.depthMask(false); gl.bindVertexArray(avao);
    // the relay laid over the land; then every light, added on top
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1i(UP.uPass, 0);
    gl.drawArrays(gl.POINTS, AN, PTS.length);
    gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1i(UP.uPass, 1);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.NOTEQUAL, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.drawArrays(gl.POINTS, 0, SN0);
    gl.disable(gl.STENCIL_TEST);
    gl.drawArrays(gl.POINTS, SN0, SMOKE.length);     // smoke can drift in front of a roof
    gl.depthMask(true); gl.bindVertexArray(null);

    // labels: never on top of the words, never off the edge, never on each other. The ones
    // that carry the story are placed first and the rest give way to them.
    const railR = cw > 860 ? 58 : 10; // keep clear of the route dots on the right
    const taken = [];
    // where a label is allowed to step to when its own place is taken: sideways first,
    // because a word beside a path still points at the path
    const CAND = [[0, 0], [17, 0], [-17, 0], [0, -26], [0, 26], [34, 0], [-34, 0], [0, -52], [0, 52]];
    for (const pin of order) {
      project(pin.p, P2);
      const near = Math.min(...pin.stop.map(s => Math.abs(cur - s)));
      let o = P2[2] <= 0 ? 0 : Math.max(0, 1 - Math.max(0, near - .22) / .32);
      if (!revealed) o = 0;
      if (pin.w === undefined || pin.w === 0) { pin.w = pin.el.offsetWidth; pin.h = pin.el.offsetHeight; }
      if (pin.mode === 'grat') { const safe = cw >= 760 && !portrait() && P2[0] > cw * .46 && P2[0] < cw - railR - 20 && P2[1] > 80 && P2[1] < ch - 30 && !onText(P2[0], P2[1], 90, 16); o *= safe ? .85 : 0; }
      if (pin.mode === 'pin') {
        const half = pin.w / 2;
        const lo = 12 + half, hi = cw - railR - half;
        if (hi > lo) P2[0] = Math.min(hi, Math.max(lo, P2[0]));
        // the bar at the top is 64 px of sticky header and the route dots sit at the foot of
        // a phone: a label is held clear of both rather than dropped, and only let go when
        // the thing it names has genuinely left the frame
        const tg = 86, bg = ch - (portrait() ? 54 : 14);
        if (P2[1] < tg) { if (P2[1] < tg - 170) o = 0; else P2[1] = tg; }
        if (P2[1] > bg) { if (P2[1] > bg + 130) o = 0; else P2[1] = bg; }
      }
      let tf = `translate(${P2[0].toFixed(1)}px,${P2[1].toFixed(1)}px)`;
      let below = false;
      if (pin.mode === 'pin') {
        below = P2[1] < (pin.el.offsetHeight || 70) + 78;
        if (below !== pin.below) { pin.el.classList.toggle('below', below); pin.below = below; }
        tf += below ? ' translate(-50%,10px)' : ' translate(-50%,-100%)';
      }
      // One label to a patch of sky, with a real gap between them: two that merely miss each
      // other stack into the four-line caption block this page was asked to be rid of. But a
      // label that clashes - with another label or with the words on the panel - is pushed
      // clear before it is dropped. On a phone the whole of stop 3 is four words walking up
      // a trail, and dropping three of them loses the stop rather than tidying it.
      let nx = 0, ny = 0;
      if (o > .02 && pin.mode !== 'grat') {
        const gap = 15, by0 = below ? P2[1] + 10 : P2[1] - pin.h;
        const free = (dx, dy) => {
          const bx = P2[0] + dx - pin.w / 2, by = by0 + dy;
          if (by < 72 || by + pin.h > ch - (portrait() ? 46 : 8)) return false;
          if (bx < 8 || bx + pin.w > cw - railR) return false;
          if (onText(P2[0] + dx, P2[1] + dy, pin.w, pin.h)) return false;
          return !taken.some(r => bx < r.x + r.w + 10 && bx + pin.w > r.x - 10
            && by < r.y + r.h + gap && by + pin.h > r.y - gap);
        };
        let ok = false;
        for (const [dx, dy] of CAND) if (free(dx, dy)) { nx = dx; ny = dy; ok = true; break; }
        if (ok) taken.push({ x: P2[0] + nx - pin.w / 2, y: by0 + ny, w: pin.w, h: pin.h });
        else o = 0;
      }
      if (nx || ny) tf += ` translate(${nx}px,${ny}px)`;
      if (pin.mode === 'grat') tf += ' translate(-50%,-100%)';
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
      // the same moon as the relief, so the printed sheet is the same night
      const key = Math.pow(Math.max(0, nx * MOON[0] + ny * MOON[1] + nz * MOON[2]), 1.6);
      const amb = .46 + (ny * .5 + .5) * 1.3;
      const t = Math.max(0, Math.min(1, (heights[k] - .6) / 21));
      const o = ((N - 1 - j) * N + i) * 4;
      const lv = (lo, hi, sl, sh) => {
        const v = (lo + (hi - lo) * t) * amb + (sl + (sh - sl) * t) * key;
        return Math.min(255, v / (1 + v / 255 * .72));
      };
      img.data[o] = lv(3, 8, 86, 198);
      img.data[o + 1] = lv(6, 15, 114, 224);
      img.data[o + 2] = lv(11, 22, 148, 260);
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
    ctx.fillStyle = '#070d18'; ctx.fillRect(0, 0, w, h);
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
      ctx.strokeStyle = k % 5 === 0 ? 'rgba(168,196,232,.5)' : 'rgba(128,156,198,.19)';
      ctx.lineWidth = k % 5 === 0 ? 1.1 : .7;
      ctx.stroke();
    }
    // the streams
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const st of F.streams) {
      ctx.beginPath(); st.p.forEach(([x, z], q) => q ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)));
      ctx.strokeStyle = 'rgba(84,150,200,.6)'; ctx.lineWidth = .5 + st.w * .4; ctx.stroke();
    }
    // the lakes, laid over the contours the way a printed map masks them
    for (const lk of F.lakes) {
      ctx.beginPath(); lk.o.forEach(([x, z], q) => q ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z))); ctx.closePath();
      ctx.fillStyle = '#081827'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,190,228,.8)'; ctx.lineWidth = .9; ctx.stroke();
    }
    // the paths, dashed, with the crest route drawn heavier
    ctx.setLineDash([5, 4]);
    for (const t of F.trails) {
      ctx.strokeStyle = t.w ? 'rgba(140,180,228,.55)' : 'rgba(214,224,240,.42)';
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
    g.addColorStop(0, 'rgba(7,13,24,0)'); g.addColorStop(1, 'rgba(7,13,24,.85)');
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
  try { glctx = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, stencil: true, powerPreference: 'high-performance' }); } catch (e) { glctx = null; }
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
    // where the bake levels a terrace: under every wing of every shelter
    F.pads = F.shelters.flatMap(s => wingsOf(s).map(w => ({ x: w.x, z: w.z, A: w.A, B: w.B, hu: w.ha * w.m, hv: w.hb * w.m })));
    // and the top of Śnieżka, which is a small level summit with the observatory standing on it
    const ob = F.landmarks.obs;
    F.pads.push({ x: ob.x, z: ob.z, A: [1, 0], B: [0, 1], hu: .22, hv: .22 });
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
