import {
  StimulusKind,
  VariableValueKind,
} from "./contract.js";
import type {
  BpmnResource,
  DeliverPayloadMessageStimulus,
  MessageSubscriptionId,
  StartProcessStimulus,
  StateObservation,
  VariableValue,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import {
  CorrelatedMessageInteractionKind,
  CorrelatedMessageMatchKind,
  isCorrelatedMessageAddress,
  matchCorrelatedMessageCandidates,
  projectCorrelatedMessageCandidate,
  sameCorrelatedMessageAddress,
} from "./message-key-correlation.js";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
} from "./message-key-correlation.js";
import { SemanticProcessCompilerId } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { supportsSemanticProcessExecution } from "./semantic-process-admission.js";
import { initialState } from "./semantic-process-runtime.js";
import type { RuntimeState } from "./semantic-process-runtime.js";
import {
  ScenarioStepKind,
  advanceScenario,
  observeStableState,
} from "./scenario.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import {
  isSourceOverlayIdentityOrNull,
  sameSourceOverlayIdentity,
} from "./source-overlay-identity.js";
import { isWellFormedStimulus } from "./stimulus.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

export const EnginePopulationScenarioKind = Object.freeze({
  EnginePopulationScenario: "enginePopulationScenario",
} as const);

export const EnginePopulationObservationKind = Object.freeze({
  PublicationResults: "publicationResults",
  ProcessStates: "processStates",
  IngressOrdinals: "ingressOrdinals",
} as const);

export const EnginePopulationPublicationOutcomeKind = Object.freeze({
  Committed: "committed",
  RejectedNoMatch: "rejectedNoMatch",
  RejectedAmbiguous: "rejectedAmbiguous",
} as const);

export type EnginePopulationInstance = DeepReadonly<{
  definitionId: string;
  stimuli: [StartProcessStimulus, DeliverPayloadMessageStimulus];
}>;

export type EnginePopulationPublication = DeepReadonly<{
  kind: typeof CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage;
  commandId: string;
  address: CorrelatedMessageAddress;
  payload: Extract<VariableValue, { kind: typeof VariableValueKind.String }>;
}>;

export type EnginePopulationScenario = DeepReadonly<{
  kind: typeof EnginePopulationScenarioKind.EnginePopulationScenario;
  id: string;
  profile: typeof SemanticProfileId.MessageKeyCorrelation;
  definitions: [BpmnResource] | [BpmnResource, BpmnResource];
  instances: [EnginePopulationInstance, EnginePopulationInstance];
  publications: [EnginePopulationPublication];
  observations: [
    typeof EnginePopulationObservationKind.PublicationResults,
    typeof EnginePopulationObservationKind.ProcessStates,
    typeof EnginePopulationObservationKind.IngressOrdinals,
  ];
  executionTargets: {
    lean: true;
    typeScriptCore: true;
    temporal: true;
    cib: null;
  };
  provenance: {
    normativeRefs: string[];
    cibRevision: string;
    cibRefs: string[];
  };
}>;

export type EnginePopulationPublicationTarget = DeepReadonly<{
  processInstanceId: string;
  subscriptionId: MessageSubscriptionId;
}>;

export type EnginePopulationPublicationOutcome = DeepReadonly<
  | { kind: typeof EnginePopulationPublicationOutcomeKind.RejectedNoMatch }
  | { kind: typeof EnginePopulationPublicationOutcomeKind.RejectedAmbiguous }
  | {
      kind: typeof EnginePopulationPublicationOutcomeKind.Committed;
      target: EnginePopulationPublicationTarget;
    }
>;

export type EnginePopulationPublicationResult = DeepReadonly<{
  commandId: string;
  ingressOrdinal: number;
  outcome: EnginePopulationPublicationOutcome;
}>;

export type EnginePopulationScenarioResult = DeepReadonly<{
  kind: "enginePopulationResult";
  scenarioId: string;
  publicationResults: EnginePopulationPublicationResult[];
  processStates: StateObservation[];
  ingressOrdinals: Array<{
    commandId: string;
    ingressOrdinal: number;
  }>;
}>;

type InitializedInstance = Readonly<{
  program: SemanticProcessProgram;
  state: RuntimeState;
  candidate: CorrelatedMessageCandidate;
}>;

/** Evaluates one complete two-instance correlation population without choosing an order winner. */
export function runEnginePopulationScenario(
  scenario: EnginePopulationScenario,
  programsByDefinitionId: ReadonlyMap<string, SemanticProcessProgram>,
): EnginePopulationScenarioResult | null {
  if (
    !isEnginePopulationScenario(scenario) ||
    !(programsByDefinitionId instanceof Map) ||
    !bindingsExactlyCoverDefinitions(scenario, programsByDefinitionId)
  ) {
    return null;
  }

  const initialized: InitializedInstance[] = [];
  for (const instance of scenario.instances) {
    const program = programsByDefinitionId.get(instance.definitionId);
    if (program === undefined) {
      return null;
    }
    const [start, directDelivery] = instance.stimuli;
    if (!supportsSemanticProcessExecution(start, program)) {
      return null;
    }
    const started = advanceScenario(program, initialState, start);
    if (
      started.kind !== ScenarioStepKind.Committed ||
      started.publication === null ||
      started.flowNodeOccurrenceLifecycles === null
    ) {
      return null;
    }
    const prepared = advanceScenario(program, started.state, directDelivery);
    if (
      prepared.kind !== ScenarioStepKind.Committed ||
      prepared.publication === null ||
      prepared.flowNodeOccurrenceLifecycles === null
    ) {
      return null;
    }
    const observation = observeStableState(program, prepared.state);
    const candidate = projectCorrelatedMessageCandidate(program, prepared.state);
    if (observation === null || candidate === null) {
      return null;
    }
    initialized.push({ program, state: prepared.state, candidate });
  }

  const publication = scenario.publications[0];
  const ingressOrdinal = 1;
  const match = matchCorrelatedMessageCandidates(
    publication.address,
    publication.payload,
    initialized.map(({ candidate }) => candidate),
  );
  if (match === null) {
    return null;
  }

  let outcome: EnginePopulationPublicationOutcome;
  switch (match.kind) {
    case CorrelatedMessageMatchKind.NoMatch:
      outcome = {
        kind: EnginePopulationPublicationOutcomeKind.RejectedNoMatch,
      };
      break;
    case CorrelatedMessageMatchKind.Ambiguous:
      outcome = {
        kind: EnginePopulationPublicationOutcomeKind.RejectedAmbiguous,
      };
      break;
    case CorrelatedMessageMatchKind.Unique: {
      const selectedIndex = initialized.findIndex(
        ({ candidate }) =>
          candidate.processInstanceId === match.candidate.processInstanceId,
      );
      const selected = initialized[selectedIndex];
      if (selected === undefined) {
        return null;
      }
      const delivery = {
        kind: StimulusKind.DeliverCorrelatedPayloadMessage,
        commandId: publication.commandId,
        address: publication.address,
        ingressOrdinal,
        subscriptionId: match.candidate.subscriptionId,
        correlationPropertyId: match.candidate.correlationPropertyId,
        processPropertyId: match.candidate.processPropertyId,
        payload: publication.payload,
      } as const;
      const advanced = advanceScenario(
        selected.program,
        selected.state,
        delivery,
      );
      if (
        advanced.kind !== ScenarioStepKind.Committed ||
        advanced.publication === null ||
        advanced.flowNodeOccurrenceLifecycles === null
      ) {
        return null;
      }
      initialized[selectedIndex] = {
        ...selected,
        state: advanced.state,
      };
      outcome = {
        kind: EnginePopulationPublicationOutcomeKind.Committed,
        target: {
          processInstanceId: match.candidate.processInstanceId,
          subscriptionId: match.candidate.subscriptionId,
        },
      };
      break;
    }
    default:
      return assertNever(match);
  }

  const processStates: StateObservation[] = [];
  for (const { program, state } of initialized) {
    const observation = observeStableState(program, state);
    if (observation === null) {
      return null;
    }
    processStates.push(observation);
  }
  processStates.sort((left, right) =>
    compareCanonicalStrings(left.instanceId, right.instanceId)
  );

  return {
    kind: "enginePopulationResult",
    scenarioId: scenario.id,
    publicationResults: [{
      commandId: publication.commandId,
      ingressOrdinal,
      outcome,
    }],
    processStates,
    ingressOrdinals: [{
      commandId: publication.commandId,
      ingressOrdinal,
    }],
  };
}

function bindingsExactlyCoverDefinitions(
  scenario: EnginePopulationScenario,
  programs: ReadonlyMap<string, SemanticProcessProgram>,
): boolean {
  if (programs.size !== scenario.definitions.length) {
    return false;
  }
  const referencedDefinitionIds = new Set(
    scenario.instances.map(({ definitionId }) => definitionId),
  );
  if (referencedDefinitionIds.size !== scenario.definitions.length) {
    return false;
  }
  for (const definition of scenario.definitions) {
    const program = programs.get(definition.id);
    if (
      program === undefined ||
      program.identity.compiler !==
        SemanticProcessCompilerId.BpmnSourceSemanticProcess ||
      program.identity.semanticProfile !== scenario.profile ||
      program.identity.sourceId !== definition.id ||
      program.identity.sourceSha256 !== definition.sha256 ||
      !sameSourceOverlayIdentity(
        program.identity.sourceOverlay,
        definition.sourceOverlay,
      )
    ) {
      return false;
    }
  }
  for (const definitionId of programs.keys()) {
    if (!scenario.definitions.some(({ id }) => id === definitionId)) {
      return false;
    }
  }
  const publication = scenario.publications[0];
  const selectedDefinition = scenario.definitions.find((definition) =>
    definition.id === publication.address.definition.sourceId &&
    definition.sha256 === publication.address.definition.sourceSha256 &&
    sameSourceOverlayIdentity(
      definition.sourceOverlay,
      publication.address.definition.sourceOverlay,
    )
  );
  const selectedProgram = selectedDefinition === undefined
    ? undefined
    : programs.get(selectedDefinition.id);
  return selectedProgram !== undefined &&
    selectedProgram.processId === publication.address.processId &&
    sameCorrelatedMessageAddress(publication.address, {
      ...publication.address,
      definition: selectedProgram.identity,
      processId: selectedProgram.processId,
    });
}

function isEnginePopulationScenario(
  value: unknown,
): value is EnginePopulationScenario {
  if (!isRecordWithKeys(value, [
    "kind",
    "id",
    "profile",
    "definitions",
    "instances",
    "publications",
    "observations",
    "executionTargets",
    "provenance",
  ])) {
    return false;
  }
  const definitions = value.definitions;
  const instances = value.instances;
  const publications = value.publications;
  const observations = value.observations;
  const targets = value.executionTargets;
  const provenance = value.provenance;
  if (
    value.kind !== EnginePopulationScenarioKind.EnginePopulationScenario ||
    !nonemptyWireString(value.id) ||
    value.profile !== SemanticProfileId.MessageKeyCorrelation ||
    !Array.isArray(definitions) ||
    definitions.length < 1 ||
    definitions.length > 2 ||
    !definitions.every(isBpmnResource) ||
    new Set(definitions.map(({ id }) => id)).size !== definitions.length ||
    !Array.isArray(instances) ||
    instances.length !== 2 ||
    !instances.every(isEnginePopulationInstance) ||
    new Set(instances.map(({ stimuli }) => stimuli[0].instanceId)).size !== 2 ||
    !Array.isArray(publications) ||
    publications.length !== 1 ||
    !publications.every(isEnginePopulationPublication) ||
    !exactArray(observations, [
      EnginePopulationObservationKind.PublicationResults,
      EnginePopulationObservationKind.ProcessStates,
      EnginePopulationObservationKind.IngressOrdinals,
    ]) ||
    !isRecordWithKeys(targets, ["lean", "typeScriptCore", "temporal", "cib"]) ||
    targets.lean !== true ||
    targets.typeScriptCore !== true ||
    targets.temporal !== true ||
    targets.cib !== null ||
    !isProvenance(provenance)
  ) {
    return false;
  }
  const definitionIds = new Set(definitions.map(({ id }) => id));
  if (!instances.every(({ definitionId }) => definitionIds.has(definitionId))) {
    return false;
  }
  const commandIds = [
    ...instances.flatMap(({ stimuli }) => stimuli.map(({ commandId }) => commandId)),
    publications[0]!.commandId,
  ];
  return new Set(commandIds).size === commandIds.length;
}

function isEnginePopulationInstance(
  value: unknown,
): value is EnginePopulationInstance {
  if (!isRecordWithKeys(value, ["definitionId", "stimuli"])) {
    return false;
  }
  const stimuli = value.stimuli;
  if (
    !nonemptyWireString(value.definitionId) ||
    !Array.isArray(stimuli) ||
    stimuli.length !== 2 ||
    !stimuli.every(isWellFormedStimulus)
  ) {
    return false;
  }
  const [start, directDelivery] = stimuli;
  return start?.kind === StimulusKind.StartProcess &&
    directDelivery?.kind === StimulusKind.DeliverPayloadMessage &&
    directDelivery.subscriptionId.processInstanceId === start.instanceId;
}

function isEnginePopulationPublication(
  value: unknown,
): value is EnginePopulationPublication {
  if (!isRecordWithKeys(value, ["kind", "commandId", "address", "payload"])) {
    return false;
  }
  const payload = value.payload;
  return value.kind ===
      CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage &&
    nonemptyWireString(value.commandId) &&
    isCorrelatedMessageAddress(value.address) &&
    isRecordWithKeys(payload, ["kind", "value"]) &&
    payload.kind === VariableValueKind.String &&
    nonemptyWireString(payload.value);
}

function isBpmnResource(value: unknown): value is BpmnResource {
  return isRecordWithKeys(value, [
    "id",
    "relativePath",
    "sha256",
    "sourceOverlay",
  ]) &&
    nonemptyWireString(value.id) &&
    nonemptyWireString(value.relativePath) &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    isSourceOverlayIdentityOrNull(value.sourceOverlay);
}

function isProvenance(value: unknown): boolean {
  return isRecordWithKeys(value, ["normativeRefs", "cibRevision", "cibRefs"]) &&
    Array.isArray(value.normativeRefs) &&
    value.normativeRefs.length > 0 &&
    value.normativeRefs.every(nonemptyWireString) &&
    nonemptyWireString(value.cibRevision) &&
    Array.isArray(value.cibRefs) &&
    value.cibRefs.every(nonemptyWireString);
}

function exactArray(
  value: unknown,
  expected: ReadonlyArray<string>,
): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function nonemptyWireString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}

function isRecordWithKeys<K extends string>(
  value: unknown,
  keys: ReadonlyArray<K>,
): value is Record<K, unknown> {
  return typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported population match: ${JSON.stringify(value)}`);
}
