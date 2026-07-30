import React from "react";
import { FaPlay } from "react-icons/fa";
import type { SettingsItemDef } from "./types";


function HelpWizardsSetting() {
  return (
    <div className="embed-config-backup-section">
      <p className="embed-config-backup-description">
        Re-open any of the guided wizards to revisit their choices. They don't
        change your existing settings unless you finish them.
      </p>
      <div className="embed-config-backup-buttons">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("mixchat:show-onboarding"),
            )
          }
          className="embed-config-backup-btn"
        >
          <FaPlay size={12} /> Show setup wizard
        </button>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("mixchat:show-mobile-hint"),
            )
          }
          className="embed-config-backup-btn"
        >
          <FaPlay size={12} /> Show mobile controls wizard
        </button>
      </div>
    </div>
  );
}


export function getHelpSettings(): SettingsItemDef[] {
  return [
    {
      id: "help-wizards",
      group: "help",
      label: "Guided wizards",
      description:
        "Re-open the onboarding wizards at any time to revisit their choices",
      render: () => <HelpWizardsSetting />,
    },
  ];
}
