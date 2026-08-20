import { useCallback } from "react";
import { useRaidDetection } from "../eventSubHelpers/useRaidDetection";
import type { RaidOutEvent } from "../eventSubHelpers/useRaidDetection";
import { useChannelPointRedemptionsPubSub } from "../eventSubHelpers/useChannelPointRedemptionsPubSub";
import { isDuplicateRedemption } from "./useChatMessages";
import { useHypeTrainEventSub } from "../eventSubHelpers/useHypeTrainEventSub";
import { useAutomodQueue } from "../eventSubHelpers/useAutomodQueue";
import type {
  HeldMessage,
  ResolvedMessage,
} from "../eventSubHelpers/useAutomodQueue";
import { usePollEventSub } from "../eventSubHelpers/usePollEventSub";
import type { PollEvent } from "../eventSubHelpers/usePollEventSub";
import type { PollState } from "../../../components/chat/shared/PollBanner";
import { usePredictionEventSub } from "../eventSubHelpers/usePredictionEventSub";
import type { PredictionEvent } from "../eventSubHelpers/usePredictionEventSub";
import type { PredictionState } from "../../../components/chat/shared/PredictionBanner";
import { useBitsPowerUpEventSub } from "../eventSubHelpers/useBitsPowerUpEventSub";
import type { CelebrationState } from "../../../components/chat/shared/CelebrationBanner";
import type { HypeTrainState } from "../../../components/chat/shared/HypeTrainBanner";
import { saveMessage } from "../../../lib/chatHistoryStorage";
import { MAX_DISPLAYED_MESSAGES } from "../../../lib/types";
import type { TwitchMessage } from "../../../lib/types";
import type { SubscribeFn } from "../useEventSub";

interface UseLiveEventsOptions {
  subscribe: SubscribeFn;
  channelId: string;
  twitchSession?: {
    accessToken?: string;
    userId?: string;
    broadcasterType?: string;
  };
  badgesReady: boolean;
  isModerator: boolean;
  isOnOwnChannel: boolean;
  selectedTwitchChannelName: string;
  setHypeTrain: React.Dispatch<React.SetStateAction<HypeTrainState | null>>;
  setPoll: React.Dispatch<React.SetStateAction<PollState | null>>;
  setPrediction: React.Dispatch<React.SetStateAction<PredictionState | null>>;
  setCelebration: React.Dispatch<React.SetStateAction<CelebrationState | null>>;
  setPendingRaid: React.Dispatch<React.SetStateAction<RaidOutEvent | null>>;
  setIsRaidInitiator: React.Dispatch<React.SetStateAction<boolean>>;
  setMessages: React.Dispatch<React.SetStateAction<TwitchMessage[]>>;
  setNotification: React.Dispatch<
    React.SetStateAction<{
      message: string;
      type: "success" | "error" | "info";
      id?: number;
    } | null>
  >;
  notificationIdRef: React.MutableRefObject<number>;
  recentRedemptionsRef: React.MutableRefObject<Map<string, number>>;
  currentUserBadgesRef: React.MutableRefObject<{
    badges: Record<string, string>;
    badgeDetails: Record<string, { url: string; title: string }>;
  }>;
}

export function useLiveEvents({
  subscribe,
  channelId,
  twitchSession,
  badgesReady,
  isModerator,
  isOnOwnChannel,
  selectedTwitchChannelName,
  setHypeTrain,
  setPoll,
  setPrediction,
  setCelebration,
  setPendingRaid,
  setIsRaidInitiator,
  setMessages,
  setNotification,
  notificationIdRef,
  recentRedemptionsRef,
  currentUserBadgesRef,
}: UseLiveEventsOptions) {
  const accessToken = twitchSession?.accessToken;
  const userId = twitchSession?.userId;
  const broadcasterType = twitchSession?.broadcasterType;
  const enabled = !!(accessToken && channelId);
  const isPartnerOrAffiliate =
    broadcasterType === "partner" || broadcasterType === "affiliate";

  // --- Automod ---
  useAutomodQueue({
    subscribe,
    channelId,
    moderatorId: userId || "",
    enabled: !!(
      accessToken &&
      userId &&
      channelId &&
      badgesReady &&
      isModerator
    ),
    onHeldMessage: useCallback(
      (heldMsg: HeldMessage) => {
        const chatMsg: TwitchMessage = {
          id: `automod-${heldMsg.id}`,
          platform: "twitch",
          author: heldMsg.userDisplayName || heldMsg.userName,
          content: heldMsg.content,
          timestamp: new Date(heldMsg.holdDate),
          userId: heldMsg.userId,
          messageType: "automod",
          targetUsername: heldMsg.id,
        };
        setMessages((prev) => {
          const updated = [...prev, chatMsg];
          return updated.length > MAX_DISPLAYED_MESSAGES
            ? updated.slice(-MAX_DISPLAYED_MESSAGES)
            : updated;
        });
      },
      [setMessages],
    ),
    onResolvedMessage: useCallback(
      (resolved: ResolvedMessage) => {
        setMessages((prev) =>
          prev.filter((m) => m.id !== `automod-${resolved.messageId}`),
        );
      },
      [setMessages],
    ),
    onScopeError: useCallback(() => {
      console.info(
        "[useLiveEvents] Automod EventSub subscription rejected — this is expected when not a moderator or missing moderator:manage:automod scope.",
      );
    }, []),
  });

  // --- Raids ---
  const onRaidScopeError = useCallback(() => {
    notificationIdRef.current += 1;
    setNotification({
      message:
        "Raid detection unavailable — please re-login to refresh your Twitch session",
      type: "info",
      id: notificationIdRef.current,
    });
  }, [setNotification, notificationIdRef]);

  const onInitiatorRaid = useCallback(
    (raid: RaidOutEvent) => {
      setPendingRaid(raid);
      setIsRaidInitiator(isOnOwnChannel);
    },
    [setPendingRaid, setIsRaidInitiator, isOnOwnChannel],
  );

  // Incoming raids are already surfaced as a chat message by the IRC
  // onRaid handler in useEventHandlers, so the popup is intentionally
  // suppressed here. The EventSub subscription is still set up so scope
  // errors are reported consistently.
  useRaidDetection({
    subscribe,
    channelId,
    enabled: !!(accessToken && channelId && channelId !== userId),
    isInitiator: false,
    onRaid: useCallback(() => {}, []),
    onScopeError: onRaidScopeError,
  });

  useRaidDetection({
    subscribe,
    channelId: userId || "",
    enabled: !!(accessToken && userId),
    isInitiator: true,
    onRaid: onInitiatorRaid,
    onScopeError: onRaidScopeError,
  });

  useRaidDetection({
    subscribe,
    channelId,
    enabled: !!(accessToken && channelId && channelId !== userId),
    isInitiator: true,
    onRaid: onInitiatorRaid,
    onScopeError: onRaidScopeError,
  });

  // --- Channel Point Redemptions ---
  const handleRedemptionEvent = useCallback(
    (message: TwitchMessage) => {
      // The same redemption arrives from IRC (USERNOTICE / PRIVMSG),
      // PubSub and — on the broadcaster's own channel — EventSub. Keep
      // only the first copy within the dedup window.
      if (
        message.rewardId &&
        message.userId &&
        isDuplicateRedemption(
          recentRedemptionsRef.current,
          message.rewardId,
          message.userId,
        )
      ) {
        return;
      }

      setMessages((prev) => {
        saveMessage(message, selectedTwitchChannelName);

        const updated = [...prev, message];
        return updated.length > MAX_DISPLAYED_MESSAGES
          ? updated.slice(-MAX_DISPLAYED_MESSAGES)
          : updated;
      });
    },
    [selectedTwitchChannelName, setMessages, recentRedemptionsRef],
  );

  // Channel point redemptions arrive via the PubSub feed
  // (`community-points-channel-v1`), which works for ANY authenticated
  // user watching ANY channel — unlike the broadcaster-only EventSub
  // subscriptions topic. Deduped against IRC via the shared
  // recentRedemptionsRef.
  const redemptionPubSubStatus = useChannelPointRedemptionsPubSub({
    channelId,
    accessToken: accessToken || "",
    enabled: !!(accessToken && channelId),
    onRedemption: handleRedemptionEvent,
  });

  // --- Hype Train ---
  const onHypeTrainScopeError = useCallback(() => {
    console.info(
      "[useLiveEvents] EventSub hype train subscription rejected — this is expected when viewing another broadcaster's channel.",
    );
  }, []);

  const handleHypeTrainBegin = useCallback(
    (event: { level: number; progress: number; goal: number; total: number; topContributions: Array<{ displayName: string; total: number }>; expiresAt: string }) => {
      setHypeTrain({
        level: event.level,
        progress: event.progress,
        goal: event.goal,
        totalPoints: event.total,
        topContributors: event.topContributions.slice(0, 3).map((c) => ({
          displayName: c.displayName,
          points: c.total,
        })),
        endsAt: new Date(event.expiresAt),
      });
    },
    [setHypeTrain],
  );

  const handleHypeTrainProgress = useCallback(
    (event: { level: number; progress: number; goal: number; total: number; topContributions: Array<{ displayName: string; total: number }>; expiresAt: string }) => {
      setHypeTrain({
        level: event.level,
        progress: event.progress,
        goal: event.goal,
        totalPoints: event.total,
        topContributors: event.topContributions.slice(0, 3).map((c) => ({
          displayName: c.displayName,
          points: c.total,
        })),
        endsAt: new Date(event.expiresAt),
      });
    },
    [setHypeTrain],
  );

  const handleHypeTrainEnd = useCallback(() => {
    setHypeTrain(null);
  }, [setHypeTrain]);

  useHypeTrainEventSub({
    subscribe,
    channelId,
    enabled: !!(
      accessToken &&
      channelId &&
      badgesReady &&
      isOnOwnChannel &&
      isPartnerOrAffiliate
    ),
    onHypeTrainBegin: handleHypeTrainBegin,
    onHypeTrainProgress: handleHypeTrainProgress,
    onHypeTrainEnd: handleHypeTrainEnd,
    onScopeError: onHypeTrainScopeError,
  });

  // --- Polls ---
  const onPollScopeError = useCallback(() => {
    console.info(
      "[useLiveEvents] EventSub poll subscription rejected — this is expected when missing channel:read:polls scope.",
    );
  }, []);

  const handlePollBegin = useCallback(
    (event: PollEvent) => {
      setPoll({
        id: event.id,
        title: event.title,
        choices: event.choices.map((c) => ({
          id: c.id,
          title: c.title,
          votes: c.votes,
        })),
        totalVotes: event.choices.reduce((sum, c) => sum + c.votes, 0),
        endsAt: new Date(event.endsAt || event.startedAt),
      });
    },
    [setPoll],
  );

  const handlePollProgress = useCallback(
    (event: PollEvent) => {
      setPoll((prev) => {
        if (prev && prev.id !== event.id) return prev;
        return {
          ...prev,
          id: event.id,
          title: event.title,
          choices: event.choices.map((c) => ({
            id: c.id,
            title: c.title,
            votes: c.votes,
          })),
          totalVotes: event.choices.reduce((sum, c) => sum + c.votes, 0),
          endsAt: prev?.endsAt || new Date(event.endsAt || event.startedAt),
        };
      });
    },
    [setPoll],
  );

  const handlePollEnd = useCallback(
    (event: PollEvent) => {
      setPoll((prev) => {
        if (prev && prev.id !== event.id) return prev;
        return {
          ...prev,
          id: event.id,
          title: event.title,
          choices: event.choices.map((c) => ({
            id: c.id,
            title: c.title,
            votes: c.votes,
          })),
          totalVotes: event.choices.reduce((sum, c) => sum + c.votes, 0),
          status: event.status,
          endsAt: prev?.endsAt || new Date(event.startedAt),
        };
      });
    },
    [setPoll],
  );

  usePollEventSub({
    subscribe,
    channelId,
    enabled: !!(accessToken && channelId && badgesReady && isOnOwnChannel),
    onPollBegin: handlePollBegin,
    onPollProgress: handlePollProgress,
    onPollEnd: handlePollEnd,
    onScopeError: onPollScopeError,
  });

  // --- Predictions ---
  const onPredictionScopeError = useCallback(() => {
    console.info(
      "[useLiveEvents] EventSub prediction subscription rejected — this is expected when missing channel:read:predictions scope.",
    );
  }, []);

  const handlePredictionBegin = useCallback(
    (event: PredictionEvent) => {
      setPrediction({
        id: event.id,
        title: event.title,
        outcomes: event.outcomes.map((o) => ({
          id: o.id,
          title: o.title,
          color: o.color,
          users: o.users ?? 0,
          channelPoints: o.channelPoints ?? 0,
        })),
        totalPoints: event.outcomes.reduce(
          (sum, o) => sum + (o.channelPoints ?? 0),
          0,
        ),
        totalUsers: event.outcomes.reduce((sum, o) => sum + (o.users ?? 0), 0),
        status: "active",
        endsAt: event.locksAt ? new Date(event.locksAt) : undefined,
      });
    },
    [setPrediction],
  );

  const handlePredictionProgress = useCallback(
    (event: PredictionEvent) => {
      setPrediction((prev) => {
        if (prev && prev.id !== event.id) return prev;
        return {
          ...prev,
          id: event.id,
          title: event.title,
          outcomes: event.outcomes.map((o) => ({
            id: o.id,
            title: o.title,
            color: o.color,
            users: o.users ?? 0,
            channelPoints: o.channelPoints ?? 0,
          })),
          totalPoints: event.outcomes.reduce(
            (sum, o) => sum + (o.channelPoints ?? 0),
            0,
          ),
          totalUsers: event.outcomes.reduce(
            (sum, o) => sum + (o.users ?? 0),
            0,
          ),
          status: prev?.status === "locked" ? "locked" : "active",
          endsAt:
            prev?.endsAt ||
            (event.locksAt ? new Date(event.locksAt) : undefined),
        };
      });
    },
    [setPrediction],
  );

  const handlePredictionLock = useCallback(
    (event: PredictionEvent) => {
      setPrediction((prev) => {
        if (prev && prev.id !== event.id) return prev;
        return {
          ...prev,
          id: event.id,
          title: event.title,
          outcomes: event.outcomes.map((o) => ({
            id: o.id,
            title: o.title,
            color: o.color,
            users: o.users ?? 0,
            channelPoints: o.channelPoints ?? 0,
          })),
          totalPoints: event.outcomes.reduce(
            (sum, o) => sum + (o.channelPoints ?? 0),
            0,
          ),
          totalUsers: event.outcomes.reduce(
            (sum, o) => sum + (o.users ?? 0),
            0,
          ),
          status: "locked",
          lockedAt: event.lockedAt ? new Date(event.lockedAt) : undefined,
          endsAt: prev?.endsAt,
        };
      });
    },
    [setPrediction],
  );

  const handlePredictionEnd = useCallback(
    (event: PredictionEvent) => {
      setPrediction((prev) => {
        if (prev && prev.id !== event.id) return prev;
        return {
          ...prev,
          id: event.id,
          title: event.title,
          outcomes: event.outcomes.map((o) => ({
            id: o.id,
            title: o.title,
            color: o.color,
            users: o.users ?? 0,
            channelPoints: o.channelPoints ?? 0,
          })),
          totalPoints: event.outcomes.reduce(
            (sum, o) => sum + (o.channelPoints ?? 0),
            0,
          ),
          totalUsers: event.outcomes.reduce(
            (sum, o) => sum + (o.users ?? 0),
            0,
          ),
          status: event.status === "canceled" ? "canceled" : "resolved",
          winningOutcomeId: event.winningOutcomeId,
          endsAt: prev?.endsAt,
        };
      });
    },
    [setPrediction],
  );

  usePredictionEventSub({
    subscribe,
    channelId,
    enabled: !!(accessToken && channelId && badgesReady && isOnOwnChannel),
    onPredictionBegin: handlePredictionBegin,
    onPredictionProgress: handlePredictionProgress,
    onPredictionLock: handlePredictionLock,
    onPredictionEnd: handlePredictionEnd,
    onScopeError: onPredictionScopeError,
  });

  // --- Celebration (Bits Power-Up) ---
  const onCelebrationScopeError = useCallback(() => {
    console.info(
      "[useLiveEvents] EventSub bits power-up subscription rejected — this is expected when missing bits:read scope.",
    );
  }, []);

  const handleCelebration = useCallback(
    (event: CelebrationState) => {
      setCelebration(event);
    },
    [setCelebration],
  );

  useBitsPowerUpEventSub({
    subscribe,
    channelId,
    enabled: !!(accessToken && channelId && badgesReady && isOnOwnChannel),
    onCelebration: handleCelebration,
    onScopeError: onCelebrationScopeError,
  });

  return { redemptionPubSubStatus };
}
