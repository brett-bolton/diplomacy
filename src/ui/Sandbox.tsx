"use client"

// Standalone adjudicator: set up any position, give orders for every power,
// and adjudicate — no game needed. The scenario lives in the URL hash so a
// link reproduces it exactly. Nothing is stored on the server.

import { useEffect, useMemo, useState } from "react"
import { explainMovement } from "@/engine/adjudicate/explain"
import { adjudicateMovement, type MovementResult } from "@/engine/adjudicate/movement"
import { PROVINCES, STANDARD_START, isValidUnitLocation } from "@/engine/map/standard"
import type { MovementOrder } from "@/engine/orders"
import { legalOrderOptions, validateMovementOrder } from "@/engine/orders/legal"
import { POWERS, locKey, type Coast, type Location, type Power, type ProvinceId, type UnitType } from "@/engine/types"
import { POWER_COLORS } from "@/map/colors"
import { Board } from "@/map/Board"
import type { HistoryEntry } from "@/server/games"
import { drawnForRecord, Results } from "./HistoryView"
import { Button, Card, Choice, ErrorText, Sheet } from "./kit"
import { toDrawn, UnitSheet, reachText, type SheetStep } from "./OrdersPanel"
import { decodeScenario, EMPTY_SCENARIO, encodeScenario, type Scenario } from "./scenario"
import { abbr, orderPlain, placeName, powerName, unitLabel, unitName } from "./text"

type Outcome = { result: MovementResult; record: NonNullable<HistoryEntry["record"]>; dropped: string[] }

const NO_CLOSED = new Set<ProvinceId>()

function unitChoices(province: ProvinceId): { label: string; type: UnitType; coast?: Coast }[] {
  const p = PROVINCES[province]
  const out: { label: string; type: UnitType; coast?: Coast }[] = []
  if (p.kind !== "sea") out.push({ label: "Army", type: "A" })
  if (p.kind !== "inland") {
    if (p.coasts) for (const c of p.coasts) out.push({ label: `Fleet (${c === "nc" ? "north" : c === "sc" ? "south" : "east"} coast)`, type: "F", coast: c })
    else out.push({ label: "Fleet", type: "F" })
  }
  return out
}

export function Sandbox() {
  const [scenario, setScenario] = useState<Scenario>(() => (typeof window !== "undefined" && decodeScenario(window.location.hash)) || EMPTY_SCENARIO)
  const [active, setActive] = useState<Power | null>(() => scenario.powers[0] ?? null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [show, setShow] = useState<"orders" | "result">("orders")
  const [selected, setSelected] = useState<ProvinceId | null>(null)
  const [step, setStep] = useState<SheetStep>({ kind: "action" })
  const [adding, setAdding] = useState<{ province?: ProvinceId } | null>(null)
  const [addingPower, setAddingPower] = useState(false)
  const [copied, setCopied] = useState(false)

  const { year, season, powers, units, orders } = scenario

  // Keep the URL in step with the scenario so it can be shared or reloaded.
  useEffect(() => {
    const hash = units.length || powers.length ? "#" + encodeScenario(scenario) : ""
    window.history.replaceState(null, "", window.location.pathname + hash)
  }, [scenario, units.length, powers.length])

  const update = (patch: Partial<Scenario>) => {
    setScenario((s) => ({ ...s, ...patch }))
    setOutcome(null)
  }

  const unitAt = (p: ProvinceId) => units.find((u) => u.location.province === p)
  const orderFor = (p: ProvinceId) => orders.find((o) => o.unit === p)
  const setOrder = (o: MovementOrder) => {
    update({ orders: [...orders.filter((x) => x.unit !== o.unit), o] })
    setSelected(null)
  }

  const sel = selected ? unitAt(selected) : undefined
  const opt = useMemo(() => (sel ? legalOrderOptions(units, sel.location.province, { closed: NO_CLOSED }) : null), [sel, units])

  function chooseMove(to: Location, convoyPossible: boolean) {
    if (!sel) return
    if (convoyPossible) setStep({ kind: "via", to })
    else setOrder({ kind: "move", unit: sel.location.province, to })
  }

  const targets: string[] =
    sel && opt
      ? step.kind === "move"
        ? opt.moves.map((m) => locKey(m.to))
        : step.kind === "support-unit"
          ? [...new Set([...opt.supportHolds, ...opt.supportMoves.map((s) => s.from)])]
          : step.kind === "support-target"
            ? [...opt.supportMoves.filter((s) => s.from === step.from).map((s) => s.to), ...(opt.supportHolds.includes(step.from) ? [step.from] : [])]
            : step.kind === "convoy-army"
              ? [...new Set(opt.convoys.map((c) => c.from))]
              : step.kind === "convoy-dest"
                ? opt.convoys.filter((c) => c.from === step.from).map((c) => c.to)
                : []
      : []

  function onMapClick(p: ProvinceId) {
    if (sel && opt) {
      if (step.kind === "move") {
        const m = opt.moves.filter((x) => x.to.province === p)
        if (m.length === 1) chooseMove(m[0].to, !!m[0].convoyPossible)
      } else if (step.kind === "support-unit" && targets.includes(p)) setStep({ kind: "support-target", from: p })
      else if (step.kind === "support-target" && targets.includes(p)) {
        if (p === step.from) setOrder({ kind: "support-hold", unit: sel.location.province, target: p })
        else setOrder({ kind: "support-move", unit: sel.location.province, from: step.from, to: p })
      } else if (step.kind === "convoy-army" && targets.includes(p)) setStep({ kind: "convoy-dest", from: p })
      else if (step.kind === "convoy-dest" && targets.includes(p)) setOrder({ kind: "convoy", unit: sel.location.province, from: step.from, to: p })
      return
    }
    if (unitAt(p)) {
      setSelected(p)
      setStep({ kind: "action" })
    } else if (active) {
      setAdding({ province: p })
    }
  }

  function addPower(p: Power) {
    update({ powers: [...powers, p] })
    setActive(p)
    setAddingPower(false)
  }

  function removePower(p: Power) {
    const gone = new Set(units.filter((u) => u.power === p).map((u) => u.location.province))
    update({ powers: powers.filter((x) => x !== p), units: units.filter((u) => u.power !== p), orders: orders.filter((o) => !gone.has(o.unit)) })
    if (active === p) setActive(powers.find((x) => x !== p) ?? null)
  }

  function addUnit(power: Power, type: UnitType, province: ProvinceId, coast?: Coast) {
    const loc = coast ? { province, coast } : { province }
    if (!isValidUnitLocation(type, loc) || unitAt(province)) return
    update({ units: [...units, { power, type, location: loc }] })
    setAdding(null)
  }

  function removeUnit(p: ProvinceId) {
    update({ units: units.filter((u) => u.location.province !== p), orders: orders.filter((o) => o.unit !== p) })
  }

  function adjudicate() {
    // Orders can go stale when units are added or removed after they were given.
    const valid = new Map<ProvinceId, MovementOrder>()
    const dropped: string[] = []
    for (const o of orders) {
      const u = unitAt(o.unit)
      if (!u) continue
      if (validateMovementOrder(units, u.power, o, { closed: NO_CLOSED }).ok) valid.set(o.unit, o)
      else dropped.push(`${unitLabel(u)}: “${orderPlain(o, units)}” is no longer possible, so it holds`)
    }
    const result = adjudicateMovement(units, valid)
    const record = {
      year,
      season,
      phase: "movement" as const,
      auto: false,
      movement: result,
      explanations: Object.fromEntries(explainMovement(result)),
    }
    setOutcome({ result, record, dropped })
    setShow("result")
    window.scrollTo({ top: 0 })
  }

  function continueFromResult() {
    if (!outcome) return
    const next = season === "spring" ? { season: "fall" as const, year } : { season: "spring" as const, year: year + 1 }
    setScenario((s) => ({ ...s, ...next, units: outcome.result.units, orders: [] }))
    setOutcome(null)
  }

  const label = `${season === "spring" ? "Spring" : "Fall"} ${year}`

  // ---------------------------------------------------------------- results
  if (outcome) {
    const { result, record, dropped } = outcome
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Results</h1>
            <p className="text-sm text-text-2">{label}</p>
          </div>
          <Button variant="ghost" onClick={() => setOutcome(null)}>
            Edit orders
          </Button>
        </div>
        <div className="flex gap-1.5">
          {(["orders", "result"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setShow(k)}
              className={`min-h-10 flex-1 rounded-full border text-sm ${show === k ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}
            >
              {k === "orders" ? "Orders" : "Result"}
            </button>
          ))}
        </div>
        <Card className="overflow-hidden">
          {show === "orders" ? (
            <Board key="orders" units={units} owners={{}} orders={drawnForRecord(record)} showCounts={false} />
          ) : (
            <Board key="result" units={result.units} owners={{}} dislodged={result.dislodged.map((d) => d.unit)} showCounts={false} />
          )}
        </Card>
        {dropped.length ? (
          <Card className="space-y-1 p-4 text-sm text-warning">
            {dropped.map((d) => (
              <p key={d}>{d}</p>
            ))}
          </Card>
        ) : null}
        {result.dislodged.length ? (
          <Card className="p-4">
            <p className="mb-1 font-medium">Must retreat</p>
            <ul className="space-y-1 text-sm text-text-2">
              {result.dislodged.map((d) => (
                <li key={locKey(d.unit.location)}>
                  {powerName(d.unit.power)}&apos;s {unitLabel(d.unit)}:{" "}
                  {d.retreatOptions.length ? `retreat to ${d.retreatOptions.map((l) => placeName(l)).join(", ")}, or disband` : "nowhere to go — disbanded"}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Results record={record} units={units} year={year} />
        <Button className="w-full" onClick={continueFromResult}>
          Continue from this result
        </Button>
        <p className="text-center text-xs text-text-3">
          Continuing moves to {season === "spring" ? `Fall ${year}` : `Spring ${year + 1}`} with the units where they ended up. Dislodged units are removed — retreats and builds
          aren&apos;t simulated here.
        </p>
      </div>
    )
  }

  // ---------------------------------------------------------------- setup
  const drawn = orders.flatMap((o) => {
    const u = unitAt(o.unit)
    return u ? [toDrawn(o, u.power, units)] : []
  })
  const remaining = POWERS.filter((p) => !powers.includes(p))

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Adjudicator</h1>
        <p className="text-sm text-text-2">Set up any position, give orders for every power, and see exactly what happens. Nothing is saved; the link holds the whole scenario.</p>
      </div>

      <Card className="flex items-center gap-3 p-3">
        <label className="flex items-center gap-2 text-sm text-text-2">
          Year
          <input
            inputMode="numeric"
            aria-label="Year"
            value={year}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ""))
              if (n <= 2100) update({ year: n || 1901 })
            }}
            className="min-h-10 w-20 rounded-lg border border-line bg-surface px-2 text-text"
          />
        </label>
        <div className="ml-auto flex gap-1" role="group" aria-label="Season">
          {(["spring", "fall"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={season === s}
              onClick={() => update({ season: s })}
              className={`min-h-10 rounded-full border px-4 text-sm ${season === s ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}
            >
              {s === "spring" ? "Spring" : "Fall"}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Board
          units={units}
          owners={{}}
          orders={drawn}
          showCounts={false}
          highlight={{ selectable: sel ? undefined : units.map((u) => u.location.province), selected: selected ?? undefined, targets }}
          onProvinceClick={onMapClick}
        />
      </Card>
      <p className="text-xs text-text-3">
        {active ? `Tap an empty province to add a ${powerName(active)} unit, or tap a unit to give it an order.` : "Add a power to start placing units."}
      </p>

      {powers.map((p) => {
        const mine = units.filter((u) => u.power === p)
        const c = POWER_COLORS[p]
        return (
          <Card key={p} className={`p-3 ${active === p ? "ring-2 ring-accent" : ""}`}>
            <div className="flex items-center gap-2">
              <button className="flex min-h-10 flex-1 items-center gap-2 text-left" onClick={() => setActive(p)} aria-pressed={active === p} aria-label={`Place units for ${powerName(p)}`}>
                <span className="h-3.5 w-3.5 rounded-full border" style={{ background: c.fill, borderColor: c.stroke }} aria-hidden />
                <span className="font-semibold">{powerName(p)}</span>
                {active === p ? <span className="text-xs text-accent">placing units</span> : null}
              </button>
              <Button
                variant="ghost"
                className="min-h-9 text-sm"
                aria-label={`Add a ${powerName(p)} unit`}
                onClick={() => {
                  setActive(p)
                  setAdding({})
                }}
              >
                Add unit
              </Button>
              <button className="min-h-9 rounded-lg px-2 text-sm text-text-3 hover:bg-surface-2" onClick={() => removePower(p)} aria-label={`Remove ${powerName(p)}`}>
                ✕
              </button>
            </div>
            {mine.length === 0 ? <p className="px-1 pt-1 text-sm text-text-3">No units yet.</p> : null}
            <div className="mt-1 space-y-1.5">
              {mine.map((u) => {
                const o = orderFor(u.location.province)
                const options = legalOrderOptions(units, u.location.province, { closed: NO_CLOSED })
                return (
                  <div key={u.location.province} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${o ? "border-success bg-success-soft" : "border-line bg-surface"}`}>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setSelected(u.location.province)
                        setStep({ kind: "action" })
                      }}
                      aria-label={`${unitLabel(u)}: ${o ? orderPlain(o, units) : "holds"}`}
                    >
                      <span className="block font-medium">{unitLabel(u)}</span>
                      <span className={`block truncate text-sm ${o ? "font-medium text-success" : "text-text-2"}`}>{o ? orderPlain(o, units) : "Holds"}</span>
                      {!o ? <span className="block truncate text-xs text-text-3">Can reach: {reachText(options)}</span> : null}
                    </button>
                    <button className="min-h-9 rounded-lg px-2 text-sm text-text-3 hover:bg-surface-2" onClick={() => removeUnit(u.location.province)} aria-label={`Remove ${unitLabel(u)}`}>
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}

      {remaining.length ? (
        <Button className="w-full" onClick={() => setAddingPower(true)}>
          + Add power
        </Button>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => {
            setScenario({ year: 1901, season: "spring", powers: [...POWERS], units: STANDARD_START.map((u) => ({ ...u, location: { ...u.location } })), orders: [] })
            setActive("AUS")
            setOutcome(null)
          }}
        >
          Standard opening
        </Button>
        <Button
          onClick={() => {
            setScenario(EMPTY_SCENARIO)
            setActive(null)
            setOutcome(null)
          }}
        >
          Clear
        </Button>
      </div>
      <Button
        className="w-full"
        disabled={!units.length}
        onClick={async () => {
          await navigator.clipboard?.writeText(window.location.href)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? "Link copied" : "Copy link to this position"}
      </Button>
      <Button variant="primary" className="sticky bottom-3 w-full" disabled={!units.length} onClick={adjudicate}>
        Adjudicate {label}
      </Button>

      <Sheet open={addingPower} onClose={() => setAddingPower(false)} title="Add a power">
        <div className="grid grid-cols-2 gap-2">
          {remaining.map((p) => (
            <Choice key={p} onClick={() => addPower(p)}>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border" style={{ background: POWER_COLORS[p].fill, borderColor: POWER_COLORS[p].stroke }} aria-hidden />
                {powerName(p)}
              </span>
            </Choice>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!adding && !!active} onClose={() => setAdding(null)} title={active ? `Add a ${powerName(active)} unit` : ""}>
        {adding && active ? <AddUnit power={active} preset={adding.province} occupied={new Set(units.map((u) => u.location.province))} onAdd={addUnit} /> : null}
      </Sheet>

      <Sheet open={!!sel} onClose={() => setSelected(null)} title={sel ? `${powerName(sel.power)} · ${unitName(sel)}` : ""}>
        {sel && opt ? <UnitSheet unit={sel} opt={opt} units={units} step={step} setStep={setStep} setOrder={setOrder} chooseMove={chooseMove} /> : null}
      </Sheet>
    </div>
  )
}

function AddUnit({
  power,
  preset,
  occupied,
  onAdd,
}: {
  power: Power
  preset?: ProvinceId
  occupied: Set<ProvinceId>
  onAdd: (power: Power, type: UnitType, province: ProvinceId, coast?: Coast) => void
}) {
  const [province, setProvince] = useState<ProvinceId | "">(preset ?? "")
  const [error, setError] = useState<string | null>(null)
  const all = Object.values(PROVINCES)
    .filter((p) => !occupied.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const choices = province ? unitChoices(province) : []
  return (
    <div className="space-y-3">
      {preset ? (
        <p className="text-[15px]">{PROVINCES[preset].name}</p>
      ) : (
        <select
          aria-label="Province"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-3"
          value={province}
          onChange={(e) => {
            setProvince(e.target.value)
            setError(null)
          }}
        >
          <option value="">Choose a province…</option>
          {all.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.abbr})
            </option>
          ))}
        </select>
      )}
      {province ? (
        <div className="grid grid-cols-2 gap-2">
          {choices.map((c) => (
            <Choice key={c.label} onClick={() => onAdd(power, c.type, province, c.coast)} hint={c.type === "F" && c.coast ? abbr(province) + "/" + c.coast : undefined}>
              {c.label}
            </Choice>
          ))}
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
