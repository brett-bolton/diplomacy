// Runs the DATC v3.0 fixtures against the engine.

import { describe, expect, it } from "vitest"
import { adjudicateMovement } from "../../adjudicate/movement"
import { adjudicateRetreats } from "../../adjudicate/retreat"
import { explainMovement } from "../../adjudicate/explain"
import { adjudicateAdjustments, type CivilDisorderRule } from "../../adjudicate/adjust"
import type { AdjustmentOrder } from "../../orders"
import { parseOwnership } from "./notation"
import type { RetreatOrder } from "../../orders"
import type { Power, ProvinceId, Unit } from "../../types"
import { locKey } from "../../types"
import { ALL_CASES } from "./cases"
import type { DatcCase } from "./format"
import { parseBlock, POWER_BY_NAME } from "./notation"
import { buildBoard, ordersFor } from "./harness"

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

  // Explanations must agree with the outcome they explain.
  for (const o of result.outcomes) {
    const m = o.move
    if (!m || o.illegal || (m.convoy && !m.convoy.pathOk) || o.paradox) continue
    const opp = m.opposition.kind === "defend" || m.opposition.occupied ? m.opposition.strength : 0
    const beatsAll = m.attack > opp && m.prevents.every((p) => m.attack > p.strength)
    expect(o.success, `strengths for ${o.unit.location.province} disagree with outcome`).toBe(beatsAll && !m.ownUnit)
  }
  const explained = explainMovement(result)
  expect(explained.size).toBe(result.outcomes.length)
  expect([...explained.values()].map((x) => `${x.notation}: ${x.verdict}. ${x.reasons.join(" ")}`)).toMatchSnapshot()

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

function adjustmentOrders(block: string | undefined): Map<Power, AdjustmentOrder[]> {
  const orders = new Map<Power, AdjustmentOrder[]>()
  for (const line of parseBlock(block)) {
    const list = orders.get(line.power) ?? []
    if (line.action === "build") list.push({ kind: "build", unitType: line.unitType!, at: line.at! })
    else if (line.action === "remove" || line.action === "disband") list.push({ kind: "remove", unit: line.at!.province })
    else if (line.action === "waive") list.push({ kind: "waive" })
    orders.set(line.power, list)
  }
  return orders
}

function runAdjustmentCase(c: DatcCase, rule: CivilDisorderRule) {
  const board = buildBoard({ ...c, orders: "" })
  const owners = parseOwnership(c.ownership)
  const result = adjudicateAdjustments(board, owners, adjustmentOrders(c.orders), { rule })
  const expected = rule === "rulebook-2000" ? (c.expect.finalRulebook2000 ?? c.expect.final) : c.expect.final
  for (const [name, list] of Object.entries(expected ?? {})) {
    const power = POWER_BY_NAME[name.toLowerCase()] as Power
    const got = result.units.filter((u) => u.power === power).map(unitStr).sort()
    expect(got, `${name} units at the end`).toEqual([...list].sort())
  }
}

describe("DATC v3.0", () => {
  for (const c of ALL_CASES) {
    const name = `${c.id} ${c.title}`
    if (c.skip) it.skip(`${name} (${c.skip})`, () => {})
    else if (c.phase === "adjustment") {
      it(`${name} (DATC / 2023 rule)`, () => runAdjustmentCase(c, "rulebook-2023"))
      it(`${name} (2008 rulebook)`, () => runAdjustmentCase(c, "rulebook-2000"))
    } else it(name, () => runCase(c))
  }
})
