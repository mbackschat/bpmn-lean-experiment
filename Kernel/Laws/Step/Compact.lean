module

public import Kernel.Laws.Step.Commit
public import Kernel.Laws.State.Transitions

/-! # Laws of the step function: the invariant's clauses across compaction at commit (DC12)

What `Kernel.Step.compact` keeps of `Laws.State.WellFormed`, clause by clause, from its mechanics
(`Kernel.Laws.Step.Commit`): a history of the settled state, renamed, is one of the committed state
(`compact_history`), since the renaming is injective onto committed history keys (`rename_onto`); the counter clauses of
`IssuedBelow` hold after the commit (`compacts_issued`); and the renaming is injective on standing keys (`rename_inj`), so
`Distinct.scopes` holds after it (`compact_scopesDistinct`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step Kernel.Laws.State

/-! ## The scope history across the commit -/

section History

variable {start : State} {log : RunLog} {s : State} {H : ScopeOccurrenceId → Prop}

/-- A fresh head segment of a history key took a committed ordinal at or above its slot's base and below its slot's
next ordinal. -/
theorem fresh_head (history : ScopeHistory s H) {segment : ScopeSegment} {rest : List ScopeSegment}
    (held : H (.ofSegments (segment :: rest))) {unit : UnitKey} {index : Nat} (fresh : segment.ordinal = .fresh unit index) :
    ∃ n next, commitRenaming start log s segment.ordinal = .committed n ∧
      (assign start log s).2[ClaimSlot.scope { parent := .ofSegments rest, element := segment.element }]? = some next ∧
      slotBase start (.scope { parent := .ofSegments rest, element := segment.element }) ≤ n ∧ n < next := by
  obtain ⟨n, next, parts⟩ := assign_took (start := start) (log := log) (history.tabled segment rest unit index held fresh)
  obtain ⟨got, advanced, low, high⟩ := parts
  refine ⟨n, next, ?_, advanced, low, high⟩
  rw [fresh]
  simp [commitRenaming, renameBy_fresh, got]

theorem renamed_committed (history : ScopeHistory s H) {segment : ScopeSegment} {rest : List ScopeSegment}
    (held : H (.ofSegments (segment :: rest))) : (renameSegment (commitRenaming start log s) segment).ordinal.isFresh = false := by
  cases fresh : segment.ordinal with
  | committed n => simp [renameSegment, fresh, commitRenaming, renameBy_committed]
  | fresh unit index =>
    obtain ⟨n, _, renamed, _⟩ := fresh_head (start := start) (log := log) history held fresh
    simp [renameSegment, renamed]

/-- **The renaming is injective onto committed history keys**: a standing key renamed to a committed key of the history
is that key, since a fresh issue takes an ordinal at or above its slot's counter, which every committed key below a
standing parent is below. -/
theorem rename_onto (history : ScopeHistory s H) (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s) :
    ∀ (segments : List ScopeSegment), H (.ofSegments segments) → (∀ c ∈ segments, c.ordinal.isFresh = false) →
      ∀ z ∈ standingKeys s, renameScope (commitRenaming start log s) z = .ofSegments segments → z = .ofSegments segments
  | [], _, _, z, standing, renamed => by
    rw [renameScope_eq (renameBy_fixes _) (history.layered z (history.standing_key standing)),
      ScopeOccurrenceId.ofSegments_inj, List.map_eq_nil_iff] at renamed
    rw [← ScopeOccurrenceId.ofSegments_eta z, renamed]
  | e :: f, held, committed, z, standing, renamed => by
    have zl := history.layered z (history.standing_key standing)
    rw [renameScope_eq (renameBy_fixes _) zl, ScopeOccurrenceId.ofSegments_inj] at renamed
    obtain ⟨c, d, parts⟩ := List.map_eq_cons_iff.mp renamed
    obtain ⟨zs, ce, df⟩ := parts
    have zeq : z = .ofSegments (c :: d) := by rw [← zs, ScopeOccurrenceId.ofSegments_eta]
    have dstand : ScopeOccurrenceId.ofSegments d ∈ standingKeys s := parents c d (zeq ▸ standing)
    have dl : Layered d := by rw [zs] at zl; exact zl.tail
    have dren : renameScope (commitRenaming start log s) (.ofSegments d) = .ofSegments f := by
      rw [renameScope_eq (renameBy_fixes _) (by rwa [ScopeOccurrenceId.ofSegments_segments]),
        ScopeOccurrenceId.ofSegments_segments, df]
    have same := rename_onto history counted parents f (history.closed e f held)
      (fun x member => committed x (List.mem_cons_of_mem _ member)) _ dstand dren
    have fd : d = f := ScopeOccurrenceId.ofSegments_inj.mp same
    rw [zeq, fd]
    rw [fd] at dstand zeq
    have ec : c = e := by
      cases hc : c.ordinal with
      | committed k => rw [← ce]; exact (renameSegment_committed (renameBy_fixes _) (by rw [hc]; simp)).symm
      | fresh unit index =>
        exfalso
        obtain ⟨m, _, parts⟩ := fresh_head (start := start) (log := log) history (zeq ▸ history.standing_key standing) hc
        obtain ⟨got, _, low, _⟩ := parts
        have eord : e.ordinal = .committed m := by rw [← ce]; exact got
        have below := history.below e f m held eord dstand
        have eel : e.element = c.element := by rw [← ce]; rfl
        have base : s.scopeOrdinals.getD { parent := .ofSegments f, element := c.element } 0 ≤
            slotBase start (.scope { parent := .ofSegments f, element := c.element }) := by
          simpa [slotBase_eq, fresh_of_committed (fun x member => committed x (List.mem_cons_of_mem _ member))]
            using counted.scopes { parent := .ofSegments f, element := c.element }
        rw [eel] at below
        exact absurd (Nat.lt_of_le_of_lt (Nat.le_trans base low) below) (Nat.lt_irrefl _)
    rw [ec]

/-- A renamed history key's segments: the renamed segments of a history key. -/
theorem renamed_cons (history : ScopeHistory s H) {y : ScopeOccurrenceId}
    (held : H y) {segment : ScopeSegment} {rest : List ScopeSegment}
    (renamed : renameScope (commitRenaming start log s) y = .ofSegments (segment :: rest)) :
    ∃ a b, y = .ofSegments (a :: b) ∧ renameSegment (commitRenaming start log s) a = segment ∧ Layered (a :: b) ∧
      renameScope (commitRenaming start log s) (.ofSegments b) = .ofSegments rest := by
  have yl := history.layered y held
  rw [renameScope_eq (renameBy_fixes _) yl, ScopeOccurrenceId.ofSegments_inj] at renamed
  obtain ⟨a, b, parts⟩ := List.map_eq_cons_iff.mp renamed
  obtain ⟨ys, ase, brest⟩ := parts
  rw [ys] at yl
  refine ⟨a, b, by rw [← ys, ScopeOccurrenceId.ofSegments_eta], ase, yl, ?_⟩
  rw [renameScope_eq (renameBy_fixes _) (by rw [ScopeOccurrenceId.ofSegments_segments]; exact yl.tail),
    ScopeOccurrenceId.ofSegments_segments, brest]

/-- A history key renamed is committed throughout, so layered. -/
theorem renamed_segments (history : ScopeHistory s H) :
    ∀ (segments : List ScopeSegment), H (.ofSegments segments) →
      ∀ c ∈ segments.map (renameSegment (commitRenaming start log s)), c.ordinal.isFresh = false
  | [], _, c, member => nomatch member
  | a :: b, held, c, member => by
    rcases List.mem_cons.mp member with rfl | later
    · exact renamed_committed history held
    · exact renamed_segments history b (history.closed a b held) c later

theorem layered_of_committed : ∀ {segments : List ScopeSegment}, (∀ c ∈ segments, c.ordinal.isFresh = false) →
    Layered segments
  | [], _ => trivial
  | _ :: _, committed => ⟨fun _ c member => committed c (List.mem_cons_of_mem _ member),
      layered_of_committed fun c member => committed c (List.mem_cons_of_mem _ member)⟩

/-- **The scope history across the commit.** A history of the settled state, renamed, is a history of the committed
one: the standing keys are the renamed ones, a renamed key's parent is a renamed key, a key committed before keeps its
ordinal below its standing parent's counter, which only rises, a fresh one took an ordinal below its slot's next ordinal,
to which the commit raises the counter, and no fresh key remains. -/
theorem compact_history {t : State} (ran : compact start log s = .ok t)
    (counted : CountersFrom start s) (history : ScopeHistory s H)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s) :
    ScopeHistory t (fun x => ∃ y, H y ∧ renameScope (commitRenaming start log s) y = x) where
  standing scope member := by
    have : scope.id ∈ standingKeys t := List.mem_map_of_mem (f := ScopeOccurrence.id) member
    rw [compact_scopes ran] at this
    obtain ⟨y, standing, same⟩ := List.mem_map.mp this
    exact ⟨y, history.standing_key standing, same⟩
  closed segment rest := fun ⟨y, held, renamed⟩ => by
    obtain ⟨a, b, parts⟩ := renamed_cons history held renamed
    obtain ⟨rfl, -, -, brest⟩ := parts
    exact ⟨_, history.closed a b held, brest⟩
  below segment rest n := fun ⟨y, held, renamed⟩ committed standing => by
    change n < t.scopeOrdinals.getD { parent := .ofSegments rest, element := segment.element } 0
    obtain ⟨a, b, parts⟩ := renamed_cons history held renamed
    obtain ⟨rfl, ase, al, brest⟩ := parts
    cases ha : a.ordinal with
    | committed k =>
      have sa : segment = a := by rw [← ase]; exact renameSegment_committed (renameBy_fixes _) (by rw [ha]; simp)
      have kn : k = n := by rw [sa, ha] at committed; exact Issue.committed.inj committed
      have ball : ∀ c ∈ b, c.ordinal.isFresh = false := al.1 (by rw [ha]; simp)
      have rb : rest = b := by
        rw [renameScope_eq (renameBy_fixes _) (by rw [ScopeOccurrenceId.ofSegments_segments]; exact al.tail),
          ScopeOccurrenceId.ofSegments_segments, map_committed (renameBy_fixes _) ball,
          ScopeOccurrenceId.ofSegments_inj] at brest
        exact brest.symm
      rw [rb] at standing ⊢
      change _ ∈ standingKeys t at standing
      rw [compact_scopes ran] at standing
      obtain ⟨z, zs, zr⟩ := List.mem_map.mp standing
      have zeq := rename_onto history counted parents b (history.closed a b held) ball z zs zr
      have lt := history.below a b k held ha (zeq ▸ zs)
      rw [sa, ← kn]
      exact Nat.lt_of_lt_of_le lt (compact_counter ran _)
    | fresh unit index =>
      obtain ⟨m, next, parts⟩ := fresh_head (start := start) (log := log) history held ha
      obtain ⟨got, advanced, _, high⟩ := parts
      have mn : m = n := by
        rw [← ase] at committed
        exact Issue.committed.inj (got.symm.trans committed)
      have reach := compact_reach ran advanced (by rw [brest]; exact standing)
      have el : segment.element = a.element := by rw [← ase]; rfl
      simp only [brest] at reach
      rw [el, ← mn]
      exact Nat.lt_of_lt_of_le high reach
  layered x := fun ⟨y, held, renamed⟩ => by
    rw [← renamed, renameScope_eq (renameBy_fixes _) (history.layered y held), ScopeOccurrenceId.ofSegments_segments]
    exact layered_of_committed (renamed_segments history y.segments (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held))
  tabled segment rest unit index := fun ⟨y, held, renamed⟩ fresh => by
    obtain ⟨a, b, parts⟩ := renamed_cons history held renamed
    obtain ⟨rfl, ase, -, -⟩ := parts
    have committed := renamed_committed (start := start) (log := log) history held
    rw [ase, fresh] at committed
    simp at committed

/-- A renamed history key is committed: it has no fresh head. -/
theorem renamed_fresh (history : ScopeHistory s H) {x : ScopeOccurrenceId} (held : H x) :
    (renameScope (commitRenaming start log s) x).fresh = false := by
  rw [renameScope_eq (renameBy_fixes _) (history.layered x held)]
  exact fresh_of_committed (renamed_segments history x.segments (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held))

/-- A key that is not fresh and layered is committed throughout, so the renaming keeps it. -/
theorem renameScope_committed (history : ScopeHistory s H) {x : ScopeOccurrenceId} (held : H x) (committed : x.fresh = false) :
    renameScope (commitRenaming start log s) x = x ∧ ∀ c ∈ x.segments, c.ordinal.isFresh = false := by
  have all : ∀ c ∈ x.segments, c.ordinal.isFresh = false := by
    have layered := history.layered x held
    rcases hx : x.segments with _ | ⟨head, rest⟩
    · intro c member; nomatch member
    · rw [hx] at layered
      have top : head.ordinal.isFresh = false := by
        rw [← ScopeOccurrenceId.ofSegments_eta x, hx, fresh_cons] at committed; exact committed
      intro c member
      rcases List.mem_cons.mp member with rfl | above
      · exact top
      · exact layered.1 top c above
  refine ⟨?_, all⟩
  rw [renameScope_eq (renameBy_fixes _) (history.layered x held), map_committed (renameBy_fixes _) all,
    ScopeOccurrenceId.ofSegments_eta]

end History

/-! ## The occurrence and item clauses across the commit -/

/-- A fresh issue the table holds is renamed to a committed one; a committed one stays. -/
theorem renamed_issue {start : State} {log : RunLog} {s : State} {issue : Issue}
    (tabled : ∀ unit index, issue = .fresh unit index → ∃ slot, s.issued[Issue.fresh unit index]? = some slot) :
    ∃ n, commitRenaming start log s issue = .committed n := by
  cases issue with
  | committed n => exact ⟨n, by simp⟩
  | fresh unit index =>
    obtain ⟨slot, held⟩ := tabled unit index rfl
    obtain ⟨n, _, got, _⟩ := assign_took (start := start) (log := log) held
    exact ⟨n, by simp [commitRenaming, renameBy_fresh, got]⟩

/-- **The occurrence clause across the commit.** -/
theorem compact_occurrenceIssued {start : State} {log : RunLog} {s t : State} (ran : compact start log s = .ok t)
    (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s)
    {id : OccurrenceId} (issued : OccurrenceIssued s id) :
    OccurrenceIssued t (renameId (commitRenaming start log s) id) := by
  rw [renameId_eq]
  obtain ⟨⟨H, history, held⟩, owner, below, tabled⟩ := issued
  refine ⟨⟨_, compact_history ran counted history parents, id.scope, held, rfl⟩, ?_, ?_, ?_⟩
  · exact fun _ _ => renamed_fresh history held
  · intro n renamed standing
    change n < t.occurrenceOrdinals.getD { parent := renameScope (commitRenaming start log s) id.scope, element := id.element } 0
    cases ho : id.ordinal with
    | committed k =>
      have kn : k = n := by
        change commitRenaming start log s id.ordinal = _ at renamed
        rw [ho, commitRenaming_committed] at renamed
        exact Issue.committed.inj renamed
      obtain ⟨same, all⟩ := renameScope_committed (start := start) (log := log) history held (owner k ho)
      change renameScope (commitRenaming start log s) id.scope ∈ standingKeys t at standing
      rw [same] at standing ⊢
      rw [compact_scopes ran] at standing
      obtain ⟨z, zs, zr⟩ := List.mem_map.mp standing
      have zeq := rename_onto (start := start) (log := log) history counted parents id.scope.segments
        (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held) all z zs (by rw [zr, ScopeOccurrenceId.ofSegments_eta])
      rw [ScopeOccurrenceId.ofSegments_eta] at zeq
      have lt := below k ho (zeq ▸ zs)
      rw [← kn]
      exact Nat.lt_of_lt_of_le lt (compact_occurrence_counter ran _)
    | fresh unit index =>
      obtain ⟨m, next, parts⟩ := assign_took (start := start) (log := log) (tabled unit index ho)
      obtain ⟨got, advanced, _, high⟩ := parts
      have mn : m = n := by
        change commitRenaming start log s id.ordinal = _ at renamed
        rw [ho] at renamed
        simp [commitRenaming, renameBy_fresh, got] at renamed
        exact renamed
      exact mn ▸ Nat.lt_of_lt_of_le high (compact_reach_occurrence ran advanced standing)
  · intro unit index fresh
    obtain ⟨n, committed⟩ := renamed_issue (start := start) (log := log) (s := s) (issue := id.ordinal)
      fun unit index same => ⟨_, tabled unit index same⟩
    change commitRenaming start log s id.ordinal = _ at fresh
    rw [committed] at fresh
    cases fresh

/-- **The item clause across the commit.** -/
theorem compact_itemIssued {start : State} {log : RunLog} {s t : State} (ran : compact start log s = .ok t)
    (occurrences : ∀ occurrence ∈ s.occurrences, OccurrenceIssued s occurrence.id)
    (owned : ∀ item ∈ itemList s.openItems, ∃ occurrence ∈ s.occurrences, occurrence.id = item.id.occurrence)
    (issued : ∀ item ∈ itemList s.openItems, ItemIssued s item.id) :
    ∀ item ∈ itemList t.openItems, ItemIssued t item.id := by
  intro item member
  obtain ⟨old, inside, same⟩ := compact_items ran member
  rw [same, renameItemKey_eq]
  obtain ⟨occurrence, present, owner⟩ := owned old inside
  obtain ⟨⟨H, history, held⟩, _, _, occurrenceTabled⟩ := owner ▸ occurrences occurrence present
  obtain ⟨committedOwner, below, tabled⟩ := issued old inside
  have renamedOrdinal := renamed_issue (start := start) (log := log) (s := s) (issue := old.id.occurrence.ordinal)
    fun unit index same => ⟨_, occurrenceTabled unit index same⟩
  refine ⟨fun _ _ => ?_, fun present' n renamed => ?_, fun unit index fresh => ?_⟩
  · obtain ⟨m, committed⟩ := renamedOrdinal
    change (renameId (commitRenaming start log s) old.id.occurrence).fresh = false
    rw [renameId_eq, OccurrenceId.fresh_eq]
    simp only
    rw [committed, renamed_fresh history held]
    simp
  · change n < t.itemOrdinals.getD (renameId (commitRenaming start log s) old.id.occurrence) 0
    change commitRenaming start log s old.id.ordinal = _ at renamed
    cases ho : old.id.ordinal with
    | committed k =>
      rw [ho, commitRenaming_committed] at renamed
      have kn : k = n := Issue.committed.inj renamed
      have fresh := committedOwner k ho
      rw [OccurrenceId.fresh_eq, Bool.or_eq_false_iff] at fresh
      obtain ⟨scopeSame, _⟩ := renameScope_committed (start := start) (log := log) history held fresh.2
      have kept : renameId (commitRenaming start log s) old.id.occurrence = old.id.occurrence := by
        cases hm : old.id.occurrence.ordinal with
        | committed m => exact renameId_keep (renameBy_fixes _) scopeSame hm
        | fresh => have := fresh.1; rw [hm] at this; simp at this
      rw [kept, ← kn]
      exact Nat.lt_of_lt_of_le (below ⟨occurrence, present, owner⟩ k ho) (compact_item_counter ran _)
    | fresh unit index =>
      obtain ⟨m, next, parts⟩ := assign_took (start := start) (log := log) (tabled unit index ho)
      obtain ⟨got, advanced, _, high⟩ := parts
      rw [ho] at renamed
      have mn : m = n := by simp [commitRenaming, renameBy_fresh, got] at renamed; exact renamed
      exact mn ▸ Nat.lt_of_lt_of_le high (compact_reach_item ran advanced present')
  · obtain ⟨n, committed⟩ := renamed_issue (start := start) (log := log) (s := s) (issue := old.id.ordinal)
      fun unit index same => ⟨_, tabled unit index same⟩
    change commitRenaming start log s old.id.ordinal = _ at fresh
    rw [committed] at fresh
    cases fresh

/-- **`compacts_issued`: the counter class across the commit** (DC12). Every key a committed state holds was issued:
the `IssuedBelow` clauses hold after the compaction of a settled state they held in. -/
theorem compacts_issued {start : State} {log : RunLog} {s t : State} (ran : compact start log s = .ok t)
    (counted : CountersFrom start s) (issued : IssuedBelow s)
    (owned : ∀ item ∈ itemList s.openItems, ∃ occurrence ∈ s.occurrences, occurrence.id = item.id.occurrence)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s) :
    IssuedBelow t where
  occurrences occurrence member := by
    rw [compact_occurrences ran] at member
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    exact compact_occurrenceIssued ran counted parents (issued.occurrences old inside)
  items := compact_itemIssued ran issued.occurrences owned issued.items
  scopes scope member := by
    have : scope.id ∈ standingKeys t := List.mem_map_of_mem (f := ScopeOccurrence.id) member
    rw [compact_scopes ran] at this
    obtain ⟨y, standing, same⟩ := List.mem_map.mp this
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp standing
    obtain ⟨H, history, held⟩ := issued.scopes old inside
    exact ⟨_, compact_history ran counted history parents, old.id, held, same⟩

/-! ## The renaming is injective on standing keys -/

/-- **The renaming is injective between history keys and standing keys**: committed keys keep their ordinals, a fresh
key takes one at or above its slot's counter, which every committed sibling under a standing parent is below, and two
fresh keys of one slot take different ordinals (`assign_apart`). Two keys neither of which stands may rename alike: a
parent removed in the closure takes its counters with it, so its fresh children's base is 0 (`slotBase`). -/
theorem rename_inj {start : State} {log : RunLog} {s : State} {H : ScopeOccurrenceId → Prop} (history : ScopeHistory s H)
    (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s) :
    ∀ (segments : List ScopeSegment) (z : ScopeOccurrenceId), H (.ofSegments segments) → z ∈ standingKeys s →
      renameScope (commitRenaming start log s) (.ofSegments segments) = renameScope (commitRenaming start log s) z →
      ScopeOccurrenceId.ofSegments segments = z
  | [], z, _, zs, renamed => by
    rw [renameScope_eq (renameBy_fixes _) (by simp [Layered]), renameScope_eq (renameBy_fixes _)
      (history.layered z (history.standing_key zs)), ScopeOccurrenceId.ofSegments_inj,
      ScopeOccurrenceId.ofSegments_segments] at renamed
    have : z.segments = [] := List.map_eq_nil_iff.mp renamed.symm
    rw [← ScopeOccurrenceId.ofSegments_eta z, this]
  | c :: d, z, cheld, zs, renamed => by
    have cl := history.layered _ cheld
    rw [ScopeOccurrenceId.ofSegments_segments] at cl
    rw [renameScope_eq (renameBy_fixes _) (by rw [ScopeOccurrenceId.ofSegments_segments]; exact cl),
      renameScope_eq (renameBy_fixes _) (history.layered z (history.standing_key zs)), ScopeOccurrenceId.ofSegments_inj,
      ScopeOccurrenceId.ofSegments_segments] at renamed
    obtain ⟨c', d', parts⟩ := List.map_eq_cons_iff.mp renamed.symm
    obtain ⟨zseg, cc, dd⟩ := parts
    have zeq : z = .ofSegments (c' :: d') := by rw [← zseg, ScopeOccurrenceId.ofSegments_eta]
    have zheld : H (.ofSegments (c' :: d')) := zeq ▸ history.standing_key zs
    have d'stand := parents c' d' (zeq ▸ zs)
    have dl : Layered d' := by
      have := history.layered _ zheld; rw [ScopeOccurrenceId.ofSegments_segments] at this; exact this.tail
    have parentSame := rename_inj history counted parents d (.ofSegments d') (history.closed c d cheld) d'stand (by
      rw [renameScope_eq (renameBy_fixes _) (by rw [ScopeOccurrenceId.ofSegments_segments]; exact cl.tail),
        renameScope_eq (renameBy_fixes _) (by rw [ScopeOccurrenceId.ofSegments_segments]; exact dl),
        ScopeOccurrenceId.ofSegments_segments, ScopeOccurrenceId.ofSegments_segments, dd])
    have dd' : d = d' := ScopeOccurrenceId.ofSegments_inj.mp parentSame
    subst dd'
    have dstand := d'stand
    have elements : c'.element = c.element := by
      have := congrArg ScopeSegment.element cc; simpa [renameSegment] using this
    have ordinals : commitRenaming start log s c'.ordinal = commitRenaming start log s c.ordinal := by
      have := congrArg ScopeSegment.ordinal cc; simpa [renameSegment] using this
    -- A committed key against a fresh one of the same slot: the fresh one's ordinal is at or above the counter, which
    -- the committed one is below.
    have mixed : ∀ (x y : ScopeSegment) {k : Nat} {u : UnitKey} {i : Nat}, H (.ofSegments (x :: d)) →
        H (.ofSegments (y :: d)) → x.element = y.element → x.ordinal = .committed k → y.ordinal = .fresh u i →
        commitRenaming start log s x.ordinal = commitRenaming start log s y.ordinal → False := by
      intro x y k u i xheld yheld el xk yf same
      obtain ⟨m, _, parts⟩ := fresh_head (start := start) (log := log) history yheld yf
      obtain ⟨got, _, low, _⟩ := parts
      have xl := history.layered _ xheld
      rw [ScopeOccurrenceId.ofSegments_segments] at xl
      have committedParent := xl.1 (by rw [xk]; simp)
      have base : s.scopeOrdinals.getD { parent := .ofSegments d, element := y.element } 0 ≤
          slotBase start (.scope { parent := .ofSegments d, element := y.element }) := by
        simpa [slotBase_eq, fresh_of_committed committedParent]
          using counted.scopes { parent := .ofSegments d, element := y.element }
      have lt := history.below x d k xheld xk dstand
      rw [xk, got] at same
      have km : k = m := Issue.committed.inj (by simpa [commitRenaming, renameBy_committed, renameBy_fresh] using same)
      have low := Nat.le_trans base low
      rw [← el, ← km] at low
      exact Nat.lt_irrefl _ (Nat.lt_of_le_of_lt low lt)
    have segments : c = c' := by
      obtain ⟨element, ordinal⟩ := c
      obtain ⟨element', ordinal'⟩ := c'
      simp only at elements ordinals
      subst elements
      congr 1
      cases ordinal with
      | committed k =>
        cases ordinal' with
        | committed k' => simpa [commitRenaming, renameBy_committed, renameBy_fresh] using ordinals.symm
        | fresh u i => exact (mixed _ _ cheld zheld rfl rfl rfl ordinals.symm).elim
      | fresh u i =>
        cases ordinal' with
        | committed k' => exact (mixed _ _ zheld cheld rfl rfl rfl ordinals).elim
        | fresh u' i' =>
          have one := history.tabled _ d u i cheld rfl
          have two := history.tabled _ d u' i' zheld rfl
          obtain ⟨n, _, got, _⟩ := assign_took (start := start) (log := log) one
          obtain ⟨n', _, got', _⟩ := assign_took (start := start) (log := log) two
          have equal : n' = n := by
            simpa [commitRenaming, renameBy_committed, renameBy_fresh, got, got'] using ordinals
          exact assign_apart (start := start) (log := log) one two (by rw [got, got', equal])
    rw [zeq, segments]

/-- **`Distinct.scopes` across the commit.** -/
theorem compact_scopesDistinct {start : State} {log : RunLog} {s t : State} (ran : compact start log s = .ok t)
    (counted : CountersFrom start s) (historic : Historic s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s)
    (distinct : (scopeIds s).Nodup) : (scopeIds t).Nodup := by
  obtain ⟨H, history⟩ := historic
  change (standingKeys t).Nodup
  rw [compact_scopes ran]
  unfold List.Nodup
  rw [List.pairwise_map]
  refine distinct.imp_of_mem fun {x y} xs ys apart same => apart ?_
  have := rename_inj (start := start) (log := log) history counted parents x.segments y
    (by rw [ScopeOccurrenceId.ofSegments_eta]; exact history.standing_key xs) ys
    (by rw [ScopeOccurrenceId.ofSegments_eta]; exact same)
  rwa [ScopeOccurrenceId.ofSegments_eta] at this

/-! ## Occurrence keys across the commit -/

/-- **The renaming is injective on the keys of occurrences whose scope occurrences stand**: their scope occurrence keys
rename apart (`rename_inj`), a committed ordinal stays below its counter, which a fresh one is renamed at or above, and
two fresh ones of one slot take different ordinals (`assign_apart`). -/
theorem renameId_inj {start : State} {log : RunLog} {s : State} {H : ScopeOccurrenceId → Prop} (history : ScopeHistory s H)
    (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s)
    {x y : OccurrenceId} (xi : OrdinalIssued s x) (yi : OrdinalIssued s y) (xs : x.scope ∈ standingKeys s)
    (ys : y.scope ∈ standingKeys s) (same : renameId (commitRenaming start log s) x = renameId (commitRenaming start log s) y) :
    x = y := by
  rw [renameId_eq, renameId_eq] at same
  have scopes : x.scope = y.scope := by
    have := rename_inj (start := start) (log := log) history counted parents x.scope.segments y.scope
      (by rw [ScopeOccurrenceId.ofSegments_eta]; exact history.standing_key xs) ys
      (by rw [ScopeOccurrenceId.ofSegments_eta]; simpa using congrArg OccurrenceId.scope same)
    rwa [ScopeOccurrenceId.ofSegments_eta] at this
  have elements : x.element = y.element := by simpa using congrArg OccurrenceId.element same
  have ordinals : commitRenaming start log s x.ordinal = commitRenaming start log s y.ordinal := by
    simpa using congrArg OccurrenceId.ordinal same
  -- A committed ordinal against a fresh one of the same slot: the fresh one is renamed at or above the counter, which
  -- the committed one is below.
  have mixed : ∀ (a b : OccurrenceId) {k : Nat} {u : UnitKey} {i : Nat}, OrdinalIssued s a → OrdinalIssued s b →
      a.scope ∈ standingKeys s → a.scope = b.scope → a.element = b.element → a.ordinal = .committed k →
      b.ordinal = .fresh u i → commitRenaming start log s a.ordinal = commitRenaming start log s b.ordinal → False := by
    intro a b k u i ai bi as scope element ak bf renamed
    obtain ⟨m, _, parts⟩ := assign_took (start := start) (log := log) (bi.2.2 u i bf)
    obtain ⟨got, _, low, _⟩ := parts
    have base : s.occurrenceOrdinals.getD { parent := b.scope, element := b.element } 0 ≤
        slotBase start (.occurrence { parent := b.scope, element := b.element }) := by
      simpa [slotBase_eq, ← scope, ai.1 k ak] using counted.occurrences { parent := b.scope, element := b.element }
    have lt := ai.2.1 k ak as
    rw [ak, bf, commitRenaming_committed] at renamed
    have km : k = m := Issue.committed.inj (by simpa [commitRenaming, renameBy_fresh, got] using renamed)
    have low := Nat.le_trans base low
    rw [← scope, ← element, ← km] at low
    exact Nat.lt_irrefl _ (Nat.lt_of_le_of_lt low lt)
  obtain ⟨xscope, xelement, xordinal⟩ := x
  obtain ⟨yscope, yelement, yordinal⟩ := y
  simp only at scopes elements ordinals xs ys
  subst scopes elements
  congr 1
  cases xordinal with
  | committed k =>
    cases yordinal with
    | committed k' => simpa using ordinals
    | fresh u i => exact (mixed _ _ xi yi xs rfl rfl rfl rfl ordinals).elim
  | fresh u i =>
    cases yordinal with
    | committed k' => exact (mixed _ _ yi xi ys rfl rfl rfl rfl ordinals.symm).elim
    | fresh u' i' =>
      have one := xi.2.2 u i rfl
      have two := yi.2.2 u' i' rfl
      obtain ⟨n, _, got, _⟩ := assign_took (start := start) (log := log) one
      obtain ⟨n', _, got', _⟩ := assign_took (start := start) (log := log) two
      have equal : n = n' := by simpa [commitRenaming, renameBy_fresh, got, got'] using ordinals
      exact assign_apart (start := start) (log := log) one two (by rw [got, got', equal])

/-! ## Membership clauses across the commit -/

/-- **`ItemRoles` across the commit**: an item and an occurrence of the committed state that share a key are an item and
an occurrence of the settled state renamed, whose keys rename apart (`renameId_inj`). -/
theorem compact_itemRoles {program : Program} {start : State} {log : RunLog} {s t : State} (ran : compact start log s = .ok t)
    (counted : CountersFrom start s)
    (formed : WellFormed program s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s)
    (issuedHere : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) : ItemRoles t := by
  obtain ⟨H, history⟩ : Historic s := by
    obtain ⟨scope, member, -⟩ := List.mem_map.mp formed.rooted.1
    obtain ⟨H, history, _⟩ := formed.issued.scopes scope member
    exact ⟨H, history⟩
  intro item member occurrence present same
  obtain ⟨old, inside, renamed⟩ := compact_items ran member
  rw [compact_occurrences ran] at present
  obtain ⟨o, oin, rfl⟩ := List.mem_map.mp present
  obtain ⟨owner, ownerIn, parts⟩ := formed.owned.itemOccurrences old inside
  obtain ⟨ownerId, -, -⟩ := parts
  have key : o.id = old.id.occurrence := by
    rw [← ownerId]
    refine renameId_inj (start := start) (log := log) history counted parents (formed.issued.occurrences o oin).2
      (formed.issued.occurrences owner ownerIn).2 (issuedHere o oin ▸ formed.owned.occurrenceScopes o oin)
      (issuedHere owner ownerIn ▸ formed.owned.occurrenceScopes owner ownerIn) ?_
    rw [ownerId]
    simpa [renamed, renameItemKey_eq] using same
  exact formed.itemRoles old inside o oin key

end Kernel.Laws.Step
