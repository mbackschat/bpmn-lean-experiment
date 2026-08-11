import {
  CheckedNodeKind,
  EffectOperation,
  EffectProtocol,
  SemanticCheckpointProfileId,
  SemanticOperationKind,
  SemanticOriginKind,
} from "../src/index.js";
import type {
  CheckedNode,
  SemanticOperation,
} from "../src/index.js";

const configuredTask = {
  kind: CheckedNodeKind.ConfiguredTask,
  id: "ConfiguredTask_Probe",
  descriptor: {
    protocol: EffectProtocol.Activity,
    operation: EffectOperation.Probe,
  },
} as const satisfies Extract<
  CheckedNode,
  { kind: CheckedNodeKind.ConfiguredTask }
>;

const configuredOperation = {
  kind: SemanticOperationKind.AwaitEffect,
  id: "operation:ConfiguredTask_Probe",
  origin: {
    kind: SemanticOriginKind.BpmnElement,
    elementId: "ConfiguredTask_Probe",
  },
  input: "place:Flow_StartToConfigured",
  output: "place:Flow_ConfiguredToUser",
  effect: {
    elementId: "ConfiguredTask_Probe",
    descriptor: configuredTask.descriptor,
    inputMappings: [],
    outputMappings: [],
  },
  bpmnErrorRoute: null,
} as const satisfies Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitEffect }
>;

SemanticCheckpointProfileId.ConfiguredTask;

// @ts-expect-error checked configured Tasks are deeply immutable
configuredTask.descriptor.operation = EffectOperation.MappedSuccess;
// @ts-expect-error configured Task lowering reuses AwaitEffect, which has no handler source field
configuredOperation.effect.handlerType;
// @ts-expect-error checkpoint identities are runtime-frozen readonly values
SemanticCheckpointProfileId.ConfiguredTask = "mutated-profile";
