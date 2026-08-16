import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { pipelineCases } from "../../packages/differential/test/pipeline-cases.ts";
import {
  compileCorpusModel,
} from "../../packages/bpmn-source/test/executable-model-corpus-compiler.ts";
import {
  inspectExecutableModelCorpus,
  renderExecutableModelCorpusMap,
  requireExecutableModelCorpusManifest,
} from "../../scripts/executable-model-corpus.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = path.join(projectRoot, "model-corpus/manifest.json");
const corpusMapPath = path.join(
  projectRoot,
  "model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md",
);

async function loadManifest(): Promise<unknown> {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

test("binds every retained and external model to exact local evidence", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const report = await inspectExecutableModelCorpus(manifest, {
    projectRoot,
    externalRoot: process.env["BPMN_EXTERNAL_ROOT"] ??
      path.resolve(projectRoot, "../oss"),
    pipelineCases,
    compileModel: compileCorpusModel,
  });

  assert.equal(report.models.length, 31);
  assert.equal(report.retainedModels, 24);
  assert.equal(report.externalModels, 7);
  assert.equal(report.acceptedModels, 24);
  assert.equal(report.rejectedModels, 7);
  assert.equal(report.catalogReadyModels, 3);
  assert.equal(report.mvpCapabilities.length, 25);
  assert.deepEqual(report.uncoveredMvpCapabilities, []);
  assert.equal(report.models[0]?.product2, "journeyBacked");
  assert.deepEqual(
    report.models.filter(({ sourceKind }) => sourceKind === "retainedScenario")
      .map(({ pipelineCaseId }) => pipelineCaseId),
    [
      "user-task-assignment-form-metadata",
      "parallel-user-task-metadata-content-then-risk",
      "parallel-fork-join-a-then-b",
      "expense-exception-review-approve",
      "exclusive-gateway-simple-boolean-first-true",
      "called-process-call-activity",
      "service-task-effect-success",
      "embedded-subprocess-completion-a-then-b",
      "subprocess-error-propagation-trigger-first",
      "timer-user-task-composition",
      "intermediate-catch-message",
      "message-addressed-receive-task",
      "inclusive-gateway-both-true-a-then-b",
      "event-based-gateway-message-wins",
      "activity-boundary-timer-deadline-wins",
      "subprocess-boundary-timer-deadline-wins",
      "non-interrupting-boundary-timer-deadline-then-both-branches",
      "user-task-cycle-repeat-rework-exit",
      "message-start-event",
      "timer-start-event",
      "terminate-end-event-trigger-first",
      "configured-task",
      "mapped-success-service-task",
      "mapped-boundary-error-service-task-caught",
    ],
  );
});

test("requires every retained model to state a business purpose", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  for (const model of manifest.models.filter(
    ({ source }) => source.kind === "retainedScenario",
  )) {
    assert.ok(model.businessPurpose !== null);
    assert.ok(model.businessPurpose.length >= 20);
  }
});

test("rejects a supported element variant without a retained MVP model", async () => {
  const manifest = structuredClone(
    requireExecutableModelCorpusManifest(await loadManifest()),
  );
  const index = manifest.models.findIndex(({ id }) => id === "scheduled-review-start");
  assert.notEqual(index, -1);
  manifest.models.splice(index, 1);

  await assert.rejects(
    inspectExecutableModelCorpus(manifest, {
      projectRoot,
      externalRoot: process.env["BPMN_EXTERNAL_ROOT"] ??
        path.resolve(projectRoot, "../oss"),
      pipelineCases,
      compileModel: compileCorpusModel,
    }),
    /retained MVP models do not cover timerStartEvent/u,
  );
});

test("keeps the generated corpus map exact", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const report = await inspectExecutableModelCorpus(manifest, {
    projectRoot,
    externalRoot: process.env["BPMN_EXTERNAL_ROOT"] ??
      path.resolve(projectRoot, "../oss"),
    pipelineCases,
    compileModel: compileCorpusModel,
  });

  assert.equal(
    await readFile(corpusMapPath, "utf8"),
    renderExecutableModelCorpusMap(report),
  );
});

test("rejects source clones split across different clone families", async () => {
  const manifest = structuredClone(
    requireExecutableModelCorpusManifest(await loadManifest()),
  );
  const first = manifest.models[0];
  const second = manifest.models[1];
  assert.ok(first !== undefined && second !== undefined);
  second.source = structuredClone(first.source);

  await assert.rejects(
    inspectExecutableModelCorpus(manifest, {
      projectRoot,
      externalRoot: path.resolve(projectRoot, "../oss"),
      pipelineCases,
      compileModel: compileCorpusModel,
    }),
    /identical source bytes use different clone families/u,
  );
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
        admission: {
          kind: "rejected",
          diagnosticDigest: "c".repeat(64),
        },
        pipelineCaseId: null,
        product2: {
          kind: "notCatalogReady",
          reason: "External reference bytes are not deployable.",
        },
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
      product2: {
        kind: "notCatalogReady",
        reason: "The official external example is not admitted.",
      },
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
  const kindDrift = structuredClone(
    requireExecutableModelCorpusManifest(await loadManifest()),
  );
  const archiveEntry = kindDrift.models.find(
    ({ source }) => source.kind === "externalArchiveEntry",
  );
  assert.ok(archiveEntry?.source.kind === "externalArchiveEntry");
  archiveEntry.source.externalSourceId = "betsy";
  assert.throws(
    () => requireExecutableModelCorpusManifest(kindDrift),
    /external archive source kind does not match its registry/u,
  );

  const archiveDrift = structuredClone(
    requireExecutableModelCorpusManifest(await loadManifest()),
  );
  const archive = archiveDrift.externalSources.find(
    ({ kind }) => kind === "archive",
  );
  assert.ok(archive?.kind === "archive");
  archive.sha256 = "0".repeat(64);
  await assert.rejects(
    inspectExecutableModelCorpus(archiveDrift, {
      projectRoot,
      externalRoot: path.resolve(projectRoot, "../oss"),
      pipelineCases,
      compileModel: compileCorpusModel,
    }),
    /external archive .* expected SHA-256/u,
  );

  const entryDrift = structuredClone(
    requireExecutableModelCorpusManifest(await loadManifest()),
  );
  const entry = entryDrift.models.find(
    ({ source }) => source.kind === "externalArchiveEntry",
  );
  assert.ok(entry?.source.kind === "externalArchiveEntry");
  entry.source.sha256 = "0".repeat(64);
  await assert.rejects(
    inspectExecutableModelCorpus(entryDrift, {
      projectRoot,
      externalRoot: path.resolve(projectRoot, "../oss"),
      pipelineCases,
      compileModel: compileCorpusModel,
    }),
    /model .* expected source SHA-256/u,
  );
});

test("rejects unknown mechanism labels before they can split the ranking", async () => {
  const manifest = await loadManifest() as {
    models: Array<{ mechanisms: Array<string> }>;
  };
  const first = manifest.models[0];
  assert.ok(first !== undefined);
  first.mechanisms.push("userTaskCompletino");

  assert.throws(
    () => requireExecutableModelCorpusManifest(manifest),
    /unknown mechanism userTaskCompletino/u,
  );
});

test("deduplicates blocker ranks by clone family rather than file count", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const report = await inspectExecutableModelCorpus(manifest, {
    projectRoot,
    externalRoot: process.env["BPMN_EXTERNAL_ROOT"] ??
      path.resolve(projectRoot, "../oss"),
    pipelineCases,
    compileModel: compileCorpusModel,
  });
  const definitionDiagram = report.blockers.find(
    ({ key }) => key === "preserveProperty:bpmn:Definitions:diagrams",
  );

  assert.ok(definitionDiagram !== undefined);
  assert.equal(definitionDiagram.models, 4);
  assert.equal(definitionDiagram.cloneFamilies, 3);
});

test("ranks reusable mechanism gaps by independent model family", async () => {
  const manifest = requireExecutableModelCorpusManifest(await loadManifest());
  const report = await inspectExecutableModelCorpus(manifest, {
    projectRoot,
    externalRoot: process.env["BPMN_EXTERNAL_ROOT"] ??
      path.resolve(projectRoot, "../oss"),
    pipelineCases,
    compileModel: compileCorpusModel,
  });
  const vendorMetadata = report.unsupportedMechanisms.find(
    ({ key }) => key === "vendorRuntimeMetadata",
  );

  assert.deepEqual(vendorMetadata, {
    key: "vendorRuntimeMetadata",
    cloneFamilies: 4,
    models: 5,
  });
});
