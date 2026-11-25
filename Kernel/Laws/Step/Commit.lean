module

public import Kernel.Step.Commit
public import Kernel.Laws.State.Issue
public import Kernel.Laws.State.Items
public import Kernel.Laws.State.Rename
public import Kernel.Laws.Step.Raised
import all Kernel.Step.Commit

/-! # Laws of the step function: commit

What `Kernel.Step.Commit` does, read from its bodies: a micro-step's draft is journalled as the transition of its unit
(`journalDraft_eq`), and a committed closure's journal and intents are put in run order, every unit-keyed family emptied
(`orderJournal_ok`, `orderJournal_closed`), then compacted (DC12): the assignment gives every entry of the issue table an
ordinal at or above its slot's base and below its slot's next ordinal (`assignStep_took`), the counters it leaves only rise
and reach every advanced slot's next ordinal (`advance_raised`, `advance_scope` of `advanceCounters`), the renaming of a layered key renames
each segment (`Laws.State.renameScope_eq`), and the committed state is the settled one, or, when it issued anything, the settled
one renamed and advanced (`compact_cases`). This is the one module that sees `Kernel.Step.Commit`'s bodies ([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
It keeps only what reads those bodies, with the equations its readers need; `Kernel.Laws.Step.Commit.Derived` carries
these facts further (`assign_took`, `orderJournal_closed`), and `Kernel.Laws.Step` composes them with `Kernel.Step`'s
bodies. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

/-- The draft journalled as the transition of the unit `unit`, the draft and the write log emptied. -/
theorem journalDraft_eq {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {state : State} :
    journalDraft unit cause element owner state = { state with
      transitions := state.transitions.insert unit
        { cause, element, owner, started := state.draft.started, ended := state.draft.ended, ready := state.draft.ready },
      draft := {}, writes := [] } := by
  simp only [journalDraft]

/-- A settled closure before compaction: its transitions and intents in run order (`byRun`), every unit-keyed family
and the draft emptied, so no unit key outlives its closure (DC4), and the counters of the instances it left dropped
(DC24). -/
abbrev ordered (log : RunLog) (state : State) : State :=
  { state with journal := byRun log state.transitions, intents := (byRun log state.outboxes).flatten
               transitions := ∅, outboxes := ∅, queuedTokens := ∅, queuedSignals := ∅, draft := {}
               activations := state.activations.filter (countLive state) }

/-- The identity bound passes a commit on as it is, or refuses it (`Step.boundIdentities`). -/
theorem bounded_ok {bound : Nat} {committed : Outcome} {after : State}
    (ran : (boundIdentities bound =<< committed) = .ok after) : committed = .ok after := by
  cases committed with
  | error failure => exact nomatch ran
  | ok state =>
    change boundIdentities bound state = .ok after at ran
    unfold boundIdentities at ran
    split at ran
    · cases ran
    · cases ran; rfl

/-- A committed closure: the settled one ordered, then compacted. -/
theorem orderJournal_ok {start : State} {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal schedule start outcome = .ok after) :
    ∃ settled log, outcome = .ok (settled, log) ∧ compact schedule start log (ordered log settled) = .ok after := by
  cases outcome with
  | error failure => simp [orderJournal, bind, Except.bind] at ran
  | ok settled => exact ⟨settled.1, settled.2, rfl, ran⟩

/-- What a settled closure commits, given its settled state and run log. -/
theorem orderJournal_of {start state : State} {log : RunLog} {after : State}
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    compact schedule start log (ordered log state) = .ok after :=
  made

/-- `byRun` reorders the entries of a unit-keyed family and keeps each of them. -/
theorem byRun_perm {α : Type} (log : RunLog) (entries : TreeMap UnitKey α compare) :
    (byRun log entries).Perm (entries.toList.map (·.2)) := by
  unfold byRun
  refine ((List.mergeSort_perm _ _).map _).trans ?_
  simp [List.map_map, Function.comp_def]

/-- `byRun` lists the entries in the order their units ran: as some ordering of the family's entries in which every
unit comes after each unit that ran at an earlier position. -/
theorem byRun_sorted {α : Type} (log : RunLog) (entries : TreeMap UnitKey α compare) :
    ∃ sorted : List (UnitKey × α), byRun log entries = sorted.map (·.2) ∧ sorted.Perm entries.toList ∧
      sorted.Pairwise fun a b => log.runPosition a.1 ≤ log.runPosition b.1 := by
  let ranBefore : Nat × UnitKey × α → Nat × UnitKey × α → Bool := fun a b =>
    a.1 < b.1 || a.1 == b.1 && compare a.2.1 b.2.1 != .gt
  have trans : ∀ a b c, ranBefore a b = true → ranBefore b c = true → ranBefore a c = true := by
    intro a b c one two
    simp only [ranBefore, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq, bne_iff_ne, ne_eq] at one two ⊢
    rcases one with lower | ⟨same, keys⟩ <;> rcases two with lower' | ⟨same', keys'⟩
    · exact .inl (by omega)
    · exact .inl (by omega)
    · exact .inl (by omega)
    · have isLE : ∀ order : Ordering, ¬ order = .gt → order.isLE := by intro order; cases order <;> decide +kernel
      exact .inr ⟨same.trans same', fun gt => by
        have := Std.TransCmp.isLE_trans (isLE _ keys) (isLE _ keys')
        rw [gt] at this
        cases this⟩
  have total : ∀ a b, (ranBefore a b || ranBefore b a) = true := by
    intro a b
    simp only [ranBefore, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq, bne_iff_ne, ne_eq]
    rcases Nat.lt_trichotomy a.1 b.1 with lower | same | higher
    · exact .inl (.inl lower)
    · by_cases gt : compare a.2.1 b.2.1 = .gt
      · exact .inr (.inr ⟨same.symm, fun gt' => by
          have swapped := Std.OrientedCmp.lt_of_gt gt
          rw [gt'] at swapped
          cases swapped⟩)
      · exact .inl (.inr ⟨same, gt⟩)
    · exact .inr (.inl higher)
  let tagged := entries.toList.map fun (unit, value) => (log.runPosition unit, unit, value)
  refine ⟨(tagged.mergeSort ranBefore).map (·.2), ?_, ?_, ?_⟩
  · simp [byRun, tagged, ranBefore, List.map_map, Function.comp_def]
  · refine ((List.mergeSort_perm _ _).map _).trans ?_
    simp [tagged, List.map_map, Function.comp_def]
  · have sorted := List.pairwise_mergeSort trans total tagged
    have tags : ∀ x ∈ tagged.mergeSort ranBefore, x.1 = log.runPosition x.2.1 := by
      intro x inside
      obtain ⟨⟨unit, value⟩, _, rfl⟩ := List.mem_map.mp ((List.mergeSort_perm _ _).subset inside)
      rfl
    refine List.pairwise_map.mpr (sorted.imp_of_mem fun {a b} aIn bIn ordered => ?_)
    rw [← tags a aIn, ← tags b bIn]
    simp only [ranBefore, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq] at ordered
    rcases ordered with lower | ⟨same, _⟩
    · exact Nat.le_of_lt lower
    · exact Nat.le_of_eq same

/-- A committed commit committed a settled closure. -/
theorem orderJournal_settled {start : State} {outcome : Except Failure (State × RunLog)} {after : State}
    (ran : orderJournal schedule start outcome = .ok after) : ∃ settled, outcome = .ok settled ∧ orderJournal schedule start (.ok settled) = .ok after := by
  cases outcome with
  | error failure => simp [orderJournal, bind, Except.bind] at ran
  | ok settled => exact ⟨settled, rfl, ran⟩

/-! ## Compaction at commit (DC12) -/

open Kernel.Laws.State

/-! ## The assignment -/

/-- The fold took `claim`: its issue holds an ordinal at or above its slot's base and below its slot's next ordinal. -/
def Took (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) : Prop :=
  ∃ n m, acc.1[claim.1]? = some n ∧ acc.2[claim.2]? = some m ∧ base claim.2 ≤ n ∧ n < m

/-- Every next ordinal the fold holds is at or above its slot's base. -/
def AboveBase (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) : Prop :=
  ∀ slot m, acc.2[slot]? = some m → base slot ≤ m

theorem getD_above {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (above : AboveBase base acc) (slot : ClaimSlot) : base slot ≤ acc.2.getD slot (base slot) := by
  rw [Std.ExtTreeMap.getD_eq_getD_getElem?]
  cases h : acc.2[slot]? with
  | none => exact Nat.le_refl _
  | some m => exact above slot m h

/-- A step's next ordinals (`assignStep`): the claim's slot counts one past the ordinal it took, an occurrence's claim
counts the position slot one past the position it took (`Step.positionsOf`), and every other slot keeps its next
ordinal. -/
theorem assignStep_next_of {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    {claim : Issue × ClaimSlot} {slot : ClaimSlot} {m : Nat} (found : (assignStep base acc claim).2[slot]? = some m) :
    (slot = claim.2 ∧ m = acc.2.getD claim.2 (base claim.2) + 1) ∨
      (slot = .position ∧ m = acc.2.getD .position (base .position) + 1) ∨ acc.2[slot]? = some m := by
  obtain ⟨issue, claimed⟩ := claim
  have plain : (acc.2.insert claimed (acc.2.getD claimed (base claimed) + 1))[slot]? = some m →
      (slot = claimed ∧ m = acc.2.getD claimed (base claimed) + 1) ∨ acc.2[slot]? = some m := fun found => by
    rw [Std.ExtTreeMap.getElem?_insert] at found
    split at found
    · rename_i same; exact .inl ⟨(Std.LawfulEqOrd.eq_of_compare same).symm, (Option.some.inj found).symm⟩
    · exact .inr found
  cases claimed with
  | occurrence o =>
    simp only [assignStep] at found
    rw [Std.ExtTreeMap.getElem?_insert] at found
    split at found
    · rename_i same
      obtain rfl := Std.LawfulEqOrd.eq_of_compare same
      refine .inr (.inl ⟨rfl, ?_⟩)
      rw [← Option.some.inj found, Std.ExtTreeMap.getD_insert]
      simp [Std.LawfulEqCmp.compare_eq_iff_eq]
    · exact (plain found).elim .inl (.inr ∘ .inr)
  | scope _ | item _ | position | activation _ => exact (plain found).elim .inl (.inr ∘ .inr)

/-- A step's claim takes its slot's next ordinal and counts the slot past it. -/
theorem assignStep_claim (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) :
    (assignStep base acc claim).2[claim.2]? = some (acc.2.getD claim.2 (base claim.2) + 1) := by
  obtain ⟨issue, claimed⟩ := claim
  cases claimed with
  | occurrence o =>
    simp only [assignStep]
    rw [Std.ExtTreeMap.getElem?_insert]
    simp [Std.LawfulEqCmp.compare_eq_iff_eq]
  | scope _ | item _ | position | activation _ => simp [assignStep]

/-- No step lowers a next ordinal the fold holds. -/
theorem assignStep_raises {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (claim : Issue × ClaimSlot) {slot : ClaimSlot} {m : Nat} (found : acc.2[slot]? = some m) :
    ∃ m', (assignStep base acc claim).2[slot]? = some m' ∧ m ≤ m' := by
  have own : ∀ other, acc.2[other]? = some m → m ≤ acc.2.getD other (base other) := fun other held => by
    rw [Std.ExtTreeMap.getD_eq_getD_getElem?, held]; exact Nat.le_refl _
  obtain ⟨issue, claimed⟩ := claim
  have plain : ∃ m', (acc.2.insert claimed (acc.2.getD claimed (base claimed) + 1))[slot]? = some m' ∧ m ≤ m' := by
    rw [Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same
      exact ⟨_, rfl, Nat.le_succ_of_le (own _ (Std.LawfulEqOrd.eq_of_compare same ▸ found))⟩
    · exact ⟨m, found, Nat.le_refl _⟩
  cases claimed with
  | occurrence o =>
    simp only [assignStep]
    rw [Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same
      obtain rfl := Std.LawfulEqOrd.eq_of_compare same
      refine ⟨_, rfl, Nat.le_succ_of_le ?_⟩
      rw [Std.ExtTreeMap.getD_insert]
      simpa [Std.LawfulEqCmp.compare_eq_iff_eq] using own _ found
    · exact plain
  | scope _ | item _ | position | activation _ => exact plain

theorem assignStep_took {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (above : AboveBase base acc) (claim : Issue × ClaimSlot) : Took base (assignStep base acc claim) claim :=
  ⟨_, _, by simp [assignStep], assignStep_claim base acc claim, getD_above above claim.2, Nat.lt_succ_self _⟩

theorem assignStep_keeps {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    {claim other : Issue × ClaimSlot} (apart : other.1 ≠ claim.1) (took : Took base acc other) :
    Took base (assignStep base acc claim) other := by
  obtain ⟨n, m, entries⟩ := took
  obtain ⟨issue, slot, low, high⟩ := entries
  have kept : (assignStep base acc claim).1[other.1]? = some n := by
    simp only [assignStep, Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same).symm apart
    · exact issue
  obtain ⟨m', next, raised⟩ := assignStep_raises claim slot
  exact ⟨n, m', kept, next, low, Nat.lt_of_lt_of_le high raised⟩

/-- A step's ordinals: the claim's issue takes its slot's next ordinal. -/
theorem assignStep_fst (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) : (assignStep base acc claim).1 = acc.1.insert claim.1 (acc.2.getD claim.2 (base claim.2)) := by
  simp only [assignStep]

theorem assign_eq (start : State) (log : RunLog) (state : State) :
    assign schedule start log state =
      (activationOrder (taggedActivations schedule state (issueOrder schedule log state))).foldl
      (activationStep (slotBase start))
      ((identityClaims (issueOrder schedule log state)).foldl (assignStep (slotBase start)) (∅, ∅)) := by
  simp only [assign]

/-- The activation claims the tagging lists, in issue order. -/
theorem taggedActivations_fst (schedule : BranchSchedule) (state : State) (claims : List (Issue × ClaimSlot)) :
    (taggedActivations schedule state claims).map (·.1) = claims.filterMap activationClaim? := by
  simp only [taggedActivations, List.map_map, Function.comp_def, List.map_id']

/-- `Step.activationOrder`'s equation, for modules that cannot open `Kernel.Step.Commit`'s bodies. -/
theorem activationOrder_eq (tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))) :
    activationOrder tagged =
      ((tagged.zipIdx.map fun entry => (entry.1.1, activationPlace tagged entry.2 entry.1.2)).mergeSort fun a b =>
        a.1.2.processInstance.callDepth < b.1.2.processInstance.callDepth ||
          a.1.2.processInstance.callDepth == b.1.2.processInstance.callDepth && a.2 ≤ b.2).map (·.1) := by
  unfold activationOrder
  rw [← List.map_mergeSort (r := fun a b : (Issue × ActivationSlot) × Nat =>
    a.1.2.processInstance.callDepth < b.1.2.processInstance.callDepth ||
      a.1.2.processInstance.callDepth == b.1.2.processInstance.callDepth && a.2 ≤ b.2) fun _ _ _ _ => rfl, List.map_map]
  rfl

/-- The activation order lists the tagged claims, reordered. -/
theorem activationOrder_perm (tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))) :
    (activationOrder tagged).Perm (tagged.map (·.1)) := by
  rw [activationOrder_eq]
  refine ((List.mergeSort_perm _ _).map _).trans (.of_eq ?_)
  rw [List.map_map]
  conv => rhs; rw [← List.zipIdx_map_fst 0 tagged, List.map_map]
  rfl

/-- Every activation but an instance keeps its place. -/
@[simp] theorem activationPlace_none (tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat)))
    (place : Nat) : activationPlace tagged place none = place := by
  simp only [activationPlace]

/-- Under `declarationDepthFirst` no activation is tagged as an instance. -/
theorem taggedActivations_ddf (state : State) (claims : List (Issue × ClaimSlot)) :
    taggedActivations .declarationDepthFirst state claims =
      (claims.filterMap activationClaim?).map fun claim => (claim, (none : Option (OccurrenceId × Nat))) := by
  simp only [taggedActivations]

/-- An activation claim is one of `activationClaim?`'s. -/
@[simp] theorem activationClaim?_activation (issue : Issue) (slot : ActivationSlot) :
    activationClaim? (issue, .activation slot) = some (issue, slot) := by
  simp only [activationClaim?]

/-- `Step.activationPlace`'s equation for an instance of a body, for modules that cannot open its body. -/
theorem activationPlace_some (tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))) (place : Nat)
    (body : OccurrenceId) (item : Nat) :
    activationPlace tagged place (some (body, item)) =
      (((tagged.zipIdx.filter fun entry => entry.1.2.map (·.1) == some body).map (·.2))[
        (tagged.zipIdx.filter fun entry => entry.1.2.map (·.1) == some body).countP fun entry => match entry.1.2 with
          | some (_, other) => other < item || (other == item && entry.2 < place)
          | none => false]?).getD place := by
  unfold activationPlace; rfl

/-- The activation order lists each issue once. -/
theorem activationOrder_nodup (schedule : BranchSchedule) (state : State) (claims : List (Issue × ClaimSlot))
    (distinct : (claims.map (·.1)).Nodup) :
    ((activationOrder (taggedActivations schedule state claims)).map (·.1)).Nodup := by
  refine ((activationOrder_perm _).map _).nodup_iff.mpr ?_
  rw [taggedActivations_fst]
  unfold List.Nodup
  refine List.pairwise_map.mpr ((List.pairwise_map.mp distinct).filterMap _ fun ⟨_, x⟩ ⟨_, y⟩ differ c one d two => ?_)
  cases x <;> cases y <;> simp only [activationClaim?, Option.some.injEq, reduceCtorEq] at one two
  subst one two
  exact differ

/-- An activation step is a plain step on the activation's slot under its resolved name. -/
theorem activationStep_eq (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ActivationSlot) :
    activationStep base acc claim = assignStep base acc (claim.1, .activation (resolveSlot acc.1 claim.2)) := by
  simp only [activationStep]

theorem resolveSlot_eq (assigned : TreeMap Issue Nat compare) (slot : ActivationSlot) :
    resolveSlot assigned slot = { slot with processInstance := slot.processInstance.rename (renameBy assigned) } := by
  simp only [resolveSlot]

theorem identityClaims_mem {claims : List (Issue × ClaimSlot)} {claim : Issue × ClaimSlot} :
    claim ∈ identityClaims claims ↔ claim ∈ claims ∧ ∀ slot, claim.2 ≠ .activation slot := by
  unfold identityClaims
  rw [List.mem_filter]
  obtain ⟨issue, claimed⟩ := claim
  cases claimed <;> simp

theorem identityClaims_sublist (claims : List (Issue × ClaimSlot)) : (identityClaims claims).Sublist claims :=
  List.filter_sublist

theorem activationOrder_mem {schedule : BranchSchedule} {state : State} {claims : List (Issue × ClaimSlot)}
    {claim : Issue × ActivationSlot} :
    claim ∈ activationOrder (taggedActivations schedule state claims) ↔ (claim.1, ClaimSlot.activation claim.2) ∈ claims := by
  rw [(activationOrder_perm _).mem_iff, taggedActivations_fst, List.mem_filterMap]
  constructor
  · rintro ⟨⟨issue, claimed⟩, member, found⟩
    cases claimed with
    | activation slot =>
      simp only [activationClaim?, Option.some.injEq] at found
      subst found
      exact member
    | scope _ | occurrence _ | item _ | position => simp [activationClaim?] at found
  · intro member
    exact ⟨_, member, rfl⟩

/-- The index of the one element of a list that meets `p`. -/
theorem findIdx?_of {α : Type} {p : α → Bool} {l : List α} {k : Nat} {x : α} (at_ : l[k]? = some x) (hit : p x = true)
    (only : ∀ j y, l[j]? = some y → p y = true → j = k) : l.findIdx? p = some k := by
  obtain ⟨bound, same⟩ := List.getElem?_eq_some_iff.mp at_
  refine List.findIdx?_eq_some_iff_getElem.mpr ⟨bound, by rw [same]; exact hit, fun j lower held => ?_⟩
  have := only j _ (List.getElem?_eq_getElem (by omega)) held
  omega

/-- An instance's activation names its body and its slot's index (`Step.instanceItem?`): the occurrence carrying it
continues into the body and stands in the scope occurrence of one active slot. -/
theorem instanceItem?_of {state : State} {issue : Issue} {slot : ActivationSlot} {o : Occurrence} {body : OccurrenceId}
    {record : MultiInstanceRecord} {k : Nat} (role : slot.role = .element)
    (found : state.occurrences.find? (·.activation == issue) = some o) (on : o.continuation = .multiInstance body)
    (run : state.slots.multiInstanceMap[body]? = some record) (at_ : record.instances[k]? = some (.active o.scope))
    (own : ∀ j, record.instances[j]? = some (.active o.scope) → j = k) :
    instanceItem? state (issue, slot) = some (body, k) := by
  unfold instanceItem?
  simp only [role, found, Option.bind_some, on, Continuation.body?, run]
  rw [findIdx?_of at_ (by simp) fun j y held hit => ?_]
  · rfl
  · cases y with
    | waiting => simp at hit
    | completed _ => simp at hit
    | active scope =>
      simp only [beq_iff_eq] at hit
      subst hit
      exact own j held

/-- Under `orderInvariant` every activation claim stands in the tagging with its instance item. -/
theorem taggedActivations_at {state : State} {claims : List (Issue × ClaimSlot)} {claim : Issue × ActivationSlot}
    (member : (claim.1, ClaimSlot.activation claim.2) ∈ claims) :
    ∃ p : Nat, (taggedActivations .orderInvariant state claims)[p]? = some (claim, instanceItem? state claim) := by
  have inside : claim ∈ claims.filterMap activationClaim? := List.mem_filterMap.mpr ⟨_, member, rfl⟩
  obtain ⟨p, at_⟩ := List.mem_iff_getElem?.mp inside
  exact ⟨p, by simp only [taggedActivations, List.getElem?_map, at_, Option.map_some]⟩

/-- Ranking an issue first by `issueRank`, then by `tieOrder`, is `issuerOrder`'s order of issues. -/
theorem issueRank_notAfter (schedule : BranchSchedule) (log : RunLog) (a b : Issue) :
    Issue.notAfter (issuerOrder schedule log) a b =
      (issueRank schedule log a < issueRank schedule log b ||
        issueRank schedule log a == issueRank schedule log b && Issue.notAfter (tieOrder schedule) a b) := by
  cases a <;> cases b <;> cases schedule <;> simp only [issueRank, tieOrder, issuerOrder] <;> try simp
  rename_i u i v j
  simp only [notAfter_fresh, compareLex, compareOn]
  rcases Nat.lt_trichotomy (orderKey log u 0).1 (orderKey log v 0).1 with lt | eq | gt
  · simp [Nat.compare_eq_lt.mpr lt, lt]
  · simp [eq]
  · simp [Nat.compare_eq_gt.mpr gt, Nat.not_lt.mpr (Nat.le_of_lt gt), Nat.ne_of_gt gt]

theorem issueOrder_eq (log : RunLog) (state : State) : issueOrder schedule log state =
    state.issued.toList.mergeSort fun a b => Issue.notAfter (issuerOrder schedule log) a.1 b.1 := by
  unfold issueOrder
  rw [← List.map_mergeSort (r := fun a b => Issue.notAfter (issuerOrder schedule log) a.1 b.1) fun a _ b _ =>
    issueRank_notAfter schedule log a.1 b.1, List.map_map]
  simp only [Function.comp_def, List.map_id']

/-- The issue order lists the table's entries, each issue once. -/
theorem issueOrder_mem {log : RunLog} {state : State} {claim : Issue × ClaimSlot} :
    claim ∈ issueOrder schedule log state ↔ state.issued[claim.1]? = some claim.2 := by
  rw [issueOrder_eq]
  rw [(List.mergeSort_perm _ _).mem_iff]
  exact Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some

theorem issueOrder_nodup (schedule : BranchSchedule) (log : RunLog) (state : State) : ((issueOrder schedule log state).map (·.1)).Nodup := by
  rw [issueOrder_eq]
  refine ((List.mergeSort_perm _ _).map _).nodup_iff.mpr ?_
  rw [List.nodup_iff_pairwise_ne, List.pairwise_map]
  exact Std.ExtTreeMap.distinct_keys_toList.imp fun apart same => apart (by rw [same]; exact Std.ReflCmp.compare_self)

/-- The position step's equation (`Step.positionStep`). -/
theorem positionStep_eq (acc : TreeMap Issue Nat compare × Nat) (claim : Issue × ClaimSlot) :
    positionStep acc claim = match claim.2 with
      | .occurrence _ => (acc.1.insert claim.1 acc.2, acc.2 + 1)
      | .position => (acc.1, acc.2 + 1)
      | .scope _ | .item _ | .activation _ => acc := by
  obtain ⟨_, claimed⟩ := claim
  cases claimed <;> rfl

/-- The position slot after a step: a position's or an occurrence's claim counts it past its next number, any other
claim keeps it. -/
theorem assignStep_position (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) : (assignStep base acc claim).2.getD .position (base .position) = match claim.2 with
      | .occurrence _ | .position => acc.2.getD .position (base .position) + 1
      | .scope _ | .item _ | .activation _ => acc.2.getD .position (base .position) := by
  obtain ⟨_, claimed⟩ := claim
  cases claimed <;> simp [assignStep, Std.ExtTreeMap.getD_insert, Std.LawfulEqCmp.compare_eq_iff_eq]

theorem positionsOf_eq (start : State) (log : RunLog) (state : State) :
    positionsOf schedule start log state = ((issueOrder schedule log state).foldl positionStep (∅, start.nextOrder)).1 := by
  simp only [positionsOf]

/-! ## The counters after the commit -/

theorem raiseCounter_ge {α : Type} [Ord α] [Std.TransOrd α] [Std.LawfulEqOrd α] (counters : TreeMap α Nat compare)
    (slot key : α) (ordinal : Nat) : counters.getD key 0 ≤ (raiseCounter counters slot ordinal).getD key 0 := by
  unfold raiseCounter
  rw [Std.ExtTreeMap.getD_insert]
  split
  · rename_i same
    rw [← Std.LawfulEqOrd.eq_of_compare same]
    exact Nat.le_max_right _ _
  · exact Nat.le_refl _

theorem raiseCounter_self {α : Type} [Ord α] [Std.TransOrd α] [Std.LawfulEqOrd α] (counters : TreeMap α Nat compare)
    (slot : α) (ordinal : Nat) : ordinal ≤ (raiseCounter counters slot ordinal).getD slot 0 := by
  unfold raiseCounter
  rw [Std.ExtTreeMap.getD_insert_self]
  exact Nat.le_max_left _ _

theorem find?_filter_of {α : Type} {p q : α → Bool} (implied : ∀ x, p x = true → q x = true) :
    ∀ l : List α, (l.filter q).find? p = l.find? p
  | [] => rfl
  | x :: xs => by
    have ih := find?_filter_of implied xs
    by_cases hp : p x = true
    · simp [implied x hp, hp]
    · by_cases hq : q x = true <;> simp [hp, hq, ih]

/-- An activation counter's step (K12g) lowers no counter: the slot's own rises to at least its count, every other is
kept, since the filter drops only the slot's entry. -/
theorem activation_raise_ge (state : State) (slot key : ActivationSlot) (ordinal : Nat) :
    state.activationCount key ≤ ({ state with
        activations := { processInstance := slot.processInstance, element := slot.element, role := slot.role, count := max (ordinal - 1) (state.activationCount slot) } ::
      state.activations.filter (fun count => !(count.processInstance == slot.processInstance && count.element == slot.element &&
        count.role == slot.role)) } : State).activationCount key := by
  by_cases same : key = slot
  · subst same
    simp only [State.activationCount, List.find?_cons, beq_self_eq_true, Bool.and_self, Option.map_some, Option.getD_some]
    exact Nat.le_max_right _ _
  · have apart : ¬ (slot.processInstance = key.processInstance ∧ slot.element = key.element ∧ slot.role = key.role) :=
      fun ⟨a, b, c⟩ => same (by cases slot; cases key; simp_all)
    have miss : (slot.processInstance == key.processInstance && slot.element == key.element && slot.role == key.role) = false := by
      simp only [Bool.and_eq_false_iff, beq_eq_false_iff_ne]
      by_cases a : slot.processInstance = key.processInstance <;> by_cases b : slot.element = key.element <;> simp_all
    simp only [State.activationCount, List.find?_cons, miss]
    rw [find?_filter_of (fun x hit => by
      simp only [Bool.and_eq_true, beq_iff_eq] at hit
      obtain ⟨⟨a, b⟩, c⟩ := hit
      simp only [Bool.not_eq_true', Bool.and_eq_false_iff, beq_eq_false_iff_ne, a, b, c]
      by_cases x1 : key.processInstance = slot.processInstance <;> by_cases x2 : key.element = slot.element <;>
        by_cases x3 : key.role = slot.role <;> simp_all)]
    exact Nat.le_refl _

/-- One advance step raises: it changes one counter, never lowering it. -/
theorem advance_step (r : Issue → Issue) (renamed state : State) (slot : ClaimSlot) (ordinal : Nat) :
    Raised state (match slot with
      | .scope slot =>
        let slot := { slot with parent := renameScope r slot.parent }
        if renamed.scopes.any (·.id == slot.parent) then { state with scopeOrdinals := raiseCounter state.scopeOrdinals slot ordinal }
        else state
      | .occurrence slot =>
        let slot := { slot with parent := renameScope r slot.parent }
        if renamed.scopes.any (·.id == slot.parent) then
          { state with occurrenceOrdinals := raiseCounter state.occurrenceOrdinals slot ordinal }
        else state
      | .item occurrence =>
        let occurrence := renameId r occurrence
        if renamed.occurrences.any (·.id == occurrence) then
          { state with itemOrdinals := raiseCounter state.itemOrdinals occurrence ordinal }
        else state
      | .position => { state with nextOrder := max ordinal state.nextOrder }
      | .activation slot =>
        let slot := { slot with processInstance := slot.processInstance.rename r }
        if instanceLive renamed slot.processInstance then
          let same (count : ActivationCount) :=
            count.processInstance == slot.processInstance && count.element == slot.element && count.role == slot.role
          { state with activations := { processInstance := slot.processInstance, element := slot.element, role := slot.role
                                        count := max (ordinal - 1) (state.activationCount slot) } ::
                                      state.activations.filter (!same ·) }
        else state) := by
  cases slot <;> dsimp only <;> try split
  all_goals first
    | exact .refl state
    | exact ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
    | exact ⟨rfl, rfl, rfl, fun key => raiseCounter_ge _ _ key _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
    | exact ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun key => raiseCounter_ge _ _ key _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
    | exact ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun key => raiseCounter_ge _ _ key _, fun _ => Nat.le_refl _⟩
    | exact ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun key => activation_raise_ge _ ⟨_, _, _⟩ key _⟩

theorem advance_raised (r : Issue → Issue) (next : TreeMap ClaimSlot Nat compare) (renamed : State) :
    Raised renamed (advanceCounters r next renamed) := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  exact foldl_raised (fun state (x : ClaimSlot × Nat) => advance_step r renamed state x.1 x.2) _ _

theorem foldl_reaches {β : Type} {g : State → β → State} (step : ∀ state x, Raised state (g state x))
    {P : State → Prop} (mono : ∀ a b, Raised a b → P a → P b) {x : β} (hit : ∀ state, P (g state x)) :
    ∀ (entries : List β) (state : State), x ∈ entries → P (entries.foldl g state)
  | [], _, member => nomatch member
  | y :: rest, state, member => by
    rcases List.mem_cons.mp member with same | later
    · subst same
      exact mono _ _ (foldl_raised step rest _) (hit state)
    · exact foldl_reaches step mono hit rest _ later

/-- An advanced scope slot whose renamed parent stands counts past its next ordinal after the commit. -/
theorem advance_scope {r : Issue → Issue} {next : TreeMap ClaimSlot Nat compare} {renamed : State} {slot : ScopeSlot}
    {ordinal : Nat} (advanced : next[ClaimSlot.scope slot]? = some ordinal)
    (stands : renamed.scopes.any (·.id == renameScope r slot.parent) = true) :
    ordinal ≤ (advanceCounters r next renamed).scopeOrdinals.getD { slot with parent := renameScope r slot.parent } 0 := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_reaches (x := (ClaimSlot.scope slot, ordinal)) (fun state x => advance_step r renamed state x.1 x.2)
    (fun a b raised held => Nat.le_trans held (raised.scopeOrdinals _)) (fun state => ?_) _ _
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr advanced)
  dsimp only
  rw [ite_eq_left stands]
  exact raiseCounter_self _ _ _

/-- An activation slot's counter after advancing keeps the slot's last ordinal (one below its next) under its process
instance's renamed name, where that instance stays live. -/
theorem advance_activation {r : Issue → Issue} {next : TreeMap ClaimSlot Nat compare} {renamed : State}
    {slot : ActivationSlot} {ordinal : Nat} (advanced : next[ClaimSlot.activation slot]? = some ordinal)
    (live : instanceLive renamed (slot.processInstance.rename r) = true) :
    ordinal - 1 ≤ (advanceCounters r next renamed).activationCount { slot with processInstance := slot.processInstance.rename r } := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_reaches (x := (ClaimSlot.activation slot, ordinal)) (fun state x => advance_step r renamed state x.1 x.2)
    (fun a b raised held => Nat.le_trans held (raised.activations _)) (fun state => ?_) _ _
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr advanced)
  dsimp only
  rw [ite_eq_left live]
  simp [State.activationCount]
  omega

theorem advance_occurrence {r : Issue → Issue} {next : TreeMap ClaimSlot Nat compare} {renamed : State}
    {slot : ScopeSlot} {ordinal : Nat} (advanced : next[ClaimSlot.occurrence slot]? = some ordinal)
    (stands : renamed.scopes.any (·.id == renameScope r slot.parent) = true) :
    ordinal ≤ (advanceCounters r next renamed).occurrenceOrdinals.getD { slot with parent := renameScope r slot.parent } 0 := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_reaches (x := (ClaimSlot.occurrence slot, ordinal)) (fun state x => advance_step r renamed state x.1 x.2)
    (fun a b raised held => Nat.le_trans held (raised.occurrenceOrdinals _)) (fun state => ?_) _ _
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr advanced)
  dsimp only
  rw [ite_eq_left stands]
  exact raiseCounter_self _ _ _

theorem advance_item {r : Issue → Issue} {next : TreeMap ClaimSlot Nat compare} {renamed : State}
    {occurrence : OccurrenceId} {ordinal : Nat} (advanced : next[ClaimSlot.item occurrence]? = some ordinal)
    (present : renamed.occurrences.any (·.id == renameId r occurrence) = true) :
    ordinal ≤ (advanceCounters r next renamed).itemOrdinals.getD (renameId r occurrence) 0 := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_reaches (x := (ClaimSlot.item occurrence, ordinal)) (fun state x => advance_step r renamed state x.1 x.2)
    (fun a b raised held => Nat.le_trans held (raised.itemOrdinals _)) (fun state => ?_) _ _
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr advanced)
  dsimp only
  rw [ite_eq_left present]
  exact raiseCounter_self _ _ _

/-- **What advancing writes to the activation counters**: a property of the counter list that each activation slot's
write keeps holds after the commit; the write puts the slot's counter, at least one below its next ordinal, under the
renamed name in front of the other slots' counters. -/
theorem advance_activations {P : List ActivationCount → Prop} (r : Issue → Issue) (next : TreeMap ClaimSlot Nat compare)
    (renamed : State) (held : P renamed.activations)
    (write : ∀ (counts : List ActivationCount) (slot : ActivationSlot) (ordinal count : Nat),
      (ClaimSlot.activation slot, ordinal) ∈ next.toList → ordinal - 1 ≤ count → P counts →
      P ({ processInstance := slot.processInstance.rename r, element := slot.element, role := slot.role, count } ::
        counts.filter fun other => !(other.processInstance == slot.processInstance.rename r &&
          other.element == slot.element && other.role == slot.role))) :
    P (advanceCounters r next renamed).activations := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_holds (Q := fun state => P state.activations) _ (fun state x member kept => ?_) renamed held
  obtain ⟨slot, ordinal⟩ := x
  cases slot <;> dsimp only <;> try split
  all_goals first
    | exact kept
    | exact write _ _ _ _ member (Nat.le_max_left _ _) kept

/-! ## The renaming -/

theorem renameBy_fixes (assigned : TreeMap Issue Nat compare) : Fixes (renameBy assigned) := fun _ => rfl

/-- The renaming an assignment defines, as equations: a committed issue stays, an assigned fresh one takes its
ordinal. -/
@[simp] theorem renameBy_committed (assigned : TreeMap Issue Nat compare) (n : Nat) :
    renameBy assigned (.committed n) = .committed n := by
  simp only [renameBy]

@[simp] theorem renameBy_fresh (assigned : TreeMap Issue Nat compare) (unit : UnitKey) (index : Nat) :
    renameBy assigned (.fresh unit index) = (assigned[Issue.fresh unit index]?.map Issue.committed).getD (.fresh unit index) := by
  simp only [renameBy, Std.ExtTreeMap.get?_eq_getElem?]
  cases assigned[Issue.fresh unit index]? <;> rfl

/-- A slot's base, as an equation per counter. -/
theorem slotBase_eq (state : State) (slot : ClaimSlot) : slotBase state slot = match slot with
    | .scope slot => if slot.parent.fresh then 0 else state.scopeOrdinals.getD slot 0
    | .occurrence slot => if slot.parent.fresh then 0 else state.occurrenceOrdinals.getD slot 0
    | .item occurrence => if occurrence.fresh then 0 else state.itemOrdinals.getD occurrence 0
    | .position => state.nextOrder
    | .activation slot => state.activationCount slot + 1 := by
  cases slot <;> rfl

/-! ## What a commit leaves -/

/-- The renaming a commit applies. -/
abbrev commitRenaming (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Issue → Issue := renameBy (assign schedule start log s).1

/-- The renaming a commit applies to the order positions of occurrences, which are their identities' issues while
pending (`Step.positionsOf`). -/
abbrev commitPositioning (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Issue → Issue :=
  renameBy (positionsOf schedule start log s)

/-- The continuation renaming a commit passes to `renameState`. -/
abbrev commitRekey (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Continuation → Continuation :=
  Continuation.rekey (renameId (commitRenaming schedule start log s)) (renameScope (commitRenaming schedule start log s))

/-- The state a commit leaves when the closure issued anything: the settled one renamed and advanced, the issue table
emptied. -/
abbrev compacted (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : State :=
  { advanceCounters (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s) with
    issued := ∅, issuing := .ofRoot .seed, issueNext := 0 }

/-- **A closure that issued nothing commits its state as it is.** -/
theorem compact_empty {start : State} {log : RunLog} {s : State} (empty : s.issued.isEmpty = true) : compact schedule start log s = .ok s := by
  simp [compact, empty]

/-- A commit leaves the settled state when the closure issued nothing, and `compacted` otherwise. -/
theorem compact_cases {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    (s.issued.isEmpty = true ∧ t = s) ∨ (s.issued.isEmpty = false ∧ t = compacted schedule start log s) := by
  unfold compact at ran
  split at ran
  · rename_i empty
    exact .inl ⟨empty, (Except.ok.inj ran).symm⟩
  · rename_i empty
    split at ran
    · cases ran
    · split at ran
      · cases ran
      · exact .inr ⟨by simpa using empty, (Except.ok.inj ran).symm⟩

theorem issueOrder_empty {log : RunLog} {s : State} (empty : s.issued.isEmpty = true) : issueOrder schedule log s = [] := by
  have list : s.issued.toList = [] := by simpa [Std.ExtTreeMap.isEmpty_iff] using empty
  rw [issueOrder_eq]
  simp [list]

theorem assign_empty {start : State} {log : RunLog} {s : State} (empty : s.issued.isEmpty = true) : assign schedule start log s = (∅, ∅) := by
  simp [assign, issueOrder_empty empty, identityClaims, activationOrder, taggedActivations]

/-- A closure that issued nothing renames nothing. -/
theorem commitRenaming_empty {start : State} {log : RunLog} {s : State} (empty : s.issued.isEmpty = true) (issue : Issue) :
    commitRenaming schedule start log s issue = issue := by
  cases issue <;> simp [commitRenaming, renameBy, assign_empty empty]

/-- A closure that issued nothing positions nothing. -/
theorem commitPositioning_empty {start : State} {log : RunLog} {s : State} (empty : s.issued.isEmpty = true)
    (issue : Issue) : commitPositioning schedule start log s issue = issue := by
  cases issue <;> simp [commitPositioning, renameBy, positionsOf, issueOrder_empty empty]

/-- Under `orderInvariant` the assignment reads no run log, and only the end state's issues, occurrences and slots. -/
theorem assign_orderInvariant_congr (start : State) (log log' : RunLog) {s t : State} (issued : s.issued = t.issued)
    (occurrences : s.occurrenceMap = t.occurrenceMap) (slots : s.slots = t.slots) : assign .orderInvariant start log s = assign .orderInvariant start log' t := by
  have rank : issueRank .orderInvariant log = issueRank .orderInvariant log' := funext fun issue => by cases issue <;> rfl
  simp only [assign, issueOrder, rank, taggedActivations, instanceItem?, State.occurrences, issued, occurrences, slots]

/-- `t` is `s` with its counters alone changed. -/
def CountersOnly (s t : State) : Prop :=
  t = { s with scopeOrdinals := t.scopeOrdinals, occurrenceOrdinals := t.occurrenceOrdinals,
               itemOrdinals := t.itemOrdinals, nextOrder := t.nextOrder, activations := t.activations }

/-- Advancing changes the counters alone. -/
theorem advance_frame (r : Issue → Issue) (next : TreeMap ClaimSlot Nat compare) (renamed : State) :
    advanceCounters r next renamed =
      { renamed with scopeOrdinals := (advanceCounters r next renamed).scopeOrdinals,
                     occurrenceOrdinals := (advanceCounters r next renamed).occurrenceOrdinals,
                     itemOrdinals := (advanceCounters r next renamed).itemOrdinals,
                     nextOrder := (advanceCounters r next renamed).nextOrder
                     activations := (advanceCounters r next renamed).activations } := by
  show CountersOnly renamed _
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  generalize next.toList = entries
  have fold : ∀ (f : State → ClaimSlot × Nat → State),
      (∀ state x, CountersOnly renamed state → CountersOnly renamed (f state x)) →
      ∀ (entries : List (ClaimSlot × Nat)) state, CountersOnly renamed state →
        CountersOnly renamed (entries.foldl f state) := by
    intro f keeps entries
    induction entries with
    | nil => intro state framed; exact framed
    | cons x rest step => intro state framed; exact step _ (keeps state x framed)
  refine fold _ (fun state x framed => ?_) entries renamed rfl
  obtain ⟨slot, ordinal⟩ := x
  unfold CountersOnly at framed ⊢
  cases slot <;> dsimp only <;> try split
  all_goals (rw [framed])

/-! ## Issuer names -/

/-- No two neighbours of the list share an index and an issuer name (`sameIssuerName`). -/
def AdjacentApart : List Issue → Prop
  | a :: b :: rest => sameIssuerName a b = false ∧ AdjacentApart (b :: rest)
  | _ => True

theorem AdjacentApart.tail {a : Issue} {rest : List Issue} (apart : AdjacentApart (a :: rest)) : AdjacentApart rest := by
  cases rest with
  | nil => trivial
  | cons b rest => exact apart.2

private theorem scan_found : ∀ (l : List (Issue × ClaimSlot)) (previous : Option Issue),
    (l.foldl (fun acc b => (some b.1, acc.2 || acc.1.any (sameIssuerName · b.1))) (previous, true)).2 = true
  | [], _ => rfl
  | b :: l, _ => by simpa using scan_found l (some b.1)

/-- `issuerCollision`'s pass finds nothing only when no two neighbours share an index and an issuer name. -/
private theorem scan_adjacent : ∀ (l : List (Issue × ClaimSlot)) (previous : Option Issue) (found : Bool),
    (l.foldl (fun acc b => (some b.1, acc.2 || acc.1.any (sameIssuerName · b.1))) (previous, found)).2 = false →
    AdjacentApart (previous.toList ++ l.map Prod.fst)
  | [], previous, _, _ => by cases previous <;> simp [AdjacentApart]
  | b :: l, previous, found, clear => by
    simp only [List.foldl_cons] at clear
    cases step : (found || previous.any (sameIssuerName · b.1)) with
    | true => rw [step, scan_found] at clear; cases clear
    | false =>
      rw [step] at clear
      have rest := scan_adjacent l (some b.1) false clear
      simp only [Bool.or_eq_false_iff] at step
      cases previous with
      | none => simpa using rest
      | some a =>
        simp only [Option.toList_some, List.singleton_append, List.map_cons, Option.any_some] at rest step ⊢
        exact ⟨step.2, rest⟩

/-- A fresh issue between two that share an index and an issuer name shares them too. -/
private theorem between_same {a b c : Issue} (ab : compare a b = .lt) (bc : compare b c = .lt)
    (same : sameIssuerName a c = true) : sameIssuerName a b = true := by
  cases a with
  | committed _ => simp [sameIssuerName] at same
  | fresh u i =>
    cases c with
    | committed _ => simp [sameIssuerName] at same
    | fresh w j =>
      simp only [sameIssuerName, Bool.and_eq_true, beq_iff_eq] at same
      obtain ⟨⟨⟨index, level⟩, print⟩, root⟩ := same
      subst index
      rw [Kernel.Laws.State.UnitKey.spine_level, Kernel.Laws.State.UnitKey.spine_level] at level
      rw [Kernel.Laws.State.UnitKey.spine_fingerprint, Kernel.Laws.State.UnitKey.spine_fingerprint] at print
      obtain ⟨v, rfl, parts⟩ := Kernel.Laws.State.Issue.between_fresh ab bc level print root
      obtain ⟨l, p, r⟩ := parts
      simp only [sameIssuerName, Bool.and_eq_true, beq_iff_eq, Kernel.Laws.State.UnitKey.spine_level,
        Kernel.Laws.State.UnitKey.spine_fingerprint, l, p, r, and_self]

/-- In a strictly ordered list whose neighbours do not share an index and an issuer name, no two issues do. -/
private theorem apart_of_adjacent (K : List Issue) (sorted : K.Pairwise fun a b => compare a b = .lt)
    (adjacent : AdjacentApart K) : ∀ x ∈ K, ∀ y ∈ K, compare x y = .lt → sameIssuerName x y = false := by
  induction K with
  | nil => intro x member; cases member
  | cons a rest ih =>
    intro x xm y ym lt
    rw [List.pairwise_cons] at sorted
    rcases List.mem_cons.mp xm with rfl | xr
    · rcases List.mem_cons.mp ym with rfl | yr
      · have := Std.OrientedCmp.gt_of_lt lt
        rw [lt] at this
        cases this
      · cases rest with
        | nil => cases yr
        | cons b rest =>
          have ab : sameIssuerName x b = false := adjacent.1
          rcases List.mem_cons.mp yr with rfl | yr'
          · exact ab
          · cases hxy : sameIssuerName x y with
            | false => rfl
            | true =>
              have := between_same (sorted.1 b (List.mem_cons_self ..)) ((List.pairwise_cons.mp sorted.2).1 y yr') hxy
              rw [ab] at this
              cases this
    · rcases List.mem_cons.mp ym with rfl | yr
      · have := Std.OrientedCmp.gt_of_lt (sorted.1 x xr)
        rw [lt] at this
        cases this
      · exact ih sorted.2 adjacent.tail x xr y yr lt

/-- **Issuer names apart** (DC12): a commit that compacts leaves no two distinct units that issued at a common index and
agree on depth, fingerprint and root, the fixed-size name the TypeScript kernel orders issuers by. Every unit numbers
its issues from 0 (`Step.microStep`), so any two distinct issuers share index 0. -/
theorem compact_issuersNamed {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {unit other : UnitKey}
    {index : Nat} (held : Issue.fresh unit index ∈ s.issued) (held' : Issue.fresh other index ∈ s.issued)
    (apart : unit ≠ other) :
    ¬ (unit.spine.level = other.spine.level ∧ unit.spine.fingerprint = other.spine.fingerprint ∧ unit.root = other.root) := by
  rintro ⟨level, print, root⟩
  have clear : issuerCollision s.issued = false := by
    unfold compact at ran
    split at ran
    · rename_i empty
      rw [Std.ExtTreeMap.isEmpty_iff] at empty
      rw [empty] at held
      simp at held
    · split at ran
      · cases ran
      · split at ran
        · cases ran
        · rename_i collision
          simpa using collision
  unfold issuerCollision at clear
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList] at clear
  have adjacent := scan_adjacent _ none false clear
  simp only [Option.toList_none, List.nil_append] at adjacent
  have sorted : (s.issued.toList.map Prod.fst).Pairwise fun a b => compare a b = .lt :=
    List.pairwise_map.mpr Std.ExtTreeMap.ordered_keys_toList
  have mem : ∀ issue ∈ s.issued, issue ∈ s.issued.toList.map Prod.fst := fun issue member => by
    rw [Std.ExtTreeMap.map_fst_toList_eq_keys]
    exact Std.ExtTreeMap.mem_keys.mpr member
  have named : ∀ x y : UnitKey, x.spine.level = y.spine.level → x.spine.fingerprint = y.spine.fingerprint →
      x.root = y.root → sameIssuerName (.fresh x index) (.fresh y index) = true := fun _ _ l p r => by
    simp [sameIssuerName, l, p, r]
  cases order : compare (Issue.fresh unit index) (.fresh other index) with
  | lt =>
    have := apart_of_adjacent _ sorted adjacent _ (mem _ held) _ (mem _ held') order
    rw [named _ _ level print root] at this
    cases this
  | gt =>
    have := apart_of_adjacent _ sorted adjacent _ (mem _ held') _ (mem _ held) (Std.OrientedCmp.lt_of_gt order)
    rw [named _ _ level.symm print.symm root.symm] at this
    cases this
  | eq =>
    cases Std.LawfulEqCmp.eq_of_compare order
    exact apart rfl


/-- `Continuation.body?`'s equations, for modules that cannot open `Kernel.Step.Commit`'s bodies. -/
@[simp] theorem _root_.Kernel.Continuation.body?_flow : Continuation.flow.body? = none := by
  simp only [Continuation.body?]

@[simp] theorem _root_.Kernel.Continuation.body?_multiInstance (body : OccurrenceId) :
    (Continuation.multiInstance body).body? = some body := by
  simp only [Continuation.body?]

@[simp] theorem _root_.Kernel.Continuation.body?_compensation (run : ScopeOccurrenceId) :
    (Continuation.compensation run).body? = none := by
  simp only [Continuation.body?]

/-- `Continuation.rekey`'s equations, for the commit's clause laws over occurrences' continuations. -/
@[simp] theorem _root_.Kernel.Continuation.rekey_flow (occurrence : OccurrenceId → OccurrenceId)
    (scope : ScopeOccurrenceId → ScopeOccurrenceId) : Continuation.flow.rekey occurrence scope = .flow := by
  simp only [Continuation.rekey]

@[simp] theorem _root_.Kernel.Continuation.rekey_multiInstance (occurrence : OccurrenceId → OccurrenceId)
    (scope : ScopeOccurrenceId → ScopeOccurrenceId) (body : OccurrenceId) :
    (Continuation.multiInstance body).rekey occurrence scope = .multiInstance (occurrence body) := by
  simp only [Continuation.rekey]

@[simp] theorem _root_.Kernel.Continuation.rekey_compensation (occurrence : OccurrenceId → OccurrenceId)
    (scope : ScopeOccurrenceId → ScopeOccurrenceId) (run : ScopeOccurrenceId) :
    (Continuation.compensation run).rekey occurrence scope = .compensation (scope run) := by
  simp only [Continuation.rekey]

end Kernel.Laws.Step
