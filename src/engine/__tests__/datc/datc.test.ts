// Runs the DATC v3.0 fixtures against the engine.

import { describe, expect, it } from "vitest"
import { adjudicateMovement } from "../../adjudicate/movement"
import { adjudicateRetreats } from "../../adjudicate/retreat"
import type { MovementOrder, RetreatOrder } from "../../orders"
import type { Power, ProvinceId, Unit } from "../../types"
import { locKey } from "../../types"
import { ALL_CASES } from "./cases"
import type { DatcCase } from "./format"
import { parseBlock, POWER_BY_NAME, type ParsedLine } from "./notation"

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

function retreatOrdersFor(dislodged: Unit[], block: string | undefined): Map<ProvinceId, RetreatOrder> {
  const orders = new Map<ProvinceId, RetreatOrder>()
  for (const line of parseBlock(block)) {
    if (!line.at) continue
    const unit = dislodged.find((u) => u.location.province === line.at!.province)
    if (!unit || unit.power !== line.power) continue
    if (line.action === "move") orders.set(unit.location.province, { kind: "retreat", unit: unit.location.province, to: line.to })
    else if (line.action === "disband") orders.set(unit.location.province, { kind: "disband", unit: unit.location.province })
    // Supports, convoys and holds are not retreat orders: the unit gets no valid order.
  }
  return orders
}

function unitStr(u: Unit): string {
  return `${u.type} ${locKey(u.location)}`
}

function runCase(c: DatcCase) {
  const board = buildBoard(c)
  const result = adjudicateMovement(board, ordersFor(board, c.orders))
  const byProv = new Map(result.outcomes.map((o) => [o.unit.location.province, o]))
  const e = c.expect

  for (const p of e.succeeds ?? []) {
    expect(byProv.get(p), `no unit at ${p}`).toBeDefined()
    expect(byProv.get(p)!.success, `${p} should succeed`).toBe(true)
  }
  for (const p of e.fails ?? []) {
    expect(byProv.get(p), `no unit at ${p}`).toBeDefined()
    expect(byProv.get(p)!.success, `${p} should fail`).toBe(false)
  }
  const dislodged = result.outcomes.filter((o) => o.dislodgedBy).map((o) => o.unit.location.province).sort()
  if (e.dislodged) expect(dislodged, "dislodged units").toEqual(expect.arrayContaining([...e.dislodged].sort()))
  if (e.dislodged) expect(dislodged.length, `dislodged: got ${dislodged.join(",")}`).toBe(e.dislodged.length)
  for (const p of e.notDislodged ?? []) expect(dislodged, `${p} should not be dislodged`).not.toContain(p)

  if (e.final) {
    const retreats = retreatOrdersFor(
      result.dislodged.map((d) => d.unit),
      c.retreats,
    )
    const after = adjudicateRetreats(result.units, result.dislodged, retreats).units
    for (const [name, list] of Object.entries(e.final)) {
      const power = POWER_BY_NAME[name.toLowerCase()] as Power
      const got = after.filter((u) => u.power === power).map(unitStr).sort()
      expect(got, `${name} units at the end`).toEqual([...list].sort())
    }
  }
}

describe("DATC v3.0", () => {
  for (const c of ALL_CASES) {
    const name = `${c.id} ${c.title}`
    if (c.skip) it.skip(`${name} (${c.skip})`, () => {})
    else if (c.phase === "adjustment") it.todo(`${name} (adjustment phase)`)
    else it(name, () => runCase(c))
  }
})
