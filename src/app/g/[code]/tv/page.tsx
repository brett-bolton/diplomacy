"use client"

import { useParams } from "next/navigation"
import { Suspense, useCallback } from "react"
import { Board } from "@/map/Board"
import { ChecklistBanner } from "@/ui/ChecklistBanner"
import { useGame } from "@/ui/hooks"
import { Card } from "@/ui/kit"
import { CenterCounter, PhaseHeader } from "@/ui/StatusBar"

/** Read-only table / TV view: board, timer, centers, checklist. */
function TvPage() {
  const { code } = useParams<{ code: string }>()
  const { view, error, refresh, serverNow } = useGame(code)
  const onExpire = useCallback(() => setTimeout(refresh, 600), [refresh])
  if (!view) return <main className="p-8 text-text-2">{error ? error.message : "Loading…"}</main>
  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden">
        <Board units={view.state.units} owners={view.state.owners} dislodged={view.state.dislodged.map((d) => d.unit)} />
      </Card>
      <div className="space-y-4">
        <Card className="p-4">
          <PhaseHeader view={view} serverNow={serverNow} onExpire={onExpire} />
        </Card>
        <CenterCounter view={view} />
        <ChecklistBanner view={view} code={code} onChanged={refresh} />
      </div>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md px-4 py-16 text-text-2">Loading…</main>}>
      <TvPage />
    </Suspense>
  )
}
