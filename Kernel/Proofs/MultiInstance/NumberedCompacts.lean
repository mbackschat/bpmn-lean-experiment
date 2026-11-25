module

public import Kernel.Proofs.MultiInstance.RunOrder

/-! # Multi-Instance numbering and the run log across compaction at commit (DC12)

`Numbered` across `Step.orderJournal`'s compaction (`Proofs.Frame.StepAlongside.runOrder`), and the facts
`Kernel.Proofs.MultiInstance.Begins` reads of `Logged` after the commit (`UnbegunKept`, `beginsInOrder_of`).

A commit renames every running body with its instances' scope occurrences and every occurrence with its continuation,
keeping activations, elements and roles, and leaves nothing queued, so every clause over queued begins holds of
nothing. An instance's scope occurrence was issued and an occurrence's stands, so the two rename alike only when they
are one (`Laws.Step.renameScope_apart`); an occurrence continues into an issued body (`continuations`) and a running
body is a standing occurrence's (`bodies`), so a continuation renames onto a body's only when it is that body's
(`Laws.Step.renamed_apart`). The run log's facts keep every occurrence key (`Laws.Step.compact_journalStarts`).
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel Kernel.Step Kernel.Laws.State Kernel.Laws.Step
open Kernel.Laws.MultiInstance (LoopOf NumberedInOrder InstancesPlaced BeginsQueued BeginsInOrder UnbegunUnlooped)

section Numbering

variable {schedule : BranchSchedule} {program : Program} {start state : State} {log : RunLog} {after : State}

/-- A pending activation of an occurrence is tabled under its key's slot, and no other occurrence carries it. -/
theorem pending_tabled (formed : WellFormed program state) {o : Occurrence} (oIn : o ∈ state.occurrences)
    {unit : UnitKey} {k : Nat} (pending : o.activation = .fresh unit k) :
    state.issued[o.activation]? = some (.activation (slotOf (key state o))) := by
  have counted := formed.occurrencesCounted o oIn
  have act : (key state o).activation = .fresh unit k := by simp only [key]; exact pending
  unfold Counted at counted
  split at counted
  · rename_i heq; rw [act] at heq; cases heq
  · rename_i unit' k' heq
    rw [act] at heq
    obtain ⟨rfl, rfl⟩ := Issue.fresh.inj heq
    rw [pending]; exact counted

/-- The occurrence that carries a pending activation is the first the occurrences list with it. -/
theorem pending_found (formed : WellFormed program state) {o : Occurrence} (oIn : o ∈ state.occurrences)
    {unit : UnitKey} {k : Nat} (pending : o.activation = .fresh unit k) :
    state.occurrences.find? (·.activation == o.activation) = some o := by
  cases found : state.occurrences.find? (·.activation == o.activation) with
  | none => exact absurd (List.find?_eq_none.mp found o oIn) (by simp)
  | some other =>
    have same : other.activation = o.activation := by simpa using List.find?_some found
    have otherIn := List.mem_of_find?_eq_some found
    have tabledO := pending_tabled formed oIn pending
    have tabledOther := pending_tabled formed otherIn (same.trans pending)
    rw [same, tabledO] at tabledOther
    have slots := (ClaimSlot.activation.inj (Option.some.inj tabledOther)).symm
    have keys : key state other = key state o := by
      simp only [slotOf, ActivationSlot.mk.injEq] at slots
      simp only [key] at slots ⊢
      rw [same, slots.1, slots.2.1, slots.2.2]
    rw [nodup_map_eq formed.distinct.keys otherIn oIn keys]

/-- Under `orderInvariant` a pending instance's activation stands in the tagging with its body and slot index. -/
theorem instance_tagged (formed : WellFormed program state) (owns : SlotsOwned state) (queued : BeginsQueued program state)
    {run : MultiInstanceRun} (runIn : run ∈ state.slots.multiInstances) {index : Nat} {scope : ScopeOccurrenceId}
    (slot : run.instances[index]? = some (.active scope)) {o : Occurrence} (oIn : o ∈ state.occurrences)
    (oAt : o.scope = scope) (oOn : o.continuation = .multiInstance run.occurrence) {unit : UnitKey} {k : Nat}
    (pending : o.activation = .fresh unit k) :
    ∃ p : Nat, (taggedActivations .orderInvariant (ordered log state) (issueOrder .orderInvariant log (ordered log state)))[p]? =
      some ((o.activation, slotOf (key state o)), some (run.occurrence, index)) := by
  obtain ⟨p, at_⟩ := taggedActivations_at (state := ordered log state)
    (claims := issueOrder .orderInvariant log (ordered log state)) (claim := (o.activation, slotOf (key state o)))
    (issueOrder_mem.mpr (pending_tabled formed oIn pending))
  refine ⟨p, at_.trans ?_⟩
  have continued := queued.continued run runIn o oIn oOn (oAt ▸ List.mem_of_getElem? slot)
  rw [instanceItem?_of (state := ordered log state) (o := o) (record := run.toRecord) (by simp only [key]; exact continued.2)
    (pending_found formed oIn pending) oOn (mem_multiInstanceList.mp runIn)
    (by rw [record_instances, oAt]; exact slot) fun j held =>
      (owns.owned run runIn).ownScopes j index scope (by rw [record_instances, oAt] at held; exact held) slot]

/-- **Two pending instances of one body are numbered in item order under `orderInvariant`** (`Step.activationPlace`,
KD5): the earlier slot's takes the earlier place among the body's, so the commit's fold numbers it first on their one
counter. -/
theorem assign_instances (formed : WellFormed program state) (owns : SlotsOwned state)
    (queued : BeginsQueued program state) {run : MultiInstanceRun} (runIn : run ∈ state.slots.multiInstances)
    {first second : Nat} {fs ss : ScopeOccurrenceId} (lower : first < second)
    (one : run.instances[first]? = some (.active fs)) (two : run.instances[second]? = some (.active ss))
    {e l : Occurrence} (eIn : e ∈ state.occurrences) (lIn : l ∈ state.occurrences) (eAt : e.scope = fs)
    (lAt : l.scope = ss) (eOn : e.continuation = .multiInstance run.occurrence)
    (lOn : l.continuation = .multiInstance run.occurrence) {ue ul : UnitKey} {ie il : Nat}
    (he : e.activation = .fresh ue ie) (hl : l.activation = .fresh ul il) {ne nl : Nat}
    (tookE : (assign .orderInvariant start log (ordered log state)).1[e.activation]? = some ne)
    (tookL : (assign .orderInvariant start log (ordered log state)).1[l.activation]? = some nl) : ne < nl := by
  have slotsNamed : ∀ (issue : Issue) (slot : ActivationSlot), (ordered log state).issued[issue]? = some (.activation slot) →
      NameTabled (ordered log state) slot.processInstance := fun issue slot inside =>
    NameTabled.grow (s := state) (t := ordered log state) (fun _ _ found => found) (formed.issued.slots issue slot inside)
  obtain ⟨pE, atE⟩ := instance_tagged (log := log) formed owns queued runIn one eIn eAt eOn he
  obtain ⟨pL, atL⟩ := instance_tagged (log := log) formed owns queued runIn two lIn lAt lOn hl
  have eCont := queued.continued run runIn e eIn eOn (eAt ▸ List.mem_of_getElem? one)
  have lCont := queued.continued run runIn l lIn lOn (lAt ▸ List.mem_of_getElem? two)
  have named : state.instanceOf e.scope = state.instanceOf l.scope := by
    rw [eAt, lAt, slot_instance formed owns queued runIn one, slot_instance formed owns queued runIn two]
  have slotSame : slotOf (key state e) = slotOf (key state l) := by
    simp only [slotOf, key, named, eCont.1, eCont.2, lCont.1, lCont.2]
  obtain ⟨pre, post, split, later⟩ := activationOrder_before_place atE atL (by rw [slotSame])
    (activationPlace_lt atE atL lower)
  rw [assign_replay slotsNamed] at tookE tookL
  have order : committedOrder .orderInvariant start log (ordered log state) =
      (identityClaims (issueOrder .orderInvariant log (ordered log state)) ++
        pre.map (resolvedClaim (commitRenaming .orderInvariant start log (ordered log state)))) ++
        resolvedClaim (commitRenaming .orderInvariant start log (ordered log state)) (e.activation, slotOf (key state e)) ::
          post.map (resolvedClaim (commitRenaming .orderInvariant start log (ordered log state))) := by
    simp only [committedOrder, split, List.map_append, List.map_cons, List.append_assoc]
  have distinct := committedOrder_nodup (schedule := .orderInvariant) start log (ordered log state)
  rw [order] at distinct tookE tookL
  obtain ⟨mid, rest, cut⟩ := List.append_of_mem (List.mem_map_of_mem (f := resolvedClaim
    (commitRenaming .orderInvariant start log (ordered log state))) later)
  rw [cut] at distinct tookE tookL
  simp only [List.map_append, List.map_cons] at distinct
  have tail := (List.nodup_append.mp distinct).2.1
  have firstOut := (List.nodup_cons.mp tail).1
  have secondOut := (List.nodup_cons.mp (List.nodup_append.mp (List.nodup_cons.mp tail).2).2.1).1
  exact fold_before _ mid rest _ _ (∅, ∅) (by
      show (resolvedClaim (commitRenaming .orderInvariant start log (ordered log state)) (e.activation, slotOf (key state e))).2 =
        (resolvedClaim (commitRenaming .orderInvariant start log (ordered log state)) (l.activation, slotOf (key state l))).2
      rw [slotSame])
    (by simpa [List.map_append] using firstOut) secondOut tookE tookL

/-- **Instances keep their numbering across the commit** (`Laws.MultiInstance.CommittedBelow`): a committed later
instance had a committed earlier one below it, which the commit keeps; a pending later one takes an ordinal above the
start's counter of its slot, which bounds a committed earlier one's, and above a pending earlier one's, the commit
numbering one body's instances in item order (`assign_instances`). -/
theorem committedBelow_renamed (formed : WellFormed program state) (counted : CountersFrom start state)
    (owns : SlotsOwned state) (queued : BeginsQueued program state) {run : MultiInstanceRun}
    (runIn : run ∈ state.slots.multiInstances) {first second : Nat} {fs ss : ScopeOccurrenceId} (lower : first < second)
    (one : run.instances[first]? = some (.active fs)) (two : run.instances[second]? = some (.active ss))
    {e l : Occurrence} (eIn : e ∈ state.occurrences) (lIn : l ∈ state.occurrences) (eAt : e.scope = fs)
    (lAt : l.scope = ss) (eOn : e.continuation = .multiInstance run.occurrence)
    (lOn : l.continuation = .multiInstance run.occurrence) (held : RunBelow log e.activation l.activation) :
    Laws.MultiInstance.CommittedBelow (commitRenaming schedule start log (ordered log state) e.activation)
      (commitRenaming schedule start log (ordered log state) l.activation) := by
  have slotsNamed : ∀ (issue : Issue) (slot : ActivationSlot), (ordered log state).issued[issue]? = some (.activation slot) →
      NameTabled (ordered log state) slot.processInstance := fun issue slot inside =>
    NameTabled.grow (s := state) (t := ordered log state) (fun _ _ found => found) (formed.issued.slots issue slot inside)
  have eCont := queued.continued run runIn e eIn eOn (eAt ▸ List.mem_of_getElem? one)
  have lCont := queued.continued run runIn l lIn lOn (lAt ▸ List.mem_of_getElem? two)
  have named : state.instanceOf e.scope = state.instanceOf l.scope := by
    rw [eAt, lAt, slot_instance formed owns queued runIn one, slot_instance formed owns queued runIn two]
  have slotSame : slotOf (key state e) = slotOf (key state l) := by
    simp only [slotOf, key, named, eCont.1, eCont.2, lCont.1, lCont.2]
  intro m renamedL
  rcases renamed_cases (schedule := schedule) (log := log) (u := state) (s := ordered log state) counted formed.activations
      rfl slotsNamed (formed.occurrencesCounted l lIn) with ⟨b, hb, -, -⟩ | ⟨ul, il, nl, ⟨hb, -, tookL, aboveL⟩⟩
  · simp only [key] at hb
    rw [hb, commitRenaming_committed] at renamedL
    obtain rfl : b = m := Issue.committed.inj renamedL
    obtain ⟨a, ha, less⟩ := held.1 b hb
    exact ⟨a, by rw [ha, commitRenaming_committed], less⟩
  · simp only [key] at hb
    rw [hb] at renamedL
    simp only [commitRenaming, renameBy_fresh, tookL, Option.map_some, Option.getD_some, Issue.committed.injEq] at renamedL
    subst renamedL
    rcases renamed_cases (schedule := schedule) (log := log) (u := state) (s := ordered log state) counted
        formed.activations rfl slotsNamed (formed.occurrencesCounted e eIn) with
      ⟨a, ha, ra, la⟩ | ⟨ue, ie, ne, ⟨ha, -, tookE, -⟩⟩
    · simp only [key] at ha
      refine ⟨a, by rw [ha, commitRenaming_committed], Nat.lt_of_le_of_lt la ?_⟩
      have same : resolvedSlotOf (commitRenaming schedule start log (ordered log state)) (key state l) =
          slotOf (key state e) := by
        have resolved : (state.instanceOf e.scope).unresolved = false := ra
        simp only [resolvedSlotOf, slotOf, key, ← named, rename_resolved _ resolved, eCont.1, eCont.2, lCont.1, lCont.2]
      rw [← same]; exact aboveL
    · simp only [key] at ha
      rw [ha]
      simp only [commitRenaming, renameBy_fresh, tookE, Option.map_some, Option.getD_some]
      refine ⟨ne, rfl, ?_⟩
      cases schedule with
      | orderInvariant =>
        exact assign_instances formed owns queued runIn lower one two eIn lIn eAt lAt eOn lOn ha hb
          (by rw [ha]; exact tookE) (by rw [hb]; exact tookL)
      | declarationDepthFirst =>
        refine assign_ranBefore slotsNamed (pending_tabled formed eIn ha) (pending_tabled formed lIn hb)
          (notAfter_ranBefore held.2 ⟨_, _, ha⟩ ⟨_, _, hb⟩) (by rw [slotSame]) (by rw [slotSame])
          (by rw [ha]; exact tookE) (by rw [hb]; exact tookL)

/-- A reservation still to be made after the commit was one before it: the commit queues nothing, and a held
compensation run keeps the element its resume reserves. -/
theorem orderJournal_occurPending (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) {element : ElementId}
    (pending : OccurPending after element) : OccurPending state element := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have quietSignals := facts.quietSignals
  have quietTokens := facts.quietTokens
  have quiet := (compact_quiet ran ⟨quietSignals, quietTokens⟩).1
  simp only [OccurPending, quiet, List.not_mem_nil, exists_false, false_or] at pending
  obtain ⟨run, member, resume⟩ := pending
  obtain ⟨at_, leave, resumed⟩ := resume
  obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
  rcases was : run.resume with _ | (⟨_, _⟩ | ⟨element', scope', leave'⟩ | _) <;> simp [was] at resumed
  exact .inr (.inr ⟨run, runIn, scope', leave', by rw [was, resumed.1]⟩)

/-- **`Numbered` across the commit** (`Kernel.Proofs.MultiInstance.Numbered`'s `runOrder`, both parts and the eleven
fields of `BeginsQueued`). `bodies` is `Laws.MultiInstance.Owned.body`'s standing occurrence, which `RunsFramed`
carries; `continuations` says an occurrence continues into an issued body. -/
theorem orderJournal_numbered (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (bodies : ∀ run ∈ state.slots.multiInstances, ∃ occurrence ∈ state.occurrences, occurrence.id = run.occurrence)
    (continuations : ∀ o ∈ state.occurrences, ∀ body, o.continuation = .multiInstance body → OccurrenceIssued state body)
    (owns : SlotsOwned state) (held : NumberedBy (RunBelow log) program state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    Numbered program after := by
  show NumberedBy _ program after
  unfold NumberedBy at held ⊢
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  have quietSignals := facts.quietSignals
  have quietTokens := facts.quietTokens
  have quiet := compact_quiet ran ⟨quietSignals, quietTokens⟩
  have kept := compact_kept ran
  -- An occurrence whose renamed continuation enters a renamed body continues into the body.
  have intoBody : ∀ o ∈ state.occurrences, ∀ run ∈ state.slots.multiInstances,
      o.continuation.rekey (renameId (commitRenaming schedule start log (ordered log state)))
          (renameScope (commitRenaming schedule start log (ordered log state))) =
        .multiInstance (renameId (commitRenaming schedule start log (ordered log state)) run.occurrence) →
      o.continuation = .multiInstance run.occurrence := by
    intro o present run runIn same
    obtain ⟨body, continued, renamed⟩ := Continuation.rekey_eq_multiInstance same
    obtain ⟨holder, holderIn, holderId⟩ := bodies run runIn
    rw [← holderId] at renamed ⊢
    rw [continued, renamed_apart counted' issued owned rooted keys (continuations o present body continued) holderIn
      renamed]
  -- A renamed active slot's scope occurrence holds a renamed occurrence only where the slot's holds it.
  have inSlot : ∀ run ∈ state.slots.multiInstances, ∀ slot, Iteration.active slot ∈ run.instances →
      ∀ o ∈ state.occurrences, renameScope (commitRenaming schedule start log (ordered log state)) slot =
        renameScope (commitRenaming schedule start log (ordered log state)) o.scope → slot = o.scope :=
    fun run runIn slot active o present same =>
      renameScope_apart counted' rooted (formed.settled.placed run runIn slot active).1
        (owned.occurrenceScopes o present) same
  obtain ⟨numbered, queued⟩ := held
  refine ⟨fun run member => ?_, ?_⟩
  · obtain ⟨run, runIn, rfl⟩ := compact_bodies ran member
    refine ⟨?_, ?_⟩
    · intro first second firstScope secondScope lower one two earlier earlierIn later laterIn atFirst atSecond
        earlierBody laterBody
      obtain ⟨firstSlot, atOne, rfl⟩ := renamed_slot one
      obtain ⟨secondSlot, atTwo, rfl⟩ := renamed_slot two
      obtain ⟨e, eIn, rfl⟩ := compact_occurrence_eq ran earlierIn
      obtain ⟨l, lIn, rfl⟩ := compact_occurrence_eq ran laterIn
      have eAt := (inSlot run runIn firstSlot (List.mem_of_getElem? atOne) e eIn atFirst.symm).symm
      have lAt := (inSlot run runIn secondSlot (List.mem_of_getElem? atTwo) l lIn atSecond.symm).symm
      exact committedBelow_renamed formed counted owns queued runIn lower atOne atTwo eIn lIn eAt lAt
        (intoBody e eIn run runIn earlierBody) (intoBody l lIn run runIn laterBody)
        ((numbered run runIn).1 first second firstSlot secondSlot lower atOne atTwo e eIn l lIn eAt lAt
          (intoBody e eIn run runIn earlierBody) (intoBody l lIn run runIn laterBody))
    · intro scope active o member at_ element role
      obtain ⟨slot, slotIn, rfl⟩ := renamed_active active
      obtain ⟨old, oldIn, rfl⟩ := compact_occurrence_eq ran member
      have continued := (numbered run runIn).2 slot slotIn old oldIn
        (inSlot run runIn slot slotIn old oldIn at_.symm).symm element role
      simp [continued]
  · refine {
      looped := ?looped, uncalled := ?uncalled, continued := ?continued, targets := ?targets
      reserved := ?reserved, reservations := ?reservations, occurs := ?occurs, ordered := ?ordered
      deferred := ?deferred, above := ?above }
    case looped =>
      intro run member
      obtain ⟨run, runIn, rfl⟩ := compact_bodies ran member
      exact queued.looped run runIn
    case uncalled =>
      intro run member scope active entry entryIn named
      obtain ⟨run, runIn, rfl⟩ := compact_bodies ran member
      obtain ⟨slot, slotIn, rfl⟩ := renamed_active active
      obtain ⟨old, oldIn, rfl⟩ := compact_scope_eq ran entryIn
      have same := renameScope_apart counted' rooted (formed.settled.placed run runIn slot slotIn).1
        (List.mem_map_of_mem oldIn) named.symm
      simp [queued.uncalled run runIn slot slotIn old oldIn same.symm]
    case continued =>
      intro run member o oIn continuation active
      obtain ⟨run, runIn, rfl⟩ := compact_bodies ran member
      obtain ⟨old, oldIn, rfl⟩ := compact_occurrence_eq ran oIn
      obtain ⟨slot, slotIn, same⟩ := renamed_active active
      have slotIs := inSlot run runIn slot slotIn old oldIn same.symm
      exact queued.continued run runIn old oldIn (intoBody old oldIn run runIn continuation) (slotIs ▸ slotIn)
    case targets => intro request queuedIn; exact absurd queuedIn (quiet_queued quiet)
    case reserved => intro request queuedIn; exact absurd queuedIn (quiet_queued quiet)
    case reservations =>
      intro o member unbegun
      obtain ⟨old, oldIn, rfl⟩ := compact_occurrence_eq ran member
      simp [queued.reservations old oldIn unbegun]
    case occurs =>
      intro element pending
      exact queued.occurs element (orderJournal_occurPending formed counted batches made pending)
    case ordered =>
      intro run _
      have signals : after.batchSignals = [] := by rw [kept.batchSignals]; exact batches.1
      have tokens : after.batchTokens = [] := by rw [kept.batchTokens]; exact batches.2.1
      have keyedSignals : after.queuedSignals = ∅ := kept.queuedSignals
      have keyedTokens : after.queuedTokens = ∅ := kept.queuedTokens
      refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_⟩ <;>
        simp [signals, tokens, keyedSignals, keyedTokens, Laws.State.Precedes]
    case deferred => intro _ _ inside; rw [quiet.2] at inside; cases inside
    case above => intro _ _ _ _ _ _ queuedIn; exact absurd queuedIn (quiet_queued quiet)

end Numbering

/-! ## What `Logged` gives after the commit -/

section Logged

variable {schedule : BranchSchedule} {program : Program} {start state : State} {log : RunLog} {after : State}

/-- **`Unlooped.unbegun` across the commit** (what `UnbegunKept` reads of `Logged` after the commit): an unbegun
occurrence keeps its element and stays unbegun. -/
theorem orderJournal_unbegunUnlooped (unbegun : UnbegunUnlooped program state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) : UnbegunUnlooped program after := by
  intro occurrence member flag
  obtain ⟨old, inside, mapped⟩ := compact_occurrence_of (orderJournal_of made) member
  have element := mapped.element
  have begun := mapped.begun
  rw [element]
  exact unbegun old inside (by rw [← begun]; exact flag)

/-- Facts whose occurrence keys are another list's list their begins in its order. -/
theorem beginsInOrder_of_keys {first second : List StartedFact}
    (keys : first.map (·.occurrence) = second.map (·.occurrence)) {processInstance : InstanceName} {element : ElementId}
    (ordered : BeginsInOrder second processInstance element) : BeginsInOrder first processInstance element := by
  unfold BeginsInOrder at ordered ⊢
  have read : ∀ facts : List StartedFact,
      (facts.filter fun fact => fact.occurrence.processInstanceId == processInstance &&
        fact.occurrence.element == element && fact.occurrence.role == .element).map (·.occurrence.activation) =
      ((facts.map (·.occurrence)).filter fun key => key.processInstanceId == processInstance &&
        key.element == element && key.role == .element).map (·.activation) := by
    intro facts
    rw [List.filter_map, List.map_map]
    rfl
  rw [read] at ordered ⊢
  rw [keys]
  exact ordered

/-- Keys renamed by `f`, which keeps their element and role, keep the order of the activations of `element`'s keys
under the element role on any one renamed process instance, when each such pair of keys the order relates renames into
order. -/
theorem pairwise_renamed {keys : List OccurrenceKey} {f : OccurrenceKey → OccurrenceKey} {element : ElementId}
    {processInstance : InstanceName} {before after : Issue → Issue → Prop}
    (kept : ∀ key, (f key).element = key.element ∧ (f key).role = key.role)
    (ordered : ((keys.filter fun key => key.element == element && key.role == .element).map (·.activation)).Pairwise before)
    (renamed : ∀ a ∈ keys, ∀ b ∈ keys, a.element = element → b.element = element → a.role = .element →
      b.role = .element → (f a).processInstanceId = processInstance → (f b).processInstanceId = processInstance →
      before a.activation b.activation → after (f a).activation (f b).activation) :
    (((keys.map f).filter fun key => key.processInstanceId == processInstance && key.element == element &&
      key.role == .element).map (·.activation)).Pairwise after := by
  let looping := fun key : OccurrenceKey => key.element == element && key.role == .element
  let named := fun key : OccurrenceKey => (f key).processInstanceId == processInstance && (f key).element == element &&
    (f key).role == .element
  have narrower : ∀ key, named key = true → looping key = true := fun key held => by
    simp only [named, looping, Bool.and_eq_true, beq_iff_eq, (kept key).1, (kept key).2] at held ⊢
    exact ⟨held.1.2, held.2⟩
  have within : (keys.filter looping).filter named = keys.filter named := by
    rw [List.filter_filter]
    exact List.filter_congr fun key _ => by
      cases held : named key with
      | false => rfl
      | true => simp [narrower key held]
  rw [List.filter_map, List.map_map, List.pairwise_map]
  rw [List.pairwise_map] at ordered
  have sub := ordered.filter named
  rw [within] at sub
  refine sub.imp_of_mem fun {a b} aIn bIn held => ?_
  obtain ⟨aKeys, aNamed⟩ := List.mem_filter.mp aIn
  obtain ⟨bKeys, bNamed⟩ := List.mem_filter.mp bIn
  have aParts : (f a).processInstanceId = processInstance ∧ a.element = element ∧ a.role = .element := by
    simpa [named, (kept a).1, (kept a).2, and_assoc] using aNamed
  have bParts : (f b).processInstanceId = processInstance ∧ b.element = element ∧ b.role = .element := by
    simpa [named, (kept b).1, (kept b).2, and_assoc] using bNamed
  exact renamed a aKeys b bKeys aParts.2.1 bParts.2.1 aParts.2.2 bParts.2.2 aParts.1 bParts.1 held

/-- **Under `declarationDepthFirst` the commit numbers a looping element's start facts in journal order** (what
`beginsInOrder_of` reads of `Logged` after the commit): the journal lists the closure's start facts in run order,
renamed (`compact_journalStarts`), and of two pending ones of one renamed process instance the one issued first under
the run log (`MadeInOrder`) takes the lower ordinal on their slot (`assign_ranBefore`). -/
theorem orderJournal_madeInOrder {processInstance : InstanceName} {element : ElementId}
    (formed : WellFormed program state) (counted : CountersFrom start state)
    (madeIn : MadeInOrder log ((byRun log state.transitions).flatMap (·.started)) element)
    (made : orderJournal .declarationDepthFirst start (.ok (state, log)) = .ok after) :
    BeginsInOrder (after.journal.flatMap (·.started)) processInstance element := by
  have ran := orderJournal_of made
  have slotsNamed : ∀ (issue : Issue) (slot : ActivationSlot), (ordered log state).issued[issue]? = some (.activation slot) →
      NameTabled (ordered log state) slot.processInstance := fun issue slot inside =>
    NameTabled.grow (s := state) (t := ordered log state) (fun _ _ found => found) (formed.issued.slots issue slot inside)
  have read : ∀ facts : List StartedFact,
      (facts.filter fun fact => fact.occurrence.processInstanceId == processInstance &&
        fact.occurrence.element == element && fact.occurrence.role == .element).map (·.occurrence.activation) =
      ((facts.map (·.occurrence)).filter fun key => key.processInstanceId == processInstance &&
        key.element == element && key.role == .element).map (·.activation) := fun facts => by
    rw [List.filter_map, List.map_map]
    rfl
  unfold BeginsInOrder
  rw [read, compact_journalStarts ran, show ∀ facts : List StartedFact,
    (facts.map fun fact => renameKey (commitRenaming .declarationDepthFirst start log (ordered log state)) fact.occurrence) =
      (facts.map (·.occurrence)).map (renameKey (commitRenaming .declarationDepthFirst start log (ordered log state))) from
    fun facts => by rw [List.map_map]; rfl]
  have starts : ∀ key ∈ ((byRun log state.transitions).flatMap (·.started)).map (·.occurrence), Counted state key :=
    fun key inside => by
      obtain ⟨fact, factIn, rfl⟩ := List.mem_map.mp inside
      obtain ⟨transition, transitionIn, startedIn⟩ := List.mem_flatMap.mp factIn
      exact formed.counted fact (List.mem_append_left _ (List.mem_flatMap.mpr
        ⟨transition, (byRun_perm log state.transitions).mem_iff.mp transitionIn, startedIn⟩))
  refine pairwise_renamed (before := FreshBefore log) (fun key => by simp [renameKey_eq]) (by
    unfold MadeInOrder at madeIn
    rw [List.filter_map, List.map_map]
    exact madeIn) fun a aIn b bIn aElement bElement aRole bRole aNamed bNamed held => ?_
  obtain ⟨⟨ua, ia, ha⟩, ⟨ub, ib, hb⟩, ranBefore⟩ := held
  rcases renamed_cases (schedule := .declarationDepthFirst) (log := log) (u := state) (s := ordered log state) counted
      formed.activations rfl slotsNamed (starts a aIn) with ⟨_, committedA, -, -⟩ | ⟨ua', ia', na, ⟨ha', tabledA, tookA, -⟩⟩
  · rw [ha] at committedA; cases committedA
  rcases renamed_cases (schedule := .declarationDepthFirst) (log := log) (u := state) (s := ordered log state) counted
      formed.activations rfl slotsNamed (starts b bIn) with ⟨_, committedB, -, -⟩ | ⟨ub', ib', nb, ⟨hb', tabledB, tookB, -⟩⟩
  · rw [hb] at committedB; cases committedB
  rw [ha', hb'] at ranBefore
  -- One resolved name has one depth (`callDepth_rename`), so the depth order leaves the two in run order.
  have depth : a.processInstanceId.callDepth = b.processInstanceId.callDepth := by
    have same := aNamed.trans bNamed.symm
    simp only [renameKey_eq] at same
    rw [← Laws.State.callDepth_rename (commitRenaming .declarationDepthFirst start log (ordered log state)),
      ← Laws.State.callDepth_rename (commitRenaming .declarationDepthFirst start log (ordered log state)) b.processInstanceId,
      same]
  have lower := assign_ranBefore slotsNamed tabledA tabledB
    (notAfter_ranBefore ranBefore ⟨_, _, rfl⟩ ⟨_, _, rfl⟩) depth (by
      dsimp only
      simp only [renameKey_eq] at aNamed bNamed
      rw [aNamed, bNamed, aElement, bElement, aRole, bRole]) tookA tookB
  simp [renameKey_eq, ha', hb', commitRenaming, renameBy_fresh, tookA, tookB, Nat.compare_eq_lt, lower]

end Logged

end Kernel.Proofs.MultiInstance
