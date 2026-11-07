// DATC v3.0 section 6.G — convoying to adjacent provinces.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.G.1",
    title: "Two units can swap provinces by convoy",
    orders: `
England:
A Norway - Sweden
F Skagerrak Convoys A Norway - Sweden
Russia:
A Sweden - Norway`,
    expect: { succeeds: ["nwy", "swe"] },
    note: "Issue 4.A.3: a convoying fleet of the same country shows convoy intent, so the armies swap.",
  },
  {
    id: "6.G.2",
    title: "Kidnapping an army",
    orders: `
England:
A Norway - Sweden
Russia:
F Sweden - Norway
Germany:
F Skagerrak Convoys A Norway - Sweden`,
    expect: { fails: ["nwy", "swe"] },
    note: "Issue 4.A.3: a foreign fleet cannot force a convoy; the moves are a head-to-head bounce.",
  },
  {
    id: "6.G.3",
    title: "An unwanted disrupted convoy to adjacent province",
    orders: `
France:
F Brest - English Channel
A Picardy - Belgium
A Burgundy Supports A Picardy - Belgium
F Mid-Atlantic Ocean Supports F Brest - English Channel
England:
F English Channel Convoys A Picardy - Belgium`,
    expect: { succeeds: ["bre", "pic"], dislodged: ["eng"] },
    note: "Issue 4.A.3: the convoy is only used if intent is clear; the army moves by land.",
  },
  {
    id: "6.G.4",
    title: "An unwanted disrupted convoy to adjacent province and opposite move",
    orders: `
France:
F Brest - English Channel
A Picardy - Belgium
A Burgundy Supports A Picardy - Belgium
F Mid-Atlantic Ocean Supports F Brest - English Channel
England:
F English Channel Convoys A Picardy - Belgium
A Belgium - Picardy`,
    expect: { succeeds: ["bre", "pic"], fails: ["bel"], dislodged: ["eng", "bel"] },
    note: "Issue 4.A.3: the foreign convoy is ignored, so the French army moves by land.",
  },
  {
    id: "6.G.5",
    title: "Swapping with multiple fleets with one own fleet",
    orders: `
Italy:
A Rome - Apulia
F Tyrrhenian Sea Convoys A Apulia - Rome
Turkey:
A Apulia - Rome
F Ionian Sea Convoys A Apulia - Rome`,
    expect: { succeeds: ["rom", "apu"] },
    note: "Issue 4.A.3: one own convoying fleet is enough to show intent, so the armies swap.",
  },
  {
    id: "6.G.6",
    title: "Swapping with unintended intent",
    orders: `
England:
A Liverpool - Edinburgh
F English Channel Convoys A Liverpool - Edinburgh
Germany:
A Edinburgh - Liverpool
France:
F Irish Sea Hold
F North Sea Hold
Russia:
F Norwegian Sea Convoys A Liverpool - Edinburgh
F North Atlantic Ocean Convoys A Liverpool - Edinburgh`,
    expect: { succeeds: ["lvp", "edi"] },
    note: "Issue 4.A.3: England's own convoy order shows intent; the armies swap via the Russian fleets.",
  },
  {
    id: "6.G.7",
    title: "Swapping with illegal intent",
    orders: `
England:
F Skagerrak Convoys A Sweden - Norway
F Norway - Sweden
Russia:
A Sweden - Norway
F Gulf of Bothnia Convoys A Sweden - Norway`,
    expect: { fails: ["swe", "nwy"] },
    note: "Issues 4.A.3 and 4.E.1: impossible orders are ignored, so there is no intent to convoy.",
  },
  {
    id: "6.G.8",
    title: "Explicit convoy that isn't there",
    orders: `
France:
A Belgium - Holland via convoy
England:
F North Sea - Helgoland Bight
A Holland - Kiel`,
    expect: { fails: ["bel"], succeeds: ["nth", "hol"] },
    note: "Issue 4.A.3: no land-route fallback for an explicit convoy that is not there.",
  },
  {
    id: "6.G.9",
    title: "Swapped or dislodged?",
    orders: `
England:
A Norway - Sweden
F Skagerrak Convoys A Norway - Sweden
F Finland Supports A Norway - Sweden
Russia:
A Sweden - Norway`,
    expect: { succeeds: ["nwy", "swe"], notDislodged: ["swe"] },
    note: "Issue 4.A.3: the own convoying fleet makes the move a convoy, so the armies swap.",
  },
  {
    id: "6.G.10",
    title: "Swapped or an head-to-head battle?",
    orders: `
England:
A Norway - Sweden via convoy
F Denmark Supports A Norway - Sweden
F Finland Supports A Norway - Sweden
Germany:
F Skagerrak Convoys A Norway - Sweden
Russia:
A Sweden - Norway
F Barents Sea Supports A Sweden - Norway
France:
F Norwegian Sea - Norway
F North Sea Supports F Norwegian Sea - Norway`,
    expect: { succeeds: ["nwy"], fails: ["swe", "nwg"], dislodged: ["swe"] },
    note: "Issue 4.A.7 choice b: the dislodged army in Sweden still bounces the fleet in the Norwegian Sea.",
  },
  {
    id: "6.G.11",
    title: "A convoy to an adjacent province with a paradox",
    orders: `
England:
F Norway Supports F North Sea - Skagerrak
F North Sea - Skagerrak
Russia:
A Sweden - Norway
F Skagerrak Convoys A Sweden - Norway
F Barents Sea Supports A Sweden - Norway`,
    expect: { succeeds: ["nth"], fails: ["swe"], dislodged: ["ska"], notDislodged: ["nwy"] },
    note: "Issues 4.A.2 and 4.A.3: no land-route fallback, so this is a plain convoy paradox.",
  },
  {
    id: "6.G.12",
    title: "Swapping two units with two convoys",
    orders: `
England:
A Liverpool - Edinburgh via convoy
F North Atlantic Ocean Convoys A Liverpool - Edinburgh
F Norwegian Sea Convoys A Liverpool - Edinburgh
Germany:
A Edinburgh - Liverpool via convoy
F North Sea Convoys A Edinburgh - Liverpool
F English Channel Convoys A Edinburgh - Liverpool
F Irish Sea Convoys A Edinburgh - Liverpool`,
    expect: { succeeds: ["lvp", "edi"] },
  },
  {
    id: "6.G.13",
    title: "Support cut on attack on itself via convoy",
    orders: `
Austria:
F Adriatic Sea Convoys A Trieste - Venice
A Trieste - Venice via convoy
Italy:
A Venice Supports F Albania - Trieste
F Albania - Trieste`,
    expect: { succeeds: ["alb", "ven"], fails: ["tri"], dislodged: ["tri"] },
    note: "Issues 4.A.3 and 4.A.4: the convoyed attack does not cut the support in Venice.",
  },
  {
    id: "6.G.14",
    title: "Bounce by convoy to adjacent province",
    orders: `
England:
A Norway - Sweden
F Denmark Supports A Norway - Sweden
F Finland Supports A Norway - Sweden
France:
F Norwegian Sea - Norway
F North Sea Supports F Norwegian Sea - Norway
Germany:
F Skagerrak Convoys A Sweden - Norway
Russia:
A Sweden - Norway via convoy
F Barents Sea Supports A Sweden - Norway`,
    expect: { succeeds: ["nwy"], fails: ["swe", "nwg"], dislodged: ["swe"] },
    note: "Issue 4.A.7 choice b: the dislodged army in Sweden still bounces the fleet in the Norwegian Sea.",
  },
  {
    id: "6.G.15",
    title: "Bounce and dislodge with double convoy",
    orders: `
England:
F North Sea Convoys A London - Belgium
A Holland Supports A London - Belgium
A Yorkshire - London
A London - Belgium via convoy
France:
F English Channel Convoys A Belgium - London
A Belgium - London via convoy`,
    expect: { succeeds: ["lon"], fails: ["bel", "yor"], dislodged: ["bel"] },
    note: "Issue 4.A.7 choice b: the dislodged army in Belgium still bounces the army from Yorkshire.",
  },
  {
    id: "6.G.16",
    title: "The two unit in one area bug, moving by convoy",
    orders: `
England:
A Norway - Sweden
A Denmark Supports A Norway - Sweden
F Baltic Sea Supports A Norway - Sweden
F North Sea - Norway
Russia:
A Sweden - Norway via convoy
F Skagerrak Convoys A Sweden - Norway
F Norwegian Sea Supports A Sweden - Norway`,
    expect: { succeeds: ["nwy", "swe"], fails: ["nth"] },
  },
  {
    id: "6.G.17",
    title: "The two unit in one area bug, moving over land",
    orders: `
England:
A Norway - Sweden via convoy
A Denmark Supports A Norway - Sweden
F Baltic Sea Supports A Norway - Sweden
F Skagerrak Convoys A Norway - Sweden
F North Sea - Norway
Russia:
A Sweden - Norway
F Norwegian Sea Supports A Sweden - Norway`,
    expect: { succeeds: ["nwy", "swe"], fails: ["nth"] },
  },
  {
    id: "6.G.18",
    title: "The two unit in one area bug, with double convoy",
    orders: `
England:
F North Sea Convoys A London - Belgium
A Holland Supports A London - Belgium
A Yorkshire - London
A London - Belgium
A Ruhr Supports A London - Belgium
France:
F English Channel Convoys A Belgium - London
A Belgium - London
A Wales Supports A Belgium - London`,
    expect: { succeeds: ["lon", "bel"], fails: ["yor"] },
    note: "Issue 4.A.3: own convoying fleets show intent, so London and Belgium swap.",
  },
  {
    id: "6.G.19",
    title: "Swapping with intent of unnecessary convoy",
    orders: `
France:
A Marseilles - Spain
F Western Mediterranean Convoys A Marseilles - Spain
Italy:
F Gulf of Lyon Convoys A Marseilles - Spain
A Spain - Marseilles`,
    expect: { fails: ["mar", "spa"] },
    note: "Issues 4.A.3 and 4.E.1: the unnecessary fleet's order is illegal and the foreign fleet cannot show intent.",
  },
  {
    id: "6.G.20",
    title: "Explicit convoy to adjacent province disrupted",
    orders: `
France:
F Brest - English Channel
A Picardy - Belgium via Convoy
A Burgundy Supports A Picardy - Belgium
F Mid-Atlantic Ocean Supports F Brest - English Channel
England:
F English Channel Convoys A Picardy - Belgium`,
    expect: { succeeds: ["bre"], fails: ["pic"], dislodged: ["eng"] },
    note: "Issue 4.A.3: no land-route fallback when an explicit convoy is disrupted.",
  },
]
