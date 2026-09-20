import BpmnSemantics.SemanticProcess.InternalArmingOrder
import BpmnSemantics.SemanticProcess.CallRecordCanonicalEquality

/-! # Regional removal order facts

Filtering changes adjacency, so the regional removal account needs composition of non-inversion for every retained collection comparator.
-/

namespace BpmnSemantics.SemanticProcess

theorem adjacent_order_alone_does_not_survive_filter {α : Type} [DecidableEq α]
    (a b c : α) (ab : a ≠ b) (bc : b ≠ c) :
    let before := fun left right => decide (left = c ∧ right = a)
    orderedBy before [a, b, c] = true ∧
      orderedBy before ([a, b, c].filter fun value => decide (value ≠ b)) = false := by
  simp [orderedBy, ab, bc, Ne.symm ab, Ne.symm bc]

theorem regionalLexStep_compose {α : Type} [DecidableEq α]
    (before : α → α → Bool)
    (total : ∀ a b, a ≠ b → before a b = true ∨ before b a = true)
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (a b c : α) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    (if b ≠ a then before b a else ba) = false →
    (if c ≠ b then before c b else cb) = false →
    (if c ≠ a then before c a else ca) = false := by
  by_cases ab : a = b
  · subst b
    by_cases ac : a = c
    · subst c; simpa using fall
    · simp [Ne.symm ac]
  · by_cases bc : b = c
    · subst c; simp only [Ne.symm ab, ne_eq, not_false_eq_true, if_true,
        not_true_eq_false, if_false]; exact fun first _ => first
    · by_cases ac : a = c
      · subst c
        simp only [Ne.symm ab, ab, ne_eq, not_false_eq_true, if_true,
          not_true_eq_false, if_false]
        intro first second
        rcases total a b ab with forward | backward
        · simp [forward] at second
        · simp [backward] at first
      · simpa only [Ne.symm ab, Ne.symm bc, Ne.symm ac, ne_eq,
          not_false_eq_true, if_true] using compose a b c

private theorem string_total (a b : String) (different : a ≠ b) :
    decide (a < b) = true ∨ decide (b < a) = true := by
  simp only [decide_eq_true_eq]
  by_cases before : a < b
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

theorem regionalStringLexStep_compose (a b c : String) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    armingLexStep b a ba = false → armingLexStep c b cb = false →
      armingLexStep c a ca = false :=
  regionalLexStep_compose (fun a b => decide (a < b)) string_total
    (stringKeyBefore_compose id) a b c ba cb ca fall

theorem regionalNatLexStep_compose (a b c : Nat) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    armingLexStep b a ba = false → armingLexStep c b cb = false →
      armingLexStep c a ca = false := by
  apply regionalLexStep_compose (fun a b => decide (a < b))
    (fun _ _ _ => by simp only [decide_eq_true_eq]; omega)
    (fun _ _ _ => by simp only [decide_eq_false_iff_not]; omega) a b c ba cb ca fall

theorem regional_waitOccurrenceBefore_compose
    (ai bi ci : SemanticId) (ao bo co : ScopeOccurrenceId)
    (ae be ce : NodeId) (aa ba ca : Nat) :
    waitOccurrenceBefore bi ai bo ao be ae ba aa = false →
    waitOccurrenceBefore ci bi co bo ce be ca ba = false →
      waitOccurrenceBefore ci ai co ao ce ae ca aa = false := by
  unfold waitOccurrenceBefore
  apply regionalStringLexStep_compose
  apply regionalLexStep_compose scopeOwnerBefore scopeOwnerBefore_comparable
    scopeOwnerBefore_compose
  apply regionalStringLexStep_compose
  simp only [decide_eq_false_iff_not]
  omega

theorem regional_timerWaitBefore_compose (a b c : TimerWait) :
    timerWaitBefore b a = false → timerWaitBefore c b = false →
      timerWaitBefore c a = false :=
  regional_waitOccurrenceBefore_compose a.processInstanceId b.processInstanceId
    c.processInstanceId a.owner b.owner c.owner a.elementId b.elementId c.elementId
    a.activation b.activation c.activation

theorem regional_messageWaitBefore_compose (a b c : MessageWait) :
    messageWaitBefore b a = false → messageWaitBefore c b = false →
      messageWaitBefore c a = false :=
  regional_waitOccurrenceBefore_compose a.processInstanceId b.processInstanceId
    c.processInstanceId a.owner b.owner c.owner a.elementId b.elementId c.elementId
    a.activation b.activation c.activation

theorem regional_effectWaitBefore_compose (a b c : EffectWait) :
    effectWaitBefore b a = false → effectWaitBefore c b = false →
      effectWaitBefore c a = false :=
  regional_waitOccurrenceBefore_compose a.processInstanceId b.processInstanceId
    c.processInstanceId a.owner b.owner c.owner a.elementId b.elementId c.elementId
    a.activation b.activation c.activation

private theorem identity_order_compose (ai bi ci ae be ce : String) (aa ba ca : Nat) :
    armingLexStep bi ai (armingLexStep be ae (decide (ba < aa))) = false →
    armingLexStep ci bi (armingLexStep ce be (decide (ca < ba))) = false →
      armingLexStep ci ai (armingLexStep ce ae (decide (ca < aa))) = false := by
  apply regionalStringLexStep_compose
  apply regionalStringLexStep_compose
  simp only [decide_eq_false_iff_not]
  omega

theorem regional_activityOccurrenceBefore_compose (a b c : ActivityOccurrence) :
    activityOccurrenceBefore b a = false → activityOccurrenceBefore c b = false →
      activityOccurrenceBefore c a = false :=
  identity_order_compose a.processInstanceId.value b.processInstanceId.value
    c.processInstanceId.value a.activityElementId.value b.activityElementId.value
    c.activityElementId.value a.activation b.activation c.activation

theorem regional_sequentialMultiInstanceControllerBefore_compose
    (a b c : SequentialMultiInstanceController) :
    sequentialMultiInstanceControllerBefore b a = false →
    sequentialMultiInstanceControllerBefore c b = false →
      sequentialMultiInstanceControllerBefore c a = false :=
  identity_order_compose a.processInstanceId.value b.processInstanceId.value
    c.processInstanceId.value a.activityElementId.value b.activityElementId.value
    c.activityElementId.value a.activation b.activation c.activation

theorem regional_parallelMultiInstanceControllerBefore_compose
    (a b c : ParallelMultiInstanceController) :
    parallelMultiInstanceControllerBefore b a = false →
    parallelMultiInstanceControllerBefore c b = false →
      parallelMultiInstanceControllerBefore c a = false :=
  identity_order_compose a.id.processInstanceId.value b.id.processInstanceId.value
    c.id.processInstanceId.value a.id.activityElementId.value b.id.activityElementId.value
    c.id.activityElementId.value a.id.activation b.id.activation c.id.activation

private theorem localDataOwnerBefore_compose (a b c : LocalDataOwner) :
    localDataOwnerBefore b a = false → localDataOwnerBefore c b = false →
      localDataOwnerBefore c a = false := by
  cases a <;> cases b <;> cases c <;> simp only [localDataOwnerBefore]
  all_goals first
    | exact identity_order_compose _ _ _ _ _ _ _ _ _
    | simp

theorem regional_activityVariableScopeBefore_compose (a b c : ActivityVariableScope) :
    activityVariableScopeBefore b a = false → activityVariableScopeBefore c b = false →
      activityVariableScopeBefore c a = false :=
  localDataOwnerBefore_compose a.owner b.owner c.owner

theorem regional_selectionBefore_compose (a b c : SelectedBranchSet) :
    selectionBefore b a = false → selectionBefore c b = false →
      selectionBefore c a = false := by
  unfold selectionBefore
  apply regionalStringLexStep_compose
  apply regionalStringLexStep_compose
  apply regionalNatLexStep_compose
  exact stringKeyBefore_compose SelectedBranchSet.selectionKey a b c

theorem regional_eventRaceBefore_compose (a b c : EventRace) :
    eventRaceBefore b a = false → eventRaceBefore c b = false →
      eventRaceBefore c a = false := by
  unfold eventRaceBefore
  apply regionalStringLexStep_compose
  apply regionalStringLexStep_compose
  apply regionalNatLexStep_compose
  apply regionalStringLexStep_compose
  simp only [decide_eq_false_iff_not]
  omega

theorem parallelMultiInstanceControllersOrdered_eq_orderedBy
    (values : List ParallelMultiInstanceController) :
    parallelMultiInstanceControllersOrdered values =
      orderedBy parallelMultiInstanceControllerBefore values := by
  induction values with
  | nil => rfl
  | cons first rest ih =>
      cases rest with
      | nil => rfl
      | cons second more =>
          simpa only [parallelMultiInstanceControllersOrdered, orderedBy] using
            congrArg (fun tail => !parallelMultiInstanceControllerBefore second first && tail) ih

theorem parallelMultiInstanceControllersOrdered_filter
    (values : List ParallelMultiInstanceController)
    (keep : ParallelMultiInstanceController → Bool)
    (ordered : parallelMultiInstanceControllersOrdered values = true) :
    parallelMultiInstanceControllersOrdered (values.filter keep) = true := by
  simp only [parallelMultiInstanceControllersOrdered_eq_orderedBy] at ordered ⊢
  exact orderedBy_filter regional_parallelMultiInstanceControllerBefore_compose
    keep values ordered

end BpmnSemantics.SemanticProcess
