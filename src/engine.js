import { H, W, sample } from './geometry.js';
import { PHASES, buildArt } from './art.js';
import { DEVA, MONO, SANS, drawCursor, drawTag, star } from './cursors.js';

/**
 * The reel engine: a team of cursor agents makes the rangoli layer by layer.
 *
 * Every layer is pre-painted off screen. While an agent works, its path is stamped into the
 * layer's mask and only the masked part of the painting shows. A layer may start once every lower
 * layer it actually overlaps (by footprint, not bounding box) is finished, so agents work in
 * parallel wherever the art allows and the stacking order is always right.
 *
 * Timing: the build runs on a simulated clock. A dry run measures how long the schedule takes,
 * and the sim clock is then scaled so the build fills `buildSeconds` of real time.
 *
 * Options: buildSeconds, seed, credit (end card), hud, tags, camera.
 */

const CELL = 12;
const GW = Math.ceil(W / CELL);
const GH = Math.ceil(H / CELL);
const INTRO = 2.4;
const OUTRO = 8.8;
const SETTLE = 0.26;
const TAU = Math.PI * 2;
const COLORS = ['#ffffff', '#5cc8ff', '#7ef0c8', '#ff8fb1', '#b9a8ff', '#ffd479', '#ff9447', '#9be15d', '#ff6b81', '#7fdcff'];
const CODE = [['> ', '#ff7a1a'], ['rangoli', '#f4f4f6'], ['.render(', '#a3a3b4'], ["'radha-rani'", '#ffd479'], [')', '#a3a3b4']];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const easeBack = (u) => 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
function locate(steps, t, seg) {
  while (seg < steps.length && steps[seg].arrive <= t)
    seg++;
  const prev = steps[seg - 1];
  if (seg >= steps.length || t <= prev.leave)
    return { x: prev.x, y: prev.y, paint: false, seg };
  const next = steps[seg];
  const u = (t - prev.leave) / (next.arrive - prev.leave);
  return { x: prev.x + (next.x - prev.x) * u, y: prev.y + (next.y - prev.y) * u, paint: next.paint, seg };
}
export class Reel {
  constructor(canvas, opts) {
    this.speed = 1;
    this.paused = false;
    this.onEnd = null;
    this.twinkles = [];
    this.fx = [];
    this.cam = { x: W / 2, y: H / 2, z: 1 };
    this.k = 1;
    this.clock = 0;
    this.sim = 0;
    this.buildEnd = 0;
    this.group = 'sketch';
    this.phase = 'intro';
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.rand = mulberry32(opts.seed);
    this.noise = this.makeNoise();
    this.floor = this.makeFloor();
    this.vignette = this.makeVignette();
    this.baked = surface(W, H).getContext('2d');
    this.sketch = surface(W, H).getContext('2d');
    const art = buildArt();
    this.glints = art.glints;
    this.runs = this.prepare(art.layers);
    this.agents = this.makeAgents();
    this.simSeconds = this.dryRun();
    this.k = this.simSeconds / opts.buildSeconds;
    this.restart();
  }
  get layerCount() {
    return this.runs.length;
  }
  get agentCount() {
    return this.agents.length;
  }
  get time() {
    return this.clock;
  }
  /** Real seconds the build took at 1x. */
  get buildSeconds() {
    return this.sim / this.k;
  }
  /** Seconds of the whole reel at 1x. */
  get totalSeconds() {
    return INTRO + this.opts.buildSeconds + OUTRO;
  }
  restart() {
    this.reset();
    this.rand = mulberry32(this.opts.seed);
    this.clock = 0;
    this.phase = 'intro';
    this.buildEnd = 0;
    this.group = 'sketch';
    this.cam = { x: W / 2, y: H / 2, z: 1 };
    for (const a of this.agents) {
      a.x = a.enter.x;
      a.y = a.enter.y;
      a.vis = 0;
      a.arrived = false;
    }
    this.render();
  }
  /** Advance by real seconds and draw. */
  frame(realDt) {
    // rAF timestamps can precede the clock we last read, so a negative step is possible.
    const dt = this.paused ? 0 : clamp(realDt, 0, 1 / 20) * this.speed;
    this.clock += dt;
    if (this.phase === 'intro')
      this.intro();
    if (this.phase === 'build' && dt > 0) {
      this.stepSim(dt * this.k, false);
      if (this.runs.every((r) => r.state === 'done'))
        this.startOutro();
    }
    if (this.phase === 'outro') {
      this.outro();
      if (this.clock - this.buildEnd >= OUTRO) {
        this.phase = 'end';
        this.onEnd?.();
      }
    }
    if (dt > 0) {
      this.emit(dt);
      this.updateFx(dt);
      this.updateCamera(dt);
    }
    this.render();
  }
  // ─── setup ────────────────────────────────────────────────────────────────
  prepare(defs) {
    const fc = surface(GW, GH);
    const fctx = fc.getContext('2d', { willReadFrequently: true });
    const scratch = surface(4, 4).getContext('2d');
    const runs = defs.map((def) => {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, GW, GH);
      fctx.setTransform(1 / CELL, 0, 0, 1 / CELL, 0, 0);
      def.draw(fctx);
      const data = fctx.getImageData(0, 0, GW, GH).data;
      const raw = new Uint8Array(GW * GH);
      let x0 = GW;
      let y0 = GH;
      let x1 = -1;
      let y1 = -1;
      let cells = 0;
      for (let i = 0; i < raw.length; i++) {
        if (data[i * 4 + 3] <= 2)
          continue;
        raw[i] = 1;
        cells++;
        const cx = i % GW;
        const cy = (i / GW) | 0;
        x0 = Math.min(x0, cx);
        y0 = Math.min(y0, cy);
        x1 = Math.max(x1, cx);
        y1 = Math.max(y1, cy);
      }
      if (x1 < 0)
        [x0, y0, x1, y1] = [0, 0, 0, 0];
      // Downsampling is area-averaged, so any painted pixel already marks its cell: no padding needed.
      const foot = raw;
      const bx = Math.max(0, x0 * CELL - 14);
      const by = Math.max(0, y0 * CELL - 14);
      const box = { x: bx, y: by, w: Math.min(W, (x1 + 1) * CELL + 14) - bx, h: Math.min(H, (y1 + 1) * CELL + 14) - by };
      const brush = def.kind === 'fill' ? def.brush ?? clamp(Math.sqrt(cells * CELL * CELL) / 6.5, 11, 60) : def.kind === 'dots' ? 8 : (def.width ?? 10) / 2 + 2;
      const speed = def.kind === 'fill' ? 700 + brush * 26 : def.kind === 'sketch' ? 1150 : def.kind === 'line' ? 620 : 1500;
      const tool = def.kind === 'sketch' ? 'pencil' : def.kind === 'line' ? 'pen' : def.kind === 'dots' ? 'cross' : brush >= 34 ? 'brush' : 'cone';
      const run = {
        def, box, foot, deps: [], chunks: [], brush, speed, tool,
        art: this.paintArt(def, box),
        state: 'pending', settle: 0, mask: null, comp: null, dirty: false, pops: [],
      };
      run.chunks = this.chunks(run, scratch);
      return run;
    });
    for (let i = 0; i < runs.length; i++) {
      for (let j = 0; j < i; j++) {
        // Chalk lines look the same whichever is drawn first, so sketches never wait on each other.
        if (runs[i].def.kind === 'sketch' && runs[j].def.kind === 'sketch')
          continue;
        if (this.overlap(runs[i], runs[j]))
          runs[i].deps.push(j);
      }
    }
    return runs;
  }
  overlap(a, b) {
    if (a.box.x > b.box.x + b.box.w || b.box.x > a.box.x + a.box.w || a.box.y > b.box.y + b.box.h || b.box.y > a.box.y + a.box.h)
      return false;
    for (let i = 0; i < a.foot.length; i++)
      if (a.foot[i] && b.foot[i])
        return true;
    return false;
  }
  /** The finished layer, with powder grain and a little spilled powder along its edges. */
  paintArt(def, box) {
    const c = surface(box.w, box.h);
    const g = c.getContext('2d');
    g.translate(-box.x, -box.y);
    def.draw(g);
    if (def.kind !== 'sketch') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const pattern = g.createPattern(this.noise, 'repeat');
      pattern.setTransform(new DOMMatrix().translate(-box.x, -box.y));
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = pattern;
      g.fillRect(0, 0, box.w, box.h);
      g.globalCompositeOperation = 'source-over';
    }
    if (def.kind === 'fill' && def.region) {
      g.setTransform(1, 0, 0, 1, -box.x, -box.y);
      g.fillStyle = def.color;
      for (const d of def.region) {
        for (const p of sample(d, 5)) {
          if (this.rand() > 0.6)
            continue;
          g.globalAlpha = 0.35 + this.rand() * 0.4;
          g.beginPath();
          g.arc(p.x + (this.rand() - 0.5) * 10, p.y + (this.rand() - 0.5) * 10, 0.6 + this.rand() * 1.3, 0, TAU);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
    return c;
  }
  /** Splits a layer's work into one path per crew member. */
  chunks(run, scratch) {
    const { def, box } = run;
    const crew = Math.max(1, def.crew ?? 1);
    let groups = [];
    if (def.kind === 'fill') {
      const path = new Path2D((def.region ?? []).join(' '));
      const r = run.brush;
      const rows = [];
      for (let y = box.y + r * 0.55; y < box.y + box.h; y += r * 1.25) {
        const ints = [];
        let start = -1;
        for (let x = box.x; x <= box.x + box.w + 3; x += 3) {
          const inside = x <= box.x + box.w && scratch.isPointInPath(path, x, y);
          if (inside && start < 0)
            start = x;
          else if (!inside && start >= 0) {
            ints.push([start, x - 3]);
            start = -1;
          }
        }
        if (ints.length)
          rows.push({ y, ints });
      }
      if (!rows.length)
        rows.push({ y: box.y + box.h / 2, ints: [[box.x + box.w / 2 - 4, box.x + box.w / 2 + 4]] });
      const per = Math.ceil(rows.length / crew);
      for (let c = 0; c < crew; c++) {
        const pts = [];
        rows.slice(c * per, (c + 1) * per).forEach((row, i) => {
          const ri = c * per + i;
          const dir = ri % 2 === 0 ? 1 : -1;
          for (const [a0, b0] of dir > 0 ? row.ints : [...row.ints].reverse()) {
            const a = dir > 0 ? a0 : b0;
            const b = dir > 0 ? b0 : a0;
            const n = Math.max(1, Math.ceil(Math.abs(b - a) / 26));
            for (let k = 0; k <= n; k++) {
              const x = a + ((b - a) * k) / n;
              pts.push({ x, y: row.y + Math.sin(x * 0.045 + ri * 1.9) * r * 0.3, paint: k > 0, dwell: 0 });
            }
          }
        });
        groups.push(pts);
      }
    }
    else if (def.kind === 'dots') {
      const dots = def.dots ?? [];
      const per = Math.ceil(dots.length / crew);
      for (let c = 0; c < crew; c++) {
        groups.push(dots.slice(c * per, (c + 1) * per).map((d) => ({ x: d.x, y: d.y, paint: false, dwell: 0.06 + d.r * 0.0025, dot: d })));
      }
    }
    else {
      const traces = (def.trace ?? []).map((d) => sample(d, 7));
      let lists;
      if (traces.length >= crew) {
        // Whole strokes go to whoever has the least to draw.
        const load = new Array(crew).fill(0);
        const sets = Array.from({ length: crew }, () => []);
        for (const t of traces) {
          const i = load.indexOf(Math.min(...load));
          sets[i].push(t);
          load[i] += t.length;
        }
        groups = sets.map((set) => set.flatMap((t) => t.map((p, k) => ({ ...p, paint: k > 0, dwell: 0 }))));
        lists = [];
      }
      else {
        const flat = traces.flat();
        const per = Math.ceil(flat.length / crew);
        lists = Array.from({ length: crew }, (_, c) => flat.slice(c * per, (c + 1) * per + 1));
      }
      for (const l of lists)
        groups.push(l.map((p, k) => ({ ...p, paint: k > 0, dwell: 0 })));
    }
    return groups
      .filter((g) => g.length)
      .map((pts) => {
      const steps = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        let t = 0;
        if (i > 0) {
          const q = steps[i - 1];
          t = q.leave + Math.hypot(p.x - q.x, p.y - q.y) / (p.paint ? run.speed : Math.max(run.speed, 2400));
        }
        steps.push({ x: p.x, y: p.y, paint: p.paint, arrive: t, leave: t + p.dwell, dot: p.dot });
      }
      return { run, steps, duration: steps[steps.length - 1].leave + 0.02, claimed: false, done: false };
    });
  }
  makeAgents() {
    return COLORS.map((color, id) => {
      const a = -Math.PI / 2 + (id / COLORS.length) * TAU;
      const e = a + 0.5;
      return {
        id, color,
        x: 0, y: 0,
        ready: { x: 540 + Math.cos(a) * 300, y: 900 + Math.sin(a) * 300 },
        enter: { x: 540 + Math.cos(e) * 1250, y: 960 + Math.sin(e) * 1250 },
        spawn: 0.35 + id * 0.11,
        arrived: false,
        job: null, tool: 'arrow', trail: [], ripple: 9, emit: 0,
        tour: [], from: { x: 0, y: 0 }, leg: -1, vis: 0,
      };
    });
  }
  reset() {
    for (const run of this.runs) {
      run.state = 'pending';
      run.settle = 0;
      run.mask = null;
      run.comp = null;
      run.dirty = false;
      run.pops = [];
      for (const c of run.chunks) {
        c.claimed = false;
        c.done = false;
      }
    }
    for (const a of this.agents) {
      a.job = null;
      a.tool = 'arrow';
      a.trail = [];
      a.ripple = 9;
      a.leg = -1;
    }
    this.baked.clearRect(0, 0, W, H);
    this.sketch.clearRect(0, 0, W, H);
    this.fx = [];
    this.sim = 0;
  }
  dryRun() {
    this.reset();
    for (const a of this.agents) {
      a.x = a.ready.x;
      a.y = a.ready.y;
    }
    let t = 0;
    while (t < 900 && !this.runs.every((r) => r.state === 'done')) {
      this.stepSim(1 / 60, true);
      t += 1 / 60;
    }
    return t;
  }
  // ─── simulation ───────────────────────────────────────────────────────────
  stepSim(dt, dry) {
    this.sim += dt;
    for (const run of this.runs) {
      if (run.state === 'settling') {
        run.settle += dt;
        if (!dry && run.mask) {
          run.mask.globalAlpha = 1 - Math.pow(0.78, dt * 60);
          run.mask.fillRect(0, 0, run.box.w, run.box.h);
          run.mask.globalAlpha = 1;
          run.dirty = true;
        }
        if (run.settle >= SETTLE)
          this.finish(run, dry);
      }
      if (!dry && run.pops.length && run.mask) {
        const m = run.mask;
        run.pops = run.pops.filter((p) => {
          p.t += dt;
          const u = Math.min(1, p.t / 0.14);
          m.beginPath();
          m.arc(p.x - run.box.x, p.y - run.box.y, p.r * easeBack(u), 0, TAU);
          m.fill();
          run.dirty = true;
          return u < 1;
        });
      }
    }
    const focus = this.focus();
    for (const a of this.agents) {
      if (!a.job)
        this.assign(a, dry);
      if (a.job)
        this.advance(a, dt, dry);
      else
        this.idle(a, dt, focus);
    }
  }
  assign(a, dry) {
    for (const run of this.runs) {
      if (run.state === 'done' || run.state === 'settling')
        continue;
      let best = null;
      let bd = Infinity;
      for (const c of run.chunks) {
        if (c.claimed)
          continue;
        const d = Math.hypot(c.steps[0].x - a.x, c.steps[0].y - a.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best || !run.deps.every((j) => this.runs[j].state === 'done'))
        continue;
      best.claimed = true;
      if (run.state === 'pending') {
        run.state = 'active';
        this.group = run.def.group;
        if (!dry) {
          run.mask = surface(run.box.w, run.box.h).getContext('2d');
          run.mask.fillStyle = '#fff';
          run.comp = surface(run.box.w, run.box.h).getContext('2d');
          run.dirty = true;
        }
      }
      a.job = { chunk: best, phase: 'travel', t: 0, travel: clamp(bd / 2400, 0.16, 0.55), fx: a.x, fy: a.y, seg: 1, next: 0 };
      a.tool = 'arrow';
      return;
    }
  }
  advance(a, dt, dry) {
    const job = a.job;
    const steps = job.chunk.steps;
    if (job.phase === 'travel') {
      job.t += dt;
      const u = Math.min(1, job.t / job.travel);
      const e = ease(u);
      a.x = job.fx + (steps[0].x - job.fx) * e;
      a.y = job.fy + (steps[0].y - job.fy) * e;
      if (u >= 1) {
        job.phase = 'work';
        job.t = 0;
        a.tool = job.chunk.run.tool;
        a.ripple = 0;
      }
      return;
    }
    const run = job.chunk.run;
    const t0 = job.t;
    const t1 = Math.min(job.t + dt, job.chunk.duration);
    while (job.next < steps.length && steps[job.next].arrive <= t1) {
      const s = steps[job.next++];
      if (s.dot && !dry) {
        run.pops.push({ x: s.dot.x, y: s.dot.y, r: s.dot.r + 3, t: 0 });
        this.fx.push({ x: s.dot.x, y: s.dot.y, vx: 0, vy: 0, g: 0, life: 0.4, max: 0.4, size: s.dot.r + 4, color: run.def.color, kind: 'ring' });
      }
    }
    if (!dry && run.def.kind !== 'dots') {
      const spacing = Math.max(2.5, run.brush * (run.def.kind === 'fill' ? 0.38 : 0.45));
      const n = clamp(Math.ceil((run.speed * (t1 - t0)) / spacing), 1, 60);
      let seg = job.seg;
      for (let i = 1; i <= n; i++) {
        const p = locate(steps, t0 + ((t1 - t0) * i) / n, seg);
        seg = p.seg;
        if (p.paint)
          this.dab(run, p.x, p.y);
      }
    }
    job.t = t1;
    const p = locate(steps, t1, job.seg);
    job.seg = p.seg;
    a.x = p.x;
    a.y = p.y;
    if (t1 >= job.chunk.duration) {
      job.chunk.done = true;
      a.job = null;
      if (run.chunks.every((c) => c.done)) {
        run.state = 'settling';
        run.settle = 0;
      }
    }
  }
  dab(run, x, y) {
    const m = run.mask;
    if (!m)
      return;
    const r = run.brush;
    const lx = x - run.box.x;
    const ly = y - run.box.y;
    m.beginPath();
    if (run.def.kind === 'fill') {
      const core = r * 0.6;
      m.moveTo(lx + core, ly);
      m.arc(lx, ly, core, 0, TAU);
      for (let i = 0; i < 14; i++) {
        const a = this.rand() * TAU;
        const d = r * (0.4 + this.rand() * 0.62);
        const gr = r * (0.06 + this.rand() * 0.13);
        const gx = lx + Math.cos(a) * d;
        const gy = ly + Math.sin(a) * d;
        m.moveTo(gx + gr, gy);
        m.arc(gx, gy, gr, 0, TAU);
      }
    }
    else {
      m.moveTo(lx + r, ly);
      m.arc(lx, ly, r, 0, TAU);
    }
    m.fill();
    run.dirty = true;
  }
  finish(run, dry) {
    run.state = 'done';
    if (dry)
      return;
    const target = run.def.kind === 'sketch' ? this.sketch : this.baked;
    target.drawImage(run.art, run.box.x, run.box.y);
    run.mask = null;
    run.comp = null;
    run.pops = [];
  }
  /** Where waiting agents gather: the next layer still to be claimed. */
  focus() {
    const next = this.runs.find((r) => r.state !== 'done' && r.chunks.some((c) => !c.claimed)) ?? this.runs.find((r) => r.state !== 'done');
    return next ? { x: next.box.x + next.box.w / 2, y: next.box.y + next.box.h / 2 } : { x: W / 2, y: H / 2 };
  }
  idle(a, dt, focus) {
    const ang = a.id * 2.399 + this.sim * 0.5;
    const tx = focus.x + Math.cos(ang) * 120;
    const ty = focus.y + Math.sin(ang) * 80;
    const k = 1 - Math.exp(-dt * 2.2);
    a.x += (tx - a.x) * k;
    a.y += (ty - a.y) * k;
    a.tool = 'arrow';
  }
  // ─── intro & outro ────────────────────────────────────────────────────────
  intro() {
    for (const a of this.agents) {
      const local = this.clock - a.spawn;
      if (local < 0)
        continue;
      const u = Math.min(1, local / 0.95);
      const e = easeOut(u);
      a.x = a.enter.x + (a.ready.x - a.enter.x) * e;
      a.y = a.enter.y + (a.ready.y - a.enter.y) * e;
      a.vis = Math.min(1, local / 0.25);
      if (u >= 1 && !a.arrived) {
        a.arrived = true;
        a.ripple = 0;
      }
    }
    if (this.clock >= INTRO) {
      this.phase = 'build';
      for (const a of this.agents) {
        a.x = a.ready.x;
        a.y = a.ready.y;
        a.vis = 1;
      }
    }
  }
  startOutro() {
    this.phase = 'outro';
    this.buildEnd = this.clock;
    for (const a of this.agents) {
      a.job = null;
      a.tool = 'wand';
      a.from = { x: a.x, y: a.y };
      a.tour = Array.from({ length: 5 }, () => this.glints[Math.floor(this.rand() * this.glints.length)]);
      a.leg = -1;
    }
    const pool = [...this.glints];
    this.twinkles = Array.from({ length: Math.min(46, pool.length) }, () => {
      const p = pool.splice(Math.floor(this.rand() * pool.length), 1)[0];
      return { ...p, size: 10 + this.rand() * 14, period: 1.2 + this.rand() * 1.4, phase: this.rand() * TAU };
    });
  }
  outro() {
    const o = this.clock - this.buildEnd;
    const LEG = 0.44;
    for (const a of this.agents) {
      const s = o - 0.1;
      const last = a.tour[a.tour.length - 1];
      if (s < LEG * a.tour.length) {
        const i = Math.max(0, Math.floor(s / LEG));
        if (s < 0)
          continue;
        if (i !== a.leg) {
          if (a.leg >= 0)
            this.sparkle(a.tour[a.leg], a.color);
          a.leg = i;
        }
        const from = i === 0 ? a.from : a.tour[i - 1];
        const to = a.tour[i];
        const e = ease(Math.min(1, ((s - i * LEG) / LEG) * 1.25));
        a.x = from.x + (to.x - from.x) * e;
        a.y = from.y + (to.y - from.y) * e;
      }
      else {
        if (a.leg < a.tour.length) {
          this.sparkle(last, a.color);
          a.leg = a.tour.length;
          a.tool = 'arrow';
        }
        const u = clamp((o - 2.45) / 0.85, 0, 1);
        const dx = last.x - W / 2;
        const dy = last.y - H / 2;
        const dl = Math.hypot(dx, dy) || 1;
        a.x = last.x + (dx / dl) * 1500 * u * u * u;
        a.y = last.y + (dy / dl) * 1500 * u * u * u;
        a.vis = 1 - clamp((u - 0.4) / 0.6, 0, 1);
      }
    }
  }
  sparkle(p, color) {
    for (let i = 0; i < 7; i++) {
      const a = this.rand() * TAU;
      const v = 60 + this.rand() * 140;
      this.fx.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 60, life: 0.7, max: 0.7, size: 6 + this.rand() * 9, color: i % 2 ? '#fff4cf' : color, kind: 'star' });
    }
    this.fx.push({ x: p.x, y: p.y, vx: 0, vy: 0, g: 0, life: 0.5, max: 0.5, size: 26, color: '#ffe3a0', kind: 'ring' });
  }
  // ─── effects & camera ────────────────────────────────────────────────────
  emit(dt) {
    for (const a of this.agents) {
      a.ripple += dt;
      if (this.phase !== 'build' || a.job?.phase !== 'work')
        continue;
      const run = a.job.chunk.run;
      const rate = run.tool === 'cone' ? 190 : run.tool === 'brush' ? 70 : run.tool === 'pencil' ? 30 : 0;
      a.emit += rate * dt;
      while (a.emit >= 1) {
        a.emit -= 1;
        const big = run.tool === 'brush';
        const spread = big ? run.brush * 0.8 : 3;
        this.fx.push({
          x: a.x + (this.rand() - 0.5) * spread,
          y: a.y + (this.rand() - 0.5) * spread,
          vx: (this.rand() - 0.5) * (big ? 60 : 50),
          vy: big ? -10 - this.rand() * 30 : 40 + this.rand() * 120,
          g: big ? 0 : 520,
          life: big ? 0.6 : 0.38,
          max: big ? 0.6 : 0.38,
          size: big ? 3 + this.rand() * 5 : 1.4 + this.rand() * 2.6,
          color: run.tool === 'pencil' ? '#fff6e6' : run.def.color,
          kind: 'dust',
        });
      }
    }
  }
  updateFx(dt) {
    for (const p of this.fx) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.vx *= 1 - dt * 1.5;
      p.life -= dt;
    }
    this.fx = this.fx.filter((p) => p.life > 0);
    if (this.fx.length > 1500)
      this.fx.splice(0, this.fx.length - 1500);
  }
  updateCamera(dt) {
    let tz = 1;
    let tx = W / 2;
    let ty = H / 2;
    if (this.opts.camera && this.phase === 'build') {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const r of this.runs) {
        if (r.state !== 'active' && r.state !== 'settling')
          continue;
        x0 = Math.min(x0, r.box.x);
        y0 = Math.min(y0, r.box.y);
        x1 = Math.max(x1, r.box.x + r.box.w);
        y1 = Math.max(y1, r.box.y + r.box.h);
      }
      if (x1 > x0) {
        tz = clamp(Math.min(W / (x1 - x0 + 380), H / (y1 - y0 + 640)), 1, 1.3);
        tx = (x0 + x1) / 2;
        ty = (y0 + y1) / 2;
      }
      else {
        tz = this.cam.z;
        tx = this.cam.x;
        ty = this.cam.y;
      }
    }
    else if (this.opts.camera && (this.phase === 'outro' || this.phase === 'end')) {
      tz = 1 + 0.05 * ease(clamp((this.clock - this.buildEnd - 2.4) / 6, 0, 1));
      ty = 900;
    }
    const k = 1 - Math.exp(-dt * 1.1);
    this.cam.z += (tz - this.cam.z) * k;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    const hw = W / (2 * this.cam.z);
    const hh = H / (2 * this.cam.z);
    this.cam.x = clamp(this.cam.x, hw, W - hw);
    this.cam.y = clamp(this.cam.y, hh, H - hh);
  }
  // ─── rendering ────────────────────────────────────────────────────────────
  render() {
    const c = this.ctx;
    const { x, y, z } = this.cam;
    const o = this.phase === 'outro' || this.phase === 'end' ? this.clock - this.buildEnd : -1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.setTransform(z, 0, 0, z, W / 2 - x * z, H / 2 - y * z);
    c.drawImage(this.floor, 0, 0);
    this.drawHalo(c, o);
    const sketchAlpha = o < 0 ? 1 : 1 - clamp(o / 1.2, 0, 1);
    if (sketchAlpha > 0) {
      c.globalAlpha = sketchAlpha;
      c.drawImage(this.sketch.canvas, 0, 0);
      c.globalAlpha = 1;
    }
    c.drawImage(this.baked.canvas, 0, 0);
    for (const run of this.runs) {
      if (!run.comp || !run.mask)
        continue;
      if (run.dirty) {
        const cc = run.comp;
        cc.globalCompositeOperation = 'copy';
        cc.drawImage(run.art, 0, 0);
        cc.globalCompositeOperation = 'destination-in';
        cc.drawImage(run.mask.canvas, 0, 0);
        cc.globalCompositeOperation = 'source-over';
        run.dirty = false;
      }
      c.drawImage(run.comp.canvas, run.box.x, run.box.y);
    }
    this.drawSweep(c, o);
    this.drawTwinkles(c, o);
    this.drawParticles(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawCursors(c);
    c.drawImage(this.vignette, 0, 0);
    this.drawHud(c, o);
    this.drawTitle(c, o);
  }
  drawHalo(c, o) {
    const a = o < 0 ? 0.2 : 0.2 + 0.8 * ease(clamp((o - 0.3) / 2.1, 0, 1));
    c.save();
    c.globalAlpha = a * (0.92 + 0.08 * Math.sin(this.clock * 2));
    const g = c.createRadialGradient(540, 640, 30, 540, 640, 760);
    g.addColorStop(0, 'rgba(255,214,140,0.9)');
    g.addColorStop(0.35, 'rgba(255,160,70,0.42)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.translate(540, 640);
    c.rotate(this.clock * 0.05);
    c.fillStyle = 'rgba(255,224,170,0.07)';
    for (let i = 0; i < 18; i++) {
      c.rotate(TAU / 18);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(1100, -60);
      c.lineTo(1100, 60);
      c.closePath();
      c.fill();
    }
    c.restore();
  }
  drawSweep(c, o) {
    const u = (o - 0.7) / 1.6;
    if (o < 0 || u < 0 || u > 1)
      return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.translate(W / 2, H / 2);
    c.rotate(0.35);
    const x = -1000 + u * 2000;
    const g = c.createLinearGradient(x - 170, 0, x + 170, 0);
    g.addColorStop(0, 'rgba(255,236,200,0)');
    g.addColorStop(0.5, 'rgba(255,236,200,0.2)');
    g.addColorStop(1, 'rgba(255,236,200,0)');
    c.fillStyle = g;
    c.fillRect(-W * 1.5, -H, W * 3, H * 2);
    c.restore();
  }
  drawTwinkles(c, o) {
    if (o < 0)
      return;
    const a = clamp((o - 0.6) / 1, 0, 1);
    if (a <= 0)
      return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const t of this.twinkles) {
      const s = t.size * Math.pow(Math.max(0, Math.sin(t.phase + (this.clock * TAU) / t.period)), 3);
      if (s < 0.5)
        continue;
      c.globalAlpha = a;
      const g = c.createRadialGradient(t.x, t.y, 0, t.x, t.y, s * 0.9);
      g.addColorStop(0, 'rgba(255,226,160,0.55)');
      g.addColorStop(1, 'rgba(255,226,160,0)');
      c.fillStyle = g;
      c.fillRect(t.x - s, t.y - s, s * 2, s * 2);
      star(c, t.x, t.y, s, '#fff6dc');
    }
    c.restore();
  }
  drawParticles(c) {
    c.save();
    for (const p of this.fx) {
      const u = p.life / p.max;
      if (p.kind === 'ring') {
        c.globalAlpha = u * 0.9;
        c.strokeStyle = p.color;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(p.x, p.y, p.size + (1 - u) * 22, 0, TAU);
        c.stroke();
      }
      else if (p.kind === 'star') {
        c.globalAlpha = u;
        c.globalCompositeOperation = 'lighter';
        star(c, p.x, p.y, p.size * (0.4 + u * 0.6), p.color);
        c.globalCompositeOperation = 'source-over';
      }
      else {
        c.globalAlpha = Math.min(1, u * 1.6) * 0.9;
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (0.5 + u * 0.5), 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }
  drawCursors(c) {
    const { x: cx, y: cy, z } = this.cam;
    for (const a of this.agents) {
      if (a.vis <= 0.01) {
        a.trail = [];
        continue;
      }
      const sx = (a.x - cx) * z + W / 2;
      const sy = (a.y - cy) * z + H / 2;
      a.trail.push({ x: sx, y: sy });
      if (a.trail.length > 10)
        a.trail.shift();
      c.save();
      c.globalAlpha = a.vis;
      c.lineCap = 'round';
      c.strokeStyle = a.color;
      for (let i = 1; i < a.trail.length; i++) {
        c.globalAlpha = a.vis * (i / a.trail.length) * 0.35;
        c.lineWidth = 1 + (i / a.trail.length) * 4;
        c.beginPath();
        c.moveTo(a.trail[i - 1].x, a.trail[i - 1].y);
        c.lineTo(a.trail[i].x, a.trail[i].y);
        c.stroke();
      }
      if (a.ripple < 0.45) {
        const u = a.ripple / 0.45;
        c.globalAlpha = a.vis * (1 - u);
        c.lineWidth = 3;
        c.beginPath();
        c.arc(sx, sy, 6 + u * 42, 0, TAU);
        c.stroke();
      }
      c.globalAlpha = a.vis;
      const run = a.job?.chunk.run;
      const brush = run ? run.brush * z : 30;
      drawCursor(c, a.tool, sx, sy, a.color, { tint: run?.def.color, brush, t: this.clock });
      if (this.opts.tags && run && this.phase === 'build') {
        const off = a.tool === 'brush' ? brush * 0.72 + 10 : a.tool === 'cross' ? 26 : a.tool === 'arrow' ? 30 : 28;
        drawTag(c, sx + off, sy + off + (a.tool === 'arrow' ? 12 : 0), run.def.label, a.color);
      }
      c.restore();
    }
  }
  drawHud(c, o) {
    if (!this.opts.hud)
      return;
    const alpha = this.phase === 'intro' ? clamp(this.clock / 0.4, 0, 1) : o < 0 ? 1 : 1 - clamp((o - 2.2) / 0.6, 0, 1);
    if (alpha <= 0)
      return;
    const done = this.runs.filter((r) => r.state === 'done').length;
    const total = this.runs.length;
    const progress = this.phase === 'intro' ? 0 : done / total;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(0, 0, W, 6);
    const bar = c.createLinearGradient(0, 0, W, 0);
    bar.addColorStop(0, '#ff7a1a');
    bar.addColorStop(1, '#ffd479');
    c.fillStyle = bar;
    c.fillRect(0, 0, W * progress, 6);
    c.fillStyle = 'rgba(5,5,7,0.55)';
    c.beginPath();
    c.roundRect(40, 64, 560, 112, 18);
    c.fill();
    c.font = `500 30px ${MONO}`;
    c.textBaseline = 'middle';
    const full = CODE.map(([s]) => s).join('').length;
    let chars = Math.floor(clamp((this.clock - 0.15) / 1.1, 0, 1) * full);
    let tx = 64;
    for (const [s, color] of CODE) {
      const part = s.slice(0, Math.max(0, chars));
      chars -= s.length;
      c.fillStyle = color;
      c.fillText(part, tx, 102);
      tx += c.measureText(part).width;
    }
    if (this.phase === 'intro' && Math.floor(this.clock * 3) % 2 === 0)
      drawCursor(c, 'ibeam', tx + 10, 102, '#ffffff');
    c.font = `500 22px ${MONO}`;
    c.fillStyle = '#ffd479';
    const label = this.phase === 'intro' ? 'waking 10 cursor agents' : o >= 0 ? 'finishing · sona glitter' : PHASES[this.group];
    c.fillText(`● ${label}`, 64, 146);
    c.font = `500 24px ${MONO}`;
    c.textAlign = 'right';
    c.fillStyle = 'rgba(244,244,246,0.75)';
    const secs = this.clock;
    c.fillText(`${String(Math.floor(secs / 60)).padStart(2, '0')}:${(secs % 60).toFixed(1).padStart(4, '0')}`, W - 48, 102);
    c.textAlign = 'left';
    this.drawPill(c, done, total, o);
    c.restore();
  }
  drawPill(c, done, total, o) {
    const working = this.agents.filter((a) => a.job).length;
    const finished = o >= 0;
    const text = finished ? `Drawn by ${this.agents.length} agents in ${this.buildSeconds.toFixed(1)}s` : `${working} agents · ${done} / ${total} layers`;
    const badge = finished ? 'Done' : this.phase === 'intro' ? 'Ready' : 'Building';
    c.font = `600 25px ${SANS}`;
    const tw = c.measureText(text).width;
    c.font = `600 21px ${SANS}`;
    const bw = c.measureText(badge).width + 30;
    const barW = finished ? 0 : 110;
    const w = 24 + 66 + 16 + tw + 20 + barW + (barW ? 20 : 0) + bw + 14;
    const x = (W - w) / 2;
    const y = 1652;
    c.fillStyle = 'rgba(16,16,22,0.86)';
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(x, y, w, 72, 36);
    c.fill();
    c.stroke();
    let cx = x + 24;
    for (let i = 0; i < 5; i++) {
      c.fillStyle = COLORS[i];
      c.strokeStyle = '#0f0f15';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx + 10 + i * 12, y + 36, 10, 0, TAU);
      c.fill();
      c.stroke();
    }
    cx += 66 + 16;
    c.font = `600 25px ${SANS}`;
    c.fillStyle = '#f4f4f6';
    c.textBaseline = 'middle';
    c.fillText(text, cx, y + 37);
    cx += tw + 20;
    if (barW) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.roundRect(cx, y + 33, barW, 7, 4);
      c.fill();
      c.fillStyle = '#5cc8ff';
      c.beginPath();
      c.roundRect(cx, y + 33, Math.max(7, (barW * done) / total), 7, 4);
      c.fill();
      cx += barW + 20;
    }
    c.fillStyle = finished ? 'rgba(126,240,200,0.16)' : 'rgba(92,200,255,0.16)';
    c.beginPath();
    c.roundRect(cx, y + 17, bw, 38, 19);
    c.fill();
    c.font = `600 21px ${SANS}`;
    c.fillStyle = finished ? '#7ef0c8' : '#5cc8ff';
    c.fillText(badge, cx + 15, y + 37);
  }
  drawTitle(c, o) {
    if (o < 0)
      return;
    const ta = ease(clamp((o - 2.7) / 0.9, 0, 1));
    if (ta <= 0)
      return;
    c.save();
    c.globalAlpha = ta;
    const top = c.createLinearGradient(0, 0, 0, 330);
    top.addColorStop(0, 'rgba(5,5,7,0.6)');
    top.addColorStop(1, 'rgba(5,5,7,0)');
    c.fillStyle = top;
    c.fillRect(0, 0, W, 330);
    const bottom = c.createLinearGradient(0, 1500, 0, H);
    bottom.addColorStop(0, 'rgba(5,5,7,0)');
    bottom.addColorStop(1, 'rgba(5,5,7,0.82)');
    c.fillStyle = bottom;
    c.fillRect(0, 1500, W, H - 1500);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `400 112px ${DEVA}`;
    const g = c.createLinearGradient(260, 0, 820, 0);
    g.addColorStop(0, '#ffe9b0');
    g.addColorStop(0.5, '#f5bf55');
    g.addColorStop(1, '#ff9a4a');
    c.shadowColor = 'rgba(255,170,70,0.7)';
    c.shadowBlur = 36;
    c.fillStyle = g;
    c.fillText('श्री राधा रानी', W / 2, 150 + (1 - ta) * 18);
    c.shadowBlur = 0;
    c.globalAlpha = ease(clamp((o - 3.3) / 0.9, 0, 1));
    c.font = `500 36px ${SANS}`;
    c.fillStyle = '#f6eee6';
    c.fillText('Radha Rani — a rangoli, rendered in code', W / 2, 1714);
    c.font = `500 23px ${MONO}`;
    c.fillStyle = 'rgba(246,238,230,0.72)';
    c.fillText(`${this.agents.length} cursor agents · ${this.runs.length} layers · ${this.opts.credit}`, W / 2, 1766);
    c.restore();
  }
  // ─── static textures ──────────────────────────────────────────────────────
  makeFloor() {
    const c = surface(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#15110e';
    g.fillRect(0, 0, W, H);
    const r = g.createRadialGradient(540, 900, 0, 540, 900, 1150);
    r.addColorStop(0, 'rgba(70,52,40,0.55)');
    r.addColorStop(1, 'rgba(70,52,40,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 24000; i++) {
      const light = this.rand() < 0.7;
      g.fillStyle = light ? `rgba(255,235,210,${0.03 + this.rand() * 0.07})` : 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.arc(this.rand() * W, this.rand() * H, 0.5 + this.rand() * 1.4, 0, TAU);
      g.fill();
    }
    return c;
  }
  makeVignette() {
    const c = surface(W, H);
    const g = c.getContext('2d');
    const r = g.createRadialGradient(540, 960, 520, 540, 960, 1250);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = r;
    g.fillRect(0, 0, W, H);
    return c;
  }
  makeNoise() {
    const c = surface(256, 256);
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = this.rand();
      const o = i * 4;
      if (v < 0.16) {
        img.data[o] = 255;
        img.data[o + 1] = 250;
        img.data[o + 2] = 240;
        img.data[o + 3] = 64;
      }
      else if (v > 0.86) {
        img.data[o + 3] = 72;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
