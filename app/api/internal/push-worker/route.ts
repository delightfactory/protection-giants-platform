import { authorizePushWorkerRequest } from "@/lib/notifications/push-worker-auth";
import { runPushWorkerBatch } from "@/lib/notifications/push-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: object, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function POST(request: Request) {
  const authorization = authorizePushWorkerRequest(request);
  if (!authorization.ok) {
    return jsonResponse({ error: authorization.code }, authorization.status);
  }

  try {
    const summary = await runPushWorkerBatch();
    return jsonResponse({ ok: true, ...summary });
  } catch {
    return jsonResponse({ error: "PG_PUSH_WORKER_UNAVAILABLE" }, 503);
  }
}
