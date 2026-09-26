import BpmnSemantics.SemanticProcess.TransactionCommandPhases
import BpmnSemantics.SemanticProcess.TransactionScopePhases

/-! # Transaction phase preservation

The complete role inventory connects actual attempted operations to the local continuation laws.
Scope shape and leaf ownership exclude a normal parent completion beside live child work.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics TransactionProgramRoles

private def continuationOperationFamily : SemanticOperation → Prop
  | .awaitUserTask .. | .reachNoneEnd .. | .cancelTransaction .. => True
  | _ => False

private theorem branch_operation_family (p : Program) (scope : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p scope place operations places)
    (operation : SemanticOperation) (member : operation ∈ operations) :
    continuationOperationFamily operation := by
  induction chain with
  | task current id origin input output task rest remaining placeOwned operationOwned consumer metadata tail ih =>
      simp only [List.mem_cons] at member
      rcases member with same | rest
      · subst operation; trivial
      · cases operation <;> first | trivial | exact ih rest
  | noneEnd current id origin input placeOwned operationOwned consumer =>
      have same : operation = .reachNoneEnd id origin input := by simpa using member
      subst operation; trivial
  | cancelEnd current id origin selectedScope input output boundary placeOwned operationOwned consumer =>
      have same : operation = .cancelTransaction id origin selectedScope input output boundary := by simpa using member
      subst operation; trivial

/-- Only the two reader-selected scope completions can contribute a normal continuation. -/
private theorem completion_output (p : Program) (roles : TransactionAdmittedRoles p)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (output : Option ControlPlaceId)
    (member : SemanticOperation.completeScope id origin scope output ∈ p.operations)
    (place : ControlPlaceId) (selected : output = some place) :
    TransactionContinuationPlace roles place := by
  have inventory := roles.operation_in_inventory _ member
  simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false] at inventory
  obtain ⟨startId, startOrigin, startShape⟩ := roles.startShape
  obtain ⟨entryId, entryOrigin, entryInput, entryShape⟩ := roles.entryShape
  obtain ⟨splitId, splitOrigin, splitInput, splitShape⟩ := roles.splitShape
  obtain ⟨rootId, rootOrigin, rootScope, rootShape⟩ := roles.rootCompleteShape
  obtain ⟨childId, childOrigin, childScope, childShape⟩ := roles.childCompleteShape
  obtain ⟨normalId, normalOrigin, normalInput, normalShape⟩ := roles.normalEndShape
  obtain ⟨ackId, ackOrigin, ackInput, ackTask, ackShape⟩ := roles.ackShape
  obtain ⟨endId, endOrigin, endInput, endShape⟩ := roles.ackEndShape
  have left := branch_operation_family p roles.child.id roles.left _ _ roles.left_chain (.completeScope id origin scope output)
  have right := branch_operation_family p roles.child.id roles.right _ _ roles.right_chain (.completeScope id origin scope output)
  simp only [startShape, entryShape, splitShape, rootShape, childShape, normalShape,
    ackShape, endShape, SemanticOperation.completeScope.injEq] at inventory
  have same : place = roles.normalOutput := by
    rcases inventory with (root | leftMember) | rightMember
    · simp only [reduceCtorEq, false_or, or_false] at root
      rcases root with root | child
      · simp [root.2.2.2] at selected
      · exact (Option.some.inj (selected.symm.trans child.2.2.2))
    · exact False.elim (left leftMember)
    · exact False.elim (right rightMember)
  subst place
  have places := roles.place_inventory_nodup
  simp only [List.cons_append, List.nil_append, List.nodup_cons] at places
  exact ⟨fun same => places.1 (by simp [← same]),
    fun same => places.2.1 (by simp [← same]), ⟨roles.normalEnd, roles.normalEndSelected⟩⟩

/-- The Transaction grammar admits no monitored or timer-bounded scope dispatcher. -/
theorem transaction_scope_completion_dispatch (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (state : RuntimeState)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    completeSelectedScope? p state scope output = completeScopeState? state scope output := by
  have monitored : monitoredScopeDefinitions p = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have family := transactionCancellationProgramGraph_operation_families p graph operation member
    cases operation <;> simp_all
  have bounded : boundedScopeOperations p = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have family := transactionCancellationProgramGraph_operation_families p graph operation member
    cases operation <;> simp_all
  simp only [completeSelectedScope?, isMonitoredScopeDefinition, monitored, List.any_nil,
    Bool.false_eq_true, ↓reduceIte, completeBoundedScope?, boundedScopeDefinitionForChild?, bounded,
    List.find?_nil]
  cases completeScopeState? state scope output <;> rfl

/-- Every actual continuation step preserves the one-token bound and stays beyond entry/split. -/
theorem transaction_continuation_internal_step (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (before after : RuntimeState)
    (phase : TransactionContinuationState roles before) (leaf : Option RuntimeScopeOccurrence)
    (shape : TransactionScopeShape roles before leaf) (owned : TransactionTokensAtLeaf before leaf)
    (operation : SemanticOperation) (member : operation ∈ p.operations)
    (applied : attemptInternalOperation p operation before = .applied { operation, successor := after }) :
    TransactionContinuationState roles after := by
  have family := transactionCancellationProgramGraph_operation_families p graph operation member
  have excluded := transaction_continuation_excludes_entry_and_split p roles before phase.tokenPlaces
  have inventory := roles.operation_in_inventory operation member
  have leftFamily := branch_operation_family p roles.child.id roles.left _ _ roles.left_chain operation
  have rightFamily := branch_operation_family p roles.child.id roles.right _ _ roles.right_chain operation
  cases operation <;> try contradiction
  case initiate id origin output =>
    rw [transaction_initiation_consumed p before id origin output roles.snapshotsAbsent phase.consumed] at applied
    contradiction
  case enterScope id origin input entry scope =>
    have same : SemanticOperation.enterScope id origin input entry scope = roles.entry := by
      obtain ⟨startId, startOrigin, startShape⟩ := roles.startShape
      obtain ⟨splitId, splitOrigin, splitInput, splitShape⟩ := roles.splitShape
      obtain ⟨rootId, rootOrigin, rootScope, rootShape⟩ := roles.rootCompleteShape
      obtain ⟨childId, childOrigin, childScope, childShape⟩ := roles.childCompleteShape
      obtain ⟨normalId, normalOrigin, normalInput, normalShape⟩ := roles.normalEndShape
      obtain ⟨ackId, ackOrigin, ackInput, ackTask, ackShape⟩ := roles.ackShape
      obtain ⟨endId, endOrigin, endInput, endShape⟩ := roles.ackEndShape
      simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false,
        startShape, splitShape, rootShape, childShape, normalShape, ackShape, endShape,
        reduceCtorEq, false_or, or_false] at inventory
      rcases inventory with (selected | onLeft) | onRight
      · exact selected
      · exact False.elim (leftFamily onLeft)
      · exact False.elim (rightFamily onRight)
    rw [same, excluded.1] at applied
    contradiction
  case duplicate id origin input outputs =>
    have same : SemanticOperation.duplicate id origin input outputs = roles.split := by
      obtain ⟨startId, startOrigin, startShape⟩ := roles.startShape
      obtain ⟨entryId, entryOrigin, entryInput, entryShape⟩ := roles.entryShape
      obtain ⟨rootId, rootOrigin, rootScope, rootShape⟩ := roles.rootCompleteShape
      obtain ⟨childId, childOrigin, childScope, childShape⟩ := roles.childCompleteShape
      obtain ⟨normalId, normalOrigin, normalInput, normalShape⟩ := roles.normalEndShape
      obtain ⟨ackId, ackOrigin, ackInput, ackTask, ackShape⟩ := roles.ackShape
      obtain ⟨endId, endOrigin, endInput, endShape⟩ := roles.ackEndShape
      simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false,
        startShape, entryShape, rootShape, childShape, normalShape, ackShape, endShape,
        reduceCtorEq, false_or, or_false] at inventory
      rcases inventory with (selected | onLeft) | onRight
      · exact selected
      · exact False.elim (leftFamily onLeft)
      · exact False.elim (rightFamily onRight)
    rw [same, excluded.2] at applied
    contradiction
  case awaitUserTask id origin input output task =>
    simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at applied
    change (match awaitUserTaskState? before input output task with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _ at applied
    cases selected : awaitUserTaskState? before input output task with
    | none => simp [selected] at applied
    | some successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      exact transaction_continuation_task_attempt p roles before after phase id origin input output task member selected
  case reachNoneEnd id origin input =>
    simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at applied
    change (match reachNoneEndState? before input with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _ at applied
    cases selected : reachNoneEndState? before input with
    | none => simp [selected] at applied
    | some successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      exact transaction_continuation_none_end p roles before after phase input selected
  case completeScope id origin scope output =>
    have empty := transaction_scope_completion_requires_empty_tokens p roles before leaf shape owned
      id origin scope output _ applied
    simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at applied
    change (match completeSelectedScope? p before scope output with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _ at applied
    rw [transaction_scope_completion_dispatch p graph] at applied
    cases selected : completeScopeState? before scope output with
    | none => simp [selected] at applied
    | some successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      exact transaction_continuation_scope_completion p roles before after phase scope output empty
        (completion_output p roles id origin scope output member) selected
  case cancelTransaction id origin scope input output boundary =>
    have same : SemanticOperation.cancelTransaction id origin scope input output boundary = roles.cancel := by
      have membership := congrArg
        (fun operations => SemanticOperation.cancelTransaction id origin scope input output boundary ∈ operations)
        (unique_exact _ _ roles.cancelSelected)
      simp only [List.mem_filter, List.mem_singleton] at membership
      exact Eq.mp membership ⟨member, trivial⟩
    have outputEq : output = roles.cancelOutput := by
      obtain ⟨selectedId, selectedOrigin, selectedInput, selectedBoundary, cancelShape⟩ := roles.cancelShape
      rw [cancelShape] at same
      cases same
      rfl
    have continuation : TransactionContinuationPlace roles output := by
      rw [outputEq]
      exact transaction_cancel_output_is_continuation p roles
    simp only [attemptInternalOperation, roles.executionPresent] at applied
    cases selected : attemptTransactionCancellation p
        (.cancelTransaction id origin scope input output boundary) before with
    | disabled successor => simp [selected] at applied
    | refused reason => simp [selected] at applied
    | applied successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      obtain ⟨compensating, step⟩ := attemptTransactionCancellation_sound p _ before after selected
      exact transaction_continuation_cancel_step p roles before after phase id origin scope input output boundary
        compensating continuation step

private theorem continuation_consumer_family (p : Program) (roles : TransactionAdmittedRoles p)
    (place : ControlPlaceId) (later : TransactionContinuationPlace roles place)
    (operation : SemanticOperation) (selected : soleConsumer? p place = some operation) :
    continuationOperationFamily operation := by
  obtain ⟨member, input⟩ := soleConsumer_facts p place operation selected
  have inventory := roles.operation_in_inventory operation member
  simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false] at inventory
  rcases inventory with (rolesMember | leftMember) | rightMember
  · rcases rolesMember with start | entry | split | root | child | normal | ack | endNode
    · subst operation
      obtain ⟨id, origin, shape⟩ := roles.startShape
      rw [shape] at input
      change (none : Option ControlPlaceId) = some place at input
      contradiction
    · subst operation
      have first := (soleConsumer_facts p roles.first roles.entry roles.entrySelected).2
      exact False.elim (later.1 (Option.some.inj (input.symm.trans first)))
    · subst operation
      have first := (soleConsumer_facts p roles.childEntry roles.split roles.splitSelected).2
      exact False.elim (later.2.1 (Option.some.inj (input.symm.trans first)))
    · subst operation
      obtain ⟨id, origin, scope, shape⟩ := roles.rootCompleteShape
      rw [shape] at input
      change (none : Option ControlPlaceId) = some place at input
      contradiction
    · subst operation
      obtain ⟨id, origin, scope, shape⟩ := roles.childCompleteShape
      rw [shape] at input
      change (none : Option ControlPlaceId) = some place at input
      contradiction
    · subst operation
      obtain ⟨id, origin, input, shape⟩ := roles.normalEndShape
      rw [shape]; trivial
    · subst operation
      obtain ⟨id, origin, input, task, shape⟩ := roles.ackShape
      rw [shape]; trivial
    · subst operation
      obtain ⟨id, origin, input, shape⟩ := roles.ackEndShape
      rw [shape]; trivial
  · cases operation <;> exact branch_operation_family p roles.child.id roles.left _ _ roles.left_chain _ leftMember
  · cases operation <;> exact branch_operation_family p roles.child.id roles.right _ _ roles.right_chain _ rightMember

private theorem frontier_without_refusal_ne_refused (p : Program) (state : RuntimeState)
    (operation : SemanticOperation) (member : operation ∈ p.operations)
    (absent : (snapshotInternalTransitionFrontier p state).refusal = none)
    (reason : InternalOperationRefusal) :
    attemptInternalOperation p operation state ≠ .refused operation reason := by
  intro refused
  change canonicalInternalOperationRefusal? _ = none at absent
  unfold canonicalInternalOperationRefusal? at absent
  have absentEach := List.findSome?_eq_none_iff.mp absent
  have selected := absentEach (attemptInternalOperation p operation state)
    ((InternalCommutation.mem_sortBy _ _ _).mpr (List.mem_map.mpr ⟨operation, member, rfl⟩))
  simp [refused] at selected

private theorem cancellation_with_token_not_disabled (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
    (running : state.control = .running instanceId) (id : OperationId) (origin : BpmnElementOrigin)
    (scope : DefinitionScopeId) (input output : ControlPlaceId) (boundary : NodeId)
    (token : onlyTokenOwner? state input = some owner) (returned : RuntimeState) :
    attemptTransactionCancellation p (.cancelTransaction id origin scope input output boundary) state ≠
      .disabled returned := by
  intro disabled
  unfold attemptTransactionCancellation at disabled
  simp only [roles.executionPresent, running, token] at disabled
  repeat' (split at disabled <;> try dsimp only at disabled)
  all_goals first
    | contradiction
    | (change (if compensationTriggerHandlerStateValid p _ then CompensationTriggerAttempt.applied _
          else CompensationTriggerAttempt.refused .invalidState) = .disabled returned at disabled
       split at disabled <;> contradiction)

/-- A running continuation cannot commit with an unconsumed token: its sole consumer applies or refuses. -/
theorem transaction_stable_continuation_tokens_empty (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (phase : TransactionContinuationState roles state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (stable : (snapshotInternalTransitionFrontier p state).transitions = [])
    (noRefusal : (snapshotInternalTransitionFrontier p state).refusal = none) :
    state.tokens = [] := by
  cases tokens : state.tokens with
  | nil => rfl
  | cons token rest =>
    have bound := phase.tokenBound
    have empty : rest = [] := by cases rest <;> simp_all
    subst rest
    have present : token ∈ state.tokens := by simp [tokens]
    have later := phase.tokenPlaces token present
    obtain ⟨operation, selected⟩ := later.2.2
    obtain ⟨member, input⟩ := soleConsumer_facts p token.placeId operation selected
    have family := continuation_consumer_family p roles token.placeId later operation selected
    have owner : onlyTokenOwner? state token.placeId = some token.owner := by
      simp [onlyTokenOwner?, tokenOwners, tokens]
    have cannotApply (after : RuntimeState)
        (applied : attemptInternalOperation p operation state = .applied { operation, successor := after }) : False := by
      have offered := (transaction_frontier_attempt_iff p state operation after).mpr ⟨member, applied⟩
      simp [stable] at offered
    exfalso
    cases operation <;> try contradiction
    case awaitUserTask id origin inputPlace output task =>
      have same : inputPlace = token.placeId := Option.some.inj input
      subst inputPlace
      exact cannotApply (activateUserTask state token.owner.processInstanceId token.owner token.placeId output task) (by
        simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent]
        change (match awaitUserTaskState? state token.placeId output task with
          | none => InternalOperationAttempt.disabled _
          | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
        simp [awaitUserTaskState?, owner, runningInstance?, running])
    case reachNoneEnd id origin inputPlace =>
      have same : inputPlace = token.placeId := Option.some.inj input
      subst inputPlace
      exact cannotApply (reachNoneEndToken state token.owner token.placeId) (by
        simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent]
        change (match reachNoneEndState? state token.placeId with
          | none => InternalOperationAttempt.disabled _
          | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
        simp [reachNoneEndState?, owner, runningInstance?, running])
    case cancelTransaction id origin scope inputPlace output boundary =>
      have same : inputPlace = token.placeId := Option.some.inj input
      subst inputPlace
      cases attempted : attemptTransactionCancellation p
          (.cancelTransaction id origin scope token.placeId output boundary) state with
      | disabled returned =>
        exact False.elim (cancellation_with_token_not_disabled p roles state instanceId token.owner running
          id origin scope token.placeId output boundary owner returned attempted)
      | applied after =>
        exact cannotApply after (by simp [attemptInternalOperation, roles.executionPresent, attempted])
      | refused reason =>
        exact False.elim (frontier_without_refusal_ne_refused p state _ member noRefusal
          (.compensationTrigger reason) (by simp [attemptInternalOperation, roles.executionPresent, attempted]))

/-- A successful batch is a sequence of the same refusal-free actual steps used by prefix induction. -/
theorem transaction_successful_batch_preserves_phase (p : Program) (commandId : SemanticId)
    (phase : RuntimeState → Prop)
    (single : ∀ before operation after, phase before →
      (snapshotInternalTransitionFrontier p before).refusal = none →
      (operation, after) ∈ (snapshotInternalTransitionFrontier p before).transitions → phase after)
    (prepared : List InternalCommutation.PreparedInternalArming)
    (members : ∀ item ∈ prepared, item.operation ∈ p.operations)
    (before : RuntimeState) (initial : phase before) (result : SnapshotInternalBatchResult)
    (applied : fireSnapshotInternalBatch p commandId before prepared = .applied result) :
    phase result.state := by
  induction prepared generalizing before result with
  | nil =>
      simp only [fireSnapshotInternalBatch, SnapshotInternalBatchAttempt.applied.injEq] at applied
      subst result
      exact initial
  | cons head rest ih =>
      simp only [fireSnapshotInternalBatch] at applied
      cases refusal : (snapshotInternalTransitionFrontier p before).refusal with
      | some reason => simp [refusal] at applied
      | none =>
        simp only [refusal] at applied
        cases stepped : InternalCommutation.applyPreparedSnapshotArming? p before head with
        | none => simp [stepped] at applied
        | some successor =>
          simp only [stepped] at applied
          have actual : attemptInternalOperation p head.operation before =
              .applied { operation := head.operation, successor } := by
            cases attempted : attemptInternalOperation p head.operation before with
            | disabled _ | refused _ _ =>
                simp [InternalCommutation.applyPreparedSnapshotArming?, attempted] at stepped
            | applied step =>
                have stateEq : step.successor = successor := by
                  by_cases same : InternalCommutation.prepareSnapshotArming? p before head.operation = some head
                  · simpa [InternalCommutation.applyPreparedSnapshotArming?, same, attempted] using stepped
                  · simp [InternalCommutation.applyPreparedSnapshotArming?, same, attempted] at stepped
                have identity := InternalCommutation.attemptInternalOperation_operation_identity p head.operation before
                rw [attempted] at identity
                cases step with
                | mk operation state =>
                    change operation = head.operation at identity
                    change state = successor at stateEq
                    subst operation
                    subst state
                    rfl
          have successorPhase := single before head.operation successor initial refusal
            ((transaction_frontier_attempt_iff p before head.operation successor).mpr
              ⟨members head List.mem_cons_self, actual⟩)
          cases publication : snapshotArmingPublicationForFootprint? p before successor head.operation
              commandId head.footprint with
          | none => simp [publication] at applied
          | some pair =>
            simp only [publication] at applied
            cases tail : fireSnapshotInternalBatch p commandId successor rest with
            | disabled | refused _ => simp [tail] at applied
            | applied final =>
              simp only [tail, SnapshotInternalBatchAttempt.applied.injEq] at applied
              subst result
              exact ih (fun item member => members item (List.mem_cons_of_mem head member))
                successor successorPhase final tail

/-- Complete-frontier preparation supplies operation membership for the successful runner lift. -/
theorem transaction_prepared_batch_preserves_phase (p : Program) (commandId : SemanticId)
    (phase : RuntimeState → Prop)
    (single : ∀ before operation after, phase before →
      (snapshotInternalTransitionFrontier p before).refusal = none →
      (operation, after) ∈ (snapshotInternalTransitionFrontier p before).transitions → phase after)
    (before : RuntimeState) (initial : phase before)
    (prepared : List InternalCommutation.PreparedInternalArming)
    (selected : InternalCommutation.prepareSnapshotArmingBatch? p before
      ((snapshotInternalTransitionFrontier p before).transitions.map (·.1)) = some prepared)
    (result : SnapshotInternalBatchResult)
    (applied : fireSnapshotInternalBatch p commandId before prepared = .applied result) :
    phase result.state := by
  have source := (InternalCommutation.prepareSnapshotArmingBatch_sound p before _ prepared selected).2.2.2.2
  apply transaction_successful_batch_preserves_phase p commandId phase single prepared _ before initial result applied
  intro item member
  have offered : item.operation ∈ (snapshotInternalTransitionFrontier p before).transitions.map (·.1) := by
    rw [← source]
    exact List.mem_map.mpr ⟨item, member, rfl⟩
  obtain ⟨⟨operation, after⟩, offered, same⟩ := List.mem_map.mp offered
  change operation = item.operation at same
  subst operation
  exact ((transaction_frontier_attempt_iff p before item.operation after).mp offered).1

end BpmnSemantics.SemanticProcess
