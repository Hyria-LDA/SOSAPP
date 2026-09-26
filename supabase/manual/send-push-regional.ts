// Publicar como Edge Function send-push-regional. Não executar no SQL Editor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-push-webhook-secret",
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

type FirebaseErrorResponse = {
  error?: {
    details?: Array<{ errorCode?: string }>;
    message?: string;
    status?: string;
  };
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function base64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
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

export async function sendFirebasePush(params: {
  token: string;
  platform?: string | null;
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, string>;
}) {
  const projectId = getEnv("FIREBASE_PROJECT_ID");
  const accessToken = await getFirebaseAccessToken();
  const dataPayload: Record<string, string> = {
    ...(params.data ?? {}),
    title: params.title,
    body: params.body,
    image_url: params.imageUrl ?? "",
    sos_native_notification: "1",
  };
  const isIos = params.platform === "ios";
  const message = {
    token: params.token,
    notification: {
      title: params.title,
      body: params.body,
    },
    data: dataPayload,
    ...(isIos
      ? {
          apns: {
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        }
      : {
          android: {
            priority: "HIGH",
            notification: {
              sound: "default",
              channel_id: "matches",
            },
          },
        }),
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
      }),
    },
  );

  const data = (await response.json().catch(() => null)) as FirebaseErrorResponse | null;
  return { ok: response.ok, status: response.status, data };
}

export function shouldDeactivateToken(result: {
  status: number;
  data: FirebaseErrorResponse | null;
}) {
  const errorCode = result.data?.error?.details?.[0]?.errorCode ?? result.data?.error?.status;
  return result.status === 404 || errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT";
}

export type PushAudience = { target: "all" | "cities"; uf: string; cities: string[] };
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
export function normalizeCity(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}
export function parseAudience(payload: Record<string, unknown>): PushAudience {
  if (payload.target === "all") {
    if (payload.uf || (payload.cities !== undefined && (!Array.isArray(payload.cities) || payload.cities.length > 0))) throw new Error("invalid_audience");
    return { target: "all", uf: "", cities: [] };
  }
  if (payload.target !== "cities" || typeof payload.uf !== "string" || !Array.isArray(payload.cities)) throw new Error("invalid_audience");
  const uf = payload.uf.trim().toUpperCase();
  if (!UFS.has(uf) || payload.cities.length < 1 || payload.cities.length > 100) throw new Error("invalid_audience");
  const cities = payload.cities.map((city: unknown) => {
    if (typeof city !== "string" || !city.trim() || city.length > 120) throw new Error("invalid_audience");
    return normalizeCity(city);
  });
  return { target: "cities", uf, cities: [...new Set(cities)] };
}
export function companyMatchesAudience(company: { estado: string | null; cidade: string | null }, audience: PushAudience) {
  return audience.target === "all" || (company.estado?.trim().toUpperCase() === audience.uf
    && !!company.cidade && audience.cities.includes(normalizeCity(company.cidade)));
}





type PushToken = {
  id: string;
  token: string;
  platform: string | null;
  user_id: string;
};

type PushRequest = {
  title?: string;
  body?: string;
  path?: string;
  external_url?: string;
  target?: "all" | "cities";
  uf?: string;
  cities?: string[];
  preview?: boolean;
};

type PushFailure = {
  platform: string;
  status: number;
  code: string;
  message: string;
};

const ALLOWED_PATHS = new Set(["/app", "/app/anunciar", "/app/buscar", "/app/perfil?upgrade=1"]);

function validExternalUrl(value: string) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
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
    let audience;
    try { audience = parseAudience(payload as Record<string, unknown>); }
    catch { return json({ error: "invalid_audience" }, 400); }
    if (payload.preview !== undefined && typeof payload.preview !== "boolean") return json({ error: "invalid_preview" }, 400);
    const title = payload.title?.trim().slice(0, 80);
    const body = payload.body?.trim().slice(0, 180);
    const path = payload.path?.trim() || "/app";
    const requestedExternalUrl = payload.external_url?.trim() ?? "";
    const externalUrl = requestedExternalUrl ? validExternalUrl(requestedExternalUrl) : null;
    if (!payload.preview && (!title || !body)) return json({ error: "missing_title_or_body" }, 400);
    if (requestedExternalUrl && !externalUrl) return json({ error: "invalid_external_url" }, 400);
    if (!ALLOWED_PATHS.has(path)) return json({ error: "invalid_path" }, 400);
    let eligibleUsers: Set<string> | null = null;
    if (audience.target === "cities") {
      eligibleUsers = new Set<string>();
      for (let offset = 0; ; offset += 500) {
        const { data: companies, error } = await adminClient.from("empresas")
          .select("id, owner_id, cidade, estado").order("id").range(offset, offset + 499);
        if (error) throw error;
        for (const company of companies ?? []) {
          if (companyMatchesAudience(company, audience)) eligibleUsers.add(company.owner_id);
        }
        if ((companies ?? []).length < 500) break;
      }
    }
    const tokens: PushToken[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await adminClient.from("push_tokens")
        .select("id, token, platform, user_id").eq("active", true).order("id").range(offset, offset + 499);
      if (error) throw error;
      for (const token of (page ?? []) as PushToken[]) {
        if (!eligibleUsers || eligibleUsers.has(token.user_id)) tokens.push(token);
      }
      if ((page ?? []).length < 500) break;
    }

    const recipientIds = [
      ...new Set(((tokens ?? []) as PushToken[]).map((token) => token.user_id)),
    ];
    if (payload.preview) return json({ total: tokens.length, clients: recipientIds.length, sent: 0, failed: 0 });
    if (recipientIds.length > 0) {
      const { error: notificationError } = await adminClient.from("notificacoes").insert(
        recipientIds.map((userId) => ({
          user_id: userId,
          tipo: "admin_broadcast",
          titulo: title!,
          mensagem: body!,
        })),
      );
      if (notificationError) throw notificationError;
    }

    let sent = 0;
    let failed = 0;
    const inactiveIds: string[] = [];
    const failures: PushFailure[] = [];

    for (const pushToken of (tokens ?? []) as PushToken[]) {
      const result = await sendFirebasePush({
        token: pushToken.token,
        platform: pushToken.platform,
        title: title!,
        body: body!,
        data: {
          type: "admin_broadcast",
          path,
          ...(externalUrl ? { external_url: externalUrl } : {}),
        },
      });

      if (result.ok) {
        sent += 1;
        continue;
      }

      failed += 1;
      const firebaseError = result.data?.error;
      const code =
        firebaseError?.details?.find((detail) => detail.errorCode)?.errorCode ??
        firebaseError?.status ??
        "firebase_send_failed";
      const failure = {
        platform: pushToken.platform ?? "unknown",
        status: result.status,
        code,
        message: firebaseError?.message ?? "O Firebase recusou a notificacao.",
      };
      failures.push(failure);
      console.error("[send-push] firebase send failed", {
        token_id: pushToken.id,
        ...failure,
      });
      if (shouldDeactivateToken(result)) inactiveIds.push(pushToken.id);
    }

    if (inactiveIds.length > 0) {
      await adminClient.from("push_tokens").update({ active: false }).in("id", inactiveIds);
    }

    await adminClient.from("push_broadcasts").insert({
      title,
      body,
      target: audience.target === "all" ? "all" : `cities:${audience.uf}:${audience.cities.join(";")}`,
      sent_by: userData.user.id,
      image_url: null,
      total_tokens: tokens?.length ?? 0,
      success_count: sent,
      failure_count: failed,
    });

    return json({ total: tokens?.length ?? 0, sent, failed, failures: failures.slice(0, 5) });
  } catch (error) {
    console.error("[send-push]", error);
    return json({ error: error instanceof Error ? error.message : "send_push_failed" }, 500);
  }
});
