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

/-! ## Occurrence keys

An occurrence key is issued in a scope occurrence, whose counter in `State.occurrenceOrdinals` goes with it (KD1). Its
issue is read through the scope history: a key is issued when its scope occurrence key was and, while that scope
occurrence stands, its counter has passed the key's ordinal. A key issued in a removed scope occurrence reads as issued
whatever its ordinal, and never recurs, since that scope occurrence key is never entered again (`ScopeFresh`). So
freshness holds without the issuing scope occurrence standing while its occurrence lives. -/

/-- What the counter of the occurrences of `element` issued in `scope` reads. -/
abbrev occurrenceCount (s : State) (scope : ScopeOccurrenceId) (element : ElementId) : Nat :=
  s.occurrenceOrdinals.getD { parent := scope, element } 0

/-- The occurrence key `x` was issued in `s`. -/
def OccurrenceIssued (s : State) (x : OccurrenceId) : Prop :=
  ScopeIssued s x.scope ∧ (x.scope ∈ standingKeys s → x.ordinal < occurrenceCount s x.scope x.element)

/-- `t` issued no fewer occurrence keys than `s`. -/
def OccurrenceGrows (s t : State) : Prop := ∀ x, OccurrenceIssued s x → OccurrenceIssued t x

theorem OccurrenceGrows.refl (s : State) : OccurrenceGrows s s := fun _ issued => issued

theorem OccurrenceGrows.trans {s t u : State} (first : OccurrenceGrows s t) (second : OccurrenceGrows t u) :
    OccurrenceGrows s u := fun x issued => second x (first x issued)

theorem OccurrenceIssued.scope {s : State} {x : OccurrenceId} (issued : OccurrenceIssued s x) : ScopeIssued s x.scope :=
  issued.1

/-- A change that issues no fewer scope occurrence keys, whose standing scope occurrences issued before stood before,
and which lowers no counter of a standing one, issues no fewer occurrence keys: an entry, a removal, an issue. -/
theorem OccurrenceGrows.of_scopes {s t : State} (grows : ScopeGrows s t)
    (stood : ∀ x ∈ standingKeys t, ScopeIssued s x → x ∈ standingKeys s)
    (counts : ∀ scope ∈ standingKeys t, ∀ element, occurrenceCount s scope element ≤ occurrenceCount t scope element) :
    OccurrenceGrows s t := fun x ⟨issued, below⟩ =>
  ⟨grows.issued issued, fun standing =>
    Nat.lt_of_lt_of_le (below (stood _ standing issued)) (counts _ standing x.element)⟩

/-- A change that keeps the standing keys and every counter issues the same keys. -/
theorem OccurrenceGrows.of_same {s t : State} (keys : standingKeys t = standingKeys s)
    (ordinals : t.scopeOrdinals = s.scopeOrdinals) (counters : t.occurrenceOrdinals = s.occurrenceOrdinals) :
    OccurrenceGrows s t :=
  .of_scopes (.of_same keys ordinals) (fun _ standing _ => keys ▸ standing)
    (fun _ _ _ => by simp only [occurrenceCount, counters]; exact Nat.le_refl _)

/-- A removal, whose standing keys stood before and which keeps the counters of what stands after it. -/
theorem OccurrenceGrows.shrink {s t : State} (keys : ∀ x ∈ standingKeys t, x ∈ standingKeys s)
    (ordinals : ∀ parent ∈ standingKeys t, ∀ element, slotCount t parent element = slotCount s parent element)
    (counters : ∀ scope ∈ standingKeys t, ∀ element, occurrenceCount t scope element = occurrenceCount s scope element) :
    OccurrenceGrows s t :=
  .of_scopes (.shrink keys ordinals) (fun x standing _ => keys x standing)
    (fun scope standing element => Nat.le_of_eq (counters scope standing element).symm)

/-- The key an issue takes next in a standing scope occurrence was not issued. -/
theorem occurrence_unissued {s : State} {scope : ScopeOccurrenceId} (standing : scope ∈ standingKeys s)
    (element : ElementId) : ¬ OccurrenceIssued s { scope, element, ordinal := occurrenceCount s scope element } :=
  fun ⟨_, below⟩ => Nat.lt_irrefl _ (below standing)

/-- A removed occurrence's key never recurs: a key issued once stays issued through every change that issues no
fewer keys, whatever was removed meanwhile, so the key a later issue takes in a standing scope occurrence differs from
it: the counterpart, for occurrence keys, of `entered_unissued`. -/
theorem occurrence_removed_never_recurs {s t : State} {x : OccurrenceId} (issued : OccurrenceIssued s x)
    (grows : OccurrenceGrows s t) {scope : ScopeOccurrenceId} (standing : scope ∈ standingKeys t) (element : ElementId) :
    x ≠ { scope, element, ordinal := occurrenceCount t scope element } :=
  fun same => occurrence_unissued standing element (same ▸ grows x issued)

/-- An issue in a standing, issued scope occurrence: the counter of `element` there counts one more, the scope
occurrences and their counters stay. It issues no fewer keys, and the key it took is issued after it. -/
theorem OccurrenceGrows.count {s t : State} {scope : ScopeOccurrenceId} {element : ElementId}
    (keys : standingKeys t = standingKeys s) (ordinals : t.scopeOrdinals = s.scopeOrdinals)
    (counters : t.occurrenceOrdinals =
      s.occurrenceOrdinals.insert { parent := scope, element } (occurrenceCount s scope element + 1)) :
    OccurrenceGrows s t ∧ (ScopeIssued s scope →
      OccurrenceIssued t { scope, element, ordinal := occurrenceCount s scope element }) := by
  have count : ∀ scope' element', occurrenceCount s scope' element' ≤ occurrenceCount t scope' element' := by
    intro scope' element'
    simp only [occurrenceCount, counters, Std.ExtTreeMap.getD_insert]
    split
    · rename_i same
      have equal := Std.LawfulEqOrd.eq_of_compare same
      injection equal with scopes elements
      subst scopes elements
      exact Nat.le_succ _
    · exact Nat.le_refl _
  refine ⟨.of_scopes (.of_same keys ordinals) (fun _ standing _ => keys ▸ standing) (fun _ _ _ => count _ _),
    fun issued => ⟨(ScopeGrows.of_same keys ordinals).issued issued, fun _ => ?_⟩⟩
  simp only [occurrenceCount, counters, Std.ExtTreeMap.getD_insert_self]
  exact Nat.lt_succ_self _

/-- An issue takes the key its counter reads: never issued while its scope occurrence stands, issued after it when its
scope occurrence key was. -/
theorem occurrence_next {before after : State} {scope : ScopeOccurrenceId} {element : ElementId} {id : OccurrenceId}
    (named : id = { scope, element, ordinal := occurrenceCount before scope element })
    (keys : standingKeys after = standingKeys before) (ordinals : after.scopeOrdinals = before.scopeOrdinals)
    (counters : after.occurrenceOrdinals =
      before.occurrenceOrdinals.insert { parent := scope, element } (occurrenceCount before scope element + 1)) :
    (scope ∈ standingKeys before → ¬ OccurrenceIssued before id) ∧ (ScopeIssued before scope → OccurrenceIssued after id) ∧
      OccurrenceGrows before after := by
  subst named
  obtain ⟨grows, issues⟩ := OccurrenceGrows.count keys ordinals counters
  exact ⟨fun standing => occurrence_unissued standing element, issues, grows⟩

/-- An entry of a fresh scope occurrence key, which issues no occurrence key: the occurrence counters stay. -/
theorem OccurrenceGrows.enter {s t : State} (grows : ScopeGrows s t)
    (keys : ∀ x ∈ standingKeys t, x ∈ standingKeys s ∨ ¬ ScopeIssued s x)
    (counters : t.occurrenceOrdinals = s.occurrenceOrdinals) : OccurrenceGrows s t :=
  .of_scopes grows (fun x standing issued => (keys x standing).resolve_right fun fresh => fresh issued)
    (fun _ _ _ => by simp only [occurrenceCount, counters]; exact Nat.le_refl _)

end Kernel.Laws.State
