// Core types for the rules engine. Pure data, no I/O.

export const POWERS = ["AUS", "ENG", "FRA", "GER", "ITA", "RUS", "TUR"] as const
export type Power = (typeof POWERS)[number]

export type UnitType = "A" | "F"

/** Lower-case three-letter province id, e.g. "par", "stp", "mao". */
export type ProvinceId = string

export type Coast = "nc" | "sc" | "ec"

export type ProvinceKind = "inland" | "coastal" | "sea"

export interface Location {
  province: ProvinceId
  coast?: Coast
}

export interface Unit {
  power: Power
  type: UnitType
  location: Location
}

export type Season = "spring" | "fall" | "winter"
export type PhaseType = "movement" | "retreat" | "adjustment"

/** Canonical string key for a location: "par", "stp/sc". */
export function locKey(loc: Location): string {
  return loc.coast ? `${loc.province}/${loc.coast}` : loc.province
}

export function parseLocKey(key: string): Location {
  const [province, coast] = key.split("/")
  return coast ? { province, coast: coast as Coast } : { province }
}
