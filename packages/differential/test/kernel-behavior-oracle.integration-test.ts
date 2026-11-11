/**
 * Guard 16 of the kernel rewrite proposal over every discovered scenario: Lean `kernelRun` and the TypeScript kernel
 * return the same whole result on every scenario and population scenario, and on every scenario with retained CIB Seven
 * evidence the kernel's result equals the retained one at the CIB observation boundary (`compareTargetResults`, which
 * drops the kernel-only `code` and `scopes` members and sorts open waits, after `foldSynchronousEffects` folds the
 * effect inputs of delegates CIB ran inside another command), as on every population with retained evidence
 * (`comparePopulationResults`). Discovery is by directory
 * (`scenario-discovery.ts`), so a new scenario or evidence file joins without an edit here.
 *
 * No disagreement between the kernels is expected. A disagreement with retained evidence is expected exactly when the
 * [ledger](cib-disagreement-ledger.ts) classifies it under an open row or a registered relation; every other one, and
 * every listed one that now agrees, fails the test and is listed with the scenario and the first differing path, never
 * adjusted away. The evidence is compared against the TypeScript kernel's result; the first test establishes that it is
 * also Lean's.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  comparePopulationResults,
  compareTargetResults,
  firstValueDisagreement,
  foldSynchronousEffects,
  populationClockMs,
} from "@bpmn-lean/differential";
import type { PopulationResultDocument, ScenarioDisagreement, ValueDisagreement } from "@bpmn-lean/differential";
import { parseStrict, runPopulation, runScenario } from "@bpmn-lean/kernel";

import { pipelineTestTimeoutMs } from "../../../scripts/pipeline-budget.ts";
import { ledgerViolations, readCibDisagreementLedger } from "./cib-disagreement-ledger.ts";
import { runLeanKernelPopulation, runLeanKernelScenario, writeProgram } from "./kernel-targets.ts";
import { projectRoot } from "./pipeline-target-support.ts";
import { populationStepDigests } from "./population-digest.ts";
import { populationPrograms } from "./population-programs.ts";
import { DiscoveredKind, discoverScenarios, kernelProgramFor, scenarioKernelInput } from "./scenario-discovery.ts";
import type { CanonicalResult, DiscoveredScenario, ScenarioDocument } from "./scenario-discovery.ts";

type OracleDisagreement = Readonly<{ scenario: string } & ValueDisagreement>;
type EvidenceDisagreement = Readonly<{
  scenario: string;
  evidence: string;
  disagreement: ScenarioDisagreement | ValueDisagreement;
}>;

/** JSON serialization erases the undefined members a TypeScript result may carry and Lean's cannot. */
const wireValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

function compared(scenario: string, expected: unknown, actual: unknown): OracleDisagreement | null {
  const difference = firstValueDisagreement(expected, actual, "result");
  return difference === null ? null : { scenario, ...difference };
}

const effectInputsOf = (document: ScenarioDocument): ReadonlySet<string> =>
  new Set(document.stimuli.flatMap((stimulus) => {
    const { kind, commandId } = stimulus as Readonly<{ kind?: unknown; commandId?: unknown }>;
    return kind === "effectResult" && typeof commandId === "string" ? [commandId] : [];
  }));

const label = (scenario: DiscoveredScenario): string => `${scenario.document.id} (${scenario.relativePath})`;

test("the Lean and TypeScript kernels agree on every discovered scenario, and the kernel on every retained CIB result", {
  timeout: pipelineTestTimeoutMs(),
}, async (t) => {
  const scenarios = await discoverScenarios();
  const ledger = await readCibDisagreementLedger(projectRoot);
  const retained = new Set<string>();
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-oracle-"));
  const kernelDisagreements: Array<OracleDisagreement> = [];
  const evidenceDisagreements: Array<EvidenceDisagreement> = [];
  let populationCount = 0;
  let evidenceCount = 0;
  try {
    for (const [index, scenario] of scenarios.entries()) {
      const scenarioPath = path.join(projectRoot, scenario.relativePath);
      switch (scenario.kind) {
        case DiscoveredKind.PopulationScenario: {
          populationCount += 1;
          const sources = await populationPrograms(scenario.relativePath, scenario.document);
          const sourcePaths = sources.map((_, deployment) =>
            path.join(directory, `population-${String(index)}-${String(deployment)}.json`));
          await Promise.all(sources.map((source, deployment) => writeProgram(sourcePaths[deployment]!, source)));
          const digests = populationStepDigests(scenario.document.steps);
          const digestsPath = path.join(directory, `population-${String(index)}-digests.json`);
          await writeFile(digestsPath, JSON.stringify(digests), "utf8");
          const lean = await runLeanKernelPopulation(digestsPath, sourcePaths, scenarioPath);
          const typeScript = wireValue(runPopulation(sources, scenario.document, digests)) as PopulationResultDocument;
          const difference = compared(label(scenario), lean, typeScript);
          if (difference !== null) kernelDisagreements.push(difference);
          if (scenario.evidence === null) break;
          evidenceCount += 1;
          retained.add(scenario.evidence.relativePath);
          const population = comparePopulationResults(
            scenario.evidence.result, typeScript, populationClockMs(scenario.document.steps));
          if (population !== null) {
            evidenceDisagreements.push({ scenario: label(scenario), evidence: scenario.evidence.relativePath, disagreement: population });
          }
          break;
        }
        case DiscoveredKind.Scenario: {
          const input = await scenarioKernelInput(scenario.relativePath, scenario.document.bpmn, scenario.document.profile);
          let typeScript: CanonicalResult;
          if (input.kind === "refused") typeScript = input.result;
          else {
            const programPath = path.join(directory, `scenario-${String(index)}.json`);
            await writeProgram(programPath, input.program);
            const lean = await runLeanKernelScenario(programPath, scenarioPath);
            typeScript = wireValue(runScenario(input.program, scenario.document)) as CanonicalResult;
            const difference = compared(label(scenario), lean, typeScript);
            if (difference !== null) kernelDisagreements.push(difference);
          }
          if (scenario.evidence === null) break;
          evidenceCount += 1;
          retained.add(scenario.evidence.relativePath);
          const comparison = compareTargetResults(
            { target: DifferentialTarget.RetainedCibEvidence, result: scenario.evidence.result },
            [{ target: DifferentialTarget.KernelTs, result: foldSynchronousEffects(typeScript, scenario.evidence.result, {
              synchronousAfter: scenario.evidence.synchronousAfter,
              effectInputs: effectInputsOf(scenario.document),
            }) }],
          );
          if (comparison.kind === ComparisonKind.Disagreement) {
            evidenceDisagreements.push({
              scenario: label(scenario),
              evidence: scenario.evidence.relativePath,
              disagreement: comparison.disagreement,
            });
          }
          break;
        }
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  assert.ok(scenarios.length > populationCount && populationCount > 0, "discovery found no scenarios of a required kind");
  assert.ok(evidenceCount > 0, "discovery found no retained CIB evidence");
  const violations = ledgerViolations(new Set(evidenceDisagreements.map(({ evidence }) => evidence)), retained, ledger);
  const unlisted = new Set(violations.unlisted);
  t.diagnostic(
    `scenarios ${String(scenarios.length - populationCount)}, populations ${String(populationCount)}, ` +
      `retained CIB results ${String(evidenceCount)}, kernel disagreements ${String(kernelDisagreements.length)}, ` +
      `evidence disagreements ${String(evidenceDisagreements.length)}, classified ${String(ledger.length)}`,
  );
  assert.deepEqual(
    { kernelDisagreements, violations },
    { kernelDisagreements: [], violations: { unlisted: [], agreeing: [], orphaned: [] } },
    [...kernelDisagreements, ...evidenceDisagreements.filter(({ evidence }) => unlisted.has(evidence))]
      .map((entry) => JSON.stringify(entry)).join("\n"),
  );
});

test("the oracle comparison reports a changed value and a field only one kernel emits", () => {
  const deployment = { trace: [{ kind: "deployment", outcome: "unsupported" }] };
  assert.deepEqual(
    compared("control", deployment, { trace: [{ kind: "deployment", outcome: "committed" }] }),
    { scenario: "control", path: "result.trace[0].outcome", expected: "unsupported", actual: "committed" },
  );
  assert.deepEqual(
    compared("control", { trace: [{ ...deployment.trace[0], code: "admission.refused" }] }, deployment),
    { scenario: "control", path: "result.trace[0].code", expected: "admission.refused", actual: undefined },
  );
});

/** The strict-decoding code a refusal names, or `accepted`. */
function refusalCode(run: () => unknown): Promise<string> {
  return Promise.resolve().then(run).then(
    () => "accepted",
    (error: unknown) => /codec\.[A-Za-z]+/u.exec(String(error))?.[0] ?? `uncoded: ${String(error)}`,
  );
}

test("the Lean and TypeScript kernels refuse the same malformed inputs with the same strict-decoding code", async () => {
  const relativePath = "packages/differential/test/fixtures/serial-classification.scenario.json";
  const scenarioText = await readFile(path.join(projectRoot, relativePath), "utf8");
  const scenario = JSON.parse(scenarioText) as ScenarioDocument & Readonly<{ stimuli: ReadonlyArray<Record<string, unknown>> }>;
  const program = await kernelProgramFor(relativePath, { ...scenario.bpmn, sourceOverlay: null }, scenario.profile) as
    unknown as Record<string, unknown>;
  const programText = JSON.stringify(program);
  const [first, ...rest] = scenario.stimuli;
  const withFirst = (stimulus: Record<string, unknown>): string => JSON.stringify({ ...scenario, stimuli: [stimulus, ...rest] });
  const { variables: _variables, ...withoutVariables } = first!;
  const referencing = {
    ...program,
    identity: { ...(program.identity as Record<string, unknown>), namespace: "urn:example:root", deployment: 2 },
    options: {
      ...(program.options as Record<string, unknown>), signalNames: "addresses", signalPayload: "variables",
      signalDelivery: "occurrenceTargeted", conditionalStart: "submittedContext", calledElementResolution: "cibKey",
      messageThrowForms: "cibForms",
    },
  };
  const signalStart = (address: Record<string, unknown>): Record<string, unknown> =>
    ({ ...first, trigger: { kind: "signal", variables: [], ...address } });
  const cases: ReadonlyArray<readonly [string, string, string, string]> = [
    ["control", programText, scenarioText, "accepted"],
    ["repeated program key", `{"variables":[],${programText.slice(1)}`, scenarioText, "codec.duplicateField"],
    ["unknown program key", JSON.stringify({ ...program, extra: true }), scenarioText, "codec.unknownField"],
    ["mistyped program field", JSON.stringify({ ...program, flows: {} }), scenarioText, "codec.malformed"],
    ["unknown stimulus key", programText, withFirst({ ...first, extra: true }), "codec.unknownField"],
    ["missing stimulus key", programText, withFirst(withoutVariables), "codec.missingField"],
    ["null optional member", programText, withFirst({ ...first, at: null }), "codec.malformed"],
    ["namespaced, deployed identity and non-default options", JSON.stringify(referencing), scenarioText, "accepted"],
    ["Signal start addressed by signalRef", programText, withFirst(signalStart({ signalRef: { namespace: "urn:x", id: "Sig" } })), "accepted"],
    ["Signal address with name and signalRef", programText, withFirst(signalStart({ name: "S", signalRef: { id: "Sig" } })), "codec.malformed"],
    ["Signal address with neither name nor signalRef", programText, withFirst(signalStart({})), "codec.missingField"],
  ];
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-strict-"));
  try {
    for (const [name, programInput, scenarioInput, expected] of cases) {
      const programPath = path.join(directory, "program.json");
      const scenarioPath = path.join(directory, "scenario.json");
      await writeFile(programPath, programInput, "utf8");
      await writeFile(scenarioPath, scenarioInput, "utf8");
      const lean = await refusalCode(() => runLeanKernelScenario(programPath, scenarioPath));
      const typeScript = await refusalCode(() => {
        const decoded = [parseStrict(programInput), parseStrict(scenarioInput)].map((parsed) => {
          if (!parsed.ok) throw new Error(parsed.refusal);
          return parsed.value;
        });
        return runScenario(decoded[0], decoded[1]);
      });
      assert.deepEqual({ name, lean, typeScript }, { name, lean: expected, typeScript: expected });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the Lean and TypeScript kernels agree on the population contract's deployments, commands and harness refusals", async () => {
  const program = JSON.parse(await readFile(path.join(projectRoot, "packages/kernel/test/fixtures/simple-boolean.program.json"), "utf8")) as
    Record<string, unknown>;
  const identity = program.identity as Record<string, unknown>;
  const refused = { ...program, options: { ...(program.options as Record<string, unknown>), callBindingTime: "invocation" } };
  const definition = (definitionRef: string) => ({
    definitionRef,
    bpmn: { id: definitionRef, relativePath: `scenarios/${definitionRef}.bpmn`, sha256: identity.sourceSha256, sourceOverlay: null },
  });
  const start = (instanceId: string, at?: number) =>
    ({ kind: "start", commandId: `start-${instanceId}`, instanceId, variables: [], ...(at === undefined ? {} : { at }) });
  const instance = (definitionRef: string, instanceId: string, at?: number, stimulusAt?: number) =>
    ({ kind: "instance", definitionRef, instanceId, stimulus: start(instanceId, stimulusAt), ...(at === undefined ? {} : { at }) });
  const publish = (commandId: string, at: number, definition: Record<string, unknown>) => ({
    kind: "publish", commandId, at, address: { definition, channel: { kind: "directMessage", messageId: "M" } },
    criteria: [{ target: { kind: "processVariable", name: "k" }, expected: { kind: "string", value: "v" } }], variables: [], mode: "executionsOnly",
  });
  const cases: ReadonlyArray<readonly [string, ReadonlyArray<Record<string, unknown>>, ReadonlyArray<string>, ReadonlyArray<Record<string, unknown>>]> = [
    ["deployments and versions", [refused, program], ["a", "b"], [
      { kind: "deploy", definitionRef: "a", at: 3 }, instance("a", "I", 4), instance("b", "J"), instance("a", "K", 5, 5),
    ]],
    ["a redeployed definition and a source the reader refused", [program, { refused: "reader.factNotCarried" }, program], ["a", "b"], [
      { kind: "deploy", definitionRef: "a", at: 1 }, { kind: "deploy", definitionRef: "b", at: 2 }, { kind: "deploy", definitionRef: "a", at: 3 },
      instance("a", "I", 4), instance("b", "J", 5),
    ]],
    ["commands", [program], ["a"], [
      publish("routed", 1, { deploymentId: 1 }), publish("missing", 2, { deploymentId: 9 }), publish("by-key", 2, { processKey: "P" }),
      { kind: "broadcast", commandId: "broadcast", address: { signalRef: { id: "S" } }, variables: [], order: [] },
      { kind: "evaluateConditions", commandId: "conditions", variables: [], businessKey: "b" },
      { kind: "timerStart", commandId: "timer", deploymentId: 1, startEvent: "Start", dueMs: 3, at: 7 },
    ]],
    ["population-time-backward", [program], ["a"], [instance("a", "I", 10), publish("early", 9, { deploymentId: 1 })]],
    ["population-time-mismatch", [program], ["a"], [instance("a", "I", 40, 41)]],
    ["population-unknown-definition", [program], ["a"], [{ kind: "deploy", definitionRef: "undeclared" }]],
  ];
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-population-"));
  const answer = (run: () => unknown): Promise<unknown> => Promise.resolve().then(run).then(
    (value) => wireValue(value),
    (error: unknown) =>
      /population-(?:time-backward|time-mismatch|unknown-definition)/u.exec(String(error))?.[0] ?? `uncoded: ${String(error)}`,
  );
  try {
    for (const [name, programs, refs, steps] of cases) {
      const scenario = { kind: "populationScenario", id: name, profile: identity.profile, definitions: refs.map(definition), steps };
      const digests = populationStepDigests(steps);
      const scenarioPath = path.join(directory, "scenario.json");
      const digestsPath = path.join(directory, "digests.json");
      const programPaths = programs.map((_, index) => path.join(directory, `program-${String(index)}.json`));
      await writeFile(scenarioPath, JSON.stringify(scenario), "utf8");
      await writeFile(digestsPath, JSON.stringify(digests), "utf8");
      await Promise.all(programs.map((entry, index) => writeFile(programPaths[index]!, JSON.stringify(entry), "utf8")));
      const lean = await answer(() => runLeanKernelPopulation(digestsPath, programPaths, scenarioPath));
      const typeScript = await answer(() => runPopulation(programs, scenario, digests));
      if (name.startsWith("population-")) assert.deepEqual({ name, lean, typeScript }, { name, lean: name, typeScript: name });
      else assert.equal(compared(name, lean, typeScript), null, name);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
