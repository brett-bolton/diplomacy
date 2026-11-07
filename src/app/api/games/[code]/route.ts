import { getDb } from "@/server/db"
import { getView } from "@/server/games"
import { credentialsFor, handle } from "@/server/http"

export async function GET(_req: Request, ctx: RouteContext<"/api/games/[code]">) {
  const { code } = await ctx.params
  return handle(async () => getView(getDb(), code, await credentialsFor(code)))
}
