const eventSoundCache = new Map<string, HTMLAudioElement>();

/** Plays a sound from a data URL, caching the Audio element per event type. */
export function playEventSound(
  eventType: string,
  soundDataUrl: string,
  volume: number = 1,
): void {
  try {
    let audio = eventSoundCache.get(eventType);

    if (!audio) {
      audio = new Audio(soundDataUrl);
      eventSoundCache.set(eventType, audio);
    } else {
      audio.src = soundDataUrl;
    }

    audio.volume = Math.max(0, Math.min(1, volume));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Audio playback failed - silently ignore
  }
}

function clearEventSoundCache(eventType: string): void {
  eventSoundCache.delete(eventType);
}

function clearAllEventSoundCache(): void {
  eventSoundCache.clear();
}
