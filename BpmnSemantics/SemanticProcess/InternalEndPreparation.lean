import BpmnSemantics.SemanticProcess.InternalRegionalDependencies
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity

/-! Ordinary End preparation reuses token-patch validity and the existing relative End atom from
the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#ordinary-end-batch-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure InternalEndSelection where
  operation : SemanticOperation
  owner : ScopeOccurrenceId
  input : ControlPlaceId
  deriving Repr, DecidableEq

def InternalEndSelection.tokens (selected : InternalEndSelection) : TokenPatch :=
  { owner := selected.owner, consumed := [selected.input], produced := [] }

def InternalEndSelection.apply (state : RuntimeState) (selected : InternalEndSelection) : RuntimeState :=
  { state with tokens := selected.tokens.apply state.tokens, endOccurrences := state.endOccurrences + 1 }

def selectInternalEnd? (state : RuntimeState) (operation : SemanticOperation) : Option InternalEndSelection :=
  match operation with
  | .reachNoneEnd _ _ input =>
      match state.tokens.filter (fun token => decide (token.placeId = input)) with
      | [token] => some { operation, owner := token.owner, input }
      | _ => none
  | _ => none

def internalEndOrigin? : SemanticOperation → Option BpmnElementOrigin
  | .reachNoneEnd _ origin _ => some origin
  | _ => none

structure PreparedInternalEnd where
  selection : InternalEndSelection
  runtimeInstanceId : SemanticId
  footprint : InternalRegionalStateFootprint
  publicationTemplate : InternalLocalControlPublicationTemplate
  deriving Repr, DecidableEq

def PreparedInternalEnd.operation (prepared : PreparedInternalEnd) : SemanticOperation :=
  prepared.selection.operation

def internalEndStateFootprint (selected : InternalEndSelection) (instanceId : SemanticId) :
    InternalRegionalStateFootprint :=
  { reads := canonicalRegionalStateAtoms
      [.ordinary (.tokenOwners selected.input), .ordinary (.runtimeControl instanceId),
       .ordinary (.scopeOccurrence selected.owner), .ordinary (.controlToken selected.owner selected.input),
       .endIncrement, .ordinary .logicalTime]
    writes := canonicalRegionalStateAtoms
      [.ordinary (.controlToken selected.owner selected.input), .ordinary (.tokenOwners selected.input),
       .endIncrement] }

def makeInternalEndPreparation (state : RuntimeState) (selected : InternalEndSelection)
    (instanceId : SemanticId) (identity : FlowNodeIdentity) (delta : PublicControlPositionDelta) :
    PreparedInternalEnd :=
  { selection := selected, runtimeInstanceId := instanceId
    footprint := internalEndStateFootprint selected instanceId
    publicationTemplate :=
      { operation := selected.operation, identity
        logicalTimeMs := state.logicalTimeMs, positionDelta := delta } }

def prepareInternalEnd? (program : Program) (state : RuntimeState) (operation : SemanticOperation) :
    Option PreparedInternalEnd := do
  if program.compensationEventSubProcessSnapshots.isSome then none
  else
    let selected ← selectInternalEnd? state operation
    let origin ← internalEndOrigin? operation
    let instanceId ← runningInstance? state
    if !exactLiveOccurrence state selected.owner || origin.elementId.value = "" ||
        !SemanticProcessJson.isSafeWireNat state.logicalTimeMs then none
    else
      let identity ← candidateOperationFlowNodeIdentity? program operation
        selected.owner selected.owner origin.elementId
      let delta ← internalLocalControlPositionDelta? program selected.tokens
      pure (makeInternalEndPreparation state selected instanceId identity delta)

def applyPreparedInternalEnd? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalEnd) : Option RuntimeState :=
  if prepareInternalEnd? program state prepared.operation = some prepared then
    some (prepared.selection.apply state)
  else none

theorem selectInternalEnd_facts (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalEndSelection) (found : selectInternalEnd? state operation = some selected) :
    selected.operation = operation ∧
      ∃ id origin, operation = .reachNoneEnd id origin selected.input ∧
        state.tokens.filter (fun token => decide (token.placeId = selected.input)) =
          [⟨selected.input, selected.owner⟩] := by
  cases operation with
  | reachNoneEnd id origin input =>
      simp only [selectInternalEnd?] at found
      split at found
      · rename_i token filtered
        cases found
        have member : token ∈ state.tokens.filter (fun value => decide (value.placeId = input)) := by
          rw [filtered]
          exact List.mem_cons_self
        have place : token.placeId = input := of_decide_eq_true (List.mem_filter.mp member).2
        refine ⟨rfl, id, origin, rfl, ?_⟩
        cases token with
        | mk placeId owner =>
            change placeId = input at place
            subst placeId
            exact filtered
      · contradiction
  | _ => simp [selectInternalEnd?] at found

theorem selectInternalEnd_operation (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalEndSelection) (found : selectInternalEnd? state operation = some selected) :
    selected.operation = operation := (selectInternalEnd_facts state operation selected found).1

theorem prepareInternalEnd_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (found : prepareInternalEnd? program state operation = some prepared) :
    program.compensationEventSubProcessSnapshots = none ∧
      ∃ selected origin instanceId identity delta,
        selectInternalEnd? state operation = some selected ∧
        internalEndOrigin? operation = some origin ∧
        state.control = .running instanceId ∧
        exactLiveOccurrence state selected.owner = true ∧
        origin.elementId.value ≠ "" ∧
        SemanticProcessJson.isSafeWireNat state.logicalTimeMs = true ∧
        candidateOperationFlowNodeIdentity? program operation selected.owner selected.owner
          origin.elementId = some identity ∧
        internalLocalControlPositionDelta? program selected.tokens = some delta ∧
        prepared = makeInternalEndPreparation state selected instanceId identity delta := by
  cases snapshots : program.compensationEventSubProcessSnapshots with
  | some _ => simp [prepareInternalEnd?, snapshots] at found
  | none =>
      refine ⟨rfl, ?_⟩
      simp only [prepareInternalEnd?, snapshots, Option.isSome_none, Bool.false_eq_true,
        ↓reduceIte] at found
      obtain ⟨selected, selection, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨origin, originFound, found⟩ := Option.bind_eq_some_iff.mp found
      cases control : state.control with
      | running instanceId =>
          simp only [runningInstance?, control, bind, Option.bind] at found
          split at found
          · contradiction
          · next valid =>
              obtain ⟨identity, identityFound, found⟩ := Option.bind_eq_some_iff.mp found
              obtain ⟨delta, deltaFound, found⟩ := Option.bind_eq_some_iff.mp found
              cases found
              refine ⟨selected, origin, instanceId, identity, delta, selection, originFound, rfl, ?_⟩
              simp_all
      | _ => simp [runningInstance?, control] at found

theorem prepareInternalEnd_operation (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (found : prepareInternalEnd? program state operation = some prepared) :
    prepared.operation = operation := by
  obtain ⟨_, selected, _, _, _, _, selection, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation prepared found
  exact selectInternalEnd_operation state operation selected selection

theorem selectInternalEnd_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalEndSelection) (instanceId : SemanticId)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (running : state.control = .running instanceId)
    (found : selectInternalEnd? state operation = some selected) :
    fire? program operation state = some (selected.apply state) := by
  obtain ⟨_, id, origin, rfl, filtered⟩ := selectInternalEnd_facts state operation selected found
  rw [fire_reachNoneEnd_withoutSnapshotDeclaration program state id origin selected.input snapshots]
  simp [reachNoneEndState?, onlyTokenOwner?, tokenOwners, filtered, runningInstance?, running,
    reachNoneEndToken, InternalEndSelection.apply, InternalEndSelection.tokens,
    TokenPatch.apply, removeTokens, addTokens]

theorem prepareInternalEnd_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (found : prepareInternalEnd? program state operation = some prepared) :
    fire? program operation state = some (prepared.selection.apply state) := by
  obtain ⟨snapshots, selected, _, instanceId, _, _, selection, _, running,
    _, _, _, _, _, rfl⟩ := prepareInternalEnd_facts program state operation prepared found
  exact selectInternalEnd_refines program state operation selected instanceId snapshots running selection

/-- End counting is outside the state invariant; token removal uses the existing owned patch law. -/
theorem InternalEndSelection.preserves_runtimeStateWellFormed (program : Program)
    (state : RuntimeState) (selected : InternalEndSelection) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (live : exactLiveOccurrence state selected.owner = true) :
    runtimeStateWellFormed program instanceId (selected.apply state) = true := by
  have tokenValid := selected.tokens.preserves_runtimeStateWellFormed program instanceId state
    valid live (by simp [InternalEndSelection.tokens]) (by simp [InternalEndSelection.tokens])
  exact tokenValid

theorem prepareInternalEnd_preserves_runtimeStateWellFormed (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (instanceId : SemanticId) (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalEnd? program state operation = some prepared) :
    runtimeStateWellFormed program instanceId (prepared.selection.apply state) = true := by
  obtain ⟨_, selected, _, _, _, _, _, _, _, live, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation prepared found
  exact selected.preserves_runtimeStateWellFormed program state instanceId valid live

theorem InternalEndSelection.open_occurrences_frame (program : Program)
    (state : RuntimeState) (selected : InternalEndSelection) (instanceId : SemanticId)
    (running : state.control = .running instanceId) :
    projectOpenFlowNodeOccurrences? program (selected.apply state) =
      projectOpenFlowNodeOccurrences? program state := by
  cases state
  cases running
  rfl

theorem selectInternalEnd_repeated_input_refused (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (owner : ScopeOccurrenceId) :
    selectInternalEnd? { state with tokens := [⟨input, owner⟩, ⟨input, owner⟩] }
      (.reachNoneEnd id origin input) = none := by
  simp [selectInternalEnd?]

end BpmnSemantics.SemanticProcess.InternalCommutation
