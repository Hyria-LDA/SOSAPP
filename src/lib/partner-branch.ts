import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const INSTALLATION_ID_KEY = "sos:partner-installation-id";
const INSTALL_REPORTED_KEY = "sos:partner-install-reported";

export function buildPartnerInstallLink(code: string) {
  const url = new URL("https://4n5y8.app.link/");
  url.searchParams.set("partner_code", code.trim().toUpperCase());
  url.searchParams.set("~channel", "parceiros");
  url.searchParams.set("~feature", "indicacao");
  url.searchParams.set(
    "$android_url",
    "https://play.google.com/store/apps/details?id=br.com.sosmarceneiros.app",
  );
  url.searchParams.set("$ios_url", "https://apps.apple.com/app/id6799402979");
  url.searchParams.set(
    "$desktop_url",
    `https://www.sosmarceneiros.com.br/r/${encodeURIComponent(code)}`,
  );
  return url.toString();
}

export function buildPartnerReferralLink(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  return `https://www.sosmarceneiros.com.br/r/${encodeURIComponent(normalizedCode)}`;
}

function installationId() {
  let value = localStorage.getItem(INSTALLATION_ID_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_ID_KEY, value);
  }
  return value;
}

export async function startPartnerBranchAttribution() {
  if (!Capacitor.isNativePlatform()) return () => {};

  const { BranchDeepLinks } = await import("capacitor-branch-deep-links");
  const handle = await BranchDeepLinks.addListener("init", ({ referringParams }) => {
    if (!referringParams?.["+clicked_branch_link"]) return;
    const code = String(referringParams.partner_code ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9_-]{1,40}$/.test(code)) return;

    localStorage.setItem("ref_codigo", code);
    if (localStorage.getItem(INSTALL_REPORTED_KEY) === code) return;

    void supabase.functions
      .invoke("record-partner-install", {
        body: { code, installationId: installationId(), platform: Capacitor.getPlatform() },
      })
      .then(({ data, error }) => {
        if (!error && data?.ok) localStorage.setItem(INSTALL_REPORTED_KEY, code);
      });
  });

  return () => handle.remove();
}
