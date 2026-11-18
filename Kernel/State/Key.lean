module

public import Kernel.IL.Types

/-! # Scope occurrence and occurrence keys

A scope occurrence's identity is structural (KD1): the key of the scope occurrence it was entered in, the element it
was entered for and an ordinal counted per (parent, element) by `State.scopeOrdinals`, so no global counter issues it.
The process root is the empty key. An occurrence's identity is the scope occurrence key it was issued in, its element and
an ordinal counted the same way by `State.occurrenceOrdinals`. Each key has a lawful order, so maps may key on it, and an order that reads only the
key's value: no site may read it as an order of entry. Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- One step down the scope tree: the element a scope occurrence was entered for, and its ordinal among the scope
occurrences of that element entered in the same parent. -/
structure ScopeSegment where
  element : ElementId
  ordinal : Nat
  deriving DecidableEq, Repr, Inhabited

instance : Ord ScopeSegment where
  compare := compareLex (compareOn (·.element.value)) (compareOn (·.ordinal))

/-- The orders a map key needs, proved inline beside the order, since an executable module holds no theorem
(guard 6). -/
instance : Std.TransOrd ScopeSegment := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd ScopeSegment where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun segment : ScopeSegment => segment.element.value)
        (compareOn fun segment : ScopeSegment => segment.ordinal) a b = .eq := h
    rw [compareLex_eq_eq] at h
    obtain ⟨⟨element⟩, ordinal⟩ := a
    obtain ⟨⟨element'⟩, ordinal'⟩ := b
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare h.1
    have ordinals : ordinal = ordinal' := Std.LawfulEqOrd.eq_of_compare h.2
    subst same ordinals
    rfl

/-- A scope occurrence's structural key: its segments from itself up to the process root, innermost first, so the
parent's key is the tail and a key's own element and ordinal are its head. The root of the process instance has none;
a called instance's root is entered below its Call's scope occurrence like any other. -/
structure ScopeOccurrenceId where
  segments : List ScopeSegment
  deriving DecidableEq, Repr, Inhabited

namespace ScopeOccurrenceId

/-- The key of the `ordinal`th scope occurrence of `element` entered in `parent`. -/
abbrev child (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Nat) : ScopeOccurrenceId :=
  ⟨{ element, ordinal } :: parent.segments⟩

/-- The key of the scope occurrence this one was entered in, `none` for the root. -/
abbrev parent? (scope : ScopeOccurrenceId) : Option ScopeOccurrenceId :=
  match scope.segments with
  | [] => none
  | _ :: rest => some ⟨rest⟩

end ScopeOccurrenceId

instance : Ord ScopeOccurrenceId where
  compare := compareOn (·.segments)

instance : Std.TransOrd ScopeOccurrenceId := inferInstanceAs <| Std.TransCmp (compareOn _)

instance : Std.LawfulEqOrd ScopeOccurrenceId where
  eq_of_compare {a b} h := by
    have h : compare a.segments b.segments = .eq := h
    obtain ⟨segments⟩ := a
    obtain ⟨segments'⟩ := b
    have same : segments = segments' := Std.LawfulEqOrd.eq_of_compare h
    subst same
    rfl

/-- What an ordinal counter counts: the keys issued for `element` in the scope occurrence `parent`, the scope
occurrences entered there (`State.scopeOrdinals`) or the occurrences issued there (`State.occurrenceOrdinals`). -/
structure ScopeSlot where
  parent : ScopeOccurrenceId
  element : ElementId
  deriving DecidableEq, Repr

instance : Ord ScopeSlot where
  compare := compareLex (compareOn (·.parent)) (compareOn (·.element.value))

instance : Std.TransOrd ScopeSlot := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd ScopeSlot where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun slot : ScopeSlot => slot.parent)
        (compareOn fun slot : ScopeSlot => slot.element.value) a b = .eq := h
    rw [compareLex_eq_eq] at h
    obtain ⟨parent, ⟨element⟩⟩ := a
    obtain ⟨parent', ⟨element'⟩⟩ := b
    have parents : parent = parent' := Std.LawfulEqOrd.eq_of_compare h.1
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare h.2
    subst parents same
    rfl

/-- An occurrence's structural key (KD1): the scope occurrence it was issued in, its element and an ordinal counted per
(scope occurrence, element) by `State.occurrenceOrdinals`, so no global counter issues it. A reservation is issued in the
scope occurrence that arms it and keeps its key when it begins in another (`State.beginOccurrence`).
`State.issueOccurrence` is the one issuer. -/
structure OccurrenceId where
  scope : ScopeOccurrenceId
  element : ElementId
  ordinal : Nat
  deriving DecidableEq, Repr, Inhabited

instance : Ord OccurrenceId where
  compare := compareLex (compareOn (·.scope)) <| compareLex (compareOn (·.element.value)) (compareOn (·.ordinal))

instance : Std.TransOrd OccurrenceId := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd OccurrenceId where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun key : OccurrenceId => key.scope)
        (compareLex (compareOn fun key : OccurrenceId => key.element.value) (compareOn fun key : OccurrenceId => key.ordinal))
        a b = .eq := h
    rw [compareLex_eq_eq, compareLex_eq_eq] at h
    obtain ⟨scope, ⟨element⟩, ordinal⟩ := a
    obtain ⟨scope', ⟨element'⟩, ordinal'⟩ := b
    have scopes : scope = scope' := Std.LawfulEqOrd.eq_of_compare h.1
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare h.2.1
    have ordinals : ordinal = ordinal' := Std.LawfulEqOrd.eq_of_compare h.2.2
    subst scopes same ordinals
    rfl

end Kernel
