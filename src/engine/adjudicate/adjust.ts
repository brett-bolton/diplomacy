// Winter adjustments: supply-center ownership, builds, disbands, civil disorder.

import { ARMY_ADJ, FLEET_ADJ, PROVINCES, SUPPLY_CENTERS, isValidUnitLocation } from "../map/standard"
import type { AdjustmentOrder } from "../orders"
import type { Location, Power, ProvinceId, Unit } from "../types"
import { locKey } from "../types"

export type Ownership = Map<ProvinceId, Power>

/**
 * How unordered disbands are chosen (DATC 4.D.8).
 * "rulebook-2000": farthest from the power's home supply centers first; armies
 *   may count sea steps, fleets only move as fleets (the 2000/2008 rulebook and
 *   the common pre-2023 reading).
 * "rulebook-2023": farthest from the nearest owned supply center, any unit over
 *   land or sea (2023 rulebook, DATC v3 preferred).
 */
export type CivilDisorderRule = "rulebook-2000" | "rulebook-2023"

/** After a Fall turn (incl. retreats): every occupied supply center belongs to the occupier. */
export function updateOwnership(owners: Ownership, units: Unit[]): Ownership {
  const next = new Map(owners)
  for (const u of units) {
    if (PROVINCES[u.location.province].supplyCenter) next.set(u.location.province, u.power)
  }
  return next
}

export function supplyCenterCounts(owners: Ownership): Map<Power, number> {
  const counts = new Map<Power, number>()
  for (const sc of SUPPLY_CENTERS) {
    const p = owners.get(sc)
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  return counts
}

/** Positive: builds allowed. Negative: units that must be removed. */
export function adjustmentDelta(power: Power, owners: Ownership, units: Unit[]): number {
  const scs = supplyCenterCounts(owners).get(power) ?? 0
  return scs - units.filter((u) => u.power === power).length
}

/** Home centers where `power` could build right now. */
export function buildSites(power: Power, owners: Ownership, units: Unit[]): ProvinceId[] {
  const occupied = new Set(units.map((u) => u.location.province))
  return Object.values(PROVINCES)
    .filter((p) => p.home === power && owners.get(p.id) === power && !occupied.has(p.id))
    .map((p) => p.id)
}

/** Distance (in moves) from a unit to the nearest target province, for civil-disorder removals. */
function distance(unit: Unit, targets: Set<ProvinceId>, rule: CivilDisorderRule): number {
  if (targets.size === 0) return Infinity
  const byProvince = unit.type === "A" || rule === "rulebook-2023"
  if (byProvince) {
    // Province graph: land and sea steps both allowed.
    const seen = new Set([unit.location.province])
    let frontier = [unit.location.province]
    for (let d = 0; frontier.length; d++) {
      if (frontier.some((p) => targets.has(p))) return d
      const next: ProvinceId[] = []
      for (const p of frontier) {
        const ns = new Set<ProvinceId>(ARMY_ADJ.get(p) ?? [])
        const keys = PROVINCES[p].coasts ? PROVINCES[p].coasts!.map((c) => `${p}/${c}`) : [p]
        for (const k of keys) for (const n of FLEET_ADJ.get(k) ?? []) ns.add(n.split("/")[0])
        for (const n of ns) {
          if (!seen.has(n)) {
            seen.add(n)
            next.push(n)
          }
        }
      }
      frontier = next
    }
    return Infinity
  }
  // Fleets under the 2000 rule: only fleet moves.
  const start = locKey(unit.location)
  const seen = new Set([start])
  let frontier = [start]
  for (let d = 0; frontier.length; d++) {
    if (frontier.some((k) => targets.has(k.split("/")[0]))) return d
    const next: string[] = []
    for (const k of frontier) {
      for (const n of FLEET_ADJ.get(k) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  return Infinity
}

/** Units a power in civil disorder loses, in removal order (rulebook p.19). */
export function civilDisorderRemovals(
  power: Power,
  count: number,
  units: Unit[],
  owners: Ownership,
  rule: CivilDisorderRule,
): Unit[] {
  const targets = new Set<ProvinceId>(
    Object.values(PROVINCES)
      .filter((p) => (rule === "rulebook-2000" ? p.home === power : p.supplyCenter && owners.get(p.id) === power))
      .map((p) => p.id),
  )
  return units
    .filter((u) => u.power === power)
    .map((u) => ({ u, d: distance(u, targets, rule) }))
    .sort(
      (a, b) =>
        b.d - a.d ||
        (a.u.type === b.u.type ? 0 : a.u.type === "F" ? -1 : 1) ||
        PROVINCES[a.u.location.province].name.localeCompare(PROVINCES[b.u.location.province].name),
    )
    .slice(0, count)
    .map((x) => x.u)
}

export type AdjustmentResultReason =
  | "ok"
  | "not-home-center"
  | "not-owned"
  | "occupied"
  | "invalid-unit-location"
  | "too-many"
  | "no-such-unit"
  | "not-allowed"

export interface AdjustmentOutcome {
  power: Power
  order: AdjustmentOrder
  success: boolean
  reason: AdjustmentResultReason
}

export interface AdjustmentResult {
  units: Unit[]
  outcomes: AdjustmentOutcome[]
  /** Units removed because a power didn't order enough disbands. */
  civilDisorder: Unit[]
  built: Unit[]
  removed: Unit[]
}

/**
 * Resolve one Winter adjustment phase. Orders are applied one by one in the order
 * given, so surplus orders fail (DATC 4.D.4 / 4.D.6, choice b).
 * @param noBuild powers that never build (unplayed powers in civil disorder)
 */
export function adjudicateAdjustments(
  units: Unit[],
  owners: Ownership,
  orders: Map<Power, AdjustmentOrder[]>,
  opts: { rule?: CivilDisorderRule; noBuild?: ReadonlySet<Power> } = {},
): AdjustmentResult {
  const rule = opts.rule ?? "rulebook-2000"
  const powers = new Set<Power>([...units.map((u) => u.power), ...owners.values()])
  let board = [...units]
  const outcomes: AdjustmentOutcome[] = []
  const civil: Unit[] = []
  const built: Unit[] = []
  const removed: Unit[] = []

  for (const power of powers) {
    const delta = adjustmentDelta(power, owners, units)
    const list = orders.get(power) ?? []
    if (delta > 0) {
      let left = opts.noBuild?.has(power) ? 0 : delta
      for (const order of list) {
        if (order.kind !== "build") {
          outcomes.push({ power, order, success: order.kind === "waive", reason: order.kind === "waive" ? "ok" : "not-allowed" })
          if (order.kind === "waive" && left > 0) left--
          continue
        }
        const pr = PROVINCES[order.at.province]
        let reason: AdjustmentResultReason = "ok"
        if (left <= 0) reason = "too-many"
        else if (!pr || pr.home !== power) reason = "not-home-center"
        else if (owners.get(pr.id) !== power) reason = "not-owned"
        else if (board.some((u) => u.location.province === pr.id)) reason = "occupied"
        else if (!isValidUnitLocation(order.unitType, order.at)) reason = "invalid-unit-location"
        const success = reason === "ok"
        outcomes.push({ power, order, success, reason })
        if (success) {
          const unit: Unit = { power, type: order.unitType, location: order.at }
          board.push(unit)
          built.push(unit)
          left--
        }
      }
    } else if (delta < 0) {
      let need = -delta
      for (const order of list) {
        if (order.kind !== "remove") {
          outcomes.push({ power, order, success: false, reason: "not-allowed" })
          continue
        }
        const idx = board.findIndex((u) => u.location.province === order.unit && u.power === power)
        let reason: AdjustmentResultReason = "ok"
        if (need <= 0) reason = "too-many"
        else if (idx < 0) reason = "no-such-unit"
        const success = reason === "ok"
        outcomes.push({ power, order, success, reason })
        if (success) {
          removed.push(board[idx])
          board = board.filter((_, i) => i !== idx)
          need--
        }
      }
      if (need > 0) {
        const auto = civilDisorderRemovals(power, need, board, owners, rule)
        civil.push(...auto)
        removed.push(...auto)
        board = board.filter((u) => !auto.includes(u))
      }
    } else {
      for (const order of list) outcomes.push({ power, order, success: false, reason: "not-allowed" })
    }
  }
  return { units: board, outcomes, civilDisorder: civil, built, removed }
}

export function sameLocation(a: Location, b: Location): boolean {
  return locKey(a) === locKey(b)
}
