import { W, circlePath, ellipsePath, mirror, petal, sample, spread } from './geometry.js';

/**
 * Radha Rani as a rangoli, authored as ordered layers on the 1080×1920 stage.
 *
 * Each layer says how a cursor agent "makes" it:
 *   sketch  chalk outline traced with a pencil
 *   line    strokes traced with a pen (kajal, zari, jewellery wire)
 *   fill    powder swept row by row with a cone or a brush
 *   dots    beads, pearls and flowers dropped one at a time with a crosshair
 * and `draw` paints the finished layer. The engine reveals that painting under the agent's path,
 * so `draw` must be deterministic: it is called once for the layer's footprint and once for real.
 *
 * Layer fields:
 *   id, label (the agent's name tag), group (HUD phase), kind, color (powder colour),
 *   region (fill: shapes to sweep), trace (sketch/line: paths to follow), width (line: reveal width),
 *   dots (dots: {x, y, r} to visit), crew (agents sharing the layer), brush (fill: brush radius),
 *   draw(ctx) (paints the finished layer in 1080×1920 coordinates).
 */

export const PHASES = {
  sketch: 'chalk sketch',
  base: 'powder base',
  crown: 'mukut · crown',
  face: 'shringar · face',
  jewels: 'gehne · jewellery',
  flowers: 'phool · flowers',
};
const TAU = Math.PI * 2;
const KAJAL = '#140d0b';
// ─── drawing helpers ────────────────────────────────────────────────────────
const P = (d) => new Path2D(d);
function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops)
    g.addColorStop(o, c);
  return g;
}
function rad(ctx, x, y, r, stops, fx = x, fy = y) {
  const g = ctx.createRadialGradient(fx, fy, 0, x, y, r);
  for (const [o, c] of stops)
    g.addColorStop(o, c);
  return g;
}
function fill(ctx, d, style) {
  ctx.fillStyle = style;
  ctx.fill(P(d));
}
function line(ctx, d, style, width, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(P(d));
  ctx.restore();
}
/** Blurred painting where canvas filters work; a fainter sharp version where they don't (older iPhones). */
function soft(ctx, px, paint) {
  if (typeof ctx.filter === 'string') {
    ctx.filter = `blur(${px}px)`;
    paint();
    ctx.filter = 'none';
  }
  else {
    ctx.save();
    ctx.globalAlpha *= 0.35;
    paint();
    ctx.restore();
  }
}
function disc(ctx, x, y, r, style) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
/** Soft elliptical light or shade. `rgb` is "r,g,b" so the falloff never greys out. */
function glow(ctx, x, y, rx, ry, rgb, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}
const goldLine = (ctx, y0, y1) => lin(ctx, 0, y0, 0, y1, [[0, '#ffe8a3'], [0.5, '#e2b04a'], [1, '#a9741c']]);
function bead(ctx, x, y, r) {
  disc(ctx, x + r * 0.15, y + r * 0.28, r, 'rgba(0,0,0,0.35)');
  disc(ctx, x, y, r, rad(ctx, x, y, r, [[0, '#fff4c4'], [0.35, '#f0c45a'], [0.8, '#b57b1d'], [1, '#6b430f']], x - r * 0.35, y - r * 0.4));
}
function pearl(ctx, x, y, r) {
  disc(ctx, x + r * 0.15, y + r * 0.3, r, 'rgba(0,0,0,0.3)');
  disc(ctx, x, y, r, rad(ctx, x, y, r, [[0, '#ffffff'], [0.5, '#f1ebe4'], [1, '#a99c92']], x - r * 0.35, y - r * 0.4));
}
const GEMS = {
  ruby: ['#ff9a9a', '#d3163a', '#5e0414'],
  emerald: ['#a6f0c4', '#1f9a5a', '#0a3b22'],
  rose: ['#ffd1e0', '#f06a98', '#8a1d47'],
};
function gem(ctx, x, y, r, kind = 'ruby') {
  const s = GEMS[kind];
  disc(ctx, x, y, r * 1.3, rad(ctx, x, y, r * 1.3, [[0, '#f6d37a'], [1, '#8a5a12']]));
  disc(ctx, x, y, r, rad(ctx, x, y, r, [[0, s[0]], [0.55, s[1]], [1, s[2]]], x - r * 0.3, y - r * 0.35));
  disc(ctx, x - r * 0.3, y - r * 0.35, r * 0.24, 'rgba(255,255,255,0.8)');
}
function drawPetals(ctx, petals, stops, vein) {
  for (const p of petals) {
    fill(ctx, p.d, lin(ctx, p.bx, p.by, p.tx, p.ty, stops));
    line(ctx, p.d, 'rgba(255,255,255,0.72)', 2.4);
    const dx = (p.tx - p.bx) / Math.hypot(p.tx - p.bx, p.ty - p.by);
    const dy = (p.ty - p.by) / Math.hypot(p.tx - p.bx, p.ty - p.by);
    const len = Math.hypot(p.tx - p.bx, p.ty - p.by);
    line(ctx, `M ${p.bx + dx * len * 0.12} ${p.by + dy * len * 0.12} L ${p.tx - dx * len * 0.18} ${p.ty - dy * len * 0.18}`, vein, 2);
  }
}
/** A top-down lotus: two rings of petals around a golden seed pod. */
function rosette(ctx, cx, cy, R, outer, inner) {
  drawPetals(ctx, Array.from({ length: 8 }, (_, i) => petal(cx, cy, i * 45 - 90, R * 0.1, R * 0.9, R * 0.36)), outer, 'rgba(200,120,140,0.3)');
  drawPetals(ctx, Array.from({ length: 8 }, (_, i) => petal(cx, cy, i * 45 - 67.5, R * 0.06, R * 0.62, R * 0.3)), inner, 'rgba(200,120,140,0.25)');
  disc(ctx, cx, cy, R * 0.22, rad(ctx, cx, cy, R * 0.22, [[0, '#fff3a0'], [1, '#d99a2b']]));
  for (let i = 0; i < 8; i++)
    disc(ctx, cx + Math.cos((i * TAU) / 8) * R * 0.12, cy + Math.sin((i * TAU) / 8) * R * 0.12, R * 0.03, '#8a5a12');
}
function lotusPetals(bx, by, size) {
  const make = (list, hw) => list.map(([deg, l]) => petal(bx, by, deg, size * 0.04, size * l, size * hw));
  return {
    back: make([[-155, 0.78], [-125, 0.95], [-90, 1], [-55, 0.95], [-25, 0.78]], 0.3),
    front: make([[-140, 0.7], [-108, 0.84], [-72, 0.84], [-40, 0.7]], 0.27),
    core: make([[-90, 0.62]], 0.25),
  };
}
function sideLotus(ctx, bx, by, size) {
  const p = lotusPetals(bx, by, size);
  drawPetals(ctx, p.back, [[0, '#e05a88'], [0.6, '#f7b6ca'], [1, '#fff0f4']], 'rgba(170,40,90,0.3)');
  drawPetals(ctx, p.front, [[0, '#bf2f62'], [0.6, '#ee8aab'], [1, '#ffe0ea']], 'rgba(150,30,70,0.32)');
  drawPetals(ctx, p.core, [[0, '#b0244f'], [1, '#ffc9da']], 'rgba(150,30,70,0.3)');
  glow(ctx, bx, by - 6, size * 0.2, size * 0.08, '40,90,40', 0.9);
}
function leaf(ctx, cx, cy, rx, ry, deg) {
  const d = ellipsePath(cx, cy, rx, ry, deg);
  fill(ctx, d, rad(ctx, cx, cy, rx, [[0, '#4f9a59'], [0.7, '#2c6b3a'], [1, '#1a4426']]));
  line(ctx, d, 'rgba(170,230,160,0.35)', 2.5);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(190,240,180,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.85, 0);
  ctx.lineTo(rx * 0.85, 0);
  for (let i = -3; i <= 3; i++) {
    const x = (i / 4) * rx;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rx * 0.12, -ry * 0.7);
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rx * 0.12, ry * 0.7);
  }
  ctx.stroke();
  ctx.restore();
}
function jasmine(ctx, x, y, r, rot) {
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * TAU) / 5;
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.55, r * 0.32, a, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,175,150,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  disc(ctx, x, y, r * 0.24, '#e9c95a');
}
function lashes(ctx, pts) {
  const n = pts.length;
  for (let i = Math.floor(n * 0.45); i < n - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const tl = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const tx = (q.x - p.x) / tl;
    const ty = (q.y - p.y) / tl;
    let nx = ty;
    let ny = -tx;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const len = 8 + (i / n) * 10;
    const ex = p.x + nx * len + tx * len * 0.5;
    const ey = p.y + ny * len + ty * len * 0.5;
    line(ctx, `M ${p.x} ${p.y} Q ${p.x + nx * len * 0.75} ${p.y + ny * len * 0.75}, ${ex} ${ey}`, KAJAL, 2.2);
  }
}
// ─── shapes ─────────────────────────────────────────────────────────────────
const VEIL = 'M 540 290 C 770 290, 905 420, 935 640 C 965 860, 945 1090, 985 1330 C 1015 1500, 1060 1640, 1080 1740 L 1080 1920 L 0 1920 L 0 1740 C 20 1640, 65 1500, 95 1330 C 135 1090, 115 860, 145 640 C 175 420, 310 290, 540 290 Z';
const VEIL_EDGE = 'M 18 1765 C 40 1640, 82 1500, 112 1332 C 152 1090, 132 862, 162 644 C 192 436, 322 308, 540 308 C 758 308, 888 436, 918 644 C 948 862, 928 1090, 968 1332 C 998 1500, 1040 1640, 1062 1765';
const VEIL_DOTS = 'M 44 1770 C 66 1640, 106 1500, 136 1334 C 176 1090, 156 862, 186 646 C 216 452, 338 330, 540 330 C 742 330, 864 452, 894 646 C 924 862, 904 1090, 944 1334 C 974 1500, 1014 1640, 1036 1770';
const VEIL_LIGHT = ['M 196 700 C 172 950, 192 1200, 140 1500', 'M 150 1380 C 120 1580, 84 1760, 70 1920', 'M 270 1520 C 236 1660, 206 1800, 196 1920'];
const VEIL_SHADE = ['M 226 720 C 204 960, 222 1210, 170 1500', 'M 182 1420 C 150 1600, 120 1770, 110 1920'];
const PETALS_BACK = Array.from({ length: 13 }, (_, i) => petal(540, 705, -168 + i * 13, 285, 190, 56));
const PETALS_FRONT = Array.from({ length: 12 }, (_, i) => petal(540, 705, -161.5 + i * 13, 266, 140, 44));
const PETAL_ARC = 'M 70 590 C 100 330, 320 228, 540 228 C 760 228, 980 330, 1010 590';
const HAIR = 'M 540 545 C 705 545, 835 630, 858 790 C 880 950, 850 1080, 868 1240 C 882 1360, 845 1450, 770 1500 C 720 1420, 660 1330, 640 1180 L 640 1080 L 440 1080 L 440 1180 C 420 1330, 360 1420, 310 1500 C 235 1450, 198 1360, 212 1240 C 230 1080, 200 950, 222 790 C 245 630, 375 545, 540 545 Z';
const NECK = 'M 455 1060 L 625 1060 L 628 1280 C 650 1335, 740 1390, 880 1490 C 770 1460, 670 1500, 540 1610 C 410 1500, 310 1460, 200 1490 C 340 1390, 430 1335, 452 1280 Z';
const NECKLINE = 'M 200 1490 C 310 1460, 410 1500, 540 1610 C 670 1500, 770 1460, 880 1490';
const BLOUSE = `${NECKLINE} C 960 1540, 1010 1660, 1030 1920 L 50 1920 C 70 1660, 120 1540, 200 1490 Z`;
const DRAPE_EDGE_L = 'M 302 636 C 250 756, 224 902, 238 1064 C 252 1226, 236 1372, 154 1522 C 112 1600, 92 1720, 84 1920';
const DRAPE_L = `${DRAPE_EDGE_L} L 0 1920 L 0 1720 C 38 1580, 82 1450, 112 1325 C 150 1150, 140 980, 158 838 C 174 726, 226 658, 302 636 Z`;
const DRAPE_FOLD_L = 'M 204 760 C 182 960, 194 1180, 124 1420';
const EAR_L = 'M 300 812 C 268 790, 244 832, 252 884 C 260 936, 284 968, 314 960 C 302 920, 298 866, 300 812 Z';
const EAR_IN_L = 'M 290 842 C 272 852, 270 892, 286 922';
const FACE = 'M 540 598 C 655 598, 762 640, 786 760 C 802 850, 793 945, 762 1025 C 722 1115, 632 1182, 540 1194 C 448 1182, 358 1115, 318 1025 C 287 945, 278 850, 294 760 C 318 640, 425 598, 540 598 Z';
const BAND = 'M 282 668 C 330 560, 440 515, 540 515 C 640 515, 750 560, 798 668 C 760 640, 660 600, 540 600 C 420 600, 320 640, 282 668 Z';
const BAND_TOP = 'M 282 668 C 330 560, 440 515, 540 515 C 640 515, 750 560, 798 668';
const BAND_BOTTOM = 'M 282 668 C 320 640, 420 600, 540 600 C 660 600, 760 640, 798 668';
const ROW_OUT = 'M 304 646 C 350 566, 446 532, 540 532 C 634 532, 730 566, 776 646';
const ROW_MID = 'M 298 657 C 345 598, 440 563, 540 563 C 640 563, 735 598, 782 657';
const ROW_PEARL = 'M 292 670 C 338 636, 430 604, 540 603 C 650 604, 742 636, 788 670';
const JEWEL = 'M 540 352 C 574 394, 612 438, 612 490 C 612 534, 580 566, 540 566 C 500 566, 468 534, 468 490 C 468 438, 506 394, 540 352 Z';
const JEWEL_IN = 'M 540 392 C 562 420, 588 452, 588 492 C 588 524, 566 546, 540 546 C 514 546, 492 524, 492 492 C 492 452, 518 420, 540 392 Z';
const BROW_L = 'M 336 772 C 382 716, 470 706, 518 742 C 470 724, 392 732, 336 772 Z';
const BROW_LINE_L = 'M 338 770 C 384 721, 470 714, 516 741';
const BROW_DOTS_L = 'M 350 740 C 390 694, 466 686, 512 712';
const EYE_L = 'M 506 850 C 472 806, 396 798, 348 832 C 394 872, 466 880, 506 850 Z';
const LID_L = 'M 507 851 C 473 803, 396 794, 347 829';
const WING_L = 'M 352 828 C 338 821, 324 810, 307 796 C 322 813, 335 827, 350 836 Z';
const WING_LINE_L = 'M 350 830 C 336 820, 322 809, 308 798';
const LOWER_L = 'M 350 834 C 395 873, 466 880, 505 852';
const CREASE_L = 'M 497 826 C 462 790, 400 784, 362 806';
const NOSE_SIDE = 'M 523 858 C 518 915, 507 955, 509 984';
const NOSTRIL_L = 'M 509 984 C 500 996, 506 1007, 521 1005';
const NOSE_TIP = 'M 524 1007 C 532 1011, 548 1011, 556 1007';
const LIP_UP = 'M 488 1072 C 506 1058, 526 1052, 540 1062 C 554 1052, 574 1058, 592 1072 C 572 1080, 554 1082, 540 1081 C 526 1082, 508 1080, 488 1072 Z';
const LIP_LO = 'M 492 1075 C 512 1083, 568 1083, 588 1075 C 576 1104, 504 1104, 492 1075 Z';
const MOUTH = 'M 486 1072 C 510 1081, 570 1081, 594 1072';
const BINDI = 'M 540 746 C 549 760, 553 771, 540 786 C 527 771, 531 760, 540 746 Z';
const NATH = { x: 598, y: 1034, rx: 46, ry: 52 };
const NATH_RING = ellipsePath(NATH.x, NATH.y, NATH.rx, NATH.ry);
const NATH_CHAIN = 'M 641 1016 C 690 1010, 752 975, 792 905';
const CHOKER = 'M 456 1238 C 492 1282, 588 1282, 624 1238';
const STRANDS = [
  ['M 452 1285 C 470 1370, 610 1370, 628 1285', 5.4],
  ['M 440 1300 C 450 1440, 630 1440, 640 1300', 6],
  ['M 425 1320 C 430 1510, 650 1510, 655 1320', 6.6],
];
const PENDANT = 'M 540 1468 C 562 1488, 572 1506, 572 1520 C 572 1540, 558 1552, 540 1552 C 522 1552, 508 1540, 508 1520 C 508 1506, 518 1488, 540 1468 Z';
const LEAVES = [
  [150, 1792, 160, 62, -18],
  [330, 1872, 122, 48, 8],
  [930, 1800, 160, 62, 18],
  [752, 1874, 122, 48, -8],
];
const WHITE_LOTUS = [[0, '#f0bccb'], [0.55, '#fde9ee'], [1, '#ffffff']];
const WHITE_LOTUS_IN = [[0, '#f5cfd9'], [1, '#ffffff']];
const PINK_LOTUS = [[0, '#c7386a'], [1, '#ffd3e0']];
const PINK_LOTUS_IN = [[0, '#e05a86'], [1, '#ffe7ef']];
// ─── the artwork ────────────────────────────────────────────────────────────
export function buildArt() {
  const layers = [];
  const glints = [];
  const add = (l) => layers.push(l);
  const mx = (p) => ({ x: W - p.x, y: p.y });
  // 1 · chalk sketch: quick pencil outlines the powder later covers.
  const chalk = (paths) => (ctx) => {
    for (const d of paths) {
      line(ctx, d, 'rgba(255,246,230,0.62)', 3.4);
      ctx.save();
      ctx.translate(1.6, -1.2);
      line(ctx, d, 'rgba(255,246,230,0.28)', 1.4);
      ctx.restore();
    }
  };
  const sketch = (id, paths, crew = 1) => add({ id: `sketch-${id}`, label: `chalk · ${id}`, group: 'sketch', kind: 'sketch', color: '#fff6e6', trace: paths, width: 9, crew, draw: chalk(paths) });
  sketch('veil', [VEIL_EDGE], 2);
  sketch('petals', [PETAL_ARC]);
  sketch('hair', [HAIR], 2);
  sketch('face', [FACE]);
  sketch('eyes', [EYE_L, mirror(EYE_L), BROW_LINE_L, mirror(BROW_LINE_L)], 2);
  sketch('lips', [NOSE_SIDE, LIP_UP, LIP_LO]);
  sketch('crown', [BAND_TOP, BAND_BOTTOM, JEWEL], 2);
  sketch('body', [NECK, NECKLINE], 2);
  // 2 · powder base
  add({
    id: 'veil', label: 'odhni · veil', group: 'base', kind: 'fill', color: '#efe2dc', region: [VEIL], crew: 6,
    draw: (ctx) => {
      const p = P(VEIL);
      ctx.fillStyle = lin(ctx, 0, 290, 0, 1920, [[0, '#f5ece6'], [0.45, '#ecdcd8'], [1, '#d8bec2']]);
      ctx.fill(p);
      ctx.save();
      ctx.clip(p);
      glow(ctx, 540, 900, 430, 640, '74,36,42', 0.45);
      soft(ctx, 9, () => {
        for (const d of VEIL_LIGHT) {
          line(ctx, d, 'rgba(255,255,255,0.6)', 20);
          line(ctx, mirror(d), 'rgba(255,255,255,0.6)', 20);
        }
        for (const d of VEIL_SHADE) {
          line(ctx, d, 'rgba(140,96,108,0.34)', 16);
          line(ctx, mirror(d), 'rgba(140,96,108,0.34)', 16);
        }
      });
      ctx.restore();
      line(ctx, VEIL_EDGE, '#7a4f14', 13);
      line(ctx, VEIL_EDGE, goldLine(ctx, 300, 1800), 9);
    },
  });
  // The petal crest hides the top of the border, so those beads are never placed.
  const veilDots = sample(VEIL_DOTS, 30)
    .map((p, i) => ({ ...p, r: i % 2 ? 4.6 : 6.5 }))
    .filter((p) => p.y > 670);
  veilDots.forEach((p, i) => i % 4 === 0 && glints.push(p));
  add({
    id: 'veil-dots', label: 'sona · veil border', group: 'base', kind: 'dots', color: '#e2b04a', dots: veilDots, crew: 4,
    draw: (ctx) => veilDots.forEach((p, i) => (i % 2 ? gem(ctx, p.x, p.y, 3.4, 'rose') : bead(ctx, p.x, p.y, 6.5))),
  });
  add({
    id: 'petals-back', label: 'gulal · petals', group: 'base', kind: 'fill', color: '#f2a9c0', region: PETALS_BACK.map((p) => p.d), crew: 4,
    draw: (ctx) => drawPetals(ctx, PETALS_BACK, [[0, '#cf4f7c'], [0.5, '#f2a3bc'], [1, '#fff0f4']], 'rgba(180,50,95,0.35)'),
  });
  add({
    id: 'petals-front', label: 'gulal · inner petals', group: 'base', kind: 'fill', color: '#e07a9c', region: PETALS_FRONT.map((p) => p.d), crew: 3,
    draw: (ctx) => drawPetals(ctx, PETALS_FRONT, [[0, '#ad2a57'], [0.55, '#e9819f'], [1, '#ffdbe6']], 'rgba(150,30,70,0.35)'),
  });
  add({
    id: 'hair', label: 'kesh · hair', group: 'base', kind: 'fill', color: '#2a1d19', region: [HAIR], crew: 5,
    draw: (ctx) => {
      const p = P(HAIR);
      ctx.fillStyle = lin(ctx, 0, 545, 0, 1500, [[0, '#1d1513'], [1, '#0c0808']]);
      ctx.fill(p);
      ctx.save();
      ctx.clip(p);
      for (let k = 0; k < 16; k++) {
        const d = `M ${540 - 22 - k * 11} 556 C ${400 - k * 9} ${588 + k * 3}, ${262 + k} ${762 + k * 4}, ${250 + k * 2} 1000 C ${238 + k * 2} 1222, ${262 + k * 3} 1382, ${318 + k * 2} 1496`;
        const a = 0.2 + (k % 3) * 0.08;
        line(ctx, d, `rgba(96,72,62,${a})`, 2.2);
        line(ctx, mirror(d), `rgba(96,72,62,${a})`, 2.2);
      }
      glow(ctx, 262, 930, 40, 230, '150,120,104', 0.22);
      glow(ctx, 818, 930, 40, 230, '150,120,104', 0.22);
      ctx.restore();
    },
  });
  add({
    id: 'neck', label: 'chandan · skin', group: 'base', kind: 'fill', color: '#f0ae80', region: [NECK], crew: 3,
    draw: (ctx) => {
      const p = P(NECK);
      ctx.fillStyle = lin(ctx, 0, 1060, 0, 1600, [[0, '#c97a4e'], [0.25, '#eba374'], [1, '#f3b98d']]);
      ctx.fill(p);
      ctx.save();
      ctx.clip(p);
      glow(ctx, 540, 1125, 160, 95, '120,50,25', 0.55);
      glow(ctx, 466, 1200, 26, 140, '150,70,40', 0.35);
      glow(ctx, 614, 1200, 26, 140, '150,70,40', 0.35);
      line(ctx, 'M 420 1385 C 470 1400, 510 1398, 532 1390', 'rgba(170,90,55,0.45)', 4);
      line(ctx, mirror('M 420 1385 C 470 1400, 510 1398, 532 1390'), 'rgba(170,90,55,0.45)', 4);
      glow(ctx, 540, 1480, 120, 70, '255,222,196', 0.3);
      ctx.restore();
    },
  });
  add({
    id: 'blouse', label: 'sindoori · blouse', group: 'base', kind: 'fill', color: '#8a1f33', region: [BLOUSE], crew: 4,
    draw: (ctx) => {
      const p = P(BLOUSE);
      ctx.fillStyle = lin(ctx, 0, 1480, 0, 1920, [[0, '#8f2136'], [1, '#4a0c19']]);
      ctx.fill(p);
      ctx.save();
      ctx.clip(p);
      for (let y = 1530, row = 0; y < 1920; y += 44, row++) {
        for (let x = 60 + (row % 2) * 22; x < 1030; x += 44) {
          disc(ctx, x, y, 3.2, 'rgba(240,196,90,0.75)');
          disc(ctx, x, y, 1.3, '#fff1c0');
        }
      }
      glow(ctx, 540, 1720, 280, 170, '30,0,8', 0.4);
      ctx.restore();
    },
  });
  const neckBeads = sample(NECKLINE, 24);
  neckBeads.forEach((p, i) => i % 3 === 0 && glints.push(p));
  add({
    id: 'blouse-border', label: 'zari · border', group: 'base', kind: 'line', color: '#e2b04a', trace: [NECKLINE], width: 30, crew: 2,
    draw: (ctx) => {
      line(ctx, NECKLINE, '#5e3a0c', 22);
      line(ctx, NECKLINE, goldLine(ctx, 1460, 1610), 17);
      line(ctx, NECKLINE, '#9b1b30', 5);
      neckBeads.forEach((p) => bead(ctx, p.x, p.y, 4));
    },
  });
  const drape = (shape, edge, fold) => (ctx) => {
    const p = P(shape);
    ctx.fillStyle = 'rgba(250,244,240,0.8)';
    ctx.fill(p);
    ctx.save();
    ctx.clip(p);
    soft(ctx, 8, () => line(ctx, fold, 'rgba(255,255,255,0.75)', 16));
    ctx.restore();
    line(ctx, edge, '#6e4510', 15);
    line(ctx, edge, goldLine(ctx, 640, 1920), 11);
    sample(edge, 20).forEach((q, i) => disc(ctx, q.x, q.y, i % 2 ? 2.6 : 2.2, i % 2 ? '#b3162f' : '#fff4cc'));
  };
  add({ id: 'drape-l', label: 'odhni · drape', group: 'base', kind: 'fill', color: '#f6eeea', region: [DRAPE_L], crew: 2, draw: drape(DRAPE_L, DRAPE_EDGE_L, DRAPE_FOLD_L) });
  add({ id: 'drape-r', label: 'odhni · drape', group: 'base', kind: 'fill', color: '#f6eeea', region: [mirror(DRAPE_L)], crew: 2, draw: drape(mirror(DRAPE_L), mirror(DRAPE_EDGE_L), mirror(DRAPE_FOLD_L)) });
  const ear = (ctx, shape, inner, x0, x1) => {
    fill(ctx, shape, lin(ctx, x0, 0, x1, 0, [[0, '#d27b4c'], [1, '#eda374']]));
    line(ctx, inner, 'rgba(140,60,35,0.6)', 4);
  };
  add({
    id: 'face', label: 'chandan · face', group: 'base', kind: 'fill', color: '#f4b487', region: [FACE, EAR_L, mirror(EAR_L)], crew: 4,
    draw: (ctx) => {
      ear(ctx, EAR_L, EAR_IN_L, 250, 314);
      ear(ctx, mirror(EAR_L), mirror(EAR_IN_L), W - 250, W - 314);
      const face = P(FACE);
      ctx.fillStyle = rad(ctx, 540, 870, 430, [[0, '#fbd0a9'], [0.5, '#f2ab7b'], [0.85, '#e08d5c'], [1, '#c97247']]);
      ctx.fill(face);
      ctx.save();
      ctx.clip(face);
      ctx.fillStyle = lin(ctx, 0, 598, 0, 720, [[0, 'rgba(110,40,25,0.6)'], [1, 'rgba(110,40,25,0)']]);
      ctx.fillRect(250, 590, 580, 140);
      glow(ctx, 300, 900, 70, 220, '160,70,40', 0.35);
      glow(ctx, 780, 900, 70, 220, '160,70,40', 0.35);
      glow(ctx, 540, 1190, 210, 60, '150,60,35', 0.35);
      glow(ctx, 392, 968, 90, 66, '236,92,96', 0.34);
      glow(ctx, 688, 968, 90, 66, '236,92,96', 0.34);
      glow(ctx, 428, 830, 92, 44, '170,80,50', 0.22);
      glow(ctx, 652, 830, 92, 44, '170,80,50', 0.22);
      glow(ctx, 548, 905, 16, 80, '255,236,214', 0.45);
      glow(ctx, 520, 940, 12, 55, '170,85,50', 0.28);
      glow(ctx, 540, 1022, 34, 12, '160,70,45', 0.35);
      glow(ctx, 540, 1112, 40, 14, '160,70,45', 0.3);
      glow(ctx, 540, 1150, 42, 22, '255,226,200', 0.35);
      glow(ctx, 540, 700, 110, 40, '255,226,200', 0.25);
      ctx.restore();
    },
  });
  // 3 · mukut (crown)
  add({
    id: 'band', label: 'kumkum · mukut', group: 'crown', kind: 'fill', color: '#8f1c36', region: [BAND],
    draw: (ctx) => {
      fill(ctx, BAND, lin(ctx, 0, 515, 0, 668, [[0, '#951d39'], [1, '#5a0e21']]));
      line(ctx, BAND_TOP, '#5a3a0a', 9);
      line(ctx, BAND_TOP, goldLine(ctx, 515, 668), 6);
      line(ctx, BAND_BOTTOM, '#5a3a0a', 8);
      line(ctx, BAND_BOTTOM, goldLine(ctx, 600, 668), 5);
    },
  });
  const rowOut = sample(ROW_OUT, 24).map((p) => ({ ...p, r: 10.5 }));
  rowOut.forEach((p, i) => i % 2 === 0 && glints.push(p));
  add({ id: 'beads', label: 'sona · beads', group: 'crown', kind: 'dots', color: '#f0c45a', dots: rowOut, crew: 2, draw: (ctx) => rowOut.forEach((p) => bead(ctx, p.x, p.y, p.r)) });
  const rowMid = sample(ROW_MID, 19).map((p, i) => ({ ...p, r: i % 2 ? 4.5 : 6 }));
  rowMid.forEach((p, i) => i % 4 === 0 && glints.push(p));
  add({
    id: 'stones', label: 'kumkum · stones', group: 'crown', kind: 'dots', color: '#d3163a', dots: rowMid, crew: 2,
    draw: (ctx) => rowMid.forEach((p, i) => (i % 2 ? bead(ctx, p.x, p.y, 4.5) : gem(ctx, p.x, p.y, 5.2, i % 4 === 0 ? 'ruby' : 'emerald'))),
  });
  const rowPearl = sample(ROW_PEARL, 13.5).map((p) => ({ ...p, r: 6.2 }));
  add({ id: 'pearl-row', label: 'moti · pearls', group: 'crown', kind: 'dots', color: '#f4efe8', dots: rowPearl, crew: 3, draw: (ctx) => rowPearl.forEach((p) => pearl(ctx, p.x, p.y, p.r)) });
  const jewelPearls = sample(JEWEL_IN, 15);
  glints.push({ x: 540, y: 496 }, { x: 540, y: 432 }, { x: 540, y: 372 });
  add({
    id: 'jewel', label: 'sona · jewel', group: 'crown', kind: 'fill', color: '#eab84d', region: [JEWEL],
    draw: (ctx) => {
      fill(ctx, JEWEL, rad(ctx, 540, 470, 140, [[0, '#fff0b0'], [0.45, '#eab84d'], [1, '#9a6416']], 520, 430));
      line(ctx, JEWEL, '#4e3208', 3);
      fill(ctx, JEWEL_IN, lin(ctx, 0, 392, 0, 546, [[0, '#a3173f'], [1, '#5c0a22']]));
      line(ctx, JEWEL_IN, '#f3cf74', 3);
      jewelPearls.forEach((p) => pearl(ctx, p.x, p.y, 3.8));
      for (let i = 0; i < 6; i++)
        gem(ctx, 540 + Math.cos((i * TAU) / 6) * 32, 496 + Math.sin((i * TAU) / 6) * 32, 3.6, 'emerald');
      gem(ctx, 540, 496, 17, 'ruby');
      gem(ctx, 540, 432, 7, 'rose');
    },
  });
  const lotusAt = (id, x, y, R, outer, inner, label, color) => add({ id, label, group: 'crown', kind: 'fill', color, region: [circlePath(x, y, R)], draw: (ctx) => rosette(ctx, x, y, R, outer, inner) });
  lotusAt('lotus-crown-l', 408, 528, 58, WHITE_LOTUS, WHITE_LOTUS_IN, 'kamal · lotus', '#fde9ee');
  lotusAt('lotus-crown-r', W - 408, 528, 58, WHITE_LOTUS, WHITE_LOTUS_IN, 'kamal · lotus', '#fde9ee');
  lotusAt('rose-crown-l', 318, 606, 38, PINK_LOTUS, PINK_LOTUS_IN, 'gulab · lotus', '#ec7fa3');
  lotusAt('rose-crown-r', W - 318, 606, 38, PINK_LOTUS, PINK_LOTUS_IN, 'gulab · lotus', '#ec7fa3');
  const tikka = [612, 624, 636, 648, 660].map((y) => ({ x: 540, y, r: 4.5 }));
  tikka.push({ x: 540, y: 682, r: 17 }, { x: 540, y: 708, r: 7 });
  glints.push({ x: 540, y: 682 });
  add({
    id: 'tikka', label: 'sona · tikka', group: 'crown', kind: 'dots', color: '#f0c45a', dots: tikka,
    draw: (ctx) => {
      line(ctx, 'M 540 606 L 540 668', '#8a5a12', 2);
      tikka.slice(0, 5).forEach((p) => bead(ctx, p.x, p.y, p.r));
      bead(ctx, 540, 682, 17);
      for (let i = 0; i < 10; i++)
        pearl(ctx, 540 + Math.cos((i * TAU) / 10) * 15, 682 + Math.sin((i * TAU) / 10) * 15, 2.8);
      gem(ctx, 540, 682, 8, 'ruby');
      pearl(ctx, 540, 708, 7);
    },
  });
  // 4 · shringar (face details)
  const brow = (shape) => (ctx) => {
    fill(ctx, shape, '#1c110d');
    line(ctx, shape, 'rgba(28,17,13,0.6)', 1.5);
  };
  add({ id: 'brow-l', label: 'kajal · brow', group: 'face', kind: 'line', color: KAJAL, trace: [BROW_LINE_L], width: 18, draw: brow(BROW_L) });
  add({ id: 'brow-r', label: 'kajal · brow', group: 'face', kind: 'line', color: KAJAL, trace: [mirror(BROW_LINE_L)], width: 18, draw: brow(mirror(BROW_L)) });
  const browDotsL = spread(BROW_DOTS_L, 7).map((p, i) => ({ ...p, r: i % 2 ? 3.8 : 4.6 }));
  const browDots = (dots) => (ctx) => dots.forEach((p, i) => {
    disc(ctx, p.x + 0.8, p.y + 1.2, p.r, 'rgba(0,0,0,0.25)');
    disc(ctx, p.x, p.y, p.r, i % 2 ? '#c8152f' : '#fffaf2');
  });
  add({ id: 'dots-l', label: 'bindu · dots', group: 'face', kind: 'dots', color: '#fffaf2', dots: browDotsL, draw: browDots(browDotsL) });
  const browDotsR = browDotsL.map((p) => ({ ...mx(p), r: p.r }));
  add({ id: 'dots-r', label: 'bindu · dots', group: 'face', kind: 'dots', color: '#fffaf2', dots: browDotsR, draw: browDots(browDotsR) });
  const eyeWhite = (shape, inner) => (ctx) => {
    const p = P(shape);
    ctx.fillStyle = '#fbf4ee';
    ctx.fill(p);
    ctx.save();
    ctx.clip(p);
    glow(ctx, inner, 849, 22, 15, '236,140,140', 0.75);
    ctx.fillStyle = lin(ctx, 0, 798, 0, 842, [[0, 'rgba(120,70,60,0.5)'], [1, 'rgba(120,70,60,0)']]);
    ctx.fillRect(0, 790, W, 60);
    ctx.restore();
  };
  add({ id: 'eye-l', label: 'safed · eye', group: 'face', kind: 'fill', color: '#fbf4ee', region: [EYE_L], brush: 13, draw: eyeWhite(EYE_L, 500) });
  add({ id: 'eye-r', label: 'safed · eye', group: 'face', kind: 'fill', color: '#fbf4ee', region: [mirror(EYE_L)], brush: 13, draw: eyeWhite(mirror(EYE_L), W - 500) });
  // Both irises glance the same way, so they are shifted, not mirrored.
  const iris = (shape, cx, cy) => (ctx) => {
    const r = 31;
    ctx.save();
    ctx.clip(P(shape));
    disc(ctx, cx, cy, r, rad(ctx, cx, cy, r, [[0, '#c4e7ff'], [0.35, '#6aaee6'], [0.78, '#2a62a0'], [1, '#0f2747']]));
    ctx.strokeStyle = 'rgba(220,240,255,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const a = (i * TAU) / 26;
      ctx.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
      ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
    }
    ctx.stroke();
    disc(ctx, cx, cy, 12.5, '#06070b');
    ctx.fillStyle = lin(ctx, 0, cy - r, 0, cy - 2, [[0, 'rgba(10,15,30,0.6)'], [1, 'rgba(10,15,30,0)']]);
    ctx.fillRect(cx - r, cy - r, r * 2, r);
    disc(ctx, cx + 9, cy - 10, 6.5, 'rgba(255,255,255,0.95)');
    disc(ctx, cx - 9, cy + 9, 2.6, 'rgba(255,255,255,0.8)');
    ctx.restore();
  };
  add({ id: 'iris-l', label: 'neel · iris', group: 'face', kind: 'fill', color: '#4d8fd6', region: [circlePath(442, 838, 31)], brush: 12, draw: iris(EYE_L, 442, 838) });
  add({ id: 'iris-r', label: 'neel · iris', group: 'face', kind: 'fill', color: '#4d8fd6', region: [circlePath(668, 838, 31)], brush: 12, draw: iris(mirror(EYE_L), 668, 838) });
  const lidL = sample(LID_L, 8);
  const lidR = sample(mirror(LID_L), 8);
  const lids = (lid, wing, lower, crease, lashPts) => (ctx) => {
    line(ctx, crease, '#9a5233', 2.5, 0.75);
    line(ctx, lower, '#3b1d15', 3.2, 0.9);
    line(ctx, lid, KAJAL, 8);
    fill(ctx, wing, KAJAL);
    lashes(ctx, lashPts);
  };
  add({
    id: 'lid-l', label: 'kajal · eyelid', group: 'face', kind: 'line', color: KAJAL, trace: [LID_L, WING_LINE_L, LOWER_L, CREASE_L], width: 16,
    draw: lids(LID_L, WING_L, LOWER_L, CREASE_L, lidL),
  });
  add({
    id: 'lid-r', label: 'kajal · eyelid', group: 'face', kind: 'line', color: KAJAL,
    trace: [mirror(LID_L), mirror(WING_LINE_L), mirror(LOWER_L), mirror(CREASE_L)], width: 16,
    draw: lids(mirror(LID_L), mirror(WING_L), mirror(LOWER_L), mirror(CREASE_L), lidR),
  });
  add({
    id: 'nose', label: 'chandan · nose', group: 'face', kind: 'line', color: '#b5643c', trace: [NOSE_SIDE, NOSTRIL_L, NOSE_TIP, mirror(NOSTRIL_L)], width: 12,
    draw: (ctx) => {
      line(ctx, NOSE_SIDE, '#b5643c', 3, 0.55);
      line(ctx, NOSTRIL_L, '#9c4f2f', 3);
      line(ctx, mirror(NOSTRIL_L), '#9c4f2f', 3);
      line(ctx, NOSE_TIP, '#9c4f2f', 2.6, 0.8);
      glow(ctx, 548, 992, 14, 8, '255,236,214', 0.5);
    },
  });
  add({
    id: 'lips', label: 'kumkum · lips', group: 'face', kind: 'fill', color: '#c42b3c', region: [LIP_UP, LIP_LO], brush: 12,
    draw: (ctx) => {
      fill(ctx, LIP_UP, lin(ctx, 0, 1054, 0, 1082, [[0, '#c93246'], [1, '#9e1d31']]));
      fill(ctx, LIP_LO, lin(ctx, 0, 1076, 0, 1102, [[0, '#dc4553'], [1, '#a51f33']]));
      glow(ctx, 540, 1089, 22, 6, '255,220,220', 0.45);
      line(ctx, MOUTH, '#5a0f1a', 3);
      line(ctx, 'M 486 1072 C 482 1069, 480 1066, 481 1063', '#7a2a24', 2, 0.7);
      line(ctx, 'M 594 1072 C 598 1069, 600 1066, 599 1063', '#7a2a24', 2, 0.7);
    },
  });
  add({
    id: 'til', label: 'kajal · til', group: 'face', kind: 'dots', color: KAJAL, dots: [{ x: 468, y: 1120, r: 6 }],
    draw: (ctx) => disc(ctx, 468, 1120, 6, rad(ctx, 468, 1120, 6, [[0, '#2b1a14'], [1, '#0d0806']])),
  });
  const bindiDots = [{ x: 540, y: 768, r: 15 }, { x: 540, y: 735, r: 4 }, { x: 523, y: 770, r: 3 }, { x: 557, y: 770, r: 3 }];
  add({
    id: 'bindi', label: 'sindoor · bindi', group: 'face', kind: 'dots', color: '#c4142c', dots: bindiDots,
    draw: (ctx) => {
      fill(ctx, BINDI, rad(ctx, 540, 770, 22, [[0, '#ff5a6e'], [0.6, '#c4142c'], [1, '#7a0716']], 536, 762));
      disc(ctx, 537, 762, 3, 'rgba(255,255,255,0.7)');
      disc(ctx, 540, 735, 4, '#fffaf2');
      disc(ctx, 523, 770, 3, '#fffaf2');
      disc(ctx, 557, 770, 3, '#fffaf2');
    },
  });
  // 5 · gehne (jewellery)
  const nathChain = sample(NATH_CHAIN, 10.5);
  const nathPearls = Array.from({ length: 9 }, (_, k) => {
    const a = ((20 + k * 17.5) * Math.PI) / 180;
    return { x: NATH.x + Math.cos(a) * NATH.rx, y: NATH.y + Math.sin(a) * NATH.ry };
  });
  glints.push(nathPearls[2], nathPearls[6], { x: NATH.x, y: NATH.y + NATH.ry }, { x: 572, y: 992 });
  add({
    id: 'nath', label: 'sona · nath', group: 'jewels', kind: 'line', color: '#e2b04a', trace: [NATH_RING, NATH_CHAIN], width: 20,
    draw: (ctx) => {
      nathChain.forEach((p, i) => (i % 2 ? bead(ctx, p.x, p.y, 3.6) : pearl(ctx, p.x, p.y, 3.8)));
      line(ctx, NATH_RING, '#5a3a0a', 9);
      line(ctx, NATH_RING, lin(ctx, 552, 982, 644, 1086, [[0, '#fff1b5'], [0.45, '#e2b04a'], [1, '#8a5a12']]), 6);
      nathPearls.forEach((p) => pearl(ctx, p.x, p.y, 5.2));
      gem(ctx, NATH.x, NATH.y + NATH.ry, 6, 'ruby');
      bead(ctx, 572, 992, 7);
      gem(ctx, 572, 992, 3.2, 'rose');
    },
  });
  const jhumkaDots = (cx) => [
    { x: cx, y: 966, r: 14 },
    { x: cx, y: 986, r: 5 },
    { x: cx, y: 1014, r: 38 },
    ...[-24, -12, 0, 12, 24].map((d) => ({ x: cx + d, y: 1050, r: 6 })),
  ];
  const jhumka = (cx) => (ctx) => {
    line(ctx, `M ${cx} 970 L ${cx} 998`, '#8a5a12', 3);
    bead(ctx, cx, 986, 4);
    for (let i = 0; i < 6; i++)
      bead(ctx, cx + Math.cos((i * TAU) / 6) * 8, 966 + Math.sin((i * TAU) / 6) * 8, 5);
    gem(ctx, cx, 966, 5.5, 'ruby');
    const dome = `M ${cx - 34} 1030 C ${cx - 34} 1000, ${cx - 18} 994, ${cx} 994 C ${cx + 18} 994, ${cx + 34} 1000, ${cx + 34} 1030 Z`;
    fill(ctx, dome, rad(ctx, cx - 8, 1004, 44, [[0, '#fff1b0'], [0.5, '#e2b04a'], [1, '#8a5a12']]));
    line(ctx, dome, '#5a3a0a', 2);
    for (let i = 0; i < 5; i++)
      gem(ctx, cx - 20 + i * 10, 1016, 2.6, i % 2 ? 'emerald' : 'ruby');
    ctx.fillStyle = '#9a6a1a';
    ctx.fillRect(cx - 36, 1027, 72, 6);
    for (let i = 0; i < 9; i++) {
      const x = cx - 32 + i * 8;
      const y = i % 2 ? 1046 : 1052;
      line(ctx, `M ${x} 1033 L ${x} ${y - 4}`, '#b8862a', 1.5);
      pearl(ctx, x, y, 3.8);
    }
  };
  glints.push({ x: 296, y: 1006 }, { x: W - 296, y: 1006 }, { x: 296, y: 966 }, { x: W - 296, y: 966 });
  add({ id: 'jhumka-l', label: 'sona · jhumka', group: 'jewels', kind: 'dots', color: '#e2b04a', dots: jhumkaDots(296), draw: jhumka(296) });
  add({ id: 'jhumka-r', label: 'sona · jhumka', group: 'jewels', kind: 'dots', color: '#e2b04a', dots: jhumkaDots(W - 296), draw: jhumka(W - 296) });
  const chokerStones = spread(CHOKER, 9, 0.06, 0.94);
  chokerStones.forEach((p, i) => i % 2 === 0 && glints.push(p));
  add({
    id: 'choker', label: 'sona · choker', group: 'jewels', kind: 'line', color: '#e2b04a', trace: [CHOKER], width: 34,
    draw: (ctx) => {
      line(ctx, CHOKER, '#5a3a0a', 22);
      line(ctx, CHOKER, goldLine(ctx, 1236, 1280), 17);
      chokerStones.forEach((p, i) => {
        gem(ctx, p.x, p.y, 5, i % 2 ? 'emerald' : 'ruby');
        line(ctx, `M ${p.x} ${p.y + 7} L ${p.x} ${p.y + 12}`, '#b8862a', 1.5);
        pearl(ctx, p.x, p.y + 15, 3.6);
      });
    },
  });
  const strandPearls = STRANDS.flatMap(([d, r]) => sample(d, r * 2 + 1.6).map((p) => ({ ...p, r })));
  strandPearls.forEach((p, i) => i % 9 === 0 && glints.push(p));
  add({ id: 'mala', label: 'moti · mala', group: 'jewels', kind: 'dots', color: '#f4efe8', dots: strandPearls, crew: 3, draw: (ctx) => strandPearls.forEach((p) => pearl(ctx, p.x, p.y, p.r)) });
  glints.push({ x: 540, y: 1514 }, { x: 540, y: 1566 });
  add({
    id: 'pendant', label: 'sona · pendant', group: 'jewels', kind: 'fill', color: '#eab84d', region: [PENDANT], brush: 14,
    draw: (ctx) => {
      fill(ctx, PENDANT, rad(ctx, 534, 1500, 70, [[0, '#fff0b0'], [0.5, '#e2b04a'], [1, '#8a5a12']]));
      line(ctx, PENDANT, '#5a3a0a', 2.5);
      gem(ctx, 540, 1516, 13, 'ruby');
      for (let i = 0; i < 8; i++)
        pearl(ctx, 540 + Math.cos((i * TAU) / 8) * 22, 1516 + Math.sin((i * TAU) / 8) * 24, 2.8);
      line(ctx, 'M 540 1552 L 540 1560', '#b8862a', 2);
      pearl(ctx, 540, 1566, 7);
    },
  });
  // 6 · phool (flowers)
  const gajraL = spread(DRAPE_EDGE_L, 9, 0.1, 0.62).map((p) => ({ ...p, r: 15 }));
  const gajra = (dots) => (ctx) => dots.forEach((p, i) => jasmine(ctx, p.x, p.y, 13, i * 0.7));
  add({ id: 'gajra-l', label: 'mogra · gajra', group: 'flowers', kind: 'dots', color: '#fffdf7', dots: gajraL, draw: gajra(gajraL) });
  const gajraR = gajraL.map((p) => ({ ...mx(p), r: p.r }));
  add({ id: 'gajra-r', label: 'mogra · gajra', group: 'flowers', kind: 'dots', color: '#fffdf7', dots: gajraR, draw: gajra(gajraR) });
  add({
    id: 'leaves', label: 'hara · leaves', group: 'flowers', kind: 'fill', color: '#3f8a4c', crew: 2,
    region: LEAVES.map(([x, y, rx, ry, deg]) => ellipsePath(x, y, rx, ry, deg)),
    draw: (ctx) => LEAVES.forEach(([x, y, rx, ry, deg]) => leaf(ctx, x, y, rx, ry, deg)),
  });
  const lotusRegion = (bx, by, size) => {
    const p = lotusPetals(bx, by, size);
    return [...p.back, ...p.front, ...p.core].map((q) => q.d);
  };
  add({ id: 'lotus-l', label: 'kamal · lotus', group: 'flowers', kind: 'fill', color: '#ee8aab', region: lotusRegion(200, 1748, 150), draw: (ctx) => sideLotus(ctx, 200, 1748, 150) });
  add({ id: 'lotus-r', label: 'kamal · lotus', group: 'flowers', kind: 'fill', color: '#ee8aab', region: lotusRegion(880, 1762, 140), draw: (ctx) => sideLotus(ctx, 880, 1762, 140) });
  return { layers, glints };
}
