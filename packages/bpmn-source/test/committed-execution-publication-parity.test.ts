import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import type {
  CurrentControlPositions,
  StartProcessStimulus,
  UnnumberedCommittedTransitionRecord,
} from "../../semantic-core/src/index.ts";
import {
  projectNegativePositionClasses,
  type LeanProjectionRejections,
} from "./publication-parity-negative-class-test-support.ts";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const bpmnSourceEntryUrl = new URL(
  "../dist/index.js",
  import.meta.url,
);
const semanticCoreEntryUrl = new URL(
  "../../semantic-core/dist/index.js",
  import.meta.url,
);
const scenarioUrl = new URL(
  "../../../scenarios/parallel-fork-join/a-then-b.scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/parallel-fork-join/process.bpmn",
  import.meta.url,
);

type ScenarioStart = Readonly<{
  profile: string;
  sourceId: string;
  sourceSha256: string;
  relativePath: string;
  stimulus: StartProcessStimulus;
}>;

type Publication = Readonly<{
  transitions: ReadonlyArray<UnnumberedCommittedTransitionRecord>;
  current: CurrentControlPositions;
}>;


type PublicationParityEvidence = Readonly<{
  publication: Publication;
  projectionRejections: LeanProjectionRejections;
}>;

type InternalTransition = Extract<
  UnnumberedCommittedTransitionRecord["transition"],
  { operationId: string }
>;

type BpmnSourceApi = Pick<
  typeof import("../src/index.ts"),
  "BpmnCompilationStatus" | "compileBpmnToSemanticProcess"
>;

type SemanticCoreApi = Pick<
  typeof import("../../semantic-core/src/index.ts"),
  | "ControlStateKind"
  | "SemanticOperationKind"
  | "SemanticOriginKind"
  | "StimulusKind"
  | "applyStimulusWithTrace"
  | "deriveCalledProcessInstanceId"
  | "initialState"
  | "isWellFormedStimulus"
  | "projectCurrentControlPositions"
  | "replayCommittedTransitions"
>;

test("Lean and TypeScript publish the exact parallel start trace and current positions", async () => {
  const [bpmnSource, semanticCore] = await Promise.all([
    loadBpmnSourceApi(),
    loadSemanticCoreApi(),
  ]);
  const scenario = decodeScenarioStart(
    await readFile(scenarioUrl, "utf8"),
    semanticCore,
  );
  assert.equal(
    scenario.relativePath,
    "scenarios/parallel-fork-join/process.bpmn",
  );

  const compilation = await bpmnSource.compileBpmnToSemanticProcess({
    bytes: await readFile(bpmnUrl),
    sourceId: scenario.sourceId,
    expectedSha256: scenario.sourceSha256,
    semanticProfile: scenario.profile,
    sourceOverlay: null,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.equal(
    compilation.status,
    bpmnSource.BpmnCompilationStatus.Accepted,
    compilation.status === bpmnSource.BpmnCompilationStatus.Rejected
      ? JSON.stringify(compilation.diagnostics)
      : undefined,
  );
  if (compilation.status !== bpmnSource.BpmnCompilationStatus.Accepted) {
    return;
  }

  const traced = semanticCore.applyStimulusWithTrace(
    compilation.semanticProcess,
    semanticCore.initialState,
    scenario.stimulus,
  );
  assert.ok(traced.currentPositions !== null);
  assert.ok(traced.committedTransitions.length > 0);
  const typescriptPublication: Publication = {
    transitions: traced.committedTransitions,
    current: traced.currentPositions,
  };
  const leanEvidence = await runLeanPublicationEmitter();
  const leanPublication = leanEvidence.publication;

  assert.deepEqual(typescriptPublication, leanPublication);
  const projectionRejections = projectNegativePositionClasses(
    semanticCore,
    compilation.semanticProcess,
    traced.result.state,
  );
  assert.deepEqual(projectionRejections, {
    unassociatedParentlessRoot: true,
    completedWithLivePositions: true,
    calledRootProcessDrift: true,
    duplicateCalledProcessRecords: true,
    nonDerivedCalledRootInstance: true,
  });
  assert.deepEqual(leanEvidence.projectionRejections, {
    unassociatedParentlessRoot: projectionRejections.unassociatedParentlessRoot,
    completedWithLivePositions: projectionRejections.completedWithLivePositions,
    calledRootProcessDrift: projectionRejections.calledRootProcessDrift,
  });
  for (const rejected of [
    projectionRejections.duplicateCalledProcessRecords,
    projectionRejections.nonDerivedCalledRootInstance,
  ]) {
    assert.equal(
      rejected,
      leanEvidence.projectionRejections.calledRootProcessDrift,
      "TypeScript and Lean must reject the complete called-association class",
    );
  }

  const swapped = swapRecords(typescriptPublication, 3, 4);
  assert.deepEqual(
    semanticCore.replayCommittedTransitions(
      compilation.semanticProcess,
      semanticCore.initialState,
      swapped.transitions,
    ),
    traced.result.state,
    "the independent task operations may reach the same RuntimeState in the opposite order",
  );

  const firstInternal = internalAt(typescriptPublication, 1);
  const secondInternal = internalAt(typescriptPublication, 2);
  const deltaRecord = requireRecord(typescriptPublication, 2);
  const currentScope = typescriptPublication.current.scopes[0];
  assert.ok(currentScope !== undefined);

  const mutations: ReadonlyArray<readonly [string, Publication]> = [
    ["drop", dropRecord(typescriptPublication, 2)],
    ["swap", swapped],
    ["duplicate", duplicateRecord(typescriptPublication, 2)],
    [
      "operation id",
      replaceInternal(typescriptPublication, 1, {
        ...firstInternal,
        operationId: secondInternal.operationId,
      }),
    ],
    [
      "operation kind",
      replaceInternal(typescriptPublication, 1, {
        ...firstInternal,
        operationKind: semanticCore.SemanticOperationKind.Duplicate,
      }),
    ],
    [
      "operation origin",
      replaceInternal(typescriptPublication, 1, {
        ...firstInternal,
        origin: {
          kind: semanticCore.SemanticOriginKind.BpmnElement,
          elementId: "StartEvent_Substituted",
        },
      }),
    ],
    [
      "dynamic owner",
      replaceInternal(typescriptPublication, 1, {
        ...firstInternal,
        owner: {
          ...firstInternal.owner,
          activation: firstInternal.owner.activation + 1,
        },
      }),
    ],
    [
      "position delta",
      replaceRecord(typescriptPublication, 2, {
        ...deltaRecord,
        positionDelta: {
          ...deltaRecord.positionDelta,
          producedTokens: [],
        },
      }),
    ],
    [
      "current scope position",
      {
        ...typescriptPublication,
        current: {
          ...typescriptPublication.current,
          scopes: [
            { ...currentScope, bpmnElementId: "Process_Substituted" },
            ...typescriptPublication.current.scopes.slice(1),
          ],
        },
      },
    ],
    [
      "current token position",
      {
        ...typescriptPublication,
        current: {
          ...typescriptPublication.current,
          controlTokens: [{
            sequenceFlowId: "Flow_Substituted",
            owner: currentScope.id,
            multiplicity: 1,
          }],
        },
      },
    ],
  ];

  for (const [label, mutation] of mutations) {
    assert.notDeepEqual(
      mutation,
      leanPublication,
      `${label} substitution must disagree across targets`,
    );
  }
});

async function runLeanPublicationEmitter(): Promise<PublicationParityEvidence> {
  const result = await execFileAsync(
    "./scripts/lake.sh",
    [
      "env",
      "lean",
      "--run",
      "BpmnSemantics/CommittedExecutionPublicationJsonMain.lean",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const output = result.stdout.trim();
  assert.ok(output.length > 0, "Lean publication output must be nonempty");
  const decoded: unknown = JSON.parse(output);
  return decodePublicationParityEvidence(decoded);
}


function decodePublicationParityEvidence(
  value: unknown,
): PublicationParityEvidence {
  if (
    !isRecord(value) ||
    !isRecord(value.publication) ||
    !isRecord(value.projectionRejections)
  ) {
    throw new Error("Lean publication parity evidence must be an object");
  }
  for (const field of [
    "unassociatedParentlessRoot",
    "completedWithLivePositions",
    "calledRootProcessDrift",
  ]) {
    if (typeof value.projectionRejections[field] !== "boolean") {
      throw new Error(`Lean projection rejection ${field} must be Boolean`);
    }
  }
  return value as unknown as PublicationParityEvidence;
}

function decodeScenarioStart(
  contents: string,
  semanticCore: SemanticCoreApi,
): ScenarioStart {
  const decoded: unknown = JSON.parse(contents);
  if (!isRecord(decoded) || !isRecord(decoded.bpmn)) {
    throw new Error("parallel scenario must contain a BPMN resource");
  }
  const firstStimulus = Array.isArray(decoded.stimuli)
    ? decoded.stimuli[0]
    : undefined;
  if (
    !semanticCore.isWellFormedStimulus(firstStimulus) ||
    firstStimulus.kind !== semanticCore.StimulusKind.StartProcess
  ) {
    throw new Error("parallel scenario must start with one exact Process start");
  }
  return {
    profile: requireString(decoded.profile, "profile"),
    sourceId: requireString(decoded.bpmn.id, "bpmn.id"),
    sourceSha256: requireString(decoded.bpmn.sha256, "bpmn.sha256"),
    relativePath: requireString(
      decoded.bpmn.relativePath,
      "bpmn.relativePath",
    ),
    stimulus: firstStimulus,
  };
}

function dropRecord(publication: Publication, index: number): Publication {
  return {
    ...publication,
    transitions: publication.transitions.filter(
      (_record, candidate) => candidate !== index,
    ),
  };
}

function swapRecords(
  publication: Publication,
  left: number,
  right: number,
): Publication {
  const leftRecord = requireRecord(publication, left);
  const rightRecord = requireRecord(publication, right);
  return {
    ...publication,
    transitions: publication.transitions.map((record, index) => {
      if (index === left) {
        return rightRecord;
      }
      if (index === right) {
        return leftRecord;
      }
      return record;
    }),
  };
}

function duplicateRecord(publication: Publication, index: number): Publication {
  const record = requireRecord(publication, index);
  return {
    ...publication,
    transitions: [
      ...publication.transitions.slice(0, index),
      record,
      ...publication.transitions.slice(index),
    ],
  };
}

function replaceInternal(
  publication: Publication,
  index: number,
  transition: InternalTransition,
): Publication {
  const record = requireRecord(publication, index);
  return replaceRecord(publication, index, { ...record, transition });
}

function replaceRecord(
  publication: Publication,
  index: number,
  replacement: UnnumberedCommittedTransitionRecord,
): Publication {
  requireRecord(publication, index);
  return {
    ...publication,
    transitions: publication.transitions.map((record, candidate) =>
      candidate === index ? replacement : record
    ),
  };
}

function internalAt(publication: Publication, index: number): InternalTransition {
  const transition = requireRecord(publication, index).transition;
  if (!("operationId" in transition)) {
    throw new Error(`transition ${index} must be internal`);
  }
  return transition;
}

function requireRecord(
  publication: Publication,
  index: number,
): UnnumberedCommittedTransitionRecord {
  const record = publication.transitions[index];
  if (record === undefined) {
    throw new Error(`publication transition ${index} is missing`);
  }
  return record;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a nonempty string`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadBpmnSourceApi(): Promise<BpmnSourceApi> {
  const loaded: unknown = await importPublicPackage(bpmnSourceEntryUrl);
  if (
    !isRecord(loaded) ||
    typeof loaded.compileBpmnToSemanticProcess !== "function" ||
    !isRecord(loaded.BpmnCompilationStatus)
  ) {
    throw new Error("@bpmn-lean/bpmn-source public API is unavailable");
  }
  return loaded as BpmnSourceApi;
}

async function loadSemanticCoreApi(): Promise<SemanticCoreApi> {
  const loaded: unknown = await importPublicPackage(semanticCoreEntryUrl);
  if (
    !isRecord(loaded) ||
    typeof loaded.applyStimulusWithTrace !== "function" ||
    typeof loaded.deriveCalledProcessInstanceId !== "function" ||
    typeof loaded.isWellFormedStimulus !== "function" ||
    typeof loaded.projectCurrentControlPositions !== "function" ||
    typeof loaded.replayCommittedTransitions !== "function" ||
    !isRecord(loaded.ControlStateKind) ||
    !isRecord(loaded.initialState) ||
    !isRecord(loaded.SemanticOperationKind) ||
    !isRecord(loaded.SemanticOriginKind) ||
    !isRecord(loaded.StimulusKind)
  ) {
    throw new Error("@bpmn-lean/semantic-core traced public API is unavailable");
  }
  return loaded as SemanticCoreApi;
}

async function importPublicPackage(entry: URL): Promise<unknown> {
  return await import(entry.href);
}
