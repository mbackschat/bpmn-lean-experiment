/** Exact incident-to-cancellation successor binding and definition equivalence. */
import { isDeepStrictEqual } from "node:util";

import type {
  CheckedProcess,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

export const serviceTaskIncidentCancellationProfileId =
  "cibseven-2.2.0-service-task-incident-cancellation-draft";

const predecessorProfile =
  "cibseven-2.2.0-service-task-incident-draft";
const erasedProfile = "service-task-incident-profile-erased";
const sourceSha256 =
  "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d";

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
  "CIB-EXT-0006",
  "CIB-EXT-0013",
  "CIB-EXT-0014",
  "CIB-OP-0008",
  "CIB-OP-0009",
  "CIB-CFG-0001",
  "CIB-CFG-0002",
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

export type ServiceTaskIncidentCancellationDefinitionPair = Readonly<{
  checkedProcess: CheckedProcess;
  semanticProcess: SemanticProcessProgram;
}>;

export function verifyServiceTaskIncidentCancellationArtifactBinding(
  profile: ProfileArtifact,
  scenario?: ScenarioArtifact,
): void {
  const selectsCancellation =
    profile.id === serviceTaskIncidentCancellationProfileId;
  const schedulesCancellation =
    scenario?.profile === serviceTaskIncidentCancellationProfileId;
  if (!selectsCancellation && !schedulesCancellation) {
    return;
  }
  if (
    !selectsCancellation ||
    (scenario !== undefined && !schedulesCancellation)
  ) {
    throw new Error(
      "Service Task incident cancellation profile and scenario must be selected together",
    );
  }
  if (
    profile.environment?.createIncidentOnFailedJobEnabled !== true ||
    !isDeepStrictEqual(profile.bpmn.relationships, exactRelationships) ||
    !isDeepStrictEqual(profile.effectBindings, exactEffectBindings)
  ) {
    throw new Error(
      "Service Task incident cancellation profile differs from its exact configured binding",
    );
  }
  if (scenario === undefined) {
    return;
  }
  if (
    scenario.id !== "service-task-effect-incident-root-cancellation" ||
    scenario.bpmn.id !== "service-task-effect-phase-zero-probe" ||
    scenario.bpmn.relativePath !== "scenarios/service-task-effect/process.bpmn" ||
    scenario.bpmn.sha256 !== sourceSha256 ||
    scenario.bpmn.sourceOverlay !== null ||
    !isDeepStrictEqual(scenario.stimuli, exactCancellationSchedule())
  ) {
    throw new Error(
      "Service Task incident cancellation scenario differs from its exact answer-free schedule",
    );
  }
}

function exactCancellationSchedule(): ReadonlyArray<unknown> {
  const effectId = {
    processInstanceId: "Instance_1",
    elementId: "ServiceTask_Record",
    activation: 1,
  };
  return [
    {
      kind: "startProcess",
      commandId: "start-process",
      processId: "Process_ServiceTaskEffectProbe",
      instanceId: "Instance_1",
      initialVariables: [{
        name: "preserved",
        value: { kind: "string", value: "before-cancel" },
      }],
    },
    {
      kind: "reportEffectFailure",
      commandId:
        "report-effect-failure-sha256:b6b5077e469b9421ed4a598e4c08fae7c3ce3e31c941fae9733b4c7206a2b345",
      effectId,
      generation: 1,
    },
    {
      kind: "cancelIncidentProcess",
      commandId: "cancel-incident-process",
      processInstanceId: "Instance_1",
      incidentId: { effectId, generation: 1 },
    },
  ];
}

export function verifyServiceTaskIncidentCancellationSuccessor(
  predecessor: ServiceTaskIncidentCancellationDefinitionPair,
  successor: ServiceTaskIncidentCancellationDefinitionPair,
): void {
  requireProfile(predecessor, predecessorProfile, "predecessor");
  requireProfile(
    successor,
    serviceTaskIncidentCancellationProfileId,
    "successor",
  );
  if (!isDeepStrictEqual(
    eraseCheckedProfile(predecessor.checkedProcess),
    eraseCheckedProfile(successor.checkedProcess),
  )) {
    throw new Error(
      "Service Task incident cancellation checked process differs outside semantic profile identity",
    );
  }
  if (!isDeepStrictEqual(
    eraseProgramProfile(predecessor.semanticProcess),
    eraseProgramProfile(successor.semanticProcess),
  )) {
    throw new Error(
      "Service Task incident cancellation Semantic Process differs outside semantic profile identity",
    );
  }
}

function requireProfile(
  artifacts: ServiceTaskIncidentCancellationDefinitionPair,
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
    identity: { ...value.identity, semanticProfile: erasedProfile },
  };
}

function eraseProgramProfile(
  value: SemanticProcessProgram,
): SemanticProcessProgram {
  return {
    ...value,
    identity: { ...value.identity, semanticProfile: erasedProfile },
  };
}
