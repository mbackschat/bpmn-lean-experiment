module

public import Kernel.Proofs.MultiInstance.Numbered
public import Kernel.Laws.Step.Compacted

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
  rw [compact_slots ran, renameSlots_eq] at member
  obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
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
    (held : Numbered program state) (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    Numbered program after := by
  unfold Numbered at held ⊢
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
  · rw [compact_bodies ran] at member
    obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
    refine ⟨?_, ?_⟩
    · intro first second firstScope secondScope lower one two earlier earlierIn later laterIn atFirst atSecond
        earlierBody laterBody
      obtain ⟨firstSlot, atOne, rfl⟩ := renamed_slot one
      obtain ⟨secondSlot, atTwo, rfl⟩ := renamed_slot two
      obtain ⟨e, eIn, rfl⟩ := compact_occurrence_eq ran earlierIn
      obtain ⟨l, lIn, rfl⟩ := compact_occurrence_eq ran laterIn
      exact (numbered run runIn).1 first second firstSlot secondSlot lower atOne atTwo e eIn l lIn
        (inSlot run runIn firstSlot (List.mem_of_getElem? atOne) e eIn atFirst.symm).symm
        (inSlot run runIn secondSlot (List.mem_of_getElem? atTwo) l lIn atSecond.symm).symm
        (intoBody e eIn run runIn earlierBody) (intoBody l lIn run runIn laterBody)
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
      rw [compact_bodies ran] at member
      obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
      exact queued.looped run runIn
    case uncalled =>
      intro run member scope active entry entryIn named
      rw [compact_bodies ran] at member
      obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
      obtain ⟨slot, slotIn, rfl⟩ := renamed_active active
      obtain ⟨old, oldIn, rfl⟩ := compact_scope_eq ran entryIn
      have same := renameScope_apart counted' rooted (formed.settled.placed run runIn slot slotIn).1
        (List.mem_map_of_mem oldIn) named.symm
      exact queued.uncalled run runIn slot slotIn old oldIn same.symm
    case continued =>
      intro run member o oIn continuation active
      rw [compact_bodies ran] at member
      obtain ⟨run, runIn, rfl⟩ := List.mem_map.mp member
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
    (keys : first.map (·.occurrence) = second.map (·.occurrence)) {processInstance : String} {element : ElementId}
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

/-- **`LogOrder.byRun` across the commit** (what `beginsInOrder_of` reads of `Logged` after the commit): the committed
journal lists the start facts of the settled transitions in run order, each fact's occurrence key kept. -/
theorem orderJournal_beginsInOrder {processInstance : String} {element : ElementId}
    (ordered : BeginsInOrder ((byRun log state.transitions).flatMap (·.started)) processInstance element)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    BeginsInOrder (after.journal.flatMap (·.started)) processInstance element :=
  beginsInOrder_of_keys (compact_journalStarts (orderJournal_of made)) ordered

end Logged

end Kernel.Proofs.MultiInstance
