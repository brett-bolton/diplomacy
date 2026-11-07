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
  const twoPlayer = view.game.playerCount === 2
  const goal = twoPlayer ? 24 : 18
  const open = view.game.status === "active"
  const rows = [...view.powers]
  rows.sort((a, b) => b.supplyCenters - a.supplyCenters || a.power.localeCompare(b.power))

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
    <section className="rounded-2xl border border-line bg-surface px-3 py-2" aria-label="Supply centers">
      <div className="flex items-baseline justify-between text-xs text-text-3">
        <span>Supply centers</span>
        <span>
          {goal} to win{twoPlayer ? " (per player)" : ""}
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.name || "all"}>
          {g.name ? (
            <p className="mt-1 text-xs font-medium text-text-2">
              {g.name} · {g.powers.reduce((s, p) => s + p.supplyCenters, 0)}
              {twoPlayer ? ` / ${goal}` : ""}
            </p>
          ) : null}
          <ul className={`grid gap-x-4 ${compact ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-2 sm:grid-cols-4"}`}>
            {g.powers.map((p) => {
              const c = POWER_COLORS[p.power]
              const who = p.eliminated ? "out" : p.unplayed ? "unplayed" : (p.playerName ?? "")
              const mark = open && p.required ? (p.submitted ? "✓" : "○") : ""
              const label = `${powerName(p.power)}: ${p.supplyCenters} centers, ${p.units} units${who ? `, ${who}` : ""}${
                p.adjustment ? `, ${p.adjustment > 0 ? `${p.adjustment} to build` : `${-p.adjustment} to disband`}` : ""
              }${mark ? (p.submitted ? ", submitted" : ", not submitted yet") : ""}`
              return (
                <li key={p.power} className={`flex h-7 min-w-0 items-center gap-1.5 text-sm ${p.eliminated ? "opacity-40" : ""}`} title={label} aria-label={label}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ background: c.fill, borderColor: c.stroke }} aria-hidden />
                  <span className={`shrink-0 font-medium ${p.eliminated ? "line-through" : ""}`}>{compact ? p.power[0] + p.power.slice(1).toLowerCase() : powerName(p.power)}</span>
                  {!compact && who ? <span className="min-w-0 truncate text-xs text-text-3">{who}</span> : null}
                  <span className="ml-auto flex shrink-0 items-center gap-1" aria-hidden>
                    {p.adjustment ? (
                      <span className={`text-xs font-medium ${p.adjustment > 0 ? "text-success" : "text-danger"}`}>
                        {p.adjustment > 0 ? `+${p.adjustment}` : `−${-p.adjustment}`}
                      </span>
                    ) : null}
                    <span className="font-semibold tabular-nums">{p.supplyCenters}</span>
                    {mark ? <span className={`w-3 text-center text-xs ${p.submitted ? "text-success" : "text-text-3"}`}>{mark}</span> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
