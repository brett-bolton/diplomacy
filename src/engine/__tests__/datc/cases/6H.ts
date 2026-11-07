// DATC v3.0 section 6.H — retreating.
// Where DATC gives no retreat order (it only states that a retreat is not allowed),
// an illegal retreat order is added so the engine has to reject it.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.H.1",
    title: "No supports during retreat",
    orders: `
Austria:
F Trieste Hold
A Serbia Hold
Turkey:
F Greece Hold
Italy:
A Venice Supports A Tyrolia - Trieste
A Tyrolia - Trieste
F Ionian Sea - Greece
F Aegean Sea Supports F Ionian Sea - Greece`,
    retreats: `
Austria:
F Trieste - Albania
A Serbia Supports F Trieste - Albania
Turkey:
F Greece - Albania`,
    expect: {
      succeeds: ["tyr", "ion"],
      dislodged: ["tri", "gre"],
      final: {
        Austria: ["A ser"],
        Turkey: [],
        Italy: ["A ven", "A tri", "F gre", "F aeg"],
      },
    },
  },
  {
    id: "6.H.2",
    title: "No supports from retreating unit",
    orders: `
England:
A Liverpool - Edinburgh
F Yorkshire Supports A Liverpool - Edinburgh
F Norway Hold
Germany:
A Kiel Supports A Ruhr - Holland
A Ruhr - Holland
Russia:
F Edinburgh Hold
A Sweden Supports A Finland - Norway
A Finland - Norway
F Holland Hold`,
    retreats: `
England:
F Norway - North Sea
Russia:
F Edinburgh - North Sea
F Holland Supports F Edinburgh - North Sea`,
    expect: {
      succeeds: ["lvp", "ruh", "fin"],
      dislodged: ["nwy", "edi", "hol"],
      final: {
        England: ["A edi", "F yor"],
        Germany: ["A kie", "A hol"],
        Russia: ["A swe", "A nwy"],
      },
    },
  },
  {
    id: "6.H.3",
    title: "No convoy during retreat",
    orders: `
England:
F North Sea Hold
A Holland Hold
Germany:
F Kiel Supports A Ruhr - Holland
A Ruhr - Holland`,
    retreats: `
England:
A Holland - Yorkshire
F North Sea Convoys A Holland - Yorkshire`,
    expect: {
      succeeds: ["ruh"],
      dislodged: ["hol"],
      final: { England: ["F nth"], Germany: ["F kie", "A hol"] },
    },
  },
  {
    id: "6.H.4",
    title: "No other moves during retreat",
    orders: `
England:
F North Sea Hold
A Holland Hold
Germany:
F Kiel Supports A Ruhr - Holland
A Ruhr - Holland`,
    retreats: `
England:
A Holland - Belgium
F North Sea - Norwegian Sea`,
    expect: {
      succeeds: ["ruh"],
      dislodged: ["hol"],
      notDislodged: ["nth"],
      final: { England: ["A bel", "F nth"], Germany: ["F kie", "A hol"] },
    },
  },
  {
    id: "6.H.5",
    title: "A unit may not retreat to the area from which it is attacked",
    orders: `
Russia:
F Constantinople Supports F Black Sea - Ankara
F Black Sea - Ankara
Turkey:
F Ankara Hold`,
    retreats: `
Turkey:
F Ankara - Black Sea`,
    expect: {
      succeeds: ["bla"],
      dislodged: ["ank"],
      final: { Russia: ["F ank", "F con"], Turkey: [] },
    },
    note: "DATC gives no retreat order; an illegal retreat to the attacker's origin was added.",
  },
  {
    id: "6.H.6",
    title: "Unit may not retreat to a contested area",
    orders: `
Austria:
A Budapest Supports A Trieste - Vienna
A Trieste - Vienna
Germany:
A Munich - Bohemia
A Silesia - Bohemia
Italy:
A Vienna Hold`,
    retreats: `
Italy:
A Vienna - Bohemia`,
    expect: {
      succeeds: ["tri"],
      fails: ["mun", "sil"],
      dislodged: ["vie"],
      final: {
        Austria: ["A bud", "A vie"],
        Germany: ["A mun", "A sil"],
        Italy: [],
      },
    },
    note: "DATC gives no retreat order; an illegal retreat to the contested area was added.",
  },
  {
    id: "6.H.7",
    title: "Multiple retreat to same area will disband units",
    orders: `
Austria:
A Budapest Supports A Trieste - Vienna
A Trieste - Vienna
Germany:
A Munich Supports A Silesia - Bohemia
A Silesia - Bohemia
Italy:
A Vienna Hold
A Bohemia Hold`,
    retreats: `
Italy:
A Bohemia - Tyrolia
A Vienna - Tyrolia`,
    expect: {
      succeeds: ["tri", "sil"],
      dislodged: ["vie", "boh"],
      final: {
        Austria: ["A bud", "A vie"],
        Germany: ["A mun", "A boh"],
        Italy: [],
      },
    },
  },
  {
    id: "6.H.8",
    title: "Triple retreat to same area will disband units",
    orders: `
England:
A Liverpool - Edinburgh
F Yorkshire Supports A Liverpool - Edinburgh
F Norway Hold
Germany:
A Kiel Supports A Ruhr - Holland
A Ruhr - Holland
Russia:
F Edinburgh Hold
A Sweden Supports A Finland - Norway
A Finland - Norway
F Holland Hold`,
    retreats: `
England:
F Norway - North Sea
Russia:
F Edinburgh - North Sea
F Holland - North Sea`,
    expect: {
      succeeds: ["lvp", "ruh", "fin"],
      dislodged: ["nwy", "edi", "hol"],
      final: {
        England: ["A edi", "F yor"],
        Germany: ["A kie", "A hol"],
        Russia: ["A swe", "A nwy"],
      },
    },
  },
  {
    id: "6.H.9",
    title: "Dislodged unit will not make attackers area contested",
    orders: `
England:
F Helgoland Bight - Kiel
F Denmark Supports F Helgoland Bight - Kiel
Germany:
A Berlin - Prussia
F Kiel Hold
A Silesia Supports A Berlin - Prussia
Russia:
A Prussia - Berlin`,
    retreats: `
Germany:
F Kiel - Berlin`,
    expect: {
      succeeds: ["hel", "ber"],
      fails: ["pru"],
      dislodged: ["kie", "pru"],
      final: {
        England: ["F kie", "F den"],
        Germany: ["A pru", "A sil", "F ber"],
        Russia: [],
      },
    },
    note: "DATC gives no retreat order; the fleet's retreat to Berlin was added. Russia's dislodged army in Prussia gets no retreat order and is disbanded.",
  },
  {
    id: "6.H.10",
    title: "Not retreating to attacker does not mean contested",
    orders: `
England:
A Kiel Hold
Germany:
A Berlin - Kiel
A Munich Supports A Berlin - Kiel
A Prussia Hold
Russia:
A Warsaw - Prussia
A Silesia Supports A Warsaw - Prussia`,
    retreats: `
England:
A Kiel - Berlin
Germany:
A Prussia - Berlin`,
    expect: {
      succeeds: ["ber", "war"],
      dislodged: ["kie", "pru"],
      final: {
        England: [],
        Germany: ["A kie", "A mun", "A ber"],
        Russia: ["A pru", "A sil"],
      },
    },
  },
  {
    id: "6.H.11",
    title: "Retreat when dislodged by adjacent convoy",
    orders: `
France:
A Gascony - Marseilles via convoy
A Burgundy Supports A Gascony - Marseilles
F Mid-Atlantic Ocean Convoys A Gascony - Marseilles
F Western Mediterranean Convoys A Gascony - Marseilles
F Gulf of Lyon Convoys A Gascony - Marseilles
Italy:
A Marseilles Hold`,
    retreats: `
Italy:
A Marseilles - Gascony`,
    expect: {
      succeeds: ["gas"],
      dislodged: ["mar"],
      final: {
        France: ["A mar", "A bur", "F mao", "F wes", "F lyo"],
        Italy: ["A gas"],
      },
    },
    note: "Issue 4.A.5: may retreat to the attacker's origin when the attack was convoyed. DATC gives no retreat order; the retreat to Gascony was added.",
  },
  {
    id: "6.H.12",
    title: "Retreat when dislodged by adjacent convoy while trying to do the same",
    orders: `
England:
A Liverpool - Edinburgh via convoy
F Irish Sea Convoys A Liverpool - Edinburgh
F English Channel Convoys A Liverpool - Edinburgh
F North Sea Convoys A Liverpool - Edinburgh
France:
F Brest - English Channel
F Mid-Atlantic Ocean Supports F Brest - English Channel
Russia:
A Edinburgh - Liverpool via convoy
F Norwegian Sea Convoys A Edinburgh - Liverpool
F North Atlantic Ocean Convoys A Edinburgh - Liverpool
A Clyde Supports A Edinburgh - Liverpool`,
    retreats: `
England:
A Liverpool - Edinburgh`,
    expect: {
      succeeds: ["bre", "edi"],
      fails: ["lvp"],
      dislodged: ["lvp", "eng"],
      final: {
        England: ["A edi", "F iri", "F nth"],
        France: ["F eng", "F mao"],
        Russia: ["A lvp", "F nwg", "F nao", "A cly"],
      },
    },
    note: "Issue 4.A.5: may retreat to the attacker's origin when the attack was convoyed. DATC gives no retreat order; the retreat to Edinburgh was added. The dislodged English Channel fleet gets no retreat order and is disbanded.",
  },
  {
    id: "6.H.13",
    title: "No retreat with convoy in movement phase",
    orders: `
England:
A Picardy Hold
F English Channel Convoys A Picardy - London
France:
A Paris - Picardy
A Brest Supports A Paris - Picardy`,
    retreats: `
England:
A Picardy - London`,
    expect: {
      succeeds: ["par"],
      dislodged: ["pic"],
      final: { England: ["F eng"], France: ["A pic", "A bre"] },
    },
    note: "DATC gives no retreat order; the illegal retreat to London was added.",
  },
  {
    id: "6.H.14",
    title: "No retreat with support in movement phase",
    orders: `
England:
A Picardy Hold
F English Channel Supports A Picardy - Belgium
France:
A Paris - Picardy
A Brest Supports A Paris - Picardy
A Burgundy Hold
Germany:
A Munich Supports A Marseilles - Burgundy
A Marseilles - Burgundy`,
    retreats: `
England:
A Picardy - Belgium
France:
A Burgundy - Belgium`,
    expect: {
      succeeds: ["par", "mar"],
      dislodged: ["pic", "bur"],
      final: {
        England: ["F eng"],
        France: ["A pic", "A bre"],
        Germany: ["A mun", "A bur"],
      },
    },
  },
  {
    id: "6.H.15",
    title: "No coastal crawl in retreat",
    orders: `
England:
F Portugal Hold
France:
F Spain(sc) - Portugal
F Mid-Atlantic Ocean Supports F Spain(sc) - Portugal`,
    retreats: `
England:
F Portugal - Spain(nc)`,
    expect: {
      succeeds: ["spa"],
      dislodged: ["por"],
      final: { England: [], France: ["F por", "F mao"] },
    },
    note: "DATC gives no retreat order; the illegal retreat to Spain(nc) was added.",
  },
  {
    id: "6.H.16",
    title: "Contested for both coasts",
    orders: `
France:
F Mid-Atlantic Ocean - Spain(nc)
F Gascony - Spain(nc)
F Western Mediterranean Hold
Italy:
F Tunis Supports F Tyrrhenian Sea - Western Mediterranean
F Tyrrhenian Sea - Western Mediterranean`,
    retreats: `
France:
F Western Mediterranean - Spain(sc)`,
    expect: {
      succeeds: ["tys"],
      fails: ["mao", "gas"],
      dislodged: ["wes"],
      final: { France: ["F mao", "F gas"], Italy: ["F tun", "F wes"] },
    },
    note: "DATC gives no retreat order; the illegal retreat to Spain(sc) was added.",
  },
]
