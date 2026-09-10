import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import {
  corsHeaders,
  getEnv,
  json,
  sendFirebasePush,
  shouldDeactivateToken,
} from "../_shared/firebase-push.ts";

type Slot = "morning" | "afternoon" | "evening";
type PushToken = { id: string; token: string; platform: string | null; user_id: string };
type Company = { owner_id: string; onboarded: boolean | null };

const COPY: Record<Slot, Array<{ title: string; body: string }>> = {
  morning: [
    {
      title: "Falta pouco para comecar",
      body: "Conclua o cadastro da sua marcenaria e aproveite todos os recursos do SOS Marceneiros.",
    },
    {
      title: "Vamos concluir seu cadastro?",
      body: "Finalize os dados da empresa para anunciar, buscar materiais e aparecer para outros profissionais.",
    },
  ],
  afternoon: [
    {
      title: "Seu cadastro esta quase pronto",
      body: "Continue de onde parou. Leva poucos minutos para liberar sua conta no SOS Marceneiros.",
    },
    {
      title: "Nao deixe para depois",
      body: "Complete o cadastro da marcenaria e comece a encontrar oportunidades perto de voce.",
    },
  ],
  evening: [
    {
      title: "Conclua seu cadastro hoje",
      body: "Preencha os dados que faltam e deixe sua conta pronta para usar o SOS Marceneiros.",
    },
    {
      title: "Sua marcenaria esta quase ativa",
      body: "Toque aqui para terminar o cadastro e liberar as funcoes do aplicativo.",
    },
  ],
};

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    day: Number(value("day")),
  };
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let offset = 0; offset < items.length; offset += size) {
    await Promise.all(items.slice(offset, offset + size).map(fn));
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const adminClient = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

  try {
    const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
    const { data: expectedSecret, error: secretError } = await adminClient.rpc(
      "get_onboarding_reminder_cron_secret",
    );
    if (secretError) throw secretError;
    if (!suppliedSecret || suppliedSecret !== expectedSecret)
      return json({ error: "forbidden" }, 403);

    const payload = (await request.json().catch(() => ({}))) as { slot?: Slot };
    const slot = payload.slot;
    if (!slot || !COPY[slot]) return json({ error: "invalid_slot" }, 400);

    const local = saoPauloNow();
    if (local.weekday === "Sat" || local.weekday === "Sun") {
      return json({ skipped: true, reason: "weekend" });
    }

    const runKey = `${local.date}:${slot}`;
    const { data: existing } = await adminClient
      .from("onboarding_reminder_runs")
      .select("status")
      .eq("run_key", runKey)
      .maybeSingle();
    if (existing?.status === "completed" || existing?.status === "running") {
      return json({ skipped: true, reason: "already_processed", run_key: runKey });
    }

    const { error: runError } = await adminClient
      .from("onboarding_reminder_runs")
      .upsert(
        {
          run_key: runKey,
          slot,
          status: "running",
          started_at: new Date().toISOString(),
          error_message: null,
        },
        { onConflict: "run_key" },
      );
    if (runError) throw runError;

    const { data: tokenRows, error: tokenError } = await adminClient
      .from("push_tokens")
      .select("id, token, platform, user_id")
      .eq("active", true);
    if (tokenError) throw tokenError;

    const tokens = (tokenRows ?? []) as PushToken[];
    const userIds = [...new Set(tokens.map((item) => item.user_id))];
    const companies: Company[] = [];
    const privilegedUsers = new Set<string>();

    for (let offset = 0; offset < userIds.length; offset += 500) {
      const ids = userIds.slice(offset, offset + 500);
      const [{ data: companyRows, error: companyError }, { data: roleRows, error: roleError }] =
        await Promise.all([
          adminClient.from("empresas").select("owner_id, onboarded").in("owner_id", ids),
          adminClient
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", ids)
            .in("role", ["admin", "vendedor"]),
        ]);
      if (companyError) throw companyError;
      if (roleError) throw roleError;
      companies.push(...((companyRows ?? []) as Company[]));
      for (const row of roleRows ?? []) privilegedUsers.add(row.user_id);
    }

    const completedUsers = new Set(
      companies.filter((company) => company.onboarded === true).map((company) => company.owner_id),
    );
    const eligibleTokens = tokens.filter(
      (token) => !completedUsers.has(token.user_id) && !privilegedUsers.has(token.user_id),
    );
    const recipients = [...new Set(eligibleTokens.map((token) => token.user_id))];
    const message = COPY[slot][local.day % COPY[slot].length];

    let sent = 0;
    let failed = 0;
    const inactiveIds: string[] = [];
    await inBatches(eligibleTokens, 50, async (pushToken) => {
      const result = await sendFirebasePush({
        token: pushToken.token,
        platform: pushToken.platform,
        title: message.title,
        body: message.body,
        data: { type: "onboarding_reminder", path: "/onboarding" },
      });
      if (result.ok) sent += 1;
      else {
        failed += 1;
        if (shouldDeactivateToken(result)) inactiveIds.push(pushToken.id);
      }
    });

    if (inactiveIds.length > 0) {
      await adminClient.from("push_tokens").update({ active: false }).in("id", inactiveIds);
    }

    await adminClient
      .from("onboarding_reminder_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_recipients: recipients.length,
        total_tokens: eligibleTokens.length,
        success_count: sent,
        failure_count: failed,
      })
      .eq("run_key", runKey);

    return json({
      run_key: runKey,
      recipients: recipients.length,
      total: eligibleTokens.length,
      sent,
      failed,
    });
  } catch (error) {
    console.error("[send-onboarding-reminders]", error);
    return json({ error: error instanceof Error ? error.message : "reminder_failed" }, 500);
  }
});
