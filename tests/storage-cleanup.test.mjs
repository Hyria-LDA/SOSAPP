import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  collectOwnedStoragePaths,
  ownedStoragePath,
} from "../supabase/functions/_shared/storage-cleanup.ts";

const companyId = "11111111-1111-4111-8111-111111111111";
const materialId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const supabaseUrl = "https://project.supabase.co";
const scope = { bucket: "materiais", supabaseUrl, companyId, materialId };
const photo = `${companyId}/${materialId}/foto-1.webp`;
const thumb = `${companyId}/${materialId}/thumb-1.webp`;

test("keeps existing photo, thumbnail and legacy signed URL formats", () => {
  assert.equal(ownedStoragePath(photo, scope), photo);
  assert.equal(ownedStoragePath(thumb, scope), thumb);
  for (const endpoint of [
    "object/sign",
    "object/public",
    "render/image/sign",
    "render/image/public",
  ]) {
    assert.equal(
      ownedStoragePath(`${supabaseUrl}/storage/v1/${endpoint}/materiais/${photo}?token=old`, scope),
      photo,
    );
  }
});

for (const [name, value] of [
  ["another company", `${otherId}/${materialId}/foto.webp`],
  ["another material", `${companyId}/${otherId}/foto.webp`],
  ["company prefix collision", `${companyId}-suffix/${materialId}/foto.webp`],
  ["traversal", `${companyId}/${materialId}/../foto.webp`],
  ["encoded traversal", `${companyId}/${materialId}/%2e%2e%2ffoto.webp`],
  ["encoded separator", `${companyId}/${materialId}/foto%2fother.webp`],
  ["backslash", `${companyId}/${materialId}/foto\\other.webp`],
  ["leading slash", `/${photo}`],
  ["empty segment", `${companyId}//${materialId}/foto.webp`],
  ["foreign origin", `https://other.supabase.co/storage/v1/object/public/materiais/${photo}`],
  ["wrong bucket", `${supabaseUrl}/storage/v1/object/public/logos/${photo}`],
  ["malformed encoding", `${supabaseUrl}/storage/v1/object/sign/materiais/${photo}%ZZ`],
  [
    "double encoding",
    `${supabaseUrl}/storage/v1/object/sign/materiais/${companyId}/${materialId}/%252e%252e`,
  ],
  ["non-string", { path: photo }],
]) {
  test(`rejects ${name}`, () => assert.equal(ownedStoragePath(value, scope), null));
}

test("logos must belong to the company owner", () => {
  const logoScope = { bucket: "logos", supabaseUrl, ownerId };
  assert.equal(
    ownedStoragePath(
      `${supabaseUrl}/storage/v1/object/public/logos/${ownerId}/logo.webp`,
      logoScope,
    ),
    `${ownerId}/logo.webp`,
  );
  assert.equal(ownedStoragePath(`${otherId}/logo.webp`, logoScope), null);
});

test("deduplicates files, ignores empty thumbnails and counts suspicious references", () => {
  assert.deepEqual(
    collectOwnedStoragePaths([photo, photo, thumb, null, "", `${otherId}/bad.webp`], scope),
    {
      paths: [photo, thumb],
      skipped: 1,
    },
  );
});

// Run the actual handlers with isolated auth/database/storage doubles. No network or real deletion.
async function invokeHandler(
  name,
  { adminRole = false, authUser = ownerId, companyLogo = null, photos = [] } = {},
) {
  let handler;
  const removals = [];
  const deletions = [];
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: authUser } } }),
      admin: {
        deleteUser: async (id) => {
          deletions.push(id);
          return {};
        },
      },
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          removals.push({ bucket, paths: Array.from(paths) });
          return {};
        },
      }),
    },
    from: (table) => {
      let deleting = false;
      const query = {
        select: () => query,
        eq: () => query,
        delete: () => {
          deleting = true;
          return query;
        },
        maybeSingle: () => query,
        then: (resolve, reject) => {
          let data;
          if (deleting) deletions.push(materialId);
          else if (table === "materiais")
            data = {
              id: materialId,
              empresa_id: companyId,
              empresas: { owner_id: ownerId },
            };
          else if (table === "empresas")
            data = { id: companyId, owner_id: ownerId, logo_url: companyLogo };
          else if (table === "user_roles") data = adminRole ? { user_id: authUser } : null;
          else if (table === "fotos_materiais") data = photos;
          return Promise.resolve({ data }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const source = readFileSync(
    new URL(`../supabase/functions/${name}/index.ts`, import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const shared = {
    corsHeaders: {},
    getEnv: (key) => (key === "SUPABASE_URL" ? supabaseUrl : "test-only"),
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
  };
  vm.runInNewContext(outputText, {
    exports: {},
    Response,
    console: { warn() {}, error() {} },
    Deno: {
      serve: (callback) => {
        handler = callback;
      },
    },
    require: (specifier) => {
      if (specifier.startsWith("https://esm.sh/")) return { createClient: () => admin };
      if (specifier.endsWith("storage-cleanup.ts")) return { collectOwnedStoragePaths };
      if (specifier.endsWith("firebase-push.ts")) return shared;
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer test" },
      body: JSON.stringify({ material_id: materialId, empresa_id: companyId }),
    }),
  );
  return {
    status: response.status,
    body: await response.json(),
    removals,
    deletions,
  };
}

test("material handler deletes owned files but preserves injected references", async () => {
  const result = await invokeHandler("delete-material", {
    photos: [{ url: photo, thumbnail_url: thumb }, { url: `${otherId}/${materialId}/victim.webp` }],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.removals, [{ bucket: "materiais", paths: [photo, thumb] }]);
  assert.deepEqual(result.body.cleanup_warnings, ["unsafe_file_references"]);
  assert.equal(result.body.removed_files, 2);
  assert.deepEqual(result.deletions, [materialId]);
});

test("material handler denies an unrelated user without touching storage", async () => {
  const result = await invokeHandler("delete-material", {
    authUser: otherId,
    photos: [{ url: photo }],
  });
  assert.equal(result.status, 403);
  assert.equal(result.removals.length, 0);
  assert.equal(result.deletions.length, 0);
});

test("company handler preserves another company's images and logo", async () => {
  const result = await invokeHandler("admin-delete-company", {
    adminRole: true,
    authUser: otherId,
    companyLogo: `${supabaseUrl}/storage/v1/object/public/logos/${otherId}/victim.webp`,
    photos: [
      {
        material_id: materialId,
        url: photo,
        thumbnail_url: `${otherId}/${materialId}/victim.webp`,
      },
    ],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.removals, [{ bucket: "materiais", paths: [photo] }]);
  assert.deepEqual(result.body.cleanup_warnings, ["unsafe_file_references"]);
  assert.equal(result.body.removed_files, 1);
  assert.deepEqual(result.deletions, [ownerId]);
});

test("company handler still removes the authorized owner's logo", async () => {
  const result = await invokeHandler("admin-delete-company", {
    adminRole: true,
    authUser: otherId,
    companyLogo: `${ownerId}/logo.webp`,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.removals, [{ bucket: "logos", paths: [`${ownerId}/logo.webp`] }]);
  assert.deepEqual(result.body.cleanup_warnings, []);
});

test("company handler denies non-admin access", async () => {
  const result = await invokeHandler("admin-delete-company", {
    authUser: otherId,
  });
  assert.equal(result.status, 403);
  assert.equal(result.deletions.length, 0);
  assert.equal(result.removals.length, 0);
});
