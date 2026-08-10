import { FirebaseMessaging } from "@capacitor-firebase/messaging";

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const APNS_WAIT_ATTEMPTS = 30;
const APNS_WAIT_INTERVAL_MS = 1_000;

let pendingTokenRequest: Promise<string> | null = null;

function isMissingApnsTokenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("no apns token");
}

async function requestIosFcmToken() {
  let lastError: unknown;
  let apnsTokenReceived = false;

  const apnsListener = await FirebaseMessaging.addListener("apnsTokenReceived", ({ token }) => {
    if (token) apnsTokenReceived = true;
  });

  try {
    for (let attempt = 0; attempt < APNS_WAIT_ATTEMPTS; attempt += 1) {
      try {
        const { token } = await FirebaseMessaging.getToken();
        if (token) return token;
      } catch (error) {
        lastError = error;

        if (!isMissingApnsTokenError(error)) {
          throw error;
        }
      }

      // The native callback can arrive a few seconds after the user grants
      // notification permission, especially on the first app launch.
      await delay(apnsTokenReceived ? 350 : APNS_WAIT_INTERVAL_MS);
    }
  } finally {
    await apnsListener.remove();
  }

  if (isMissingApnsTokenError(lastError)) {
    throw new Error(
      "O iPhone ainda nao concluiu o registro de notificacoes. Feche e abra o app com internet e tente novamente.",
    );
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("O Firebase nao retornou o token de notificacao deste iPhone.");
}

export function getIosFcmToken() {
  if (!pendingTokenRequest) {
    pendingTokenRequest = requestIosFcmToken().finally(() => {
      pendingTokenRequest = null;
    });
  }

  return pendingTokenRequest;
}
