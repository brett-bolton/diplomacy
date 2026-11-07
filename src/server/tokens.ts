import { createHash, randomBytes, randomInt } from "node:crypto"

/** URL-safe random secret (256 bits). */
export function newToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** Short, unambiguous game code, e.g. "K7QF2M". */
export function newGameCode(): string {
  let s = ""
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return s
}

export function newId(): string {
  return randomBytes(12).toString("base64url")
}

/** Cryptographically random number in [0, 1) for coin flips. */
export function secureRandom(): number {
  return randomInt(2 ** 32) / 2 ** 32
}

let fixedNow: Date | undefined

/** Server clock. Tests can freeze it. */
export function now(): Date {
  return fixedNow ? new Date(fixedNow) : new Date()
}

export function setNowForTests(d: Date | undefined) {
  fixedNow = d
}
