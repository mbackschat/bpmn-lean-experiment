import BpmnSemantics.SemanticProcess.InternalSnapshotArmingRefinement
import BpmnSemantics.SemanticProcess.InternalRegionalArmingSelectionFrame

/-! Ordinary arming preserves unavailable refusable operations: consuming a token adds an owned wait, so scope completion cannot become newly enabled. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem onlyTokenOwner_facts (state : RuntimeState) (input : ControlPlaceId)
    (owner : ScopeOccurrenceId) (selected : onlyTokenOwner? state input = some owner) :
    owner ∈ tokenOwners state input ∧
      ∀ candidate ∈ tokenOwners state input, candidate = owner := by
  unfold onlyTokenOwner? at selected
  cases census : tokenOwners state input with
  | nil => simp [census] at selected
  | cons first rest =>
      simp only [census] at selected
      split at selected
      · rename_i same
        cases selected
        simp only [List.all_eq_true, decide_eq_true_eq] at same
        simpa [census] using same
      · contradiction

/-- Consuming a prepared owner's token cannot turn a mixed-owner input into a unique owner. -/
theorem prepared_arm_onlyTokenOwner_predecessor (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (selected : onlyTokenOwner? (applyInternalArmingPatch state patch) input = some owner) :
    onlyTokenOwner? state input = some owner := by
  by_cases sameInput : patch.input = input
  · have before := prepared_owner_lookup program state operation patch prepared
    rw [sameInput] at before
    obtain ⟨_, allBefore⟩ := onlyTokenOwner_facts state input patch.owner before
    have afterMember := (onlyTokenOwner_facts _ input owner selected).1
    unfold tokenOwners at afterMember
    obtain ⟨token, tokenMember, ownerEq⟩ := List.mem_map.mp afterMember
    obtain ⟨tokenMember, atInput⟩ := List.mem_filter.mp tokenMember
    have tokens : (applyInternalArmingPatch state patch).tokens =
        removeToken state.tokens patch.input patch.owner := by
      cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
    rw [tokens] at tokenMember
    have oldMember := (removeToken_sublist state.tokens patch.input patch.owner).subset tokenMember
    have oldOwner : owner ∈ tokenOwners state input := by
      exact List.mem_map.mpr ⟨token, List.mem_filter.mpr ⟨oldMember, atInput⟩, ownerEq⟩
    rw [allBefore owner oldOwner]
    exact before
  · rw [armingOwnerRead_frame state patch input sameInput] at selected
    exact selected

theorem prepared_arm_quiescent_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (owner : ScopeOccurrenceId) :
    scopeQuiescent (applyInternalArmingPatch state patch) owner = scopeQuiescent state owner := by
  have assigned := (prepared_arm_selection_unique program state operation patch prepared).2.2
  by_cases outside : patch.owner ≠ owner
  · exact arming_quiescent_frame state patch owner assigned outside
  · have sameOwner : patch.owner = owner := by simpa using outside
    obtain ⟨member, _⟩ := onlyTokenOwner_facts state patch.input patch.owner
      (prepared_owner_lookup program state operation patch prepared)
    unfold tokenOwners at member
    obtain ⟨token, tokenMember, tokenOwner⟩ := List.mem_map.mp member
    have owned : (state.tokens.any fun token => token.owner == owner) = true :=
      List.any_eq_true.mpr ⟨token, (List.mem_filter.mp tokenMember).1,
        by simp [tokenOwner, sameOwner]⟩
    have beforeQuiet : scopeQuiescent state owner = false := by simp [scopeQuiescent, owned]
    rw [beforeQuiet]
    cases write : patch.write <;>
      simp only [write, InternalArmingWrite.owner] at assigned
    all_goals
      simp [scopeQuiescent, applyInternalArmingPatch, write, List.not_any_eq_all_not,
        all_insertUserTaskWait, insertMessageWait, insertTimerWait, insertEffectWait,
        all_canonicalInsertBy, assigned, sameOwner]

private theorem find_canonicalInsertBy_rejected (before : α → α → Bool)
    (inserted : α) (values : List α) (select : α → Bool) (rejected : select inserted = false) :
    (canonicalInsertBy before inserted values).find? select = values.find? select := by
  induction values with
  | nil => simp [canonicalInsertBy, rejected]
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split <;> simp [List.find?, rejected, ih]

/-- Fresh ordinary Timer arming cannot replace a deadline named by an existing Activity record. -/
theorem prepared_arm_parentOwnedDeadline_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (expectedInstanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (prepared : prepareInternalArm? program state operation = some patch)
    (child parent : ScopeOccurrenceId) (boundary : BoundaryTimerArm) :
    parentOwnedDeadline? (applyInternalArmingPatch state patch) child parent boundary =
      parentOwnedDeadline? state child parent boundary := by
  have records : activityRecordsOwnLiveWork state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid
    simp_all only
  have fresh := prepared_arm_key_fresh program state operation patch prepared
  cases write : patch.write with
  | timer inserted =>
      rw [write] at fresh
      have unclaimed := activityRecords_do_not_claim_fresh_timer state inserted
        (fun old member => (fresh old member).1) records
      simp only [parentOwnedDeadline?, applyInternalArmingPatch, write]
      cases lookup : activityOccurrenceForScope? state.activityOccurrences child with
      | none => rfl
      | some record =>
          have recordMember : record ∈ state.activityOccurrences := by
            unfold activityOccurrenceForScope? at lookup
            split at lookup
            · rename_i selected census
              cases lookup
              have member : record ∈ state.activityOccurrences.filter (fun candidate =>
                  activityBodyScope? candidate == some child) := by rw [census]; simp
              exact (List.mem_filter.mp member).1
            · contradiction
          cases attachedEq : record.timerHandlerOccurrences.find? (fun candidate =>
              decide (candidate.elementId.value = boundary.elementId.value)) with
          | none => simp only [attachedEq]
          | some attached =>
              have attachedMember := List.mem_of_find?_eq_some attachedEq
              have rejected : timerIdNamesWait attached inserted = false := by
                have allRejected := unclaimed record recordMember
                simp only [anyTimerIdNamesWait, List.any_eq_false] at allRejected
                exact Bool.eq_false_iff.mpr (allRejected attached attachedMember)
              simp only [attachedEq, insertTimerWait]
              exact find_canonicalInsertBy_rejected _ _ _ _ (by simp [rejected])
  | _ => simp only [parentOwnedDeadline?, applyInternalArmingPatch, write]

theorem prepared_arm_enterScope_stays_unavailable (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (input entry : ControlPlaceId) (scope : DefinitionScopeId)
    (disabled : enterScopeState? state input entry scope = none) :
    enterScopeState? (applyInternalArmingPatch state patch) input entry scope = none := by
  obtain ⟨_, instanceId, running⟩ := prepared_arm_live_running program state operation patch prepared
  have control : (applyInternalArmingPatch state patch).control = state.control := by
    cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  have scopes : (applyInternalArmingPatch state patch).scopeOccurrences = state.scopeOccurrences := by
    cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  cases ownerEq : onlyTokenOwner? (applyInternalArmingPatch state patch) input with
  | none => simp [enterScopeState?, ownerEq]
  | some owner =>
      have beforeOwner := prepared_arm_onlyTokenOwner_predecessor program state operation patch
        prepared input owner ownerEq
      simp only [enterScopeState?, beforeOwner, running] at disabled
      simp only [enterScopeState?, ownerEq, control, running, scopes]
      dsimp only [Bind.bind, Option.bind] at disabled ⊢
      split at disabled
      · simp_all
      · contradiction

private theorem completeScope_isSome_frame (before after : RuntimeState)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (control : after.control = before.control)
    (pending : after.initiationPending = before.initiationPending)
    (quiet : ∀ owner, scopeQuiescent after owner = scopeQuiescent before owner)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    (completeScopeState? after scope output).isSome =
      (completeScopeState? before scope output).isSome := by
  simp only [completeScopeState?, scopes]
  split
  · rename_i occurrence census
    rw [quiet]
    split
    · rfl
    · simp only [completeQuiescentScope?, control, pending, scopes]
      cases occurrence.parent <;> cases output <;> cases before.control
      all_goals repeat' first | rfl | split
  · rfl

private theorem completeBoundedScope_isSome_frame (program : Program) (before after : RuntimeState)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (control : after.control = before.control)
    (pending : after.initiationPending = before.initiationPending)
    (quiet : ∀ owner, scopeQuiescent after owner = scopeQuiescent before owner)
    (deadline : ∀ child parent timer, parentOwnedDeadline? after child parent timer =
      parentOwnedDeadline? before child parent timer)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    (completeBoundedScope? program after scope output).isSome =
      (completeBoundedScope? program before scope output).isSome := by
  have ordinary := completeScope_isSome_frame before after scopes control pending quiet scope output
  have child : boundedScopeChildOccurrence? after scope =
      boundedScopeChildOccurrence? before scope := by simp only [boundedScopeChildOccurrence?, scopes]
  unfold completeBoundedScope?
  cases beforeEq : completeScopeState? before scope output <;>
    cases afterEq : completeScopeState? after scope output <;>
    simp only [beforeEq, afterEq, Option.isSome_none, Option.isSome_some] at ordinary ⊢
  all_goals try contradiction
  rw [child]
  cases boundedScopeDefinitionForChild? program scope with
  | none => rfl
  | some definition =>
      dsimp only
      cases boundedScopeChildOccurrence? before scope with
      | none => rfl
      | some occurrence =>
        dsimp only
        rw [deadline]
        cases parentOwnedDeadline? before occurrence.1 occurrence.2 definition.2 <;> rfl

theorem prepared_arm_completeBoundedScope_isSome_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (expectedInstanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (prepared : prepareInternalArm? program state operation = some patch)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    (completeBoundedScope? program (applyInternalArmingPatch state patch) scope output).isSome =
      (completeBoundedScope? program state scope output).isSome := by
  have scopes : (applyInternalArmingPatch state patch).scopeOccurrences = state.scopeOccurrences := by
    cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  have control : (applyInternalArmingPatch state patch).control = state.control := by
    cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  have pending : (applyInternalArmingPatch state patch).initiationPending = state.initiationPending := by
    cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  exact completeBoundedScope_isSome_frame program state (applyInternalArmingPatch state patch)
    scopes control pending (prepared_arm_quiescent_frame program state operation patch prepared)
    (prepared_arm_parentOwnedDeadline_frame program state operation patch expectedInstanceId valid prepared)
    scope output

theorem prepared_arm_compensationTrigger_stays_disabled (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (trigger : SemanticOperation)
    (disabled : attemptCompensationTrigger program trigger state = .disabled state) :
    attemptCompensationTrigger program trigger (applyInternalArmingPatch state patch) =
      .disabled (applyInternalArmingPatch state patch) := by
  obtain ⟨_, instanceId, running⟩ := prepared_arm_live_running program state operation patch prepared
  have control : (applyInternalArmingPatch state patch).control = state.control := by
    cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  have scopes : (applyInternalArmingPatch state patch).scopeOccurrences = state.scopeOccurrences := by
    cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  cases declarationEq : program.compensationExecution with
  | none => simp [attemptCompensationTrigger, declarationEq] at disabled
  | some declaration =>
    cases trigger <;> try { solve | simp [attemptCompensationTrigger, declarationEq] at disabled }
    case triggerCompensation id origin scope input output =>
      cases rejected : compensationTriggerProgramRejected program declaration id with
      | true => simp [attemptCompensationTrigger, declarationEq, rejected] at disabled
      | false =>
        cases afterOwner : onlyTokenOwner? (applyInternalArmingPatch state patch) input with
        | none => simp [attemptCompensationTrigger, declarationEq, rejected, control, running, afterOwner]
        | some owner =>
          have beforeOwner := prepared_arm_onlyTokenOwner_predecessor program state operation patch
            prepared input owner afterOwner
          have invalidOwner : compensationTriggerOwnerRejected state owner scope = true := by
            cases ownerRejected : compensationTriggerOwnerRejected state owner scope with
            | true => rfl
            | false =>
              simp only [attemptCompensationTrigger, declarationEq, rejected, running,
                beforeOwner, ownerRejected, Bool.false_eq_true, if_false] at disabled
              repeat' first | contradiction | split at disabled
          have afterInvalid : compensationTriggerOwnerRejected (applyInternalArmingPatch state patch)
              owner scope = true := by
            simpa only [compensationTriggerOwnerRejected, control, scopes] using invalidOwner
          simp [attemptCompensationTrigger, declarationEq, rejected, control, running,
            afterOwner, afterInvalid]

private theorem validSnapshotSuccessor_not_disabled (program : Program)
    (operation : SemanticOperation) (state : RuntimeState) :
    applyValidSnapshotSuccessor program operation state ≠ .disabled operation := by
  unfold applyValidSnapshotSuccessor
  split <;> simp

private theorem attemptCompleteScope_disabled_iff (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    attemptCompleteScope program operation state scope output = .disabled operation ↔
      completeBoundedScope? program state scope output = none ∨
        selectedCompletionOccurrence? state scope = none := by
  cases completion : completeBoundedScope? program state scope output with
  | none => simp [attemptCompleteScope, completion]
  | some completed =>
    cases selected : selectedCompletionOccurrence? state scope with
    | none => simp [attemptCompleteScope, completion, selected]
    | some occurrence =>
      simp only [attemptCompleteScope, completion, selected, reduceCtorEq, or_self, iff_false]
      cases promoted : promoteCompensationParentContext program state occurrence with
      | refused reason returned => simp
      | disabled returned =>
        have same := (promoteCompensationParentContext_disabled_shape program state returned
          occurrence promoted).1
        subst returned
        simp only [completion]
        exact validSnapshotSuccessor_not_disabled program operation _
      | applied returned =>
        obtain ⟨declaration, target, snapshot, _, _, _, _, returnedEq⟩ :=
          promoteCompensationParentContext_applied_shape program state returned occurrence promoted
        have frame : (completeBoundedScope? program returned scope output).isSome = true := by
          rw [returnedEq]
          have stable := completeBoundedScope_isSome_frame program state
            { state with compensationParentContextRetentions :=
                (state.compensationParentContextRetentions.map
                  (promoteMatchingRetention occurrence target snapshot)) }
            rfl rfl rfl (fun _ => rfl) (fun _ _ _ => rfl) scope output
          simpa only [completion, Option.isSome_some] using stable
        cases after : completeBoundedScope? program returned scope output with
        | none => simp [after] at frame
        | some successor =>
          simp only [after]
          exact validSnapshotSuccessor_not_disabled program operation _

theorem prepared_arm_attemptCompleteScope_stays_disabled (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (expectedInstanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (prepared : prepareInternalArm? program state operation = some patch)
    (completion : SemanticOperation) (scope : DefinitionScopeId) (output : Option ControlPlaceId)
    (disabled : attemptCompleteScope program completion state scope output = .disabled completion) :
    attemptCompleteScope program completion (applyInternalArmingPatch state patch) scope output =
      .disabled completion := by
  apply (attemptCompleteScope_disabled_iff program completion _ scope output).mpr
  rcases (attemptCompleteScope_disabled_iff program completion state scope output).mp disabled with
    unavailable | noOccurrence
  · left
    have frame := prepared_arm_completeBoundedScope_isSome_frame program state operation patch
      expectedInstanceId valid prepared scope output
    cases after : completeBoundedScope? program (applyInternalArmingPatch state patch) scope output with
    | none => rfl
    | some successor => simp [after, unavailable] at frame
  · right
    cases write : patch.write <;>
      simpa only [selectedCompletionOccurrence?, applyInternalArmingPatch, write] using noOccurrence

private theorem enterScope_scope_frame (before after : RuntimeState)
    (input entry : ControlPlaceId) (scope : DefinitionScopeId)
    (owner : onlyTokenOwner? after input = onlyTokenOwner? before input)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (activations : after.scopeActivations = before.scopeActivations) :
    (enterScopeState? after input entry scope).map (·.scopeOccurrences) =
      (enterScopeState? before input entry scope).map (·.scopeOccurrences) := by
  simp only [enterScopeState?, owner, control, scopes, scopeActivationCount, activations]
  cases onlyTokenOwner? before input <;> cases before.control <;>
    dsimp only [Bind.bind, Option.bind]
  all_goals repeat' first | rfl | split

private theorem entry_retention_update (state : RuntimeState)
    (retentions : List CompensationParentContextRetention)
    (input entry : ControlPlaceId) (scope : DefinitionScopeId) :
    (enterScopeState? { state with compensationParentContextRetentions := retentions }
      input entry scope).isSome = (enterScopeState? state input entry scope).isSome := by
  have frame := enterScope_scope_frame state
    { state with compensationParentContextRetentions := retentions }
    input entry scope rfl rfl rfl rfl
  simpa only [Option.isSome_map] using congrArg Option.isSome frame

private theorem applyPreparedReservation_not_disabled (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (child : RuntimeScopeOccurrence) (evaluate : RuntimeState → Option RuntimeState)
    (available : (evaluate state).isSome = true)
    (retentionFrame : ∀ retentions, (evaluate
      { state with compensationParentContextRetentions := retentions }).isSome =
        (evaluate state).isSome) :
    applyPreparedReservation program operation state child evaluate ≠ .disabled operation := by
  unfold applyPreparedReservation
  cases reserved : reserveCompensationParentContext program state child with
  | refused reason returned => simp
  | disabled returned =>
    have same := (reserveCompensationParentContext_disabled_shape program state returned child reserved).1
    subst returned
    cases after : evaluate state with
    | none => simp [after] at available
    | some successor => simpa only [after] using validSnapshotSuccessor_not_disabled program operation successor
  | applied returned =>
    obtain ⟨declaration, target, _, _, _, returnedEq⟩ :=
      reserveCompensationParentContext_applied_shape program state returned child reserved
    have afterAvailable : (evaluate returned).isSome = true := by
      rw [returnedEq, retentionFrame]
      exact available
    cases after : evaluate returned with
    | none => simp [after] at afterAvailable
    | some successor => simpa only [after] using validSnapshotSuccessor_not_disabled program operation successor

theorem prepared_arm_attemptEnterScope_stays_disabled (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (enter : SemanticOperation) (input entry : ControlPlaceId) (scope : DefinitionScopeId)
    (disabled : attemptEnterScope program enter state input entry scope = .disabled enter) :
    attemptEnterScope program enter (applyInternalArmingPatch state patch) input entry scope =
      .disabled enter := by
  cases afterOwner : onlyTokenOwner? (applyInternalArmingPatch state patch) input with
  | none => simp [attemptEnterScope, enterScopeState?, afterOwner]
  | some owner =>
    have beforeOwner := prepared_arm_onlyTokenOwner_predecessor program state operation patch
      prepared input owner afterOwner
    have scopeFrame := enterScope_scope_frame state (applyInternalArmingPatch state patch)
      input entry scope (afterOwner.trans beforeOwner.symm)
      (by cases write : patch.write <;> simp only [applyInternalArmingPatch, write])
      (by cases write : patch.write <;> simp only [applyInternalArmingPatch, write])
      (by cases write : patch.write <;> simp only [applyInternalArmingPatch, write])
    cases afterEntry : enterScopeState? (applyInternalArmingPatch state patch) input entry scope with
    | none => simp [attemptEnterScope, afterEntry]
    | some after =>
      cases beforeEntry : enterScopeState? state input entry scope with
      | none => simp [afterEntry, beforeEntry] at scopeFrame
      | some before =>
        have sameScopes : after.scopeOccurrences = before.scopeOccurrences := by
          simpa only [afterEntry, beforeEntry, Option.map_some, Option.some.injEq] using scopeFrame
        have childFrame : childOccurrenceAfterEntry? (applyInternalArmingPatch state patch)
            input scope after = childOccurrenceAfterEntry? state input scope before := by
          simp only [childOccurrenceAfterEntry?, afterOwner, beforeOwner, sameScopes]
        cases childEq : childOccurrenceAfterEntry? state input scope before with
        | none => simp [attemptEnterScope, afterEntry, childFrame, childEq]
        | some child =>
          have impossible := applyPreparedReservation_not_disabled program enter state child
            (fun current => enterScopeState? current input entry scope)
            (by simp [beforeEntry]) (fun retentions => entry_retention_update state retentions input entry scope)
          exact False.elim (impossible (by simpa [attemptEnterScope, beforeEntry, childEq] using disabled))

private theorem armBoundedScope_scope_frame (before after : RuntimeState)
    (origin : BpmnElementOrigin) (input entry : ControlPlaceId) (scope : DefinitionScopeId)
    (timer : BoundaryTimerArm)
    (owner : onlyTokenOwner? after input = onlyTokenOwner? before input)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (activations : after.scopeActivations = before.scopeActivations) :
    (armBoundedScopeState? after origin input entry scope timer).map (·.scopeOccurrences) =
      (armBoundedScopeState? before origin input entry scope timer).map (·.scopeOccurrences) := by
  have ordinary := enterScope_scope_frame before after input entry scope owner control scopes activations
  simp only [armBoundedScopeState?, owner]
  cases onlyTokenOwner? before input with
  | none => rfl
  | some selected =>
    dsimp only [Bind.bind, Option.bind]
    cases beforeEntry : enterScopeState? before input entry scope <;>
      cases afterEntry : enterScopeState? after input entry scope <;>
      simp only [beforeEntry, afterEntry, Option.map_some, Option.map_none, Option.some.injEq]
        at ordinary ⊢
    all_goals try contradiction
    rename_i beforeEntered afterEntered
    rw [ordinary]
    cases ((List.find? (fun occurrence =>
        decide (occurrence.id.definitionScopeId = scope) && decide (occurrence.parent = some selected))
        beforeEntered.scopeOccurrences).map (·.id)) <;>
      dsimp only [Bind.bind, Option.bind, Pure.pure, Option.map, armScopeDeadline]
    all_goals first | rfl | exact congrArg some ordinary

theorem prepared_arm_attemptEnterBoundedScope_stays_disabled (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (enter : SemanticOperation) (origin : BpmnElementOrigin)
    (input entry : ControlPlaceId) (scope : DefinitionScopeId) (timer : BoundaryTimerArm)
    (disabled : attemptEnterBoundedScope program enter state origin input entry scope timer =
      .disabled enter) :
    attemptEnterBoundedScope program enter (applyInternalArmingPatch state patch)
      origin input entry scope timer = .disabled enter := by
  cases afterOwner : onlyTokenOwner? (applyInternalArmingPatch state patch) input with
  | none => simp [attemptEnterBoundedScope, armBoundedScopeState?, afterOwner]
  | some owner =>
    have beforeOwner := prepared_arm_onlyTokenOwner_predecessor program state operation patch
      prepared input owner afterOwner
    have scopeFrame := armBoundedScope_scope_frame state (applyInternalArmingPatch state patch)
      origin input entry scope timer (afterOwner.trans beforeOwner.symm)
      (by cases write : patch.write <;> simp only [applyInternalArmingPatch, write])
      (by cases write : patch.write <;> simp only [applyInternalArmingPatch, write])
      (by cases write : patch.write <;> simp only [applyInternalArmingPatch, write])
    cases afterEntry : armBoundedScopeState? (applyInternalArmingPatch state patch)
        origin input entry scope timer with
    | none => simp [attemptEnterBoundedScope, afterEntry]
    | some after =>
      cases beforeEntry : armBoundedScopeState? state origin input entry scope timer with
      | none => simp [afterEntry, beforeEntry] at scopeFrame
      | some before =>
        have sameScopes : after.scopeOccurrences = before.scopeOccurrences := by
          simpa only [afterEntry, beforeEntry, Option.map_some, Option.some.injEq] using scopeFrame
        have childFrame : childOccurrenceAfterEntry? (applyInternalArmingPatch state patch)
            input scope after = childOccurrenceAfterEntry? state input scope before := by
          simp only [childOccurrenceAfterEntry?, afterOwner, beforeOwner, sameScopes]
        cases childEq : childOccurrenceAfterEntry? state input scope before with
        | none => simp [attemptEnterBoundedScope, afterEntry, childFrame, childEq]
        | some child =>
          have impossible := applyPreparedReservation_not_disabled program enter state child
            (fun current => armBoundedScopeState? current origin input entry scope timer)
            (by simp [beforeEntry]) (fun retentions => by
              simpa only [Option.isSome_map] using congrArg Option.isSome
                (armBoundedScope_scope_frame state
                  { state with compensationParentContextRetentions := retentions }
                  origin input entry scope timer rfl rfl rfl rfl))
          exact False.elim (impossible (by simpa [attemptEnterBoundedScope, beforeEntry, childEq] using disabled))

theorem attemptInternalOperation_operation_identity (program : Program)
    (operation : SemanticOperation) (state : RuntimeState) :
    (attemptInternalOperation program operation state).operation = operation := by
  have validated (successor : RuntimeState) :
      (applyValidSnapshotSuccessor program operation successor).operation = operation := by
    unfold applyValidSnapshotSuccessor
    split <;> rfl
  unfold attemptInternalOperation
  repeat' first
    | rfl
    | exact validated _
    | split
    | unfold attemptEnterScope
    | unfold attemptEnterBoundedScope
    | unfold attemptCompleteScope
    | unfold applyPreparedReservation

end BpmnSemantics.SemanticProcess.InternalCommutation
