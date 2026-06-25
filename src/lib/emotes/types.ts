export interface EmoteMap {
  [key: string]: string;
}

export interface EmoteCache {
  emotes: EmoteMap;
  timestamp: number;
  emoteSetId?: string;
  authors?: Record<string, string>;
}

export interface ChannelEmoteGroup {
  channelId: string;
  channelName: string;
  profileImageUrl?: string;
  emotes: EmoteMap;
}

export interface ChannelGroupCache {
  groups: ChannelEmoteGroup[];
  timestamp: number;
}

export interface BroadcasterInfo {
  name: string;
  profileImageUrl?: string;
}

export interface TwitchChannelEmotes {
  channelId: string;
  channelName: string;
  profileImageUrl?: string;
  emotes: Array<{ name: string; url: string }>;
}

export interface EmotesBySource {
  twitchGlobal: Array<{ name: string; url: string }>;
  twitchChannels: TwitchChannelEmotes[];
  "7tv": Array<{ name: string; url: string }>;
  bttv: Array<{ name: string; url: string }>;
  ffz: Array<{ name: string; url: string }>;
}
