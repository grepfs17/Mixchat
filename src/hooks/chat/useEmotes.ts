import { useState, useEffect } from "react";
import { getAllEmotesOrganized, type EmotesBySource } from "../../lib/emotes";

const EMPTY: EmotesBySource = {
  twitchGlobal: [],
  twitchChannels: [],
  "7tv": [],
  bttv: [],
  ffz: [],
};

export function useEmotes(): EmotesBySource {
  const [emotes, setEmotes] = useState<EmotesBySource>(EMPTY);

  useEffect(() => {
    setEmotes(getAllEmotesOrganized());
    function handleReloaded() {
      setEmotes(getAllEmotesOrganized());
    }
    window.addEventListener("emotes-reloaded", handleReloaded);
    return () => window.removeEventListener("emotes-reloaded", handleReloaded);
  }, []);

  return emotes;
}
