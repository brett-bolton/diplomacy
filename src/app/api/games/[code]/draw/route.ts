import { getDb } from "@/server/db"
import { recordDraw } from "@/server/games"
import { credentialsFor, handle } from "@/server/http"

export async function POST(_req: Request, ctx: RouteContext<"/api/games/[code]/draw">) {
  const { code } = await ctx.params
  return handle(async () => recordDraw(getDb(), code, await credentialsFor(code)))
}
