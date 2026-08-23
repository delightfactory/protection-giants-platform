import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assertPushApiRequest,
  isPushSubscriptionState,
  jsonPushApiResponse,
  pushApiErrorResponse,
  pushRpcErrorResponse,
  readPushEndpointInput,
  readPushRegistrationInput,
} from "@/lib/notifications/push-subscription-api";

async function getAuthenticatedPushClient(request: Request) {
  try {
    assertPushApiRequest(request);
  } catch (error) {
    return { response: pushApiErrorResponse(error) } as const;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        response: jsonPushApiResponse({ error: "PG_PUSH_UNAUTHENTICATED" }, 401),
      } as const;
    }

    return { supabase } as const;
  } catch {
    return {
      response: jsonPushApiResponse({ error: "PG_PUSH_OPERATION_FAILED" }, 500),
    } as const;
  }
}

export async function PUT(request: Request) {
  const auth = await getAuthenticatedPushClient(request);
  if ("response" in auth) return auth.response;

  let input: Awaited<ReturnType<typeof readPushRegistrationInput>>;
  try {
    input = await readPushRegistrationInput(request);
  } catch (error) {
    return pushApiErrorResponse(error);
  }

  try {
    const { error } = await auth.supabase.rpc("register_push_subscription", {
      p_endpoint: input.endpoint,
      p_p256dh: input.p256dh,
      p_auth_secret: input.authSecret,
    });

    if (error) return pushRpcErrorResponse(error);
    return jsonPushApiResponse({ state: "subscribed" });
  } catch (error) {
    return pushApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedPushClient(request);
  if ("response" in auth) return auth.response;

  let input: Awaited<ReturnType<typeof readPushEndpointInput>>;
  try {
    input = await readPushEndpointInput(request);
  } catch (error) {
    return pushApiErrorResponse(error);
  }

  try {
    const { data, error } = await auth.supabase.rpc("current_push_subscription_state", {
      p_endpoint: input.endpoint,
    });

    if (error) return pushRpcErrorResponse(error);
    if (!isPushSubscriptionState(data)) {
      return jsonPushApiResponse({ error: "PG_PUSH_OPERATION_FAILED" }, 500);
    }

    return jsonPushApiResponse({ state: data });
  } catch (error) {
    return pushApiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedPushClient(request);
  if ("response" in auth) return auth.response;

  let input: Awaited<ReturnType<typeof readPushEndpointInput>>;
  try {
    input = await readPushEndpointInput(request);
  } catch (error) {
    return pushApiErrorResponse(error);
  }

  try {
    const { data, error } = await auth.supabase.rpc("disable_push_subscription", {
      p_endpoint: input.endpoint,
    });

    if (error) return pushRpcErrorResponse(error);
    if (typeof data !== "boolean") {
      return jsonPushApiResponse({ error: "PG_PUSH_OPERATION_FAILED" }, 500);
    }

    return jsonPushApiResponse({ state: data ? "disabled" : "missing" });
  } catch (error) {
    return pushApiErrorResponse(error);
  }
}
