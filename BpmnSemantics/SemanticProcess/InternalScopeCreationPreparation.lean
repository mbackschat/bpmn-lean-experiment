module

public import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionDelta
public import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
meta import BpmnSemantics.PrivateEquationLemmas

/-! Complete predecessor preparations for ordinary child entry and Call invocation under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). The preparation is the
entry's control, TypeScript's `deriveInternalEnterScopeControl`: it also succeeds for a child that
declares locals, whose frame the declared-entry family adds (CSD-PREPARE-01), so the ordinary family
admits it only with `internalScopeCreationUndeclared`.
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`InternalCommutation.internalScopeCreationRetentionUnchanged,
  `definitionScope?]

public section

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
  | .enterScope _ origin _ _ _ | .invokeProcess _ origin _ _ _ _ _ _ => some origin
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
  | .invokeProcess _ _ _ process scope _ _ .empty =>
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
  internalScopeCreationRetentionUnchanged program operation &&
    (internalScopeCreationDefinitionsExact program &&
    internalScopeCreationDefinitionMatches operation selected.owner definition &&
    selected.owner.activation > 0 && SemanticProcessJson.isSafeWireNat selected.owner.activation &&
    selected.owner.processInstanceId.value ≠ "" && origin.elementId.value ≠ "" &&
    SemanticProcessJson.isSafeWireNat state.logicalTimeMs &&
    internalScopeCreationCounterSafe state selected &&
    internalScopeCreationTokensAvailable state selected)

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

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.InternalCommutation #[`prepareInternalScopeCreation?]

def applyPreparedInternalScopeCreation? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalScopeCreation) : Option RuntimeState :=
  if prepareInternalScopeCreation? program state prepared.selection.operation = some prepared then
    some (prepared.selection.apply state)
  else none

run_meta privateEquations `BpmnSemantics.SemanticProcess.InternalCommutation #[`applyPreparedInternalScopeCreation?,
  `internalScopeCreationCounterSafe, `internalScopeCreationPredecessorChecks, `internalScopeCreationTokensAvailable]

/-- CSD-PREPARE-01: the declared entry of an ordinary Sub-Process, the unchanged entry `control` plus the
frame evaluated against the predecessor. Every law over the control stays as it is; the composition adds
one frame insertion that changes only `variables.scopes`. -/
structure PreparedInternalDeclaredEntry where
  control : PreparedInternalScopeCreation
  frame : ScopeVariableScope
  footprint : InternalTransitionStateFootprint
  deriving Repr, DecidableEq

def internalDeclaredEntryInputNames (record : ScopeLocalData) : List String :=
  enclosingInputNames record.localInputs

/-- The control footprint plus what the frame evaluation consults: each chain link's liveness and parent,
each consulted frame, each fall-through Process name, and the absence of the child's frame, which the
entry then writes. -/
def internalDeclaredEntryFootprint (control : PreparedInternalScopeCreation) (reads : NestedScopeData.ReadSet) :
    InternalTransitionStateFootprint :=
  let written : InternalStateAtom := .scopeVariableScope control.selection.created.id
  { reads := canonicalStateAtomSet (control.footprint.reads ++ nestedScopeReadAtoms reads ++
      reads.processNames.map .processVariable ++ [written])
    writes := canonicalStateAtomSet (control.footprint.writes ++ [written]) }

def prepareInternalDeclaredEntry? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalDeclaredEntry := do
  let .enterScope _ _ _ _ scope := operation | none
  let record ← NestedScopeData.recordFor? program scope
  let control ← prepareInternalScopeCreation? program state operation
  let frame ← NestedScopeData.evaluateFrame? program state record control.selection.created.id
    control.selection.owner
  let reads ← NestedScopeData.readSet? state.scopeOccurrences state.variables.scopes control.selection.owner (internalDeclaredEntryInputNames record)
  some { control, frame, footprint := internalDeclaredEntryFootprint control reads }

def PreparedInternalDeclaredEntry.apply (prepared : PreparedInternalDeclaredEntry) (state : RuntimeState) :
    RuntimeState :=
  let entered := prepared.control.selection.apply state
  { entered with variables := NestedScopeData.insertFrame entered.variables prepared.frame }

theorem PreparedInternalDeclaredEntry.apply_eq (prepared : PreparedInternalDeclaredEntry) (state : RuntimeState) :
    prepared.apply state =
      { prepared.control.selection.apply state with
        variables := NestedScopeData.insertFrame (prepared.control.selection.apply state).variables prepared.frame } := by
  unfold PreparedInternalDeclaredEntry.apply
  rfl

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

theorem prepareInternalDeclaredEntry_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalDeclaredEntry)
    (found : prepareInternalDeclaredEntry? program state operation = some prepared) :
    ∃ id origin input entry scope record reads,
      operation = .enterScope id origin input entry scope ∧
      NestedScopeData.recordFor? program scope = some record ∧
      prepareInternalScopeCreation? program state operation = some prepared.control ∧
      NestedScopeData.evaluateFrame? program state record prepared.control.selection.created.id
        prepared.control.selection.owner = some prepared.frame ∧
      NestedScopeData.readSet? state.scopeOccurrences state.variables.scopes prepared.control.selection.owner
        (internalDeclaredEntryInputNames record) = some reads ∧
      prepared.footprint = internalDeclaredEntryFootprint prepared.control reads := by
  unfold prepareInternalDeclaredEntry? at found
  cases operation with
  | enterScope id origin input entry scope =>
      simp only [Option.bind_eq_bind, Option.bind_eq_some_iff, Option.some.injEq] at found
      obtain ⟨record, recorded, control, controlFound, frame, framed, reads, read, rfl⟩ := found
      exact ⟨id, origin, input, entry, scope, record, reads, rfl, recorded, controlFound, framed, read, rfl⟩
  | _ => simp at found

/-- The converse of `prepareInternalDeclaredEntry_facts`: a state on which the control, the frame and the
read set evaluate as before prepares the same entry. -/
theorem prepareInternalDeclaredEntry_of_facts (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalDeclaredEntry) (id : OperationId) (origin : BpmnElementOrigin)
    (input entry : ControlPlaceId) (scope : DefinitionScopeId) (record : ScopeLocalData)
    (reads : NestedScopeData.ReadSet)
    (recorded : NestedScopeData.recordFor? program scope = some record)
    (control : prepareInternalScopeCreation? program state (.enterScope id origin input entry scope) =
      some prepared.control)
    (evaluated : NestedScopeData.evaluateFrame? program state record prepared.control.selection.created.id
      prepared.control.selection.owner = some prepared.frame)
    (read : NestedScopeData.readSet? state.scopeOccurrences state.variables.scopes prepared.control.selection.owner
      (internalDeclaredEntryInputNames record) = some reads)
    (footprint : prepared.footprint = internalDeclaredEntryFootprint prepared.control reads) :
    prepareInternalDeclaredEntry? program state (.enterScope id origin input entry scope) = some prepared := by
  cases prepared with
  | mk entryControl frame entryFootprint =>
      dsimp only at control evaluated read footprint
      subst footprint
      unfold prepareInternalDeclaredEntry?
      simp only [Option.bind_eq_bind, recorded, control, evaluated, read, Option.bind_some]

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
  simp only [internalScopeCreationPredecessorChecks, Bool.and_eq_true,
    decide_eq_true_eq, and_assoc] at checked
  exact checked.2

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

theorem prepareInternalDeclaredEntry_operation (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalDeclaredEntry)
    (found : prepareInternalDeclaredEntry? program state operation = some prepared) :
    prepared.control.selection.operation = operation ∧
      program.compensationEventSubProcessSnapshots = none := by
  obtain ⟨_, _, _, _, _, _, _, _, _, control, _⟩ :=
    prepareInternalDeclaredEntry_facts program state operation prepared found
  obtain ⟨_, _, _, _, _, _, _, _, _, snapshots, _⟩ :=
    prepareInternalScopeCreation_facts program state operation prepared.control control
  exact ⟨(prepareInternalScopeCreation_operation program state operation prepared.control control).1, snapshots⟩

/-- The retained selection and the two exclusions that make it the evaluator's entry patch. -/
theorem prepareInternalScopeCreation_selection_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    selectInternalScopeCreation? state operation = some prepared.selection ∧
      program.compensationEventSubProcessSnapshots = none ∧
      internalScopeCreationRetentionUnchanged program operation = true := by
  obtain ⟨_, _, _, _, _, _, _, selection, _, snapshots, _, _, _, _, checks, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation prepared found
  exact ⟨selection, snapshots, (Bool.and_eq_true_iff.mp checks).1⟩

/-- Predecessor checks exclude both snapshot creation and the Transaction's child-register write; an
undeclared child adds no frame. -/
theorem prepareInternalScopeCreation_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (undeclared : internalScopeCreationUndeclared program operation = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    fire? program operation state = some (prepared.selection.apply state) := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, _, snapshots, _, _, _, _, checks, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  exact selectInternalScopeCreation_refines program state operation selected snapshots
    (Bool.and_eq_true_iff.mp checks).1 undeclared selection

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

/-- TXC-RETAIN-01 needs an atomic register write that the ordinary retained scope patch lacks. -/
theorem prepareInternalScopeCreation_child_retention_refused
    (program : Program) (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input entry : ControlPlaceId) (scope : DefinitionScopeId)
    (retained : program.compensationActivityRetention.map (·.definitionScopeId) = some scope) :
    prepareInternalScopeCreation? program state (.enterScope id origin input entry scope) = none := by
  cases found : prepareInternalScopeCreation? program state (.enterScope id origin input entry scope) with
  | none => rfl
  | some prepared =>
      obtain ⟨selected, _, _, selectedOrigin, definition, _, _, _, _, _, _, _, _, _, checks, _⟩ :=
        prepareInternalScopeCreation_facts program state _ prepared found
      simp [internalScopeCreationPredecessorChecks, internalScopeCreationRetentionUnchanged,
        retained] at checks

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
