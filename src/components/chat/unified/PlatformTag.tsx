import { FaTwitch, FaYoutube } from "react-icons/fa";

export function PlatformTag({ source }: { source: "twitch" | "youtube" }) {
  return (
    <span
      title={source === "twitch" ? "Twitch" : "YouTube"}
      className={`platform-tag ${source}`}
    >
      {source === "twitch" ? <FaTwitch size={14} /> : <FaYoutube size={14} />}
    </span>
  );
}
