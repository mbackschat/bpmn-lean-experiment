export enum InternalTransitionStateAtomKind {
  Activation = "activation",
  ActivityAssociation = "activityAssociation",
  ActivityVariable = "activityVariable",
  ActivityVariableScope = "activityVariableScope",
  CallAssociation = "callAssociation",
  ControlToken = "controlToken",
  InitiationPending = "initiationPending",
  LogicalTime = "logicalTime",
  OccurrenceRegion = "occurrenceRegion",
  OpenWaitAnchor = "openWaitAnchor",
  RuntimeControl = "runtimeControl",
  ScopeOccurrence = "scopeOccurrence",
  ScopeParent = "scopeParent",
  Wait = "wait",
}

export enum InternalTransitionPublicationAtomKind {
  CommittedTransition = "committedTransition",
  FlowNodeLifecycle = "flowNodeLifecycle",
  PublicationPair = "publicationPair",
}
