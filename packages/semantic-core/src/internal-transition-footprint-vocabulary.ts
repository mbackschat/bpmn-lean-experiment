export enum InternalTransitionStateAtomKind {
  Activation = "activation",
  ActivityVariable = "activityVariable",
  ActivityVariableScope = "activityVariableScope",
  ControlToken = "controlToken",
  LogicalTime = "logicalTime",
  OpenWaitAnchor = "openWaitAnchor",
  RuntimeControl = "runtimeControl",
  ScopeOccurrence = "scopeOccurrence",
  Wait = "wait",
}

export enum InternalTransitionPublicationAtomKind {
  CommittedTransition = "committedTransition",
  FlowNodeLifecycle = "flowNodeLifecycle",
  PublicationPair = "publicationPair",
}
