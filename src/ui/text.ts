// Human-readable order text for drafts, reviews and history.

import { POWER_NAMES, PROVINCES, locLabel } from "@/engine/map/standard"
import type { AdjustmentOrder, MovementOrder, RetreatOrder } from "@/engine/orders"
import type { Coast, Location, Power, ProvinceId, Unit } from "@/engine/types"

export type AnyOrder = MovementOrder | RetreatOrder | AdjustmentOrder

const COAST_NAMES: Record<Coast, string> = { nc: "north coast", sc: "south coast", ec: "east coast" }

export function placeName(loc: Location | ProvinceId): string {
  const l = typeof loc === "string" ? { province: loc } : loc
  const name = PROVINCES[l.province]?.name ?? l.province
  return l.coast ? `${name} (${COAST_NAMES[l.coast]})` : name
}

export const abbr = (p: ProvinceId) => PROVINCES[p]?.abbr ?? p

export function unitLabel(u: Unit): string {
  return `${u.type} ${locLabel(u.location)}`
}

export function unitName(u: Unit): string {
  return `${u.type === "A" ? "Army" : "Fleet"} in ${placeName(u.location)}`
}

export const powerName = (p: Power) => POWER_NAMES[p]

const unitAt = (units: Unit[], p: ProvinceId) => units.find((u) => u.location.province === p)

/** Standard notation, e.g. "A Par - Bur", "F Nth C A Lon - Bel". */
export function orderNotation(order: AnyOrder, units: Unit[]): string {
  if (order.kind === "waive") return "Waive build"
  if (order.kind === "build") return `Build ${order.unitType} ${locLabel(order.at)}`
  const me = unitAt(units, order.unit)
  const self = me ? unitLabel(me) : abbr(order.unit)
  const other = (p: ProvinceId) => {
    const u = unitAt(units, p)
    return u ? unitLabel(u) : abbr(p)
  }
  switch (order.kind) {
    case "hold":
      return `${self} H`
    case "move":
      return `${self} - ${locLabel(order.to)}${order.viaConvoy ? " via convoy" : ""}`
    case "support-hold":
      return `${self} S ${other(order.target)}`
    case "support-move":
      return `${self} S ${other(order.from)} - ${abbr(order.to)}`
    case "convoy":
      return `${self} C ${other(order.from)} - ${abbr(order.to)}`
    case "retreat":
      return `${self} R ${locLabel(order.to)}`
    case "disband":
    case "remove":
      return `Disband ${self}`
  }
}

/** Plain English, e.g. "Move to Burgundy". */
export function orderPlain(order: AnyOrder, units: Unit[]): string {
  const other = (p: ProvinceId) => {
    const u = unitAt(units, p)
    return u ? `${u.type === "A" ? "army" : "fleet"} in ${placeName(p)}` : placeName(p)
  }
  switch (order.kind) {
    case "hold":
      return "Hold"
    case "move":
      return `Move to ${placeName(order.to)}${order.viaConvoy ? " by convoy" : ""}`
    case "support-hold":
      return `Support the ${other(order.target)} to hold`
    case "support-move":
      return `Support the ${other(order.from)} into ${placeName(order.to)}`
    case "convoy":
      return `Convoy the ${other(order.from)} to ${placeName(order.to)}`
    case "retreat":
      return `Retreat to ${placeName(order.to)}`
    case "disband":
    case "remove":
      return "Disband"
    case "build":
      return `Build ${order.unitType === "A" ? "an army" : "a fleet"} in ${placeName(order.at)}`
    case "waive":
      return "Waive a build"
  }
}

export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2)
}
