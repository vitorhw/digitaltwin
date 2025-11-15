"use client";

import { createContext, useContext } from "react";

export const SetupFooterPortalContext = createContext<HTMLElement | null>(null);

export function useSetupFooterPortal() {
  return useContext(SetupFooterPortalContext);
}
