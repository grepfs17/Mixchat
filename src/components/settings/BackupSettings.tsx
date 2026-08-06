import React from "react";
import {
  FaDownload,
  FaUpload,
  FaCloudUploadAlt,
  FaCloudDownloadAlt,
  FaLink,
  FaCheck,
} from "react-icons/fa";
import { exportSettings } from "../../lib/settingsBackup";
import { IS_TWITCH_ONLY } from "../../lib/constants";
import type { SettingsItemDef } from "./types";

export interface BackupSettingsProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importMessage: string | null;
  handleDriveSave: () => void;
  handleDriveLoad: () => void;
  handleCopyLink: () => void;
  driveLoading: "save" | "load" | null;
  driveMessage: string | null;
  shareLink: string | null;
  linkCopied: boolean;
  hasYoutubeSession: boolean;
  hasDriveScope: boolean;
  onReauthYoutube: () => void;
  onYoutubeDriveLogin: () => void;
}


function ExportImportSetting({
  fileInputRef,
  handleImport,
  importMessage,
}: Pick<
  BackupSettingsProps,
  "fileInputRef" | "handleImport" | "importMessage"
>) {
  return (
    <div className="embed-config-backup-section">
      <p className="embed-config-backup-description">
        Export your settings, favorites, and linked YouTube channels to a json
        file. Import them later to restore — even on a different device.
      </p>
      <div className="embed-config-backup-buttons">
        <button
          type="button"
          onClick={() => exportSettings()}
          className="embed-config-backup-btn"
        >
          <FaDownload size={13} /> Export
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="embed-config-backup-btn"
        >
          <FaUpload size={13} /> Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: "none" }}
        />
      </div>
      {importMessage && (
        <p
          className={`embed-config-backup-message ${importMessage.includes("Restored") ? "embed-config-backup-message--success" : "embed-config-backup-message--error"}`}
        >
          {importMessage}
        </p>
      )}
    </div>
  );
}

function GoogleDriveSetting({
  hasYoutubeSession,
  hasDriveScope,
  onReauthYoutube,
  onYoutubeDriveLogin,
  handleDriveSave,
  handleDriveLoad,
  handleCopyLink,
  driveLoading,
  driveMessage,
  shareLink,
  linkCopied,
}: Omit<BackupSettingsProps, "fileInputRef" | "handleImport" | "importMessage">) {
  return (
    <div className="embed-config-backup-section">
      <p className="embed-config-backup-description">
        {hasYoutubeSession && hasDriveScope
          ? "Save and load your settings directly from your Google Drive. Requires Google sign-in with Drive access."
          : hasYoutubeSession
            ? "Grant Drive access to save and load settings from Google Drive."
            : "Sign in with Google to save and load settings from Google Drive."}
      </p>
      <div className="embed-config-backup-buttons">
        <button
          type="button"
          onClick={handleDriveSave}
          className="embed-config-backup-btn embed-config-drive-btn"
          disabled={
            driveLoading !== null ||
            !hasYoutubeSession ||
            !hasDriveScope
          }
        >
          {driveLoading === "save" ? (
            <>
              <span className="embed-config-spinner" /> Saving...
            </>
          ) : (
            <>
              <FaCloudUploadAlt size={13} /> Save to Drive
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleDriveLoad}
          className="embed-config-backup-btn embed-config-drive-btn"
          disabled={
            driveLoading !== null ||
            !hasYoutubeSession ||
            !hasDriveScope
          }
        >
          {driveLoading === "load" ? (
            <>
              <span className="embed-config-spinner" /> Loading...
            </>
          ) : (
            <>
              <FaCloudDownloadAlt size={13} /> Load from Drive
            </>
          )}
        </button>
      </div>
      {driveMessage && (
        <p
          className={`embed-config-backup-message ${driveMessage.includes("saved") || driveMessage.includes("Loaded") ? "embed-config-backup-message--success" : "embed-config-backup-message--error"}`}
        >
          {driveMessage}
        </p>
      )}
      {shareLink && (
        <div className="embed-config-share-link">
          <span
            className="embed-config-share-link-url"
            title={shareLink}
          >
            {shareLink}
          </span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="embed-config-share-link-copy"
            title="Copy link"
          >
            {linkCopied ? <FaCheck size={12} /> : <FaLink size={12} />}
          </button>
        </div>
      )}
      {!hasYoutubeSession && (
        <button
          type="button"
          onClick={onReauthYoutube}
          className="embed-config-backup-btn embed-config-reauth-btn"
        >
          Sign in with Google
        </button>
      )}
      {hasYoutubeSession && !hasDriveScope && (
        <button
          type="button"
          onClick={onYoutubeDriveLogin}
          className="embed-config-backup-btn embed-config-reauth-btn"
        >
          Grant Drive Access
        </button>
      )}
    </div>
  );
}

export function getBackupSettings(
  props: BackupSettingsProps,
): SettingsItemDef[] {
  return [
    {
      id: "export-import",
      group: "backup",
      label: "Export / Import settings",
      description:
        "Export your settings to a json file or import from one",
      render: () => (
        <ExportImportSetting
          fileInputRef={props.fileInputRef}
          handleImport={props.handleImport}
          importMessage={props.importMessage}
        />
      ),
    },
    ...(IS_TWITCH_ONLY
      ? []
      : [
          {
            id: "google-drive",
            group: "backup" as const,
            label: "Google Drive backup",
            description:
              "Save and load your settings directly from your Google Drive",
            render: () => (
              <GoogleDriveSetting
                hasYoutubeSession={props.hasYoutubeSession}
                hasDriveScope={props.hasDriveScope}
                onReauthYoutube={props.onReauthYoutube}
                onYoutubeDriveLogin={props.onYoutubeDriveLogin}
                handleDriveSave={props.handleDriveSave}
                handleDriveLoad={props.handleDriveLoad}
                handleCopyLink={props.handleCopyLink}
                driveLoading={props.driveLoading}
                driveMessage={props.driveMessage}
                shareLink={props.shareLink}
                linkCopied={props.linkCopied}
              />
            ),
          },
        ]),
  ];
}
