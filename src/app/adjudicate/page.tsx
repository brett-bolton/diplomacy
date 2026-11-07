import type { Metadata } from "next"
import Link from "next/link"
import { SandboxClient } from "@/ui/SandboxClient"

export const metadata: Metadata = {
  title: "Adjudicator · Diplomacy companion",
  description: "Set up any Diplomacy position, give orders for every power, and see the adjudicated result with explanations.",
}

export default function AdjudicatePage() {
  return (
    <main className="safe-top safe-bottom mx-auto w-full max-w-md flex-1 px-3 py-4">
      <Link href="/" className="mb-2 inline-block text-sm text-accent">
        ‹ Home
      </Link>
      <SandboxClient />
    </main>
  )
}
