/** Exact predecessor-to-successor definition equivalence for Service Task incidents. */
import { isDeepStrictEqual } from "node:util";

import type {
  CheckedProcess,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

const predecessorProfile =
  "cibseven-2.2.0-service-task-effect-draft";
const successorProfile =
  "cibseven-2.2.0-service-task-incident-draft";
const erasedProfile = "service-task-profile-erased";

const exactEffectBindings = Object.freeze([Object.freeze({
  source: Object.freeze({
    implementation: "urn:bpmn-lean:effect:probe-v1",
    delegateExpression: "${bpmnLeanEffectHandler}",
  }),
  descriptor: Object.freeze({
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
    operation: "urn:bpmn-lean:effect-operation:probe-v1",
  }),
})]);

const exactRelationships = Object.freeze([
  "CIB-EXT-0001",
  "CIB-CFG-0002",
  "CIB-EXT-0013",
  "CIB-OP-0008",
  "CIB-CFG-0008",
]);

type ProfileArtifact = Readonly<{
  id: string;
  environment?: Readonly<Record<string, unknown>>;
  bpmn: Readonly<{ relationships: ReadonlyArray<string> }>;
  effectBindings?: unknown;
}>;

type ScenarioArtifact = Readonly<{
  id: string;
  profile: string;
  bpmn: Readonly<{
    id: string;
    relativePath: string;
    sha256: string;
    sourceOverlay: unknown;
  }>;
  stimuli: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;

export type ServiceTaskDefinitionPair = Readonly<{
  checkedProcess: CheckedProcess;
  semanticProcess: SemanticProcessProgram;
}>;

/** Requires the successor profile and answer-free schedule to stay mutually exact. */
export function verifyServiceTaskIncidentArtifactBinding(
  profile: ProfileArtifact,
  scenario?: ScenarioArtifact,
): void {
  const selectsIncident = profile.id === successorProfile;
  const schedulesIncident = scenario?.profile === successorProfile;
  if (!selectsIncident && !schedulesIncident) {
    return;
  }
  if (!selectsIncident || (scenario !== undefined && !schedulesIncident)) {
    throw new Error(
      "Service Task incident profile and scenario must be selected together",
    );
  }
  if (
    profile.environment?.createIncidentOnFailedJobEnabled !== true ||
    !isDeepStrictEqual(profile.bpmn.relationships, exactRelationships) ||
    !isDeepStrictEqual(profile.effectBindings, exactEffectBindings)
  ) {
    throw new Error(
      "Service Task incident profile differs from its exact configured binding",
    );
  }
  if (scenario === undefined) {
    return;
  }
  if (
    scenario.id !== "service-task-effect-incident-retry-success" ||
    scenario.bpmn.id !== "service-task-effect-phase-zero-probe" ||
    scenario.bpmn.relativePath !==
      "scenarios/service-task-effect/process.bpmn" ||
    scenario.bpmn.sha256 !==
      "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d" ||
    scenario.bpmn.sourceOverlay !== null ||
    !exactIncidentStimulusSchedule(scenario.stimuli)
  ) {
    throw new Error(
      "Service Task incident scenario differs from its exact answer-free schedule",
    );
  }
}

function exactIncidentStimulusSchedule(
  stimuli: ReadonlyArray<Readonly<Record<string, unknown>>>,
): boolean {
  const effectId = {
    processInstanceId: "Instance_1",
    elementId: "ServiceTask_Record",
    activation: 1,
  };
  return isDeepStrictEqual(stimuli, [
    {
      kind: "startProcess",
      commandId: "start-process",
      processId: "Process_ServiceTaskEffectProbe",
      instanceId: "Instance_1",
      initialVariables: [],
    },
    {
      kind: "reportEffectFailure",
      commandId:
        "report-effect-failure-sha256:b6b5077e469b9421ed4a598e4c08fae7c3ce3e31c941fae9733b4c7206a2b345",
      effectId,
      generation: 1,
    },
    {
      kind: "retryIncident",
      commandId: "retry-service-task-effect-incident",
      incidentId: { effectId, generation: 1 },
    },
    {
      kind: "completeEffect",
      commandId:
        "complete-effect-sha256:64b75e53c74d30141f8c4e05db4cea269453a6cecdd09e190d1943f029797e5e",
      effectId,
      result: { kind: "success", localPatch: [] },
    },
  ]);
}

/** Requires generated checked and IL values to differ only in semantic profile identity. */
export function verifyServiceTaskIncidentSuccessor(
  predecessor: ServiceTaskDefinitionPair,
  successor: ServiceTaskDefinitionPair,
): void {
  requireProfile(predecessor, predecessorProfile, "predecessor");
  requireProfile(successor, successorProfile, "successor");

  if (!isDeepStrictEqual(
    eraseCheckedProfile(predecessor.checkedProcess),
    eraseCheckedProfile(successor.checkedProcess),
  )) {
    throw new Error(
      "Service Task incident successor checked process differs outside semantic profile identity",
    );
  }
  if (!isDeepStrictEqual(
    eraseProgramProfile(predecessor.semanticProcess),
    eraseProgramProfile(successor.semanticProcess),
  )) {
    throw new Error(
      "Service Task incident successor Semantic Process differs outside semantic profile identity",
    );
  }
}

function requireProfile(
  artifacts: ServiceTaskDefinitionPair,
  requiredProfile: string,
  label: string,
): void {
  if (
    artifacts.checkedProcess.identity.semanticProfile !== requiredProfile ||
    artifacts.semanticProcess.identity.semanticProfile !== requiredProfile
  ) {
    throw new Error(`${label} Service Task definition names the wrong profile`);
  }
}

function eraseCheckedProfile(value: CheckedProcess): CheckedProcess {
  return {
    ...value,
    identity: {
      ...value.identity,
      semanticProfile: erasedProfile,
    },
  };
}

function eraseProgramProfile(
  value: SemanticProcessProgram,
): SemanticProcessProgram {
  return {
    ...value,
    identity: {
      ...value.identity,
      semanticProfile: erasedProfile,
    },
  };
}
