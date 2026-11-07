// Helpers for route handlers: identity cookies and error mapping.

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { GameError, type Credentials } from "./games"

const ONE_YEAR = 60 * 60 * 24 * 365

export const creatorCookie = (code: string) => `dip_c_${code.toUpperCase()}`
export const deviceCookie = (code: string) => `dip_d_${code.toUpperCase()}`

export async function credentialsFor(code: string): Promise<Credentials> {
  const jar = await cookies()
  return {
    creatorToken: jar.get(creatorCookie(code))?.value,
    deviceToken: jar.get(deviceCookie(code))?.value,
  }
}

export async function setIdentityCookie(name: string, value: string) {
  const jar = await cookies()
  jar.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  })
}

export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text()
  if (text.length > 64_000) throw new GameError(413, "Request too large.")
  try {
    return (text ? JSON.parse(text) : {}) as T
  } catch {
    throw new GameError(400, "Invalid JSON.")
  }
}

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn()
    return NextResponse.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 })
  }
}
