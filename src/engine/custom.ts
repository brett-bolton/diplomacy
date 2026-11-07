// Validates a position typed in by the game creator ("start from a custom position").

import { ITALIAN_TERRITORY, POWER_NAMES, PROVINCES, isValidUnitLocation, locLabel } from "./map/standard"
import { supplyCenterCounts } from "./adjudicate/adjust"
import { POWERS, type Power, type ProvinceId, type Unit } from "./types"
import { variant } from "./variants"

export interface CustomPosition {
  year: number
  season: "spring" | "fall"
  units: Unit[]
  owners: Record<ProvinceId, Power>
}

export interface CustomCheck {
  /** Blocking problems. */
  errors: string[]
  /** Legal but probably a typing mistake. */
  warnings: string[]
}

export function checkCustomPosition(pos: CustomPosition, playerCount: number): CustomCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const v = variant(playerCount)

  if (!Number.isInteger(pos.year) || pos.year < 1901 || pos.year > 2100) errors.push("Choose a year between 1901 and 2100.")

  const seen = new Map<ProvinceId, Unit>()
  for (const unit of pos.units) {
    const p = PROVINCES[unit.location.province]
    if (!p) {
      errors.push(`Unknown province "${unit.location.province}".`)
      continue
    }
    if (!POWERS.includes(unit.power)) errors.push(`Unknown power for the unit in ${p.name}.`)
    if (seen.has(p.id)) errors.push(`${p.name} has more than one unit.`)
    seen.set(p.id, unit)
    if (!isValidUnitLocation(unit.type, unit.location)) {
      if (unit.type === "A" && p.kind === "sea") errors.push(`An army can't be in ${p.name}.`)
      else if (unit.type === "F" && p.kind === "inland") errors.push(`A fleet can't be in ${p.name}.`)
      else if (unit.type === "F" && p.coasts) errors.push(`Choose a coast for the fleet in ${p.name}.`)
      else errors.push(`${unit.type} ${locLabel(unit.location)} isn't a legal position.`)
    }
  }

  for (const [prov, power] of Object.entries(pos.owners)) {
    const p = PROVINCES[prov]
    if (!p?.supplyCenter) errors.push(`${p?.name ?? prov} isn't a supply center.`)
    if (!POWERS.includes(power)) errors.push(`Unknown owner for ${p?.name ?? prov}.`)
  }

  if (v.italyNeutralThrough && pos.year <= v.italyNeutralThrough) {
    for (const unit of pos.units) {
      if (unit.power !== "ITA" && ITALIAN_TERRITORY.includes(unit.location.province)) {
        errors.push(`No unit may be in Italian territory (${PROVINCES[unit.location.province].name}) in ${pos.year}.`)
      }
    }
  }

  const counts = supplyCenterCounts(new Map(Object.entries(pos.owners)))
  for (const power of POWERS) {
    if (playerCount === 2 && power === "ITA") continue
    const n = pos.units.filter((u) => u.power === power).length
    const c = counts.get(power) ?? 0
    if (n !== c) warnings.push(`${POWER_NAMES[power]} has ${n} unit${n === 1 ? "" : "s"} and ${c} supply center${c === 1 ? "" : "s"}.`)
  }
  return { errors, warnings }
}
