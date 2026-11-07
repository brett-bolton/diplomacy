// DATC v3.0 section 6.J — civil disorder and disbands. `final` is DATC's answer
// (2023 rule: distance to nearest owned center, any unit over land or sea).
// `finalRulebook2000` is the answer under the 2008/2000 rulebook (distance to
// home centers; fleets move only as fleets) where it differs.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.J.1",
    title: "Too many disband orders",
    phase: "adjustment",
    units: `
France:
A Paris
A Picardy`,
    ownership: `
France: Paris`,
    orders: `
France:
Remove F Gulf of Lyon
Remove A Picardy
Remove A Paris`,
    expect: { final: { France: ["A par"] } },
    note: "4.D.6 choice b: Gulf of Lyon fails (no fleet), Picardy removed, Paris fails (too many).",
  },
  {
    id: "6.J.2",
    title: "Removing the same unit twice",
    phase: "adjustment",
    units: `
France:
A Paris
A Picardy
A Burgundy`,
    ownership: `
France: Paris`,
    orders: `
France:
Remove A Paris
Remove A Paris`,
    expect: { final: { France: ["A pic"] } },
    note: "Paris removed once; the second removal comes from civil disorder (Burgundy and Picardy tie at distance 1; Burgundy is first alphabetically).",
  },
  {
    id: "6.J.3",
    title: "Civil disorder two armies with different distance",
    phase: "adjustment",
    units: `
Russia:
A Livonia
A Sweden`,
    ownership: `
Russia: St Petersburg`,
    orders: ``,
    expect: { final: { Russia: ["A lvn"] } },
  },
  {
    id: "6.J.4",
    title: "Civil disorder two armies with equal distance",
    phase: "adjustment",
    units: `
Russia:
A Livonia
A Ukraine`,
    ownership: `
Russia: Moscow`,
    orders: ``,
    expect: { final: { Russia: ["A ukr"] } },
  },
  {
    id: "6.J.5",
    title: "Civil disorder two fleets with different distance",
    phase: "adjustment",
    units: `
Russia:
F Skagerrak
F Berlin`,
    ownership: `
Russia: St Petersburg`,
    orders: ``,
    expect: { final: { Russia: ["F ska"] } },
  },
  {
    id: "6.J.6",
    title: "Civil disorder two fleets with equal distance",
    phase: "adjustment",
    units: `
Russia:
F Gulf of Bothnia
F North Sea`,
    ownership: `
Russia: Munich`,
    orders: ``,
    expect: { final: { Russia: ["F nth"] }, finalRulebook2000: { Russia: ["F bot"] } },
    note: "2023: both 3 from Munich, Gulf of Bothnia first alphabetically. 2008 rulebook: North Sea is farther from Russia's home centers (Bothnia is next to St Petersburg).",
  },
  {
    id: "6.J.7",
    title: "Civil disorder two fleets and army with equal distance",
    phase: "adjustment",
    units: `
Russia:
A Bohemia
F Skagerrak
F North Sea`,
    ownership: `
Russia: St Petersburg, Warsaw`,
    orders: ``,
    expect: { final: { Russia: ["A boh", "F ska"] } },
  },
  {
    id: "6.J.8",
    title: "Civil disorder a fleet with shorter distance then the army",
    phase: "adjustment",
    units: `
Russia:
A Tyrolia
F Baltic Sea`,
    ownership: `
Russia: Warsaw`,
    orders: ``,
    expect: { final: { Russia: ["F bal"] } },
  },
  {
    id: "6.J.9",
    title: "Civil disorder must be counted from both coasts",
    phase: "adjustment",
    units: `
Russia:
A Greece
A Sevastopol
F Baltic Sea`,
    ownership: `
Russia: St Petersburg, Sevastopol`,
    orders: ``,
    expect: { final: { Russia: ["A sev", "F bal"] } },
  },
  {
    id: "6.J.9b",
    title: "Civil disorder must be counted from both coasts (second part)",
    phase: "adjustment",
    units: `
Russia:
A Greece
A Sevastopol
F Skagerrak`,
    ownership: `
Russia: St Petersburg, Sevastopol`,
    orders: ``,
    expect: { final: { Russia: ["A sev", "F ska"] } },
  },
  {
    id: "6.J.10",
    title: "Civil disorder counting convoying distance",
    phase: "adjustment",
    units: `
Italy:
A Greece
A Piedmont`,
    ownership: `
Italy: Naples`,
    orders: ``,
    expect: { final: { Italy: ["A gre"] }, finalRulebook2000: { Italy: ["A pie"] } },
    note: "2023: distance to owned Naples (Greece 2 over water, Piedmont 3). 2008 rulebook: distance to home centers, so Piedmont (next to Venice) stays.",
  },
  {
    id: "6.J.11",
    title: "Distance to owned supply center",
    phase: "adjustment",
    units: `
Italy:
A Warsaw
A Tuscany`,
    ownership: `
Italy: Warsaw`,
    orders: ``,
    expect: { final: { Italy: ["A war"] }, finalRulebook2000: { Italy: ["A tus"] } },
    note: "2023: distance to owned Warsaw. 2008 rulebook: distance to home centers, so Warsaw is removed.",
  },
]
