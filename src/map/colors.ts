// Empire colors match the physical game pieces so the app and the table line up:
// Austria red, England dark blue, France light blue, Germany black, Italy green,
// Russia white, Turkey yellow.

import type { Power } from "../engine/types"

export const POWER_COLORS: Record<Power, { fill: string; stroke: string; text: string }> = {
  AUS: { fill: "#d23a2f", stroke: "#7a1610", text: "#ffffff" },
  ENG: { fill: "#24418f", stroke: "#0f1f4d", text: "#ffffff" },
  FRA: { fill: "#5aaee6", stroke: "#1f5f8c", text: "#0b2a40" },
  GER: { fill: "#2d2d2d", stroke: "#000000", text: "#ffffff" },
  ITA: { fill: "#2f8f45", stroke: "#14501f", text: "#ffffff" },
  RUS: { fill: "#f7f6f1", stroke: "#3a3a3a", text: "#1d1d1d" },
  TUR: { fill: "#f2c42f", stroke: "#8a6a00", text: "#3b2c00" },
}

/** Territory tint for supply centers a power owns (drawn over the land color). */
export const POWER_TINTS: Record<Power, string> = {
  AUS: "#d23a2f",
  ENG: "#24418f",
  FRA: "#5aaee6",
  GER: "#555555",
  ITA: "#2f8f45",
  RUS: "#9a8fb8",
  TUR: "#e2b21c",
}

export const TINT_OPACITY = 0.32
