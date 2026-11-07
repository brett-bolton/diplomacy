// Movement-phase adjudicator.
//
// Algorithm: Lucas Kruijswijk, "The Math of Adjudication" — every order is a
// decision resolved recursively from hold / attack / defend / prevent strengths.
// Dependency cycles are detected by guessing; a cycle with no unique answer is
// settled by a backup rule (circular movement succeeds; convoy paradoxes use the
// Szykman rule).
//
// Rule options follow the 2008 (= 2000) rulebook where it takes a position, and
// DATC v3 preferences elsewhere. See src/engine/README.md.

import {
  ARMY_ADJ,
  FLEET_ADJ,
  PROVINCES,
  canReach,
  isSea,
  reachableCoasts,
} from "../map/standard"
import type { MovementOrder } from "../orders"
import type { Location, Power, ProvinceId, Unit } from "../types"
import { locKey } from "../types"

export interface RulesOptions {
  /**
   * DATC 4.A.2. "rulebook-2000": a convoyed army does not cut the support of a
   * unit supporting an attack against a fleet necessary for its convoy (2000 /
   * 2008 rulebook), with the Szykman rule as backup for unresolved paradoxes.
   * "szykman": Szykman rule only (DATC preferred).
   */
  convoyParadox: "rulebook-2000" | "szykman"
}

export const DEFAULT_RULES: RulesOptions = { convoyParadox: "rulebook-2000" }

export type IllegalReason =
  | "unit-cannot-reach"
  | "same-province"
  | "army-to-sea"
  | "fleet-to-inland"
  | "coast-not-specified"
  | "coast-not-reachable"
  | "no-convoy-route"
  | "no-unit-at-target"
  | "support-self"
  | "convoy-not-at-sea"
  | "convoy-non-army"
  | "fleet-cannot-be-convoyed"
  | "convoy-not-possible"
  | "support-needed-for-convoy"

/** An order after legality checks. Illegal orders behave as holds. */
export interface NormalizedOrder {
  order: MovementOrder
  illegal?: IllegalReason
  /** Legal support/convoy that doesn't match what the supported/convoyed unit was ordered to do. */
  void?: boolean
  /** Army move that goes by convoy. */
  viaConvoyRoute?: boolean
}

export type SupportStatus =
  | { status: "given" }
  | { status: "cut"; by: ProvinceId }
  | { status: "dislodged"; by: ProvinceId }
  | { status: "void" }
  | { status: "illegal"; reason: IllegalReason }

export interface MoveDetail {
  attack: number
  /** What the attack had to beat at the destination. */
  opposition:
    | { kind: "hold"; province: ProvinceId; strength: number; occupied: boolean; unitMovedAway?: boolean }
    | { kind: "defend"; province: ProvinceId; strength: number }
  /** Other units trying to enter the same province. */
  prevents: { from: ProvinceId; strength: number }[]
  /** Supports given or attempted for this move. */
  supports: { from: ProvinceId; power: Power; counted: boolean; status: SupportStatus["status"]; cutBy?: ProvinceId; notCountedReason?: "own-unit-target" }[]
  convoy?: { pathOk: boolean; fleets: ProvinceId[] }
  /** True if the attack would have dislodged/entered but the destination unit is of the same power. */
  ownUnit?: boolean
}

export interface UnitOutcome {
  unit: Unit
  order: MovementOrder
  illegal?: IllegalReason
  void?: boolean
  /**
   * Moves: the unit moved. Supports: support was given. Convoys: the fleet
   * convoyed (wasn't dislodged and the convoy was valid). Holds: true.
   */
  success: boolean
  dislodgedBy?: { from: ProvinceId; viaConvoy: boolean }
  move?: MoveDetail
  support?: SupportStatus
  /** Hold strength at the end, including hold supports (for non-moving units). */
  holdStrength?: number
  holdSupports?: { from: ProvinceId; power: Power; counted: boolean; status: SupportStatus["status"]; cutBy?: ProvinceId }[]
  /** Set when a paradox backup rule decided this order. */
  paradox?: "circular-movement" | "szykman"
}

export interface DislodgedUnit {
  unit: Unit
  attackerFrom: ProvinceId
  attackerViaConvoy: boolean
  /** Locations this unit may retreat to. */
  retreatOptions: Location[]
}

export interface MovementResult {
  outcomes: UnitOutcome[]
  /** Units still on the board after movement, at their new locations. */
  units: Unit[]
  dislodged: DislodgedUnit[]
  /** Empty provinces left by a standoff; units can't retreat there. */
  contested: ProvinceId[]
}

// ---------------------------------------------------------------------------

/** Sea provinces a fleet could convoy from/to for an army in `prov`. */
function seasTouching(prov: ProvinceId): Set<ProvinceId> {
  const out = new Set<ProvinceId>()
  const pr = PROVINCES[prov]
  if (!pr || pr.kind === "inland") return out
  const keys = pr.coasts ? pr.coasts.map((c) => `${prov}/${c}`) : [prov]
  for (const k of keys) {
    for (const n of FLEET_ADJ.get(k) ?? []) if (isSea(n)) out.add(n)
  }
  return out
}

/** Is there a chain of the given sea provinces linking `from` and `to`? */
function seaChain(from: ProvinceId, to: ProvinceId, seas: Set<ProvinceId>): ProvinceId[] | null {
  const start = [...seasTouching(from)].filter((s) => seas.has(s))
  const goal = seasTouching(to)
  const prev = new Map<ProvinceId, ProvinceId | null>()
  const queue: ProvinceId[] = []
  for (const s of start) {
    prev.set(s, null)
    queue.push(s)
  }
  while (queue.length) {
    const s = queue.shift()!
    if (goal.has(s)) {
      const path: ProvinceId[] = []
      for (let c: ProvinceId | null = s; c; c = prev.get(c) ?? null) path.unshift(c)
      return path
    }
    for (const n of FLEET_ADJ.get(s) ?? []) {
      if (seas.has(n) && !prev.has(n)) {
        prev.set(n, s)
        queue.push(n)
      }
    }
  }
  return null
}

/**
 * Every irredundant convoy route from `from` to `to` through the given seas: no
 * fleet can be dropped and still leave a route. A fleet is only "part of" a
 * convoy if it is on one of these (DATC 6.G.19).
 */
export function minimalConvoyRoutes(from: ProvinceId, to: ProvinceId, seas: Set<ProvinceId>): ProvinceId[][] {
  const atStart = seasTouching(from)
  const atEnd = seasTouching(to)
  const routes: ProvinceId[][] = []
  const walk = (path: ProvinceId[]) => {
    const last = path[path.length - 1]
    if (atEnd.has(last)) {
      routes.push([...path])
      return
    }
    for (const n of FLEET_ADJ.get(last) ?? []) {
      if (!seas.has(n) || path.includes(n) || atStart.has(n)) continue
      // No shortcut: n must not touch any earlier sea except its predecessor.
      if (path.slice(0, -1).some((p) => FLEET_ADJ.get(p)?.has(n))) continue
      path.push(n)
      walk(path)
      path.pop()
    }
  }
  for (const s of atStart) if (seas.has(s)) walk([s])
  return routes
}

function normalize(units: Unit[], unitAt: Map<ProvinceId, number>, raw: MovementOrder[]): NormalizedOrder[] {
  const fleetSeas = new Set(units.filter((u) => u.type === "F" && isSea(u.location.province)).map((u) => u.location.province))

  const out: NormalizedOrder[] = raw.map((order, i) => {
    const unit = units[i]
    const here = unit.location.province
    switch (order.kind) {
      case "hold":
        return { order }
      case "move": {
        const dest = order.to.province
        const pr = PROVINCES[dest]
        if (!pr) return { order, illegal: "unit-cannot-reach" }
        if (dest === here) return { order, illegal: "same-province" }
        if (unit.type === "A") {
          if (pr.kind === "sea") return { order, illegal: "army-to-sea" }
          const to = { province: dest }
          const adjacent = ARMY_ADJ.get(here)?.has(dest) ?? false
          if (adjacent) return { order: { ...order, to } }
          if (PROVINCES[here].kind === "coastal" && pr.kind === "coastal" && seaChain(here, dest, fleetSeas)) {
            return { order: { ...order, to } }
          }
          return { order, illegal: adjacent ? "unit-cannot-reach" : "no-convoy-route" }
        }
        // Fleet
        if (order.viaConvoy && !FLEET_ADJ.get(locKey(unit.location))) return { order, illegal: "fleet-cannot-be-convoyed" }
        if (pr.kind === "inland") return { order, illegal: "fleet-to-inland" }
        if (pr.coasts) {
          const coasts = reachableCoasts(unit.location, dest)
          if (order.to.coast) {
            if (!coasts.includes(order.to.coast)) return { order, illegal: coasts.length ? "coast-not-reachable" : "unit-cannot-reach" }
            return { order: { ...order, viaConvoy: false } }
          }
          if (coasts.length === 1) return { order: { ...order, to: { province: dest, coast: coasts[0] }, viaConvoy: false } }
          return { order, illegal: coasts.length === 0 ? "unit-cannot-reach" : "coast-not-specified" }
        }
        if (!FLEET_ADJ.get(locKey(unit.location))?.has(dest)) return { order, illegal: "unit-cannot-reach" }
        return { order: { ...order, to: { province: dest }, viaConvoy: false } }
      }
      case "support-hold": {
        if (order.target === here) return { order, illegal: "support-self" }
        if (!unitAt.has(order.target)) return { order, illegal: "no-unit-at-target" }
        if (!canReach(unit.type, unit.location, order.target)) return { order, illegal: "unit-cannot-reach" }
        return { order }
      }
      case "support-move": {
        if (order.to === here) return { order, illegal: "support-self" }
        if (!unitAt.has(order.from)) return { order, illegal: "no-unit-at-target" }
        if (order.from === order.to) return { order, illegal: "same-province" }
        if (!canReach(unit.type, unit.location, order.to)) return { order, illegal: "unit-cannot-reach" }
        // A fleet can't support an army whose only possible convoy runs through that fleet (DATC 6.D.31).
        const supported = units[unitAt.get(order.from)!]
        if (
          supported.type === "A" &&
          unit.type === "F" &&
          isSea(here) &&
          !ARMY_ADJ.get(order.from)?.has(order.to)
        ) {
          const others = new Set([...fleetSeas].filter((s) => s !== here))
          if (!seaChain(order.from, order.to, others)) return { order, illegal: "support-needed-for-convoy" }
        }
        return { order }
      }
      case "convoy": {
        if (unit.type !== "F" || !isSea(here)) return { order, illegal: "convoy-not-at-sea" }
        const armyIdx = unitAt.get(order.from)
        if (armyIdx === undefined) return { order, illegal: "no-unit-at-target" }
        if (units[armyIdx].type !== "A") return { order, illegal: "convoy-non-army" }
        const routes = minimalConvoyRoutes(order.from, order.to, fleetSeas)
        if (!routes.some((r) => r.includes(here))) return { order, illegal: "convoy-not-possible" }
        return { order }
      }
    }
  })

  // Decide which army moves go by convoy (DATC 4.A.3, 2000 rulebook / DATC v3 preferred:
  // convoy route only with "via convoy" or a same-power fleet legally ordered to convoy).
  for (let i = 0; i < out.length; i++) {
    const n = out[i]
    if (n.illegal || n.order.kind !== "move" || units[i].type !== "A") continue
    const from = units[i].location.province
    const to = n.order.to.province
    if (!ARMY_ADJ.get(from)?.has(to)) {
      n.viaConvoyRoute = true
      continue
    }
    if (n.order.viaConvoy) {
      n.viaConvoyRoute = true
      continue
    }
    n.viaConvoyRoute = out.some(
      (c, j) =>
        !c.illegal &&
        c.order.kind === "convoy" &&
        c.order.from === from &&
        c.order.to === to &&
        units[j].power === units[i].power,
    )
  }

  // Void supports / convoys that don't match what the other unit was ordered.
  for (let i = 0; i < out.length; i++) {
    const n = out[i]
    if (n.illegal) continue
    const o = n.order
    if (o.kind === "support-hold") {
      const t = out[unitAt.get(o.target)!]
      if (!t.illegal && t.order.kind === "move") n.void = true
    } else if (o.kind === "support-move") {
      const t = out[unitAt.get(o.from)!]
      if (t.illegal || t.order.kind !== "move" || t.order.to.province !== o.to) n.void = true
      else if (o.toCoast && t.order.to.coast && t.order.to.coast !== o.toCoast) n.void = true
    } else if (o.kind === "convoy") {
      const t = out[unitAt.get(o.from)!]
      if (t.illegal || t.order.kind !== "move" || t.order.to.province !== o.to || !t.viaConvoyRoute) n.void = true
    }
  }
  return out
}

const UNRESOLVED = 0
const GUESSING = 1
const RESOLVED = 2

class Resolver {
  readonly unitAt = new Map<ProvinceId, number>()
  readonly norm: NormalizedOrder[]
  readonly movesInto = new Map<ProvinceId, number[]>()
  readonly moveSupports: number[][]
  readonly holdSupports: number[][]
  readonly convoys: number[][]
  readonly h2h: number[]
  readonly state: number[]
  readonly result: boolean[]
  readonly paradox: (UnitOutcome["paradox"] | undefined)[]
  depList: number[] = []

  constructor(
    readonly units: Unit[],
    raw: MovementOrder[],
    readonly opts: RulesOptions,
  ) {
    units.forEach((u, i) => this.unitAt.set(u.location.province, i))
    this.norm = normalize(units, this.unitAt, raw)
    const n = units.length
    this.moveSupports = Array.from({ length: n }, () => [])
    this.holdSupports = Array.from({ length: n }, () => [])
    this.convoys = Array.from({ length: n }, () => [])
    this.h2h = new Array(n).fill(-1)
    this.state = new Array(n).fill(UNRESOLVED)
    this.result = new Array(n).fill(false)
    this.paradox = new Array(n).fill(undefined)

    for (let i = 0; i < n; i++) {
      const o = this.order(i)
      if (o.kind === "move" && !this.norm[i].illegal) {
        const list = this.movesInto.get(o.to.province) ?? []
        list.push(i)
        this.movesInto.set(o.to.province, list)
      }
    }
    for (let i = 0; i < n; i++) {
      const nm = this.norm[i]
      if (nm.illegal || nm.void) continue
      const o = nm.order
      if (o.kind === "support-move") this.moveSupports[this.unitAt.get(o.from)!].push(i)
      else if (o.kind === "support-hold") this.holdSupports[this.unitAt.get(o.target)!].push(i)
      else if (o.kind === "convoy") this.convoys[this.unitAt.get(o.from)!].push(i)
    }
    for (let i = 0; i < n; i++) {
      if (!this.isMove(i) || this.norm[i].viaConvoyRoute) continue
      const o = this.order(i) as Extract<MovementOrder, { kind: "move" }>
      const j = this.unitAt.get(o.to.province)
      if (j === undefined || !this.isMove(j) || this.norm[j].viaConvoyRoute) continue
      if ((this.order(j) as Extract<MovementOrder, { kind: "move" }>).to.province === this.prov(i)) this.h2h[i] = j
    }
  }

  order(i: number): MovementOrder {
    return this.norm[i].order
  }
  prov(i: number): ProvinceId {
    return this.units[i].location.province
  }
  power(i: number): Power {
    return this.units[i].power
  }
  isMove(i: number): boolean {
    return this.order(i).kind === "move" && !this.norm[i].illegal
  }
  target(i: number): ProvinceId {
    return (this.order(i) as Extract<MovementOrder, { kind: "move" }>).to.province
  }

  // --- resolution --------------------------------------------------------

  resolve(i: number): boolean {
    if (this.state[i] === RESOLVED) return this.result[i]
    if (this.state[i] === GUESSING) {
      if (!this.depList.includes(i)) this.depList.push(i)
      return this.result[i]
    }
    const oldLen = this.depList.length
    this.result[i] = false
    this.state[i] = GUESSING
    const first = this.adjudicate(i)
    if (this.depList.length === oldLen) {
      if (this.state[i] !== RESOLVED) {
        this.result[i] = first
        this.state[i] = RESOLVED
      }
      return this.result[i]
    }
    if (this.depList[oldLen] !== i) {
      this.depList.push(i)
      this.result[i] = first
      return first
    }
    // i heads a cycle: try the other guess.
    for (const d of this.depList.slice(oldLen)) this.state[d] = UNRESOLVED
    this.depList.length = oldLen
    this.result[i] = true
    this.state[i] = GUESSING
    const second = this.adjudicate(i)
    if (first === second) {
      for (const d of this.depList.slice(oldLen)) this.state[d] = UNRESOLVED
      this.depList.length = oldLen
      this.result[i] = first
      this.state[i] = RESOLVED
      return first
    }
    const cycle = this.depList.slice(oldLen)
    this.depList.length = oldLen
    this.backupRule(cycle)
    return this.resolve(i)
  }

  backupRule(cycle: number[]): void {
    const convoyOrders = cycle.filter((c) => this.order(c).kind === "convoy")
    if (convoyOrders.length === 0) {
      // Circular movement: every move in the cycle succeeds.
      for (const c of cycle) {
        if (this.isMove(c)) {
          this.result[c] = true
          this.state[c] = RESOLVED
          this.paradox[c] = "circular-movement"
        } else {
          this.state[c] = UNRESOLVED
        }
      }
      return
    }
    // Szykman: convoying fleets in the paradox hold (the convoy fails).
    for (const c of cycle) {
      if (convoyOrders.includes(c)) {
        this.result[c] = false
        this.state[c] = RESOLVED
        this.paradox[c] = "szykman"
      } else {
        this.state[c] = UNRESOLVED
      }
    }
  }

  adjudicate(i: number): boolean {
    const nm = this.norm[i]
    if (nm.illegal) return false
    switch (nm.order.kind) {
      case "hold":
        return true
      case "move":
        return this.adjudicateMove(i)
      case "support-hold":
      case "support-move":
        return !nm.void && this.supportCutOrDislodged(i) === null
      case "convoy":
        return !nm.void && this.dislodgingMove(this.prov(i)) === null
    }
  }

  // --- strengths ---------------------------------------------------------

  /** Convoy route for move i (null = none). `exclude` drops one fleet from consideration. */
  convoyPath(i: number, exclude?: ProvinceId): ProvinceId[] | null {
    const seas = new Set<ProvinceId>()
    for (const c of this.convoys[i]) {
      const p = this.prov(c)
      if (p === exclude) continue
      if (this.resolve(c)) seas.add(p)
    }
    return seaChain(this.prov(i), this.target(i), seas)
  }

  pathOk(i: number): boolean {
    return !this.norm[i].viaConvoyRoute || this.convoyPath(i) !== null
  }

  supportCount(move: number, excludePower?: Power): number {
    let n = 0
    for (const s of this.moveSupports[move]) {
      if (excludePower && this.power(s) === excludePower) continue
      if (this.resolve(s)) n++
    }
    return n
  }

  holdStrength(prov: ProvinceId): number {
    const u = this.unitAt.get(prov)
    if (u === undefined) return 0
    if (this.isMove(u)) return this.resolve(u) ? 0 : 1
    let n = 1
    for (const s of this.holdSupports[u]) if (this.resolve(s)) n++
    return n
  }

  attackStrength(i: number): number {
    if (!this.pathOk(i)) return 0
    const dest = this.unitAt.get(this.target(i))
    const movedAway = dest !== undefined && this.isMove(dest) && this.h2h[i] !== dest && this.resolve(dest)
    if (dest === undefined || movedAway) return 1 + this.supportCount(i)
    if (this.power(dest) === this.power(i)) return 0
    return 1 + this.supportCount(i, this.power(dest))
  }

  defendStrength(i: number): number {
    return 1 + this.supportCount(i)
  }

  preventStrength(i: number): number {
    if (!this.pathOk(i)) return 0
    const h = this.h2h[i]
    if (h >= 0 && this.resolve(h)) return 0
    return 1 + this.supportCount(i)
  }

  adjudicateMove(i: number): boolean {
    if (!this.pathOk(i)) return false
    const attack = this.attackStrength(i)
    const h = this.h2h[i]
    if (h >= 0) {
      if (attack <= this.defendStrength(h)) return false
    } else if (attack <= this.holdStrength(this.target(i))) {
      return false
    }
    for (const o of this.movesInto.get(this.target(i)) ?? []) {
      if (o !== i && attack <= this.preventStrength(o)) return false
    }
    return true
  }

  /** A successful move into `prov`, if the unit there didn't leave. */
  dislodgingMove(prov: ProvinceId, exempt?: Set<number>): number | null {
    const u = this.unitAt.get(prov)
    if (u === undefined) return null
    if (this.isMove(u) && this.resolve(u)) return null
    for (const m of this.movesInto.get(prov) ?? []) {
      if (exempt?.has(m)) continue
      if (this.resolve(m)) return m
    }
    return null
  }

  /**
   * Moves into the supporter's province that, under the 2000 rulebook, don't
   * cut the support: a convoyed army attacking a unit that supports an attack on
   * a fleet the army needs for its convoy.
   */
  rulebookExempt(s: number): Set<number> {
    const exempt = new Set<number>()
    if (this.opts.convoyParadox !== "rulebook-2000") return exempt
    const o = this.order(s)
    if (o.kind !== "support-move") return exempt
    const fleet = this.unitAt.get(o.to)
    if (fleet === undefined) return exempt
    for (const m of this.movesInto.get(this.prov(s)) ?? []) {
      if (!this.norm[m].viaConvoyRoute) continue
      if (!this.convoys[m].includes(fleet)) continue
      if (this.convoyPath(m, o.to) === null) exempt.add(m)
    }
    return exempt
  }

  /** Why support s isn't given (cut / dislodged), or null if it stands. */
  supportCutOrDislodged(s: number): { cut: number } | { dislodged: number } | null {
    const o = this.order(s)
    const here = this.prov(s)
    const exempt = this.rulebookExempt(s)
    for (const m of this.movesInto.get(here) ?? []) {
      if (exempt.has(m)) continue
      if (this.power(m) === this.power(s)) continue
      if (o.kind === "support-move" && this.prov(m) === o.to) continue
      if (!this.pathOk(m)) continue
      return { cut: m }
    }
    const d = this.dislodgingMove(here, exempt)
    if (d !== null) return { dislodged: d }
    return null
  }

  // --- results -------------------------------------------------------------

  run(): MovementResult {
    for (let i = 0; i < this.units.length; i++) this.resolve(i)
    return this.collect()
  }

  supportInfo(s: number) {
    const nm = this.norm[s]
    const base = { from: this.prov(s), power: this.power(s) }
    if (nm.void) return { ...base, counted: false, status: "void" as const }
    const why = this.supportCutOrDislodged(s)
    if (why && "cut" in why) return { ...base, counted: false, status: "cut" as const, cutBy: this.prov(why.cut) }
    if (why && "dislodged" in why) return { ...base, counted: false, status: "dislodged" as const, cutBy: this.prov(why.dislodged) }
    return { ...base, counted: true, status: "given" as const }
  }

  collect(): MovementResult {
    const outcomes: UnitOutcome[] = []
    const dislodged: DislodgedUnit[] = []
    const after: Unit[] = []
    const occupiedAfter = new Set<ProvinceId>()

    for (let i = 0; i < this.units.length; i++) {
      const unit = this.units[i]
      const nm = this.norm[i]
      const out: UnitOutcome = { unit, order: nm.order, success: this.result[i] }
      if (nm.illegal) out.illegal = nm.illegal
      if (nm.void) out.void = true
      if (this.paradox[i]) out.paradox = this.paradox[i]

      const o = nm.order
      if (o.kind === "move" && !nm.illegal) out.move = this.moveDetail(i)
      if ((o.kind === "support-hold" || o.kind === "support-move") && !nm.illegal) {
        const info = this.supportInfo(i)
        out.support =
          info.status === "cut"
            ? { status: "cut", by: info.cutBy! }
            : info.status === "dislodged"
              ? { status: "dislodged", by: info.cutBy! }
              : info.status === "void"
                ? { status: "void" }
                : { status: "given" }
      }
      if ((o.kind === "support-hold" || o.kind === "support-move") && nm.illegal) {
        out.support = { status: "illegal", reason: nm.illegal }
      }
      if (!this.isMove(i) || !this.result[i]) {
        out.holdStrength = this.holdStrength(this.prov(i))
        out.holdSupports = this.holdSupports[i].map((s) => this.supportInfo(s))
      }

      const moved = this.isMove(i) && this.result[i]
      const d = moved ? null : this.dislodgingMove(this.prov(i))
      if (d !== null) {
        out.dislodgedBy = { from: this.prov(d), viaConvoy: !!this.norm[d].viaConvoyRoute }
      }
      outcomes.push(out)

      if (moved) {
        const to = (o as Extract<MovementOrder, { kind: "move" }>).to
        const loc: Location = unit.type === "F" && to.coast ? { province: to.province, coast: to.coast } : { province: to.province }
        after.push({ ...unit, location: loc })
        occupiedAfter.add(loc.province)
      } else if (d === null) {
        after.push(unit)
        occupiedAfter.add(unit.location.province)
      }
    }

    // Contested provinces: left empty after a standoff.
    const contested: ProvinceId[] = []
    for (const [prov, moves] of this.movesInto) {
      if (occupiedAfter.has(prov)) continue
      if (moves.some((m) => !this.result[m] && this.preventStrength(m) > 0)) contested.push(prov)
    }

    for (const out of outcomes) {
      if (!out.dislodgedBy) continue
      const unit = out.unit
      const options: Location[] = []
      const from = out.dislodgedBy.from
      const candidates =
        unit.type === "A"
          ? [...(ARMY_ADJ.get(unit.location.province) ?? [])].map((p) => ({ province: p }) as Location)
          : [...(FLEET_ADJ.get(locKey(unit.location)) ?? [])].map((k) => {
              const [province, coast] = k.split("/")
              return (coast ? { province, coast } : { province }) as Location
            })
      for (const loc of candidates) {
        if (occupiedAfter.has(loc.province)) continue
        if (contested.includes(loc.province)) continue
        if (loc.province === from && !out.dislodgedBy.viaConvoy) continue
        options.push(loc)
      }
      dislodged.push({ unit, attackerFrom: from, attackerViaConvoy: out.dislodgedBy.viaConvoy, retreatOptions: options })
    }

    return { outcomes, units: after, dislodged, contested: contested.sort() }
  }

  moveDetail(i: number): MoveDetail {
    const target = this.target(i)
    const h = this.h2h[i]
    const dest = this.unitAt.get(target)
    const detail: MoveDetail = {
      attack: this.attackStrength(i),
      opposition:
        h >= 0
          ? { kind: "defend", province: target, strength: this.defendStrength(h) }
          : {
              kind: "hold",
              province: target,
              strength: this.holdStrength(target),
              occupied: dest !== undefined,
              ...(dest !== undefined && this.isMove(dest) ? { unitMovedAway: this.resolve(dest) } : {}),
            },
      prevents: (this.movesInto.get(target) ?? [])
        .filter((o) => o !== i)
        .map((o) => ({ from: this.prov(o), strength: this.preventStrength(o) })),
      supports: this.moveSupports[i].map((s) => {
        const info = this.supportInfo(s)
        const destStays = dest !== undefined && !(this.isMove(dest) && h !== dest && this.resolve(dest))
        if (info.counted && destStays && this.power(s) === this.power(dest!) && this.power(dest!) !== this.power(i)) {
          return { ...info, counted: false, notCountedReason: "own-unit-target" as const }
        }
        return info
      }),
    }
    if (this.norm[i].viaConvoyRoute) {
      const path = this.convoyPath(i)
      detail.convoy = { pathOk: path !== null, fleets: path ?? this.convoys[i].map((c) => this.prov(c)) }
    }
    if (dest !== undefined && this.power(dest) === this.power(i)) {
      const movedAway = this.isMove(dest) && h !== dest && this.resolve(dest)
      if (!movedAway) detail.ownUnit = true
    }
    return detail
  }
}

/**
 * Adjudicate a movement phase.
 * @param units every unit on the board
 * @param orders orders keyed by the ordered unit's province; units without an order hold.
 *   Callers must only pass orders a power gave to its own units.
 */
export function adjudicateMovement(
  units: Unit[],
  orders: Map<ProvinceId, MovementOrder>,
  opts: RulesOptions = DEFAULT_RULES,
): MovementResult {
  const raw = units.map((u) => orders.get(u.location.province) ?? ({ kind: "hold", unit: u.location.province } as MovementOrder))
  return new Resolver(units, raw, opts).run()
}
