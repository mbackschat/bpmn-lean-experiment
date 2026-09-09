import BpmnSemantics.SemanticProcess.TokenOrder

/-! # Scope occurrence and remaining activation-counter order laws

Scope insertion uses the complete owner key already used by tokens. Counter replacement retains
every other key and its high-water value. These collection laws are prerequisites for regional
preparation, not a proof that any regional transition can already enter a production batch.
-/

namespace BpmnSemantics.SemanticProcess

theorem scopeOwnerBefore_asymm (left right : ScopeOccurrenceId) :
    scopeOwnerBefore left right = true → scopeOwnerBefore right left = false :=
  controlTokenBefore_asymm { placeId := ⟨""⟩, owner := left }
    { placeId := ⟨""⟩, owner := right }

theorem scopeOwnerBefore_trans (left middle right : ScopeOccurrenceId) :
    scopeOwnerBefore left middle = true → scopeOwnerBefore middle right = true →
      scopeOwnerBefore left right = true :=
  controlTokenBefore_trans { placeId := ⟨""⟩, owner := left }
    { placeId := ⟨""⟩, owner := middle } { placeId := ⟨""⟩, owner := right }

theorem scopeOwnerBefore_comparable (left right : ScopeOccurrenceId) (different : left ≠ right) :
    scopeOwnerBefore left right = true ∨ scopeOwnerBefore right left = true := by
  apply controlTokenBefore_comparable { placeId := ⟨""⟩, owner := left }
    { placeId := ⟨""⟩, owner := right }
  exact fun equal => different (congrArg ControlToken.owner equal)

theorem scopeOwnerBefore_compose (a b c : ScopeOccurrenceId) :
    scopeOwnerBefore b a = false → scopeOwnerBefore c b = false →
      scopeOwnerBefore c a = false :=
  controlTokenBefore_compose { placeId := ⟨""⟩, owner := a }
    { placeId := ⟨""⟩, owner := b } { placeId := ⟨""⟩, owner := c }

theorem orderedBy_insertScopeOccurrence (value : RuntimeScopeOccurrence)
    (values : List RuntimeScopeOccurrence) (ordered : orderedBy scopeOccurrenceBefore values = true) :
    orderedBy scopeOccurrenceBefore (insertScopeOccurrence value values) = true :=
  orderedBy_canonicalInsertBy scopeOccurrenceBefore
    (fun left right => scopeOwnerBefore_asymm left.id right.id) value values ordered

theorem insertScopeOccurrence_commutes (left right : RuntimeScopeOccurrence)
    (different : left.id ≠ right.id) (values : List RuntimeScopeOccurrence) :
    insertScopeOccurrence left (insertScopeOccurrence right values) =
      insertScopeOccurrence right (insertScopeOccurrence left values) :=
  canonicalInsertBy_commutes_of_strict_order scopeOccurrenceBefore
    (fun left right => scopeOwnerBefore_asymm left.id right.id)
    (fun left middle right => scopeOwnerBefore_trans left.id middle.id right.id)
    left right (scopeOwnerBefore_comparable left.id right.id different) values

theorem mem_insertScopeOccurrence (inserted value : RuntimeScopeOccurrence)
    (values : List RuntimeScopeOccurrence) :
    value ∈ insertScopeOccurrence inserted values ↔ value = inserted ∨ value ∈ values :=
  mem_canonicalInsertBy scopeOccurrenceBefore inserted value values

theorem orderedBy_scopeOccurrence_filter (values : List RuntimeScopeOccurrence)
    (keep : RuntimeScopeOccurrence → Bool) (ordered : orderedBy scopeOccurrenceBefore values = true) :
    orderedBy scopeOccurrenceBefore (values.filter keep) = true :=
  orderedBy_filter (fun a b c => scopeOwnerBefore_compose a.id b.id c.id) keep values ordered

theorem orderedBy_setScopeActivationCount (values : List ScopeActivation)
    (scopeId : DefinitionScopeId) (count : Nat)
    (ordered : orderedBy scopeActivationBefore values = true) :
    orderedBy scopeActivationBefore (setScopeActivationCount values scopeId count) = true :=
  orderedBy_canonicalInsertBy scopeActivationBefore
    (stringKeyBefore_asymm (fun value : ScopeActivation => value.scopeId.value)) _ _
    (orderedBy_filter (stringKeyBefore_compose (fun value : ScopeActivation => value.scopeId.value))
      _ values ordered)

theorem orderedBy_setCallActivationCount (state : RuntimeState) (elementId : NodeId) (count : Nat)
    (ordered : orderedBy callActivationBefore state.callActivations = true) :
    orderedBy callActivationBefore (setCallActivationCount state elementId count) = true :=
  orderedBy_canonicalInsertBy callActivationBefore
    (stringKeyBefore_asymm (fun value : CallActivation => value.elementId.value)) _ _
    (orderedBy_filter (stringKeyBefore_compose (fun value : CallActivation => value.elementId.value))
      _ state.callActivations ordered)

theorem orderedBy_setEventRaceActivationCount (values : List EventRaceActivation)
    (elementId : NodeId) (count : Nat) (ordered : orderedBy eventRaceActivationBefore values = true) :
    orderedBy eventRaceActivationBefore (setEventRaceActivationCount values elementId count) = true :=
  orderedBy_canonicalInsertBy eventRaceActivationBefore
    (stringKeyBefore_asymm (fun value : EventRaceActivation => value.elementId.value)) _ _
    (orderedBy_filter (stringKeyBefore_compose (fun value : EventRaceActivation => value.elementId.value))
      _ values ordered)

theorem setScopeActivationCount_commutes (left right : DefinitionScopeId)
    (leftCount rightCount : Nat) (different : left ≠ right) (values : List ScopeActivation)
    (ordered : orderedBy scopeActivationBefore values = true) :
    setScopeActivationCount (setScopeActivationCount values left leftCount) right rightCount =
      setScopeActivationCount (setScopeActivationCount values right rightCount) left leftCount := by
  have keys : left.value ≠ right.value := by
    intro equal
    apply different
    cases left
    cases right
    simp_all
  exact replaceByStringKey_commutes_of_ordered (fun value : ScopeActivation => value.scopeId.value)
    { scopeId := left, count := leftCount } { scopeId := right, count := rightCount } keys values ordered

theorem setCallActivationCount_commutes (left right : NodeId)
    (leftCount rightCount : Nat) (different : left ≠ right) (state : RuntimeState)
    (ordered : orderedBy callActivationBefore state.callActivations = true) :
    setCallActivationCount { state with callActivations := setCallActivationCount state left leftCount }
        right rightCount =
      setCallActivationCount { state with callActivations := setCallActivationCount state right rightCount }
        left leftCount := by
  have keys : left.value ≠ right.value := by
    intro equal
    apply different
    cases left
    cases right
    simp_all
  exact replaceByStringKey_commutes_of_ordered (fun value : CallActivation => value.elementId.value)
    { elementId := left, count := leftCount } { elementId := right, count := rightCount }
    keys state.callActivations ordered

theorem setEventRaceActivationCount_commutes (left right : NodeId)
    (leftCount rightCount : Nat) (different : left ≠ right) (values : List EventRaceActivation)
    (ordered : orderedBy eventRaceActivationBefore values = true) :
    setEventRaceActivationCount (setEventRaceActivationCount values left leftCount) right rightCount =
      setEventRaceActivationCount (setEventRaceActivationCount values right rightCount) left leftCount := by
  have keys : left.value ≠ right.value := by
    intro equal
    apply different
    cases left
    cases right
    simp_all
  exact replaceByStringKey_commutes_of_ordered (fun value : EventRaceActivation => value.elementId.value)
    { elementId := left, count := leftCount } { elementId := right, count := rightCount } keys values ordered

theorem mem_setScopeActivationCount (values : List ScopeActivation)
    (scopeId : DefinitionScopeId) (count : Nat) (value : ScopeActivation) :
    value ∈ setScopeActivationCount values scopeId count ↔
      value = { scopeId, count } ∨ value ∈ values ∧ value.scopeId.value ≠ scopeId.value := by
  simp only [setScopeActivationCount, mem_canonicalInsertBy, List.mem_filter, decide_eq_true_eq]

theorem mem_setCallActivationCount (state : RuntimeState)
    (elementId : NodeId) (count : Nat) (value : CallActivation) :
    value ∈ setCallActivationCount state elementId count ↔
      value = { elementId, count } ∨ value ∈ state.callActivations ∧
        value.elementId.value ≠ elementId.value := by
  simp only [setCallActivationCount, mem_canonicalInsertBy, List.mem_filter, decide_eq_true_eq]

theorem mem_setEventRaceActivationCount (values : List EventRaceActivation)
    (elementId : NodeId) (count : Nat) (value : EventRaceActivation) :
    value ∈ setEventRaceActivationCount values elementId count ↔
      value = { elementId, count } ∨ value ∈ values ∧ value.elementId.value ≠ elementId.value := by
  simp only [setEventRaceActivationCount, mem_canonicalInsertBy, List.mem_filter, decide_eq_true_eq]

end BpmnSemantics.SemanticProcess
