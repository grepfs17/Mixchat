import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaArrowLeft,
  FaArrowRight,
  FaBroadcastTower,
  FaCheck,
  FaEye,
  FaShieldAlt,
  FaTimes,
  FaInfoCircle,
  FaTwitch,
  FaYoutube,
} from "react-icons/fa";
import type { ChatFont, ChatTheme } from "../lib/types";
import {
  CHAT_FONT_OPTIONS,
  FONT_FAMILY_MAP,
  THEME_OPTIONS,
} from "../lib/types";
import "../styles/OnboardingWizard.css";

type UserType = "streamer" | "mod" | "viewer";

interface OnboardingWizardProps {
  chatTheme: ChatTheme;
  onChatThemeChange: (value: ChatTheme) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  chatFont: ChatFont;
  onChatFontChange: (value: ChatFont) => void;
  streamerToolsEnabled: boolean;
  onStreamerToolsEnabledChange: (value: boolean) => void;
  hideViewerCount: boolean;
  onHideViewerCountChange: (value: boolean) => void;
  unifyChatEnabled: boolean;
  onUnifyChatEnabledChange: (value: boolean) => void;
  showDeletedMessages: boolean;
  onShowDeletedMessagesChange: (value: boolean) => void;
  compactActions: boolean;
  onCompactActionsChange: (value: boolean) => void;
  keepModActionsVisible: boolean;
  onKeepModActionsVisibleChange: (value: boolean) => void;
  modActionsFirst: boolean;
  onModActionsFirstChange: (value: boolean) => void;
  doubleClickConfirmModActions: boolean;
  onDoubleClickConfirmModActionsChange: (value: boolean) => void;
  embedDefaultOpen: boolean;
  onEmbedDefaultOpenChange: (value: boolean) => void;
  hideChatTimestamps: boolean;
  onHideChatTimestampsChange: (value: boolean) => void;
  onComplete: () => void;
}

interface SettingDef {
  key:
    | "streamerToolsEnabled"
    | "hideViewerCount"
    | "unifyChatEnabled"
    | "showDeletedMessages"
    | "compactActions"
    | "keepModActionsVisible"
    | "modActionsFirst"
    | "doubleClickConfirmModActions"
    | "embedDefaultOpen"
    | "hideChatTimestamps";
  label: string;
  description: string;
  choosableFor: UserType[];
  icon: React.ReactNode;
}

const STREAMER_MOD_DEFAULTS: Record<string, boolean> = {
  streamerToolsEnabled: true,
  hideViewerCount: true,
  unifyChatEnabled: true,
  showDeletedMessages: true,
  compactActions: true,
  keepModActionsVisible: true,
  modActionsFirst: true,
  doubleClickConfirmModActions: true,
  embedDefaultOpen: false,
  hideChatTimestamps: true,
};

const VIEWER_DEFAULTS: Record<string, boolean> = {
  streamerToolsEnabled: false,
  hideViewerCount: false,
  unifyChatEnabled: true,
  showDeletedMessages: true,
  compactActions: false,
  keepModActionsVisible: false,
  modActionsFirst: false,
  doubleClickConfirmModActions: false,
  embedDefaultOpen: true,
  hideChatTimestamps: false,
};

const USER_TYPES: {
  value: UserType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "streamer",
    label: "I'm a streamer",
    description: "I run my own channel and want mod tools & streamer utilities.",
    icon: <FaBroadcastTower size={20} />,
  },
  {
    value: "mod",
    label: "I'm a moderator",
    description: "I help moderate chats and need quick access to mod actions.",
    icon: <FaShieldAlt size={20} />,
  },
  {
    value: "viewer",
    label: "I'm a viewer",
    description: "I just want to watch streams and chat with the community.",
    icon: <FaEye size={20} />,
  },
];

const BASE_SETTINGS: SettingDef[] = [
  {
    key: "streamerToolsEnabled",
    label: "Streamer tools",
    description:
      "Shows a Streamer tools button in the chat header on your own channel with giveaways, song queue, and other utilities.",
    choosableFor: [],
    icon: <FaBroadcastTower size={13} />,
  },
  {
    key: "hideViewerCount",
    label: "Hide viewer count on your own channel",
    description:
      "Hides the live viewer count while you are on your own channel so the number isn't visible during your stream.",
    choosableFor: [],
    icon: <FaEye size={13} />,
  },
  {
    key: "embedDefaultOpen",
    label: "Open stream embed by default",
    description:
      "If enabled, the stream player shows alongside the chat when you open Mixchat. If disabled, chat takes the full width.",
    choosableFor: ["mod"],
    icon: <FaInfoCircle size={13} />,
  },
  {
    key: "unifyChatEnabled",
    label: "Unify Twitch and YouTube chats",
    description:
      "Combines messages from both platforms into a single chronological feed. Each message keeps its platform styling.",
    choosableFor: ["viewer"],
    icon: <FaInfoCircle size={13} />,
  },
  {
    key: "showDeletedMessages",
    label: "Show deleted messages",
    description:
      "Keeps removed messages in chat as a click-to-reveal link so you can still see what was said.",
    choosableFor: ["streamer", "viewer"],
    icon: <FaInfoCircle size={13} />,
  },
  {
    key: "compactActions",
    label: "Hide inline action buttons",
    description:
      "Hides the small reply/copy/mod buttons under each message. You can still right-click (or long-press on mobile) for the context menu.",
    choosableFor: [],
    icon: <FaInfoCircle size={13} />,
  },
  {
    key: "keepModActionsVisible",
    label: "Keep mod actions visible",
    description:
      "Even with inline actions hidden, mod buttons (delete, timeout, ban, warn) stay visible to make moderation faster.",
    choosableFor: [],
    icon: <FaShieldAlt size={13} />,
  },
  {
    key: "modActionsFirst",
    label: "Show mod actions at the start of the message",
    description:
      "Places the mod action buttons at the start of each message, before the timestamp and badges. Reply and copy stay at the end.",
    choosableFor: [],
    icon: <FaShieldAlt size={13} />,
  },
  {
    key: "doubleClickConfirmModActions",
    label: "Double-click to confirm mod actions",
    description:
      "Requires a double-click on mod action buttons (delete, timeout, ban) so they don't fire by accident.",
    choosableFor: ["streamer", "mod"],
    icon: <FaShieldAlt size={13} />,
  },
  {
    key: "hideChatTimestamps",
    label: "Hide chat timestamps",
    description:
      "Removes the time each message was sent for a cleaner, less cluttered chat view.",
    choosableFor: ["streamer", "mod", "viewer"],
    icon: <FaInfoCircle size={13} />,
  },
];

export default function OnboardingWizard({
  chatTheme,
  onChatThemeChange,
  fontSize,
  onFontSizeChange,
  chatFont,
  onChatFontChange,
  streamerToolsEnabled,
  onStreamerToolsEnabledChange,
  hideViewerCount,
  onHideViewerCountChange,
  unifyChatEnabled,
  onUnifyChatEnabledChange,
  showDeletedMessages,
  onShowDeletedMessagesChange,
  compactActions,
  onCompactActionsChange,
  keepModActionsVisible,
  onKeepModActionsVisibleChange,
  modActionsFirst,
  onModActionsFirstChange,
  doubleClickConfirmModActions,
  onDoubleClickConfirmModActionsChange,
  embedDefaultOpen,
  onEmbedDefaultOpenChange,
  hideChatTimestamps,
  onHideChatTimestampsChange,
  onComplete,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [userType, setUserType] = useState<UserType | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onComplete]);

  const currentValues = useMemo<Record<string, boolean>>(
    () => ({
      streamerToolsEnabled,
      hideViewerCount,
      unifyChatEnabled,
      showDeletedMessages,
      compactActions,
      keepModActionsVisible,
      modActionsFirst,
      doubleClickConfirmModActions,
      embedDefaultOpen,
      hideChatTimestamps,
    }),
    [
      streamerToolsEnabled,
      hideViewerCount,
      unifyChatEnabled,
      showDeletedMessages,
      compactActions,
      keepModActionsVisible,
      modActionsFirst,
      doubleClickConfirmModActions,
      embedDefaultOpen,
      hideChatTimestamps,
    ],
  );

  const handleSettingToggle = useCallback(
    (key: SettingDef["key"]) => {
      switch (key) {
        case "streamerToolsEnabled":
          onStreamerToolsEnabledChange(!streamerToolsEnabled);
          break;
        case "hideViewerCount":
          onHideViewerCountChange(!hideViewerCount);
          break;
        case "unifyChatEnabled":
          onUnifyChatEnabledChange(!unifyChatEnabled);
          break;
        case "showDeletedMessages":
          onShowDeletedMessagesChange(!showDeletedMessages);
          break;
        case "compactActions":
          onCompactActionsChange(!compactActions);
          break;
        case "keepModActionsVisible":
          onKeepModActionsVisibleChange(!keepModActionsVisible);
          break;
        case "modActionsFirst":
          onModActionsFirstChange(!modActionsFirst);
          break;
        case "doubleClickConfirmModActions":
          onDoubleClickConfirmModActionsChange(!doubleClickConfirmModActions);
          break;
        case "embedDefaultOpen":
          onEmbedDefaultOpenChange(!embedDefaultOpen);
          break;
        case "hideChatTimestamps":
          onHideChatTimestampsChange(!hideChatTimestamps);
          break;
      }
    },
    [
      streamerToolsEnabled,
      hideViewerCount,
      unifyChatEnabled,
      showDeletedMessages,
      compactActions,
      keepModActionsVisible,
      modActionsFirst,
      doubleClickConfirmModActions,
      embedDefaultOpen,
      hideChatTimestamps,
      onStreamerToolsEnabledChange,
      onHideViewerCountChange,
      onUnifyChatEnabledChange,
      onShowDeletedMessagesChange,
      onCompactActionsChange,
      onKeepModActionsVisibleChange,
      onModActionsFirstChange,
      onDoubleClickConfirmModActionsChange,
      onEmbedDefaultOpenChange,
      onHideChatTimestampsChange,
    ],
  );

  const handleSelectType = useCallback(
    (type: UserType) => {
      setUserType(type);
      const defaults =
        type === "viewer" ? VIEWER_DEFAULTS : STREAMER_MOD_DEFAULTS;
      onStreamerToolsEnabledChange(defaults.streamerToolsEnabled);
      onHideViewerCountChange(defaults.hideViewerCount);
      onUnifyChatEnabledChange(defaults.unifyChatEnabled);
      onShowDeletedMessagesChange(defaults.showDeletedMessages);
      onCompactActionsChange(defaults.compactActions);
      onKeepModActionsVisibleChange(defaults.keepModActionsVisible);
      onModActionsFirstChange(defaults.modActionsFirst);
      onDoubleClickConfirmModActionsChange(
        defaults.doubleClickConfirmModActions,
      );
      onEmbedDefaultOpenChange(defaults.embedDefaultOpen);
      onHideChatTimestampsChange(defaults.hideChatTimestamps);
    },
    [
      onStreamerToolsEnabledChange,
      onHideViewerCountChange,
      onUnifyChatEnabledChange,
      onShowDeletedMessagesChange,
      onCompactActionsChange,
      onKeepModActionsVisibleChange,
      onModActionsFirstChange,
      onDoubleClickConfirmModActionsChange,
      onEmbedDefaultOpenChange,
      onHideChatTimestampsChange,
    ],
  );

  const goNext = useCallback(() => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
  }, [step]);

  const goBack = useCallback(() => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  }, [step]);

  const handleFinish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <div
      className="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="onboarding-card">
        <div className="onboarding-header">
          <div className="onboarding-header-row">
            <div className="onboarding-step-indicator" aria-hidden="true">
              <span
                className={`onboarding-step-dot${
                  step > 1
                    ? " onboarding-step-dot--done"
                    : " onboarding-step-dot--active"
                }`}
              />
              <span
                className={`onboarding-step-dot${
                  step > 2
                    ? " onboarding-step-dot--done"
                    : step === 2
                      ? " onboarding-step-dot--active"
                      : ""
                }`}
              />
              <span
                className={`onboarding-step-dot${
                  step === 3 ? " onboarding-step-dot--active" : ""
                }`}
              />
              <span style={{ marginLeft: "6px" }}>
                Step {step} of 3
              </span>
            </div>
            <button
              type="button"
              className="onboarding-skip"
              onClick={onComplete}
              title="Skip the setup wizard"
            >
              Skip setup
            </button>
          </div>
          <h2 className="onboarding-title" id="onboarding-title">
            {step === 1
              ? "Do you want help to configure Mixchat?"
              : step === 2
                ? "Pick a theme"
                : "How will you use Mixchat?"}
          </h2>
          <p className="onboarding-subtitle">
            {step === 1
              ? "If you already configured it to your liking, you can skip this setup.Every option is also available later in Settings."
              : step === 2
                ? "Choose how Mixchat looks for you. You can switch any time from Settings."
                : "Pick the role that fits you best. We'll set up sensible defaults — you can fine-tune every option afterwards."}
          </p>
        </div>

        <div className="onboarding-body">
          {step === 1 ? (
            <div className="onboarding-welcome">
              <img
                src="/logo.webp"
                alt="Mixchat"
                className="onboarding-welcome-logo"
              />
              <p className="onboarding-welcome-lead">
                You're logged in and ready to go.
              </p>
              <p className="onboarding-welcome-detail">
                This short setup will help us pick a theme, font, and chat
                defaults that match how you use Mixchat. It only takes a
                moment.
              </p>
              <ul className="onboarding-welcome-list">
                <li>Pick a theme and font for the chat</li>
                <li>Choose your role (streamer, moderator, or viewer)</li>
                <li>Review the recommended settings before we apply them</li>
              </ul>
            </div>
          ) : step === 2 ? (
            <>
              <div
                className="onboarding-preview"
                style={{
                  "--chat-font-size": `${fontSize}px`,
                  "--chat-font-family": FONT_FAMILY_MAP[chatFont],
                } as React.CSSProperties}
              >
                <div className="onboarding-preview-header">
                  <span className="onboarding-preview-header-text">
                    Chat preview
                  </span>
                </div>
                <div className="messages-container">
                  <div className="message chat">
                    <div className="message-single-line">
                      <span className="timestamp">14:03:52</span>
                      <span
                        className="platform-tag twitch"
                        title="Twitch"
                      >
                        <FaTwitch size={14} />
                      </span>
                      <a
                        href="#"
                        className="author author-link"
                        style={{ color: "#c084fc" }}
                        onClick={(e) => e.preventDefault()}
                      >
                        notmasterofpupis
                      </a>
                      <span className="message-separator">:</span>
                      <span className="message-text">
                        Where Am I?{" "}
                        <img
                          className="chat-emote"
                          src="https://cdn.7tv.app/emote/01KRE17CM55VBYZGP9YYQBT827/2x.avif"
                          alt="Clap"
                          title="Clap"
                          loading="lazy"
                          style={{
                            height: "2em",
                            verticalAlign: "middle",
                            margin: "0 2px",
                            cursor: "pointer",
                          }}
                        />
                      </span>
                    </div>
                  </div>
                  <div className="message chat mention">
                    <div className="message-single-line">
                      <span className="timestamp">14:03:53</span>
                      <span
                        className="platform-tag twitch"
                        title="Twitch"
                      >
                        <FaTwitch size={14} />
                      </span>
                      <a
                        href="#"
                        className="author author-link"
                        style={{ color: "#34d399" }}
                        onClick={(e) => e.preventDefault()}
                      >
                        nothelder
                      </a>
                      <span className="message-separator">:</span>
                      <span className="message-text">
                        I just realized that my cousin drunk my beverage{" "}
                        <img
                          className="chat-emote"
                          src="https://cdn.7tv.app/emote/01KM1SMMWW98AYC11B0FRFDPZ4/2x.avif"
                          alt="Pog"
                          title="Pog"
                          loading="lazy"
                          style={{
                            height: "2em",
                            verticalAlign: "middle",
                            margin: "0 2px",
                            cursor: "pointer",
                          }}
                        />
                      </span>
                    </div>
                  </div>
                  <div className="message chat">
                    <div className="message-single-line">
                      <span className="timestamp">14:04:11</span>
                      <span
                        className="platform-tag twitch"
                        title="Twitch"
                      >
                        <FaTwitch size={14} />
                      </span>
                      <a
                        href="#"
                        className="author author-link"
                        style={{ color: "#fbbf24" }}
                        onClick={(e) => e.preventDefault()}
                      >
                        shokastion
                      </a>
                      <span className="message-separator">:</span>
                      <span className="message-text">
                        In your head, in your head{" "}
                        <img
                          className="chat-emote"
                          src="https://cdn.7tv.app/emote/01H1V70JZR000CVRT9DGWR9563/2x.avif"
                          alt="emote"
                          title="emote"
                          loading="lazy"
                          style={{
                            height: "2em",
                            verticalAlign: "middle",
                            margin: "0 2px",
                            cursor: "pointer",
                          }}
                        />
                      </span>
                    </div>
                  </div>
                  <div className="message chat yt-event">
                    <div className="message-single-line">
                      <span className="timestamp">14:05:27</span>
                      <span
                        className="platform-tag youtube"
                        title="YouTube"
                      >
                        <FaYoutube size={14} />
                      </span>
                      <span
                        className="author"
                        style={{ color: "#f87171" }}
                      >
                        youtube_avg_chatter
                      </span>
                      <span className="message-separator">:</span>
                      <span className="message-text">
                        I love your Irish accent
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="onboarding-theme-grid">
                {THEME_OPTIONS.map(({ value, label, preview, section }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onChatThemeChange(value as ChatTheme)}
                    className={`onboarding-theme-btn${
                      chatTheme === value
                        ? " onboarding-theme-btn--active"
                        : ""
                    }`}
                  >
                    {section && (
                      <div className="onboarding-theme-section">
                        {section}
                      </div>
                    )}
                    <div className="onboarding-theme-preview">
                      <div
                        className="onboarding-theme-preview-bg"
                        style={{ backgroundColor: preview.bg }}
                      />
                      <div
                        className="onboarding-theme-preview-hover"
                        style={{ backgroundColor: preview.hover }}
                      />
                      <div
                        className="onboarding-theme-preview-accent"
                        style={{ backgroundColor: preview.accent }}
                      />
                    </div>
                    <span className="onboarding-theme-label">{label}</span>
                    {chatTheme === value && (
                      <span className="onboarding-theme-check">✓</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="onboarding-typography">
                <div className="onboarding-typography-row">
                  <label className="onboarding-typography-label">
                    Font size
                    <span className="onboarding-typography-value">
                      {fontSize}px
                    </span>
                  </label>
                  <div className="onboarding-typography-controls">
                    <span className="onboarding-typography-bound">A</span>
                    <input
                      type="range"
                      min="12"
                      max="22"
                      step="1"
                      value={fontSize}
                      onChange={(e) =>
                        onFontSizeChange(parseInt(e.target.value))
                      }
                      className="onboarding-typography-range"
                    />
                    <span className="onboarding-typography-bound onboarding-typography-bound--large">
                      A
                    </span>
                  </div>
                </div>
                <div className="onboarding-typography-row">
                  <label className="onboarding-typography-label">Font</label>
                  <div className="onboarding-typography-fonts">
                    {CHAT_FONT_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onChatFontChange(value)}
                        className={`onboarding-typography-font${
                          chatFont === value
                            ? " onboarding-typography-font--active"
                            : ""
                        }`}
                        style={{ fontFamily: FONT_FAMILY_MAP[value] }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="onboarding-types" role="radiogroup" aria-label="Select your role">
                {USER_TYPES.map((t) => {
                  const active = userType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleSelectType(t.value)}
                      className={`onboarding-type-card${
                        active ? " onboarding-type-card--active" : ""
                      }`}
                    >
                      <span className="onboarding-type-check" aria-hidden="true">
                        <FaCheck size={11} />
                      </span>
                      <div className="onboarding-type-icon" aria-hidden="true">
                        {t.icon}
                      </div>
                      <div className="onboarding-type-label">{t.label}</div>
                      <div className="onboarding-type-desc">
                        {t.description}
                      </div>
                    </button>
                  );
                })}
              </div>

              {userType && (
                <div className="onboarding-settings">
                  <h3 className="onboarding-settings-title">
                    Your recommended settings
                  </h3>
                  <p className="onboarding-settings-hint">
                    Pre-selected to match your role. Toggle the highlighted
                    ones to taste, and adjust everything later in Settings.
                  </p>
                  <div className="onboarding-settings-list">
                    {BASE_SETTINGS.map((s) => {
                      const value = currentValues[s.key];
                      const isChoosable = s.choosableFor.includes(userType);
                      return (
                        <div key={s.key} className="onboarding-setting">
                          <div className="onboarding-setting-icon">
                            {s.icon}
                          </div>
                          <div className="onboarding-setting-content">
                            <p className="onboarding-setting-label">
                              {s.label}
                            </p>
                            <p className="onboarding-setting-desc">
                              {s.description}
                            </p>
                          </div>
                          <div className="onboarding-setting-state">
                            {isChoosable ? (
                              <label
                                className="onboarding-toggle"
                                title={value ? "Disable" : "Enable"}
                              >
                                <input
                                  type="checkbox"
                                  checked={value}
                                  onChange={() => handleSettingToggle(s.key)}
                                />
                                <span className="onboarding-toggle-slider" />
                              </label>
                            ) : (
                              <span
                                className={`onboarding-state-pill${
                                  !value ? " onboarding-state-pill--off" : ""
                                }`}
                              >
                                {value ? (
                                  <>
                                    <FaCheck size={10} />
                                    On
                                  </>
                                ) : (
                                  <>
                                    <FaTimes size={10} />
                                    Off
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="onboarding-footer">
          <div className="onboarding-footer-hint">
            <FaInfoCircle size={12} />
            Everything you set here can be changed later in Settings.
          </div>
          <div className="onboarding-footer-actions">
            {step > 1 && (
              <button
                type="button"
                className="onboarding-btn onboarding-btn--back"
                onClick={goBack}
              >
                <FaArrowLeft size={12} /> Back
              </button>
            )}
            {step === 1 ? (
              <>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--ghost"
                  onClick={onComplete}
                  title="Skip the setup wizard"
                >
                  Skip setup
                </button>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--primary"
                  onClick={goNext}
                >
                  Continue <FaArrowRight size={12} />
                </button>
              </>
            ) : step === 2 ? (
              <button
                type="button"
                className="onboarding-btn onboarding-btn--primary"
                onClick={goNext}
              >
                Next <FaArrowRight size={12} />
              </button>
            ) : (
              <button
                type="button"
                className="onboarding-btn onboarding-btn--primary"
                onClick={handleFinish}
                disabled={!userType}
                title={!userType ? "Pick a role to continue" : "Finish setup"}
              >
                Finish <FaArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
