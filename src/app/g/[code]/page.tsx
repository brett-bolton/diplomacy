"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import { Board } from "@/map/Board"
import { ChecklistBanner } from "@/ui/ChecklistBanner"
import { GmPanel } from "@/ui/GmPanel"
import { HistoryView } from "@/ui/HistoryView"
import { useGame } from "@/ui/hooks"
import { Card } from "@/ui/kit"
import { OrdersPanel } from "@/ui/OrdersPanel"
import { PhaseHeader } from "@/ui/StatusBar"
import { powerName } from "@/ui/text"

type Tab = "orders" | "board" | "history" | "gm"

function GamePage() {
  const { code } = useParams<{ code: string }>()
  const { view, error, refresh, serverNow } = useGame(code)
  const [tab, setTab] = useState<Tab | null>(null)
  const onExpire = useCallback(() => {
    setTimeout(refresh, 600)
  }, [refresh])

  const isPlayer = !!view?.me.powers.length
  const isGm = !!view?.me.isGameMaster
  const tabs: { id: Tab; label: string }[] = [
    ...(isPlayer ? [{ id: "orders" as const, label: "Orders" }] : []),
    { id: "board", label: "Board" },
    { id: "history", label: "History" },
    ...(isGm ? [{ id: "gm" as const, label: "Game master" }] : []),
  ]
  const current: Tab = tab && tabs.some((t) => t.id === tab) ? tab : isPlayer ? "orders" : isGm ? "gm" : "board"

  useEffect(() => {
    if (view) document.title = `${view.phase.label} · ${view.game.name}`
  }, [view])

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16">
        <Card className="p-5 text-text-2">{error ? error.message : "Loading game…"}</Card>
      </main>
    )
  }

  const result = view.game.result
  const winnerSeat = result?.kind === "victory" ? view.participants.find((p) => p.seat === result.seat) : undefined

  return (
    <main className="safe-bottom mx-auto w-full max-w-md flex-1 px-3">
      <div className="safe-top sticky top-0 z-30 -mx-3 border-b border-line bg-bg/95 px-3 pb-2 pt-2 backdrop-blur">
        <PhaseHeader view={view} serverNow={serverNow} onExpire={onExpire} />
        <nav className="mt-2 flex gap-1" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-10 flex-1 rounded-full px-2 text-sm font-medium ${current === t.id ? "bg-text text-bg" : "text-text-2 hover:bg-surface-2"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-3 py-3">
        {error ? <p className="text-sm text-warning">{error.message}</p> : null}
        {result ? (
          <Card className="p-5">
            <p className="text-lg font-semibold">{result.kind === "draw" ? "The game ended in a draw" : `${winnerSeat?.name ?? "A player"} wins`}</p>
            {result.kind === "victory" ? <p className="text-sm text-text-2">{result.powers.map(powerName).join(", ")}</p> : null}
          </Card>
        ) : null}
        {!view.me.participantId && !view.me.creator ? (
          <Card className="p-4 text-sm text-text-2">You&apos;re watching. To play, scan the QR code the game creator shows you.</Card>
        ) : null}
        {view.me.creator ? (
          <Link href={`/g/${view.game.code}/admin`} className="block text-sm text-accent">
            Game setup and QR codes ›
          </Link>
        ) : null}

        {current !== "history" ? <ChecklistBanner view={view} code={code} onChanged={refresh} /> : null}

        {current === "orders" ? <OrdersPanel key={view.phase.id} view={view} code={code} onChanged={refresh} /> : null}
        {current === "board" ? (
          <Card className="overflow-hidden">
            <Board units={view.state.units} owners={view.state.owners} dislodged={view.state.dislodged.map((d) => d.unit)} />
          </Card>
        ) : null}
        {current === "history" ? <HistoryView view={view} code={code} /> : null}
        {current === "gm" ? <GmPanel view={view} code={code} serverNow={serverNow} onChanged={refresh} /> : null}
      </div>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md px-4 py-16 text-text-2">Loading…</main>}>
      <GamePage />
    </Suspense>
  )
}
