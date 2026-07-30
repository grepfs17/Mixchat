import type React from "react";

export const GROUPS = [
  "appearance",
  "chat",
  "layout",
  "streamer",
  "notifications",
  "backup",
  "help",
] as const;
export type GroupKey = (typeof GROUPS)[number];

export const GROUP_LABELS: Record<GroupKey, string> = {
  appearance: "Appearance",
  chat: "Chat",
  layout: "Layout",
  streamer: "Streamer",
  notifications: "Notifications",
  backup: "Backup & Restore",
  help: "Help",
};

export interface SettingsItemDef {
  id: string;
  group: GroupKey;
  label: string;
  description: string;
  render: () => React.ReactNode;
}
