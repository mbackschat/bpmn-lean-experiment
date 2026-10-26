module

public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.Fixtures
public import BpmnSemantics.SemanticProcess.TopologyFixtures
public import BpmnSemantics.SemanticProcess.TransactionSourceAdmission

/-! # Canonical token storage conformance

These witnesses compare exact stored token units under the Internal Commutation canonical-storage account, including existing parallel execution prefixes. They introduce no source-admission or operation-family claim.
-/

@[expose] public section

namespace BpmnSemantics.CanonicalTokenStorageConformance

open BpmnSemantics.SemanticProcess

def owner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance:A"⟩
    definitionScopeId := ⟨"scope:A"⟩
    activation := 2 }

def placeA : ControlPlaceId := ⟨"place:A"⟩
def placeB : ControlPlaceId := ⟨"place:B"⟩
def tokenA : ControlToken := { placeId := placeA, owner }
def tokenB : ControlToken := { placeId := placeB, owner }

def distinct_places_have_one_exact_storage_order : Bool := decide <|
    addToken (addToken [] placeA owner) placeB owner = [tokenA, tokenB] ∧
      addToken (addToken [] placeB owner) placeA owner = [tokenA, tokenB]

def laterOwner : ScopeOccurrenceId := { owner with activation := 10 }
def laterToken : ControlToken := { placeId := placeA, owner := laterOwner }

def same_place_uses_complete_numeric_owner_order : Bool := decide <|
    addToken (addToken [] placeA owner) placeA laterOwner = [tokenA, laterToken] ∧
      addToken (addToken [] placeA laterOwner) placeA owner = [tokenA, laterToken]

def equal_token_units_retain_multiplicity : Bool := decide <|
    addToken (addToken [] placeA owner) placeA owner = [tokenA, tokenA] ∧
      removeToken [tokenA, tokenA] placeA owner = [tokenA]

def foreign_owner_selection_remains_place_wide : Bool := decide <|
    onlyTokenOwner? { initialState with tokens := [tokenA, laterToken] } placeA = none ∧
      onlyTokenOwner? { initialState with tokens := [tokenA, tokenB] } placeA = some owner

def aggregate_order_distinguishes_reversed_places_and_owners : Bool := decide <|
    canonicalCollectionOrder { initialState with tokens := [tokenA, tokenB] } = true ∧
      canonicalCollectionOrder { initialState with tokens := [tokenB, tokenA] } = false ∧
      canonicalCollectionOrder { initialState with tokens := [tokenA, laterToken] } = true ∧
      canonicalCollectionOrder { initialState with tokens := [laterToken, tokenA] } = false

def rawOrderedPairs : List (ControlToken × ControlToken) :=
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

def complete_key_coordinates_have_exact_scalar_order : Bool := decide <|
    rawOrderedPairs.all (fun (first, second) =>
      decide (addToken (addToken [] first.placeId first.owner) second.placeId second.owner =
        [first, second]) &&
      decide (addToken (addToken [] second.placeId second.owner) first.placeId first.owner =
        [first, second]) &&
      decide (removeToken [first, second] first.placeId first.owner = [second]) &&
      decide (removeToken [first, second] second.placeId second.owner = [first])) = true

def placeC : ControlPlaceId := ⟨"place:C"⟩
def tokenC : ControlToken := { placeId := placeC, owner }

def unordered_predecessor_separates_mixed_update_orders : Bool := decide <|
    removeToken (addToken [tokenC, tokenA] placeB owner) placeC owner = [tokenB, tokenA] ∧
      addToken (removeToken [tokenC, tokenA] placeC owner) placeB owner = [tokenA, tokenB]

def positionOperations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End"⟩ { elementId := ⟨"End"⟩ } placeB
  , .initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } placeA
  , .awaitUserTask ⟨"operation:Task"⟩ { elementId := ⟨"Task"⟩ } placeA placeB
      { id := ⟨"Task"⟩, name := none }
  , .completeScope ⟨"operation:complete"⟩ { elementId := ⟨"Process_TokenStorage"⟩ }
      owner.definitionScopeId none ]

def positionProgram : Program :=
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

def positionState : RuntimeState :=
  { initialState with
    control := .running owner.processInstanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    tokens := [tokenA, tokenB] }

def position_valid_reversed_places_fail_aggregate_order : Bool := decide <|
    runtimeStateWellFormed positionProgram owner.processInstanceId positionState = true ∧
      runtimePositionValid positionProgram owner.processInstanceId
        { positionState with tokens := [tokenB, tokenA] } = true ∧
      runtimeStateWellFormed positionProgram owner.processInstanceId
        { positionState with tokens := [tokenB, tokenA] } = false

def childOwner : ScopeOccurrenceId := { owner with definitionScopeId := ⟨"scope:Child"⟩ }
def childLater : ScopeOccurrenceId := { childOwner with activation := 10 }
def childToken : ControlToken := { placeId := placeC, owner := childOwner }
def childLaterToken : ControlToken := { placeId := placeC, owner := childLater }
def childOperations : List (SemanticOperation × DefinitionScopeId) :=
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
def childProgram : Program :=
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
def childState : RuntimeState :=
  { positionState with
    scopeOccurrences := positionState.scopeOccurrences ++
      [{ id := childOwner, parent := some owner }, { id := childLater, parent := some owner }]
    tokens := [childToken, childLaterToken] }

def position_valid_reversed_owners_fail_aggregate_order : Bool := decide <|
    runtimeStateWellFormed childProgram owner.processInstanceId childState = true ∧
      runtimePositionValid childProgram owner.processInstanceId
        { childState with tokens := [childLaterToken, childToken] } = true ∧
      runtimeStateWellFormed childProgram owner.processInstanceId
        { childState with tokens := [childLaterToken, childToken] } = false

def executionToken (place : String) : ControlToken :=
  rootToken parallelInstanceId parallelProgram.processId ⟨place⟩

def executedJoin : RuntimeState :=
  (step parallelProgram parallelAfterAThenB parallelJoinOperation).getD initialState

def actual_parallel_prefixes_preserve_exact_canonical_tokens : Bool := decide <|
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
          (runtimeStateWellFormed parallelProgram parallelInstanceId) = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("distinct_places_have_one_exact_storage_order", distinct_places_have_one_exact_storage_order),
  ("same_place_uses_complete_numeric_owner_order", same_place_uses_complete_numeric_owner_order),
  ("equal_token_units_retain_multiplicity", equal_token_units_retain_multiplicity),
  ("foreign_owner_selection_remains_place_wide", foreign_owner_selection_remains_place_wide),
  ("aggregate_order_distinguishes_reversed_places_and_owners", aggregate_order_distinguishes_reversed_places_and_owners),
  ("complete_key_coordinates_have_exact_scalar_order", complete_key_coordinates_have_exact_scalar_order),
  ("unordered_predecessor_separates_mixed_update_orders", unordered_predecessor_separates_mixed_update_orders),
  ("position_valid_reversed_places_fail_aggregate_order", position_valid_reversed_places_fail_aggregate_order),
  ("position_valid_reversed_owners_fail_aggregate_order", position_valid_reversed_owners_fail_aggregate_order),
  ("actual_parallel_prefixes_preserve_exact_canonical_tokens", actual_parallel_prefixes_preserve_exact_canonical_tokens)
]

end BpmnSemantics.CanonicalTokenStorageConformance
