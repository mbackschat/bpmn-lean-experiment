import BpmnSemantics.SemanticProcess.SequentialScopeDispatchLaws

/-! # Repeated-scope preservation and reachability

SMIS-ADMIT-01 connects accepted data and ownership to actual enabled entry and body turnover.
The low-level constructor relation remains beside its evaluator in SequentialScopeRuntime.
-/

namespace BpmnSemantics.SemanticProcess

/-- SMIS-IDENTITY-01 and SMIS-DATA-01 compose the ownership and input facts needed by repeated entry and completion. -/
structure SequentialScopeBoundaryInvariant (program : Program) (state : RuntimeState) : Prop where
  associations : sequentialScopeStateValid program state = true
  processData : SequentialScopeData.startAdmitted program state.variables.process.bindings = true
  localOwners : ∀ scope ∈ state.variables.scopes,
    ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = scope.owner

/-- SMIS-ADMIT-01 establishes the repetition/data invariant at actual committed Start, before internal entry runs. -/
theorem sequentialScope_committed_start_invariant (program : Program)
    (control : SequentialScopeControl.Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    let started := (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state
    started.control = .running instanceId ∧ sequentialScopeStateValid program started = true ∧
      SequentialScopeData.startAdmitted program started.variables.process.bindings = true ∧
      started.variables.scopes = [] ∧ started.sequentialScopeControllers = [] := by
  have data := sequentialScope_committed_start_admitted program initialState commandId processId instanceId bindings selected committed
  have built := sequentialScope_committed_start_builder program commandId processId instanceId bindings selected committed
  unfold runningProgramStartState? at built
  obtain ⟨root, rootSelected, built⟩ := Option.bind_eq_some_iff.mp built
  simp only [pure, Option.some.injEq] at built
  dsimp only
  rw [← built]
  refine ⟨rfl, ?_, data, rfl, rfl⟩
  simp only [sequentialScopeStateValid, runningStartState, initialState, List.all_nil, List.filter_nil,
    Bool.true_and]
  apply List.all_eq_true.mpr
  intro entry declared
  have distinct := sequentialScope_admitted_root_separation program entry control root valid analyzed declared rootSelected
  simp [Ne.symm distinct]

/-- SMIS-IDENTITY-01 derives a vacant repeated definition from valid state and enabled parent entry. -/
theorem sequentialScope_enabled_frontier (program : Program) (entry : SequentialScopeEntry)
    (state : RuntimeState) (parent : ScopeOccurrenceId)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (valid : sequentialScopeStateValid program state = true)
    (enabled : sequentialScopeEntryEnabled entry state parent = true) :
    state.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = [] ∧
      state.sequentialScopeControllers = [] := by
  have absent : state.activityOccurrences.any (fun record => record.activityElementId == entry.elementId) = false := by
    simpa only [Bool.not_eq_true'] using (Bool.and_eq_true_iff.mp enabled).2
  have noActivities : state.activityOccurrences.filter (fun record => record.activityElementId == entry.elementId) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro record member matched
    have present : state.activityOccurrences.any (fun record => record.activityElementId == entry.elementId) = true :=
      List.any_eq_true.mpr ⟨record, member, matched⟩
    rw [absent] at present
    contradiction
  have noBinding : sequentialScopeBindingForEntry? entry state = none := by
    cases control : state.control <;> simp [sequentialScopeBindingForEntry?, control, noActivities]
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid
  have entryValid := List.all_eq_true.mp valid.2 entry (by simp [entries])
  rw [noActivities] at entryValid
  constructor
  · cases bodies : state.scopeOccurrences.filter
        (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) <;> simp_all
  · apply List.eq_nil_iff_forall_not_mem.mpr
    intro controller member
    have accepted := List.all_eq_true.mp valid.1 controller member
    by_cases named : entry.elementId.value = controller.id.activityElementId.value <;>
      simp [entries, named, noBinding] at accepted

/-- SMIS-ENTER-01 derives body and local-frame vacancy from valid ownership before invoking entry totality. -/
theorem sequentialScope_valid_entry_total (program : Program) (analysis : SequentialScopeData.Analysis)
    (state : RuntimeState) (parent : ScopeOccurrenceId)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (admitted : SequentialScopeData.startAdmitted program state.variables.process.bindings = true)
    (valid : sequentialScopeStateValid program state = true)
    (enabled : sequentialScopeEntryEnabled analysis.entry state parent = true)
    (localOwners : ∀ scope ∈ state.variables.scopes,
      ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = scope.owner) :
    ∃ result, enterSequentialScopeResult? analysis.entry state parent = some result := by
  have census := sequentialScope_analyzed_entry_census program analysis analyzed
  have noBodies := (sequentialScope_enabled_frontier program analysis.entry state parent census valid enabled).1
  have noBody : state.scopeOccurrences.any
      (fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) = false := by
    apply Bool.eq_false_iff.mpr
    intro present
    obtain ⟨occurrence, member, matched⟩ := List.any_eq_true.mp present
    have filtered : occurrence ∈ state.scopeOccurrences.filter
        (fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) :=
      List.mem_filter.mpr ⟨member, matched⟩
    rw [noBodies] at filtered
    contradiction
  have noLocals : state.variables.scopes.any
      (fun scope => scope.owner.definitionScopeId == analysis.entry.childScopeId) = false := by
    apply Bool.eq_false_iff.mpr
    intro present
    obtain ⟨scope, member, matched⟩ := List.any_eq_true.mp present
    obtain ⟨occurrence, live, owned⟩ := localOwners scope member
    have bodyPresent : state.scopeOccurrences.any
        (fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) = true :=
      List.any_eq_true.mpr ⟨occurrence, live, by simpa only [owned] using matched⟩
    rw [noBody] at bodyPresent
    contradiction
  exact sequentialScope_admitted_entry_total program analysis state.variables.process.bindings
    state parent analyzed admitted rfl enabled noBody noLocals

private theorem filter_empty_of_any_false (values : List α) (predicate : α → Bool)
    (absent : values.any predicate = false) : values.filter predicate = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro value member matched
  have present : values.any predicate = true := List.any_eq_true.mpr ⟨value, member, matched⟩
  rw [absent] at present
  contradiction

private theorem inserted_filter_singleton (before : α → α → Bool) (predicate : α → Bool)
    (value : α) (values : List α) (kept : predicate value = true)
    (absent : values.filter predicate = []) :
    (canonicalInsertBy before value values).filter predicate = [value] := by
  apply List.Perm.eq_singleton
  simpa only [absent] using filter_canonicalInsertBy_perm before predicate value values kept

private theorem initialized_frame_exists (variables result : ScopedVariables)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping)
    (initialized : initializeScopeVariables? variables owner mappings = some result) :
    ∃ frame, selectScopeVariables? result owner = some frame := by
  unfold initializeScopeVariables? at initialized
  split at initialized <;> try contradiction
  rename_i fresh
  obtain ⟨bindings, _, initialized⟩ := Option.bind_eq_some_iff.mp initialized
  split at initialized <;> try contradiction
  cases Option.some.inj initialized
  have absent := filter_empty_of_any_false variables.scopes (fun scope => decide (scope.owner = owner))
    (Bool.eq_false_iff.mpr fresh)
  have census := inserted_filter_singleton (fun left right : ScopeVariableScope => scopeOwnerBefore left.owner right.owner)
    (fun scope => decide (scope.owner = owner))
    { owner, bindings := mergeProcessVariableBindings [] bindings } variables.scopes (by simp) absent
  exact ⟨{ owner, bindings := mergeProcessVariableBindings [] bindings },
    by simp only [selectScopeVariables?, census]⟩

/-- SMIS-ENTER-01 preserves both directions of the repeated ownership census through empty or first-body entry. -/
theorem sequentialScope_entry_preserves_validity (program : Program) (entry : SequentialScopeEntry)
    (before : RuntimeState) (parent : ScopeOccurrenceId) (result : SequentialScopeEntryResult)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (valid : sequentialScopeStateValid program before = true)
    (entered : enterSequentialScopeResult? entry before parent = some result) :
    sequentialScopeStateValid program result.state = true := by
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  rename_i enabledCheck
  have enabled : sequentialScopeEntryEnabled entry before parent = true := by simpa using enabledCheck
  have controllers := (sequentialScope_enabled_frontier program entry before parent entries valid enabled).2
  simp only [bind, Option.bind_eq_some_iff] at entered
  obtain ⟨items, collection, entered⟩ := entered
  cases items with
  | nil =>
      cases Option.some.inj entered
      exact valid
  | cons item rest =>
      simp only [Option.bind_eq_some_iff] at entered
      obtain ⟨⟨issued, child⟩, issuance, variables, initialized, entered⟩ := entered
      obtain ⟨frame, selectedFrame⟩ := initialized_frame_exists before.variables variables child entry.bodyInputs initialized
      have process := (initializeScopeVariables_preserves_other_data initialized).1
      unfold issueSequentialScope? at issuance
      cases running : before.control <;> simp only [running] at issuance <;> try contradiction
      split at issuance <;> try contradiction
      rename_i vacant
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      cases Option.some.inj entered
      let child : ScopeOccurrenceId :=
        { processInstanceId := parent.processInstanceId,
          definitionScopeId := entry.childScopeId, activation := scopeActivationCount before entry.childScopeId + 1 }
      let body : RuntimeScopeOccurrence := ⟨child, some parent⟩
      let record : ActivityOccurrence :=
        { processInstanceId := parent.processInstanceId,
          activityElementId := entry.elementId, activation := activityActivationCount before ⟨entry.elementId.value⟩ + 1,
          owner := parent, body := .childScope child, attachedHandlers := [] }
      let controller : SequentialScopeController := ⟨sequentialScopeActivityId record, (item :: rest).length, 0, item⟩
      have enabledParts := enabled
      simp only [sequentialScopeEntryEnabled, Bool.and_eq_true] at enabledParts
      have noActivities := filter_empty_of_any_false before.activityOccurrences
        (fun record => record.activityElementId == entry.elementId) (by simpa using enabledParts.2)
      have activityCensus : (insertActivityOccurrence record before.activityOccurrences).filter
          (fun candidate => candidate.activityElementId == entry.elementId) = [record] := by
        rw [insertActivityOccurrence_eq_canonicalInsertBy]
        exact inserted_filter_singleton _ _ _ _ (by simp [record]) noActivities
      have noBodies := filter_empty_of_any_false before.scopeOccurrences
        (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) (Bool.eq_false_iff.mpr vacant)
      have bodyCensus : (insertScopeOccurrence body before.scopeOccurrences).filter
          (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = [body] :=
        inserted_filter_singleton _ _ _ _ (by simp [body, child]) noBodies
      have noChild : before.scopeOccurrences.filter (fun occurrence => occurrence.id == child) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro occurrence member matched
        have same : occurrence.id = child := by simpa using matched
        have forbidden : occurrence ∈ before.scopeOccurrences.filter
            (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) :=
          List.mem_filter.mpr ⟨member, by simp [same, child]⟩
        rw [noBodies] at forbidden
        contradiction
      have childCensus : (insertScopeOccurrence body before.scopeOccurrences).filter
          (fun occurrence => occurrence.id == child) = [body] :=
        inserted_filter_singleton _ _ _ _ (by simp [body]) noChild
      have parentLive : (insertScopeOccurrence body before.scopeOccurrences).any
          (fun occurrence => occurrence.id == parent) = true := by
        obtain ⟨occurrence, member, matched⟩ := List.any_eq_true.mp enabledParts.1.2
        exact List.any_eq_true.mpr ⟨occurrence,
          (mem_canonicalInsertBy _ body occurrence before.scopeOccurrences).mpr (Or.inr member), matched⟩
      have within : (item :: rest).length ≤ 16 := by
        unfold sequentialScopeCollection? at collection
        split at collection <;> try contradiction
        split at collection <;> try contradiction
        split at collection <;> try contradiction
        rename_i limits
        cases Option.some.inj collection
        simpa only [sequentialScopeCollectionWithinLimits, Bool.and_eq_true, decide_eq_true_eq] using
          (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp limits).1).1
      simp only [List.length_cons] at within
      have parentNotAbsent : ¬(∀ occurrence ∈ insertScopeOccurrence body before.scopeOccurrences, occurrence.id ≠ parent) := by
        intro absent
        obtain ⟨occurrence, member, matched⟩ := List.any_eq_true.mp parentLive
        exact absent occurrence member (by simpa using matched)
      simp only [sequentialScopeStateValid, entries, SequentialScopeEntryResult.state,
        controllers, List.nil_append, List.all_cons, List.all_nil, Bool.and_true]
      have binding : sequentialScopeBindingForEntry? entry
          { before with
            control := .running parent.processInstanceId,
            scopeOccurrences := insertScopeOccurrence body before.scopeOccurrences,
            activityOccurrences := insertActivityOccurrence record before.activityOccurrences,
            sequentialScopeControllers := [controller], variables } = some ⟨entry, record, controller, body, frame⟩ := by
        simp [sequentialScopeBindingForEntry?, activityCensus, childCensus, parentLive, selectedFrame,
          record, controller, body, child] <;> omega
      simp_all [sequentialScopeActivityId, sequentialScopeBindingForEntry?, sequentialScopeCollection?,
        record, controller, body, child]
      have limited : ¬16 < rest.length + 1 := by omega
      simp only [← not_and, ← not_exists, parentLive, not_true_eq_false, limited, false_or, ↓reduceIte]
      simp

private theorem entry_preserves_local_owners (entry : SequentialScopeEntry)
    (before : RuntimeState) (parent : ScopeOccurrenceId) (result : SequentialScopeEntryResult)
    (owners : ∀ scope ∈ before.variables.scopes,
      ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = scope.owner)
    (entered : enterSequentialScopeResult? entry before parent = some result) :
    ∀ scope ∈ result.state.variables.scopes,
      ∃ occurrence ∈ result.state.scopeOccurrences, occurrence.id = scope.owner := by
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  simp only [bind, Option.bind_eq_some_iff] at entered
  obtain ⟨items, _, entered⟩ := entered
  cases items with
  | nil => cases Option.some.inj entered; exact owners
  | cons item rest =>
      simp only [Option.bind_eq_some_iff] at entered
      obtain ⟨⟨issued, child⟩, issuance, variables, initialized, entered⟩ := entered
      unfold issueSequentialScope? at issuance
      cases running : before.control <;> simp only [running] at issuance <;> try contradiction
      split at issuance <;> try contradiction
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      cases Option.some.inj entered
      unfold initializeScopeVariables? at initialized
      split at initialized <;> try contradiction
      obtain ⟨bindings, _, initialized⟩ := Option.bind_eq_some_iff.mp initialized
      split at initialized <;> try contradiction
      cases Option.some.inj initialized
      intro scope member
      rcases (mem_canonicalInsertBy _ _ _ _).mp member with rfl | old
      · exact ⟨_, (mem_canonicalInsertBy _ _ _ _).mpr (Or.inl rfl), rfl⟩
      · obtain ⟨occurrence, live, owned⟩ := owners scope old
        exact ⟨occurrence, (mem_canonicalInsertBy _ _ _ _).mpr (Or.inr live), owned⟩

/-- An enabled admitted entry produces an actual successor retaining the combined invariant; no successful helper or vacant-body premise is assumed. -/
theorem sequentialScope_invariant_entry (program : Program) (analysis : SequentialScopeData.Analysis)
    (before : RuntimeState) (parent : ScopeOccurrenceId)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (enabled : sequentialScopeEntryEnabled analysis.entry before parent = true) :
    ∃ result, enterSequentialScopeResult? analysis.entry before parent = some result ∧
      SequentialScopeBoundaryInvariant program result.state := by
  obtain ⟨result, entered⟩ := sequentialScope_valid_entry_total program analysis before parent
    analyzed invariant.processData invariant.associations enabled invariant.localOwners
  refine ⟨result, entered, ⟨?_, ?_, ?_⟩⟩
  · exact sequentialScope_entry_preserves_validity program analysis.entry before parent result
      (sequentialScope_analyzed_entry_census program analysis analyzed) invariant.associations entered
  · rw [sequentialScope_entry_process_data_frame analysis.entry before parent result entered]
    exact invariant.processData
  · exact entry_preserves_local_owners analysis.entry before parent result invariant.localOwners entered

/-- Actual Start admission supplies the combined entry/completion invariant before automatic closure. -/
theorem sequentialScope_invariant_start (program : Program) (control : SequentialScopeControl.Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    SequentialScopeBoundaryInvariant program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state := by
  have base := sequentialScope_committed_start_invariant program control commandId processId instanceId
    bindings valid analyzed selected committed
  refine ⟨base.2.1, base.2.2.1, ?_⟩
  intro scope member
  rw [base.2.2.2.1] at member
  contradiction

private theorem valid_controller_census (program : Program) (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (valid : sequentialScopeStateValid program state = true)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    state.sequentialScopeControllers = [binding.controller] := by
  have filtered : state.sequentialScopeControllers.filter
      (fun controller => decide (controller.id = sequentialScopeActivityId binding.activity)) = [binding.controller] := by
    unfold sequentialScopeBindingForEntry? at bound
    cases control : state.control <;> simp only [control] at bound <;> try contradiction
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    obtain ⟨locals, _, bound⟩ := Option.bind_eq_some_iff.mp bound
    split at bound <;> try contradiction
    cases Option.some.inj bound
    assumption
  have ownId : binding.controller.id = sequentialScopeActivityId binding.activity := by
    have member : binding.controller ∈ state.sequentialScopeControllers.filter
        (fun controller => decide (controller.id = sequentialScopeActivityId binding.activity)) := by
      rw [filtered]; simp
    simpa using (List.mem_filter.mp member).2
  have all := (Bool.and_eq_true_iff.mp valid).1
  have same : state.sequentialScopeControllers.filter
      (fun controller => decide (controller.id = sequentialScopeActivityId binding.activity)) =
        state.sequentialScopeControllers := by
    apply List.filter_eq_self.mpr
    intro controller member
    have selected := List.all_eq_true.mp all controller member
    by_cases matched : entry.elementId.value = controller.id.activityElementId.value
    · simp only [entries, List.filter_cons, List.filter_nil, beq_iff_eq, matched,
        ↓reduceIte, bound] at selected
      exact decide_eq_true (selected.symm.trans ownId)
    · simp only [entries, List.filter_cons, List.filter_nil, beq_iff_eq, matched,
        ↓reduceIte, Bool.false_eq_true] at selected
  exact same.symm.trans filtered

private theorem remove_filtered_singleton {α : Type} [DecidableEq α]
    (values : List α) (predicate : α → Bool) (value : α)
    (census : values.filter predicate = [value]) :
    (values.filter (fun candidate => decide (candidate ≠ value))).filter predicate = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro candidate member selected
  obtain ⟨old, different⟩ := List.mem_filter.mp member
  have present := List.mem_filter.mpr ⟨old, selected⟩
  rw [census] at present
  simp_all

/-- SMIS-END-01 retires the sole repeated association on natural or early terminal completion. -/
theorem sequentialScope_terminal_preserves_validity (program : Program) (entry : SequentialScopeEntry)
    (before after : RuntimeState) (child : ScopeOccurrenceId)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (valid : sequentialScopeStateValid program before = true)
    (completed : completeSequentialScopeResult? entry before = some (.terminal child after)) :
    sequentialScopeStateValid program after = true := by
  unfold completeSequentialScopeResult? at completed
  simp only [bind, Option.bind_eq_some_iff] at completed
  obtain ⟨binding, bound, completed⟩ := completed
  have controllers := valid_controller_census program entry before binding entries valid bound
  have activities := (sequentialScope_binding_activity entry before binding bound).1
  have bodies := sequentialScope_valid_body_census program entry before binding
    (by simp [entries]) valid bound
  split at completed <;> try contradiction
  simp only [Option.bind_eq_some_iff] at completed
  obtain ⟨condition, _, variables, _, completed⟩ := completed
  split at completed
  · cases Option.some.inj completed
    simp only [sequentialScopeStateValid, entries, controllers]
    simp only [List.filter_cons, ne_eq, not_true_eq_false, decide_false, Bool.false_eq_true,
      ↓reduceIte, List.filter_nil, List.all_cons, List.all_nil, Bool.true_and, Bool.and_true]
    rw [remove_filtered_singleton _ _ _ activities, remove_filtered_singleton _ _ _ bodies]
  · split at completed <;> try contradiction
    split at completed <;> try contradiction
    simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨item, _, ⟨issued, nextChild⟩, _, locals, _, completed⟩ := completed
    cases Option.some.inj completed

/-- SMIS-END-01 disposes the completed body's locals and gives every next-body local a live owner. -/
theorem sequentialScope_completion_preserves_local_owners (entry : SequentialScopeEntry)
    (before : RuntimeState) (result : SequentialScopeCompletionResult)
    (owners : ∀ scope ∈ before.variables.scopes,
      ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = scope.owner)
    (completed : completeSequentialScopeResult? entry before = some result) :
    ∀ scope ∈ result.state.variables.scopes,
      ∃ occurrence ∈ result.state.scopeOccurrences, occurrence.id = scope.owner := by
  unfold completeSequentialScopeResult? at completed
  simp only [bind, Option.bind_eq_some_iff] at completed
  obtain ⟨binding, _, completed⟩ := completed
  split at completed <;> try contradiction
  simp only [Option.bind_eq_some_iff] at completed
  obtain ⟨condition, _, variables, removed, completed⟩ := completed
  obtain ⟨_, rfl⟩ := removeScopeVariables_success_iff.mp removed
  have retained : ∀ scope ∈ before.variables.scopes.filter (fun scope => decide (scope.owner ≠ binding.body.id)),
      ∃ occurrence ∈ before.scopeOccurrences.filter (fun candidate => decide (candidate ≠ binding.body)),
        occurrence.id = scope.owner := by
    intro scope member
    obtain ⟨old, different⟩ := List.mem_filter.mp member
    obtain ⟨occurrence, live, owned⟩ := owners scope old
    refine ⟨occurrence, List.mem_filter.mpr ⟨live, ?_⟩, owned⟩
    simp only [decide_eq_true_eq] at different ⊢
    intro same
    exact different (owned.symm.trans (congrArg RuntimeScopeOccurrence.id same))
  split at completed
  · cases Option.some.inj completed
    exact retained
  · split at completed <;> try contradiction
    split at completed <;> try contradiction
    simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨item, _, ⟨issued, nextChild⟩, issuance, locals, initialized, completed⟩ := completed
    unfold issueSequentialScope? at issuance
    cases running : before.control <;> simp only [running] at issuance <;> try contradiction
    split at issuance <;> try contradiction
    simp only [Option.some.injEq, Prod.mk.injEq] at issuance
    rcases issuance with ⟨rfl, rfl⟩
    cases Option.some.inj completed
    unfold initializeScopeVariables? at initialized
    split at initialized <;> try contradiction
    obtain ⟨bindings, _, initialized⟩ := Option.bind_eq_some_iff.mp initialized
    split at initialized <;> try contradiction
    cases Option.some.inj initialized
    intro scope member
    rcases (mem_canonicalInsertBy _ _ _ _).mp member with rfl | old
    · exact ⟨_, (mem_canonicalInsertBy _ _ _ _).mpr (Or.inl rfl), rfl⟩
    · obtain ⟨occurrence, live, owned⟩ := retained scope old
      exact ⟨occurrence, (mem_canonicalInsertBy _ _ _ _).mpr (Or.inr live), owned⟩

/-- Natural and early terminal completion preserve the same combined invariant established by actual Start and entry. -/
theorem sequentialScope_invariant_terminal (program : Program) (entry : SequentialScopeEntry)
    (before after : RuntimeState) (child : ScopeOccurrenceId)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (invariant : SequentialScopeBoundaryInvariant program before)
    (completed : completeSequentialScopeResult? entry before = some (.terminal child after)) :
    SequentialScopeBoundaryInvariant program after := by
  refine ⟨sequentialScope_terminal_preserves_validity program entry before after child entries
    invariant.associations completed, ?_, ?_⟩
  · have frame := sequentialScope_completion_process_data_frame entry before _ completed
    change after.variables.process = before.variables.process at frame
    rw [frame]
    exact invariant.processData
  · exact sequentialScope_completion_preserves_local_owners entry before _ invariant.localOwners completed

private theorem binding_identity (entry : SequentialScopeEntry) (state : RuntimeState)
    (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    state.control = .running binding.activity.owner.processInstanceId ∧
      binding.activity.processInstanceId = binding.activity.owner.processInstanceId ∧
      binding.activity.attachedHandlers = [] ∧
      state.scopeOccurrences.any (fun occurrence => occurrence.id == binding.activity.owner) = true ∧
      binding.controller.id = sequentialScopeActivityId binding.activity := by
  unfold sequentialScopeBindingForEntry? at bound
  cases control : state.control <;> simp only [control] at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i records record recordsEq
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i controllers controller controllersEq
  obtain ⟨locals, _, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  cases Option.some.inj bound
  have member : controller ∈ state.sequentialScopeControllers.filter
      (fun candidate => decide (candidate.id = sequentialScopeActivityId record)) := by
    rw [controllersEq]; simp
  have idEq := (List.mem_filter.mp member).2
  simp_all

/-- SMIS-END-01 replaces the current body while preserving the outer Activity and advancing its sole controller. -/
theorem sequentialScope_next_preserves_validity (program : Program) (entry : SequentialScopeEntry)
    (before after : RuntimeState) (child : ScopeOccurrenceId)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (valid : sequentialScopeStateValid program before = true)
    (completed : completeSequentialScopeResult? entry before = some (.next child after)) :
    sequentialScopeStateValid program after = true := by
  unfold completeSequentialScopeResult? at completed
  simp only [bind, Option.bind_eq_some_iff] at completed
  obtain ⟨binding, bound, completed⟩ := completed
  have controllers := valid_controller_census program entry before binding entries valid bound
  have activities := (sequentialScope_binding_activity entry before binding bound).1
  have bodies := sequentialScope_valid_body_census program entry before binding (by simp [entries]) valid bound
  obtain ⟨items, collection, total, _⟩ := sequentialScope_valid_binding_collection
    program entry before binding (by simp [entries]) valid bound
  have identity := binding_identity entry before binding bound
  have progress := sequentialScope_bound_controller_progress entry before binding bound
  have recordMember : binding.activity ∈ before.activityOccurrences.filter
      (fun record => record.activityElementId == entry.elementId) := by rw [activities]; simp
  have recordElement : binding.activity.activityElementId = entry.elementId := by
    simpa using (List.mem_filter.mp recordMember).2
  split at completed <;> try contradiction
  rename_i quiet
  have parentDifferent : binding.activity.owner ≠ binding.body.id := by
    intro same
    have owned : before.activityOccurrences.any (fun record => record.owner == binding.body.id) = true :=
      List.any_eq_true.mpr ⟨binding.activity, (List.mem_filter.mp recordMember).1, by simp [same]⟩
    simp [owned] at quiet
  simp only [Option.bind_eq_some_iff] at completed
  obtain ⟨condition, _, variables, removed, completed⟩ := completed
  obtain ⟨_, rfl⟩ := removeScopeVariables_success_iff.mp removed
  split at completed
  · cases Option.some.inj completed
  · rename_i nonfinal
    split at completed <;> try contradiction
    rename_i processBindings processBinding processBindingsEq
    split at completed <;> try contradiction
    rename_i currentItems currentItemsEq
    have sameItems : currentItems = items := by
      unfold sequentialScopeCollection? at collection
      simp only [processBindingsEq, currentItemsEq] at collection
      split at collection <;> simp_all
    subst currentItems
    simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨item, indexed, ⟨issued, nextChild⟩, issuance, locals, initialized, completed⟩ := completed
    unfold issueSequentialScope? at issuance
    simp only [identity.1] at issuance
    split at issuance <;> try contradiction
    simp only [Option.some.injEq, Prod.mk.injEq] at issuance
    rcases issuance with ⟨rfl, rfl⟩
    cases Option.some.inj completed
    let nextId : ScopeOccurrenceId :=
      { processInstanceId := binding.activity.owner.processInstanceId,
        definitionScopeId := entry.childScopeId, activation := scopeActivationCount before entry.childScopeId + 1 }
    let body : RuntimeScopeOccurrence := { id := nextId, parent := some binding.activity.owner }
    let record : ActivityOccurrence := { binding.activity with body := .childScope nextId }
    let controller : SequentialScopeController := { binding.controller with completed := binding.controller.completed + 1, currentItem := item }
    let retired := before.scopeOccurrences.filter (fun candidate => decide (candidate ≠ binding.body))
    have noBodies : retired.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = [] :=
      remove_filtered_singleton _ _ _ bodies
    have bodyCensus : (insertScopeOccurrence body retired).filter
        (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = [body] :=
      inserted_filter_singleton _ _ _ _ (by simp [body, nextId]) noBodies
    have noChild : retired.filter (fun occurrence => occurrence.id == nextId) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro occurrence member matched
      have same : occurrence.id = nextId := by simpa using matched
      have forbidden : occurrence ∈ retired.filter
          (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) :=
        List.mem_filter.mpr ⟨member, by simp [same, nextId]⟩
      rw [noBodies] at forbidden
      contradiction
    have childCensus : (insertScopeOccurrence body retired).filter
        (fun occurrence => occurrence.id == nextId) = [body] :=
      inserted_filter_singleton _ _ _ _ (by simp [body]) noChild
    have parentLive : (insertScopeOccurrence body retired).any
        (fun occurrence => occurrence.id == binding.activity.owner) = true := by
      obtain ⟨occurrence, member, matched⟩ := List.any_eq_true.mp identity.2.2.2.1
      have same : occurrence.id = binding.activity.owner := by simpa using matched
      have different : occurrence ≠ binding.body := by
        intro equal
        exact parentDifferent (same.symm.trans (congrArg RuntimeScopeOccurrence.id equal))
      exact List.any_eq_true.mpr ⟨occurrence, (mem_canonicalInsertBy _ _ _ _).mpr
        (Or.inr (List.mem_filter.mpr ⟨member, by simp [different]⟩)), matched⟩
    let updated := before.activityOccurrences.map (fun candidate => if candidate = binding.activity then record else candidate)
    have activityCensus : updated.filter (fun candidate => candidate.activityElementId == entry.elementId) = [record] := by
      rw [List.filter_map]
      have same : (fun candidate => (if candidate = binding.activity then record else candidate).activityElementId == entry.elementId) =
          (fun candidate : ActivityOccurrence => candidate.activityElementId == entry.elementId) := by
        funext candidate
        split <;> simp_all [record]
      simp only [Function.comp_def]
      rw [same, activities]
      simp
    obtain ⟨frame, selectedFrame⟩ := initialized_frame_exists _ _ _ _ initialized
    have within : binding.controller.completed + 1 < binding.controller.total := by
      simp only [Bool.or_eq_true, decide_eq_true_eq, not_or] at nonfinal
      omega
    let successor : RuntimeState := { before with
      control := .running binding.activity.owner.processInstanceId,
      scopeOccurrences := insertScopeOccurrence body retired,
      scopeActivations := setScopeActivationCount before.scopeActivations entry.childScopeId nextId.activation,
      tokens := addToken before.tokens entry.childEntry nextId,
      variables := locals,
      activityOccurrences := updated,
      sequentialScopeControllers := [controller] }
    change selectScopeVariables? locals nextId = some frame at selectedFrame
    have idEq : controller.id = sequentialScopeActivityId record := by
      simpa only [controller, record, sequentialScopeActivityId] using identity.2.2.2.2
    have joined : sequentialScopeBindingForEntry? entry successor = some ⟨entry, record, controller, body, frame⟩ := by
      have recordBody : record.body = .childScope nextId := rfl
      have firstGuard : (record.processInstanceId ≠ binding.activity.owner.processInstanceId ||
          record.owner.processInstanceId ≠ binding.activity.owner.processInstanceId ||
          nextId.processInstanceId ≠ binding.activity.owner.processInstanceId ||
          nextId.definitionScopeId ≠ entry.childScopeId || !record.attachedHandlers.isEmpty) = false := by
        simp [record, nextId, identity.2.1, identity.2.2.1]
      simp only [sequentialScopeBindingForEntry?, successor, activityCensus, recordBody,
        firstGuard, Bool.false_eq_true, ↓reduceIte, childCensus, List.filter_cons, idEq,
        decide_true, List.filter_nil, selectedFrame, bind, Option.bind_some]
      simp [body, record, controller, parentLive, progress.2.1, Nat.not_le.mpr within]
    have processFrame := (initializeScopeVariables_preserves_other_data initialized).1
    have successorCollection : sequentialScopeCollection? entry successor = some items := by
      unfold sequentialScopeCollection?
      change (do
        let [value] := locals.process.bindings.filter (·.name == entry.collectionName) | none
        let .stringList values := value.value | none
        if sequentialScopeCollectionWithinLimits values then some values else none) = some items
      rw [processFrame]
      exact collection
    have named : entry.elementId.value = controller.id.activityElementId.value := by
      simp only [controller, identity.2.2.2.2, sequentialScopeActivityId, recordElement]
    have resultValid : sequentialScopeStateValid program successor = true := by
      simp only [sequentialScopeStateValid, entries]
      change ([controller].all _ && _) = true
      simp only [List.all_cons, List.all_nil, Bool.and_true, List.filter_cons, named,
        beq_self_eq_true, ↓reduceIte, List.filter_nil, joined]
      rw [show successor.activityOccurrences = updated from rfl,
        show successor.scopeOccurrences = insertScopeOccurrence body retired from rfl,
        activityCensus, bodyCensus]
      simp [successorCollection, controller, total, indexed]
    simpa only [successor, updated, retired, body, nextId, controller, record, controllers,
      List.map_cons, List.map_nil, ↓reduceIte, scopeActivationCount] using resultValid

/-- Every actual terminal or next-body result preserves the entry/completion boundary invariant. -/
theorem sequentialScope_completion_preserves_invariant (program : Program) (entry : SequentialScopeEntry)
    (before : RuntimeState) (result : SequentialScopeCompletionResult)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (invariant : SequentialScopeBoundaryInvariant program before)
    (completed : completeSequentialScopeResult? entry before = some result) :
    SequentialScopeBoundaryInvariant program result.state := by
  refine ⟨?_, ?_, ?_⟩
  · cases result with
    | terminal child after =>
      exact sequentialScope_terminal_preserves_validity program entry
        before after child entries invariant.associations completed
    | next child after =>
      exact sequentialScope_next_preserves_validity program entry
        before after child entries invariant.associations completed
  · rw [sequentialScope_completion_process_data_frame entry before result completed]
    exact invariant.processData
  · exact sequentialScope_completion_preserves_local_owners entry before result invariant.localOwners completed

/-- A quiescent admitted body has an actual completion successor preserving the invariant; helper success is derived. -/
theorem sequentialScope_invariant_completion (program : Program) (analysis : SequentialScopeData.Analysis)
    (before : RuntimeState) (binding : SequentialScopeBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (bound : sequentialScopeBindingForEntry? analysis.entry before = some binding)
    (quiet : scopeQuiescent before binding.body.id = true)
    (noActivity : before.activityOccurrences.any (fun candidate => candidate.owner == binding.body.id) = false) :
    ∃ result, completeSequentialScopeResult? analysis.entry before = some result ∧
      SequentialScopeBoundaryInvariant program result.state := by
  obtain ⟨result, completed⟩ := sequentialScope_admitted_completion_total program analysis before binding
    analyzed invariant.processData invariant.associations bound quiet noActivity invariant.localOwners
  exact ⟨result, completed, sequentialScope_completion_preserves_invariant program analysis.entry before
    result (sequentialScope_analyzed_entry_census program analysis analyzed) invariant completed⟩

/-- Unchanged lifecycle populations and local-owner multiplicity preserve the boundary while unrelated work and values change. -/
theorem sequentialScope_invariant_frame (program : Program) (before after : RuntimeState)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (control : after.control = before.control)
    (activities : after.activityOccurrences = before.activityOccurrences)
    (bodies : after.scopeOccurrences = before.scopeOccurrences)
    (controllers : after.sequentialScopeControllers = before.sequentialScopeControllers)
    (owners : after.variables.scopes.map (·.owner) = before.variables.scopes.map (·.owner))
    (data : SequentialScopeData.startAdmitted program after.variables.process.bindings = true)
    (collections : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      sequentialScopeCollection? entry after = sequentialScopeCollection? entry before) :
    SequentialScopeBoundaryInvariant program after := by
  refine ⟨?_, data, ?_⟩
  · apply sequentialScopeStateValid_controller_frame program before after invariant.associations controllers
      (fun _ _ => congrArg _ activities) (fun _ _ => congrArg _ bodies) _ collections
    intro entry _ binding bound
    exact sequentialScope_binding_owner_frame entry before after binding control activities bodies controllers owners bound
  · intro scope member
    have present : scope.owner ∈ after.variables.scopes.map (·.owner) := List.mem_map.mpr ⟨scope, member, rfl⟩
    rw [owners] at present
    obtain ⟨prior, priorMember, same⟩ := List.mem_map.mp present
    obtain ⟨occurrence, live, owned⟩ := invariant.localOwners prior priorMember
    exact ⟨occurrence, bodies ▸ live, owned.trans same⟩

/-- The actual scoped writer preserves lifecycle ownership, future Process inputs and the fixed MI collection together. -/
theorem sequentialScope_invariant_write (program : Program) (analysis : SequentialScopeData.Analysis)
    (before : RuntimeState) (owner : ScopeOccurrenceId) (values : List VariableBinding)
    (kind : SequentialScopeWriteKind) (variables : ScopedVariables)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (written : writeSequentialScopeValues? program before owner values kind = some variables) :
    SequentialScopeBoundaryInvariant program { before with variables } := by
  apply sequentialScope_invariant_frame program before { before with variables } invariant rfl rfl rfl rfl
    (sequentialScope_write_preserves_owner_census program before owner values kind variables written)
    (sequentialScope_write_preserves_start_data program analysis before owner values kind variables analyzed invariant.processData written)
  intro entry declared
  rw [sequentialScope_analyzed_entry_census program analysis analyzed] at declared
  have same := List.mem_singleton.mp declared
  subst entry
  obtain ⟨actual, items, found, census, _⟩ := sequentialScope_admitted_start_collection program _ invariant.processData
  have sameAnalysis : actual = analysis := Option.some.inj (found.symm.trans analyzed)
  subst actual
  have selected := written
  unfold writeSequentialScopeValues? at selected
  obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp selected
  have entryEq := sequentialScope_owner_binding_entry program analysis before owner binding analyzed bound
  have kept := sequentialScope_write_preserves_collection program before owner values kind binding _ variables bound
    (by simpa only [entryEq, Bool.beq_eq_decide_eq] using census) written
  have censusEq : variables.process.bindings.filter (·.name == analysis.entry.collectionName) =
      before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) := by
    simpa only [entryEq, Bool.beq_eq_decide_eq] using kept.trans
      (by simpa only [Bool.beq_eq_decide_eq] using census.symm)
  simp only [sequentialScopeCollection?, censusEq]

/-- A committed body User Task completion preserves the invariant without assuming a valid successor. -/
theorem sequentialScope_invariant_user_completion (program : Program) (analysis : SequentialScopeData.Analysis)
    (before after : RuntimeState) (taskId : UserTaskInstanceId) (values : List VariableBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (completed : completeSequentialScopeUserTask? program before taskId values = some after) :
    SequentialScopeBoundaryInvariant program after := by
  unfold completeSequentialScopeUserTask? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  have updated := sequentialScope_invariant_write program analysis before _ values .userTask variables analyzed invariant written
  exact sequentialScope_invariant_frame program { before with variables } _ updated rfl rfl rfl rfl rfl
    updated.processData (fun _ _ => rfl)

/-- A mapped body Service result preserves the invariant through nearest-scope writes and effect-frame disposal. -/
theorem sequentialScope_invariant_effect_completion (program : Program) (analysis : SequentialScopeData.Analysis)
    (before after : RuntimeState) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (completed : completeSequentialScopeEffect? program before effectId result = some after) :
    SequentialScopeBoundaryInvariant program after := by
  unfold completeSequentialScopeEffect? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, dataWrite, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  unfold completeSequentialScopeEffectData? at dataWrite
  split at dataWrite <;> try contradiction
  obtain ⟨projected, _, dataWrite⟩ := Option.bind_eq_some_iff.mp dataWrite
  obtain ⟨writtenVariables, written, dataWrite⟩ := Option.bind_eq_some_iff.mp dataWrite
  cases Option.some.inj dataWrite
  have updated := sequentialScope_invariant_write program analysis before _ _ .serviceTask writtenVariables analyzed invariant written
  exact sequentialScope_invariant_frame program { before with variables := writtenVariables } _ updated rfl rfl rfl rfl rfl
    updated.processData (fun _ _ => rfl)

/-- Every operation admitted by the MI body graph preserves the boundary through the actual operation evaluator. -/
theorem sequentialScope_invariant_body_fire (program : Program) (operation : SemanticOperation)
    (bodyOperations : List SemanticOperation) (vertex : StructuredParallelBody.Vertex) (before after : RuntimeState)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (admitted : SequentialScopeControl.bodyVertex? bodyOperations operation = some vertex)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (fired : fire? program operation before = some after) :
    SequentialScopeBoundaryInvariant program after := by
  cases operation <;> simp only [SequentialScopeControl.bodyVertex?] at admitted <;> try contradiction
  all_goals simp only [fire?, absent] at fired
  case awaitUserTask =>
    change awaitUserTaskState? before _ _ _ = some after at fired
    simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, _, instanceId, _, fired⟩ := fired
    cases Option.some.inj fired
    exact sequentialScope_invariant_frame program before _ invariant rfl rfl rfl rfl rfl
      invariant.processData (fun _ _ => rfl)
  case awaitEffect =>
    change awaitEffectState? program before _ _ _ _ = some after at fired
    simp only [awaitEffectState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, _, instanceId, _, arguments, _, fired⟩ := fired
    split at fired <;> try contradiction
    cases Option.some.inj fired
    exact sequentialScope_invariant_frame program before _ invariant rfl rfl rfl rfl rfl
      invariant.processData (fun _ _ => rfl)
  case duplicate =>
    change duplicateState? before _ _ = some after at fired
    simp only [duplicateState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, _, fired⟩ := fired
    cases Option.some.inj fired
    exact sequentialScope_invariant_frame program before _ invariant rfl rfl rfl rfl rfl
      invariant.processData (fun _ _ => rfl)
  case synchronize =>
    change synchronizeState? before _ _ = some after at fired
    simp only [synchronizeState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, _, fired⟩ := fired
    cases Option.some.inj fired
    exact sequentialScope_invariant_frame program before _ invariant rfl rfl rfl rfl rfl
      invariant.processData (fun _ _ => rfl)
  case reachNoneEnd =>
    change reachNoneEndState? before _ = some after at fired
    simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, _, instanceId, _, fired⟩ := fired
    cases Option.some.inj fired
    exact sequentialScope_invariant_frame program before _ invariant rfl rfl rfl rfl rfl
      invariant.processData (fun _ _ => rfl)

end BpmnSemantics.SemanticProcess
