module

public import BpmnSemantics.CallActivityConformanceFixtures
public import BpmnSemantics.SemanticProcess.TerminateEnd
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic

/-! Fixture definitions and executable checks of [`RegionalRemovalOwnerCoverageConformance`](RegionalRemovalOwnerCoverageConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.RegionalRemovalOwnerCoverageConformance


open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def semanticInstanceId : SemanticId := ⟨"Coverage"⟩
def root : ScopeOccurrenceId := ⟨semanticInstanceId, ⟨"A"⟩, 1⟩
def child : ScopeOccurrenceId := ⟨semanticInstanceId, ⟨"B"⟩, 1⟩
def leaf : ScopeOccurrenceId := ⟨semanticInstanceId, ⟨"C"⟩, 1⟩

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := terminateEndCheckpointProfileId
        sourceId := ⟨"owner-coverage"⟩
        sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process"⟩
    definitionScopes :=
      [{ id := ⟨"A"⟩, parentScopeId := none, originElementId := ⟨"Process"⟩ },
       { id := ⟨"B"⟩, parentScopeId := some ⟨"A"⟩, originElementId := ⟨"Child"⟩ },
       { id := ⟨"C"⟩, parentScopeId := some ⟨"B"⟩, originElementId := ⟨"Leaf"⟩ }]
    controlPlaces := ["P0", "P1", "P2", "P3", "P4"].map fun name =>
      { id := ⟨name⟩, origin := ⟨⟨name⟩⟩ }
    controlPlaceScopes :=
      [{ controlPlaceId := ⟨"P0"⟩, scopeId := ⟨"A"⟩ },
       { controlPlaceId := ⟨"P1"⟩, scopeId := ⟨"B"⟩ },
       { controlPlaceId := ⟨"P2"⟩, scopeId := ⟨"C"⟩ },
       { controlPlaceId := ⟨"P3"⟩, scopeId := ⟨"B"⟩ },
       { controlPlaceId := ⟨"P4"⟩, scopeId := ⟨"A"⟩ }]
    operations :=
      [.initiate ⟨"A"⟩ ⟨⟨"Start"⟩⟩ ⟨"P0"⟩,
       .enterScope ⟨"B"⟩ ⟨⟨"Child"⟩⟩ ⟨"P0"⟩ ⟨"P1"⟩ ⟨"B"⟩,
       .enterScope ⟨"C"⟩ ⟨⟨"Leaf"⟩⟩ ⟨"P1"⟩ ⟨"P2"⟩ ⟨"C"⟩,
       .reachNoneEnd ⟨"D"⟩ ⟨⟨"LeafEnd"⟩⟩ ⟨"P2"⟩,
       .completeScope ⟨"E"⟩ ⟨⟨"Leaf"⟩⟩ ⟨"C"⟩ (some ⟨"P3"⟩),
       .terminateScope ⟨"F"⟩ ⟨⟨"Terminate"⟩⟩ ⟨"P3"⟩ ⟨"B"⟩,
       .completeScope ⟨"G"⟩ ⟨⟨"Child"⟩⟩ ⟨"B"⟩ (some ⟨"P4"⟩),
       .reachNoneEnd ⟨"H"⟩ ⟨⟨"RootEnd"⟩⟩ ⟨"P4"⟩,
       .completeScope ⟨"I"⟩ ⟨⟨"Process"⟩⟩ ⟨"A"⟩ none]
    operationScopes :=
      [{ operationId := ⟨"A"⟩, scopeId := ⟨"A"⟩ },
       { operationId := ⟨"B"⟩, scopeId := ⟨"A"⟩ },
       { operationId := ⟨"C"⟩, scopeId := ⟨"B"⟩ },
       { operationId := ⟨"D"⟩, scopeId := ⟨"C"⟩ },
       { operationId := ⟨"E"⟩, scopeId := ⟨"C"⟩ },
       { operationId := ⟨"F"⟩, scopeId := ⟨"B"⟩ },
       { operationId := ⟨"G"⟩, scopeId := ⟨"B"⟩ },
       { operationId := ⟨"H"⟩, scopeId := ⟨"A"⟩ },
       { operationId := ⟨"I"⟩, scopeId := ⟨"A"⟩ }] }

def listener (owner : ScopeOccurrenceId) : EventSubProcessMessageSubscription :=
  { id := ⟨owner.processInstanceId, ⟨"Listener:" ++ owner.definitionScopeId.value⟩, owner.activation⟩
    owner, channel := .directMessage ⟨"Message"⟩ }

def activity (owner : ScopeOccurrenceId) (name : String) : ActivityOccurrence :=
  { processInstanceId := owner.processInstanceId, activityElementId := ⟨name⟩, activation := 1
    owner, body := .userTask ⟨owner.processInstanceId, ⟨name⟩, 1⟩, attachedHandlers := [] }

def sequential (owner : ScopeOccurrenceId) (name : String) : SequentialScopeController :=
  { id := ⟨owner.processInstanceId, ⟨name⟩, 1⟩, total := 2, completed := 0, currentItem := name }

def parallel (owner : ScopeOccurrenceId) (name : String) : ParallelScopeController :=
  { id := ⟨owner.processInstanceId, ⟨name⟩, 1⟩, total := 2, completed := 0 }

def populated (before : RuntimeState) (removed surviving : ScopeOccurrenceId) : RuntimeState :=
  { before with
    eventSubProcessMessageSubscriptions := [listener removed, listener surviving]
    activityOccurrences := [activity removed "Gone", activity surviving "Stay"]
    sequentialScopeControllers := [sequential removed "Gone", sequential surviving "Stay"]
    parallelScopeControllers := [parallel removed "Gone", parallel surviving "Stay"]
    variables := { before.variables with
      scopes := [{ owner := removed, bindings := [] }, { owner := surviving, bindings := [] }]
      processInterfaces := [{ owner := removed, inputs := [], outputs := [] },
        { owner := surviving, inputs := [], outputs := [] }] } }

abbrev expectedOwners (after : RuntimeState) (surviving : ScopeOccurrenceId) : Prop :=
  after.eventSubProcessMessageSubscriptions = [listener surviving] ∧
    after.variables.scopes = [{ owner := surviving, bindings := [] }] ∧
    after.variables.processInterfaces = [{ owner := surviving, inputs := [], outputs := [] }] ∧
    after.sequentialScopeControllers = [sequential surviving "Stay"] ∧
    after.parallelScopeControllers = [parallel surviving "Stay"]

def ownerChecks (after : RuntimeState) (surviving : ScopeOccurrenceId) : List Bool :=
  [decide (after.eventSubProcessMessageSubscriptions = [listener surviving]),
   decide (after.variables.scopes = [{ owner := surviving, bindings := [] }]),
   decide (after.variables.processInterfaces = [{ owner := surviving, inputs := [], outputs := [] }]),
   decide (after.sequentialScopeControllers = [sequential surviving "Stay"]),
   decide (after.parallelScopeControllers = [parallel surviving "Stay"])]

def regionalBefore : RuntimeState :=
  populated { initialState with
    control := .running semanticInstanceId
    scopeOccurrences := [{ id := root, parent := none }, { id := child, parent := some root },
      { id := leaf, parent := some child }]
    tokens := [{ owner := child, placeId := ⟨"P3"⟩ }]
    endOccurrences := 7
    logicalTimeMs := 13 } leaf root

def region : InternalOccurrenceRegion := { root := child, members := [child, leaf] }

def populated_regional_agreement_premises_are_satisfiable : Bool := decide <|
    runtimePositionValid program semanticInstanceId regionalBefore = true ∧
      deriveInternalOccurrenceRegion? regionalBefore child = some region

def callerRoot : ScopeOccurrenceId :=
  ⟨CallActivityConformance.callerInstanceId, CallActivityConformance.callerScopeId, 1⟩
def calledRoot : ScopeOccurrenceId :=
  ⟨CallActivityConformance.calledInstanceId, CallActivityConformance.calledScopeId, 1⟩
def calledBefore : RuntimeState :=
  populated CallActivityConformance.calledWaiting.state calledRoot callerRoot
def call : CalledProcessOccurrence :=
  { id := ⟨CallActivityConformance.callerInstanceId, ⟨"B_Call"⟩, 1⟩
    caller := callerRoot, calledProcessId := CallActivityConformance.calledProcessId
    calledRoot, returnOperationId := ⟨"operation:return-process:B_Call"⟩ }

def populated_called_predecessor_is_position_valid : Bool := decide <|
    runtimePositionValid CallActivityConformance.program CallActivityConformance.callerInstanceId
      calledBefore = true ∧ call ∈ calledBefore.calledProcessOccurrences

def no_op_removal_disagrees_with_each_populated_boundary : Bool := decide <|
    ownerChecks regionalBefore root = [false, false, false, false, false] ∧
      ownerChecks calledBefore callerRoot = [false, false, false, false, false] ∧
      (selectedTerminateOwner? program regionalBefore ⟨"F"⟩ ⟨⟨"Terminate"⟩⟩ ⟨"P3"⟩ ⟨"B"⟩).map
        (fun _ => ownerChecks regionalBefore root) = some [false, false, false, false, false]

def wrongOwnerRemoval (before : RuntimeState) (inside : ScopeOccurrenceId → Bool) : RuntimeState :=
  let wronglyRetained := before.activityOccurrences.filter fun record => inside record.owner
  let names := fun (id : ActivityOccurrenceId) => wronglyRetained.any fun record =>
    id.processInstanceId == record.processInstanceId &&
      id.activityElementId.value == record.activityElementId.value && id.activation == record.activation
  { before with
    eventSubProcessMessageSubscriptions := before.eventSubProcessMessageSubscriptions.filter fun value => inside value.owner
    variables := { before.variables with
      scopes := before.variables.scopes.filter fun value => inside value.owner
      processInterfaces := before.variables.processInterfaces.filter fun value => inside value.owner }
    sequentialScopeControllers := before.sequentialScopeControllers.filter fun value => names value.id
    parallelScopeControllers := before.parallelScopeControllers.filter fun value => names value.id }

def inverted_owner_removal_disagrees_with_each_populated_boundary : Bool := decide <|
    ownerChecks (wrongOwnerRemoval regionalBefore (scopeCancellationOwner regionalBefore child)) root =
        [false, false, false, false, false] ∧
      ownerChecks (wrongOwnerRemoval calledBefore fun owner =>
        owner.processInstanceId == CallActivityConformance.calledInstanceId) callerRoot =
        [false, false, false, false, false] ∧
      (selectedTerminateOwner? program regionalBefore ⟨"F"⟩ ⟨⟨"Terminate"⟩⟩ ⟨"P3"⟩ ⟨"B"⟩).map
        (fun owner => ownerChecks (wrongOwnerRemoval regionalBefore
          (scopeCancellationOwner regionalBefore owner)) root) =
        some [false, false, false, false, false]

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("populated_regional_agreement_premises_are_satisfiable", populated_regional_agreement_premises_are_satisfiable),
  ("populated_called_predecessor_is_position_valid", populated_called_predecessor_is_position_valid),
  ("no_op_removal_disagrees_with_each_populated_boundary", no_op_removal_disagrees_with_each_populated_boundary),
  ("inverted_owner_removal_disagrees_with_each_populated_boundary", inverted_owner_removal_disagrees_with_each_populated_boundary)
]

end BpmnSemantics.RegionalRemovalOwnerCoverageConformance
