import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.InternalArmingOrder

/-! # Flow-node occurrence lifecycle ordering laws

Proves the strict total-order laws behind canonical open-occurrence sorting and the resulting invariance under permutation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def lifecycleLexStep [DecidableEq α] (before : α → α → Bool)
    (left right : α) (rest : Bool) : Bool :=
  if left ≠ right then before left right else rest

private theorem lifecycleLexStep_asymm [DecidableEq α] (before : α → α → Bool)
    (asymm : ∀ left right, before left right = true → before right left = false)
    (left right : α) (forward backward : Bool)
    (fall : forward = true → backward = false) :
    lifecycleLexStep before left right forward = true →
      lifecycleLexStep before right left backward = false := by
  unfold lifecycleLexStep
  by_cases same : left = right
  · subst right
    simpa using fall
  · have reverse : right ≠ left := fun equal => same equal.symm
    rw [if_pos same, if_pos reverse]
    exact asymm left right

private theorem lifecycleLexStep_trans [DecidableEq α] (before : α → α → Bool)
    (asymm : ∀ left right, before left right = true → before right left = false)
    (trans : ∀ left middle right, before left middle = true →
      before middle right = true → before left right = true)
    (a b c : α) (ab bc ac : Bool)
    (fall : ab = true → bc = true → ac = true) :
    lifecycleLexStep before a b ab = true → lifecycleLexStep before b c bc = true →
      lifecycleLexStep before a c ac = true := by
  unfold lifecycleLexStep
  by_cases hab : a = b <;> by_cases hbc : b = c <;> by_cases hac : a = c <;>
    (try simp_all)
  all_goals exact trans a b c

private theorem lifecycleLexStep_comparable [DecidableEq α] (before : α → α → Bool)
    (total : ∀ left right, left ≠ right →
      before left right = true ∨ before right left = true)
    (left right : α) (forward backward : Bool)
    (fall : left = right → forward = true ∨ backward = true) :
    lifecycleLexStep before left right forward = true ∨
      lifecycleLexStep before right left backward = true := by
  unfold lifecycleLexStep
  by_cases same : left = right
  · simpa [same] using fall same
  · simpa [same, Ne.symm same] using total left right same

private theorem string_total (left right : String) (different : left ≠ right) :
    scalarBefore left right = true ∨ scalarBefore right left = true := by
  simp only [scalarBefore, decide_eq_true_eq]
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

private theorem scalarBefore_asymm (left right : String) :
    scalarBefore left right = true → scalarBefore right left = false := by
  simp only [scalarBefore, decide_eq_true_eq, decide_eq_false_iff_not]
  exact String.lt_asymm

private theorem scalarBefore_trans (left middle right : String) :
    scalarBefore left middle = true → scalarBefore middle right = true →
      scalarBefore left right = true := by
  simp only [scalarBefore, decide_eq_true_eq]
  exact String.lt_trans

private def natBefore (left right : Nat) : Bool := left < right

private theorem natBefore_asymm (left right : Nat) :
    natBefore left right = true → natBefore right left = false := by
  simp only [natBefore, decide_eq_true_eq, decide_eq_false_iff_not]
  exact Nat.lt_asymm

private theorem natBefore_trans (left middle right : Nat) :
    natBefore left middle = true → natBefore middle right = true →
      natBefore left right = true := by
  simp only [natBefore, decide_eq_true_eq]
  exact Nat.lt_trans

private theorem natBefore_total (left right : Nat) (different : left ≠ right) :
    natBefore left right = true ∨ natBefore right left = true := by
  simp only [natBefore, decide_eq_true_eq]
  omega

private theorem occurrenceBefore_chain (left right : OccurrenceId) :
    occurrenceBefore left right =
      lifecycleLexStep (fun a b : SemanticId => scalarBefore a.value b.value)
        left.processInstanceId right.processInstanceId
        (lifecycleLexStep (fun a b : SemanticId => scalarBefore a.value b.value)
          left.elementId right.elementId (natBefore left.activation right.activation)) := by
  cases left
  cases right
  simp [occurrenceBefore, lifecycleLexStep, natBefore]

private theorem occurrenceBefore_asymm (left right : OccurrenceId) :
    occurrenceBefore left right = true → occurrenceBefore right left = false := by
  rw [occurrenceBefore_chain, occurrenceBefore_chain]
  apply lifecycleLexStep_asymm _ (fun _ _ => scalarBefore_asymm _ _)
  apply lifecycleLexStep_asymm _ (fun _ _ => scalarBefore_asymm _ _)
  exact natBefore_asymm _ _

private theorem occurrenceBefore_trans (a b c : OccurrenceId) :
    occurrenceBefore a b = true → occurrenceBefore b c = true →
      occurrenceBefore a c = true := by
  rw [occurrenceBefore_chain, occurrenceBefore_chain, occurrenceBefore_chain]
  apply lifecycleLexStep_trans
    (fun a b : SemanticId => scalarBefore a.value b.value)
    (fun a b => scalarBefore_asymm a.value b.value)
    (fun a b c => scalarBefore_trans a.value b.value c.value)
  apply lifecycleLexStep_trans
    (fun a b : SemanticId => scalarBefore a.value b.value)
    (fun a b => scalarBefore_asymm a.value b.value)
    (fun a b c => scalarBefore_trans a.value b.value c.value)
  exact natBefore_trans _ _ _

private theorem occurrenceBefore_total (left right : OccurrenceId) (different : left ≠ right) :
    occurrenceBefore left right = true ∨ occurrenceBefore right left = true := by
  rw [occurrenceBefore_chain, occurrenceBefore_chain]
  apply lifecycleLexStep_comparable
  · intro a b distinct
    exact string_total a.value b.value (fun same => distinct (by cases a; cases b; simp_all))
  intro processSame
  apply lifecycleLexStep_comparable
  · intro a b distinct
    exact string_total a.value b.value (fun same => distinct (by cases a; cases b; simp_all))
  intro elementSame
  exact natBefore_total left.activation right.activation (by
    intro same
    apply different
    cases left
    cases right
    simp_all)

private theorem scopeBefore_chain (left right : ScopeOccurrenceId) :
    scopeBefore left right =
      lifecycleLexStep (fun a b : SemanticId => scalarBefore a.value b.value)
        left.processInstanceId right.processInstanceId
        (lifecycleLexStep (fun a b : DefinitionScopeId => scalarBefore a.value b.value)
          left.definitionScopeId right.definitionScopeId
          (natBefore left.activation right.activation)) := by
  cases left
  cases right
  simp [scopeBefore, lifecycleLexStep, natBefore]

private theorem scopeBefore_asymm (left right : ScopeOccurrenceId) :
    scopeBefore left right = true → scopeBefore right left = false := by
  rw [scopeBefore_chain, scopeBefore_chain]
  apply lifecycleLexStep_asymm _ (fun _ _ => scalarBefore_asymm _ _)
  apply lifecycleLexStep_asymm _ (fun _ _ => scalarBefore_asymm _ _)
  exact natBefore_asymm _ _

private theorem scopeBefore_trans (a b c : ScopeOccurrenceId) :
    scopeBefore a b = true → scopeBefore b c = true → scopeBefore a c = true := by
  rw [scopeBefore_chain, scopeBefore_chain, scopeBefore_chain]
  apply lifecycleLexStep_trans
    (fun a b : SemanticId => scalarBefore a.value b.value)
    (fun a b => scalarBefore_asymm a.value b.value)
    (fun a b c => scalarBefore_trans a.value b.value c.value)
  apply lifecycleLexStep_trans
    (fun a b : DefinitionScopeId => scalarBefore a.value b.value)
    (fun a b => scalarBefore_asymm a.value b.value)
    (fun a b c => scalarBefore_trans a.value b.value c.value)
  exact natBefore_trans _ _ _

private theorem scopeBefore_total (left right : ScopeOccurrenceId) (different : left ≠ right) :
    scopeBefore left right = true ∨ scopeBefore right left = true := by
  rw [scopeBefore_chain, scopeBefore_chain]
  apply lifecycleLexStep_comparable
  · intro a b distinct
    exact string_total a.value b.value (fun same => distinct (by cases a; cases b; simp_all))
  intro processSame
  apply lifecycleLexStep_comparable
  · intro a b distinct
    exact string_total a.value b.value (fun same => distinct (by cases a; cases b; simp_all))
  intro scopeSame
  exact natBefore_total left.activation right.activation (by
    intro same
    apply different
    cases left
    cases right
    simp_all)

private def transitionBefore (leftCommand : SemanticId) (leftTransition leftLocal : Nat)
    (rightCommand : SemanticId) (rightTransition rightLocal : Nat) : Bool :=
  lifecycleLexStep (fun a b : SemanticId => scalarBefore a.value b.value)
    leftCommand rightCommand
    (lifecycleLexStep natBefore leftTransition rightTransition
      (natBefore leftLocal rightLocal))

private theorem transitionBefore_eq (leftCommand : SemanticId)
    (leftTransition leftLocal : Nat) (rightCommand : SemanticId)
    (rightTransition rightLocal : Nat) :
    transitionBefore leftCommand leftTransition leftLocal
        rightCommand rightTransition rightLocal =
      (if leftCommand ≠ rightCommand then
        scalarBefore leftCommand.value rightCommand.value
      else if leftTransition ≠ rightTransition then leftTransition < rightTransition
      else leftLocal < rightLocal) := by
  simp [transitionBefore, lifecycleLexStep, natBefore]

private theorem transitionBefore_asymm (leftCommand : SemanticId)
    (leftTransition leftLocal : Nat) (rightCommand : SemanticId)
    (rightTransition rightLocal : Nat) :
    transitionBefore leftCommand leftTransition leftLocal
        rightCommand rightTransition rightLocal = true →
      transitionBefore rightCommand rightTransition rightLocal
        leftCommand leftTransition leftLocal = false := by
  unfold transitionBefore
  apply lifecycleLexStep_asymm _ (fun _ _ => scalarBefore_asymm _ _)
  apply lifecycleLexStep_asymm _ natBefore_asymm
  exact natBefore_asymm _ _

private theorem transitionBefore_trans (aCommand : SemanticId) (aTransition aLocal : Nat)
    (bCommand : SemanticId) (bTransition bLocal : Nat)
    (cCommand : SemanticId) (cTransition cLocal : Nat) :
    transitionBefore aCommand aTransition aLocal bCommand bTransition bLocal = true →
      transitionBefore bCommand bTransition bLocal cCommand cTransition cLocal = true →
      transitionBefore aCommand aTransition aLocal cCommand cTransition cLocal = true := by
  unfold transitionBefore
  apply lifecycleLexStep_trans
    (fun a b : SemanticId => scalarBefore a.value b.value)
    (fun a b => scalarBefore_asymm a.value b.value)
    (fun a b c => scalarBefore_trans a.value b.value c.value)
  apply lifecycleLexStep_trans _ natBefore_asymm natBefore_trans
  exact natBefore_trans _ _ _

private theorem transitionBefore_total (leftCommand : SemanticId)
    (leftTransition leftLocal : Nat) (rightCommand : SemanticId)
    (rightTransition rightLocal : Nat)
    (different : (leftCommand, leftTransition, leftLocal) ≠
      (rightCommand, rightTransition, rightLocal)) :
    transitionBefore leftCommand leftTransition leftLocal
        rightCommand rightTransition rightLocal = true ∨
      transitionBefore rightCommand rightTransition rightLocal
        leftCommand leftTransition leftLocal = true := by
  unfold transitionBefore
  apply lifecycleLexStep_comparable
  · intro a b distinct
    exact string_total a.value b.value (fun same => distinct (by cases a; cases b; simp_all))
  intro commandSame
  apply lifecycleLexStep_comparable _ natBefore_total
  intro transitionSame
  exact natBefore_total leftLocal rightLocal (by
    intro same
    apply different
    simp_all)

private theorem transitionInline_asymm (leftCommand : SemanticId)
    (leftTransition leftLocal : Nat) (rightCommand : SemanticId)
    (rightTransition rightLocal : Nat) :
    (if leftCommand ≠ rightCommand then scalarBefore leftCommand.value rightCommand.value
      else if leftTransition ≠ rightTransition then leftTransition < rightTransition
      else leftLocal < rightLocal) = true →
    (if rightCommand ≠ leftCommand then scalarBefore rightCommand.value leftCommand.value
      else if rightTransition ≠ leftTransition then rightTransition < leftTransition
      else rightLocal < leftLocal) = false := by
  rw [← transitionBefore_eq, ← transitionBefore_eq]
  exact transitionBefore_asymm _ _ _ _ _ _

private theorem transitionInline_trans (aCommand : SemanticId) (aTransition aLocal : Nat)
    (bCommand : SemanticId) (bTransition bLocal : Nat)
    (cCommand : SemanticId) (cTransition cLocal : Nat) :
    (if aCommand ≠ bCommand then scalarBefore aCommand.value bCommand.value
      else if aTransition ≠ bTransition then aTransition < bTransition
      else aLocal < bLocal) = true →
    (if bCommand ≠ cCommand then scalarBefore bCommand.value cCommand.value
      else if bTransition ≠ cTransition then bTransition < cTransition
      else bLocal < cLocal) = true →
    (if aCommand ≠ cCommand then scalarBefore aCommand.value cCommand.value
      else if aTransition ≠ cTransition then aTransition < cTransition
      else aLocal < cLocal) = true := by
  rw [← transitionBefore_eq, ← transitionBefore_eq, ← transitionBefore_eq]
  exact transitionBefore_trans _ _ _ _ _ _ _ _ _

private theorem transitionInline_total (leftCommand : SemanticId)
    (leftTransition leftLocal : Nat) (rightCommand : SemanticId)
    (rightTransition rightLocal : Nat)
    (different : (leftCommand, leftTransition, leftLocal) ≠
      (rightCommand, rightTransition, rightLocal)) :
    (if leftCommand ≠ rightCommand then scalarBefore leftCommand.value rightCommand.value
      else if leftTransition ≠ rightTransition then leftTransition < rightTransition
      else leftLocal < rightLocal) = true ∨
    (if rightCommand ≠ leftCommand then scalarBefore rightCommand.value leftCommand.value
      else if rightTransition ≠ leftTransition then rightTransition < leftTransition
      else rightLocal < leftLocal) = true := by
  rw [← transitionBefore_eq, ← transitionBefore_eq]
  exact transitionBefore_total _ _ _ _ _ _ different

private theorem anchorBefore_asymm (left right : SemanticFlowNodeOccurrenceAnchor) :
    flowNodeOccurrenceAnchorBefore left right = true →
      flowNodeOccurrenceAnchorBefore right left = false := by
  cases left <;> cases right
  all_goals simp only [flowNodeOccurrenceAnchorBefore]
  all_goals first
    | exact occurrenceBefore_asymm _ _
    | exact scopeBefore_asymm _ _
    | exact transitionInline_asymm _ _ _ _ _ _
    | simp_all

private theorem anchorBefore_trans (a b c : SemanticFlowNodeOccurrenceAnchor) :
    flowNodeOccurrenceAnchorBefore a b = true →
      flowNodeOccurrenceAnchorBefore b c = true →
      flowNodeOccurrenceAnchorBefore a c = true := by
  cases a <;> cases b <;> cases c
  all_goals simp only [flowNodeOccurrenceAnchorBefore]
  all_goals first
    | exact occurrenceBefore_trans _ _ _
    | exact scopeBefore_trans _ _ _
    | exact transitionInline_trans _ _ _ _ _ _ _ _ _
    | simp_all

private theorem anchorBefore_total (left right : SemanticFlowNodeOccurrenceAnchor)
    (different : left ≠ right) :
    flowNodeOccurrenceAnchorBefore left right = true ∨
      flowNodeOccurrenceAnchorBefore right left = true := by
  cases left <;> cases right
  all_goals simp only [flowNodeOccurrenceAnchorBefore]
  all_goals first
    | exact occurrenceBefore_total _ _ (by simp_all)
    | exact scopeBefore_total _ _ (by simp_all)
    | exact transitionInline_total _ _ _ _ _ _ (by simp_all)
    | simp_all

private theorem startBefore_chain (left right : UnnumberedFlowNodeOccurrenceStart) :
    startBefore left right =
      lifecycleLexStep flowNodeOccurrenceAnchorBefore left.anchor right.anchor
        (lifecycleLexStep (fun a b : ProcessId => scalarBefore a.value b.value)
          left.processId right.processId
          (lifecycleLexStep (fun a b : NodeId => scalarBefore a.value b.value)
            left.elementId right.elementId (scopeBefore left.owner right.owner))) := by
  cases left
  cases right
  simp [startBefore, lifecycleLexStep]

private theorem startBefore_asymm (left right : UnnumberedFlowNodeOccurrenceStart) :
    startBefore left right = true → startBefore right left = false := by
  rw [startBefore_chain, startBefore_chain]
  apply lifecycleLexStep_asymm _ anchorBefore_asymm
  apply lifecycleLexStep_asymm _ (fun _ _ => scalarBefore_asymm _ _)
  apply lifecycleLexStep_asymm _ (fun _ _ => scalarBefore_asymm _ _)
  exact scopeBefore_asymm _ _

private theorem startBefore_trans (a b c : UnnumberedFlowNodeOccurrenceStart) :
    startBefore a b = true → startBefore b c = true → startBefore a c = true := by
  rw [startBefore_chain, startBefore_chain, startBefore_chain]
  apply lifecycleLexStep_trans _ anchorBefore_asymm anchorBefore_trans
  apply lifecycleLexStep_trans
    (fun a b : ProcessId => scalarBefore a.value b.value)
    (fun a b => scalarBefore_asymm a.value b.value)
    (fun a b c => scalarBefore_trans a.value b.value c.value)
  apply lifecycleLexStep_trans
    (fun a b : NodeId => scalarBefore a.value b.value)
    (fun a b => scalarBefore_asymm a.value b.value)
    (fun a b c => scalarBefore_trans a.value b.value c.value)
  exact scopeBefore_trans _ _ _

private theorem startBefore_total (left right : UnnumberedFlowNodeOccurrenceStart)
    (different : left ≠ right) :
    startBefore left right = true ∨ startBefore right left = true := by
  rw [startBefore_chain, startBefore_chain]
  apply lifecycleLexStep_comparable _ anchorBefore_total
  intro anchorSame
  apply lifecycleLexStep_comparable
  · intro a b distinct
    exact string_total a.value b.value (fun same => distinct (by cases a; cases b; simp_all))
  intro processSame
  apply lifecycleLexStep_comparable
  · intro a b distinct
    exact string_total a.value b.value (fun same => distinct (by cases a; cases b; simp_all))
  intro elementSame
  exact scopeBefore_total left.owner right.owner (by
    intro same
    apply different
    cases left
    cases right
    simp_all)

private theorem insertBy_eq_canonicalInsertBy (before : α → α → Bool)
    (value : α) : ∀ values,
    insertBy before value values = canonicalInsertBy before value values := by
  intro values
  induction values with
  | nil => rfl
  | cons current rest ih => simp [insertBy, canonicalInsertBy, ih]

private theorem insertBy_commutes (before : α → α → Bool)
    (asymm : ∀ left right, before left right = true → before right left = false)
    (trans : ∀ left middle right, before left middle = true →
      before middle right = true → before left right = true)
    (total : ∀ left right, left ≠ right →
      before left right = true ∨ before right left = true)
    (left right : α) (values : List α) :
    insertBy before left (insertBy before right values) =
      insertBy before right (insertBy before left values) := by
  rw [insertBy_eq_canonicalInsertBy, insertBy_eq_canonicalInsertBy,
    insertBy_eq_canonicalInsertBy, insertBy_eq_canonicalInsertBy]
  by_cases same : left = right
  · subst right
    rfl
  · exact canonicalInsertBy_commutes_of_strict_order before asymm trans left right
      (total left right same) values

private theorem sortBy_perm_eq (before : α → α → Bool)
    (asymm : ∀ left right, before left right = true → before right left = false)
    (trans : ∀ left middle right, before left middle = true →
      before middle right = true → before left right = true)
    (total : ∀ left right, left ≠ right →
      before left right = true ∨ before right left = true)
    {left right : List α} (permutation : left.Perm right) :
    sortBy before left = sortBy before right := by
  induction permutation with
  | nil => rfl
  | cons value permutation ih => simp [sortBy, ih]
  | swap first second rest =>
      simp only [sortBy]
      exact (insertBy_commutes before asymm trans total first second (sortBy before rest)).symm
  | trans first second ihFirst ihSecond => exact ihFirst.trans ihSecond

theorem sortFlowNodeOccurrenceStarts_perm_eq {left right :
    List UnnumberedFlowNodeOccurrenceStart} (permutation : left.Perm right) :
    sortFlowNodeOccurrenceStarts left = sortFlowNodeOccurrenceStarts right := by
  exact sortBy_perm_eq startBefore startBefore_asymm startBefore_trans startBefore_total permutation

end BpmnSemantics.SemanticProcess
