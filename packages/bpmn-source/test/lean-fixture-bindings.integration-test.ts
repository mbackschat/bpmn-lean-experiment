import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
  lowerCheckedProcess,
  type CheckedProcess,
  type SemanticProcessProgram,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind,
  StimulusKind,
  applyStimulusWithTrace,
  initialState,
  isWellFormedSemanticProcessProgram,
  runScenario,
  type Scenario,
} from "@bpmn-lean/semantic-core";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const execFileAsync = promisify(execFile);
const scenarioPaths = [
  "scenarios/user-task-discovery-completion/scenario.json",
  "scenarios/user-task-discovery-completion/wrong-activation.scenario.json",
  "scenarios/user-task-discovery-completion/stale-completion.scenario.json",
  "scenarios/parallel-fork-join/a-then-b.scenario.json",
  "scenarios/parallel-fork-join/b-then-a.scenario.json",
  "scenarios/parallel-fork-join/stale-a-while-b-active.scenario.json",
];

type DefinitionInput = Readonly<{
  scenarioId: string;
  checkedProcess: CheckedProcess;
  semanticProcess: SemanticProcessProgram;
}>;

type Inputs = Readonly<{
  definitions: ReadonlyArray<DefinitionInput>;
  scenarios: ReadonlyArray<ScenarioDocument>;
}>;

type ScenarioDocument = Readonly<{
  scenario: Scenario;
  contents: string;
}>;

async function compile(
  scenarioId: string,
  relativePath: string,
  sourceId: string,
  semanticProfile: string,
  expectedSha256?: string,
): Promise<DefinitionInput> {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(join(projectRoot, relativePath)),
    sourceId,
    semanticProfile,
    expectedSha256,
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  return {
    scenarioId,
    checkedProcess: result.checkedProcess,
    semanticProcess: result.semanticProcess,
  };
}

async function loadInputs(): Promise<Inputs> {
  const scenarios = await Promise.all(scenarioPaths.map(async (path) => {
    const contents = await readFile(join(projectRoot, path), "utf8");
    return { contents, scenario: JSON.parse(contents) as Scenario };
  }));
  const definitions = await Promise.all(scenarios.map(({ scenario }) => compile(
    scenario.id,
    scenario.bpmn.relativePath,
    scenario.bpmn.id,
    scenario.profile,
    scenario.bpmn.sha256,
  )));
  definitions.push(await compile(
    "cyclic-control-flow",
    "packages/bpmn-source/test/fixtures/cyclic-control-flow.bpmn",
    "cyclic-control-flow",
    "bpmn-2.0.2-user-task-cycle-draft",
  ));
  return { definitions, scenarios };
}

async function runBindings(
  inputs: Inputs,
  main = "BpmnSemantics/FixtureBindingJsonMain.lean",
): Promise<string> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "lean-fixture-bindings-"));
  try {
    const definitionPath = join(temporaryDirectory, "definitions.jsonl");
    await writeFile(definitionPath, inputs.definitions.map((value) => JSON.stringify(value)).join("\n"));
    const paths = await Promise.all(inputs.scenarios.map(async (document, index) => {
      const path = join(temporaryDirectory, `scenario-${index}.json`);
      await writeFile(path, document.contents);
      return path;
    }));
    const result = await execFileAsync("./scripts/lake.sh", [
      "run", main, definitionPath, ...paths,
    ], { cwd: projectRoot, timeout: 60_000, encoding: "utf8", maxBuffer: 1024 * 1024 });
    return result.stdout.trim();
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test("compiled sources and complete JSON scenarios equal their concrete Lean fixtures", async () => {
  assert.equal(await runBindings(await loadInputs()), "fixture bindings verified");
});

function definitionFor(inputs: Inputs, id: string): DefinitionInput {
  const definition = inputs.definitions.find(({ scenarioId }) => scenarioId === id);
  assert.ok(definition);
  return definition;
}

function scenarioFor(inputs: Inputs, id: string): Scenario {
  return scenarioDocumentFor(inputs, id).scenario;
}

function scenarioDocumentFor(inputs: Inputs, id: string): ScenarioDocument {
  const document = inputs.scenarios.find(({ scenario }) => scenario.id === id);
  assert.ok(document);
  return document;
}

function mutatedDocument(scenario: Scenario): ScenarioDocument {
  return { scenario, contents: JSON.stringify(scenario) };
}

function replaceDefinition(inputs: Inputs, replacement: DefinitionInput): Inputs {
  return {
    ...inputs,
    definitions: inputs.definitions.map((input) =>
      input.scenarioId === replacement.scenarioId ? replacement : input
    ),
  };
}

function replaceScenario(inputs: Inputs, replacement: Scenario): Inputs {
  return {
    ...inputs,
    scenarios: inputs.scenarios.map((document) =>
      document.scenario.id === replacement.id ? mutatedDocument(replacement) : document
    ),
  };
}

test("fixture equality separates drift from ordinary admission and result agreement", async (t) => {
  const inputs = await loadInputs();
  const parallel = definitionFor(inputs, "parallel-fork-join-a-then-b");
  const scenario = scenarioFor(inputs, parallel.scenarioId);
  const oldFlow = "Flow_AToJoin";
  const newFlow = "Flow_AToJoinAltered";
  const checkedProcess: CheckedProcess = {
    ...parallel.checkedProcess,
    sequenceFlows: parallel.checkedProcess.sequenceFlows.map((flow) =>
      flow.id === oldFlow ? { ...flow, id: newFlow } : flow
    ),
    sequenceFlowScopes: parallel.checkedProcess.sequenceFlowScopes.map((owner) =>
      owner.sequenceFlowId === oldFlow ? { ...owner, sequenceFlowId: newFlow } : owner
    ),
  };
  const changedGraph: DefinitionInput = {
    ...parallel,
    checkedProcess,
    semanticProcess: lowerCheckedProcess(checkedProcess),
  };

  await t.test("post-start flow drift passes generic Lean admission and exact results but fails fixture equality", async () => {
    assert.equal(checkedProcess.identity.sourceSha256, parallel.checkedProcess.identity.sourceSha256);
    assert.notDeepEqual(checkedProcess, parallel.checkedProcess);
    assert.ok(isWellFormedSemanticProcessProgram(changedGraph.semanticProcess));
    const start = scenario.stimuli[0];
    assert.ok(start);
    const original = applyStimulusWithTrace(parallel.semanticProcess, initialState, start);
    const changed = applyStimulusWithTrace(changedGraph.semanticProcess, initialState, start);
    assert.deepEqual(changed.committedTransitions, original.committedTransitions);
    assert.deepEqual(changed.currentPositions, original.currentPositions);
    const genericMain = "BpmnSemantics/SemanticProcessJsonMain.lean";
    const scenarioDocument = scenarioDocumentFor(inputs, scenario.id);
    const originalResult = await runBindings({ definitions: [parallel], scenarios: [scenarioDocument] }, genericMain);
    const changedResult = await runBindings({ definitions: [changedGraph], scenarios: [scenarioDocument] }, genericMain);
    assert.deepEqual(JSON.parse(changedResult), JSON.parse(originalResult));
    await assert.rejects(runBindings(replaceDefinition(inputs, changedGraph)), /checked graph fixture mismatch: parallel-fork-join-a-then-b/u);
  });

  await t.test("independently changed authored cyclic Program fails its own seam", async () => {
    const cyclic = definitionFor(inputs, "cyclic-control-flow");
    const changedProgram: DefinitionInput = {
      ...cyclic,
      semanticProcess: {
        ...cyclic.semanticProcess,
        operations: cyclic.semanticProcess.operations.map((operation) => {
          switch (operation.kind) {
            case SemanticOperationKind.AwaitUserTask:
              return { ...operation, task: { ...operation.task, name: "Changed review name" } };
            default:
              return operation;
          }
        }),
      },
    };
    assert.deepEqual(changedProgram.checkedProcess, cyclic.checkedProcess);
    assert.equal(changedProgram.semanticProcess.identity.sourceSha256, cyclic.semanticProcess.identity.sourceSha256);
    assert.notDeepEqual(changedProgram.semanticProcess, cyclic.semanticProcess);
    await assert.rejects(runBindings(replaceDefinition(inputs, changedProgram)), /Program fixture mismatch: cyclic-control-flow/u);
  });

  await t.test("rejected completion payload drift preserves results but fails complete Scenario equality", async () => {
    const stale = scenarioFor(inputs, "user-task-stale-completion");
    const definition = definitionFor(inputs, stale.id);
    const changed: Scenario = {
      ...stale,
      stimuli: stale.stimuli.map((stimulus, index) => {
        if (index !== stale.stimuli.length - 1) return stimulus;
        assert.equal(stimulus.kind, StimulusKind.CompleteUserTaskInstance);
        assert.ok(stimulus.kind === StimulusKind.CompleteUserTaskInstance);
        return { ...stimulus, submittedValues: [] };
      }),
    };
    assert.notDeepEqual(changed, stale);
    assert.deepEqual(runScenario(changed, definition.semanticProcess), runScenario(stale, definition.semanticProcess));
    await assert.rejects(runBindings(replaceScenario(inputs, changed)), /Scenario fixture mismatch: user-task-stale-completion/u);
  });

  for (const field of ["observations", "provenance"] as const) {
    await t.test(`complete Scenario equality includes ${field}`, async () => {
      const changed: Scenario = field === "observations"
        ? { ...scenario, observations: scenario.observations.slice(1) }
        : { ...scenario, provenance: { ...scenario.provenance, normativeRefs: [] } };
      await assert.rejects(runBindings(replaceScenario(inputs, changed)), /Scenario fixture mismatch: parallel-fork-join-a-then-b/u);
    });
  }

  await t.test("original Scenario text reaches the strict decoder without a JSON round trip", async () => {
    const document = scenarioDocumentFor(inputs, scenario.id);
    const duplicateKey: ScenarioDocument = {
      ...document,
      contents: document.contents.replace(/\}\s*$/u, `, "id": "${scenario.id}"}\n`),
    };
    assert.deepEqual(JSON.parse(duplicateKey.contents), scenario);
    await assert.rejects(runBindings({
      ...inputs,
      scenarios: inputs.scenarios.map((candidate) => candidate === document ? duplicateKey : candidate),
    }), /duplicate JSON object key: id/u);
  });

  await t.test("duplicate identity precedes value comparison in either input order", async () => {
    const malformedDefinition = { ...parallel, checkedProcess: null } as unknown as DefinitionInput;
    for (const definitions of [
      [...inputs.definitions, changedGraph],
      [changedGraph, ...inputs.definitions],
      [...inputs.definitions, malformedDefinition],
      [malformedDefinition, ...inputs.definitions],
    ]) {
      await assert.rejects(runBindings({ ...inputs, definitions }), /duplicate definition identity: parallel-fork-join-a-then-b/u);
    }
    const malformedDuplicate = mutatedDocument({ ...scenario, stimuli: null } as unknown as Scenario);
    for (const scenarios of [
      [...inputs.scenarios, malformedDuplicate],
      [malformedDuplicate, ...inputs.scenarios],
    ]) {
      await assert.rejects(runBindings({ ...inputs, scenarios }), /duplicate Scenario identity: parallel-fork-join-a-then-b/u);
    }
  });

  await t.test("unknown, omitted, and extra definitions or scenarios refuse", async () => {
    await assert.rejects(runBindings({ ...inputs, definitions: inputs.definitions.slice(1) }), /missing definition identity/u);
    await assert.rejects(runBindings({ ...inputs, scenarios: inputs.scenarios.slice(1) }), /missing Scenario identity/u);
    await assert.rejects(runBindings({ ...inputs, definitions: [...inputs.definitions, { ...parallel, scenarioId: "unknown" }] }), /unknown definition identity: unknown/u);
    await assert.rejects(runBindings({ ...inputs, scenarios: [...inputs.scenarios, mutatedDocument({ ...scenario, id: "unknown" })] }), /unknown Scenario identity: unknown/u);
  });
});
