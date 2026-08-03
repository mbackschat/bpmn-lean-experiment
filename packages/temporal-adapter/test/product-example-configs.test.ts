/**
 * Locks the product example configurations to the complete registered profile set.
 *
 * This is the port-free half of product acceptance: every registered semantic profile must have one
 * example configuration that loads under strict validation, compiles from its exact source, and
 * passes both pre-start gates without opening a Temporal connection. Live durable execution of these
 * same configurations is a separate lane that requires a running Temporal service.
 *
 * The oracle is `SemanticProfileId`, not the example directory, so adding a profile without a product
 * example fails here rather than silently shrinking the advertised product surface.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind,
  assessBpmnProcessAdmission,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-adapter";

import { loadRunnableMvpConfig } from "../cli/runnable-mvp-config.ts";
import type { RunnableMvpConfig } from "../cli/runnable-mvp-config.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const exampleRoot = path.join(projectRoot, "examples/temporal-mvp");
const registeredProfiles = Object.values(SemanticProfileId);

/** The rejection example deliberately pairs a real model with a profile that excludes it. */
const admissionRejectionExample = "unsupported.json";
const legacyAcceptedExample = "accepted.json";

async function exampleConfigPaths(): Promise<ReadonlyArray<string>> {
  return (await readdir(exampleRoot))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => file !== admissionRejectionExample)
    .filter((file) => file !== legacyAcceptedExample)
    .sort()
    .map((file) => path.join(exampleRoot, file));
}

async function compileExample(config: RunnableMvpConfig) {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(config.bpmn.file),
    sourceId: config.bpmn.sourceId,
    expectedSha256: undefined,
    semanticProfile: config.bpmn.semanticProfile,
    limits: config.bpmn.limits,
  });
}

test("covers every registered semantic profile exactly once", async () => {
  const configs = await Promise.all(
    (await exampleConfigPaths()).map((file) => loadRunnableMvpConfig(file)),
  );
  const covered = configs.map((config) => config.bpmn.semanticProfile).sort();

  assert.deepEqual(covered, [...registeredProfiles].sort());
});

test("admits every example through both pre-start gates without connecting", async () => {
  for (const file of await exampleConfigPaths()) {
    const config = await loadRunnableMvpConfig(file);
    const compilation = await compileExample(config);
    assert.equal(
      compilation.status,
      BpmnCompilationStatus.Accepted,
      `${path.basename(file)} must admit at source and profile admission`,
    );
    if (compilation.status !== BpmnCompilationStatus.Accepted) {
      return;
    }
    const capability = assessTemporalHostCapability(compilation.semanticProcess);
    assert.equal(
      capability.kind,
      TemporalHostCapabilityResultKind.Admitted,
      `${path.basename(file)} must be within this host's wait-set capability`,
    );
    const admission = assessBpmnProcessAdmission(
      {
        kind: StimulusKind.StartProcess,
        commandId: `product-example:${config.process.instanceId}`,
        processId: compilation.semanticProcess.processId,
        instanceId: config.process.instanceId,
        initialVariables: config.process.initialVariables,
      },
      compilation.semanticProcess,
    );
    assert.equal(
      admission.kind,
      BpmnProcessAdmissionResultKind.Admitted,
      `${path.basename(file)} must pass semantic start admission`,
    );
  }
});

test("declares an effect handler for every effect the program awaits", async () => {
  for (const file of await exampleConfigPaths()) {
    const config = await loadRunnableMvpConfig(file);
    const compilation = await compileExample(config);
    if (compilation.status !== BpmnCompilationStatus.Accepted) {
      continue;
    }
    const awaited = compilation.semanticProcess.operations.flatMap((operation) =>
      "effect" in operation && operation.effect !== undefined
        ? [operation.effect.descriptor]
        : []
    );
    for (const descriptor of awaited) {
      assert.ok(
        config.effectHandlers.some(
          (handler) =>
            handler.protocol === descriptor.protocol &&
            handler.operation === descriptor.operation,
        ),
        `${path.basename(file)} must declare a handler for ${descriptor.protocol}/${descriptor.operation}`,
      );
    }
  }
});

test("keeps a rejection example that never reaches host capability", async () => {
  const config = await loadRunnableMvpConfig(
    path.join(exampleRoot, admissionRejectionExample),
  );
  const compilation = await compileExample(config);

  assert.equal(compilation.status, BpmnCompilationStatus.Rejected);
});
