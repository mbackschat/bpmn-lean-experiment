export enum InternalTransitionStateAtomKind {
  Activation = "activation",
  ActivityVariable = "activityVariable",
  ActivityVariableScope = "activityVariableScope",
  CallAssociation = "callAssociation",
  ControlToken = "controlToken",
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
