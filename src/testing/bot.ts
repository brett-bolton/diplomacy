// Test-only bots that play a whole game. One power (the "conqueror") plays a
// greedy strategy, searching its orders with the real adjudicator; every other
// power plays random legal orders. Seeded, so a game replays identically.

import { adjustmentDelta, buildSites } from "@/engine/adjudicate/adjust"
import { DEFAULT_RULES, adjudicateMovement, type MovementResult } from "@/engine/adjudicate/movement"
import { ARMY_ADJ, FLEET_ADJ, PROVINCES, SUPPLY_CENTERS, isValidUnitLocation } from "@/engine/map/standard"
import { legalOrderOptions } from "@/engine/orders/legal"
import type { AdjustmentOrder, MovementOrder, RetreatOrder } from "@/engine/orders"
import { closedProvinces, newGame, phaseLabel, powersToOrder, resolvePhase, type GameState, type PhaseOrders } from "@/engine/phase"
import { locKey, type Coast, type Location, type Power, type ProvinceId, type Unit } from "@/engine/types"

export type BotOrder = MovementOrder | RetreatOrder | AdjustmentOrder

/** Small seeded PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(xs: T[], random: () => number): T => xs[Math.floor(random() * xs.length)]

function shuffle<T>(xs: T[], random: () => number): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// Distances (moves needed to reach each province), per unit type and start.

const distCache = new Map<string, Map<ProvinceId, number>>()

function distancesFrom(type: "A" | "F", loc: Location): Map<ProvinceId, number> {
  const start = type === "A" ? loc.province : locKey(loc)
  const key = `${type}:${start}`
  const cached = distCache.get(key)
  if (cached) return cached
  const adj = type === "A" ? ARMY_ADJ : FLEET_ADJ
  const out = new Map<ProvinceId, number>()
  const seen = new Set([start])
  let frontier = [start]
  for (let d = 0; frontier.length; d++) {
    const next: string[] = []
    for (const k of frontier) {
      const p = k.split("/")[0]
      if (!out.has(p)) out.set(p, d)
      for (const n of adj.get(k) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  distCache.set(key, out)
  return out
}

const dist = (u: Unit, to: ProvinceId) => distancesFrom(u.type, u.location).get(to) ?? Infinity

/** Supply centers the conqueror still wants: not its own, or its own but occupied by someone else. */
function targetsFor(state: GameState, power: Power): Set<ProvinceId> {
  const occupant = new Map(state.units.map((u) => [u.location.province, u.power]))
  return new Set(
    SUPPLY_CENTERS.filter((sc) => state.owners[sc] !== power || (occupant.has(sc) && occupant.get(sc) !== power)),
  )
}

/** How good a movement result is for `power`: centers taken, enemies dislodged, distance still to go. */
function score(result: MovementResult, power: Power, targets: Set<ProvinceId>, fall: boolean): number {
  const mine = result.units.filter((u) => u.power === power)
  const taken = mine.filter((u) => targets.has(u.location.province)).length
  const dislodged = result.dislodged.filter((d) => d.unit.power !== power).length
  // Spread units over targets: greedy one-to-one assignment by distance.
  const pairs: { u: number; t: ProvinceId; d: number }[] = []
  mine.forEach((u, i) => {
    for (const t of targets) {
      const d = dist(u, t)
      if (d < Infinity) pairs.push({ u: i, t, d })
    }
  })
  pairs.sort((a, b) => a.d - b.d)
  const usedU = new Set<number>()
  const usedT = new Set<ProvinceId>()
  let toGo = 0
  for (const p of pairs) {
    if (usedU.has(p.u) || usedT.has(p.t)) continue
    usedU.add(p.u)
    usedT.add(p.t)
    toGo += p.d
  }
  return (fall ? 20 : 3) * taken + 12 * dislodged - toGo
}

// ---------------------------------------------------------------------------
// The conqueror

function conquerorMovement(state: GameState, power: Power, random: () => number): MovementOrder[] {
  const closed = closedProvinces(state)
  const targets = targetsFor(state, power)
  const fall = state.season === "fall"
  const mine = state.units.filter((u) => u.power === power)
  const occupant = new Map(state.units.map((u) => [u.location.province, u.power]))
  const options = new Map(mine.map((u) => [u.location.province, legalOrderOptions(state.units, u.location.province, { closed })]))
  const orders = new Map<ProvinceId, MovementOrder>()
  // Everyone else is assumed to hold.
  const evaluate = (o: Map<ProvinceId, MovementOrder>) => score(adjudicateMovement(state.units, o, DEFAULT_RULES), power, targets, fall)

  let best = evaluate(orders)
  for (let pass = 0; pass < 4; pass++) {
    let improved = false
    for (const unit of shuffle(mine, random)) {
      const here = unit.location.province
      const opts = options.get(here)!
      const candidates: MovementOrder[][] = [[{ kind: "hold", unit: here }]]
      for (const m of opts.moves) {
        if (m.convoyOnly) continue
        candidates.push([{ kind: "move", unit: here, to: m.to }])
        // Supported attack on a foreign unit.
        if (occupant.has(m.to.province) && occupant.get(m.to.province) !== power) {
          for (const other of mine) {
            const op = options.get(other.location.province)!
            if (op.supportMoves.some((s) => s.from === here && s.to === m.to.province)) {
              candidates.push([
                { kind: "move", unit: here, to: m.to },
                { kind: "support-move", unit: other.location.province, from: here, to: m.to.province },
              ])
            }
          }
        }
      }
      // Support one of our own moves already chosen.
      for (const o of orders.values()) {
        if (o.kind !== "move") continue
        if (opts.supportMoves.some((s) => s.from === o.unit && s.to === o.to.province)) {
          candidates.push([{ kind: "support-move", unit: here, from: o.unit, to: o.to.province }])
        }
      }
      for (const change of candidates) {
        const trial = new Map(orders)
        for (const o of change) trial.set(o.unit, o)
        const s = evaluate(trial)
        if (s > best) {
          best = s
          for (const o of change) orders.set(o.unit, o)
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return [...orders.values()]
}

function conquerorRetreats(state: GameState, power: Power): RetreatOrder[] {
  const targets = targetsFor(state, power)
  return state.dislodged
    .filter((d) => d.unit.power === power)
    .map((d) => {
      const ranked = d.retreatOptions
        .map((to) => ({ to, d: Math.min(...[...targets].map((t) => dist({ ...d.unit, location: to }, t))) }))
        .sort((a, b) => a.d - b.d)
      return ranked.length ? { kind: "retreat" as const, unit: d.unit.location.province, to: ranked[0].to } : { kind: "disband" as const, unit: d.unit.location.province }
    })
}

function coastsFor(p: ProvinceId): (Coast | undefined)[] {
  return PROVINCES[p].coasts ?? [undefined]
}

function conquerorAdjustments(state: GameState, power: Power): AdjustmentOrder[] {
  const owners = new Map(Object.entries(state.owners)) as Map<ProvinceId, Power>
  const delta = adjustmentDelta(power, owners, state.units)
  const targets = targetsFor(state, power)
  const mine = state.units.filter((u) => u.power === power)
  const nearest = (u: Unit) => Math.min(...[...targets].map((t) => dist(u, t)))
  if (delta < 0) {
    return mine
      .sort((a, b) => nearest(b) - nearest(a))
      .slice(0, -delta)
      .map((u) => ({ kind: "remove", unit: u.location.province }))
  }
  const out: AdjustmentOrder[] = []
  let fleets = mine.filter((u) => u.type === "F").length
  let armies = mine.length - fleets
  for (const site of buildSites(power, owners, state.units).slice(0, delta)) {
    const fleetSpots = coastsFor(site)
      .map((coast): Location => (coast ? { province: site, coast } : { province: site }))
      .filter((loc) => isValidUnitLocation("F", loc))
    if (fleetSpots.length && fleets * 2 < armies) {
      const at = fleetSpots.sort((a, b) => nearest({ power, type: "F", location: a }) - nearest({ power, type: "F", location: b }))[0]
      out.push({ kind: "build", unitType: "F", at })
      fleets++
    } else {
      out.push({ kind: "build", unitType: "A", at: { province: site } })
      armies++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Random players

function randomMovement(state: GameState, power: Power, random: () => number): MovementOrder[] {
  const closed = closedProvinces(state)
  return state.units
    .filter((u) => u.power === power)
    .map((u): MovementOrder => {
      const here = u.location.province
      const o = legalOrderOptions(state.units, here, { closed })
      const r = random()
      const moves = o.moves.filter((m) => !m.convoyOnly)
      if (r < 0.35 || (r < 0.8 && !moves.length)) return { kind: "hold", unit: here }
      if (r < 0.8) return { kind: "move", unit: here, to: pick(moves, random).to }
      if (o.supportMoves.length && random() < 0.5) {
        const s = pick(o.supportMoves, random)
        return { kind: "support-move", unit: here, from: s.from, to: s.to }
      }
      if (o.supportHolds.length) return { kind: "support-hold", unit: here, target: pick(o.supportHolds, random) }
      return { kind: "hold", unit: here }
    })
}

function randomRetreats(state: GameState, power: Power, random: () => number): RetreatOrder[] {
  return state.dislodged
    .filter((d) => d.unit.power === power)
    .map((d) =>
      d.retreatOptions.length && random() < 0.8
        ? { kind: "retreat" as const, unit: d.unit.location.province, to: pick(d.retreatOptions, random) }
        : { kind: "disband" as const, unit: d.unit.location.province },
    )
}

function randomAdjustments(state: GameState, power: Power, random: () => number): AdjustmentOrder[] {
  const owners = new Map(Object.entries(state.owners)) as Map<ProvinceId, Power>
  const delta = adjustmentDelta(power, owners, state.units)
  const mine = state.units.filter((u) => u.power === power)
  // Half the time, leave disbands to the civil-disorder rule.
  if (delta < 0) return random() < 0.5 ? [] : shuffle(mine, random).slice(0, -delta).map((u) => ({ kind: "remove", unit: u.location.province }))
  const out: AdjustmentOrder[] = []
  for (const site of shuffle(buildSites(power, owners, state.units), random).slice(0, delta)) {
    const spots = coastsFor(site)
      .map((coast): Location => (coast ? { province: site, coast } : { province: site }))
      .filter((loc) => isValidUnitLocation("F", loc))
    if (spots.length && random() < 0.4) out.push({ kind: "build", unitType: "F", at: pick(spots, random) })
    else out.push({ kind: "build", unitType: "A", at: { province: site } })
  }
  return out
}

// ---------------------------------------------------------------------------

/** Orders for one power this phase. */
export function botOrders(state: GameState, power: Power, conqueror: Power, random: () => number): BotOrder[] {
  const greedy = power === conqueror
  switch (state.phase) {
    case "movement":
      return greedy ? conquerorMovement(state, power, random) : randomMovement(state, power, random)
    case "retreat":
      return greedy ? conquerorRetreats(state, power) : randomRetreats(state, power, random)
    case "adjustment":
      return greedy ? conquerorAdjustments(state, power) : randomAdjustments(state, power, random)
  }
}

/** The game the tests play: France conquers; seed fixes every random choice. Override with FULL_GAME=RUS:7. */
const [envPower, envSeed] = (process.env.FULL_GAME ?? "").split(":")
export const FULL_GAME = { conqueror: (envPower || "FRA") as Power, seed: Number(envSeed || 1) }

/** Play a 7-player game in the engine alone with the bots until someone wins. */
export function playOut(conqueror: Power, seed: number, onPhase?: (before: GameState, after: GameState) => void) {
  const random = seeded(seed)
  let state = newGame(7)
  const labels: string[] = []
  while (!state.result) {
    if (state.year > 1940) throw new Error(`No winner by ${state.year}`)
    const orders: PhaseOrders = new Map()
    for (const p of powersToOrder(state)) orders.set(p, botOrders(state, p, conqueror, random))
    const { records, state: next } = resolvePhase(state, orders)
    for (const r of records) labels.push(phaseLabel(r))
    onPhase?.(state, next)
    state = next
  }
  return { state, labels }
}

