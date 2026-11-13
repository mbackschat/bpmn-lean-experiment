import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { mvpBpmnCapabilities, mvpBpmnRestrictions } from "../model-corpus/mvp-capabilities.ts";

// A catalog row is prose for the Product 2 About page; what this guard holds it to are the facts it names, each checked
// against its owner rather than against the row's wording: a refusal code against the generated kernel vocabulary, a
// register entry against the CIB-BPMN relation register, a `name = value` profile option against the vocabulary's
// profile options, and every "<name> profile" against `profiles/`. A row naming a profile that no longer exists, such as a
// retired per-variant capsule profile, therefore fails here. The Product 2 panel test
// (`platform/apps/web/test/capabilities-panel.test.ts`) checks rendering only.
const read = (relative: string): string => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const vocabulary = JSON.parse(read("contracts/schemas/vocabulary.schema.json")).$defs as {
  refusalCode: { enum: ReadonlyArray<string> };
  profileOptions: { properties: Record<string, { enum: ReadonlyArray<string> }> };
};
const refusalCodes = new Set(vocabulary.refusalCode.enum);
const registerIds = new Set(
  [...read("docs/CIB-BPMN-RELATION-REGISTER.md").matchAll(/^#{2,4} (CIB-[A-Z]+-\d{4})\b/gmu)].map((match) => match[1]),
);
const semanticsDocuments = new Set(
  readdirSync(new URL("../docs/kernel/semantics/", import.meta.url)).map((name) => name.replace(/\.md$/u, "")),
);
const profileIds = new Set(
  readdirSync(new URL("../profiles/", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => (JSON.parse(read(`profiles/${entry.name}/profile.json`)) as { id: string }).id),
);

// The family names prose uses for the current profiles; each must keep naming existing profiles.
const profileFamilies: Readonly<Record<string, ReadonlyArray<string>>> = {
  standards: ["bpmn-2.0.2"],
  cibseven: ["cibseven-2.2.0", "cibseven-2.2.0-scope-chain"],
};
// Words that make "profile" generic rather than a name.
const genericProfileWords = new Set(["a", "the", "its", "each", "every", "one", "that", "this", "which"]);

const refusalCodePattern = /(?<![\w.:-])[a-z][a-zA-Z]*(?:\.[a-zA-Z]+)+(?![\w-])/gu;
const registerIdPattern = /\bCIB-[A-Z]+-\d{4}\b/gu;
// A Boolean on the right is a BPMN attribute (`waitForCompletion = false`); no profile option takes one.
const profileOptionPattern = /\b([A-Za-z]+) = (?!true\b|false\b)([A-Za-z]+)\b/gu;
const profileNamePattern = /([\w.-]+) profiles?\b/gu;

/** Every fact `text` names that its owner does not hold, as readable findings. */
function unknownFacts(text: string): string[] {
  const findings: string[] = [];
  for (const [code] of text.matchAll(refusalCodePattern)) {
    if (!refusalCodes.has(code)) findings.push(`refusal code ${code} is not in the kernel vocabulary`);
  }
  for (const [id] of text.matchAll(registerIdPattern)) {
    if (!registerIds.has(id)) findings.push(`register entry ${id} does not exist`);
  }
  for (const [, name = "", value = ""] of text.matchAll(profileOptionPattern)) {
    const option = vocabulary.profileOptions.properties[name.charAt(0).toLowerCase() + name.slice(1)];
    if (option === undefined) findings.push(`profile option ${name} does not exist`);
    else if (!option.enum.includes(value)) findings.push(`profile option ${name} has no value ${value}`);
  }
  for (const [, name = ""] of text.matchAll(profileNamePattern)) {
    if (genericProfileWords.has(name.toLowerCase()) || profileIds.has(name) || name in profileFamilies) continue;
    findings.push(`profile "${name}" does not exist`);
  }
  return findings;
}

test("the profile families the catalog may name are existing profiles", () => {
  for (const [family, ids] of Object.entries(profileFamilies)) {
    for (const id of ids) assert.ok(profileIds.has(id), `${family} names absent profile ${id}`);
  }
  assert.deepEqual(
    [...profileIds].sort(),
    Object.values(profileFamilies).flat().sort(),
    "every profile belongs to exactly one family the catalog may name",
  );
});

test("every capability row names only refusal codes, register entries, profile options and profiles that exist", () => {
  const findings = mvpBpmnCapabilities.flatMap(({ id, element, restriction }) =>
    unknownFacts(`${element}\n${restriction}`).map((finding) => `${id}: ${finding}`)
  );
  assert.deepEqual(findings, []);
});

test("every restriction row names a vocabulary refusal code and a basis that exists", () => {
  const findings = mvpBpmnRestrictions.flatMap(({ refusalCode, restriction, basis }) => {
    const own = refusalCodes.has(refusalCode) ? [] : [`refusal code ${refusalCode} is not in the kernel vocabulary`];
    const bases = basis.split(";").map((part) => part.trim()).filter((part) =>
      !semanticsDocuments.has(part) && !registerIds.has(part)
    ).map((part) => `basis ${part} is neither a semantics document nor a register entry`);
    return [...own, ...bases, ...unknownFacts(restriction)].map((finding) => `${refusalCode}: ${finding}`);
  });
  assert.deepEqual(findings, []);
});

test("every restriction row's basis begins with the semantics document the About page groups it under", () => {
  assert.deepEqual(
    mvpBpmnRestrictions.filter(({ basis }) => !semanticsDocuments.has(basis.split(";")[0]?.trim() ?? ""))
      .map(({ refusalCode }) => refusalCode),
    [],
  );
});

test("the fact patterns recognize what they check", () => {
  assert.deepEqual(unknownFacts("refused (scope.withoutStart, CIB-LIM-0024) under scopeStart = required"), []);
  assert.deepEqual(unknownFacts("under the standards profile and the cibseven-2.2.0-scope-chain profile"), []);
  assert.deepEqual(unknownFacts("Kernel.Timer.classify, ${name}, ##Compensate, camunda:in, bpmn-2.0.2, waitForCompletion = false"), []);
  assert.deepEqual(unknownFacts("The nested scope-data profile (scope.nowhere, CIB-LIM-9999) under scopeStart = sometimes"), [
    "refusal code scope.nowhere is not in the kernel vocabulary",
    "register entry CIB-LIM-9999 does not exist",
    "profile option scopeStart has no value sometimes",
    "profile \"scope-data\" does not exist",
  ]);
});
