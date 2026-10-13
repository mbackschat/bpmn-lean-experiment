import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability

/-! # Parent-spine continuation credit

The admitted parent spine advances one owned continuation credit through actual
parent work and consumes it at the terminal End after parallel return. Wait ingress retains that credit, which blocks ordinary
root completion. Each step takes an explicit cursor and its matching source
operation; the laws preserve token and blocked-wait credit together.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

/-- A positive real token-or-wait continuation blocks its owner's quiescence. -/
theorem continuationMarking_positive_nonquiescent (state : RuntimeState)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (positive : 0 < continuationMarking state owner place) : scopeQuiescent state owner = false := by
  cases quiet : scopeQuiescent state owner
  · rfl
  have emptyTokens : state.tokens.filter (fun token => token.owner == owner && token.placeId == place) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro token member selected
    have same : token.owner = owner := (by simpa only [Bool.and_eq_true, beq_iff_eq] using selected : token.owner = owner ∧ token.placeId = place).1
    exact (quiescent_scope_has_no_token state owner quiet token member) same
  have emptyHuman : state.waits.filter (fun wait => wait.owner == owner && wait.output == place) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro wait member selected
    have present : (state.waits.any fun current => current.owner == owner) = true :=
      List.any_eq_true.mpr ⟨wait, member, (by simpa only [Bool.and_eq_true] using selected : (wait.owner == owner) = true ∧ (wait.output == place) = true).1⟩
    simp [scopeQuiescent, present] at quiet
  have emptyEffect : state.effectWaits.filter (fun wait => wait.owner == owner && wait.output == place) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro wait member selected
    have present : (state.effectWaits.any fun current => current.owner == owner) = true :=
      List.any_eq_true.mpr ⟨wait, member, (by simpa only [Bool.and_eq_true] using selected : (wait.owner == owner) = true ∧ (wait.output == place) = true).1⟩
    simp [scopeQuiescent, present] at quiet
  simp [continuationMarking, emptyTokens, emptyHuman, emptyEffect] at positive

/-- Actual root completion cannot consume a state carrying the spine's one continuation credit. -/
theorem parent_spine_credit_refuses_completion (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (state : RuntimeState) (port : ControlPlaceId)
    (clean : ParallelScopeCleanEntry entry parent state)
    (credit : continuationMarking state parent port = 1) (output : Option ControlPlaceId) :
    completeScopeState? state parent.definitionScopeId output = none := by
  apply completeScopeState_refuses_nonquiescent state parent.definitionScopeId output ⟨parent, none⟩
  · simp [clean.1]
  · exact continuationMarking_positive_nonquiescent state parent port (by omega)

/-- An actual parent step advances one credit, or consumes it at the post-entry terminal End. -/
theorem parent_spine_body_credit_outcome (program : Program) (entryId : OperationId)
    (operations : List SemanticOperation) (input : ControlPlaceId) (operation : SemanticOperation)
    (tail : List SemanticOperation) {entered : Bool}
    (spine : ParentSpineTrace entryId operations input entered (operation :: tail))
    (before after : RuntimeState) (parent : ScopeOccurrenceId) (candidate : InternalOperationOccurrence)
    (owned : candidate.owner = parent)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (credit : ∀ place, continuationMarking before parent place = ownedPortCount [input] parent parent place) :
    (entered = true ∧ tail = [] ∧ ∀ place, continuationMarking after parent place = 0) ∨
    ∃ output, ParentSpineTrace entryId (operations.filter (·.id != operation.id)) output entered tail ∧
      ∀ place, continuationMarking after parent place = ownedPortCount [output] parent parent place := by
  cases spine with
  | finish _ _ id origin endInput selected empty =>
    have same : input = endInput := by
      have member := List.mem_filter.mp (selected.symm ▸ List.mem_singleton_self (SemanticOperation.reachNoneEnd id origin endInput))
      simpa [SequentialScopeControl.inputs, bodyConsumedPorts] using member.2
    subst endInput
    left
    refine ⟨rfl, rfl, ?_⟩
    intro place
    have balance := applyInternalOperationOccurrence_continuation_balance program before after candidate _ resolved kind applied parent place
    rw [owned, credit place] at balance
    simpa [bodyConsumedPorts, bodyProducedPorts, SequentialScopeControl.inputs, ownedPortCount] using balance
  | step _ _ output _ nextEntered _ _ selected edge rest =>
    have inputMember : input ∈ SequentialScopeControl.inputs operation := by
      have member : operation ∈ operations.filter (fun current => (SequentialScopeControl.inputs current).contains input) := by rw [selected]; simp
      exact List.contains_iff_mem.mp (List.mem_filter.mp member).2
    have ports : bodyConsumedPorts operation = [input] ∧ bodyProducedPorts operation = [output] ∧ nextEntered = entered := by
      cases operation <;> simp_all [ParentSpineStep, SemanticOperation.kind, SequentialScopeControl.inputs, bodyConsumedPorts, bodyProducedPorts]
      case awaitEffect =>
        split at edge <;> simp_all
    rw [ports.2.2] at rest
    right
    refine ⟨output, rest, ?_⟩
    intro place
    have balance := applyInternalOperationOccurrence_continuation_balance program before after candidate operation resolved kind applied parent place
    rw [owned, ports.1, ports.2.1, credit place] at balance
    omega

/-- A successful ordinary body step at the actual false-entry spine head advances its single credit to the next cursor. -/
theorem parent_spine_body_credit_advance (program : Program) (entryId : OperationId)
    (operations : List SemanticOperation) (input : ControlPlaceId) (operation : SemanticOperation)
    (tail : List SemanticOperation)
    (spine : ParentSpineTrace entryId operations input false (operation :: tail))
    (before after : RuntimeState) (parent : ScopeOccurrenceId) (candidate : InternalOperationOccurrence)
    (owned : candidate.owner = parent)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (credit : ∀ place, continuationMarking before parent place = ownedPortCount [input] parent parent place) :
    ∃ output, ParentSpineTrace entryId (operations.filter (·.id != operation.id)) output false tail ∧
      ∀ place, continuationMarking after parent place = ownedPortCount [output] parent parent place := by
  rcases parent_spine_body_credit_outcome program entryId operations input operation tail spine before after parent candidate owned resolved kind applied credit with terminal | remaining
  · simp at terminal
  · exact remaining

/-- Actual Human and successful Service ingress retain a current parent cursor, including rejected ingress. -/
theorem parent_spine_wait_credit_frame (program : Program) (state : RuntimeState)
    (parent : ScopeOccurrenceId) (input : ControlPlaceId) (stimulus : Stimulus)
    (selected : programSelected program = true) (wait : waitCompletionStimulus stimulus)
    (credit : ∀ place, continuationMarking state parent place = ownedPortCount [input] parent parent place) :
    ∀ place, continuationMarking (admitStimulus program state stimulus).state parent place = ownedPortCount [input] parent parent place := by
  cases stimulus <;> simp [waitCompletionStimulus] at wait
  · intro place
    rw [admitStimulus_parallel_scope_human_continuation_marking _ _ _ _ _ selected]
    exact credit place
  · rename_i result
    cases result <;> simp at wait
    intro place
    rw [admitStimulus_parallel_scope_effect_continuation_marking _ _ _ _ _ selected]
    exact credit place

/-- Successful body execution requires a real token on every input; the admitted dispatcher never enables an empty join. -/
theorem body_step_inputs_positive (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    (∃ input, input ∈ bodyConsumedPorts operation) ∧
      ∀ input ∈ bodyConsumedPorts operation, 0 < continuationMarking before candidate.owner input := by
  have positive (input : ControlPlaceId)
      (unit : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
      0 < continuationMarking before candidate.owner input := by
    have reordered : before.tokens.filter (fun token => token.owner == candidate.owner && token.placeId == input) =
        before.tokens.filter (fun token => token.placeId == input && token.owner == candidate.owner) := by
      simp only [Bool.and_comm]
    simp only [continuationMarking, reordered]
    omega
  cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control, bind] at applied <;> try contradiction
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  all_goals simp only [resolved, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    split at applied <;> try contradiction
    rename_i valid
    simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
    have unit : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
      have unitBool := congrArg Bool.not valid.1.1.1
      simp only [Bool.not_not, Bool.not_false] at unitBool
      exact beq_iff_eq.mp unitBool
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq] using positive input unit
  case awaitEffect id origin input output effect route =>
    split at applied <;> try contradiction
    rename_i valid
    simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
    have unit : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
      have unitBool := congrArg Bool.not valid.1.1.1
      simp only [Bool.not_not, Bool.not_false] at unitBool
      exact beq_iff_eq.mp unitBool
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq] using positive input unit
  case duplicate id origin input outputs =>
    split at applied <;> try contradiction
    rename_i unit
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq] using positive input (by simpa using unit)
  case reachNoneEnd id origin input =>
    split at applied <;> try contradiction
    rename_i unit
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq] using positive input (by simpa using unit)
  case synchronize id origin inputs output =>
    split at applied <;> try contradiction
    rename_i valid
    simp only [Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true, beq_iff_eq] at valid
    refine ⟨?_, ?_⟩
    · cases inputs with
      | nil => simp at valid
      | cons input rest => exact ⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩
    · intro input member
      exact positive input (valid.2 input member)

private theorem body_step_has_input (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ input ∈ bodyConsumedPorts operation, 0 < continuationMarking before candidate.owner input := by
  obtain ⟨⟨input, member⟩, positive⟩ := body_step_inputs_positive program before after candidate operation resolved kind applied
  exact ⟨input, member, positive input member⟩

/-- Actual successful body execution must select the admitted spine head when all parent continuation credit is at its declared cursor port. -/
theorem parent_spine_actual_body_head_eq (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operations : List SemanticOperation)
    (head : SemanticOperation) (tail : List SemanticOperation) (port : ControlPlace)
    (declared : port ∈ program.controlPlaces) {entered : Bool}
    (spine : ParentSpineTrace analysis.entry.id operations port.id entered (head :: tail))
    (population : ∀ operation ∈ operations, operation ∈ program.operations)
    (before after : RuntimeState) (parent : ScopeOccurrenceId) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (owned : candidate.owner = parent)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (credit : ∀ place, continuationMarking before parent place = ownedPortCount [port.id] parent parent place) :
    operation = head := by
  obtain ⟨input, consumed, positive⟩ := body_step_has_input program before after candidate operation resolved kind applied
  rw [owned, credit input] at positive
  have inputEq : input = port.id := by
    by_cases same : input = port.id
    · exact same
    simp [ownedPortCount, Ne.symm same] at positive
  rw [inputEq] at consumed
  have headMember : head ∈ operations ∧ port.id ∈ SequentialScopeControl.inputs head := by
    cases spine with
    | finish _ _ id origin input selected _ =>
      have member : SemanticOperation.reachNoneEnd id origin input ∈ operations.filter (fun current => (SequentialScopeControl.inputs current).contains port.id) := by rw [selected]; simp
      simpa only [List.mem_filter, List.contains_iff_mem] using member
    | step _ _ _ _ _ _ _ selected _ _ =>
      have member : head ∈ operations.filter (fun current => (SequentialScopeControl.inputs current).contains port.id) := by rw [selected]; simp
      simpa only [List.mem_filter, List.contains_iff_mem] using member
  have member := (resolveInternalOperationOccurrence_declaration program before candidate operation resolved).1
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp (analyzeProgram_place_incidence program analysis admitted port declared).2
  have lookup (current : SemanticOperation) (present : current ∈ program.operations)
      (input : port.id ∈ SequentialScopeControl.inputs current) : current.id = only := by
    have included : current.id ∈ program.operations.filterMap (fun operation =>
        if (SequentialScopeControl.inputs operation).contains port.id then some operation.id else none) :=
      List.mem_filterMap.mpr ⟨current, present, by simp [input]⟩
    rw [singleton] at included
    exact List.mem_singleton.mp included
  have same := same_declaration program analysis admitted operation head member (population head headMember.1)
    ((lookup operation member consumed).trans (lookup head (population head headMember.1) headMember.2).symm)
  exact same

/-- Actual successful body execution must select the admitted spine head when all parent continuation credit is at its declared cursor port. -/
theorem parent_spine_actual_body_head (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operations : List SemanticOperation)
    (head : SemanticOperation) (tail : List SemanticOperation) (port : ControlPlace)
    (declared : port ∈ program.controlPlaces)
    (spine : ParentSpineTrace analysis.entry.id operations port.id false (head :: tail))
    (population : ∀ operation ∈ operations, operation ∈ program.operations)
    (before after : RuntimeState) (parent : ScopeOccurrenceId) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (owned : candidate.owner = parent)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (credit : ∀ place, continuationMarking before parent place = ownedPortCount [port.id] parent parent place) :
    operation = head ∧ ∃ output,
      ParentSpineTrace analysis.entry.id (operations.filter (·.id != head.id)) output false tail ∧
      ∀ place, continuationMarking after parent place = ownedPortCount [output] parent parent place := by
  have same := parent_spine_actual_body_head_eq program analysis admitted operations head tail port declared spine population before after parent candidate operation owned resolved kind applied credit
  refine ⟨same, ?_⟩
  subst operation
  exact parent_spine_body_credit_advance program analysis.entry.id operations port.id head tail spine before after parent candidate owned resolved kind applied credit

/-- Actual Start and declared source initiation establish the clean one-credit cursor and block root completion. -/
theorem parent_spine_start_credit (program : Program) (entry : ParallelScopeEntry)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (parent : ScopeOccurrenceId) (ready initial : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (source : SemanticOperation.initiate id origin output ∈ program.operations)
    (selected : rootDefinitionScope? program = some root)
    (identity : parent = ⟨instanceId, root.id, 1⟩) (distinct : entry.childScopeId ≠ root.id)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) :
    ParallelScopeCleanEntry entry parent initial ∧
      (∀ place, continuationMarking initial parent place = ownedPortCount [output] parent parent place) ∧
      ∀ continuation, completeScopeState? initial parent.definitionScopeId continuation = none := by
  have parents := ParallelScopeParentHistory.start (program := program) (entry := entry) (parent := parent) instanceId root values ready selected started identity distinct
  have history := parents.initiate output ⟨id, origin, source⟩ initiated
  have clean := (history.clean_and_foreign_marking program entry parent initial).1
  have seed := (runningProgramStartState_parent_continuation_seed program entry instanceId values root parent
    ready initial output selected identity started initiated).2
  simp only [parentContinuationMarking, clean.2.2.1, List.filter_nil, List.length_nil, Nat.add_zero] at seed
  refine ⟨clean, seed, ?_⟩
  intro continuation
  apply parent_spine_credit_refuses_completion entry parent initial output clean _ continuation
  simpa [ownedPortCount] using seed output

private theorem cursor_declared (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operations : List SemanticOperation)
    (port : ControlPlaceId) (path : List SemanticOperation)
    (trace : ParentSpineTrace analysis.entry.id operations port false path)
    (population : ∀ operation ∈ operations, operation ∈ program.operations) :
    ∃ place ∈ program.controlPlaces, place.id = port := by
  cases trace with
  | step _ _ _ _ _ operation _ selected _ _ =>
    have member : operation ∈ operations.filter (fun current => (SequentialScopeControl.inputs current).contains port) := by rw [selected]; simp
    obtain ⟨present, input⟩ := List.mem_filter.mp member
    exact parent_input_declared program analysis admitted operation (population operation present) port (List.contains_iff_mem.mp input)

/-- Before entry the actual history is either awaiting initiation, or has one continuation at the remaining admitted spine cursor. -/
def ParallelScopeParentCursor (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (state : RuntimeState) : Prop :=
  (state.initiationPending = true ∧ ∀ owner place, continuationMarking state owner place = 0) ∨
    (state.initiationPending = false ∧ ∃ operations port path,
      port ∈ program.controlPlaces ∧ (∀ operation ∈ operations, operation ∈ program.operations) ∧
      ParentSpineTrace entry.id operations port.id false path ∧
      ∀ place, continuationMarking state parent place = ownedPortCount [port.id] parent parent place)

/-- Source-bound initiation, actual body selection and actual wait completion preserve the admitted false-entry cursor. -/
theorem ParallelScopeParentHistory.cursor (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (state : RuntimeState) (parents : ParallelScopeParentHistory program analysis.entry parent state) :
    ParallelScopeParentCursor program analysis.entry parent state := by
  induction parents with
  | start instanceId root values state selected started identity distinct =>
    left
    simp only [runningProgramStartState?, selected, bind, Option.bind_some, pure, Option.some.injEq] at started
    subst state
    simp [runningStartState, initialState, continuationMarking]
  | @initiate before after parents output source applied ih =>
    rcases ih with ⟨pending, zero⟩ | ⟨pending, cursor⟩
    · obtain ⟨root, operations, counts, start, completion, initialPort, path, _, parentEq, _, startSelected, _, startEq, trace, _, _, _, _, _⟩ := analyzeProgram_parent_spine program analysis admitted
      have startPresent : start ∈ operations := (List.mem_filter.mp (startSelected.symm ▸ (show start ∈ [start] from by simp))).1
      have population : ∀ operation ∈ operations, operation ∈ program.operations := by
        intro operation member
        rw [parentEq] at member
        exact (List.mem_filter.mp member).1
      have sourcePresent : SemanticOperation.initiate start.id start.origin initialPort ∈ program.operations := startEq ▸ population start startPresent
      obtain ⟨id, origin, declared⟩ := source
      have same := admitted_start_unique program analysis admitted id start.id origin start.origin output initialPort declared sourcePresent
      subst output
      have residual : ∀ operation ∈ operations.filter (fun operation => operation.id != start.id && operation.id != completion.id), operation ∈ program.operations := by
        intro operation member
        exact population operation (List.mem_filter.mp member).1
      obtain ⟨port, declaredPort, portEq⟩ := cursor_declared program analysis admitted _ initialPort path trace residual
      have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
      have root : rootScopeOccurrence? before = some parent := by simp [rootScopeOccurrence?, clean.1]
      simp only [initiateState?, root, pending, ↓reduceIte, bind, Option.bind_some, Option.some.injEq] at applied
      subst after
      right
      refine ⟨rfl, _, port, path, declaredPort, residual, ?_, ?_⟩
      · simpa only [portEq] using trace
      · intro place
        have count := addToken_filter_length before.tokens initialPort parent (fun token => token.owner == parent && token.placeId == place)
        have increment : ((addToken before.tokens initialPort parent).filter
            (fun token => token.owner == parent && token.placeId == place)).length =
            (before.tokens.filter (fun token => token.owner == parent && token.placeId == place)).length +
              ownedPortCount [initialPort] parent parent place := by
          by_cases same : initialPort = place <;> simpa [ownedPortCount, same] using count
        have beforeZero := zero parent place
        simp only [continuationMarking] at beforeZero ⊢
        rw [increment, portEq]
        omega
    · simp [initiateState?, pending] at applied
  | @body before after parents candidate operation resolved kind applied ih =>
    rcases ih with ⟨pending, zero⟩ | ⟨pending, operations, port, path, declared, population, trace, credit⟩
    · obtain ⟨input, _, positive⟩ := body_step_has_input program before after candidate operation resolved kind applied
      rw [zero] at positive
      omega
    · obtain ⟨_, _, _, _, _, owned, _, _, _, _⟩ := parents.pre_entry_occurrence_phases program analysis admitted parent before after candidate applied
      cases path with
      | nil => cases trace
      | cons head tail =>
        obtain ⟨_, output, remaining, nextCredit⟩ := parent_spine_actual_body_head program analysis admitted operations head tail port declared trace population before after parent candidate operation owned resolved kind applied credit
        have pendingFrame : after.initiationPending = before.initiationPending := by
          rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved kind applied with ⟨patch, _, _, equal⟩ | ⟨patch, increment, _, equal⟩
          · rw [equal]
            cases write : patch.write <;> simp [applyInternalArmingPatch, write]
          · rw [equal]
        have retained : ∀ operation ∈ operations.filter (·.id != head.id), operation ∈ program.operations := by
          intro operation member
          exact population operation (List.mem_filter.mp member).1
        obtain ⟨nextPort, nextDeclared, nextEq⟩ := cursor_declared program analysis admitted _ output tail remaining retained
        right
        refine ⟨pendingFrame.trans pending, _, nextPort, tail, nextDeclared, retained, ?_, ?_⟩
        · simpa only [nextEq] using remaining
        · simpa only [nextEq] using nextCredit
  | @human before after parents id values wait selected ordinary applied ih =>
    rcases ih with ⟨pending, zero⟩ | ⟨pending, operations, port, path, declared, population, trace, credit⟩
    · have member : wait ∈ before.waits := (List.mem_filter.mp (selected.symm ▸ (show wait ∈ [wait] from by simp))).1
      have present : wait ∈ before.waits.filter (fun current => current.owner == wait.owner && current.output == wait.output) := by simp [member]
      have positive := List.length_pos_of_mem present
      have noCredit := zero wait.owner wait.output
      simp only [continuationMarking] at noCredit
      omega
    · right
      refine ⟨(task_pending program before after id values applied).trans pending, operations, port, path, declared, population, trace, ?_⟩
      intro place
      rw [ParallelScopeCommand.completeTask_continuation_marking program before after id values applied]
      exact credit place
  | @service before after parents id values wait selected ordinary applied ih =>
    rcases ih with ⟨pending, zero⟩ | ⟨pending, operations, port, path, declared, population, trace, credit⟩
    · have member : wait ∈ before.effectWaits := (List.mem_filter.mp (selected.symm ▸ (show wait ∈ [wait] from by simp))).1
      have present : wait ∈ before.effectWaits.filter (fun current => current.owner == wait.owner && current.output == wait.output) := by simp [member]
      have positive := List.length_pos_of_mem present
      have noCredit := zero wait.owner wait.output
      simp only [continuationMarking] at noCredit
      omega
    · right
      refine ⟨(effect_pending program before after id (.success values) applied).trans pending, operations, port, path, declared, population, trace, ?_⟩
      intro place
      rw [ParallelScopeCommand.completeEffect_continuation_marking program before after id (.success values) applied]
      exact credit place

/-- Actual pre-entry parent history cannot complete its root, either before initiation or while its admitted spine credit remains. -/
theorem ParallelScopeParentHistory.refuses_root_completion (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (state : RuntimeState) (parents : ParallelScopeParentHistory program analysis.entry parent state)
    (output : Option ControlPlaceId) : completeSelectedScope? program state parent.definitionScopeId output = none := by
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted parent.definitionScopeId
  rw [completeSelectedScope?, unmonitored, completeBoundedScope_eq_completeScope_of_unbounded program state parent.definitionScopeId output unbounded]
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent state).1
  rcases parents.cursor program analysis admitted parent state with ⟨pending, _⟩ | ⟨_, operations, port, path, _, _, _, credit⟩
  · cases output <;> cases control : state.control <;> simp [completeScopeState?, clean.1, completeQuiescentScope?, pending, control]
  · exact parent_spine_credit_refuses_completion analysis.entry parent state port.id clean (by simpa [ownedPortCount] using credit port.id) output

/-- Actual pre-entry history excludes a root-completion record from successful evaluator replay. -/
theorem ParallelScopeParentHistory.no_root_completion_replay (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (record : InternalTransitionRecord) (kind : record.operationKind = .completeScope)
    (replayed : replayInternalOperationOccurrence? program before record = some after) : False := by
  obtain ⟨scopeId, output, scope, _, selected, _, completed⟩ :=
    replayed_scope_completion_execution program before after record kind replayed
  have present : scope ∈ before.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) := by
    rw [selected]
    simp
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have member := (List.mem_filter.mp present).1
  rw [clean.1] at member
  have same := List.mem_singleton.mp member
  have scopeEq : parent.definitionScopeId = scopeId := by
    simpa [same] using (List.mem_filter.mp present).2
  rw [← scopeEq, parents.refuses_root_completion program analysis admitted parent before output] at completed
  contradiction

private theorem parent_replayed_step (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (parents : ParallelScopeParentHistory program entry parent before) (record : InternalTransitionRecord)
    (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    ParallelScopeParentHistory program entry parent after := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ := replayInternalOperationOccurrence_sound program before after record replayed
    exact parents.body ⟨record.operationId, record.owner⟩ operation resolved (by simpa only [bodyTransition, metadata] using body) applied
  · obtain ⟨selectedEntry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    have empty := (parents.clean_and_foreign_marking program entry parent before).1.2.2.1
    cases control : before.control <;> simp [completeParallelScope?, parallelScopeBinding?, control, empty] at completed

private theorem ordered_parent_history (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before after : RuntimeState) (records : List CommittedTransition)
    (successors : List RuntimeState) (parents : ParallelScopeParentHistory program entry parent before)
    (length : successors.length = records.length) (last : (before :: successors).getLast? = some after)
    (aligned : ∀ pair ∈ records.zip ((before :: successors).zip successors), ∃ record,
      pair.1 = .internalOperation record ∧ replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ transition ∈ records, bodyOrRetirementTransition transition) :
    ParallelScopeParentHistory program entry parent after := by
  induction records generalizing before successors with
  | nil =>
    cases successors with
    | cons next rest => simp at length
    | nil => simp at last; subst after; exact parents
  | cons first rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, identity, replayed⟩ := aligned (first, before, next) (by simp)
      have nextParents := parent_replayed_step program entry parent before next parents record
        (identity ▸ kinds first (by simp)) replayed
      exact ih next tail nextParents (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun transition member => kinds transition (by simp [member]))

/-- Existing lifetime replay histories preserve an actual pre-entry parent history, including every wait command's ordered internal suffix. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.preserves_parent_history (program : Program)
    (entry : ParallelScopeEntry) (owner parent : ScopeOccurrenceId)
    (selected : programSelected program = true) (initial final : RuntimeState)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records)
    (parents : ParallelScopeParentHistory program entry parent initial) :
    ParallelScopeParentHistory program entry parent final := by
  induction history with
  | initial => exact parents
  | @internalStep before after earlier record history replayed kind outside ih =>
    exact parent_replayed_step program entry parent before after ih record kind replayed
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    obtain ⟨actualStimulus, actualRest, admitted, successors, shape, _, stateEq, length, last, aligned⟩ :=
      committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
    cases shape
    have ingress := ih.wait_admission program entry parent before stimulus selected completion
    rw [stateEq] at ingress
    exact ordered_parent_history program entry parent admitted after rest successors ingress length last aligned kinds

/-- Actual reserved-batch prefixes preserve the parent history together with the existing lifetime history; no publication or per-prefix invariant is assumed. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.reserved_batch_parent_history (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (initial before : RuntimeState) (earlier : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial before earlier)
    (parents : ParallelScopeParentHistory program analysis.entry parent initial)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (noCompensation : before.compensationHandlerEffectWaits = []) (different : owner ≠ parent) :
    (∀ n current, (before :: successors)[n]? = some current →
      current.compensationHandlerEffectWaits = [] ∧
      ParallelScopeParentHistory program analysis.entry parent current ∧
        ContinuationCommandHistory program owner initial current
          (earlier ++ (batch.members.take n).map reservedPatchTransition)) ∧
    (successors.getLast?.getD before).compensationHandlerEffectWaits = [] ∧
    ParallelScopeParentHistory program analysis.entry parent (successors.getLast?.getD before) ∧
      ContinuationCommandHistory program owner initial (successors.getLast?.getD before)
        (earlier ++ batch.members.map reservedPatchTransition) := by
  have beforeParents := history.preserves_parent_history program analysis.entry owner parent selected initial before earlier parents
  have frame := beforeParents.structural_frame program analysis.entry parent before
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [programSelected, beq_iff_eq] using selected
  obtain ⟨prefixes, final⟩ := history.extend_reserved_batch program owner parent initial before earlier batch successors applied
    (analyzeProgram_incidence_admission program analysis admitted).1 profile noCompensation frame different
  have endpoint : (before :: successors)[successors.length]? = some (successors.getLast?.getD before) := by
    have last := (List.getLast?_eq_getElem? (l := before :: successors)).symm.trans (List.getLast?_cons (a := before))
    simpa only [List.length_cons, Nat.add_sub_cancel] using last
  refine ⟨?_, (prefixes _ _ endpoint).2.1,
    final.preserves_parent_history program analysis.entry owner parent selected initial _ _ parents, final⟩
  intro n current endpoint
  have prefixHistory := (prefixes n current endpoint).2.2.2
  exact ⟨(prefixes n current endpoint).2.1,
    prefixHistory.preserves_parent_history program analysis.entry owner parent selected initial current _ parents, prefixHistory⟩

/-- Actual pre-entry selected execution extends both histories or exposes its exact initiation/entry record; root completion is derived impossible. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.extend_pre_entry_selected_execution
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (initial before after : RuntimeState) (earlier : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial before earlier)
    (parents : ParallelScopeParentHistory program analysis.entry parent initial)
    (noCompensation : before.compensationHandlerEffectWaits = []) (different : owner ≠ parent)
    (count : Nat)
    (executed : (∃ candidate, count = 1 ∧ applyInternalOperationOccurrence? program before candidate = some after) ∨
      (∃ batch successors, applyInternalOccurrenceBatch? program before batch = some successors ∧
        successors.length = count ∧ successors.getLast? = some after)) :
    ∃ added : List CommittedTransition, added.length = count ∧ after.compensationHandlerEffectWaits = [] ∧
      ((ParallelScopeParentHistory program analysis.entry parent after ∧
        ContinuationCommandHistory program owner initial after (earlier ++ added)) ∨
      ∃ record, added = [.internalOperation record] ∧
        replayInternalOperationOccurrence? program before record = some after ∧
        ((record.operationKind = .initiate ∧ ∃ output, initiateState? before output = some after ∧
            ParallelScopeParentHistory program analysis.entry parent after) ∨
          (record.operationKind = .enterParallelMultiInstanceScope ∧ enterParallelScope? analysis.entry before parent = some after))) := by
  have beforeParents := history.preserves_parent_history program analysis.entry owner parent selected initial before earlier parents
  rcases executed with ⟨candidate, countEq, applied⟩ | ⟨batch, successors, applied, countEq, last⟩
  · obtain ⟨operation, record, resolved, member, identity, owned, metadata, recordOwned, replayed, phases⟩ :=
      beforeParents.pre_entry_occurrence_phases program analysis admitted parent before after candidate applied
    have absent := applyInternalOperationOccurrence_compensation_absent program analysis admitted before after candidate applied noCompensation
    refine ⟨[.internalOperation record], by simp [countEq], absent, ?_⟩
    rcases phases with initiation | ⟨kind, nextParents⟩ | entry | ⟨terminal, _⟩
    · exact Or.inr ⟨record, rfl, replayed, Or.inl initiation⟩
    · left
      refine ⟨nextParents, history.internalStep replayed (Or.inl kind) ?_⟩
      intro retired
      simp [retired] at kind
    · exact Or.inr ⟨record, rfl, replayed, Or.inr entry⟩
    · exact False.elim (beforeParents.no_root_completion_replay program analysis admitted parent before after record terminal replayed)
  · obtain ⟨_, absent, nextParents, extended⟩ := history.reserved_batch_parent_history program analysis admitted owner parent selected
      initial before earlier parents batch successors applied noCompensation different
    obtain ⟨length, _⟩ := applyInternalOccurrenceBatch_ordered_steps program before batch successors applied
    refine ⟨batch.members.map reservedPatchTransition, ?_, ?_, Or.inl ?_⟩
    · simp only [List.length_map]
      omega
    · simpa only [last, Option.getD_some] using absent
    · constructor
      · simpa only [last, Option.getD_some] using nextParents
      · simpa only [last, Option.getD_some] using extended

/-- Before entry, the actual Start seed pays for one consumption and the reserved entry-output port pays for none. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.pre_entry_parent_base_port_balance
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    parentContinuationMarking analysis.entry parent final output +
      (records.map (transitionPortCharge program bodyConsumedPorts parent output)).sum = 1 ∧
    parentContinuationMarking analysis.entry parent final analysis.entry.normalOutput +
      (records.map (transitionPortCharge program bodyConsumedPorts parent analysis.entry.normalOutput)).sum = 0 := by
  obtain ⟨frame, seed⟩ := runningProgramStartState_parent_continuation_seed program analysis.entry instanceId values root parent
    ready initial output rootSelected parentIdentity started initiated
  have startBalance := history.parent_continuation_balance program analysis admitted owner parent selected initial final records frame output
  have normalBalance := history.parent_continuation_balance program analysis admitted owner parent selected initial final records frame analysis.entry.normalOutput
  have startZero := history.start_output_produced_charge_zero program analysis admitted owner parent selected initial final records
    startId origin output startDeclared
  have normalZero := history.entry_normal_produced_charge_zero program analysis admitted owner parent selected initial final records
  have different := admitted_start_output_ne_entry_normal program analysis admitted startId origin output startDeclared
  rw [seed output, startZero] at startBalance
  rw [seed analysis.entry.normalOutput, normalZero] at normalBalance
  simpa [ownedPortCount, different] using And.intro startBalance normalBalance

private theorem history_record_attribution (program : Program) (owner : ScopeOccurrenceId)
    (selected : programSelected program = true) (initial final : RuntimeState)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records) :
    ∀ record, .internalOperation record ∈ records →
      ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
        operation.id = record.operationId ∧ operation ∈ program.operations := by
  intro record member
  obtain ⟨operation, lookup, key, _, population⟩ := history.record_declaration_scope
    program owner selected initial final records record member
  exact ⟨operation, lookup, key, (List.mem_filter.mp population).1⟩

/-- Exact record attribution turns the pre-entry credit bound into a declaration bound at either base port. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.pre_entry_parent_base_port_firing
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (consumer : SemanticOperation) (consumerMember : consumer ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts consumer) :
    (place.id = output → declarationFiringCount records parent consumer.id ≤ 1) ∧
      (place.id = analysis.entry.normalOutput → declarationFiringCount records parent consumer.id = 0) := by
  have attributed := history_record_attribution program owner selected initial final records history
  obtain ⟨_, _, consumed, _⟩ := attributed_port_firing_counts program analysis admitted records parent
    attributed consumer consumerMember place declared input
  have balance := history.pre_entry_parent_base_port_balance program analysis admitted owner parent selected
    instanceId values root ready initial final startId origin output startDeclared rootSelected parentIdentity started initiated records
  constructor
  · intro startPort
    rw [startPort] at consumed
    omega
  · intro normalPort
    rw [normalPort] at consumed
    omega

/-- Admission and actual single-history conservation identify the predecessor paying for each parent declaration. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.pre_entry_parent_port_firing_budget
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial final : RuntimeState) (output : ControlPlaceId)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (consumer : SemanticOperation) (consumerMember : consumer ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts consumer) :
    ∃ producerId, producers program.operations place.id = [producerId] ∧
      parentContinuationMarking analysis.entry parent final place.id +
        declarationFiringCount records parent consumer.id ≤
      ownedPortCount [output] parent parent place.id + declarationFiringCount records parent producerId := by
  obtain ⟨producerId, unique, consumed, produced⟩ := attributed_port_firing_counts program analysis admitted records parent
    (history_record_attribution program owner selected initial final records history) consumer consumerMember place declared input
  obtain ⟨frame, seed⟩ := runningProgramStartState_parent_continuation_seed program analysis.entry instanceId values root parent
    ready initial output rootSelected parentIdentity started initiated
  have balance := history.parent_continuation_balance program analysis admitted owner parent selected initial final records frame place.id
  rw [seed place.id] at balance
  exact ⟨producerId, unique, by omega⟩

/-- The actual admitted parent spine fires each path declaration at most once before entry, without requiring a future entry or history. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.pre_entry_parent_path_firing_le_one
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∃ admittedRoot parentOperations start completion path,
      program.definitionScopes.filter (·.parentScopeId.isNone) = [admittedRoot] ∧
      parentOperations = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == admittedRoot.id)) ∧
      start = .initiate start.id start.origin output ∧ completion.kind = .completeScope ∧
      ParallelScopeStart.ParentSpineTrace analysis.entry.id
        (parentOperations.filter (fun operation => operation.id != start.id && operation.id != completion.id)) output false path ∧
      parentOperations.Perm (start :: path ++ [completion]) ∧ (path.map (·.id)).Nodup ∧
      ∀ consumer ∈ path, declarationFiringCount records parent consumer.id ≤ 1 := by
  obtain ⟨admittedRoot, parentOperations, start, completion, startOutput, path, roots, population,
    _, startEq, completionKind, trace, coverage, unique, members, predecessors⟩ := admitted_parent_input_predecessors program analysis admitted
  have startMember : start ∈ program.operations := by
    apply (List.mem_filter.mp (population ▸ (coverage.mem_iff.mpr (by simp)))).1
  have aligned := admitted_start_unique program analysis admitted startId start.id origin start.origin output startOutput startDeclared (by simpa only [← startEq] using startMember)
  have declared : ∀ operation ∈ path, operation ∈ program.operations := by
    intro operation member
    exact (List.mem_filter.mp (population ▸ members operation member)).1
  have bounded : ∀ rank, ∀ consumer ∈ path, (path.map (·.id)).idxOf consumer.id = rank →
      declarationFiringCount records parent consumer.id ≤ 1 := by
    intro rank
    induction rank using Nat.strongRecOn with
    | ind rank ih =>
      intro consumer member rankEq
      obtain ⟨port, input, source⟩ := predecessors consumer member
      obtain ⟨place, placeMember, placeEq⟩ := parent_input_declared program analysis admitted consumer (declared consumer member) port input
      have consumed : place.id ∈ bodyConsumedPorts consumer := by simpa only [placeEq, SequentialScopeControl.inputs, bodyConsumedPorts] using input
      have base := history.pre_entry_parent_base_port_firing program analysis admitted owner parent selected instanceId values root ready initial final
        startId origin output startDeclared rootSelected parentIdentity started initiated records consumer (declared consumer member) place placeMember consumed
      rcases source with seed | ⟨producer, earlier, middle, later, order, produced⟩
      · exact base.1 (placeEq.trans (seed.trans aligned.symm))
      · rcases produced with ordinary | reserved
        · by_cases first : port = output
          · exact base.1 (placeEq.trans first)
          by_cases normal : port = analysis.entry.normalOutput
          · have zero := base.2 (placeEq.trans normal)
            omega
          have producerMember : producer ∈ path := by rw [order]; simp
          have mapped : path.map (·.id) = earlier.map (·.id) ++ producer.id :: middle.map (·.id) ++ consumer.id :: later.map (·.id) := by simp [order]
          have lower := parent_predecessor_rank _ unique _ _ _ _ _ mapped
          have prior := ih _ (by omega) producer producerMember rfl
          obtain ⟨producerId, only, budget⟩ := history.pre_entry_parent_port_firing_budget program analysis admitted owner parent selected instanceId values root ready initial final
            output rootSelected parentIdentity started initiated records consumer (declared consumer member) place placeMember consumed
          have producerPresent := declared_output_producer program producer (declared producer producerMember) place.id (by simpa only [placeEq] using ordinary)
          rw [only] at producerPresent
          have identity := List.mem_singleton.mp producerPresent
          have noSeed : ownedPortCount [output] parent parent place.id = 0 := by simp [ownedPortCount, placeEq, Ne.symm first]
          rw [noSeed, ← identity] at budget
          omega
        · have zero := base.2 (placeEq.trans reserved.2)
          omega
  exact ⟨admittedRoot, parentOperations, start, completion, path, roots, population,
    by simpa only [← aligned] using startEq, completionKind, by simpa only [← aligned] using trace,
    coverage, unique, fun consumer member => bounded _ consumer member rfl⟩


end BpmnSemantics.SemanticProcess
