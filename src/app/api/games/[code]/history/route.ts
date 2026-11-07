import { getDb } from "@/server/db"
import { getHistory } from "@/server/games"
import { credentialsFor, handle } from "@/server/http"

export async function GET(_req: Request, ctx: RouteContext<"/api/games/[code]/history">) {
  const { code } = await ctx.params
  return handle(async () => getHistory(getDb(), code, await credentialsFor(code)))
}
