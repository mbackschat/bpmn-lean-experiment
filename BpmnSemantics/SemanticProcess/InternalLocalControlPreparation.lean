import BpmnSemantics.SemanticProcess.InternalLocalControlSelection
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import BpmnSemantics.WireNatural

/-! Complete predecessor preparations for the five local-control families in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure InternalTransitionStateFootprint where
  reads : List InternalStateAtom
  writes : List InternalStateAtom
  deriving Repr, DecidableEq

/-- Instantaneous local-control lifecycle entries share one transition anchor supplied only when
the batch assigns indices; the selected account forbids numbering predecessor templates. -/
structure InternalLocalControlPublicationTemplate where
  operation : SemanticOperation
  identity : FlowNodeIdentity
  logicalTimeMs : Nat
  positionDelta : PublicControlPositionDelta
  deriving Repr, DecidableEq

structure PreparedInternalLocalControl where
  selection : InternalLocalControlSelection
  runtimeInstanceId : SemanticId
  footprint : InternalTransitionStateFootprint
  publicationTemplate : InternalLocalControlPublicationTemplate
  deriving Repr, DecidableEq

def PreparedInternalLocalControl.operation (prepared : PreparedInternalLocalControl) :
    SemanticOperation := prepared.selection.operation

def InternalLocalControlPublicationTemplate.lifecycle
    (template : InternalLocalControlPublicationTemplate) (commandId : SemanticId)
    (transitionIndex : Nat) : UnnumberedFlowNodeOccurrenceDelta :=
  let anchor := SemanticFlowNodeOccurrenceAnchor.transition commandId transitionIndex 0
  { started :=
      [{ anchor, processId := template.identity.processId
         elementId := template.identity.elementId, owner := template.identity.owner }]
    ended := [{ anchor, terminal := .completed }] }

def internalLocalControlOrigin? : SemanticOperation → Option BpmnElementOrigin
  | .duplicate _ origin _ _ | .synchronize _ origin _ _ | .choose _ origin _ _ _ _
  | .selectMany _ origin _ _ _ _ | .synchronizeSelected _ origin _ _ _ => some origin
  | _ => none

/-- Unit availability precedes saturating Nat subtraction, and the wire bound applies to each
complete bucket before and after movement under the shared wire-integer contract. -/
def internalLocalControlTokensAvailable (state : RuntimeState) (patch : TokenPatch) : Bool :=
  (patch.consumed ++ patch.produced).all fun place =>
    let owned := (state.tokens.filter fun token =>
      decide (token.placeId = place && token.owner = patch.owner)).length
    let consumed := patch.consumed.count place
    let produced := patch.produced.count place
    consumed ≤ owned && SemanticProcessJson.isSafeWireNat owned &&
      SemanticProcessJson.isSafeWireNat (owned - consumed + produced)

def internalLocalControlRecordAvailable (state : RuntimeState) :
    InternalSelectedBranchPatch → Bool
  | .preserve => true
  | .insert record => !(state.selectedBranchSets.any fun candidate =>
      decide (candidate.owner = record.owner && candidate.selectionKey = record.selectionKey))
  | .remove record => decide (state.selectedBranchSets.filter (fun candidate =>
      decide (candidate.owner = record.owner && candidate.selectionKey = record.selectionKey)) = [record])

def internalLocalControlExtraReads (state : RuntimeState) (selected : InternalLocalControlSelection) :
    List InternalStateAtom :=
  selected.variableReads.map InternalStateAtom.processVariable ++
    match selected.selectedBranch with
    | .preserve => []
    | .insert record => [.selectedBranch record.owner record.selectionKey]
    | .remove record => selectedJoinReadAtoms state record.selectionKey

def internalLocalControlExtraWrites (selected : InternalLocalControlSelection) :
    List InternalStateAtom :=
  match selected.selectedBranch with
  | .preserve => []
  | .insert record | .remove record => selectedBranchWriteAtoms record.owner record.selectionKey

def internalLocalControlStateFootprint (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId) :
    InternalTransitionStateFootprint :=
  { reads := canonicalStateAtomSet
      (selected.censusReads.map InternalStateAtom.tokenOwners ++
        [.runtimeControl instanceId, .scopeOccurrence selected.owner] ++
        (selected.tokens.consumed ++ selected.tokens.produced).map
          (InternalStateAtom.controlToken selected.owner) ++
        internalLocalControlExtraReads state selected ++ [.logicalTime])
    writes := canonicalStateAtomSet
      (tokenPatchWriteAtoms selected.tokens ++ internalLocalControlExtraWrites selected) }

def makeInternalLocalControlPreparation (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (identity : FlowNodeIdentity) (delta : PublicControlPositionDelta) :
    PreparedInternalLocalControl :=
  { selection := selected, runtimeInstanceId := instanceId
    footprint := internalLocalControlStateFootprint state selected instanceId
    publicationTemplate :=
      { operation := selected.operation, identity, logicalTimeMs := state.logicalTimeMs
        positionDelta := delta } }

def prepareInternalLocalControl? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalLocalControl := do
  let selected ← selectInternalLocalControl? state operation
  let origin ← internalLocalControlOrigin? operation
  let instanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  if !exactLiveOccurrence state selected.owner || origin.elementId.value = "" ||
      !SemanticProcessJson.isSafeWireNat state.logicalTimeMs ||
      !internalLocalControlTokensAvailable state selected.tokens ||
      !internalLocalControlRecordAvailable state selected.selectedBranch then none
  else
    let identity ← candidateOperationFlowNodeIdentity? program operation
      selected.owner selected.owner origin.elementId
    let delta ← internalLocalControlPositionDelta? program selected.tokens
    some (makeInternalLocalControlPreparation state selected instanceId identity delta)

def applyPreparedInternalLocalControl? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalLocalControl) : Option RuntimeState :=
  if prepareInternalLocalControl? program state prepared.selection.operation = some prepared then
    some (prepared.selection.apply state)
  else none

theorem prepareInternalLocalControl_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    ∃ selected origin instanceId identity delta,
      selectInternalLocalControl? state operation = some selected ∧
      internalLocalControlOrigin? operation = some origin ∧
      state.control = .running instanceId ∧
      exactLiveOccurrence state selected.owner = true ∧
      origin.elementId.value ≠ "" ∧
      SemanticProcessJson.isSafeWireNat state.logicalTimeMs = true ∧
      internalLocalControlTokensAvailable state selected.tokens = true ∧
      internalLocalControlRecordAvailable state selected.selectedBranch = true ∧
      candidateOperationFlowNodeIdentity? program operation
        selected.owner selected.owner origin.elementId = some identity ∧
      internalLocalControlPositionDelta? program selected.tokens = some delta ∧
      prepared = makeInternalLocalControlPreparation state selected instanceId identity delta := by
  unfold prepareInternalLocalControl? at found
  obtain ⟨selected, selection, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨origin, originFound, found⟩ := Option.bind_eq_some_iff.mp found
  cases control : state.control with
  | running instanceId =>
      simp only [control, bind, Option.bind] at found
      split at found
      · contradiction
      · next valid =>
          obtain ⟨identity, identityFound, found⟩ := Option.bind_eq_some_iff.mp found
          obtain ⟨delta, deltaFound, found⟩ := Option.bind_eq_some_iff.mp found
          cases found
          refine ⟨selected, origin, instanceId, identity, delta, selection, originFound, rfl, ?_⟩
          simp_all
  | _ => simp [control] at found

/-- Selection refinement realizes the complete retained preparation; snapshot-declaring execution
remains outside the selected local-control batch boundary. -/
theorem prepareInternalLocalControl_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    fire? program operation state = some (prepared.selection.apply state) := by
  obtain ⟨selected, origin, instanceId, identity, delta, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation prepared found
  exact selectInternalLocalControl_refines program state operation selected snapshots selection

theorem applyPreparedInternalLocalControl_altered_publication_time_refused
    (program : Program) (state : RuntimeState) (prepared : PreparedInternalLocalControl)
    (altered : prepared.publicationTemplate.logicalTimeMs ≠ state.logicalTimeMs) :
    applyPreparedInternalLocalControl? program state prepared = none := by
  unfold applyPreparedInternalLocalControl?
  split
  · next found =>
      obtain ⟨selected, origin, instanceId, identity, delta, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
        prepareInternalLocalControl_facts program state prepared.selection.operation prepared found
      exact False.elim (altered rfl)
  · rfl

theorem localControlAvailability_repeated_consumption_refused (state : RuntimeState)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId) :
    internalLocalControlTokensAvailable
      { state with tokens := [⟨input, owner⟩] }
      { owner, consumed := [input, input], produced := [output] } = false := by
  simp [internalLocalControlTokensAvailable]

theorem localControlAvailability_repeated_production_retained (state : RuntimeState)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    internalLocalControlTokensAvailable
      { state with tokens := [⟨place, owner⟩] }
      { owner, consumed := [place], produced := [place, place] } = true := by
  simp [internalLocalControlTokensAvailable, SemanticProcessJson.isSafeWireNat,
    SemanticProcessJson.maxSafeWireNat]

theorem localControlRecordAvailability_same_key_other_inputs_refused (state : RuntimeState)
    (record : SelectedBranchSet) (otherInputs : List ControlPlaceId) :
    internalLocalControlRecordAvailable
      { state with selectedBranchSets := [record, { record with expectedInputs := otherInputs }] }
      (.remove record) = false := by
  simp [internalLocalControlRecordAvailable]

end BpmnSemantics.SemanticProcess.InternalCommutation
