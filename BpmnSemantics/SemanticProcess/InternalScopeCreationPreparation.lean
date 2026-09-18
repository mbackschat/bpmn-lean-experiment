import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionDelta
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation

/-! Complete predecessor preparations for ordinary child entry and Call invocation under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure InternalScopeCreationPublicationTemplate where
  operation : SemanticOperation
  logicalTimeMs : Nat
  positionDelta : PublicControlPositionDelta
  lifecycle : UnnumberedFlowNodeOccurrenceDelta
  deriving Repr, DecidableEq

structure PreparedInternalScopeCreation where
  selection : InternalScopeCreationSelection
  runtimeInstanceId : SemanticId
  footprint : InternalTransitionStateFootprint
  publicationTemplate : InternalScopeCreationPublicationTemplate
  deriving Repr, DecidableEq

def internalScopeCreationOrigin? : SemanticOperation → Option BpmnElementOrigin
  | .enterScope _ origin _ _ _ | .invokeProcess _ origin _ _ _ _ _ => some origin
  | _ => none

/-- Identity populations are checked before any parent or origin payload can select an alias. -/
def internalScopeCreationDefinitionsExact (program : Program) : Bool :=
  program.definitionScopes.all fun definition =>
    definition.id.value ≠ "" && definition.originElementId.value ≠ "" &&
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.id = definition.id)).length = 1 &&
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = definition.originElementId)).length = 1

def internalScopeCreationDefinitionMatches (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (definition : DefinitionScope) : Bool :=
  match operation with
  | .enterScope _ origin _ _ scope =>
      definition.id = scope && definition.parentScopeId = some owner.definitionScopeId &&
        definition.originElementId = origin.elementId
  | .invokeProcess _ _ _ process scope _ _ =>
      definition.id = scope && definition.parentScopeId = none &&
        definition.originElementId.value = process.value
  | _ => false

def internalScopeCreationCounterSafe (state : RuntimeState)
    (selected : InternalScopeCreationSelection) : Bool :=
  let (population, previous, next) := match selected.kind with
    | .child =>
        ((state.scopeActivations.filter fun row =>
          decide (row.scopeId = selected.created.id.definitionScopeId)).length,
         scopeActivationCount state selected.created.id.definitionScopeId,
         selected.created.id.activation)
    | .called record =>
        ((state.callActivations.filter fun row =>
          decide (row.elementId.value = record.id.elementId.value)).length,
         callActivationCount state ⟨record.id.elementId.value⟩, record.id.activation)
  population ≤ 1 && SemanticProcessJson.isSafeWireNat previous &&
    SemanticProcessJson.isSafeWireNat (previous + 1) && next = previous + 1

def internalScopeCreationTokensAvailable (state : RuntimeState)
    (selected : InternalScopeCreationSelection) : Bool :=
  let owned := (state.tokens.filter fun token =>
    decide (token.placeId = selected.input && token.owner = selected.owner)).length
  0 < owned && SemanticProcessJson.isSafeWireNat owned &&
    !(state.tokens.any fun token =>
      decide (token.placeId = selected.entry && token.owner = selected.created.id))

def internalScopeCreationPredecessorChecks (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (origin : BpmnElementOrigin) (definition : DefinitionScope) : Bool :=
  internalScopeCreationDefinitionsExact program &&
    internalScopeCreationDefinitionMatches operation selected.owner definition &&
    selected.owner.activation > 0 && SemanticProcessJson.isSafeWireNat selected.owner.activation &&
    selected.owner.processInstanceId.value ≠ "" && origin.elementId.value ≠ "" &&
    SemanticProcessJson.isSafeWireNat state.logicalTimeMs &&
    internalScopeCreationCounterSafe state selected &&
    internalScopeCreationTokensAvailable state selected

def internalScopeCreationStart? (program : Program)
    (selected : InternalScopeCreationSelection) : Option UnnumberedFlowNodeOccurrenceStart :=
  match selected.kind with
  | .child => candidateScopeStart? program selected.operation selected.owner selected.created
  | .called record => candidateCallStart? program selected.operation selected.owner record

def internalScopeCreationCreationAtoms (selected : InternalScopeCreationSelection) :
    List InternalStateAtom :=
  [.scopeOccurrence selected.created.id, .scopeParent selected.created.id selected.created.parent] ++
    match selected.kind with
    | .child => [.activation .scope ⟨selected.created.id.definitionScopeId.value⟩]
    | .called record =>
        [.activation .call ⟨record.id.elementId.value⟩, .callAssociation record]

def internalScopeCreationStateFootprint (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (ownerRecord : RuntimeScopeOccurrence) :
    InternalTransitionStateFootprint :=
  let buckets := [.controlToken selected.owner selected.input,
                  .controlToken selected.created.id selected.entry]
  let creation := internalScopeCreationCreationAtoms selected
  { reads := canonicalStateAtomSet
      ([.tokenOwners selected.input, .runtimeControl instanceId, .scopeOccurrence selected.owner,
        .scopeParent selected.owner ownerRecord.parent] ++ buckets ++ creation ++ [.logicalTime])
    writes := canonicalStateAtomSet
      ([.tokenOwners selected.input, .tokenOwners selected.entry] ++ buckets ++ creation) }

def makeInternalScopeCreationPreparation (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (instanceId : SemanticId)
    (ownerRecord : RuntimeScopeOccurrence) (start : UnnumberedFlowNodeOccurrenceStart)
    (delta : PublicControlPositionDelta) : PreparedInternalScopeCreation :=
  { selection := selected, runtimeInstanceId := instanceId
    footprint := internalScopeCreationStateFootprint selected instanceId ownerRecord
    publicationTemplate :=
      { operation := selected.operation, logicalTimeMs := state.logicalTimeMs, positionDelta := delta
        lifecycle := { started := [start], ended := [] } } }

def prepareInternalScopeCreation? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalScopeCreation := do
  let selected ← selectInternalScopeCreation? state operation
  let instanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  if program.compensationEventSubProcessSnapshots ≠ none then none
  else if program.operations.filter (fun candidate => decide (candidate.id = operation.id)) ≠
      [operation] then none
  else
    let ownerRecord ← match state.scopeOccurrences.filter fun candidate =>
        decide (candidate.id = selected.owner) with
      | [record] => some record
      | _ => none
    let origin ← internalScopeCreationOrigin? operation
    let definition ← definitionScope? program selected.created.id.definitionScopeId
    if !internalScopeCreationPredecessorChecks program state operation selected origin definition
      then none
    else
      let start ← internalScopeCreationStart? program selected
      let delta ← internalScopeCreationPositionDelta? program selected
      some (makeInternalScopeCreationPreparation state selected instanceId ownerRecord start delta)

def applyPreparedInternalScopeCreation? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalScopeCreation) : Option RuntimeState :=
  if prepareInternalScopeCreation? program state prepared.selection.operation = some prepared then
    some (prepared.selection.apply state)
  else none

theorem prepareInternalScopeCreation_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    ∃ selected instanceId ownerRecord origin definition start delta,
      selectInternalScopeCreation? state operation = some selected ∧
      state.control = .running instanceId ∧
      program.compensationEventSubProcessSnapshots = none ∧
      program.operations.filter (fun candidate => decide (candidate.id = operation.id)) =
        [operation] ∧
      state.scopeOccurrences.filter (fun candidate => decide (candidate.id = selected.owner)) =
        [ownerRecord] ∧
      internalScopeCreationOrigin? operation = some origin ∧
      definitionScope? program selected.created.id.definitionScopeId = some definition ∧
      internalScopeCreationPredecessorChecks program state operation selected origin definition = true ∧
      internalScopeCreationStart? program selected = some start ∧
      internalScopeCreationPositionDelta? program selected = some delta ∧
      prepared = makeInternalScopeCreationPreparation state selected instanceId ownerRecord start delta := by
  unfold prepareInternalScopeCreation? at found
  obtain ⟨selected, selection, found⟩ := Option.bind_eq_some_iff.mp found
  cases control : state.control with
  | running instanceId =>
      simp only [control, bind, Option.bind] at found
      split at found
      · contradiction
      · split at found
        · contradiction
        · split at found
          · next ownerRecord ownerExact =>
              obtain ⟨origin, originFound, found⟩ := Option.bind_eq_some_iff.mp found
              obtain ⟨definition, definitionFound, found⟩ := Option.bind_eq_some_iff.mp found
              split at found
              · contradiction
              · obtain ⟨start, startFound, found⟩ := Option.bind_eq_some_iff.mp found
                obtain ⟨delta, deltaFound, found⟩ := Option.bind_eq_some_iff.mp found
                cases found
                refine ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
                  selection, rfl, ?_, ?_, ownerExact, originFound, definitionFound, ?_,
                  startFound, deltaFound, rfl⟩ <;> simp_all
          · contradiction
  | _ => simp [control] at found

theorem internalScopeCreationPredecessorChecks_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (origin : BpmnElementOrigin) (definition : DefinitionScope)
    (checked : internalScopeCreationPredecessorChecks
      program state operation selected origin definition = true) :
    internalScopeCreationDefinitionsExact program = true ∧
      internalScopeCreationDefinitionMatches operation selected.owner definition = true ∧
      selected.owner.activation > 0 ∧
      SemanticProcessJson.isSafeWireNat selected.owner.activation = true ∧
      selected.owner.processInstanceId.value ≠ "" ∧ origin.elementId.value ≠ "" ∧
      SemanticProcessJson.isSafeWireNat state.logicalTimeMs = true ∧
      internalScopeCreationCounterSafe state selected = true ∧
      internalScopeCreationTokensAvailable state selected = true := by
  simpa only [internalScopeCreationPredecessorChecks, Bool.and_eq_true,
    decide_eq_true_eq, and_assoc] using checked

theorem internalScopeCreationDefinitionsExact_facts (program : Program)
    (definition : DefinitionScope)
    (checked : internalScopeCreationDefinitionsExact program = true)
    (member : definition ∈ program.definitionScopes) :
    definition.id.value ≠ "" ∧ definition.originElementId.value ≠ "" ∧
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.id = definition.id)).length = 1 ∧
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = definition.originElementId)).length = 1 := by
  have exactDefinition := List.all_eq_true.mp checked definition member
  simpa only [Bool.and_eq_true, decide_eq_true_eq, and_assoc] using exactDefinition

theorem internalScopeCreationCounterSafe_child_facts (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (child : selected.kind = .child)
    (checked : internalScopeCreationCounterSafe state selected = true) :
    (state.scopeActivations.filter fun row =>
      decide (row.scopeId = selected.created.id.definitionScopeId)).length ≤ 1 ∧
      SemanticProcessJson.isSafeWireNat
        (scopeActivationCount state selected.created.id.definitionScopeId) = true ∧
      SemanticProcessJson.isSafeWireNat
        (scopeActivationCount state selected.created.id.definitionScopeId + 1) = true ∧
      selected.created.id.activation =
        scopeActivationCount state selected.created.id.definitionScopeId + 1 := by
  simpa only [internalScopeCreationCounterSafe, child, Bool.and_eq_true,
    decide_eq_true_eq, and_assoc] using checked

theorem internalScopeCreationCounterSafe_call_facts (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (record : CalledProcessOccurrence)
    (called : selected.kind = .called record)
    (checked : internalScopeCreationCounterSafe state selected = true) :
    (state.callActivations.filter fun row =>
      decide (row.elementId.value = record.id.elementId.value)).length ≤ 1 ∧
      SemanticProcessJson.isSafeWireNat
        (callActivationCount state ⟨record.id.elementId.value⟩) = true ∧
      SemanticProcessJson.isSafeWireNat
        (callActivationCount state ⟨record.id.elementId.value⟩ + 1) = true ∧
      record.id.activation = callActivationCount state ⟨record.id.elementId.value⟩ + 1 := by
  simpa only [internalScopeCreationCounterSafe, called, Bool.and_eq_true,
    decide_eq_true_eq, and_assoc] using checked

theorem internalScopeCreationTokensAvailable_facts (state : RuntimeState)
    (selected : InternalScopeCreationSelection)
    (checked : internalScopeCreationTokensAvailable state selected = true) :
    0 < (state.tokens.filter fun token =>
      decide (token.placeId = selected.input && token.owner = selected.owner)).length ∧
      SemanticProcessJson.isSafeWireNat (state.tokens.filter fun token =>
        decide (token.placeId = selected.input && token.owner = selected.owner)).length = true ∧
      (state.tokens.any fun token =>
        decide (token.placeId = selected.entry && token.owner = selected.created.id)) = false := by
  simpa [internalScopeCreationTokensAvailable, and_assoc] using checked

theorem prepareInternalScopeCreation_operation (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    prepared.selection.operation = operation ∧ prepared.publicationTemplate.operation = operation := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  have exactOperation := selectInternalScopeCreation_operation state operation selected selection
  exact ⟨exactOperation, exactOperation⟩

/-- The predecessor check discharges the snapshot exclusion required by retained-patch refinement. -/
theorem prepareInternalScopeCreation_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    fire? program operation state = some (prepared.selection.apply state) := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, _, snapshots, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  exact selectInternalScopeCreation_refines program state operation selected snapshots selection

theorem applyPreparedInternalScopeCreation_of_preparation (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    applyPreparedInternalScopeCreation? program state prepared =
      some (prepared.selection.apply state) := by
  have operationExact := (prepareInternalScopeCreation_operation program state operation prepared found).1
  simp [applyPreparedInternalScopeCreation?, operationExact, found]

theorem applyPreparedInternalScopeCreation_altered_publication_time_refused
    (program : Program) (state : RuntimeState) (prepared : PreparedInternalScopeCreation)
    (altered : prepared.publicationTemplate.logicalTimeMs ≠ state.logicalTimeMs) :
    applyPreparedInternalScopeCreation? program state prepared = none := by
  unfold applyPreparedInternalScopeCreation?
  split
  · next found =>
      obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
        _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
          prepareInternalScopeCreation_facts program state prepared.selection.operation prepared found
      exact False.elim (altered rfl)
  · rfl

theorem prepareInternalScopeCreation_snapshots_refused (program : Program) (state : RuntimeState)
    (operation : SemanticOperation)
    (snapshots : program.compensationEventSubProcessSnapshots ≠ none) :
    prepareInternalScopeCreation? program state operation = none := by
  cases found : prepareInternalScopeCreation? program state operation with
  | none => rfl
  | some prepared =>
      obtain ⟨_, _, _, _, _, _, _, _, _, absent, _⟩ :=
        prepareInternalScopeCreation_facts program state operation prepared found
      exact False.elim (snapshots absent)

/-- A mismatching parent or origin does not hide a second declaration with the selected identity. -/
theorem prepareInternalScopeCreation_definition_alias_refused (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (definition : DefinitionScope) (otherParent : Option DefinitionScopeId) (otherOrigin : NodeId)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (identity : selected.created.id.definitionScopeId = definition.id)
    (definitions : program.definitionScopes =
      [definition, { definition with parentScopeId := otherParent, originElementId := otherOrigin }]) :
    prepareInternalScopeCreation? program state operation = none := by
  cases found : prepareInternalScopeCreation? program state operation with
  | none => rfl
  | some prepared =>
      obtain ⟨actual, _, _, _, declared, _, _, actualSelected, _, _, _, _, _, definitionFound, _⟩ :=
        prepareInternalScopeCreation_facts program state operation prepared found
      rw [selection] at actualSelected
      cases actualSelected
      simp [definitionScope?, definitions, identity] at definitionFound

theorem prepareInternalScopeCreation_owner_alias_refused (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (owner : RuntimeScopeOccurrence) (otherParent : Option ScopeOccurrenceId)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (identity : selected.owner = owner.id)
    (owners : state.scopeOccurrences = [owner, { owner with parent := otherParent }]) :
    prepareInternalScopeCreation? program state operation = none := by
  cases found : prepareInternalScopeCreation? program state operation with
  | none => rfl
  | some prepared =>
      obtain ⟨actual, _, record, _, _, _, _, actualSelected, _, _, _, ownerFound, _⟩ :=
        prepareInternalScopeCreation_facts program state operation prepared found
      rw [selection] at actualSelected
      cases actualSelected
      simp [owners, identity] at ownerFound

end BpmnSemantics.SemanticProcess.InternalCommutation
