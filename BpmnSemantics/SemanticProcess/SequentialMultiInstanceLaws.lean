import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition

/-! # Sequential Multi-Instance laws

The quantified content of the four transitions: what every legal step of each rule preserves,
publishes, and writes. The account is
[the sequential Multi-Instance proposal](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md),
whose Lean lane names these as its minimum laws.

Every law here is stated over a relation rather than over an evaluator, which is what makes it a
falsifier for an implementation this repository does not contain. Two of them are the capsule's own
named counterexamples:

* `iteration_preserves_the_outer_deadline` is refused by an evaluator that resets the lifetime
  deadline for each iteration. Its scope is exact. A reset that mints a fresh Timer occurrence,
  advances `timerActivations`, or changes `deadlineMs` is caught, because each is visible in the
  post-state. A reset that withdraws the deadline and re-arms a byte-identical wait without advancing
  its counter is **not** caught, because that evaluator's post-state is the preserved state and this
  law compares states; the discriminator there is the host's refusal to arm unless the remaining time
  equals the armed duration, which is adapter evidence and not this lane's. Every arming primitive in
  this repository advances the counter it mints from, so an evaluator built from them is caught, and
  the residual case is recorded rather than closed by asserting that logical time cannot advance.
* `interruption_publishes_nothing` is refused by an evaluator that publishes the partial collection on
  interruption. That one has no residual case: Process bindings are state, so any publication at all
  is a different post-state.

The counters are not restated here. `generatedInstanceCount_eq_active_add_completed` and
`pendingItemCount_add_generatedInstanceCount` are laws about the representation and live with it, in
[the controller owner](SequentialMultiInstance.lean); what this module adds is that a transition
carries them, by preserving every controller's snapshot and therefore every planned count.

Scope boundary: laws over the four relations. It defines no transition, no rewrite, and no evaluator,
and it claims neither completeness nor determinism. The conditional closure theorem at the end needs
an accepted target completion or the outer Timer at every open state. It claims no human-completion
fairness, Timer-delivery fairness, or unconditional liveness.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-! ## The controller frame

Storing a result is a `List.map` that rewrites one field, so the identity triple and the snapshot are
untouched by construction rather than restored afterwards, and the canonical order key is a projection
of the frame. This is the shape `activityOccurrenceFrame` gives the record collection, for the same
reason: one equation carries the whole immutability obligation.
-/

/-- Storing a result changes no controller's identity and no controller's snapshot. -/
theorem storeIterationResult_preserves_frame
    (controllers : List SequentialMultiInstanceController)
    (target : SequentialMultiInstanceController) (result : String) :
    (storeIterationResult controllers target result).map
        sequentialMultiInstanceControllerFrame =
      controllers.map sequentialMultiInstanceControllerFrame := by
  simp only [storeIterationResult, List.map_map]
  refine List.map_congr_left ?_
  intro candidate _
  by_cases hit : sameSequentialMultiInstanceController candidate target = true
  · simp [hit, sequentialMultiInstanceControllerFrame]
  · simp [hit]

/-- Storing a result changes no controller's snapshot, which is `SMI-DATA-01`'s immutability half. -/
theorem storeIterationResult_preserves_snapshots
    (controllers : List SequentialMultiInstanceController)
    (target : SequentialMultiInstanceController) (result : String) :
    (storeIterationResult controllers target result).map (·.snapshot) =
      controllers.map (·.snapshot) := by
  simp only [storeIterationResult, List.map_map]
  refine List.map_congr_left ?_
  intro candidate _
  by_cases hit : sameSequentialMultiInstanceController candidate target = true
  · simp [hit]
  · simp [hit]

/-- Storing a result leaves the canonical controller order in place.

`RSI-ORDER-01` for this collection follows from the frame rather than from an argument about the
comparator, because the comparator reads only fields the frame preserves. -/
theorem storeIterationResult_preserves_canonical_order
    (controllers : List SequentialMultiInstanceController)
    (target : SequentialMultiInstanceController) (result : String) :
    orderedBy sequentialMultiInstanceControllerBefore
        (storeIterationResult controllers target result) =
      orderedBy sequentialMultiInstanceControllerBefore controllers :=
  orderedBy_of_map_eq sequentialMultiInstanceControllerFrame
    sequentialMultiInstanceControllerBefore
    (fun left right =>
      if left.1.value ≠ right.1.value then decide (left.1.value < right.1.value)
      else if left.2.1.value ≠ right.2.1.value then decide (left.2.1.value < right.2.1.value)
      else decide (left.2.2.1 < right.2.2.1))
    (fun _ _ => rfl) _ _
    (storeIterationResult_preserves_frame controllers target result)

/-! ## What one accepted result writes

The target controller gains exactly one slot, at the index that was its loop counter, and every other
controller is left alone. Density needs no conjunct, because appending is the only way this rewrite
extends the list, and "no earlier slot is disturbed" is the append equation itself rather than a
separate claim about a prefix.
-/

/-- The controller with the target identity gains exactly its own next slot.

The index the result lands at is the pre-state completed count, which is the loop counter the active
iteration carried, so an accepted result cannot overwrite a filled slot or land out of order. -/
theorem storeIterationResult_writes_its_own_slot
    (controllers : List SequentialMultiInstanceController)
    (target candidate : SequentialMultiInstanceController) (result : String)
    (present : candidate ∈ controllers)
    (hit : sameSequentialMultiInstanceController candidate target = true) :
    ∃ updated ∈ storeIterationResult controllers target result,
      updated.outputSlots = candidate.outputSlots ++ [result] ∧
        updated.snapshot = candidate.snapshot ∧
        completedInstanceCount updated = completedInstanceCount candidate + 1 ∧
        updated.outputSlots[completedInstanceCount candidate]? = some result := by
  refine ⟨{ candidate with outputSlots := candidate.outputSlots ++ [result] }, ?_, rfl, rfl, ?_, ?_⟩
  · simp only [storeIterationResult, List.mem_map]
    exact ⟨candidate, present, by simp [hit]⟩
  · simp [completedInstanceCount]
  · simp [completedInstanceCount]

/-- A controller of another identity is carried through unchanged. -/
theorem storeIterationResult_leaves_other_controllers
    (controllers : List SequentialMultiInstanceController)
    (target candidate : SequentialMultiInstanceController) (result : String)
    (present : candidate ∈ controllers)
    (miss : sameSequentialMultiInstanceController candidate target = false) :
    candidate ∈ storeIterationResult controllers target result := by
  simp only [storeIterationResult, List.mem_map]
  exact ⟨candidate, present, by simp [miss]⟩

/-! ## What each transition preserves

Stated over the relations, so a rewrite that stopped satisfying one of these would break here rather
than in a fixture that happens to exercise it.
-/

/-- `SMI-ITERATE-01` preserves the outer deadline: its wait collection and its counter both.

The capsule's nearest realistic counterexample completes one item, silently resets the boundary
deadline while creating the next task, and then publishes an output collection after work that ran
beyond the original outer lifetime. This is the half of that refusal this lane owns; the module
document above states exactly which resets it does and does not separate. -/
theorem iteration_preserves_the_outer_deadline {arm : SequentialMultiInstanceArm}
    {body : OccurrenceId} {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceIterationStep arm body submitted before after) :
    after.timerWaits = before.timerWaits ∧
      after.timerActivations = before.timerActivations := by
  cases step
  exact ⟨rfl, rfl⟩

/-- `SMI-ITERATE-01` publishes nothing to Process scope, so no output is visible before natural
completion. -/
theorem iteration_publishes_nothing {arm : SequentialMultiInstanceArm} {body : OccurrenceId}
    {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceIterationStep arm body submitted before after) :
    after.variables = before.variables := by
  cases step
  rfl

/-- `SMI-ITERATE-01` preserves every controller's snapshot, and therefore every planned count.

Planned is the snapshot length, so "planned is constant for the controller lifetime" is this equation
rather than an agreement between two stored numbers. -/
theorem iteration_preserves_snapshots {arm : SequentialMultiInstanceArm} {body : OccurrenceId}
    {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceIterationStep arm body submitted before after) :
    after.sequentialMultiInstanceControllers.map (·.snapshot) =
      before.sequentialMultiInstanceControllers.map (·.snapshot) := by
  cases step
  exact storeIterationResult_preserves_snapshots _ _ _

/-- `SMI-ITERATE-01` keeps the canonical controller order. -/
theorem iteration_preserves_canonical_controller_order {arm : SequentialMultiInstanceArm}
    {body : OccurrenceId} {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceIterationStep arm body submitted before after) :
    orderedBy sequentialMultiInstanceControllerBefore
        after.sequentialMultiInstanceControllers =
      orderedBy sequentialMultiInstanceControllerBefore
        before.sequentialMultiInstanceControllers := by
  cases step
  exact storeIterationResult_preserves_canonical_order _ _ _

/-- `SMI-ITERATE-01` keeps every Activity occurrence record's identity, owner, and attached handlers.

The turnover account's `AOO-TURNOVER-03` seen from this family: the outer occurrence is not re-armed,
so a later firing of the original deadline is still valid against the controller's new active task. -/
theorem iteration_preserves_activity_frames {arm : SequentialMultiInstanceArm}
    {body : OccurrenceId} {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceIterationStep arm body submitted before after) :
    after.activityOccurrences.map activityOccurrenceFrame =
      before.activityOccurrences.map activityOccurrenceFrame := by
  cases step
  exact replaceBodyIn_preserves_frame _ _ _

/-- `SMI-COMPLETE-01` publishes exactly the ordered slots, once, through the canonical merge.

The published value is `controller.outputSlots ++ [result]`: the slots in index order with the final
result in its own position, and no other Process binding changed. The controller is one the pre-state
carried, which is what stops the existential from being satisfied by a collection this step never held:
without that membership the law would only say the published bytes have the shape of some slot list.

Which bytes that merge produces for one concrete run is a decided fixture rather than a law, because
the canonical sort inside the shared merge is private to its own module and no quantified membership
fact about it is available here. -/
theorem completion_publishes_the_ordered_collection {arm : SequentialMultiInstanceArm}
    {body : OccurrenceId} {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceCompletionStep arm body submitted before after) :
    ∃ controller ∈ before.sequentialMultiInstanceControllers, ∃ result : String,
      after.variables.process.bindings =
        mergeProcessVariableBindings before.variables.process.bindings
          [{ name := arm.data.outputDataObjectReferenceId
             value := .stringList (controller.outputSlots ++ [result]) }] := by
  cases step with
  | publishes _ _ controller _ _ result _ _ _ _ _ controllerLive =>
      exact ⟨controller, controllerLive, result, rfl⟩

/-- `SMI-COMPLETE-01` publishes no collection the profile cannot carry.

The quantified content of the completion arm's bound: whatever a legal final completion publishes fits
every profile limit, so no legal run reaches a Process-scope output collection over the declared
canonical size even though its items were each admissible on their own. Stated over the relation, so an
evaluator that stored an over-bound candidate could not be shown to satisfy the arm it claims; the
concrete crossing case is the fixture owner's
`sixteen_results_at_the_item_byte_bound_cross_the_canonical_collection_bound`. -/
theorem completion_publishes_a_collection_within_the_profile_bounds
    {arm : SequentialMultiInstanceArm} {body : OccurrenceId}
    {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceCompletionStep arm body submitted before after) :
    ∃ items, withinSequentialMultiInstanceLimits arm items = true ∧
      after.variables.process.bindings =
        mergeProcessVariableBindings before.variables.process.bindings
          [{ name := arm.data.outputDataObjectReferenceId, value := .stringList items }] := by
  cases step with
  | publishes _ _ controller _ _ result _ _ _ _ _ _ _ _ _ _ _ candidateFits =>
      exact ⟨controller.outputSlots ++ [result], candidateFits, rfl⟩

/-- `SMI-COMPLETE-01` only closes: every surviving controller and record was already there.

Nothing is created, so the controller and its record leave together with the final inner task and the
lifetime deadline. Stated as membership rather than as the filter it is, because membership is the form
a consumer needs. -/
theorem completion_only_removes_controllers_and_records {arm : SequentialMultiInstanceArm}
    {body : OccurrenceId} {submitted : List VariableBinding} {before after : RuntimeState}
    (step : SequentialMultiInstanceCompletionStep arm body submitted before after) :
    (∀ controller ∈ after.sequentialMultiInstanceControllers,
        controller ∈ before.sequentialMultiInstanceControllers) ∧
      ∀ record ∈ after.activityOccurrences, record ∈ before.activityOccurrences := by
  cases step
  exact ⟨fun _ mem => (List.mem_filter.mp mem).1, fun _ mem => (List.mem_filter.mp mem).1⟩

/-- `SMI-CANCEL-01` publishes nothing at all.

The capsule's second named counterexample as a proposition: an evaluator that exposed the partial
collection on interruption would produce a state this equation refuses. Process bindings are state, so
this refusal has no residual case. -/
theorem interruption_publishes_nothing {arm : SequentialMultiInstanceArm}
    {timer : TimerOccurrenceId} {logicalTimeMs : Nat} {before after : RuntimeState}
    (step : SequentialMultiInstanceInterruptionStep arm timer logicalTimeMs before after) :
    after.variables = before.variables := by
  cases step
  rfl

/-- `SMI-CANCEL-01` strands no deadline the interrupted record listed.

The general invariant behind the withdrawal, rather than a claim about how many deadlines this profile
arms: removing an Activity occurrence record must leave no Timer wait that record named still live, and
`attachedTimersUnambiguous` admits a record listing more than one. Stated over the relation, so an
evaluator that withdrew only the fired deadline would produce a post-state this law refuses. -/
theorem interruption_strands_no_deadline_its_record_listed {arm : SequentialMultiInstanceArm}
    {timer : TimerOccurrenceId} {logicalTimeMs : Nat} {before after : RuntimeState}
    (step : SequentialMultiInstanceInterruptionStep arm timer logicalTimeMs before after) :
    ∃ record ∈ before.activityOccurrences, recordAttaches record timer = true ∧
      ∀ wait ∈ after.timerWaits, anyTimerIdNamesWait record.attachedTimers wait = false := by
  cases step with
  | interrupts _ record _ _ _ _ _ _ recordLive attaches =>
      exact ⟨record, recordLive, attaches, fun _ retained =>
        filtering_by_withdrawn_timers_leaves_none _ _ _ retained⟩

/-- `SMI-CANCEL-01` discards every accepted result by removing the controller that held them.

There is nothing to decrement or transition: the record and the controller leave together in the step
that terminates the active instance, which is why no stable state can show a nonzero terminated
count. -/
theorem interruption_only_removes_controllers_and_records {arm : SequentialMultiInstanceArm}
    {timer : TimerOccurrenceId} {logicalTimeMs : Nat} {before after : RuntimeState}
    (step : SequentialMultiInstanceInterruptionStep arm timer logicalTimeMs before after) :
    (∀ controller ∈ after.sequentialMultiInstanceControllers,
        controller ∈ before.sequentialMultiInstanceControllers) ∧
      ∀ record ∈ after.activityOccurrences, record ∈ before.activityOccurrences := by
  cases step
  exact ⟨fun _ mem => (List.mem_filter.mp mem).1, fun _ mem => (List.mem_filter.mp mem).1⟩

/-- `SMI-ENTER-01`'s two arms, each characterized completely.

One law with one disjunction rather than two laws with a discriminating hypothesis, because the arms
are what the relation offers and nothing outside it selects between them.

The empty arm publishes the exact empty output collection through the same merge natural completion
uses and creates no controller, so no controller, record, task, or deadline exists to be resumed.

The generating arm's snapshot is stated as the value of the sole admitted Process binding rather than
as some non-empty list, so "snapshotted once, in declared order with duplicates preserved" is the
equation itself: the snapshot *is* the bound collection rather than a copy computed from it. It fills
no slot, so the first loop counter is zero, and it publishes nothing, so Process output stays absent
until natural completion. -/
theorem entry_publishes_an_empty_collection_or_snapshots_without_publishing
    {arm : SequentialMultiInstanceArm} {before after : RuntimeState}
    (step : SequentialMultiInstanceEntryStep arm before after) :
    (after.sequentialMultiInstanceControllers = before.sequentialMultiInstanceControllers ∧
        after.variables.process.bindings =
          mergeProcessVariableBindings before.variables.process.bindings
            [{ name := arm.data.outputDataObjectReferenceId, value := .stringList [] }]) ∨
      (∃ controller binding,
        after.sequentialMultiInstanceControllers =
            controller :: before.sequentialMultiInstanceControllers ∧
          before.variables.process.bindings.filter
              (fun candidate => candidate.name == arm.data.inputDataObjectReferenceId) = [binding] ∧
          binding.value = .stringList controller.snapshot ∧
          controller.snapshot ≠ [] ∧ controller.outputSlots = [] ∧
          after.variables = before.variables) := by
  cases step with
  | completesEmpty => exact Or.inl ⟨rfl, rfl⟩
  | generatesFirst _ instanceId binding first rest _ _ soleBinding collection =>
      exact Or.inr ⟨enteredController arm before instanceId (first :: rest), binding, rfl,
        soleBinding, by simpa [enteredController] using collection,
        by simp [enteredController], rfl, rfl⟩

/-! ## Conditional finite-snapshot closure

The progress assumption is explicit because the semantic core cannot make a human complete a task or
make a host deliver a Timer. Once either accepted event arrives, the finite snapshot is the termination
measure: an iteration strictly decreases its remaining-item count, while final completion or the outer
Timer removes the controller. A schedule that supplied an unrelated completion without moving this
controller cannot inhabit `closesOrDecreases` and therefore cannot discharge the hypothesis.
-/

/-- The finite snapshot measure remaining in one exact controller state. -/
def sequentialMultiInstanceControllerRemainingCount
    (controller : SequentialMultiInstanceController) : Nat :=
  controller.snapshot.length - completedInstanceCount controller

/-- One accepted semantic event of the exact SMI family. -/
inductive SequentialMultiInstanceAcceptedEvent (arm : SequentialMultiInstanceArm) :
    RuntimeState → RuntimeState → Prop where
  | iteration {body : OccurrenceId} {submitted : List VariableBinding} {before after : RuntimeState}
      (step : SequentialMultiInstanceIterationStep arm body submitted before after) :
      SequentialMultiInstanceAcceptedEvent arm before after
  | completion {body : OccurrenceId} {submitted : List VariableBinding}
      {before after : RuntimeState}
      (step : SequentialMultiInstanceCompletionStep arm body submitted before after) :
      SequentialMultiInstanceAcceptedEvent arm before after
  | interruption {timer : TimerOccurrenceId} {logicalTimeMs : Nat}
      {before after : RuntimeState}
      (step : SequentialMultiInstanceInterruptionStep arm timer logicalTimeMs before after) :
      SequentialMultiInstanceAcceptedEvent arm before after

/-- An accepted relation step indexed by the exact controller it advances or closes.

Each constructor contains the corresponding semantic relation with the target controller in the
relation's concrete post-state. It stores no close-or-decrease conclusion. The iteration constructor
also carries the relation's target-specific live, binding, and non-final premises so its measure effect
can be proved rather than assumed. -/
inductive SequentialMultiInstanceTargetAcceptedEvent (arm : SequentialMultiInstanceArm) :
    SequentialMultiInstanceController → RuntimeState →
      Option SequentialMultiInstanceController → RuntimeState → Prop where
  | iteration {target : SequentialMultiInstanceController} {body : OccurrenceId}
      {submitted : List VariableBinding} {before : RuntimeState} {record : ActivityOccurrence}
      {wait : UserTaskWait} {binding : VariableBinding} {result : String}
      (accepted : SequentialMultiInstanceIterationStep arm body submitted before
        (iteratedState before record wait body target result))
      (targetLive : target ∈ before.sequentialMultiInstanceControllers)
      (targetBinds : controllerNamesActivityOccurrence target record = true)
      (nonFinal : completedInstanceCount target + 1 < target.snapshot.length) :
      SequentialMultiInstanceTargetAcceptedEvent arm target before
        (some { target with outputSlots := target.outputSlots ++ [result] })
        (iteratedState before record wait body target result)
  | completion {target : SequentialMultiInstanceController} {body : OccurrenceId}
      {submitted : List VariableBinding} {before : RuntimeState} {record : ActivityOccurrence}
      {result : String}
      (accepted : SequentialMultiInstanceCompletionStep arm body submitted before
        (finalCompletionState arm before record body target (target.outputSlots ++ [result])))
      (targetLive : target ∈ before.sequentialMultiInstanceControllers)
      (targetBinds : controllerNamesActivityOccurrence target record = true) :
      SequentialMultiInstanceTargetAcceptedEvent arm target before none
        (finalCompletionState arm before record body target (target.outputSlots ++ [result]))
  | interruption {target : SequentialMultiInstanceController} {timer : TimerOccurrenceId}
      {logicalTimeMs : Nat} {before : RuntimeState} {record : ActivityOccurrence}
      {deadline : TimerWait} {body : OccurrenceId}
      (accepted : SequentialMultiInstanceInterruptionStep arm timer logicalTimeMs before
        (interruptionState arm before record body deadline target))
      (targetLive : target ∈ before.sequentialMultiInstanceControllers)
      (targetBinds : controllerNamesActivityOccurrence target record = true) :
      SequentialMultiInstanceTargetAcceptedEvent arm target before none
        (interruptionState arm before record body deadline target)

/-- Every target-indexed event is an event of the original semantic relation. -/
theorem targetAcceptedEvent_isAccepted {arm : SequentialMultiInstanceArm}
    {target : SequentialMultiInstanceController} {before after : RuntimeState}
    {nextTarget : Option SequentialMultiInstanceController}
    (event : SequentialMultiInstanceTargetAcceptedEvent arm target before nextTarget after) :
    SequentialMultiInstanceAcceptedEvent arm before after := by
  cases event with
  | iteration accepted => exact .iteration accepted
  | completion accepted => exact .completion accepted
  | interruption accepted => exact .interruption accepted

/-- The close-or-strict-decrease result follows from the target-indexed relation step. -/
theorem targetAcceptedEvent_closesOrDecreases {arm : SequentialMultiInstanceArm}
    {target : SequentialMultiInstanceController} {before after : RuntimeState}
    {nextTarget : Option SequentialMultiInstanceController}
    (event : SequentialMultiInstanceTargetAcceptedEvent arm target before nextTarget after) :
    nextTarget = none ∨
      ∃ updated, nextTarget = some updated ∧
        sequentialMultiInstanceControllerRemainingCount updated <
          sequentialMultiInstanceControllerRemainingCount target := by
  cases event with
  | iteration _ _ _ nonFinal =>
      right
      refine ⟨_, rfl, ?_⟩
      simp only [sequentialMultiInstanceControllerRemainingCount, completedInstanceCount] at nonFinal ⊢
      simp only [List.length_append, List.length_singleton] at nonFinal ⊢
      omega
  | completion => exact Or.inl rfl
  | interruption => exact Or.inl rfl

/-- A finite trace whose last accepted target event is natural completion or interruption. -/
inductive SequentialMultiInstanceConditionalTrace (arm : SequentialMultiInstanceArm) :
    SequentialMultiInstanceController → RuntimeState → RuntimeState → Prop where
  | last {target : SequentialMultiInstanceController} {before after : RuntimeState}
      (event : SequentialMultiInstanceTargetAcceptedEvent arm target before none after) :
      SequentialMultiInstanceConditionalTrace arm target before after
  | more {target updated : SequentialMultiInstanceController}
      {before next after : RuntimeState}
      (event : SequentialMultiInstanceTargetAcceptedEvent arm target before (some updated) next)
      (rest : SequentialMultiInstanceConditionalTrace arm updated next after) :
      SequentialMultiInstanceConditionalTrace arm target before after

/-- The capsule's conditional liveness law.

For a finite snapshot, if every current target controller receives one target-indexed accepted inner
completion or its outer Timer, then a finite relation trace ends in natural completion or interruption.
Strict decrease is derived above from the non-final iteration relation; it is not part of this
hypothesis. The hypothesis remains conditional and carries no host or human fairness claim. -/
theorem finite_snapshot_conditional_progress_eventually_closes
    (arm : SequentialMultiInstanceArm)
    (eventuallyProgresses : ∀ target current,
      ∃ nextTarget next,
        SequentialMultiInstanceTargetAcceptedEvent arm target current nextTarget next)
    (target : SequentialMultiInstanceController) (initial : RuntimeState) :
    ∃ final, SequentialMultiInstanceConditionalTrace arm target initial final := by
  obtain ⟨nextTarget, next, event⟩ := eventuallyProgresses target initial
  have progress := targetAcceptedEvent_closesOrDecreases event
  cases nextTarget with
  | none => exact ⟨next, .last event⟩
  | some updated =>
      rcases progress with impossible | ⟨measured, equality, decreases⟩
      · simp at impossible
      · cases equality
        obtain ⟨final, rest⟩ :=
          finite_snapshot_conditional_progress_eventually_closes arm eventuallyProgresses updated next
        exact ⟨final, .more event rest⟩
termination_by sequentialMultiInstanceControllerRemainingCount target

end BpmnSemantics.SemanticProcess
