// Bakes the terrain for the map in a worker, so the page never stutters.
// The land is the real Karkonosze: a Copernicus GLO-30 elevation tile, resampled to the
// bake's own grid and encoded as a PNG (v = (metres + 100) * 10, R = v>>8, G = v&255).
// Out: two RGBA half-float textures and a float copy of the heights for the main thread.
//   map: R height, G distance to water, B distance to a path, A path arc length (signed)
//   aux: R warm light (shelters), G cool light (relay, observatory), B valley glow, A water
'use strict';

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sm = t => t * t * (3 - 2 * t);

// float32 -> float16 bits
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0];
  let bits = (x >> 16) & 0x8000, m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) { bits |= 0x7c00; bits |= ((e === 255) ? 0 : 1) && (x & 0x007fffff); return bits; }
  if (e < 113) { m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits; }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

// --- decoding the elevation tile -------------------------------------------------
// The bytes must arrive untouched, so the decode asks for no colour management and no
// premultiplying. If a browser has no OffscreenCanvas in workers, the page decodes instead.
async function pixelsOf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('heightmap ' + res.status);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const w = bmp.width, h = bmp.height;          // close() zeroes these, so read them first
  const oc = new OffscreenCanvas(w, h);
  const ctx = oc.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  bmp.close();
  return { px, w, h };
}

let job = null;

const run = (px, w, h) => {
  try { bake(job, px, w, h); }
  catch (err) { self.postMessage({ failed: String(err) }); }
};
self.onmessage = async e => {
  if (e.data.pixels) { run(e.data.pixels, e.data.w, e.data.h); return; }
  job = e.data;
  let got;
  try { got = await pixelsOf(job.hm); }
  catch (err) {
    if (typeof OffscreenCanvas === 'undefined') { self.postMessage({ needPixels: 1 }); return; }
    self.postMessage({ failed: String(err) }); return;
  }
  run(got.px, got.w, got.h);
};

function bake({ N, W, D, cx, cz, F }, px, pw, ph) {
  const n2 = N * N;
  const x0 = cx - W / 2, z0 = cz + D / 2, sx = W / N, sz = D / N;     // cell (i,j) centre: x0+(i+.5)sx, z0-(j+.5)sz
  const X = i => x0 + (i + .5) * sx, Z = j => z0 - (j + .5) * sz;
  const CI = x => (x - x0) / sx - .5, CJ = z => (z0 - z) / sz - .5;   // inverse, in cell units
  const REF = F.meta.scale.ref, K = F.meta.scale.k;

  // ---- elevation, in metres ----
  const el = new Float32Array(n2);
  if (!(pw > 0) || !(ph > 0)) throw new Error('empty heightmap');
  if (pw !== N || ph !== N) {   // only if a resampled tile ever has to stand in
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = ((Math.min(ph - 1, Math.round(j * ph / N)) * pw) + Math.min(pw - 1, Math.round(i * pw / N))) * 4;
      el[j * N + i] = ((px[o] << 8) | px[o + 1]) / 10 - 100;
    }
  } else {
    for (let k = 0, o = 0; k < n2; k++, o += 4) el[k] = ((px[o] << 8) | px[o + 1]) / 10 - 100;
  }

  // ---- the forest belt, lightly smoothed ----
  // It is a surface model, so below the treeline the contours are drawing the canopy. A
  // 1-2-1 blur, faded out above 1300 m, takes the fuzz off without touching the cirques.
  const tmp = new Float32Array(n2), kw = new Float32Array(n2);
  for (let k = 0; k < n2; k++) kw[k] = .34 * (1 - sm(clamp01((el[k] - 1180) / 160)));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, a = el[k - (i > 0 ? 1 : 0)], b = el[k + (i < N - 1 ? 1 : 0)];
    tmp[k] = (a + 2 * el[k] + b) * .25;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, a = tmp[k - (j > 0 ? N : 0)], b = tmp[k + (j < N - 1 ? N : 0)];
    el[k] += ((a + 2 * tmp[k] + b) * .25 - el[k]) * kw[k];
  }

  // ---- the water: real outlines, filled and levelled ----
  const wat = new Float32Array(n2);           // coverage, 0..1
  const levels = [];                          // each lake's surface, in world units
  const SUB = [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3], [0, 0]];
  for (const lake of F.lakes) {
    const o = lake.o;
    let ax = 1e9, bx = -1e9, az = 1e9, bz = -1e9;
    for (const [x, z] of o) { ax = Math.min(ax, x); bx = Math.max(bx, x); az = Math.min(az, z); bz = Math.max(bz, z); }
    const i0 = Math.max(0, Math.floor(CI(ax) - 1)), i1 = Math.min(N - 1, Math.ceil(CI(bx) + 1));
    const j0 = Math.max(0, Math.floor(CJ(bz) - 1)), j1 = Math.min(N - 1, Math.ceil(CJ(az) + 1));
    const cells = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let hit = 0;
      for (const [du, dv] of SUB) {
        const qx = X(i) + du * sx, qz = Z(j) + dv * sz;
        let inside = false;
        for (let a = 0, b = o.length - 1; a < o.length; b = a++) {
          if ((o[a][1] > qz) !== (o[b][1] > qz) &&
            qx < (o[b][0] - o[a][0]) * (qz - o[a][1]) / (o[b][1] - o[a][1]) + o[a][0]) inside = !inside;
        }
        if (inside) hit++;
      }
      if (hit) cells.push([j * N + i, hit / SUB.length]);
    }
    // a tarn smaller than one cell still gets a glint: mark the cell under its centre
    if (!cells.length) cells.push([Math.max(0, Math.min(N - 1, Math.round(CJ(lake.z)))) * N +
      Math.max(0, Math.min(N - 1, Math.round(CI(lake.x)))), .7]);
    let lev = lake.l;
    if (!lev) {                                 // valley water: the surface is what the DSM read
      const vals = cells.filter(c => c[1] > .5).map(c => el[c[0]]).sort((a, b) => a - b);
      lev = vals.length ? vals[Math.floor(vals.length * .35)] : el[cells[0][0]];
    }
    levels.push((lev - REF) * K);
    for (const [k, c] of cells) {
      wat[k] = Math.max(wat[k], c);
      el[k] += (lev - el[k]) * sm(clamp01((c - .2) / .6));
    }
    // No bank may stand above its own water, one cell out: the shoreline is drawn at the
    // surface, and between two cells the mesh climbs away from it fast enough to swallow it.
    for (const [k] of cells) {
      const i = k % N, j = (k / N) | 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const q = (j + b) * N + (i + a);
        if (i + a >= 0 && i + a < N && j + b >= 0 && j + b < N && el[q] > lev) el[q] = lev;
      }
    }
  }

  // ---- heights, in world units ----
  const heights = new Float32Array(n2);
  for (let k = 0; k < n2; k++) heights[k] = (el[k] - REF) * K;

  // The streams, the shorelines and the paths are not in here: a distance field sampled at
  // 66 m draws them as blocks. They are drawn as real geometry instead, in world.js.

  // ---- the lights, as fields on the ground ----
  const warm = new Float32Array(n2), cool = new Float32Array(n2), glow = new Float32Array(n2);
  const pool = (arr, x, z, r, a) => {
    const i0 = Math.max(0, Math.floor(CI(x - r))), i1 = Math.min(N - 1, Math.ceil(CI(x + r)));
    const j0 = Math.max(0, Math.floor(CJ(z + r))), j1 = Math.min(N - 1, Math.ceil(CJ(z - r)));
    for (let j = j0; j <= j1; j++) { const dz = Z(j) - z; for (let i = i0; i <= i1; i++) { const dx = X(i) - x, k = j * N + i; const q = 1 - clamp01(Math.hypot(dx, dz) / r); arr[k] = Math.min(1.35, arr[k] + a * q * q * (3 - 2 * q) * .5 + a * q * q * q * .5); } }
  };
  // The pools are smaller and softer than the first cut: the hut itself is drawn now, so the
  // light on the ground only has to say that someone is in it, not stand in for the building.
  for (const s of F.shelters) pool(warm, s.x, s.z, s.p ? 2.3 : 1.7, s.p ? .8 : .48);
  pool(cool, F.landmarks.rton.x, F.landmarks.rton.z, 3.1, 1.05);
  pool(cool, F.landmarks.obs.x, F.landmarks.obs.z, 1.8, .7);
  for (const t of F.towns) {
    const s = Math.sqrt(t.p);
    pool(glow, t.x, t.z, 2.2 + s * .1, Math.min(.85, .1 + s * .012));
  }

  // ---- pack ----
  const tex = new Uint16Array(n2 * 4), aux = new Uint16Array(n2 * 4);
  for (let k = 0, o = 0; k < n2; k++, o += 4) {
    tex[o] = toHalf(heights[k]);
    aux[o] = toHalf(Math.min(1.35, warm[k]));
    aux[o + 1] = toHalf(Math.min(1.2, cool[k]));
    aux[o + 2] = toHalf(Math.min(1, glow[k]));
    aux[o + 3] = toHalf(wat[k]);
  }
  self.postMessage({ heights, tex, aux, levels }, [heights.buffer, tex.buffer, aux.buffer]);
}
