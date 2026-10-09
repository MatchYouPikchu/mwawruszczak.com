// Sound 001, "Night survey": generated live with Web Audio. Starts only on a click.
// A low pad, soft wind, and an occasional survey ping that makes the contour lines glow.
const MW = (window.MW = window.MW || { beat: 0 });
let ctx, master, nodes = [], pingTimer = 0, decayTimer = 0;

function pad(freq, detune, type, gain) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  const g = ctx.createGain(); g.gain.value = gain;
  o.connect(g); o.start();
  return { o, g };
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  // the pad: D2, A2, D3, F#3 through a breathing low-pass
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = .7;
  const lfo = ctx.createOscillator(); lfo.frequency.value = .045;
  const lfoG = ctx.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
  [[73.42, -6, 'sawtooth', .05], [73.42, 7, 'triangle', .07], [110, -4, 'triangle', .05], [146.83, 5, 'sine', .05], [185, -8, 'sine', .022]]
    .forEach(([f, dt, ty, ga]) => { const p = pad(f, dt, ty, ga); p.g.connect(lp); nodes.push(p.o); });
  lp.connect(master);

  // wind: filtered noise with a slow sweep
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b = 0; for (let i = 0; i < len; i++) { b = .985 * b + (Math.random() * 2 - 1) * .15; d[i] = b; }
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = .6;
  const wl = ctx.createOscillator(); wl.frequency.value = .07; const wg = ctx.createGain(); wg.gain.value = 180; wl.connect(wg).connect(bp.frequency); wl.start();
  const ng = ctx.createGain(); ng.gain.value = .5;
  noise.connect(bp).connect(ng).connect(master); noise.start();
  nodes.push(lfo, wl, noise);
}

const NOTES = [587.33, 659.25, 880, 987.77, 1174.66];
function ping() {
  if (!ctx) return;
  const t = ctx.currentTime, f = NOTES[Math.floor(Math.random() * NOTES.length)];
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
  const g2 = ctx.createGain(); g2.gain.value = .25;
  const dl = ctx.createDelay(); dl.delayTime.value = .38; const fb = ctx.createGain(); fb.gain.value = .32;
  o.connect(g); o2.connect(g2).connect(g); g.connect(master); g.connect(dl); dl.connect(fb).connect(dl); dl.connect(master);
  o.start(t); o2.start(t); o.stop(t + 3.4); o2.stop(t + 3.4);
  MW.beat = 1;
  pingTimer = setTimeout(ping, 5200 + Math.random() * 6500);
}

export function start() {
  if (!ctx) build();
  ctx.resume();
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(.55, t + 2.2);
  clearTimeout(pingTimer); pingTimer = setTimeout(ping, 1400);
  clearInterval(decayTimer); decayTimer = setInterval(() => { MW.beat *= .9; }, 50);
}

export function stop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 1.2);
  clearTimeout(pingTimer);
  setTimeout(() => { if (master.gain.value < .01) ctx.suspend(); clearInterval(decayTimer); MW.beat = 0; }, 1400);
}
