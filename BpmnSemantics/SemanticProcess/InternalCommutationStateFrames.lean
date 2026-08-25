import BpmnSemantics.SemanticProcess.InternalCommutationProjection

/-! # Internal commutation state-frame proofs

Collects the collection-order, owner, position, activation, declaration, and identity frames shared by the runtime-preservation and final commutation proofs.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

theorem canonicalCollectionOrder_internalArmingOrders (state : RuntimeState)
    (canonical : canonicalCollectionOrder state = true) :
    orderedBy activationBefore state.activations = true ∧ orderedBy messageActivationBefore state.messageActivations = true ∧
      orderedBy timerActivationBefore state.timerActivations = true ∧
      orderedBy effectActivationBefore state.effectActivations = true ∧
      orderedBy activityVariableScopeBefore state.variables.activities = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at canonical
  exact ⟨canonical.1.1.1.1.1.1.1.1.1.1.1.1.2, canonical.1.1.1.1.1.1.1.1.2, canonical.1.1.1.1.1.1.1.2, canonical.1.1.1.1.1.1.2, canonical.1.1.1.1.1.2⟩

def runningStateInstance? (state : RuntimeState) : Option SemanticId := match state.control with
  | .running instanceId => some instanceId
  | _ => none

theorem awaitUserTaskState_eq (state : RuntimeState) (input output : ControlPlaceId) (task : UserTaskDefinition) : awaitUserTaskState? state input output task = (do let owner ← onlyTokenOwner? state input; let _ ← runningStateInstance? state; pure (activateUserTask state owner.processInstanceId owner input output task)) := rfl

theorem awaitMessageState_eq (state : RuntimeState) (input output : ControlPlaceId) (message : MessageDefinition) : awaitMessageState? state input output message = (do let owner ← onlyTokenOwner? state input; let _ ← runningStateInstance? state; pure (activateMessage state owner.processInstanceId owner input output message)) := rfl

theorem awaitTimerState_eq (state : RuntimeState) (input output : ControlPlaceId) (timer : TimerDefinition) : awaitTimerState? state input output timer = (do let owner ← onlyTokenOwner? state input; let _ ← runningStateInstance? state; pure (activateTimer state owner.processInstanceId owner input output timer)) := rfl

theorem awaitEffectState_eq (state : RuntimeState) (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute) : awaitEffectState? state input output effect route = (do let owner ← onlyTokenOwner? state input; let _ ← runningStateInstance? state; pure (activateEffect state owner.processInstanceId owner input output effect route)) := rfl

theorem prepareInternalArm_applies (program : Program) (state : RuntimeState) (operation : SemanticOperation) (patch : InternalArmingPatch) (prepared : prepareInternalArm? program state operation = some patch) :
    fire? program operation state = some (applyInternalArmingPatch state patch) := by
  cases operation <;>
    simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?,
      applyInternalArmingPatch, fire?, awaitUserTaskState_eq, awaitMessageState_eq,
      awaitTimerState_eq, awaitEffectState_eq, runningStateInstance?, activateUserTask, activateMessage,
      activateTimer, activateEffect, addActivityVariableScope]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        obtain ⟨_, _, _, patchEq⟩ := prepared
        rfl

theorem prepared_operation_eq (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    patch.operation = operation := by
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        obtain ⟨_, _, _, patchEq⟩ := prepared
        simp_all

theorem prepared_owner_lookup (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    onlyTokenOwner? state patch.input = some patch.owner := by
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        rcases prepared with ⟨_, _, _, rfl⟩
        exact ownerEq

theorem prepared_arm_live_running (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    exactLiveOccurrence state patch.owner = true ∧
      ∃ instanceId, state.control = .running instanceId := by
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        rcases prepared with ⟨_, _, _, rfl⟩
        simp_all

theorem applyInternalArmingPatch_preserves_runtimePosition (program : Program)
    (expectedInstanceId : SemanticId) (state : RuntimeState) (patch : InternalArmingPatch)
    (position : runtimePositionValid program expectedInstanceId state = true)
    (selected : onlyTokenOwner? state patch.input = some patch.owner) :
    runtimePositionValid program expectedInstanceId (applyInternalArmingPatch state patch) = true := by
  apply runtimePositionValid_removeToken_frame program expectedInstanceId state _ patch.input patch.owner
    position selected
  all_goals cases patch with | mk _ _ _ _ _ _ _ write => cases write <;> rfl

theorem occurrence_fields_differ (left right : OccurrenceId) (different : left ≠ right) :
    (left.processInstanceId ≠ right.processInstanceId ∨
      left.elementId.value ≠ right.elementId.value) ∨ left.activation ≠ right.activation := by
  by_cases process : left.processInstanceId ≠ right.processInstanceId
  · exact Or.inl (Or.inl process)
  · by_cases element : left.elementId.value ≠ right.elementId.value
    · exact Or.inl (Or.inr element)
    · exact Or.inr fun activation => different (by
        cases left with | mk lp le la =>
          cases right with | mk rp re ra =>
            cases lp; cases rp; cases le; cases re; simp_all)

theorem key_false_of_projection_ne (project : α → OccurrenceId) (key : α → α → Bool)
    (left right : α) (different : project left ≠ project right)
    (sound : key left right = true → project left = project right) : key left right = false :=
  Bool.eq_false_iff.mpr fun keyed => different (sound keyed)

theorem prepared_arm_key_fresh (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    match patch.write with
    | .userTask inserted => ∀ old ∈ state.waits,
        userTaskWaitKeyMatches inserted old = false ∧
          userTaskWaitKeyMatches old inserted = false
    | .message inserted => ∀ old ∈ state.messageWaits,
        messageWaitKeyMatches inserted old = false ∧
          messageWaitKeyMatches old inserted = false
    | .timer inserted => ∀ old ∈ state.timerWaits,
        timerWaitKeyMatches inserted old = false ∧
          timerWaitKeyMatches old inserted = false
    | .effect inserted _ => ∀ old ∈ state.effectWaits,
        effectWaitKeyMatches inserted old = false ∧
          effectWaitKeyMatches old inserted = false := by
  obtain ⟨_, absent⟩ := prepared_arm_anchor_shape program state operation patch prepared
  have missing : patch.write.occurrence ∉ openWaitAnchors state := by
    simpa [openWaitAnchorAbsent, List.contains_eq_mem] using absent
  cases patch with | mk _ _ _ _ _ _ _ write =>
    cases write with
    | userTask inserted =>
        intro old member
        have sound (left right : UserTaskWait) : userTaskWaitKeyMatches left right = true →
            userTaskWaitOccurrence left = userTaskWaitOccurrence right := by
          intro keyed
          simp only [userTaskWaitKeyMatches, Bool.and_eq_true, decide_eq_true_eq] at keyed
          obtain ⟨⟨process, element⟩, activation⟩ := keyed
          simp only [userTaskWaitOccurrence]
          rw [process, congrArg (fun value : TaskDefinitionId => value.value) element, activation]
        have different : userTaskWaitOccurrence old ≠ userTaskWaitOccurrence inserted := by
          intro same
          apply missing
          simp only [InternalArmingWrite.occurrence, openWaitAnchors, List.mem_append,
            List.mem_map, or_assoc]
          exact Or.inl ⟨old, member, same⟩
        exact ⟨key_false_of_projection_ne _ _ _ _ different.symm (sound _ _),
          key_false_of_projection_ne _ _ _ _ different (sound _ _)⟩

    | message inserted =>
        intro old member
        have sound (left right : MessageWait) : messageWaitKeyMatches left right = true →
            messageWaitOccurrence left = messageWaitOccurrence right := by
          intro keyed
          simp only [messageWaitKeyMatches, Bool.and_eq_true, decide_eq_true_eq] at keyed
          obtain ⟨⟨process, element⟩, activation⟩ := keyed
          simp only [messageWaitOccurrence]
          rw [process, congrArg (fun value : NodeId => value.value) element, activation]
        have different : messageWaitOccurrence old ≠ messageWaitOccurrence inserted := by
          intro same
          apply missing
          simp only [InternalArmingWrite.occurrence, openWaitAnchors, List.mem_append,
            List.mem_map, or_assoc]
          exact Or.inr (Or.inl ⟨old, member, same⟩)
        exact ⟨key_false_of_projection_ne _ _ _ _ different.symm (sound _ _),
          key_false_of_projection_ne _ _ _ _ different (sound _ _)⟩
    | timer inserted =>
        intro old member
        have sound (left right : TimerWait) : timerWaitKeyMatches left right = true →
            timerWaitOccurrence left = timerWaitOccurrence right := by
          intro keyed
          simp only [timerWaitKeyMatches, Bool.and_eq_true, decide_eq_true_eq] at keyed
          obtain ⟨⟨process, element⟩, activation⟩ := keyed
          simp only [timerWaitOccurrence]
          rw [process, congrArg (fun value : NodeId => value.value) element, activation]
        have different : timerWaitOccurrence old ≠ timerWaitOccurrence inserted := by
          intro same
          apply missing
          simp only [InternalArmingWrite.occurrence, openWaitAnchors, List.mem_append,
            List.mem_map, or_assoc]
          exact Or.inr (Or.inr (Or.inl ⟨old, member, same⟩))
        exact ⟨key_false_of_projection_ne _ _ _ _ different.symm (sound _ _),
          key_false_of_projection_ne _ _ _ _ different (sound _ _)⟩
    | effect inserted bindings =>
        intro old member
        have sound (left right : EffectWait) : effectWaitKeyMatches left right = true →
            effectWaitOccurrence left = effectWaitOccurrence right := by
          intro keyed
          simp only [effectWaitKeyMatches, Bool.and_eq_true, decide_eq_true_eq] at keyed
          obtain ⟨⟨process, element⟩, activation⟩ := keyed
          simp only [effectWaitOccurrence]
          rw [process, congrArg (fun value : NodeId => value.value) element, activation]
        have different : effectWaitOccurrence old ≠ effectWaitOccurrence inserted := by
          intro same
          apply missing
          simp only [InternalArmingWrite.occurrence, openWaitAnchors, List.mem_append,
            List.mem_map, or_assoc]
          exact Or.inr (Or.inr (Or.inr (Or.inl ⟨old, member, same⟩)))
        exact ⟨key_false_of_projection_ne _ _ _ _ different.symm (sound _ _),
          key_false_of_projection_ne _ _ _ _ different (sound _ _)⟩

theorem orderedBy_insertMessageWait_preserved (wait : MessageWait) (waits : List MessageWait)
    (ordered : orderedBy messageWaitBefore waits = true) :
    orderedBy messageWaitBefore (insertMessageWait wait waits) = true :=
  orderedBy_canonicalInsertBy messageWaitBefore
    (fun l r => waitOccurrenceBefore_asymm l.processInstanceId r.processInstanceId
      l.owner r.owner l.elementId r.elementId l.activation r.activation) wait waits ordered

theorem orderedBy_insertTimerWait_preserved (wait : TimerWait) (waits : List TimerWait)
    (ordered : orderedBy timerWaitBefore waits = true) :
    orderedBy timerWaitBefore (insertTimerWait wait waits) = true :=
  orderedBy_canonicalInsertBy timerWaitBefore
    (fun l r => waitOccurrenceBefore_asymm l.processInstanceId r.processInstanceId
      l.owner r.owner l.elementId r.elementId l.activation r.activation) wait waits ordered

theorem orderedBy_insertEffectWait_preserved (wait : EffectWait) (waits : List EffectWait)
    (ordered : orderedBy effectWaitBefore waits = true) :
    orderedBy effectWaitBefore (insertEffectWait wait waits) = true :=
  orderedBy_canonicalInsertBy effectWaitBefore
    (fun l r => waitOccurrenceBefore_asymm l.processInstanceId r.processInstanceId
      l.owner r.owner l.elementId r.elementId l.activation r.activation) wait waits ordered

theorem occurrenceKeysUnique_canonicalInsertBy [DecidableEq α] (before key : α → α → Bool)
    (inserted : α) (values : List α)
    (prior : values.all (occursOnce key values) = true)
    (fresh : ∀ old ∈ values, key inserted old = false ∧ key old inserted = false)
    (self : key inserted inserted = true) :
    (canonicalInsertBy before inserted values).all
        (occursOnce key (canonicalInsertBy before inserted values)) = true := by
  simp only [List.all_eq_true] at prior ⊢
  intro value member
  rw [mem_canonicalInsertBy] at member
  rw [occursOnce, length_filter_canonicalInsertBy]
  rcases member with same | oldMember
  · subst value
    have none : (values.filter (key inserted)).length = 0 := by
      apply List.length_eq_zero_iff.mpr
      apply List.filter_eq_nil_iff.mpr
      intro old oldMember holds
      rw [(fresh old oldMember).1] at holds
      contradiction
    simp [self, none]
  · have rejected := (fresh value oldMember).2
    have priorValue : (values.filter (key value)).length = 1 := by
      simpa [occursOnce] using prior value oldMember
    simp [rejected, priorValue]

theorem orderedBy_replaceStringKey (key : α → String) (before : α → α → Bool)
    (shape : ∀ left right, before left right = stringKeyBefore key left right)
    (inserted : α) (keep : α → Bool) (values : List α)
    (ordered : orderedBy before values = true) :
    orderedBy before (canonicalInsertBy before inserted (values.filter keep)) = true := by
  apply orderedBy_canonicalInsertBy before
    (fun left right forward => by
      rw [shape right left]
      apply stringKeyBefore_asymm key left right
      rw [← shape left right]
      exact forward)
  exact orderedBy_filter
    (fun a b c first second => by
      rw [shape c a]
      apply stringKeyBefore_compose key a b c
      · rw [← shape b a]; exact first
      · rw [← shape c b]; exact second)
    keep values ordered

theorem orderedBy_insertActivityVariableScope_preserved
    (scope : ActivityVariableScope) (values : List ActivityVariableScope)
    (ordered : orderedBy activityVariableScopeBefore values = true) :
    orderedBy activityVariableScopeBefore (insertActivityVariableScope scope values) = true := by
  rw [insertActivityVariableScope_eq_canonicalInsertBy]
  apply orderedBy_canonicalInsertBy activityVariableScopeBefore
    activityVariableScopeBefore_asymm
  exact ordered

theorem applyInternalArmingPatch_preserves_order (state : RuntimeState)
    (patch : InternalArmingPatch) (canonical : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (applyInternalArmingPatch state patch) = true := by
  have updateOrders := canonicalCollectionOrder_internalArmingOrders state canonical
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at canonical ⊢
  cases patch with | mk _ _ _ _ _ _ _ write =>
    cases write with
    | userTask wait =>
        have activationOrder := orderedBy_replaceStringKey
          (fun value : TaskActivation => value.taskId.value) activationBefore
          (fun _ _ => rfl) { taskId := wait.task.id, count := wait.activation }
          (fun activation => !decide (activation.taskId = wait.task.id)) state.activations
          updateOrders.1
        simp only [applyInternalArmingPatch]
        simp only [setActivationCount, insertTaskActivation_eq_canonicalInsertBy]
        simp_all [orderedBy_insertUserTaskWait]
    | message wait =>
        have activationOrder := orderedBy_replaceStringKey
          (fun value : MessageActivation => value.elementId.value) messageActivationBefore
          (fun _ _ => rfl) { elementId := wait.elementId, count := wait.activation }
          (fun activation => !decide (activation.elementId = wait.elementId))
          state.messageActivations updateOrders.2.1
        simp only [applyInternalArmingPatch, setMessageActivationCount]
        simp_all [orderedBy_insertMessageWait_preserved]
    | timer wait =>
        have activationOrder := orderedBy_replaceStringKey
          (fun value : TimerActivation => value.elementId.value) timerActivationBefore
          (fun _ _ => rfl) { elementId := wait.elementId, count := wait.activation }
          (fun activation => !decide (activation.elementId = wait.elementId))
          state.timerActivations updateOrders.2.2.1
        simp only [applyInternalArmingPatch, setTimerActivationCount]
        simp_all [orderedBy_insertTimerWait_preserved]
    | effect wait bindings =>
        have activationOrder := orderedBy_replaceStringKey
          (fun value : EffectActivation => value.elementId.value) effectActivationBefore
          (fun _ _ => rfl) { elementId := wait.elementId, count := wait.activation }
          (fun activation => !decide (activation.elementId = wait.elementId))
          state.effectActivations updateOrders.2.2.2.1
        have scopeOrder := orderedBy_insertActivityVariableScope_preserved
          { owner := effectWaitOccurrence wait, bindings } state.variables.activities
          updateOrders.2.2.2.2
        simp only [applyInternalArmingPatch, setEffectActivationCount]
        simp_all [orderedBy_insertEffectWait_preserved]

theorem prepared_arm_activation_next (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    match patch.write with
    | .userTask wait => wait.activation = activationCount state wait.task.id + 1
    | .timer wait => wait.activation = timerActivationCount state wait.elementId + 1
    | .message _ | .effect _ _ => True := by
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        obtain ⟨_, _, _, patchEq⟩ := prepared
        simp_all

theorem prepared_arm_selection_unique (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    exactProgramSelection program patch.operation patch.owner = true ∧
      uniqueFamilyDeclarer? program patch.operation patch.write.kind patch.write.elementId = true ∧
      patch.write.owner = patch.owner := by
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        obtain ⟨_, _, _, patchEq⟩ := prepared
        simp_all [InternalArmingWrite.owner]

theorem prepared_arm_declared (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    match patch.write with
    | .userTask wait => declaredByExactlyOneOwnedOperation program
        (userTaskWaitDeclarers program wait.task.id) wait.owner = true
    | .message wait => declaredByExactlyOneOwnedOperation program
        (messageWaitDeclarers program wait.elementId) wait.owner = true
    | .timer wait => declaredByExactlyOneOwnedOperation program
        (timerWaitDeclarers program wait.elementId) wait.owner = true
    | .effect wait _ => declaredByExactlyOneOwnedOperation program
        (effectWaitDeclarers program wait.elementId) wait.owner = true := by
  have facts := prepared_arm_selection_unique program state operation patch prepared
  cases patch with | mk patchOperation _ _ _ _ _ patchOwner write =>
    cases write <;>
      simp_all [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
        InternalArmingWrite.elementId, InternalArmingWrite.owner]
    all_goals
      exact declaredByExactlyOneOwnedOperation_of_exactSelection program patchOperation
        patchOwner [patchOperation] rfl facts.1

theorem applyInternalArmingPatch_preserves_identityBound (state : RuntimeState)
    (patch : InternalArmingPatch)
    (next : match patch.write with
      | .userTask wait => wait.activation = activationCount state wait.task.id + 1
      | .timer wait => wait.activation = timerActivationCount state wait.elementId + 1
      | .message _ | .effect _ _ => True)
    (holds : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound (applyInternalArmingPatch state patch) = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at holds ⊢
  obtain ⟨⟨tasks, timers⟩, activities⟩ := holds
  cases patch with | mk _ _ _ _ _ _ _ write =>
    cases write with
    | userTask wait =>
        refine ⟨⟨?_, ?_⟩, ?_⟩
        · simp only [applyInternalArmingPatch, all_insertUserTaskWait, Bool.and_eq_true,
            List.all_eq_true, decide_eq_true_eq]
          refine ⟨?_, ?_⟩
          · change wait.activation ≤ activationCount ({ state with activations :=
                (setActivationCount state.activations wait.task.id wait.activation) }) wait.task.id
            rw [activationCount_setActivationCount_self]
            exact Nat.le_refl _
          · intro candidate member
            have prior := List.all_eq_true.mp tasks candidate member
            simp only [decide_eq_true_eq] at prior
            change candidate.activation ≤ activationCount ({ state with activations :=
                (setActivationCount state.activations wait.task.id wait.activation) }) candidate.task.id
            by_cases same : candidate.task.id = wait.task.id
            · rw [same] at prior ⊢
              rw [activationCount_setActivationCount_self, next]
              exact Nat.le_trans prior (Nat.le_succ _)
            · rw [activationCount_setActivationCount_other _ _ _ _ same]
              exact prior
        · change (state.timerWaits.all fun candidate =>
              decide (candidate.activation ≤ timerActivationCount state candidate.elementId)) = true
          exact timers
        · change (state.activityOccurrences.all fun record =>
              decide (record.activation ≤ activityActivationCount state
                ⟨record.activityElementId.value⟩)) = true
          exact activities
    | timer wait =>
        refine ⟨⟨?_, ?_⟩, ?_⟩
        · change (state.waits.all fun candidate =>
              decide (candidate.activation ≤ activationCount state candidate.task.id)) = true
          exact tasks
        · simp only [applyInternalArmingPatch, insertTimerWait, all_canonicalInsertBy,
            Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq]
          refine ⟨?_, ?_⟩
          · change wait.activation ≤ timerActivationCount ({ state with timerActivations :=
                (setTimerActivationCount state.timerActivations wait.elementId wait.activation) })
                wait.elementId
            rw [timerActivationCount_set_self]
            exact Nat.le_refl _
          · intro candidate member
            have prior := List.all_eq_true.mp timers candidate member
            simp only [decide_eq_true_eq] at prior
            change candidate.activation ≤ timerActivationCount ({ state with timerActivations :=
                (setTimerActivationCount state.timerActivations wait.elementId wait.activation) })
                candidate.elementId
            by_cases same : candidate.elementId = wait.elementId
            · rw [same] at prior ⊢
              rw [timerActivationCount_set_self, next]
              exact Nat.le_trans prior (Nat.le_succ _)
            · rw [timerActivationCount_set_other _ _ _ _ same]
              exact prior
        · change (state.activityOccurrences.all fun record =>
              decide (record.activation ≤ activityActivationCount state
                ⟨record.activityElementId.value⟩)) = true
          exact activities
    | message _ | effect _ _ =>
        exact ⟨⟨tasks, timers⟩, activities⟩

theorem smiBindings_insertTimerWait_frame (program : Program) (state : RuntimeState)
    (inserted : TimerWait)
    (disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ boundaryTimer _ =>
          boundaryTimer.elementId ≠ inserted.elementId
      | _ => True)
    (valid : sequentialMultiInstanceProgramBindingsValid program state = true) :
    sequentialMultiInstanceProgramBindingsValid program
      { state with timerWaits := insertTimerWait inserted state.timerWaits } = true := by
  simp only [sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid ⊢
  refine ⟨?_, ?_⟩
  · intro controller member
    have prior := valid.1 controller member
    unfold sequentialMultiInstanceControllerProgramBindingValid at prior ⊢
    generalize recordsEq : state.activityOccurrences.filter
      (controllerNamesActivityOccurrence controller) = records at prior ⊢
    cases records with
    | nil => simp at prior
    | cons record rest =>
        cases rest with
        | cons next tail => simp at prior
        | nil =>
            simp only at prior ⊢
            split at *
            · rename_i candidateId candidateOrigin candidateInput candidate candidateData
                candidateOutput candidateTimer candidateLimits operationsEq
              have operationMember : SemanticOperation.awaitSequentialMultiInstanceUserTask
                  candidateId candidateOrigin candidateInput candidate candidateData candidateOutput
                    candidateTimer candidateLimits ∈ program.operations := by
                have filtered : SemanticOperation.awaitSequentialMultiInstanceUserTask candidateId
                    candidateOrigin candidateInput candidate candidateData candidateOutput
                      candidateTimer candidateLimits ∈ program.operations.filter (fun
                    | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
                        decide (task.id.value = controller.activityElementId.value)
                    | _ => false) := operationsEq.symm ▸ (by simp)
                exact (List.mem_filter.mp filtered).1
              have different := disjoint (.awaitSequentialMultiInstanceUserTask candidateId
                candidateOrigin candidateInput candidate candidateData candidateOutput
                  candidateTimer candidateLimits) operationMember
              have valueDifferent : inserted.elementId.value ≠ candidateTimer.elementId.value :=
                fun same => different (congrArg NodeId.mk same).symm
              have filterFrame (timerId : OccurrenceId)
                  (same : timerId.elementId.value = candidateTimer.elementId.value) :
                  (insertTimerWait inserted state.timerWaits).filter (timerIdNamesWait timerId) =
                    state.timerWaits.filter (timerIdNamesWait timerId) := by
                rw [insertTimerWait]
                apply filter_canonicalInsertBy_rejected
                apply Bool.eq_false_iff.mpr
                intro matched
                simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched
                exact valueDifferent (matched.1.2.symm.trans same)
              split at * <;> simp_all
              all_goals split at * <;> simp_all
            · simp at prior
  · intro operation member
    have prior := valid.2 operation member
    cases operation <;> try exact prior
    rename_i id origin input task data output boundaryTimer limits
    have different := disjoint (.awaitSequentialMultiInstanceUserTask id origin input task data
      output boundaryTimer limits) member
    simp only at different
    have valueDifferent : inserted.elementId.value ≠ boundaryTimer.elementId.value :=
      fun same => different (congrArg NodeId.mk same).symm
    unfold sequentialMultiInstanceOperationBindingComplete at prior ⊢
    have elementFilterFrame :
        (insertTimerWait inserted state.timerWaits).filter (fun wait =>
            decide (wait.elementId.value = boundaryTimer.elementId.value)) =
          state.timerWaits.filter (fun wait =>
            decide (wait.elementId.value = boundaryTimer.elementId.value)) := by
      rw [insertTimerWait]
      apply filter_canonicalInsertBy_rejected
      simp [valueDifferent]
    have scopedFilterFrame (scopeId : DefinitionScopeId) :
        List.filter (fun wait : TimerWait =>
            decide (wait.owner.definitionScopeId = scopeId))
            ((insertTimerWait inserted state.timerWaits).filter (fun wait =>
              decide (wait.elementId.value = boundaryTimer.elementId.value))) =
          List.filter (fun wait : TimerWait =>
            decide (wait.owner.definitionScopeId = scopeId))
            (state.timerWaits.filter (fun wait =>
              decide (wait.elementId.value = boundaryTimer.elementId.value))) := by
      rw [elementFilterFrame]
    cases ownerEq : operationOwningScope? program id with
    | none => simpa [ownerEq, elementFilterFrame] using prior
    | some scopeId => simpa [ownerEq, scopedFilterFrame scopeId] using prior

theorem sole_timer_declarer_excludes_smi (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (timer : TimerDefinition)
    (declarer : timerWaitDeclarers program timer.elementId =
      [.awaitTimer id origin input output timer]) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ boundaryTimer _ =>
          boundaryTimer.elementId ≠ timer.elementId
      | _ => True := by
  intro operation member
  cases operation <;> try trivial
  rename_i candidateId candidateOrigin candidateInput candidate candidateData
    candidateOutput candidateTimer candidateLimits
  intro same
  have candidateMember : SemanticOperation.awaitSequentialMultiInstanceUserTask
      candidateId candidateOrigin candidateInput candidate candidateData candidateOutput
        candidateTimer candidateLimits ∈ timerWaitDeclarers program timer.elementId := by
    simp [timerWaitDeclarers, member, same]
  rw [declarer] at candidateMember
  simp at candidateMember

theorem prepared_timer_excludes_smi (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (inserted : TimerWait)
    (prepared : prepareInternalArm? program state operation = some patch)
    (writeEq : patch.write = .timer inserted) :
    ∀ candidate ∈ program.operations,
      match candidate with
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ boundaryTimer _ =>
          boundaryTimer.elementId ≠ inserted.elementId
      | _ => True := by
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared <;> try simp at prepared
  all_goals
    obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
  all_goals
    obtain ⟨unique, absent, available, patchEq⟩ := prepared
  case awaitTimer.isFalse.running =>
    rename_i id origin input output timer instanceId selection
    cases writeEq
    have declarer : timerWaitDeclarers program timer.elementId =
        [.awaitTimer id origin input output timer] := by
      simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
        InternalArmingWrite.elementId] using unique.1.1
    exact sole_timer_declarer_excludes_smi program id origin input output timer declarer
  all_goals simp_all


end InternalCommutation

end BpmnSemantics.SemanticProcess
