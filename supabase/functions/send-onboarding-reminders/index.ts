import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import {
  corsHeaders,
  getEnv,
  json,
  sendFirebasePush,
  shouldDeactivateToken,
} from "../_shared/firebase-push.ts";

type Audience =
  | "no_registration"
  | "active_registration"
  | "plan_tx"
  | "plan_ultra"
  | "plan_premium"
  | "all";
type Schedule = {
  id: string;
  position: number;
  send_time: string;
  title: string;
  body: string;
  audience: Audience;
};
type PushToken = { id: string; token: string; platform: string | null; user_id: string };
type Company = {
  owner_id: string;
  onboarded: boolean | null;
  status: string | null;
  plano_id: string | null;
  plano_vencimento: string | null;
};

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    time: `${value("hour")}:${value("minute")}`,
  };
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let offset = 0; offset < items.length; offset += size)
    await Promise.all(items.slice(offset, offset + size).map(fn));
}

function matchesAudience(audience: Audience, company: Company | undefined, planSlug?: string) {
  if (audience === "all") return true;
  if (audience === "no_registration") return !company || company.onboarded !== true;
  if (!company || company.onboarded !== true || company.status !== "ativa") return false;
  if (audience === "active_registration") return true;
  const planIsCurrent =
    !company.plano_vencimento || new Date(company.plano_vencimento).getTime() > Date.now();
  return planIsCurrent && planSlug === audience.replace("plan_", "");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

  try {
    const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
    const { data: expectedSecret, error: secretError } = await admin.rpc(
      "get_onboarding_reminder_cron_secret",
    );
    if (secretError) throw secretError;
    if (!suppliedSecret || suppliedSecret !== expectedSecret)
      return json({ error: "forbidden" }, 403);

    const local = saoPauloNow();
    if (["Sat", "Sun"].includes(local.weekday)) return json({ skipped: true, reason: "weekend" });
    const { data: rows, error: scheduleError } = await admin
      .from("notification_automation_schedules")
      .select("id, position, send_time, title, body, audience")
      .eq("active", true)
      .order("position");
    if (scheduleError) throw scheduleError;
    const due = ((rows ?? []) as Schedule[]).filter(
      (schedule) => schedule.send_time.slice(0, 5) === local.time,
    );
    if (!due.length) return json({ skipped: true, reason: "no_schedule_due" });

    const { data: tokenRows, error: tokenError } = await admin
      .from("push_tokens")
      .select("id, token, platform, user_id")
      .eq("active", true);
    if (tokenError) throw tokenError;
    const tokens = (tokenRows ?? []) as PushToken[];
    const userIds = [...new Set(tokens.map((token) => token.user_id))];
    const companies: Company[] = [];
    const excludedUsers = new Set<string>();
    for (let offset = 0; offset < userIds.length; offset += 500) {
      const ids = userIds.slice(offset, offset + 500);
      const [companyResult, roleResult] = await Promise.all([
        admin
          .from("empresas")
          .select("owner_id, onboarded, status, plano_id, plano_vencimento")
          .in("owner_id", ids),
        admin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids)
          .in("role", ["admin", "vendedor"]),
      ]);
      if (companyResult.error) throw companyResult.error;
      if (roleResult.error) throw roleResult.error;
      companies.push(...((companyResult.data ?? []) as Company[]));
      for (const role of roleResult.data ?? []) excludedUsers.add(role.user_id);
    }

    const planIds = [
      ...new Set(companies.map((company) => company.plano_id).filter(Boolean)),
    ] as string[];
    const planById = new Map<string, string>();
    if (planIds.length) {
      const { data: plans, error } = await admin
        .from("planos")
        .select("id, slug")
        .in("id", planIds);
      if (error) throw error;
      for (const plan of plans ?? []) planById.set(plan.id, plan.slug);
    }
    const companyByUser = new Map(companies.map((company) => [company.owner_id, company]));
    const results = [];

    for (const schedule of due) {
      const runKey = `${local.date}:${schedule.id}:${local.time}`;
      const { data: existing } = await admin
        .from("onboarding_reminder_runs")
        .select("status")
        .eq("run_key", runKey)
        .maybeSingle();
      if (["completed", "running"].includes(existing?.status ?? "")) {
        results.push({ schedule: schedule.position, skipped: true });
        continue;
      }
      const slot =
        schedule.position === 1 ? "morning" : schedule.position === 2 ? "afternoon" : "evening";
      const { error: runError } = await admin
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

      const eligible = tokens.filter((token) => {
        if (excludedUsers.has(token.user_id)) return false;
        const company = companyByUser.get(token.user_id);
        return matchesAudience(
          schedule.audience,
          company,
          company?.plano_id ? planById.get(company.plano_id) : undefined,
        );
      });
      let sent = 0;
      let failed = 0;
      const inactiveIds: string[] = [];
      await inBatches(eligible, 50, async (pushToken) => {
        const result = await sendFirebasePush({
          token: pushToken.token,
          platform: pushToken.platform,
          title: schedule.title,
          body: schedule.body,
          data: {
            type: "scheduled_notification",
            path: schedule.audience === "no_registration" ? "/onboarding" : "/app",
          },
        });
        if (result.ok) sent += 1;
        else {
          failed += 1;
          if (shouldDeactivateToken(result)) inactiveIds.push(pushToken.id);
        }
      });
      if (inactiveIds.length)
        await admin.from("push_tokens").update({ active: false }).in("id", inactiveIds);
      const recipients = new Set(eligible.map((token) => token.user_id)).size;
      await admin
        .from("onboarding_reminder_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_recipients: recipients,
          total_tokens: eligible.length,
          success_count: sent,
          failure_count: failed,
        })
        .eq("run_key", runKey);
      results.push({ schedule: schedule.position, recipients, sent, failed });
    }
    return json({ time: local.time, results });
  } catch (error) {
    console.error("[send-onboarding-reminders]", error);
    return json({ error: error instanceof Error ? error.message : "automation_failed" }, 500);
  }
});
