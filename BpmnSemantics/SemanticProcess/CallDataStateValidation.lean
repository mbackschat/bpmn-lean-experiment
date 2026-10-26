module

public import BpmnSemantics.SemanticProcess.CallDataCommandAdmission
public import BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.NestedScopeData

/-! # Scalar Call state validity

CDATA-OWNER-01 and CDATA-OUTPUT-01 require exact owned interface storage and a task-completion
phase boundary. The checkpoint composes this family predicate with the unchanged generic invariant;
input snapshots and caller frames remain two-state obligations in the transfer laws.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def callDataTaskValid (program : Program) (state : RuntimeState)
    (task : UserTaskWait) : Bool :=
  match dataInputOutputTaskContract? program task.task.id,
      activityOccurrenceForTaskWait? state.activityOccurrences task with
  | some contract, some record =>
      dataInputOutputRuntimeJoinValid program contract task record &&
        (dataInputOutputLocalScope? .scalar state record contract.directInput).isSome &&
        (match contract.directInput.source with
         | .property _ => state.calledProcessOccurrences.isEmpty
         | .processDataInput _ => state.calledProcessOccurrences.any (·.calledRoot == task.owner)) &&
        record.attachedHandlers.isEmpty &&
        dataInputOutputTaskWait? state task.processInstanceId task.task.id task.activation == some task &&
        task.activation == 1 && activationCount state task.task.id == 1 &&
        (state.activations.filter (·.taskId == task.task.id)).length == 1 &&
        record.activation == 1 && activityActivationCount state task.task.id == 1 &&
        (state.activityActivations.filter (·.taskId == task.task.id)).length == 1 &&
        (state.scopeOccurrences.filter fun scope => scope.id == task.owner && scope.parent.isNone).length == 1
  | _, _ => false

def exactScalarPort (bindings : List VariableBinding) (port : String) : Bool :=
  match bindings with
  | [binding] => binding.name == port && processInterfaceScalar binding.value
  | _ => false

def callDataRecordValid (program : Program) (state : RuntimeState)
    (data : ScalarCallData) (host : SemanticId) (record : CalledProcessOccurrence) : Bool :=
  match program.operations.filter (fun
      | .invokeProcess _ origin _ _ _ _ returned _ =>
          origin.elementId.value == record.id.elementId.value && returned == record.returnOperationId
      | _ => false), selectProcessInterface? state.variables record.calledRoot with
  | [.invokeProcess id origin _ process root entry returned (.scalar declared)], some scope =>
      let calledTasks := (dataInputOutputTaskContracts program).filter (·.input == entry)
      match calledTasks with
      | [task] =>
          let count := activationCount state task.taskId
          let waiting := state.waits.any fun wait => wait.owner == record.calledRoot && wait.task.id == task.taskId
          declared == data && record.id.elementId.value == origin.elementId.value &&
            record.id.activation == 1 && callActivationCount state origin.elementId == 1 &&
            (state.callActivations.filter (·.elementId == origin.elementId)).length == 1 &&
            record.caller.processInstanceId == host && record.caller.activation == 1 &&
            operationOwningScope? program id == some record.caller.definitionScopeId &&
            record.calledProcessId == process && record.calledRoot.definitionScopeId == root &&
            record.returnOperationId == returned && exactScalarPort scope.inputs data.called.input.id &&
            (if count == 0 || waiting then scope.outputs.isEmpty
             else count == 1 && exactScalarPort scope.outputs data.called.output.id)
      | _ => false
  | _, _ => false

/-- Exact single-state Call data requirements; predecessor profiles keep their existing domain. -/
def callDataRuntimeStateValid (program : Program) (state : RuntimeState) : Bool :=
  if program.identity.semanticProfile != callDataCheckpointProfileId then true
  else match CallDataAdmission.program? program with
    | none => false
    | some data =>
      match state.control with
      | .notStarted => state == initialState
      | .running host =>
          state.variables.scopes.isEmpty && callDataStartBindingsAdmitted program state.variables.process.bindings &&
            runtimePositionValid program host state && calledProcessAssociationsValid state &&
            state.calledProcessOccurrences.length ≤ 1 &&
            state.scopeOccurrences.length == state.calledProcessOccurrences.length + 1 &&
            state.scopeOccurrences.all (fun scope => scope.id.activation == 1) &&
            state.variables.processInterfaces.length == state.calledProcessOccurrences.length &&
            state.calledProcessOccurrences.all (callDataRecordValid program state data host) &&
            state.waits.all (callDataTaskValid program state) && state.waits.length ≤ 1 &&
            state.activityOccurrences.length == state.waits.length &&
            state.variables.activities.length == state.waits.length
      | .completed _ | .cancelled _ | .failed .. =>
          state.variables.scopes.isEmpty && callDataStartBindingsAdmitted program state.variables.process.bindings &&
            state.variables.processInterfaces.isEmpty && state.calledProcessOccurrences.isEmpty &&
            state.waits.isEmpty && state.activityOccurrences.isEmpty && state.variables.activities.isEmpty

/-- The bounded Call checkpoint retains every generic validity obligation and adds owned data. -/
def callDataCheckpointStateWellFormed (program : Program) (host : SemanticId)
    (state : RuntimeState) : Bool :=
  runtimeStateWellFormed program host state && callDataRuntimeStateValid program state

end BpmnSemantics.SemanticProcess
