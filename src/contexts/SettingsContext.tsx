import React, { createContext, useContext } from "react";
import type { UseChatSettingsResult } from "../hooks/app/useChatSettings";

const SettingsContext = createContext<UseChatSettingsResult | null>(null);

export function SettingsProvider({
  value,
  children,
}: {
  value: UseChatSettingsResult;
  children: React.ReactNode;
}) {
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext(): UseChatSettingsResult {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error(
      "useSettingsContext must be used within a <SettingsProvider>",
    );
  }
  return ctx;
}
