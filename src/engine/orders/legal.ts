// Legal-order generator. Drives the phone pickers (players only ever choose from
// these lists) and validates every order the server receives.

import { minimalConvoyRoutes, seaChain } from "../convoy"
import { ARMY_ADJ, PROVINCES, canReach, isSea, neighbors } from "../map/standard"
import type { MovementOrder } from "../orders"
import type { Location, Power, ProvinceId, Unit } from "../types"
import { locKey } from "../types"

export interface LegalOptions {
  /** Provinces no unit may enter (2-player game: Italy in 1914). */
  closed?: ReadonlySet<ProvinceId>
}

export interface MoveOption {
  to: Location
  /** Army move that can only happen by convoy. */
  convoyOnly?: boolean
  /** Army move to an adjacent province that could also go by convoy ("via convoy" offered). */
  convoyPossible?: boolean
}

export interface UnitOrderOptions {
  unit: Unit
  moves: MoveOption[]
  /** Units (by province) this unit can support to hold. */
  supportHolds: ProvinceId[]
  /** Moves this unit can support: unit in `from` moving to `to`. */
  supportMoves: { from: ProvinceId; to: ProvinceId }[]
  /** Convoys this fleet can perform (empty unless it's a fleet in a sea space). */
  convoys: { from: ProvinceId; to: ProvinceId }[]
}

function fleetSeas(units: Unit[]): Set<ProvinceId> {
  return new Set(units.filter((u) => u.type === "F" && isSea(u.location.province)).map((u) => u.location.province))
}

/** Every province (as Locations) a unit could be ordered to move to. */
function moveOptions(unit: Unit, units: Unit[], seas: Set<ProvinceId>, closed?: ReadonlySet<ProvinceId>): MoveOption[] {
  const out: MoveOption[] = []
  const here = unit.location.province
  for (const loc of neighbors(unit.type, unit.location)) {
    if (closed?.has(loc.province)) continue
    out.push({ to: loc })
  }
  if (unit.type === "A" && PROVINCES[here].kind === "coastal") {
    for (const p of Object.values(PROVINCES)) {
      if (p.kind !== "coastal" || p.id === here || closed?.has(p.id)) continue
      if (!seaChain(here, p.id, seas)) continue
      const adjacent = ARMY_ADJ.get(here)?.has(p.id)
      if (adjacent) {
        const opt = out.find((o) => o.to.province === p.id)
        if (opt) opt.convoyPossible = true
      } else {
        out.push({ to: { province: p.id }, convoyOnly: true })
      }
    }
  }
  return out
}

export function legalOrderOptions(units: Unit[], unitProvince: ProvinceId, opts: LegalOptions = {}): UnitOrderOptions {
  const unit = units.find((u) => u.location.province === unitProvince)
  if (!unit) throw new Error(`No unit in ${unitProvince}`)
  const seas = fleetSeas(units)
  const closed = opts.closed
  const here = unit.location.province

  const moves = moveOptions(unit, units, seas, closed)

  const supportHolds: ProvinceId[] = []
  const supportMoves: { from: ProvinceId; to: ProvinceId }[] = []
  for (const other of units) {
    const there = other.location.province
    if (there === here) continue
    if (canReach(unit.type, unit.location, there) && !closed?.has(there)) supportHolds.push(there)
    const targets = new Set(moveOptions(other, units, seas, closed).map((m) => m.to.province))
    for (const to of targets) {
      if (to === here || !canReach(unit.type, unit.location, to)) continue
      // A fleet can't support an army whose only convoy route needs that very fleet.
      if (other.type === "A" && unit.type === "F" && isSea(here) && !ARMY_ADJ.get(there)?.has(to)) {
        const without = new Set([...seas].filter((s) => s !== here))
        if (!seaChain(there, to, without)) continue
      }
      supportMoves.push({ from: there, to })
    }
  }

  const convoys: { from: ProvinceId; to: ProvinceId }[] = []
  if (unit.type === "F" && isSea(here)) {
    for (const army of units) {
      if (army.type !== "A" || PROVINCES[army.location.province].kind !== "coastal") continue
      for (const p of Object.values(PROVINCES)) {
        if (p.kind !== "coastal" || p.id === army.location.province || closed?.has(p.id)) continue
        if (minimalConvoyRoutes(army.location.province, p.id, seas).some((r) => r.includes(here))) {
          convoys.push({ from: army.location.province, to: p.id })
        }
      }
    }
  }

  return { unit, moves, supportHolds, supportMoves, convoys }
}

export type ValidationResult = { ok: true } | { ok: false; reason: string }

/** Validate one movement order a power submitted for one of its units. */
export function validateMovementOrder(units: Unit[], power: Power, order: MovementOrder, opts: LegalOptions = {}): ValidationResult {
  const unit = units.find((u) => u.location.province === order.unit)
  if (!unit) return { ok: false, reason: "There's no unit in that province." }
  if (unit.power !== power) return { ok: false, reason: "That unit belongs to another power." }
  const o = legalOrderOptions(units, order.unit, opts)
  switch (order.kind) {
    case "hold":
      return { ok: true }
    case "move": {
      const m = o.moves.find((x) => locKey(x.to) === locKey(order.to))
      if (!m) {
        const sameProvince = o.moves.some((x) => x.to.province === order.to.province)
        return { ok: false, reason: sameProvince ? "Choose which coast to move to." : "That unit can't reach that province." }
      }
      if (order.viaConvoy && !m.convoyOnly && !m.convoyPossible) return { ok: false, reason: "No convoy is possible for that move." }
      return { ok: true }
    }
    case "support-hold":
      return o.supportHolds.includes(order.target) ? { ok: true } : { ok: false, reason: "That unit can't support that province." }
    case "support-move":
      return o.supportMoves.some((s) => s.from === order.from && s.to === order.to)
        ? { ok: true }
        : { ok: false, reason: "That support isn't possible." }
    case "convoy":
      return o.convoys.some((c) => c.from === order.from && c.to === order.to)
        ? { ok: true }
        : { ok: false, reason: "That convoy isn't possible." }
  }
}
