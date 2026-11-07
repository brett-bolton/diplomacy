// Retreat-phase adjudication.

import { reachableCoasts } from "../map/standard"
import type { RetreatOrder } from "../orders"
import type { Location, ProvinceId, Unit } from "../types"
import type { DislodgedUnit } from "./movement"

export type RetreatResult =
  | { kind: "retreated"; to: Location }
  | { kind: "disbanded"; reason: "ordered" | "no-order" | "illegal" | "no-options" | "bounced" }

export interface RetreatOutcome {
  unit: Unit
  order?: RetreatOrder
  result: RetreatResult
}

/** Resolve a retreat order's destination against the unit's options, or null if it isn't allowed. */
export function matchRetreat(d: DislodgedUnit, to: Location): Location | null {
  const sameProvince = d.retreatOptions.filter((o) => o.province === to.province)
  if (sameProvince.length === 0) return null
  if (d.unit.type === "A") return { province: to.province }
  if (to.coast) return sameProvince.find((o) => o.coast === to.coast) ?? null
  if (sameProvince.length === 1) return sameProvince[0]
  // Two coasts possible and none named.
  const coasts = reachableCoasts(d.unit.location, to.province)
  return coasts.length === 1 ? sameProvince.find((o) => o.coast === coasts[0]) ?? null : null
}

/**
 * @param board units left on the board after movement (not dislodged)
 * @param dislodged dislodged units with their retreat options
 * @param orders retreat orders keyed by the dislodged unit's province
 */
export function adjudicateRetreats(
  board: Unit[],
  dislodged: DislodgedUnit[],
  orders: Map<ProvinceId, RetreatOrder>,
): { units: Unit[]; outcomes: RetreatOutcome[] } {
  const wanted = new Map<number, Location>()
  const outcomes: RetreatOutcome[] = dislodged.map((d, i) => {
    const order = orders.get(d.unit.location.province)
    if (!order) {
      return { unit: d.unit, result: { kind: "disbanded", reason: d.retreatOptions.length ? "no-order" : "no-options" } }
    }
    if (order.kind === "disband") return { unit: d.unit, order, result: { kind: "disbanded", reason: "ordered" } }
    const to = matchRetreat(d, order.to)
    if (!to) return { unit: d.unit, order, result: { kind: "disbanded", reason: "illegal" } }
    wanted.set(i, to)
    return { unit: d.unit, order, result: { kind: "retreated", to } }
  })

  // Two or more units retreating to the same province are all disbanded.
  const counts = new Map<ProvinceId, number>()
  for (const to of wanted.values()) counts.set(to.province, (counts.get(to.province) ?? 0) + 1)
  const units = [...board]
  for (const [i, to] of wanted) {
    if (counts.get(to.province)! > 1) {
      outcomes[i] = { ...outcomes[i], result: { kind: "disbanded", reason: "bounced" } }
    } else {
      units.push({ ...dislodged[i].unit, location: to })
    }
  }
  return { units, outcomes }
}
