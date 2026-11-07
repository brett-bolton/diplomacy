import { getDb } from "@/server/db"
import { tickChecklist } from "@/server/games"
import { credentialsFor, handle, readJson } from "@/server/http"

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/checklist">) {
  const { code } = await ctx.params
  return handle(async () => {
    const body = await readJson<{ phaseId: number; index?: number; done?: boolean; synced?: boolean }>(req)
    const change = body.synced ? ({ synced: true } as const) : { index: Number(body.index), done: !!body.done }
    await tickChecklist(getDb(), code, await credentialsFor(code), Number(body.phaseId), change)
  })
}
