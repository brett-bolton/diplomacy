"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { buildSites } from "@/engine/adjudicate/adjust"
import { PROVINCES, isValidUnitLocation } from "@/engine/map/standard"
import type { AdjustmentOrder, MovementOrder, RetreatOrder } from "@/engine/orders"
import { legalOrderOptions, type UnitOrderOptions } from "@/engine/orders/legal"
import { locKey, type Coast, type Location, type Power, type ProvinceId, type Unit } from "@/engine/types"
import type { DrawnOrder } from "@/map/Board"
import { Board } from "@/map/Board"
import type { GameView } from "@/server/games"
import { api } from "./api"
import { Button, Card, Choice, ErrorText, Pill, Sheet } from "./kit"
import { abbr, newRequestId, orderNotation, orderPlain, placeName, powerName, unitLabel, unitName, type AnyOrder } from "./text"

type Drafts = Record<string, AnyOrder[]>

export function OrdersPanel({ view, code, onChanged }: { view: GameView; code: string; onChanged: () => void }) {
  const state = view.state
  const myPowers = view.me.powers
  const required = view.powers.filter((p) => p.required && myPowers.includes(p.power)).map((p) => p.power)
  const allSubmitted = required.length > 0 && required.every((p) => view.powers.find((x) => x.power === p)?.submitted)

  // Drafts start from what the server has, once per phase.
  const [drafts, setDrafts] = useState<Drafts>(() => Object.fromEntries(view.myOrders.map((o) => [o.power, o.orders])))
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [step, setStep] = useState<"edit" | "review" | "confirm">("edit")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [activePower, setActivePower] = useState<Power | undefined>(required[0])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const setPowerOrders = useCallback(
    (power: Power, orders: AnyOrder[]) => {
      setDrafts((d) => ({ ...d, [power]: orders }))
      setSaving("saving")
      clearTimeout(timers.current[power])
      timers.current[power] = setTimeout(async () => {
        try {
          await api.saveDraft(code, power, orders)
          setSaving("saved")
          setSaveError(null)
        } catch (e) {
          setSaving("error")
          setSaveError((e as Error).message)
        }
      }, 400)
    },
    [code],
  )

  if (view.game.status !== "active") return <Card className="p-5 text-text-2">The game is over.</Card>
  if (required.length === 0) {
    return (
      <Card className="p-5">
        <p className="font-medium">No orders needed this phase</p>
        <p className="mt-1 text-sm text-text-2">You have nothing to decide right now. Waiting on the other players.</p>
        <Waiting view={view} />
      </Card>
    )
  }

  if (allSubmitted) {
    return (
      <div className="space-y-3">
        <Card className="p-5">
          <p className="font-semibold">🔒 Orders locked in</p>
          <p className="mt-1 text-sm text-text-2">Nobody sees anyone&apos;s orders until every player has submitted.</p>
          <Waiting view={view} />
        </Card>
        <OrderList view={view} drafts={drafts} powers={required} />
      </div>
    )
  }

  const power = activePower && required.includes(activePower) ? activePower : required[0]

  async function submit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Make sure the latest drafts are saved before locking.
      for (const p of required) {
        clearTimeout(timers.current[p])
        await api.saveDraft(code, p, drafts[p] ?? [])
      }
      await api.submit(code, newRequestId())
      setStep("edit")
      onChanged()
    } catch (e) {
      setSubmitError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (step !== "edit") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Review orders</h2>
          <Button variant="ghost" onClick={() => setStep("edit")}>
            Keep editing
          </Button>
        </div>
        <OrderList view={view} drafts={drafts} powers={required} />
        <Button variant="primary" className="w-full" onClick={() => setStep("confirm")}>
          Submit orders
        </Button>
        <Sheet open={step === "confirm"} onClose={() => setStep("review")} title="Lock in your orders?">
          <p className="text-[15px] text-text-2">
            You can&apos;t change {required.length > 1 ? "any of these orders" : "these orders"} after locking them in.
            {required.length > 1 ? ` This locks in orders for ${required.map(powerName).join(", ")}.` : ""}
          </p>
          <ErrorText>{submitError}</ErrorText>
          <div className="mt-5 grid gap-2">
            <Button variant="danger" disabled={submitting} onClick={submit}>
              {submitting ? "Locking in…" : "Lock in orders"}
            </Button>
            <Button variant="ghost" onClick={() => setStep("review")}>
              Cancel
            </Button>
          </div>
        </Sheet>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {required.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto">
          {required.map((p) => (
            <button
              key={p}
              onClick={() => setActivePower(p)}
              className={`min-h-10 rounded-full border px-3.5 text-sm ${p === power ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}
            >
              {powerName(p)}
            </button>
          ))}
        </div>
      ) : null}

      {state.phase === "movement" ? (
        <MovementEditor key={power} view={view} power={power} orders={(drafts[power] ?? []) as MovementOrder[]} onChange={(o) => setPowerOrders(power, o)} />
      ) : state.phase === "retreat" ? (
        <RetreatEditor key={power} view={view} power={power} orders={(drafts[power] ?? []) as RetreatOrder[]} onChange={(o) => setPowerOrders(power, o)} />
      ) : (
        <AdjustmentEditor key={power} view={view} power={power} orders={(drafts[power] ?? []) as AdjustmentOrder[]} onChange={(o) => setPowerOrders(power, o)} />
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-text-3" aria-live="polite">
          {saving === "saving" ? "Saving draft…" : saving === "saved" ? "Draft saved" : saving === "error" ? "" : "Drafts save as you go"}
        </p>
        <Button variant="primary" onClick={() => setStep("review")}>
          Review orders
        </Button>
      </div>
      <ErrorText>{saveError}</ErrorText>
    </div>
  )
}

function Waiting({ view }: { view: GameView }) {
  const pending = view.powers.filter((p) => p.required && !p.submitted)
  if (!pending.length) return <p className="mt-3 text-sm text-text-2">Everyone is in. Adjudicating…</p>
  return (
    <p className="mt-3 text-sm text-text-2">
      Waiting on {pending.length}: {pending.map((p) => powerName(p.power)).join(", ")}
    </p>
  )
}

/** Review list: every unit and what it will do, with defaults flagged. */
function OrderList({ view, drafts, powers }: { view: GameView; drafts: Drafts; powers: Power[] }) {
  const state = view.state
  return (
    <div className="space-y-3">
      {powers.map((power) => {
        const orders = drafts[power] ?? []
        let rows: { key: string; notation: string; plain: string; flag?: string }[] = []
        if (state.phase === "movement") {
          rows = state.units
            .filter((u) => u.power === power)
            .map((u) => {
              const o = orders.find((x) => "unit" in x && x.unit === u.location.province)
              return o
                ? { key: u.location.province, notation: orderNotation(o, state.units), plain: orderPlain(o, state.units) }
                : { key: u.location.province, notation: `${unitLabel(u)} H`, plain: "Hold", flag: "will hold by default" }
            })
        } else if (state.phase === "retreat") {
          rows = state.dislodged
            .filter((d) => d.unit.power === power)
            .map((d) => {
              const o = orders.find((x) => "unit" in x && x.unit === d.unit.location.province)
              const units = [d.unit]
              return o
                ? { key: d.unit.location.province, notation: orderNotation(o, units), plain: orderPlain(o, units) }
                : { key: d.unit.location.province, notation: `Disband ${unitLabel(d.unit)}`, plain: "Disband", flag: "no retreat chosen — will disband" }
            })
        } else {
          const delta = view.powers.find((p) => p.power === power)?.adjustment ?? 0
          rows = orders.map((o, i) => ({ key: String(i), notation: orderNotation(o, state.units), plain: orderPlain(o, state.units) }))
          const chosen = orders.filter((o) => o.kind !== "waive").length
          if (delta > 0 && chosen < delta) rows.push({ key: "w", notation: `${delta - chosen} build${delta - chosen > 1 ? "s" : ""} waived`, plain: "Unused builds are waived", flag: "waived" })
          if (delta < 0 && chosen < -delta)
            rows.push({ key: "cd", notation: `${-delta - chosen} more disband${-delta - chosen > 1 ? "s" : ""} needed`, plain: "Chosen by the civil-disorder rule (farthest from home first)", flag: "automatic" })
        }
        return (
          <Card key={power} className="divide-y divide-line">
            <p className="px-4 py-2.5 text-sm font-medium text-text-2">
              {powerName(power)} · {view.phase.label}
            </p>
            {rows.map((r) => (
              <div key={r.key} className="px-4 py-2.5">
                <p className="font-mono text-sm">{r.notation}</p>
                <p className="text-sm text-text-2">{r.plain}</p>
                {r.flag ? (
                  <div className="mt-1">
                    <Pill tone="warning">{r.flag}</Pill>
                  </div>
                ) : null}
              </div>
            ))}
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Movement

type SheetStep =
  | { kind: "action" }
  | { kind: "move" }
  | { kind: "via"; to: Location }
  | { kind: "support-unit" }
  | { kind: "support-target"; from: ProvinceId }
  | { kind: "convoy-army" }
  | { kind: "convoy-dest"; from: ProvinceId }

function MovementEditor({ view, power, orders, onChange }: { view: GameView; power: Power; orders: MovementOrder[]; onChange: (o: MovementOrder[]) => void }) {
  const state = view.state
  const units = state.units
  const closed = useMemo(() => new Set(view.closed), [view.closed])
  const mine = units.filter((u) => u.power === power)
  const [selected, setSelected] = useState<ProvinceId | null>(null)
  const [step, setStep] = useState<SheetStep>({ kind: "action" })
  const options = useMemo(() => new Map(mine.map((u) => [u.location.province, legalOrderOptions(units, u.location.province, { closed })])), [mine, units, closed])
  const orderFor = (p: ProvinceId) => orders.find((o) => o.unit === p)

  function setOrder(o: MovementOrder) {
    onChange([...orders.filter((x) => x.unit !== o.unit), o])
    setSelected(null)
  }

  const sel = selected ? mine.find((u) => u.location.province === selected) : undefined
  const opt = selected ? options.get(selected) : undefined

  const targets: string[] =
    sel && opt
      ? step.kind === "move"
        ? opt.moves.map((m) => locKey(m.to))
        : step.kind === "support-target"
          ? [...opt.supportMoves.filter((s) => s.from === step.from).map((s) => s.to), ...(opt.supportHolds.includes(step.from) ? [step.from] : [])]
          : step.kind === "support-unit"
            ? [...new Set([...opt.supportHolds, ...opt.supportMoves.map((s) => s.from)])]
            : step.kind === "convoy-army"
              ? [...new Set(opt.convoys.map((c) => c.from))]
              : step.kind === "convoy-dest"
                ? opt.convoys.filter((c) => c.from === step.from).map((c) => c.to)
                : []
      : []

  function onMapClick(p: ProvinceId) {
    if (!sel || !opt) {
      if (mine.some((u) => u.location.province === p)) {
        setSelected(p)
        setStep({ kind: "action" })
      }
      return
    }
    if (step.kind === "move") {
      const m = opt.moves.filter((x) => x.to.province === p)
      if (m.length === 1) chooseMove(m[0].to, !!m[0].convoyPossible)
    } else if (step.kind === "support-unit" && targets.includes(p)) setStep({ kind: "support-target", from: p })
    else if (step.kind === "support-target" && targets.includes(p)) {
      if (p === step.from) setOrder({ kind: "support-hold", unit: sel.location.province, target: p })
      else setOrder({ kind: "support-move", unit: sel.location.province, from: step.from, to: p })
    } else if (step.kind === "convoy-army" && targets.includes(p)) setStep({ kind: "convoy-dest", from: p })
    else if (step.kind === "convoy-dest" && targets.includes(p)) setOrder({ kind: "convoy", unit: sel.location.province, from: step.from, to: p })
  }

  function chooseMove(to: Location, convoyPossible: boolean) {
    if (!sel) return
    if (convoyPossible) setStep({ kind: "via", to })
    else setOrder({ kind: "move", unit: sel.location.province, to })
  }

  const ordered = mine.filter((u) => orderFor(u.location.province)).length
  const drawn: DrawnOrder[] = orders.map((o) => toDrawn(o, power, units))

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <Board
          units={units}
          owners={state.owners}
          orders={drawn}
          highlight={{
            selectable: sel ? undefined : mine.map((u) => u.location.province),
            selected: selected ?? undefined,
            targets,
          }}
          onProvinceClick={onMapClick}
          focus={mine.map((u) => u.location.province)}
        />
      </Card>

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Your units</h2>
        <span className="text-sm text-text-2">
          {ordered} of {mine.length} ordered
        </span>
      </div>
      <div className="space-y-2">
        {mine.map((u) => {
          const o = orderFor(u.location.province)
          const opt = options.get(u.location.province)!
          return (
            <button
              key={u.location.province}
              onClick={() => {
                setSelected(u.location.province)
                setStep({ kind: "action" })
              }}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block font-medium">{unitLabel(u)}</span>
                <span className="block truncate text-sm text-text-2">
                  {o ? orderPlain(o, units) : "Not set — will hold"}
                </span>
                {!o ? <span className="block truncate text-xs text-text-3">Can reach: {reachText(opt)}</span> : null}
              </span>
              <span className="text-text-3" aria-hidden>
                ›
              </span>
            </button>
          )
        })}
      </div>

      <Sheet open={!!sel} onClose={() => setSelected(null)} title={sel ? unitName(sel) : ""}>
        {sel && opt ? (
          <UnitSheet
            unit={sel}
            opt={opt}
            units={units}
            step={step}
            setStep={setStep}
            setOrder={setOrder}
            chooseMove={chooseMove}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

function reachText(opt: UnitOrderOptions): string {
  const names = [...new Set(opt.moves.map((m) => abbr(m.to.province)))]
  return names.length ? names.join(", ") : "nowhere"
}

function UnitSheet({
  unit,
  opt,
  units,
  step,
  setStep,
  setOrder,
  chooseMove,
}: {
  unit: Unit
  opt: UnitOrderOptions
  units: Unit[]
  step: SheetStep
  setStep: (s: SheetStep) => void
  setOrder: (o: MovementOrder) => void
  chooseMove: (to: Location, convoyPossible: boolean) => void
}) {
  const here = unit.location.province
  const unitAtP = (p: ProvinceId) => units.find((u) => u.location.province === p)
  const label = (p: ProvinceId) => {
    const u = unitAtP(p)
    return u ? `${u.type === "A" ? "Army" : "Fleet"} in ${placeName(u.location)} (${powerName(u.power)})` : placeName(p)
  }
  const back = (
    <button className="mb-3 text-sm text-accent" onClick={() => setStep({ kind: "action" })}>
      ‹ Back
    </button>
  )

  if (step.kind === "action") {
    const supportable = new Set([...opt.supportHolds, ...opt.supportMoves.map((s) => s.from)])
    return (
      <div className="grid gap-2">
        <Choice onClick={() => setOrder({ kind: "hold", unit: here })}>Hold</Choice>
        <Choice onClick={() => setStep({ kind: "move" })} hint={`${opt.moves.length} places`}>
          Move
        </Choice>
        <Choice onClick={() => setStep({ kind: "support-unit" })} hint={supportable.size ? `${supportable.size} units` : "none possible"}>
          Support
        </Choice>
        {opt.convoys.length ? (
          <Choice onClick={() => setStep({ kind: "convoy-army" })} hint={`${new Set(opt.convoys.map((c) => c.from)).size} armies`}>
            Convoy
          </Choice>
        ) : unit.type === "F" ? (
          <p className="px-1 text-xs text-text-3">Convoy isn&apos;t available: only a fleet in a sea space on a possible route can convoy.</p>
        ) : null}
      </div>
    )
  }

  if (step.kind === "move") {
    return (
      <div>
        {back}
        <p className="mb-2 text-sm text-text-2">Only places this unit can legally reach are listed. You can also tap them on the map.</p>
        <div className="grid gap-2">
          {opt.moves.map((m) => (
            <Choice key={locKey(m.to)} onClick={() => chooseMove(m.to, !!m.convoyPossible)} hint={m.convoyOnly ? "by convoy" : abbr(m.to.province)}>
              {placeName(m.to)}
            </Choice>
          ))}
        </div>
      </div>
    )
  }

  if (step.kind === "via") {
    return (
      <div>
        {back}
        <p className="mb-3 text-[15px]">How should the army get to {placeName(step.to)}?</p>
        <div className="grid gap-2">
          <Choice onClick={() => setOrder({ kind: "move", unit: here, to: step.to })}>Over land</Choice>
          <Choice onClick={() => setOrder({ kind: "move", unit: here, to: step.to, viaConvoy: true })} hint="needs a fleet to convoy it">
            By convoy
          </Choice>
        </div>
      </div>
    )
  }

  if (step.kind === "support-unit") {
    const froms = [...new Set([...opt.supportHolds, ...opt.supportMoves.map((s) => s.from)])]
    return (
      <div>
        {back}
        <p className="mb-2 text-sm text-text-2">Which unit are you supporting? Only units this unit can help are listed, including other powers&apos;.</p>
        <div className="grid gap-2">
          {froms.length === 0 ? <p className="text-sm text-text-3">No support is possible from here.</p> : null}
          {froms.map((p) => (
            <Choice key={p} onClick={() => setStep({ kind: "support-target", from: p })}>
              {label(p)}
            </Choice>
          ))}
        </div>
      </div>
    )
  }

  if (step.kind === "support-target") {
    const from = step.from
    const tos = opt.supportMoves.filter((s) => s.from === from).map((s) => s.to)
    return (
      <div>
        <button className="mb-3 text-sm text-accent" onClick={() => setStep({ kind: "support-unit" })}>
          ‹ Back
        </button>
        <p className="mb-2 text-sm text-text-2">Support the {label(from)} to do what?</p>
        <div className="grid gap-2">
          {opt.supportHolds.includes(from) ? (
            <Choice onClick={() => setOrder({ kind: "support-hold", unit: here, target: from })}>Hold in {placeName(from)}</Choice>
          ) : null}
          {tos.map((to) => (
            <Choice key={to} onClick={() => setOrder({ kind: "support-move", unit: here, from, to })} hint={abbr(to)}>
              Move to {placeName(to)}
            </Choice>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-3">The support only counts if that unit is actually ordered to do this.</p>
      </div>
    )
  }

  if (step.kind === "convoy-army") {
    const armies = [...new Set(opt.convoys.map((c) => c.from))]
    return (
      <div>
        {back}
        <p className="mb-2 text-sm text-text-2">Which army are you convoying?</p>
        <div className="grid gap-2">
          {armies.map((p) => (
            <Choice key={p} onClick={() => setStep({ kind: "convoy-dest", from: p })}>
              {label(p)}
            </Choice>
          ))}
        </div>
      </div>
    )
  }

  // convoy-dest
  const from = step.from
  return (
    <div>
      <button className="mb-3 text-sm text-accent" onClick={() => setStep({ kind: "convoy-army" })}>
        ‹ Back
      </button>
      <p className="mb-2 text-sm text-text-2">Convoy the {label(from)} to where?</p>
      <div className="grid gap-2">
        {opt.convoys
          .filter((c) => c.from === from)
          .map((c) => (
            <Choice key={c.to} onClick={() => setOrder({ kind: "convoy", unit: here, from, to: c.to })} hint={abbr(c.to)}>
              {placeName(c.to)}
            </Choice>
          ))}
      </div>
    </div>
  )
}

export function toDrawn(o: AnyOrder, power: Power, units: Unit[], success = true): DrawnOrder {
  const keyOf = (p: ProvinceId) => {
    const u = units.find((x) => x.location.province === p)
    return u ? locKey(u.location) : p
  }
  switch (o.kind) {
    case "move":
      return { power, kind: "move", from: keyOf(o.unit), to: locKey(o.to), success }
    case "support-hold":
      return { power, kind: "support-hold", from: keyOf(o.unit), to: keyOf(o.target), success }
    case "support-move":
      return { power, kind: "support-move", from: keyOf(o.unit), via: keyOf(o.from), to: o.to, success }
    case "convoy":
      return { power, kind: "convoy", from: keyOf(o.unit), via: keyOf(o.from), to: o.to, success }
    case "retreat":
      return { power, kind: "retreat", from: keyOf(o.unit), to: locKey(o.to), success }
    default:
      return { power, kind: "hold", from: "unit" in o ? keyOf(o.unit) : "", success }
  }
}

// ---------------------------------------------------------------------------
// Retreats

function RetreatEditor({ view, power, orders, onChange }: { view: GameView; power: Power; orders: RetreatOrder[]; onChange: (o: RetreatOrder[]) => void }) {
  const state = view.state
  const mine = state.dislodged.filter((d) => d.unit.power === power)
  const set = (o: RetreatOrder) => onChange([...orders.filter((x) => x.unit !== o.unit), o])
  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <Board
          units={state.units}
          owners={state.owners}
          dislodged={state.dislodged.map((d) => d.unit)}
          orders={orders.filter((o) => o.kind === "retreat").map((o) => toDrawn(o, power, mine.map((d) => d.unit)))}
          highlight={{ targets: mine.flatMap((d) => d.retreatOptions.map(locKey)) }}
        />
      </Card>
      <h2 className="text-base font-semibold">Units that must retreat</h2>
      {mine.map((d) => {
        const here = d.unit.location.province
        const o = orders.find((x) => x.unit === here)
        return (
          <Card key={here} className="p-4">
            <p className="font-medium">{unitName(d.unit)}</p>
            <p className="mb-3 text-sm text-text-2">
              {d.retreatOptions.length ? "Choose where it retreats, or disband it." : "No retreat possible — it will be disbanded."}
            </p>
            <div className="grid gap-2">
              {d.retreatOptions.map((loc) => (
                <Choice
                  key={locKey(loc)}
                  selected={o?.kind === "retreat" && locKey(o.to) === locKey(loc)}
                  onClick={() => set({ kind: "retreat", unit: here, to: loc })}
                  hint={abbr(loc.province)}
                >
                  Retreat to {placeName(loc)}
                </Choice>
              ))}
              {d.retreatOptions.length ? (
                <Choice selected={o?.kind === "disband"} onClick={() => set({ kind: "disband", unit: here })}>
                  Disband
                </Choice>
              ) : null}
            </div>
          </Card>
        )
      })}
      <p className="text-xs text-text-3">If two units retreat to the same place, both are disbanded.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Winter builds and disbands

function AdjustmentEditor({ view, power, orders, onChange }: { view: GameView; power: Power; orders: AdjustmentOrder[]; onChange: (o: AdjustmentOrder[]) => void }) {
  const state = view.state
  const owners = useMemo(() => new Map(Object.entries(state.owners)) as Map<ProvinceId, Power>, [state.owners])
  const delta = view.powers.find((p) => p.power === power)?.adjustment ?? 0

  if (delta > 0) {
    const sites = buildSites(power, owners, state.units)
    const builds = orders.filter((o): o is Extract<AdjustmentOrder, { kind: "build" }> => o.kind === "build")
    const atSite = (p: ProvinceId) => builds.find((b) => b.at.province === p)
    const choose = (p: ProvinceId, choice: { unitType: "A" | "F"; coast?: Coast } | null) => {
      const rest = builds.filter((b) => b.at.province !== p)
      if (!choice) return onChange(rest)
      if (rest.length >= delta) return
      onChange([...rest, { kind: "build", unitType: choice.unitType, at: choice.coast ? { province: p, coast: choice.coast } : { province: p } }])
    }
    return (
      <div className="space-y-3">
        <Card className="p-4">
          <p className="font-medium">
            You may build {delta} unit{delta > 1 ? "s" : ""}
          </p>
          <p className="text-sm text-text-2">
            {builds.length} of {Math.min(delta, sites.length)} chosen. Builds you don&apos;t use are waived.
          </p>
        </Card>
        {sites.length === 0 ? <p className="text-sm text-text-2">All your home centers are occupied or lost, so you can&apos;t build this year.</p> : null}
        {sites.map((p) => {
          const b = atSite(p)
          const pr = PROVINCES[p]
          const fleetOptions: { label: string; coast?: Coast }[] = pr.kind === "coastal" ? (pr.coasts ? pr.coasts.map((c) => ({ label: `Fleet (${c === "nc" ? "north" : c === "sc" ? "south" : "east"} coast)`, coast: c })) : [{ label: "Fleet" }]) : []
          const full = builds.length >= delta && !b
          return (
            <Card key={p} className="p-4">
              <p className="mb-2 font-medium">{pr.name}</p>
              <div className="grid grid-cols-2 gap-2">
                <Choice selected={!b} onClick={() => choose(p, null)}>
                  Nothing
                </Choice>
                <Choice selected={b?.unitType === "A"} onClick={() => !full && choose(p, { unitType: "A" })}>
                  Army
                </Choice>
                {fleetOptions.map((f) => (
                  <Choice
                    key={f.label}
                    selected={b?.unitType === "F" && (b.at.coast ?? undefined) === f.coast}
                    onClick={() => !full && isValidUnitLocation("F", f.coast ? { province: p, coast: f.coast } : { province: p }) && choose(p, { unitType: "F", coast: f.coast })}
                  >
                    {f.label}
                  </Choice>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    )
  }

  const need = -delta
  const removing = new Set(orders.filter((o) => o.kind === "remove").map((o) => (o as { unit: ProvinceId }).unit))
  const toggle = (p: ProvinceId) => {
    if (removing.has(p)) onChange(orders.filter((o) => !(o.kind === "remove" && o.unit === p)))
    else if (removing.size < need) onChange([...orders, { kind: "remove", unit: p }])
  }
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <p className="font-medium">
          You must disband {need} unit{need > 1 ? "s" : ""}
        </p>
        <p className="text-sm text-text-2">
          {removing.size} of {need} chosen. Any you don&apos;t choose are picked by the civil-disorder rule (farthest from home first).
        </p>
      </Card>
      <div className="grid gap-2">
        {state.units
          .filter((u) => u.power === power)
          .map((u) => (
            <Choice key={u.location.province} selected={removing.has(u.location.province)} onClick={() => toggle(u.location.province)}>
              {unitName(u)}
            </Choice>
          ))}
      </div>
    </div>
  )
}
