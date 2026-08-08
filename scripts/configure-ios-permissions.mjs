import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const platform = process.env.CAPACITOR_PLATFORM_NAME;
if (platform && platform !== "ios") process.exit(0);

const infoPlist = resolve("ios", "App", "App", "Info.plist");
if (!existsSync(infoPlist)) {
  console.log("iOS Info.plist ainda nao existe; configuracao de camera ignorada.");
  process.exit(0);
}

const plistBuddy = "/usr/libexec/PlistBuddy";
const permissions = {
  NSCameraUsageDescription: "Permite tirar fotos das sobras de materiais anunciadas.",
  NSPhotoLibraryUsageDescription: "Permite escolher fotos das sobras de materiais anunciadas.",
  NSPhotoLibraryAddUsageDescription: "Permite salvar imagens do SOS Marceneiros na sua galeria.",
};

for (const [key, value] of Object.entries(permissions)) {
  const setResult = spawnSync(plistBuddy, ["-c", `Set :${key} ${value}`, infoPlist], {
    stdio: "ignore",
  });

  if (setResult.status !== 0) {
    const addResult = spawnSync(
      plistBuddy,
      ["-c", `Add :${key} string ${value}`, infoPlist],
      { stdio: "inherit" },
    );
    if (addResult.status !== 0) process.exit(addResult.status ?? 1);
  }
}

const encryptionKey = "ITSAppUsesNonExemptEncryption";
const encryptionResult = spawnSync(
  plistBuddy,
  ["-c", `Set :${encryptionKey} false`, infoPlist],
  { stdio: "ignore" },
);

if (encryptionResult.status !== 0) {
  const addEncryptionResult = spawnSync(
    plistBuddy,
    ["-c", `Add :${encryptionKey} bool false`, infoPlist],
    { stdio: "inherit" },
  );
  if (addEncryptionResult.status !== 0) {
    process.exit(addEncryptionResult.status ?? 1);
  }
}

console.log(
  "Permissoes e declaracao de criptografia configuradas no Info.plist do iOS.",
);
