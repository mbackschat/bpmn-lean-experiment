module

public import BpmnSemantics.SemanticProcess.ValueDomain
public import BpmnSemantics.SemanticProcess.CallDataAdmission
public import BpmnSemantics.SemanticProcess.CallActivity

/-! # Declaration-bound scalar Call command admission

CDATA-INPUT-01 requires the mapped request and closes optional start bindings over the retained
caller Property inventory. CDATA-OWNER-01 permits a called Task completion only through its live,
exact Call/root association; hosting Workflow identity is not the called Task's semantic identity.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def callDataStartBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match CallDataAdmission.program? program with
  | none => false
  | some data =>
      match data.directInput.source with
      | .processDataInput _ => false
      | .property request =>
          SemanticProcessJson.bindingNamesStrictlyIncrease bindings &&
            bindings.all (fun binding => data.callerProperties.contains binding.name) &&
            processDataBindingsAdmitted program.identity.semanticProfile .processStart bindings &&
            (bindings.filter (·.name == request)).length == 1

/-- Successful composed completion already checks the exact wait, Activity and local-data join. -/
def callDataCalledTaskInstanceAdmitted (program : Program) (state : RuntimeState)
    (taskId : UserTaskInstanceId) : Bool :=
  if program.identity.semanticProfile != callDataCheckpointProfileId then false
  else match CallDataAdmission.program? program, state.control with
    | some data, .running host =>
        calledProcessAssociationsValid state &&
          match state.waits.filter ((taskIdNamesWait taskId)) with
          | [wait] =>
              (state.calledProcessOccurrences.filter fun record =>
                record.id.elementId.value == data.call.ownerId && record.caller.processInstanceId == host &&
                record.calledProcessId.value == data.called.ownerId && record.calledRoot == wait.owner).length == 1
          | _ => false
    | _, _ => false

end BpmnSemantics.SemanticProcess
