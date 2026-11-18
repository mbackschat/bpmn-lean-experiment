module

public import Kernel.State

/-! # Laws of the kernel state: the ghost issue history of scope occurrence keys

A scope occurrence key is structural (KD1): its ordinal comes from its parent's counter in `State.scopeOrdinals`, which
goes with the parent when its subtree is removed. So no reading of the state says whether a key below a removed subtree
was issued, while queued work may still name one (spike T4e, `counter_reading_lost`). The laws read "issued" from a
ghost instead: a history `H` of keys consistent with the state (`ScopeHistory`), which every standing key belongs to,
which is closed under parents, and whose keys under a standing parent are below that parent's counter. A key is issued
when some history holds it (`ScopeIssued`); an operation keeps every history alive (`ScopeGrows`).

This module is the layer the freshness arguments go through (spike T5, finding 6): `ScopeIssued` for "issued",
`ScopeGrows` for "issues no fewer", and one lemma per issuing or removing operation's shape. A use site names only these,
so a change of the key or its counters re-proves this module, not its readers. Nothing executable imports it.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- The keys of the scope occurrences of `s`. -/
abbrev standingKeys (s : State) : List ScopeOccurrenceId := s.scopes.map (·.id)

/-- What the counter of the scope occurrences of `element` entered in `parent` reads. -/
abbrev slotCount (s : State) (parent : ScopeOccurrenceId) (element : ElementId) : Nat :=
  s.scopeOrdinals.getD { parent, element } 0

theorem child_eq (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Nat) :
    parent.child element ordinal = ⟨{ element, ordinal } :: parent.segments⟩ := by
  unfold ScopeOccurrenceId.child; rfl

@[simp] theorem parent?_cons (segment : ScopeSegment) (rest : List ScopeSegment) :
    (⟨segment :: rest⟩ : ScopeOccurrenceId).parent? = some ⟨rest⟩ := rfl

@[simp] theorem parent?_nil : (⟨[]⟩ : ScopeOccurrenceId).parent? = none := rfl

@[simp] theorem ScopeOccurrence.parent_eq (scope : ScopeOccurrence) : scope.parent = scope.id.parent? := rfl


/-- `H` is an issue history of the scope occurrences `scopes` and the counters `ordinals`: it holds every standing key,
it is closed under parents, and a key of it whose parent stands is below that parent's counter. -/
structure ScopeHistoryOn (scopes : List ScopeOccurrence) (ordinals : TreeMap ScopeSlot Nat compare)
    (H : ScopeOccurrenceId → Prop) : Prop where
  standing : ∀ scope ∈ scopes, H scope.id
  closed : ∀ segment rest, H ⟨segment :: rest⟩ → H ⟨rest⟩
  below : ∀ segment rest, H ⟨segment :: rest⟩ → ⟨rest⟩ ∈ scopes.map (·.id) →
    segment.ordinal < ordinals.getD { parent := ⟨rest⟩, element := segment.element } 0

/-- `H` is an issue history of `s`. It reads only the scope occurrences and their counters, so a change of any other
field keeps it definitionally. -/
abbrev ScopeHistory (s : State) (H : ScopeOccurrenceId → Prop) : Prop := ScopeHistoryOn s.scopes s.scopeOrdinals H

/-- `x` was issued: some issue history of `s` holds it. -/
def ScopeIssued (s : State) (x : ScopeOccurrenceId) : Prop := ∃ H, ScopeHistory s H ∧ H x

/-- `s` has an issue history: its standing keys are below their parents' counters and closed under parents. -/
def Historic (s : State) : Prop := ∃ H, ScopeHistory s H

/-- `t` issued no fewer keys than `s`: each history of `s` grows into one of `t`. -/
def ScopeGrows (s t : State) : Prop := ∀ H, ScopeHistory s H → ∃ H', ScopeHistory t H' ∧ ∀ x, H x → H' x

/-- `t` took the key `x` fresh from `s`: never issued in `s`, issued in `t`, and every history of `s` grows into one of
`t`. -/
abbrev ScopeFresh (s t : State) (x : ScopeOccurrenceId) : Prop := ¬ ScopeIssued s x ∧ ScopeIssued t x ∧ ScopeGrows s t

theorem ScopeHistory.standing_key {s : State} {H : ScopeOccurrenceId → Prop} (history : ScopeHistory s H)
    {x : ScopeOccurrenceId} (member : x ∈ standingKeys s) : H x := by
  obtain ⟨scope, inside, rfl⟩ := List.mem_map.mp member
  exact history.standing scope inside

theorem Historic.issued {s : State} (historic : Historic s) {scope : ScopeOccurrence} (member : scope ∈ s.scopes) :
    ScopeIssued s scope.id :=
  let ⟨H, history⟩ := historic
  ⟨H, history, history.standing scope member⟩

theorem Historic.issued_key {s : State} (historic : Historic s) {x : ScopeOccurrenceId} (member : x ∈ standingKeys s) :
    ScopeIssued s x := by
  obtain ⟨scope, inside, rfl⟩ := List.mem_map.mp member
  exact historic.issued inside

theorem ScopeIssued.historic {s : State} {x : ScopeOccurrenceId} (issued : ScopeIssued s x) : Historic s :=
  let ⟨H, history, _⟩ := issued
  ⟨H, history⟩

/-- An issued key's parent was issued. -/
theorem ScopeIssued.parent {s : State} {segment : ScopeSegment} {rest : List ScopeSegment}
    (issued : ScopeIssued s ⟨segment :: rest⟩) : ScopeIssued s ⟨rest⟩ :=
  let ⟨H, history, held⟩ := issued
  ⟨H, history, history.closed segment rest held⟩

theorem ScopeGrows.refl (s : State) : ScopeGrows s s := fun H history => ⟨H, history, fun _ held => held⟩

theorem ScopeGrows.trans {s t u : State} (first : ScopeGrows s t) (second : ScopeGrows t u) : ScopeGrows s u :=
  fun H history =>
    let ⟨H', history', grown⟩ := first H history
    let ⟨H'', history'', grown'⟩ := second H' history'
    ⟨H'', history'', fun x held => grown' x (grown x held)⟩

theorem ScopeGrows.issued {s t : State} (grows : ScopeGrows s t) {x : ScopeOccurrenceId} (issued : ScopeIssued s x) :
    ScopeIssued t x :=
  let ⟨H, history, held⟩ := issued
  let ⟨H', history', grown⟩ := grows H history
  ⟨H', history', grown x held⟩

theorem ScopeGrows.historic {s t : State} (grows : ScopeGrows s t) (historic : Historic s) : Historic t :=
  let ⟨H, history⟩ := historic
  let ⟨H', history', _⟩ := grows H history
  ⟨H', history'⟩

/-- A change that keeps the standing keys and the counters keeps every history. -/
theorem ScopeGrows.of_same {s t : State} (keys : standingKeys t = standingKeys s) (ordinals : t.scopeOrdinals = s.scopeOrdinals) :
    ScopeGrows s t := fun H history =>
  ⟨H, { standing := fun scope member =>
          history.standing_key (keys ▸ List.mem_map_of_mem (f := ScopeOccurrence.id) member)
        closed := history.closed
        below := fun segment rest held standing => by
          change ⟨rest⟩ ∈ standingKeys t at standing
          rw [ordinals]
          exact history.below segment rest held (show ⟨rest⟩ ∈ standingKeys s from keys ▸ standing) },
    fun _ held => held⟩

/-- A change whose standing keys stood before, and which keeps the counter of every parent that stands after it, keeps
every history: a removal, which prunes only the counters of the scope occurrences it removes. -/
theorem ScopeGrows.shrink {s t : State} (keys : ∀ x ∈ standingKeys t, x ∈ standingKeys s)
    (ordinals : ∀ parent ∈ standingKeys t, ∀ element, slotCount t parent element = slotCount s parent element) :
    ScopeGrows s t := fun H history =>
  ⟨H, { standing := fun scope member =>
          history.standing_key (keys _ (List.mem_map_of_mem (f := ScopeOccurrence.id) member))
        closed := history.closed
        below := fun segment rest held standing => by
          change segment.ordinal < slotCount t ⟨rest⟩ segment.element
          rw [ordinals _ standing]
          exact history.below segment rest held (keys _ standing) },
    fun _ held => held⟩

/-- A key under a standing parent whose ordinal its parent's counter has not reached was not issued. -/
theorem unissued_of_count {s : State} {parent : ScopeOccurrenceId} (standing : parent ∈ standingKeys s) {element : ElementId}
    {ordinal : Nat} (above : slotCount s parent element ≤ ordinal) : ¬ ScopeIssued s (parent.child element ordinal) :=
  fun ⟨_, history, held⟩ => Nat.lt_irrefl _ (Nat.lt_of_lt_of_le
    (history.below { element, ordinal } parent.segments held standing) above)

/-- The key a parent's counter issues next was not issued: its ordinal is not below the counter. -/
theorem entered_unissued {s : State} {parent : ScopeOccurrenceId} (standing : parent ∈ standingKeys s) (element : ElementId) :
    ¬ ScopeIssued s (parent.child element (slotCount s parent element)) :=
  unissued_of_count standing (Nat.le_refl _)

/-- A state whose standing keys are closed under parents and below their standing parents' counters has a history:
its standing keys. -/
theorem historic_of_standing {s : State}
    (closed : ∀ segment rest, ⟨segment :: rest⟩ ∈ standingKeys s → ⟨rest⟩ ∈ standingKeys s)
    (below : ∀ segment rest, ⟨segment :: rest⟩ ∈ standingKeys s → segment.ordinal < slotCount s ⟨rest⟩ segment.element) :
    Historic s :=
  ⟨(· ∈ standingKeys s),
    { standing := fun _ member => List.mem_map_of_mem (f := ScopeOccurrence.id) member
      closed, below := fun segment rest held _ => below segment rest held }⟩

/-- An entry under a standing parent: the new key joins the standing keys and its parent's counter counts it, every
other counter unchanged. It keeps every history, which then holds the new key. -/
theorem ScopeGrows.enter {s t : State} {parent : ScopeOccurrenceId} {element : ElementId} (standing : parent ∈ standingKeys s)
    (keys : standingKeys t = standingKeys s ++ [parent.child element (slotCount s parent element)])
    (counted : slotCount t parent element = slotCount s parent element + 1)
    (others : ∀ parent' element', (parent', element') ≠ (parent, element) →
      slotCount t parent' element' = slotCount s parent' element') :
    ScopeGrows s t ∧ (Historic s → ScopeIssued t (parent.child element (slotCount s parent element))) := by
  let fresh := parent.child element (slotCount s parent element)
  have grows : ∀ H, ScopeHistory s H → ScopeHistory t (fun x => H x ∨ x = fresh) := fun H history =>
    { standing := fun scope member => by
        have : scope.id ∈ standingKeys t := List.mem_map_of_mem (f := ScopeOccurrence.id) member
        rw [keys] at this
        rcases List.mem_append.mp this with old | new
        · exact .inl (history.standing_key old)
        · exact .inr (List.mem_singleton.mp new)
      closed := fun segment rest held => by
        rcases held with old | new
        · exact .inl (history.closed segment rest old)
        · simp only [fresh, child_eq, ScopeOccurrenceId.mk.injEq, List.cons.injEq] at new
          rw [new.2]
          exact .inl (history.standing_key standing)
      below := fun segment rest held standing' => by
        change segment.ordinal < slotCount t ⟨rest⟩ segment.element
        change ⟨rest⟩ ∈ standingKeys t at standing'
        rcases held with old | new
        · have parentHeld := history.closed segment rest old
          by_cases before : (⟨rest⟩ : ScopeOccurrenceId) ∈ standingKeys s
          · have lt : segment.ordinal < slotCount s ⟨rest⟩ segment.element := history.below segment rest old before
            by_cases same : ((⟨rest⟩ : ScopeOccurrenceId), segment.element) = (parent, element)
            · simp only [Prod.mk.injEq] at same
              obtain ⟨p, e⟩ := same
              rw [p, e] at lt ⊢
              omega
            · rw [others _ _ same]
              exact lt
          · rw [keys] at standing'
            rcases List.mem_append.mp standing' with old' | new'
            · exact absurd old' before
            · have : (⟨rest⟩ : ScopeOccurrenceId) = fresh := List.mem_singleton.mp new'
              rw [this] at parentHeld
              exact absurd ⟨H, history, parentHeld⟩ (entered_unissued standing element)
        · simp only [fresh, child_eq, ScopeOccurrenceId.mk.injEq, List.cons.injEq] at new
          obtain ⟨rfl, rfl⟩ := new
          show slotCount s parent element < slotCount t ⟨parent.segments⟩ element
          rw [show (⟨parent.segments⟩ : ScopeOccurrenceId) = parent from rfl, counted]
          omega }
  exact ⟨fun H history => ⟨_, grows H history, fun _ held => .inl held⟩,
    fun ⟨H, history⟩ => ⟨_, grows H history, .inr rfl⟩⟩

/-- `ScopeGrows.enter` for an entry that counts its slot up by inserting into the counter map, as `State.enterScope`
does. -/
theorem ScopeGrows.insert {s t : State} {parent : ScopeOccurrenceId} {element : ElementId}
    (standing : parent ∈ standingKeys s)
    (keys : standingKeys t = standingKeys s ++ [parent.child element (slotCount s parent element)])
    (ordinals : t.scopeOrdinals = s.scopeOrdinals.insert { parent, element } (slotCount s parent element + 1)) :
    ScopeGrows s t ∧ (Historic s → ScopeIssued t (parent.child element (slotCount s parent element))) :=
  ScopeGrows.enter standing keys (by simp only [slotCount, ordinals, Std.ExtTreeMap.getD_insert_self])
    fun parent' element' differ => by
      have apart : compare ({ parent, element } : ScopeSlot) { parent := parent', element := element' } ≠ .eq :=
        fun same => differ (by
          have equal := Std.LawfulEqOrd.eq_of_compare same
          injection equal with parents elements
          rw [parents, elements])
      simp only [slotCount, ordinals, Std.ExtTreeMap.getD_insert, apart, ite_false]

end Kernel.Laws.State
