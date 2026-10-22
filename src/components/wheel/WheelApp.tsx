import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaCheck,
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaLink,
  FaPlus,
  FaShareSquare,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaTrophy,
} from "react-icons/fa";
import WheelStage from "./WheelStage";
import { applyTheme } from "../../lib/themes";
import type { ChatTheme } from "../../lib/types";
import {
  createWheel,
  deleteWheel,
  fetchWheel,
  listWheels,
  updateWheel,
} from "../../lib/wheel/api";
import {
  getWheelToken,
  removeWheelToken,
  setWheelToken,
} from "../../lib/wheel/tokenStore";
import {
  addWheelHistory,
  clearWheelHistory,
  formatHistoryTime,
  getWheelHistory,
  type WheelHistoryEntry,
} from "../../lib/wheel/history";
import {
  DEFAULT_WHEEL_OPTIONS,
  MAX_WHEEL_OPTIONS,
  MAX_WHEEL_OPTION_LENGTH,
  type WheelPublicView,
  type WheelSummary,
} from "../../lib/wheel/types";

const THEME_STORAGE_KEY = "mixchat_chat_theme";

interface WheelAppProps {
  initialWheelId?: string | null;
}

function readStoredTheme(): ChatTheme | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ChatTheme;
    } catch {
      return raw as ChatTheme;
    }
  } catch {
    return null;
  }
}

interface WheelParticle {
  id: number;
  big: boolean;
  left: string;
  top: string;
  duration: string;
  delay: string;
}

function WheelParticles({ particles }: { particles: WheelParticle[] }) {
  return (
    <div className="wheel-particles" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className={p.big ? "wheel-particle wheel-particle--big" : "wheel-particle"}
          style={{
            left: p.left,
            top: p.top,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}

interface WheelSidebarProps {
  wheels: WheelSummary[];
  activeId: string | null;
  spinning: boolean;
  busy: boolean;
  newWheelName: string;
  onNewWheelNameChange: (value: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

function WheelSidebar({
  wheels,
  activeId,
  spinning,
  busy,
  newWheelName,
  onNewWheelNameChange,
  onSelect,
  onDelete,
  onCreate,
}: WheelSidebarProps) {
  return (
    <aside className="wheel-sidebar">
      <div className="wheel-sidebar-head">
        <span>Your wheels</span>
        <span className="wheel-count">{wheels.length}</span>
      </div>
      <div className="wheel-create">
        <input
          type="text"
          value={newWheelName}
          placeholder="New wheel name"
          aria-label="New wheel name"
          disabled={spinning}
          onChange={(e) => onNewWheelNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onCreate();
          }}
        />
        <button
          type="button"
          className="wheel-btn wheel-btn--primary wheel-btn--icon"
          onClick={() => void onCreate()}
          disabled={busy || spinning}
          title="Create wheel"
          aria-label="Create wheel"
        >
          {busy ? <FaSpinner className="wheel-spinner" /> : <FaPlus size={13} />}
        </button>
      </div>
      <ul className="wheel-list">
        {wheels.map((w) => (
          <li
            key={w.id}
            className={`wheel-list-item${w.id === activeId ? " is-active" : ""}`}
          >
            <button
              type="button"
              className="wheel-list-btn"
              onClick={() => void onSelect(w.id)}
              disabled={spinning}
            >
              <span className="wheel-list-name">{w.name}</span>
              <span className="wheel-list-meta">
                {w.optionCount} option{w.optionCount === 1 ? "" : "s"}
                {w.isPublic && (
                  <FaEye size={10} title="Public" aria-label="Public" />
                )}
              </span>
            </button>
            <button
              type="button"
              className="wheel-list-delete"
              onClick={() => void onDelete(w.id)}
              disabled={busy || spinning}
              title="Delete wheel"
              aria-label="Delete wheel"
            >
              <FaTrash size={11} />
            </button>
          </li>
        ))}
        {wheels.length === 0 && (
          <li className="wheel-list-empty">No wheels yet</li>
        )}
      </ul>
    </aside>
  );
}

interface WheelMainHeaderProps {
  editable: boolean;
  activeName: string;
  draftName: string;
  onDraftNameChange: (value: string) => void;
  spinning: boolean;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  isPublic: boolean;
  copiedLink: boolean;
  onSave: () => void;
  onTogglePublic: () => void;
  onCopyLink: () => void;
}

function WheelMainHeader({
  editable,
  activeName,
  draftName,
  onDraftNameChange,
  spinning,
  dirty,
  saving,
  busy,
  isPublic,
  copiedLink,
  onSave,
  onTogglePublic,
  onCopyLink,
}: WheelMainHeaderProps) {
  return (
    <div className="wheel-main-head">
      {editable ? (
        <input
          className="wheel-name-input"
          value={draftName}
          maxLength={60}
          placeholder="Wheel name"
          aria-label="Wheel name"
          disabled={spinning}
          onChange={(e) => onDraftNameChange(e.target.value)}
        />
      ) : (
        <h2 className="wheel-main-title">{activeName}</h2>
      )}
      <div className="wheel-main-actions">
        {editable && dirty && (
          <button
            type="button"
            className="wheel-btn wheel-btn--primary"
            onClick={() => void onSave()}
            disabled={saving || spinning}
          >
            {saving ? (
              <FaSpinner className="wheel-spinner" />
            ) : (
              <FaCheck size={12} />
            )}
            <span>Save changes</span>
          </button>
        )}
        {editable && (
          <button
            type="button"
            className="wheel-btn"
            onClick={() => void onTogglePublic()}
            disabled={busy || spinning}
          >
            {isPublic ? (
              <FaEyeSlash size={12} />
            ) : (
              <FaShareSquare size={12} />
            )}
            <span>{isPublic ? "Make private" : "Share"}</span>
          </button>
        )}
        {isPublic && (
          <button
            type="button"
            className="wheel-btn"
            onClick={() => void onCopyLink()}
          >
            {copiedLink ? <FaCheck size={12} /> : <FaLink size={12} />}
            <span>{copiedLink ? "Copied" : "Copy link"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface WheelOptionsPanelProps {
  editable: boolean;
  options: string[];
  spinning: boolean;
  newOption: string;
  onNewOptionChange: (value: string) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  copiedOptions: boolean;
  onCopyAllOptions: () => void;
  bulkText: string;
  onBulkTextChange: (value: string) => void;
  onAddBulk: () => void;
  onRemoveAllOptions: () => void;
}

function WheelOptionsPanel({
  editable,
  options,
  spinning,
  newOption,
  onNewOptionChange,
  onAddOption,
  onRemoveOption,
  copiedOptions,
  onCopyAllOptions,
  bulkText,
  onBulkTextChange,
  onAddBulk,
  onRemoveAllOptions,
}: WheelOptionsPanelProps) {
  return (
    <section className="wheel-panel">
      <header className="wheel-panel-head">
        <h3>
          Options
          <span className="wheel-panel-count">{options.length}</span>
        </h3>
        {editable && options.length > 0 && (
          <button
            type="button"
            className="wheel-icon-btn"
            onClick={() => void onCopyAllOptions()}
            title="Copy all options"
            aria-label="Copy all options"
          >
            {copiedOptions ? <FaCheck size={12} /> : <FaCopy size={12} />}
          </button>
        )}
      </header>

      {editable && (
        <div className="wheel-option-add">
          <input
            type="text"
            value={newOption}
            placeholder="Enter a new option"
            maxLength={MAX_WHEEL_OPTION_LENGTH}
            aria-label="New option"
            disabled={spinning}
            onChange={(e) => onNewOptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddOption();
            }}
          />
          <button
            type="button"
            className="wheel-btn wheel-btn--primary"
            onClick={onAddOption}
            disabled={spinning}
          >
            <FaPlus size={11} />
            <span>Add</span>
          </button>
        </div>
      )}

      <ul className="wheel-options-list">
        {options.map((option, index) => (
          <li key={`${option}-${index}`} className="wheel-option-item">
            <span className="wheel-option-text">{option}</span>
            {editable && (
              <button
                type="button"
                className="wheel-option-delete"
                onClick={() => onRemoveOption(index)}
                disabled={spinning}
                title="Delete option"
                aria-label={`Delete option ${option}`}
              >
                <FaTimes size={11} />
              </button>
            )}
          </li>
        ))}
        {options.length === 0 && (
          <li className="wheel-options-empty">No options yet</li>
        )}
      </ul>

      {editable && (
        <div className="wheel-bulk-wrap">
          <textarea
            className="wheel-bulk"
            rows={3}
            value={bulkText}
            placeholder={"Or paste many options here\none line = one option"}
            aria-label="Bulk options, one per line"
            disabled={spinning}
            onChange={(e) => onBulkTextChange(e.target.value)}
          />
          <div className="wheel-bulk-actions">
            <button
              type="button"
              className="wheel-btn"
              onClick={onAddBulk}
              disabled={!bulkText.trim() || spinning}
            >
              Add all lines
            </button>
            <button
              type="button"
              className="wheel-btn wheel-btn--danger"
              onClick={onRemoveAllOptions}
              disabled={options.length === 0 || spinning}
            >
              Remove all
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

interface WheelHistoryPanelProps {
  history: WheelHistoryEntry[];
  historyOpen: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onClear: () => void;
}

function WheelHistoryPanel({
  history,
  historyOpen,
  onToggle,
  onCopy,
  onClear,
}: WheelHistoryPanelProps) {
  return (
    <section className="wheel-panel wheel-history">
      <header className="wheel-panel-head">
        <button
          type="button"
          className="wheel-history-toggle"
          onClick={onToggle}
        >
          <FaTrophy size={12} />
          <span>Latest winners</span>
          <span className="wheel-badge">{history.length}</span>
        </button>
        <div className="wheel-history-actions">
          <button
            type="button"
            className="wheel-btn wheel-btn--small"
            onClick={() => void onCopy()}
            disabled={history.length === 0}
          >
            Copy
          </button>
          <button
            type="button"
            className="wheel-btn wheel-btn--small"
            onClick={onClear}
            disabled={history.length === 0}
          >
            Clear
          </button>
        </div>
      </header>
      {historyOpen &&
        (history.length === 0 ? (
          <p className="wheel-history-empty">
            No winners yet. Spin the wheel to fill this up.
          </p>
        ) : (
          <ul className="wheel-history-list">
            {history.map((entry, index) => (
              <li key={`${entry.time}-${index}`}>
                <span className="wheel-history-name">{entry.name}</span>
                <small className="wheel-history-time">{entry.time}</small>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function WheelEmpty({ canManage }: { canManage: boolean }) {
  return (
    <div className="wheel-empty">
      <FaTrophy size={28} />
      <p>
        {canManage
          ? "Create a wheel or pick one from the list to get started."
          : "No wheel selected. Open Wheel Spin from the streamer tools."}
      </p>
    </div>
  );
}

function WheelWinnerOverlay({
  winner,
  onClose,
}: {
  winner: string;
  onClose: () => void;
}) {
  return (
    <div
      className="wheel-winner-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Winner"
      onClick={onClose}
    >
      <div className="wheel-winner-box" onClick={(e) => e.stopPropagation()}>
        <h2>
          <FaTrophy size={22} /> Winner <FaTrophy size={22} />
        </h2>
        <div className="wheel-winner-name">{winner}</div>
        <button
          type="button"
          className="wheel-btn wheel-btn--primary"
          onClick={onClose}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export default function WheelApp({ initialWheelId = null }: WheelAppProps) {
  const [channelKey, setChannelKey] = useState<string | null>(null);
  const [wheels, setWheels] = useState<WheelSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<WheelPublicView | null>(null);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftOptions, setDraftOptions] = useState<string[]>([]);

  const [booting, setBooting] = useState(true);
  const [loadingWheel, setLoadingWheel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [newOption, setNewOption] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [newWheelName, setNewWheelName] = useState("");

  const [winner, setWinner] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [history, setHistory] = useState<WheelHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedOptions, setCopiedOptions] = useState(false);

  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const selectWheel = useCallback(async (id: string) => {
    setLoadingWheel(true);
    setError(null);
    try {
      const token = await getWheelToken(id);
      const channelParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("channel")
          : null;
      const wheel = await fetchWheel(id, token, channelParam);
      setActiveId(id);
      setOwnerToken(token);
      setActive(wheel);
      setDraftName(wheel.name);
      setDraftOptions(wheel.options);
      setHistory(getWheelHistory(id));
      setBulkText("");
      setNewOption("");
      if (typeof window !== "undefined" && /\/wheel\/?$/.test(window.location.pathname)) {
        const params = new URLSearchParams(window.location.search);
        params.set("wheel", id);
        window.history.replaceState({}, "", `/wheel?${params.toString()}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wheel");
      setActive(null);
      setActiveId(null);
    } finally {
      setLoadingWheel(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const theme = readStoredTheme();
      if (theme) {
        try {
          applyTheme(theme);
        } catch {
          // Unknown theme, keep defaults.
        }
      }
      const params = new URLSearchParams(window.location.search);
      const ch = params.get("channel");
      setChannelKey(ch);

      let list: WheelSummary[] = [];
      if (ch) {
        try {
          list = await listWheels(ch);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load wheels");
          }
        }
      }
      if (cancelled) return;
      setWheels(list);
      const target = initialWheelId || params.get("wheel") || list[0]?.id || null;
      if (target) {
        await selectWheel(target);
      }
      if (!cancelled) setBooting(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [initialWheelId, selectWheel]);

  const canManage = Boolean(channelKey);
  const editable = canManage || Boolean(ownerToken);
  const dirty = active
    ? draftName !== active.name ||
      JSON.stringify(draftOptions) !== JSON.stringify(active.options)
    : false;

  const particles = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const big = Math.random() > 0.75;
        const duration = Math.random() * 8 + 12;
        return {
          id: i,
          big,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          duration: `${duration}s`,
          delay: `${Math.random() * -duration}s`,
        };
      }),
    [],
  );

  const handleCreate = useCallback(async () => {
    if (!channelKey) return;
    setBusy(true);
    setError(null);
    try {
      const bootstrap = await createWheel({
        channelKey,
        name: newWheelName.trim() || "Untitled wheel",
        options: DEFAULT_WHEEL_OPTIONS,
      });
      await setWheelToken(bootstrap.id, bootstrap.ownerToken);
      setWheels((prev) => [
        {
          id: bootstrap.id,
          name: bootstrap.wheel.name,
          optionCount: bootstrap.wheel.options.length,
          isPublic: bootstrap.wheel.isPublic,
          createdAt: bootstrap.wheel.createdAt,
          updatedAt: bootstrap.wheel.updatedAt,
        },
        ...prev,
      ]);
      setNewWheelName("");
      await selectWheel(bootstrap.id);
      showToast("Wheel created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create wheel");
    } finally {
      setBusy(false);
    }
  }, [channelKey, newWheelName, selectWheel, showToast]);

  const handleSave = useCallback(async () => {
    if (!activeId || !active) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateWheel(
        activeId,
        { name: draftName.trim() || "Untitled wheel", options: draftOptions },
        { ownerToken, channelKey },
      );
      setActive(updated);
      setDraftName(updated.name);
      setDraftOptions(updated.options);
      setWheels((prev) =>
        prev.map((w) =>
          w.id === updated.id
            ? {
                ...w,
                name: updated.name,
                optionCount: updated.options.length,
                updatedAt: updated.updatedAt,
              }
            : w,
        ),
      );
      showToast("Changes saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save wheel");
    } finally {
      setSaving(false);
    }
  }, [
    active,
    activeId,
    channelKey,
    draftName,
    draftOptions,
    ownerToken,
    showToast,
  ]);

  const handleTogglePublic = useCallback(async () => {
    if (!activeId || !active) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWheel(
        activeId,
        { isPublic: !active.isPublic },
        { ownerToken, channelKey },
      );
      setActive(updated);
      setWheels((prev) =>
        prev.map((w) =>
          w.id === updated.id ? { ...w, isPublic: updated.isPublic } : w,
        ),
      );
      showToast(updated.isPublic ? "Wheel is now public" : "Wheel is now private");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sharing");
    } finally {
      setBusy(false);
    }
  }, [active, activeId, channelKey, ownerToken, showToast]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Delete this wheel? This cannot be undone.")
      ) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const token = await getWheelToken(id);
        await deleteWheel(id, { ownerToken: token, channelKey });
        await removeWheelToken(id);
        const nextWheels = wheels.filter((w) => w.id !== id);
        setWheels(nextWheels);
        if (activeId === id) {
          if (nextWheels[0]) {
            await selectWheel(nextWheels[0].id);
          } else {
            setActiveId(null);
            setActive(null);
            setOwnerToken(null);
          }
        }
        showToast("Wheel deleted");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete wheel");
      } finally {
        setBusy(false);
      }
    },
    [activeId, channelKey, selectWheel, showToast, wheels],
  );

  const copyShareLink = useCallback(async () => {
    if (!activeId) return;
    const url = `${window.location.origin}/wheel/${activeId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1500);
    } catch {
      setError("Could not copy link");
    }
  }, [activeId]);

  const copyAllOptions = useCallback(async () => {
    if (draftOptions.length === 0) return;
    try {
      await navigator.clipboard.writeText(draftOptions.join("\n"));
      setCopiedOptions(true);
      window.setTimeout(() => setCopiedOptions(false), 1500);
    } catch {
      setError("Could not copy options");
    }
  }, [draftOptions]);

  const addOption = useCallback(() => {
    const value = newOption.trim().slice(0, MAX_WHEEL_OPTION_LENGTH);
    if (!value) return;
    setDraftOptions((prev) => {
      if (prev.some((o) => o.toLowerCase() === value.toLowerCase())) return prev;
      if (prev.length >= MAX_WHEEL_OPTIONS) return prev;
      return [...prev, value];
    });
    setNewOption("");
  }, [newOption]);

  const removeOption = useCallback((index: number) => {
    setDraftOptions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeAllOptions = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete every option on this wheel?")
    ) {
      return;
    }
    setDraftOptions([]);
  }, []);

  const addBulk = useCallback(() => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim().slice(0, MAX_WHEEL_OPTION_LENGTH))
      .filter(Boolean);
    if (lines.length === 0) return;
    setDraftOptions((prev) => {
      const seen = new Set(prev.map((o) => o.toLowerCase()));
      const next = [...prev];
      for (const line of lines) {
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(line);
        if (next.length >= MAX_WHEEL_OPTIONS) break;
      }
      return next;
    });
    setBulkText("");
  }, [bulkText]);

  const handleWinner = useCallback(
    (option: string) => {
      setWinner(option);
      if (activeId) {
        setHistory(
          addWheelHistory(activeId, {
            name: option,
            time: formatHistoryTime(new Date()),
          }),
        );
      }
    },
    [activeId],
  );

  const copyHistory = useCallback(async () => {
    if (history.length === 0) return;
    const text = history.map((h) => `${h.time} - ${h.name}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("History copied");
    } catch {
      setError("Could not copy history");
    }
  }, [history, showToast]);

  const handleClearHistory = useCallback(() => {
    if (history.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear the winners history for this wheel?")
    ) {
      return;
    }
    if (activeId) clearWheelHistory(activeId);
    setHistory([]);
  }, [activeId, history.length]);

  return (
    <div className="wheel-page">
      <WheelParticles particles={particles} />

      <header className="wheel-header">
        <div className="wheel-header-brand">
          <span className="wheel-header-logo" aria-hidden="true">
            <FaTrophy size={16} />
          </span>
          <div>
            <h1>Wheel Spin</h1>
            <p>A streamer tool by Mixchat</p>
          </div>
        </div>
        {channelKey && <span className="wheel-header-channel">{channelKey}</span>}
      </header>

      {error && (
        <div className="wheel-banner wheel-banner--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="wheel-icon-btn"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <FaTimes size={12} />
          </button>
        </div>
      )}

      <div className={`wheel-layout${canManage ? "" : " wheel-layout--solo"}`}>
        {canManage && (
          <WheelSidebar
            wheels={wheels}
            activeId={activeId}
            spinning={spinning}
            busy={busy}
            newWheelName={newWheelName}
            onNewWheelNameChange={setNewWheelName}
            onSelect={selectWheel}
            onDelete={handleDelete}
            onCreate={handleCreate}
          />
        )}

        <main className="wheel-main">
          {booting || loadingWheel ? (
            <div className="wheel-loading">
              <FaSpinner className="wheel-spinner" size={20} />
              <span>Loading…</span>
            </div>
          ) : !active ? (
            <WheelEmpty canManage={canManage} />
          ) : (
            <>
              <WheelMainHeader
                editable={editable}
                activeName={active.name}
                draftName={draftName}
                onDraftNameChange={setDraftName}
                spinning={spinning}
                dirty={dirty}
                saving={saving}
                busy={busy}
                isPublic={active.isPublic}
                copiedLink={copiedLink}
                onSave={handleSave}
                onTogglePublic={handleTogglePublic}
                onCopyLink={copyShareLink}
              />

              <WheelStage
                options={draftOptions}
                onWinner={handleWinner}
                onSpinStateChange={setSpinning}
              />

              <WheelOptionsPanel
                editable={editable}
                options={draftOptions}
                spinning={spinning}
                newOption={newOption}
                onNewOptionChange={setNewOption}
                onAddOption={addOption}
                onRemoveOption={removeOption}
                copiedOptions={copiedOptions}
                onCopyAllOptions={copyAllOptions}
                bulkText={bulkText}
                onBulkTextChange={setBulkText}
                onAddBulk={addBulk}
                onRemoveAllOptions={removeAllOptions}
              />

              <WheelHistoryPanel
                history={history}
                historyOpen={historyOpen}
                onToggle={() => setHistoryOpen((o) => !o)}
                onCopy={copyHistory}
                onClear={handleClearHistory}
              />
            </>
          )}
        </main>
      </div>

      {winner !== null && (
        <WheelWinnerOverlay winner={winner} onClose={() => setWinner(null)} />
      )}

      {toast && <div className="wheel-toast">{toast}</div>}
    </div>
  );
}
