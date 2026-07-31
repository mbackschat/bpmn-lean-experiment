import BpmnSemantics.SemanticProcessContract

/-! # Semantic profile operation capabilities

This module owns the exact operation cardinalities selected by each reviewed profile. Checked-source and Semantic Process graph validation remain profile-independent.
-/

namespace BpmnSemantics.SemanticProcess

private structure OperationCardinalities where
  initiates : Nat
  userTasks : Nat
  messages : Nat
  timers : Nat
  effects : Nat
  duplicates : Nat
  synchronizes : Nat
  choices : Nat
  terminates : Nat
  deriving DecidableEq

private def emptyCardinalities : OperationCardinalities :=
  { initiates := 0
    userTasks := 0
    messages := 0
    timers := 0
    effects := 0
    duplicates := 0
    synchronizes := 0
    choices := 0
    terminates := 0 }

private def nodeCardinalities (nodes : List CheckedNode) :
    OperationCardinalities :=
  nodes.foldl (init := emptyCardinalities) fun counts node =>
    match node with
    | .noneStartEvent .. => { counts with initiates := counts.initiates + 1 }
    | .userTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .intermediateCatchTimerEvent .. =>
        { counts with timers := counts.timers + 1 }
    | .intermediateCatchMessageEvent .. =>
        { counts with messages := counts.messages + 1 }
    | .serviceTask .. => { counts with effects := counts.effects + 1 }
    | .parallelGateway _ .diverging =>
        { counts with duplicates := counts.duplicates + 1 }
    | .parallelGateway _ .converging =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .exclusiveGateway .. => { counts with choices := counts.choices + 1 }
    | .noneEndEvent .. => { counts with terminates := counts.terminates + 1 }

private def operationCardinalities (operations : List SemanticOperation) :
    OperationCardinalities :=
  operations.foldl (init := emptyCardinalities) fun counts operation =>
    match operation with
    | .initiate .. => { counts with initiates := counts.initiates + 1 }
    | .awaitUserTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .awaitTimer .. => { counts with timers := counts.timers + 1 }
    | .awaitMessage .. => { counts with messages := counts.messages + 1 }
    | .awaitEffect .. => { counts with effects := counts.effects + 1 }
    | .duplicate .. => { counts with duplicates := counts.duplicates + 1 }
    | .synchronize .. =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .choose .. => { counts with choices := counts.choices + 1 }
    | .terminate .. => { counts with terminates := counts.terminates + 1 }

private def profileAllowsCardinalities (profile : String)
    (counts : OperationCardinalities) : Bool :=
  if profile = "cibseven-2.2.0-user-task-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1, userTasks := 1, terminates := 1 }
  else if profile = "cibseven-2.2.0-intermediate-catch-timer-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1, timers := 1, terminates := 1 }
  else if profile = "cibseven-2.2.0-service-task-effect-draft" ||
      profile = "cibseven-2.0.0-a12-create-document-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1, effects := 1, terminates := 1 }
  else if profile = "cibseven-2.0.0-a12-boundary-error-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1, userTasks := 1, effects := 1, terminates := 2 }
  else if profile = "parallel-fork-join-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1
        userTasks := 2
        duplicates := 1
        synchronizes := 1
        terminates := 1 }
  else if profile =
      "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1, userTasks := 3, choices := 1, terminates := 3 }
  else if profile =
      "bpmn-2.0.2-timer-user-task-composition-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1, userTasks := 1, timers := 1, terminates := 1 }
  else if profile =
      "bpmn-2.0.2-intermediate-catch-message-draft" then
    counts =
      { emptyCardinalities with
        initiates := 1, userTasks := 1, messages := 1, terminates := 1 }
  else
    false

/-- Exact node cardinalities selected by the checked source's semantic profile. -/
def checkedProfileCapabilitiesValid (source : CheckedProcess) : Bool :=
  profileAllowsCardinalities source.identity.semanticProfile.value
    (nodeCardinalities source.nodes)

/-- Exact operation cardinalities selected by the program's semantic profile. -/
def programProfileCapabilitiesValid (program : Program) : Bool :=
  profileAllowsCardinalities program.identity.semanticProfile.value
    (operationCardinalities program.operations)

end BpmnSemantics.SemanticProcess
