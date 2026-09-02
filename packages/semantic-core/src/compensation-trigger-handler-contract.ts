import type { DeepReadonly } from "./deep-readonly.js";
import { EffectOperation, EffectProtocol } from "./semantic-value-contract.js";

export type CompensationSingleEffectDescriptor = DeepReadonly<{
  protocol: typeof EffectProtocol.Activity;
  operation: typeof EffectOperation.CompensationSingleEffect;
}>;

export type SingleEffectCompensationHandlerBody = DeepReadonly<{
  kind: "singleEffect";
  handlerElementId: string;
  effectElementId: string;
  descriptor: CompensationSingleEffectDescriptor;
  input:
    | { kind: "empty" }
    | {
        kind: "restoredProcessBinding";
        sourceName: string;
        argumentName: string;
      };
}>;

export type CompensationSubjectDefinition =
  | DeepReadonly<{
      kind: "boundaryActivity";
      subjectElementId: string;
      body: SingleEffectCompensationHandlerBody;
    }>
  | DeepReadonly<{
      kind: "eventSubProcess";
      parentScopeId: string;
      handlerScopeId: string;
      body: SingleEffectCompensationHandlerBody;
    }>;

export type CompensationDependency = DeepReadonly<{
  predecessorElementId: string;
  successorElementId: string;
  reason: "sequenceFlow";
}>;

export type CompensationTriggerLimits = DeepReadonly<{
  maxTriggers: number;
  maxHandlers: number;
  maxCanonicalBytes: number;
}>;

export type CompensationExecutionDeclaration = DeepReadonly<{
  definitionScopeId: string;
  triggerOperationId: string;
  subjects: CompensationSubjectDefinition[];
  dependencies: CompensationDependency[];
  limits: CompensationTriggerLimits;
}>;
