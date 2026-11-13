let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioContext ??= new Ctor();
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * Download finished chime: a short rising arpeggio (C6-E6-G6).
 * Throttled so a batch of finished downloads only rings once.
 */
export function playCompleteSound() {
  const now = Date.now();
  if (now - lastPlayedAt < 1200) return;

  const ctx = context();
  if (!ctx) return;

  lastPlayedAt = now;
  void ctx.resume?.().catch(() => {});

  const start = ctx.currentTime + 0.02;
  const notes = [
    { freq: 1046.5, offset: 0 },
    { freq: 1318.51, offset: 0.11 },
    { freq: 1567.98, offset: 0.22 },
  ];

  for (const { freq, offset } of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = start + offset;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.45);
  }
}
