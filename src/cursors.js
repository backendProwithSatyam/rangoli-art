/**
 * The agents' cursors, drawn on the reel canvas in screen space so they keep their size while the
 * camera zooms. The arrow, crosshair and I-beam match the portfolio's agent build; the pencil, pen,
 * powder cone, brush ring and wand are the rangoli tools.
 */
export const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
export const DEVA = '"Tiro Devanagari Hindi", "Noto Serif Devanagari", "Nirmala UI", Mangal, serif';
const INK = '#0b0b10';
const S = 1.7;
const TAU = Math.PI * 2;
const ARROW = new Path2D('M0 0 L0 23.5 L5.6 18.3 L9.6 27.4 L13.4 25.7 L9.5 16.8 L17 16.6 Z');
const IBEAM = new Path2D('M6 2.5h1.5c.9 0 1.5.6 1.5 1.5v10c0 .9.6 1.5 1.5 1.5H12M12 2.5h-1.5c-.9 0-1.5.6-1.5 1.5M6 15.5h1.5c.9 0 1.5-.6 1.5-1.5');
export function drawCursor(ctx, tool, x, y, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (tool) {
    case 'arrow':
      ctx.scale(S, S);
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = color;
      ctx.fill(ARROW);
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = INK;
      ctx.stroke(ARROW);
      break;
    case 'cross': {
      ctx.scale(S, S);
      const shape = () => {
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, TAU);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.moveTo(dx * 5, dy * 5);
          ctx.lineTo(dx * 15, dy * 15);
        }
      };
      shape();
      ctx.lineWidth = 3.8;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
      shape();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 1.7, 0, TAU);
      ctx.fill();
      break;
    }
    case 'ibeam':
      ctx.scale(S * 1.25, S * 1.25);
      ctx.translate(-9, -9);
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke(IBEAM);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.stroke(IBEAM);
      break;
    case 'pencil':
      ctx.scale(S, S);
      ctx.rotate(-Math.PI / 4);
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#f3d2a2';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(11, -5);
      ctx.lineTo(11, 5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = color;
      ctx.fillRect(11, -5, 26, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(11, -5, 26, 3);
      ctx.fillStyle = '#c9c9d4';
      ctx.fillRect(37, -5, 5, 10);
      ctx.fillStyle = '#ff8fb1';
      ctx.fillRect(42, -5, 6, 10);
      ctx.fillStyle = '#fff6e6';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(4, -1.8);
      ctx.lineTo(4, 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(11, -5);
      ctx.lineTo(48, -5);
      ctx.lineTo(48, 5);
      ctx.lineTo(11, 5);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'pen': {
      ctx.scale(S, S);
      ctx.rotate(-Math.PI / 4);
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 5;
      const nib = new Path2D('M0 0 C 6 -3, 14 -7, 20 -7 L 24 -6 L 24 6 L 20 7 C 14 7, 6 3, 0 0 Z');
      const g = ctx.createLinearGradient(0, -7, 0, 7);
      g.addColorStop(0, '#fff0b0');
      g.addColorStop(0.5, '#e2b04a');
      g.addColorStop(1, '#9a6416');
      ctx.fillStyle = g;
      ctx.fill(nib);
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = INK;
      ctx.stroke(nib);
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(15.5, 0, 1.6, 0, TAU);
      ctx.fill();
      ctx.fillRect(24, -6.5, 7, 13);
      ctx.fillStyle = color;
      ctx.fillRect(31, -7, 22, 14);
      ctx.strokeRect(31, -7, 22, 14);
      break;
    }
    case 'cone': {
      // A paper rangoli cone: powder trickles from the tip.
      ctx.scale(S, S);
      ctx.rotate((-58 * Math.PI) / 180);
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 5;
      const body = new Path2D('M 0 -1.6 L 32 -12 L 32 12 L 0 1.6 Z');
      ctx.fillStyle = '#efe2c8';
      ctx.fill(body);
      ctx.shadowColor = 'transparent';
      ctx.save();
      ctx.clip(body);
      ctx.fillStyle = color;
      ctx.fillRect(20, -14, 5, 28);
      ctx.restore();
      ctx.fillStyle = opts.tint ?? color;
      ctx.beginPath();
      ctx.ellipse(32, 0, 3.4, 12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = opts.tint ?? color;
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke(body);
      ctx.beginPath();
      ctx.ellipse(32, 0, 3.4, 12, 0, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'brush': {
      const R = Math.max(10, opts.brush ?? 30);
      ctx.globalAlpha *= 0.16;
      ctx.fillStyle = opts.tint ?? color;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();
      ctx.globalAlpha /= 0.16;
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = color;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -(opts.t ?? 0) * 40;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      break;
    }
    case 'wand': {
      ctx.scale(S, S);
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(4, 4);
      ctx.lineTo(30, 30);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      const pulse = 1 + Math.sin((opts.t ?? 0) * 12) * 0.15;
      star(ctx, 0, 0, 10 * pulse, '#ffe9a8');
      break;
    }
  }
  ctx.restore();
}
export function star(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}
export function drawTag(ctx, x, y, text, color) {
  ctx.save();
  ctx.font = `600 21px ${SANS}`;
  const w = ctx.measureText(text).width + 22;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 34, 10);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 11, y + 18);
  ctx.restore();
}
