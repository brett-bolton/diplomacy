// Test-only parser for DATC order notation. The app itself never parses text orders.

import { PROVINCES } from "../../map/standard"
import type { Coast, Location, Power, ProvinceId, UnitType } from "../../types"

export const POWER_BY_NAME: Record<string, Power> = {
  austria: "AUS",
  england: "ENG",
  france: "FRA",
  germany: "GER",
  italy: "ITA",
  russia: "RUS",
  turkey: "TUR",
}

const NAME_TO_ID = new Map<string, ProvinceId>()
for (const p of Object.values(PROVINCES)) {
  NAME_TO_ID.set(p.name.toLowerCase(), p.id)
  NAME_TO_ID.set(p.abbr.toLowerCase(), p.id)
}
for (const [alias, id] of Object.entries({
  "gulf of lyons": "lyo",
  "gulf of lion": "lyo",
  tyrol: "tyr",
  "heligoland bight": "hel",
  "helgoland": "hel",
  "st. petersburg": "stp",
  "saint petersburg": "stp",
  "mid atlantic ocean": "mao",
  "mid-atlantic": "mao",
  "north atlantic": "nao",
  "eastern med": "eas",
  "western med": "wes",
  "tyrrhenian": "tys",
  "norwegian": "nwg",
  "skaggerak": "ska",
})) {
  NAME_TO_ID.set(alias, id)
}

export function parseLocation(text: string): Location {
  const m = text.trim().match(/^(.+?)\s*(?:\(\s*(nc|sc|ec)\s*\)|\/(nc|sc|ec))?$/i)
  if (!m) throw new Error(`Bad location: "${text}"`)
  const id = NAME_TO_ID.get(m[1].trim().toLowerCase())
  if (!id) throw new Error(`Unknown province: "${m[1]}"`)
  const coast = (m[2] ?? m[3])?.toLowerCase() as Coast | undefined
  return coast ? { province: id, coast } : { province: id }
}

export type ParsedAction =
  | { action: "none" }
  | { action: "hold" }
  | { action: "move"; to: Location; viaConvoy: boolean }
  | { action: "support-hold"; supportedType: UnitType; target: Location }
  | { action: "support-move"; supportedType: UnitType; from: Location; to: Location }
  | { action: "convoy"; convoyedType: UnitType; from: Location; to: Location }
  | { action: "disband" }
  | { action: "build" }
  | { action: "remove" }
  | { action: "waive" }

export type ParsedLine = {
  power: Power
  raw: string
  unitType?: UnitType
  at?: Location
} & ParsedAction

function unitAndRest(text: string): { type: UnitType; rest: string } {
  const m = text.match(/^([AF])\s+(.+)$/)
  if (!m) throw new Error(`Expected "A <place>" or "F <place>": "${text}"`)
  return { type: m[1] as UnitType, rest: m[2] }
}

function parseLine(power: Power, raw: string): ParsedLine {
  const line = raw.trim()

  if (/^waive$/i.test(line)) return { power, raw, action: "waive" }

  const build = line.match(/^(Build|Remove|Disband)\s+([AF])\s+(.+)$/i)
  if (build) {
    const verb = build[1].toLowerCase()
    return {
      power,
      raw,
      unitType: build[2] as UnitType,
      at: parseLocation(build[3]),
      action: verb === "build" ? "build" : verb === "remove" ? "remove" : "disband",
    }
  }

  const { type, rest } = unitAndRest(line)

  let m = rest.match(/^(.+?)\s+Supports\s+([AF])\s+(.+?)\s+-\s+(.+)$/i)
  if (m) {
    return {
      power, raw, unitType: type, at: parseLocation(m[1]),
      action: "support-move", supportedType: m[2] as UnitType, from: parseLocation(m[3]), to: parseLocation(m[4]),
    }
  }
  m = rest.match(/^(.+?)\s+Supports\s+([AF])\s+(.+)$/i)
  if (m) {
    return {
      power, raw, unitType: type, at: parseLocation(m[1]),
      action: "support-hold", supportedType: m[2] as UnitType, target: parseLocation(m[3]),
    }
  }
  m = rest.match(/^(.+?)\s+Convoys\s+([AF])\s+(.+?)\s+-\s+(.+)$/i)
  if (m) {
    return {
      power, raw, unitType: type, at: parseLocation(m[1]),
      action: "convoy", convoyedType: m[2] as UnitType, from: parseLocation(m[3]), to: parseLocation(m[4]),
    }
  }
  m = rest.match(/^(.+?)\s+-\s+(.+?)(\s+via\s+convoy)?$/i)
  if (m) {
    return { power, raw, unitType: type, at: parseLocation(m[1]), action: "move", to: parseLocation(m[2]), viaConvoy: !!m[3] }
  }
  m = rest.match(/^(.+?)\s+Hold$/i)
  if (m) return { power, raw, unitType: type, at: parseLocation(m[1]), action: "hold" }
  m = rest.match(/^(.+?)\s+Disband$/i)
  if (m) return { power, raw, unitType: type, at: parseLocation(m[1]), action: "disband" }

  // A bare unit ("F London") just places a unit.
  return { power, raw, unitType: type, at: parseLocation(rest), action: "none" }
}

/** Parse a DATC block with power headings ("England:") followed by lines. */
export function parseBlock(block: string | undefined): ParsedLine[] {
  if (!block) return []
  const out: ParsedLine[] = []
  let power: Power | undefined
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = line.match(/^([A-Za-z]+):\s*$/)
    if (heading) {
      power = POWER_BY_NAME[heading[1].toLowerCase()]
      if (!power) throw new Error(`Unknown power heading: "${line}"`)
      continue
    }
    if (!power) throw new Error(`Order line before any power heading: "${line}"`)
    out.push(parseLine(power, line))
  }
  return out
}

/** Parse "Germany: Berlin, Kiel\nRussia: Warsaw" into power -> provinces. */
export function parseOwnership(block: string | undefined): Map<ProvinceId, Power> {
  const owners = new Map<ProvinceId, Power>()
  if (!block) return owners
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/)
    if (!m) throw new Error(`Bad ownership line: "${line}"`)
    const power = POWER_BY_NAME[m[1].toLowerCase()]
    if (!power) throw new Error(`Unknown power: "${m[1]}"`)
    for (const name of m[2].split(",").map((s) => s.trim()).filter(Boolean)) {
      owners.set(parseLocation(name).province, power)
    }
  }
  return owners
}

/** Parse an expected unit like "F stp/sc" or "A par". */
export function parseExpectedUnit(text: string): { type: UnitType; key: string } {
  const m = text.trim().match(/^([AF])\s+([a-z]{3}(?:\/(?:nc|sc|ec))?)$/)
  if (!m) throw new Error(`Bad expected unit: "${text}"`)
  if (!PROVINCES[m[2].split("/")[0]]) throw new Error(`Unknown province id in "${text}"`)
  return { type: m[1] as UnitType, key: m[2] }
}
