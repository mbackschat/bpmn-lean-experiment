import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.WaitActivation

/-! # Internal arming collection order: canonical insertion and distinct-key replacement laws for bounded internal arming. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem canonicalInsertBy_commutes_of_strict_order (before : α → α → Bool) (asymmetric : ∀ left right, before left right = true → before right left = false)
    (transitive : ∀ left middle right, before left middle = true → before middle right = true → before left right = true)
    (left right : α) (comparable : before left right = true ∨ before right left = true) (values : List α) :
    canonicalInsertBy before left (canonicalInsertBy before right values) =
      canonicalInsertBy before right (canonicalInsertBy before left values) := by
  induction values with
  | nil =>
      rcases comparable with leftBefore | rightBefore
      · simp [canonicalInsertBy, leftBefore, asymmetric left right leftBefore]
      · simp [canonicalInsertBy, rightBefore, asymmetric right left rightBefore]
  | cons current rest ih =>
      by_cases leftCurrent : before left current = true
      · by_cases rightCurrent : before right current = true
        · rcases comparable with leftBefore | rightBefore
          · simp [canonicalInsertBy, leftCurrent, rightCurrent, leftBefore,
              asymmetric left right leftBefore]
          · simp [canonicalInsertBy, leftCurrent, rightCurrent, rightBefore,
              asymmetric right left rightBefore]
        · have notRightLeft : before right left = false := by
            cases rightLeft : before right left with
            | false => rfl
            | true =>
                exact False.elim
                  (rightCurrent (transitive right left current rightLeft leftCurrent))
          simp [canonicalInsertBy, leftCurrent, rightCurrent, notRightLeft]
      · by_cases rightCurrent : before right current = true
        · have notLeftRight : before left right = false := by
            cases leftRight : before left right with
            | false => rfl
            | true =>
                exact False.elim
                  (leftCurrent (transitive left right current leftRight rightCurrent))
          simp [canonicalInsertBy, leftCurrent, rightCurrent, notLeftRight]
        · simp [canonicalInsertBy, leftCurrent, rightCurrent, ih]

theorem orderedBy_canonicalInsertBy (before : α → α → Bool) (asymmetric : ∀ left right, before left right = true → before right left = false)
    (inserted : α) : ∀ values : List α, orderedBy before values = true →
      orderedBy before (canonicalInsertBy before inserted values) = true := by
  intro values
  induction values with
  | nil => intro _; rfl
  | cons current rest ih =>
      intro ordered
      have tail : orderedBy before rest = true := by
        cases rest with
        | nil => rfl
        | cons second more =>
            simp only [orderedBy, Bool.and_eq_true] at ordered
            exact ordered.2
      simp only [canonicalInsertBy]
      by_cases first : before inserted current = true
      · simp [first, orderedBy, asymmetric inserted current first, ordered]
      · simp only [Bool.not_eq_true] at first
        simp only [first, Bool.false_eq_true, if_neg, not_false_eq_true]
        have inner := ih tail
        cases rest with
        | nil => simpa [canonicalInsertBy, orderedBy] using first
        | cons second more =>
            simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
            simp only [canonicalInsertBy]
            by_cases next : before inserted second = true
            · simp only [next, if_pos, orderedBy, Bool.and_eq_true, Bool.not_eq_true']
              exact ⟨first, asymmetric inserted second next, ordered.2⟩
            · simp only [Bool.not_eq_true] at next
              simp only [next, Bool.false_eq_true, if_neg, not_false_eq_true,
                orderedBy, Bool.and_eq_true, Bool.not_eq_true']
              exact ⟨ordered.1, by simpa [canonicalInsertBy, next] using inner⟩

def armingLexStep {key : Type} [DecidableEq key] [LT key] [DecidableLT key] (left right : key) (rest : Bool) : Bool :=
  if left ≠ right then left < right else rest

private theorem armingLexStep_true_iff {key : Type} [DecidableEq key] [LT key] [DecidableLT key] (left right : key) (rest : Bool) :
    armingLexStep left right rest = true ↔
      (if left = right then rest = true else left < right) := by
  unfold armingLexStep
  by_cases same : left = right <;> simp [same]

private theorem armingLexStep_false_iff {key : Type} [DecidableEq key] [LT key] [DecidableLT key] (left right : key) (rest : Bool) :
    armingLexStep left right rest = false ↔
      (if left = right then rest = false else ¬ left < right) := by
  unfold armingLexStep
  by_cases same : left = right <;> simp [same]

theorem armingLexStep_asymm {key : Type} [DecidableEq key] [LT key] [DecidableLT key] (asymm : ∀ x y : key, x < y → ¬ y < x) (left right : key) (forward backward : Bool)
    (fall : forward = true → backward = false) :
    armingLexStep left right forward = true →
      armingLexStep right left backward = false := by
  rw [armingLexStep_true_iff, armingLexStep_false_iff]
  by_cases same : left = right
  · subst same; simpa using fall
  · have reverse : right ≠ left := fun equal => same equal.symm
    simp only [same, reverse, if_false]
    exact asymm left right

theorem armingLexStep_trans {key : Type} [DecidableEq key] [LT key] [DecidableLT key] (asymm : ∀ x y : key, x < y → ¬ y < x) (trans : ∀ x y z : key, x < y → y < z → x < z)
    (a b c : key) (ab bc ac : Bool) (fall : ab = true → bc = true → ac = true) :
    armingLexStep a b ab = true → armingLexStep b c bc = true →
      armingLexStep a c ac = true := by
  rw [armingLexStep_true_iff, armingLexStep_true_iff, armingLexStep_true_iff]
  by_cases hab : a = b <;> by_cases hbc : b = c <;> by_cases hac : a = c <;>
    (try simp_all)
  all_goals exact trans a b c

theorem armingLexStep_comparable {key : Type} [DecidableEq key] [LT key] [DecidableLT key] (total : ∀ x y : key, x ≠ y → x < y ∨ y < x) (left right : key) (forward backward : Bool)
    (fall : forward = true ∨ backward = true) :
    armingLexStep left right forward = true ∨
      armingLexStep right left backward = true := by
  rw [armingLexStep_true_iff, armingLexStep_true_iff]
  by_cases same : left = right
  · simpa [same] using fall
  · simpa [same, Ne.symm same] using total left right same

private theorem string_total (left right : String) : left ≠ right → left < right ∨ right < left := by
  intro different
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

private theorem nat_total (left right : Nat) : left ≠ right → left < right ∨ right < left := by
  omega

theorem taskDefinitionId_eq_of_value_eq (left right : TaskDefinitionId) (equal : left.value = right.value) : left = right := by cases left; cases right; simp_all
private theorem nodeId_eq_of_value_eq (left right : NodeId) (equal : left.value = right.value) : left = right := by cases left; cases right; simp_all
private theorem semanticId_eq_of_value_eq (left right : SemanticId) (equal : left.value = right.value) : left = right := by cases left; cases right; simp_all
private theorem occurrenceId_eq_of_fields (left right : OccurrenceId) (process : left.processInstanceId.value = right.processInstanceId.value) (element : left.elementId.value = right.elementId.value) (activation : left.activation = right.activation) : left = right := by
  cases left with | mk leftProcess leftElement leftActivation => cases right with | mk rightProcess rightElement rightActivation =>
    congr <;> first | exact semanticId_eq_of_value_eq _ _ process | exact semanticId_eq_of_value_eq _ _ element | exact activation

private theorem activityOccurrenceId_eq_of_fields (left right : ActivityOccurrenceId)
    (process : left.processInstanceId.value = right.processInstanceId.value)
    (element : left.activityElementId.value = right.activityElementId.value)
    (activation : left.activation = right.activation) : left = right := by
  cases left with
  | mk leftProcess leftElement leftActivation =>
      cases right with
      | mk rightProcess rightElement rightActivation =>
          congr <;> first
            | exact semanticId_eq_of_value_eq _ _ process
            | exact semanticId_eq_of_value_eq _ _ element
            | exact activation

private theorem scopeOccurrenceId_eq_of_fields (left right : ScopeOccurrenceId)
    (process : left.processInstanceId.value = right.processInstanceId.value)
    (scope : left.definitionScopeId.value = right.definitionScopeId.value)
    (activation : left.activation = right.activation) : left = right := by
  cases left with
  | mk leftProcess leftScope leftActivation =>
      cases right with
      | mk rightProcess rightScope rightActivation =>
          cases leftProcess
          cases rightProcess
          cases leftScope
          cases rightScope
          simp_all

private theorem userTaskWaitBefore_chain (left right : UserTaskWait) :
    userTaskWaitBefore left right =
      armingLexStep left.processInstanceId.value right.processInstanceId.value
        (armingLexStep left.owner.definitionScopeId.value right.owner.definitionScopeId.value
          (armingLexStep left.owner.activation right.owner.activation
            (armingLexStep left.task.id.value right.task.id.value
              (decide (left.activation < right.activation))))) := rfl

private theorem userTaskWaitBefore_trans (a b c : UserTaskWait) :
    userTaskWaitBefore a b = true → userTaskWaitBefore b c = true →
      userTaskWaitBefore a c = true := by
  rw [userTaskWaitBefore_chain, userTaskWaitBefore_chain, userTaskWaitBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => Nat.lt_asymm) (fun _ _ _ => Nat.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem userTaskWaitBefore_comparable (left right : UserTaskWait)
    (different : left.task.id ≠ right.task.id) :
    userTaskWaitBefore left right = true ∨ userTaskWaitBefore right left = true := by
  rw [userTaskWaitBefore_chain, userTaskWaitBefore_chain]
  apply armingLexStep_comparable string_total
  apply armingLexStep_comparable string_total
  apply armingLexStep_comparable nat_total
  rw [armingLexStep_true_iff, armingLexStep_true_iff]
  have valueDifferent : left.task.id.value ≠ right.task.id.value :=
    fun equal => different (taskDefinitionId_eq_of_value_eq _ _ equal)
  simpa [valueDifferent, Ne.symm valueDifferent] using
    string_total left.task.id.value right.task.id.value valueDifferent

private theorem waitOccurrenceBefore_chain (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : ScopeOccurrenceId) (leftElement rightElement : NodeId)
    (leftActivation rightActivation : Nat) :
    waitOccurrenceBefore leftInstance rightInstance leftOwner rightOwner
        leftElement rightElement leftActivation rightActivation =
      armingLexStep leftInstance.value rightInstance.value
        (armingLexStep leftOwner.processInstanceId.value rightOwner.processInstanceId.value
          (armingLexStep leftOwner.definitionScopeId.value rightOwner.definitionScopeId.value
            (armingLexStep leftOwner.activation rightOwner.activation
              (armingLexStep leftElement.value rightElement.value
                (decide (leftActivation < rightActivation)))))) := by
  unfold waitOccurrenceBefore scopeOwnerBefore armingLexStep
  by_cases instanceEqual : leftInstance.value = rightInstance.value <;>
    by_cases ownerEqual : leftOwner = rightOwner <;>
    by_cases ownerInstanceEqual :
      leftOwner.processInstanceId.value = rightOwner.processInstanceId.value <;>
    by_cases ownerScopeEqual :
      leftOwner.definitionScopeId.value = rightOwner.definitionScopeId.value <;>
    by_cases ownerActivationEqual : leftOwner.activation = rightOwner.activation <;>
    simp_all
  exact False.elim
    (ownerEqual (scopeOccurrenceId_eq_of_fields _ _ ownerInstanceEqual ownerScopeEqual
      ownerActivationEqual))

theorem waitOccurrenceBefore_asymm (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : ScopeOccurrenceId) (leftElement rightElement : NodeId)
    (leftActivation rightActivation : Nat) :
    waitOccurrenceBefore leftInstance rightInstance leftOwner rightOwner leftElement rightElement
        leftActivation rightActivation = true →
      waitOccurrenceBefore rightInstance leftInstance rightOwner leftOwner rightElement leftElement
        rightActivation leftActivation = false := by
  rw [waitOccurrenceBefore_chain, waitOccurrenceBefore_chain]
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => Nat.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  simp only [decide_eq_true_eq, decide_eq_false_iff_not]
  exact Nat.lt_asymm

private theorem waitOccurrenceBefore_trans (aInstance bInstance cInstance : SemanticId)
    (aOwner bOwner cOwner : ScopeOccurrenceId) (aElement bElement cElement : NodeId)
    (aActivation bActivation cActivation : Nat) :
    waitOccurrenceBefore aInstance bInstance aOwner bOwner aElement bElement
        aActivation bActivation = true →
      waitOccurrenceBefore bInstance cInstance bOwner cOwner bElement cElement
        bActivation cActivation = true →
      waitOccurrenceBefore aInstance cInstance aOwner cOwner aElement cElement
        aActivation cActivation = true := by
  rw [waitOccurrenceBefore_chain, waitOccurrenceBefore_chain, waitOccurrenceBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => Nat.lt_asymm) (fun _ _ _ => Nat.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem waitOccurrenceBefore_comparable (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : ScopeOccurrenceId) (leftElement rightElement : NodeId)
    (leftActivation rightActivation : Nat) (different : leftElement ≠ rightElement) :
    waitOccurrenceBefore leftInstance rightInstance leftOwner rightOwner leftElement rightElement
        leftActivation rightActivation = true ∨
      waitOccurrenceBefore rightInstance leftInstance rightOwner leftOwner rightElement leftElement
        rightActivation leftActivation = true := by
  rw [waitOccurrenceBefore_chain, waitOccurrenceBefore_chain]
  apply armingLexStep_comparable string_total
  apply armingLexStep_comparable string_total
  apply armingLexStep_comparable string_total
  apply armingLexStep_comparable nat_total
  rw [armingLexStep_true_iff, armingLexStep_true_iff]
  have valueDifferent : leftElement.value ≠ rightElement.value :=
    fun equal => different (nodeId_eq_of_value_eq _ _ equal)
  simpa [valueDifferent, Ne.symm valueDifferent] using
    string_total leftElement.value rightElement.value valueDifferent

theorem insertUserTaskWait_commutes (left right : UserTaskWait) (different : left.task.id ≠ right.task.id) (values : List UserTaskWait) :
    insertUserTaskWait left (insertUserTaskWait right values) =
      insertUserTaskWait right (insertUserTaskWait left values) := by
  simp only [insertUserTaskWait_eq_canonicalInsertBy]
  exact canonicalInsertBy_commutes_of_strict_order userTaskWaitBefore
    userTaskWaitBefore_asymm userTaskWaitBefore_trans left right
    (userTaskWaitBefore_comparable left right different) values

theorem insertMessageWait_commutes (left right : MessageWait) (different : left.elementId ≠ right.elementId) (values : List MessageWait) :
    insertMessageWait left (insertMessageWait right values) =
      insertMessageWait right (insertMessageWait left values) :=
  canonicalInsertBy_commutes_of_strict_order messageWaitBefore
    (fun l r => waitOccurrenceBefore_asymm l.processInstanceId r.processInstanceId
      l.owner r.owner l.elementId r.elementId l.activation r.activation)
    (fun l m r => waitOccurrenceBefore_trans l.processInstanceId m.processInstanceId
      r.processInstanceId l.owner m.owner r.owner l.elementId m.elementId r.elementId
      l.activation m.activation r.activation)
    left right
    (waitOccurrenceBefore_comparable left.processInstanceId right.processInstanceId
      left.owner right.owner left.elementId right.elementId left.activation right.activation
      different) values

theorem insertTimerWait_commutes (left right : TimerWait) (different : left.elementId ≠ right.elementId) (values : List TimerWait) :
    insertTimerWait left (insertTimerWait right values) =
      insertTimerWait right (insertTimerWait left values) :=
  canonicalInsertBy_commutes_of_strict_order timerWaitBefore
    (fun l r => waitOccurrenceBefore_asymm l.processInstanceId r.processInstanceId
      l.owner r.owner l.elementId r.elementId l.activation r.activation)
    (fun l m r => waitOccurrenceBefore_trans l.processInstanceId m.processInstanceId
      r.processInstanceId l.owner m.owner r.owner l.elementId m.elementId r.elementId
      l.activation m.activation r.activation)
    left right
    (waitOccurrenceBefore_comparable left.processInstanceId right.processInstanceId
      left.owner right.owner left.elementId right.elementId left.activation right.activation
      different) values

theorem insertEffectWait_commutes (left right : EffectWait) (different : left.elementId ≠ right.elementId) (values : List EffectWait) :
    insertEffectWait left (insertEffectWait right values) =
      insertEffectWait right (insertEffectWait left values) :=
  canonicalInsertBy_commutes_of_strict_order effectWaitBefore
    (fun l r => waitOccurrenceBefore_asymm l.processInstanceId r.processInstanceId
      l.owner r.owner l.elementId r.elementId l.activation r.activation)
    (fun l m r => waitOccurrenceBefore_trans l.processInstanceId m.processInstanceId
      r.processInstanceId l.owner m.owner r.owner l.elementId m.elementId r.elementId
      l.activation m.activation r.activation)
    left right
    (waitOccurrenceBefore_comparable left.processInstanceId right.processInstanceId
      left.owner right.owner left.elementId right.elementId left.activation right.activation
      different) values

theorem insertTaskActivation_eq_canonicalInsertBy (value : TaskActivation) (values : List TaskActivation) :
    insertTaskActivation value values = canonicalInsertBy activationBefore value values := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      simp only [insertTaskActivation, canonicalInsertBy, activationBefore,
        decide_eq_true_eq]
      split <;> simp_all

def stringKeyBefore (key : α → String) (left right : α) : Bool := decide (key left < key right)

private def excludesStringKey (key : α → String) (removed : String) (value : α) : Bool := decide (key value ≠ removed)

theorem stringKeyBefore_asymm (key : α → String) (left right : α) : stringKeyBefore key left right = true → stringKeyBefore key right left = false := by
  simp only [stringKeyBefore, decide_eq_true_eq, decide_eq_false_iff_not]
  exact String.lt_asymm

private theorem stringKeyBefore_trans (key : α → String) (left middle right : α) :
    stringKeyBefore key left middle = true →
      stringKeyBefore key middle right = true →
      stringKeyBefore key left right = true := by
  simp only [stringKeyBefore, decide_eq_true_eq]
  exact String.lt_trans

theorem stringKeyBefore_compose (key : α → String) (a b c : α) :
    stringKeyBefore key b a = false → stringKeyBefore key c b = false →
      stringKeyBefore key c a = false := by
  simp only [stringKeyBefore, decide_eq_false_iff_not]
  intro bNotBeforeA cNotBeforeB
  intro cBeforeA
  by_cases same : key a = key b
  · exact cNotBeforeB (by simpa [same] using cBeforeA)
  · have aBeforeB := (string_total (key a) (key b) same).resolve_right bNotBeforeA
    exact cNotBeforeB (String.lt_trans cBeforeA aBeforeB)

private theorem filtersByDistinctStringKeys_commute (key : α → String)
    (left right : String) (values : List α) :
    (values.filter (excludesStringKey key left)).filter (excludesStringKey key right) =
      (values.filter (excludesStringKey key right)).filter (excludesStringKey key left) := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      simp only [List.filter_cons]
      by_cases leftKept : excludesStringKey key left current = true <;>
        by_cases rightKept : excludesStringKey key right current = true <;>
        simp_all

private theorem filter_canonicalInsertBy_stringKey (key : α → String)
    (inserted : α) (removed : String) (different : key inserted ≠ removed) :
    ∀ values : List α,
      orderedBy (stringKeyBefore key) values = true →
      (canonicalInsertBy (stringKeyBefore key) inserted values).filter
          (excludesStringKey key removed) =
        canonicalInsertBy (stringKeyBefore key) inserted
          (values.filter (excludesStringKey key removed)) := by
  intro values
  induction values with
  | nil => intro _; simp [canonicalInsertBy, excludesStringKey, different]
  | cons current rest ih =>
      intro ordered
      have tailOrdered : orderedBy (stringKeyBefore key) rest = true := by
        cases rest with
        | nil => rfl
        | cons second more =>
            simp only [orderedBy, Bool.and_eq_true] at ordered
            exact ordered.2
      by_cases insertedBefore : key inserted < key current
      · by_cases currentKept : key current ≠ removed
        · simp [canonicalInsertBy, stringKeyBefore, excludesStringKey, different,
            insertedBefore, currentKept]
        · have currentKey : key current = removed := by simp_all
          cases filtered : rest.filter (excludesStringKey key removed) with
          | nil =>
              simp [canonicalInsertBy, stringKeyBefore, excludesStringKey, different,
                insertedBefore, currentKept, filtered]
          | cons next more =>
              have nextMember : next ∈ rest :=
                (List.mem_filter.mp (by simp [filtered] : next ∈
                  rest.filter (excludesStringKey key removed))).1
              have nextNotBeforeCurrent : stringKeyBefore key next current = false :=
                orderedBy_bound (stringKeyBefore_compose key) current rest current ordered
                  (by simp [stringKeyBefore]) next (by simp [nextMember])
              have insertedBeforeNext : key inserted < key next := by
                have nextNotBefore : ¬ key next < key current := by
                  simpa [stringKeyBefore] using nextNotBeforeCurrent
                by_cases same : key current = key next
                · simpa [same] using insertedBefore
                · exact String.lt_trans insertedBefore
                    ((string_total (key current) (key next) same).resolve_right nextNotBefore)
              simp [canonicalInsertBy, stringKeyBefore, excludesStringKey, different,
                insertedBefore, currentKept, filtered, insertedBeforeNext]
      · by_cases currentKept : key current ≠ removed <;>
          simp [canonicalInsertBy, stringKeyBefore, excludesStringKey,
            insertedBefore, currentKept, ih tailOrdered]

private def replaceByStringKey (key : α → String) (value : α) (values : List α) : List α :=
  canonicalInsertBy (stringKeyBefore key) value
    (values.filter (excludesStringKey key (key value)))

theorem replaceByStringKey_commutes_of_ordered (key : α → String)
    (left right : α) (different : key left ≠ key right) (values : List α)
    (ordered : orderedBy (stringKeyBefore key) values = true) :
    replaceByStringKey key right (replaceByStringKey key left values) =
      replaceByStringKey key left (replaceByStringKey key right values) := by
  have leftFilteredOrdered := orderedBy_filter (stringKeyBefore_compose key)
    (excludesStringKey key (key left)) values ordered
  have rightFilteredOrdered := orderedBy_filter (stringKeyBefore_compose key)
    (excludesStringKey key (key right)) values ordered
  have filterLeft := filter_canonicalInsertBy_stringKey key left (key right) different
    (values.filter (excludesStringKey key (key left))) leftFilteredOrdered
  have filterRight := filter_canonicalInsertBy_stringKey key right (key left) (Ne.symm different)
    (values.filter (excludesStringKey key (key right))) rightFilteredOrdered
  have filters := filtersByDistinctStringKeys_commute key (key left) (key right) values
  have comparable : stringKeyBefore key left right = true ∨
      stringKeyBefore key right left = true := by
    simp only [stringKeyBefore, decide_eq_true_eq]
    exact string_total (key left) (key right) different
  unfold replaceByStringKey
  rw [filterLeft, filterRight, filters]
  exact (canonicalInsertBy_commutes_of_strict_order (stringKeyBefore key)
    (stringKeyBefore_asymm key) (stringKeyBefore_trans key) left right comparable _).symm

private theorem filterIdentifierNe_eq_filterValueNe [DecidableEq β]
    (identifier : α → β) (value : β → String)
    (injective : ∀ left right, value left = value right → left = right)
    (target : β) : ∀ values : List α,
    values.filter (fun candidate => decide (identifier candidate ≠ target)) =
      values.filter (fun candidate => decide (value (identifier candidate) ≠ value target)) := by
  intro values
  induction values with
  | nil => rfl
  | cons current rest ih =>
      by_cases same : identifier current = target
      · simp only [List.filter_cons]
        rw [show decide (identifier current ≠ target) = false by simp [same],
          show decide (value (identifier current) ≠ value target) = false by simp [same]]
        exact ih
      · have valueDifferent : value (identifier current) ≠ value target :=
          fun equal => same (injective _ _ equal)
        simp only [List.filter_cons]
        rw [show decide (identifier current ≠ target) = true by simp [same],
          show decide (value (identifier current) ≠ value target) = true by
            simp [valueDifferent]]
        simp only [if_true, List.cons.injEq, true_and]
        exact ih

private theorem setActivationCount_eq_replace (values : List TaskActivation)
    (taskId : TaskDefinitionId) (count : Nat) :
    setActivationCount values taskId count =
      replaceByStringKey (fun value : TaskActivation => value.taskId.value)
        { taskId, count } values := by
  unfold setActivationCount replaceByStringKey stringKeyBefore excludesStringKey
  rw [insertTaskActivation_eq_canonicalInsertBy]
  rw [filterIdentifierNe_eq_filterValueNe (fun value : TaskActivation => value.taskId)
    TaskDefinitionId.value taskDefinitionId_eq_of_value_eq taskId]
  rfl

private theorem setMessageActivationCount_eq_replace (values : List MessageActivation) (elementId : NodeId) (count : Nat) :
    setMessageActivationCount values elementId count =
      replaceByStringKey (fun value : MessageActivation => value.elementId.value)
        { elementId, count } values := by
  unfold setMessageActivationCount replaceByStringKey stringKeyBefore excludesStringKey
    messageActivationBefore
  rw [filterIdentifierNe_eq_filterValueNe (fun value : MessageActivation => value.elementId)
    NodeId.value nodeId_eq_of_value_eq elementId]

private theorem setTimerActivationCount_eq_replace (values : List TimerActivation) (elementId : NodeId) (count : Nat) :
    setTimerActivationCount values elementId count =
      replaceByStringKey (fun value : TimerActivation => value.elementId.value)
        { elementId, count } values := by
  unfold setTimerActivationCount replaceByStringKey stringKeyBefore excludesStringKey
    timerActivationBefore
  rw [filterIdentifierNe_eq_filterValueNe (fun value : TimerActivation => value.elementId)
    NodeId.value nodeId_eq_of_value_eq elementId]

private theorem setEffectActivationCount_eq_replace (values : List EffectActivation) (elementId : NodeId) (count : Nat) :
    setEffectActivationCount values elementId count =
      replaceByStringKey (fun value : EffectActivation => value.elementId.value)
        { elementId, count } values := by
  unfold setEffectActivationCount replaceByStringKey stringKeyBefore excludesStringKey
    effectActivationBefore
  rw [filterIdentifierNe_eq_filterValueNe (fun value : EffectActivation => value.elementId)
    NodeId.value nodeId_eq_of_value_eq elementId]

private def mappedActivationCount (element : α → NodeId) (count : α → Nat) (values : List α) (query : NodeId) : Nat := ((values.find? fun value => decide (element value = query)).map count).getD 0

private theorem elementActivationCount_map_eq (element : α → NodeId) (count : α → Nat) (values : List α) (query : NodeId) : elementActivationCount (values.map fun value => (element value, count value)) query = mappedActivationCount element count values query := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      by_cases here : element current = query
      · simp [elementActivationCount, mappedActivationCount, here]
      · simpa [elementActivationCount, mappedActivationCount, List.find?_cons, here] using ih

private theorem mappedActivationCount_filter_other (element : α → NodeId) (count : α → Nat) (target query : NodeId) (different : query ≠ target) : ∀ values : List α,
    mappedActivationCount element count (values.filter fun value => decide (element value ≠ target)) query = mappedActivationCount element count values query := by
  intro values; induction values with
  | nil => rfl
  | cons current rest ih =>
      by_cases targetHere : element current = target
      · have notQuery : element current ≠ query := fun same => different (same.symm.trans targetHere)
        simpa [mappedActivationCount, targetHere, notQuery, Ne.symm different] using ih
      · by_cases queryHere : element current = query
        · simp [mappedActivationCount, queryHere, different]
        · simpa [mappedActivationCount, targetHere, queryHere, different] using ih

private theorem mappedActivationCount_insert_other (before : α → α → Bool) (element : α → NodeId) (count : α → Nat) (inserted : α) (query : NodeId) (different : element inserted ≠ query) : ∀ values : List α,
    mappedActivationCount element count (canonicalInsertBy before inserted values) query = mappedActivationCount element count values query := by
  intro values; induction values with
  | nil => simp [canonicalInsertBy, mappedActivationCount, different]
  | cons current rest ih =>
      by_cases insertedBefore : before inserted current = true
      · simp [canonicalInsertBy, mappedActivationCount, insertedBefore, different]
      · by_cases currentHere : element current = query
        · simp [canonicalInsertBy, mappedActivationCount, insertedBefore, currentHere]
        · simpa [canonicalInsertBy, mappedActivationCount, insertedBefore, currentHere] using ih

private theorem mappedActivationCount_insert_self (before : α → α → Bool) (element : α → NodeId) (count : α → Nat) (inserted : α) : ∀ values : List α, (∀ value ∈ values, element value ≠ element inserted) → mappedActivationCount element count (canonicalInsertBy before inserted values) (element inserted) = count inserted := by
  intro values absent; induction values with
  | nil => simp [canonicalInsertBy, mappedActivationCount]
  | cons current rest ih =>
      have currentNe := absent current (by simp); have restAbsent : ∀ value ∈ rest, element value ≠ element inserted := by intro value member; exact absent value (by simp [member])
      simp only [canonicalInsertBy]; split <;> simp_all [mappedActivationCount]

private theorem elementActivationCount_map_filter_other (element : α → NodeId) (count : α → Nat) (target query : NodeId) (different : query ≠ target) : ∀ values : List α,
    elementActivationCount ((values.filter fun value => decide (element value ≠ target)).map fun value => (element value, count value)) query = elementActivationCount (values.map fun value => (element value, count value)) query := by
  intro values; rw [elementActivationCount_map_eq, elementActivationCount_map_eq]
  exact mappedActivationCount_filter_other element count target query different values

private theorem elementActivationCount_map_insert_other (before : α → α → Bool) (element : α → NodeId) (count : α → Nat) (inserted : α) (query : NodeId) (different : element inserted ≠ query) : ∀ values : List α,
    elementActivationCount ((canonicalInsertBy before inserted values).map fun value => (element value, count value)) query = elementActivationCount (values.map fun value => (element value, count value)) query := by
  intro values; rw [elementActivationCount_map_eq, elementActivationCount_map_eq]
  exact mappedActivationCount_insert_other before element count inserted query different values

theorem messageActivationCount_set_other (state : RuntimeState) (target query : NodeId) (count : Nat) (different : query ≠ target) : messageActivationCount { state with messageActivations := setMessageActivationCount state.messageActivations target count } query = messageActivationCount state query := by
  unfold messageActivationCount setMessageActivationCount; rw [elementActivationCount_map_insert_other messageActivationBefore MessageActivation.elementId MessageActivation.count _ _ (Ne.symm different)]
  exact elementActivationCount_map_filter_other MessageActivation.elementId MessageActivation.count target query different state.messageActivations

theorem timerActivationCount_set_other (state : RuntimeState) (target query : NodeId) (count : Nat) (different : query ≠ target) : timerActivationCount { state with timerActivations := setTimerActivationCount state.timerActivations target count } query = timerActivationCount state query := by
  unfold timerActivationCount setTimerActivationCount; rw [elementActivationCount_map_insert_other timerActivationBefore TimerActivation.elementId TimerActivation.count _ _ (Ne.symm different)]
  exact elementActivationCount_map_filter_other TimerActivation.elementId TimerActivation.count target query different state.timerActivations

theorem timerActivationCount_set_self (state : RuntimeState) (target : NodeId) (count : Nat) : timerActivationCount { state with timerActivations := setTimerActivationCount state.timerActivations target count } target = count := by
  unfold timerActivationCount setTimerActivationCount; rw [elementActivationCount_map_eq]; apply mappedActivationCount_insert_self
  intro value mem; exact of_decide_eq_true (List.mem_filter.mp mem).2

theorem effectActivationCount_set_other (state : RuntimeState) (target query : NodeId) (count : Nat) (different : query ≠ target) : effectActivationCount { state with effectActivations := setEffectActivationCount state.effectActivations target count } query = effectActivationCount state query := by
  unfold effectActivationCount setEffectActivationCount; rw [elementActivationCount_map_insert_other effectActivationBefore EffectActivation.elementId EffectActivation.count _ _ (Ne.symm different)]
  exact elementActivationCount_map_filter_other EffectActivation.elementId EffectActivation.count target query different state.effectActivations

theorem setActivationCount_commutes_of_ordered (leftId rightId : TaskDefinitionId) (leftCount rightCount : Nat) (different : leftId ≠ rightId) (values : List TaskActivation) (ordered : orderedBy activationBefore values = true) :
    setActivationCount (setActivationCount values leftId leftCount) rightId rightCount =
      setActivationCount (setActivationCount values rightId rightCount) leftId leftCount := by
  have valueDifferent : leftId.value ≠ rightId.value :=
    fun equal => different (taskDefinitionId_eq_of_value_eq _ _ equal)
  simp only [setActivationCount_eq_replace]; apply replaceByStringKey_commutes_of_ordered <;> assumption

theorem setMessageActivationCount_commutes_of_ordered (leftId rightId : NodeId) (leftCount rightCount : Nat) (different : leftId ≠ rightId) (values : List MessageActivation)
    (ordered : orderedBy messageActivationBefore values = true) :
    setMessageActivationCount
        (setMessageActivationCount values leftId leftCount) rightId rightCount =
      setMessageActivationCount
        (setMessageActivationCount values rightId rightCount) leftId leftCount := by
  have valueDifferent : leftId.value ≠ rightId.value :=
    fun equal => different (nodeId_eq_of_value_eq _ _ equal)
  simp only [setMessageActivationCount_eq_replace]; apply replaceByStringKey_commutes_of_ordered <;> assumption

theorem setTimerActivationCount_commutes_of_ordered (leftId rightId : NodeId) (leftCount rightCount : Nat) (different : leftId ≠ rightId) (values : List TimerActivation) (ordered : orderedBy timerActivationBefore values = true) :
    setTimerActivationCount
        (setTimerActivationCount values leftId leftCount) rightId rightCount =
      setTimerActivationCount
        (setTimerActivationCount values rightId rightCount) leftId leftCount := by
  have valueDifferent : leftId.value ≠ rightId.value :=
    fun equal => different (nodeId_eq_of_value_eq _ _ equal)
  simp only [setTimerActivationCount_eq_replace]; apply replaceByStringKey_commutes_of_ordered <;> assumption

theorem setEffectActivationCount_commutes_of_ordered (leftId rightId : NodeId) (leftCount rightCount : Nat) (different : leftId ≠ rightId) (values : List EffectActivation) (ordered : orderedBy effectActivationBefore values = true) :
    setEffectActivationCount
        (setEffectActivationCount values leftId leftCount) rightId rightCount =
      setEffectActivationCount
        (setEffectActivationCount values rightId rightCount) leftId leftCount := by
  have valueDifferent : leftId.value ≠ rightId.value :=
    fun equal => different (nodeId_eq_of_value_eq _ _ equal)
  simp only [setEffectActivationCount_eq_replace]; apply replaceByStringKey_commutes_of_ordered <;> assumption

private theorem localEffectOwnerBefore_chain (left right : EffectOccurrenceId) :
    localEffectOwnerBefore left right =
      armingLexStep left.processInstanceId.value right.processInstanceId.value
        (armingLexStep left.elementId.value right.elementId.value
          (decide (left.activation < right.activation))) := rfl

private theorem localActivityOwnerBefore_chain (left right : ActivityOccurrenceId) :
    localActivityOwnerBefore left right =
      armingLexStep left.processInstanceId.value right.processInstanceId.value
        (armingLexStep left.activityElementId.value right.activityElementId.value
          (decide (left.activation < right.activation))) := rfl

private theorem localEffectOwnerBefore_asymm (left right : EffectOccurrenceId) :
    localEffectOwnerBefore left right = true →
      localEffectOwnerBefore right left = false := by
  rw [localEffectOwnerBefore_chain, localEffectOwnerBefore_chain]
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  simp only [decide_eq_true_eq, decide_eq_false_iff_not]
  exact Nat.lt_asymm

private theorem localActivityOwnerBefore_asymm (left right : ActivityOccurrenceId) :
    localActivityOwnerBefore left right = true →
      localActivityOwnerBefore right left = false := by
  rw [localActivityOwnerBefore_chain, localActivityOwnerBefore_chain]
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  simp only [decide_eq_true_eq, decide_eq_false_iff_not]
  exact Nat.lt_asymm

private theorem localEffectOwnerBefore_trans (a b c : EffectOccurrenceId) :
    localEffectOwnerBefore a b = true →
      localEffectOwnerBefore b c = true →
        localEffectOwnerBefore a c = true := by
  rw [localEffectOwnerBefore_chain, localEffectOwnerBefore_chain,
    localEffectOwnerBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm)
    (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm)
    (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem localActivityOwnerBefore_trans (a b c : ActivityOccurrenceId) :
    localActivityOwnerBefore a b = true →
      localActivityOwnerBefore b c = true →
        localActivityOwnerBefore a c = true := by
  rw [localActivityOwnerBefore_chain, localActivityOwnerBefore_chain,
    localActivityOwnerBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm)
    (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm)
    (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem localEffectOwnerBefore_comparable (left right : EffectOccurrenceId)
    (different : left ≠ right) :
    localEffectOwnerBefore left right = true ∨
      localEffectOwnerBefore right left = true := by
  rw [localEffectOwnerBefore_chain, localEffectOwnerBefore_chain]
  unfold armingLexStep
  by_cases processSame : left.processInstanceId.value = right.processInstanceId.value
  · by_cases elementSame : left.elementId.value = right.elementId.value
    · have activationDifferent : left.activation ≠ right.activation :=
        fun activationSame => different
          (occurrenceId_eq_of_fields _ _ processSame elementSame activationSame)
      simp [processSame, elementSame, nat_total _ _ activationDifferent]
    · simp [processSame, elementSame, Ne.symm elementSame,
        string_total _ _ elementSame]
  · simp [processSame, Ne.symm processSame, string_total _ _ processSame]

private theorem localActivityOwnerBefore_comparable (left right : ActivityOccurrenceId)
    (different : left ≠ right) :
    localActivityOwnerBefore left right = true ∨
      localActivityOwnerBefore right left = true := by
  rw [localActivityOwnerBefore_chain, localActivityOwnerBefore_chain]
  unfold armingLexStep
  by_cases processSame : left.processInstanceId.value = right.processInstanceId.value
  · by_cases elementSame : left.activityElementId.value = right.activityElementId.value
    · have activationDifferent : left.activation ≠ right.activation := by
        exact fun activationSame => different
          (activityOccurrenceId_eq_of_fields _ _ processSame elementSame activationSame)
      simp [processSame, elementSame, nat_total _ _ activationDifferent]
    · simp [processSame, elementSame, Ne.symm elementSame,
        string_total _ _ elementSame]
  · simp [processSame, Ne.symm processSame, string_total _ _ processSame]

private theorem localDataOwnerBefore_asymm (left right : LocalDataOwner) :
    localDataOwnerBefore left right = true →
      localDataOwnerBefore right left = false := by
  cases left <;> cases right <;> simp only [localDataOwnerBefore]
  · exact localEffectOwnerBefore_asymm _ _
  · simp
  · simp
  · exact localActivityOwnerBefore_asymm _ _

private theorem localDataOwnerBefore_trans (a b c : LocalDataOwner) :
    localDataOwnerBefore a b = true →
      localDataOwnerBefore b c = true →
        localDataOwnerBefore a c = true := by
  cases a <;> cases b <;> cases c <;> simp only [localDataOwnerBefore]
  · exact localEffectOwnerBefore_trans _ _ _
  · simp
  · simp
  · simp
  · simp
  · simp
  · simp
  · exact localActivityOwnerBefore_trans _ _ _

private theorem localDataOwnerBefore_comparable (left right : LocalDataOwner)
    (different : left ≠ right) :
    localDataOwnerBefore left right = true ∨
      localDataOwnerBefore right left = true := by
  cases left with
  | effectOccurrence left =>
      cases right with
      | effectOccurrence right =>
          simp only [localDataOwnerBefore]
          apply localEffectOwnerBefore_comparable
          exact fun same => different (congrArg LocalDataOwner.effectOccurrence same)
      | activityOccurrence _ => simp [localDataOwnerBefore]
  | activityOccurrence left =>
      cases right with
      | effectOccurrence _ => simp [localDataOwnerBefore]
      | activityOccurrence right =>
          simp only [localDataOwnerBefore]
          apply localActivityOwnerBefore_comparable
          exact fun same => different (congrArg LocalDataOwner.activityOccurrence same)

theorem activityVariableScopeBefore_asymm (left right : ActivityVariableScope) :
    activityVariableScopeBefore left right = true →
      activityVariableScopeBefore right left = false :=
  localDataOwnerBefore_asymm left.owner right.owner

theorem insertActivityVariableScope_eq_canonicalInsertBy (scope : ActivityVariableScope) (values : List ActivityVariableScope) :
    insertActivityVariableScope scope values = canonicalInsertBy activityVariableScopeBefore scope values := by
  induction values with
  | nil => rfl
  | cons current rest ih => simp only [insertActivityVariableScope, canonicalInsertBy]; split <;> simp_all

theorem insertActivityVariableScope_commutes (left right : ActivityVariableScope)
    (different : left.owner ≠ right.owner)
    (values : List ActivityVariableScope) :
    insertActivityVariableScope left (insertActivityVariableScope right values) =
      insertActivityVariableScope right (insertActivityVariableScope left values) := by
  have transitive : ∀ a b c : ActivityVariableScope, activityVariableScopeBefore a b = true → activityVariableScopeBefore b c = true → activityVariableScopeBefore a c = true := by
    intro a b c
    exact localDataOwnerBefore_trans a.owner b.owner c.owner
  have asymmetric : ∀ l r : ActivityVariableScope, activityVariableScopeBefore l r = true → activityVariableScopeBefore r l = false := by
    exact activityVariableScopeBefore_asymm
  have comparable : activityVariableScopeBefore left right = true ∨ activityVariableScopeBefore right left = true := by
    exact localDataOwnerBefore_comparable left.owner right.owner different
  simp only [insertActivityVariableScope_eq_canonicalInsertBy]
  exact canonicalInsertBy_commutes_of_strict_order activityVariableScopeBefore asymmetric transitive left right comparable values

end BpmnSemantics.SemanticProcess
