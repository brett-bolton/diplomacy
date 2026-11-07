// Game state and the phase machine:
// Spring orders → Spring retreats? → Fall orders → Fall retreats? → Winter adjustments? → next Spring.

import {
  adjudicateAdjustments,
  adjustmentDelta,
  buildSites,
  supplyCenterCounts,
  updateOwnership,
  type AdjustmentResult,
  type CivilDisorderRule,
} from "./adjudicate/adjust"
import { explainMovement, type Explanation } from "./adjudicate/explain"
import { DEFAULT_RULES, adjudicateMovement, type DislodgedUnit, type MovementResult, type RulesOptions } from "./adjudicate/movement"
import { adjudicateRetreats, type RetreatOutcome } from "./adjudicate/retreat"
import { ITALIAN_TERRITORY, STANDARD_START, homeCenters } from "./map/standard"
import type { AdjustmentOrder, MovementOrder, RetreatOrder } from "./orders"
import { validateMovementOrder } from "./orders/legal"
import { POWERS, type Power, type PhaseType, type ProvinceId, type Season, type Unit } from "./types"
import { variant, type Variant } from "./variants"

export interface GameState {
  playerCount: number
  year: number
  season: Season
  phase: PhaseType
  units: Unit[]
  /** Supply center owners. */
  owners: Record<ProvinceId, Power>
  /** Retreat phase only: units waiting to retreat. */
  dislodged: DislodgedUnit[]
  /** 2-player game: seat that controls Italy once the coin flip has happened. */
  italyControllerSeat?: number
  /** Set when the game is over. */
  result?: { kind: "victory"; seat: number; powers: Power[] } | { kind: "draw" }
}

export interface EngineOptions {
  rules?: RulesOptions
  civilDisorder?: CivilDisorderRule
  /** Random number in [0, 1) for the 2-player coin flip. */
  random?: () => number
}

export type PhaseOrders = Map<Power, (MovementOrder | RetreatOrder | AdjustmentOrder)[]>

export interface PhaseRecord {
  year: number
  season: Season
  phase: PhaseType
  /** State at the start of this phase. */
  before: GameState
  /** True if nobody needed to give orders and the phase was resolved automatically. */
  auto: boolean
  movement?: MovementResult
  explanations?: Record<ProvinceId, Explanation>
  retreats?: RetreatOutcome[]
  adjustments?: AdjustmentResult
  /** Supply centers that changed hands at the end of this phase. */
  captured?: { province: ProvinceId; from?: Power; to: Power }[]
  coinFlip?: { italyToSeat: number }
}

export function newGame(playerCount: number): GameState {
  const v = variant(playerCount)
  const owners: Record<ProvinceId, Power> = {}
  for (const p of POWERS) for (const sc of homeCenters(p)) owners[sc] = p
  return {
    playerCount,
    year: v.startYear,
    season: "spring",
    phase: "movement",
    units: STANDARD_START.map((u) => ({ ...u, location: { ...u.location } })),
    owners,
    dislodged: [],
  }
}

/** Start from a position typed in by the game creator (a Spring or Fall movement phase). */
export function customGame(
  playerCount: number,
  start: { year: number; season: "spring" | "fall"; units: Unit[]; owners: Record<ProvinceId, Power> },
): GameState {
  return { playerCount, year: start.year, season: start.season, phase: "movement", units: start.units, owners: start.owners, dislodged: [] }
}

export function variantOf(state: GameState): Variant {
  return variant(state.playerCount)
}

/** Powers in civil disorder all game (nobody plays them right now). */
export function unplayedPowers(state: GameState): Power[] {
  const v = variantOf(state)
  if (v.italyNeutralThrough && state.italyControllerSeat === undefined) return ["ITA"]
  return v.unplayed
}

/** Seats with their current powers (Italy joins its controller in the 2-player game). */
export function seatPowers(state: GameState): Power[][] {
  const v = variantOf(state)
  return v.seats.map((powers, i) => (state.italyControllerSeat === i ? [...powers, "ITA" as Power] : powers))
}

export function closedProvinces(state: GameState): Set<ProvinceId> {
  const v = variantOf(state)
  if (v.italyNeutralThrough && state.year <= v.italyNeutralThrough) return new Set(ITALIAN_TERRITORY)
  return new Set()
}

function ownersMap(state: GameState): Map<ProvinceId, Power> {
  return new Map(Object.entries(state.owners) as [ProvinceId, Power][])
}

export function isEliminated(state: GameState, power: Power): boolean {
  return !state.units.some((u) => u.power === power) && !Object.values(state.owners).includes(power)
}

/** Powers that must submit orders before this phase can be resolved. */
export function powersToOrder(state: GameState): Power[] {
  if (state.result) return []
  const unplayed = new Set(unplayedPowers(state))
  const played = POWERS.filter((p) => !unplayed.has(p))
  switch (state.phase) {
    case "movement":
      return played.filter((p) => state.units.some((u) => u.power === p))
    case "retreat":
      return played.filter((p) => state.dislodged.some((d) => d.unit.power === p && d.retreatOptions.length > 0))
    case "adjustment": {
      const owners = ownersMap(state)
      return played.filter((p) => {
        const delta = adjustmentDelta(p, owners, state.units)
        return delta < 0 || (delta > 0 && buildSites(p, owners, state.units).length > 0)
      })
    }
  }
}

function clone(state: GameState): GameState {
  return structuredClone(state)
}

/**
 * Resolve the current phase with the orders given (missing orders = default:
 * hold / disband / no builds with civil-disorder removals), then keep resolving
 * any following phases nobody needs to order for. Returns the records of every
 * phase resolved, and the new state (the next phase that needs orders).
 */
export function resolvePhase(state: GameState, orders: PhaseOrders, opts: EngineOptions = {}): { records: PhaseRecord[]; state: GameState } {
  const records: PhaseRecord[] = []
  let current = clone(state)
  let given: PhaseOrders = orders
  for (;;) {
    const { record, next } = resolveOne(current, given, opts)
    record.auto = given.size === 0 && powersToOrder(current).length === 0
    records.push(record)
    current = next
    // Only retreat and adjustment phases are auto-resolved; always stop at the next orders phase.
    if (current.result || current.phase === "movement" || powersToOrder(current).length > 0) break
    given = new Map()
  }
  return { records, state: current }
}

function resolveOne(state: GameState, orders: PhaseOrders, opts: EngineOptions): { record: PhaseRecord; next: GameState } {
  const before = clone(state)
  const record: PhaseRecord = { year: state.year, season: state.season, phase: state.phase, before, auto: false }
  const unplayed = new Set(unplayedPowers(state))

  if (state.phase === "movement") {
    const byUnit = new Map<ProvinceId, MovementOrder>()
    const closed = closedProvinces(state)
    for (const [power, list] of orders) {
      if (unplayed.has(power)) continue
      for (const o of list) {
        if (!("unit" in o) || !["hold", "move", "support-hold", "support-move", "convoy"].includes(o.kind)) continue
        const mo = o as MovementOrder
        if (validateMovementOrder(state.units, power, mo, { closed }).ok) byUnit.set(mo.unit, mo)
      }
    }
    const result = adjudicateMovement(state.units, byUnit, opts.rules ?? DEFAULT_RULES)
    record.movement = result
    record.explanations = Object.fromEntries(explainMovement(result))
    const next = clone(state)
    next.units = result.units
    if (result.dislodged.length) {
      next.phase = "retreat"
      next.dislodged = result.dislodged
      return { record, next }
    }
    return { record, next: endOfSeason(next, record, opts) }
  }

  if (state.phase === "retreat") {
    const byUnit = new Map<ProvinceId, RetreatOrder>()
    for (const [power, list] of orders) {
      if (unplayed.has(power)) continue
      for (const o of list) {
        if (o.kind !== "retreat" && o.kind !== "disband") continue
        if (state.dislodged.some((d) => d.unit.power === power && d.unit.location.province === o.unit)) byUnit.set(o.unit, o)
      }
    }
    const { units, outcomes } = adjudicateRetreats(state.units, state.dislodged, byUnit)
    record.retreats = outcomes
    const next = clone(state)
    next.units = units
    next.dislodged = []
    return { record, next: endOfSeason(next, record, opts) }
  }

  // Winter adjustments
  const adj = new Map<Power, AdjustmentOrder[]>()
  for (const [power, list] of orders) {
    if (unplayed.has(power)) continue
    adj.set(power, list.filter((o): o is AdjustmentOrder => o.kind === "build" || o.kind === "remove" || o.kind === "waive"))
  }
  const result = adjudicateAdjustments(state.units, ownersMap(state), adj, { rule: opts.civilDisorder, noBuild: unplayed })
  record.adjustments = result
  const next = clone(state)
  next.units = result.units
  next.year = state.year + 1
  next.season = "spring"
  next.phase = "movement"
  return { record, next }
}

/** After the last movement/retreat phase of a season. */
function endOfSeason(state: GameState, record: PhaseRecord, opts: EngineOptions): GameState {
  const next = state
  if (state.season === "spring") {
    next.season = "fall"
    next.phase = "movement"
    return next
  }
  // Fall: supply centers change hands.
  const before = ownersMap(state)
  const after = updateOwnership(before, state.units)
  const captured: PhaseRecord["captured"] = []
  for (const [prov, power] of after) {
    if (before.get(prov) !== power) captured.push({ province: prov, from: before.get(prov), to: power })
  }
  if (captured.length) record.captured = captured
  next.owners = Object.fromEntries(after)

  const winner = checkVictory(next)
  if (winner) {
    next.result = winner
    return next
  }

  // 2-player: coin flip for Italy before the Fall adjustments of the last neutral year.
  const v = variantOf(next)
  if (v.italyNeutralThrough === next.year && next.italyControllerSeat === undefined) {
    const r = (opts.random ?? Math.random)()
    next.italyControllerSeat = r < 0.5 ? 0 : 1
    record.coinFlip = { italyToSeat: next.italyControllerSeat }
  }

  next.season = "winter"
  next.phase = "adjustment"
  const anyAdjustment = POWERS.some((p) => {
    const d = adjustmentDelta(p, after, next.units)
    return d < 0 || (d > 0 && buildSites(p, after, next.units).length > 0)
  })
  if (!anyAdjustment) {
    next.year += 1
    next.season = "spring"
    next.phase = "movement"
  }
  return next
}

export function checkVictory(state: GameState): GameState["result"] | undefined {
  const v = variantOf(state)
  const counts = supplyCenterCounts(ownersMap(state))
  const seats = seatPowers(state)
  if (v.victory.scope === "power") {
    for (const [power, n] of counts) {
      if (n >= v.victory.centers) {
        const seat = seats.findIndex((s) => s.includes(power))
        return { kind: "victory", seat, powers: [power] }
      }
    }
    return undefined
  }
  for (let i = 0; i < seats.length; i++) {
    const total = seats[i].reduce((sum, p) => sum + (counts.get(p) ?? 0), 0)
    if (total >= v.victory.centers) return { kind: "victory", seat: i, powers: seats[i] }
  }
  return undefined
}

export function phaseLabel(state: Pick<GameState, "year" | "season" | "phase">): string {
  const season = state.season[0].toUpperCase() + state.season.slice(1)
  const kind = state.phase === "movement" ? "Orders" : state.phase === "retreat" ? "Retreats" : "Builds"
  return `${season} ${state.year} · ${kind}`
}
