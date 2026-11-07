// A standalone adjudication scenario, and its compact encoding for shareable URLs.

import { PROVINCES, isValidUnitLocation } from "@/engine/map/standard"
import type { MovementOrder } from "@/engine/orders"
import { POWERS, type Coast, type Power, type Unit, type UnitType } from "@/engine/types"

export interface Scenario {
  year: number
  season: "spring" | "fall"
  /** Powers taking part, in the order they were added. */
  powers: Power[]
  units: Unit[]
  /** At most one order per unit, keyed by the unit's province. */
  orders: MovementOrder[]
}

export const EMPTY_SCENARIO: Scenario = { year: 1901, season: "spring", powers: [], units: [], orders: [] }

type Compact = { y: number; s: "s" | "f"; p: string[]; u: string[]; o: MovementOrder[] }

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeScenario(s: Scenario): string {
  const c: Compact = {
    y: s.year,
    s: s.season === "fall" ? "f" : "s",
    p: s.powers,
    u: s.units.map((u) => `${u.power}:${u.type}:${u.location.province}${u.location.coast ? "/" + u.location.coast : ""}`),
    o: s.orders,
  }
  return toBase64Url(JSON.stringify(c))
}

/** Decode a scenario from a URL hash; anything malformed is dropped, never thrown. */
export function decodeScenario(hash: string): Scenario | null {
  const raw = hash.replace(/^#/, "")
  if (!raw) return null
  try {
    const c = JSON.parse(fromBase64Url(raw)) as Compact
    const powers = (Array.isArray(c.p) ? c.p : []).filter((p): p is Power => POWERS.includes(p as Power))
    const units: Unit[] = []
    for (const s of Array.isArray(c.u) ? c.u : []) {
      const [power, type, where] = String(s).split(":")
      const [province, coast] = (where ?? "").split("/")
      const loc = coast ? { province, coast: coast as Coast } : { province }
      if (!POWERS.includes(power as Power) || !PROVINCES[province]) continue
      if (!isValidUnitLocation(type as UnitType, loc)) continue
      if (units.some((u) => u.location.province === province)) continue
      units.push({ power: power as Power, type: type as UnitType, location: loc })
      if (!powers.includes(power as Power)) powers.push(power as Power)
    }
    const orders = (Array.isArray(c.o) ? c.o : []).filter(
      (o) => o && typeof o === "object" && typeof o.unit === "string" && units.some((u) => u.location.province === o.unit),
    )
    const year = Number.isInteger(c.y) && c.y >= 1900 && c.y <= 2100 ? c.y : 1901
    return { year, season: c.s === "f" ? "fall" : "spring", powers, units, orders }
  } catch {
    return null
  }
}
