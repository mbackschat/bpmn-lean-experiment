import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.TokenPatch
import BpmnSemantics.SemanticProcess.CallActivityIdentity

/-! Population frames for scope creation preserve the complete definition and instance exclusions
of the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeCreation_apply_control (state : RuntimeState)
    (selected : InternalScopeCreationSelection) :
    (selected.apply state).control = state.control := by
  cases kind : selected.kind <;> simp [InternalScopeCreationSelection.apply, kind]

theorem scopeCreation_apply_time (state : RuntimeState)
    (selected : InternalScopeCreationSelection) :
    (selected.apply state).logicalTimeMs = state.logicalTimeMs := by
  cases kind : selected.kind <;> simp [InternalScopeCreationSelection.apply, kind]

theorem scopeCreation_apply_scope_filter (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (predicate : RuntimeScopeOccurrence → Bool)
    (rejected : predicate selected.created = false) :
    (selected.apply state).scopeOccurrences.filter predicate =
      state.scopeOccurrences.filter predicate := by
  cases kind : selected.kind <;>
    simp only [InternalScopeCreationSelection.apply, kind, insertScopeOccurrence]
  all_goals exact filter_canonicalInsertBy_rejected _ _ _ _ rejected

theorem scopeCreation_apply_token_filter (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (predicate : ControlToken → Bool)
    (consumed : predicate { placeId := selected.input, owner := selected.owner } = false)
    (produced : predicate { placeId := selected.entry, owner := selected.created.id } = false) :
    (selected.apply state).tokens.filter predicate = state.tokens.filter predicate := by
  cases kind : selected.kind <;>
    simp only [InternalScopeCreationSelection.apply, kind, addToken]
  all_goals rw [filter_canonicalInsertBy_rejected _ _ _ _ produced,
    filter_removeToken_of_rejected _ _ _ _ consumed]

theorem scopeCreation_apply_census (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (place : ControlPlaceId)
    (input : selected.input ≠ place) (entry : selected.entry ≠ place) :
    tokenOwners (selected.apply state) place = tokenOwners state place := by
  unfold tokenOwners
  rw [scopeCreation_apply_token_filter state selected (fun token => decide (token.placeId = place))
    (by simpa using input) (by simpa using entry)]

theorem selectInternalScopeCreation_read_frame (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? before operation = some selected)
    (control : after.control = before.control)
    (census : tokenOwners after selected.input = tokenOwners before selected.input)
    (tokens : after.tokens.filter (fun token =>
        decide (token.placeId = selected.input && token.owner = selected.owner)) =
      before.tokens.filter (fun token =>
        decide (token.placeId = selected.input && token.owner = selected.owner)))
    (owner : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = selected.owner)) =
      before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = selected.owner)))
    (child : selected.kind = .child →
      after.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == selected.created.id.definitionScopeId) =
        before.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == selected.created.id.definitionScopeId) ∧
      scopeActivationCount after selected.created.id.definitionScopeId =
        scopeActivationCount before selected.created.id.definitionScopeId)
    (called : ∀ record, selected.kind = .called record →
      calledProcessAssociationsValid after = true ∧
      callActivationCount after ⟨record.id.elementId.value⟩ =
        callActivationCount before ⟨record.id.elementId.value⟩ ∧
      (after.calledProcessOccurrences.filter (fun candidate =>
        candidate.caller = selected.owner && candidate.id.elementId.value = record.id.elementId.value)).length = 0 ∧
      (after.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id.processInstanceId = selected.created.id.processInstanceId))).length = 0 ∧
      (after.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.id = record.id ||
          candidate.calledRoot.processInstanceId = selected.created.id.processInstanceId))).length = 0) :
    selectInternalScopeCreation? after operation = some selected := by
  have onlySelection : onlyTokenOwner? after selected.input = onlyTokenOwner? before selected.input := by
    simp only [onlyTokenOwner?, census]
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running before operation selected found
  unfold selectInternalScopeCreation? at found ⊢
  simp only [control, running, bind, Option.bind] at found ⊢
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨selectedOwner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      try dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals
        first
          | have childReads := child rfl
            simp_all only [childReads.1, childReads.2,
              Bool.false_eq_true, ↓reduceIte, pure, Pure.pure]
          | have callReads := called _ rfl
            simp_all only [callReads.1, callReads.2.1, callReads.2.2.1,
              ↓reduceIte, pure, Pure.pure]

theorem scopeCreation_selection_child_facts (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (hosting : SemanticId) (running : state.control = .running hosting)
    (found : selectInternalScopeCreation? state operation = some selected)
    (child : selected.kind = .child) :
    selected.owner.processInstanceId = hosting ∧
      selected.created.id.processInstanceId = hosting ∧
      selected.created.parent = some selected.owner ∧
      state.scopeOccurrences.any (fun occurrence =>
        occurrence.id.definitionScopeId == selected.created.id.definitionScopeId) = false := by
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      try dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals simp_all

theorem scopeCreation_selection_call_facts (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (record : CalledProcessOccurrence) (hosting : SemanticId)
    (running : state.control = .running hosting)
    (found : selectInternalScopeCreation? state operation = some selected)
    (called : selected.kind = .called record) :
    selected.owner.processInstanceId = hosting ∧ record.caller = selected.owner ∧
      record.id.processInstanceId = hosting ∧ selected.created.id = record.calledRoot ∧
      record.calledRoot.processInstanceId = deriveCalledProcessInstanceId hosting
        ⟨record.id.elementId.value⟩ record.id.activation ∧
      (state.calledProcessOccurrences.filter (fun candidate =>
        candidate.caller = selected.owner && candidate.id.elementId.value = record.id.elementId.value)).length = 0 ∧
      (state.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id.processInstanceId = selected.created.id.processInstanceId))).length = 0 ∧
      (state.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.id = record.id ||
          candidate.calledRoot.processInstanceId = selected.created.id.processInstanceId))).length = 0 := by
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      try dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals first | contradiction | cases called; simp_all

theorem scopeActivationCount_population_frame (before after : RuntimeState)
    (definition : DefinitionScopeId)
    (population : after.scopeActivations.filter (fun row => decide (row.scopeId = definition)) =
      before.scopeActivations.filter (fun row => decide (row.scopeId = definition))) :
    scopeActivationCount after definition = scopeActivationCount before definition := by
  simp only [scopeActivationCount, ← List.head?_filter, population]

theorem callActivationCount_population_frame (before after : RuntimeState)
    (element : NodeId)
    (population : after.callActivations.filter (fun row => decide (row.elementId.value = element.value)) =
      before.callActivations.filter (fun row => decide (row.elementId.value = element.value))) :
    callActivationCount after element = callActivationCount before element := by
  have keys : ∀ row : CallActivation, decide (row.elementId = element) =
      decide (row.elementId.value = element.value) := by
    intro row
    cases row.elementId
    cases element
    simp
  simp only [callActivationCount, elementActivationCount, List.find?_map]
  simp only [Function.comp_def, keys, ← List.head?_filter, population]

theorem scopeCreation_scope_counter_population (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (definition : DefinitionScopeId)
    (different : selected.kind = .child → selected.created.id.definitionScopeId ≠ definition) :
    (selected.apply state).scopeActivations.filter (fun row => decide (row.scopeId = definition)) =
      state.scopeActivations.filter (fun row => decide (row.scopeId = definition)) := by
  cases kind : selected.kind with
  | called record => simp [InternalScopeCreationSelection.apply, kind]
  | child =>
      have distinct := different kind
      simp only [InternalScopeCreationSelection.apply, kind, setScopeActivationCount]
      rw [filter_canonicalInsertBy_rejected _ _ _ _ (by simpa using distinct), List.filter_filter]
      apply List.filter_congr
      intro row _
      apply Bool.eq_iff_iff.mpr
      simp only [Bool.and_eq_true, decide_eq_true_eq]
      constructor
      · exact And.left
      · intro same
        refine ⟨same, ?_⟩
        intro valueEqual
        apply distinct
        have keyEqual : selected.created.id.definitionScopeId.value = definition.value := by
          rw [← valueEqual, same]
        cases key : selected.created.id.definitionScopeId
        cases definition
        simpa [key] using keyEqual

theorem scopeCreation_call_counter_population (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (element : String)
    (different : ∀ record, selected.kind = .called record → record.id.elementId.value ≠ element) :
    (selected.apply state).callActivations.filter (fun row => decide (row.elementId.value = element)) =
      state.callActivations.filter (fun row => decide (row.elementId.value = element)) := by
  cases kind : selected.kind with
  | child => simp [InternalScopeCreationSelection.apply, kind]
  | called record =>
      have distinct := different record kind
      simp only [InternalScopeCreationSelection.apply, kind, setCallActivationCount]
      rw [filter_canonicalInsertBy_rejected _ _ _ _ (by simpa using distinct), List.filter_filter]
      apply List.filter_congr
      intro row _
      simp_all [Ne.symm distinct]

theorem scopeCreation_selection_call_associations (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (record : CalledProcessOccurrence)
    (found : selectInternalScopeCreation? state operation = some selected)
    (called : selected.kind = .called record) : calledProcessAssociationsValid state = true := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals first | contradiction | assumption

/-- Definition-wide exclusion rejects another activation or instance as well as an exact alias. -/
theorem scopeCreation_child_definition_population_refused (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (definition : DefinitionScopeId) (occurrence : RuntimeScopeOccurrence)
    (present : occurrence ∈ state.scopeOccurrences)
    (sameDefinition : occurrence.id.definitionScopeId = definition) :
    selectInternalScopeCreation? state (.enterScope id origin input entry definition) = none := by
  have occupied : state.scopeOccurrences.any (fun candidate => candidate.id.definitionScopeId == definition) = true := by
    exact List.any_eq_true.mpr ⟨occurrence, present, by simp [sameDefinition]⟩
  unfold selectInternalScopeCreation?
  cases control : state.control <;> simp only [bind, Option.bind]
  case running hosting =>
    cases owner : onlyTokenOwner? state input <;> simp [occupied]

/-- A different definition or activation still occupies the freshly derived called instance. -/
theorem scopeCreation_call_instance_population_refused (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (process : ProcessId) (definition : DefinitionScopeId) (returnOperation : OperationId)
    (hosting : SemanticId) (owner : ScopeOccurrenceId) (occurrence : RuntimeScopeOccurrence)
    (running : state.control = .running hosting)
    (owned : onlyTokenOwner? state input = some owner)
    (present : occurrence ∈ state.scopeOccurrences)
    (sameInstance : occurrence.id.processInstanceId = deriveCalledProcessInstanceId
      owner.processInstanceId origin.elementId (callActivationCount state origin.elementId + 1)) :
    selectInternalScopeCreation? state
      (.invokeProcess id origin input process definition entry returnOperation) = none := by
  have occupied : (state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.processInstanceId = deriveCalledProcessInstanceId owner.processInstanceId
        origin.elementId (callActivationCount state origin.elementId + 1)))).length ≠ 0 := by
    intro empty
    have member : occurrence ∈ state.scopeOccurrences.filter (fun candidate =>
        decide (candidate.id.processInstanceId = deriveCalledProcessInstanceId owner.processInstanceId
          origin.elementId (callActivationCount state origin.elementId + 1))) :=
      List.mem_filter.mpr ⟨present, by simpa using sameInstance⟩
    rw [List.length_eq_zero_iff.mp empty] at member
    contradiction
  simp only [selectInternalScopeCreation?, running, owned, bind, Option.bind]
  repeat first | split | rfl
  all_goals simp_all

end BpmnSemantics.SemanticProcess.InternalCommutation
