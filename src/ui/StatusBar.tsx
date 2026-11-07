"use client"

// Season/year header with the turn timer, and the supply-center counter.

import { useEffect, useRef } from "react"
import type { GameView } from "@/server/games"
import { POWER_COLORS } from "@/map/colors"
import { formatClock, useCountdown } from "./hooks"
import { powerName } from "./text"

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

export function CenterCounter({ view, compact = false }: { view: GameView; compact?: boolean }) {
  const goal = view.game.playerCount === 2 ? 24 : 18
  const open = view.game.status === "active"
  const rows = [...view.powers]
  rows.sort((a, b) => b.supplyCenters - a.supplyCenters || a.power.localeCompare(b.power))
  const leader = rows[0]?.supplyCenters ?? 0

  // Multi-power games: group by player.
  const multi = view.participants.some((p) => p.powers.length > 1)
  const groups = multi
    ? view.participants
        .filter((p) => p.seat !== null)
        .map((p) => ({ name: p.name, powers: rows.filter((r) => p.powers.includes(r.power)) }))
        .concat([{ name: "Neutral", powers: rows.filter((r) => r.seat === null) }])
        .filter((g) => g.powers.length)
    : [{ name: "", powers: rows }]

  return (
    <div className="space-y-2" aria-label="Supply centers">
      {groups.map((g) => (
        <div key={g.name || "all"}>
          {g.name ? (
            <p className="mb-1 text-xs text-text-2">
              {g.name} · {g.powers.reduce((s, p) => s + p.supplyCenters, 0)}
              {view.game.playerCount === 2 ? ` / ${goal}` : ""} centers
            </p>
          ) : null}
          <div className={`grid gap-1.5 ${compact ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-2 sm:grid-cols-4"}`}>
            {g.powers.map((p) => {
              const c = POWER_COLORS[p.power]
              const isLeader = p.supplyCenters === leader && leader > 0 && !p.eliminated
              return (
                <div
                  key={p.power}
                  className={`rounded-xl border bg-surface px-2.5 py-1.5 ${isLeader ? "border-line-strong" : "border-line"} ${p.eliminated ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 shrink-0 rounded-full border" style={{ background: c.fill, borderColor: c.stroke }} aria-hidden />
                    <span className="truncate text-xs font-medium">{compact ? p.power[0] + p.power.slice(1).toLowerCase() : powerName(p.power)}</span>
                    {open && p.required ? (
                      <span className={`ml-auto text-xs ${p.submitted ? "text-success" : "text-text-3"}`} title={p.submitted ? "Submitted" : "Not submitted yet"}>
                        {p.submitted ? "✓" : "○"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">
                    {p.supplyCenters}
                    {view.game.playerCount === 2 ? "" : <span className="text-xs font-normal text-text-3"> / {goal}</span>}
                    {p.adjustment ? (
                      <span className={`ml-1.5 text-xs font-medium ${p.adjustment > 0 ? "text-success" : "text-danger"}`}>
                        {p.adjustment > 0 ? `+${p.adjustment} build${p.adjustment > 1 ? "s" : ""}` : `−${-p.adjustment} disband`}
                      </span>
                    ) : null}
                  </p>
                  {!compact ? (
                    <p className="truncate text-xs text-text-3">
                      {p.eliminated ? "Eliminated" : p.unplayed ? "Unplayed" : (p.playerName ?? "")}
                      {!p.eliminated ? ` · ${p.units} unit${p.units === 1 ? "" : "s"}` : ""}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
