// DATC v3.0 section 6.F — convoys.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.F.1",
    title: "No convoy in coastal areas",
    orders: `
Turkey:
A Greece - Sevastopol
F Aegean Sea Convoys A Greece - Sevastopol
F Constantinople Convoys A Greece - Sevastopol
F Black Sea Convoys A Greece - Sevastopol`,
    expect: { fails: ["gre"] },
  },
  {
    id: "6.F.2",
    title: "An army being convoyed can bounce as normal",
    orders: `
England:
F English Channel Convoys A London - Brest
A London - Brest
France:
A Paris - Brest`,
    expect: { fails: ["lon", "par"] },
  },
  {
    id: "6.F.3",
    title: "An army being convoyed can receive support",
    orders: `
England:
F English Channel Convoys A London - Brest
A London - Brest
F Mid-Atlantic Ocean Supports A London - Brest
France:
A Paris - Brest`,
    expect: { succeeds: ["lon"], fails: ["par"] },
  },
  {
    id: "6.F.4",
    title: "An attacked convoy is not disrupted",
    orders: `
England:
F North Sea Convoys A London - Holland
A London - Holland
Germany:
F Skagerrak - North Sea`,
    expect: { succeeds: ["lon"], fails: ["ska"], notDislodged: ["nth"] },
  },
  {
    id: "6.F.5",
    title: "A beleaguered convoy is not disrupted",
    orders: `
England:
F North Sea Convoys A London - Holland
A London - Holland
France:
F English Channel - North Sea
F Belgium Supports F English Channel - North Sea
Germany:
F Skagerrak - North Sea
F Denmark Supports F Skagerrak - North Sea`,
    expect: { succeeds: ["lon"], fails: ["eng", "ska"], notDislodged: ["nth"] },
  },
  {
    id: "6.F.6",
    title: "Dislodged convoy does not cut support",
    orders: `
England:
F North Sea Convoys A London - Holland
A London - Holland
Germany:
A Holland Supports A Belgium
A Belgium Supports A Holland
F Helgoland Bight Supports F Skagerrak - North Sea
F Skagerrak - North Sea
France:
A Picardy - Belgium
A Burgundy Supports A Picardy - Belgium`,
    expect: {
      succeeds: ["ska", "hol"],
      fails: ["lon", "pic"],
      dislodged: ["nth"],
      notDislodged: ["bel"],
    },
  },
  {
    id: "6.F.7",
    title: "Dislodged convoy does not cause contested area",
    orders: `
England:
F North Sea Convoys A London - Holland
A London - Holland
Germany:
F Helgoland Bight Supports F Skagerrak - North Sea
F Skagerrak - North Sea`,
    retreats: `
England:
F North Sea - Holland`,
    expect: {
      succeeds: ["ska"],
      fails: ["lon"],
      dislodged: ["nth"],
      final: { England: ["A lon", "F hol"], Germany: ["F hel", "F nth"] },
    },
  },
  {
    id: "6.F.8",
    title: "Dislodged convoy does not cause a bounce",
    orders: `
England:
F North Sea Convoys A London - Holland
A London - Holland
Germany:
F Helgoland Bight Supports F Skagerrak - North Sea
F Skagerrak - North Sea
A Belgium - Holland`,
    expect: { succeeds: ["ska", "bel"], fails: ["lon"], dislodged: ["nth"] },
  },
  {
    id: "6.F.9",
    title: "Dislodge of multi-route convoy",
    orders: `
England:
F English Channel Convoys A London - Belgium
F North Sea Convoys A London - Belgium
A London - Belgium
France:
F Brest Supports F Mid-Atlantic Ocean - English Channel
F Mid-Atlantic Ocean - English Channel`,
    expect: { succeeds: ["lon", "mao"], dislodged: ["eng"] },
    note: "Issue 4.A.1: choice b (convoy disrupted only when all routes are disrupted); the army still goes via the North Sea.",
  },
  {
    id: "6.F.10",
    title: "Dislodge of multi-route convoy with foreign fleet",
    orders: `
England:
F North Sea Convoys A London - Belgium
A London - Belgium
Germany:
F English Channel Convoys A London - Belgium
France:
F Brest Supports F Mid-Atlantic Ocean - English Channel
F Mid-Atlantic Ocean - English Channel`,
    expect: { succeeds: ["lon", "mao"], dislodged: ["eng"] },
    note: "Issue 4.A.1: choice b (convoy disrupted only when all routes are disrupted).",
  },
  {
    id: "6.F.11",
    title: "Dislodge of multi-route convoy with only foreign fleets",
    orders: `
England:
A London - Belgium
Germany:
F English Channel Convoys A London - Belgium
Russia:
F North Sea Convoys A London - Belgium
France:
F Brest Supports F Mid-Atlantic Ocean - English Channel
F Mid-Atlantic Ocean - English Channel`,
    expect: { succeeds: ["lon", "mao"], dislodged: ["eng"] },
    note: "Issue 4.A.1: choice b (convoy disrupted only when all routes are disrupted).",
  },
  {
    id: "6.F.12",
    title: "Dislodged convoying fleet not on route",
    orders: `
England:
F English Channel Convoys A London - Belgium
A London - Belgium
F Irish Sea Convoys A London - Belgium
France:
F North Atlantic Ocean Supports F Mid-Atlantic Ocean - Irish Sea
F Mid-Atlantic Ocean - Irish Sea`,
    expect: { succeeds: ["lon", "mao"], dislodged: ["iri"] },
  },
  {
    id: "6.F.13",
    title: "The unwanted alternative",
    orders: `
England:
A London - Belgium
F North Sea Convoys A London - Belgium
France:
F English Channel Convoys A London - Belgium
Germany:
F Holland Supports F Denmark - North Sea
F Denmark - North Sea`,
    expect: { succeeds: ["lon", "den"], dislodged: ["nth"] },
    note: "Issue 4.A.1: choice b; the army still convoys via the English Channel after the North Sea fleet is dislodged.",
  },
  {
    id: "6.F.14",
    title: "Simple convoy paradox",
    orders: `
England:
F London Supports F Wales - English Channel
F Wales - English Channel
France:
A Brest - London
F English Channel Convoys A Brest - London`,
    expect: { succeeds: ["wal", "lon"], fails: ["bre"], dislodged: ["eng"] },
    note: "Issue 4.A.2: support of London is not cut; same result under the 2000 rule and Szykman.",
  },
  {
    id: "6.F.15",
    title: "Simple convoy paradox with additional convoy",
    orders: `
England:
F London Supports F Wales - English Channel
F Wales - English Channel
France:
A Brest - London
F English Channel Convoys A Brest - London
Italy:
F Irish Sea Convoys A North Africa - Wales
F Mid-Atlantic Ocean Convoys A North Africa - Wales
A North Africa - Wales`,
    expect: { succeeds: ["wal", "naf", "lon"], fails: ["bre"], dislodged: ["eng"] },
    note: "Issue 4.A.2: paradox resolved only for the paradox core; same result under the 2000 rule and Szykman.",
  },
  {
    id: "6.F.16",
    title: "Pandin's paradox",
    orders: `
England:
F London Supports F Wales - English Channel
F Wales - English Channel
France:
A Brest - London
F English Channel Convoys A Brest - London
Germany:
F North Sea Supports F Belgium - English Channel
F Belgium - English Channel`,
    expect: { fails: ["wal", "bre", "bel"], notDislodged: ["eng"] },
    note: "Issue 4.A.2: same result under the 2000 rule and Szykman.",
  },
  {
    id: "6.F.17",
    title: "Pandin's extended paradox",
    orders: `
England:
F London Supports F Wales - English Channel
F Wales - English Channel
France:
A Brest - London
F English Channel Convoys A Brest - London
F Yorkshire Supports A Brest - London
Germany:
F North Sea Supports F Belgium - English Channel
F Belgium - English Channel`,
    expect: { succeeds: ["bre"], fails: ["wal", "bel"], dislodged: ["lon"], notDislodged: ["eng"] },
    note: "Issue 4.A.2: follows the 2000 rulebook answer, not DATC's preferred Szykman answer: the convoyed army does not cut London's support (it supports an attack on a necessary convoying fleet), so the English Channel fleet is not dislodged, the convoy succeeds and the army dislodges the fleet in London. This is the one case where the 2000 rule and Szykman differ.",
  },
  {
    id: "6.F.18",
    title: "Betrayal paradox",
    orders: `
England:
F North Sea Convoys A London - Belgium
A London - Belgium
F English Channel Supports A London - Belgium
France:
F Belgium Supports F North Sea
Germany:
F Helgoland Bight Supports F Skagerrak - North Sea
F Skagerrak - North Sea`,
    expect: { fails: ["lon", "ska"], notDislodged: ["nth", "bel"] },
    note: "Issue 4.A.2: the 2000 rule gives no answer, so the Szykman backup applies: the convoy fails, the French support in Belgium is not cut, and the North Sea fleet is not dislodged.",
  },
  {
    id: "6.F.19",
    title: "Multi-route convoy disruption paradox",
    orders: `
France:
A Tunis - Naples
F Tyrrhenian Sea Convoys A Tunis - Naples
F Ionian Sea Convoys A Tunis - Naples
Italy:
F Naples Supports F Rome - Tyrrhenian Sea
F Rome - Tyrrhenian Sea`,
    expect: { fails: ["tun", "rom", "nap"], notDislodged: ["tys"] },
    note: "Issues 4.A.1 (choice b) and 4.A.2: the Tyrrhenian fleet is not necessary, so the convoyed army cuts Naples' support; the fleet in Rome fails. The Tunis army also fails (bounces on the Naples fleet, which holds).",
  },
  {
    id: "6.F.20",
    title: "Unwanted multi-route convoy paradox",
    orders: `
France:
A Tunis - Naples
F Tyrrhenian Sea Convoys A Tunis - Naples
Italy:
F Naples Supports F Ionian Sea
F Ionian Sea Convoys A Tunis - Naples
Turkey:
F Aegean Sea Supports F Eastern Mediterranean - Ionian Sea
F Eastern Mediterranean - Ionian Sea`,
    expect: { succeeds: ["eas"], fails: ["nap", "tun"], dislodged: ["ion"] },
    note: "Issues 4.A.1 (choice b) and 4.A.2: Naples' support is cut by the convoyed army, so the Ionian fleet is dislodged. The Tunis army still bounces on the Naples fleet.",
  },
  {
    id: "6.F.21",
    title: "Dad's army convoy",
    orders: `
Russia:
A Edinburgh Supports A Norway - Clyde
F Norwegian Sea Convoys A Norway - Clyde
A Norway - Clyde
France:
F Irish Sea Supports F Mid-Atlantic Ocean - North Atlantic Ocean
F Mid-Atlantic Ocean - North Atlantic Ocean
England:
A Liverpool - Clyde via convoy
F North Atlantic Ocean Convoys A Liverpool - Clyde
F Clyde Supports F North Atlantic Ocean`,
    expect: {
      succeeds: ["mao", "nwy"],
      fails: ["lvp", "cly"],
      dislodged: ["nao", "cly"],
    },
    note: "Issue 4.A.2: no paradox (the support is not an attack on a convoying fleet), so the convoyed Norway army cuts Clyde's support; the North Atlantic fleet is dislodged (DATC preferred). The Norway army also dislodges the Clyde fleet.",
  },
  {
    id: "6.F.22",
    title: "Second order paradox with two resolutions",
    orders: `
England:
F Edinburgh - North Sea
F London Supports F Edinburgh - North Sea
France:
A Brest - London
F English Channel Convoys A Brest - London
Germany:
F Belgium Supports F Picardy - English Channel
F Picardy - English Channel
Russia:
A Norway - Belgium
F North Sea Convoys A Norway - Belgium`,
    expect: {
      succeeds: ["edi", "pic", "lon", "bel"],
      fails: ["bre", "nwy"],
      dislodged: ["eng", "nth"],
    },
    note: "Issue 4.A.2: the 2000 rule gives no answer; Szykman backup: supports are not cut, convoying armies fail.",
  },
  {
    id: "6.F.23",
    title: "Second order paradox with two exclusive convoys",
    orders: `
England:
F Edinburgh - North Sea
F Yorkshire Supports F Edinburgh - North Sea
France:
A Brest - London
F English Channel Convoys A Brest - London
Germany:
F Belgium Supports F English Channel
F London Supports F North Sea
Italy:
F Mid-Atlantic Ocean - English Channel
F Irish Sea Supports F Mid-Atlantic Ocean - English Channel
Russia:
A Norway - Belgium
F North Sea Convoys A Norway - Belgium`,
    expect: {
      succeeds: ["bel", "lon"],
      fails: ["bre", "nwy", "edi", "mao"],
      notDislodged: ["eng", "nth"],
    },
    note: "Issue 4.A.2: the 2000 rule gives no answer; Szykman backup: convoying armies fail, supports are not cut, no fleet moves.",
  },
  {
    id: "6.F.24",
    title: "Second order paradox with no resolution",
    orders: `
England:
F Edinburgh - North Sea
F London Supports F Edinburgh - North Sea
F Irish Sea - English Channel
F Mid-Atlantic Ocean Supports F Irish Sea - English Channel
France:
A Brest - London
F English Channel Convoys A Brest - London
F Belgium Supports F English Channel
Russia:
A Norway - Belgium
F North Sea Convoys A Norway - Belgium`,
    expect: {
      succeeds: ["edi", "lon", "bel"],
      fails: ["bre", "nwy", "iri"],
      dislodged: ["nth"],
      notDislodged: ["eng"],
    },
    note: "Issue 4.A.2: the 2000 rule gives no answer; Szykman backup: supports are not cut, convoying armies fail.",
  },
  {
    id: "6.F.25",
    title: "Cut support last",
    orders: `
Germany:
A Ruhr - Belgium
A Holland Supports A Ruhr - Belgium
A Denmark - Norway
F Skagerrak Convoys A Denmark - Norway
A Finland Supports A Denmark - Norway
England:
A Yorkshire - Holland
F North Sea Convoys A Yorkshire - Holland
F Helgoland Bight Supports A Yorkshire - Holland
A Belgium Hold
Russia:
F Norwegian Sea - North Sea
F Norway Supports F Norwegian Sea - North Sea
F Sweden - Skagerrak`,
    expect: {
      succeeds: ["den", "yor"],
      fails: ["swe", "nwg", "ruh", "nwy", "hol"],
      dislodged: ["nwy", "hol"],
      notDislodged: ["bel"],
    },
    note: "DATC writes 'Rhur' and omits unit letters in supports; normalised to 'Ruhr' and 'A'/'F' for the parser.",
  },
]
