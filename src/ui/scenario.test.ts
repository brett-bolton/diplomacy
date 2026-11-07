import { describe, expect, it } from "vitest"
import { STANDARD_START } from "@/engine/map/standard"
import { decodeScenario, encodeScenario, type Scenario } from "./scenario"

describe("scenario links", () => {
  it("round-trips a scenario through the URL", () => {
    const s: Scenario = {
      year: 1905,
      season: "fall",
      powers: ["FRA", "GER"],
      units: [
        { power: "FRA", type: "A", location: { province: "par" } },
        { power: "GER", type: "F", location: { province: "kie" } },
        { power: "FRA", type: "F", location: { province: "spa", coast: "sc" } },
      ],
      orders: [{ kind: "move", unit: "par", to: { province: "bur" } }],
    }
    expect(decodeScenario("#" + encodeScenario(s))).toEqual(s)
  })

  it("keeps the standard opening compact", () => {
    const s: Scenario = { year: 1901, season: "spring", powers: ["AUS", "ENG", "FRA", "GER", "ITA", "RUS", "TUR"], units: STANDARD_START, orders: [] }
    expect(encodeScenario(s).length).toBeLessThan(600)
  })

  it("ignores garbage and impossible units instead of throwing", () => {
    expect(decodeScenario("#not-base64!!")).toBeNull()
    const bad = btoa(JSON.stringify({ y: 3000, s: "x", p: ["XYZ"], u: ["FRA:A:nth", "FRA:F:par", "FRA:A:par", "FRA:A:par"], o: [{ kind: "hold", unit: "zzz" }] }))
    expect(decodeScenario("#" + bad)).toEqual({
      year: 1901,
      season: "spring",
      powers: ["FRA"],
      units: [{ power: "FRA", type: "A", location: { province: "par" } }],
      orders: [],
    })
  })
})
