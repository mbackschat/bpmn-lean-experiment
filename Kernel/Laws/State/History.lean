module

public import Kernel.State
public import Kernel.Laws.State.Issue

/-! # Laws of the kernel state: the ghost issue history of scope occurrence keys

A scope occurrence key is structural (KD1): its committed ordinal comes from its parent's counter in
`State.scopeOrdinals`, which goes with the parent when its subtree is removed, and an issue of the closure in progress is
in the closure's issue table (`State.issued`, DC12). So no reading of the state says whether a key below a removed subtree
was issued, while queued work may still name one (spike T4e, `counter_reading_lost`). The laws read "issued" from a
ghost instead: a history `H` of keys consistent with the state (`ScopeHistory`), which every standing key belongs to,
which is closed under parents, whose committed keys under a standing parent are below that parent's counter, and whose
fresh keys are in the issue table under their slot. A key is issued
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

theorem child_eq (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Issue) :
    parent.child element ordinal = .ofSegments ({ element, ordinal } :: parent.segments) :=
  ScopeOccurrenceId.ext (ScopeOccurrenceId.ofSegments_segments _).symm

@[simp] theorem ScopeOccurrence.parent_eq (scope : ScopeOccurrence) : scope.parent = scope.id.parent? := rfl


/-- Fresh segments lie below committed ones only: a committed segment has only committed segments above it, since a scope
occurrence is entered in one that stands and a commit renames every fresh segment (DC12). -/
def Layered : List ScopeSegment → Prop
  | [] => True
  | segment :: rest => (segment.ordinal.isFresh = false → ∀ above ∈ rest, above.ordinal.isFresh = false) ∧ Layered rest

theorem Layered.tail {segment : ScopeSegment} {rest : List ScopeSegment} (layered : Layered (segment :: rest)) :
    Layered rest := layered.2

/-- `H` is an issue history of the scope occurrences `scopes`, the counters `ordinals` and the issue table `issued`: it
holds every standing key, it is closed under parents, a committed key of it whose parent stands is below that parent's
counter, a fresh key of it is in the table under its slot, and every key of it is layered (DC12). -/
structure ScopeHistoryOn (scopes : List ScopeOccurrence) (ordinals : TreeMap ScopeSlot Nat compare)
    (issued : TreeMap Issue ClaimSlot compare) (H : ScopeOccurrenceId → Prop) : Prop where
  standing : ∀ scope ∈ scopes, H scope.id
  closed : ∀ segment rest, H (.ofSegments (segment :: rest)) → H (.ofSegments rest)
  below : ∀ segment rest n, H (.ofSegments (segment :: rest)) → segment.ordinal = .committed n →
    (.ofSegments rest) ∈ scopes.map (·.id) → n < ordinals.getD { parent := (.ofSegments rest), element := segment.element } 0
  tabled : ∀ segment rest unit index, H (.ofSegments (segment :: rest)) → segment.ordinal = .fresh unit index →
    issued[Issue.fresh unit index]? = some (.scope { parent := .ofSegments rest, element := segment.element })
  layered : ∀ x, H x → Layered x.segments

/-- `H` is an issue history of `s`. It reads only the scope occurrences, their counters and the issue table, so a change
of any other field keeps it definitionally. -/
abbrev ScopeHistory (s : State) (H : ScopeOccurrenceId → Prop) : Prop := ScopeHistoryOn s.scopes s.scopeOrdinals s.issued H

/-- `t`'s issue table holds every entry `s`'s holds: nothing a closure issues leaves the table before the commit. -/
abbrev TableGrows (s t : State) : Prop :=
  ∀ (issue : Issue) (slot : ClaimSlot), s.issued[issue]? = some slot → t.issued[issue]? = some slot

theorem TableGrows.refl (s : State) : TableGrows s s := fun _ _ held => held

theorem TableGrows.of_eq {s t : State} (same : t.issued = s.issued) : TableGrows s t := fun _ _ held => by rw [same]; exact held

theorem TableGrows.trans {s t u : State} (first : TableGrows s t) (second : TableGrows t u) : TableGrows s u :=
  fun issue slot held => second issue slot (first issue slot held)

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
    (issued : ScopeIssued s (.ofSegments (segment :: rest))) : ScopeIssued s (.ofSegments rest) :=
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

/-- A change that keeps the standing keys and the counters, and grows the issue table, keeps every history. -/
theorem ScopeGrows.of_same {s t : State} (keys : standingKeys t = standingKeys s) (ordinals : t.scopeOrdinals = s.scopeOrdinals)
    (table : TableGrows s t) : ScopeGrows s t := fun H history =>
  ⟨H, { standing := fun scope member =>
          history.standing_key (keys ▸ List.mem_map_of_mem (f := ScopeOccurrence.id) member)
        closed := history.closed
        below := fun segment rest n held committed standing => by
          change (.ofSegments rest) ∈ standingKeys t at standing
          rw [ordinals]
          exact history.below segment rest n held committed (show (.ofSegments rest) ∈ standingKeys s from keys ▸ standing)
        tabled := fun segment rest unit index held fresh => table _ _ (history.tabled segment rest unit index held fresh)
        layered := history.layered },
    fun _ held => held⟩

/-- A change whose standing keys stood before, and which keeps the counter of every parent that stands after it, keeps
every history: a removal, which prunes only the counters of the scope occurrences it removes. -/
theorem ScopeGrows.shrink {s t : State} (keys : ∀ x ∈ standingKeys t, x ∈ standingKeys s)
    (ordinals : ∀ parent ∈ standingKeys t, ∀ element, slotCount t parent element = slotCount s parent element)
    (table : TableGrows s t) : ScopeGrows s t := fun H history =>
  ⟨H, { standing := fun scope member =>
          history.standing_key (keys _ (List.mem_map_of_mem (f := ScopeOccurrence.id) member))
        closed := history.closed
        below := fun segment rest n held committed standing => by
          change n < slotCount t (.ofSegments rest) segment.element
          rw [ordinals _ standing]
          exact history.below segment rest n held committed (keys _ standing)
        tabled := fun segment rest unit index held fresh => table _ _ (history.tabled segment rest unit index held fresh)
        layered := history.layered },
    fun _ held => held⟩

/-- A committed key under a standing parent whose ordinal its parent's counter has not reached was not issued. -/
theorem unissued_of_count {s : State} {parent : ScopeOccurrenceId} (standing : parent ∈ standingKeys s) {element : ElementId}
    {ordinal : Nat} (above : slotCount s parent element ≤ ordinal) :
    ¬ ScopeIssued s (parent.child element (.committed ordinal)) :=
  fun ⟨_, history, held⟩ => by
    have lt := history.below { element, ordinal := .committed ordinal } parent.segments ordinal
      (child_eq parent element _ ▸ held) rfl ((ScopeOccurrenceId.ofSegments_eta parent).symm ▸ standing)
    rw [ScopeOccurrenceId.ofSegments_eta] at lt
    exact Nat.lt_irrefl _ (Nat.lt_of_lt_of_le lt above)

/-- A key whose fresh issue the table does not hold was not issued (DC12). -/
theorem entered_unissued {s : State} (parent : ScopeOccurrenceId) (element : ElementId) {unit : UnitKey} {index : Nat}
    (untabled : s.issued[Issue.fresh unit index]? = none) : ¬ ScopeIssued s (parent.child element (.fresh unit index)) :=
  fun ⟨_, history, held⟩ => by
    have tabled := history.tabled { element, ordinal := .fresh unit index } parent.segments unit index
      (child_eq parent element _ ▸ held) rfl
    rw [untabled] at tabled
    cases tabled

/-- A state whose standing keys are closed under parents, whose committed ones are below their standing parents'
counters and whose fresh ones are in the table has a history: its standing keys. -/
theorem historic_of_standing {s : State}
    (closed : ∀ segment rest, (.ofSegments (segment :: rest)) ∈ standingKeys s → (.ofSegments rest) ∈ standingKeys s)
    (below : ∀ segment rest n, (.ofSegments (segment :: rest)) ∈ standingKeys s → segment.ordinal = .committed n →
      n < slotCount s (.ofSegments rest) segment.element)
    (tabled : ∀ segment rest unit index, (.ofSegments (segment :: rest)) ∈ standingKeys s →
      segment.ordinal = .fresh unit index →
      s.issued[Issue.fresh unit index]? = some (.scope { parent := .ofSegments rest, element := segment.element }))
    (layered : ∀ x ∈ standingKeys s, Layered x.segments) :
    Historic s :=
  ⟨(· ∈ standingKeys s),
    { standing := fun _ member => List.mem_map_of_mem (f := ScopeOccurrence.id) member
      closed, below := fun segment rest n held committed _ => below segment rest n held committed, tabled, layered }⟩

/-- An issue the unit's following issue was inserted after keeps its slot: an identity whose order position the unit
issued next (`State.enterScope`, DC25). -/
theorem getElem?_insert_insert_first (m : TreeMap Issue ClaimSlot compare) (unit : UnitKey) (index : Nat)
    (first second : ClaimSlot) :
    ((m.insert (.fresh unit index) first).insert (.fresh unit (index + 1)) second)[Issue.fresh unit index]? = some first := by
  rw [Std.ExtTreeMap.getElem?_insert]
  split
  · rename_i same
    obtain ⟨-, apart⟩ := Issue.fresh.inj (Std.LawfulEqOrd.eq_of_compare same)
    omega
  · exact Std.ExtTreeMap.getElem?_insert_self

/-- An entry under a standing parent (DC12): the new key, of the fresh issue `.fresh unit index` the table did not hold,
joins the standing keys and the table, the counters unchanged. It keeps every history, which then holds the new key. -/
theorem ScopeGrows.enter {s t : State} {parent : ScopeOccurrenceId} {element : ElementId} {unit : UnitKey} {index : Nat}
    (standing : parent ∈ standingKeys s) (untabled : s.issued[Issue.fresh unit index]? = none)
    (keys : standingKeys t = standingKeys s ++ [parent.child element (.fresh unit index)])
    (ordinals : t.scopeOrdinals = s.scopeOrdinals) (table : TableGrows s t)
    (issued : t.issued[Issue.fresh unit index]? = some (.scope { parent, element })) :
    ScopeGrows s t ∧ (Historic s → ScopeIssued t (parent.child element (.fresh unit index))) := by
  let fresh := parent.child element (.fresh unit index)
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
        · simp only [fresh, child_eq, ScopeOccurrenceId.ofSegments_inj, List.cons.injEq] at new
          rw [new.2, ScopeOccurrenceId.ofSegments_eta]
          exact .inl (history.standing_key standing)
      below := fun segment rest n held committed standing' => by
        change n < slotCount t (.ofSegments rest) segment.element
        change (.ofSegments rest) ∈ standingKeys t at standing'
        rcases held with old | new
        · have parentHeld := history.closed segment rest old
          by_cases before : (.ofSegments rest : ScopeOccurrenceId) ∈ standingKeys s
          · rw [show slotCount t (.ofSegments rest) segment.element = slotCount s (.ofSegments rest) segment.element by
              simp only [slotCount, ordinals]]
            exact history.below segment rest n old committed before
          · rw [keys] at standing'
            rcases List.mem_append.mp standing' with old' | new'
            · exact absurd old' before
            · have : (.ofSegments rest : ScopeOccurrenceId) = fresh := List.mem_singleton.mp new'
              rw [this] at parentHeld
              exact absurd ⟨H, history, parentHeld⟩ (entered_unissued parent element untabled)
        · simp only [fresh, child_eq, ScopeOccurrenceId.ofSegments_inj, List.cons.injEq] at new
          obtain ⟨rfl, -⟩ := new
          cases committed
      tabled := fun segment rest unit' index' held fresh' => by
        rcases held with old | new
        · exact table _ _ (history.tabled segment rest unit' index' old fresh')
        · simp only [fresh, child_eq, ScopeOccurrenceId.ofSegments_inj, List.cons.injEq] at new
          obtain ⟨rfl, rfl⟩ := new
          cases fresh'
          rw [ScopeOccurrenceId.ofSegments_eta]
          exact issued
      layered := fun x held => by
        rcases held with old | new
        · exact history.layered x old
        · rw [new]
          exact ⟨fun committed => by simp at committed, history.layered _ (history.standing_key standing)⟩ }
  exact ⟨fun H history => ⟨_, grows H history, fun _ held => .inl held⟩,
    fun ⟨H, history⟩ => ⟨_, grows H history, .inr rfl⟩⟩

/-! ## Occurrence keys

An occurrence key is issued in a scope occurrence, whose counter in `State.occurrenceOrdinals` goes with it (KD1). Its
issue is read through the scope history: a key is issued when its scope occurrence key was and, while that scope
occurrence stands, its counter has passed the key's committed ordinal, or the issue table holds its fresh issue under
its slot (DC12). A key issued in a removed scope occurrence reads as issued
whatever its ordinal, and never recurs, since that scope occurrence key is never entered again (`ScopeFresh`). So
freshness holds without the issuing scope occurrence standing while its occurrence lives. -/

/-- What the counter of the occurrences of `element` issued in `scope` reads. -/
abbrev occurrenceCount (s : State) (scope : ScopeOccurrenceId) (element : ElementId) : Nat :=
  s.occurrenceOrdinals.getD { parent := scope, element } 0

/-- The occurrence key `x` was issued in `s`: its ordinal is below its counter while its scope occurrence stands, or its
fresh issue is in the table under its slot. -/
def OrdinalIssued (s : State) (x : OccurrenceId) : Prop :=
  (∀ n, x.ordinal = .committed n → x.scope.fresh = false) ∧
  (∀ n, x.ordinal = .committed n → x.scope ∈ standingKeys s → n < occurrenceCount s x.scope x.element) ∧
    ∀ unit index, x.ordinal = .fresh unit index →
      s.issued[Issue.fresh unit index]? = some (.occurrence { parent := x.scope, element := x.element })

/-- The occurrence key `x` was issued in `s`. -/
def OccurrenceIssued (s : State) (x : OccurrenceId) : Prop := ScopeIssued s x.scope ∧ OrdinalIssued s x

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
    (counts : ∀ scope ∈ standingKeys t, ∀ element, occurrenceCount s scope element ≤ occurrenceCount t scope element)
    (table : TableGrows s t) : OccurrenceGrows s t := fun x ⟨issued, owner, below, tabled⟩ =>
  ⟨grows.issued issued, owner, fun n committed standing =>
    Nat.lt_of_lt_of_le (below n committed (stood _ standing issued)) (counts _ standing x.element),
    fun unit index fresh => table _ _ (tabled unit index fresh)⟩

/-- A change that keeps the standing keys and every counter issues the same keys. -/
theorem OccurrenceGrows.of_same {s t : State} (keys : standingKeys t = standingKeys s)
    (ordinals : t.scopeOrdinals = s.scopeOrdinals) (counters : t.occurrenceOrdinals = s.occurrenceOrdinals)
    (table : TableGrows s t) : OccurrenceGrows s t :=
  .of_scopes (.of_same keys ordinals table) (fun _ standing _ => keys ▸ standing)
    (fun _ _ _ => by simp only [occurrenceCount, counters]; exact Nat.le_refl _) table

/-- A removal, whose standing keys stood before and which keeps the counters of what stands after it. -/
theorem OccurrenceGrows.shrink {s t : State} (keys : ∀ x ∈ standingKeys t, x ∈ standingKeys s)
    (ordinals : ∀ parent ∈ standingKeys t, ∀ element, slotCount t parent element = slotCount s parent element)
    (counters : ∀ scope ∈ standingKeys t, ∀ element, occurrenceCount t scope element = occurrenceCount s scope element)
    (table : TableGrows s t) : OccurrenceGrows s t :=
  .of_scopes (.shrink keys ordinals table) (fun x standing _ => keys x standing)
    (fun scope standing element => Nat.le_of_eq (counters scope standing element).symm) table

/-- A key whose fresh issue the table does not hold was not issued (DC12). -/
theorem occurrence_unissued {s : State} {scope : ScopeOccurrenceId} {element : ElementId} {unit : UnitKey} {index : Nat}
    (untabled : s.issued[Issue.fresh unit index]? = none) :
    ¬ OccurrenceIssued s { scope, element, ordinal := .fresh unit index } :=
  fun ⟨_, _, _, tabled⟩ => by
    have held := tabled unit index rfl
    rw [untabled] at held
    cases held

/-- An issue (DC12): the table gains the fresh issue `.fresh unit index` in the slot (`scope`, `element`), which it did
not hold; the scope occurrences and the counters stay. It issues no fewer keys, and the key it took is issued after it
when its scope occurrence key was. -/
theorem OccurrenceGrows.issue {s t : State} {scope : ScopeOccurrenceId} {element : ElementId} {unit : UnitKey}
    {index : Nat} (untabled : s.issued[Issue.fresh unit index]? = none)
    (keys : standingKeys t = standingKeys s) (ordinals : t.scopeOrdinals = s.scopeOrdinals)
    (counters : t.occurrenceOrdinals = s.occurrenceOrdinals)
    (issued : t.issued = s.issued.insert (.fresh unit index) (.occurrence { parent := scope, element })) :
    TableGrows s t ∧ OccurrenceGrows s t ∧
      (ScopeIssued s scope → OccurrenceIssued t { scope, element, ordinal := .fresh unit index }) := by
  have table : TableGrows s t := fun issue slot held => by
    rw [issued, Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same
      rw [← Std.LawfulEqOrd.eq_of_compare same, untabled] at held
      cases held
    · exact held
  have ordinal : OrdinalIssued t { scope, element, ordinal := .fresh unit index } :=
    And.intro (fun _ committed => by simp at committed) <| And.intro (fun _ committed => by simp at committed)
      fun unit' index' fresh => by
        cases fresh
        rw [issued, Std.ExtTreeMap.getElem?_insert_self]
  exact ⟨table, .of_same keys ordinals counters table, fun issuedScope =>
    And.intro ((ScopeGrows.of_same keys ordinals table).issued issuedScope) ordinal⟩

/-- A removed occurrence's key never recurs: a key issued once stays issued through every change that issues no
fewer keys, whatever was removed meanwhile, so a later fresh issue the table did not hold differs from it: the
counterpart, for occurrence keys, of `entered_unissued`. -/
theorem occurrence_removed_never_recurs {s t : State} {x : OccurrenceId} (issued : OccurrenceIssued s x)
    (grows : OccurrenceGrows s t) {scope : ScopeOccurrenceId} {element : ElementId} {unit : UnitKey} {index : Nat}
    (untabled : t.issued[Issue.fresh unit index]? = none) :
    x ≠ { scope, element, ordinal := .fresh unit index } :=
  fun same => occurrence_unissued untabled (same ▸ grows x issued)

/-- An entry of a fresh scope occurrence key, which issues no occurrence key: the occurrence counters stay. -/
theorem OccurrenceGrows.enter {s t : State} (grows : ScopeGrows s t)
    (keys : ∀ x ∈ standingKeys t, x ∈ standingKeys s ∨ ¬ ScopeIssued s x)
    (counters : t.occurrenceOrdinals = s.occurrenceOrdinals) (table : TableGrows s t) : OccurrenceGrows s t :=
  .of_scopes grows (fun x standing issued => (keys x standing).resolve_right fun fresh => fresh issued)
    (fun _ _ _ => by simp only [occurrenceCount, counters]; exact Nat.le_refl _) table

/-! ## Item keys -/

/-- The item key `key` was issued in `s` (KD1, DC12): while its occurrence is present, its committed ordinal is below
that occurrence's item counter, and its fresh issue is in the table under its occurrence. A removed occurrence's
counter goes with it, and its identity never recurs (`occurrence_removed_never_recurs`). A committed key's occurrence is
committed: only a commit makes committed keys, and it renames every fresh one. -/
def ItemIssued (s : State) (key : ItemKey) : Prop :=
  (∀ n, key.ordinal = .committed n → key.occurrence.fresh = false) ∧
  ((∃ occurrence ∈ s.occurrences, occurrence.id = key.occurrence) → ∀ n, key.ordinal = .committed n →
    n < s.itemOrdinals.getD key.occurrence 0) ∧
  ∀ unit index, key.ordinal = .fresh unit index → s.issued[Issue.fresh unit index]? = some (.item key.occurrence)

/-- A committed occurrence key of a committed scope occurrence key, below its counter while that stands, was issued as
far as its ordinal tells. -/
theorem OrdinalIssued.committed {s : State} {x : OccurrenceId} {n : Nat} (ordinal : x.ordinal = .committed n)
    (scope : x.scope.fresh = false) (below : x.scope ∈ standingKeys s → n < occurrenceCount s x.scope x.element) :
    OrdinalIssued s x :=
  ⟨fun _ _ => scope, fun _ same standing => by rw [ordinal] at same; cases same; exact below standing,
    fun _ _ fresh => by rw [ordinal] at fresh; cases fresh⟩

/-- A committed item key of a committed occurrence key, below its counter while that occurrence is present, was
issued. -/
theorem ItemIssued.committed {s : State} {key : ItemKey} {n : Nat} (ordinal : key.ordinal = .committed n)
    (occurrence : key.occurrence.fresh = false)
    (below : (∃ found ∈ s.occurrences, found.id = key.occurrence) → n < s.itemOrdinals.getD key.occurrence 0) :
    ItemIssued s key :=
  ⟨fun _ _ => occurrence, fun present _ same => by rw [ordinal] at same; cases same; exact below present,
    fun _ _ fresh => by rw [ordinal] at fresh; cases fresh⟩

end Kernel.Laws.State
