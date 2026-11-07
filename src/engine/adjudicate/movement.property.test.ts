// Property tests: random legal positions and random legal orders.

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { POWERS, type Power, type ProvinceId, type Unit } from "../types"
import { PROVINCES, PROVINCE_IDS } from "../map/standard"
import type { MovementOrder } from "../orders"
import { legalOrderOptions } from "../orders/legal"
import { adjudicateMovement } from "./movement"

const RUNS = Number(process.env.PROPERTY_RUNS ?? 300)

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

function randomBoard(r: () => number): Unit[] {
  const n = 4 + Math.floor(r() * 30)
  const ids = [...PROVINCE_IDS].sort(() => r() - 0.5).slice(0, n)
  return ids.map((id) => {
    const p = PROVINCES[id]
    const power = POWERS[Math.floor(r() * POWERS.length)] as Power
    const type = p.kind === "sea" ? "F" : p.kind === "inland" ? "A" : r() < 0.5 ? "A" : "F"
    const coast = type === "F" && p.coasts ? p.coasts[Math.floor(r() * p.coasts.length)] : undefined
    return { power, type, location: coast ? { province: id, coast } : { province: id } }
  })
}

function pick<T>(r: () => number, xs: T[]): T | undefined {
  return xs.length ? xs[Math.floor(r() * xs.length)] : undefined
}

function randomOrders(r: () => number, units: Unit[]): Map<ProvinceId, MovementOrder> {
  const orders = new Map<ProvinceId, MovementOrder>()
  const order = [...units].sort(() => r() - 0.5)
  // First pass: moves and holds; second pass: supports and convoys that tend to match.
  for (const unit of order) {
    const here = unit.location.province
    const o = legalOrderOptions(units, here)
    if (r() < 0.55) {
      const m = pick(r, o.moves)
      if (m) orders.set(here, { kind: "move", unit: here, to: m.to, viaConvoy: m.convoyPossible && r() < 0.3 })
    }
  }
  for (const unit of order) {
    const here = unit.location.province
    if (orders.has(here)) continue
    const o = legalOrderOptions(units, here)
    const roll = r()
    if (roll < 0.4) {
      const matching = o.supportMoves.filter((s) => {
        const t = orders.get(s.from)
        return t?.kind === "move" && t.to.province === s.to
      })
      const s = pick(r, matching.length && r() < 0.8 ? matching : o.supportMoves)
      if (s) orders.set(here, { kind: "support-move", unit: here, from: s.from, to: s.to })
    } else if (roll < 0.6) {
      const t = pick(r, o.supportHolds)
      if (t) orders.set(here, { kind: "support-hold", unit: here, target: t })
    } else if (roll < 0.8 && o.convoys.length) {
      const matching = o.convoys.filter((c) => {
        const t = orders.get(c.from)
        return t?.kind === "move" && t.to.province === c.to
      })
      const c = pick(r, matching.length ? matching : o.convoys)!
      orders.set(here, { kind: "convoy", unit: here, from: c.from, to: c.to })
    }
  }
  return orders
}

const outcomeKey = (res: ReturnType<typeof adjudicateMovement>) =>
  res.outcomes
    .map((o) => `${o.unit.location.province}:${o.success}:${o.dislodgedBy?.from ?? "-"}`)
    .sort()
    .join("|")

describe("movement adjudicator properties", () => {
  it("holds for random legal positions and orders", () => {
    let slowest = 0
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const r = rng(seed)
        const units = randomBoard(r)
        const orders = randomOrders(r, units)
        const t0 = performance.now()
        const res = adjudicateMovement(units, orders)
        slowest = Math.max(slowest, performance.now() - t0)

        // No two units share a province afterwards.
        const provs = res.units.map((u) => u.location.province)
        expect(new Set(provs).size).toBe(provs.length)

        for (const o of res.outcomes) {
          const here = o.unit.location.province
          const moved = o.order.kind === "move" && o.success
          const entered = res.outcomes.some(
            (x) => x.order.kind === "move" && x.success && x.order.to.province === here,
          )
          // Dislodged exactly when a move into the province succeeded and the unit stayed.
          expect(!!o.dislodgedBy).toBe(!moved && entered)
          if (o.dislodgedBy) {
            const attacker = res.outcomes.find((x) => x.unit.location.province === o.dislodgedBy!.from)!
            // Never dislodged by its own power.
            expect(attacker.unit.power).not.toBe(o.unit.power)
          }
        }

        // Retreat options never include occupied or contested provinces.
        for (const d of res.dislodged) {
          for (const loc of d.retreatOptions) {
            expect(provs).not.toContain(loc.province)
            expect(res.contested).not.toContain(loc.province)
            if (!d.attackerViaConvoy) expect(loc.province).not.toBe(d.attackerFrom)
          }
        }

        // Shuffling the board doesn't change anything.
        const shuffled = [...units].reverse()
        expect(outcomeKey(adjudicateMovement(shuffled, orders))).toBe(outcomeKey(res))
      }),
      { numRuns: RUNS },
    )
    expect(slowest).toBeLessThan(50)
  }, 600_000)

  it("changes nothing when every unit holds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const units = randomBoard(rng(seed))
        const res = adjudicateMovement(units, new Map())
        expect(res.dislodged).toEqual([])
        expect(res.units).toEqual(units)
      }),
      { numRuns: 200 },
    )
  })
})
