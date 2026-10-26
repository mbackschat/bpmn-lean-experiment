module

public import BpmnSemantics.SemanticProcess.SequentialScopeExecutionCertificate
public import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeValidityProofs
public import BpmnSemantics.SemanticProcess.SequentialScopeOrdinaryExecutionProofs
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission

/-! SMIS-ADMIT-01 preserves the joint execution certificate through repeated-body lifecycle and Human/effect command ingress. Ordinary execution is imported from its separate owner; scheduler history and readiness remain above both. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Actual Human ingress exchanges the selected blocked continuation while retaining body conservation and every Scope field. -/
theorem SequentialScopeBodyPortAccounting.user_completion (program : Program)
    (entry : ControlPlaceId) (body : ScopeOccurrenceId) (fired : List SemanticOperation)
    (before after : RuntimeState) (taskId : UserTaskInstanceId) (values : List VariableBinding)
    (accounting : SequentialScopeBodyPortAccounting entry body fired before)
    (completed : completeSequentialScopeUserTask? program before taskId values = some after) :
    ∃ wait variables, sequentialScopeTaskWaits before taskId = [wait] ∧
      after = { before with
        waits := before.waits.erase wait
        variables := variables
        tokens := addToken before.tokens wait.output wait.owner } ∧
      SequentialScopeBodyPortAccounting entry body fired after ∧
      (∀ queried place, ContinuationMarkingLaws.tokenCount after.tokens queried place =
        ContinuationMarkingLaws.tokenCount before.tokens queried place +
          ownedPortCount [wait.output] wait.owner queried place) := by
  obtain ⟨wait, variables, unique, rfl⟩ := sequentialScope_user_completion_frame program before after taskId values completed
  have present : wait ∈ before.waits := (List.mem_filter.mp
    (show wait ∈ sequentialScopeTaskWaits before taskId from by rw [unique]; simp)).1
  refine ⟨wait, variables, unique, rfl, ?_, ?_⟩
  · exact SequentialScopeBodyPortAccounting.exchange entry body fired before _ accounting
      (fun place => (human_port_exchange before wait variables present body place).1)
  · exact fun queried place => (human_port_exchange before wait variables present queried place).2

/-- Actual Service ingress exchanges the selected mapped-result continuation while retaining body conservation and every Scope field. -/
theorem SequentialScopeBodyPortAccounting.effect_completion (program : Program)
    (entry : ControlPlaceId) (body : ScopeOccurrenceId) (fired : List SemanticOperation)
    (before after : RuntimeState) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (accounting : SequentialScopeBodyPortAccounting entry body fired before)
    (completed : completeSequentialScopeEffect? program before effectId result = some after) :
    ∃ wait variables, before.effectWaits.filter (effectIdNamesWait effectId) = [wait] ∧
      after = { before with
        effectWaits := before.effectWaits.erase wait
        variables := variables
        tokens := addToken before.tokens wait.output wait.owner } ∧
      SequentialScopeBodyPortAccounting entry body fired after ∧
      (∀ queried place, ContinuationMarkingLaws.tokenCount after.tokens queried place =
        ContinuationMarkingLaws.tokenCount before.tokens queried place +
          ownedPortCount [wait.output] wait.owner queried place) := by
  obtain ⟨wait, variables, unique, rfl⟩ := sequentialScope_effect_completion_frame program before after effectId result completed
  have present : wait ∈ before.effectWaits := (List.mem_filter.mp
    (show wait ∈ before.effectWaits.filter (effectIdNamesWait effectId) from by rw [unique]; simp)).1
  refine ⟨wait, variables, unique, rfl, ?_, ?_⟩
  · exact SequentialScopeBodyPortAccounting.exchange entry body fired before _ accounting
      (fun place => (effect_port_exchange before wait variables present body place).1)
  · exact fun queried place => (effect_port_exchange before wait variables present queried place).2

/-- SMIS-ENTER-01 admits actual entry from the before-phase certificate and retains runtime validity, projectability and the data/ownership invariant. -/
theorem sequentialScope_before_entry_validity (program : Program)
    (control : SequentialScopeControl.Analysis) (data : SequentialScopeData.Analysis)
    (root : DefinitionScope) (before : RuntimeState) (hosting : SemanticId)
    (parentFired : List SemanticOperation)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (admitted : SequentialScopeProgram.admitted program = true)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting .before parentFired)
    (enabled : sequentialScopeEntryEnabled data.entry before ⟨hosting, root.id, 1⟩ = true) :
    ∃ result, enterSequentialScopeResult? data.entry before ⟨hosting, root.id, 1⟩ = some result ∧
      runtimeStateWellFormed program hosting result.state = true ∧
      (projectOpenFlowNodeOccurrences? program result.state).isSome = true ∧
      SequentialScopeBoundaryInvariant program result.state := by
  have noWork := sequentialScope_before_entry_no_work program data.entry root before hosting parentFired certificate enabled
  rcases certificate with ⟨wellFormed, projectable, invariant, census, _, _, _, _, _, running, forest, _, _⟩
  have entries := sequentialScope_analyzed_entry_census program data dataAnalyzed
  have declared : data.entry ∈ program.operations.filterMap sequentialScopeEntry? := by rw [entries]; simp
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
    exact wellFormed.1
  have present : ({placeId := data.entry.input, owner := ⟨hosting, root.id, 1⟩} : ControlToken) ∈ before.tokens := by
    apply ContinuationMarkingLaws.token_present
    simp only [sequentialScopeEntryEnabled, Bool.and_eq_true] at enabled
    exact of_decide_eq_true enabled.1.1.2
  obtain ⟨definition, lookup, parent, source, binding, ports, child, output⟩ :=
    sequentialScope_entry_static_binding program data.entry before hosting ⟨hosting, root.id, 1⟩ valid position running declared present
  have separated : ∀ operation ∈ program.operations, ∀ taskId,
      operationDeclaresWaitKey operation (userTaskWaitDeclarationKey taskId) = true → taskId.value ≠ data.entry.elementId.value := by
    intro operation member taskId declares same
    apply sequentialScopeEntry_task_separate program operation taskId valid member declares data.entry declared
    cases element : data.entry.elementId
    simpa only [element, NodeId.mk.injEq] using same
  have controllers := sequentialScopeStateValid_no_activities_no_controllers program before invariant.associations noWork.2.2
  obtain ⟨result, entered, nextInvariant⟩ := sequentialScope_invariant_entry program data before
    ⟨hosting, root.id, 1⟩ dataAnalyzed invariant enabled
  have retained := sequentialScope_entry_full_validity program hosting data.entry ⟨hosting, root.id, 1⟩ definition
    before result wellFormed projectable running admitted ⟨control, analyzed⟩ entries lookup parent source binding separated
    ports child output noWork ⟨census.1, census.2.2.1, census.2.2.2.1, census.2.2.2.2.2.1,
      census.2.2.2.2.2.2.1, census.2.2.2.2.1, controllers, census.2.2.2.2.2.2.2.1,
      census.2.2.2.2.2.2.2.2.1, census.2.2.2.2.2.2.2.2.2.1⟩ forest rfl entered
  exact ⟨result, entered, retained.1, retained.2, nextInvariant⟩

private theorem smis_before_entry_credit (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (before : RuntimeState) (hosting : SemanticId) (fired : List SemanticOperation)
    (certificate : SequentialScopeExecutionCertificateCore program entry root before hosting .before fired)
    (enabled : sequentialScopeEntryEnabled entry before ⟨hosting, root.id, 1⟩ = true) :
    ∀ place, continuationMarking before ⟨hosting, root.id, 1⟩ place =
      ownedPortCount [entry.input] ⟨hosting, root.id, 1⟩ ⟨hosting, root.id, 1⟩ place := by
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  have population := sequentialScope_before_parent_credit_bound program entry root before hosting fired certificate
  have noWork := sequentialScope_before_entry_no_work program entry root before hosting fired certificate enabled
  have member : ({placeId := entry.input, owner := parent} : ControlToken) ∈ before.tokens := by
    apply ContinuationMarkingLaws.token_present
    exact of_decide_eq_true (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp enabled).1).1).2
  have filtered : ({placeId := entry.input, owner := parent} : ControlToken) ∈
      before.tokens.filter (fun token => token.owner == parent) := List.mem_filter.mpr ⟨member, by simp⟩
  have positive := List.length_pos_of_mem filtered
  have count : (before.tokens.filter (fun token => token.owner == parent)).length = 1 := by
    dsimp only [parent] at positive ⊢
    omega
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp count
  rw [singleton, List.mem_singleton] at filtered
  rw [← filtered] at singleton
  intro place
  have exactPort := congrArg (fun tokens : List ControlToken =>
    (tokens.filter fun token => token.placeId == place).length) singleton
  by_cases same : entry.input = place
  all_goals simpa [List.filter_filter, List.filter_cons, List.filter_nil, continuationMarking, noWork.1, noWork.2.1,
    ownedPortCount, Bool.and_comm, parent, same] using exactPort

/-- SMIS-ENTER-01 transports the whole joint certificate to the released or first-body phase from admitted enabled entry. -/
theorem sequentialScope_before_entry_certificate (program : Program)
    (control : SequentialScopeControl.Analysis) (data : SequentialScopeData.Analysis)
    (root : DefinitionScope) (before : RuntimeState) (hosting : SemanticId) (fired : List SemanticOperation)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (admitted : SequentialScopeProgram.admitted program = true)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting .before fired)
    (enabled : sequentialScopeEntryEnabled data.entry before ⟨hosting, root.id, 1⟩ = true) :
    ∃ result, enterSequentialScopeResult? data.entry before ⟨hosting, root.id, 1⟩ = some result ∧
      SequentialScopeExecutionCertificateCore program data.entry root result.state hosting
        (match result with | .empty .. => .released | .first .. => .held) fired := by
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  obtain ⟨result, actual, nextValid, nextProjectable, nextInvariant⟩ :=
    sequentialScope_before_entry_validity program control data root before hosting fired valid analyzed dataAnalyzed admitted certificate enabled
  have entryCredit := smis_before_entry_credit program data.entry root before hosting fired certificate enabled
  have noWork := sequentialScope_before_entry_no_work program data.entry root before hosting fired certificate enabled
  rcases certificate with ⟨priorValid, _, invariant, census, provenance, initiation, unitStart, balance, _, running, forest, _, locals⟩
  change ∀ place, continuationMarking before parent place +
    (fired.map (fun operation => ownedPortCount (bodyConsumedPorts operation) parent parent place)).sum =
    (fired.map (fun operation => ownedPortCount (sequentialScopeParentProducedPorts operation) parent parent place)).sum at balance
  have delta := sequentialScope_entry_parent_credit data.entry hosting parent before result running actual
  have entered := actual
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  obtain ⟨items, _, entered⟩ := Option.bind_eq_some_iff.mp entered
  cases items with
  | nil =>
      cases Option.some.inj entered
      refine ⟨_, actual, nextValid, nextProjectable, nextInvariant, census, provenance, initiation, unitStart, ?_, ?_,
        running, forest, noWork.2.2, locals⟩
      · intro place
        have previous := balance place
        have exchange := delta place
        change continuationMarking _ parent place + _ + ownedPortCount [data.entry.input] parent parent place =
          _ + ownedPortCount [data.entry.normalOutput] parent parent place
        dsimp only [parent, SequentialScopeEntryResult.state] at previous exchange ⊢
        omega
      · intro operation _
        cases operation <;> simp [sequentialScopeTaskWaitingCount, SequentialScopeEntryResult.state, noWork.1, noWork.2.1]
  | cons item rest =>
      obtain ⟨⟨issued, child⟩, issuance, entered⟩ := Option.bind_eq_some_iff.mp entered
      obtain ⟨variables, _, entered⟩ := Option.bind_eq_some_iff.mp entered
      cases Option.some.inj entered
      have lifecycle := sequentialScope_first_entry_lifecycle program hosting data.entry parent before _
        priorValid running (sequentialScope_analyzed_entry_census program data dataAnalyzed)
        forest noWork.2.2 locals nextInvariant.associations actual
      obtain ⟨binding, bound, owner, nextForest, activities, nextLocals, counter, accounting⟩ := lifecycle
      have exhausted (after : RuntimeState)
          (exchange : ∀ place, continuationMarking after parent place + ownedPortCount [data.entry.input] parent parent place =
            continuationMarking before parent place + 0) : ∀ place, continuationMarking after parent place = 0 := by
        intro place
        have exchanged := exchange place
        have credit := entryCredit place
        dsimp only [parent] at exchanged ⊢
        omega
      have zero := exhausted _ delta
      unfold issueSequentialScope? at issuance
      simp only [running] at issuance
      split at issuance <;> try contradiction
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      refine ⟨_, actual, nextValid, nextProjectable, nextInvariant, census, provenance, initiation, unitStart, ?_, ?_,
        rfl, binding, [], bound, owner, nextForest, activities, nextLocals, counter, accounting, ?_, ?_, zero⟩
      · intro place
        have previous := balance place
        have credit := entryCredit place
        have emptyParent := zero place
        change continuationMarking _ parent place + _ + ownedPortCount [data.entry.input] parent parent place = _ + 0
        dsimp only [parent, SequentialScopeEntryResult.state] at previous credit emptyParent ⊢
        omega
      · intro operation _
        cases operation <;> simp [sequentialScopeTaskWaitingCount, SequentialScopeEntryResult.state, noWork.1, noWork.2.1]
      · intro operation impossible; contradiction
      · intro operation _
        cases operation <;> simp [sequentialScopeTaskWaitingCount, SequentialScopeEntryResult.state, noWork.1, noWork.2.1]

/-- Actual SMIS-END-01 completion preserves the whole joint certificate, releasing one parent output or resetting the next body's firing history. -/
theorem sequentialScope_held_completion_certificate (program : Program)
    (control : SequentialScopeControl.Analysis) (data : SequentialScopeData.Analysis)
    (root : DefinitionScope) (before : RuntimeState) (hosting : SemanticId)
    (parentFired : List SemanticOperation) (result : SequentialScopeCompletionResult)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (admitted : SequentialScopeProgram.admitted program = true)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting .held parentFired)
    (completed : completeSequentialScopeResult? data.entry before = some result) :
    SequentialScopeExecutionCertificateCore program data.entry root result.state hosting
      (match result with | .terminal .. => .released | .next .. => .held) parentFired := by
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  have priorCertificate := certificate
  rcases certificate with ⟨wellFormed, projectable, invariant, census, provenance, initiation, unitStart,
    balance, waiting, running, binding, fired, bound, owner, forest, elements, locals, counter,
    accounting, bodyProvenance, bodyWaiting, zero⟩
  have entries := sequentialScope_analyzed_entry_census program data dataAnalyzed
  have declared : data.entry ∈ program.operations.filterMap sequentialScopeEntry? := by rw [entries]; simp
  obtain ⟨activities, controllers, handlers⟩ := sequentialScope_binding_populations program data.entry before binding
    entries invariant.associations bound elements
  have completionFrame := sequentialScope_completion_frame data.entry before binding result bound completed
  have noWork := sequentialScope_held_completion_no_work program data.entry root before hosting parentFired binding
    priorCertificate bound completionFrame.1
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
    exact wellFormed.1
  have bodyFacts := sequentialScope_binding_body_data data.entry before binding bound
  have bodyParent := (sequentialScope_bound_controller_progress data.entry before binding bound).2.2
  obtain ⟨definition, lookup, _, _, staticBinding, ports, childOwned, outputOwned⟩ :=
    sequentialScope_live_body_static_binding program data.entry before hosting binding.activity.owner valid position running
      declared binding.body bodyFacts.2.2.1 bodyParent bodyFacts.2.2.2
  obtain ⟨exclusions, domain⟩ := sequentialScope_admitted_runtime_domain program control analyzed admitted
  have nextValid := sequentialScope_completion_full_validity program hosting data.entry definition before binding result
    wellFormed projectable running invariant entries bound (by simpa only [owner] using forest)
    activities controllers locals handlers (by simp [owner]) lookup
    (by intro child same; simpa only [scopeOperationBindingValid, same] using staticBinding child.activation)
    ports childOwned outputOwned noWork
    ⟨census.1, census.2.2.1, census.2.2.2.1, census.2.2.2.2.2.1, census.2.2.2.2.2.2.1,
      census.2.2.2.2.1, census.2.2.2.2.2.2.2.1, census.2.2.2.2.2.2.2.2.1, census.2.2.2.2.2.2.2.2.2.1⟩
    exclusions domain completed
  have nextInvariant := sequentialScope_completion_preserves_invariant program data.entry before result entries invariant completed
  have frame := sequentialScope_completion_state_frame data.entry before binding result bound completed
  have censusAfter : result.state.messageWaits = [] ∧ result.state.eventSubProcessMessageSubscriptions = [] ∧
      result.state.timerWaits = [] ∧ result.state.effectIncidents = [] ∧ result.state.selectedBranchSets = [] ∧
      result.state.eventRaces = [] ∧ result.state.calledProcessOccurrences = [] ∧ result.state.parallelScopeControllers = [] ∧
      result.state.sequentialMultiInstanceControllers = [] ∧ result.state.parallelMultiInstanceControllers = [] ∧
      result.state.compensationActivityRetentions = [] ∧ result.state.compensationParentContextRetentions = [] ∧
      result.state.compensationTriggers = [] ∧ result.state.compensationHandlerEffectWaits = [] := by
    rw [frame]
    exact census
  have initiationAfter : result.state.initiationPending = !(parentFired.any (fun operation => operation.kind == .initiate)) :=
    (congrArg RuntimeState.initiationPending frame).trans initiation
  have runningAfter : result.state.control = .running hosting := (congrArg RuntimeState.control frame).trans running
  have noWorkAfter : result.state.waits = [] ∧ result.state.effectWaits = [] := by rw [frame]; exact noWork
  have populations := sequentialScope_completion_populations data.entry before binding result bound
    (by simpa only [owner] using forest) activities controllers locals completed
  have credits := sequentialScope_completion_port_accounting program hosting data.entry before binding result
    wellFormed running declared bound counter completed
  have separated : binding.activity.owner.definitionScopeId ≠ data.entry.childScopeId := by
    intro same
    have rootMember : (⟨binding.activity.owner, none⟩ : RuntimeScopeOccurrence) ∈ before.scopeOccurrences :=
      forest.mem_iff.mpr (by simp [owner])
    have selected : (⟨binding.activity.owner, none⟩ : RuntimeScopeOccurrence) ∈ before.scopeOccurrences.filter
        (fun occurrence => occurrence.id.definitionScopeId == data.entry.childScopeId) :=
      List.mem_filter.mpr ⟨rootMember, by simp [same]⟩
    rw [sequentialScope_valid_body_census program data.entry before binding declared invariant.associations bound,
      List.mem_singleton] at selected
    have impossible := congrArg RuntimeScopeOccurrence.parent selected
    rw [bodyParent] at impossible
    contradiction
  change ∀ place, continuationMarking before parent place +
    (parentFired.map (fun operation => ownedPortCount (bodyConsumedPorts operation) parent parent place)).sum +
      ownedPortCount [data.entry.input] parent parent place =
    (parentFired.map (fun operation => ownedPortCount (sequentialScopeParentProducedPorts operation) parent parent place)).sum at balance
  cases result with
  | terminal retired after =>
      simp only [SequentialScopeCompletionResult.state] at *
      obtain ⟨_, _, _, scopes, records, _, afterLocals⟩ := populations
      obtain ⟨_, _, delta, _⟩ := credits
      refine ⟨nextValid.1, nextValid.2, nextInvariant, censusAfter, provenance, initiationAfter, unitStart, ?_, ?_,
        runningAfter, by simpa only [owner] using scopes, records, afterLocals⟩
      · intro place
        have previous := balance place
        have exchanged := delta parent place
        rw [owner] at exchanged
        change continuationMarking after parent place + _ + ownedPortCount [data.entry.input] parent parent place =
          _ + ownedPortCount [data.entry.normalOutput] parent parent place
        dsimp only [parent] at previous exchanged ⊢
        omega
      · intro operation _
        cases operation <;> simp [sequentialScopeTaskWaitingCount, noWorkAfter.1, noWorkAfter.2]
  | next retired after =>
      simp only [SequentialScopeCompletionResult.state] at *
      have retiredEq : retired = binding.body.id := populations.2.2.1
      subst retired
      obtain ⟨nextBinding, nextBound, nextOwner, nextForest, nextElements, nextLocals, nextCounter, nextAccounting⟩ :=
        sequentialScope_next_completion_lifecycle program hosting data.entry before after binding wellFormed running entries
          bound (by simpa only [owner] using forest) activities controllers locals
          (elements binding.activity (by rw [activities]; simp)) counter nextInvariant.associations completed
      have parentCredit := sequentialScope_next_parent_credit data.entry before after binding bound separated completed
      have zeroAfter : ∀ place, continuationMarking after parent place = 0 := by
        intro place
        have exchanged := parentCredit place
        rw [owner] at exchanged
        exact exchanged.trans (zero place)
      refine ⟨nextValid.1, nextValid.2, nextInvariant, censusAfter, provenance, initiationAfter, unitStart, ?_, ?_,
        runningAfter, nextBinding, [], nextBound, nextOwner.trans owner, ?_, nextElements, nextLocals, nextCounter,
        nextAccounting, ?_, ?_, zeroAfter⟩
      · intro place
        have previous := balance place
        change continuationMarking after parent place + _ + ownedPortCount [data.entry.input] parent parent place = _ + 0
        rw [zeroAfter]
        rw [zero] at previous
        simpa using previous
      · intro operation _
        cases operation <;> simp [sequentialScopeTaskWaitingCount, noWorkAfter.1, noWorkAfter.2]
      · simpa only [owner] using nextForest
      · intro operation impossible; contradiction
      · intro operation _
        cases operation <;> simp [sequentialScopeTaskWaitingCount, noWorkAfter.1, noWorkAfter.2]

private theorem smis_held_ingress_validity (program : Program)
    (control : SequentialScopeControl.Analysis) (data : SequentialScopeData.Analysis)
    (root : DefinitionScope) (before after : RuntimeState) (hosting : SemanticId) (parentFired : List SemanticOperation)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (admitted : SequentialScopeProgram.admitted program = true)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting .held parentFired)
    (completed : (∃ taskId values, completeSequentialScopeUserTask? program before taskId values = some after) ∨
      (∃ effectId result, completeSequentialScopeEffect? program before effectId result = some after)) :
    runtimeStateWellFormed program hosting after = true ∧ (projectOpenFlowNodeOccurrences? program after).isSome = true := by
  rcases certificate with ⟨wellFormed, projectable, invariant, census, _, _, _, _, _, running,
    binding, _, bound, owner, forest, elements, _, _, _, _, _, _⟩
  have entries := sequentialScope_analyzed_entry_census program data dataAnalyzed
  have activity := sequentialScope_binding_populations program data.entry before binding entries invariant.associations bound elements
  have shape : ∀ record ∈ before.activityOccurrences, ∃ child, record.body = .childScope child := by
    intro record member
    have same : record = binding.activity := by simpa [activity.1] using member
    exact ⟨binding.body.id, by rw [same]; exact (sequentialScope_binding_activity data.entry before binding bound).2⟩
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
    exact wellFormed.1
  have bodyParent := (sequentialScope_bound_controller_progress data.entry before binding bound).2.2
  have hosted := sequentialScope_position_hosting program hosting before ⟨hosting, root.id, 1⟩ position running rfl
    (by
      intro occurrence member
      have cases := forest.mem_iff.mp member
      simp only [List.mem_cons, List.not_mem_nil, or_false] at cases
      rcases cases with rfl | rfl
      · exact Or.inl rfl
      · exact Or.inr (bodyParent.trans (congrArg some owner)))
  have keys := sequentialScope_position_scope_keys program hosting before position running
  have rawKeys := sequentialScope_projectable_wait_keys program before hosting running projectable
    ⟨census.1, census.2.2.1, census.2.2.2.1⟩
  obtain ⟨exclusions, domain⟩ := sequentialScope_admitted_runtime_domain program control analyzed admitted
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  have flow := (projectOpenFlowNodeOccurrences_validities program before current hosting running projected).1
  have waitValid : flowNodeOccurrenceWaitProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at flow
    exact flow.1.1.2
  have ports := sequentialScope_ingress_output_ports program before valid waitValid
    (fun operation member => (domain operation member).2.1)
  exact sequentialScope_ingress_full_validity program hosting data before after wellFormed projectable running dataAnalyzed invariant
    shape ⟨census.1, census.2.2.1, census.2.2.2.1, census.2.2.2.2.2.1, census.2.2.2.2.2.2.1,
      census.2.2.2.2.1, census.2.2.2.2.2.2.2.1, census.2.2.2.2.2.2.2.2.1, census.2.2.2.2.2.2.2.2.2.1⟩
    exclusions domain hosted keys rawKeys ports completed

private theorem smis_held_ingress_certificate_frame (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (before after : RuntimeState) (hosting : SemanticId) (parentFired : List SemanticOperation)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (certificate : SequentialScopeExecutionCertificateCore program entry root before hosting .held parentFired)
    (validAfter : runtimeStateWellFormed program hosting after = true)
    (projectableAfter : (projectOpenFlowNodeOccurrences? program after).isSome = true)
    (invariantAfter : SequentialScopeBoundaryInvariant program after)
    (frame : after = { before with
      waits := after.waits, effectWaits := after.effectWaits,
      variables := after.variables, tokens := after.tokens })
    (owners : after.variables.scopes.map (·.owner) = before.variables.scopes.map (·.owner))
    (humans : after.waits.Sublist before.waits) (effects : after.effectWaits.Sublist before.effectWaits)
    (exchange : ∀ owner place, continuationMarking after owner place = continuationMarking before owner place) :
    SequentialScopeExecutionCertificateCore program entry root after hosting .held parentFired := by
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  rcases certificate with ⟨_, _, invariant, census, provenance, initiation, unitStart, balance, waiting,
    running, binding, fired, bound, owner, forest, elements, locals, counter, accounting,
    bodyProvenance, bodyWaiting, zero⟩
  have control := congrArg RuntimeState.control frame
  have activities := congrArg RuntimeState.activityOccurrences frame
  have scopes := congrArg RuntimeState.scopeOccurrences frame
  have controllers := congrArg RuntimeState.sequentialScopeControllers frame
  have counters := congrArg RuntimeState.scopeActivations frame
  obtain ⟨nextBinding, nextBound, nextController⟩ := sequentialScope_binding_owner_frame entry before after binding
    control activities scopes controllers owners bound
  have sameActivity : nextBinding.activity = binding.activity := by
    have prior := (sequentialScope_binding_activity entry before binding bound).1
    have next := (sequentialScope_binding_activity entry after nextBinding nextBound).1
    rw [activities, prior] at next
    exact (List.cons.inj next.symm).1
  have sameBody : nextBinding.body = binding.body := by
    have declared : entry ∈ program.operations.filterMap sequentialScopeEntry? := by rw [entries]; simp
    have prior := sequentialScope_valid_body_census program entry before binding declared invariant.associations bound
    have next := sequentialScope_valid_body_census program entry after nextBinding declared invariantAfter.associations nextBound
    rw [scopes, prior] at next
    exact (List.cons.inj next.symm).1
  have localLength : after.variables.scopes.length = 1 := by
    have lengths := congrArg List.length owners
    simpa [locals] using lengths
  obtain ⟨localFrame, localCensus⟩ := List.length_eq_one_iff.mp localLength
  have selected := (sequentialScope_binding_body_data entry after nextBinding nextBound).2.1
  have frameOwner : localFrame.owner = nextBinding.body.id := by
    have priorOwner := selectScopeVariables_exact_owner (sequentialScope_binding_body_data entry before binding bound).2.1
    simpa [localCensus, locals, sameBody, priorOwner] using owners
  have localEq : nextBinding.locals = localFrame := by
    simpa [selectScopeVariables?, localCensus, frameOwner] using selected.symm
  have censusAfter : after.messageWaits = [] ∧ after.eventSubProcessMessageSubscriptions = [] ∧ after.timerWaits = [] ∧
      after.effectIncidents = [] ∧ after.selectedBranchSets = [] ∧ after.eventRaces = [] ∧ after.calledProcessOccurrences = [] ∧
      after.parallelScopeControllers = [] ∧ after.sequentialMultiInstanceControllers = [] ∧ after.parallelMultiInstanceControllers = [] ∧
      after.compensationActivityRetentions = [] ∧ after.compensationParentContextRetentions = [] ∧ after.compensationTriggers = [] ∧
      after.compensationHandlerEffectWaits = [] := by rw [frame]; exact census
  refine ⟨validAfter, projectableAfter, invariantAfter, censusAfter, provenance,
    (congrArg RuntimeState.initiationPending frame).trans initiation, unitStart, ?_, ?_, control.trans running,
    nextBinding, fired, nextBound, by simpa only [sameActivity] using owner, ?_, ?_, ?_, ?_, ?_, bodyProvenance, ?_, ?_⟩
  · intro place
    rw [exchange]
    exact balance place
  · intro operation member
    exact Nat.le_trans (sequentialScopeTaskWaitingCount_sublist before after parent operation humans effects) (waiting operation member)
  · rw [scopes, sameBody]; exact forest
  · intro record member
    exact elements record (activities ▸ member)
  · rw [localEq]; exact localCensus
  · simpa only [sameBody, scopeActivationCount, counters] using counter
  · rw [sameBody]
    exact SequentialScopeBodyPortAccounting.exchange entry.childEntry binding.body.id fired before after accounting
      (exchange binding.body.id)
  · intro operation member
    rw [sameBody]
    exact Nat.le_trans (sequentialScopeTaskWaitingCount_sublist before after binding.body.id operation humans effects) (bodyWaiting operation member)
  · intro place
    rw [exchange]; exact zero place

private theorem smis_ingress_certificate (program : Program)
    (control : SequentialScopeControl.Analysis) (data : SequentialScopeData.Analysis)
    (root : DefinitionScope) (before after : RuntimeState) (hosting : SemanticId)
    (phase : SequentialScopeParentPhase) (parentFired : List SemanticOperation)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (admitted : SequentialScopeProgram.admitted program = true)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting phase parentFired)
    (completed : (∃ taskId values, completeSequentialScopeUserTask? program before taskId values = some after) ∨
      (∃ effectId result, completeSequentialScopeEffect? program before effectId result = some after)) :
    SequentialScopeExecutionCertificateCore program data.entry root after hosting phase parentFired := by
  have entries := sequentialScope_analyzed_entry_census program data dataAnalyzed
  rcases completed with ⟨taskId, values, completed⟩ | ⟨effectId, result, completed⟩
  · obtain ⟨wait, variables, selected, written, frame⟩ :=
      sequentialScope_user_completion_data_frame program before after taskId values completed
    have held := sequentialScope_write_certificate_held program data.entry root before hosting phase parentFired
      wait.owner values .userTask variables entries certificate written
    subst phase
    have nextValid := smis_held_ingress_validity program control data root before after hosting parentFired
      valid analyzed dataAnalyzed admitted certificate (Or.inl ⟨taskId, values, completed⟩)
    have nextInvariant := sequentialScope_invariant_user_completion program data before after taskId values dataAnalyzed
      certificate.2.2.1 completed
    have owners := sequentialScope_write_preserves_owner_census program before wait.owner values .userTask variables written
    have member : wait ∈ before.waits := by
      have present : wait ∈ sequentialScopeTaskWaits before taskId := by rw [selected]; simp
      exact (List.mem_filter.mp present).1
    subst after
    exact smis_held_ingress_certificate_frame program data.entry root before _ hosting parentFired entries certificate
      nextValid.1 nextValid.2 nextInvariant rfl owners List.erase_sublist (List.Sublist.refl _)
      (human_continuation_exchange before wait variables member)
  · obtain ⟨wait, values, variables, selected, _, written, frame⟩ :=
      sequentialScope_effect_completion_data_frame program before after effectId result completed
    have held := sequentialScope_write_certificate_held program data.entry root before hosting phase parentFired
      wait.owner values .serviceTask variables entries certificate written
    subst phase
    have nextValid := smis_held_ingress_validity program control data root before after hosting parentFired
      valid analyzed dataAnalyzed admitted certificate (Or.inr ⟨effectId, result, completed⟩)
    have nextInvariant := sequentialScope_invariant_effect_completion program data before after effectId result dataAnalyzed
      certificate.2.2.1 completed
    have owners := sequentialScope_write_preserves_owner_census program before wait.owner values .serviceTask variables written
    have member : wait ∈ before.effectWaits := by
      have present : wait ∈ before.effectWaits.filter (effectIdNamesWait effectId) := by rw [selected]; simp
      exact (List.mem_filter.mp present).1
    subst after
    exact smis_held_ingress_certificate_frame program data.entry root before _ hosting parentFired entries certificate
      nextValid.1 nextValid.2 nextInvariant rfl owners (List.Sublist.refl _) List.erase_sublist
      (effect_continuation_exchange before wait _ member)

/-- Actual body Human ingress preserves the same phase and complete certificate, including its unchanged firing histories. -/
theorem sequentialScope_user_completion_certificate (program : Program)
    (control : SequentialScopeControl.Analysis) (data : SequentialScopeData.Analysis)
    (root : DefinitionScope) (before after : RuntimeState) (hosting : SemanticId)
    (phase : SequentialScopeParentPhase) (parentFired : List SemanticOperation)
    (taskId : UserTaskInstanceId) (values : List VariableBinding)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (admitted : SequentialScopeProgram.admitted program = true)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting phase parentFired)
    (completed : completeSequentialScopeUserTask? program before taskId values = some after) :
    SequentialScopeExecutionCertificateCore program data.entry root after hosting phase parentFired :=
  smis_ingress_certificate program control data root before after hosting phase parentFired valid analyzed dataAnalyzed
    admitted certificate (Or.inl ⟨taskId, values, completed⟩)

/-- Actual mapped body effect ingress preserves the same phase and complete certificate after addressed local-data disposal. -/
theorem sequentialScope_effect_completion_certificate (program : Program)
    (control : SequentialScopeControl.Analysis) (data : SequentialScopeData.Analysis)
    (root : DefinitionScope) (before after : RuntimeState) (hosting : SemanticId)
    (phase : SequentialScopeParentPhase) (parentFired : List SemanticOperation)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (admitted : SequentialScopeProgram.admitted program = true)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting phase parentFired)
    (completed : completeSequentialScopeEffect? program before effectId result = some after) :
    SequentialScopeExecutionCertificateCore program data.entry root after hosting phase parentFired :=
  smis_ingress_certificate program control data root before after hosting phase parentFired valid analyzed dataAnalyzed
    admitted certificate (Or.inr ⟨effectId, result, completed⟩)


end BpmnSemantics.SemanticProcess
