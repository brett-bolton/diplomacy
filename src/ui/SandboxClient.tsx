"use client"

import dynamic from "next/dynamic"

// The adjudicator reads its scenario from the URL hash, which only exists in the
// browser, so it renders on the client only.
export const SandboxClient = dynamic(() => import("./Sandbox").then((m) => m.Sandbox), {
  ssr: false,
  loading: () => <p className="text-text-2">Loading…</p>,
})
