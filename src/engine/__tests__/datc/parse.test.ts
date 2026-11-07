// Checks that every DATC fixture parses. Does not run the adjudicator.

import { describe, expect, it } from "vitest"
import { PROVINCES } from "../../map/standard"
import { ALL_CASES } from "./cases"
import { parseBlock, parseExpectedUnit, parseOwnership, POWER_BY_NAME } from "./notation"

const isProvinceId = (id: string) => !!PROVINCES[id]

describe("DATC fixtures parse", () => {
  it("have unique ids", () => {
    const ids = ALL_CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const c of ALL_CASES) {
    it(`${c.id} ${c.title}`, () => {
      expect(() => parseBlock(c.units)).not.toThrow()
      expect(() => parseBlock(c.orders)).not.toThrow()
      expect(() => parseBlock(c.retreats)).not.toThrow()
      expect(() => parseOwnership(c.ownership)).not.toThrow()
      const { succeeds = [], fails = [], dislodged = [], notDislodged = [], final } = c.expect
      for (const id of [...succeeds, ...fails, ...dislodged, ...notDislodged]) {
        expect(isProvinceId(id), `"${id}" is not a province id`).toBe(true)
      }
      const overlap = succeeds.filter((id) => fails.includes(id))
      expect(overlap, "listed as both succeeds and fails").toEqual([])
      for (const [power, list] of Object.entries(final ?? {})) {
        expect(POWER_BY_NAME[power.toLowerCase()], `unknown power "${power}"`).toBeDefined()
        for (const u of list) expect(() => parseExpectedUnit(u)).not.toThrow()
      }
    })
  }
})
