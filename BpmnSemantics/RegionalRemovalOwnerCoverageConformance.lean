import BpmnSemantics.CallActivityConformanceFixtures
import BpmnSemantics.SemanticProcess.InternalRegionalActivityRemoval
import BpmnSemantics.SemanticProcess.TerminateEnd

/-! # Populated regional removal ownership witnesses

These direct remover and Terminate executions populate the five AA-21 collections with distinct
removed and surviving owners. Literal expected records are independent of the candidate successor.
Position validity is checked; these synthetic controller populations do not claim full-state or
profile admission, whose parallel scope-controller clause still requires an empty population.
-/

set_option Elab.async false

namespace BpmnSemantics.RegionalRemovalOwnerCoverageConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def semanticInstanceId : SemanticId := ⟨"Coverage"⟩
private def root : ScopeOccurrenceId := ⟨semanticInstanceId, ⟨"A"⟩, 1⟩
private def child : ScopeOccurrenceId := ⟨semanticInstanceId, ⟨"B"⟩, 1⟩
private def leaf : ScopeOccurrenceId := ⟨semanticInstanceId, ⟨"C"⟩, 1⟩

private def program : Program :=
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

private def listener (owner : ScopeOccurrenceId) : EventSubProcessMessageSubscription :=
  { id := ⟨owner.processInstanceId, ⟨"Listener:" ++ owner.definitionScopeId.value⟩, owner.activation⟩
    owner, channel := .directMessage ⟨"Message"⟩ }

private def activity (owner : ScopeOccurrenceId) (name : String) : ActivityOccurrence :=
  { processInstanceId := owner.processInstanceId, activityElementId := ⟨name⟩, activation := 1
    owner, body := .userTask ⟨owner.processInstanceId, ⟨name⟩, 1⟩, attachedHandlers := [] }

private def sequential (owner : ScopeOccurrenceId) (name : String) : SequentialScopeController :=
  { id := ⟨owner.processInstanceId, ⟨name⟩, 1⟩, total := 2, completed := 0, currentItem := name }

private def parallel (owner : ScopeOccurrenceId) (name : String) : ParallelScopeController :=
  { id := ⟨owner.processInstanceId, ⟨name⟩, 1⟩, total := 2, completed := 0 }

private def populated (before : RuntimeState) (removed surviving : ScopeOccurrenceId) : RuntimeState :=
  { before with
    eventSubProcessMessageSubscriptions := [listener removed, listener surviving]
    activityOccurrences := [activity removed "Gone", activity surviving "Stay"]
    sequentialScopeControllers := [sequential removed "Gone", sequential surviving "Stay"]
    parallelScopeControllers := [parallel removed "Gone", parallel surviving "Stay"]
    variables := { before.variables with
      scopes := [{ owner := removed, bindings := [] }, { owner := surviving, bindings := [] }]
      processInterfaces := [{ owner := removed, inputs := [], outputs := [] },
        { owner := surviving, inputs := [], outputs := [] }] } }

private abbrev expectedOwners (after : RuntimeState) (surviving : ScopeOccurrenceId) : Prop :=
  after.eventSubProcessMessageSubscriptions = [listener surviving] ∧
    after.variables.scopes = [{ owner := surviving, bindings := [] }] ∧
    after.variables.processInterfaces = [{ owner := surviving, inputs := [], outputs := [] }] ∧
    after.sequentialScopeControllers = [sequential surviving "Stay"] ∧
    after.parallelScopeControllers = [parallel surviving "Stay"]

private def ownerChecks (after : RuntimeState) (surviving : ScopeOccurrenceId) : List Bool :=
  [decide (after.eventSubProcessMessageSubscriptions = [listener surviving]),
   decide (after.variables.scopes = [{ owner := surviving, bindings := [] }]),
   decide (after.variables.processInterfaces = [{ owner := surviving, inputs := [], outputs := [] }]),
   decide (after.sequentialScopeControllers = [sequential surviving "Stay"]),
   decide (after.parallelScopeControllers = [parallel surviving "Stay"])]

private def regionalBefore : RuntimeState :=
  populated { initialState with
    control := .running semanticInstanceId
    scopeOccurrences := [{ id := root, parent := none }, { id := child, parent := some root },
      { id := leaf, parent := some child }]
    tokens := [{ owner := child, placeId := ⟨"P3"⟩ }]
    endOccurrences := 7
    logicalTimeMs := 13 } leaf root

private def region : InternalOccurrenceRegion := { root := child, members := [child, leaf] }

theorem populated_regional_agreement_premises_are_satisfiable :
    runtimePositionValid program semanticInstanceId regionalBefore = true ∧
      deriveInternalOccurrenceRegion? regionalBefore child = some region := by decide +kernel

theorem regional_removal_preserves_each_populated_outside_owner :
    expectedOwners (cancelScopeSubtree regionalBefore child .remove) root := by decide +kernel

theorem actual_terminate_preserves_each_populated_outside_owner :
    (terminateScopeState? program regionalBefore ⟨"F"⟩ ⟨⟨"Terminate"⟩⟩ ⟨"P3"⟩ ⟨"B"⟩).map
      (fun after => decide (expectedOwners after root) &&
        decide (after.scopeOccurrences = [{ id := root, parent := none }, { id := child, parent := some root }]) &&
        decide (after.endOccurrences = 8 ∧ after.logicalTimeMs = 13)) = some true := by decide +kernel

private def callerRoot : ScopeOccurrenceId :=
  ⟨CallActivityConformance.callerInstanceId, CallActivityConformance.callerScopeId, 1⟩
private def calledRoot : ScopeOccurrenceId :=
  ⟨CallActivityConformance.calledInstanceId, CallActivityConformance.calledScopeId, 1⟩
private def calledBefore : RuntimeState :=
  populated CallActivityConformance.calledWaiting.state calledRoot callerRoot
private def call : CalledProcessOccurrence :=
  { id := ⟨CallActivityConformance.callerInstanceId, ⟨"B_Call"⟩, 1⟩
    caller := callerRoot, calledProcessId := CallActivityConformance.calledProcessId
    calledRoot, returnOperationId := ⟨"operation:return-process:B_Call"⟩ }

theorem populated_called_predecessor_is_position_valid :
    runtimePositionValid CallActivityConformance.program CallActivityConformance.callerInstanceId
      calledBefore = true ∧ call ∈ calledBefore.calledProcessOccurrences := by decide +kernel

theorem called_instance_removal_preserves_each_populated_outside_owner :
    expectedOwners (removeCalledProcessTree calledBefore call) callerRoot := by decide +kernel

theorem no_op_removal_disagrees_with_each_populated_boundary :
    ownerChecks regionalBefore root = [false, false, false, false, false] ∧
      ownerChecks calledBefore callerRoot = [false, false, false, false, false] ∧
      (selectedTerminateOwner? program regionalBefore ⟨"F"⟩ ⟨⟨"Terminate"⟩⟩ ⟨"P3"⟩ ⟨"B"⟩).map
        (fun _ => ownerChecks regionalBefore root) = some [false, false, false, false, false] := by decide +kernel

private def wrongOwnerRemoval (before : RuntimeState) (inside : ScopeOccurrenceId → Bool) : RuntimeState :=
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

theorem inverted_owner_removal_disagrees_with_each_populated_boundary :
    ownerChecks (wrongOwnerRemoval regionalBefore (scopeCancellationOwner regionalBefore child)) root =
        [false, false, false, false, false] ∧
      ownerChecks (wrongOwnerRemoval calledBefore fun owner =>
        owner.processInstanceId == CallActivityConformance.calledInstanceId) callerRoot =
        [false, false, false, false, false] ∧
      (selectedTerminateOwner? program regionalBefore ⟨"F"⟩ ⟨⟨"Terminate"⟩⟩ ⟨"P3"⟩ ⟨"B"⟩).map
        (fun owner => ownerChecks (wrongOwnerRemoval regionalBefore
          (scopeCancellationOwner regionalBefore owner)) root) =
        some [false, false, false, false, false] := by decide +kernel

end BpmnSemantics.RegionalRemovalOwnerCoverageConformance
