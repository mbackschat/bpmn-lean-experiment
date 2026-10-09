import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { DefinitionDeploymentInput } from "../src/definitions-api.ts";
import { build } from "vite";

const dependencies = ["react/jsx-runtime", "react", "@bpmn-lean/platform-ui-kit", "@bpmn-lean/platform-contracts", "@tanstack/react-router"] as const;
const built = await build({
  configFile: false, logLevel: "silent",
  build: {
    minify: false, write: false, target: "esnext",
    ssr: fileURLToPath(new URL("../src/deferred-definition-workspace.tsx", import.meta.url)),
    rollupOptions: { external: (id) => dependencies.includes(id as typeof dependencies[number]) },
  },
});
if (Array.isArray(built) || !("output" in built)) throw new Error("Unexpected deployment form test bundle.");
const chunk = built.output.find((entry) => entry.type === "chunk");
if (chunk === undefined) throw new Error("Deployment form test bundle is missing.");
let runnable = chunk.code;
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(`'${dependency}'`, JSON.stringify(import.meta.resolve(dependency)));
  runnable = runnable.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const module = await import(`data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`) as Readonly<{
  readDefinitionDeploymentInput: (form: FormData) => Promise<DefinitionDeploymentInput>;
}>;

function deploymentForm(): FormData {
  const form = new FormData();
  form.set("source", new File(["<definitions/>"], "literal.bpmn"));
  form.set("semanticProfile", "literal-profile");
  form.set("sourceOverlay", new File([], ""));
  form.set("sourceOverlayId", "");
  form.set("sourceOverlaySha256", "");
  return form;
}

test("keeps omitted overlay deployment exact and captures metadata before reading files", async () => {
  const form = deploymentForm();
  const pending = module.readDefinitionDeploymentInput(form);
  form.set("semanticProfile", "later-profile");
  assert.deepEqual(await pending, {
    bytes: new TextEncoder().encode("<definitions/>"), sourceId: "literal.bpmn", semanticProfile: "literal-profile",
  });
});

test("reads exact overlay bytes and literal identity without parsing or calculating them", async () => {
  const form = deploymentForm();
  const bytes = new TextEncoder().encode('{ "id": "another-id" }\n');
  form.set("sourceOverlay", new File([bytes], "ignored-name.json"));
  form.set("sourceOverlayId", " literal 🚀 ");
  form.set("sourceOverlaySha256", "a".repeat(64));
  const pending = module.readDefinitionDeploymentInput(form);
  form.set("sourceOverlayId", "later-id");
  assert.deepEqual((await pending).sourceOverlay, { id: " literal 🚀 ", sha256: "a".repeat(64), bytes });
});

test("refuses partial triples, empty selected overlays, malformed identities and excessive files", async () => {
  const mutations = [
    (form: FormData) => form.set("sourceOverlayId", "alone"),
    (form: FormData) => form.set("sourceOverlay", new File(["{}"], "overlay.json")),
    (form: FormData) => form.set("sourceOverlay", new File([], "empty.json")),
    (form: FormData) => form.set("sourceOverlayId", new File(["identity"], "identity.txt")),
    (form: FormData) => form.set("sourceOverlayId", "🚀".repeat(257)),
    (form: FormData) => form.set("sourceOverlaySha256", "A".repeat(64)),
    (form: FormData) => form.set("sourceOverlay", new File([new Uint8Array(65_537)], "large.json")),
  ];
  for (const [index, mutate] of mutations.entries()) {
    const form = deploymentForm();
    if (index >= 2) {
      form.set("sourceOverlay", new File(["{}"], "overlay.json"));
      form.set("sourceOverlayId", "literal");
      form.set("sourceOverlaySha256", "a".repeat(64));
    }
    mutate(form);
    await assert.rejects(module.readDefinitionDeploymentInput(form), TypeError);
  }
});
