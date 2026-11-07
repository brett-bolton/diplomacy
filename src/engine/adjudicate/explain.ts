// Turns structured movement outcomes into plain-English explanations.

import { POWER_NAMES, locLabel, province } from "../map/standard"
import type { MovementOrder } from "../orders"
import type { ProvinceId, Unit } from "../types"
import type { IllegalReason, MovementResult, UnitOutcome } from "./movement"

export interface Explanation {
  /** Order in standard notation, e.g. "A Par - Bur". */
  notation: string
  /** One-line result, e.g. "Succeeds", "Bounced", "Support cut". */
  verdict: string
  success: boolean
  /** Sentences explaining why. */
  reasons: string[]
}

const abbr = (p: ProvinceId) => province(p).abbr

function unitLabel(u: Unit): string {
  return `${u.type} ${locLabel(u.location)}`
}

export function notation(unit: Unit, order: MovementOrder, unitAt: (p: ProvinceId) => Unit | undefined): string {
  const me = unitLabel(unit)
  const other = (p: ProvinceId) => {
    const u = unitAt(p)
    return u ? unitLabel(u) : abbr(p)
  }
  switch (order.kind) {
    case "hold":
      return `${me} H`
    case "move":
      return `${me} - ${locLabel(order.to)}${order.viaConvoy && unit.type === "A" ? " via convoy" : ""}`
    case "support-hold":
      return `${me} S ${other(order.target)}`
    case "support-move":
      return `${me} S ${other(order.from)} - ${abbr(order.to)}`
    case "convoy":
      return `${me} C ${other(order.from)} - ${abbr(order.to)}`
  }
}

const ILLEGAL_TEXT: Record<IllegalReason, string> = {
  "unit-cannot-reach": "the unit can't reach that province",
  "same-province": "a unit can't move to the province it's already in",
  "army-to-sea": "armies can't enter sea spaces",
  "fleet-to-inland": "fleets can't enter inland provinces",
  "coast-not-specified": "the destination has two coasts and none was chosen",
  "coast-not-reachable": "that coast can't be reached from here",
  "no-convoy-route": "there's no possible convoy route",
  "no-unit-at-target": "there's no unit there to support or convoy",
  "support-self": "a unit can't support itself or a move into its own province",
  "convoy-not-at-sea": "only fleets in sea spaces can convoy",
  "convoy-non-army": "only armies can be convoyed",
  "fleet-cannot-be-convoyed": "fleets can't be convoyed",
  "convoy-not-possible": "this fleet can't be part of a convoy between those provinces",
  "support-needed-for-convoy": "the only convoy route for that army runs through this fleet, and a fleet can't support and convoy at once",
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

export function explainMovement(result: MovementResult): Map<ProvinceId, Explanation> {
  const startUnits = new Map(result.outcomes.map((o) => [o.unit.location.province, o.unit]))
  const unitAt = (p: ProvinceId) => startUnits.get(p)
  const label = (p: ProvinceId) => {
    const u = unitAt(p)
    return u ? unitLabel(u) : abbr(p)
  }
  const out = new Map<ProvinceId, Explanation>()

  for (const o of result.outcomes) {
    const here = o.unit.location.province
    const reasons: string[] = []
    let verdict = o.success ? "Succeeds" : "Fails"
    const note = notation(o.unit, o.order, unitAt)

    if (o.illegal) {
      verdict = "Illegal — treated as a hold"
      const why = o.illegal === "same-province" && o.order.kind !== "move" ? "the supported unit would be moving to the province it's already in" : ILLEGAL_TEXT[o.illegal]
      reasons.push(`This order can't be carried out: ${why}. The unit holds instead.`)
    } else if (o.order.kind === "move" && o.move) {
      const m = o.move
      const dest = o.order.to.province
      const counted = m.supports.filter((s) => s.counted)
      const supportText = counted.length ? ` (${unitLabel(o.unit)} + support from ${counted.map((s) => label(s.from)).join(", ")})` : ""
      if (m.convoy && !m.convoy.pathOk) {
        verdict = "Fails — convoy disrupted"
        reasons.push(`The army needed a convoy, and no convoy route made it through${m.convoy.fleets.length ? ` (fleets: ${m.convoy.fleets.map(abbr).join(", ")})` : ""}. It stays in ${abbr(here)}.`)
      } else {
        if (m.convoy) reasons.push(`Convoyed via ${m.convoy.fleets.map(abbr).join(" → ")}.`)
        reasons.push(`Attack strength ${m.attack}${supportText}.`)
        const opp = m.opposition
        if (m.ownUnit) {
          reasons.push(`${abbr(dest)} holds a unit of the same power, which can't be dislodged by its own side.`)
        } else if (opp.kind === "defend") {
          reasons.push(`Head-to-head battle with ${label(dest)} moving the other way, which defends with strength ${opp.strength}.`)
        } else if (opp.occupied && !opp.unitMovedAway) {
          reasons.push(`${label(dest)} holds with strength ${opp.strength}.`)
        } else if (opp.occupied && opp.unitMovedAway) {
          reasons.push(`${label(dest)} moved out, so ${abbr(dest)} was open.`)
        }
        for (const p of m.prevents) {
          reasons.push(`${label(p.from)} also tried to enter ${abbr(dest)} with strength ${p.strength}.`)
        }
        for (const s of m.supports) {
          if (s.status === "cut") reasons.push(`Support from ${label(s.from)} was cut by an attack from ${abbr(s.cutBy!)}.`)
          else if (s.status === "dislodged") reasons.push(`Support from ${label(s.from)} didn't count: that unit was dislodged.`)
          else if (s.notCountedReason === "own-unit-target") reasons.push(`Support from ${label(s.from)} doesn't count: a power can't help dislodge its own unit.`)
        }
        const contested = opp.kind === "defend" || (opp.occupied && !opp.unitMovedAway)
        const def = opp.kind === "defend" ? "defend" : "hold"
        if (o.success) {
          verdict = "Succeeds"
          if (contested) reasons.push(`${m.attack} beats ${def} strength ${opp.strength}${m.prevents.length ? " and every rival move" : ""}.`)
          else if (m.prevents.length) reasons.push(`${m.attack} beats every rival move into ${abbr(dest)}.`)
          if (opp.kind === "hold" && opp.occupied && !opp.unitMovedAway) reasons.push(`${label(dest)} is dislodged.`)
        } else if (m.ownUnit) {
          verdict = "Fails — own unit in the way"
        } else {
          const lostToOpp = contested && m.attack <= opp.strength
          const rivals = m.prevents.filter((p) => p.strength >= m.attack)
          if (lostToOpp) {
            verdict = opp.kind === "defend" ? "Fails — lost the head-to-head" : "Fails — not strong enough"
            reasons.push(`${plural(m.attack, "point")} of attack isn't more than the ${def} strength of ${opp.strength}.`)
          } else {
            verdict = rivals.some((r) => r.strength === m.attack) ? "Bounced" : "Fails — beaten by a stronger move"
            reasons.push(`${plural(m.attack, "point")} of attack isn't more than the rival's ${rivals[0]?.strength ?? 0}, so the move bounces.`)
          }
        }
      }
    } else if (o.order.kind === "support-hold" || o.order.kind === "support-move") {
      const s = o.support!
      if (s.status === "given") {
        verdict = "Support given"
        reasons.push("The support was not cut and counts.")
        for (const p of o.rulebookExempt ?? []) {
          reasons.push(`${label(p)} attacked by convoy, but under the rulebook a convoyed army doesn't cut support for an attack on a fleet it needs for its own convoy.`)
        }
      } else if (s.status === "cut") {
        verdict = "Support cut"
        reasons.push(`${label(s.by)} attacked ${abbr(here)}, cutting the support.`)
      } else if (s.status === "dislodged") {
        verdict = "Support cut — dislodged"
        reasons.push(`The supporting unit was dislodged by ${label(s.by)}.`)
      } else if (s.status === "void") {
        verdict = "No effect"
        reasons.push(
          o.order.kind === "support-hold"
            ? `${label(o.order.target)} was ordered to move, so it couldn't receive hold support.`
            : `${label(o.order.from)} wasn't ordered to move to ${abbr(o.order.to)}, so the support didn't apply.`,
        )
      }
    } else if (o.order.kind === "convoy") {
      if (o.void) {
        verdict = "No effect"
        reasons.push(`${label(o.order.from)} wasn't ordered to move to ${abbr(o.order.to)} by convoy.`)
      } else if (o.paradox === "szykman") {
        verdict = "Convoy fails — paradox"
        reasons.push("This convoy was part of a convoy paradox. Under the Szykman rule, the convoying fleet holds and the convoy fails.")
      } else if (o.success) {
        verdict = "Convoyed"
        reasons.push("The fleet wasn't dislodged, so the convoy went through.")
      } else {
        verdict = "Convoy disrupted"
        reasons.push("The fleet was dislodged, so it couldn't convoy.")
      }
    } else {
      verdict = "Holds"
      if (o.holdStrength && o.holdStrength > 1) {
        const given = (o.holdSupports ?? []).filter((s) => s.counted).map((s) => label(s.from))
        reasons.push(`Hold strength ${o.holdStrength} (with support from ${given.join(", ")}).`)
      }
    }

    if (o.paradox === "circular-movement") reasons.push("Part of a circular movement: all units in the circle move.")
    if (o.dislodgedBy) {
      reasons.push(`Dislodged by ${label(o.dislodgedBy.from)}${o.dislodgedBy.viaConvoy ? " (convoyed)" : ""}.`)
      if (o.success && o.order.kind !== "move") verdict += " — but dislodged"
      else if (!o.success && o.order.kind !== "hold") verdict += " — and dislodged"
      else if (o.order.kind === "hold") verdict = "Dislodged"
    }
    out.set(here, { notation: note, verdict, success: o.success, reasons })
  }
  return out
}

export function powerName(u: Unit): string {
  return POWER_NAMES[u.power]
}

export type { UnitOutcome }
