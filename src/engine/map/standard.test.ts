import { describe, expect, it } from "vitest"
import {
  ARMY_ADJ,
  FLEET_ADJ,
  PROVINCES,
  PROVINCE_IDS,
  RAW_ARMY_EDGES,
  RAW_FLEET_EDGES,
  STANDARD_START,
  SUPPLY_CENTERS,
  homeCenters,
  isLand,
  isValidUnitLocation,
  neighbors,
  reachableCoasts,
} from "./standard"
import { POWERS, locKey } from "../types"

const sorted = (xs: Iterable<string>) => [...xs].sort()

describe("province counts", () => {
  it("has 75 provinces: 14 inland, 42 coastal, 19 sea", () => {
    const kinds = Object.values(PROVINCES).map((p) => p.kind)
    expect(PROVINCE_IDS).toHaveLength(75)
    expect(kinds.filter((k) => k === "inland")).toHaveLength(14)
    expect(kinds.filter((k) => k === "coastal")).toHaveLength(42)
    expect(kinds.filter((k) => k === "sea")).toHaveLength(19)
  })

  it("has 34 supply centers: 22 home + 12 neutral", () => {
    expect(SUPPLY_CENTERS).toHaveLength(34)
    const homes = Object.values(PROVINCES).filter((p) => p.home)
    expect(homes).toHaveLength(22)
    expect(SUPPLY_CENTERS.length - homes.length).toBe(12)
    expect(homes.every((p) => p.supplyCenter)).toBe(true)
  })

  it("gives Russia 4 home centers and every other power 3", () => {
    for (const power of POWERS) {
      expect(homeCenters(power)).toHaveLength(power === "RUS" ? 4 : 3)
    }
  })

  it("only puts split coasts on Spain, St Petersburg and Bulgaria", () => {
    const split = Object.values(PROVINCES).filter((p) => p.coasts).map((p) => p.id)
    expect(sorted(split)).toEqual(["bul", "spa", "stp"])
  })
})

describe("army adjacency", () => {
  it("only connects land provinces", () => {
    for (const [a, b] of RAW_ARMY_EDGES) {
      expect(isLand(a), a).toBe(true)
      expect(isLand(b), b).toBe(true)
    }
  })

  it("has no duplicate edges", () => {
    const keys = RAW_ARMY_EDGES.map(([a, b]) => [a, b].sort().join("-"))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("gives every land province at least one neighbor", () => {
    for (const id of PROVINCE_IDS.filter(isLand)) {
      expect(ARMY_ADJ.get(id)?.size ?? 0, id).toBeGreaterThan(0)
    }
  })

  it("matches hand-checked neighbor lists", () => {
    const expected: Record<string, string[]> = {
      bur: ["bel", "gas", "mar", "mun", "par", "pic", "ruh"],
      mun: ["ber", "boh", "bur", "kie", "ruh", "sil", "tyr"],
      gal: ["boh", "bud", "rum", "sil", "ukr", "vie", "war"],
      war: ["gal", "lvn", "mos", "pru", "sil", "ukr"],
      ser: ["alb", "bud", "bul", "gre", "rum", "tri"],
      stp: ["fin", "lvn", "mos", "nwy"],
      spa: ["gas", "mar", "por"],
      den: ["kie", "swe"],
      naf: ["tun"],
    }
    for (const [id, list] of Object.entries(expected)) {
      expect(sorted(ARMY_ADJ.get(id)!), id).toEqual(list)
    }
  })
})

describe("fleet adjacency", () => {
  const fleetLocs = new Set<string>()
  for (const pr of Object.values(PROVINCES)) {
    if (pr.kind === "inland") continue
    if (pr.coasts) pr.coasts.forEach((c) => fleetLocs.add(`${pr.id}/${c}`))
    else fleetLocs.add(pr.id)
  }

  it("only connects valid fleet locations (never inland, never a bare split-coast province)", () => {
    for (const [a, b] of RAW_FLEET_EDGES) {
      expect(fleetLocs.has(a), a).toBe(true)
      expect(fleetLocs.has(b), b).toBe(true)
    }
  })

  it("has no duplicate edges", () => {
    const keys = RAW_FLEET_EDGES.map(([a, b]) => [a, b].sort().join("-"))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("touches every fleet location, and every coast touches a sea", () => {
    for (const loc of fleetLocs) {
      const adj = FLEET_ADJ.get(loc)
      expect(adj?.size ?? 0, loc).toBeGreaterThan(0)
      if (!PROVINCES[loc.split("/")[0]].coasts && PROVINCES[loc].kind === "sea") continue
      expect([...adj!].some((n) => PROVINCES[n.split("/")[0]].kind === "sea"), loc).toBe(true)
    }
  })

  it("has a land border wherever two land provinces share a coast", () => {
    for (const [a, b] of RAW_FLEET_EDGES) {
      const pa = a.split("/")[0]
      const pb = b.split("/")[0]
      if (isLand(pa) && isLand(pb)) {
        expect(ARMY_ADJ.get(pa)?.has(pb), `${a}-${b}`).toBe(true)
      }
    }
  })

  it("matches the hand-checked split-coast table", () => {
    const expected: Record<string, string[]> = {
      "spa/nc": ["gas", "mao", "por"],
      "spa/sc": ["lyo", "mao", "mar", "por", "wes"],
      "stp/nc": ["bar", "nwy"],
      "stp/sc": ["bot", "fin", "lvn"],
      "bul/ec": ["bla", "con", "rum"],
      "bul/sc": ["aeg", "con", "gre"],
    }
    for (const [loc, list] of Object.entries(expected)) {
      expect(sorted(FLEET_ADJ.get(loc)!), loc).toEqual(list)
    }
  })

  it("matches hand-checked sea and pass-through neighbor lists", () => {
    const expected: Record<string, string[]> = {
      mao: ["bre", "eng", "gas", "iri", "naf", "nao", "por", "spa/nc", "spa/sc", "wes"],
      nth: ["bel", "den", "edi", "eng", "hel", "hol", "lon", "nwg", "nwy", "ska", "yor"],
      ion: ["adr", "aeg", "alb", "apu", "eas", "gre", "nap", "tun", "tys"],
      con: ["aeg", "ank", "bla", "bul/ec", "bul/sc", "smy"],
      kie: ["bal", "ber", "den", "hel", "hol"],
      den: ["bal", "hel", "kie", "nth", "ska", "swe"],
      swe: ["bal", "bot", "den", "fin", "nwy", "ska"],
      lyo: ["mar", "pie", "spa/sc", "tus", "tys", "wes"],
    }
    for (const [loc, list] of Object.entries(expected)) {
      expect(sorted(FLEET_ADJ.get(loc)!), loc).toEqual(list)
    }
  })

  it("reports reachable coasts", () => {
    expect(sorted(reachableCoasts({ province: "mao" }, "spa"))).toEqual(["nc", "sc"])
    expect(reachableCoasts({ province: "lyo" }, "spa")).toEqual(["sc"])
    expect(reachableCoasts({ province: "bar" }, "stp")).toEqual(["nc"])
    expect(reachableCoasts({ province: "aeg" }, "bul")).toEqual(["sc"])
    expect(sorted(reachableCoasts({ province: "con" }, "bul"))).toEqual(["ec", "sc"])
  })

  it("never lets a fleet on one coast reach the other coast of the same province", () => {
    expect(neighbors("F", { province: "spa", coast: "nc" }).some((l) => l.province === "spa")).toBe(false)
  })
})

describe("standard start", () => {
  it("has 22 units: Russia 4, the rest 3", () => {
    expect(STANDARD_START).toHaveLength(22)
    for (const power of POWERS) {
      expect(STANDARD_START.filter((u) => u.power === power)).toHaveLength(power === "RUS" ? 4 : 3)
    }
  })

  it("places every unit legally on one of its own home centers, one per province", () => {
    const seen = new Set<string>()
    for (const unit of STANDARD_START) {
      expect(isValidUnitLocation(unit.type, unit.location), locKey(unit.location)).toBe(true)
      expect(PROVINCES[unit.location.province].home).toBe(unit.power)
      expect(seen.has(unit.location.province)).toBe(false)
      seen.add(unit.location.province)
    }
  })

  it("puts the Russian fleet on the south coast of St Petersburg", () => {
    const f = STANDARD_START.find((u) => u.power === "RUS" && u.location.province === "stp")
    expect(f?.type).toBe("F")
    expect(f?.location.coast).toBe("sc")
  })
})

describe("unit location validity", () => {
  it("rejects armies at sea, fleets inland, and fleets on a split-coast province without a coast", () => {
    expect(isValidUnitLocation("A", { province: "nth" })).toBe(false)
    expect(isValidUnitLocation("F", { province: "par" })).toBe(false)
    expect(isValidUnitLocation("F", { province: "spa" })).toBe(false)
    expect(isValidUnitLocation("F", { province: "spa", coast: "ec" })).toBe(false)
    expect(isValidUnitLocation("A", { province: "spa", coast: "nc" })).toBe(false)
    expect(isValidUnitLocation("F", { province: "bul", coast: "ec" })).toBe(true)
  })
})
