/**
 * The executable model corpus against the kernel: every manifest model's exact bytes and inventory, the kernel's own
 * admission of each (the kernel reader, then `admit`), the MVP capability catalog against what the discovered scenarios
 * exercise, and the generated corpus map. Retained models bind the scenarios the differential discovers, so a corpus
 * model's scenario runs in the kernel oracle; nothing here registers a case or writes a count.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { kernelAdmission, kernelStimulusDecoding, readCaseSource } from "../../packages/differential/test/kernel-program.ts";
import {
  DiscoveredKind,
  discoverScenarios,
  readSourceFor,
} from "../../packages/differential/test/scenario-discovery.ts";
import type { DiscoveredScenario, SourceDefinition } from "../../packages/differential/test/scenario-discovery.ts";
import { isOpenRowWitness, readOpenRowOwners } from "../../scripts/contract-artifact-cases.ts";
import {
  inspectExecutableModelCorpus,
  renderExecutableModelCorpusMap,
  requireExecutableModelCorpusManifest,
} from "../../scripts/executable-model-corpus.ts";
import type {
  CorpusAdmission,
  CorpusAdmitter,
  CorpusScenario,
  CorpusSourceAdmitter,
  ExecutableModelCorpusManifest,
} from "../../scripts/executable-model-corpus.ts";
import { externalRoot } from "../../scripts/external-root.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = path.join(projectRoot, "model-corpus/manifest.json");
const corpusMapPath = path.join(projectRoot, "model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md");

async function loadManifest(): Promise<unknown> {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

const discovered = await discoverScenarios();

function corpusScenario(scenario: DiscoveredScenario): CorpusScenario {
  switch (scenario.kind) {
    case DiscoveredKind.Scenario:
      return {
        id: scenario.document.id,
        relativePath: scenario.relativePath,
        kind: scenario.kind,
        profile: scenario.document.profile,
        sources: [scenario.document.bpmn],
        stimuli: scenario.document.stimuli,
        retainedEvidenceVersion: scenario.evidence?.engineVersion ?? null,
      };
    case DiscoveredKind.PopulationScenario:
      return {
        id: scenario.document.id,
        relativePath: scenario.relativePath,
        kind: scenario.kind,
        profile: scenario.document.profile,
        sources: scenario.document.definitions.map(({ bpmn }) => bpmn),
        stimuli: [],
        retainedEvidenceVersion: null,
      };
  }
}

const scenarios = discovered.map(corpusScenario);

/** Retained models read through the differential's own source path, bound overlay included; external ones bare. */
const admitModel: CorpusAdmitter = async (model, bytes, scenario) => {
  if (scenario === null) {
    return kernelAdmission(await readCaseSource({ relativePath: model.id, bytes, sha256: model.source.sha256, overlay: null },
      model.profile));
  }
  const found = discovered.find(({ relativePath }) => relativePath === scenario.relativePath);
  assert.ok(found !== undefined);
  const sources = found.kind === DiscoveredKind.Scenario
    ? [found.document.bpmn]
    : found.document.definitions.map(({ bpmn }) => bpmn);
  const source = sources.find(({ relativePath }) =>
    model.source.kind === "retainedScenario" && relativePath === model.source.bpmnRelativePath);
  assert.ok(source !== undefined);
  return kernelAdmission(await readSourceFor(found.relativePath, source, found.document.profile));
};

/** Every discovered source by what admission reads: its profile, bytes and the overlay and decisions it binds. */
const sourceDefinitions = new Map<string, { found: DiscoveredScenario; definition: SourceDefinition }>(discovered.flatMap((found) =>
  (found.kind === DiscoveredKind.Scenario ? [found.document.bpmn] : found.document.definitions.map(({ bpmn }) => bpmn))
    .map((definition): [string, { found: DiscoveredScenario; definition: SourceDefinition }] =>
      [`${found.document.profile}\0${definition.relativePath}\0${definition.sha256}`, { found, definition }])));
const sourceAdmissions = new Map<string, Promise<CorpusAdmission>>();

/** The kernel's admission of one scenario source under the scenario's profile, once per distinct source. */
const admitSource: CorpusSourceAdmitter = (scenario, source) => {
  const key = `${scenario.profile}\0${source.relativePath}\0${source.sha256}`;
  const known = sourceDefinitions.get(key);
  assert.ok(known !== undefined, `${scenario.relativePath} binds no discovered source ${source.relativePath}`);
  const identity = `${key}\0${known.definition.sourceOverlay?.sha256 ?? ""}\0${(known.definition.decisions ?? []).map(({ sha256 }) => sha256).join(",")}`;
  const admission = sourceAdmissions.get(identity) ??
    readSourceFor(known.found.relativePath, known.definition, known.found.document.profile).then(kernelAdmission);
  sourceAdmissions.set(identity, admission);
  return admission;
};

const inspect = (
  manifest: ExecutableModelCorpusManifest,
  selected: ReadonlyArray<CorpusScenario> = scenarios,
  admit: CorpusSourceAdmitter = admitSource,
) => inspectExecutableModelCorpus(manifest, {
  projectRoot, externalRoot, scenarios: selected, admitModel, admitSource: admit, decodeStimulus: kernelStimulusDecoding,
});

test("the kernel admits every model exactly as the corpus records it", async () => {
  const report = await inspect(requireExecutableModelCorpusManifest(await loadManifest()));
  assert.deepEqual(report.uncoveredMvpCapabilities, []);
  assert.equal(report.models.length, report.retainedModels + report.externalModels);
  assert.deepEqual(
    report.admissionMismatches,
    [],
    report.admissionMismatches.map((mismatch) => JSON.stringify(mismatch)).join("\n"),
  );
});

test("keeps the generated corpus map exact", async () => {
  const report = await inspect(requireExecutableModelCorpusManifest(await loadManifest()));
  assert.equal(await readFile(corpusMapPath, "utf8"), renderExecutableModelCorpusMap(report));
});

test("every retained model binds a discovered scenario of its own identity", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  for (const model of manifest.models) {
    if (model.source.kind !== "retainedScenario") continue;
    assert.ok(model.businessPurpose !== null && model.businessPurpose.length >= 20, `${model.id} needs a business purpose`);
    const source = model.source;
    const scenario = scenarios.find(({ relativePath }) => relativePath === source.scenarioRelativePath);
    assert.equal(scenario?.id, model.pipelineCaseId, model.id);
  }
});

test("rejects a retained population model whose scenario is not discovered", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const model = manifest.models.find(({ id }) => id === "correlated-settlement-confirmation");
  assert.ok(model?.source.kind === "retainedScenario");
  const scenarioPath = model.source.scenarioRelativePath;
  await assert.rejects(
    inspect(manifest, scenarios.filter(({ relativePath }) => relativePath !== scenarioPath)),
    /model correlated-settlement-confirmation has no discovered scenario/u,
  );
});

test("rejects a supported element variant without a retained MVP model", async () => {
  const manifest = structuredClone(requireExecutableModelCorpusManifest(await loadManifest()));
  const index = manifest.models.findIndex(({ id }) => id === "scheduled-review-start");
  assert.notEqual(index, -1);
  manifest.models.splice(index, 1);
  await assert.rejects(inspect(manifest), /retained MVP models do not cover timerStartEvent/u);
});

test("rejects a catalog variant no discovered scenario exercises", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const withoutTimerStart = scenarios.filter(({ sources }) =>
    !sources.some(({ relativePath }) => relativePath.startsWith("scenarios/timer-start-event/")));
  await assert.rejects(inspect(manifest, withoutTimerStart), /MVP capability catalog differs from the discovered scenarios/u);
});

/** A copy of the first single-instance scenario whose first stimulus has a `variables` member, with `variable` added. */
function plantedScenario(relativePath: string, variable: unknown): CorpusScenario {
  const base = scenarios.find(({ kind, stimuli }) =>
    kind === "scenario" && typeof stimuli[0] === "object" && stimuli[0] !== null && "variables" in stimuli[0]);
  assert.ok(base !== undefined);
  const [first, ...rest] = base.stimuli as ReadonlyArray<Readonly<Record<string, unknown>>>;
  assert.ok(first !== undefined);
  return { ...base, id: `planted-${base.id}`, relativePath, stimuli: [{ ...first, variables: [variable], }, ...rest] };
}

test("a claiming scenario carrying a value the kernel codec refuses fails, whatever its process", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  for (const [value, refusal] of [
    [{ kind: "integer", value: 1.5 }, /Integer expected/u],
    [{ kind: "stringList", value: ["a", 1] }, /String expected/u],
    [{ kind: "tensor", value: [] }, /unknown value kind tensor/u],
    [{ kind: "null", value: "x" }, /./u],
  ] as const) {
    const planted = plantedScenario("scenarios/planted/refused-value.scenario.json", { name: "x", value });
    await assert.rejects(inspect(manifest, [...scenarios, planted]), (error: Error) =>
      error.message.includes("scenarios/planted/refused-value.scenario.json stimulus 0") && refusal.test(error.message),
    JSON.stringify(value));
  }
});

test("a claiming scenario carries every value kind the codec reads, under any process", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const everyKind = [
    { kind: "null" }, { kind: "boolean", value: true }, { kind: "integer", value: 7 },
    { kind: "decimal", coefficient: "-125", scale: 2 }, { kind: "string", value: "s" },
    { kind: "stringList", value: ["a", "a"] }, { kind: "list", value: [{ kind: "integer", value: 1 }] },
    { kind: "map", value: [{ name: "k", value: { kind: "null" } }] },
  ];
  const planted = plantedScenario("scenarios/planted/every-kind.scenario.json", { name: "x", value: everyKind[0] });
  const [first] = planted.stimuli as ReadonlyArray<Readonly<Record<string, unknown>>>;
  await assert.doesNotReject(inspect(manifest, [...scenarios, {
    ...planted, stimuli: [{ ...first, variables: everyKind.map((value, index) => ({ name: `v${index}`, value })) }],
  }]));
});

test("a witness of an open row claims nothing, so the codec reads none of its values", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const directory = [...readOpenRowOwners()].map(([name]) => name).find((name) =>
    isOpenRowWitness(`scenarios/open-rows/${name}/planted.scenario.json`));
  if (directory === undefined) return;
  const planted = plantedScenario(`scenarios/open-rows/${directory}/planted.scenario.json`, { name: "x", value: { kind: "integer", value: 1.5 } });
  await assert.doesNotReject(inspect(manifest, [...scenarios, planted]));
});

/** The discovered scenarios whose source admission refuses with `code`. */
async function exhibiting(code: string): Promise<ReadonlyArray<CorpusScenario>> {
  const exhibitors: CorpusScenario[] = [];
  for (const scenario of scenarios) {
    for (const source of scenario.sources) {
      const admission = await admitSource(scenario, source);
      if (admission.status === "rejected" && admission.refusal === code) { exhibitors.push(scenario); break; }
    }
  }
  return exhibitors;
}

test("a refused claiming source needs the restriction row its refusal code names, and names the witness without it", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const witness = scenarios.find(({ relativePath }) => relativePath.startsWith("scenarios/timer-start-event/"));
  assert.ok(witness !== undefined);
  await assert.rejects(
    inspect(manifest, scenarios, async (scenario, source) =>
      scenario === witness ? { status: "rejected", refusal: "planted.unrestricted" } : admitSource(scenario, source)),
    new RegExp(`no restriction row for refusal code planted\\.unrestricted, exhibited by witness ${witness.relativePath}`, "u"),
  );
});

test("a source the kernel refuses claims no capability, so a refused exerciser leaves its catalog row unexercised", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  await assert.rejects(
    inspect(manifest, scenarios, async (scenario, source) => scenario.sources.some(({ relativePath }) =>
      relativePath.startsWith("scenarios/timer-start-event/"))
      ? { status: "rejected", refusal: "scope.withoutStart" }
      : admitSource(scenario, source)),
    /MVP capability catalog differs from the discovered scenarios: .*timerStartEvent/u,
  );
});

test("the detector never reads a source the kernel refuses, and reads one it admits", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const refusalWitness = scenarios.find(({ relativePath }) =>
    relativePath.startsWith("scenarios/open-rows/transaction-cancel-refusals/") && relativePath.endsWith("cancel-end-at-process-level.scenario.json"));
  assert.ok(refusalWitness !== undefined);
  const planted = { ...refusalWitness, id: "planted-refusal-witness", relativePath: "scenarios/planted/refusal-witness.scenario.json" };
  const refused = await admitSource(planted, planted.sources[0]!);
  assert.equal(refused.status, "rejected");
  await assert.doesNotReject(inspect(manifest, [...scenarios, planted]));
  await assert.rejects(
    inspect(manifest, [...scenarios, planted], async (scenario, source) =>
      scenario === planted ? { status: "accepted" } : admitSource(scenario, source)),
    /unclassified executable BPMN/u,
  );
});

test("a restriction row whose refusal code no retained scenario exhibits is stale", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const exhibitors = await exhibiting("scope.withoutStart");
  assert.ok(exhibitors.length > 0, "the restriction row for scope.withoutStart has a witness");
  await assert.rejects(
    inspect(manifest, scenarios.filter((scenario) => !exhibitors.includes(scenario))),
    /restriction rows no retained scenario exhibits: .*scope\.withoutStart/u,
  );
});

test("rejects source clones split across different clone families", async () => {
  const manifest = structuredClone(requireExecutableModelCorpusManifest(await loadManifest()));
  const first = manifest.models[0];
  const second = manifest.models[1];
  assert.ok(first !== undefined && second !== undefined);
  second.source = structuredClone(first.source);
  await assert.rejects(inspect(manifest), /identical source bytes use different clone families/u);
});

test("rejects a browser catalog claim without a production journey", () => {
  assert.throws(
    () => requireExecutableModelCorpusManifest({
      kind: "executableBpmnModelCorpus",
      version: 2,
      externalSources: [],
      models: [{
        id: "planted-catalog-entry",
        title: "Planted catalog entry",
        businessPurpose: "Review one planted business request.",
        cloneFamily: "planted-family",
        constructs: ["userTask"],
        mechanisms: ["userTaskCompletion"],
        source: {
          kind: "retainedScenario",
          bpmnRelativePath: "scenarios/example/process.bpmn",
          sha256: "a".repeat(64),
          scenarioRelativePath: "scenarios/example/scenario.json",
          license: "MIT",
        },
        profile: "profile",
        admission: { kind: "accepted" },
        pipelineCaseId: "example",
        product2: { kind: "journeyBacked", journeyTestRelativePath: null },
      }],
    }),
    /journeyBacked model requires one production journey/u,
  );
});

test("rejects external paths that escape the registered checkout", () => {
  assert.throws(
    () => requireExecutableModelCorpusManifest({
      kind: "executableBpmnModelCorpus",
      version: 2,
      externalSources: [{
        kind: "git",
        id: "external",
        checkoutRelativePath: "cibseven/cibseven",
        revision: "b".repeat(40),
        license: "Apache-2.0",
      }],
      models: [{
        id: "escape",
        title: "Escape",
        businessPurpose: null,
        cloneFamily: "escape",
        constructs: ["userTask"],
        mechanisms: ["userTaskCompletion"],
        source: {
          kind: "externalGit",
          externalSourceId: "external",
          relativePath: "../outside.bpmn",
          sha256: "a".repeat(64),
        },
        profile: "profile",
        admission: { kind: "rejected", diagnosticDigest: "c".repeat(64) },
        pipelineCaseId: null,
        product2: { kind: "notCatalogReady", reason: "External reference bytes are not deployable." },
      }],
    }),
    /external model path must stay inside its checkout/u,
  );
});

test("accepts exact external archive entries and rejects entry escapes", () => {
  const candidate = {
    kind: "executableBpmnModelCorpus",
    version: 2,
    externalSources: [{
      kind: "archive",
      id: "official-examples",
      archiveRelativePath: "omg/examples.zip",
      sha256: "b".repeat(64),
      license: "LicenseRef-OMG-Document",
    }],
    models: [{
      id: "official-example",
      title: "Official example",
      businessPurpose: null,
      cloneFamily: "official-example",
      constructs: ["userTask"],
      mechanisms: ["userTaskCompletion"],
      source: {
        kind: "externalArchiveEntry",
        externalSourceId: "official-examples",
        relativePath: "examples/example.bpmn",
        sha256: "a".repeat(64),
      },
      profile: "profile",
      admission: { kind: "rejected", diagnosticDigest: "c".repeat(64) },
      pipelineCaseId: null,
      product2: { kind: "notCatalogReady", reason: "The official external example is not admitted." },
    }],
  };
  assert.doesNotThrow(() => requireExecutableModelCorpusManifest(candidate));
  candidate.models[0]!.source.relativePath = "../outside.bpmn";
  assert.throws(
    () => requireExecutableModelCorpusManifest(candidate),
    /external archive entry path must stay inside its checkout/u,
  );
});

test("rejects external archive or entry byte drift before admission", async () => {
  const kindDrift = structuredClone(requireExecutableModelCorpusManifest(await loadManifest()));
  const archiveEntry = kindDrift.models.find(({ source }) => source.kind === "externalArchiveEntry");
  assert.ok(archiveEntry?.source.kind === "externalArchiveEntry");
  archiveEntry.source.externalSourceId = "betsy";
  assert.throws(
    () => requireExecutableModelCorpusManifest(kindDrift),
    /external archive source kind does not match its registry/u,
  );

  const archiveDrift = structuredClone(requireExecutableModelCorpusManifest(await loadManifest()));
  const archive = archiveDrift.externalSources.find(({ kind }) => kind === "archive");
  assert.ok(archive?.kind === "archive");
  archive.sha256 = "0".repeat(64);
  await assert.rejects(inspect(archiveDrift), /external archive .* expected SHA-256/u);

  const entryDrift = structuredClone(requireExecutableModelCorpusManifest(await loadManifest()));
  const entry = entryDrift.models.find(({ source }) => source.kind === "externalArchiveEntry");
  assert.ok(entry?.source.kind === "externalArchiveEntry");
  entry.source.sha256 = "0".repeat(64);
  await assert.rejects(inspect(entryDrift), /model .* expected source SHA-256/u);
});

test("rejects unknown mechanism labels before they can split the ranking", async () => {
  const manifest = await loadManifest() as { models: Array<{ mechanisms: Array<string> }> };
  const first = manifest.models[0];
  assert.ok(first !== undefined);
  first.mechanisms.push("userTaskCompletino");
  assert.throws(() => requireExecutableModelCorpusManifest(manifest), /unknown mechanism userTaskCompletino/u);
});

test("ranks refusals and mechanism gaps by independent clone family before file count", async () => {
  const report = await inspect(requireExecutableModelCorpusManifest(await loadManifest()));
  for (const ranking of [report.blockers, report.unsupportedMechanisms]) {
    for (const [index, entry] of ranking.entries()) {
      assert.ok(entry.cloneFamilies <= entry.models, entry.key);
      const next = ranking[index + 1];
      if (next === undefined) continue;
      assert.ok(entry.cloneFamilies > next.cloneFamilies ||
        (entry.cloneFamilies === next.cloneFamilies && entry.models >= next.models), `${entry.key} before ${next.key}`);
    }
  }
  const refused = report.models.filter(({ admission }) => admission === "rejected");
  assert.deepEqual(
    report.blockers.reduce((total, { models }) => total + models, 0),
    refused.length,
    "each refused model carries exactly one stable refusal code",
  );
});
