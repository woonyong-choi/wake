/*
 * Completion sound: a short two-note chime made with Web Audio (no sound file). play() returns a promise that settles when it ends.
 */
let audio = null;
export function playChime(win = globalThis) {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  if (!Ctx) return Promise.resolve();
  audio ||= new Ctx();
  const t0 = audio.currentTime + 0.01;
  const note = (freq, at, len) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(0.18, t0 + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(g).connect(audio.destination);
    o.start(t0 + at); o.stop(t0 + at + len + 0.02);
  };
  note(880, 0, 0.25);
  note(1318.5, 0.12, 0.4);
  return audio.resume().then(() => new Promise(r => setTimeout(r, 600)));
}
