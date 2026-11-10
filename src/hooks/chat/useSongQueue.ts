import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SONG_QUEUE_CONFIG,
  type SongQueueConfig,
  type SongQueueItem,
  type SongQueueMessage,
  type SongQueueOwnerBootstrap,
  type SongQueuePlatform,
  type SongQueueSession,
  type SongQueueSubmitter,
} from "../../lib/songQueue/types";
import {
  extractSubmissions,
  type SongQueueOwner,
} from "../../lib/songQueue/extract";
import {
  formatMaxDuration,
  probeVideoDuration,
} from "../../lib/songQueue/durationProbe";
import {
  SongQueueApiError,
  appendSongQueueItem,
  claimSongQueueAnnouncement,
  closeSongQueue,
  createSongQueue,
  getActiveSongQueue,
  getSongQueue,
  patchSongQueue,
  removeSongQueueItem,
  setSongQueueIndex,
  updateSongQueueItem,
} from "../../lib/songQueue/api";
import {
  clearSongQueueSession,
  loadSongQueueSession,
  saveSongQueueSession,
} from "../../lib/songQueue/idb";
import { appendPastPlaylist } from "../../lib/streamerTools/pastPlaylists";
import { reconcileEndedItemsClient } from "../../lib/songQueue/reconcile";

export type SongQueuePhase = "idle" | "open" | "ended";

export interface UseSongQueueOptions {
  channelKey: string;
  owner: SongQueueOwner;
  /** Master switch. Mirrors the Stream tools toggle. */
  enabled?: boolean;
  /** Override the per-submitter limit at hook time. */
  perSubmitterLimit?: number;
  /** Called when a fatal error happens that the user should see. */
  onError?: (message: string) => void;
  /** Called when the current item changes (so the panel can announce it). */
  onAdvance?: (item: SongQueueItem | undefined) => void;
  /**
   * Called when the hook wants to post a chat message back to the user who
   * submitted a song (e.g. "song too long"). The replyToMessageId is the id
   * of the user's original submission so the message appears as a reply.
   */
  onSendChat?: (
    platform: SongQueuePlatform,
    message: string,
    replyToMessageId: string,
  ) => Promise<void>;
  /**
   * Called when a new item starts playing and `config.announceOnPlay` is
   * true. The callback is responsible for actually posting the message
   * (to whatever platform(s) the streamer is on). It is only invoked
   * once per item, even if `version` ticks for unrelated reasons.
   */
  onAnnounceNowPlaying?: (item: SongQueueItem) => Promise<void>;
}

export interface UseSongQueueResult {
  phase: SongQueuePhase;
  config: SongQueueConfig;
  setConfig: (next: Partial<SongQueueConfig>) => void;
  bootstrap: SongQueueOwnerBootstrap | null;
  session: SongQueueSession | null;
  currentItem: SongQueueItem | undefined;
  items: SongQueueItem[];
  pending: SongQueueItem[];
  history: SongQueueItem[];
  loading: boolean;
  error: string | null;
  start: () => Promise<void>;
  end: () => Promise<void>;
  ingestMessage: (item: SongQueueMessage) => void;
  remove: (itemId: string) => Promise<void>;
  skip: (itemId: string) => Promise<void>;
  playNow: (itemId: string) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  reportDuration: (itemId: string, durationSec: number) => Promise<void>;
  /**
   * Reply in chat to the submitter of `item` telling them the song was
   * too long. Used by the play-time fallback when the upfront probe
   * couldn't determine the duration. No-op if no chat-send callback was
   * provided to the hook.
   */
  notifyTooLong: (item: SongQueueItem) => Promise<void>;
}

const HISTORY_STATUSES = new Set(["played", "skipped"]);

function buildInitialSession(
  created: SongQueueOwnerBootstrap,
): SongQueueSession {
  return {
    sessionId: created.sessionId,
    title: created.title,
    channelName: created.channelName,
    channelPlatform: created.channelPlatform,
    ownerTokenHash: "",
    createdAt: created.createdAt,
    lastSeenAt: created.createdAt,
    isPublic: created.isPublic,
    currentIndex: 0,
    announcedItemId: null,
    version: 0,
    ended: false,
    items: [],
  };
}

export function useSongQueue(options: UseSongQueueOptions): UseSongQueueResult {
  const {
    channelKey,
    owner,
    enabled = true,
    perSubmitterLimit,
    onError,
    onAdvance,
    onSendChat,
    onAnnounceNowPlaying,
  } = options;

  const [phase, setPhase] = useState<SongQueuePhase>("idle");
  const [config, setConfigState] = useState<SongQueueConfig>(
    DEFAULT_SONG_QUEUE_CONFIG,
  );
  const [bootstrap, setBootstrap] = useState<SongQueueOwnerBootstrap | null>(
    null,
  );
  const [session, setSession] = useState<SongQueueSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest config in a ref so the debounced ingestion can read it
  // without re-binding the timer on every keystroke.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Same for owner, since the extractor uses it.
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
  }, [owner]);

  const perSubmitterRef = useRef(perSubmitterLimit);
  useEffect(() => {
    perSubmitterRef.current = perSubmitterLimit;
  }, [perSubmitterLimit]);

  // Keep latest onSendChat in a ref so flushIngest can post chat replies
  // without re-binding on every render.
  const onSendChatRef = useRef(onSendChat);
  useEffect(() => {
    onSendChatRef.current = onSendChat;
  }, [onSendChat]);

  const onAnnounceNowPlayingRef = useRef(onAnnounceNowPlaying);
  useEffect(() => {
    onAnnounceNowPlayingRef.current = onAnnounceNowPlaying;
  }, [onAnnounceNowPlaying]);

  // Track the last item we announced so we don't double-post when
  // `version` ticks for unrelated reasons (item added, removed, etc.).
  const lastAnnouncedItemIdRef = useRef<string | null>(null);
  // The item whose claim request is currently in flight. Prevents a re-run
  // of the announce effect from claiming twice.
  const announcingItemIdRef = useRef<string | null>(null);
  const bootstrapRef = useRef(bootstrap);
  bootstrapRef.current = bootstrap;

  const applyActiveSession = useCallback((active: SongQueueSession | null) => {
    if (!active) {
      setBootstrap(null);
      setSession(null);
      setPhase("idle");
      return;
    }
    setBootstrap({
      sessionId: active.sessionId,
      ownerToken: "",
      isPublic: active.isPublic,
      publicUrl: `/s/${active.sessionId}`,
      title: active.title,
      channelName: active.channelName || "",
      channelPlatform: active.channelPlatform || "",
      createdAt: active.createdAt,
    });
    setSession(active);
    setConfigState(
      active.config
        ? { ...active.config, title: active.title, isPublic: active.isPublic }
        : {
            ...DEFAULT_SONG_QUEUE_CONFIG,
            title: active.title,
            isPublic: active.isPublic,
          },
    );
    setPhase(active.ended ? "ended" : "open");
  }, []);

  // Adopt the channel's current open queue when this client is the
  // broadcaster or an approved Twitch moderator.
  const adoptActive = useCallback(async () => {
    try {
      const active = await getActiveSongQueue(channelKey);
      applyActiveSession(active);
    } catch {
      // No authorization or no active queue. The panel stays idle.
      applyActiveSession(null);
    }
  }, [channelKey, applyActiveSession]);

  // ---- IDB hydration on mount (does not require a network call) ----
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const stored = await loadSongQueueSession(channelKey);
      if (cancelled) return;

      if (stored && !stored.session.ended) {
        setBootstrap({
          sessionId: stored.sessionId,
          ownerToken: stored.ownerToken,
          isPublic: stored.session.isPublic,
          publicUrl: `/s/${stored.sessionId}`,
          title: stored.session.title,
          channelName: stored.session.channelName || "",
          channelPlatform: stored.session.channelPlatform || "",
          createdAt: stored.session.createdAt,
        });
        setSession(stored.session);
        // Restore the full config from the session. Older sessions created
        // before `config` was persisted fall back to defaults merged with
        // the legacy `title` / `isPublic` fields.
        const storedConfig = stored.session.config;
        setConfigState(
          storedConfig
            ? {
                ...storedConfig,
                title: stored.session.title,
                isPublic: stored.session.isPublic,
              }
            : {
                ...DEFAULT_SONG_QUEUE_CONFIG,
                title: stored.session.title,
                isPublic: stored.session.isPublic,
              },
        );
        setPhase("open");
        return;
      }

      // A stored ended session must not block adopting a newer active queue.
      if (stored) {
        await clearSongQueueSession(channelKey);
        if (cancelled) return;
      }

      await adoptActive();
    })();
    return () => {
      cancelled = true;
    };
  }, [channelKey, enabled, adoptActive]);

  // While this client has no open session, keep looking for a queue another
  // browser (e.g. a moderator) opened after this page mounted. Without this
  // the streamer stays idle forever and never mounts the player.
  // Only adopt when a session exists so an ended queue keeps its banner.
  useEffect(() => {
    if (!enabled) return;
    if (bootstrap && phase === "open") return;
    let cancelled = false;
    let running = false;
    const tick = async () => {
      if (running || (typeof document !== "undefined" && document.hidden)) {
        return;
      }
      running = true;
      try {
        const active = await getActiveSongQueue(channelKey);
        if (cancelled || !active) return;
        applyActiveSession(active);
      } catch {
        // Network blip. Keep the current phase; the next tick retries.
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => {
      if (cancelled) return;
      void tick();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, bootstrap, phase, channelKey, applyActiveSession]);

  // ---- Network reconciliation: pull the server record and merge ----
  const refresh = useCallback(async () => {
    if (!bootstrap) return;
    const sessionId = bootstrap.sessionId;
    setLoading(true);
    try {
      const server = await getSongQueue(sessionId, bootstrap.ownerToken);
      // A channel switch may have replaced the session while this was in
      // flight. Never apply the old channel's queue to the new one.
      if (bootstrapRef.current?.sessionId !== sessionId) return;
      // An adopted (tokenless) session that ended must not linger in IDB or
      // hide a newer queue the channel may have started meanwhile.
      if (server.ended && !bootstrap.ownerToken) {
        await clearSongQueueSession(channelKey);
        await adoptActive();
        return;
      }
      setSession(server);
      // The server is authoritative for the config. Pull it in too so
      // changes made on another device (or before the IDB record was
      // written) survive a refresh.
      if (server.config) {
        setConfigState((prev) => ({
          ...prev,
          ...server.config,
          title: server.title,
          isPublic: server.isPublic,
        }));
      }
      await saveSongQueueSession(
        channelKey,
        bootstrap.sessionId,
        bootstrap.ownerToken,
        server,
      );
      if (server.ended) setPhase("ended");
    } catch (err) {
      if (bootstrapRef.current?.sessionId !== sessionId) return;
      if (err instanceof SongQueueApiError && err.status === 410) {
        if (!bootstrap.ownerToken) {
          await clearSongQueueSession(channelKey);
          await adoptActive();
          return;
        }
        setPhase("ended");
      } else if (err instanceof SongQueueApiError && err.status === 404) {
        await clearSongQueueSession(channelKey);
        await adoptActive();
      } else {
        const msg = err instanceof Error ? err.message : "Failed to load queue";
        setError(msg);
        onError?.(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [bootstrap, channelKey, onError, adoptActive]);

  useEffect(() => {
    if (bootstrap && phase === "open") {
      void refresh();
    }
    // We intentionally do not depend on `refresh` to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.sessionId, phase]);

  // Shared-state polling: streamer and moderators must see each other's
  // changes. Silent so it never flashes the loading state.
  useEffect(() => {
    if (!bootstrap || phase !== "open") return;
    let cancelled = false;
    let running = false;
    const tick = async () => {
      if (running || (typeof document !== "undefined" && document.hidden)) return;
      running = true;
      try {
        const server = await getSongQueue(
          bootstrap.sessionId,
          bootstrap.ownerToken,
        );
        if (cancelled) return;
        if (server.ended && !bootstrap.ownerToken) {
          await clearSongQueueSession(channelKey);
          if (cancelled) return;
          await adoptActive();
          return;
        }
        setSession(server);
        if (server.config) {
          setConfigState((prev) => ({
            ...prev,
            ...server.config,
            title: server.title,
            isPublic: server.isPublic,
          }));
        }
        if (server.ended) setPhase("ended");
      } catch {
        // Keep the last known state. The next tick or explicit action retries.
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    bootstrap?.sessionId,
    bootstrap?.ownerToken,
    phase,
    channelKey,
    adoptActive,
  ]);

  // ---- Advance callback (announce) ----
  useEffect(() => {
    if (!session) return;
    const item = session.items[session.currentIndex];
    onAdvance?.(item);

    // Fire the "now playing" announce at most once per item id. The
    // effect also re-runs on every `version` bump (item add / remove /
    // status change) so we must dedupe by id or we'd spam chat.
    if (
      config.announceOnPlay &&
      item &&
      item.id !== lastAnnouncedItemIdRef.current &&
      item.id !== announcingItemIdRef.current
    ) {
      const announce = onAnnounceNowPlayingRef.current;
      const boot = bootstrapRef.current;
      if (announce && boot) {
        const sessionId = boot.sessionId;
        announcingItemIdRef.current = item.id;
        // Only one open client may post the message. The server claim makes
        // streamer and moderator clients mutually exclusive.
        void claimSongQueueAnnouncement(sessionId, boot.ownerToken)
          .then(async (claimed) => {
            if (bootstrapRef.current?.sessionId !== sessionId) return;
            lastAnnouncedItemIdRef.current = item.id;
            if (claimed && claimed.id === item.id) {
              await announce(item);
            }
          })
          .catch((err) => {
            console.warn("[song-queue] announce failed", err);
          })
          .finally(() => {
            if (announcingItemIdRef.current === item.id) {
              announcingItemIdRef.current = null;
            }
          });
      } else if (!announce) {
        lastAnnouncedItemIdRef.current = item.id;
      }
    }
    // Reset the tracker if the item at this index disappears (e.g. the
    // queue was emptied) so the next play still gets announced.
    if (!item) {
      lastAnnouncedItemIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.currentIndex, session?.version, config.announceOnPlay]);

  // ---- Public actions ----
  const setConfig = useCallback(
    async (next: Partial<SongQueueConfig>) => {
      setConfigState((prev) => ({ ...prev, ...next }));
      // Before a session exists (`idle`) or after it's been ended, the
      // config is purely local. It gets sent to the server when the
      // user clicks "Start queue" via `start()`. Trying to PATCH in
      // those phases would 410 against the dead session and confuse
      // the user with a spurious error notification.
      if (!bootstrap || phase !== "open") return;

      // Persist every change to the server so a reload picks up the
      // latest values. The PATCH is best-effort: failures are surfaced
      // via `onError` and the local state is reverted for the field
      // that triggered the failure.
      try {
        const updated = await patchSongQueue(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          { config: next },
        );
        const serverConfig = updated.config ?? {
          ...DEFAULT_SONG_QUEUE_CONFIG,
          title: updated.title,
          isPublic: updated.isPublic,
        };
        setConfigState({
          ...serverConfig,
          title: updated.title,
          isPublic: updated.isPublic,
        });
        setBootstrap((prev) =>
          prev ? { ...prev, isPublic: updated.isPublic } : prev,
        );
        setSession((prev) => (prev ? { ...prev, ...updated } : prev));
        // Mirror the new server state into IDB so the next reload is
        // instant.
        await saveSongQueueSession(
          channelKey,
          bootstrap.sessionId,
          bootstrap.ownerToken,
          updated,
        );
      } catch (err) {
        // 410 means the session was ended (possibly on another device).
        // Flip the local phase to "ended" so the panel updates and stop
        // trying to PATCH until a new session is started. Don't show
        // an error. The streamer can see the session is over.
        if (err instanceof SongQueueApiError && err.status === 410) {
          setPhase("ended");
          return;
        }
        onError?.(
          err instanceof Error ? err.message : "Failed to save settings",
        );
        setConfigState((prev) => {
          const reverted: Partial<SongQueueConfig> = { ...prev };
          for (const key of Object.keys(next) as (keyof SongQueueConfig)[]) {
            if (key in reverted) {
              (reverted as Record<string, unknown>)[key] =
                (session?.config as Record<string, unknown> | undefined)?.[
                  key
                ] ?? DEFAULT_SONG_QUEUE_CONFIG[key];
            }
          }
          return { ...prev, ...reverted };
        });
      }
    },
    [bootstrap, phase, session?.config, channelKey, onError],
  );

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Derive channel platform and display name from channelKey
    // (e.g. "twitch:alice" → platform="twitch", name="alice").
    const [channelPlatform, channelName] = channelKey.includes(":")
      ? channelKey.split(":")
      : ["", channelKey];
    try {
      const created = await createSongQueue({
        title: config.title || undefined,
        isPublic: config.isPublic,
        channelName,
        channelPlatform,
        // Send the whole config so the server has the source of truth
        // for `perSubmitterLimit`, `maxQueueLength`, etc. from the very
        // first request.
        config: config,
      });
      setBootstrap(created);
      const initial = buildInitialSession(created);
      setSession(initial);
      setPhase("open");
      setConfigState((prev) => ({
        ...prev,
        title: created.title,
        isPublic: created.isPublic,
      }));
      await saveSongQueueSession(
        channelKey,
        created.sessionId,
        created.ownerToken,
        initial,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start queue";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [channelKey, config, onError]);

  const end = useCallback(async () => {
    if (!bootstrap) return;
    setLoading(true);
    try {
      // Snapshot to localStorage *before* the server closes the session,
      // so the streamer can still browse it after the server file is GC'd.
      if (session && session.items.length > 0) {
        // Apply the same final-state reconciliation the close endpoint
        // writes to disk, so the local counts are accurate.
        const reconciledItems = reconcileEndedItemsClient(
          session.items,
          session.currentIndex,
        );
        const playedCount = reconciledItems.filter(
          (it) => it.status === "played",
        ).length;
        const skippedCount = reconciledItems.filter(
          (it) => it.status === "skipped",
        ).length;
        appendPastPlaylist({
          createdAt: session.createdAt,
          title: session.title || config.title,
          channelName: session.channelName,
          channelPlatform: session.channelPlatform,
          ownerToken: bootstrap.ownerToken,
          itemCount: reconciledItems.length,
          playedCount,
          skippedCount,
          items: reconciledItems.map((it) => ({
            id: it.id,
            videoId: it.videoId,
            title: it.title,
            channelTitle: it.channelTitle,
            thumbnail: it.thumbnail,
            status: it.status,
            submittedAt: it.submittedAt,
            durationSec: it.durationSec,
            submitter: {
              author: it.submitter.author,
              platform: it.submitter.platform,
            },
          })),
        });
      }
      await closeSongQueue(bootstrap.sessionId, bootstrap.ownerToken);
      setPhase("ended");
      if (session) {
        const updated = {
          ...session,
          ended: true,
          isPublic: false,
          items: reconcileEndedItemsClient(session.items, session.currentIndex),
        };
        setSession(updated);
        await saveSongQueueSession(
          channelKey,
          bootstrap.sessionId,
          bootstrap.ownerToken,
          updated,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to end queue";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [bootstrap, channelKey, config.title, onError, session]);

  // ---- Chat ingestion ----
  // Debounced on a zero-delay timeout so a burst of messages produces a single
  // extraction pass.
  const ingestFrameRef = useRef<number | null>(null);
  const pendingMessagesRef = useRef<SongQueueMessage[]>([]);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Reply in chat to the submitter telling them the song was too long.
  // Failure to send is non-fatal. The queue keeps working.
  const notifyTooLong = useCallback(
    async (
      platform: SongQueuePlatform,
      author: string,
      replyToMessageId: string | undefined,
      maxSec: number,
    ) => {
      const send = onSendChatRef.current;
      if (!send) return;
      const message = `the song can only be ${formatMaxDuration(maxSec)} long`;
      try {
        await send(platform, message, replyToMessageId ?? "");
      } catch {
        /* ignore. The streamer can see the rejection locally */
      }
    },
    [],
  );

  // Public notify-too-long for already-queued items (play-time fallback).
  // The item has no original-message reference, so we post a top-level
  // mention rather than a reply.
  const notifyTooLongForItem = useCallback(
    async (item: SongQueueItem) => {
      await notifyTooLong(
        item.submitter.platform,
        item.submitter.author,
        undefined,
        config.maxSongDurationSec,
      );
    },
    [config.maxSongDurationSec, notifyTooLong],
  );

  const flushIngest = useCallback(async () => {
    ingestFrameRef.current = null;
    if (!bootstrap || phase !== "open") return;
    const cfg = configRef.current;
    const own = ownerRef.current;
    const cap = perSubmitterRef.current ?? cfg.perSubmitterLimit;
    const messages = pendingMessagesRef.current;
    pendingMessagesRef.current = [];
    if (messages.length === 0) return;
    const { accepted } = extractSubmissions(
      messages,
      {
        scope: cfg.scope,
        eligibility: cfg.eligibility,
        perSubmitterLimit: cap,
      },
      own,
      session?.items ?? [],
    );
    if (accepted.length === 0) return;

    // Append one at a time to surface per-item errors, updating optimistically
    // first. Track the running list locally so IDB writes include prior
    // optimistic/confirmed items, not the stale `session` snapshot.
    let runningItems: SongQueueItem[] = session ? [...session.items] : [];
    for (const submission of accepted) {
      // Probe duration before adding (the IFrame API is the only no-OAuth way
      // to learn it). Over-length songs are rejected with a chat reply. If the
      // probe fails (live stream, unavailable, timeout) still add the song.
      // SongQueueIndicator's play-time check is the fallback.
      const probedDuration = await probeVideoDuration(submission.videoId);
      if (
        typeof probedDuration === "number" &&
        probedDuration > cfg.maxSongDurationSec
      ) {
        console.info("[song-queue] rejecting over-length song", {
          videoId: submission.videoId,
          duration: probedDuration,
          max: cfg.maxSongDurationSec,
          submitter: submission.submitter.author,
          platform: submission.submitter.platform,
          messageId: submission.messageId,
        });
        void notifyTooLong(
          submission.submitter.platform,
          submission.submitter.author,
          submission.messageId,
          cfg.maxSongDurationSec,
        );
        continue;
      }
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempItem: SongQueueItem = {
        id: tempId,
        videoId: submission.videoId,
        title: "Validating…",
        channelTitle: "",
        thumbnail: `https://i.ytimg.com/vi/${submission.videoId}/hqdefault.jpg`,
        durationSec: probedDuration ?? 0,
        submitter: submission.submitter,
        submittedAt: submission.submittedAt,
        status: "pending",
      };
      runningItems = [...runningItems, tempItem];
      try {
        const real = await appendSongQueueItem(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          {
            videoId: submission.videoId,
            submitter: submission.submitter,
            maxQueueLength: cfg.maxQueueLength,
          },
        );
        runningItems = [...runningItems.filter((it) => it.id !== tempId), real];
        setSession((prev) =>
          prev ? { ...prev, items: [...runningItems] } : prev,
        );
        if (session) {
          await saveSongQueueSession(
            channelKey,
            bootstrap.sessionId,
            bootstrap.ownerToken,
            { ...session, items: runningItems },
          );
        }
      } catch (err) {
        // Duplicates (409) and full queues (409) are expected. Don't
        // surface them as errors. The song is already there or there's
        // no room. Nothing the streamer needs to do.
        runningItems = runningItems.filter((it) => it.id !== tempId);
        if (err instanceof SongQueueApiError && err.status === 409) {
          setSession((prev) =>
            prev ? { ...prev, items: [...runningItems] } : prev,
          );
          continue;
        }
        const msg = err instanceof Error ? err.message : "Failed to add song";
        setError(msg);
        onError?.(msg);
        setSession((prev) =>
          prev ? { ...prev, items: [...runningItems] } : prev,
        );
      }
    }
  }, [bootstrap, channelKey, notifyTooLong, onError, phase, session]);

  const ingestMessage = useCallback(
    (item: SongQueueMessage) => {
      if (phase !== "open" || !bootstrap) return;
      const key = `${item.platform}:${item.msg.id}`;
      if (seenMessageIdsRef.current.has(key)) return;
      seenMessageIdsRef.current.add(key);
      pendingMessagesRef.current.push(item);
      if (ingestFrameRef.current === null) {
        ingestFrameRef.current = window.setTimeout(() => {
          void flushIngest();
        }, 0);
      }
    },
    [bootstrap, flushIngest, phase],
  );

  // ---- Queue manipulation ----
  const remove = useCallback(
    async (itemId: string) => {
      if (!bootstrap) return;
      const previous = session;
      setSession((prev) =>
        prev
          ? { ...prev, items: prev.items.filter((it) => it.id !== itemId) }
          : prev,
      );
      try {
        await removeSongQueueItem(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          itemId,
        );
        if (previous) {
          await saveSongQueueSession(
            channelKey,
            bootstrap.sessionId,
            bootstrap.ownerToken,
            {
              ...previous,
              items: previous.items.filter((it) => it.id !== itemId),
            },
          );
        }
      } catch (err) {
        setSession(previous);
        const msg = err instanceof Error ? err.message : "Failed to remove";
        setError(msg);
        onError?.(msg);
      }
    },
    [bootstrap, channelKey, onError, session],
  );

  const skip = useCallback(
    async (itemId: string) => {
      if (!bootstrap) return;
      try {
        const item = await updateSongQueueItem(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          itemId,
          { status: "skipped" },
        );
        setSession((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((it) => (it.id === itemId ? item : it)),
              }
            : prev,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to skip";
        setError(msg);
        onError?.(msg);
      }
    },
    [bootstrap, onError],
  );

  const playNow = useCallback(
    async (itemId: string) => {
      if (!bootstrap || !session) return;
      const idx = session.items.findIndex((it) => it.id === itemId);
      if (idx === -1) return;
      await setSongQueueIndex(bootstrap.sessionId, bootstrap.ownerToken, idx, {
        status: "playing",
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: idx,
              items: prev.items.map((it) =>
                it.id === itemId
                  ? { ...it, status: "playing" as const }
                  : it.status === "playing"
                    ? { ...it, status: "skipped" as const }
                    : it,
              ),
            }
          : prev,
      );
    },
    [bootstrap, session],
  );

  const next = useCallback(async () => {
    if (!bootstrap || !session) return;
    const maxIndex = Math.max(0, session.items.length - 1);
    const atEnd = session.currentIndex >= maxIndex && session.items.length > 0;
    const target =
      atEnd && config.loop ? 0 : Math.min(session.currentIndex + 1, maxIndex);
    if (target === session.currentIndex && session.items.length > 0) return;
    const previousId = session.items[session.currentIndex]?.id;
    await setSongQueueIndex(bootstrap.sessionId, bootstrap.ownerToken, target, {
      status: "playing",
    });
    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentIndex: target,
            items: prev.items.map((it) => {
              if (it.id === previousId && it.status === "playing") {
                return { ...it, status: "played" as const };
              }
              if (prev.items[target]?.id === it.id) {
                return { ...it, status: "playing" as const };
              }
              return it;
            }),
          }
        : prev,
    );
  }, [bootstrap, session, config.loop]);

  const previous = useCallback(async () => {
    if (!bootstrap || !session) return;
    const target = Math.max(0, session.currentIndex - 1);
    if (target === session.currentIndex) return;
    await setSongQueueIndex(bootstrap.sessionId, bootstrap.ownerToken, target, {
      status: "playing",
    });
    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentIndex: target,
            items: prev.items.map((it, i) => ({
              ...it,
              status: i === target ? ("playing" as const) : it.status,
            })),
          }
        : prev,
    );
  }, [bootstrap, session]);

  const reportDuration = useCallback(
    async (itemId: string, durationSec: number) => {
      if (!bootstrap) return;
      setSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === itemId
                  ? {
                      ...it,
                      durationSec: Math.max(it.durationSec, durationSec),
                    }
                  : it,
              ),
            }
          : prev,
      );
      try {
        await setSongQueueIndex(
          bootstrap.sessionId,
          bootstrap.ownerToken,
          session?.currentIndex ?? 0,
          {
            durationSec,
          },
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to report duration";
        setError(msg);
        onError?.(msg);
      }
    },
    [bootstrap, onError, session?.currentIndex],
  );

  const items = useMemo(() => session?.items ?? [], [session]);
  const currentItem = useMemo(
    () => items[session?.currentIndex ?? 0],
    [items, session?.currentIndex],
  );
  const pending = useMemo(
    () => items.filter((it) => it.status === "pending"),
    [items],
  );
  const history = useMemo(
    () => items.filter((it) => HISTORY_STATUSES.has(it.status)),
    [items],
  );

  return {
    phase,
    config,
    setConfig,
    bootstrap,
    session,
    currentItem,
    items,
    pending,
    history,
    loading,
    error,
    start,
    end,
    ingestMessage,
    remove,
    skip,
    playNow,
    next,
    previous,
    reportDuration,
    notifyTooLong: notifyTooLongForItem,
  };
}
