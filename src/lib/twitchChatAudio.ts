export type MentionSoundType = "ding" | "double" | "chime" | "pop" | "ping";

export const MENTION_SOUND_OPTIONS: {
  value: MentionSoundType;
  label: string;
}[] = [
  { value: "ding", label: "Ding" },
  { value: "double", label: "Double Beep" },
  { value: "chime", label: "Chime" },
  { value: "pop", label: "Pop" },
  { value: "ping", label: "Ping" },
];

// Single shared AudioContext — reusing it avoids the browser suspending a
// freshly-created context that has no prior user-gesture association.
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/** Primes the shared AudioContext on the first user interaction so it is
 *  already in a running state when a mention arrives. Call this once on any
 *  click/keydown in the app. */
export function primeAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/** Plays a notification sound using the Web Audio API. Exported for previewing in the settings modal. */
export function playMentionSoundPreview(
  volume: number,
  type: MentionSoundType,
) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const play = () => {
    try {
      const now = ctx.currentTime;
      const beep = (
        freq: number,
        start: number,
        duration: number,
        wave: OscillatorType = "sine",
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(volume, now + start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
        osc.start(now + start);
        osc.stop(now + start + duration);
      };
      switch (type) {
        case "ding":
          beep(880, 0, 0.25);
          break;
        case "double":
          beep(880, 0, 0.1);
          beep(880, 0.18, 0.1);
          break;
        case "chime":
          beep(1047, 0, 0.2);
          beep(784, 0.22, 0.2);
          break;
        case "pop":
          beep(440, 0, 0.08, "square");
          break;
        case "ping":
          beep(1200, 0, 0.4);
          break;
      }
    } catch {
      /* audio not supported */
    }
  };

  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(play)
      .catch(() => {});
  } else {
    play();
  }
}

export function playMentionSound(volume: number, type: MentionSoundType) {
  playMentionSoundPreview(volume, type);
}
