/**
 * Guard 16 of the kernel rewrite proposal over every discovered scenario: Lean `kernelRun` and the TypeScript kernel
 * return the same whole result on every scenario and population scenario, the same whole host-view run on every
 * admitted single-instance scenario (`--host-view`: the result, host requirements, definition capabilities and every
 * committed input's host view with its registration addresses), and on every scenario with retained CIB Seven
 * evidence the kernel's result equals the retained one at the CIB observation boundary (`compareTargetResults`, which
 * drops the kernel-only `code` and `scopes` members and sorts open waits, after `foldSynchronousEffects` folds the
 * effect inputs of delegates and Script Tasks CIB ran inside another command), as on every population with retained
 * evidence (`comparePopulationResults`). Both kernels take a Script Task's result as the input the host evaluator
 * records once (`withScriptResults`). Discovery is by directory
 * (`scenario-discovery.ts`), so a new scenario or evidence file joins without an edit here.
 *
 * No disagreement between the kernels is expected. A disagreement with retained evidence is expected exactly when the
 * [ledger](cib-disagreement-ledger.ts) classifies it under an open row or a registered relation and records where it
 * begins: both comparators report the first difference in run order (trace step by step, the outcome last; a
 * population's deployments and steps before its final states), and `disagreementLocation` must equal the recorded
 * location, so every step before the classified difference is held to CIB. Every other disagreement, every listed one
 * whose first difference moved, and every listed one that now agrees fails the test and is listed with the scenario and
 * the first differing path, never adjusted away. The evidence is compared against the TypeScript kernel's result; the
 * first test establishes that it is also Lean's.
 *
 * The host-facing functions no scenario run reaches (`rootStarts`, `refusesSignalVariables`, `registerSummary`), and
 * `definitionCapabilities` in the cases no scenario model reaches, are held to kernel fixtures instead
 * (`kernelRun --fixture`, `runFixture`): each kernel's answer must equal the expected answer kept beside the fixture,
 * which no runner reads, and the other kernel's.
 */
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  comparePopulationResults,
  compareTargetResults,
  disagreementLocation,
  firstValueDisagreement,
  foldSynchronousEffects,
  populationClockMs,
} from "@bpmn-lean/differential";
import type { PopulationResultDocument, ScenarioDisagreement, ValueDisagreement } from "@bpmn-lean/differential";
import { decodeProgram, parseStrict, runFixture, runHostView, runPopulation, runScenario } from "@bpmn-lean/kernel";
import type { JsonValue } from "@bpmn-lean/temporal-host/host";
import { withScriptResults } from "@bpmn-lean/temporal-host/testing";

import { pipelineTestTimeoutMs } from "../../../scripts/pipeline-budget.ts";
import { ledgerViolations, readCibDisagreementLedger } from "./cib-disagreement-ledger.ts";
import {
  decodeLeanPrograms, runLeanKernelFixtures, runLeanKernelHostView, runLeanKernelPopulation, runLeanKernelScenario,
  writeProgram,
} from "./kernel-targets.ts";
import { projectRoot, scriptTimeoutMs } from "./pipeline-target-support.ts";
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

/** A `--host-view` run: its `result` is the plain run's, so the host view costs one process, not a second one. */
type HostViewRun = Readonly<{
  result: CanonicalResult;
  hostViews: ReadonlyArray<Readonly<{ addresses?: ReadonlyArray<Readonly<{ message?: unknown; signal?: unknown }>> }>>;
}>;

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
  let messageAddresses = 0;
  let signalAddresses = 0;
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
          let document = scenario.document;
          if (input.kind === "refused") typeScript = input.result;
          else {
            const programPath = path.join(directory, `scenario-${String(index)}.json`);
            await writeProgram(programPath, input.program);
            document = withScriptResults(wireValue(input.program) as JsonValue, wireValue(scenario.document) as JsonValue,
              { timeoutMs: scriptTimeoutMs }) as unknown as ScenarioDocument;
            let runPath = scenarioPath;
            if (document.stimuli.length !== scenario.document.stimuli.length) {
              runPath = path.join(directory, `scenario-${String(index)}.scenario.json`);
              await writeFile(runPath, JSON.stringify(document), "utf8");
            }
            const lean = await runLeanKernelHostView(programPath, runPath) as HostViewRun;
            const hosted = wireValue(runHostView(input.program, document)) as HostViewRun;
            typeScript = hosted.result;
            const difference = compared(label(scenario), lean, hosted);
            if (difference !== null) kernelDisagreements.push(difference);
            for (const address of lean.hostViews.flatMap((view) => view.addresses ?? [])) {
              if (address.message !== undefined) messageAddresses += 1;
              if (address.signal !== undefined) signalAddresses += 1;
            }
          }
          if (scenario.evidence === null) break;
          evidenceCount += 1;
          retained.add(scenario.evidence.relativePath);
          const comparison = compareTargetResults(
            { target: DifferentialTarget.RetainedCibEvidence, result: scenario.evidence.result },
            [{ target: DifferentialTarget.KernelTs, result: foldSynchronousEffects(typeScript, scenario.evidence.result, {
              synchronousAfter: scenario.evidence.synchronousAfter,
              effectInputs: effectInputsOf(document),
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
  assert.ok(messageAddresses > 0 && signalAddresses > 0, "the host views registered no Message or no Signal address");
  const violations = ledgerViolations(
    new Map(evidenceDisagreements.map(({ evidence, disagreement }) => [evidence, disagreementLocation(disagreement)])),
    retained, ledger);
  const reported = new Set([...violations.unlisted, ...violations.moved.map(({ evidence }) => evidence)]);
  t.diagnostic(
    `scenarios ${String(scenarios.length - populationCount)}, populations ${String(populationCount)}, ` +
      `retained CIB results ${String(evidenceCount)}, kernel disagreements ${String(kernelDisagreements.length)}, ` +
      `evidence disagreements ${String(evidenceDisagreements.length)}, classified ${String(ledger.length)}, ` +
      `host-view addresses ${String(messageAddresses)} Message and ${String(signalAddresses)} Signal`,
  );
  assert.deepEqual(
    { kernelDisagreements, violations },
    { kernelDisagreements: [], violations: { unlisted: [], moved: [], agreeing: [], orphaned: [] } },
    [...kernelDisagreements, ...evidenceDisagreements.filter(({ evidence }) => reported.has(evidence))]
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
  const relativePath = "scenarios/open-rows/delivery-invoice-journeys/serial-classification.scenario.json";
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
  // The decoders read any wire-typed value: the portable domain's bounds (an Integer from 0, a Decimal scale to 6) are
  // ingress's, which rejects the one input, so those cases are accepted here; only the 2^53 − 1 wire bound refuses.
  const valueStart = (value: Record<string, unknown>): string =>
    withFirst({ ...first, variables: [{ name: "payload", value }] });
  // The same wire refusal at the two other surfaces PC-DATA-02 names: a User Task completion and an effect result.
  const [review, effect, ...tail] = rest as [Record<string, unknown>, Record<string, unknown>, ...Record<string, unknown>[]];
  const atSurfaces = (value: Record<string, unknown>): ReadonlyArray<readonly [string, string]> => [
    ["completion", JSON.stringify({ ...scenario, stimuli: [first, { ...review, action: { kind: "completeUserTask", values: [{ name: "request", value }] } }, effect, ...tail] })],
    ["effect result", JSON.stringify({ ...scenario, stimuli: [first, review, { ...effect, outcome: { kind: "success", outputs: [{ name: "result", value }] } }, ...tail] })],
  ];
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
    ["negative Integer value", programText, valueStart({ kind: "integer", value: -1 }), "accepted"],
    ["Decimal value at scale 7", programText, valueStart({ kind: "decimal", coefficient: "1", scale: 7 }), "accepted"],
    ["Integer value at 2^53 − 1", programText, valueStart({ kind: "integer", value: 9007199254740991 }), "accepted"],
    ["Integer value at 2^53", programText, valueStart({ kind: "integer", value: 9007199254740992 }), "codec.malformed"],
    ["Decimal scale at 2^53", programText, valueStart({ kind: "decimal", coefficient: "1", scale: 9007199254740992 }),
      "codec.malformed"],
    ["mistyped Integer value", programText, valueStart({ kind: "integer", value: "1" }), "codec.malformed"],
    ...[{ kind: "integer", value: "1" }, { kind: "integer", value: 9007199254740992 }].flatMap((value) =>
      atSurfaces(value).map(([surface, text]) => [`${surface} Integer ${JSON.stringify(value.value)}`, programText, text, "codec.malformed"] as const)),
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

// TypeScript reads a JSON number as a double, exact only to 2^53 − 1, and refuses a larger one; Lean reads any integer
// unless its decoders bound it too. One case per class of decode site: the program's derived IL fields, a decision's
// FEEL scale, a stimulus, a kernel fixture's input and a population step.
test("the Lean and TypeScript kernels read every wire number class up to 2^53 − 1 and refuse it beyond", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-number-bound-"));
  const verdict = (outcome: unknown): string =>
    outcome === null ? "accepted" : /(?:Natural number|Nat|Integer) expected/u.test(String(outcome)) ? "refused" : `other: ${String(outcome)}`;
  const thrown = (run: () => unknown): Promise<string> =>
    Promise.resolve().then(run).then(() => "accepted", (error: unknown) => verdict(error));
  const file = async (name: string, json: unknown): Promise<string> => {
    const target = path.join(directory, name);
    await writeFile(target, JSON.stringify(json), "utf8");
    return target;
  };
  const rowProgram = JSON.parse(await readFile(path.join(projectRoot, "packages/kernel/test/fixtures/rows/PC-AUTO-08.json"), "utf8")) as
    Record<string, unknown>;
  const literal = `"number":{"coefficient":"40","scale":0}`;
  assert.ok(JSON.stringify(rowProgram).includes(literal), "the row program keeps its FEEL number literal");
  const scenarioPath = "scenarios/open-rows/delivery-invoice-journeys/serial-classification.scenario.json";
  const scenario = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as ScenarioDocument &
    Readonly<{ stimuli: ReadonlyArray<Record<string, unknown>> }>;
  const scenarioProgram = await kernelProgramFor(scenarioPath, { ...scenario.bpmn, sourceOverlay: null }, scenario.profile);
  const scenarioProgramPath = await file("scenario-program.json", scenarioProgram);
  const registerFixture = JSON.parse(await readFile(path.join(kernelFixtures, "register-summary-ordinal-from-identity.kernel-fixture.json"), "utf8")) as
    Record<string, unknown>;
  const populationProgram = JSON.parse(await readFile(path.join(projectRoot, "packages/kernel/test/fixtures/simple-boolean.program.json"), "utf8")) as
    Record<string, unknown>;
  const identity = populationProgram.identity as Record<string, unknown>;
  const populationProgramPath = await file("population-program.json", populationProgram);
  const decoded = async (name: string, program: unknown): Promise<readonly [string, string]> => {
    const programPath = await file(`${name}.json`, program);
    const lean = (await decodeLeanPrograms([programPath])).get(programPath);
    const typeScript = decodeProgram(program);
    return [verdict(lean ?? null), typeScript.ok ? "accepted" : verdict(typeScript.refusal)];
  };
  const probed = async (name: string, stimulus: Record<string, unknown>): Promise<readonly [string, string]> => {
    const document = { ...scenario, stimuli: [...scenario.stimuli, stimulus] };
    const documentPath = await file(`${name}.json`, document);
    return [await thrown(() => runLeanKernelScenario(scenarioProgramPath, documentPath)),
      await thrown(() => runScenario(wireValue(scenarioProgram), wireValue(document)))];
  };
  const fixture = async (name: string, deploymentId: number): Promise<readonly [string, string]> => {
    const text = JSON.stringify({ ...registerFixture, input: { deploymentIds: [deploymentId] } });
    const fixturePath = path.join(directory, `${name}.json`);
    await writeFile(fixturePath, text, "utf8");
    return [await thrown(() => runLeanKernelFixtures([fixturePath])), await thrown(() => typeScriptFixtureAnswer(text))];
  };
  const population = async (name: string, step: Record<string, unknown>): Promise<readonly [string, string]> => {
    const definitions = [{ definitionRef: "a", bpmn: { id: "a", relativePath: "scenarios/a.bpmn", sha256: identity.sourceSha256, sourceOverlay: null } }];
    const document = { kind: "populationScenario", id: name, profile: identity.profile, definitions, steps: [step] };
    const digests = populationStepDigests(document.steps);
    const documentPath = await file(`${name}.json`, document);
    const digestsPath = await file(`${name}.digests.json`, digests);
    return [await thrown(() => runLeanKernelPopulation(digestsPath, [populationProgramPath], documentPath)),
      await thrown(() => runPopulation([populationProgram], document, digests))];
  };
  const occurrence = (activation: number) => ({ processInstanceId: "invoice", elementId: "Unknown", activation });
  const command = (activation: number, generation: number) =>
    ({ kind: "command", commandId: "number-probe", occurrence: occurrence(activation), action: { kind: "retryIncident", generation } });
  const timerStart = (dueMs: number) =>
    ({ kind: "timerStart", commandId: "timer", deploymentId: 1, startEvent: "Start", dueMs, at: 7 });
  const cases: ReadonlyArray<readonly [string, (value: number) => Promise<readonly [string, string]>]> = [
    ["program IL Nat", (value) => decoded("identity", { ...rowProgram, identity: { ...(rowProgram.identity as object), deployment: value } })],
    ["decision FEEL scale", (value) => decoded("scale", JSON.parse(JSON.stringify(rowProgram).replace(literal, `"number":{"coefficient":"40","scale":${String(value)}}`)))],
    ["stimulus activation", (value) => probed("activation", command(value, 1))],
    ["stimulus generation", (value) => probed("generation", command(1, value))],
    ["fixture input", (value) => fixture("fixture", value)],
    ["population step time", (value) => population("step-at", { kind: "deploy", definitionRef: "a", at: value })],
    ["population due time", (value) => population("timer", timerStart(value))],
  ];
  try {
    for (const [name, run] of cases) {
      for (const [value, expected] of [[9007199254740991, "accepted"], [9007199254740992, "refused"]] as const) {
        const [lean, typeScript] = await run(value);
        assert.deepEqual({ name, value, lean, typeScript }, { name, value, lean: expected, typeScript: expected });
      }
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
      /population-(?:time-backward|time-mismatch|unknown-definition|source-missing|sources-unused|source-refused-shape|source-identity)/u
        .exec(String(error))?.[0] ?? `uncoded: ${String(error)}`,
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

const kernelFixtureSuffix = ".kernel-fixture.json";
const expectedSuffix = ".kernel-fixture.expected.json";
const kernelFixtures = path.join(projectRoot, "packages/kernel/test/fixtures/host-functions");

function typeScriptFixtureAnswer(text: string): unknown {
  const parsed = parseStrict(text);
  if (!parsed.ok) throw new Error(parsed.refusal);
  return wireValue(runFixture(parsed.value));
}

/**
 * The kernel fixtures `directory` holds (guard 14: discovered, never listed), each a host-facing function no scenario
 * run reaches: both kernels answer the fixture, which carries no expected answer, and only this comparison reads the
 * expected file beside it. A finding is an unpaired file, or a kernel answer that differs from the expected one or from
 * the other kernel's.
 */
async function kernelFixtureFindings(directory: string): Promise<Readonly<{ count: number; findings: ReadonlyArray<string> }>> {
  const files = (await readdir(directory)).sort();
  const fixtures = files.filter((file) => file.endsWith(kernelFixtureSuffix));
  const findings = [
    ...fixtures.filter((file) => !files.includes(file.replace(kernelFixtureSuffix, expectedSuffix))).map((file) => `${file}: no expected answer`),
    ...files.filter((file) => file.endsWith(expectedSuffix) && !files.includes(file.replace(expectedSuffix, kernelFixtureSuffix)))
      .map((file) => `${file}: no kernel fixture`),
  ];
  const paired = fixtures.filter((file) => files.includes(file.replace(kernelFixtureSuffix, expectedSuffix)));
  const lean = await runLeanKernelFixtures(paired.map((file) => path.join(directory, file)));
  for (const file of paired) {
    const fixturePath = path.join(directory, file);
    const expected = JSON.parse(await readFile(fixturePath.replace(kernelFixtureSuffix, expectedSuffix), "utf8")) as unknown;
    const leanAnswer = lean.get(fixturePath);
    const typeScript = typeScriptFixtureAnswer(await readFile(fixturePath, "utf8"));
    const comparisons: ReadonlyArray<readonly [string, unknown, unknown]> = [
      ["Lean differs from the expected answer", expected, leanAnswer],
      ["TypeScript differs from the expected answer", expected, typeScript],
      ["Lean and TypeScript differ", leanAnswer, typeScript],
    ];
    for (const [finding, left, right] of comparisons) {
      const difference = compared(file, left, right);
      if (difference !== null) findings.push(`${file}: ${finding} at ${difference.path}`);
    }
  }
  return { count: fixtures.length, findings };
}

test("both kernels give every kernel fixture's expected answer", async () => {
  const { count, findings } = await kernelFixtureFindings(kernelFixtures);
  assert.ok(count > 0, "discovery found no kernel fixture");
  assert.deepEqual(findings, []);
});

/** The `fixture-` code a refused fixture names, or `accepted`. */
function fixtureCode(run: () => unknown): Promise<string> {
  return Promise.resolve().then(run).then(
    () => "accepted",
    (error: unknown) => /fixture-[a-z-]+/u.exec(String(error))?.[0] ?? `uncoded: ${String(error)}`,
  );
}

// Guard 23: a seeded wrong answer and a seeded unpaired file must fail, or a comparison that passes everything passes.
test("the kernel fixture comparison fails a wrong expected answer and an unpaired file, and both kernels refuse an unknown entry", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kernel-fixtures-"));
  try {
    const [first] = (await readdir(kernelFixtures)).filter((file) => file.endsWith(kernelFixtureSuffix)).sort();
    assert.ok(first !== undefined, "discovery found no kernel fixture");
    const expected = JSON.parse(await readFile(path.join(kernelFixtures, first.replace(kernelFixtureSuffix, expectedSuffix)), "utf8")) as unknown;
    await copyFile(path.join(kernelFixtures, first), path.join(directory, first));
    await writeFile(path.join(directory, first.replace(kernelFixtureSuffix, expectedSuffix)), JSON.stringify({ seeded: expected }), "utf8");
    await writeFile(path.join(directory, `orphan${expectedSuffix}`), "null", "utf8");
    const { count, findings } = await kernelFixtureFindings(directory);
    assert.equal(count, 1);
    assert.deepEqual(findings.map((finding) => finding.replace(/ at .*$/u, "")), [
      `orphan${expectedSuffix}: no kernel fixture`,
      `${first}: Lean differs from the expected answer`,
      `${first}: TypeScript differs from the expected answer`,
    ]);

    const unknown = path.join(directory, "unknown.json");
    const fixture = JSON.parse(await readFile(path.join(kernelFixtures, first), "utf8")) as Record<string, unknown>;
    const text = JSON.stringify({ ...fixture, entry: "deploymentSummary" });
    await writeFile(unknown, text, "utf8");
    const lean = await fixtureCode(() => runLeanKernelFixtures([unknown]));
    const typeScript = await fixtureCode(() => typeScriptFixtureAnswer(text));
    assert.deepEqual({ lean, typeScript }, { lean: "fixture-entry-unknown", typeScript: "fixture-entry-unknown" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
