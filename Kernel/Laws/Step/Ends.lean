module

public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.State.Removal

/-! # Laws of the step function: the end facts of an input

What an input on a running instance keeps of its end facts, from its start (`EndsKept`): they are distinct, none names
an occurrence the state still holds, and every begun occurrence the start held and the state no longer does has ended
under the key it had at the start. It is an invariant of the input indexed by its start, as the cancellation lane's
`KeepsScopes` is indexed by the before-state, so it passes through each hook by the hook's lemma, which is generic in
the invariant, once every state operation the hook applies frames the end facts (`EndsStep`).

It is not an invariant of `Laws.Step.Phases`: the completion pipeline (`Step.complete`) removes the completing
occurrence, runs its continuation's hooks and only then journals its end, so between the two the occurrence is gone and
not yet ended. The invariant names that occurrence while the continuation runs (`EndsKept`'s exemption), and the
pipeline keeps the invariant as a unit (`complete_ends`), given the hooks keep it under every exemption. The module reads
no body. Nothing executable imports it.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step
open Kernel.Laws.State (WellFormed key Counted CountsGrow occurrenceIds)

/-- The keys of the end facts of the input in progress: its journal's and its draft's. -/
def endKeys (s : State) : List OccurrenceKey := (s.journal.flatMap (·.ended) ++ s.draft.ended).map (·.1)

theorem counted_grow {s t : State} (grow : CountsGrow s t) {k : OccurrenceKey} (counted : Counted s k) : Counted t k := by
  obtain ⟨count, member, named, ⟨element, role, below⟩⟩ := counted
  obtain ⟨grown, inside, named', ⟨element', role', more⟩⟩ := grow count member
  exact ⟨grown, inside, named'.trans named, element'.trans element, role'.trans role, Nat.le_trans below more⟩

/-- What a state operation from `s` to `t` does to the end facts, sparing `spare`'s removal from being journalled: every
occurrence `t` holds is one of `s` under the same key, unchanged if begun, or a fresh one whose key `s`'s counters have
not issued; the end facts `t` adds are the keys in `s` of begun occurrences of `s` it no longer holds, each once, among
them every such occurrence but `spare`; the instance, the counters and the issue counter stay or grow. -/
structure EndsStep (s t : State) (spare : Option Nat) : Prop where
  instanceId : t.instanceId = s.instanceId
  issued : s.nextIssue ≤ t.nextIssue
  grow : CountsGrow s t
  held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
    (s.nextIssue ≤ o'.id ∧ ¬ Counted s (key t o'))
  ends : ∃ gone : List Occurrence, (endKeys t).Perm (endKeys s ++ gone.map (key s)) ∧ (gone.map (·.id)).Nodup ∧
    (∀ o ∈ gone, o ∈ s.occurrences ∧ spare ≠ some o.id ∧ o.id ∉ occurrenceIds t) ∧
    ∀ o ∈ s.occurrences, o.begun = true → o.id ∉ occurrenceIds t → spare ≠ some o.id → o ∈ gone

/-- What an input keeps of its end facts from its start `b`, with `x`, a removed occurrence's identifier and key, exempt
while its completion's continuation runs: `b`'s begun occurrences keep their records and keys while held; the end
facts are distinct and name no held occurrence and only issued activations; each begun occurrence of `b` no longer held
has ended under its key in `b`, but `x`, which has not ended, under a key no held occurrence has. -/
structure EndsKept (b : State) (x : Option (Nat × OccurrenceKey)) (s : State) : Prop where
  below : ∀ o ∈ b.occurrences, o.id < b.nextIssue
  instanceId : s.instanceId = b.instanceId
  issued : b.nextIssue ≤ s.nextIssue
  records : ∀ o ∈ b.occurrences, o.begun = true → ∀ o' ∈ s.occurrences, o'.id = o.id → o' = o
  keys : ∀ o ∈ b.occurrences, o.begun = true → o ∈ s.occurrences → key s o = key b o
  nodup : (endKeys s).Nodup
  present : ∀ o ∈ s.occurrences, key s o ∉ endKeys s
  counted : ∀ k ∈ endKeys s, Counted s k
  removed : ∀ o ∈ b.occurrences, o.begun = true → o.id ∉ occurrenceIds s → (∀ y, x = some y → y.1 ≠ o.id) →
    key b o ∈ endKeys s
  pending : ∀ y, x = some y → y.1 < s.nextIssue ∧ y.1 ∉ occurrenceIds s ∧ y.2 ∉ endKeys s ∧
    (∀ o ∈ s.occurrences, key s o ≠ y.2) ∧ Counted s y.2 ∧ ∀ o ∈ b.occurrences, o.begun = true → o.id = y.1 → key b o = y.2

/-- An input's invariant of its end facts beside `WellFormed`. -/
def EndsInv (b : State) (x : Option (Nat × OccurrenceKey)) (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ EndsKept b x s

/-- A well-formed state that has ended nothing keeps its own end facts. -/
theorem EndsKept.start {program : Program} {b : State} (formed : WellFormed program b) (empty : endKeys b = []) :
    EndsKept b none b where
  below := formed.issued.occurrences
  instanceId := rfl
  issued := Nat.le_refl _
  records _ member _ _ inside same := Laws.State.nodup_map_eq formed.distinct.occurrences inside member same
  keys _ _ _ _ := rfl
  nodup := by rw [empty]; exact .nil
  present _ _ := by rw [empty]; exact List.not_mem_nil
  counted _ member := by rw [empty] at member; cases member
  removed o member _ absent := absurd (List.mem_map.mpr ⟨o, member, rfl⟩) absent
  pending _ none := by cases none

/-! ### One state operation -/

section Step

variable {program : Program} {b s t : State} {x : Option (Nat × OccurrenceKey)} {spare : Option Nat}

/-- The keys in `s` of distinct occurrences of a well-formed `s` are distinct. -/
private theorem keys_nodup (formed : WellFormed program s) {gone : List Occurrence} (ids : (gone.map (·.id)).Nodup)
    (within : ∀ o ∈ gone, o ∈ s.occurrences) : (gone.map (key s)).Nodup :=
  List.pairwise_map.mpr ((List.pairwise_map.mp ids).imp_of_mem fun inFirst inSecond apart same =>
    apart (congrArg Occurrence.id
      (Laws.State.nodup_map_eq formed.distinct.keys (within _ inFirst) (within _ inSecond) same)))

/-- An occurrence `t` holds was held by `s` under the same identifier, so a begun one of `b` is its record. -/
private theorem held_record (kept : EndsKept b x s) (step : EndsStep s t spare) {o : Occurrence}
    (member : o ∈ b.occurrences) (begun : o.begun = true) {o' : Occurrence} (inside : o' ∈ t.occurrences)
    (same : o'.id = o.id) : o' = o ∧ o ∈ s.occurrences ∧ key t o' = key s o := by
  rcases step.held o' inside with ⟨old, held, named, ⟨keyed, unchanged⟩⟩ | ⟨fresh, _⟩
  · obtain rfl := kept.records o member begun old held (named.symm.trans same)
    obtain rfl := unchanged begun
    exact ⟨rfl, held, keyed⟩
  · have := kept.below o member
    have := kept.issued
    omega

/-- The parts of `EndsKept` that no exemption reads pass through an operation that frames the end facts. -/
private theorem advance_common (formed : WellFormed program s) (kept : EndsKept b x s) (step : EndsStep s t spare)
    {gone : List Occurrence} (perm : (endKeys t).Perm (endKeys s ++ gone.map (key s)))
    (ids : (gone.map (·.id)).Nodup) (within : ∀ o ∈ gone, o ∈ s.occurrences ∧ spare ≠ some o.id ∧ o.id ∉ occurrenceIds t) :
    (∀ o ∈ b.occurrences, o.begun = true → ∀ o' ∈ t.occurrences, o'.id = o.id → o' = o) ∧
    (∀ o ∈ b.occurrences, o.begun = true → o ∈ t.occurrences → key t o = key b o) ∧
    (endKeys t).Nodup ∧ (∀ o ∈ t.occurrences, key t o ∉ endKeys t) ∧ ∀ k ∈ endKeys t, Counted t k := by
  have goneCounted : ∀ o ∈ gone, Counted s (key s o) := fun o inside => formed.occurrencesCounted o (within o inside).1
  refine ⟨fun o member begun o' inside same => (held_record kept step member begun inside same).1,
    fun o member begun inside => ?_, ?_, fun o' inside ended => ?_, fun k ended => ?_⟩
  · obtain ⟨_, held, keyed⟩ := held_record kept step member begun inside rfl
    exact keyed.trans (kept.keys o member begun held)
  · refine perm.nodup_iff.mpr (List.nodup_append.mpr ⟨kept.nodup, keys_nodup formed ids fun o inside => (within o inside).1,
      fun k old k' new same => ?_⟩)
    obtain ⟨o, inside, rfl⟩ := List.mem_map.mp new
    exact kept.present o (within o inside).1 (same ▸ old)
  · rcases List.mem_append.mp (perm.mem_iff.mp ended) with old | new
    · rcases step.held o' inside with ⟨o, held, _, ⟨keyed, _⟩⟩ | ⟨_, uncounted⟩
      · exact kept.present o held (keyed ▸ old)
      · exact uncounted (kept.counted _ old)
    · obtain ⟨g, inGone, keyed⟩ := List.mem_map.mp new
      rcases step.held o' inside with ⟨o, held, named, ⟨keyedHeld, _⟩⟩ | ⟨_, uncounted⟩
      · obtain rfl := Laws.State.nodup_map_eq formed.distinct.keys (within g inGone).1 held (keyed.trans keyedHeld)
        exact (within g inGone).2.2 (named ▸ List.mem_map.mpr ⟨o', inside, rfl⟩)
      · exact uncounted (keyed ▸ goneCounted g inGone)
  · rcases List.mem_append.mp (perm.mem_iff.mp ended) with old | new
    · exact counted_grow step.grow (kept.counted k old)
    · obtain ⟨g, inGone, rfl⟩ := List.mem_map.mp new
      exact counted_grow step.grow (goneCounted g inGone)

/-- An end fact of `s` stays one of `t`. -/
private theorem ended_kept {gone : List Occurrence} (perm : (endKeys t).Perm (endKeys s ++ gone.map (key s)))
    {k : OccurrenceKey} (ended : k ∈ endKeys s) : k ∈ endKeys t :=
  perm.mem_iff.mpr (List.mem_append_left _ ended)

/-- A begun occurrence of `b` that `t` no longer holds has ended in `t`, unless `t`'s exemption or the operation's spare
names it. -/
private theorem removed_advance (kept : EndsKept b x s) {gone : List Occurrence}
    (perm : (endKeys t).Perm (endKeys s ++ gone.map (key s)))
    (complete : ∀ o ∈ s.occurrences, o.begun = true → o.id ∉ occurrenceIds t → spare ≠ some o.id → o ∈ gone)
    {o : Occurrence} (member : o ∈ b.occurrences) (begun : o.begun = true) (absent : o.id ∉ occurrenceIds t)
    (spared : spare ≠ some o.id) (exempt : ∀ y, x = some y → y.1 ≠ o.id) : key b o ∈ endKeys t := by
  by_cases inS : o.id ∈ occurrenceIds s
  · obtain ⟨o'', held, named⟩ := List.mem_map.mp inS
    obtain rfl := kept.records o member begun o'' held named
    rw [← kept.keys o'' member begun held]
    exact perm.mem_iff.mpr (List.mem_append_right _ (List.mem_map.mpr ⟨o'', complete o'' held begun absent spared, rfl⟩))
  · exact ended_kept perm (kept.removed o member begun inS exempt)

/-- An operation that frames the end facts sparing nothing keeps `EndsKept` under the same exemption. -/
theorem EndsKept.step (formed : WellFormed program s) (kept : EndsKept b x s) (step : EndsStep s t none) :
    EndsKept b x t := by
  obtain ⟨gone, perm, ids, ⟨within, complete⟩⟩ := step.ends
  obtain ⟨records, keys, nodup, ⟨present, counted⟩⟩ := advance_common formed kept step perm ids within
  refine ⟨kept.below, step.instanceId.trans kept.instanceId, Nat.le_trans kept.issued step.issued, records, keys, nodup,
    present, counted, fun o member begun absent exempt =>
      removed_advance kept perm complete member begun absent (by simp) exempt, fun y named => ?_⟩
  obtain ⟨issued, absent, unended, ⟨unheld, countedY, keyed⟩⟩ := kept.pending y named
  refine ⟨Nat.lt_of_lt_of_le issued step.issued, fun held => ?_, fun ended => ?_, fun o' inside same => ?_,
    counted_grow step.grow countedY, keyed⟩
  · obtain ⟨o', inside, same⟩ := List.mem_map.mp held
    rcases step.held o' inside with ⟨o, old, named, ⟨_, _⟩⟩ | ⟨fresh, _⟩
    · exact absent (List.mem_map.mpr ⟨o, old, named.symm.trans same⟩)
    · omega
  · rcases List.mem_append.mp (perm.mem_iff.mp ended) with old | new
    · exact unended old
    · obtain ⟨g, inGone, keyed⟩ := List.mem_map.mp new
      exact unheld g (within g inGone).1 keyed
  · rcases step.held o' inside with ⟨o, old, _, ⟨keyedHeld, _⟩⟩ | ⟨_, uncounted⟩
    · exact unheld o old (keyedHeld ▸ same)
    · exact uncounted (same ▸ countedY)

/-- Removing the begun occurrence `occurrence` without journalling its end exempts it: it is gone, and its key is
neither ended nor held. -/
theorem EndsKept.remove (formed : WellFormed program s) (kept : EndsKept b none s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) (step : EndsStep s t (some occurrence.id))
    (gone : occurrence.id ∉ occurrenceIds t) : EndsKept b (some (occurrence.id, key s occurrence)) t := by
  obtain ⟨removedList, perm, ids, ⟨within, complete⟩⟩ := step.ends
  obtain ⟨records, keys, nodup, ⟨present, counted⟩⟩ := advance_common formed kept step perm ids within
  refine ⟨kept.below, step.instanceId.trans kept.instanceId, Nat.le_trans kept.issued step.issued, records, keys, nodup,
    present, counted, fun o inB begun absent exempt =>
      removed_advance kept perm complete inB begun absent (fun same => exempt _ rfl (Option.some.inj same))
        (by simp), fun y named => ?_⟩
  obtain rfl := Option.some.inj named
  refine ⟨Nat.lt_of_lt_of_le (formed.issued.occurrences occurrence member) step.issued, gone, fun ended => ?_,
    fun o' inside same => ?_, counted_grow step.grow (formed.occurrencesCounted occurrence member),
    fun o inB begun named => ?_⟩
  · rcases List.mem_append.mp (perm.mem_iff.mp ended) with old | new
    · exact kept.present occurrence member old
    · obtain ⟨g, inGone, keyed⟩ := List.mem_map.mp new
      obtain rfl := Laws.State.nodup_map_eq formed.distinct.keys (within g inGone).1 member keyed
      exact (within g inGone).2.1 rfl
  · rcases step.held o' inside with ⟨o, old, sameId, ⟨keyedHeld, _⟩⟩ | ⟨_, uncounted⟩
    · obtain rfl := Laws.State.nodup_map_eq formed.distinct.keys old member (keyedHeld.symm.trans same)
      exact gone (sameId ▸ List.mem_map.mpr ⟨o', inside, rfl⟩)
    · exact uncounted (same ▸ formed.occurrencesCounted occurrence member)
  · obtain rfl := kept.records o inB begun occurrence member named.symm
    exact (kept.keys occurrence inB begun member).symm

end Step

/-- Journalling the exempt occurrence's end lifts the exemption. -/
theorem EndsKept.record {b s : State} {id : Nat} {k : OccurrenceKey} (kept : EndsKept b (some (id, k)) s)
    (terminal : Terminal) : EndsKept b none (s.recordEnd k terminal) := by
  obtain ⟨issued, absent, unended, ⟨unheld, countedK, keyed⟩⟩ := kept.pending _ rfl
  have ends : endKeys (s.recordEnd k terminal) = endKeys s ++ [k] := by
    rw [Laws.State.recordEnd_eq]
    simp [endKeys]
  have same : ∀ o, key (s.recordEnd k terminal) o = key s o := fun o =>
    Laws.State.key_congr (Laws.State.instanceOf_congr (Laws.State.recordEnd_scopes s k terminal)
      (by rw [Laws.State.recordEnd_eq]) o.scope)
  have occurrences : (s.recordEnd k terminal).occurrences = s.occurrences := by rw [Laws.State.recordEnd_eq]
  have counters : (s.recordEnd k terminal).activations = s.activations := by rw [Laws.State.recordEnd_eq]
  refine ⟨kept.below, by rw [Laws.State.recordEnd_eq]; exact kept.instanceId,
    by rw [Laws.State.recordEnd_eq]; exact kept.issued, ?_, ?_, ?_, ?_, ?_, ?_, fun _ none => by cases none⟩
  · rw [occurrences]; exact kept.records
  · intro o member begun inside
    rw [same]
    exact kept.keys o member begun (occurrences ▸ inside)
  · rw [ends]
    exact List.nodup_append.mpr ⟨kept.nodup, List.nodup_cons.mpr ⟨List.not_mem_nil, List.nodup_nil⟩, fun _ old _ new same =>
      unended ((List.mem_singleton.mp new) ▸ same ▸ old)⟩
  · intro o inside ended
    rw [ends, same] at *
    rcases List.mem_append.mp ended with old | new
    · exact kept.present o (occurrences ▸ inside) old
    · exact unheld o (occurrences ▸ inside) (List.mem_singleton.mp new)
  · intro k' ended
    rw [ends] at ended
    rcases List.mem_append.mp ended with old | new
    · exact Laws.State.Counted.congr counters (kept.counted k' old)
    · exact (List.mem_singleton.mp new) ▸ Laws.State.Counted.congr counters countedK
  · intro o member begun absent _
    rw [ends, occurrenceIds, occurrences] at *
    by_cases named : o.id = id
    · exact List.mem_append_right _ (List.mem_singleton.mpr (keyed o member begun named))
    · exact List.mem_append_left _ (kept.removed o member begun absent fun y same => by
        obtain rfl := Option.some.inj same
        exact fun equal => named equal.symm)

/-- An operation that moves nothing `EndsKept` reads but the issue counter, which it may raise, keeps it. -/
theorem EndsKept.unmoved {b s t : State} {x : Option (Nat × OccurrenceKey)} (kept : EndsKept b x s)
    (occurrences : t.occurrences = s.occurrences) (counters : t.activations = s.activations)
    (tree : t.scopes = s.scopes ∧ t.instanceId = s.instanceId) (issued : s.nextIssue ≤ t.nextIssue)
    (ends : endKeys t = endKeys s) : EndsKept b x t := by
  have same : ∀ o, key t o = key s o := fun o =>
    Laws.State.key_congr (Laws.State.instanceOf_congr tree.1 tree.2 o.scope)
  have ids : occurrenceIds t = occurrenceIds s := by rw [occurrenceIds, occurrences]; rfl
  refine ⟨kept.below, tree.2.trans kept.instanceId, Nat.le_trans kept.issued issued, occurrences ▸ kept.records,
    fun o member begun inside => (same o).trans (kept.keys o member begun (occurrences ▸ inside)), ends ▸ kept.nodup,
    fun o inside => ?_, fun k ended => Laws.State.Counted.congr counters (kept.counted k (ends ▸ ended)), ?_,
    fun y named => ?_⟩
  · rw [same, ends]
    exact kept.present o (occurrences ▸ inside)
  · rw [ids, ends]
    exact kept.removed
  · obtain ⟨below, absent, unended, ⟨unheld, countedY, keyed⟩⟩ := kept.pending y named
    exact ⟨Nat.lt_of_lt_of_le below issued, ids ▸ absent, ends ▸ unended,
      fun o inside => (same o) ▸ unheld o (occurrences ▸ inside), Laws.State.Counted.congr counters countedY, keyed⟩

/-- Pending lemma requests R15 (`Kernel.Laws.State`): the state operations the hooks apply frame the end facts,
sparing nothing (`EndsStep`): entering a scope occurrence or a called root, reserving, leaving or clearing a scope
occurrence (which journal the begun occurrences they remove), disarming (which removes only reservations) and a
variable write or removal. -/
structure PendingHookFrames : Prop where
  enterScope_frame : ∀ (program : Program) (s : State) element parent locals owner, WellFormed program s →
    EndsStep s (s.enterScope element parent locals owner).1 none
  enterCalled_frame : ∀ (program : Program) (s : State) called call variables definition, WellFormed program s →
    EndsStep s (s.enterCalled called call variables definition).1 none
  reserve_frame : ∀ (program : Program) (s : State) element scope, WellFormed program s →
    EndsStep s (s.reserve element scope).1 none
  leaveScope_frame : ∀ (program : Program) (s : State) scope, WellFormed program s → EndsStep s (s.leaveScope scope) none
  clearInside_frame : ∀ (program : Program) (s : State) scope keep, WellFormed program s →
    EndsStep s (s.clearInside scope keep) none
  disarm_frame : ∀ (program : Program) (s : State) host, WellFormed program s → EndsStep s (s.disarm host) none
  setVariable_frame : ∀ (program : Program) (s : State) target name value, WellFormed program s →
    EndsStep s (s.setVariable target name value) none
  removeVariable_frame : ∀ (program : Program) (s : State) target name, WellFormed program s →
    EndsStep s (s.removeVariable target name) none

/-! ### The completion pipeline -/

/-- Pending lemma requests R15 (`Kernel.Laws.State`): what the completion pipeline's own state operations do to the end
facts. Starting a reservation begins an unbegun occurrence under its key and ends nothing; removing the completing
occurrence ends every begun occurrence inside the scope occurrences it owns, but not itself, which it removes. -/
structure PendingPipelineFrames : Prop where
  startReserved_frame : ∀ (program : Program) (s : State) occurrence sourceType, WellFormed program s →
    occurrence ∈ s.occurrences → EndsStep s (s.startReserved occurrence sourceType).1 none
  removeOccurrence_frame : ∀ (program : Program) (s : State) occurrence, WellFormed program s →
    occurrence ∈ s.occurrences →
    (∀ item ∈ s.openItems, item.occurrence ≠ occurrence.id ∧ item.attachedTo ≠ some occurrence.id) →
    EndsStep s (s.removeOccurrence occurrence.id) (some occurrence.id) ∧
      occurrence.id ∉ occurrenceIds (s.removeOccurrence occurrence.id)

/-- The completion pipeline keeps an input's end facts, as a unit: its hooks before the removal and its continuation
keep `EndsInv`, the continuation with the completing occurrence exempt, and the end it journals last lifts the
exemption (`EndsKept.remove`, `EndsKept.record`). The one obligation `Step`'s phases cannot carry (module
documentation). -/
theorem complete_ends {hooks : Hooks} {b : State} (contract : ∀ x, HookContract hooks (EndsInv b x))
    (phases : Phases WellFormed) (facts : StateFacts) (frames : PendingPipelineFrames) {ctx : Ctx} {id : Nat}
    {leave : Leave} {writes : List (String × Value)} {rule : WriteRule} {state after : State}
    (holds : EndsInv b none ctx.program state)
    (free : ∀ request, Laws.State.Queued state request → id ∉ Laws.State.names request)
    (ran : complete hooks ctx id leave writes rule state = .ok after) : EndsInv b none ctx.program after := by
  rcases complete_ok ran with ⟨_, same⟩ | ⟨occurrence, sourceType, begun, pipeline⟩
  · exact same ▸ holds
  obtain ⟨left, selected, written, pipeline⟩ := pipeline
  obtain ⟨found, _, leaving, pipeline⟩ := pipeline
  obtain ⟨made, _, writing, finishes⟩ := pipeline
  obtain ⟨member, named⟩ := facts.found _ _ _ found
  obtain ⟨begunMember, begunFlag, begunId, reservation⟩ := facts.startReserved state occurrence sourceType member
  obtain ⟨begunScope, reservedScopes⟩ := reservation
  have closedFormed := phases.startReserved _ state occurrence sourceType holds.1 member (named ▸ free)
  rw [named] at closedFormed
  have startedKept := holds.2.step holds.1 (frames.startReserved_frame _ state occurrence sourceType holds.1 member)
  have closedKept : EndsKept b none ((state.startReserved occurrence sourceType).1.closeOwnItems id) := by
    rw [Laws.State.closeOwnItems_eq]
    exact startedKept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) rfl
  obtain ⟨closedFrame, closedFree⟩ := facts.closeOwnItems (state.startReserved occurrence sourceType).1 id
  subst made
  have inClosed := closedFrame.begun _ begunMember begunFlag
  obtain ⟨leftHolds, leftFrame, detached⟩ := (contract none).leave _ _ _ _ ⟨closedFormed, closedKept⟩ inClosed leaving
  have stands : ScopeStands left (state.startReserved occurrence sourceType).2.scope := by
    obtain ⟨entry, inside, same⟩ := phases.housed _ state occurrence holds.1 member
    refine ⟨entry, ?_, same.trans begunScope.symm⟩
    rw [leftFrame.scopes, closedFrame.scopes, reservedScopes]
    exact inside
  obtain ⟨writtenHolds, writtenFrame⟩ := (contract none).writeOutputs _ _ _ _ _ _ leftHolds stands writing
  have identity : (state.startReserved occurrence sourceType).2.id = id := begunId.trans named
  have free : ∀ (frame : State), (∀ item ∈ frame.openItems, item ∈ left.openItems) →
      ∀ item ∈ frame.openItems, item.occurrence ≠ (state.startReserved occurrence sourceType).2.id ∧
        item.attachedTo ≠ some (state.startReserved occurrence sourceType).2.id := fun frame within item member => by
    rw [identity]
    have inLeft := within item member
    exact ⟨closedFree item (leftFrame.items item inLeft), identity ▸ detached item inLeft⟩
  have inWritten := writtenFrame.begun _ (leftFrame.begun _ inClosed begunFlag) begunFlag
  cases finishes with
  | raised continuing =>
    obtain ⟨removedFormed, removedStands⟩ := phases.removeOccurrence _ written _ writtenHolds.1 inWritten
      (free written writtenFrame.items)
    obtain ⟨removing, gone⟩ := frames.removeOccurrence_frame _ written _ writtenHolds.1 inWritten
      (free written writtenFrame.items)
    have recorded := (writtenHolds.2.remove writtenHolds.1 inWritten removing gone).record .cancelled
    rw [identity] at removedFormed removedStands recorded
    obtain ⟨entry, inside, entryNamed⟩ := removedStands
    rw [Laws.State.keyOf_eq] at continuing
    exact continueAfter_keeps (contract none) ⟨phases.recordEnd _ _ _ _ removedFormed, recorded⟩
      ⟨entry, (facts.recordEnd _ _ _).symm ▸ inside, entryNamed⟩ continuing
  | @left _ _ retained _ _ retaining continuing =>
    obtain ⟨retainedHolds, retainedFrame⟩ := (contract none).completed _ _ _ _ writtenHolds inWritten retaining
    have inRetained := retainedFrame.begun _ inWritten begunFlag
    have unhung := free _ fun item member => writtenFrame.items item (retainedFrame.items item member)
    obtain ⟨removedFormed, removedStands⟩ := phases.removeOccurrence _ _ _ retainedHolds.1 inRetained unhung
    obtain ⟨removing, gone⟩ := frames.removeOccurrence_frame _ _ _ retainedHolds.1 inRetained unhung
    have exempt := retainedHolds.2.remove retainedHolds.1 inRetained removing gone
    rw [identity] at removedFormed removedStands exempt
    obtain ⟨continuedFormed, continuedKept⟩ := continueAfter_keeps (contract _) ⟨removedFormed, exempt⟩ removedStands
      continuing
    have keyed : key retained (state.startReserved occurrence sourceType).2 =
        key written (state.startReserved occurrence sourceType).2 :=
      Laws.State.key_congr (Laws.State.instanceOf_congr retainedFrame.scopes
        (retainedHolds.2.instanceId.trans writtenHolds.2.instanceId.symm) _)
    rw [Laws.State.keyOf_eq, ← keyed]
    exact ⟨phases.recordEnd _ _ _ _ continuedFormed, continuedKept.record .completed⟩

end Kernel.Laws.Step
