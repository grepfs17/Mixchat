import {
  MdHourglassEmpty,
  MdBlock,
  MdWarning,
} from "react-icons/md";
import {
  createBan,
  warnChatUser,
  manageHeldAutomodMessage,
} from "../../../lib/twitch";
import { getAutomodIds } from "../../../hooks/chat/automodIds";

interface AutomodActionsProps {
  heldMsgId: string;
  userId: string;
  username: string;
}

const btnBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  border: "none",
  borderRadius: "4px",
  padding: "2px 6px",
  fontSize: "11px",
  cursor: "pointer",
  background: "rgba(255, 255, 255, 0.06)",
  color: "#94a3b8",
};

const allowBtn: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #34d399",
  color: "#34d399",
  background: "rgba(16, 185, 129, 0.15)",
};

const denyBtn: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #f87171",
  color: "#f87171",
  background: "rgba(239, 68, 68, 0.15)",
};

export default function AutomodActions({
  heldMsgId,
  userId,
  username,
}: AutomodActionsProps) {
  const handleApprove = async () => {
    try {
      const { moderatorId } = getAutomodIds();
      await manageHeldAutomodMessage(moderatorId, heldMsgId, "ALLOW");
      window.dispatchEvent(
        new CustomEvent("automod-message-resolved", {
          detail: { heldMsgId },
        }),
      );
    } catch (e) {
      console.error("[AutomodActions] Allow failed:", e);
    }
  };

  const handleDeny = async () => {
    try {
      const { moderatorId } = getAutomodIds();
      await manageHeldAutomodMessage(moderatorId, heldMsgId, "DENY");
      window.dispatchEvent(
        new CustomEvent("automod-message-resolved", {
          detail: { heldMsgId },
        }),
      );
    } catch (e) {
      console.error("[AutomodActions] Deny failed:", e);
    }
  };

  const handleTimeout = async () => {
    try {
      const { moderatorId, broadcasterId } = getAutomodIds();
      if (!broadcasterId || !moderatorId || !userId) return;
      await createBan(broadcasterId, moderatorId, userId, 600, "AutoMod held message");
    } catch (e) {
      console.error("[AutomodActions] Timeout failed:", e);
    }
  };

  const handleBan = async () => {
    try {
      const { moderatorId, broadcasterId } = getAutomodIds();
      if (!broadcasterId || !moderatorId || !userId) return;
      await createBan(broadcasterId, moderatorId, userId, undefined, "AutoMod held message");
    } catch (e) {
      console.error("[AutomodActions] Ban failed:", e);
    }
  };

  const handleWarn = async () => {
    try {
      const { moderatorId, broadcasterId } = getAutomodIds();
      if (!broadcasterId || !moderatorId || !userId) return;
      await warnChatUser(broadcasterId, moderatorId, userId, "AutoMod held message");
    } catch (e) {
      console.error("[AutomodActions] Warn failed:", e);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        marginTop: "4px",
        flexWrap: "wrap",
      }}
    >
      <button onClick={handleApprove} className="action-button mod-action" title="Allow message" style={allowBtn}>
        Allow
      </button>
      <button onClick={handleDeny} className="action-button mod-action" title="Deny message" style={denyBtn}>
        Deny
      </button>
      <button onClick={handleTimeout} className="action-button mod-action" title="Timeout user (10m)" style={btnBase}>
        <MdHourglassEmpty size={12} />
      </button>
      <button onClick={handleBan} className="action-button mod-action" title="Ban user" style={btnBase}>
        <MdBlock size={12} />
      </button>
      <button onClick={handleWarn} className="action-button mod-action" title="Warn user" style={btnBase}>
        <MdWarning size={12} />
      </button>
    </div>
  );
}
