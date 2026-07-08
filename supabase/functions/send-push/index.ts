import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushToken = {
  id: string;
  token: string;
};

type PushRequest = {
  title?: string;
  body?: string;
  target?: "all";
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function base64Url(input: string | ArrayBuffer) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function privateKeyToArrayBuffer(privateKey: string) {
  const cleanKey = privateKey
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(cleanKey);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getEnv("FIREBASE_PRIVATE_KEY");

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error_description ?? data?.error ?? "firebase_auth_failed");
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in ?? 3600),
  };
  return cachedAccessToken.token;
}

async function sendToToken(token: string, title: string, body: string) {
  const projectId = getEnv("FIREBASE_PROJECT_ID");
  const accessToken = await getFirebaseAccessToken();

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: {
            type: "admin_broadcast",
            path: "/app/notificacoes",
          },
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "matches",
              sound: "default",
            },
          },
        },
      }),
    },
  );

  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    if (!jwt) return json({ error: "not_authenticated" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "not_authenticated" }, 401);

    const { data: roles, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin");
    if (roleError) throw roleError;
    if (!roles?.length) return json({ error: "forbidden" }, 403);

    const payload = (await request.json()) as PushRequest;
    const title = payload.title?.trim().slice(0, 80);
    const body = payload.body?.trim().slice(0, 180);
    if (!title || !body) return json({ error: "missing_title_or_body" }, 400);

    const { data: tokens, error: tokenError } = await adminClient
      .from("push_tokens")
      .select("id, token")
      .eq("active", true);
    if (tokenError) throw tokenError;

    let sent = 0;
    let failed = 0;
    const inactiveIds: string[] = [];

    for (const pushToken of (tokens ?? []) as PushToken[]) {
      const result = await sendToToken(pushToken.token, title, body);
      if (result.ok) {
        sent += 1;
        continue;
      }

      failed += 1;
      const errorCode = result.data?.error?.details?.[0]?.errorCode ?? result.data?.error?.status;
      if (
        result.status === 404 ||
        errorCode === "UNREGISTERED" ||
        errorCode === "INVALID_ARGUMENT"
      ) {
        inactiveIds.push(pushToken.id);
      }
    }

    if (inactiveIds.length > 0) {
      await adminClient.from("push_tokens").update({ active: false }).in("id", inactiveIds);
    }

    await adminClient.from("push_broadcasts").insert({
      title,
      body,
      target: payload.target ?? "all",
      sent_by: userData.user.id,
      total_tokens: tokens?.length ?? 0,
      success_count: sent,
      failure_count: failed,
    });

    return json({ total: tokens?.length ?? 0, sent, failed });
  } catch (error) {
    console.error("[send-push]", error);
    return json({ error: error instanceof Error ? error.message : "send_push_failed" }, 500);
  }
});
