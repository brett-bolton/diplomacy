import { describe, expect, it } from "vitest"
import { u } from "./map/standard"
import type { MovementOrder } from "./orders"
import {
  checkVictory,
  closedProvinces,
  customGame,
  newGame,
  phaseLabel,
  powersToOrder,
  resolvePhase,
  seatPowers,
  unplayedPowers,
  type GameState,
  type PhaseOrders,
} from "./phase"
import type { Power } from "./types"
import { VARIANTS } from "./variants"

const mv = (unit: string, to: string): MovementOrder => ({ kind: "move", unit, to: { province: to } })
const orders = (entries: [Power, MovementOrder[]][]): PhaseOrders => new Map(entries)
const units = (s: GameState, power: Power) => s.units.filter((x) => x.power === power).map((x) => x.location.province).sort()

describe("new games", () => {
  it("starts Spring 1901 with 22 units and 22 owned home centers", () => {
    const g = newGame(7)
    expect(phaseLabel(g)).toBe("Spring 1901 · Orders")
    expect(g.units).toHaveLength(22)
    expect(Object.keys(g.owners)).toHaveLength(22)
    expect(powersToOrder(g)).toHaveLength(7)
  })

  it("has a setup for every player count from 2 to 7", () => {
    for (let n = 2; n <= 7; n++) {
      const v = VARIANTS[n]
      expect(v.seats).toHaveLength(n)
      const all = [...v.seats.flat(), ...v.unplayed].sort()
      expect(all, `${n} players`).toEqual(n === 2 ? ["AUS", "ENG", "FRA", "GER", "RUS", "TUR"] : ["AUS", "ENG", "FRA", "GER", "ITA", "RUS", "TUR"])
    }
  })

  it("leaves Italy (and Germany) unplayed in 6- and 5-player games", () => {
    expect(unplayedPowers(newGame(6))).toEqual(["ITA"])
    expect(unplayedPowers(newGame(5)).sort()).toEqual(["GER", "ITA"])
    expect(powersToOrder(newGame(6))).not.toContain("ITA")
  })
})

describe("phase cycle", () => {
  it("goes Spring → Fall → (no Winter) → Spring when everyone holds", () => {
    let g = newGame(7)
    g = resolvePhase(g, new Map()).state
    expect(phaseLabel(g)).toBe("Fall 1901 · Orders")
    g = resolvePhase(g, new Map()).state
    expect(phaseLabel(g)).toBe("Spring 1902 · Orders")
  })

  it("captures a center in Fall, builds in Winter", () => {
    let g = newGame(7)
    g = resolvePhase(g, orders([["FRA", [mv("par", "bur")]]])).state
    expect(units(g, "FRA")).toEqual(["bre", "bur", "mar"])
    const fall = resolvePhase(g, orders([["FRA", [mv("bur", "bel")]]]))
    g = fall.state
    expect(fall.records.at(-1)?.captured).toEqual([{ province: "bel", from: undefined, to: "FRA" }])
    expect(phaseLabel(g)).toBe("Winter 1901 · Builds")
    expect(powersToOrder(g)).toEqual(["FRA"])
    g = resolvePhase(g, new Map([["FRA", [{ kind: "build", unitType: "A", at: { province: "par" } }]]])).state
    expect(phaseLabel(g)).toBe("Spring 1902 · Orders")
    expect(units(g, "FRA")).toEqual(["bel", "bre", "mar", "par"])
  })

  it("does not change ownership in Spring", () => {
    let g = newGame(7)
    g = resolvePhase(g, orders([["FRA", [mv("par", "bur")]], ["GER", [mv("mun", "ruh")]]])).state
    g = resolvePhase(g, orders([["FRA", [mv("bur", "mun")]]])).state
    // Spring: no changes. Fall: France takes Munich.
    expect(g.owners.mun).toBe("FRA")
  })

  it("runs a retreat phase and lets the dislodged unit retreat", () => {
    const g0 = customGame(7, {
      year: 1902,
      season: "spring",
      units: [u("FRA", "A", "bur"), u("FRA", "A", "pic"), u("GER", "A", "bel")],
      owners: { par: "FRA" },
    })
    const r = resolvePhase(
      g0,
      orders([["FRA", [mv("pic", "bel"), { kind: "support-move", unit: "bur", from: "pic", to: "bel" }]]]),
    )
    expect(phaseLabel(r.state)).toBe("Spring 1902 · Retreats")
    expect(powersToOrder(r.state)).toEqual(["GER"])
    const opts = r.state.dislodged[0].retreatOptions.map((l) => l.province).sort()
    expect(opts).toEqual(["hol", "ruh"])
    const after = resolvePhase(r.state, new Map([["GER", [{ kind: "retreat", unit: "bel", to: { province: "hol" } }]]]))
    expect(phaseLabel(after.state)).toBe("Fall 1902 · Orders")
    expect(units(after.state, "GER")).toEqual(["hol"])
  })

  it("disbands dislodged units of a power that gave no retreat order (missed timer)", () => {
    const g0 = customGame(7, {
      year: 1902,
      season: "spring",
      units: [u("FRA", "A", "bur"), u("FRA", "A", "pic"), u("GER", "A", "bel")],
      owners: {},
    })
    const r = resolvePhase(g0, orders([["FRA", [mv("pic", "bel"), { kind: "support-move", unit: "bur", from: "pic", to: "bel" }]]]))
    const after = resolvePhase(r.state, new Map())
    expect(units(after.state, "GER")).toEqual([])
    expect(after.records[0].retreats?.[0].result).toEqual({ kind: "disbanded", reason: "no-order" })
  })

  it("lets a power that missed a phase order normally in the next one", () => {
    let g = newGame(7)
    g = resolvePhase(g, new Map()).state // nobody ordered in Spring
    const r = resolvePhase(g, orders([["FRA", [mv("par", "bur")]]]))
    expect(r.records[0].movement?.outcomes.find((o) => o.unit.location.province === "par")?.success).toBe(true)
  })

  it("rejects orders that fail validation (other power's unit)", () => {
    const g = newGame(7)
    const r = resolvePhase(g, orders([["ENG", [mv("par", "bur")]]]))
    expect(units(r.state, "FRA")).toContain("par")
  })
})

describe("unplayed powers", () => {
  it("never builds and is never asked for orders", () => {
    const g0 = customGame(6, {
      year: 1905,
      season: "fall",
      units: [u("ITA", "A", "ven")],
      owners: { ven: "ITA", rom: "ITA", nap: "ITA" },
    })
    const r = resolvePhase(g0, new Map())
    // Italy could build two but is unplayed, so the Winter phase is skipped or yields no builds.
    expect(r.state.units.filter((x) => x.power === "ITA")).toHaveLength(1)
  })
})

describe("2-player WWI scenario", () => {
  it("starts in 1914 with Italian territory closed", () => {
    const g = newGame(2)
    expect(g.year).toBe(1914)
    expect([...closedProvinces(g)].sort()).toEqual(["apu", "nap", "pie", "rom", "tus", "ven"])
    expect(powersToOrder(g)).not.toContain("ITA")
  })

  it("ignores orders into Italy in 1914", () => {
    const g = newGame(2)
    const r = resolvePhase(g, orders([["AUS", [mv("vie", "tyr"), mv("tri", "ven")]]]))
    expect(units(r.state, "AUS")).toContain("tri")
  })

  it("flips a coin for Italy before the Fall 1914 adjustments and opens Italy in 1915", () => {
    let g = newGame(2)
    g = resolvePhase(g, new Map()).state
    const fall = resolvePhase(g, new Map(), { random: () => 0.7 })
    expect(fall.records.at(-1)?.coinFlip).toEqual({ italyToSeat: 1 })
    g = fall.state
    expect(g.year).toBe(1915)
    expect(closedProvinces(g).size).toBe(0)
    expect(seatPowers(g)[1]).toContain("ITA")
    expect(powersToOrder(g)).toContain("ITA")
  })

  it("is won by the first player to 24 centers across their powers", () => {
    const g = newGame(2)
    const owners = { ...g.owners }
    const theirs = ["lon", "edi", "lvp", "bre", "par", "mar", "mos", "stp", "war", "sev", "bel", "hol", "den", "nwy", "swe", "spa", "por", "tun", "ber", "kie", "mun", "rum", "ser"]
    for (const sc of theirs) owners[sc] = sc === "ber" || sc === "kie" || sc === "mun" ? "FRA" : "ENG"
    expect(checkVictory({ ...g, owners })).toBeUndefined()
    owners.bul = "RUS"
    expect(checkVictory({ ...g, owners })).toEqual({ kind: "victory", seat: 0, powers: ["ENG", "FRA", "RUS"] })
  })
})

describe("victory", () => {
  it("ends a standard game when one power reaches 18 centers", () => {
    const g = newGame(7)
    const owners: Record<string, Power> = {}
    for (const sc of ["bre", "par", "mar", "bel", "hol", "spa", "por", "lon", "edi", "lvp", "mun", "kie", "ber", "den", "tun", "rom", "nap", "ven"]) owners[sc] = "FRA"
    expect(checkVictory({ ...g, owners })).toEqual({ kind: "victory", seat: 2, powers: ["FRA"] })
  })
})
