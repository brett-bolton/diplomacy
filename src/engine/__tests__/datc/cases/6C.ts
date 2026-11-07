// DATC v3.0 section 6.C — circular movement.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.C.1",
    title: "Three army circular movement",
    orders: `
Turkey:
F Ankara - Constantinople
A Constantinople - Smyrna
A Smyrna - Ankara`,
    expect: { succeeds: ["ank", "con", "smy"] },
  },
  {
    id: "6.C.2",
    title: "Three army circular movement with support",
    orders: `
Turkey:
F Ankara - Constantinople
A Constantinople - Smyrna
A Smyrna - Ankara
A Bulgaria Supports F Ankara - Constantinople`,
    expect: { succeeds: ["ank", "con", "smy", "bul"] },
  },
  {
    id: "6.C.3",
    title: "A disrupted three army circular movement",
    orders: `
Turkey:
F Ankara - Constantinople
A Constantinople - Smyrna
A Smyrna - Ankara
A Bulgaria - Constantinople`,
    expect: { fails: ["ank", "con", "smy", "bul"] },
  },
  {
    id: "6.C.4",
    title: "A circular movement with attacked convoy",
    orders: `
Austria:
A Trieste - Serbia
A Serbia - Bulgaria
Turkey:
A Bulgaria - Trieste
F Aegean Sea Convoys A Bulgaria - Trieste
F Ionian Sea Convoys A Bulgaria - Trieste
F Adriatic Sea Convoys A Bulgaria - Trieste
Italy:
F Naples - Ionian Sea`,
    expect: { succeeds: ["tri", "ser", "bul"], fails: ["nap"], notDislodged: ["ion"] },
  },
  {
    id: "6.C.5",
    title: "A disrupted circular movement due to dislodged convoy",
    orders: `
Austria:
A Trieste - Serbia
A Serbia - Bulgaria
Turkey:
A Bulgaria - Trieste
F Aegean Sea Convoys A Bulgaria - Trieste
F Ionian Sea Convoys A Bulgaria - Trieste
F Adriatic Sea Convoys A Bulgaria - Trieste
Italy:
F Naples - Ionian Sea
F Tunis Supports F Naples - Ionian Sea`,
    expect: { succeeds: ["nap", "tun"], fails: ["tri", "ser", "bul"], dislodged: ["ion"] },
  },
  {
    id: "6.C.6",
    title: "Two armies with two convoys",
    orders: `
England:
F North Sea Convoys A London - Belgium
A London - Belgium
France:
F English Channel Convoys A Belgium - London
A Belgium - London`,
    expect: { succeeds: ["lon", "bel"] },
  },
  {
    id: "6.C.7",
    title: "Disrupted unit swap",
    orders: `
England:
F North Sea Convoys A London - Belgium
A London - Belgium
France:
F English Channel Convoys A Belgium - London
A Belgium - London
A Burgundy - Belgium`,
    expect: { fails: ["lon", "bel", "bur"] },
  },
  {
    id: "6.C.8",
    title: "No self dislodgement in disrupted circular movement",
    orders: `
Turkey:
F Constantinople - Black Sea
A Bulgaria - Constantinople
A Smyrna Supports A Bulgaria - Constantinople
Russia:
F Black Sea - Bulgaria(ec)
Austria:
A Serbia - Bulgaria`,
    expect: { fails: ["con", "bul", "bla", "ser"] },
  },
  {
    id: "6.C.9",
    title: "No help in dislodgement of own unit in disrupted circular movement",
    orders: `
Turkey:
F Constantinople - Black Sea
A Smyrna Supports A Bulgaria - Constantinople
Russia:
F Black Sea - Bulgaria(ec)
Austria:
A Serbia - Bulgaria
A Bulgaria - Constantinople`,
    expect: { fails: ["con", "bla", "ser", "bul"] },
  },
]
