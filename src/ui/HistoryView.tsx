"use client"

import { useEffect, useMemo, useState } from "react"
import type { Explanation } from "@/engine/adjudicate/explain"
import { locKey, type Power, type Unit } from "@/engine/types"
import type { DrawnOrder } from "@/map/Board"
import { Board } from "@/map/Board"
import type { GameView, HistoryEntry } from "@/server/games"
import { api } from "./api"
import { Button, Card, Pill } from "./kit"
import { CenterCounter } from "./StatusBar"
import { orderNotation, orderPlain, placeName, powerName, unitLabel } from "./text"

export function HistoryView({ view, code }: { view: GameView; code: string }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [index, setIndex] = useState<number | null>(null)
  const [show, setShow] = useState<"before" | "after">("before")
  const [error, setError] = useState<string | null>(null)

  const latestSeq = view.phase.seq
  useEffect(() => {
    let cancelled = false
    api
      .history(code)
      .then((h) => {
        if (cancelled) return
        setHistory(h)
        setIndex((i) => (i === null ? Math.max(0, h.findLastIndex((x) => x.record) ) : i))
      })
      .catch((e) => setError((e as Error).message))
    return () => {
      cancelled = true
    }
  }, [code, latestSeq, view.game.status])

  const entries = history ?? []
  const entry = index !== null ? entries[index] : undefined
  const after = index !== null ? entries[index + 1]?.state : undefined

  if (error) return <Card className="p-4 text-danger">{error}</Card>
  if (!history) return <Card className="p-4 text-text-2">Loading history…</Card>
  if (!entries.some((e) => e.record)) return <Card className="p-5 text-text-2">Nothing has been adjudicated yet. Past turns will show up here.</Card>
  if (!entry) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, (i ?? 0) - 1))} aria-label="Previous phase">
          ‹ Prev
        </Button>
        <div className="min-w-0 text-center">
          <p className="truncate font-semibold">{entry.imported && entry.seq === 0 ? `Imported position · ${entry.label}` : entry.label}</p>
          <p className="text-xs text-text-2">
            {entry.record ? (entry.trigger === "timer_expired" ? "Timer ran out" : entry.trigger === "auto" ? "Resolved automatically" : "All orders in") : "Current phase"}
          </p>
        </div>
        <Button variant="secondary" disabled={index === entries.length - 1} onClick={() => setIndex((i) => Math.min(entries.length - 1, (i ?? 0) + 1))} aria-label="Next phase">
          Next ›
        </Button>
      </div>
      <input
        type="range"
        min={0}
        max={entries.length - 1}
        value={index ?? 0}
        onChange={(e) => setIndex(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
        aria-label="Timeline"
      />

      {entry.record ? (
        <div className="flex gap-1.5">
          {(["before", "after"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setShow(k)}
              className={`min-h-10 flex-1 rounded-full border text-sm ${show === k ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}
            >
              {k === "before" ? "Orders" : "Result"}
            </button>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {show === "before" || !after ? (
          <Board units={entry.state.units} owners={entry.state.owners} dislodged={entry.state.dislodged.map((d) => d.unit)} orders={drawnFor(entry)} />
        ) : (
          <Board units={after.units} owners={after.owners} dislodged={after.dislodged.map((d) => d.unit)} />
        )}
      </Card>

      <CenterCounter view={{ ...view, powers: countsFor(view, show === "after" && after ? after : entry.state) }} compact />

      {entry.record ? <Results entry={entry} /> : <Card className="p-4 text-sm text-text-2">Orders for this phase are hidden until everyone has submitted.</Card>}
    </div>
  )
}

function countsFor(view: GameView, state: HistoryEntry["state"]): GameView["powers"] {
  return view.powers.map((p) => ({
    ...p,
    supplyCenters: Object.values(state.owners).filter((o) => o === p.power).length,
    units: state.units.filter((u) => u.power === p.power).length,
    adjustment: null,
    required: false,
    submitted: false,
  }))
}

function drawnFor(entry: HistoryEntry): DrawnOrder[] {
  const r = entry.record
  if (!r) return []
  const out: DrawnOrder[] = []
  for (const o of r.movement?.outcomes ?? []) {
    const from = locKey(o.unit.location)
    const keyOf = (p: string) => {
      const u = r.movement!.outcomes.find((x) => x.unit.location.province === p)?.unit
      return u ? locKey(u.location) : p
    }
    const base = { power: o.unit.power as Power, from, success: o.success }
    switch (o.order.kind) {
      case "move":
        if (!o.illegal) out.push({ ...base, kind: "move", to: locKey(o.order.to) })
        break
      case "support-hold":
        if (!o.illegal) out.push({ ...base, kind: "support-hold", to: keyOf(o.order.target) })
        break
      case "support-move":
        if (!o.illegal) out.push({ ...base, kind: "support-move", via: keyOf(o.order.from), to: o.order.to })
        break
      case "convoy":
        if (!o.illegal) out.push({ ...base, kind: "convoy", via: keyOf(o.order.from), to: o.order.to })
        break
    }
  }
  for (const rr of r.retreats ?? []) {
    if (rr.result.kind === "retreated") out.push({ power: rr.unit.power, kind: "retreat", from: locKey(rr.unit.location), to: locKey(rr.result.to), success: true })
  }
  return out
}

function Results({ entry }: { entry: HistoryEntry }) {
  const r = entry.record!
  const [openKey, setOpenKey] = useState<string | null>(null)
  const units: Unit[] = entry.state.units
  const byPower = useMemo(() => {
    const m = new Map<Power, { key: string; title: string; verdict: string; success: boolean; reasons: string[] }[]>()
    const add = (power: Power, row: { key: string; title: string; verdict: string; success: boolean; reasons: string[] }) => {
      m.set(power, [...(m.get(power) ?? []), row])
    }
    if (r.movement && r.explanations) {
      for (const o of r.movement.outcomes) {
        const ex: Explanation | undefined = r.explanations[o.unit.location.province]
        if (!ex) continue
        add(o.unit.power, { key: o.unit.location.province, title: ex.notation, verdict: ex.verdict, success: ex.success, reasons: ex.reasons })
      }
    }
    for (const rr of r.retreats ?? []) {
      const title = rr.result.kind === "retreated" ? `${unitLabel(rr.unit)} R ${placeName(rr.result.to)}` : `${unitLabel(rr.unit)} disbanded`
      const why =
        rr.result.kind === "retreated"
          ? "Retreated."
          : {
              ordered: "Disbanded as ordered.",
              "no-order": "No retreat was ordered, so the unit was disbanded.",
              illegal: "The retreat wasn't allowed, so the unit was disbanded.",
              "no-options": "It had nowhere to retreat, so it was disbanded.",
              bounced: "Another unit retreated to the same place, so both were disbanded.",
            }[rr.result.reason]
      add(rr.unit.power, { key: `r-${rr.unit.location.province}`, title, verdict: rr.result.kind === "retreated" ? "Retreated" : "Disbanded", success: rr.result.kind === "retreated", reasons: [why] })
    }
    if (r.adjustments) {
      for (const o of r.adjustments.outcomes) {
        const reason = {
          ok: "Done.",
          "not-home-center": "Builds are only allowed in home centers.",
          "not-owned": "That home center isn't owned right now.",
          occupied: "That center is occupied.",
          "invalid-unit-location": "That unit can't be built there.",
          "too-many": "More orders than allowed; extras are ignored.",
          "no-such-unit": "There's no such unit.",
          "not-allowed": "Not allowed this Winter.",
        }[o.reason]
        add(o.power, { key: `a-${JSON.stringify(o.order)}`, title: orderNotation(o.order, units), verdict: o.success ? orderPlain(o.order, units) : "Failed", success: o.success, reasons: [reason] })
      }
      for (const u of r.adjustments.civilDisorder) {
        add(u.power, { key: `cd-${u.location.province}`, title: `Disband ${unitLabel(u)}`, verdict: "Removed automatically", success: true, reasons: ["Not enough disbands were ordered, so the civil-disorder rule removed the unit farthest from home."] })
      }
    }
    return m
  }, [r, units])

  return (
    <div className="space-y-3">
      {r.coinFlip ? <Card className="p-4 text-[15px]">Coin flip: seat {r.coinFlip.italyToSeat + 1} controls Italy from Spring {entry.state.year + 1}.</Card> : null}
      {r.captured?.length ? (
        <Card className="p-4">
          <p className="mb-1 text-sm font-medium">Supply centers changed hands</p>
          <ul className="text-sm text-text-2">
            {r.captured.map((c) => (
              <li key={c.province}>
                {placeName(c.province)}: {c.from ? powerName(c.from) : "neutral"} → {powerName(c.to)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {[...byPower.entries()].map(([power, rows]) => (
        <Card key={power} className="divide-y divide-line">
          <p className="px-4 py-2.5 text-sm font-medium text-text-2">{powerName(power)}</p>
          {rows.map((row) =>
            row.reasons.length === 0 ? (
              <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-mono text-sm">{row.title}</span>
                <Pill tone="neutral">{row.verdict}</Pill>
              </div>
            ) : (
            <button key={row.key} className="block w-full px-4 py-2.5 text-left" onClick={() => setOpenKey((k) => (k === row.key ? null : row.key))}>
              <span className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm">{row.title}</span>
                <Pill tone={row.success ? "success" : "danger"}>{row.verdict}</Pill>
              </span>
              {openKey === row.key ? (
                <span className="mt-2 block space-y-1 text-sm text-text-2">
                  {row.reasons.map((t, i) => (
                    <span key={i} className="block">
                      {t}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-text-3">Tap to see why</span>
              )}
            </button>
            ),
          )}
        </Card>
      ))}
    </div>
  )
}
