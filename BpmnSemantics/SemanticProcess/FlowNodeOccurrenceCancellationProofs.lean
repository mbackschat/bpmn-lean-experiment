import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs

/-! # Flow-node occurrence cancellation exactness laws

This module owns the quantified laws for the four actual cancellation branches: interrupting
Sub-Process boundary interception, Error propagation, Terminate Scope, and incident-root
cancellation. Each law states the branch premise, the exact cancelled anchor set, and preservation
of every occurrence outside the removed subtree in one proposition, so a law that cancelled too much
or published a terminal for an outside occurrence would fail.

Fold soundness between an accepted delta and the independent open-occurrence projection is the
separate responsibility of [`FlowNodeOccurrenceLifecycleProofs`](FlowNodeOccurrenceLifecycleProofs.lean),
which this module consumes. Concrete executable witnesses remain in the conformance module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
private theorem owned_subtree_cancellation_ends_exact
    (program : Program) (state : RuntimeState) (root : ScopeOccurrenceId)
    (current : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (selected : ownedSubtreeCancellationEnds? program state root = some ended) :
    ended = (current.filter (flowNodeOccurrenceOwnedBySubtree state root) |>.map fun occurrence =>
      { anchor := occurrence.anchor, terminal := .cancelled }) := by
  simp [ownedSubtreeCancellationEnds?, projected] at selected
  exact selected.symm

private theorem termination_subtree_cancellation_ends_exact
    (program : Program) (state : RuntimeState) (root : ScopeOccurrenceId)
    (current : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (selected : terminationSubtreeCancellationEnds? program state root = some ended) :
    ended = (current.filter (flowNodeOccurrenceOwnedBySubtree state root) |>.map (fun occurrence =>
      { anchor := occurrence.anchor, terminal := .cancelled }) |>.filter fun terminal =>
        terminal.anchor ≠ .scope root) := by
  unfold terminationSubtreeCancellationEnds? at selected
  obtain ⟨cancelled, cancelledEq, filtered⟩ := Option.bind_eq_some_iff.mp selected
  rw [owned_subtree_cancellation_ends_exact program state root current cancelled projected
    cancelledEq] at filtered
  change some
    (List.filter (fun terminal => decide (terminal.anchor ≠ .scope root))
      (List.map (fun occurrence =>
        { anchor := occurrence.anchor, terminal := FlowNodeOccurrenceTerminalKind.cancelled })
        (List.filter (flowNodeOccurrenceOwnedBySubtree state root) current))) = some ended at filtered
  exact (Option.some.inj filtered).symm

private theorem cancelled_member_of_instantaneous_with_ends
    (commandId : SemanticId) (transitionIndex : Nat)
    (identities : List FlowNodeIdentity)
    (extraEnds : List UnnumberedFlowNodeOccurrenceEnd)
    (ending : UnnumberedFlowNodeOccurrenceEnd) :
    ending ∈ (instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex
        identities extraEnds).ended ∧ ending.terminal = .cancelled ↔
      ending ∈ extraEnds ∧ ending.terminal = .cancelled := by
  have instantCompleted : ∀ terminal,
      terminal ∈ (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex identities).ended →
        terminal.terminal = .completed := by
    intro terminal member
    simp only [instantaneousFlowNodeOccurrenceDelta, mem_sortFlowNodeOccurrenceEnds] at member
    obtain ⟨start, _, equality⟩ := List.mem_map.mp member
    subst terminal
    rfl
  constructor
  · rintro ⟨member, terminal⟩
    rw [instantaneousFlowNodeOccurrenceDeltaWithEnds, canonicalFlowNodeOccurrenceDelta,
      mem_sortFlowNodeOccurrenceEnds, List.mem_append] at member
    cases member with
    | inl instantaneous =>
        have impossible : FlowNodeOccurrenceTerminalKind.completed = .cancelled :=
          (instantCompleted ending instantaneous).symm.trans terminal
        cases impossible
    | inr extra => exact ⟨extra, terminal⟩
  · rintro ⟨extra, terminal⟩
    constructor
    · rw [instantaneousFlowNodeOccurrenceDeltaWithEnds, canonicalFlowNodeOccurrenceDelta,
        mem_sortFlowNodeOccurrenceEnds, List.mem_append]
      exact Or.inr extra
    · exact terminal

private theorem accepted_delta_starts_fresh
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    (current.map (·.anchor) ++ delta.started.map (·.anchor)).Nodup := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  split at accepted <;> simp_all

private theorem accepted_delta_ends_are_unique
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    (delta.ended.map (·.anchor)).Nodup := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  split at accepted <;> simp_all

private theorem eq_of_anchor_eq_in_nodup_open
    (values : List OpenSemanticFlowNodeOccurrence)
    (left right : OpenSemanticFlowNodeOccurrence)
    (nodup : (values.map (·.anchor)).Nodup)
    (leftMember : left ∈ values) (rightMember : right ∈ values)
    (anchorEq : left.anchor = right.anchor) : left = right := by
  induction values with
  | nil => simp at leftMember
  | cons head tail ih =>
      rw [List.map_cons, List.nodup_cons] at nodup
      rcases List.mem_cons.mp leftMember with leftHead | leftTail
      · subst left
        rcases List.mem_cons.mp rightMember with rightHead | rightTail
        · exact rightHead.symm
        · exfalso
          apply nodup.1
          rw [anchorEq]
          exact List.mem_map.mpr ⟨right, rightTail, rfl⟩
      · rcases List.mem_cons.mp rightMember with rightHead | rightTail
        · subst right
          exfalso
          apply nodup.1
          rw [← anchorEq]
          exact List.mem_map.mpr ⟨left, leftTail, rfl⟩
        · exact ih nodup.2 leftTail rightTail

private theorem instantaneous_cancellation_branch_exact_and_preserves
    (current after : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (commandId : SemanticId) (transitionIndex : Nat)
    (identities : List FlowNodeIdentity)
    (extraEnds : List UnnumberedFlowNodeOccurrenceEnd)
    (removed : OpenSemanticFlowNodeOccurrence → Bool)
    (deltaEq : delta = instantaneousFlowNodeOccurrenceDeltaWithEnds commandId
      transitionIndex identities extraEnds)
    (extraEq : extraEnds = (current.filter removed |>.map fun occurrence =>
      { anchor := occurrence.anchor, terminal := .cancelled }))
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    (delta.ended.map (·.anchor)).Nodup ∧
      (∀ ending,
          (ending ∈ delta.ended ∧ ending.terminal = .cancelled) ↔
            ∃ occurrence, occurrence ∈ current ∧ removed occurrence = true ∧
              ending = { anchor := occurrence.anchor, terminal := .cancelled }) ∧
        ∀ occurrence, occurrence ∈ current → removed occurrence = false →
          occurrence ∈ after := by
  have fresh := accepted_delta_starts_fresh current delta after accepted
  have endedNodup := accepted_delta_ends_are_unique current delta after accepted
  have currentAnchorsNodup : (current.map (·.anchor)).Nodup :=
    (List.nodup_append.mp fresh).1
  constructor
  · exact endedNodup
  constructor
  · intro ending
    rw [deltaEq, cancelled_member_of_instantaneous_with_ends]
    constructor
    · rintro ⟨extraMember, terminal⟩
      rw [extraEq] at extraMember
      obtain ⟨occurrence, filteredMember, endingEq⟩ := List.mem_map.mp extraMember
      exact ⟨occurrence, (List.mem_filter.mp filteredMember).1,
        (List.mem_filter.mp filteredMember).2, endingEq.symm⟩
    · rintro ⟨occurrence, occurrenceMember, occurrenceRemoved, endingEq⟩
      subst ending
      constructor
      · rw [extraEq]
        exact List.mem_map.mpr
          ⟨occurrence, List.mem_filter.mpr ⟨occurrenceMember, occurrenceRemoved⟩, rfl⟩
      · rfl
  · intro occurrence wasOpen notRemoved
    apply accepted_delta_preserves_unended_open_occurrence current delta after occurrence accepted
      wasOpen
    cases containsEq : (delta.ended.map (·.anchor)).contains occurrence.anchor with
    | false => rfl
    | true =>
        obtain ⟨ending, endingMember, anchorEq⟩ :=
          (contains_ended_anchor_iff delta.ended occurrence.anchor).mp containsEq
        rw [deltaEq, instantaneousFlowNodeOccurrenceDeltaWithEnds,
          canonicalFlowNodeOccurrenceDelta, mem_sortFlowNodeOccurrenceEnds,
          List.mem_append] at endingMember
        cases endingMember with
        | inl instantaneous =>
            simp only [instantaneousFlowNodeOccurrenceDelta,
              mem_sortFlowNodeOccurrenceEnds] at instantaneous
            obtain ⟨start, startMember, endingEq⟩ := List.mem_map.mp instantaneous
            have startInInstant : start ∈
                (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex identities).started := by
              rw [instantaneousFlowNodeOccurrenceDelta, mem_sortFlowNodeOccurrenceStarts]
              exact startMember
            have startInDelta : start ∈ delta.started := by
              rw [deltaEq, instantaneousFlowNodeOccurrenceDeltaWithEnds,
                canonicalFlowNodeOccurrenceDelta, mem_sortFlowNodeOccurrenceStarts]
              exact startInInstant
            have currentAnchorMember : occurrence.anchor ∈ current.map (·.anchor) :=
              List.mem_map.mpr ⟨occurrence, wasOpen, rfl⟩
            have startAnchorMember : start.anchor ∈ delta.started.map (·.anchor) :=
              List.mem_map.mpr ⟨start, startInDelta, rfl⟩
            have distinct := (List.nodup_append.mp fresh).2.2 occurrence.anchor
              currentAnchorMember start.anchor startAnchorMember
            have sameAnchor : occurrence.anchor = start.anchor :=
              anchorEq.symm.trans (congrArg UnnumberedFlowNodeOccurrenceEnd.anchor endingEq).symm
            exact False.elim (distinct sameAnchor)
        | inr extra =>
            rw [extraEq] at extra
            obtain ⟨selected, selectedMember, endingEq⟩ := List.mem_map.mp extra
            have selectedCurrent := (List.mem_filter.mp selectedMember).1
            have selectedRemoved := (List.mem_filter.mp selectedMember).2
            have sameAnchor : occurrence.anchor = selected.anchor :=
              anchorEq.symm.trans (congrArg UnnumberedFlowNodeOccurrenceEnd.anchor endingEq).symm
            have sameOccurrence := eq_of_anchor_eq_in_nodup_open current occurrence selected
              currentAnchorsNodup wasOpen selectedCurrent sameAnchor
            subst selected
            simp [notRemoved] at selectedRemoved

/-- Exact cancelled terminals and retained outside occurrences for one selected removal predicate. -/
def ExactCancellationAndOutsidePreservation
    (current after : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (removed : OpenSemanticFlowNodeOccurrence → Bool) : Prop :=
  (delta.ended.map (·.anchor)).Nodup ∧
    (∀ ending,
        (ending ∈ delta.ended ∧ ending.terminal = .cancelled) ↔
          ∃ occurrence, occurrence ∈ current ∧ removed occurrence = true ∧
            ending = { anchor := occurrence.anchor, terminal := .cancelled }) ∧
      ∀ occurrence, occurrence ∈ current → removed occurrence = false →
        occurrence ∈ after

/-- Terminate Scope removes every owned occurrence except the selected scope occurrence itself. -/
def flowNodeOccurrenceRemovedByTermination (state : RuntimeState)
    (root : ScopeOccurrenceId) (occurrence : OpenSemanticFlowNodeOccurrence) : Bool :=
  flowNodeOccurrenceOwnedBySubtree state root occurrence &&
    decide (occurrence.anchor ≠ .scope root)

private theorem termination_cancelled_map_eq (state : RuntimeState)
    (root : ScopeOccurrenceId) (current : List OpenSemanticFlowNodeOccurrence) :
    ((current.filter (flowNodeOccurrenceOwnedBySubtree state root)).map fun occurrence =>
      ({ anchor := occurrence.anchor, terminal := FlowNodeOccurrenceTerminalKind.cancelled } :
        UnnumberedFlowNodeOccurrenceEnd)).filter
          (fun terminal => terminal.anchor ≠ SemanticFlowNodeOccurrenceAnchor.scope root) =
      (current.filter (flowNodeOccurrenceRemovedByTermination state root)).map fun occurrence =>
        ({ anchor := occurrence.anchor, terminal := .cancelled } :
          UnnumberedFlowNodeOccurrenceEnd) := by
  induction current with
  | nil => rfl
  | cons head tail ih =>
      have ih' :
          List.filter (fun terminal => !decide (terminal.anchor =
              SemanticFlowNodeOccurrenceAnchor.scope root))
              (List.map (fun occurrence =>
                ({ anchor := occurrence.anchor, terminal :=
                    FlowNodeOccurrenceTerminalKind.cancelled } :
                  UnnumberedFlowNodeOccurrenceEnd))
                (List.filter (flowNodeOccurrenceOwnedBySubtree state root) tail)) =
            List.map (fun occurrence =>
              ({ anchor := occurrence.anchor, terminal := .cancelled } :
                UnnumberedFlowNodeOccurrenceEnd))
              (List.filter (flowNodeOccurrenceRemovedByTermination state root) tail) := by
        simpa only [decide_not] using ih
      cases ownedEq : flowNodeOccurrenceOwnedBySubtree state root head with
      | false => simp [flowNodeOccurrenceRemovedByTermination, ownedEq, ih']
      | true =>
          by_cases rootEq : head.anchor = .scope root
          · simp [flowNodeOccurrenceRemovedByTermination, ownedEq, rootEq, ih']
          · simp [flowNodeOccurrenceRemovedByTermination, ownedEq, rootEq, ih']

private theorem accepted_stimulus_fold_at_projections
    (program : Program) (before after : RuntimeState) (stimulus : Stimulus)
    (transitionIndex : Nat) (delta : UnnumberedFlowNodeOccurrenceDelta)
    (current next : List OpenSemanticFlowNodeOccurrence)
    (accepted : flowNodeOccurrenceDeltaForStimulus? program before after stimulus
      transitionIndex = some delta)
    (projectedBefore : projectOpenFlowNodeOccurrences? program before = some current)
    (projectedAfter : projectOpenFlowNodeOccurrences? program after = some next) :
    applyFlowNodeOccurrenceDelta? current delta = some next := by
  obtain ⟨openBefore, openAfter, beforeEq, afterEq, folded⟩ :=
    accepted_stimulus_delta_equals_independent_open_projection program before after stimulus
      transitionIndex delta accepted
  rw [projectedBefore] at beforeEq
  rw [projectedAfter] at afterEq
  cases Option.some.inj beforeEq
  cases Option.some.inj afterEq
  exact folded

private theorem accepted_operation_fold_at_projections
    (program : Program) (before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) (transitionIndex : Nat)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (current next : List OpenSemanticFlowNodeOccurrence)
    (accepted : flowNodeOccurrenceDeltaForOperation? program before after operation
      commandId transitionIndex = some delta)
    (projectedBefore : projectOpenFlowNodeOccurrences? program before = some current)
    (projectedAfter : projectOpenFlowNodeOccurrences? program after = some next) :
    applyFlowNodeOccurrenceDelta? current delta = some next := by
  obtain ⟨openBefore, openAfter, beforeEq, afterEq, folded⟩ :=
    accepted_operation_delta_equals_independent_open_projection program before after operation
      commandId transitionIndex delta accepted
  rw [projectedBefore] at beforeEq
  rw [projectedAfter] at afterEq
  cases Option.some.inj beforeEq
  cases Option.some.inj afterEq
  exact folded

/-- The actual interrupting Sub-Process Boundary branch cancels its exact open subtree and preserves every outside occurrence. -/
theorem accepted_interrupting_boundary_delta_cancels_exact_subtree
    (program : Program) (before after : RuntimeState)
    (commandId : SemanticId) (transitionIndex firedAtMs : Nat)
    (timerId : TimerOccurrenceId) (timer : TimerWait)
    (definition : DefinitionScopeId × BoundaryTimerArm) (root : ScopeOccurrenceId)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (current next : List OpenSemanticFlowNodeOccurrence)
    (branchSelected : interruptingBoundaryCancellationDelta? program before commandId
      transitionIndex timer definition = some (root, delta))
    (candidateSelected : candidateFlowNodeOccurrenceDeltaForStimulus? program before
      (.fireTimer commandId timerId firedAtMs) commandId transitionIndex = some delta)
    (accepted : flowNodeOccurrenceDeltaForStimulus? program before after
      (.fireTimer commandId timerId firedAtMs) transitionIndex = some delta)
    (projectedBefore : projectOpenFlowNodeOccurrences? program before = some current)
    (projectedAfter : projectOpenFlowNodeOccurrences? program after = some next) :
    candidateFlowNodeOccurrenceDeltaForStimulus? program before
        (.fireTimer commandId timerId firedAtMs) commandId transitionIndex = some delta ∧
      ExactCancellationAndOutsidePreservation current next delta
        (flowNodeOccurrenceOwnedBySubtree before root) := by
  constructor
  · exact candidateSelected
  · unfold interruptingBoundaryCancellationDelta? at branchSelected
    simp only [Option.bind_eq_bind] at branchSelected
    obtain ⟨selectedRoot, rootSelected, branchSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    obtain ⟨identity, identitySelected, branchSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    obtain ⟨cancelled, cancelledSelected, pairSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    have pairEq := Option.some.inj pairSelected
    have rootEq : selectedRoot = root := congrArg Prod.fst pairEq
    have deltaEq : delta = instantaneousFlowNodeOccurrenceDeltaWithEnds commandId
        transitionIndex [identity] cancelled := (congrArg Prod.snd pairEq).symm
    subst selectedRoot
    have cancelledEq := owned_subtree_cancellation_ends_exact program before root current
      cancelled projectedBefore cancelledSelected
    have folded := accepted_stimulus_fold_at_projections program before after
      (.fireTimer commandId timerId firedAtMs) transitionIndex delta current next accepted
      projectedBefore projectedAfter
    exact instantaneous_cancellation_branch_exact_and_preserves current next delta commandId
      transitionIndex [identity] cancelled (flowNodeOccurrenceOwnedBySubtree before root)
      deltaEq cancelledEq folded

/-- The actual Error propagation operation cancels its exact throwing-scope subtree and preserves every outside occurrence. -/
theorem accepted_error_propagation_delta_cancels_exact_subtree
    (program : Program) (before after : RuntimeState)
    (operationId : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler)
    (commandId : SemanticId) (transitionIndex : Nat) (owner : ScopeOccurrenceId)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (current next : List OpenSemanticFlowNodeOccurrence)
    (branchSelected : errorPropagationCancellationDelta? program before
      (.throwError operationId origin input error handler) commandId transitionIndex owner origin
        handler = some (owner, delta))
    (candidateSelected : candidateFlowNodeOccurrenceDeltaForOperation? program before after
      (.throwError operationId origin input error handler) commandId transitionIndex = some delta)
    (accepted : flowNodeOccurrenceDeltaForOperation? program before after
      (.throwError operationId origin input error handler) commandId transitionIndex = some delta)
    (projectedBefore : projectOpenFlowNodeOccurrences? program before = some current)
    (projectedAfter : projectOpenFlowNodeOccurrences? program after = some next) :
    candidateFlowNodeOccurrenceDeltaForOperation? program before after
        (.throwError operationId origin input error handler) commandId transitionIndex = some delta ∧
      ExactCancellationAndOutsidePreservation current next delta
        (flowNodeOccurrenceOwnedBySubtree before owner) := by
  constructor
  · exact candidateSelected
  · unfold errorPropagationCancellationDelta? at branchSelected
    simp only [Option.bind_eq_bind] at branchSelected
    obtain ⟨parent, parentSelected, branchSelected⟩ := Option.bind_eq_some_iff.mp branchSelected
    obtain ⟨errorIdentity, errorIdentitySelected, branchSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    obtain ⟨boundaryIdentity, boundaryIdentitySelected, branchSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    obtain ⟨cancelled, cancelledSelected, pairSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    have pairEq := Option.some.inj pairSelected
    have deltaEq : delta = instantaneousFlowNodeOccurrenceDeltaWithEnds commandId
        transitionIndex [errorIdentity, boundaryIdentity] cancelled :=
      (congrArg Prod.snd pairEq).symm
    have cancelledEq := owned_subtree_cancellation_ends_exact program before owner current
      cancelled projectedBefore cancelledSelected
    have folded := accepted_operation_fold_at_projections program before after
      (.throwError operationId origin input error handler) commandId transitionIndex delta
      current next accepted projectedBefore projectedAfter
    exact instantaneous_cancellation_branch_exact_and_preserves current next delta commandId
      transitionIndex [errorIdentity, boundaryIdentity] cancelled
      (flowNodeOccurrenceOwnedBySubtree before owner) deltaEq cancelledEq folded

/-- The actual Terminate Scope operation cancels every other open occurrence in its subtree and preserves all nonremoved occurrences, including the selected scope occurrence. -/
theorem accepted_terminate_scope_delta_cancels_exact_subtree
    (program : Program) (before after : RuntimeState)
    (operationId : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId) (commandId : SemanticId) (transitionIndex : Nat)
    (owner : ScopeOccurrenceId) (delta : UnnumberedFlowNodeOccurrenceDelta)
    (current next : List OpenSemanticFlowNodeOccurrence)
    (branchSelected : terminateScopeCancellationDelta? program before
      (.terminateScope operationId origin input scopeId) commandId transitionIndex owner origin =
        some (owner, delta))
    (candidateSelected : candidateFlowNodeOccurrenceDeltaForOperation? program before after
      (.terminateScope operationId origin input scopeId) commandId transitionIndex = some delta)
    (accepted : flowNodeOccurrenceDeltaForOperation? program before after
      (.terminateScope operationId origin input scopeId) commandId transitionIndex = some delta)
    (projectedBefore : projectOpenFlowNodeOccurrences? program before = some current)
    (projectedAfter : projectOpenFlowNodeOccurrences? program after = some next) :
    candidateFlowNodeOccurrenceDeltaForOperation? program before after
        (.terminateScope operationId origin input scopeId) commandId transitionIndex = some delta ∧
      ExactCancellationAndOutsidePreservation current next delta
        (flowNodeOccurrenceRemovedByTermination before owner) := by
  constructor
  · exact candidateSelected
  · unfold terminateScopeCancellationDelta? at branchSelected
    simp only [Option.bind_eq_bind] at branchSelected
    obtain ⟨identity, identitySelected, branchSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    obtain ⟨cancelled, cancelledSelected, pairSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    have pairEq := Option.some.inj pairSelected
    have deltaEq : delta = instantaneousFlowNodeOccurrenceDeltaWithEnds commandId
        transitionIndex [identity] cancelled := (congrArg Prod.snd pairEq).symm
    have rawCancelledEq := termination_subtree_cancellation_ends_exact program before owner
      current cancelled projectedBefore cancelledSelected
    have cancelledEq : cancelled =
        (current.filter (flowNodeOccurrenceRemovedByTermination before owner) |>.map fun occurrence =>
          { anchor := occurrence.anchor, terminal := .cancelled }) := by
      rw [rawCancelledEq]
      exact termination_cancelled_map_eq before owner current
    have folded := accepted_operation_fold_at_projections program before after
      (.terminateScope operationId origin input scopeId) commandId transitionIndex delta
      current next accepted projectedBefore projectedAfter
    exact instantaneous_cancellation_branch_exact_and_preserves current next delta commandId
      transitionIndex [identity] cancelled
      (flowNodeOccurrenceRemovedByTermination before owner) deltaEq cancelledEq folded

/-- The actual incident-root cancellation stimulus cancels its exact open hosting subtree and preserves every outside occurrence. -/
theorem accepted_incident_root_cancellation_delta_cancels_exact_subtree
    (program : Program) (before after : RuntimeState)
    (commandId processInstanceId : SemanticId) (incidentId : EffectIncidentId)
    (transitionIndex : Nat) (root : ScopeOccurrenceId)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (current next : List OpenSemanticFlowNodeOccurrence)
    (branchSelected : incidentRootCancellationDelta? program before processInstanceId incidentId =
      some (root, delta))
    (candidateSelected : candidateFlowNodeOccurrenceDeltaForStimulus? program before
      (.cancelIncidentProcess commandId processInstanceId incidentId) commandId transitionIndex =
        some delta)
    (accepted : flowNodeOccurrenceDeltaForStimulus? program before after
      (.cancelIncidentProcess commandId processInstanceId incidentId) transitionIndex = some delta)
    (projectedBefore : projectOpenFlowNodeOccurrences? program before = some current)
    (projectedAfter : projectOpenFlowNodeOccurrences? program after = some next) :
    candidateFlowNodeOccurrenceDeltaForStimulus? program before
        (.cancelIncidentProcess commandId processInstanceId incidentId) commandId transitionIndex =
          some delta ∧
      ExactCancellationAndOutsidePreservation current next delta
        (flowNodeOccurrenceOwnedBySubtree before root) := by
  constructor
  · exact candidateSelected
  · unfold incidentRootCancellationDelta? at branchSelected
    simp only [Option.bind_eq_bind] at branchSelected
    obtain ⟨selectedRoot, rootSelected, branchSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    obtain ⟨cancelled, cancelledSelected, pairSelected⟩ :=
      Option.bind_eq_some_iff.mp branchSelected
    have pairEq := Option.some.inj pairSelected
    have rootEq : selectedRoot = root := congrArg Prod.fst pairEq
    have rawDeltaEq : delta = canonicalFlowNodeOccurrenceDelta [] cancelled :=
      (congrArg Prod.snd pairEq).symm
    subst selectedRoot
    have deltaEq : delta = instantaneousFlowNodeOccurrenceDeltaWithEnds commandId
        transitionIndex [] cancelled := by
      rw [rawDeltaEq]
      rfl
    have cancelledEq := owned_subtree_cancellation_ends_exact program before root current
      cancelled projectedBefore cancelledSelected
    have folded := accepted_stimulus_fold_at_projections program before after
      (.cancelIncidentProcess commandId processInstanceId incidentId) transitionIndex delta
      current next accepted projectedBefore projectedAfter
    exact instantaneous_cancellation_branch_exact_and_preserves current next delta commandId
      transitionIndex [] cancelled (flowNodeOccurrenceOwnedBySubtree before root)
      deltaEq cancelledEq folded

end BpmnSemantics.SemanticProcess
