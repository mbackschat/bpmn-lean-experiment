module

public import BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.CollectionOrder
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
meta import BpmnSemantics.PrivateEquationLemmas
import all BpmnSemantics.SemanticProcess.RuntimeState

/-! Predecessor selection and retained patches for ordinary child entry and Call invocation in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`enterDeclaredScope?, `enterScopeState?,
  `insertScopeOccurrence]

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalScopeCreationKind where
  | child
  | called (record : CalledProcessOccurrence)
  deriving Repr, DecidableEq

structure InternalScopeCreationSelection where
  operation : SemanticOperation
  owner : ScopeOccurrenceId
  input : ControlPlaceId
  entry : ControlPlaceId
  created : RuntimeScopeOccurrence
  kind : InternalScopeCreationKind
  deriving Repr, DecidableEq

/-- The retained creation kind identifies the sole issuance counter and optional Call record. -/
def InternalScopeCreationSelection.apply (state : RuntimeState)
    (selected : InternalScopeCreationSelection) : RuntimeState :=
  let tokens := addToken (removeToken state.tokens selected.input selected.owner)
    selected.entry selected.created.id
  let scopes := insertScopeOccurrence selected.created state.scopeOccurrences
  match selected.kind with
  | .child =>
      { state with
        tokens := tokens
        scopeOccurrences := scopes
        scopeActivations := setScopeActivationCount state.scopeActivations
          selected.created.id.definitionScopeId selected.created.id.activation }
  | .called record =>
      { state with
        tokens := tokens
        scopeOccurrences := scopes
        calledProcessOccurrences := sortCallRecords (record :: state.calledProcessOccurrences)
        callActivations := setCallActivationCount state
          ⟨record.id.elementId.value⟩ record.id.activation }

/-- Child entry stays restricted to the hosting Process owner; a Call invokes from any parentless root
that association validity admits, the hosting instance or a live called root (CALLN-INVOKE-01), so
batched nested invocations agree with the singleton path. A mapped Call selects exactly what its
data-erased invocation selects: the mappings decide only the called-root frame, which the mapped
invocation family adds (CMCALL-PREPARE-01), so the ordinary family admits it only with
`internalScopeCreationUnmapped`. -/
def selectInternalScopeCreation? (state : RuntimeState) (operation : SemanticOperation) :
    Option InternalScopeCreationSelection :=
  (match state.control with
    | .running instanceId => some instanceId
    | _ => none).bind fun hosting => do
  match operation with
  | .enterScope _ _ input entry definition =>
      let owner ← onlyTokenOwner? state input
      if owner.processInstanceId ≠ hosting ||
          state.scopeOccurrences.any fun occurrence =>
            occurrence.id.definitionScopeId == definition then none
      else
        let created : RuntimeScopeOccurrence :=
          { id := { processInstanceId := hosting, definitionScopeId := definition
                    activation := scopeActivationCount state definition + 1 }
            parent := some owner }
        pure { operation, owner, input, entry, created, kind := .child }
  | .invokeProcess _ origin input process definition entry returnOperation .empty
  | .invokeProcess _ origin input process definition entry returnOperation (.variableMappings _ _) =>
      let owner ← onlyTokenOwner? state input
      if (state.tokens.filter fun token : ControlToken =>
          decide (token.placeId = input && token.owner = owner)).length ≠ 1 then none
      else
      if calledProcessAssociationsValid state then
        if (state.calledProcessOccurrences.filter fun record : CalledProcessOccurrence =>
            decide (record.id.elementId.value = origin.elementId.value)).length = 0 then
          match state.scopeOccurrences.filter fun occurrence : RuntimeScopeOccurrence =>
              decide (occurrence.id = owner) with
          | [callerRoot] =>
              if callerRoot.id = owner && callerRoot.parent.isNone then
                let activation := callActivationCount state origin.elementId + 1
                let calledInstance := deriveCalledProcessInstanceId owner.processInstanceId
                  origin.elementId activation
                let created : RuntimeScopeOccurrence :=
                  { id := { processInstanceId := calledInstance, definitionScopeId := definition
                            activation := 1 }
                    parent := none }
                let record : CalledProcessOccurrence :=
                  { id := { processInstanceId := owner.processInstanceId
                            elementId := ⟨origin.elementId.value⟩, activation }
                    caller := owner, calledProcessId := process, calledRoot := created.id
                    returnOperationId := returnOperation }
                if (state.scopeOccurrences.filter fun occurrence : RuntimeScopeOccurrence =>
                      decide (occurrence.id.processInstanceId = calledInstance)).length = 0 then
                  if (state.calledProcessOccurrences.filter fun candidate : CalledProcessOccurrence =>
                      decide (candidate.id = record.id ||
                        candidate.calledRoot.processInstanceId = calledInstance)).length = 0 then
                    pure { operation, owner, input, entry, created, kind := .called record }
                  else none
                else none
              else none
          | _ => none
        else none
      else none
  | _ => none

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.InternalCommutation #[`selectInternalScopeCreation?] (congruence := true)

run_meta privateEquations `BpmnSemantics.SemanticProcess.InternalCommutation #[`InternalScopeCreationSelection.apply,
  `selectInternalScopeCreation?]

/-- CDATA-INPUT-01 requires scalar Calls to use their data-aware atomic preparation. -/
theorem scopeCreationSelection_scalar_refused (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (process : ProcessId) (definition : DefinitionScopeId) (returned : OperationId)
    (data : ScalarCallData) :
    selectInternalScopeCreation? state
      (.invokeProcess id origin input process definition entry returned (.scalar data)) = none := by
  cases control : state.control <;> simp [selectInternalScopeCreation?, control]

/-- Child occurrence identity advances the predecessor's retained issuance high-water mark. -/
theorem scopeCreationSelection_child_issued_activation (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (definition : DefinitionScopeId) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state (.enterScope id origin input entry definition) =
      some selected) :
    selected.created.id.activation = scopeActivationCount state definition + 1 := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · cases found; rfl

/-- Call ownership alone does not justify consuming a duplicated input population. -/
theorem scopeCreationSelection_call_duplicate_input_refused (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (process : ProcessId) (definition : DefinitionScopeId) (returnOperation : OperationId)
    (hosting : SemanticId) (owner : ScopeOccurrenceId)
    (running : state.control = .running hosting)
    (owned : onlyTokenOwner? state input = some owner)
    (duplicate : (state.tokens.filter fun token =>
      decide (token.placeId = input && token.owner = owner)).length ≠ 1) :
    selectInternalScopeCreation? state
      (.invokeProcess id origin input process definition entry returnOperation) = none := by
  simp_all [selectInternalScopeCreation?]

/-- A selection retains the complete operation rather than reconstructing it from a successor. -/
theorem selectInternalScopeCreation_operation (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    selected.operation = operation := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals try (split at found)
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | (solve | cases found <;> rfl) | split at found

/-- Successful selection is confined to running control. -/
theorem selectInternalScopeCreation_running (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    ∃ hosting, state.control = .running hosting := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, running, _⟩ := Option.bind_eq_some_iff.mp found
  cases control : state.control <;> simp [control] at running
  exact ⟨_, rfl⟩

/-- TXC-RETAIN-01 adds a register write outside the ordinary retained scope patch. -/
def internalScopeCreationRetentionUnchanged (program : Program) : SemanticOperation → Bool
  | .enterScope _ _ _ _ scope =>
      decide (program.compensationActivityRetention.map (·.definitionScopeId) ≠ some scope)
  | _ => true

/-- NSD-INIT-01 adds a frame write outside the ordinary retained scope patch; a declared entry composes
that write onto the unchanged patch as its own prepared family (CSD-PREPARE-01). -/
def internalScopeCreationUndeclared (program : Program) : SemanticOperation → Bool
  | .enterScope _ _ _ _ scope => (NestedScopeData.recordFor? program scope).isNone
  | _ => true

/-- CVM-IN-01 adds the called-root frame outside the ordinary retained invocation patch; a mapped
invocation composes that write onto the unchanged patch as its own prepared family (CMCALL-PREPARE-01). -/
def internalScopeCreationUnmapped : SemanticOperation → Bool
  | .invokeProcess _ _ _ _ _ _ _ (.variableMappings _ _) => false
  | _ => true

run_meta privateEquations `BpmnSemantics.SemanticProcess.InternalCommutation #[`internalScopeCreationRetentionUnchanged,
  `internalScopeCreationUndeclared, `internalScopeCreationUnmapped]

/-- A selected child entry without child retention is the retained entry patch. -/
private theorem selectInternalScopeCreation_enters (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input entry : ControlPlaceId) (definition : DefinitionScopeId)
    (selected : InternalScopeCreationSelection)
    (retentionUnchanged : internalScopeCreationRetentionUnchanged program (.enterScope id origin input entry definition) = true)
    (found : selectInternalScopeCreation? state (.enterScope id origin input entry definition) = some selected) :
    enterScopeWithCompensationRetention? program state input entry definition = some (selected.apply state) := by
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state _ selected found
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · next fresh =>
      cases found
      simp only [internalScopeCreationRetentionUnchanged, decide_eq_true_eq] at retentionUnchanged
      rw [enterScopeWithCompensationRetention_unselected program state input entry definition retentionUnchanged]
      simp only [enterScopeState?, owned, running, bind, Option.bind, fresh, Bool.false_eq_true, ↓reduceIte,
        InternalScopeCreationSelection.apply]

/-- CSD-PREPARE-01: a declared child's entry is the retained entry patch followed by its frame
initialization. -/
theorem selectInternalScopeCreation_fires_declared (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input entry : ControlPlaceId) (definition : DefinitionScopeId)
    (selected : InternalScopeCreationSelection) (record : ScopeLocalData)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (retentionUnchanged : internalScopeCreationRetentionUnchanged program (.enterScope id origin input entry definition) = true)
    (recorded : NestedScopeData.recordFor? program definition = some record)
    (found : selectInternalScopeCreation? state (.enterScope id origin input entry definition) = some selected) :
    fire? program (.enterScope id origin input entry definition) state =
      NestedScopeData.initializeFrame? program (selected.apply state) definition := by
  unfold fire?
  rw [snapshotAbsent]
  change enterDeclaredScope? program state input entry definition = _
  simp only [enterDeclaredScope?, recorded, selectInternalScopeCreation_enters program state id origin input entry
    definition selected retentionUnchanged found, bind, Option.bind]

/-- A non-scalar Call's selection is `invokeProcessState?` from the selected owner, creating the root the
mapped invocation's frame belongs to (CMCALL-PREPARE-01). -/
theorem selectInternalScopeCreation_invokes (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId) (process : ProcessId) (definition : DefinitionScopeId)
    (entry : ControlPlaceId) (returnOperation : OperationId) (data : CallDataInterface)
    (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state
      (.invokeProcess id origin input process definition entry returnOperation data) = some selected) :
    onlyTokenOwner? state input = some selected.owner ∧
      selected.created.id =
        { processInstanceId := deriveCalledProcessInstanceId selected.owner.processInstanceId origin.elementId
            (callActivationCount state origin.elementId + 1)
          definitionScopeId := definition, activation := 1 } ∧
      invokeProcessState? state origin input process definition entry returnOperation = some (selected.apply state) := by
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state _ selected found
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  cases data with
  | scalar => simp at found
  | empty | variableMappings _ _ =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      have shape : selected.owner = owner ∧ selected.created.id =
          { processInstanceId := deriveCalledProcessInstanceId owner.processInstanceId origin.elementId
              (callActivationCount state origin.elementId + 1)
            definitionScopeId := definition, activation := 1 } := by
        repeat first | split at found | contradiction
        all_goals cases found
        all_goals exact ⟨rfl, rfl⟩
      rw [shape.1]
      refine ⟨owned, shape.2, ?_⟩
      have rootSelected : (match state.control with
          | .running instanceId | .completed instanceId | .cancelled instanceId => some instanceId
          | .notStarted | .failed .. => none) = some hosting := by rw [running]
      unfold invokeProcessState?
      conv =>
        lhs
        arg 3
        change (match state.control with
          | .running instanceId | .completed instanceId | .cancelled instanceId => some instanceId
          | .notStarted | .failed .. => none)
      rw [owned, rootSelected]
      change (if calledProcessAssociationsValid state then
        if (state.tokens.filter fun token =>
            decide (token.placeId = input && token.owner = owner)).length = 1 then
          if (state.calledProcessOccurrences.filter fun record =>
              decide (record.id.elementId.value = origin.elementId.value)).length = 0
            then _ else none
        else none
      else none) = _
      repeat first | split at found | contradiction
      all_goals cases found
      all_goals simp_all [InternalScopeCreationSelection.apply]

/-- Without snapshots a mapped Call fires its variable-mapping evaluator. -/
theorem fire_mapped_invoke (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId) (process : ProcessId) (definition : DefinitionScopeId)
    (entry : ControlPlaceId) (returnOperation : OperationId) (inputs outputs : List VariableMapping)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.invokeProcess id origin input process definition entry returnOperation (.variableMappings inputs outputs))
      state = CallVariableMapping.invokeState? program state origin input process definition entry returnOperation
        inputs outputs := by
  unfold fire?
  rw [snapshotAbsent]
  rfl

/-- Retained patches agree with the evaluator when neither snapshot, child retention nor frame is created;
this is not a footprint, validity-preservation, or commutation claim. -/
theorem selectInternalScopeCreation_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (retentionUnchanged : internalScopeCreationRetentionUnchanged program operation = true)
    (undeclared : internalScopeCreationUndeclared program operation = true)
    (unmapped : internalScopeCreationUnmapped operation = true)
    (found : selectInternalScopeCreation? state operation = some selected) :
    fire? program operation state = some (selected.apply state) := by
  have original := found
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state operation selected found
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  unfold fire?
  rw [snapshotAbsent]
  cases operation with
  | enterScope id origin input entry definition =>
      simp only [internalScopeCreationUndeclared, Option.isNone_iff_eq_none] at undeclared
      change enterDeclaredScope? program state input entry definition = _
      simp only [enterDeclaredScope?, undeclared]
      exact selectInternalScopeCreation_enters program state id origin input entry definition selected
        retentionUnchanged original
  | invokeProcess id origin input process definition entry returnOperation data =>
      cases data with
      | scalar => simp at found
      | variableMappings => simp [internalScopeCreationUnmapped] at unmapped
      | empty =>
          change invokeProcessState? state origin input process definition entry returnOperation = _
          exact (selectInternalScopeCreation_invokes state id origin input process definition entry returnOperation
            .empty selected original).2.2
  | _ => simp at found

/-- CEA-OCCUR-01's entry record also excludes occurrences live before entry. When no occurrence of the entered
definition was live, as definition-addressed selection requires, that conjunct keeps exactly the created child,
so the record agrees with the definition-and-parent filter. -/
theorem filter_fresh_inserted (occurrences : List RuntimeScopeOccurrence) (created : RuntimeScopeOccurrence)
    (definition : DefinitionScopeId) (parent : Option ScopeOccurrenceId)
    (createdDefinition : created.id.definitionScopeId = definition)
    (noLive : ∀ old ∈ occurrences, old.id.definitionScopeId ≠ definition) :
    (insertScopeOccurrence created occurrences).filter (fun scope =>
        decide (scope.id.definitionScopeId = definition && scope.parent = parent) &&
          !occurrences.any (·.id == scope.id)) =
      (insertScopeOccurrence created occurrences).filter (fun scope =>
        decide (scope.id.definitionScopeId = definition && scope.parent = parent)) := by
  apply List.filter_congr
  intro scope member
  rcases (mem_canonicalInsertBy _ _ _ _).mp (by simpa only [insertScopeOccurrence] using member) with same | old
  · subst same
    have notOld : occurrences.any (·.id == scope.id) = false := by
      apply Bool.eq_false_iff.mpr
      intro found
      obtain ⟨old, present, sameId⟩ := List.any_eq_true.mp found
      simp only [beq_iff_eq] at sameId
      exact noLive old present (by rw [sameId, createdDefinition])
    simp only [notOld, Bool.not_false, Bool.and_true]
  · simp [noLive scope old]

end BpmnSemantics.SemanticProcess.InternalCommutation
