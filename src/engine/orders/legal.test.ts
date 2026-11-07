import { describe, expect, it } from "vitest"
import { ITALIAN_TERRITORY, STANDARD_START, u } from "../map/standard"
import { locKey } from "../types"
import { legalOrderOptions, validateMovementOrder } from "./legal"

const sorted = (xs: string[]) => [...xs].sort()

describe("legal-order generator at the 1901 start", () => {
  it("lists hand-checked moves", () => {
    const moves = (p: string) => sorted(legalOrderOptions(STANDARD_START, p).moves.map((m) => locKey(m.to)))
    expect(moves("par")).toEqual(["bre", "bur", "gas", "pic"])
    expect(moves("bre")).toEqual(["eng", "gas", "mao", "pic"])
    expect(moves("stp")).toEqual(["bot", "fin", "lvn"])
    expect(moves("lvp")).toEqual(["cly", "edi", "wal", "yor"])
    expect(moves("con")).toEqual(["ank", "bul", "smy"])
    expect(moves("ank")).toEqual(["arm", "bla", "con"])
  })

  it("offers the right supports", () => {
    const o = legalOrderOptions(STANDARD_START, "mar")
    expect(o.supportHolds).toEqual([])
    expect(o.supportMoves).toEqual(expect.arrayContaining([{ from: "par", to: "bur" }, { from: "par", to: "gas" }, { from: "mun", to: "bur" }]))
    expect(o.supportMoves.some((s) => s.to === "mar")).toBe(false)
    // Fleets in Brest support moves into provinces the fleet can reach.
    const bre = legalOrderOptions(STANDARD_START, "bre")
    expect(bre.supportHolds).toEqual([])
    expect(bre.supportMoves).toEqual(expect.arrayContaining([{ from: "par", to: "pic" }, { from: "par", to: "gas" }]))
    expect(bre.supportMoves.some((s) => s.to === "bur")).toBe(false)
  })

  it("never offers convoys to a fleet in a coastal province", () => {
    for (const unit of STANDARD_START.filter((x) => x.type === "F")) {
      expect(legalOrderOptions(STANDARD_START, unit.location.province).convoys).toEqual([])
    }
  })
})

describe("coasts and convoys", () => {
  const board = [u("FRA", "F", "mao"), u("ITA", "F", "lyo"), u("ENG", "A", "lon"), u("ENG", "F", "nth"), u("ENG", "F", "eng"), u("FRA", "A", "bre")]

  it("lists both coasts of Spain from MAO and one from Gulf of Lyon", () => {
    expect(sorted(legalOrderOptions(board, "mao").moves.map((m) => locKey(m.to)).filter((k) => k.startsWith("spa")))).toEqual(["spa/nc", "spa/sc"])
    expect(legalOrderOptions(board, "lyo").moves.map((m) => locKey(m.to)).filter((k) => k.startsWith("spa"))).toEqual(["spa/sc"])
  })

  it("offers convoy-only moves for coastal armies when fleets make a chain", () => {
    const lon = legalOrderOptions(board, "lon").moves
    const bel = lon.find((m) => m.to.province === "bel")
    expect(bel?.convoyOnly).toBe(true)
    const nwy = lon.find((m) => m.to.province === "nwy")
    expect(nwy?.convoyOnly).toBe(true)
    expect(lon.some((m) => m.to.province === "par")).toBe(false)
  })

  it("only lets a fleet convoy when it's on an irredundant route", () => {
    const nth = legalOrderOptions(board, "nth").convoys
    expect(nth).toContainEqual({ from: "lon", to: "bel" })
    expect(nth).toContainEqual({ from: "lon", to: "nwy" })
    // ENG fleet is not needed to get from London to Norway.
    expect(legalOrderOptions(board, "eng").convoys).not.toContainEqual({ from: "lon", to: "nwy" })
  })

  it("rejects a fleet supporting an army whose only convoy needs that fleet (DATC 6.D.31)", () => {
    const b = [u("AUS", "A", "rum"), u("TUR", "F", "bla")]
    expect(legalOrderOptions(b, "bla").supportMoves).not.toContainEqual({ from: "rum", to: "arm" })
  })

  it("closes Italian territory when asked (2-player 1914)", () => {
    const b = [u("FRA", "A", "mar"), u("AUS", "A", "tyr")]
    const closed = new Set(ITALIAN_TERRITORY)
    expect(legalOrderOptions(b, "mar", { closed }).moves.map((m) => m.to.province)).not.toContain("pie")
    expect(legalOrderOptions(b, "tyr", { closed }).moves.map((m) => m.to.province)).not.toContain("ven")
  })
})

describe("validator", () => {
  it("rejects malformed orders with a reason", () => {
    const bad = [
      { kind: "move", unit: "lon", to: { province: "nth" } }, // other power's unit
      { kind: "move", unit: "par", to: { province: "mar" } }, // unreachable
      { kind: "move", unit: "zzz", to: { province: "par" } }, // no unit
    ] as const
    expect(validateMovementOrder(STANDARD_START, "ENG", { kind: "move", unit: "par", to: { province: "bur" } }).ok).toBe(false)
    for (const o of bad) expect(validateMovementOrder(STANDARD_START, "FRA", o).ok).toBe(false)
    const board = [u("FRA", "F", "mao")]
    const r = validateMovementOrder(board, "FRA", { kind: "move", unit: "mao", to: { province: "spa" } })
    expect(r).toEqual({ ok: false, reason: "Choose which coast to move to." })
    expect(validateMovementOrder(board, "FRA", { kind: "move", unit: "mao", to: { province: "spa", coast: "nc" } }).ok).toBe(true)
  })
})

describe("golden file", () => {
  it("matches the locked legal-order list for all 22 units at the 1901 start", () => {
    const all = STANDARD_START.map((x) => {
      const o = legalOrderOptions(STANDARD_START, x.location.province)
      return {
        unit: `${x.power} ${x.type} ${locKey(x.location)}`,
        moves: sorted(o.moves.map((m) => locKey(m.to) + (m.convoyOnly ? " (convoy)" : ""))),
        supportHolds: sorted(o.supportHolds),
        supportMoves: sorted(o.supportMoves.map((s) => `${s.from}-${s.to}`)),
        convoys: sorted(o.convoys.map((c) => `${c.from}-${c.to}`)),
      }
    })
    expect(all).toMatchSnapshot()
  })
})
