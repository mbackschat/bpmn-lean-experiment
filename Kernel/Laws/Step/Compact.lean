module

public import Kernel.Laws.Step.Commit
public import Kernel.Laws.Step.Assign
public import Kernel.Laws.State.Transitions
import Kernel.Laws.Step.Order

/-! # Laws of the step function: the invariant's clauses across compaction at commit (DC12)

What `Kernel.Step.compact` keeps of `Laws.State.WellFormed`, clause by clause, from its mechanics
(`Kernel.Laws.Step.Commit`): a history of the settled state, renamed, is one of the committed state
(`compact_history`), since the renaming is injective onto committed history keys (`rename_onto`); the counter clauses of
`IssuedBelow` hold after the commit (`compacts_issued`); and the renaming is injective on standing keys (`rename_inj`), so
the re-keyed scope map keeps every scope occurrence record (`compact_scopeRecord_mem`). Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

/-! ## The scope occurrence records a commit leaves -/

/-- Every scope occurrence record a commit leaves is one of the settled state, renamed. -/
theorem compact_scopeRecord_of {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    {entry : ScopeOccurrence} (member : entry ∈ t.scopes) :
    ∃ old ∈ s.scopes, entry = renamedScope (commitRenaming schedule start log s) old := by
  rcases compact_cases ran with ⟨empty, kept⟩ | ⟨_, rfl⟩
  · rw [kept] at member
    have same := commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty
    have ids : renameId (commitRenaming schedule start log s) = id := funext (renameId_id same)
    exact ⟨entry, member, by cases entry; simp [renamedScope, ids, renameScope_id same, same]⟩
  change entry ∈ (advanceCounters _ _ _).scopes at member
  rw [(advance_raised _ _ _).scopes] at member
  exact renameState_scope_of member

/-- A commit that renames no two standing keys alike keeps every scope occurrence record of the settled state, renamed:
the scope map re-keys every record, so a record stands only if no other one is renamed onto its key. -/
theorem compact_scopeRecord_mem {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    (distinct : (standingKeys s).Nodup)
    (apart : ∀ x ∈ standingKeys s, ∀ y ∈ standingKeys s,
      renameScope (commitRenaming schedule start log s) x = renameScope (commitRenaming schedule start log s) y → x = y)
    {old : ScopeOccurrence} (member : old ∈ s.scopes) : renamedScope (commitRenaming schedule start log s) old ∈ t.scopes := by
  rcases compact_cases ran with ⟨empty, kept⟩ | ⟨_, rfl⟩
  · rw [kept]
    have same := commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty
    have ids : renameId (commitRenaming schedule start log s) = id := funext (renameId_id same)
    have fixed : renamedScope (commitRenaming schedule start log s) old = old := by
      cases old; simp [renamedScope, ids, renameScope_id same, same]
    rwa [fixed]
  change _ ∈ (advanceCounters _ _ _).scopes
  rw [(advance_raised _ _ _).scopes]
  exact renameState_scope_mem distinct apart member

/-- The scope occurrences a commit leaves carry distinct keys: the re-keyed map holds one record per key. -/
theorem compact_scopesNodup {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    (distinct : (standingKeys s).Nodup) : (standingKeys t).Nodup := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact distinct
  have frame := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [frame]
  exact scopeList_nodup (renameState_scopesKeyed _ _ _ _)

/-- The scope map a commit leaves is keyed. -/
theorem compact_scopesKeyed {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    (keyed : ScopesKeyed s.scopeMap) : ScopesKeyed t.scopeMap := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact keyed
  have frame := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [frame]
  exact renameState_scopesKeyed _ _ _ _

/-! ## The scope history across the commit -/

section History

variable {start : State} {log : RunLog} {s : State} {H : ScopeOccurrenceId → Prop}

/-- A fresh head segment of a history key took a committed ordinal at or above its slot's base and below its slot's
next ordinal. -/
theorem fresh_head (history : ScopeHistory s H) {segment : ScopeSegment} {rest : List ScopeSegment}
    (held : H (.ofSegments (segment :: rest))) {unit : UnitKey} {index : Nat} (fresh : segment.ordinal = .fresh unit index) :
    ∃ n next, commitRenaming schedule start log s segment.ordinal = .committed n ∧
      (assign schedule start log s).2[ClaimSlot.scope { parent := .ofSegments rest, element := segment.element }]? = some next ∧
      slotBase start (.scope { parent := .ofSegments rest, element := segment.element }) ≤ n ∧ n < next := by
  obtain ⟨n, next, parts⟩ := assign_took (schedule := schedule) (start := start) (log := log) (history.tabled segment rest unit index held fresh)
  obtain ⟨got, advanced, low, high⟩ := parts
  refine ⟨n, next, ?_, advanced, low, high⟩
  rw [fresh]
  simp [commitRenaming, renameBy_fresh, got]

theorem renamed_committed (history : ScopeHistory s H) {segment : ScopeSegment} {rest : List ScopeSegment}
    (held : H (.ofSegments (segment :: rest))) : (renameSegment (commitRenaming schedule start log s) segment).ordinal.isFresh = false := by
  cases fresh : segment.ordinal with
  | committed n => simp [renameSegment, fresh, commitRenaming, renameBy_committed]
  | fresh unit index =>
    obtain ⟨n, _, renamed, _⟩ := fresh_head (schedule := schedule) (start := start) (log := log) history held fresh
    simp [renameSegment, renamed]

/-- **The renaming is injective onto committed history keys**: a standing key renamed to a committed key of the history
is that key, since a fresh issue takes an ordinal at or above its slot's counter, which every committed key below a
standing parent is below. -/
theorem rename_onto (history : ScopeHistory s H) (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s) :
    ∀ (segments : List ScopeSegment), H (.ofSegments segments) → (∀ c ∈ segments, c.ordinal.isFresh = false) →
      ∀ z ∈ standingKeys s, renameScope (commitRenaming schedule start log s) z = .ofSegments segments → z = .ofSegments segments
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
    have dren : renameScope (commitRenaming schedule start log s) (.ofSegments d) = .ofSegments f := by
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
        obtain ⟨m, _, parts⟩ := fresh_head (schedule := schedule) (start := start) (log := log) history (zeq ▸ history.standing_key standing) hc
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
    (renamed : renameScope (commitRenaming schedule start log s) y = .ofSegments (segment :: rest)) :
    ∃ a b, y = .ofSegments (a :: b) ∧ renameSegment (commitRenaming schedule start log s) a = segment ∧ Layered (a :: b) ∧
      renameScope (commitRenaming schedule start log s) (.ofSegments b) = .ofSegments rest := by
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
      ∀ c ∈ segments.map (renameSegment (commitRenaming schedule start log s)), c.ordinal.isFresh = false
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
theorem compact_history {t : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (history : ScopeHistory s H)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s) :
    ScopeHistory t (fun x => ∃ y, H y ∧ renameScope (commitRenaming schedule start log s) y = x) where
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
      obtain ⟨m, next, parts⟩ := fresh_head (schedule := schedule) (start := start) (log := log) history held ha
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
    have committed := renamed_committed (schedule := schedule) (start := start) (log := log) history held
    rw [ase, fresh] at committed
    simp at committed

/-- A renamed history key is committed: it has no fresh head. -/
theorem renamed_fresh (history : ScopeHistory s H) {x : ScopeOccurrenceId} (held : H x) :
    (renameScope (commitRenaming schedule start log s) x).fresh = false := by
  rw [renameScope_eq (renameBy_fixes _) (history.layered x held)]
  exact fresh_of_committed (renamed_segments history x.segments (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held))

/-- A key that is not fresh and layered is committed throughout, so the renaming keeps it. -/
theorem renameScope_committed (history : ScopeHistory s H) {x : ScopeOccurrenceId} (held : H x) (committed : x.fresh = false) :
    renameScope (commitRenaming schedule start log s) x = x ∧ ∀ c ∈ x.segments, c.ordinal.isFresh = false := by
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
    ∃ n, commitRenaming schedule start log s issue = .committed n := by
  cases issue with
  | committed n => exact ⟨n, by simp⟩
  | fresh unit index =>
    obtain ⟨slot, held⟩ := tabled unit index rfl
    obtain ⟨n, _, got, _⟩ := assign_took (schedule := schedule) (start := start) (log := log) held
    exact ⟨n, by simp [commitRenaming, renameBy_fresh, got]⟩

/-- **The occurrence clause across the commit.** -/
theorem compact_occurrenceIssued {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s)
    {id : OccurrenceId} (issued : OccurrenceIssued s id) :
    OccurrenceIssued t (renameId (commitRenaming schedule start log s) id) := by
  rw [renameId_eq]
  obtain ⟨⟨H, history, held⟩, owner, below, tabled⟩ := issued
  refine ⟨⟨_, compact_history ran counted history parents, id.scope, held, rfl⟩, ?_, ?_, ?_⟩
  · exact fun _ _ => renamed_fresh history held
  · intro n renamed standing
    change n < t.occurrenceOrdinals.getD { parent := renameScope (commitRenaming schedule start log s) id.scope, element := id.element } 0
    cases ho : id.ordinal with
    | committed k =>
      have kn : k = n := by
        change commitRenaming schedule start log s id.ordinal = _ at renamed
        rw [ho, commitRenaming_committed] at renamed
        exact Issue.committed.inj renamed
      obtain ⟨same, all⟩ := renameScope_committed (schedule := schedule) (start := start) (log := log) history held (owner k ho)
      change renameScope (commitRenaming schedule start log s) id.scope ∈ standingKeys t at standing
      rw [same] at standing ⊢
      rw [compact_scopes ran] at standing
      obtain ⟨z, zs, zr⟩ := List.mem_map.mp standing
      have zeq := rename_onto (schedule := schedule) (start := start) (log := log) history counted parents id.scope.segments
        (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held) all z zs (by rw [zr, ScopeOccurrenceId.ofSegments_eta])
      rw [ScopeOccurrenceId.ofSegments_eta] at zeq
      have lt := below k ho (zeq ▸ zs)
      rw [← kn]
      exact Nat.lt_of_lt_of_le lt (compact_occurrence_counter ran _)
    | fresh unit index =>
      obtain ⟨m, next, parts⟩ := assign_took (schedule := schedule) (start := start) (log := log) (tabled unit index ho)
      obtain ⟨got, advanced, _, high⟩ := parts
      have mn : m = n := by
        change commitRenaming schedule start log s id.ordinal = _ at renamed
        rw [ho] at renamed
        simp [commitRenaming, renameBy_fresh, got] at renamed
        exact renamed
      exact mn ▸ Nat.lt_of_lt_of_le high (compact_reach_occurrence ran advanced standing)
  · intro unit index fresh
    obtain ⟨n, committed⟩ := renamed_issue (schedule := schedule) (start := start) (log := log) (s := s) (issue := id.ordinal)
      fun unit index same => ⟨_, tabled unit index same⟩
    change commitRenaming schedule start log s id.ordinal = _ at fresh
    rw [committed] at fresh
    cases fresh

/-- **The item clause across the commit.** -/
theorem compact_itemIssued {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
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
  have renamedOrdinal := renamed_issue (schedule := schedule) (start := start) (log := log) (s := s) (issue := old.id.occurrence.ordinal)
    fun unit index same => ⟨_, occurrenceTabled unit index same⟩
  refine ⟨fun _ _ => ?_, fun present' n renamed => ?_, fun unit index fresh => ?_⟩
  · obtain ⟨m, committed⟩ := renamedOrdinal
    change (renameId (commitRenaming schedule start log s) old.id.occurrence).fresh = false
    rw [renameId_eq, OccurrenceId.fresh_eq]
    simp only
    rw [committed, renamed_fresh history held]
    simp
  · change n < t.itemOrdinals.getD (renameId (commitRenaming schedule start log s) old.id.occurrence) 0
    change commitRenaming schedule start log s old.id.ordinal = _ at renamed
    cases ho : old.id.ordinal with
    | committed k =>
      rw [ho, commitRenaming_committed] at renamed
      have kn : k = n := Issue.committed.inj renamed
      have fresh := committedOwner k ho
      rw [OccurrenceId.fresh_eq, Bool.or_eq_false_iff] at fresh
      obtain ⟨scopeSame, _⟩ := renameScope_committed (schedule := schedule) (start := start) (log := log) history held fresh.2
      have kept : renameId (commitRenaming schedule start log s) old.id.occurrence = old.id.occurrence := by
        cases hm : old.id.occurrence.ordinal with
        | committed m => exact renameId_keep (renameBy_fixes _) scopeSame hm
        | fresh => have := fresh.1; rw [hm] at this; simp at this
      rw [kept, ← kn]
      exact Nat.lt_of_lt_of_le (below ⟨occurrence, present, owner⟩ k ho) (compact_item_counter ran _)
    | fresh unit index =>
      obtain ⟨m, next, parts⟩ := assign_took (schedule := schedule) (start := start) (log := log) (tabled unit index ho)
      obtain ⟨got, advanced, _, high⟩ := parts
      rw [ho] at renamed
      have mn : m = n := by simp [commitRenaming, renameBy_fresh, got] at renamed; exact renamed
      exact mn ▸ Nat.lt_of_lt_of_le high (compact_reach_item ran advanced present')
  · obtain ⟨n, committed⟩ := renamed_issue (schedule := schedule) (start := start) (log := log) (s := s) (issue := old.id.ordinal)
      fun unit index same => ⟨_, tabled unit index same⟩
    change commitRenaming schedule start log s old.id.ordinal = _ at fresh
    rw [committed] at fresh
    cases fresh

/-- **`compacts_issued`: the counter class across the commit** (DC12). Every key a committed state holds was issued:
the `IssuedBelow` clauses hold after the compaction of a settled state they held in. -/
theorem compacts_issued {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
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
  positions scope member unit index fresh := by
    obtain ⟨old, inside, rfl⟩ := compact_scopeRecord_of ran member
    obtain ⟨n, renamed⟩ := renamed_issue (schedule := schedule) (start := start) (log := log) (s := s)
      fun unit index same => ⟨_, issued.positions old inside unit index same⟩
    simp only [renamed] at fresh
    cases fresh
  occurrencePositions occurrence member unit index fresh := by
    rw [compact_occurrences ran] at member
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    cases pending : old.position with
    | committed n => simp [pending] at fresh
    | fresh u i =>
      obtain ⟨slot, tabled⟩ := issued.occurrencePositions old inside u i pending
      obtain ⟨n, -, renamed, -⟩ := occurrencePosition_renamed (schedule := schedule) (start := start) (log := log) tabled
      simp [pending, renamed] at fresh

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
      renameScope (commitRenaming schedule start log s) (.ofSegments segments) = renameScope (commitRenaming schedule start log s) z →
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
    have ordinals : commitRenaming schedule start log s c'.ordinal = commitRenaming schedule start log s c.ordinal := by
      have := congrArg ScopeSegment.ordinal cc; simpa [renameSegment] using this
    -- A committed key against a fresh one of the same slot: the fresh one's ordinal is at or above the counter, which
    -- the committed one is below.
    have mixed : ∀ (x y : ScopeSegment) {k : Nat} {u : UnitKey} {i : Nat}, H (.ofSegments (x :: d)) →
        H (.ofSegments (y :: d)) → x.element = y.element → x.ordinal = .committed k → y.ordinal = .fresh u i →
        commitRenaming schedule start log s x.ordinal = commitRenaming schedule start log s y.ordinal → False := by
      intro x y k u i xheld yheld el xk yf same
      obtain ⟨m, _, parts⟩ := fresh_head (schedule := schedule) (start := start) (log := log) history yheld yf
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
          obtain ⟨n, _, got, _⟩ := assign_took (schedule := schedule) (start := start) (log := log) one
          obtain ⟨n', _, got', _⟩ := assign_took (schedule := schedule) (start := start) (log := log) two
          have equal : n' = n := by
            simpa [commitRenaming, renameBy_committed, renameBy_fresh, got, got'] using ordinals
          exact assign_apart (schedule := schedule) (start := start) (log := log) one two (by rw [got, got', equal])
    rw [zeq, segments]

/-! ## Occurrence keys across the commit -/

/-- **The renaming is injective on the keys of occurrences whose scope occurrences stand**: their scope occurrence keys
rename apart (`rename_inj`), a committed ordinal stays below its counter, which a fresh one is renamed at or above, and
two fresh ones of one slot take different ordinals (`assign_apart`). -/
theorem renameId_inj {start : State} {log : RunLog} {s : State} {H : ScopeOccurrenceId → Prop} (history : ScopeHistory s H)
    (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s)
    {x y : OccurrenceId} (xi : OrdinalIssued s x) (yi : OrdinalIssued s y) (xs : x.scope ∈ standingKeys s)
    (ys : y.scope ∈ standingKeys s) (same : renameId (commitRenaming schedule start log s) x = renameId (commitRenaming schedule start log s) y) :
    x = y := by
  rw [renameId_eq, renameId_eq] at same
  have scopes : x.scope = y.scope := by
    have := rename_inj (schedule := schedule) (start := start) (log := log) history counted parents x.scope.segments y.scope
      (by rw [ScopeOccurrenceId.ofSegments_eta]; exact history.standing_key xs) ys
      (by rw [ScopeOccurrenceId.ofSegments_eta]; simpa using congrArg OccurrenceId.scope same)
    rwa [ScopeOccurrenceId.ofSegments_eta] at this
  have elements : x.element = y.element := by simpa using congrArg OccurrenceId.element same
  have ordinals : commitRenaming schedule start log s x.ordinal = commitRenaming schedule start log s y.ordinal := by
    simpa using congrArg OccurrenceId.ordinal same
  -- A committed ordinal against a fresh one of the same slot: the fresh one is renamed at or above the counter, which
  -- the committed one is below.
  have mixed : ∀ (a b : OccurrenceId) {k : Nat} {u : UnitKey} {i : Nat}, OrdinalIssued s a → OrdinalIssued s b →
      a.scope ∈ standingKeys s → a.scope = b.scope → a.element = b.element → a.ordinal = .committed k →
      b.ordinal = .fresh u i → commitRenaming schedule start log s a.ordinal = commitRenaming schedule start log s b.ordinal → False := by
    intro a b k u i ai bi as scope element ak bf renamed
    obtain ⟨m, _, parts⟩ := assign_took (schedule := schedule) (start := start) (log := log) (bi.2.2 u i bf)
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
      obtain ⟨n, _, got, _⟩ := assign_took (schedule := schedule) (start := start) (log := log) one
      obtain ⟨n', _, got', _⟩ := assign_took (schedule := schedule) (start := start) (log := log) two
      have equal : n = n' := by simpa [commitRenaming, renameBy_fresh, got, got'] using ordinals
      exact assign_apart (schedule := schedule) (start := start) (log := log) one two (by rw [got, got', equal])

/-! ## Membership clauses across the commit -/

/-- **`ItemRoles` across the commit**: an item and an occurrence of the committed state that share a key are an item and
an occurrence of the settled state renamed, whose keys rename apart (`renameId_inj`). -/
theorem compact_itemRoles {program : Program} {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
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
    refine renameId_inj (schedule := schedule) (start := start) (log := log) history counted parents (formed.issued.occurrences o oin).2
      (formed.issued.occurrences owner ownerIn).2 (issuedHere o oin ▸ formed.owned.occurrenceScopes o oin)
      (issuedHere owner ownerIn ▸ formed.owned.occurrenceScopes owner ownerIn) ?_
    rw [ownerId]
    simpa [renamed, renameItemKey_eq] using same
  exact formed.itemRoles old inside o oin key

/-- An order position of a closure's state whose commit starts from `start`: a fresh issue the closure took in the
position slot, or a committed position below `start`'s position counter. The bound on committed positions is no
`WellFormed` clause: it is part of the order law's domain, not of the state's invariant. -/
def PositionIn (start s : State) : Issue → Prop
  | .committed ordinal => ordinal < start.nextOrder
  | .fresh unit index => s.issued[Issue.fresh unit index]? = some .position

/-- DC13's order law, stated: the commit numbers a closure's positions in the closure's position order under
`schedule` (`issuerOrder`), so two positions a body compared compare the same way once committed. It follows from
`issueOrder` being sorted by that order and from `assignStep` counting each slot up from `slotBase`, which is
`start.nextOrder` for positions, above every committed one in `PositionIn`'s domain. -/
def CompactionKeepsPositionOrder (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Prop :=
  ∀ p q, PositionIn start s p → PositionIn start s q →
    (Issue.notAfter (issuerOrder schedule log) p q = true ↔
      Issue.notAfter (issuerOrder schedule log) (commitRenaming schedule start log s p) (commitRenaming schedule start log s q) = true)

/-- An order position of an occurrence of a closure's state whose commit starts from `start`: a fresh occurrence
identity's issue in the issue table (`IssuedBelow.occurrencePositions`), or a committed position below `start`'s
position counter. -/
def OccurrencePositionIn (start s : State) : Issue → Prop
  | .committed ordinal => ordinal < start.nextOrder
  | .fresh unit index => ∃ slot, s.issued[Issue.fresh unit index]? = some (.occurrence slot)

/-- DC25's order law, stated as DC13's for occurrences: the commit numbers a closure's occurrence positions, which are
their identities' issues, in the closure's position order (`Step.positionsOf`), so the cancellation order within a scope
occurrence (`State.clearInside`) is the same before and after the commit. -/
def CompactionKeepsOccurrenceOrder (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Prop :=
  ∀ p q, OccurrencePositionIn start s p → OccurrencePositionIn start s q →
    (Issue.notAfter (issuerOrder schedule log) p q = true ↔
      Issue.notAfter (issuerOrder schedule log) (commitPositioning schedule start log s p)
        (commitPositioning schedule start log s q) = true)

/-! ## The commit keeps the position order (DC13) -/

section Positions

variable {base : ClaimSlot → Nat}

theorem assignStep_self (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) (claim : Issue × ClaimSlot) :
    (assignStep base acc claim).1[claim.1]? = some (acc.2.getD claim.2 (base claim.2)) := by
  rw [assignStep_fst]; exact Std.ExtTreeMap.getElem?_insert_self

theorem assignStep_other (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) (claim : Issue × ClaimSlot)
    {issue : Issue} (apart : claim.1 ≠ issue) : (assignStep base acc claim).1[issue]? = acc.1[issue]? := by
  rw [assignStep_fst, Std.ExtTreeMap.getElem?_insert]
  split
  · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same) apart
  · rfl

theorem assignStep_next (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) (claim : Issue × ClaimSlot) :
    (assignStep base acc claim).2.getD claim.2 (base claim.2) = acc.2.getD claim.2 (base claim.2) + 1 := by
  rw [Std.ExtTreeMap.getD_eq_getD_getElem?, assignStep_claim]; rfl

/-- No step lowers a slot's next ordinal. -/
theorem fold_getD : ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (slot : ClaimSlot), acc.2.getD slot (base slot) ≤ (claims.foldl (assignStep base) acc).2.getD slot (base slot)
  | [], _, _ => Nat.le_refl _
  | claim :: rest, acc, slot => by
    refine Nat.le_trans ?_ (fold_getD rest _ slot)
    rw [Std.ExtTreeMap.getD_eq_getD_getElem?, Std.ExtTreeMap.getD_eq_getD_getElem?]
    cases old : acc.2[slot]? with
    | some m =>
      obtain ⟨m', found, raised⟩ := assignStep_raises (base := base) claim old
      rw [found]; exact raised
    | none =>
      cases new : (assignStep base acc claim).2[slot]? with
      | none => exact Nat.le_refl _
      | some m' =>
        rcases assignStep_next_of new with ⟨rfl, rfl⟩ | ⟨rfl, rfl⟩ | kept
        · simp [Std.ExtTreeMap.getD_eq_getD_getElem?, old]
        · simp [Std.ExtTreeMap.getD_eq_getD_getElem?, old]
        · rw [old] at kept; cases kept

/-- The fold leaves the ordinal of an issue no claim names as it was. -/
theorem fold_value : ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (issue : Issue), issue ∉ claims.map (·.1) → (claims.foldl (assignStep base) acc).1[issue]? = acc.1[issue]?
  | [], _, _, _ => rfl
  | claim :: rest, acc, issue, absent => by
    simp only [List.map_cons, List.mem_cons, not_or] at absent
    rw [List.foldl_cons, fold_value rest _ issue absent.2, assignStep_other _ _ fun same => absent.1 same.symm]

/-- Two claims of one slot take increasing ordinals in the order the fold meets them, when no later claim repeats either
issue. -/
theorem fold_before (pre mid post : List (Issue × ClaimSlot)) (first second : Issue × ClaimSlot)
    (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) (slot : first.2 = second.2)
    (firstOut : first.1 ∉ (mid ++ second :: post).map (·.1)) (secondOut : second.1 ∉ post.map (·.1)) {n m : Nat}
    (atFirst : ((pre ++ first :: (mid ++ second :: post)).foldl (assignStep base) acc).1[first.1]? = some n)
    (atSecond : ((pre ++ first :: (mid ++ second :: post)).foldl (assignStep base) acc).1[second.1]? = some m) :
    n < m := by
  simp only [List.map_append, List.map_cons, List.mem_append, List.mem_cons, not_or] at firstOut
  obtain ⟨notMid, apart, notPost⟩ := firstOut
  rw [List.foldl_append, List.foldl_cons, List.foldl_append, List.foldl_cons] at atFirst atSecond
  rw [fold_value post _ first.1 notPost, assignStep_other _ _ fun same => apart same.symm,
    fold_value mid _ first.1 notMid, assignStep_self] at atFirst
  rw [fold_value post _ second.1 secondOut, assignStep_self] at atSecond
  obtain rfl := Option.some.inj atFirst
  obtain rfl := Option.some.inj atSecond
  rw [← slot]
  exact Nat.lt_of_lt_of_le (Nat.lt_succ_self _)
    (Nat.le_trans (Nat.le_of_eq (assignStep_next _ _).symm) (fold_getD mid _ first.2))

theorem nodup_absent {pre post : List (Issue × ClaimSlot)} {claim : Issue × ClaimSlot}
    (distinct : ((pre ++ claim :: post).map (·.1)).Nodup) : claim.1 ∉ post.map (·.1) ∧ (post.map (·.1)).Nodup := by
  rw [List.map_append, List.map_cons, List.nodup_append, List.nodup_cons] at distinct
  exact distinct.2.1

end Positions

/-- The closure's issues in commit order are sorted by the closure's position order. -/
theorem issueOrder_sorted (schedule : BranchSchedule) (log : RunLog) (s : State) :
    (issueOrder schedule log s).Pairwise fun a b => Issue.notAfter (issuerOrder schedule log) a.1 b.1 = true := by
  rw [issueOrder_eq]
  exact List.pairwise_mergeSort (le := fun a b : Issue × ClaimSlot => Issue.notAfter (issuerOrder schedule log) a.1 b.1)
    (fun _ _ _ => notAfter_trans) (fun a b => by
      rcases notAfter_total (units := issuerOrder schedule log) a.1 b.1 with h | h <;> simp [h]) _

/-- A fresh position takes an ordinal at or above the position counter of the state the closure started from. -/
theorem position_renamed {schedule : BranchSchedule} {start : State} {log : RunLog} {s : State} {unit : UnitKey}
    {index : Nat} (tabled : s.issued[Issue.fresh unit index]? = some .position) :
    ∃ n, (assign schedule start log s).1[Issue.fresh unit index]? = some n ∧
      commitRenaming schedule start log s (.fresh unit index) = .committed n ∧ start.nextOrder ≤ n := by
  obtain ⟨n, _, parts⟩ := assign_took (schedule := schedule) (start := start) (log := log) tabled
  obtain ⟨found, _, low, _⟩ := parts
  exact ⟨n, found, by simp [commitRenaming, renameBy_fresh, found], by simpa [slotBase_eq] using low⟩

/-- **DC13's order law.** The commit numbers the closure's positions in the closure's position order. -/
theorem compaction_keepsPositionOrder (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) :
    CompactionKeepsPositionOrder schedule start log s := by
  intro p q inP inQ
  match p, q, inP, inQ with
  | .committed _, .committed _, _, _ => simp
  | .committed a, .fresh _ _, below, tabled =>
    obtain ⟨n, -, renamed, low⟩ := position_renamed (schedule := schedule) (log := log) tabled
    simp only [PositionIn] at below
    rw [renamed, commitRenaming_committed, notAfter_committed_fresh, notAfter_committed, decide_eq_true_eq]
    exact iff_of_true rfl (by omega)
  | .fresh _ _, .committed b, tabled, below =>
    obtain ⟨n, -, renamed, low⟩ := position_renamed (schedule := schedule) (log := log) tabled
    simp only [PositionIn] at below
    rw [renamed, commitRenaming_committed, notAfter_fresh_committed, notAfter_committed, decide_eq_true_eq]
    simp only [Bool.false_eq_true, false_iff, Nat.not_le]
    omega
  | .fresh u i, .fresh v j, tabledP, tabledQ =>
    obtain ⟨n, foundP, renamedP, -⟩ := position_renamed (schedule := schedule) (log := log) tabledP
    obtain ⟨m, foundQ, renamedQ, -⟩ := position_renamed (schedule := schedule) (log := log) tabledQ
    rw [renamedP, renamedQ, notAfter_committed, decide_eq_true_eq]
    by_cases same : (Issue.fresh u i) = .fresh v j
    · rw [same] at foundP ⊢
      cases foundP.symm.trans foundQ
      exact iff_of_true ((notAfter_total _ _).elim id id) (Nat.le_refl _)
    have sorted := issueOrder_sorted schedule log s
    have nodup := issueOrder_nodup schedule log s
    have memQ := (issueOrder_mem (schedule := schedule) (log := log)).mpr (show s.issued[(Issue.fresh v j, ClaimSlot.position).1]? = some (Issue.fresh v j, ClaimSlot.position).2 from tabledQ)
    obtain ⟨S, T, split⟩ := List.mem_iff_append.mp
      ((issueOrder_mem (schedule := schedule) (log := log)).mpr (show s.issued[(Issue.fresh u i, ClaimSlot.position).1]? = some (Issue.fresh u i, ClaimSlot.position).2 from tabledP))
    rw [assign_eq, split] at foundP foundQ
    rw [split] at sorted nodup memQ
    rcases List.mem_append.mp memQ with inS | inT
    · obtain ⟨P, M, splitS⟩ := List.mem_iff_append.mp inS
      have qp : Issue.notAfter (issuerOrder schedule log) (.fresh v j) (.fresh u i) = true :=
        (List.pairwise_append.mp sorted).2.2 _ inS (Issue.fresh u i, ClaimSlot.position) (List.mem_cons_self ..)
      rw [splitS] at foundP foundQ nodup
      simp only [List.append_assoc, List.cons_append] at foundP foundQ nodup
      have outQ := nodup_absent nodup
      have lt := fold_before P M T (Issue.fresh v j, ClaimSlot.position)
        (Issue.fresh u i, ClaimSlot.position) (∅, ∅) rfl outQ.1 (nodup_absent outQ.2).1 foundQ foundP
      exact iff_of_false (fun pq => same (notAfter_antisymm (issuerOrder_tied schedule log) pq qp)) (by omega)
    · rcases List.mem_cons.mp inT with back | inT
      · exact absurd (congrArg Prod.fst back).symm same
      obtain ⟨M, P, splitT⟩ := List.mem_iff_append.mp inT
      have pq : Issue.notAfter (issuerOrder schedule log) (.fresh u i) (.fresh v j) = true :=
        (List.pairwise_cons.mp (List.pairwise_append.mp sorted).2.1).1 _ inT
      rw [splitT] at foundP foundQ nodup
      have outP := nodup_absent nodup
      have lt := fold_before S M P (Issue.fresh u i, ClaimSlot.position)
        (Issue.fresh v j, ClaimSlot.position) (∅, ∅) rfl outP.1 (nodup_absent outP.2).1 foundP foundQ
      exact iff_of_true pq (Nat.le_of_lt lt)


/-- **DC25's order law.** The commit numbers the closure's occurrence positions in the closure's position order. -/
theorem compaction_keepsOccurrenceOrder (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) :
    CompactionKeepsOccurrenceOrder schedule start log s := by
  intro p q inP inQ
  have kept : ∀ a, commitPositioning schedule start log s (.committed a) = .committed a := renameBy_committed _
  match p, q, inP, inQ with
  | .committed _, .committed _, _, _ => simp [kept]
  | .committed a, .fresh _ _, below, ⟨_, tabled⟩ =>
    obtain ⟨n, -, renamed, low⟩ := occurrencePosition_renamed (schedule := schedule) (log := log) tabled
    simp only [OccurrencePositionIn] at below
    rw [renamed, kept, notAfter_committed_fresh, notAfter_committed, decide_eq_true_eq]
    exact iff_of_true rfl (by omega)
  | .fresh _ _, .committed b, ⟨_, tabled⟩, below =>
    obtain ⟨n, -, renamed, low⟩ := occurrencePosition_renamed (schedule := schedule) (log := log) tabled
    simp only [OccurrencePositionIn] at below
    rw [renamed, kept, notAfter_fresh_committed, notAfter_committed, decide_eq_true_eq]
    simp only [Bool.false_eq_true, false_iff, Nat.not_le]
    omega
  | .fresh u i, .fresh v j, ⟨one, tabledP⟩, ⟨two, tabledQ⟩ =>
    obtain ⟨n, foundP, renamedP, -⟩ := occurrencePosition_renamed (schedule := schedule) (log := log) tabledP
    obtain ⟨m, foundQ, renamedQ, -⟩ := occurrencePosition_renamed (schedule := schedule) (log := log) tabledQ
    rw [renamedP, renamedQ, notAfter_committed, decide_eq_true_eq]
    by_cases same : (Issue.fresh u i) = .fresh v j
    · rw [same] at foundP ⊢
      cases foundP.symm.trans foundQ
      exact iff_of_true ((notAfter_total _ _).elim id id) (Nat.le_refl _)
    have sorted := issueOrder_sorted schedule log s
    have nodup := issueOrder_nodup schedule log s
    have memQ := (issueOrder_mem (schedule := schedule) (log := log)).mpr (show s.issued[(Issue.fresh v j, ClaimSlot.occurrence two).1]? = some (Issue.fresh v j, ClaimSlot.occurrence two).2 from tabledQ)
    obtain ⟨S, T, split⟩ := List.mem_iff_append.mp
      ((issueOrder_mem (schedule := schedule) (log := log)).mpr (show s.issued[(Issue.fresh u i, ClaimSlot.occurrence one).1]? = some (Issue.fresh u i, ClaimSlot.occurrence one).2 from tabledP))
    rw [positionsOf_eq, split] at foundP foundQ
    rw [split] at sorted nodup memQ
    rcases List.mem_append.mp memQ with inS | inT
    · obtain ⟨P, M, splitS⟩ := List.mem_iff_append.mp inS
      have qp : Issue.notAfter (issuerOrder schedule log) (.fresh v j) (.fresh u i) = true :=
        (List.pairwise_append.mp sorted).2.2 _ inS (Issue.fresh u i, ClaimSlot.occurrence one) (List.mem_cons_self ..)
      rw [splitS] at foundP foundQ nodup
      simp only [List.append_assoc, List.cons_append] at foundP foundQ nodup
      have outQ := nodup_absent nodup
      have lt := positions_before P M T (.fresh v j) (.fresh u i) two one _ outQ.1 (nodup_absent outQ.2).1 foundQ foundP
      exact iff_of_false (fun pq => same (notAfter_antisymm (issuerOrder_tied schedule log) pq qp)) (by omega)
    · rcases List.mem_cons.mp inT with back | inT
      · exact absurd (congrArg Prod.fst back).symm same
      obtain ⟨M, P, splitT⟩ := List.mem_iff_append.mp inT
      have pq : Issue.notAfter (issuerOrder schedule log) (.fresh u i) (.fresh v j) = true :=
        (List.pairwise_cons.mp (List.pairwise_append.mp sorted).2.1).1 _ inT
      rw [splitT] at foundP foundQ nodup
      have outP := nodup_absent nodup
      have lt := positions_before S M P (.fresh u i) (.fresh v j) one two _ outP.1 (nodup_absent outP.2).1 foundP foundQ
      exact iff_of_true pq (Nat.le_of_lt lt)

end Kernel.Laws.Step
