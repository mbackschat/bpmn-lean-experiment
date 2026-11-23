module

public import Kernel.Proofs.MultiInstance
public import Kernel.Proofs.Frame.Alongside
public import Kernel.Laws.Step.Ends
public import Kernel.Laws.MultiInstance.Entering

/-! # Proofs: what an input keeps of its start's bodies

`RunsGenerated` follows from what an input keeps of its start's bodies (`Since`): the relation, what the state
operations and `Step`'s phases keep of it, and the input's reset start, which keeps it. `Kernel.Proofs.MultiInstance.Registered`
carries it through the registered hooks. It reads no feature's Laws module, so it lies in no feature's rebuild cone
(guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within StrictlyWithin scopeIds)
open Kernel.Laws.MultiInstance (LoopOf Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed NumberedInOrder
  InstancesPlaced BeginsQueued UnbegunUnlooped SequentialSlots ParallelSlots OutputsFit IdsUnique)
open Kernel.Laws.Step (OccurPending)
open Kernel.Proofs.Frame (OccursAlongside FrameAlongside StoresAlongside Unmoved LeavesOwned StoresHeldOrFresh
  RunningContext ActiveInstance ClosureAlongside)

/-! ## What an input keeps of its start's bodies

Only an arrival sets a body's slot record afresh, and it arrives on the occurrence whose start the input's draft
journalled last (`Laws.Step.HookContract.arriveMultiInstance`), so an input carries, from its start `b`, that no
occurrence keyed by a body of `b` has a start in the draft (`Unstarted`): such an occurrence was begun at `b`, and a
begin starts an unbegun reservation or a fresh occurrence, under a key no begun one has. Beside it the input carries
what it keeps of the bodies of `b` (`Snapshots`): every other operation keeps a body's record, removes it or records an
instance's output in it. `Unstarted` reads no body's record, so the Multi-Instance hooks keep it through their feature
record (`Proofs.Frame.Alongside`); `Snapshots` reads only the records, so each hook keeps it by what it sets
(`Kernel.Proofs.MultiInstance.Registered`). -/

section Since

open Kernel.Laws.State (key)
open Kernel.Laws.MultiInstance (SnapshotFixed recorded)
open Kernel.Laws.Step (EndsStep)
open Kernel.Proofs.Frame (Alongside)

/-! ### The invariant -/

/-- What an input keeps of the occurrences its start `b`'s bodies are keyed by: each was issued and begun, and none has
a start in the draft. -/
structure Unstarted (b s : State) : Prop where
  below : ∀ earlier ∈ b.slots.multiInstances, Laws.State.OccurrenceIssued s earlier.occurrence
  begun : ∀ earlier ∈ b.slots.multiInstances, ∀ o ∈ s.occurrences, o.id = earlier.occurrence → o.begun = true
  unstarted : ∀ earlier ∈ b.slots.multiInstances, ∀ o ∈ s.occurrences, o.id = earlier.occurrence →
    key s o ∉ s.draft.started.map (·.occurrence)

/-- What an input keeps of its start `b`'s bodies: a record keyed by one of them keeps its snapshot, and any other has
a slot. -/
structure Snapshots (b s : State) : Prop where
  fixed : ∀ earlier ∈ b.slots.multiInstances, ∀ run ∈ s.slots.multiInstances, run.occurrence = earlier.occurrence →
    SnapshotFixed earlier run
  generated : ∀ run ∈ s.slots.multiInstances, (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ run.occurrence) →
    0 < run.instances.length

/-- `WellFormed` and what the input from `b` keeps of `b`'s bodies. -/
def Since (b : State) (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ Unstarted b s ∧ Snapshots b s

/-- What an operation from `s` to `t` keeps of what `Unstarted` reads: every occurrence `t` holds is one of `s` under
the same key, unchanged if begun, or issued since, and the draft's starts stay. -/
structure Moves (s t : State) : Prop where
  issued : Laws.State.OccurrenceGrows s t
  held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
    ¬ Laws.State.OccurrenceIssued s o'.id
  started : t.draft.started = s.draft.started

theorem Moves.ofEnds {s t : State} {spare : Option OccurrenceId} (step : EndsStep s t spare)
    (started : t.draft.started = s.draft.started) : Moves s t :=
  ⟨step.issued, fun o' inside => (step.held o' inside).imp_right
    (Or.elim · (·.1) fun ⟨_, _, takes⟩ => takes.fresh), started⟩

theorem Moves.same {s t : State} (occurrences : t.occurrences = s.occurrences) (scopes : t.scopes = s.scopes)
    (named : t.instanceId = s.instanceId) (issued : Laws.State.OccurrenceGrows s t)
    (started : t.draft.started = s.draft.started) : Moves s t :=
  ⟨issued, fun o' inside => .inl ⟨o', occurrences ▸ inside, rfl,
    Laws.State.key_congr (Laws.State.instanceOf_congr scopes named _), fun _ => rfl⟩, started⟩

/-- An occurrence keyed by a body of `b` that `t` holds is the record `s` held, under the same key. -/
theorem Unstarted.record {b s t : State} (kept : Unstarted b s)
    (held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
      ¬ Laws.State.OccurrenceIssued s o'.id)
    {earlier : MultiInstanceRun} (member : earlier ∈ b.slots.multiInstances) {o' : Occurrence}
    (inside : o' ∈ t.occurrences) (named : o'.id = earlier.occurrence) : o' ∈ s.occurrences ∧ key t o' = key s o' := by
  rcases held o' inside with ⟨o, old, same, ⟨keyed, unchanged⟩⟩ | fresh
  · obtain rfl := unchanged (kept.begun earlier member o old (same.symm.trans named))
    exact ⟨old, keyed⟩
  · exact absurd (named ▸ kept.below earlier member) fresh

theorem Unstarted.move {b s t : State} (kept : Unstarted b s) (moves : Moves s t) : Unstarted b t := by
  refine ⟨fun earlier member => moves.issued _ (kept.below earlier member),
    fun earlier member o inside named => ?_, fun earlier member o inside named => ?_⟩
  · exact kept.begun earlier member o (kept.record moves.held member inside named).1 named
  · obtain ⟨old, keyed⟩ := kept.record moves.held member inside named
    rw [keyed, moves.started]
    exact kept.unstarted earlier member o old named

/-- A start journalled for an occurrence `t` holds that was no begun occurrence of `s` keeps `Unstarted`: it is a
reservation of `s`, under its key, which no other occurrence has, or fresh, under a key the counters had not issued. -/
theorem Unstarted.start {program : Program} {b s t : State} {spare : Option OccurrenceId} {fact : StartedFact}
    {begun : Occurrence} (formed : WellFormed program s) (kept : Unstarted b s) (step : EndsStep s t spare)
    (started : t.draft.started = s.draft.started ++ [fact]) (named : fact.occurrence = key t begun)
    (present : begun ∈ t.occurrences) (unbegun : ∀ o ∈ s.occurrences, o.id = begun.id → o.begun = false) :
    Unstarted b t := by
  have held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
      ¬ Laws.State.OccurrenceIssued s o'.id := fun o' inside => (step.held o' inside).imp_right
        (Or.elim · (·.1) fun ⟨_, _, takes⟩ => takes.fresh)
  refine ⟨fun earlier member => step.issued _ (kept.below earlier member),
    fun earlier member o inside same => ?_, fun earlier member o inside same => ?_⟩
  · exact kept.begun earlier member o (kept.record held member inside same).1 same
  obtain ⟨old, keyed⟩ := kept.record held member inside same
  rw [started, List.map_append, List.mem_append, keyed]
  rintro (inDraft | newest)
  · exact kept.unstarted earlier member o old same inDraft
  rw [List.map_singleton, List.mem_singleton, named] at newest
  rcases step.held begun present with ⟨r, inS, ids, ⟨rekeyed, _⟩⟩ | ⟨_, uncounted⟩ | ⟨r, inS, takes⟩
  · obtain rfl := Laws.State.nodup_map_eq formed.distinct.keys old inS (newest.trans rekeyed)
    have := unbegun o old ids.symm
    rw [kept.begun earlier member o old same] at this
    cases this
  · exact uncounted (newest ▸ formed.occurrencesCounted o old)
  · have unbegunR := takes.unbegun
    obtain rfl := Laws.State.nodup_map_eq formed.distinct.keys old inS (newest.trans takes.keyed)
    rw [kept.begun earlier member o old same] at unbegunR
    cases unbegunR

theorem Snapshots.shrink {b s t : State} (kept : Snapshots b s)
    (bodies : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances) : Snapshots b t :=
  ⟨fun earlier member run inside same => kept.fixed earlier member run (bodies run inside) same,
    fun run inside apart => kept.generated run (bodies run inside) apart⟩

/-- A record no body of `b` is keyed by is `Generated` with its slot count. -/
theorem Snapshots.generatedOf {b s : State} {run : MultiInstanceRun} (kept : Snapshots b s)
    (member : run ∈ s.slots.multiInstances) :
    (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ run.occurrence) →
      Laws.MultiInstance.Generated run run.instances.length :=
  fun apart => ⟨rfl, kept.generated run member apart⟩

theorem Snapshots.same {b s t : State} (kept : Snapshots b s)
    (same : t.slots.multiInstances = s.slots.multiInstances) : Snapshots b t :=
  kept.shrink fun _ inside => same ▸ inside

/-! ### Snapshots -/

theorem snapshotFixed_refl (run : MultiInstanceRun) : SnapshotFixed run run :=
  ⟨rfl, rfl, rfl, rfl, rfl, fun _ _ filled => filled⟩

theorem snapshotFixed_trans {first second third : MultiInstanceRun} (one : SnapshotFixed first second)
    (two : SnapshotFixed second third) : SnapshotFixed first third :=
  ⟨two.collection.trans one.collection, two.count.trans one.count, two.scope.trans one.scope,
    two.element.trans one.element, two.occurrence.trans one.occurrence,
    fun index output filled => two.filledStays index output (one.filledStays index output filled)⟩

/-- Recording an active instance's output keeps the body's snapshot. -/
theorem recorded_fixed {run : MultiInstanceRun} {index : Nat} {scope : ScopeOccurrenceId} {output : Option Value}
    (results : List String) (slot : run.instances[index]? = some (.active scope)) :
    SnapshotFixed run (recorded run index output results) := by
  refine ⟨rfl, List.length_set .., rfl, rfl, rfl, fun other filled completed => ?_⟩
  by_cases same : index = other
  · subst same
    rw [slot] at completed
    cases completed
  · simp only [recorded, List.getElem?_set_ne same]
    exact completed

/-! ### The state operations -/

/-- A reservation keeps `Unstarted`: it moves the occurrences as `Laws.Step.EndsStep` says and keeps the draft's starts. -/
theorem Unstarted.reserve {program : Program} {b s : State} {element : ElementId} {scope : ScopeOccurrenceId}
    (kept : Unstarted b s) (formed : WellFormed program s) (stands : scope ∈ Laws.State.scopeIds s) :
    Unstarted b (s.reserve element scope).1 :=
  kept.move (.ofEnds (Laws.Step.reserve_frame formed element stands)
    (congrArg (·.started) (Laws.State.reserve_reserves s element scope).draft))

/-- A reservation keeps `Snapshots`: it keeps every body's record. -/
theorem Snapshots.reserve {b s : State} (kept : Snapshots b s) (element : ElementId) (scope : ScopeOccurrenceId) :
    Snapshots b (s.reserve element scope).1 :=
  kept.shrink fun _ inside => (Laws.State.reserve_reserves s element scope).slots ▸ inside

/-- The state operations keep `Unstarted`: each moves the occurrences and keys as `Laws.Step.EndsStep` says and keeps
the draft's starts; the Multi-Instance ones as well, since it reads no body's record. -/
theorem unstarted_alongside (b : State) (program : Program) : Alongside program (Unstarted b) where
  frame s _ moved kept := kept.move (.same moved.occurrences moved.scopes moved.instanceId
    (.of_same (congrArg (List.map ScopeOccurrence.id) moved.scopes) moved.scopeOrdinals moved.occurrenceOrdinals moved.table)
    (by rw [moved.started]))
  emit s _ _ _ _ _ kept := by
    rw [Laws.State.emit_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  complete s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  park _ _ _ _ kept := kept.move (.same rfl rfl rfl (.refl _) rfl)
  arm s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  armGateway s _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  raise s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  signalBegin s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  takePosition s kept := by
    rw [Laws.State.takePosition_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  enterScope s element parent locals owner formed stands _ kept :=
    kept.move (.ofEnds (Laws.Step.enterScope_frame formed element stands locals owner) (by rw [Laws.State.enterScope_eq]))
  reserve s element _ formed stands _ _ kept := kept.reserve formed stands.mem
  leaveScope _ _ formed present _ kept :=
    kept.move (.ofEnds (Laws.Step.leaveScope_frame formed present) (Laws.State.leaveScope_left formed present).started)
  clearInside _ _ keep formed present inside kept :=
    kept.move (.ofEnds (Laws.Step.clearInside_frame formed present inside)
      (Laws.State.clearInside_cleared formed present keep).started)
  disarm s host _ kept := kept.move (.ofEnds (Laws.Step.disarm_frame s host) (by rw [Laws.State.disarm_eq]))
  setVariable s target name value _ kept :=
    kept.move (.ofEnds (Laws.Step.setVariable_frame s target name value)
      (congrArg (·.started) (Laws.State.setVariable_same s target name value).draft))
  removeVariable s target name _ kept :=
    kept.move (.ofEnds (Laws.Step.removeVariable_frame s target name)
      (congrArg (·.started) (Laws.State.removeVariable_same s target name).draft))
  instanceBegin s _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  defer s _ _ _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept.move (.same rfl rfl rfl (.refl _) rfl)
  leaveInstance _ _ _ formed _ _ present kept :=
    kept.move (.ofEnds (Laws.Step.leaveScope_frame formed present) (Laws.State.leaveScope_left formed present).started)
  runs _ _ _ _ kept := kept.move (.same rfl rfl rfl (.refl _) rfl)

/-- Storing compensation runs keeps `Unstarted`: it moves no occurrence and no start. -/
theorem unstarted_stores (b : State) (program : Program) : StoresAlongside program (Unstarted b) :=
  { (unstarted_alongside b program).toFrameAlongside with
    storeRuns := fun _ _ _ _ _ _ kept => kept.move (.same rfl rfl rfl (.refl _) rfl) }

/-- The state operations the hooks apply keep `Snapshots`: none sets a body's record, and each keeps or removes
some. -/
theorem snapshots_frameAlongside (b : State) (program : Program) : StoresAlongside program (Snapshots b) where
  frame _ _ moved kept := kept.shrink fun _ inside => moved.multiInstances ▸ inside
  emit s _ _ _ _ _ kept := by
    rw [Laws.State.emit_eq]
    exact kept.same rfl
  complete s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.same rfl
  park _ _ _ _ kept := kept.same rfl
  arm s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.same rfl
  armGateway s _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.same rfl
  raise s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.same rfl
  signalBegin s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.same rfl
  takePosition s kept := by
    rw [Laws.State.takePosition_eq]
    exact kept.same rfl
  enterScope s element parent locals owner _ _ _ kept := by
    rw [Laws.State.enterScope_eq]
    exact kept.same rfl
  reserve s element scope _ _ _ _ kept := kept.reserve element scope
  leaveScope _ _ formed present _ kept := kept.shrink (Laws.State.leaveScope_left formed present).slots.bodies
  clearInside _ _ keep formed present _ kept :=
    kept.shrink (Laws.State.clearInside_cleared formed present keep).slots.bodies
  disarm s host _ kept := by
    rw [Laws.State.disarm_eq]
    exact kept.same rfl
  setVariable s target name value _ kept :=
    kept.shrink fun _ inside => (Laws.State.setVariable_same s target name value).slots ▸ inside
  removeVariable s target name _ kept :=
    kept.shrink fun _ inside => (Laws.State.removeVariable_same s target name).slots ▸ inside
  storeRuns _ _ _ _ _ _ kept := kept.same rfl

/-- The state operations keep `Unstarted` and `Snapshots` together. -/
theorem since_frameAlongside (b : State) (program : Program) :
    StoresAlongside program fun s => Unstarted b s ∧ Snapshots b s :=
  have one := unstarted_stores b program
  have two := snapshots_frameAlongside b program
  { frame := fun s t moved kept => ⟨one.frame s t moved kept.1, two.frame s t moved kept.2⟩
    emit := fun s occurrence flows formed stands continues kept =>
      ⟨one.emit s occurrence flows formed stands (continues.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
        two.emit s occurrence flows formed stands (continues.mono fun _ held => ⟨held.1, held.2.2⟩) kept.2⟩
    complete := fun s id leave writes rule source kept =>
      ⟨one.complete s id leave writes rule (source.mono fun _ held => held.1) kept.1,
        two.complete s id leave writes rule (source.mono fun _ held => held.2) kept.2⟩
    park := fun s waiting formed waits kept =>
      ⟨one.park s waiting formed waits kept.1, two.park s waiting formed waits kept.2⟩
    arm := fun s host element scope formed hosted kept =>
      ⟨one.arm s host element scope formed hosted kept.1, two.arm s host element scope formed hosted kept.2⟩
    raise := fun s raised origin formed cancel hosted kept =>
      ⟨one.raise s raised origin formed cancel hosted kept.1, two.raise s raised origin formed cancel hosted kept.2⟩
    armGateway := fun s occurrence header payload formed member gateway kept =>
      ⟨one.armGateway s occurrence header payload formed member gateway kept.1,
        two.armGateway s occurrence header payload formed member gateway kept.2⟩
    signalBegin := fun s request formed fits anchored kept =>
      ⟨one.signalBegin s request formed fits (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
        two.signalBegin s request formed fits (anchored.mono fun _ held => ⟨held.1, held.2.2⟩) kept.2⟩
    takePosition := fun s kept => ⟨one.takePosition s kept.1, two.takePosition s kept.2⟩
    enterScope := fun s element parent locals owner formed stands anchored kept =>
      ⟨one.enterScope s element parent locals owner formed stands (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
        two.enterScope s element parent locals owner formed stands (anchored.mono fun _ held => ⟨held.1, held.2.2⟩)
          kept.2⟩
    reserve := fun _ element scope formed stands _ _ kept => ⟨kept.1.reserve formed stands.mem, kept.2.reserve element scope⟩
    leaveScope := fun s scope formed present leaves kept =>
      ⟨one.leaveScope s scope formed present leaves kept.1, two.leaveScope s scope formed present leaves kept.2⟩
    clearInside := fun s scope keep formed present inside kept =>
      ⟨one.clearInside s scope keep formed present inside kept.1,
        two.clearInside s scope keep formed present inside kept.2⟩
    disarm := fun s host formed kept => ⟨one.disarm s host formed kept.1, two.disarm s host formed kept.2⟩
    setVariable := fun s target name value formed kept =>
      ⟨one.setVariable s target name value formed kept.1, two.setVariable s target name value formed kept.2⟩
    removeVariable := fun s target name formed kept =>
      ⟨one.removeVariable s target name formed kept.1, two.removeVariable s target name formed kept.2⟩
    storeRuns := fun s compensation formed fresh resumes provenance kept =>
      ⟨one.storeRuns s compensation formed fresh (fun run member element at_ leave resumed =>
          (resumes run member element at_ leave resumed).imp_right (·.imp fun _ => And.imp_left And.left))
          (provenance.weaken fun _ held => ⟨held.1, held.2.1⟩) kept.1,
        two.storeRuns s compensation formed fresh (fun run member element at_ leave resumed =>
          (resumes run member element at_ leave resumed).imp_right (·.imp fun _ => And.imp_left And.right))
          (provenance.weaken fun _ held => ⟨held.1, held.2.2⟩) kept.2⟩ }

/-- Subscriptions' reservations and queued occurrences keep `Unstarted` and `Snapshots`: they move the occurrences as
`Laws.Step.EndsStep` says, keep the draft's starts and keep every body's record. -/
theorem since_occursAlongside (b : State) (program : Program) :
    OccursAlongside program fun s => Unstarted b s ∧ Snapshots b s where
  reserve _ element scope formed stands _ _ kept := ⟨kept.1.reserve formed stands.mem, kept.2.reserve element scope⟩
  occur s _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  compensate s _ _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  throwCompensate s _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  raise s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  enterCalled s call variables definition formed member _ _ _ _ kept := by
    refine ⟨kept.1.move (.ofEnds (Laws.Step.enterCalled_frame formed program (formed.owned.occurrenceScopes call member)
      variables definition) ?_), ?_⟩ <;>
      rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
    exact kept.2.same rfl

/-- Dropping a record keeps both: it moves no key and no body's record. -/
theorem since_withoutRecord {b t : State} (id : OccurrenceId) (kept : Unstarted b t ∧ Snapshots b t) :
    Unstarted b (Laws.State.withoutRecord t id) ∧ Snapshots b (Laws.State.withoutRecord t id) :=
  ⟨kept.1.move (.ofEnds (Laws.Step.withoutRecord_frame t id) rfl), kept.2.same rfl⟩

/-- The start of a begun reservation or a fresh occurrence of a well-formed `s`, which keeps every body's record. -/
theorem since_start {program : Program} {b s t : State} {spare : Option OccurrenceId} {fact : StartedFact} {begun : Occurrence}
    (formed : WellFormed program s) (kept : Unstarted b s ∧ Snapshots b s) (step : EndsStep s t spare)
    (started : t.draft.started = s.draft.started ++ [fact]) (named : fact.occurrence = key t begun)
    (present : begun ∈ t.occurrences) (unbegun : ∀ o ∈ s.occurrences, o.id = begun.id → o.begun = false)
    (slots : t.slots = s.slots) : Unstarted b t ∧ Snapshots b t :=
  ⟨kept.1.start formed step started named present unbegun, kept.2.shrink fun _ inside => slots ▸ inside⟩

/-! ### `Step`'s phases -/

/-- `Step`'s closure phases keep both: journalling empties the draft, a begin starts an admitted reservation, which is
unbegun, or a fresh occurrence, and cancelling withdraws items and removes an occurrence
(`FrameAlongside.cancelOccurrence`). Ordering the journal reads the running bodies' occurrences, so
`Kernel.Proofs.MultiInstance.Framed` keeps both across it beside the lane's slot invariant (`sinceFramed_stepAlongside`). -/
theorem since_closureAlongside (b : State) (program : Program) :
    ClosureAlongside program fun s => Unstarted b s ∧ Snapshots b s where
  toFrameAlongside := (since_frameAlongside b program).toFrameAlongside
  journal _ _ _ _ kept _ _ _ := ⟨⟨kept.1.below, kept.1.begun, fun _ _ _ _ _ => by simp⟩, kept.2.same rfl⟩
  queueBatch _ _ _ kept := by
    rw [Laws.State.queueBatch_eq]
    exact ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  dequeue _ _ _ _ kept := ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  unqueue _ _ _ kept := ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  untoken _ _ _ kept := ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩
  begin s request role sourceType formed stands admitted _ _ kept := by
    have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
    have present : (s.beginOccurrence request role sourceType).2 ∈ (s.beginOccurrence request role sourceType).1.occurrences := by
      rw [begins.occurrences]
      exact List.mem_append_right _ (List.mem_singleton_self _)
    refine since_start formed kept (Laws.Step.beginOccurrence_frame formed stands admitted role sourceType) begins.started
      rfl present (fun o member same => ?_) begins.slots
    have below := formed.issued.occurrences o member
    rw [same] at below
    rcases begins.source with ⟨reserved, source⟩ | ⟨_, source⟩ | fresh
    · have named : reserved.id ∈ Laws.State.names request := by simp [Laws.State.names, source.named]
      exact ((admitted.2.1 reserved.id named).1.2 o member (same.trans source.id)).1
    · exact (source.fresh formed.issuer stands.mem below).elim
    · exact (fresh.fresh formed.issuer stands.mem below).elim
  cancel s id formed kept := (since_frameAlongside b program).cancelOccurrence
    (fun _ id _ kept => since_withoutRecord id kept)
    (fun _ _ _ kept => ⟨kept.1.move (.same rfl rfl rfl (.refl _) rfl), kept.2.same rfl⟩) (id := id) formed kept

/-- The completion pipeline's own phases keep `Since` where they keep `WellFormed`: starting a reservation starts an
unbegun occurrence, removing one is `FrameAlongside.removeOccurrence`, and journalling an end moves nothing either
reads. -/
theorem since_pipelinePhases (b : State) (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases (Since b) where
  startReserved program s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    rw [Laws.State.closeOwnItems_eq]
    suffices started : Unstarted b (s.startReserved occurrence sourceType).1 ∧
        Snapshots b (s.startReserved occurrence sourceType).1 from
      ⟨started.1.move (.same rfl rfl rfl (.refl _) rfl), started.2.same rfl⟩
    cases begun : occurrence.begun
    · have starts := Laws.State.startReserved_starts s sourceType begun
      have present : { occurrence with begun := true } ∈ (s.startReserved occurrence sourceType).1.occurrences := by
        rw [starts.occurrences]
        exact List.mem_map.mpr ⟨occurrence, member, by simp⟩
      refine since_start (begun := { occurrence with begun := true }) holds.1 holds.2
        (Laws.Step.startReserved_frame holds.1 member sourceType) starts.started rfl present (fun o inside same => ?_)
        starts.slots
      obtain rfl := Laws.State.nodup_map_eq holds.1.distinct.occurrences inside member same
      exact begun
    · rw [Laws.State.startReserved_begun s sourceType begun]
      exact holds.2
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (since_frameAlongside b program).removeOccurrence (fun _ id _ kept => since_withoutRecord id kept) holds.1
      holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact ⟨holds.2.1.move (.same rfl rfl rfl (.refl _) rfl), holds.2.2.same rfl⟩⟩

/-- An input's start: the well-formed `b` with its journal, intents, draft and writes cleared keeps `Since b`, since
every body's occurrence has settled (`Laws.State.SlotsSettled.bodies`) and one record per body occurrence is held. -/
theorem since_reset {program : Program} {b : State} (formed : WellFormed program b) (committed : Laws.State.Committed b)
    (keyed : RunsKeyed b) :
    Since b program { b with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] } := by
  refine ⟨Laws.State.reset_wellFormed formed committed, ⟨fun earlier member => (formed.settled.bodies earlier member).1,
    fun earlier member o inside same => (formed.settled.bodies earlier member).2.1 o inside same,
    fun _ _ _ _ _ => by simp⟩, ⟨fun earlier member run inside same => ?_, fun run inside apart => absurd rfl
    (apart run inside)⟩⟩
  obtain rfl := Laws.State.nodup_map_eq keyed member inside same.symm
  exact snapshotFixed_refl _

end Since


end Kernel.Proofs.MultiInstance
