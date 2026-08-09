import { FirebaseMessaging } from "@capacitor-firebase/messaging";

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function getIosFcmToken() {
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token) return token;
    } catch (error) {
      lastError = error;
    }
    await delay(750);
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("O Firebase nao retornou o token deste iPhone.");
}
