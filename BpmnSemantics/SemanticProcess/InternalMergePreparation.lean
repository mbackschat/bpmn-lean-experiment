module

public import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
public import BpmnSemantics.SemanticProcess.InternalTransitionAlternative
public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence

/-! Exact Merge selection reuses owned token patches and publication provenance under the
[complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure InternalMergeSelection where
  operation : SemanticOperation
  owner : ScopeOccurrenceId
  input : ControlPlaceId
  output : ControlPlaceId
  deriving Repr, DecidableEq

def InternalMergeSelection.alternative (selected : InternalMergeSelection) : InternalAlternative :=
  .mergeInput selected.operation.id selected.owner selected.input

def InternalMergeSelection.tokens (selected : InternalMergeSelection) : TokenPatch :=
  { owner := selected.owner, consumed := [selected.input], produced := [selected.output] }

def InternalMergeSelection.apply (state : RuntimeState) (selected : InternalMergeSelection) : RuntimeState :=
  { state with tokens := selected.tokens.apply state.tokens }

def InternalMergeSelection.record (selected : InternalMergeSelection) : InternalTransitionRecord :=
  { operationId := selected.operation.id, operationKind := selected.operation.kind
    origin := selected.operation.origin, owner := selected.owner, mergeInput := some selected.input }

def selectInternalMerge? (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) : Option InternalMergeSelection :=
  match operation, alternative with
  | .mergeExclusive id _ inputs output, .mergeInput selectedId owner input =>
      if id = selectedId ∧ input ∈ inputs ∧ ⟨input, owner⟩ ∈ state.tokens then
        some { operation, owner, input, output }
      else none
  | _, _ => none

/-- An explicit alternative selects one enabled Merge bucket; ordinary alternatives retain the evaluator. -/
def fireInternalAlternative? (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) : Option RuntimeState :=
  match alternative with
  | .operation id => if id = operation.id then fire? program operation state else none
  | .operationOccurrence id owner =>
      if resolveInternalOperationOccurrence? program state ⟨id, owner⟩ == some operation then
        applyInternalOperationOccurrence? program state ⟨id, owner⟩ else none
  | .mergeInput .. =>
      if program.compensationEventSubProcessSnapshots.isSome then none
      else (selectInternalMerge? state operation alternative).map (·.apply state)

@[simp] theorem fireInternalAlternative_operation (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) :
    fireInternalAlternative? program state operation (.operation operation.id) = fire? program operation state := by
  simp [fireInternalAlternative?]

structure PreparedInternalMerge where
  selection : InternalMergeSelection
  runtimeInstanceId : SemanticId
  footprint : InternalTransitionStateFootprint
  publicationTemplate : InternalLocalControlPublicationTemplate
  deriving Repr, DecidableEq

def internalMergeStateFootprint (selected : InternalMergeSelection) (instanceId : SemanticId) :
    InternalTransitionStateFootprint :=
  { reads := canonicalStateAtomSet
      [.runtimeControl instanceId, .scopeOccurrence selected.owner,
       .controlToken selected.owner selected.input, .controlToken selected.owner selected.output,
       .logicalTime]
    writes := canonicalStateAtomSet (tokenPatchWriteAtoms selected.tokens) }

def makeInternalMergePreparation (state : RuntimeState) (selected : InternalMergeSelection)
    (instanceId : SemanticId) (identity : FlowNodeIdentity) (delta : PublicControlPositionDelta) :
    PreparedInternalMerge :=
  { selection := selected, runtimeInstanceId := instanceId
    footprint := internalMergeStateFootprint selected instanceId
    publicationTemplate :=
      { operation := selected.operation, identity
        logicalTimeMs := state.logicalTimeMs, positionDelta := delta } }

def prepareInternalMerge? (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) : Option PreparedInternalMerge := do
  if program.compensationEventSubProcessSnapshots.isSome then none
  else
    let selected ← selectInternalMerge? state operation alternative
    let instanceId ← runningInstance? state
    if !exactLiveOccurrence state selected.owner || operation.origin.elementId.value = "" ||
        !SemanticProcessJson.isSafeWireNat state.logicalTimeMs ||
        !internalLocalControlTokensAvailable state selected.tokens then none
    else
      let identity ← candidateOperationFlowNodeIdentity? program operation
        selected.owner selected.owner operation.origin.elementId
      let delta ← internalLocalControlPositionDelta? program selected.tokens
      pure (makeInternalMergePreparation state selected instanceId identity delta)

def applyPreparedInternalMerge? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalMerge) : Option RuntimeState :=
  if prepareInternalMerge? program state prepared.selection.operation prepared.selection.alternative =
      some prepared then some (prepared.selection.apply state)
  else none

theorem selectInternalMerge_facts (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) (selected : InternalMergeSelection)
    (found : selectInternalMerge? state operation alternative = some selected) :
    selected.operation = operation ∧ selected.alternative = alternative ∧
      ∃ id origin inputs, operation = .mergeExclusive id origin inputs selected.output ∧
        selected.input ∈ inputs ∧ ⟨selected.input, selected.owner⟩ ∈ state.tokens := by
  cases operation with
  | mergeExclusive id origin inputs output =>
      cases alternative with
      | operation _ => simp [selectInternalMerge?] at found
      | operationOccurrence _ _ => simp [selectInternalMerge?] at found
      | mergeInput selectedId owner input =>
          simp only [selectInternalMerge?] at found
          split at found
          · next valid =>
              cases found
              exact ⟨rfl, by simp [InternalMergeSelection.alternative, SemanticOperation.id, valid.1],
                id, origin, inputs, rfl, valid.2⟩
          · contradiction
  | _ => cases alternative <;> simp [selectInternalMerge?] at found

/-- Selection implements the declarative Merge relation, including offers outside the legacy unique subset. -/
theorem selectInternalMerge_refines (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) (selected : InternalMergeSelection)
    (found : selectInternalMerge? state operation alternative = some selected) :
    ∃ id origin inputs, operation = .mergeExclusive id origin inputs selected.output ∧
      MergeExclusiveStep state inputs selected.output (selected.apply state) := by
  obtain ⟨_, _, id, origin, inputs, operationEq, input, present⟩ :=
    selectInternalMerge_facts state operation alternative selected found
  refine ⟨id, origin, inputs, operationEq, ?_⟩
  simpa [InternalMergeSelection.apply, InternalMergeSelection.tokens, TokenPatch.apply,
    removeTokens, addTokens] using
    mergeExclusiveStep_of_offered_token state inputs selected.output
      ⟨selected.input, selected.owner⟩ present input

theorem prepareInternalMerge_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (found : prepareInternalMerge? program state operation alternative = some prepared) :
    program.compensationEventSubProcessSnapshots = none ∧
      ∃ selected instanceId identity delta,
        selectInternalMerge? state operation alternative = some selected ∧
        state.control = .running instanceId ∧ exactLiveOccurrence state selected.owner = true ∧
        operation.origin.elementId.value ≠ "" ∧
        SemanticProcessJson.isSafeWireNat state.logicalTimeMs = true ∧
        internalLocalControlTokensAvailable state selected.tokens = true ∧
        candidateOperationFlowNodeIdentity? program operation selected.owner selected.owner
          operation.origin.elementId = some identity ∧
        internalLocalControlPositionDelta? program selected.tokens = some delta ∧
        prepared = makeInternalMergePreparation state selected instanceId identity delta := by
  cases snapshots : program.compensationEventSubProcessSnapshots with
  | some _ => simp [prepareInternalMerge?, snapshots] at found
  | none =>
      refine ⟨rfl, ?_⟩
      simp only [prepareInternalMerge?, snapshots, Option.isSome_none, Bool.false_eq_true,
        ↓reduceIte] at found
      obtain ⟨selected, selection, found⟩ := Option.bind_eq_some_iff.mp found
      cases control : state.control with
      | running instanceId =>
          simp only [runningInstance?, control, bind, Option.bind] at found
          split at found
          · contradiction
          · next valid =>
              obtain ⟨identity, identityFound, found⟩ := Option.bind_eq_some_iff.mp found
              obtain ⟨delta, deltaFound, found⟩ := Option.bind_eq_some_iff.mp found
              cases found
              refine ⟨selected, instanceId, identity, delta, selection, rfl, ?_⟩
              simp_all
      | _ => simp [runningInstance?, control] at found

theorem prepareInternalMerge_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (found : prepareInternalMerge? program state operation alternative = some prepared) :
    fireInternalAlternative? program state operation alternative = some (prepared.selection.apply state) := by
  obtain ⟨snapshots, selected, hosting, identity, delta, selection, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  have shape := (selectInternalMerge_facts state operation alternative selected selection).2.1
  cases alternative with
  | operation _ => simp [InternalMergeSelection.alternative] at shape
  | operationOccurrence _ _ => simp [InternalMergeSelection.alternative] at shape
  | mergeInput _ _ _ => simp [fireInternalAlternative?, snapshots, selection, makeInternalMergePreparation]

theorem selectInternalMerge_read_frame (before after : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (selected : InternalMergeSelection)
    (found : selectInternalMerge? before operation alternative = some selected)
    (bucket : after.tokens.filter (fun token =>
      decide (token.placeId = selected.input && token.owner = selected.owner)) =
      before.tokens.filter (fun token =>
        decide (token.placeId = selected.input && token.owner = selected.owner))) :
    selectInternalMerge? after operation alternative = some selected := by
  obtain ⟨operationEq, alternativeEq, id, origin, inputs, shape, offered, present⟩ :=
    selectInternalMerge_facts before operation alternative selected found
  have afterPresent : ⟨selected.input, selected.owner⟩ ∈ after.tokens := by
    have filtered : ⟨selected.input, selected.owner⟩ ∈ before.tokens.filter (fun token =>
        decide (token.placeId = selected.input && token.owner = selected.owner)) := by
      simp [present]
    rw [← bucket] at filtered
    exact (List.mem_filter.mp filtered).1
  rw [← alternativeEq, shape]
  have selectedShape := operationEq.trans shape
  cases selected
  simp_all [selectInternalMerge?, InternalMergeSelection.alternative, SemanticOperation.id]
  rw [← alternativeEq]
  simp [offered, afterPresent]


end BpmnSemantics.SemanticProcess.InternalCommutation
