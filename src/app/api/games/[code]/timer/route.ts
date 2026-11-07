import { getDb } from "@/server/db"
import { GameError, extendTimer, setTimer } from "@/server/games"
import { credentialsFor, handle, readJson } from "@/server/http"

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/timer">) {
  const { code } = await ctx.params
  return handle(async () => {
    const body = await readJson<{ action: "set" | "extend"; minutes?: number }>(req)
    const creds = await credentialsFor(code)
    if (body.action === "set") return setTimer(getDb(), code, creds, Number(body.minutes))
    if (body.action === "extend") return extendTimer(getDb(), code, creds)
    throw new GameError(400, "Unknown timer action.")
  })
}
