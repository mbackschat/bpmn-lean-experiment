module

public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.Step.EndsFrames

/-! # Laws of the step function: the end facts of an input

What an input on a running instance keeps of its end facts, from its start (`EndsKept`): they are distinct, none names
an occurrence the state still holds, and every begun occurrence the start held and the state no longer does has ended
under the key it had at the start. It is an invariant of the input indexed by its start, as the cancellation lane's
`KeepsScopes` is indexed by the before-state, so it passes through each hook by the hook's lemma, which is generic in
the invariant, since every state operation the hook applies frames the end facts (`EndsStep`,
`Kernel.Laws.Step.EndsFrames`).

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

/-- What an input keeps of its end facts from its start `b`, with `x`, a removed occurrence's identifier and key, exempt
while its completion's continuation runs: `b`'s begun occurrences keep their records and keys while held; the end
facts are distinct and name no held occurrence and only issued activations; each begun occurrence of `b` no longer held
has ended under its key in `b`, but `x`, which has not ended, under a key no held occurrence has. -/
structure EndsKept (b : State) (x : Option (OccurrenceId × OccurrenceKey)) (s : State) : Prop where
  below : ∀ o ∈ b.occurrences, Laws.State.OccurrenceIssued b o.id
  instanceId : s.instanceId = b.instanceId
  issued : Laws.State.OccurrenceGrows b s
  records : ∀ o ∈ b.occurrences, o.begun = true → ∀ o' ∈ s.occurrences, o'.id = o.id → o' = o
  keys : ∀ o ∈ b.occurrences, o.begun = true → o ∈ s.occurrences → key s o = key b o
  nodup : (endKeys s).Nodup
  present : ∀ o ∈ s.occurrences, key s o ∉ endKeys s
  counted : ∀ k ∈ endKeys s, Counted s k
  removed : ∀ o ∈ b.occurrences, o.begun = true → o.id ∉ occurrenceIds s → (∀ y, x = some y → y.1 ≠ o.id) →
    key b o ∈ endKeys s
  pending : ∀ y, x = some y → Laws.State.OccurrenceIssued s y.1 ∧ y.1 ∉ occurrenceIds s ∧ y.2 ∉ endKeys s ∧
    (∀ o ∈ s.occurrences, key s o ≠ y.2) ∧ Counted s y.2 ∧ ∀ o ∈ b.occurrences, o.begun = true → o.id = y.1 → key b o = y.2

/-- An input's invariant of its end facts beside `WellFormed`. -/
def EndsInv (b : State) (x : Option (OccurrenceId × OccurrenceKey)) (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ EndsKept b x s

/-- A well-formed state that has ended nothing keeps its own end facts. -/
theorem EndsKept.start {program : Program} {b : State} (formed : WellFormed program b) (empty : endKeys b = []) :
    EndsKept b none b where
  below := formed.issued.occurrences
  instanceId := rfl
  issued := .refl _
  records _ member _ _ inside same := Laws.State.nodup_map_eq formed.distinct.occurrences inside member same
  keys _ _ _ _ := rfl
  nodup := by rw [empty]; exact .nil
  present _ _ := by rw [empty]; exact List.not_mem_nil
  counted _ member := by rw [empty] at member; cases member
  removed o member _ absent := absurd (List.mem_map.mpr ⟨o, member, rfl⟩) absent
  pending _ none := by cases none

/-! ### One state operation -/

section Step

variable {program : Program} {b s t : State} {x : Option (OccurrenceId × OccurrenceKey)} {spare : Option OccurrenceId}

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
  · exact absurd (by rw [same]; exact kept.issued _ (kept.below o member)) fresh

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
  refine ⟨kept.below, step.instanceId.trans kept.instanceId, kept.issued.trans step.issued, records, keys, nodup,
    present, counted, fun o member begun absent exempt =>
      removed_advance kept perm complete member begun absent (by simp) exempt, fun y named => ?_⟩
  obtain ⟨issued, absent, unended, ⟨unheld, countedY, keyed⟩⟩ := kept.pending y named
  refine ⟨step.issued _ issued, fun held => ?_, fun ended => ?_, fun o' inside same => ?_,
    counted_grow step.grow countedY, keyed⟩
  · obtain ⟨o', inside, same⟩ := List.mem_map.mp held
    rcases step.held o' inside with ⟨o, old, named, ⟨_, _⟩⟩ | ⟨fresh, _⟩
    · exact absent (List.mem_map.mpr ⟨o, old, named.symm.trans same⟩)
    · exact fresh (by rw [same]; exact issued)
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
  refine ⟨kept.below, step.instanceId.trans kept.instanceId, kept.issued.trans step.issued, records, keys, nodup,
    present, counted, fun o inB begun absent exempt =>
      removed_advance kept perm complete inB begun absent (fun same => exempt _ rfl (Option.some.inj same))
        (by simp), fun y named => ?_⟩
  obtain rfl := Option.some.inj named
  refine ⟨step.issued _ (formed.issued.occurrences occurrence member), gone, fun ended => ?_,
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
theorem EndsKept.record {b s : State} {id : OccurrenceId} {k : OccurrenceKey} (kept : EndsKept b (some (id, k)) s)
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

/-- An operation that moves nothing `EndsKept` reads but the keys it issues and the order of the end facts keeps
it: journalling the draft (`Step.conclude`) and ordering the journal (`Step.orderJournal`) only
permute them. -/
theorem EndsKept.unmoved {b s t : State} {x : Option (OccurrenceId × OccurrenceKey)} (kept : EndsKept b x s)
    (occurrences : t.occurrences = s.occurrences) (counters : t.activations = s.activations)
    (tree : t.scopes = s.scopes ∧ t.instanceId = s.instanceId) (issued : Laws.State.OccurrenceGrows s t)
    (ends : (endKeys t).Perm (endKeys s)) : EndsKept b x t := by
  have same : ∀ o, key t o = key s o := fun o =>
    Laws.State.key_congr (Laws.State.instanceOf_congr tree.1 tree.2 o.scope)
  have ids : occurrenceIds t = occurrenceIds s := by rw [occurrenceIds, occurrences]; rfl
  refine ⟨kept.below, tree.2.trans kept.instanceId, kept.issued.trans issued, occurrences ▸ kept.records,
    fun o member begun inside => (same o).trans (kept.keys o member begun (occurrences ▸ inside)),
    ends.nodup_iff.mpr kept.nodup, fun o inside => ?_,
    fun k ended => Laws.State.Counted.congr counters (kept.counted k (ends.mem_iff.mp ended)), ?_, fun y named => ?_⟩
  · rw [same, ends.mem_iff]
    exact kept.present o (occurrences ▸ inside)
  · intro o member begun absent exempt
    exact ends.mem_iff.mpr (kept.removed o member begun (ids ▸ absent) exempt)
  · obtain ⟨below, absent, unended, ⟨unheld, countedY, keyed⟩⟩ := kept.pending y named
    exact ⟨issued _ below, ids ▸ absent, fun ended => unended (ends.mem_iff.mp ended),
      fun o inside => (same o) ▸ unheld o (occurrences ▸ inside), Laws.State.Counted.congr counters countedY, keyed⟩

/-! ### The completion pipeline -/

/-- The completion pipeline keeps an input's end facts, as a unit: its hooks before the removal and its continuation
keep `EndsInv`, the continuation with the completing occurrence exempt, and the end it journals last lifts the
exemption (`EndsKept.remove`, `EndsKept.record`). The one obligation `Step`'s phases cannot carry (module
documentation). The continuation's outflow reads where it comes from off states that kept `EndsInv` without the
exemption, so the hooks read it under `src`, which those imply. -/
theorem complete_ends {hooks : Hooks} {b : State} {src : Program → State → Prop}
    (contract : ∀ x, HookContract hooks (EndsInv b x) src) (sourced : ∀ program s, EndsInv b none program s → src program s)
    (phases : Phases WellFormed) (pipeline : PipelinePhases WellFormed) (facts : StateFacts) :
    PipelineKeeps hooks (EndsInv b none) := by
  intro ctx id leave writes rule state after holds free source ran
  obtain ⟨occurrence, sourceType, begun, pipeline⟩ := complete_ok ran
  obtain ⟨left, selected, written, pipeline⟩ := pipeline
  obtain ⟨found, _, leaving, pipeline⟩ := pipeline
  obtain ⟨made, choosing, writing, finishes⟩ := pipeline
  obtain ⟨member, named⟩ := facts.found _ _ _ found
  obtain ⟨begunMember, begunFlag, begunId, reservation⟩ := facts.startReserved state occurrence sourceType member
  obtain ⟨begunScope, reservedScopes, begunElement, reservedInstances⟩ := reservation
  have closedFormed := pipeline.startReserved _ state occurrence sourceType holds.1 member (named ▸ free)
  rw [named] at closedFormed
  have startedKept := holds.2.step holds.1 (startReserved_frame holds.1 member sourceType)
  have closedKept : EndsKept b none ((state.startReserved occurrence sourceType).1.closeOwnItems id) := by
    rw [Laws.State.closeOwnItems_eq]
    exact startedKept.unmoved rfl rfl ⟨rfl, rfl⟩ (.refl _) (.refl _)
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
  have free : ∀ (frame : State), (∀ item ∈ itemList frame.openItems, item ∈ itemList left.openItems) →
      ∀ item ∈ itemList frame.openItems, item.id.occurrence ≠ (state.startReserved occurrence sourceType).2.id ∧
        item.attachedTo ≠ some (state.startReserved occurrence sourceType).2.id := fun frame within item member => by
    rw [identity]
    have inLeft := within item member
    exact ⟨closedFree item (leftFrame.items item inLeft), identity ▸ detached item inLeft⟩
  have inWritten := writtenFrame.begun _ (leftFrame.begun _ inClosed begunFlag) begunFlag
  -- The source, carried from the state the completion ran on to every later state of the pipeline.
  have toWritten : ∀ (later : State), (∀ entry ∈ later.slots.instances, entry ∈ written.slots.instances) →
      (∀ entry ∈ later.scopes, entry ∈ written.scopes) →
      Laws.Flow.LeavesFrom (src ctx.program) ctx.program later (state.startReserved occurrence sourceType).2 selected :=
    fun later instances scopes => (((source occurrence member named).chosen
      (by rw [← begunElement]; exact (contract none).select _ _ _ _ _ choosing)).shrink
      (fun entry inside => by
        have := closedFrame.instances _ (leftFrame.instances _ (writtenFrame.instances _ (instances entry inside)))
        rwa [reservedInstances] at this)
      (fun entry inside => by
        have := scopes entry inside
        rwa [writtenFrame.scopes, leftFrame.scopes, closedFrame.scopes, reservedScopes] at this)
      begunId begunElement begunScope).mono (sourced ctx.program)
  cases finishes with
  | raised continuing =>
    obtain ⟨removedFormed, removedStands⟩ := pipeline.removeOccurrence _ written _ writtenHolds.1 inWritten
      (free written writtenFrame.items)
    obtain ⟨removing, gone, _⟩ := removeOccurrence_frame writtenHolds.1 inWritten
    have recorded := (writtenHolds.2.remove writtenHolds.1 inWritten removing gone).record .cancelled
    rw [identity] at removedFormed removedStands recorded
    obtain ⟨entry, inside, entryNamed⟩ := removedStands
    obtain ⟨removedScopes, removedInstances⟩ := facts.removeOccurrence written id
    obtain ⟨endedScopes, endedInstances⟩ := facts.recordEnd (written.removeOccurrence id) (written.keyOf
      (state.startReserved occurrence sourceType).2) .cancelled
    rw [Laws.State.keyOf_eq] at continuing endedScopes endedInstances
    exact continueAfter_keeps (contract none) ⟨pipeline.recordEnd _ _ _ _ removedFormed, recorded⟩
      ⟨entry, endedScopes.symm ▸ inside, entryNamed⟩
      (toWritten _ (fun entry member => removedInstances entry (endedInstances ▸ member))
        (fun entry member => removedScopes entry (endedScopes ▸ member))) continuing
  | @left _ _ retained _ _ retaining continuing =>
    obtain ⟨retainedHolds, retainedFrame⟩ := (contract none).completed _ _ _ _ writtenHolds inWritten retaining
    have inRetained := retainedFrame.begun _ inWritten begunFlag
    have unhung := free _ fun item member => writtenFrame.items item (retainedFrame.items item member)
    obtain ⟨removedFormed, removedStands⟩ := pipeline.removeOccurrence _ _ _ retainedHolds.1 inRetained unhung
    obtain ⟨removing, gone, _⟩ := removeOccurrence_frame retainedHolds.1 inRetained
    have exempt := retainedHolds.2.remove retainedHolds.1 inRetained removing gone
    rw [identity] at removedFormed removedStands exempt
    obtain ⟨removedScopes, removedInstances⟩ := facts.removeOccurrence retained id
    obtain ⟨continuedFormed, continuedKept⟩ := continueAfter_keeps (contract _) ⟨removedFormed, exempt⟩ removedStands
      (toWritten _ (fun entry member => retainedFrame.instances _ (removedInstances entry member))
        (fun entry member => retainedFrame.scopes ▸ removedScopes entry member)) continuing
    have keyed : key retained (state.startReserved occurrence sourceType).2 =
        key written (state.startReserved occurrence sourceType).2 :=
      Laws.State.key_congr (Laws.State.instanceOf_congr retainedFrame.scopes
        (retainedHolds.2.instanceId.trans writtenHolds.2.instanceId.symm) _)
    rw [Laws.State.keyOf_eq, ← keyed]
    exact ⟨pipeline.recordEnd _ _ _ _ continuedFormed, continuedKept.record .completed⟩

/-! ### The draft a micro-step leaves -/

/-- A moved token's micro-step is its arrival's or its deferred begin's. -/
theorem moveToken_microStep {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {token : Token} {state after : State}
    (ran : moveToken hooks ctx unit token state = .ok after) :
    ∃ cause element owner body, microStep hooks ctx unit cause element owner body state = .ok after := by
  cases token with
  | flow => exact ⟨_, _, _, _, moveToken_flow ran⟩
  | begin => exact ⟨_, _, _, _, moveToken_begin ran⟩

/-- Every closure micro-step is a micro-step: a moved token's is its arrival's or its deferred begin's. -/
theorem ClosureStep.microStep {hooks : Hooks} {ctx : Ctx} {log : RunLog} {unit : UnitKey} {state after : State}
    (step : ClosureStep hooks ctx log unit state after) :
    ∃ cause element owner body start, microStep hooks ctx unit cause element owner body start = .ok after := by
  cases step with
  | signal _ _ ran => exact ⟨_, _, _, _, _, ran⟩
  | token _ _ _ ran =>
    obtain ⟨cause, element, owner, rest₁⟩ := moveToken_microStep ran
    obtain ⟨body, moved⟩ := rest₁
    exact ⟨cause, element, owner, body, _, moved⟩
  | idle _ _ _ _ ran => exact ⟨_, _, _, _, _, ran⟩
  | reoffer _ _ _ _ _ ran => exact ⟨_, _, _, _, _, ran⟩
  | finish _ _ _ _ _ _ _ ran => exact ⟨_, _, _, _, _, ran⟩

/-- A committed micro-step leaves a draft `keeps` holds of when it holds of the empty draft and the hooks
`Step.conclude` runs once it has journalled the draft, `Hooks.cancelled` and `Hooks.written`, keep it. -/
theorem microStep_draft {hooks : Hooks} {keeps : Draft → Prop} (empty : keeps {})
    (cancelled : ∀ ctx occurrence state after, keeps state.draft → hooks.cancelled ctx occurrence state = .ok after →
      keeps after.draft)
    (written : ∀ ctx writes state after, keeps state.draft → hooks.written ctx writes state = .ok after →
      keeps after.draft)
    {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {body : State → Outcome} {state after : State} (ran : microStep hooks ctx unit cause element owner body state = .ok after) : keeps after.draft := by
  obtain ⟨_, _, _, ⟨_, concluded⟩⟩ := microStep_ok ran
  obtain ⟨_, notified, written', rest₁⟩ := conclude_ok concluded
  obtain ⟨notifying, writing, rfl⟩ := rest₁
  have fold : ∀ (occurrences : List Occurrence) (start finish : State), keeps start.draft →
      occurrences.foldlM (fun state occurrence => hooks.cancelled ctx occurrence state) start = .ok finish →
      keeps finish.draft := by
    intro occurrences
    induction occurrences with
    | nil =>
      intro start finish kept folded
      simp only [List.foldlM_nil] at folded
      exact (Except.ok.inj folded) ▸ kept
    | cons occurrence rest ih =>
      intro start finish kept folded
      simp only [List.foldlM_cons] at folded
      obtain ⟨mid, told, folded⟩ := bind_ok folded
      exact ih mid finish (cancelled _ _ _ _ kept told) folded
  rw [Laws.State.queueBatch_eq]
  exact (show keeps written'.draft from written _ _ _ _ (fold _ _ _ empty notifying) writing)

/-- A committed micro-step leaves no end fact in the draft when the hooks `Step.conclude` runs once it has journalled the
draft, `Hooks.cancelled` and `Hooks.written`, add none to a draft without any. -/
theorem microStep_drafts {hooks : Hooks}
    (cancelled : ∀ ctx occurrence state after, state.draft.ended = [] → hooks.cancelled ctx occurrence state = .ok after →
      after.draft.ended = [])
    (written : ∀ ctx writes state after, state.draft.ended = [] → hooks.written ctx writes state = .ok after →
      after.draft.ended = [])
    {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {body : State → Outcome} {state after : State} (ran : microStep hooks ctx unit cause element owner body state = .ok after) : after.draft.ended = [] :=
  microStep_draft (keeps := (·.ended = [])) rfl cancelled written ran

/-- PD2: a committed micro-step leaves the draft's Ready list empty when `Hooks.cancelled` and `Hooks.written` hold
nothing, so the next micro-step's Ready list (`Laws.Hooks.hold_ready`) names only the occurrences that micro-step
holds. -/
theorem microStep_ready {hooks : Hooks}
    (cancelled : ∀ ctx occurrence state after, state.draft.ready = [] → hooks.cancelled ctx occurrence state = .ok after →
      after.draft.ready = [])
    (written : ∀ ctx writes state after, state.draft.ready = [] → hooks.written ctx writes state = .ok after →
      after.draft.ready = [])
    {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {body : State → Outcome} {state after : State} (ran : microStep hooks ctx unit cause element owner body state = .ok after) : after.draft.ready = [] :=
  microStep_draft (keeps := (·.ready = [])) rfl cancelled written ran

end Kernel.Laws.Step
