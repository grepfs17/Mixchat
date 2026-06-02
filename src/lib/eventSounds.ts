/**
 * Event sound utilities for playing custom sounds for chat events.
 */

const eventSoundCache = new Map<string, HTMLAudioElement>();

/**
 * Play a custom event sound from base64 data URL.
 * Uses caching to avoid re-creating Audio elements.
 */
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

/**
 * Clear the event sound cache for a specific event type.
 */
export function clearEventSoundCache(eventType: string): void {
  eventSoundCache.delete(eventType);
}

/**
 * Clear all event sound caches.
 */
export function clearAllEventSoundCache(): void {
  eventSoundCache.clear();
}
