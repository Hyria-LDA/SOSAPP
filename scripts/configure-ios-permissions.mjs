import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const platform = process.env.CAPACITOR_PLATFORM_NAME;
if (platform && platform !== "ios") process.exit(0);

const infoPlist = resolve("ios", "App", "App", "Info.plist");
if (!existsSync(infoPlist)) {
  console.log("iOS Info.plist ainda nao existe; configuracao de camera ignorada.");
  process.exit(0);
}

const appDelegate = resolve("ios", "App", "App", "AppDelegate.swift");
if (existsSync(appDelegate)) {
  let appDelegateSource = readFileSync(appDelegate, "utf8");

  for (const firebaseImport of ["import FirebaseCore", "import FirebaseMessaging"]) {
    if (!appDelegateSource.includes(firebaseImport)) {
      const importAnchor = "import Capacitor";
      if (!appDelegateSource.includes(importAnchor)) {
        console.error("Nao foi possivel localizar os imports do AppDelegate.swift.");
        process.exit(1);
      }
      appDelegateSource = appDelegateSource.replace(
        importAnchor,
        `${importAnchor}\n${firebaseImport}`,
      );
    }
  }

  const remoteNotificationMethods = [
    {
      marker: "didRegisterForRemoteNotificationsWithDeviceToken",
      source: `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
`,
    },
    {
      marker: "didFailToRegisterForRemoteNotificationsWithError",
      source: `
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`,
    },
    {
      marker: "didReceiveRemoteNotification userInfo",
      source: `
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        NotificationCenter.default.post(
            name: Notification.Name("didReceiveRemoteNotification"),
            object: completionHandler,
            userInfo: userInfo
        )
    }
`,
    },
  ];

  const missingMethods = remoteNotificationMethods
    .filter(({ marker }) => !appDelegateSource.includes(marker))
    .map(({ source }) => source)
    .join("");

  if (missingMethods) {
    const classClosingBrace = appDelegateSource.lastIndexOf("\n}");
    if (classClosingBrace < 0) {
      console.error("Nao foi possivel localizar o fim da classe AppDelegate.");
      process.exit(1);
    }
    appDelegateSource = `${appDelegateSource.slice(0, classClosingBrace)}${missingMethods}${appDelegateSource.slice(classClosingBrace)}`;
  }

  const registerMethod =
    "func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {";
  const directApnsAssignment = "Messaging.messaging().apnsToken = deviceToken";
  if (
    appDelegateSource.includes(registerMethod) &&
    !appDelegateSource.includes(directApnsAssignment)
  ) {
    appDelegateSource = appDelegateSource.replace(
      registerMethod,
      `${registerMethod}\n        if FirebaseApp.app() == nil {\n            FirebaseApp.configure()\n        }\n        ${directApnsAssignment}`,
    );
  }

  writeFileSync(appDelegate, appDelegateSource);
}

const firebasePlist = resolve("ios", "App", "App", "GoogleService-Info.plist");
if (!existsSync(firebasePlist)) {
  console.warn(
    "ATENCAO: adicione o GoogleService-Info.plist do app iOS em ios/App/App antes de gerar a versao.",
  );
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
    const addResult = spawnSync(plistBuddy, ["-c", `Add :${key} string ${value}`, infoPlist], {
      stdio: "inherit",
    });
    if (addResult.status !== 0) process.exit(addResult.status ?? 1);
  }
}

const encryptionKey = "ITSAppUsesNonExemptEncryption";
const encryptionResult = spawnSync(plistBuddy, ["-c", `Set :${encryptionKey} false`, infoPlist], {
  stdio: "ignore",
});

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

const privacyManifest = resolve("ios", "App", "PrivacyInfo.xcprivacy");
const filesystemPrivacyEntry = `
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>`;

if (!existsSync(privacyManifest)) {
  writeFileSync(
    privacyManifest,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>${filesystemPrivacyEntry}
  </array>
</dict>
</plist>
`,
  );
} else {
  const currentManifest = readFileSync(privacyManifest, "utf8");
  if (!currentManifest.includes("NSPrivacyAccessedAPICategoryFileTimestamp")) {
    const updatedManifest = currentManifest.replace(
      /(<key>NSPrivacyAccessedAPITypes<\/key>\s*<array>)/,
      `$1${filesystemPrivacyEntry}`,
    );
    if (updatedManifest === currentManifest) {
      console.error(
        "PrivacyInfo.xcprivacy existente nao possui NSPrivacyAccessedAPITypes; ajuste manual necessario.",
      );
      process.exit(1);
    }
    writeFileSync(privacyManifest, updatedManifest);
  }
}

console.log(
  "Permissoes, notificacoes, criptografia e manifesto de privacidade configurados no iOS.",
);
