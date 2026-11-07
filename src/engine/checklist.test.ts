import { describe, expect, it } from "vitest"
import { ALL_CASES } from "./__tests__/datc/cases"
import { buildBoard, ordersFor } from "./__tests__/datc/harness"
import { checklist, type ChecklistStep } from "./checklist"
import { checkCustomPosition } from "./custom"
import { STANDARD_START, u } from "./map/standard"
import { adjudicateMovement } from "./adjudicate/movement"
import { customGame, newGame, resolvePhase, type PhaseRecord } from "./phase"
import { locKey, type Unit } from "./types"

/** Apply checklist steps to a physical board, failing on any collision. */
function apply(before: Unit[], steps: ChecklistStep[]): Unit[] {
  const board = new Map(before.map((x) => [x.location.province, x]))
  const aside = new Map<string, Unit>()
  const hand = new Map<string, Unit>()
  const put = (unit: Unit, loc: Unit["location"]) => {
    expect(board.has(loc.province), `collision in ${loc.province}`).toBe(false)
    board.set(loc.province, { ...unit, location: loc })
  }
  for (const s of steps) {
    switch (s.kind) {
      case "set-aside":
        aside.set(s.at, board.get(s.at)!)
        board.delete(s.at)
        break
      case "lift":
        hand.set(s.at, board.get(s.at)!)
        board.delete(s.at)
        break
      case "move": {
        const unit = board.get(s.from)!
        board.delete(s.from)
        put(unit, s.to)
        break
      }
      case "place":
        put(hand.get(s.from)!, s.to)
        hand.delete(s.from)
        break
      case "retreat":
        put(aside.get(s.from)!, s.to)
        aside.delete(s.from)
        break
      case "remove":
        if (s.aside) aside.delete(s.at)
        else board.delete(s.at)
        break
      case "build":
        put({ power: s.power, type: s.unitType, location: s.at }, s.at)
        break
      case "marker":
        break
    }
  }
  expect(hand.size).toBe(0)
  return [...board.values()]
}

const key = (units: Unit[]) => units.map((x) => `${x.power} ${x.type} ${locKey(x.location)}`).sort()

describe("physical moves checklist", () => {
  it("turns every DATC movement board into the adjudicated board without collisions", () => {
    for (const c of ALL_CASES.filter((x) => !x.phase && !x.skip)) {
      const board = buildBoard(c)
      const movement = adjudicateMovement(board, ordersFor(board, c.orders))
      const rec = { movement } as PhaseRecord
      const steps = checklist(rec)
      const after = apply(
        board,
        steps.filter((s) => s.kind !== "retreat"),
      )
      const expected = rec.movement!.units
      expect(key(after), c.id).toEqual(key(expected))
    }
  })

  it("handles swaps and three-way circular movement", () => {
    const g = customGame(7, {
      year: 1901,
      season: "spring",
      units: [u("TUR", "F", "ank"), u("TUR", "A", "con"), u("TUR", "A", "smy")],
      owners: {},
    })
    const r = resolvePhase(g, new Map([["TUR", [
      { kind: "move", unit: "ank", to: { province: "con" } },
      { kind: "move", unit: "con", to: { province: "smy" } },
      { kind: "move", unit: "smy", to: { province: "ank" } },
    ]]]))
    const steps = checklist(r.records[0])
    expect(steps.map((s) => s.kind)).toContain("lift")
    expect(key(apply(g.units, steps))).toEqual(key(r.state.units))
  })

  it("lists builds and supply-center markers after a Fall capture", () => {
    let g = newGame(7)
    g = resolvePhase(g, new Map([["FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }]]])).state
    const fall = resolvePhase(g, new Map([["FRA", [{ kind: "move", unit: "bur", to: { province: "bel" } }]]]))
    expect(checklist(fall.records[0]).map((s) => s.text)).toContain("Place a French marker on Bel")
    const winter = resolvePhase(fall.state, new Map([["FRA", [{ kind: "build", unitType: "A", at: { province: "par" } }]]]))
    expect(checklist(winter.records[0]).map((s) => s.text)).toEqual(["Place a new French army in Par"])
  })

  it("never lists marker steps after Spring", () => {
    const r = resolvePhase(newGame(7), new Map([["FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }]]]))
    expect(checklist(r.records[0]).some((s) => s.kind === "marker")).toBe(false)
  })
})

describe("custom position", () => {
  it("accepts the standard start", () => {
    const owners = Object.fromEntries(newGame(7).units.map((x) => [x.location.province, x.power]))
    expect(checkCustomPosition({ year: 1901, season: "spring", units: STANDARD_START, owners }, 7)).toEqual({ errors: [], warnings: [] })
  })

  it("blocks impossible positions and warns about unit/center mismatches", () => {
    const r = checkCustomPosition(
      {
        year: 1903,
        season: "fall",
        units: [u("FRA", "A", "nth"), u("FRA", "F", "par"), u("ENG", "F", "spa"), u("GER", "A", "mun"), u("AUS", "A", "mun")],
        owners: { mun: "GER", bur: "FRA" },
      },
      7,
    )
    expect(r.errors).toEqual(
      expect.arrayContaining([
        "An army can't be in North Sea.",
        "A fleet can't be in Paris.",
        "Choose a coast for the fleet in Spain.",
        "Munich has more than one unit.",
        "Burgundy isn't a supply center.",
      ]),
    )
    expect(r.warnings).toContain("France has 2 units and 0 supply centers.")
  })

  it("closes Italy before 1915 in the 2-player game", () => {
    const r = checkCustomPosition({ year: 1914, season: "fall", units: [u("AUS", "A", "ven")], owners: {} }, 2)
    expect(r.errors).toContain("No unit may be in Italian territory (Venice) in 1914.")
  })
})
