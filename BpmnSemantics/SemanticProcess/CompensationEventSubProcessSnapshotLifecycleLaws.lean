import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.CommandAdmission

/-! # Compensation Event Sub-Process snapshot lifecycle laws

Reusable composition laws connect the public snapshot reservation and promotion results to the
ordinary and bounded scope operations that consume them. These laws constrain the evaluator's
state-transforming paths directly; `AttemptProgramStep` remains only an evaluator graph.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- A selected root start cannot expose the ordinary started state until its exact reservation has been applied. -/
theorem prepareStartedSnapshotState_selected_applied_shape
    (program : Program) (before : RuntimeState) (admission : ExternalAdmission)
    (after : RuntimeState) (root : RuntimeScopeOccurrence)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (target : CompensationEventSubProcessSnapshotTarget)
    (declared : program.compensationEventSubProcessSnapshots = some declaration)
    (ordinaryCommitted : admission.outcome = .committed)
    (selectedRoot : admission.state.scopeOccurrences.filter
      (fun occurrence => occurrence.parent.isNone) = [root])
    (selectedTarget : targetForParent? program root.id.definitionScopeId = some target)
    (prepared : prepareStartedSnapshotState program before admission =
      { outcome := .committed, state := after }) :
    reserveRootCompensationParentContextBeforeStart program before admission.state =
      .applied after := by
  unfold prepareStartedSnapshotState at prepared
  rw [ordinaryCommitted] at prepared
  cases reserved : reserveRootCompensationParentContextBeforeStart program before admission.state with
  | refused reason returned => simp [reserved] at prepared
  | applied returned => simpa [reserved] using prepared
  | disabled returned =>
      unfold reserveRootCompensationParentContextBeforeStart at reserved
      rw [declared, selectedRoot] at reserved
      cases childReservation : reserveCompensationParentContext program before root with
      | refused reason rejected => simp [childReservation] at reserved
      | applied appliedState => simp [childReservation] at reserved
      | disabled disabledState =>
          obtain ⟨_, absent | unselected⟩ :=
            reserveCompensationParentContext_disabled_shape program before disabledState root
              childReservation
          · simp [declared] at absent
          · simp [selectedTarget] at unselected

/-- A selected root reservation refusal rejects the start with the original submitted state. -/
theorem prepareStartedSnapshotState_refusal_shape
    (program : Program) (before : RuntimeState) (admission : ExternalAdmission)
    (reason : CompensationParentContextRefusal) (returned : RuntimeState)
    (ordinaryCommitted : admission.outcome = .committed)
    (refused : reserveRootCompensationParentContextBeforeStart program before admission.state =
      .refused reason returned) :
    prepareStartedSnapshotState program before admission =
      { outcome := .rejected, state := before } := by
  simp [prepareStartedSnapshotState, ordinaryCommitted, refused]

theorem childOccurrenceAfterEntry_definition
    (state entered : RuntimeState) (input : ControlPlaceId)
    (childScopeId : DefinitionScopeId) (child : RuntimeScopeOccurrence)
    (found : childOccurrenceAfterEntry? state input childScopeId entered = some child) :
    child.id.definitionScopeId = childScopeId := by
  unfold childOccurrenceAfterEntry? at found
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at found
  | some parent =>
      simp only [owned] at found
      cases selectedResult : entered.scopeOccurrences.filter (fun occurrence =>
          occurrence.parent == some parent &&
            occurrence.id.definitionScopeId == childScopeId) with
      | nil => simp [selectedResult] at found
      | cons first rest =>
          cases rest with
          | cons _ _ => simp [selectedResult] at found
          | nil =>
              have same : first = child := by simpa [selectedResult] using found
              subst child
              have member : first ∈ entered.scopeOccurrences.filter (fun occurrence =>
                  occurrence.parent == some parent &&
                    occurrence.id.definitionScopeId == childScopeId) := by
                rw [selectedResult]
                simp
              have property := (List.mem_filter.mp member).2
              simp only [Bool.and_eq_true, beq_iff_eq] at property
              exact property.2

theorem applyPreparedReservation_applied_selected_shape
    (program : Program) (operation : SemanticOperation) (state : RuntimeState)
    (child : RuntimeScopeOccurrence) (apply : RuntimeState → Option RuntimeState)
    (step : AppliedInternalOperation)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (target : CompensationEventSubProcessSnapshotTarget)
    (declared : program.compensationEventSubProcessSnapshots = some declaration)
    (selected : targetForParent? program child.id.definitionScopeId = some target)
    (applied : applyPreparedReservation program operation state child apply = .applied step) :
    step.operation = operation ∧ ∃ prepared,
      reserveCompensationParentContext program state child = .applied prepared ∧
        apply prepared = some step.successor := by
  unfold applyPreparedReservation at applied
  cases reserved : reserveCompensationParentContext program state child with
  | refused reason returned => simp [reserved] at applied
  | disabled prepared =>
      obtain ⟨_, absent | unselected⟩ :=
        reserveCompensationParentContext_disabled_shape program state prepared child reserved
      · simp [declared] at absent
      · simp [selected] at unselected
  | applied prepared =>
      cases successor : apply prepared with
      | none => simp [reserved, successor] at applied
      | some after =>
          simp [reserved, successor] at applied
          subst step
          exact ⟨rfl, prepared, rfl, successor⟩

/-- Every applied selected ordinary child entry reserves that exact entered occurrence before exposing its successor. -/
theorem attemptInternalOperation_enterScope_applied_shape
    (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId) (step : AppliedInternalOperation)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (target : CompensationEventSubProcessSnapshotTarget)
    (declared : program.compensationEventSubProcessSnapshots = some declaration)
    (selected : targetForParent? program childScopeId = some target)
    (applied : attemptInternalOperation program
      (.enterScope id origin input childEntry childScopeId) state = .applied step) :
    step.operation = .enterScope id origin input childEntry childScopeId ∧
      ∃ entered child prepared,
        enterScopeState? state input childEntry childScopeId = some entered ∧
        childOccurrenceAfterEntry? state input childScopeId entered = some child ∧
        reserveCompensationParentContext program state child = .applied prepared ∧
        enterScopeState? prepared input childEntry childScopeId = some step.successor := by
  rw [attemptInternalOperation, declared] at applied
  unfold attemptEnterScope at applied
  cases enteredResult : enterScopeState? state input childEntry childScopeId with
  | none => simp [enteredResult] at applied
  | some entered =>
      cases childResult : childOccurrenceAfterEntry? state input childScopeId entered with
      | none => simp [enteredResult, childResult] at applied
      | some child =>
          have childDefinition := childOccurrenceAfterEntry_definition state entered input
            childScopeId child childResult
          have childSelected : targetForParent? program child.id.definitionScopeId = some target :=
            by simpa [childDefinition] using selected
          obtain ⟨operation, prepared, reserved, successor⟩ :=
            applyPreparedReservation_applied_selected_shape program
              (.enterScope id origin input childEntry childScopeId) state child
              (fun prepared => enterScopeState? prepared input childEntry childScopeId)
              step declaration target declared childSelected (by simpa [enteredResult, childResult] using applied)
          exact ⟨operation, entered, child, prepared, rfl, childResult, reserved, successor⟩

/-- Every applied selected bounded child entry reserves that exact entered occurrence before arming and exposing its successor. -/
theorem attemptInternalOperation_enterBoundedScope_applied_shape
    (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId) (boundaryTimer : BoundaryTimerArm)
    (step : AppliedInternalOperation)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (target : CompensationEventSubProcessSnapshotTarget)
    (declared : program.compensationEventSubProcessSnapshots = some declaration)
    (selected : targetForParent? program childScopeId = some target)
    (applied : attemptInternalOperation program
      (.enterBoundedScope id origin input childEntry childScopeId boundaryTimer) state =
        .applied step) :
    step.operation = .enterBoundedScope id origin input childEntry childScopeId boundaryTimer ∧
      ∃ entered child prepared,
        armBoundedScopeState? state input childEntry childScopeId boundaryTimer = some entered ∧
        childOccurrenceAfterEntry? state input childScopeId entered = some child ∧
        reserveCompensationParentContext program state child = .applied prepared ∧
        armBoundedScopeState? prepared input childEntry childScopeId boundaryTimer =
          some step.successor := by
  rw [attemptInternalOperation, declared] at applied
  unfold attemptEnterBoundedScope at applied
  cases enteredResult : armBoundedScopeState? state input childEntry childScopeId boundaryTimer with
  | none => simp [enteredResult] at applied
  | some entered =>
      cases childResult : childOccurrenceAfterEntry? state input childScopeId entered with
      | none => simp [enteredResult, childResult] at applied
      | some child =>
          have childDefinition := childOccurrenceAfterEntry_definition state entered input
            childScopeId child childResult
          have childSelected : targetForParent? program child.id.definitionScopeId = some target :=
            by simpa [childDefinition] using selected
          obtain ⟨operation, prepared, reserved, successor⟩ :=
            applyPreparedReservation_applied_selected_shape program
              (.enterBoundedScope id origin input childEntry childScopeId boundaryTimer) state child
              (fun prepared => armBoundedScopeState? prepared input childEntry childScopeId boundaryTimer)
              step declaration target declared childSelected (by simpa [enteredResult, childResult] using applied)
          exact ⟨operation, entered, child, prepared, rfl, childResult, reserved, successor⟩

/-- Every applied selected completion promotes the deciding pre-state before it removes the occurrence or applies the root disposition. -/
theorem attemptInternalOperation_completeScope_applied_shape
    (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) (step : AppliedInternalOperation)
    (occurrence : RuntimeScopeOccurrence)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (target : CompensationEventSubProcessSnapshotTarget)
    (declared : program.compensationEventSubProcessSnapshots = some declaration)
    (selectedOccurrence : state.scopeOccurrences.filter (fun candidate =>
      candidate.id.definitionScopeId == scopeId) = [occurrence])
    (selectedTarget : targetForParent? program scopeId = some target)
    (applied : attemptInternalOperation program
      (.completeScope id origin scopeId parentOutput) state = .applied step) :
    step.operation = .completeScope id origin scopeId parentOutput ∧
      ∃ prepared completed snapshot,
        promoteCompensationParentContext program state occurrence = .applied prepared ∧
        captureCompensationParentContext? program state occurrence = some snapshot ∧
        completeBoundedScope? program prepared scopeId parentOutput = some completed ∧
        step.successor = finishRootCompletion completed occurrence .retainPromoted := by
  rw [attemptInternalOperation, declared] at applied
  unfold attemptCompleteScope at applied
  have occurrenceFound : selectedCompletionOccurrence? state scopeId = some occurrence := by
    simp [selectedCompletionOccurrence?, selectedOccurrence]
  rw [occurrenceFound] at applied
  cases preflight : completeBoundedScope? program state scopeId parentOutput with
  | none => simp [preflight] at applied
  | some _ =>
      rw [preflight] at applied
      cases promotion : promoteCompensationParentContext program state occurrence with
      | refused reason returned => simp [promotion] at applied
      | disabled prepared =>
          obtain ⟨_, absent | unselected⟩ :=
            promoteCompensationParentContext_disabled_shape program state prepared occurrence
              promotion
          · simp [declared] at absent
          · have occurrenceScope : occurrence.id.definitionScopeId = scopeId := by
              have member : occurrence ∈ state.scopeOccurrences.filter (fun candidate =>
                  candidate.id.definitionScopeId == scopeId) := by simp [selectedOccurrence]
              simpa only [beq_iff_eq] using (List.mem_filter.mp member).2
            simp [occurrenceScope, selectedTarget] at unselected
      | applied prepared =>
          cases completedResult : completeBoundedScope? program prepared scopeId parentOutput with
          | none => simp [promotion, completedResult] at applied
          | some completed =>
              simp [promotion, completedResult] at applied
              subst step
              obtain ⟨_, _, snapshot, _, _, captured, _, _⟩ :=
                promoteCompensationParentContext_applied_shape program state prepared occurrence
                  promotion
              exact ⟨rfl, prepared, completed, snapshot, rfl, captured, completedResult, rfl⟩

/-- Every committed bounded Timer interruption exposes exactly the snapshot survivors decided by the same regional cancellation. -/
theorem interruptBoundedScope_compensationParentContextRetentions_iff
    (program : Program) (before after : RuntimeState)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (success : interruptBoundedScope? program before timerId logicalTimeMs = some after) :
    ∃ child, ∀ retention,
      retention ∈ after.compensationParentContextRetentions ↔
        retention ∈ before.compensationParentContextRetentions ∧
          compensationParentContextRetentionSurvivesScopeCancellation
            before child .remove retention = true := by
  unfold interruptBoundedScope? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed => simp [running] at success
  | cancelled => simp [running] at success
  | running instanceId =>
      cases deadlineFound : boundedScopeDeadlineWait? before timerId with
      | none => simp [running, deadlineFound] at success
      | some deadline =>
          cases definitionFound : boundedScopeDefinitionFor? program deadline with
          | none => simp [running, deadlineFound, definitionFound] at success
          | some definition =>
              cases childFound : boundedScopeChildFor? before definition.1 deadline with
              | none => simp [running, deadlineFound, definitionFound, childFound] at success
              | some child =>
                  simp only [running, deadlineFound, definitionFound, childFound] at success
                  split at success
                  · injection success with successor
                    subst after
                    refine ⟨child, ?_⟩
                    intro retention
                    simpa [interruptScope] using
                      mem_cancelScopeSubtree_compensationParentContextRetentions_iff
                        before child .remove retention
                  · simp at success

end BpmnSemantics.SemanticProcess
