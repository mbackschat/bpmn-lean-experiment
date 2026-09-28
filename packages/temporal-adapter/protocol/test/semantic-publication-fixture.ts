import { InternalSchedulingMode } from "@bpmn-lean/semantic-core";

import { definition } from "./semantic-publication-wire-fixture.ts";

export {
  canonicalExportFixture,
  definition,
  publicationPage,
  rootScope,
  twoBatchPublicationPage,
} from "./semantic-publication-wire-fixture.ts";

export const program = {
  kind: "semanticProcess",
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  identity: definition,
  processId: "Process_1",
  definitionScopes: [{
    id: "Scope_Process_1",
    parentScopeId: null,
    originElementId: "Process_1",
  }],
  operationScopes: [{
    operationId: "Operation_Start",
    scopeId: "Scope_Process_1",
  }],
  controlPlaceScopes: [{
    controlPlaceId: "Place_Flow_1",
    scopeId: "Scope_Process_1",
  }],
  controlPlaces: [{
    id: "Place_Flow_1",
    origin: { kind: "bpmnSequenceFlow", elementId: "Flow_1" },
  }],
  operations: [{
    id: "Operation_Start",
    kind: "initiate",
    origin: { kind: "bpmnElement", elementId: "StartEvent_1" },
    output: "Place_Flow_1",
  }],
} as const;

export const publicationContext = {
  program,
  processInstanceId: "Instance_1",
} as const;
