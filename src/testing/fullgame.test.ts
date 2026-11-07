import { describe, expect, it } from "vitest"
import { supplyCenterCounts } from "@/engine/adjudicate/adjust"
import { SUPPLY_CENTERS } from "@/engine/map/standard"
import type { GameState } from "@/engine/phase"
import { POWERS, type Power } from "@/engine/types"
import { FULL_GAME, playOut } from "./bot"

describe("a whole game played by bots", () => {
  it("runs from Spring 1901 to an 18-center victory, keeping the board legal", () => {
    let retreats = 0
    let builds = 0
    let disbands = 0
    const { state, labels } = playOut(FULL_GAME.conqueror, FULL_GAME.seed, (before, after) => {
      // One unit per province, ever.
      const provinces = after.units.map((u) => u.location.province)
      expect(new Set(provinces).size).toBe(provinces.length)
      // Every center has at most one owner; nobody owns more than exist.
      expect(Object.keys(after.owners).every((p) => SUPPLY_CENTERS.includes(p))).toBe(true)
      if (before.phase === "retreat") retreats++
      if (before.phase === "adjustment") {
        // After Winter nobody has more units than centers.
        const counts = supplyCenterCounts(new Map(Object.entries(after.owners)) as Map<string, Power>)
        for (const p of new Set(after.units.map((u) => u.power))) {
          expect(after.units.filter((u) => u.power === p).length).toBeLessThanOrEqual(counts.get(p) ?? 0)
        }
        const n = (s: GameState, p: Power) => s.units.filter((u) => u.power === p).length
        for (const p of new Set([...before.units, ...after.units].map((u) => u.power))) {
          if (n(after, p) > n(before, p)) builds++
          if (n(after, p) < n(before, p)) disbands++
        }
      }
    })

    expect(state.result).toEqual({ kind: "victory", seat: POWERS.indexOf(FULL_GAME.conqueror), powers: [FULL_GAME.conqueror] })
    const counts = supplyCenterCounts(new Map(Object.entries(state.owners)) as Map<string, Power>)
    expect(counts.get(FULL_GAME.conqueror)).toBeGreaterThanOrEqual(18)
    // The game exercised every kind of phase.
    expect(retreats).toBeGreaterThan(0)
    expect(builds).toBeGreaterThan(0)
    expect(disbands).toBeGreaterThan(0)
    expect(labels[0]).toBe("Spring 1901 · Orders")
    expect(labels.at(-1)).toMatch(/^Fall \d{4}/)
  })
})
