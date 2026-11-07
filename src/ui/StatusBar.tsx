"use client"

// Season/year header with the turn timer, and the supply-center counter.

import { useEffect, useRef } from "react"
import type { GameView } from "@/server/games"
import { formatClock, useCountdown } from "./hooks"

export function PhaseHeader({
  view,
  serverNow,
  onExpire,
  viewing,
}: {
  view: GameView
  serverNow: () => number
  onExpire?: () => void
  /** History: the label of the phase being viewed. */
  viewing?: string
}) {
  const left = useCountdown(view.phase.deadlineAt, serverNow, onExpire)
  const ref = useRef<HTMLDivElement>(null)
  const label = view.phase.label
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.remove("flash")
    void el.offsetWidth
    el.classList.add("flash")
  }, [label])

  const tone = left === null ? "" : left === 0 ? "bg-danger text-white" : left < 60 ? "bg-danger-soft text-danger" : left < 300 ? "bg-warning-soft text-warning" : "bg-surface-2 text-text"

  return (
    <div ref={ref} className="flex items-center justify-between gap-3 rounded-2xl px-1 py-1">
      <div className="min-w-0">
        {viewing ? (
          <>
            <p className="truncate text-lg font-semibold">Viewing {viewing}</p>
            <p className="text-xs text-text-2">Current: {label}</p>
          </>
        ) : (
          <>
            <p className="truncate text-lg font-semibold">{view.game.status === "finished" ? "Game over" : label}</p>
            <p className="truncate text-xs text-text-2">{view.game.name} · {view.game.code}</p>
          </>
        )}
      </div>
      {left !== null && !viewing ? (
        <div className={`shrink-0 rounded-xl px-3 py-1.5 text-right tabular-nums ${tone}`} aria-live="polite">
          {left === 0 ? (
            <span className="text-sm font-semibold">Time&apos;s up — adjudicating</span>
          ) : (
            <span className="text-xl font-semibold">{formatClock(left)}</span>
          )}
        </div>
      ) : null}
    </div>
  )
}
