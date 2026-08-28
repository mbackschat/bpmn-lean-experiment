export enum InternalTransitionStateAtomKind {
  Activation = "activation",
  ActivityAssociation = "activityAssociation",
  ActivityVariable = "activityVariable",
  ActivityVariableScope = "activityVariableScope",
  CallAssociation = "callAssociation",
  ControlToken = "controlToken",
  EndCount = "endCount",
  EndIncrement = "endIncrement",
  EventRaceAssociation = "eventRaceAssociation",
  InitiationPending = "initiationPending",
  LogicalTime = "logicalTime",
  OccurrenceRegion = "occurrenceRegion",
  OpenWaitAnchor = "openWaitAnchor",
  ProcessVariable = "processVariable",
  RuntimeControl = "runtimeControl",
  SelectedBranch = "selectedBranch",
  ScopeOccurrence = "scopeOccurrence",
  ScopeParent = "scopeParent",
  Wait = "wait",
}

export enum InternalTransitionPublicationAtomKind {
  CommittedTransition = "committedTransition",
  FlowNodeLifecycle = "flowNodeLifecycle",
  PublicationPair = "publicationPair",
}
