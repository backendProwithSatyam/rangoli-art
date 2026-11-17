import { Reel } from './engine.js';
import { DEVA, MONO, SANS } from './cursors.js';
/**
 * Radha Rani rangoli reel, made to be screen-recorded on a phone.
 *
 * 1. Start the phone's screen recorder.  2. Open this page.  3. Tap once.
 * The reel goes full screen, plays once (about 41 s) and holds on the final frame.
 * Tap again after it ends to replay.
 *
 * URL options: ?seconds=30 (drawing time)  &hud=0  &tags=0  &camera=0  &credit=your-handle  &seed=7
 */
const params = new URLSearchParams(location.search);
const num = (key, fallback) => {
  const v = Number(params.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const flag = (key) => params.get(key) !== '0';
async function fontsReady() {
  const loads = [`600 21px ${SANS}`, `500 30px ${MONO}`, `400 112px ${DEVA}`].map((f) => document.fonts.load(f, 'श्री राधा Radha 0'));
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 3000))]);
}
/** Hides the browser bars where the phone allows it (Android Chrome; not iPhone Safari). */
async function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen)
    return;
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
  }
  catch {
    /* Not allowed here; the reel still plays in the normal view. */
  }
}
let wake = null;
/** Stops the screen dimming mid-reel. Only works on https:// pages (or localhost). */
async function keepAwake() {
  try {
    wake = 'wakeLock' in navigator ? await navigator.wakeLock.request('screen') : null;
  }
  catch {
    wake = null;
  }
}
async function main() {
  const canvas = document.getElementById('reel');
  const start = document.getElementById('start');
  await fontsReady();
  // Let the loading text paint before the layers are prepared (about a second on a phone).
  await new Promise((r) => setTimeout(r, 30));
  const reel = new Reel(canvas, {
    buildSeconds: num('seconds', 30),
    seed: num('seed', 7),
    credit: params.get('credit') ?? 'satyam shukla',
    hud: flag('hud'),
    tags: flag('tags'),
    camera: flag('camera'),
  });
  reel.paused = true;
  window.__reel = reel;
  document.body.classList.add('ready');
  let started = false;
  const play = () => {
    if (started && reel.phase !== 'end')
      return;
    started = true;
    document.body.classList.add('playing');
    void goFullscreen();
    void keepAwake();
    reel.restart();
    reel.paused = true;
    // A short still frame after the tap: time for full screen to settle and an easy trim point.
    setTimeout(() => {
      reel.paused = false;
    }, 700);
  };
  start.addEventListener('click', play);
  canvas.addEventListener('click', () => {
    if (reel.phase === 'end')
      play();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter')
      return;
    e.preventDefault();
    play();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && started && !wake)
      void keepAwake();
  });
  let last = performance.now();
  const tick = (now) => {
    reel.frame((now - last) / 1000);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
main().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading)
    loading.textContent = `Could not start the reel: ${err instanceof Error ? err.message : String(err)}`;
});
