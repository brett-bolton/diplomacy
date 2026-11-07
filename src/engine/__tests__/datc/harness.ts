// Shared helpers for running DATC fixtures.

import type { MovementOrder } from "../../orders"
import type { ProvinceId, Unit } from "../../types"
import type { DatcCase } from "./format"
import { parseBlock, type ParsedLine } from "./notation"

export function buildBoard(c: DatcCase): Unit[] {
  const units: Unit[] = []
  const taken = new Set<ProvinceId>()
  for (const line of [...parseBlock(c.units), ...parseBlock(c.orders)]) {
    if (!line.at || !line.unitType || line.action === "build" || line.action === "waive") continue
    if (taken.has(line.at.province)) continue
    taken.add(line.at.province)
    units.push({ power: line.power, type: line.unitType, location: line.at })
  }
  return units
}

function toMovementOrder(line: ParsedLine): MovementOrder | null {
  const unit = line.at!.province
  switch (line.action) {
    case "hold":
      return { kind: "hold", unit }
    case "move":
      return { kind: "move", unit, to: line.to, viaConvoy: line.viaConvoy }
    case "support-hold":
      return { kind: "support-hold", unit, target: line.target.province }
    case "support-move":
      return { kind: "support-move", unit, from: line.from.province, to: line.to.province, toCoast: line.to.coast }
    case "convoy":
      return { kind: "convoy", unit, from: line.from.province, to: line.to.province }
    default:
      return null
  }
}

/** Orders a power gave to its own units. Orders to other powers' units are ignored. */
export function ordersFor(board: Unit[], block: string | undefined): Map<ProvinceId, MovementOrder> {
  const orders = new Map<ProvinceId, MovementOrder>()
  for (const line of parseBlock(block)) {
    if (!line.at) continue
    const unit = board.find((u) => u.location.province === line.at!.province)
    if (!unit || unit.power !== line.power) continue
    const o = toMovementOrder(line)
    if (o) orders.set(unit.location.province, o)
  }
  return orders
}

