// Physical moves checklist: what to change on the real board after a phase,
// in an order that never puts two pieces in one space.

import { POWER_NAMES, locLabel, province } from "./map/standard"
import type { PhaseRecord } from "./phase"
import type { Location, Power, ProvinceId, UnitType } from "./types"

export type ChecklistStep =
  | { kind: "set-aside"; text: string; at: ProvinceId }
  | { kind: "lift"; text: string; at: ProvinceId }
  | { kind: "move"; text: string; from: ProvinceId; to: Location }
  | { kind: "place"; text: string; from: ProvinceId; to: Location }
  | { kind: "retreat"; text: string; from: ProvinceId; to: Location }
  | { kind: "remove"; text: string; at: ProvinceId; aside: boolean }
  | { kind: "build"; text: string; power: Power; unitType: UnitType; at: Location }
  | { kind: "marker"; text: string; province: ProvinceId; power: Power }

const ADJ: Record<Power, string> = {
  AUS: "Austrian",
  ENG: "English",
  FRA: "French",
  GER: "German",
  ITA: "Italian",
  RUS: "Russian",
  TUR: "Turkish",
}

const abbr = (p: ProvinceId) => province(p).abbr

export function checklist(record: PhaseRecord): ChecklistStep[] {
  const steps: ChecklistStep[] = []
  const unitText = (type: UnitType, at: Location) => `${type} ${locLabel(at)}`

  if (record.movement) {
    const res = record.movement
    for (const d of res.dislodged) {
      steps.push({
        kind: "set-aside",
        at: d.unit.location.province,
        text: `Dislodged: set ${POWER_NAMES[d.unit.power]}'s ${unitText(d.unit.type, d.unit.location)} beside ${abbr(d.unit.location.province)} until retreats`,
      })
    }
    // Successful moves, ordered so a space is empty before a piece enters it.
    const moves = res.outcomes
      .filter((o) => o.order.kind === "move" && o.success)
      .map((o) => ({ unit: o.unit, from: o.unit.location.province, to: (o.order as { to: Location }).to }))
    const movingFrom = new Map(moves.map((m) => [m.from, m]))
    const done = new Set<ProvinceId>()
    const visiting = new Set<ProvinceId>()
    const lifted = new Set<ProvinceId>()
    const emit = (m: (typeof moves)[number]) => {
      if (done.has(m.from)) return
      if (visiting.has(m.from)) {
        // Cycle (swap or circular movement): lift this piece and place it at the end.
        lifted.add(m.from)
        steps.push({ kind: "lift", at: m.from, text: `Pick up ${unitText(m.unit.type, m.unit.location)} (it's part of a swap)` })
        return
      }
      visiting.add(m.from)
      const blocker = movingFrom.get(m.to.province)
      if (blocker) emit(blocker)
      visiting.delete(m.from)
      if (done.has(m.from)) return
      done.add(m.from)
      const loc = m.unit.type === "F" ? m.to : { province: m.to.province }
      if (lifted.has(m.from)) {
        steps.push({ kind: "place", from: m.from, to: loc, text: `Place ${m.unit.type} (from ${abbr(m.from)}) in ${locLabel(loc)}` })
      } else {
        steps.push({ kind: "move", from: m.from, to: loc, text: `Move ${unitText(m.unit.type, m.unit.location)} → ${locLabel(loc)}` })
      }
    }
    // Pieces whose own move started a cycle are placed last.
    for (const m of moves) emit(m)
    const placeSteps = steps.filter((s) => s.kind === "place")
    const rest = steps.filter((s) => s.kind !== "place")
    steps.length = 0
    steps.push(...rest, ...placeSteps)
  }

  for (const r of record.retreats ?? []) {
    if (r.result.kind === "retreated") {
      steps.push({ kind: "retreat", from: r.unit.location.province, to: r.result.to, text: `Retreat ${unitText(r.unit.type, r.unit.location)} → ${locLabel(r.result.to)}` })
    } else {
      steps.push({ kind: "remove", at: r.unit.location.province, aside: true, text: `Remove ${POWER_NAMES[r.unit.power]}'s ${unitText(r.unit.type, r.unit.location)} (disbanded)` })
    }
  }

  if (record.adjustments) {
    for (const u of record.adjustments.removed) {
      const civil = record.adjustments.civilDisorder.includes(u)
      steps.push({ kind: "remove", at: u.location.province, aside: false, text: `Remove ${POWER_NAMES[u.power]}'s ${unitText(u.type, u.location)}${civil ? " (removed by the civil-disorder rule)" : ""}` })
    }
    for (const u of record.adjustments.built) {
      steps.push({ kind: "build", power: u.power, unitType: u.type, at: u.location, text: `Place a new ${ADJ[u.power]} ${u.type === "A" ? "army" : "fleet"} in ${locLabel(u.location)}` })
    }
  }

  for (const c of record.captured ?? []) {
    steps.push({ kind: "marker", province: c.province, power: c.to, text: `Place a ${ADJ[c.to]} marker on ${abbr(c.province)}` })
  }
  return steps
}
