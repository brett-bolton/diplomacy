// DATC v3.0 section 6.B — coastal issues.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.B.1",
    title: "Moving with unspecified coast when coast is necessary",
    orders: `
France:
F Portugal - Spain`,
    expect: { fails: ["por"] },
  },
  {
    id: "6.B.2",
    title: "Moving with unspecified coast when coast is not necessary",
    orders: `
France:
F Gascony - Spain`,
    expect: { succeeds: ["gas"] },
    note: "4.B.2: preferred — attempt is made to the only reachable coast (north coast)",
  },
  {
    id: "6.B.3",
    title: "Moving with wrong coast when coast is not necessary",
    orders: `
France:
F Gascony - Spain(sc)`,
    expect: { fails: ["gas"] },
    note: "4.B.3: preferred — order is illegal, fleet holds",
  },
  {
    id: "6.B.4",
    title: "Support to unreachable coast allowed",
    orders: `
France:
F Gascony - Spain(nc)
F Marseilles Supports F Gascony - Spain(nc)
Italy:
F Western Mediterranean - Spain(sc)`,
    expect: { succeeds: ["gas", "mar"], fails: ["wes"] },
  },
  {
    id: "6.B.5",
    title: "Support from unreachable coast not allowed",
    orders: `
France:
F Marseilles - Gulf of Lyon
F Spain(nc) Supports F Marseilles - Gulf of Lyon
Italy:
F Gulf of Lyon Hold`,
    expect: { fails: ["mar", "spa"], notDislodged: ["lyo"] },
  },
  {
    id: "6.B.6",
    title: "Support can be cut with other coast",
    orders: `
England:
F Irish Sea Supports F North Atlantic Ocean - Mid-Atlantic Ocean
F North Atlantic Ocean - Mid-Atlantic Ocean
France:
F Spain(nc) Supports F Mid-Atlantic Ocean
F Mid-Atlantic Ocean Hold
Italy:
F Gulf of Lyon - Spain(sc)`,
    expect: { succeeds: ["iri", "nao"], fails: ["spa", "lyo"], dislodged: ["mao"] },
  },
  {
    id: "6.B.7",
    title: "Supporting own unit with unspecified coast",
    orders: `
France:
F Portugal Supports F Mid-Atlantic Ocean - Spain
F Mid-Atlantic Ocean - Spain(nc)
Italy:
F Gulf of Lyon Supports F Western Mediterranean - Spain(sc)
F Western Mediterranean - Spain(sc)`,
    expect: { succeeds: ["por", "lyo"], fails: ["mao", "wes"] },
    note: "4.B.4: preferred — support without coast succeeds; both moves bounce",
  },
  {
    id: "6.B.8",
    title: "Supporting with unspecified coast when only one coast is possible",
    orders: `
France:
F Portugal Supports F Gascony - Spain
F Gascony - Spain(nc)
Italy:
F Gulf of Lyon Supports F Western Mediterranean - Spain(sc)
F Western Mediterranean - Spain(sc)`,
    expect: { succeeds: ["por", "lyo"], fails: ["gas", "wes"] },
  },
  {
    id: "6.B.9",
    title: "Supporting with wrong coast",
    orders: `
France:
F Portugal Supports F Mid-Atlantic Ocean - Spain(nc)
F Mid-Atlantic Ocean - Spain(sc)
Italy:
F Gulf of Lyon Supports F Western Mediterranean - Spain(sc)
F Western Mediterranean - Spain(sc)`,
    expect: { succeeds: ["lyo", "wes"], fails: ["por", "mao"] },
    note: "4.B.4: support must name the matching coast",
  },
  {
    id: "6.B.10",
    title: "Unit ordered with wrong coast",
    units: `
France:
F Spain(sc)`,
    orders: `
France:
F Spain(nc) - Gulf of Lyon`,
    expect: { succeeds: ["spa"] },
    note: "4.B.5: preferred — wrong coast of the ordered unit is ignored, move is attempted",
  },
  {
    id: "6.B.11",
    title: "Coast cannot be ordered to change",
    units: `
France:
F Spain(nc)`,
    orders: `
France:
F Spain(sc) - Gulf of Lyon`,
    expect: { fails: ["spa"] },
  },
  {
    id: "6.B.12",
    title: "Army movement with coastal specification",
    orders: `
France:
A Gascony - Spain(nc)`,
    expect: { succeeds: ["gas"] },
    note: "4.B.6: preferred — coast is ignored for armies, move is attempted",
  },
  {
    id: "6.B.13",
    title: "Coastal crawl not allowed",
    orders: `
Turkey:
F Bulgaria(sc) - Constantinople
F Constantinople - Bulgaria(ec)`,
    expect: { fails: ["bul", "con"] },
  },
  {
    id: "6.B.14",
    title: "Building with unspecified coast",
    phase: "adjustment",
    ownership: `
Russia: St Petersburg`,
    orders: `
Russia:
Build F St Petersburg`,
    expect: { fails: ["stp"] },
    note: "4.B.7: build fails when coast is not specified",
  },
  {
    id: "6.B.15",
    title: "Supporting foreign unit with unspecified coast",
    orders: `
France:
F Portugal Supports F Mid-Atlantic Ocean - Spain
England:
F Mid-Atlantic Ocean - Spain(nc)
Italy:
F Gulf of Lyon Supports F Western Mediterranean - Spain(sc)
F Western Mediterranean - Spain(sc)`,
    expect: { succeeds: ["por", "lyo"], fails: ["mao", "wes"] },
    note: "4.B.4: preferred — support without coast succeeds; both moves bounce",
  },
]
