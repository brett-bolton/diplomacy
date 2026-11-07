// The standard Diplomacy map: provinces, supply centers, coasts and adjacency.
// Geography and adjacency are game facts; names are English.

import type { Coast, Location, Power, ProvinceId, ProvinceKind, Unit, UnitType } from "../types"
import { locKey } from "../types"

export interface Province {
  id: ProvinceId
  abbr: string
  name: string
  kind: ProvinceKind
  supplyCenter: boolean
  /** Power whose home supply center this is, if any. */
  home?: Power
  /** Split-coast provinces list their coasts; fleets there must name one. */
  coasts?: Coast[]
}

function p(
  id: ProvinceId,
  abbr: string,
  name: string,
  kind: ProvinceKind,
  extra: { sc?: boolean; home?: Power; coasts?: Coast[] } = {},
): Province {
  return {
    id,
    abbr,
    name,
    kind,
    supplyCenter: extra.sc ?? !!extra.home,
    ...(extra.home ? { home: extra.home } : {}),
    ...(extra.coasts ? { coasts: extra.coasts } : {}),
  }
}

const PROVINCE_LIST: Province[] = [
  // Inland (14)
  p("boh", "Boh", "Bohemia", "inland"),
  p("bud", "Bud", "Budapest", "inland", { home: "AUS" }),
  p("bur", "Bur", "Burgundy", "inland"),
  p("gal", "Gal", "Galicia", "inland"),
  p("mos", "Mos", "Moscow", "inland", { home: "RUS" }),
  p("mun", "Mun", "Munich", "inland", { home: "GER" }),
  p("par", "Par", "Paris", "inland", { home: "FRA" }),
  p("ruh", "Ruh", "Ruhr", "inland"),
  p("ser", "Ser", "Serbia", "inland", { sc: true }),
  p("sil", "Sil", "Silesia", "inland"),
  p("tyr", "Tyr", "Tyrolia", "inland"),
  p("ukr", "Ukr", "Ukraine", "inland"),
  p("vie", "Vie", "Vienna", "inland", { home: "AUS" }),
  p("war", "War", "Warsaw", "inland", { home: "RUS" }),

  // Coastal (42)
  p("alb", "Alb", "Albania", "coastal"),
  p("ank", "Ank", "Ankara", "coastal", { home: "TUR" }),
  p("apu", "Apu", "Apulia", "coastal"),
  p("arm", "Arm", "Armenia", "coastal"),
  p("bel", "Bel", "Belgium", "coastal", { sc: true }),
  p("ber", "Ber", "Berlin", "coastal", { home: "GER" }),
  p("bre", "Bre", "Brest", "coastal", { home: "FRA" }),
  p("bul", "Bul", "Bulgaria", "coastal", { sc: true, coasts: ["ec", "sc"] }),
  p("cly", "Cly", "Clyde", "coastal"),
  p("con", "Con", "Constantinople", "coastal", { home: "TUR" }),
  p("den", "Den", "Denmark", "coastal", { sc: true }),
  p("edi", "Edi", "Edinburgh", "coastal", { home: "ENG" }),
  p("fin", "Fin", "Finland", "coastal"),
  p("gas", "Gas", "Gascony", "coastal"),
  p("gre", "Gre", "Greece", "coastal", { sc: true }),
  p("hol", "Hol", "Holland", "coastal", { sc: true }),
  p("kie", "Kie", "Kiel", "coastal", { home: "GER" }),
  p("lon", "Lon", "London", "coastal", { home: "ENG" }),
  p("lvn", "Lvn", "Livonia", "coastal"),
  p("lvp", "Lvp", "Liverpool", "coastal", { home: "ENG" }),
  p("mar", "Mar", "Marseilles", "coastal", { home: "FRA" }),
  p("naf", "NAf", "North Africa", "coastal"),
  p("nap", "Nap", "Naples", "coastal", { home: "ITA" }),
  p("nwy", "Nwy", "Norway", "coastal", { sc: true }),
  p("pic", "Pic", "Picardy", "coastal"),
  p("pie", "Pie", "Piedmont", "coastal"),
  p("por", "Por", "Portugal", "coastal", { sc: true }),
  p("pru", "Pru", "Prussia", "coastal"),
  p("rom", "Rom", "Rome", "coastal", { home: "ITA" }),
  p("rum", "Rum", "Rumania", "coastal", { sc: true }),
  p("sev", "Sev", "Sevastopol", "coastal", { home: "RUS" }),
  p("smy", "Smy", "Smyrna", "coastal", { home: "TUR" }),
  p("spa", "Spa", "Spain", "coastal", { sc: true, coasts: ["nc", "sc"] }),
  p("stp", "StP", "St Petersburg", "coastal", { home: "RUS", coasts: ["nc", "sc"] }),
  p("swe", "Swe", "Sweden", "coastal", { sc: true }),
  p("syr", "Syr", "Syria", "coastal"),
  p("tri", "Tri", "Trieste", "coastal", { home: "AUS" }),
  p("tun", "Tun", "Tunis", "coastal", { sc: true }),
  p("tus", "Tus", "Tuscany", "coastal"),
  p("ven", "Ven", "Venice", "coastal", { home: "ITA" }),
  p("wal", "Wal", "Wales", "coastal"),
  p("yor", "Yor", "Yorkshire", "coastal"),

  // Sea (19)
  p("adr", "Adr", "Adriatic Sea", "sea"),
  p("aeg", "Aeg", "Aegean Sea", "sea"),
  p("bal", "Bal", "Baltic Sea", "sea"),
  p("bar", "Bar", "Barents Sea", "sea"),
  p("bla", "Bla", "Black Sea", "sea"),
  p("bot", "Bot", "Gulf of Bothnia", "sea"),
  p("eas", "Eas", "Eastern Mediterranean", "sea"),
  p("eng", "ENG", "English Channel", "sea"),
  p("hel", "Hel", "Helgoland Bight", "sea"),
  p("ion", "Ion", "Ionian Sea", "sea"),
  p("iri", "Iri", "Irish Sea", "sea"),
  p("lyo", "Lyo", "Gulf of Lyon", "sea"),
  p("mao", "MAO", "Mid-Atlantic Ocean", "sea"),
  p("nao", "NAO", "North Atlantic Ocean", "sea"),
  p("nth", "Nth", "North Sea", "sea"),
  p("nwg", "Nwg", "Norwegian Sea", "sea"),
  p("ska", "Ska", "Skagerrak", "sea"),
  p("tys", "Tys", "Tyrrhenian Sea", "sea"),
  p("wes", "Wes", "Western Mediterranean", "sea"),
]

export const PROVINCES: Record<ProvinceId, Province> = Object.fromEntries(
  PROVINCE_LIST.map((pr) => [pr.id, pr]),
)

export const PROVINCE_IDS: ProvinceId[] = PROVINCE_LIST.map((pr) => pr.id)

/** Land borders: pairs of land provinces an army can move between. */
const ARMY_EDGES: [string, string][] = [
  ["alb", "gre"], ["alb", "ser"], ["alb", "tri"],
  ["ank", "arm"], ["ank", "con"], ["ank", "smy"],
  ["apu", "nap"], ["apu", "rom"], ["apu", "ven"],
  ["arm", "sev"], ["arm", "smy"], ["arm", "syr"],
  ["bel", "bur"], ["bel", "hol"], ["bel", "pic"], ["bel", "ruh"],
  ["ber", "kie"], ["ber", "mun"], ["ber", "pru"], ["ber", "sil"],
  ["boh", "gal"], ["boh", "mun"], ["boh", "sil"], ["boh", "tyr"], ["boh", "vie"],
  ["bre", "gas"], ["bre", "par"], ["bre", "pic"],
  ["bud", "gal"], ["bud", "rum"], ["bud", "ser"], ["bud", "tri"], ["bud", "vie"],
  ["bul", "con"], ["bul", "gre"], ["bul", "rum"], ["bul", "ser"],
  ["bur", "gas"], ["bur", "mar"], ["bur", "mun"], ["bur", "par"], ["bur", "pic"], ["bur", "ruh"],
  ["cly", "edi"], ["cly", "lvp"],
  ["con", "smy"],
  ["den", "kie"], ["den", "swe"],
  ["edi", "lvp"], ["edi", "yor"],
  ["fin", "nwy"], ["fin", "stp"], ["fin", "swe"],
  ["gal", "rum"], ["gal", "sil"], ["gal", "ukr"], ["gal", "vie"], ["gal", "war"],
  ["gas", "mar"], ["gas", "par"], ["gas", "spa"],
  ["gre", "ser"],
  ["hol", "kie"], ["hol", "ruh"],
  ["kie", "mun"], ["kie", "ruh"],
  ["lon", "wal"], ["lon", "yor"],
  ["lvn", "mos"], ["lvn", "pru"], ["lvn", "stp"], ["lvn", "war"],
  ["lvp", "wal"], ["lvp", "yor"],
  ["mar", "pie"], ["mar", "spa"],
  ["mos", "sev"], ["mos", "stp"], ["mos", "ukr"], ["mos", "war"],
  ["mun", "ruh"], ["mun", "sil"], ["mun", "tyr"],
  ["naf", "tun"],
  ["nap", "rom"],
  ["nwy", "stp"], ["nwy", "swe"],
  ["par", "pic"],
  ["pie", "tus"], ["pie", "tyr"], ["pie", "ven"],
  ["por", "spa"],
  ["pru", "sil"], ["pru", "war"],
  ["rom", "tus"], ["rom", "ven"],
  ["rum", "ser"], ["rum", "sev"], ["rum", "ukr"],
  ["ser", "tri"],
  ["sev", "ukr"],
  ["sil", "war"],
  ["smy", "syr"],
  ["tri", "tyr"], ["tri", "ven"], ["tri", "vie"],
  ["tus", "ven"],
  ["tyr", "ven"], ["tyr", "vie"],
  ["ukr", "war"],
  ["wal", "yor"],
]

/**
 * Fleet adjacency between fleet locations (sea provinces, coastal provinces,
 * and the named coasts of split-coast provinces, e.g. "spa/nc").
 */
const FLEET_EDGES: [string, string][] = [
  // Sea to sea
  ["adr", "ion"],
  ["aeg", "eas"], ["aeg", "ion"],
  ["bal", "bot"],
  ["bar", "nwg"],
  ["eas", "ion"],
  ["eng", "iri"], ["eng", "mao"], ["eng", "nth"],
  ["hel", "nth"],
  ["ion", "tys"],
  ["iri", "mao"], ["iri", "nao"],
  ["lyo", "tys"], ["lyo", "wes"],
  ["mao", "nao"], ["mao", "wes"],
  ["nao", "nwg"],
  ["nth", "nwg"], ["nth", "ska"],
  ["tys", "wes"],

  // Sea to coast
  ["adr", "alb"], ["adr", "apu"], ["adr", "tri"], ["adr", "ven"],
  ["aeg", "bul/sc"], ["aeg", "con"], ["aeg", "gre"], ["aeg", "smy"],
  ["bal", "ber"], ["bal", "den"], ["bal", "kie"], ["bal", "lvn"], ["bal", "pru"], ["bal", "swe"],
  ["bar", "nwy"], ["bar", "stp/nc"],
  ["bla", "ank"], ["bla", "arm"], ["bla", "bul/ec"], ["bla", "con"], ["bla", "rum"], ["bla", "sev"],
  ["bot", "fin"], ["bot", "lvn"], ["bot", "stp/sc"], ["bot", "swe"],
  ["eas", "smy"], ["eas", "syr"],
  ["eng", "bel"], ["eng", "bre"], ["eng", "lon"], ["eng", "pic"], ["eng", "wal"],
  ["hel", "den"], ["hel", "hol"], ["hel", "kie"],
  ["ion", "alb"], ["ion", "apu"], ["ion", "gre"], ["ion", "nap"], ["ion", "tun"],
  ["iri", "lvp"], ["iri", "wal"],
  ["lyo", "mar"], ["lyo", "pie"], ["lyo", "spa/sc"], ["lyo", "tus"],
  ["mao", "bre"], ["mao", "gas"], ["mao", "naf"], ["mao", "por"], ["mao", "spa/nc"], ["mao", "spa/sc"],
  ["nao", "cly"], ["nao", "lvp"],
  ["nth", "bel"], ["nth", "den"], ["nth", "edi"], ["nth", "hol"], ["nth", "lon"], ["nth", "nwy"], ["nth", "yor"],
  ["nwg", "cly"], ["nwg", "edi"], ["nwg", "nwy"],
  ["ska", "den"], ["ska", "nwy"], ["ska", "swe"],
  ["tys", "nap"], ["tys", "rom"], ["tys", "tun"], ["tys", "tus"],
  ["wes", "naf"], ["wes", "spa/sc"], ["wes", "tun"],

  // Coast to coast
  ["alb", "gre"], ["alb", "tri"],
  ["ank", "arm"], ["ank", "con"],
  ["apu", "nap"], ["apu", "ven"],
  ["arm", "sev"],
  ["bel", "hol"], ["bel", "pic"],
  ["ber", "kie"], ["ber", "pru"],
  ["bre", "gas"], ["bre", "pic"],
  ["bul/ec", "con"], ["bul/ec", "rum"],
  ["bul/sc", "con"], ["bul/sc", "gre"],
  ["cly", "edi"], ["cly", "lvp"],
  ["con", "smy"],
  ["den", "kie"], ["den", "swe"],
  ["edi", "yor"],
  ["fin", "stp/sc"], ["fin", "swe"],
  ["gas", "spa/nc"],
  ["hol", "kie"],
  ["lon", "wal"], ["lon", "yor"],
  ["lvn", "pru"], ["lvn", "stp/sc"],
  ["lvp", "wal"],
  ["mar", "pie"], ["mar", "spa/sc"],
  ["naf", "tun"],
  ["nap", "rom"],
  ["nwy", "stp/nc"], ["nwy", "swe"],
  ["pie", "tus"],
  ["por", "spa/nc"], ["por", "spa/sc"],
  ["rom", "tus"],
  ["rum", "sev"],
  ["smy", "syr"],
  ["tri", "ven"],
]

function buildAdjacency(edges: [string, string][]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  return adj
}

export const ARMY_ADJ = buildAdjacency(ARMY_EDGES)
export const FLEET_ADJ = buildAdjacency(FLEET_EDGES)
export const RAW_ARMY_EDGES = ARMY_EDGES
export const RAW_FLEET_EDGES = FLEET_EDGES

export function province(id: ProvinceId): Province {
  const pr = PROVINCES[id]
  if (!pr) throw new Error(`Unknown province: ${id}`)
  return pr
}

export function isSea(id: ProvinceId): boolean {
  return PROVINCES[id]?.kind === "sea"
}

export function isLand(id: ProvinceId): boolean {
  const k = PROVINCES[id]?.kind
  return k === "inland" || k === "coastal"
}

export function isCoastal(id: ProvinceId): boolean {
  return PROVINCES[id]?.kind === "coastal"
}

/** Is this a legal place for a unit of this type to stand? */
export function isValidUnitLocation(type: UnitType, loc: Location): boolean {
  const pr = PROVINCES[loc.province]
  if (!pr) return false
  if (type === "A") return pr.kind !== "sea" && !loc.coast
  if (pr.kind === "inland") return false
  if (pr.coasts) return !!loc.coast && pr.coasts.includes(loc.coast)
  return !loc.coast
}

/** Locations a unit could move to in one step (ignoring other units). */
export function neighbors(type: UnitType, loc: Location): Location[] {
  if (type === "A") {
    return [...(ARMY_ADJ.get(loc.province) ?? [])].map((province) => ({ province }))
  }
  return [...(FLEET_ADJ.get(locKey(loc)) ?? [])].map((key) => {
    const [province, coast] = key.split("/")
    return coast ? { province, coast: coast as Coast } : { province }
  })
}

/** Can a unit of this type at `from` move to province `to` (any coast)? */
export function canReach(type: UnitType, from: Location, to: ProvinceId): boolean {
  return neighbors(type, from).some((l) => l.province === to)
}

/** Coasts of `to` a fleet at `from` can reach (empty array for single-coast provinces it can reach). */
export function reachableCoasts(from: Location, to: ProvinceId): Coast[] {
  return neighbors("F", from)
    .filter((l) => l.province === to && l.coast)
    .map((l) => l.coast!)
}

export const SUPPLY_CENTERS: ProvinceId[] = PROVINCE_LIST.filter((pr) => pr.supplyCenter).map((pr) => pr.id)

export function homeCenters(power: Power): ProvinceId[] {
  return PROVINCE_LIST.filter((pr) => pr.home === power).map((pr) => pr.id)
}

/** Italian territory, closed to everyone in 1914 of the 2-player game. */
export const ITALIAN_TERRITORY: ProvinceId[] = ["pie", "ven", "tus", "rom", "apu", "nap"]

export function u(power: Power, type: UnitType, at: string): Unit {
  const [province, coast] = at.split("/")
  return { power, type, location: coast ? { province, coast: coast as Coast } : { province } }
}

export const STANDARD_START: Unit[] = [
  u("AUS", "A", "vie"), u("AUS", "A", "bud"), u("AUS", "F", "tri"),
  u("ENG", "F", "lon"), u("ENG", "F", "edi"), u("ENG", "A", "lvp"),
  u("FRA", "F", "bre"), u("FRA", "A", "par"), u("FRA", "A", "mar"),
  u("GER", "F", "kie"), u("GER", "A", "ber"), u("GER", "A", "mun"),
  u("ITA", "F", "nap"), u("ITA", "A", "rom"), u("ITA", "A", "ven"),
  u("RUS", "A", "mos"), u("RUS", "A", "war"), u("RUS", "F", "sev"), u("RUS", "F", "stp/sc"),
  u("TUR", "F", "ank"), u("TUR", "A", "con"), u("TUR", "A", "smy"),
]

export const POWER_NAMES: Record<Power, string> = {
  AUS: "Austria",
  ENG: "England",
  FRA: "France",
  GER: "Germany",
  ITA: "Italy",
  RUS: "Russia",
  TUR: "Turkey",
}

/** Display a location in standard notation, e.g. "StP/sc", "Par". */
export function locLabel(loc: Location): string {
  const abbr = province(loc.province).abbr
  return loc.coast ? `${abbr}/${loc.coast}` : abbr
}
