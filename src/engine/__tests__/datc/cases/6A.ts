// DATC v3.0 section 6.A — basic checks.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.A.1",
    title: "Moving to an area that is not a neighbour",
    orders: `
England:
F North Sea - Picardy`,
    expect: { fails: ["nth"] },
  },
  {
    id: "6.A.2",
    title: "Move army to sea",
    orders: `
England:
A Liverpool - Irish Sea`,
    expect: { fails: ["lvp"] },
  },
  {
    id: "6.A.3",
    title: "Move fleet to land",
    orders: `
Germany:
F Kiel - Munich`,
    expect: { fails: ["kie"] },
  },
  {
    id: "6.A.4",
    title: "Move to own sector",
    orders: `
Germany:
F Kiel - Kiel`,
    expect: { fails: ["kie"] },
  },
  {
    id: "6.A.5",
    title: "Move to own sector with convoy",
    orders: `
England:
F North Sea Convoys A Yorkshire - Yorkshire
A Yorkshire - Yorkshire
A Liverpool Supports A Yorkshire - Yorkshire
Germany:
F London - Yorkshire
A Wales Supports F London - Yorkshire`,
    expect: { fails: ["yor", "lvp"], succeeds: ["lon", "wal"], dislodged: ["yor"] },
  },
  {
    id: "6.A.6",
    title: "Ordering a unit of another country",
    units: `
England:
F London`,
    orders: `
Germany:
F London - North Sea`,
    expect: { final: { England: ["F lon"] } },
  },
  {
    id: "6.A.7",
    title: "Only armies can be convoyed",
    orders: `
England:
F London - Belgium
F North Sea Convoys A London - Belgium`,
    expect: { fails: ["lon"] },
  },
  {
    id: "6.A.8",
    title: "Support to hold yourself is not possible",
    orders: `
Italy:
A Venice - Trieste
A Tyrolia Supports A Venice - Trieste
Austria:
F Trieste Supports F Trieste`,
    expect: { succeeds: ["ven", "tyr"], fails: ["tri"], dislodged: ["tri"] },
  },
  {
    id: "6.A.9",
    title: "Fleets must follow coast if not on sea",
    orders: `
Italy:
F Rome - Venice`,
    expect: { fails: ["rom"] },
  },
  {
    id: "6.A.10",
    title: "Support on unreachable destination not possible",
    orders: `
Austria:
A Venice Hold
Italy:
F Rome Supports A Apulia - Venice
A Apulia - Venice`,
    expect: { fails: ["rom", "apu"], notDislodged: ["ven"] },
  },
  {
    id: "6.A.11",
    title: "Simple bounce",
    orders: `
Austria:
A Vienna - Tyrolia
Italy:
A Venice - Tyrolia`,
    expect: { fails: ["vie", "ven"] },
  },
  {
    id: "6.A.12",
    title: "Bounce of three units",
    orders: `
Austria:
A Vienna - Tyrolia
Germany:
A Munich - Tyrolia
Italy:
A Venice - Tyrolia`,
    expect: { fails: ["vie", "mun", "ven"] },
  },
]
