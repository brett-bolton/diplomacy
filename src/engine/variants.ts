// Player-count setups from the 2008 rulebook (p.20, "Modo de juego alternativo").

import type { Power } from "./types"

export interface Variant {
  playerCount: number
  /** Powers controlled by each seat (player), in seat order. */
  seats: Power[][]
  /** Powers nobody plays: their units hold all game and they never build. */
  unplayed: Power[]
  startYear: number
  victory: { scope: "power" | "player"; centers: number }
  /**
   * 2-player WWI scenario: Italy is neutral and closed to every unit through
   * this year; a coin flip before that year's Fall adjustments decides which
   * seat controls Italy from the next Spring.
   */
  italyNeutralThrough?: number
}

export const VARIANTS: Record<number, Variant> = {
  7: {
    playerCount: 7,
    seats: [["AUS"], ["ENG"], ["FRA"], ["GER"], ["ITA"], ["RUS"], ["TUR"]],
    unplayed: [],
    startYear: 1901,
    victory: { scope: "power", centers: 18 },
  },
  6: {
    playerCount: 6,
    seats: [["AUS"], ["ENG"], ["FRA"], ["GER"], ["RUS"], ["TUR"]],
    unplayed: ["ITA"],
    startYear: 1901,
    victory: { scope: "power", centers: 18 },
  },
  5: {
    playerCount: 5,
    seats: [["AUS"], ["ENG"], ["FRA"], ["RUS"], ["TUR"]],
    unplayed: ["ITA", "GER"],
    startYear: 1901,
    victory: { scope: "power", centers: 18 },
  },
  4: {
    playerCount: 4,
    seats: [["ENG"], ["AUS", "FRA"], ["GER", "TUR"], ["RUS", "ITA"]],
    unplayed: [],
    startYear: 1901,
    victory: { scope: "power", centers: 18 },
  },
  3: {
    playerCount: 3,
    seats: [["ENG", "GER", "AUS"], ["RUS", "ITA"], ["FRA", "TUR"]],
    unplayed: [],
    startYear: 1901,
    victory: { scope: "power", centers: 18 },
  },
  2: {
    playerCount: 2,
    seats: [["ENG", "FRA", "RUS"], ["AUS", "GER", "TUR"]],
    unplayed: [],
    startYear: 1914,
    victory: { scope: "player", centers: 24 },
    italyNeutralThrough: 1914,
  },
}

export function variant(playerCount: number): Variant {
  const v = VARIANTS[playerCount]
  if (!v) throw new Error(`No setup for ${playerCount} players`)
  return v
}
