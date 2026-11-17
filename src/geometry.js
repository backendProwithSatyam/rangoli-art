/** Reel stage size: a 9:16 Instagram reel at 1080p. All artwork is authored in these units. */
export const W = 1080;
export const H = 1920;
const NS = 'http://www.w3.org/2000/svg';
let probeEl = null;
/** One hidden SVG path reused for length and point sampling (canvas Path2D can't measure). */
function probe(d) {
  if (!probeEl) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    probeEl = document.createElementNS(NS, 'path');
    svg.appendChild(probeEl);
    document.body.appendChild(svg);
  }
  probeEl.setAttribute('d', d);
  return probeEl;
}
/** Points roughly every `step` px along a path, both ends included. */
export function sample(d, step) {
  const p = probe(d);
  const len = p.getTotalLength();
  const n = Math.max(1, Math.round(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const q = p.getPointAtLength((len * i) / n);
    out.push({ x: q.x, y: q.y });
  }
  return out;
}
/** `n` points spread evenly between fractions `a`..`b` of a path's length. */
export function spread(d, n, a = 0, b = 1) {
  const p = probe(d);
  const len = p.getTotalLength();
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1);
    const q = p.getPointAtLength(len * f);
    out.push({ x: q.x, y: q.y });
  }
  return out;
}
const f = (n) => +n.toFixed(2);
/** Mirror an absolute M/L/C/Q/Z path across the vertical centre line. */
export function mirror(d) {
  return d.replace(/([MLCQZ])([^MLCQZ]*)/g, (_m, cmd, args) => {
    const nums = args.match(/-?\d*\.?\d+/g);
    if (!nums)
      return `${cmd} `;
    return `${cmd} ${nums.map((n, i) => (i % 2 === 0 ? f(W - parseFloat(n)) : n)).join(' ')} `;
  });
}
/** Ellipse as four cubic curves, optionally rotated by `deg` about its centre. */
export function ellipsePath(cx, cy, rx, ry, deg = 0) {
  const k = 0.5523;
  const ox = rx * k;
  const oy = ry * k;
  const raw = [
    [rx, 0], [rx, oy], [ox, ry], [0, ry], [-ox, ry], [-rx, oy], [-rx, 0],
    [-rx, -oy], [-ox, -ry], [0, -ry], [ox, -ry], [rx, -oy], [rx, 0],
  ];
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = raw.map(([x, y]) => `${f(cx + x * c - y * s)} ${f(cy + x * s + y * c)}`);
  return `M ${p[0]} C ${p[1]}, ${p[2]}, ${p[3]} C ${p[4]}, ${p[5]}, ${p[6]} C ${p[7]}, ${p[8]}, ${p[9]} C ${p[10]}, ${p[11]}, ${p[12]} Z`;
}
export const circlePath = (cx, cy, r) => ellipsePath(cx, cy, r, r);
/** A pointed petal starting `r0` from (cx, cy) along `deg`, `len` long and about 1.5×`hw` wide. */
export function petal(cx, cy, deg, r0, len, hw) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const bx = cx + dx * r0;
  const by = cy + dy * r0;
  const tx = bx + dx * len;
  const ty = by + dy * len;
  const pt = (along, side) => `${f(bx + dx * len * along + px * hw * side)} ${f(by + dy * len * along + py * hw * side)}`;
  const d = `M ${f(bx)} ${f(by)} C ${pt(0.18, 1.1)}, ${pt(0.72, 0.95)}, ${f(tx)} ${f(ty)} C ${pt(0.72, -0.95)}, ${pt(0.18, -1.1)}, ${f(bx)} ${f(by)} Z`;
  return { d, bx, by, tx, ty };
}
