import BpmnSemantics.SemanticProcessContract

/-! # Semantic profile shape capabilities

This module owns exact checked-node and Semantic Process operation cardinalities. Generic scoped graph validation remains profile-independent.
-/

namespace BpmnSemantics.SemanticProcess

private structure ShapeCardinalities where
  starts : Nat := 0
  initiates : Nat := 0
  embeddedScopes : Nat := 0
  boundaryErrors : Nat := 0
  scopeEntries : Nat := 0
  userTasks : Nat := 0
  messages : Nat := 0
  receiveTasks : Nat := 0
  timers : Nat := 0
  effects : Nat := 0
  duplicates : Nat := 0
  synchronizes : Nat := 0
  choices : Nat := 0
  inclusiveSplits : Nat := 0
  inclusiveJoins : Nat := 0
  eventGateways : Nat := 0
  selectMany : Nat := 0
  synchronizeSelected : Nat := 0
  eventRaces : Nat := 0
  errorEnds : Nat := 0
  errorThrows : Nat := 0
  ends : Nat := 0
  scopeCompletions : Nat := 0
  deriving DecidableEq

private def nodeCardinalities (nodes : List CheckedNode) :
    ShapeCardinalities :=
  nodes.foldl (init := {}) fun counts node =>
    match node with
    | .noneStartEvent .. => { counts with starts := counts.starts + 1 }
    | .embeddedSubProcess .. =>
        { counts with embeddedScopes := counts.embeddedScopes + 1 }
    | .boundaryErrorEvent .. =>
        { counts with boundaryErrors := counts.boundaryErrors + 1 }
    | .userTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .intermediateCatchTimerEvent .. =>
        { counts with timers := counts.timers + 1 }
    | .intermediateCatchMessageEvent .. =>
        { counts with messages := counts.messages + 1 }
    | .receiveTask .. =>
        { counts with receiveTasks := counts.receiveTasks + 1 }
    | .serviceTask .. => { counts with effects := counts.effects + 1 }
    | .parallelGateway _ .diverging =>
        { counts with duplicates := counts.duplicates + 1 }
    | .parallelGateway _ .converging =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .exclusiveGateway .. => { counts with choices := counts.choices + 1 }
    | .inclusiveGatewayDiverging .. =>
        { counts with inclusiveSplits := counts.inclusiveSplits + 1 }
    | .inclusiveGatewayConverging .. =>
        { counts with inclusiveJoins := counts.inclusiveJoins + 1 }
    | .eventBasedGateway .. =>
        { counts with eventGateways := counts.eventGateways + 1 }
    | .errorEndEvent .. => { counts with errorEnds := counts.errorEnds + 1 }
    | .noneEndEvent .. => { counts with ends := counts.ends + 1 }

private def operationCardinalities (operations : List SemanticOperation) :
    ShapeCardinalities :=
  operations.foldl (init := {}) fun counts operation =>
    match operation with
    | .initiate .. => { counts with initiates := counts.initiates + 1 }
    | .enterScope .. => { counts with scopeEntries := counts.scopeEntries + 1 }
    | .awaitUserTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .awaitTimer .. => { counts with timers := counts.timers + 1 }
    | .awaitMessage .. => { counts with messages := counts.messages + 1 }
    | .awaitEventRace .. => { counts with eventRaces := counts.eventRaces + 1 }
    | .awaitEffect .. => { counts with effects := counts.effects + 1 }
    | .duplicate .. => { counts with duplicates := counts.duplicates + 1 }
    | .synchronize .. =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .choose .. => { counts with choices := counts.choices + 1 }
    | .selectMany .. => { counts with selectMany := counts.selectMany + 1 }
    | .synchronizeSelected .. =>
        { counts with synchronizeSelected := counts.synchronizeSelected + 1 }
    | .throwError .. => { counts with errorThrows := counts.errorThrows + 1 }
    | .reachNoneEnd .. => { counts with ends := counts.ends + 1 }
    | .completeScope .. =>
        { counts with scopeCompletions := counts.scopeCompletions + 1 }

private def withScopeCompletions (count : Nat) (shape : ShapeCardinalities) :
    ShapeCardinalities :=
  { shape with scopeCompletions := count }

private def checkedShape? (profile : String) : Option (Nat × ShapeCardinalities) :=
  if profile = "cibseven-2.2.0-user-task-process-data-draft" then
    some (1, { starts := 1, userTasks := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-intermediate-catch-timer-draft" then
    some (1, { starts := 1, timers := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-service-task-effect-draft" ||
      profile = "cibseven-2.0.0-a12-create-document-draft" then
    some (1, { starts := 1, effects := 1, ends := 1 })
  else if profile = "cibseven-2.0.0-a12-boundary-error-draft" then
    some (1,
      { starts := 1, userTasks := 1, effects := 1, ends := 2 })
  else if profile = "parallel-fork-join-draft" then
    some (1,
      { starts := 1, userTasks := 2, duplicates := 1,
        synchronizes := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft" then
    some (1,
      { starts := 1, userTasks := 3, choices := 1, ends := 3 })
  else if profile =
      "bpmn-2.0.2-inclusive-gateway-selected-branches-draft" then
    some (1,
      { starts := 1, userTasks := 3, inclusiveSplits := 1,
        inclusiveJoins := 1, ends := 1 })
  else if profile =
      "bpmn-2.0.2-event-based-gateway-message-timer-draft" then
    some (1,
      { starts := 1, userTasks := 2, messages := 1, timers := 1,
        eventGateways := 1, ends := 2 })
  else if profile = "bpmn-2.0.2-timer-user-task-composition-draft" then
    some (1,
      { starts := 1, userTasks := 1, timers := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-intermediate-catch-message-draft" then
    some (1,
      { starts := 1, userTasks := 1, messages := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-message-addressed-receive-task-draft" then
    some (1, { starts := 1, receiveTasks := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-embedded-subprocess-completion-draft" then
    some (2,
      { starts := 2, embeddedScopes := 1, userTasks := 3,
        duplicates := 1, ends := 3 })
  else if profile =
      "cibseven-2.2.0-subprocess-error-propagation-draft" then
    some (2,
      { starts := 2, embeddedScopes := 1, boundaryErrors := 1,
        userTasks := 3, duplicates := 1, errorEnds := 1, ends := 3 })
  else none

private def programShape? (profile : String) : Option (Nat × ShapeCardinalities) :=
  if profile = "cibseven-2.2.0-user-task-process-data-draft" then
    some (1, withScopeCompletions 1 { initiates := 1, userTasks := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-intermediate-catch-timer-draft" then
    some (1, withScopeCompletions 1 { initiates := 1, timers := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-service-task-effect-draft" ||
      profile = "cibseven-2.0.0-a12-create-document-draft" then
    some (1, withScopeCompletions 1 { initiates := 1, effects := 1, ends := 1 })
  else if profile = "cibseven-2.0.0-a12-boundary-error-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, effects := 1, ends := 2 })
  else if profile = "parallel-fork-join-draft" then
    some (1,
      withScopeCompletions 1
        { initiates := 1, userTasks := 2, duplicates := 1,
          synchronizes := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 3, choices := 1, ends := 3 })
  else if profile =
      "bpmn-2.0.2-inclusive-gateway-selected-branches-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 3, selectMany := 1,
        synchronizeSelected := 1, ends := 1 })
  else if profile =
      "bpmn-2.0.2-event-based-gateway-message-timer-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 2, eventRaces := 1, ends := 2 })
  else if profile = "bpmn-2.0.2-timer-user-task-composition-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, timers := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-intermediate-catch-message-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, messages := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-message-addressed-receive-task-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, messages := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-embedded-subprocess-completion-draft" then
    some (2,
      withScopeCompletions 2
        { initiates := 1, scopeEntries := 1, userTasks := 3,
          duplicates := 1, ends := 3 })
  else if profile =
      "cibseven-2.2.0-subprocess-error-propagation-draft" then
    some (2,
      withScopeCompletions 2
        { initiates := 1, scopeEntries := 1, userTasks := 3,
          duplicates := 1, errorThrows := 1, ends := 3 })
  else none

/-- Exact checked node and definition-scope cardinalities selected by the profile. -/
def checkedProfileCapabilitiesValid (source : CheckedProcess) : Bool :=
  match checkedShape? source.identity.semanticProfile.value with
  | some (scopeCount, shape) =>
      source.definitionScopes.length = scopeCount &&
        nodeCardinalities source.nodes = shape
  | none => false

/-- Exact operation and definition-scope cardinalities selected by the profile. -/
def programProfileCapabilitiesValid (program : Program) : Bool :=
  match programShape? program.identity.semanticProfile.value with
  | some (scopeCount, shape) =>
      program.definitionScopes.length = scopeCount &&
        operationCardinalities program.operations = shape
  | none => false

end BpmnSemantics.SemanticProcess
