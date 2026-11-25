module

public import Kernel.Laws.Step.Commit

/-! # Laws of the step function: what the commit's equations imply

What `Kernel.Laws.Step.Commit` exports about `Kernel.Step.Commit`'s bodies, carried further without reading them: the
place order of the commit's activation order (`activationPlace_lt`, `activationOrder_before_place`), the ordinals the
assignment gives (`assign_took`, `assign_some`, `assign_identity`, `assign_activation_next`), and what a compacted
state keeps of the settled one (`compact_frame`, `compact_items`, `compact_slots`, `orderJournal_closed`). Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

theorem rekey_id {r : Issue → Issue} (same : ∀ issue, r issue = issue) (continuation : Continuation) :
    continuation.rekey (renameId r) (renameScope r) = continuation := by
  cases continuation <;> simp [renameId_id same, renameScope_id same]

/-- The activation order runs by the depth of the instance's name. -/
theorem activationOrder_sorted (tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))) :
    (activationOrder tagged).Pairwise fun a b => a.2.processInstance.callDepth ≤ b.2.processInstance.callDepth := by
  rw [activationOrder_eq]
  refine List.pairwise_map.mpr ((List.pairwise_mergeSort
    (le := fun a b : (Issue × ActivationSlot) × Nat =>
      a.1.2.processInstance.callDepth < b.1.2.processInstance.callDepth ||
        a.1.2.processInstance.callDepth == b.1.2.processInstance.callDepth && a.2 ≤ b.2)
    (fun _ _ _ one two => by simp only [Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq] at one two ⊢; omega)
    (fun a b => by simp only [Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]; omega) _).imp fun held => ?_)
  simp only [Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq] at held
  omega

theorem fresh_of_committed {segments : List ScopeSegment}
    (committed : ∀ segment ∈ segments, segment.ordinal.isFresh = false) :
    (ScopeOccurrenceId.ofSegments segments).fresh = false := by
  cases segments with
  | nil => simp
  | cons segment rest => simpa using committed segment List.mem_cons_self

theorem assignStep_above {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (above : AboveBase base acc) (claim : Issue × ClaimSlot) : AboveBase base (assignStep base acc claim) := by
  intro slot m found
  rcases assignStep_next_of found with ⟨rfl, rfl⟩ | ⟨rfl, rfl⟩ | kept
  · exact Nat.le_succ_of_le (getD_above above _)
  · exact Nat.le_succ_of_le (getD_above above _)
  · exact above slot m kept

/-- The fold keeps what it took of a claim whose issue no later claim repeats, and its next ordinals above their bases. -/
theorem fold_keeps {base : ClaimSlot → Nat} {other : Issue × ClaimSlot} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      other.1 ∉ claims.map (·.1) → AboveBase base acc → Took base acc other →
      Took base (claims.foldl (assignStep base) acc) other
  | [], _, _, _, took => took
  | claim :: rest, acc, absent, above, took => by
    simp only [List.map_cons, List.mem_cons, not_or] at absent
    exact fold_keeps rest _ absent.2 (assignStep_above above claim) (assignStep_keeps absent.1 took)

theorem fold_above {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      AboveBase base acc → AboveBase base (claims.foldl (assignStep base) acc)
  | [], _, above => above
  | claim :: rest, _, above => fold_above rest _ (assignStep_above above claim)

/-- **The assignment takes every claim** of a list whose issues are distinct. -/
theorem fold_took {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      (claims.map (·.1)).Nodup → AboveBase base acc → ∀ claim ∈ claims, Took base (claims.foldl (assignStep base) acc) claim
  | [], _, _, _, _, member => nomatch member
  | first :: rest, acc, distinct, above, claim, member => by
    simp only [List.map_cons, List.nodup_cons] at distinct
    rcases List.mem_cons.mp member with rfl | later
    · exact fold_keeps rest _ distinct.1 (assignStep_above above _) (assignStep_took above _)
    · exact fold_took rest _ distinct.2 (assignStep_above above first) claim later

/-- Of two predicates on a list, one implying the other, the stronger counts fewer where an element meets only the
weaker. -/
theorem countP_lt_of {α : Type} {p q : α → Bool} :
    ∀ {l : List α}, (∀ x ∈ l, p x → q x) → ∀ y ∈ l, q y = true → p y = false → l.countP p < l.countP q
  | [], _, _, member, _, _ => nomatch member
  | a :: rest, mono, y, member, hit, miss => by
    simp only [List.countP_cons]
    have head : (if p a then 1 else 0) ≤ (if q a then 1 else 0) := by
      by_cases pa : p a = true
      · simp [pa, mono a List.mem_cons_self pa]
      · simp [pa]
    have tail : ∀ x ∈ rest, p x → q x := fun x inside => mono x (List.mem_cons_of_mem _ inside)
    rcases List.mem_cons.mp member with rfl | later
    · have := List.countP_mono_left tail
      simp [hit, miss]; omega
    · have := countP_lt_of tail y later hit miss
      omega

/-- Ranks in a list of strictly increasing places pick increasing places: the place at the rank `P` counts lies below
the one at the rank `Q` counts, where `P` implies `Q`, one element meets `Q` but not `P` and one meets neither. -/
theorem place_lt_of {α : Type} {G : List (α × Nat)} {P Q : α × Nat → Bool} (sorted : (G.map (·.2)).Pairwise (· < ·))
    (mono : ∀ x ∈ G, P x → Q x) (y : α × Nat) (inY : y ∈ G) (hit : Q y = true) (miss : P y = false)
    (z : α × Nat) (inZ : z ∈ G) (out : Q z = false) (d d' : Nat) :
    ((G.map (·.2))[G.countP P]?).getD d < ((G.map (·.2))[G.countP Q]?).getD d' := by
  have lower := countP_lt_of mono y inY hit miss
  have bound : G.countP Q < G.length := by
    have := countP_lt_of (q := fun _ => true) (fun _ _ _ => rfl) z inZ rfl out
    simpa [List.countP_true] using this
  have one : G.countP P < (G.map (·.2)).length := by simp; omega
  have two : G.countP Q < (G.map (·.2)).length := by simp; omega
  rw [List.getElem?_eq_getElem one, List.getElem?_eq_getElem two, Option.getD_some, Option.getD_some]
  exact List.pairwise_iff_getElem.mp sorted _ _ one two lower

/-- **Two instances of one body take their places in item order** (`Step.activationPlace`, KD5). -/
theorem activationPlace_lt {tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))} {p q : Nat}
    {a b : Issue × ActivationSlot} {body : OccurrenceId} {i j : Nat}
    (atP : tagged[p]? = some (a, some (body, i))) (atQ : tagged[q]? = some (b, some (body, j))) (lower : i < j) :
    activationPlace tagged p (some (body, i)) < activationPlace tagged q (some (body, j)) := by
  rw [activationPlace_some, activationPlace_some]
  have sorted : ((tagged.zipIdx.filter fun entry => entry.1.2.map (·.1) == some body).map (·.2)).Pairwise (· < ·) := by
    have base : (tagged.zipIdx.map (·.2)).Pairwise (· < ·) := by
      rw [List.zipIdx_map_snd]; exact List.pairwise_lt_range'
    exact base.sublist (List.filter_sublist.map _)
  have inP : ((a, some (body, i)), p) ∈ tagged.zipIdx.filter fun entry => entry.1.2.map (·.1) == some body :=
    List.mem_filter.mpr ⟨List.mem_zipIdx_iff_getElem?.mpr atP, by simp⟩
  have inQ : ((b, some (body, j)), q) ∈ tagged.zipIdx.filter fun entry => entry.1.2.map (·.1) == some body :=
    List.mem_filter.mpr ⟨List.mem_zipIdx_iff_getElem?.mpr atQ, by simp⟩
  refine place_lt_of sorted ?_ _ inP ?_ ?_ _ inQ ?_ p q
  · rintro ⟨⟨c, tag⟩, k⟩ _ held
    cases tag with
    | none => simp at held
    | some t =>
      obtain ⟨_, other⟩ := t
      simp only [Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq] at held ⊢
      omega
  · simp only [Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]; omega
  · simp
  · simp

/-- **One depth lists the earlier place first** (`Step.activationOrder`): of two tagged activations of one depth,
the one at the lower place comes before the other. -/
theorem activationOrder_before_place {tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))}
    {p q : Nat} {a b : Issue × ActivationSlot} {ta tb : Option (OccurrenceId × Nat)}
    (atP : tagged[p]? = some (a, ta)) (atQ : tagged[q]? = some (b, tb))
    (depth : a.2.processInstance.callDepth = b.2.processInstance.callDepth)
    (lower : activationPlace tagged p ta < activationPlace tagged q tb) :
    ∃ pre post, activationOrder tagged = pre ++ a :: post ∧ b ∈ post := by
  let le := fun a b : (Issue × ActivationSlot) × Nat =>
    a.1.2.processInstance.callDepth < b.1.2.processInstance.callDepth ||
      a.1.2.processInstance.callDepth == b.1.2.processInstance.callDepth && a.2 ≤ b.2
  let L := tagged.zipIdx.map fun entry => (entry.1.1, activationPlace tagged entry.2 entry.1.2)
  rw [activationOrder_eq]
  show ∃ pre post, (L.mergeSort le).map (·.1) = pre ++ a :: post ∧ b ∈ post
  have sorted := List.pairwise_mergeSort (le := le)
    (fun _ _ _ one two => by simp only [le, Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq] at one two ⊢; omega)
    (fun a b => by simp only [le, Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]; omega) L
  have inA : (a, activationPlace tagged p ta) ∈ L.mergeSort le :=
    (List.mergeSort_perm L le).mem_iff.mpr (List.mem_map.mpr ⟨((a, ta), p), List.mem_zipIdx_iff_getElem?.mpr atP, rfl⟩)
  have inB : (b, activationPlace tagged q tb) ∈ L.mergeSort le :=
    (List.mergeSort_perm L le).mem_iff.mpr (List.mem_map.mpr ⟨((b, tb), q), List.mem_zipIdx_iff_getElem?.mpr atQ, rfl⟩)
  obtain ⟨pre, post, split⟩ := List.append_of_mem inA
  rw [split] at sorted inB
  refine ⟨pre.map (·.1), post.map (·.1), by rw [split]; simp, ?_⟩
  rcases List.mem_append.mp inB with early | late
  · have held := (List.pairwise_append.mp sorted).2.2 _ early _ List.mem_cons_self
    simp only [le, Bool.or_eq_true, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq] at held
    omega
  · rcases List.mem_cons.mp late with same | later
    · have := congrArg (·.2) same
      simp only at this
      omega
    · exact List.mem_map.mpr ⟨_, later, rfl⟩

/-- An activation step writes only its own issue's ordinal. -/
theorem activationFold_lookup {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ActivationSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
      {issue : Issue}, issue ∉ claims.map (·.1) →
      (claims.foldl (activationStep base) acc).1[issue]? = acc.1[issue]?
  | [], _, _, _ => rfl
  | c :: rest, acc, issue, absent => by
    simp only [List.map_cons, List.mem_cons, not_or] at absent
    rw [List.foldl_cons, activationFold_lookup rest _ absent.2, activationStep_eq, assignStep_fst,
      Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same).symm absent.1
    · rfl

/-- The activation fold keeps what the identity fold took of a claim no activation repeats, and the next ordinals above
their bases: each activation step is a plain step on the activation's resolved slot (`Step.activationStep`). -/
theorem activationFold_keeps {base : ClaimSlot → Nat} {other : Issue × ClaimSlot} :
    ∀ (claims : List (Issue × ActivationSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      other.1 ∉ claims.map (·.1) → AboveBase base acc → Took base acc other →
      Took base (claims.foldl (activationStep base) acc) other ∧ AboveBase base (claims.foldl (activationStep base) acc)
  | [], _, _, above, took => ⟨took, above⟩
  | claim :: rest, acc, absent, above, took => by
    simp only [List.map_cons, List.mem_cons, not_or] at absent
    rw [List.foldl_cons, activationStep_eq]
    exact activationFold_keeps rest _ absent.2 (assignStep_above above _) (assignStep_keeps absent.1 took)

/-- No activation is an identity's issue: an issue the table holds as another slot is no activation claim. -/
theorem activationOrder_absent {log : RunLog} {state : State} {issue : Issue} {slot : ClaimSlot} (tabled : state.issued[issue]? = some slot)
    (plain : ∀ activation, slot ≠ .activation activation) :
    issue ∉ (activationOrder (taggedActivations schedule state (issueOrder schedule log state))).map (·.1) := by
  intro inside
  obtain ⟨c, member, same⟩ := List.mem_map.mp inside
  have held := issueOrder_mem.mp (activationOrder_mem.mp member)
  rw [same, tabled] at held
  exact plain _ (Option.some.inj held)

/-- **`assign_took`.** Every entry of the issue table but an activation takes an ordinal at or above its slot's base and
below the slot's next ordinal (an activation's: `assign_tookActivation`). -/
theorem assign_took {start : State} {log : RunLog} {state : State} {issue : Issue} {slot : ClaimSlot}
    (tabled : state.issued[issue]? = some slot) (plain : ∀ activation, slot ≠ .activation activation) :
    Took (slotBase start) (assign schedule start log state) (issue, slot) := by
  rw [assign_eq]
  have none : AboveBase (slotBase start) ((∅ : TreeMap Issue Nat compare), (∅ : TreeMap ClaimSlot Nat compare)) :=
    fun _ _ found => by simp at found
  have distinct := (issueOrder_nodup schedule log state).sublist ((identityClaims_sublist _).map (·.1))
  exact (activationFold_keeps _ _ (activationOrder_absent tabled plain) (fold_above _ _ none)
    (fold_took _ _ distinct none _ (identityClaims_mem.mpr ⟨issueOrder_mem.mpr tabled, plain⟩))).1

/-- An identity's ordinal is the identity fold's: the activations write only their own. -/
theorem assign_identity {start : State} {log : RunLog} {state : State} {issue : Issue} {slot : ClaimSlot}
    (tabled : state.issued[issue]? = some slot) (plain : ∀ activation, slot ≠ .activation activation) :
    (assign schedule start log state).1[issue]? =
      ((identityClaims (issueOrder schedule log state)).foldl (assignStep (slotBase start)) (∅, ∅)).1[issue]? := by
  rw [assign_eq]
  exact activationFold_lookup _ _ (activationOrder_absent tabled plain)

/-- The activation fold gives an ordinal to every issue it held one for and every activation it numbers. -/
theorem activationFold_some {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ActivationSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
      {issue : Issue}, (acc.1[issue]?.isSome ∨ issue ∈ claims.map (·.1)) →
      (claims.foldl (activationStep base) acc).1[issue]?.isSome
  | [], _, _, held => held.elim id (fun inside => nomatch inside)
  | c :: rest, acc, issue, held => by
    rw [List.foldl_cons]
    refine activationFold_some rest _ ?_
    rw [activationStep_eq, assignStep_fst, Std.ExtTreeMap.getElem?_insert]
    split
    · exact .inl rfl
    · rename_i other
      rcases held with old | inside
      · exact .inl old
      · simp only [List.map_cons, List.mem_cons] at inside
        rcases inside with same | later
        · exact absurd (by rw [same]; exact Std.ReflCmp.compare_self) other
        · exact .inr later

/-- **Every issue the table holds takes an ordinal.** -/
theorem assign_some {start : State} {log : RunLog} {state : State} {issue : Issue} {slot : ClaimSlot}
    (tabled : state.issued[issue]? = some slot) : ∃ n, (assign schedule start log state).1[issue]? = some n := by
  cases slot with
  | activation activation =>
    rw [assign_eq]
    exact Option.isSome_iff_exists.mp (activationFold_some _ _ (.inr (List.mem_map.mpr
      ⟨(issue, activation), activationOrder_mem.mpr (issueOrder_mem.mpr tabled), rfl⟩)))
  | scope _ | occurrence _ | item _ | position =>
    obtain ⟨n, _, got, _⟩ := assign_took (schedule := schedule) (start := start) (log := log) tabled
      (fun _ held => nomatch held)
    exact ⟨n, got⟩

@[simp] theorem commitRenaming_committed (start : State) (log : RunLog) (s : State) (n : Nat) :
    commitRenaming schedule start log s (.committed n) = .committed n :=
  renameBy_committed _ n

/-- The keys a commit leaves standing: the settled state's, renamed, whatever the renaming (`renameState_keys`). -/
theorem compact_scopes {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    {x : ScopeOccurrenceId} :
    x ∈ standingKeys t ↔ x ∈ (standingKeys s).map (renameScope (commitRenaming schedule start log s)) := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [renameScope_id (commitRenaming_empty empty)]
  change x ∈ (advanceCounters _ _ _).scopes.map (·.id) ↔ _
  rw [(advance_raised _ _ _).scopes]
  exact renameState_keys

theorem compact_counter {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) (slot : ScopeSlot) :
    s.scopeOrdinals.getD slot 0 ≤ t.scopeOrdinals.getD slot 0 := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact Nat.le_refl _
  have raised := (advance_raised (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)).scopeOrdinals slot
  rwa [renameState_scopeOrdinals] at raised

theorem compact_reach {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {slot : ScopeSlot} {ordinal : Nat}
    (advanced : (assign schedule start log s).2[ClaimSlot.scope slot]? = some ordinal)
    (stands : renameScope (commitRenaming schedule start log s) slot.parent ∈ standingKeys t) :
    ordinal ≤ t.scopeOrdinals.getD { slot with parent := renameScope (commitRenaming schedule start log s) slot.parent } 0 := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [assign_empty empty] at advanced
  change _ ∈ (advanceCounters _ _ _).scopes.map (·.id) at stands
  rw [(advance_raised _ _ _).scopes] at stands
  obtain ⟨z, member, same⟩ := List.mem_map.mp stands
  exact advance_scope advanced (List.any_eq_true.mpr ⟨z, member, by simp [same]⟩)

/-- Every next ordinal the fold holds is strictly above its slot's base: it counts one past an ordinal it took (K12g:
an activation counter written back as the next ordinal less one stays positive). -/
def StrictAbove (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) : Prop :=
  ∀ slot m, acc.2[slot]? = some m → base slot < m

theorem assignStep_strict {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (strict : StrictAbove base acc) (claim : Issue × ClaimSlot) : StrictAbove base (assignStep base acc claim) := by
  have above : AboveBase base acc := fun slot m found => Nat.le_of_lt (strict slot m found)
  intro slot m found
  rcases assignStep_next_of found with ⟨rfl, rfl⟩ | ⟨rfl, rfl⟩ | kept
  · exact Nat.lt_succ_of_le (getD_above above _)
  · exact Nat.lt_succ_of_le (getD_above above _)
  · exact strict slot m kept

theorem fold_strict {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      StrictAbove base acc → StrictAbove base (claims.foldl (assignStep base) acc)
  | [], _, strict => strict
  | claim :: rest, _, strict => fold_strict rest _ (assignStep_strict strict claim)

/-- The activation fold keeps every next ordinal strictly above its slot's base. -/
theorem activationFold_strict {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ActivationSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      StrictAbove base acc → StrictAbove base (claims.foldl (activationStep base) acc)
  | [], _, strict => strict
  | claim :: rest, acc, strict => by
    rw [List.foldl_cons, activationStep_eq]
    exact activationFold_strict rest _ (assignStep_strict strict _)

/-- The fold's activation slots are claimed ones: an activation's slot gets a next ordinal only from its claim. -/
theorem fold_activationClaimed {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
      {slot : ActivationSlot} {m : Nat}, (claims.foldl (assignStep base) acc).2[ClaimSlot.activation slot]? = some m →
      acc.2[ClaimSlot.activation slot]? ≠ none ∨ ∃ issue, (issue, ClaimSlot.activation slot) ∈ claims
  | [], _, _, _, found => .inl (by rw [List.foldl_nil] at found; rw [found]; exact Option.some_ne_none _)
  | claim :: rest, acc, slot, m, found => by
    rcases fold_activationClaimed rest (assignStep base acc claim) found with held | ⟨issue, member⟩
    · obtain ⟨n, step⟩ := Option.ne_none_iff_exists'.mp held
      rcases assignStep_next_of step with ⟨same, -⟩ | ⟨same, -⟩ | kept
      · exact .inr ⟨claim.1, by rw [same]; exact List.mem_cons_self⟩
      · cases same
      · exact .inl (by rw [kept]; exact Option.some_ne_none _)
    · exact .inr ⟨issue, List.mem_cons_of_mem _ member⟩

/-- **An activation slot's next ordinal is at least two**: its base is the start counter plus one. -/
theorem assign_activation_next {start : State} {log : RunLog} {state : State} {slot : ActivationSlot} {m : Nat}
    (found : (assign schedule start log state).2[ClaimSlot.activation slot]? = some m) : 2 ≤ m := by
  have strict := activationFold_strict (base := slotBase start)
    (activationOrder (taggedActivations schedule state (issueOrder schedule log state))) _
    (fold_strict (base := slotBase start) (identityClaims (issueOrder schedule log state)) (∅, ∅)
      (fun _ _ found => by simp at found))
  rw [← assign_eq] at strict
  have := strict _ m found
  simp only [slotBase_eq] at this
  omega

/-- A commit changes no field but the identities, the counters and the issue table. -/
theorem compact_frame {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    t.queuedTokens = s.queuedTokens ∧ t.queuedSignals = s.queuedSignals ∧ t.transitions = s.transitions ∧
      t.outboxes = s.outboxes ∧
      t.journal.flatMap (·.ended) = s.journal.flatMap fun transition =>
        transition.ended.map fun (key, terminal) => (renameKey (commitRenaming schedule start log s) key, terminal) := by
  rcases compact_cases ran with ⟨empty, kept⟩ | ⟨_, rfl⟩
  · subst kept
    refine ⟨rfl, rfl, rfl, rfl, ?_⟩
    have same := commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty
    have keys : ∀ key, renameKey (commitRenaming schedule start log t) key = key := fun key => by
      simp [renameKey_eq, same, rename_id same]
    simp [keys]
  have same := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [same, renameState_eq]
  refine ⟨rfl, rfl, rfl, rfl, ?_⟩
  change List.flatMap _ (s.journal.map (renameTransition _)) = _
  simp only [List.flatMap_map, renameTransition_ended]

/-- A committed closure's journal holds its transitions' end facts, in the order its units ran. -/
theorem orderJournal_ended {start : State} {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal schedule start outcome = .ok after) :
    ∃ settled r, outcome = .ok settled ∧
      (after.journal.flatMap (·.ended)).Perm ((settled.1.transitions.toList.map (·.2)).flatMap fun transition =>
        transition.ended.map fun (key, terminal) => (renameKey r key, terminal)) := by
  obtain ⟨settled, log, same, made⟩ := orderJournal_ok ran
  rw [(compact_frame made).2.2.2.2]
  exact ⟨(settled, log), _, same, (byRun_perm log settled.transitions).flatMap_right _⟩

/-- No unit key outlives its closure: a committed state holds no queued token, signal, transition or keyed intent. -/
theorem orderJournal_closed {start : State} {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal schedule start outcome = .ok after) :
    after.queuedTokens = ∅ ∧ after.queuedSignals = ∅ ∧ after.transitions = ∅ ∧ after.outboxes = ∅ := by
  obtain ⟨_, _, _, made⟩ := orderJournal_ok ran
  obtain ⟨tokens, signals, parts⟩ := compact_frame made
  obtain ⟨transitions, outboxes, _⟩ := parts
  exact ⟨tokens, signals, transitions, outboxes⟩

/-! ## The occurrences and items a commit leaves -/

/-- Every occurrence a commit leaves is one of the settled state, renamed with its continuation. -/
theorem compact_occurrenceRecord_of {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    {occurrence : Occurrence} (member : occurrence ∈ t.occurrences) :
    ∃ old ∈ s.occurrences, occurrence = renamedOccurrence (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) old := by
  rcases compact_cases ran with ⟨empty, kept⟩ | ⟨_, rfl⟩
  · rw [kept] at member
    have same := commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty
    exact ⟨occurrence, member, by simp [renamedOccurrence, renameId_id same, renameScope_id same, rekey_id same, same,
        commitPositioning_empty (schedule := schedule) (start := start) (log := log) empty]⟩
  change occurrence ∈ (advanceCounters _ _ _).occurrences at member
  rw [(advance_raised _ _ _).occurrences] at member
  exact renameState_occurrence_of member

/-- The commit's renaming maps no two occurrences of the settled state onto one key (`Laws.Step.occurrences_apart`). -/
abbrev OccurrencesApart (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Prop :=
  ∀ a ∈ s.occurrences, ∀ b ∈ s.occurrences,
    renameId (commitRenaming schedule start log s) a.id = renameId (commitRenaming schedule start log s) b.id → a = b

/-- A commit that renames no two occurrences of the settled state alike keeps every one of them, renamed: the occurrence
map re-keys every record, so a record stands only if no other one is renamed onto its key. -/
theorem compact_occurrenceRecord_mem {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    (apart : OccurrencesApart schedule start log s) {old : Occurrence} (member : old ∈ s.occurrences) :
    renamedOccurrence (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) old ∈ t.occurrences := by
  rcases compact_cases ran with ⟨empty, kept⟩ | ⟨_, rfl⟩
  · rw [kept]
    have same := commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty
    have fixed : renamedOccurrence (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) old = old := by
      simp [renamedOccurrence, renameId_id same, renameScope_id same, rekey_id same, same,
        commitPositioning_empty (schedule := schedule) (start := start) (log := log) empty]
    rwa [fixed]
  change _ ∈ (advanceCounters _ _ _).occurrences
  rw [(advance_raised _ _ _).occurrences]
  exact renameState_occurrence_mem apart member

/-- The key of every occurrence of the settled state stands, renamed, after the commit, whatever the renaming; its record
does too when the renaming keeps the occurrences apart (`compact_occurrenceRecord_mem`). -/
theorem compact_occurrenceKey_mem {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    {old : Occurrence} (member : old ∈ s.occurrences) :
    ∃ occurrence ∈ t.occurrences, occurrence.id = renameId (commitRenaming schedule start log s) old.id := by
  rcases compact_cases ran with ⟨empty, kept⟩ | ⟨_, rfl⟩
  · rw [kept]
    exact ⟨old, member, (renameId_id (commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty) _).symm⟩
  change ∃ occurrence ∈ (advanceCounters _ _ _).occurrences, _
  rw [(advance_raised _ _ _).occurrences, occurrences_eq, renameState_occurrences, occurrenceList_eq]
  rw [occurrences_eq, occurrenceList_eq] at member
  exact Keyed.key_mem_refold member

/-- The occurrence map a commit leaves is keyed. -/
theorem compact_occurrencesKeyed {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t)
    (keyed : OccurrencesKeyed s.occurrenceMap) : OccurrencesKeyed t.occurrenceMap := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact keyed
  have frame := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [frame]
  exact renameState_occurrencesKeyed _ _ _ _

theorem compact_occurrence_counter {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) (slot : ScopeSlot) :
    s.occurrenceOrdinals.getD slot 0 ≤ t.occurrenceOrdinals.getD slot 0 := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact Nat.le_refl _
  have raised := (advance_raised (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)).occurrenceOrdinals slot
  rwa [renameState_occurrenceOrdinals] at raised

theorem compact_item_counter {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) (occurrence : OccurrenceId) :
    s.itemOrdinals.getD occurrence 0 ≤ t.itemOrdinals.getD occurrence 0 := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact Nat.le_refl _
  have raised := (advance_raised (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)).itemOrdinals occurrence
  rwa [renameState_itemOrdinals] at raised

theorem compact_reach_occurrence {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {slot : ScopeSlot}
    {ordinal : Nat} (advanced : (assign schedule start log s).2[ClaimSlot.occurrence slot]? = some ordinal)
    (stands : renameScope (commitRenaming schedule start log s) slot.parent ∈ standingKeys t) :
    ordinal ≤ t.occurrenceOrdinals.getD { slot with parent := renameScope (commitRenaming schedule start log s) slot.parent } 0 := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [assign_empty empty] at advanced
  change _ ∈ (advanceCounters _ _ _).scopes.map (·.id) at stands
  rw [(advance_raised _ _ _).scopes] at stands
  obtain ⟨z, member, same⟩ := List.mem_map.mp stands
  exact advance_occurrence advanced (List.any_eq_true.mpr ⟨z, member, by simp [same]⟩)

theorem compact_reach_item {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {occurrence : OccurrenceId}
    {ordinal : Nat} (advanced : (assign schedule start log s).2[ClaimSlot.item occurrence]? = some ordinal)
    (present : ∃ other ∈ t.occurrences, other.id = renameId (commitRenaming schedule start log s) occurrence) :
    ordinal ≤ t.itemOrdinals.getD (renameId (commitRenaming schedule start log s) occurrence) 0 := by
  obtain ⟨other, member, same⟩ := present
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [assign_empty empty] at advanced
  change other ∈ (advanceCounters _ _ _).occurrences at member
  rw [(advance_raised _ _ _).occurrences] at member
  exact advance_item advanced (List.any_eq_true.mpr ⟨other, member, by simp [same]⟩)

/-- An item the commit leaves is an item of the settled state renamed. -/
theorem compact_items {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {item : OpenItem}
    (member : item ∈ itemList t.openItems) :
    ∃ old ∈ itemList s.openItems, item.id = renameItemKey (commitRenaming schedule start log s) old.id := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · exact ⟨item, member, (renameItemKey_id (commitRenaming_empty empty) _).symm⟩
  change item ∈ itemList (advanceCounters _ _ _).openItems at member
  rw [(advance_raised _ _ _).items, mem_itemList] at member
  obtain ⟨k, held⟩ := member
  rw [renameState_openItems] at held
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList] at held
  rcases foldl_from (g := fun (x : ItemKey × OpenItem) =>
      { x.2 with id := renameItemKey (commitRenaming schedule start log s) x.2.id, position := commitRenaming schedule start log s x.2.position,
                 scope := renameScope (commitRenaming schedule start log s) x.2.scope
                 attachedTo := x.2.attachedTo.map (renameId (commitRenaming schedule start log s)) })
      (fun m x k v found => by
        simp only [Std.ExtTreeMap.getElem?_insert] at found
        split at found
        · exact .inr (Option.some.inj found).symm
        · exact .inl found) _ _ k item held with empty | ⟨x, entry, same⟩
  · simp at empty
  · refine ⟨x.2, mem_itemList.mpr ⟨x.1, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp entry⟩, ?_⟩
    rw [same]

/-! ## One shape for both commits -/

/-- The feature slots a commit leaves: the settled state's, renamed. -/
theorem compact_slots {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    t.slots = renameSlots (commitRenaming schedule start log s) s.slots := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · exact (renameSlots_id (commitRenaming_empty empty) _).symm
  have frame := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [frame, renameState_eq]

/-- A renamed continuation into a body is the renaming of a continuation into a body. -/
theorem _root_.Kernel.Continuation.rekey_eq_multiInstance {continuation : Continuation}
    {occurrence : OccurrenceId → OccurrenceId} {scope : ScopeOccurrenceId → ScopeOccurrenceId} {body : OccurrenceId}
    (renamed : continuation.rekey occurrence scope = .multiInstance body) :
    ∃ earlier, continuation = .multiInstance earlier ∧ occurrence earlier = body := by
  cases continuation with
  | flow => simp at renamed
  | multiInstance earlier => exact ⟨earlier, rfl, by simpa using renamed⟩
  | compensation run => simp at renamed

end Kernel.Laws.Step
