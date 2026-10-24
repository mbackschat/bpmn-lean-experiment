module

public import BpmnSemantics.SemanticProcess.ActivityDataInput
public import BpmnSemantics.SemanticProcess.ActivityDataOutput
public import BpmnSemantics.SemanticProcess.ActivityDataEndpointRuntime

/-! # Composed direct Activity data input and output

This module owns one User Task lifetime that copies a required Process input at activation and
routes one required submitted output at completion. The two halves are deliberately not evaluated
as their predecessor transitions in sequence: doing that would mint two task occurrences, two
Activity records, and two local scopes for one BPMN Activity.

The local scope therefore contains only the copied `DataInput` for the complete active lifetime.
The `DataOutput` exists only in the accepted completion command; its direct association writes the
value to Process scope in the same transition that removes the wait, Activity record, and that one
input-bearing scope.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def dataInputOutputRunningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

/-- Source selection is keyed by the selected token owner, not hosting control (CDATA-OWNER-01). -/
def dataInputOutputSourceBinding? (policy : PropertyPathValuePolicy) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (directInput : DirectActivityDataInput) : Option VariableBinding :=
  readActivityDataInput? policy state owner directInput

/-- `ADIO-READY-01` and `ADIO-SCOPE-01`. Activate one composed Activity only after selecting one
exact Process input binding, and create its wait, record, and sole input-bearing local scope
atomically. -/
def activateDataInputOutputUserTask? (policy : PropertyPathValuePolicy) (state : RuntimeState)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← dataInputOutputRunningInstance? state
  let instanceId := owner.processInstanceId
  let source ← dataInputOutputSourceBinding? policy state owner directInput
  let taskActivation := activationCount state taskId + 1
  let activityActivation := activityActivationCount state taskId + 1
  let activityOwner : ActivityOccurrenceId :=
    { processInstanceId := instanceId
      activityElementId := ⟨taskId.value⟩
      activation := activityActivation }
  if state.variables.activities.any (activityOccurrenceScopeMatches activityOwner) then
    none
  else
    pure
      { state with
        tokens := removeToken state.tokens input owner
        waits := insertUserTaskWait
          { processInstanceId := instanceId
            owner
            task := { id := taskId, name := taskName }
            activation := taskActivation
            output
            metadata := none } state.waits
        activations := setActivationCount state.activations taskId taskActivation
        activityOccurrences := insertActivityOccurrence
          { processInstanceId := instanceId
            activityElementId := ⟨taskId.value⟩
            activation := activityActivation
            owner
            body := .userTask
              { processInstanceId := instanceId
                elementId := ⟨taskId.value⟩
                activation := taskActivation }
            attachedHandlers := [] } state.activityOccurrences
        activityActivations :=
          setActivationCount state.activityActivations taskId activityActivation
        variables := addActivityOccurrenceVariableScope state.variables activityOwner
          [{ name := directInput.targetDataInputId, value := source.value }] }

/-- Both immutable data contracts belonging to one composed task declaration. -/
structure DataInputOutputTaskContract where
  operationId : OperationId
  input : ControlPlaceId
  output : ControlPlaceId
  taskId : TaskDefinitionId
  taskName : Option String
  directInput : DirectActivityDataInput
  directOutput : DirectActivityDataOutput
  deriving Repr, DecidableEq

/-- Every composed Activity-data operation, projected to its task and both direct associations. -/
def dataInputOutputTaskContracts (program : Program) :
    List DataInputOutputTaskContract :=
  program.operations.filterMap fun
    | .awaitDataInputOutputUserTask operationId _ input output taskId taskName directInput
        directOutput =>
        some { operationId, input, output, taskId, taskName, directInput, directOutput }
    | _ => none

/-- The unique composed declaration for one task, or `none` for absent or ambiguous definitions. -/
def dataInputOutputTaskContract? (program : Program) (taskId : TaskDefinitionId) :
    Option DataInputOutputTaskContract :=
  match (dataInputOutputTaskContracts program).filter fun contract =>
      decide (contract.taskId = taskId) with
  | [contract] => some contract
  | _ => none

/-- `ADIO-REFUSE-01`: ambiguous declarations still belong to composed completion, where the
unique-contract lookup refuses them before ordinary completion can consume the wait. -/
def isDataInputOutputTaskDefinition (program : Program) (taskId : TaskDefinitionId) : Bool :=
  (dataInputOutputTaskContracts program).any fun contract => decide (contract.taskId = taskId)

/-- The unique wait named by the complete task occurrence identity. Duplicate matching waits are
refused rather than resolved by list order. -/
def dataInputOutputTaskWait? (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) : Option UserTaskWait :=
  match state.waits.filter (taskIdNamesWait { processInstanceId := processInstanceId, elementId := ⟨taskId.value⟩, activation := activation }) with
  | [wait] => some wait
  | _ => none

def activityOwnerForRecord (record : ActivityOccurrence) : ActivityOccurrenceId :=
  { processInstanceId := record.processInstanceId
    activityElementId := ⟨record.activityElementId.value⟩
    activation := record.activation }

/-- The exact dynamic and static join for the wait selected from one composed declaration. -/
def dataInputOutputRuntimeJoinValid (program : Program)
    (contract : DataInputOutputTaskContract) (task : UserTaskWait)
    (record : ActivityOccurrence) : Bool :=
  decide (task.output = contract.output) &&
    decide (operationOwningScope? program contract.operationId =
      some task.owner.definitionScopeId) &&
    decide (task.processInstanceId = task.owner.processInstanceId) &&
    decide (record.owner = task.owner) &&
    decide (record.processInstanceId = task.owner.processInstanceId) &&
    decide (record.activityElementId.value = contract.taskId.value) &&
    decide (task.task.name = contract.taskName)

/-- The one Activity-local scope a composed task may carry. The value is intentionally not compared
with current Process data: the scope is the activation-time copy, while later independent Process
transitions may change the source Property. -/
def dataInputOutputLocalScope? (policy : PropertyPathValuePolicy) (state : RuntimeState)
    (record : ActivityOccurrence) (directInput : DirectActivityDataInput) :
    Option ActivityVariableScope :=
  match state.variables.activities.filter
      (activityOccurrenceScopeMatches (activityOwnerForRecord record)) with
  | [scope] =>
      match scope.bindings with
      | [binding] =>
          if binding.name = directInput.targetDataInputId && policy.admits binding.value then
            some scope
          else
            none
      | _ => none
  | _ => none

/-- `ADIO-ATOMIC-01`. Validate the declaration, submitted output, exact wait/record/scope join, and
absence of attached handlers before routing the output and disposing that same joined lifetime in
one successor. -/
def completeDataInputOutputUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (submittedValues : List VariableBinding) : Option RuntimeState := do
  let _ ← dataInputOutputRunningInstance? state
  let contract ← dataInputOutputTaskContract? program taskId
  let filled ← filledDeclaredOutput? contract.directOutput submittedValues
  let task ← dataInputOutputTaskWait? state processInstanceId taskId activation
  let record ← activityOccurrenceForTaskWait? state.activityOccurrences task
  if dataInputOutputRuntimeJoinValid program contract task record then
    let policy := programPropertyPathValuePolicy program
    let _ ← dataInputOutputLocalScope? policy state record contract.directInput
    let variables ← removeActivityOccurrenceVariableScope state.variables
      (activityOwnerForRecord record)
    if record.attachedHandlers.isEmpty then
      let routed ← writeActivityDataOutput? policy state task.owner variables contract.directOutput
        filled
      pure
        { state with
          waits := state.waits.erase task
          tokens := addToken state.tokens task.output task.owner
          activityOccurrences := state.activityOccurrences.filter fun candidate =>
            !sameActivityOccurrence candidate record
          variables := routed }
    else
      none
  else
    none

/-- The complete Activity occurrence identity minted by one composed activation. -/
def dataInputOutputActivityOwner (state : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1 }

/-- The exact Activity record inserted by one composed activation. -/
def dataInputOutputActivityRecord (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (taskId : TaskDefinitionId) : ActivityOccurrence :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1
    owner
    body := .userTask
      { processInstanceId := instanceId
        elementId := ⟨taskId.value⟩
        activation := activationCount state taskId + 1 }
    attachedHandlers := [] }

end BpmnSemantics.SemanticProcess
