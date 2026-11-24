module

public import Kernel.Laws.Step.CompactedKeys
public import Kernel.Laws.State.Committed

/-! # Multi-Instance frames across compaction at commit (DC12)

The fields `RunsFramed` and `Since` (`Unstarted`, `Snapshots`) read across `Step.orderJournal`'s compaction. `Kernel.Proofs.MultiInstance.Framed` defines them and proves their `Proofs.Frame.StepAlongside.runOrder` in one module, so this module imports neither it nor a feature (guard 15) and is imported by it.

`Laws.MultiInstance.Rules`, which defines the parts of `RunFramed`, has five importers already (guard 15), so each
clause is stated over the body of the definition it discharges. A commit renames a running body with its scope
occurrence, its occurrence and its instances' scope occurrences, keeping every slot's kind and output
(`renameIteration`), and the scope occurrences and occurrences it names with them.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel Kernel.Step Kernel.Laws.State Kernel.Laws.Step

/-! ## Running bodies across the commit -/

section Runs

variable {schedule : BranchSchedule} {start : State} {log : RunLog} {s t : State}

/-- The compensation runs a commit leaves run their handlers in the settled state's contexts, renamed. -/
theorem compact_contexts (ran : compact schedule start log s = .ok t) {other : CompensationRun}
    (member : other ∈ t.slots.compensation.runs) :
    ∃ old ∈ s.slots.compensation.runs,
      other.running.map (·.1) = (old.running.map (·.1)).map (renameScope (commitRenaming schedule start log s)) := by
  rw [compact_slots ran, renameSlots_eq] at member
  obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
  exact ⟨old, inside, by simp [List.map_map, Function.comp_def]⟩

end Runs

theorem renameIteration_completed {r : Issue → Issue} {iteration : Iteration} {output : Option Value} :
    renameIteration r iteration = .completed output ↔ iteration = .completed output := by
  cases iteration <;> simp

theorem renameIteration_waiting {r : Issue → Issue} {iteration : Iteration} :
    renameIteration r iteration = .waiting ↔ iteration = .waiting := by
  cases iteration <;> simp

section Framed

variable {schedule : BranchSchedule} {program : Program} {start state : State} {log : RunLog} {after : State}

/-- **`RunFramed.owned` across the commit** (`Laws.MultiInstance.Owned`, its four fields stated over their bodies): the
body occurrence, the body's and the instances' scope occurrences are renamed with the body. -/
theorem orderJournal_runsOwned (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (owned : ∀ run ∈ state.slots.multiInstances,
      (∃ occurrence ∈ state.occurrences, occurrence.id = run.occurrence ∧ occurrence.element = run.element ∧
        occurrence.role = .multiInstanceBody) ∧ run.scope ∈ state.scopes.map (·.id) ∧
      (∀ (index : Nat) (scope : ScopeOccurrenceId), run.instances[index]? = some (.active scope) →
        ∃ entry ∈ state.scopes, entry.id = scope ∧ entry.parent = some run.scope) ∧
      ∀ (first second : Nat) (scope : ScopeOccurrenceId), run.instances[first]? = some (.active scope) →
        run.instances[second]? = some (.active scope) → first = second)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ run ∈ after.slots.multiInstances,
      (∃ occurrence ∈ after.occurrences, occurrence.id = run.occurrence ∧ occurrence.element = run.element ∧
        occurrence.role = .multiInstanceBody) ∧ run.scope ∈ after.scopes.map (·.id) ∧
      (∀ (index : Nat) (scope : ScopeOccurrenceId), run.instances[index]? = some (.active scope) →
        ∃ entry ∈ after.scopes, entry.id = scope ∧ entry.parent = some run.scope) ∧
      ∀ (first second : Nat) (scope : ScopeOccurrenceId), run.instances[first]? = some (.active scope) →
        run.instances[second]? = some (.active scope) → first = second := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted := facts.counted
  have issued := facts.issued
  have rooted := facts.rooted
  obtain ⟨H, history⟩ := historic_of issued rooted
  have fixes : Fixes (commitRenaming schedule start log (ordered log state)) := renameBy_fixes _
  intro run member
  obtain ⟨old, inside, rfl⟩ := compact_bodies ran member
  obtain ⟨body, scope, instances, own⟩ := owned old inside
  refine ⟨?_, ?_, fun index scope' active => ?_, fun first second scope' one two => ?_⟩
  · obtain ⟨occurrence, present, links⟩ := body
    obtain ⟨renamed, renamedIn, mapped⟩ :=
      compact_occurrence_mem ran (occurrences_apart counted issued facts.owned rooted keys formed.distinct.occurrencesKeyed) present
    exact ⟨renamed, renamedIn, by rw [mapped.id, links.1], by rw [mapped.element, links.2.1],
      by rw [mapped.role, links.2.2]⟩
  · change _ ∈ standingKeys after
    rw [compact_scopes ran]
    exact List.mem_map_of_mem scope
  · obtain ⟨original, held, rfl⟩ := renamed_slot active
    obtain ⟨entry, entryIn, entryId, link⟩ := instances index original held
    obtain ⟨renamed, renamedIn, renamedId⟩ := compact_scope_mem ran entryIn
    refine ⟨renamed, renamedIn, by rw [renamedId, entryId], ?_⟩
    change renamed.id.parent? = _
    rw [renamedId, renamed_parent fixes (history.layered _ (history.standing entry entryIn)),
      show entry.id.parent? = some old.scope from link]
    rfl
  · obtain ⟨a, aHeld, aSame⟩ := renamed_slot one
    obtain ⟨b, bHeld, bSame⟩ := renamed_slot two
    obtain ⟨aEntry, aIn, aId, -⟩ := instances first a aHeld
    obtain ⟨bEntry, bIn, bId, -⟩ := instances second b bHeld
    have same : a = b := by
      rw [← aId, ← bId]
      exact renameScope_apart counted rooted ((historic_of issued rooted).issued aIn) (List.mem_map_of_mem bIn)
        (by rw [aId, bId, ← aSame, ← bSame])
    exact own first second a aHeld (same ▸ bHeld)

/-- **`RunFramed.bodyOwns` across the commit** (`Laws.MultiInstance.BodyOwns`, stated over its body). -/
theorem orderJournal_bodyOwns (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (bodyScopes : ∀ run ∈ state.slots.multiInstances, run.scope ∈ state.scopes.map (·.id))
    (owns : ∀ run ∈ state.slots.multiInstances, ∀ entry ∈ state.scopes, entry.id = run.scope →
      entry.occurrence = some run.occurrence)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ run ∈ after.slots.multiInstances, ∀ entry ∈ after.scopes, entry.id = run.scope →
      entry.occurrence = some run.occurrence := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted := facts.counted
  have issued := facts.issued
  have rooted := facts.rooted
  intro run member entry entryIn named
  obtain ⟨old, inside, rfl⟩ := compact_bodies ran member
  obtain ⟨original, originalIn, rfl⟩ := compact_scope_eq ran entryIn
  have same : original.id = old.scope := renameScope_apart counted rooted
    ((historic_of issued rooted).issued originalIn) (bodyScopes old inside) named
  change original.occurrence.map _ = _
  rw [owns old inside original originalIn same]
  rfl

/-- **`RunFramed.unowned` across the commit** (`Laws.MultiInstance.InstancesUnowned`, stated over its body). -/
theorem orderJournal_instancesUnowned (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (instances : ∀ run ∈ state.slots.multiInstances, ∀ (index : Nat) (scope : ScopeOccurrenceId),
      run.instances[index]? = some (.active scope) → ∃ entry ∈ state.scopes, entry.id = scope ∧ entry.parent = some run.scope)
    (unowned : ∀ run ∈ state.slots.multiInstances, ∀ scope, Iteration.active scope ∈ run.instances →
      ∀ entry ∈ state.scopes, entry.id = scope → entry.occurrence = none)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ run ∈ after.slots.multiInstances, ∀ scope, Iteration.active scope ∈ run.instances →
      ∀ entry ∈ after.scopes, entry.id = scope → entry.occurrence = none := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted := facts.counted
  have issued := facts.issued
  have rooted := facts.rooted
  intro run member scope active entry entryIn named
  obtain ⟨old, inside, rfl⟩ := compact_bodies ran member
  obtain ⟨original, held, rfl⟩ := renamed_active active
  obtain ⟨index, indexed⟩ := List.mem_iff_getElem?.mp held
  obtain ⟨slot, slotIn, slotId, -⟩ := instances old inside index original indexed
  obtain ⟨renamed, renamedIn, rfl⟩ := compact_scope_eq ran entryIn
  have same : renamed.id = original := by
    rw [← slotId]
    exact renameScope_apart counted rooted ((historic_of issued rooted).issued renamedIn) (List.mem_map_of_mem slotIn)
      (by rw [slotId]; exact named)
  change renamed.occurrence.map _ = none
  rw [unowned old inside original held renamed renamedIn same]
  rfl

/-- **`RunFramed.unheld` across the commit** (`Laws.MultiInstance.InstancesUnheld`, stated over its body): a handler's
context is an issued scope occurrence (`Laws.State.RunPlaced`), so it renames apart from a standing instance's. -/
theorem orderJournal_instancesUnheld (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (instances : ∀ run ∈ state.slots.multiInstances, ∀ (index : Nat) (scope : ScopeOccurrenceId),
      run.instances[index]? = some (.active scope) → ∃ entry ∈ state.scopes, entry.id = scope ∧ entry.parent = some run.scope)
    (unheld : ∀ run ∈ state.slots.multiInstances, ∀ scope, Iteration.active scope ∈ run.instances →
      ∀ other ∈ state.slots.compensation.runs, scope ∉ other.running.map (·.1))
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ run ∈ after.slots.multiInstances, ∀ scope, Iteration.active scope ∈ run.instances →
      ∀ other ∈ after.slots.compensation.runs, scope ∉ other.running.map (·.1) := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted := facts.counted
  have issued := facts.issued
  have rooted := facts.rooted
  intro run member scope active other otherIn held
  obtain ⟨old, inside, rfl⟩ := compact_bodies ran member
  obtain ⟨original, activeOld, rfl⟩ := renamed_active active
  obtain ⟨index, indexed⟩ := List.mem_iff_getElem?.mp activeOld
  obtain ⟨slot, slotIn, slotId, -⟩ := instances old inside index original indexed
  obtain ⟨before, beforeIn, contexts⟩ := compact_contexts ran otherIn
  rw [contexts] at held
  obtain ⟨context, contextIn, same⟩ := List.mem_map.mp held
  have contextIssued := (formed.settled.runsPlaced before beforeIn).2 context contextIn
  have equal : context = original := by
    rw [← slotId]
    exact renameScope_apart counted rooted contextIssued.1 (List.mem_map_of_mem slotIn) (by rw [slotId]; exact same)
  exact unheld old inside original activeOld before beforeIn (equal ▸ contextIn)

/-- **`RunFramed.shaped` across the commit** (`SlotsShaped`, stated over the bodies of `SequentialSlots`,
`ParallelSlots` and `OutputsFit`): renaming keeps every slot's kind and output. -/
theorem orderJournal_shaped
    (shaped : ∀ run ∈ state.slots.multiInstances, ∀ loop : MultiInstance,
      ((program.element? run.element).bind (·.envelope?)).bind (·.multiInstance) = some loop →
      (loop.mode = .sequential → ∃ filled current waiting, run.instances = filled ++ current ++ waiting ∧
        (∀ slot ∈ filled, ∃ output, slot = .completed output) ∧ current.length ≤ 1 ∧
        (∀ slot ∈ current, ∃ scope, slot = .active scope) ∧ ∀ slot ∈ waiting, slot = .waiting) ∧
      (loop.mode = .parallel → ∀ slot ∈ run.instances, slot ≠ .waiting) ∧
      ∀ output, Iteration.completed output ∈ run.instances → (loop.outputDataItem.isSome → output.isSome) ∧
        ∀ value, output = some value → ∀ items, run.collection = .stringList items → ∃ text, value = .string text)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ run ∈ after.slots.multiInstances, ∀ loop : MultiInstance,
      ((program.element? run.element).bind (·.envelope?)).bind (·.multiInstance) = some loop →
      (loop.mode = .sequential → ∃ filled current waiting, run.instances = filled ++ current ++ waiting ∧
        (∀ slot ∈ filled, ∃ output, slot = .completed output) ∧ current.length ≤ 1 ∧
        (∀ slot ∈ current, ∃ scope, slot = .active scope) ∧ ∀ slot ∈ waiting, slot = .waiting) ∧
      (loop.mode = .parallel → ∀ slot ∈ run.instances, slot ≠ .waiting) ∧
      ∀ output, Iteration.completed output ∈ run.instances → (loop.outputDataItem.isSome → output.isSome) ∧
        ∀ value, output = some value → ∀ items, run.collection = .stringList items → ∃ text, value = .string text := by
  have ran := orderJournal_of made
  intro run member loop looped
  obtain ⟨old, inside, rfl⟩ := compact_bodies ran member
  obtain ⟨sequential, parallel, outputs⟩ := shaped old inside loop looped
  refine ⟨fun mode => ?_, fun mode slot slotIn waiting => ?_, fun output completed => ?_⟩
  · obtain ⟨filled, current, waiting, shape⟩ := sequential mode
    have split := shape.1
    have done := shape.2.1
    have single := shape.2.2.1
    have running := shape.2.2.2.1
    have pending := shape.2.2.2.2
    refine ⟨filled.map (renameIteration (commitRenaming schedule start log (ordered log state))),
      current.map (renameIteration (commitRenaming schedule start log (ordered log state))),
      waiting.map (renameIteration (commitRenaming schedule start log (ordered log state))),
      by simp [split], fun slot slotIn => ?_, by simpa using single, fun slot slotIn => ?_, fun slot slotIn => ?_⟩
    · obtain ⟨original, originalIn, rfl⟩ := List.mem_map.mp slotIn
      obtain ⟨output, rfl⟩ := done original originalIn
      exact ⟨output, by simp⟩
    · obtain ⟨original, originalIn, rfl⟩ := List.mem_map.mp slotIn
      obtain ⟨scope, rfl⟩ := running original originalIn
      exact ⟨renameScope (commitRenaming schedule start log (ordered log state)) scope, by simp⟩
    · obtain ⟨original, originalIn, rfl⟩ := List.mem_map.mp slotIn
      rw [pending original originalIn]
      simp
  · obtain ⟨original, originalIn, rfl⟩ := List.mem_map.mp slotIn
    exact parallel mode original originalIn (renameIteration_waiting.mp waiting)
  · obtain ⟨original, originalIn, same⟩ := List.mem_map.mp completed
    rw [renameIteration_completed] at same
    exact outputs output (same ▸ originalIn)

/-! ## What an input keeps of its before-state's bodies (`Since`) -/

/-- A committed, well-formed before-state's bodies' keys are fixed by the commit's renaming. -/
theorem before_fixed {programBefore : Program} {b : State} (formedBefore : WellFormed programBefore b) (committed : Committed b)
    {earlier : MultiInstanceRun} (member : earlier ∈ b.slots.multiInstances) :
    renameId (commitRenaming schedule start log (ordered log state)) earlier.occurrence = earlier.occurrence :=
  id_fixed committed.issued (formedBefore.settled.bodies earlier member).1 (renameBy_fixes _)

/-- **`Unstarted b` across the commit** (its three fields, stated over their bodies): the before-state's bodies' keys
are fixed, issued and begun after the commit, and the draft the commit leaves is empty. -/
theorem orderJournal_unstarted {programBefore : Program} {b : State} (formedBefore : WellFormed programBefore b) (committed : Committed b)
    (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (below : ∀ earlier ∈ b.slots.multiInstances, OccurrenceIssued state earlier.occurrence)
    (begun : ∀ earlier ∈ b.slots.multiInstances, ∀ o ∈ state.occurrences, o.id = earlier.occurrence → o.begun = true)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    (∀ earlier ∈ b.slots.multiInstances, OccurrenceIssued after earlier.occurrence) ∧
    (∀ earlier ∈ b.slots.multiInstances, ∀ o ∈ after.occurrences, o.id = earlier.occurrence → o.begun = true) ∧
    (∀ earlier ∈ b.slots.multiInstances, ∀ o ∈ after.occurrences, o.id = earlier.occurrence →
      key after o ∉ after.draft.started.map (·.occurrence)) := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  refine ⟨fun earlier member => ?_, fun earlier member => ?_, fun _ _ _ _ _ => ?_⟩
  · have renamed := compact_occurrenceIssued ran counted' (rooted_parents rooted) (below earlier member)
    rwa [before_fixed formedBefore committed member] at renamed
  · have renamed := renamed_begun ran counted' issued owned rooted keys (below earlier member) (begun earlier member)
    rwa [before_fixed formedBefore committed member] at renamed
  · -- The commit empties the draft (`Step.orderJournal`).
    rw [(compact_kept ran).draft]
    simp

/-- **`Snapshots b` across the commit** (its two fields, stated over their bodies, `SnapshotFixed`'s six included): a
before-state's body keeps its snapshot, renamed onto itself, and a body issued since has a slot. `bodies` and
`bodyScopes` are `Laws.MultiInstance.Owned`'s `body` and `bodyScope` of the settled and the before-state, which the
`RunsFramed` lane keeps: a running body stands, so its key renames apart from the before-state's, and a before-state's
body's scope occurrence was issued there, so the renaming fixes it. -/
theorem orderJournal_snapshots {programBefore : Program} {b : State} (formedBefore : WellFormed programBefore b) (committed : Committed b)
    (bodyScopes : ∀ earlier ∈ b.slots.multiInstances, earlier.scope ∈ scopeIds b)
    (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (bodies : ∀ run ∈ state.slots.multiInstances, ∃ occurrence ∈ state.occurrences, occurrence.id = run.occurrence)
    (below : ∀ earlier ∈ b.slots.multiInstances, OccurrenceIssued state earlier.occurrence)
    (fixed : ∀ earlier ∈ b.slots.multiInstances, ∀ run ∈ state.slots.multiInstances, run.occurrence = earlier.occurrence →
      run.collection = earlier.collection ∧ run.instances.length = earlier.instances.length ∧ run.scope = earlier.scope ∧
      run.element = earlier.element ∧ run.occurrence = earlier.occurrence ∧
      ∀ (index : Nat) (output : Option Value), earlier.instances[index]? = some (.completed output) →
        run.instances[index]? = some (.completed output))
    (generated : ∀ run ∈ state.slots.multiInstances, (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ run.occurrence) →
      0 < run.instances.length)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    (∀ earlier ∈ b.slots.multiInstances, ∀ run ∈ after.slots.multiInstances, run.occurrence = earlier.occurrence →
      run.collection = earlier.collection ∧ run.instances.length = earlier.instances.length ∧ run.scope = earlier.scope ∧
      run.element = earlier.element ∧ run.occurrence = earlier.occurrence ∧
      ∀ (index : Nat) (output : Option Value), earlier.instances[index]? = some (.completed output) →
        run.instances[index]? = some (.completed output)) ∧
    (∀ run ∈ after.slots.multiInstances, (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ run.occurrence) →
      0 < run.instances.length) := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  refine ⟨fun earlier member run runIn named => ?_, fun run runIn fresh => ?_⟩
  · obtain ⟨old, oldIn, rfl⟩ := compact_bodies ran runIn
    obtain ⟨body, bodyIn, bodyId⟩ := bodies old oldIn
    have same : earlier.occurrence = old.occurrence := by
      rw [← bodyId]
      exact renamed_apart counted' issued owned rooted keys (below earlier member) bodyIn
        (by rw [before_fixed formedBefore committed member, bodyId]; exact named.symm)
    have kept := fixed earlier member old oldIn same.symm
    have stays := kept.2.2.2.2.2
    have scopeFixed : renameScope (commitRenaming schedule start log (ordered log state)) earlier.scope = earlier.scope :=
      scope_fixed committed.issued ((historic_of formedBefore.issued formedBefore.rooted).issued_key
        (bodyScopes earlier member)) (renameBy_fixes _)
    refine ⟨kept.1, by simpa using kept.2.1, by change renameScope _ old.scope = _; rw [kept.2.2.1, scopeFixed], kept.2.2.2.1,
      named, fun index output filled => ?_⟩
    change (old.instances.map _)[index]? = _
    rw [List.getElem?_map, stays index output filled]
    simp
  · obtain ⟨old, oldIn, rfl⟩ := compact_bodies ran runIn
    have count := generated old oldIn fun earlier member same => fresh earlier member (by
      change earlier.occurrence = renameId _ old.occurrence
      rw [← same, before_fixed formedBefore committed member])
    simpa using count

end Framed

end Kernel.Proofs.MultiInstance
