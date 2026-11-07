// DATC v3.0 section 6.I — building. DATC describes the situation in prose; the
// `units` and `ownership` blocks below set up a board that matches it.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.I.1",
    title: "Too many build orders",
    phase: "adjustment",
    units: `
Germany:
A Berlin
F Denmark
A Ruhr`,
    ownership: `
Germany: Berlin, Kiel, Munich, Denmark
Russia: Warsaw`,
    orders: `
Germany:
Build A Warsaw
Build A Kiel
Build A Munich`,
    expect: { final: { Germany: ["A ber", "F den", "A ruh", "A kie"] } },
    note: "4.D.4 choice b: builds are handled one by one; Warsaw fails, Kiel succeeds, Munich fails (too many).",
  },
  {
    id: "6.I.2",
    title: "Fleets cannot be build in land areas",
    phase: "adjustment",
    units: `
Russia:
A Warsaw
F Sevastopol
A Rumania
F Gulf of Bothnia`,
    ownership: `
Russia: Moscow, St Petersburg, Warsaw, Sevastopol, Rumania`,
    orders: `
Russia:
Build F Moscow`,
    expect: { final: { Russia: ["A war", "F sev", "A rum", "F bot"] } },
  },
  {
    id: "6.I.3",
    title: "Supply center must be empty for building",
    phase: "adjustment",
    units: `
Germany:
A Berlin
F Denmark
A Ruhr`,
    ownership: `
Germany: Berlin, Kiel, Munich, Denmark`,
    orders: `
Germany:
Build A Berlin`,
    expect: { final: { Germany: ["A ber", "F den", "A ruh"] } },
  },
  {
    id: "6.I.4",
    title: "Both coasts must be empty for building",
    phase: "adjustment",
    units: `
Russia:
F St Petersburg(sc)
A Warsaw
F Sevastopol
A Rumania`,
    ownership: `
Russia: Moscow, St Petersburg, Warsaw, Sevastopol, Rumania`,
    orders: `
Russia:
Build A St Petersburg(nc)`,
    expect: { final: { Russia: ["F stp/sc", "A war", "F sev", "A rum"] } },
  },
  {
    id: "6.I.5",
    title: "Building in home supply center that is not owned",
    phase: "adjustment",
    units: `
Germany:
F Denmark
A Holland
A Belgium`,
    ownership: `
Germany: Kiel, Munich, Denmark, Holland, Belgium
Russia: Berlin`,
    orders: `
Germany:
Build A Berlin`,
    expect: { final: { Germany: ["F den", "A hol", "A bel"] } },
  },
  {
    id: "6.I.6",
    title: "Building in owned supply center that is not a home supply center",
    phase: "adjustment",
    units: `
Germany:
A Berlin
F Kiel
A Munich`,
    ownership: `
Germany: Berlin, Kiel, Munich, Warsaw`,
    orders: `
Germany:
Build A Warsaw`,
    expect: { final: { Germany: ["A ber", "F kie", "A mun"] } },
  },
  {
    id: "6.I.7",
    title: "Only one build in a home supply center",
    phase: "adjustment",
    units: `
Russia:
F St Petersburg(sc)
A Warsaw
F Sevastopol
A Rumania`,
    ownership: `
Russia: Moscow, St Petersburg, Warsaw, Sevastopol, Rumania, Sweden`,
    orders: `
Russia:
Build A Moscow
Build A Moscow`,
    expect: { final: { Russia: ["F stp/sc", "A war", "F sev", "A rum", "A mos"] } },
  },
]
