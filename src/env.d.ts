/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Per-request CSP nonce: set by middleware, consumed by inline-script pages. */
    nonce: string;
  }
}

interface MixchatDevHelpers {
  injectMessage: (msg: Partial<import("./lib/types").TwitchMessage>) => void;
  triggerCelebration: () => void;
  triggerHypeTrain: () => void;
  triggerPoll: () => void;
  triggerPrediction: () => void;
  triggerGigantifiedEmote: () => void;
  triggerMessageEffect: () => void;
  triggerCelebrationMessage: () => void;
}

declare var __mixchatDev: MixchatDevHelpers | undefined;