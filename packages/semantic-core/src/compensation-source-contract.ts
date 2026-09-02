import type { DeepReadonly } from "./deep-readonly.js";
import type {
  CompensationSingleEffectDescriptor,
} from "./compensation-trigger-handler-contract.js";

export type CheckedCompensationInput =
  | DeepReadonly<{
      kind: "empty";
    }>
  | DeepReadonly<{
      kind: "directRestoredProcessBinding";
      sourcePropertyId: string;
      targetDataInputId: string;
    }>;

export type CheckedCompensationBody = DeepReadonly<{
  kind: "singleEffect";
  handlerElementId: string;
  effectElementId: string;
  descriptor: CompensationSingleEffectDescriptor;
  input: CheckedCompensationInput;
}>;

export type CheckedCompensationSubject =
  | DeepReadonly<{
      kind: "boundaryActivity";
      subjectElementId: string;
      boundaryEventElementId: string;
      body: CheckedCompensationBody;
    }>
  | DeepReadonly<{
      kind: "eventSubProcess";
      parentElementId: string;
      parentScopeId: string;
      handlerScopeId: string;
      body: CheckedCompensationBody;
    }>;

export type CheckedCompensationDependency = DeepReadonly<{
  predecessorElementId: string;
  successorElementId: string;
  reason: "sequenceFlow";
}>;

export type CheckedCompensation = DeepReadonly<{
  triggerElementId: string;
  subjects: CheckedCompensationSubject[];
  dependencies: CheckedCompensationDependency[];
  retentionLimits: {
    maxRecords: 2;
    maxCanonicalBytes: 4096;
  };
  snapshotLimits: {
    maxRecords: 1;
    maxCanonicalBytes: 8192;
  };
  executionLimits: {
    maxTriggers: 1;
    maxHandlers: 3;
    maxCanonicalBytes: 20480;
  };
}>;
