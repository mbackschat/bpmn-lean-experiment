import BpmnSemantics.SemanticProcess.CyclicControlFlowLaws
import BpmnSemantics.SemanticProcess.ActivityDataInputOutput
import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmissionProofs

/-! SPC-CONTINUE-01 follows the actual evaluator from a committed start through internal steps and accepted or rejected User Task completions. Admission excludes foreign operation families; the control-unit bound is derived at start and preserved across those transitions. -/

namespace BpmnSemantics.SemanticProcess.StructuredComposition

def ControlUnitBound (state : RuntimeState) : Prop :=
  state.tokens.length + state.waits.length + (if state.initiationPending then 1 else 0) ≤ 1

theorem enabled_token_under_bound_is_single
    (state : RuntimeState) (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (bounded : ControlUnitBound state) (found : onlyTokenOwner? state input = some owner) :
    ∃ token, state.tokens = [token] ∧ state.waits = [] ∧ state.initiationPending = false := by
  cases tokens : state.tokens with
  | nil => simp [onlyTokenOwner?, tokenOwners, tokens] at found
  | cons token rest =>
      cases pending : state.initiationPending with
      | false =>
        simp [ControlUnitBound, tokens, pending] at bounded
        have emptyRest : rest.length = 0 := by omega
        have emptyWaits : state.waits.length = 0 := by omega
        exact ⟨token, by simp [List.eq_nil_of_length_eq_zero emptyRest],
          List.eq_nil_of_length_eq_zero emptyWaits, rfl⟩
      | true => simp [ControlUnitBound, tokens, pending] at bounded

theorem live_token_under_bound_is_single
    (state : RuntimeState) (token : ControlToken)
    (bounded : ControlUnitBound state) (member : token ∈ state.tokens) :
    state.tokens = [token] ∧ state.waits = [] ∧ state.initiationPending = false := by
  cases tokens : state.tokens with
  | nil => simp [tokens] at member
  | cons first rest =>
      cases pending : state.initiationPending with
      | false =>
          simp [ControlUnitBound, tokens, pending] at bounded
          have noRest : rest = [] := List.eq_nil_of_length_eq_zero (by omega)
          have noWaits : state.waits = [] := List.eq_nil_of_length_eq_zero (by omega)
          have same : token = first := by simpa [tokens, noRest] using member
          exact ⟨by simp [noRest, same], noWaits, rfl⟩
      | true => simp [ControlUnitBound, tokens, pending] at bounded

theorem selected_scope_completion_delegates_to_root
    (program : Program) (state : RuntimeState) (scope : DefinitionScopeId)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation) :
    completeSelectedScope? program state scope none = completeScopeState? state scope none := by
  have noBounded : boundedScopeOperations program = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed]
  have noMonitored : monitoredScopeDefinitions program = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed]
  simp only [completeSelectedScope?, isMonitoredScopeDefinition, noMonitored, List.any_nil,
    Bool.false_eq_true, ↓reduceIte, completeBoundedScope?, boundedScopeDefinitionForChild?,
    noBounded, List.find?_nil]
  cases completeScopeState? state scope none <;> rfl

theorem root_completion_preserves_control_fields
    (program : Program) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation)
    (fired : fire? program (.completeScope id origin scope none) before = some after) :
    after.tokens = before.tokens ∧ after.waits = before.waits ∧
      after.initiationPending = before.initiationPending := by
  have step := fire_sound program _ before after fired
  cases step with
  | completeScope _ _ _ _ _ _ completed =>
      rw [selected_scope_completion_delegates_to_root program before scope allowed] at completed
      unfold completeScopeState? at completed
      split at completed
      · split at completed
        · contradiction
        · unfold completeQuiescentScope? at completed
          split at completed
          · split at completed
            · contradiction
            · cases Option.some.inj completed
              exact ⟨rfl, rfl, rfl⟩
          · contradiction
          · contradiction
      · contradiction

theorem initiation_creates_single_control_token
    (program : Program) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (noToken : before.tokens = [])
    (fired : fire? program (.initiate id origin output) before = some after) :
    after.tokens.length = 1 ∧ after.waits = before.waits ∧ after.initiationPending = false ∧
      ∃ token, after.tokens = [token] ∧ token.placeId = output := by
  have step := fire_sound program _ before after fired
  cases step with
  | initiate _ _ _ _ _ initiated =>
      simp only [initiateState?, bind, Option.bind_eq_some_iff] at initiated
      obtain ⟨owner, owned, initiated⟩ := initiated
      split at initiated
      · cases Option.some.inj initiated
        simp [noToken, addToken, canonicalInsertBy]
      · simp at initiated

theorem singleton_token_owner (state : RuntimeState) (token : ControlToken)
    (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (single : state.tokens = [token]) (found : onlyTokenOwner? state input = some owner) :
    token.placeId = input ∧ owner = token.owner := by
  by_cases matching : token.placeId = input
  · simp [onlyTokenOwner?, tokenOwners, single, matching] at found
    exact ⟨matching, found.symm⟩
  · simp [onlyTokenOwner?, tokenOwners, single, matching] at found

theorem data_arming_replaces_single_token_with_single_wait
    (program : Program) (before after : RuntimeState) (token : ControlToken)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) (directOutput : DirectActivityDataOutput)
    (single : before.tokens = [token]) (noWait : before.waits = [])
    (fired : fire? program
      (.awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput)
      before = some after) :
    after.tokens = [] ∧ after.waits.length = 1 ∧
      after.initiationPending = before.initiationPending ∧ token.placeId = input ∧
      ∀ wait ∈ after.waits, wait.task.id = taskId ∧ wait.output = output := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ activated =>
      simp only [activateDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at activated
      obtain ⟨owner, owned, instanceId, hosted, source, available, activated⟩ := activated
      obtain ⟨inputEq, ownerEq⟩ := singleton_token_owner before token input owner single owned
      split at activated
      · simp at activated
      · cases Option.some.inj activated
        simp [single, noWait, inputEq, ownerEq, removeToken, insertUserTaskWait]

theorem ordinary_arming_replaces_single_token_with_single_wait
    (program : Program) (before after : RuntimeState) (token : ControlToken)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (single : before.tokens = [token]) (noWait : before.waits = [])
    (fired : fire? program (.awaitUserTask id origin input output task) before = some after) :
    after.tokens = [] ∧ after.waits.length = 1 ∧
      after.initiationPending = before.initiationPending ∧ token.placeId = input ∧
      ∀ wait ∈ after.waits, wait.task.id = task.id ∧ wait.output = output := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitUserTask _ _ _ _ _ _ _ activated =>
      simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at activated
      obtain ⟨owner, owned, instanceId, hosted, activated⟩ := activated
      obtain ⟨inputEq, ownerEq⟩ := singleton_token_owner before token input owner single owned
      cases Option.some.inj activated
      simp [activateUserTask, single, noWait, inputEq, ownerEq, removeToken, insertUserTaskWait]

theorem selected_conditional_output_is_declared
    (candidates : List ConditionalCandidate) (defaultOutput output : ControlPlaceId)
    (bindings : List VariableBinding)
    (selected : selectConditionalOutput candidates defaultOutput bindings = some output) :
    output ∈ candidates.map (·.output) ++ [defaultOutput] := by
  induction candidates with
  | nil => simpa [selectConditionalOutput] using selected.symm
  | cons candidate rest ih =>
      simp only [selectConditionalOutput] at selected
      cases evaluated : evaluateSimpleBooleanExpression candidate.condition bindings with
      | none => simp [evaluated] at selected
      | some value =>
          cases value with
          | false =>
              have later := ih (by simpa [evaluated] using selected)
              exact List.mem_cons_of_mem _ later
          | true =>
              have same : candidate.output = output := by simpa [evaluated] using selected
              simp [← same]

theorem choice_preserves_single_control_token
    (program : Program) (before after : RuntimeState) (token : ControlToken)
    (id : OperationId) (origin : BpmnElementOrigin) (input defaultOutput : ControlPlaceId)
    (candidates : List ConditionalCandidate) (defaultOrigin : BpmnSequenceFlowOrigin)
    (single : before.tokens = [token])
    (fired : fire? program (.choose id origin input candidates defaultOutput defaultOrigin)
      before = some after) :
    after.tokens.length = 1 ∧ after.waits = before.waits ∧
      after.initiationPending = before.initiationPending ∧ token.placeId = input ∧
      ∃ next, after.tokens = [next] ∧
        next.placeId ∈ candidates.map (·.output) ++ [defaultOutput] := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  rw [fire_choose_withoutSnapshotDeclaration _ _ _ _ _ _ _ _ absent] at fired
  simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at fired
  obtain ⟨owner, owned, output, selected, fired⟩ := fired
  obtain ⟨inputEq, ownerEq⟩ := singleton_token_owner before token input owner single owned
  have declared := selected_conditional_output_is_declared candidates defaultOutput output _ selected
  cases Option.some.inj fired
  simpa [chooseToken, single, inputEq, ownerEq, removeToken, addToken, canonicalInsertBy] using declared

theorem none_end_consumes_single_control_token
    (program : Program) (before after : RuntimeState) (token : ControlToken)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (single : before.tokens = [token])
    (fired : fire? program (.reachNoneEnd id origin input) before = some after) :
    after.tokens = [] ∧ after.waits = before.waits ∧
      after.initiationPending = before.initiationPending := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  rw [fire_reachNoneEnd_withoutSnapshotDeclaration _ _ _ _ _ absent] at fired
  simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at fired
  obtain ⟨owner, owned, instanceId, hosted, fired⟩ := fired
  obtain ⟨inputEq, ownerEq⟩ := singleton_token_owner before token input owner single owned
  cases Option.some.inj fired
  simp [reachNoneEndToken, single, inputEq, ownerEq, removeToken]

theorem merge_moves_single_token_to_output
    (program : Program) (before after : RuntimeState) (token : ControlToken)
    (id : OperationId) (origin : BpmnElementOrigin)
    (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (single : before.tokens = [token])
    (fired : fire? program (.mergeExclusive id origin inputs output) before = some after) :
    token.placeId ∈ inputs ∧ after.waits = before.waits ∧
      ∃ next, after.tokens = [next] ∧ next.placeId = output := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
  unfold mergeExclusiveState? at fired
  split at fired
  · rename_i offered selected
    have included : offered ∈ exclusiveMergeInputTokens before inputs := by
      rw [selected]
      simp
    obtain ⟨member, matching⟩ := List.mem_filter.mp included
    have same : offered = token := by simpa [single] using member
    subst offered
    change inputs.contains token.placeId = true at matching
    cases Option.some.inj fired
    simpa [single, removeToken, addToken, canonicalInsertBy] using matching
  · contradiction

theorem merge_preserves_control_unit_count
    (program : Program) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin)
    (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (fired : fire? program (.mergeExclusive id origin inputs output) before = some after) :
    after.tokens.length + after.waits.length = before.tokens.length + before.waits.length := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
  exact mergeExclusiveState_preserves_active_unit_count before after inputs output fired

theorem admitted_fire_preserves_control_unit_bound
    (program : Program) (analysis : Analysis) (operation : SemanticOperation)
    (before after : RuntimeState)
    (analyzed : programAnalysis program = some analysis)
    (member : operation ∈ program.operations)
    (bounded : ControlUnitBound before)
    (fired : fire? program operation before = some after) : ControlUnitBound after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case initiate id origin output =>
    have pending : before.initiationPending = true := by
      have step := fire_sound program _ before after fired
      cases step with
      | initiate _ _ _ _ _ initiated =>
          obtain ⟨owner, owned, initiated⟩ := Option.bind_eq_some_iff.mp initiated
          by_cases pending : before.initiationPending = true
          · exact pending
          · simp [pending] at initiated
    have counts := bounded
    simp [ControlUnitBound, pending] at counts
    have noToken : before.tokens = [] := counts.1
    have noWait : before.waits = [] := counts.2
    obtain ⟨tokens, waits, pendingAfter, _⟩ :=
      initiation_creates_single_control_token program before after id origin output noToken fired
    simp [ControlUnitBound, tokens, waits, pendingAfter, noWait]
  case awaitUserTask id origin input output task =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    have active := fired
    rw [fire_awaitUserTask_withoutSnapshotDeclaration _ _ _ _ _ _ _ absent] at active
    obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
    obtain ⟨token, single, noWait, pending⟩ :=
      enabled_token_under_bound_is_single before input owner bounded owned
    obtain ⟨tokens, waits, pendingAfter, _⟩ := ordinary_arming_replaces_single_token_with_single_wait
      program before after token id origin input output task single noWait fired
    simp [ControlUnitBound, tokens, waits, pendingAfter, pending]
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    have owned : ∃ owner, onlyTokenOwner? before input = some owner := by
      have step := fire_sound program _ before after fired
      cases step with
      | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ active =>
          obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
          exact ⟨owner, owned⟩
    obtain ⟨owner, owned⟩ := owned
    obtain ⟨token, single, noWait, pending⟩ :=
      enabled_token_under_bound_is_single before input owner bounded owned
    obtain ⟨tokens, waits, pendingAfter, _⟩ := data_arming_replaces_single_token_with_single_wait
      program before after token id origin input output taskId taskName directInput directOutput
      single noWait fired
    simp [ControlUnitBound, tokens, waits, pendingAfter, pending]
  case choose id origin input candidates defaultOutput defaultOrigin =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    have active := fired
    rw [fire_choose_withoutSnapshotDeclaration _ _ _ _ _ _ _ _ absent] at active
    obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
    obtain ⟨token, single, noWait, pending⟩ :=
      enabled_token_under_bound_is_single before input owner bounded owned
    obtain ⟨tokens, waits, pendingAfter, _⟩ := choice_preserves_single_control_token
      program before after token id origin input defaultOutput candidates defaultOrigin single fired
    simp [ControlUnitBound, tokens, waits, pendingAfter, noWait, pending]
  case mergeExclusive id origin inputs output =>
    have count := merge_preserves_control_unit_count program before after id origin inputs output fired
    have pending : after.initiationPending = before.initiationPending := by
      have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
      have active := fired
      rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at active
      unfold mergeExclusiveState? at active
      split at active
      · cases Option.some.inj active
        rfl
      · contradiction
    simpa [ControlUnitBound, count, pending] using bounded
  case reachNoneEnd id origin input =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    have active := fired
    rw [fire_reachNoneEnd_withoutSnapshotDeclaration _ _ _ _ _ absent] at active
    obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
    obtain ⟨token, single, noWait, pending⟩ :=
      enabled_token_under_bound_is_single before input owner bounded owned
    obtain ⟨tokens, waits, pendingAfter⟩ :=
      none_end_consumes_single_control_token program before after token id origin input single fired
    simp [ControlUnitBound, tokens, waits, pendingAfter, noWait, pending]
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
        obtain ⟨tokens, waits, pending⟩ :=
          root_completion_preserves_control_fields program before after id origin scope allowed fired
        simpa [ControlUnitBound, tokens, waits, pending] using bounded

theorem live_wait_under_bound_is_single
    (state : RuntimeState) (wait : UserTaskWait)
    (bounded : ControlUnitBound state) (member : wait ∈ state.waits) :
    state.waits = [wait] ∧ state.tokens = [] ∧ state.initiationPending = false := by
  cases waits : state.waits with
  | nil => simp [waits] at member
  | cons first rest =>
      cases pending : state.initiationPending with
      | false =>
          simp [ControlUnitBound, waits, pending] at bounded
          have noRest : rest = [] := List.eq_nil_of_length_eq_zero (by omega)
          have noTokens : state.tokens = [] := List.eq_nil_of_length_eq_zero (by omega)
          have same : wait = first := by simpa [waits, noRest] using member
          exact ⟨by simp [noRest, same], noTokens, rfl⟩
      | true => simp [ControlUnitBound, waits, pending] at bounded

theorem ordinary_completion_preserves_control_unit_bound
    (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (bounded : ControlUnitBound before)
    (completed : completeUserTask before instanceId taskId activation = some after) :
    ControlUnitBound after := by
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · rename_i wait found
    obtain ⟨single, noTokens, pending⟩ := live_wait_under_bound_is_single before wait bounded
      (List.mem_of_find?_eq_some found)
    cases Option.some.inj completed
    simp [ControlUnitBound, single, noTokens, pending, addToken, canonicalInsertBy]

theorem data_completion_preserves_control_unit_bound
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (bounded : ControlUnitBound before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) : ControlUnitBound after := by
  simp only [completeDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at completed
  obtain ⟨running, hosted, contract, declared, filled, supplied, wait, found,
    record, joined, completed⟩ := completed
  obtain ⟨single, noTokens, pending⟩ := live_wait_under_bound_is_single before wait bounded
    (dataInputOutputTaskWait_facts found).1
  split at completed
  · simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨scope, scopeFound, variables, removed, completed⟩ := completed
    split at completed
    · obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
      cases Option.some.inj completed
      simp [ControlUnitBound, single, noTokens, pending, addToken, canonicalInsertBy]
    · contradiction
  · contradiction

private theorem completion_admission_dispatch_or_refusal
    (program : Program) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding) :
    admitStimulus program before (.completeUserTaskInstance commandId taskId bindings) =
      dispatchStimulus program before (.completeUserTaskInstance commandId taskId bindings) ∨
    admitStimulus program before (.completeUserTaskInstance commandId taskId bindings) =
      { outcome := .rejected, state := before } := by
  cases snapshots : program.compensationEventSubProcessSnapshots with
  | some declaration => exact Or.inr (by simp [admitStimulus, snapshots])
  | none =>
      simp [admitStimulus, dispatchStimulus, snapshots]
      grind

/-- SPC-COMMAND-01 shares exact completion provenance at actual admission. Graph analysis alone
cannot exclude PMIS profile dispatch; its two-scope admission rejects this one-scope structure. -/
theorem completion_admission_cases
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (analyzed : programAnalysis program = some analysis) :
    let result := admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)
    result = { outcome := .rejected, state := before } ∨
    (∃ after,
      completeDataInputOutputUserTask? program before taskId.processInstanceId
        ⟨taskId.elementId.value⟩ taskId.activation bindings = some after ∧
      processDataBindingsAdmitted program.identity.semanticProfile .userTaskCompletion bindings = true ∧
      result = { outcome := .committed, state := after }) ∨
    (∃ after,
      completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = some after ∧
      structuredCompositionOrdinaryCompletionAdmitted program taskId bindings = true ∧
      processDataBindingsAdmitted program.identity.semanticProfile .userTaskCompletion bindings = true ∧
      result = { outcome := .committed, state :=
        { after with variables := { after.variables with process :=
          { bindings := mergeProcessVariableBindings after.variables.process.bindings bindings } } } }) ∨
    (∃ after,
      completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = some after ∧
      isCallActivityProgram program = true ∧ bindings = [] ∧
      result = { outcome := .committed, state := after }) := by
  dsimp only
  obtain ⟨oneScope, _, noRetention, noSnapshots, _⟩ :=
    program_analysis_excludes_foreign_declarations program analysis analyzed
  cases selected : ParallelScopeStart.programSelected program with
  | true =>
      have unavailable : ParallelScopeStart.analyzeProgram program = none := by
        simp [ParallelScopeStart.analyzeProgram, oneScope]
      have refused : ParallelScopeCommand.stimulusAdmitted program before
          (.completeUserTaskInstance commandId taskId bindings) = false := by
        simp [ParallelScopeCommand.stimulusAdmitted, selected, unavailable]
      exact Or.inl (by simp [admitStimulus, noSnapshots, refused])
  | false =>
      rcases completion_admission_dispatch_or_refusal program before commandId taskId bindings
          with dispatched | refused
      · rw [dispatched]
        obtain ⟨noParallel, noSequential, noMessageMonitored, noMessageBounded, noBounded,
          noInput, noOutput, noMonitored⟩ :=
          admitted_completion_foreign_families_absent program analysis ⟨taskId.elementId.value⟩ analyzed
        have noRepeated owner : hasSequentialScopeDefinition program owner = false := by
          simp only [hasSequentialScopeDefinition, List.any_eq_false, List.mem_filterMap]
          rintro entry ⟨operation, member, projected⟩; have allowed := program_analysis_operations_allowed program analysis analyzed operation member
          cases operation <;> simp_all [OperationAllowed, sequentialScopeEntry?]
        have legacy : completeOrdinaryUserTaskWithCompensation? completeUserTask program before taskId =
            completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation := by
          simp [completeOrdinaryUserTaskWithCompensation?, compensationTargetDeclaredForFamily, noRetention]
        cases control : before.control <;>
          simp only [dispatchStimulus, noSnapshots] <;>
          simp [control, selected, noRepeated, noParallel, noSequential, noMessageMonitored, noMessageBounded,
            noBounded, noInput, noOutput, noMonitored, legacy]
        case running instanceId =>
          cases data : isDataInputOutputTaskDefinition program ⟨taskId.elementId.value⟩ with
          | true =>
              cases completed : completeDataInputOutputUserTask? program before
                  taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation bindings with
              | none => simp
              | some after =>
                  simp only [ite_true]
                  split
                  · rename_i accepted
                    exact Or.inr (Or.inl ⟨after, rfl, accepted.2, rfl⟩)
                  · exact Or.inl rfl
          | false =>
              cases completed : completeUserTask before taskId.processInstanceId
                  ⟨taskId.elementId.value⟩ taskId.activation with
              | none => simp
              | some after =>
                  simp only [Bool.false_eq_true, ite_false]
                  split
                  · rename_i accepted
                    exact Or.inr (Or.inr (Or.inl ⟨after, rfl, accepted.1.2, accepted.2, rfl⟩))
                  · split
                    · rename_i accepted
                      exact Or.inr (Or.inr (Or.inr ⟨after, rfl, accepted.1, accepted.2, rfl⟩))
                    · exact Or.inl rfl
      · exact Or.inl refused

theorem ordinary_completion_has_exact_continuation
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (bounded : ControlUnitBound before)
    (completed : completeUserTask before instanceId taskId activation = some after) :
    ∃ wait ∈ before.waits, ∃ next, wait.task.id = taskId ∧ after.waits = [] ∧
      after.tokens = [next] ∧ next.placeId = wait.output := by
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · rename_i wait found
    have live := List.mem_of_find?_eq_some found
    obtain ⟨single, noTokens, _⟩ := live_wait_under_bound_is_single before wait bounded live
    have matched := List.find?_some found
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched
    have sameTask : wait.task.id = taskId := congrArg TaskDefinitionId.mk matched.1.2.symm
    cases Option.some.inj completed
    refine ⟨wait, live, { placeId := wait.output, owner := wait.owner }, sameTask, ?_⟩
    simp [single, noTokens, addToken, canonicalInsertBy]

theorem data_completion_has_exact_continuation
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (bounded : ControlUnitBound before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation bindings = some after) :
    ∃ contract wait next, dataInputOutputTaskContract? program taskId = some contract ∧
      wait ∈ before.waits ∧ wait.task.id = taskId ∧ after.waits = [] ∧
      after.tokens = [next] ∧ next.placeId = contract.output := by
  simp only [completeDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at completed
  obtain ⟨running, hosted, contract, declared, filled, supplied, wait, found, record, joined, completed⟩ := completed
  have key := dataInputOutputTaskWait_facts found
  obtain ⟨single, noTokens, _⟩ := live_wait_under_bound_is_single before wait bounded key.1
  split at completed
  · rename_i accepted
    have output : wait.output = contract.output := by
      simp only [dataInputOutputRuntimeJoinValid, Bool.and_eq_true, decide_eq_true_eq] at accepted
      exact accepted.1.1.1.1.1.1
    simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨scope, scopeFound, variables, removed, completed⟩ := completed
    split at completed
    · obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
      cases Option.some.inj completed
      refine ⟨contract, wait, { placeId := wait.output, owner := wait.owner }, declared, key.1, key.2.2.1, ?_⟩
      simp [single, noTokens, addToken, canonicalInsertBy, output]
    · contradiction
  · contradiction

theorem rejected_completion_preserves_state
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (analyzed : programAnalysis program = some analysis)
    (refused : (admitStimulus program before
      (.completeUserTaskInstance commandId taskId bindings)).outcome = .rejected) :
    (admitStimulus program before
      (.completeUserTaskInstance commandId taskId bindings)).state = before := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with
    result | ⟨after, _, _, result⟩ | ⟨after, _, _, _, result⟩ | ⟨after, _, _, _, result⟩
  · rw [result]
  all_goals simp [result] at refused

theorem completion_admission_preserves_control_unit_bound
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (analyzed : programAnalysis program = some analysis)
    (bounded : ControlUnitBound before) :
    ControlUnitBound (admitStimulus program before
      (.completeUserTaskInstance commandId taskId bindings)).state := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with
    refused | ⟨after, completed, _, result⟩ | ⟨after, completed, _, _, result⟩ |
      ⟨after, completed, _, _, result⟩
  · simpa [refused] using bounded
  · rw [result]
    exact data_completion_preserves_control_unit_bound program before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings bounded completed
  · rw [result]
    exact ordinary_completion_preserves_control_unit_bound before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bounded completed
  · rw [result]
    exact ordinary_completion_preserves_control_unit_bound before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bounded completed

inductive TaskExecutionReachable (program : Program) (initial : RuntimeState) : RuntimeState → Prop where
  | initial : TaskExecutionReachable program initial initial
  | step {before after : RuntimeState} (choice : OperationId)
      (reachable : TaskExecutionReachable program initial before)
      (executed : SemanticProcess.step program before choice = some after) :
      TaskExecutionReachable program initial after
  | completion {before : RuntimeState}
      (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
      (reachable : TaskExecutionReachable program initial before) :
      TaskExecutionReachable program initial
        (admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)).state

theorem task_execution_reachable_preserves_control_unit_bound
    (program : Program) (analysis : Analysis) (initial reached : RuntimeState)
    (analyzed : programAnalysis program = some analysis)
    (initialBound : ControlUnitBound initial)
    (reachable : TaskExecutionReachable program initial reached) : ControlUnitBound reached := by
  induction reachable with
  | initial => exact initialBound
  | step choice reachable executed ih =>
      unfold SemanticProcess.step at executed
      split at executed
      · contradiction
      · rename_i operation selected
        exact admitted_fire_preserves_control_unit_bound program analysis operation _ _ analyzed
          (List.mem_of_find?_eq_some selected) ih executed
  | completion commandId taskId bindings reachable ih =>
      exact completion_admission_preserves_control_unit_bound program analysis _
        commandId taskId bindings analyzed ih

theorem committed_start_task_execution_has_at_most_one_control_unit
    (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (reached : RuntimeState)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state
      reached) : ControlUnitBound reached := by
  have fields := committed_initial_start_control_fields program commandId processId instanceId
    bindings profile committed
  apply task_execution_reachable_preserves_control_unit_bound program analysis _ reached analyzed _ reachable
  simp [ControlUnitBound, fields.1, fields.2.1, fields.2.2]

def RootOwnedControl (owner : ScopeOccurrenceId) (state : RuntimeState) : Prop :=
  (∀ occurrence ∈ state.scopeOccurrences, occurrence.id = owner) ∧
    (∀ token ∈ state.tokens, token.owner = owner) ∧
    (∀ wait ∈ state.waits, wait.owner = owner)

theorem selected_token_has_root_owner (state : RuntimeState) (owner selected : ScopeOccurrenceId)
    (input : ControlPlaceId) (owned : RootOwnedControl owner state) (bounded : ControlUnitBound state)
    (found : onlyTokenOwner? state input = some selected) : selected = owner := by
  obtain ⟨token, single, _⟩ := enabled_token_under_bound_is_single state input selected bounded found
  exact (singleton_token_owner state token input selected single found).2.trans
    (owned.2.1 token (by simp [single]))

theorem selected_root_has_root_owner (state : RuntimeState) (owner selected : ScopeOccurrenceId)
    (owned : RootOwnedControl owner state) (found : rootScopeOccurrence? state = some selected) :
    selected = owner := by
  unfold rootScopeOccurrence? at found
  split at found
  · rename_i occurrence chosen
    have member : occurrence ∈ state.scopeOccurrences.filter (·.parent.isNone) := by rw [chosen]; simp
    cases Option.some.inj found
    exact owned.1 occurrence (List.mem_filter.mp member).1
  · contradiction

theorem admitted_fire_preserves_root_ownership
    (program : Program) (analysis : Analysis) (before after : RuntimeState) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (analyzed : programAnalysis program = some analysis)
    (member : operation ∈ program.operations) (owned : RootOwnedControl owner before)
    (bounded : ControlUnitBound before) (fired : fire? program operation before = some after) :
    RootOwnedControl owner after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  have removed : ∀ input root, ∀ token ∈ removeToken before.tokens input root, token.owner = owner :=
    fun input root token present => owned.2.1 token ((removeToken_sublist _ _ _).subset present)
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
        obtain ⟨root, found, active⟩ := Option.bind_eq_some_iff.mp active
        have same := selected_root_has_root_owner before owner root owned found
        split at active
        · cases Option.some.inj active
          simpa [RootOwnedControl, addToken, mem_canonicalInsertBy, same] using owned
        · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
        simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, found, instanceId, _, active⟩ := active
        have same := selected_token_has_root_owner before owner root input owned bounded found
        cases Option.some.inj active
        simpa [RootOwnedControl, activateUserTask, removeToken, insertUserTaskWait_eq_canonicalInsertBy,
          mem_canonicalInsertBy, same] using
          And.intro owned.1 (And.intro (removed input owner) owned.2.2)
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    cases step with
    | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ active =>
        simp only [activateDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, found, instanceId, _, source, _, active⟩ := active
        have same := selected_token_has_root_owner before owner root input owned bounded found
        split at active
        · contradiction
        · cases Option.some.inj active
          simpa [RootOwnedControl, removeToken, insertUserTaskWait_eq_canonicalInsertBy,
            mem_canonicalInsertBy, same] using
            And.intro owned.1 (And.intro (removed input owner) owned.2.2)
  case choose id origin input candidates output defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
        simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, found, target, _, active⟩ := active
        have same := selected_token_has_root_owner before owner root input owned bounded found
        cases Option.some.inj active
        simpa [RootOwnedControl, chooseToken, removeToken, addToken, mem_canonicalInsertBy, same] using
          And.intro owned.1 (And.intro (removed input owner) owned.2.2)
  case mergeExclusive id origin inputs output =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
    unfold mergeExclusiveState? at fired
    split at fired
    · rename_i token chosen
      have member : token ∈ exclusiveMergeInputTokens before inputs := by rw [chosen]; simp
      have same := owned.2.1 token (List.mem_filter.mp member).1
      cases Option.some.inj fired
      simpa [RootOwnedControl, removeToken, addToken, mem_canonicalInsertBy, same] using
        And.intro owned.1 (And.intro (removed token.placeId owner) owned.2.2)
    · contradiction
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
        simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, _, instanceId, _, active⟩ := active
        cases Option.some.inj active
        simpa [RootOwnedControl, reachNoneEndToken, removeToken] using
          And.intro owned.1 (And.intro (removed input root) owned.2.2)
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        rw [selected_scope_completion_delegates_to_root program before scope allowed] at completed
        unfold completeScopeState? at completed
        split at completed
        · split at completed
          · contradiction
          · unfold completeQuiescentScope? at completed
            split at completed
            · split at completed
              · contradiction
              · cases Option.some.inj completed
                simpa [RootOwnedControl] using owned.2
            · contradiction
            · contradiction
        · contradiction

theorem ordinary_completion_preserves_root_ownership
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (owner : ScopeOccurrenceId) (owned : RootOwnedControl owner before)
    (completed : completeUserTask before instanceId taskId activation = some after) : RootOwnedControl owner after := by
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · rename_i wait found
    have same := owned.2.2 wait (List.mem_of_find?_eq_some found)
    cases Option.some.inj completed
    simp only [RootOwnedControl, addToken, mem_canonicalInsertBy, forall_eq_or_imp]
    exact ⟨owned.1, ⟨same, owned.2.1⟩, fun wait member => owned.2.2 wait (List.mem_of_mem_erase member)⟩

theorem data_completion_preserves_root_ownership
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (bindings : List VariableBinding) (owner : ScopeOccurrenceId)
    (owned : RootOwnedControl owner before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation bindings = some after) :
    RootOwnedControl owner after := by
  simp only [completeDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at completed
  obtain ⟨_, _, _, _, _, _, wait, found, _, _, completed⟩ := completed
  have same := owned.2.2 wait (dataInputOutputTaskWait_facts found).1
  split at completed
  · simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨_, _, _, _, completed⟩ := completed
    split at completed
    · obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
      cases Option.some.inj completed
      simp only [RootOwnedControl, addToken, mem_canonicalInsertBy, forall_eq_or_imp]
      exact ⟨owned.1, ⟨same, owned.2.1⟩, fun wait member => owned.2.2 wait (List.mem_of_mem_erase member)⟩
    · contradiction
  · contradiction

theorem completion_admission_preserves_root_ownership
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (owner : ScopeOccurrenceId) (analyzed : programAnalysis program = some analysis)
    (owned : RootOwnedControl owner before) : RootOwnedControl owner
      (admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)).state := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with refused |
    ⟨after, completed, _, result⟩ | ⟨after, completed, _, _, result⟩ | ⟨after, completed, _, _, result⟩
  · simpa [refused] using owned
  · rw [result]
    exact data_completion_preserves_root_ownership program before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings owner owned completed
  · rw [result]
    exact ordinary_completion_preserves_root_ownership before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation owner owned completed
  · rw [result]
    exact ordinary_completion_preserves_root_ownership before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation owner owned completed

theorem committed_start_has_root_owner
    (program : Program) (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (_profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∃ owner, RootOwnedControl owner (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state := by
  obtain ⟨_, variables, created⟩ := admitStimulus_committed_start_shape program
    (.startProcess commandId processId instanceId bindings) instanceId rfl committed
  simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
  obtain ⟨root, _, created⟩ := created
  have same := (Option.some.inj created).symm
  rw [same]
  exact ⟨{ processInstanceId := instanceId, definitionScopeId := root.id, activation := 1 },
    by simp [RootOwnedControl, runningStartState, initialState]⟩

theorem admitted_program_has_initiation
    (program : Program) (analysis : Analysis) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) :
    ∃ id origin output, SemanticOperation.initiate id origin output ∈ program.operations := by
  have count : (program.operations.filter (fun operation => match operation with
      | .initiate .. | .initiateMessage .. | .initiateTimer .. => true | _ => false)).length = 1 := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    exact of_decide_eq_true wellFormed.1.1.1.1.2
  obtain ⟨operation, singleton⟩ := List.length_eq_one_iff.mp count
  have selected : operation ∈ program.operations.filter (fun operation => match operation with
      | .initiate .. | .initiateMessage .. | .initiateTimer .. => true | _ => false) := by rw [singleton]; simp
  obtain ⟨member, kind⟩ := List.mem_filter.mp selected
  have allowed := program_analysis_operations_allowed program analysis analyzed operation member
  cases operation <;> simp only [OperationAllowed] at allowed
  all_goals try contradiction
  all_goals simp only at kind
  all_goals try contradiction
  exact ⟨_, _, _, member⟩

end BpmnSemantics.SemanticProcess.StructuredComposition
