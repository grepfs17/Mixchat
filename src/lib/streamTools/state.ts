import type {
  GiveawayEligibility,
  GiveawayEntry,
  GiveawayScope,
} from "../streamerTools/giveaway";
import type {
  MusicPlaylist,
  MusicPlayerSettings,
} from "../musicPlayer/types";

export type SharedGiveawayPhase = "config" | "running" | "revealed";

export interface SharedGiveawayState {
  phase: SharedGiveawayPhase;
  keyword: string;
  duration: number;
  scope: GiveawayScope;
  eligibility: GiveawayEligibility;
  startedAt: number | null;
  endsAt: number | null;
  winner: GiveawayEntry | null;
  entries: GiveawayEntry[];
  announcedAt: string | null;
}

export interface SharedMusicState {
  playlists: MusicPlaylist[];
  settings: MusicPlayerSettings;
  isPlaying: boolean;
}

export interface StreamToolsState {
  version: number;
  giveaway: SharedGiveawayState;
  music: SharedMusicState;
}
