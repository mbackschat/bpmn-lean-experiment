import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.Fixtures

/-! # Canonical token storage conformance

These witnesses compare exact stored token units under the Internal Commutation canonical-storage account, including existing parallel execution prefixes. They introduce no source-admission or operation-family claim.
-/

namespace BpmnSemantics.CanonicalTokenStorageConformance

open BpmnSemantics.SemanticProcess

private def owner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance:A"⟩
    definitionScopeId := ⟨"scope:A"⟩
    activation := 2 }

private def placeA : ControlPlaceId := ⟨"place:A"⟩
private def placeB : ControlPlaceId := ⟨"place:B"⟩
private def tokenA : ControlToken := { placeId := placeA, owner }
private def tokenB : ControlToken := { placeId := placeB, owner }

theorem distinct_places_have_one_exact_storage_order :
    addToken (addToken [] placeA owner) placeB owner = [tokenA, tokenB] ∧
      addToken (addToken [] placeB owner) placeA owner = [tokenA, tokenB] := by
  decide +kernel

private def laterOwner : ScopeOccurrenceId := { owner with activation := 10 }
private def laterToken : ControlToken := { placeId := placeA, owner := laterOwner }

theorem same_place_uses_complete_numeric_owner_order :
    addToken (addToken [] placeA owner) placeA laterOwner = [tokenA, laterToken] ∧
      addToken (addToken [] placeA laterOwner) placeA owner = [tokenA, laterToken] := by
  decide +kernel

theorem equal_token_units_retain_multiplicity :
    addToken (addToken [] placeA owner) placeA owner = [tokenA, tokenA] ∧
      removeToken [tokenA, tokenA] placeA owner = [tokenA] := by
  decide +kernel

theorem foreign_owner_selection_remains_place_wide :
    onlyTokenOwner? { initialState with tokens := [tokenA, laterToken] } placeA = none ∧
      onlyTokenOwner? { initialState with tokens := [tokenA, tokenB] } placeA = some owner := by
  decide +kernel

theorem aggregate_order_distinguishes_reversed_places_and_owners :
    canonicalCollectionOrder { initialState with tokens := [tokenA, tokenB] } = true ∧
      canonicalCollectionOrder { initialState with tokens := [tokenB, tokenA] } = false ∧
      canonicalCollectionOrder { initialState with tokens := [tokenA, laterToken] } = true ∧
      canonicalCollectionOrder { initialState with tokens := [laterToken, tokenA] } = false := by
  decide +kernel

private def rawOrderedPairs : List (ControlToken × ControlToken) :=
  [ ( { tokenA with owner := { owner with processInstanceId := ⟨"Z"⟩ } }
    , { tokenB with owner := { owner with processInstanceId := ⟨"A"⟩ } } )
  , ( { tokenA with owner := { owner with processInstanceId := ⟨"A"⟩, definitionScopeId := ⟨"Z"⟩ } }
    , { tokenA with owner := { owner with processInstanceId := ⟨"Z"⟩, definitionScopeId := ⟨"A"⟩ } } )
  , ( { tokenA with owner := { owner with definitionScopeId := ⟨"A"⟩, activation := 10 } }
    , { tokenA with owner := { owner with definitionScopeId := ⟨"Z"⟩, activation := 2 } } )
  , (tokenA, laterToken)
  , ({ tokenA with placeId := ⟨"\uE000"⟩ }, { tokenA with placeId := ⟨"𐀀"⟩ })
  , ( { tokenA with owner := { owner with processInstanceId := ⟨"\uE000"⟩ } }
    , { tokenA with owner := { owner with processInstanceId := ⟨"𐀀"⟩ } } )
  , ( { tokenA with owner := { owner with definitionScopeId := ⟨"\uE000"⟩ } }
    , { tokenA with owner := { owner with definitionScopeId := ⟨"𐀀"⟩ } } ) ]

theorem complete_key_coordinates_have_exact_scalar_order :
    rawOrderedPairs.all (fun (first, second) =>
      decide (addToken (addToken [] first.placeId first.owner) second.placeId second.owner =
        [first, second]) &&
      decide (addToken (addToken [] second.placeId second.owner) first.placeId first.owner =
        [first, second]) &&
      decide (removeToken [first, second] first.placeId first.owner = [second]) &&
      decide (removeToken [first, second] second.placeId second.owner = [first])) = true := by
  decide +kernel

private def placeC : ControlPlaceId := ⟨"place:C"⟩
private def tokenC : ControlToken := { placeId := placeC, owner }

theorem unordered_predecessor_separates_mixed_update_orders :
    removeToken (addToken [tokenC, tokenA] placeB owner) placeC owner = [tokenB, tokenA] ∧
      addToken (removeToken [tokenC, tokenA] placeC owner) placeB owner = [tokenA, tokenB] := by
  decide +kernel

private def positionOperations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End"⟩ { elementId := ⟨"End"⟩ } placeB
  , .initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } placeA
  , .awaitUserTask ⟨"operation:Task"⟩ { elementId := ⟨"Task"⟩ } placeA placeB
      { id := ⟨"Task"⟩, name := none }
  , .completeScope ⟨"operation:complete"⟩ { elementId := ⟨"Process_TokenStorage"⟩ }
      owner.definitionScopeId none ]

private def positionProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"cibseven-2.2.0-embedded-subprocess-completion-draft"⟩
        sourceId := ⟨"canonical-token-storage-helper"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process_TokenStorage"⟩
    definitionScopes :=
      [{ id := owner.definitionScopeId, parentScopeId := none
         originElementId := ⟨"Process_TokenStorage"⟩ }]
    operationScopes := positionOperations.map fun operation =>
      { operationId := operation.id, scopeId := owner.definitionScopeId }
    controlPlaceScopes :=
      [{ controlPlaceId := placeA, scopeId := owner.definitionScopeId },
       { controlPlaceId := placeB, scopeId := owner.definitionScopeId }]
    controlPlaces :=
      [{ id := placeA, origin := ⟨⟨"Flow_A"⟩⟩ },
       { id := placeB, origin := ⟨⟨"Flow_B"⟩⟩ }]
    operations := positionOperations }

private def positionState : RuntimeState :=
  { initialState with
    control := .running owner.processInstanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    tokens := [tokenA, tokenB] }

theorem position_valid_reversed_places_fail_aggregate_order :
    runtimeStateWellFormed positionProgram owner.processInstanceId positionState = true ∧
      runtimePositionValid positionProgram owner.processInstanceId
        { positionState with tokens := [tokenB, tokenA] } = true ∧
      runtimeStateWellFormed positionProgram owner.processInstanceId
        { positionState with tokens := [tokenB, tokenA] } = false := by
  decide +kernel

private def childOwner : ScopeOccurrenceId := { owner with definitionScopeId := ⟨"scope:Child"⟩ }
private def childLater : ScopeOccurrenceId := { childOwner with activation := 10 }
private def childToken : ControlToken := { placeId := placeC, owner := childOwner }
private def childLaterToken : ControlToken := { placeId := placeC, owner := childLater }
private def childOperations : List (SemanticOperation × DefinitionScopeId) :=
  [ (.reachNoneEnd ⟨"operation:EndChild"⟩ { elementId := ⟨"EndChild"⟩ } placeC,
      childOwner.definitionScopeId)
  , (.reachNoneEnd ⟨"operation:EndRoot"⟩ { elementId := ⟨"EndRoot"⟩ } placeB,
      owner.definitionScopeId)
  , (.enterScope ⟨"operation:Enter"⟩ { elementId := ⟨"Child"⟩ } placeA placeC
      childOwner.definitionScopeId, owner.definitionScopeId)
  , (.initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } placeA,
      owner.definitionScopeId)
  , (.completeScope ⟨"operation:completeA"⟩ { elementId := ⟨"Process_TokenStorage"⟩ }
      owner.definitionScopeId none, owner.definitionScopeId)
  , (.completeScope ⟨"operation:completeChild"⟩ { elementId := ⟨"Child"⟩ }
      childOwner.definitionScopeId (some placeB), childOwner.definitionScopeId) ]
private def childProgram : Program :=
  { positionProgram with
    definitionScopes := positionProgram.definitionScopes ++
      [{ id := childOwner.definitionScopeId, parentScopeId := some owner.definitionScopeId
         originElementId := ⟨"Child"⟩ }]
    operationScopes := childOperations.map fun (operation, scopeId) =>
      { operationId := operation.id, scopeId }
    operations := childOperations.map Prod.fst
    controlPlaces := positionProgram.controlPlaces ++ [{ id := placeC, origin := ⟨⟨"Flow_C"⟩⟩ }]
    controlPlaceScopes := positionProgram.controlPlaceScopes ++
      [{ controlPlaceId := placeC, scopeId := childOwner.definitionScopeId }] }
private def childState : RuntimeState :=
  { positionState with
    scopeOccurrences := positionState.scopeOccurrences ++
      [{ id := childOwner, parent := some owner }, { id := childLater, parent := some owner }]
    tokens := [childToken, childLaterToken] }

theorem position_valid_reversed_owners_fail_aggregate_order :
    runtimeStateWellFormed childProgram owner.processInstanceId childState = true ∧
      runtimePositionValid childProgram owner.processInstanceId
        { childState with tokens := [childLaterToken, childToken] } = true ∧
      runtimeStateWellFormed childProgram owner.processInstanceId
        { childState with tokens := [childLaterToken, childToken] } = false := by
  decide +kernel

private def executionToken (place : String) : ControlToken :=
  rootToken parallelInstanceId parallelProgram.processId ⟨place⟩

private def executedJoin : RuntimeState :=
  (step parallelProgram parallelAfterAThenB parallelJoinOperation).getD initialState

theorem actual_parallel_prefixes_preserve_exact_canonical_tokens :
    step parallelProgram parallelStartState parallelStartOperation = some parallelAfterStart ∧
      step parallelProgram parallelAfterStart parallelForkOperation = some parallelAfterFork ∧
      parallelAfterFork.tokens =
        [executionToken "place:Flow_ForkToA", executionToken "place:Flow_ForkToB"] ∧
      parallelAfterAThenB.tokens =
        [executionToken "place:Flow_AToJoin", executionToken "place:Flow_BToJoin"] ∧
      parallelAfterBThenA.tokens =
        [executionToken "place:Flow_AToJoin", executionToken "place:Flow_BToJoin"] ∧
      step parallelProgram parallelAfterAThenB parallelJoinOperation = some executedJoin ∧
      executedJoin.tokens = [executionToken "place:Flow_JoinToEnd"] ∧
      [parallelStartState, parallelAfterStart, parallelAfterFork, parallelWaitingState,
        parallelAfterCompletingA, parallelAfterCompletingB, parallelAfterAThenB,
        parallelAfterBThenA, executedJoin].all
          (runtimeStateWellFormed parallelProgram parallelInstanceId) = true := by
  decide +kernel

end BpmnSemantics.CanonicalTokenStorageConformance
