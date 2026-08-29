export const BpmnCapabilitySupport = {
  BoundedStandard: "boundedStandard",
  ProjectExtension: "projectExtension",
} as const;

export type BpmnCapabilitySupport =
  typeof BpmnCapabilitySupport[keyof typeof BpmnCapabilitySupport];

export const CibCapabilityEvidenceKind = {
  ExactSelectedProfile: "exactSelectedProfile",
  NotApplicable: "notApplicable",
  NotSelected: "notSelected",
} as const;

export type CibCapabilityEvidence =
  | Readonly<{
    kind: typeof CibCapabilityEvidenceKind.ExactSelectedProfile;
    pipelineCaseId: string;
    version: "2.0.0" | "2.2.0";
  }>
  | Readonly<{
    kind:
      | typeof CibCapabilityEvidenceKind.NotApplicable
      | typeof CibCapabilityEvidenceKind.NotSelected;
  }>;

export type MvpBpmnCapability = Readonly<{
  id: string;
  family: string;
  element: string;
  support: BpmnCapabilitySupport;
  restriction: string;
  cibEvidence: CibCapabilityEvidence;
}>;

const exactCib = (
  pipelineCaseId: string,
  version: "2.0.0" | "2.2.0" = "2.2.0",
): CibCapabilityEvidence => Object.freeze({
  kind: CibCapabilityEvidenceKind.ExactSelectedProfile,
  pipelineCaseId,
  version,
});

const notSelected = Object.freeze({
  kind: CibCapabilityEvidenceKind.NotSelected,
}) satisfies CibCapabilityEvidence;

const notApplicable = Object.freeze({
  kind: CibCapabilityEvidenceKind.NotApplicable,
}) satisfies CibCapabilityEvidence;

export const mvpBpmnCapabilities = Object.freeze([
  {
    id: "process",
    family: "Process structure",
    element: "Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Executable finite graphs only in registered profiles; this is not general BPMN graph admission.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "sequenceFlow",
    family: "Process structure",
    element: "Sequence Flow",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Profile-owned control flow; conditions use only the exact Simple Boolean subset where selected.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "noneStartEvent",
    family: "Start Events",
    element: "None Start Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Ordinary starts only inside the bounded registered Process shapes.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "messageStartEvent",
    family: "Start Events",
    element: "Message Start Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One top-level operation-addressed, payload-free start with one target; no fanout or correlation keys.",
    cibEvidence: notSelected,
  },
  {
    id: "timerStartEvent",
    family: "Start Events",
    element: "Timer Start Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One top-level PT1S start from one resolved occurrence; no recurrence or calendar form.",
    cibEvidence: notSelected,
  },
  {
    id: "noneEndEvent",
    family: "End Events",
    element: "None End Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Ordinary completion only inside the bounded registered Process and scope shapes.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "errorEndEvent",
    family: "End Events",
    element: "Error End Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact-code throw inside a directly enclosed Sub-Process with one exact parent handler.",
    cibEvidence: exactCib("subprocess-error-propagation-trigger-first"),
  },
  {
    id: "terminateEndEvent",
    family: "End Events",
    element: "Terminate End Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One nested Terminate End cancels only its containing Sub-Process occurrence before parent continuation.",
    cibEvidence: notSelected,
  },
  {
    id: "userTask",
    family: "Activities",
    element: "User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Occurrence-bound wait and completion; string/null normally, with one Boolean and one literal group/form profile.",
    cibEvidence: exactCib("user-task-assignment-form-metadata"),
  },
  {
    id: "directDataInputUserTask",
    family: "Activities",
    element: "User Task with a direct Data Input",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One required scalar DataInput in one InputSet, filled by one direct Data Input Association from one Process Property, with an empty OutputSet; an absent source is unavailable data and explicit null is available.",
    cibEvidence: notSelected,
  },
  {
    id: "sequentialMultiInstanceUserTask",
    family: "Activities",
    element: "Sequential Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One ordered String-list snapshot, one active generated task at a time, at most sixteen items, and atomic index-ordered String-list output.",
    cibEvidence: notSelected,
  },
  {
    id: "parallelMultiInstanceUserTask",
    family: "Activities",
    element: "Parallel Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One ordered String-list snapshot, at most sixteen concurrent generated tasks, exact all-or-first completion policy, atomic index-ordered output only when every slot is filled, and no partial output on early closure.",
    cibEvidence: notSelected,
  },
  {
    id: "serviceTask",
    family: "Activities",
    element: "Service Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exact registered bindings only: payload-free effect, bounded literal mappings, and one generation-1 incident account.",
    cibEvidence: exactCib("service-task-effect-success"),
  },
  {
    id: "receiveTask",
    family: "Activities",
    element: "Receive Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One direct-Message, payload-free, non-instantiating Receive Task; no buffering or correlation.",
    cibEvidence: exactCib("message-addressed-receive-task"),
  },
  {
    id: "configuredTask",
    family: "Activities",
    element: "Task with BPMN Lean task definition",
    support: BpmnCapabilitySupport.ProjectExtension,
    restriction: "One exact project extension binding to the existing Probe effect; not a general BPMN Task execution claim.",
    cibEvidence: notApplicable,
  },
  {
    id: "callActivity",
    family: "Activities",
    element: "Call Activity",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One in-document called Process, empty data, normal return, no recursion, deployment resolution, or Child Workflow identity.",
    cibEvidence: notSelected,
  },
  {
    id: "embeddedSubProcess",
    family: "Activities",
    element: "Embedded Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One-level exact completion, Error, boundary Timer, and Terminate shapes; no Event Sub-Process.",
    cibEvidence: exactCib("embedded-subprocess-completion-a-then-b"),
  },
  {
    id: "exclusiveGateway",
    family: "Gateways",
    element: "Exclusive Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exact two-condition-plus-default split and one bounded cycle merge; Simple Boolean v1 only.",
    cibEvidence: notSelected,
  },
  {
    id: "parallelGateway",
    family: "Gateways",
    element: "Parallel Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Balanced two-branch fork/join in registered root or child-scope shapes.",
    cibEvidence: exactCib("parallel-fork-join-a-then-b"),
  },
  {
    id: "inclusiveGateway",
    family: "Gateways",
    element: "Inclusive Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Two Simple Boolean conditions plus default, direct User Task branches, and the paired selected-subset join.",
    cibEvidence: notSelected,
  },
  {
    id: "eventBasedGateway",
    family: "Gateways",
    element: "Event-Based Gateway",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One non-instantiating race between an operation-addressed Message catch and an exact PT1S Timer catch.",
    cibEvidence: notSelected,
  },
  {
    id: "intermediateCatchMessageEvent",
    family: "Intermediate Catch Events",
    element: "Message Intermediate Catch Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One operation-addressed, payload-free subscription; no Message Flow, key, buffering, or global correlation.",
    cibEvidence: notSelected,
  },
  {
    id: "intermediateCatchTimerEvent",
    family: "Intermediate Catch Events",
    element: "Timer Intermediate Catch Event",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "Exact PT1S duration only with explicit logical-time firing.",
    cibEvidence: exactCib("intermediate-catch-timer-pt1s"),
  },
  {
    id: "interruptingUserTaskBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S deadline that withdraws its attached User Task.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingSequentialMultiInstanceBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on sequential Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S outer-lifetime deadline preserved through task turnover; interruption withdraws the active task and publishes no partial output.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingParallelMultiInstanceBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on parallel Multi-Instance User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S outer-lifetime deadline preserved across concurrent progress; interruption terminates every remaining task and publishes no partial output.",
    cibEvidence: notSelected,
  },
  {
    id: "nonInterruptingUserTaskBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Non-interrupting Timer Boundary Event on User Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S firing that preserves the host and spawns one handler branch.",
    cibEvidence: notSelected,
  },
  {
    id: "interruptingSubProcessBoundaryTimerEvent",
    family: "Boundary Events",
    element: "Interrupting Timer Boundary Event on Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact PT1S deadline on a Sub-Process containing one child User Task.",
    cibEvidence: notSelected,
  },
  {
    id: "serviceTaskBoundaryErrorEvent",
    family: "Boundary Events",
    element: "Error Boundary Event on Service Task",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact mapped business-error code on the approved mapped Service Task binding.",
    cibEvidence: exactCib("mapped-boundary-error-service-task-caught", "2.0.0"),
  },
  {
    id: "subProcessBoundaryErrorEvent",
    family: "Boundary Events",
    element: "Error Boundary Event on Sub-Process",
    support: BpmnCapabilitySupport.BoundedStandard,
    restriction: "One exact-code handler attached to the directly enclosing Sub-Process; no ancestor or catch-all search.",
    cibEvidence: exactCib("subprocess-error-propagation-trigger-first"),
  },
] satisfies ReadonlyArray<MvpBpmnCapability>);

export type MvpBpmnCapabilityId =
  typeof mvpBpmnCapabilities[number]["id"];

export const mvpCapabilityCatalog = Object.freeze({
  standard: Object.freeze({
    name: "BPMN",
    version: "2.0.2",
    target: "Process Execution Conformance",
  }),
  compatibilityBaseline: Object.freeze({
    product: "CIB Seven",
    version: "2.2.0",
  }),
  capabilities: mvpBpmnCapabilities,
});
