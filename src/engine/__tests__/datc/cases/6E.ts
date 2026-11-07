// DATC v3.0 section 6.E — head-to-head battles and beleaguered garrison.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.E.1",
    title: "Dislodged unit has no effect on attacker's area",
    orders: `
Germany:
A Berlin - Prussia
F Kiel - Berlin
A Silesia Supports A Berlin - Prussia
Russia:
A Prussia - Berlin`,
    expect: { succeeds: ["ber", "kie", "sil"], fails: ["pru"], dislodged: ["pru"] },
  },
  {
    id: "6.E.2",
    title: "No self dislodgement in head-to-head battle",
    orders: `
Germany:
A Berlin - Kiel
F Kiel - Berlin
A Munich Supports A Berlin - Kiel`,
    expect: { fails: ["ber", "kie"], notDislodged: ["ber", "kie"] },
  },
  {
    id: "6.E.3",
    title: "No help in dislodging own unit",
    orders: `
Germany:
A Berlin - Kiel
A Munich Supports F Kiel - Berlin
England:
F Kiel - Berlin`,
    expect: { fails: ["ber", "kie"], notDislodged: ["ber", "kie"] },
  },
  {
    id: "6.E.4",
    title: "Non-dislodged loser still has effect",
    orders: `
Germany:
F Holland - North Sea
F Helgoland Bight Supports F Holland - North Sea
F Skagerrak Supports F Holland - North Sea
France:
F North Sea - Holland
F Belgium Supports F North Sea - Holland
England:
F Edinburgh Supports F Norwegian Sea - North Sea
F Yorkshire Supports F Norwegian Sea - North Sea
F Norwegian Sea - North Sea
Austria:
A Kiel Supports A Ruhr - Holland
A Ruhr - Holland`,
    expect: {
      fails: ["hol", "nth", "nwg", "ruh"],
      notDislodged: ["nth", "hol"],
    },
  },
  {
    id: "6.E.5",
    title: "Loser dislodged by another army still has effect",
    orders: `
Germany:
F Holland - North Sea
F Helgoland Bight Supports F Holland - North Sea
F Skagerrak Supports F Holland - North Sea
France:
F North Sea - Holland
F Belgium Supports F North Sea - Holland
England:
F Edinburgh Supports F Norwegian Sea - North Sea
F Yorkshire Supports F Norwegian Sea - North Sea
F Norwegian Sea - North Sea
F London Supports F Norwegian Sea - North Sea
Austria:
A Kiel Supports A Ruhr - Holland
A Ruhr - Holland`,
    expect: {
      succeeds: ["nwg"],
      fails: ["hol", "nth", "ruh"],
      dislodged: ["nth"],
      notDislodged: ["hol"],
    },
  },
  {
    id: "6.E.6",
    title: "Not dislodge because of own support still has effect",
    orders: `
Germany:
F Holland - North Sea
F Helgoland Bight Supports F Holland - North Sea
France:
F North Sea - Holland
F Belgium Supports F North Sea - Holland
F English Channel Supports F Holland - North Sea
Austria:
A Kiel Supports A Ruhr - Holland
A Ruhr - Holland`,
    expect: { fails: ["hol", "nth", "ruh"], notDislodged: ["nth", "hol"] },
  },
  {
    id: "6.E.7",
    title: "No self dislodgement with beleaguered garrison",
    orders: `
England:
F North Sea Hold
F Yorkshire Supports F Norway - North Sea
Germany:
F Holland Supports F Helgoland Bight - North Sea
F Helgoland Bight - North Sea
Russia:
F Skagerrak Supports F Norway - North Sea
F Norway - North Sea`,
    expect: { fails: ["nwy", "hel"], notDislodged: ["nth"] },
  },
  {
    id: "6.E.8",
    title: "No self dislodgement with beleaguered garrison and head-to-head battle",
    orders: `
England:
F North Sea - Norway
F Yorkshire Supports F Norway - North Sea
Germany:
F Holland Supports F Helgoland Bight - North Sea
F Helgoland Bight - North Sea
Russia:
F Skagerrak Supports F Norway - North Sea
F Norway - North Sea`,
    expect: { fails: ["nth", "nwy", "hel"], notDislodged: ["nth", "nwy"] },
  },
  {
    id: "6.E.9",
    title: "Almost self dislodgement with beleaguered garrison",
    orders: `
England:
F North Sea - Norwegian Sea
F Yorkshire Supports F Norway - North Sea
Germany:
F Holland Supports F Helgoland Bight - North Sea
F Helgoland Bight - North Sea
Russia:
F Skagerrak Supports F Norway - North Sea
F Norway - North Sea`,
    expect: { succeeds: ["nth", "nwy"], fails: ["hel"] },
  },
  {
    id: "6.E.10",
    title: "Almost circular movement with no self dislodgement with beleaguered garrison",
    orders: `
England:
F North Sea - Denmark
F Yorkshire Supports F Norway - North Sea
Germany:
F Holland Supports F Helgoland Bight - North Sea
F Helgoland Bight - North Sea
F Denmark - Helgoland Bight
Russia:
F Skagerrak Supports F Norway - North Sea
F Norway - North Sea`,
    expect: { fails: ["nth", "hel", "den", "nwy"] },
  },
  {
    id: "6.E.11",
    title: "No self dislodgement with beleaguered garrison, unit swap with adjacent convoying and two coasts",
    orders: `
France:
A Spain - Portugal via convoy
F Mid-Atlantic Ocean Convoys A Spain - Portugal
F Gulf of Lyon Supports F Portugal - Spain(nc)
Germany:
A Marseilles Supports A Gascony - Spain
A Gascony - Spain
Italy:
F Portugal - Spain(nc)
F Western Mediterranean Supports F Portugal - Spain(nc)`,
    expect: { succeeds: ["spa", "por"], fails: ["gas"] },
    note: "Swap by convoy is explicit via 'via convoy' (issue 4.A.3 adjacent convoys); both units swap, so no beleaguered garrison remains.",
  },
  {
    id: "6.E.12",
    title: "Support on attack on own unit can be used for other means",
    orders: `
Austria:
A Budapest - Rumania
A Serbia Supports A Vienna - Budapest
Italy:
A Vienna - Budapest
Russia:
A Galicia - Budapest
A Rumania Supports A Galicia - Budapest`,
    expect: { fails: ["bud", "vie", "gal"] },
  },
  {
    id: "6.E.13",
    title: "Three way beleaguered garrison",
    orders: `
England:
F Edinburgh Supports F Yorkshire - North Sea
F Yorkshire - North Sea
France:
F Belgium - North Sea
F English Channel Supports F Belgium - North Sea
Germany:
F North Sea Hold
Russia:
F Norwegian Sea - North Sea
F Norway Supports F Norwegian Sea - North Sea`,
    expect: { fails: ["yor", "bel", "nwg"], notDislodged: ["nth"] },
  },
  {
    id: "6.E.14",
    title: "Illegal head-to-head battle can still defend",
    orders: `
England:
A Liverpool - Edinburgh
Russia:
F Edinburgh - Liverpool`,
    expect: { fails: ["lvp", "edi"] },
  },
  {
    id: "6.E.15",
    title: "The friendly head-to-head battle",
    orders: `
England:
F Holland Supports A Ruhr - Kiel
A Ruhr - Kiel
France:
A Kiel - Berlin
A Munich Supports A Kiel - Berlin
A Silesia Supports A Kiel - Berlin
Germany:
A Berlin - Kiel
F Denmark Supports A Berlin - Kiel
F Helgoland Bight Supports A Berlin - Kiel
Russia:
F Baltic Sea Supports A Prussia - Berlin
A Prussia - Berlin`,
    expect: { fails: ["ruh", "kie", "ber", "pru"] },
  },
]
