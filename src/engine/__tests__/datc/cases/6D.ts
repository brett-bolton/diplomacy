// DATC v3.0 section 6.D — supports and dislodges.
import type { DatcCase } from "../format"

export const cases: DatcCase[] = [
  {
    id: "6.D.1",
    title: "Supported hold can prevent dislodgement",
    orders: `
Austria:
F Adriatic Sea Supports A Trieste - Venice
A Trieste - Venice
Italy:
A Venice Hold
A Tyrolia Supports A Venice`,
    expect: { succeeds: ["tyr"], fails: ["tri"], notDislodged: ["ven"] },
  },
  {
    id: "6.D.2",
    title: "A move cuts support on hold",
    orders: `
Austria:
F Adriatic Sea Supports A Trieste - Venice
A Trieste - Venice
A Vienna - Tyrolia
Italy:
A Venice Hold
A Tyrolia Supports A Venice`,
    expect: { succeeds: ["adr", "tri"], fails: ["vie", "tyr"], dislodged: ["ven"] },
  },
  {
    id: "6.D.3",
    title: "A move cuts support on move",
    orders: `
Austria:
F Adriatic Sea Supports A Trieste - Venice
A Trieste - Venice
Italy:
A Venice Hold
F Ionian Sea - Adriatic Sea`,
    expect: { fails: ["adr", "tri", "ion"], notDislodged: ["ven", "adr"] },
  },
  {
    id: "6.D.4",
    title: "Support to hold on unit supporting a hold allowed",
    orders: `
Germany:
A Berlin Supports F Kiel
F Kiel Supports A Berlin
Russia:
F Baltic Sea Supports A Prussia - Berlin
A Prussia - Berlin`,
    expect: { succeeds: ["kie"], fails: ["ber", "pru"], notDislodged: ["ber"] },
    note: "Berlin's support is cut by Prussia; Kiel's support to Berlin stands, so the attack bounces.",
  },
  {
    id: "6.D.5",
    title: "Support to hold on unit supporting a move allowed",
    orders: `
Germany:
A Berlin Supports A Munich - Silesia
F Kiel Supports A Berlin
A Munich - Silesia
Russia:
F Baltic Sea Supports A Prussia - Berlin
A Prussia - Berlin`,
    expect: { succeeds: ["kie", "mun"], fails: ["pru"], notDislodged: ["ber"] },
  },
  {
    id: "6.D.6",
    title: "Support to hold on convoying unit allowed",
    orders: `
Germany:
A Berlin - Sweden
F Baltic Sea Convoys A Berlin - Sweden
F Prussia Supports F Baltic Sea
Russia:
F Livonia - Baltic Sea
F Gulf of Bothnia Supports F Livonia - Baltic Sea`,
    expect: { succeeds: ["ber", "pru"], fails: ["lvn"], notDislodged: ["bal"] },
  },
  {
    id: "6.D.7",
    title: "Support to hold on moving unit not allowed",
    orders: `
Germany:
F Baltic Sea - Sweden
F Prussia Supports F Baltic Sea
Russia:
F Livonia - Baltic Sea
F Gulf of Bothnia Supports F Livonia - Baltic Sea
A Finland - Sweden`,
    expect: { succeeds: ["lvn", "bot"], fails: ["bal", "pru", "fin"], dislodged: ["bal"] },
  },
  {
    id: "6.D.8",
    title: "Failed convoy cannot receive hold support",
    orders: `
Austria:
F Ionian Sea Hold
A Serbia Supports A Albania - Greece
A Albania - Greece
Turkey:
A Greece - Naples
A Bulgaria Supports A Greece`,
    expect: { succeeds: ["alb", "ser"], fails: ["gre", "bul"], dislodged: ["gre"] },
  },
  {
    id: "6.D.9",
    title: "Support to move on holding unit not allowed",
    orders: `
Italy:
A Venice - Trieste
A Tyrolia Supports A Venice - Trieste
Austria:
A Albania Supports A Trieste - Serbia
A Trieste Hold`,
    expect: { succeeds: ["ven", "tyr"], fails: ["alb"], dislodged: ["tri"] },
  },
  {
    id: "6.D.10",
    title: "Self dislodgment prohibited",
    orders: `
Germany:
A Berlin Hold
F Kiel - Berlin
A Munich Supports F Kiel - Berlin`,
    expect: { fails: ["kie"], notDislodged: ["ber"] },
  },
  {
    id: "6.D.11",
    title: "No self dislodgment of returning unit",
    orders: `
Germany:
A Berlin - Prussia
F Kiel - Berlin
A Munich Supports F Kiel - Berlin
Russia:
A Warsaw - Prussia`,
    expect: { fails: ["ber", "kie", "war"], notDislodged: ["ber"] },
  },
  {
    id: "6.D.12",
    title: "Supporting a foreign unit to dislodge own unit prohibited",
    orders: `
Austria:
F Trieste Hold
A Vienna Supports A Venice - Trieste
Italy:
A Venice - Trieste`,
    expect: { fails: ["ven"], notDislodged: ["tri"] },
  },
  {
    id: "6.D.13",
    title: "Supporting a foreign unit to dislodge a returning own unit prohibited",
    orders: `
Austria:
F Trieste - Adriatic Sea
A Vienna Supports A Venice - Trieste
Italy:
A Venice - Trieste
F Apulia - Adriatic Sea`,
    expect: { fails: ["tri", "apu", "ven"], notDislodged: ["tri"] },
  },
  {
    id: "6.D.14",
    title: "Supporting a foreign unit is not enough to prevent dislodgement",
    orders: `
Austria:
F Trieste Hold
A Vienna Supports A Venice - Trieste
Italy:
A Venice - Trieste
A Tyrolia Supports A Venice - Trieste
F Adriatic Sea Supports A Venice - Trieste`,
    expect: { succeeds: ["ven", "tyr", "adr"], dislodged: ["tri"] },
  },
  {
    id: "6.D.15",
    title: "Defender cannot cut support for attack on itself",
    orders: `
Russia:
F Constantinople Supports F Black Sea - Ankara
F Black Sea - Ankara
Turkey:
F Ankara - Constantinople`,
    expect: { succeeds: ["con", "bla"], fails: ["ank"], dislodged: ["ank"] },
  },
  {
    id: "6.D.16",
    title: "Convoying a unit dislodging a unit of same power is allowed",
    orders: `
England:
A London Hold
F North Sea Convoys A Belgium - London
France:
F English Channel Supports A Belgium - London
A Belgium - London`,
    expect: { succeeds: ["eng", "bel"], dislodged: ["lon"] },
  },
  {
    id: "6.D.17",
    title: "Dislodgement cuts supports",
    orders: `
Russia:
F Constantinople Supports F Black Sea - Ankara
F Black Sea - Ankara
Turkey:
F Ankara - Constantinople
A Smyrna Supports F Ankara - Constantinople
A Armenia - Ankara`,
    expect: { succeeds: ["ank", "smy"], fails: ["con", "bla", "arm"], dislodged: ["con"] },
  },
  {
    id: "6.D.18",
    title: "A surviving unit will sustain support",
    orders: `
Russia:
F Constantinople Supports F Black Sea - Ankara
F Black Sea - Ankara
A Bulgaria Supports F Constantinople
Turkey:
F Ankara - Constantinople
A Smyrna Supports F Ankara - Constantinople
A Armenia - Ankara`,
    expect: { succeeds: ["bla", "con", "bul"], fails: ["ank", "arm"], dislodged: ["ank"], notDislodged: ["con"] },
  },
  {
    id: "6.D.19",
    title: "Even when surviving is in alternative way",
    orders: `
Russia:
F Constantinople Supports F Black Sea - Ankara
F Black Sea - Ankara
A Smyrna Supports F Ankara - Constantinople
Turkey:
F Ankara - Constantinople`,
    expect: { succeeds: ["bla", "con"], fails: ["ank"], dislodged: ["ank"], notDislodged: ["con"] },
  },
  {
    id: "6.D.20",
    title: "Unit cannot cut support of its own country",
    orders: `
England:
F London Supports F North Sea - English Channel
F North Sea - English Channel
A Yorkshire - London
France:
F English Channel Hold`,
    expect: { succeeds: ["lon", "nth"], fails: ["yor"], dislodged: ["eng"] },
  },
  {
    id: "6.D.21",
    title: "Dislodging does not cancel a support cut",
    orders: `
Austria:
F Trieste Hold
Italy:
A Venice - Trieste
A Tyrolia Supports A Venice - Trieste
Germany:
A Munich - Tyrolia
Russia:
A Silesia - Munich
A Berlin Supports A Silesia - Munich`,
    expect: { succeeds: ["sil", "ber"], fails: ["ven", "tyr", "mun"], dislodged: ["mun"], notDislodged: ["tri"] },
  },
  {
    id: "6.D.22",
    title: "Impossible fleet move cannot be supported",
    orders: `
Germany:
F Kiel - Munich
A Burgundy Supports F Kiel - Munich
Russia:
A Munich - Kiel
A Berlin Supports A Munich - Kiel`,
    expect: { succeeds: ["mun", "ber"], fails: ["kie", "bur"], dislodged: ["kie"] },
  },
  {
    id: "6.D.23",
    title: "Impossible coast move cannot be supported",
    orders: `
Italy:
F Gulf of Lyon - Spain(sc)
F Western Mediterranean Supports F Gulf of Lyon - Spain(sc)
France:
F Spain(nc) - Gulf of Lyon
F Marseilles Supports F Spain(nc) - Gulf of Lyon`,
    expect: { succeeds: ["lyo", "wes"], fails: ["spa", "mar"], dislodged: ["spa"] },
  },
  {
    id: "6.D.24",
    title: "Impossible army move cannot be supported",
    orders: `
France:
A Marseilles - Gulf of Lyon
F Spain(sc) Supports A Marseilles - Gulf of Lyon
Italy:
F Gulf of Lyon Hold
Turkey:
F Tyrrhenian Sea Supports F Western Mediterranean - Gulf of Lyon
F Western Mediterranean - Gulf of Lyon`,
    expect: { succeeds: ["wes", "tys"], fails: ["mar", "spa"], dislodged: ["lyo"] },
  },
  {
    id: "6.D.25",
    title: "Failing hold support can be supported",
    orders: `
Germany:
A Berlin Supports A Prussia
F Kiel Supports A Berlin
Russia:
F Baltic Sea Supports A Prussia - Berlin
A Prussia - Berlin`,
    expect: { succeeds: ["kie"], fails: ["ber", "pru"], notDislodged: ["ber"] },
  },
  {
    id: "6.D.26",
    title: "Failing move support can be supported",
    orders: `
Germany:
A Berlin Supports A Prussia - Silesia
F Kiel Supports A Berlin
Russia:
F Baltic Sea Supports A Prussia - Berlin
A Prussia - Berlin`,
    expect: { succeeds: ["kie"], fails: ["ber", "pru"], notDislodged: ["ber"] },
  },
  {
    id: "6.D.27",
    title: "Failing convoy can be supported",
    orders: `
England:
F Sweden - Baltic Sea
F Denmark Supports F Sweden - Baltic Sea
Germany:
A Berlin Hold
Russia:
F Baltic Sea Convoys A Berlin - Livonia
F Prussia Supports F Baltic Sea`,
    expect: { succeeds: ["pru"], fails: ["swe"], notDislodged: ["bal"] },
  },
  {
    id: "6.D.28",
    title: "Impossible move and support",
    orders: `
Austria:
A Budapest Supports F Rumania
Russia:
F Rumania - Holland
Turkey:
F Black Sea - Rumania
A Bulgaria Supports F Black Sea - Rumania`,
    expect: { succeeds: ["bud"], fails: ["rum", "bla"], notDislodged: ["rum"] },
    note: "Illegal orders are ignored (issue 4.E.1): Rumania holds and receives support.",
  },
  {
    id: "6.D.29",
    title: "Move to impossible coast and support",
    orders: `
Austria:
A Budapest Supports F Rumania
Russia:
F Rumania - Bulgaria(sc)
Turkey:
F Black Sea - Rumania
A Bulgaria Supports F Black Sea - Rumania`,
    expect: { succeeds: ["bud"], fails: ["rum", "bla"], notDislodged: ["rum"] },
    note: "Illegal orders are ignored (issue 4.E.1): Rumania holds and receives support.",
  },
  {
    id: "6.D.30",
    title: "Move without coast and support",
    orders: `
Italy:
F Aegean Sea Supports F Constantinople
Russia:
F Constantinople - Bulgaria
Turkey:
F Black Sea - Constantinople
A Bulgaria Supports F Black Sea - Constantinople`,
    expect: { succeeds: ["aeg"], fails: ["con", "bla"], notDislodged: ["con"] },
    note: "Illegal orders are ignored (issue 4.E.1): Constantinople holds and receives support.",
  },
  {
    id: "6.D.31",
    title: "A tricky impossible support",
    orders: `
Austria:
A Rumania - Armenia
Turkey:
F Black Sea Supports A Rumania - Armenia`,
    expect: { fails: ["rum", "bla"] },
  },
  {
    id: "6.D.32",
    title: "A missing fleet",
    orders: `
England:
F Edinburgh Supports A Liverpool - Yorkshire
A Liverpool - Yorkshire
France:
F London Supports A Yorkshire
Germany:
A Yorkshire - Holland`,
    expect: { succeeds: ["lon"], fails: ["yor", "lvp"], notDislodged: ["yor"] },
    note: "Yorkshire-Holland needs a convoy through a missing North Sea fleet; illegal order is ignored (issue 4.E.1).",
  },
  {
    id: "6.D.33",
    title: "Unwanted support allowed",
    orders: `
Austria:
A Serbia - Budapest
A Vienna - Budapest
Russia:
A Galicia Supports A Serbia - Budapest
Turkey:
A Bulgaria - Serbia`,
    expect: { succeeds: ["ser", "gal", "bul"], fails: ["vie"] },
  },
  {
    id: "6.D.34",
    title: "Support targeting own area not allowed",
    orders: `
Germany:
A Berlin - Prussia
A Silesia Supports A Berlin - Prussia
F Baltic Sea Supports A Berlin - Prussia
Italy:
A Prussia Supports A Livonia - Prussia
Russia:
A Warsaw Supports A Livonia - Prussia
A Livonia - Prussia`,
    expect: { succeeds: ["ber"], fails: ["pru", "lvn"], dislodged: ["pru"] },
  },
]
