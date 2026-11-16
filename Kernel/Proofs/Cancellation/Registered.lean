module

public import Kernel.Proofs.Cancellation
public import Kernel.Proofs.Step.Contract
public import Kernel.Proofs.State
public import Kernel.Laws.State.Fire
public import Kernel.Laws.Registry
import Kernel.Laws.State.Counters

/-! # Proofs: cancellation over the registered hooks

The registered hooks keep a property carried beside `Laws.State.WellFormed` when the state operations they apply keep
it (`Alongside`): each feature's operations record of `WellFormed` and the property follows from its record of
`WellFormed` and `Alongside`, and the registered hooks' contract follows from the feature records
(`Proofs.Step.registered_contract`). The cancellation lane instantiates it at the before-state's scope occurrences
(`KeepsScopes`), which gives `SubtreeRemoved Registry.hooks`, and at an input's end facts from its start
(`Laws.Step.EndsKept`), which gives `RemovedEndOnce Registry.hooks`. Both take the records and phases of `WellFormed`
as arguments, which `Kernel.Proofs.Step` fills, since that module imports this one. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Proofs.Cancellation

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.Step (Operations)
open Kernel.Proofs.Frame

/-! ## Each feature's operations record beside `WellFormed` -/

section Alongside

variable {rel : State → Prop}

theorem operations_alongside {rel : Program → State → Prop} (side : ∀ program, FrameAlongside program (rel program))
    (ops : Operations WellFormed) : Operations fun program s => WellFormed program s ∧ rel program s where
  variablesHoused program s holds := ops.variablesHoused program s holds.1
  rootStands program s holds := ops.rootStands program s holds.1
  setVariable program s target name value holds stands := ⟨ops.setVariable program s target name value holds.1 stands,
    (side program).setVariable s target name value holds.1 holds.2⟩
  removeVariable program s target name holds :=
    ⟨ops.removeVariable program s target name holds.1, (side program).removeVariable s target name holds.1 holds.2⟩

theorem workOps_alongside {program : Program} (side : FrameAlongside program rel) (occurs : OccursAlongside program rel)
    (ops : Laws.Work.WorkOps program (WellFormed program)) :
    Laws.Work.WorkOps program fun s => WellFormed program s ∧ rel s where
  write s scope writes rule holds := ⟨ops.write s scope writes rule holds.1, side.signal holds.2 _⟩
  complete s item leave writes rule holds open_ unstarted unnamed :=
    ⟨ops.complete s item leave writes rule holds.1 open_ unstarted unnamed, side.signal holds.2 _ (unplacing := Laws.Step.placing_complete unnamed)⟩
  completeOwner s scope occurrence leave writes rule holds member owned link unnamed :=
    ⟨ops.completeOwner s scope occurrence leave writes rule holds.1 member owned link unnamed,
      side.signal holds.2 _ (unplacing := Laws.Step.placing_complete unnamed)⟩
  raise s item code message patch holds member effect :=
    ⟨ops.raise s item code message patch holds.1 member effect, side.raise s _ _ holds.1
      (Laws.State.isCancel_error _ _) ((holds.1.owned.itemOccurrences item member).imp fun _ ⟨inside, _, rest⟩ =>
        ⟨inside, rest⟩) holds.2⟩
  cancel s holds := ⟨ops.cancel s holds.1, side.signal holds.2 _⟩
  rekind s change holds kept keep :=
    ⟨ops.rekind s change holds.1 kept keep,
      side.frame s _ .same holds.2⟩
  workKind s item holds member waits := ops.workKind s item holds.1 member waits
  activity := ops.activity
  distinct s holds := ops.distinct s holds.1
  queued := ops.queued
  kept := ops.kept
  completeBegun s occurrence leave writes rule holds member begun unnamed :=
    ⟨ops.completeBegun s occurrence leave writes rule holds.1 member begun unnamed, side.signal holds.2 _ (unplacing := Laws.Step.placing_complete unnamed)⟩
  housed s occurrence holds member := ops.housed s occurrence holds.1 member
  hold s held holds := ⟨ops.hold s held holds.1, side.hold holds.2 held⟩
  enter s element locals occurrence holds member begun named :=
    have entered := ops.enter s element locals occurrence holds.1 member begun named
    ⟨⟨entered.1, side.enterScope s _ _ _ _ holds.1 (named ▸ Laws.Flow.Anchored.occurrence member) holds.2⟩,
      entered.2⟩
  openItem s kind occurrence holds member begun unstarted role :=
    have opened := ops.openItem s kind occurrence holds.1 member begun unstarted role
    ⟨⟨opened.1, side.openItem holds.2 kind occurrence⟩, opened.2⟩
  arm s occurrence element holds member begun named := ⟨ops.arm s occurrence element holds.1 member begun named,
    side.arm s _ _ _ holds.1 ⟨occurrence, member, rfl, named.symm, rfl⟩ holds.2⟩
  enterCalled s call variables definition holds member begun role activity unowned :=
    have entered := ops.enterCalled s call variables definition holds.1 member begun role activity unowned
    ⟨⟨entered.1, occurs.enterCalled s call variables definition holds.1 member begun role activity unowned holds.2⟩,
      entered.2⟩
  armScope s scope holds stands := ⟨ops.armScope s scope holds.1 stands, side.signal holds.2 _⟩
  begin s element scope holds stands called :=
    ⟨ops.begin s element scope holds.1 stands called, side.signalBegin _ _ holds.1 (.fresh rfl rfl)
      ⟨⟨element, .inl rfl, .inl (.inr (.inr (.inr (.inl called))))⟩, fun _ _ none => (by cases none),
        fun _ none => by cases none⟩ holds.2⟩

/-- Flow's record beside `WellFormed`, an outflow's flows read off states that kept `srel` beside it. -/
theorem flowOps_alongside {srel : State → Prop} {program : Program} (side : FrameAlongside program rel srel)
    (ops : Laws.Flow.FlowOps program (WellFormed program)) :
    Laws.Flow.FlowOps program (fun s => WellFormed program s ∧ rel s) fun s => WellFormed program s ∧ srel s where
  emit s occurrence flows holds stands continues :=
    ⟨ops.emit s occurrence flows holds.1 stands (continues.mono fun _ held => held.1),
      side.emit s occurrence flows holds.1 stands continues holds.2⟩
  complete s occurrence leave writes rule holds member begun offered :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun (offered.mono fun _ held => held.1),
      side.complete s _ leave writes rule (.inl offered) holds.2⟩

theorem joinOps_alongside {program : Program} (side : FrameAlongside program rel)
    (ops : Laws.Flow.JoinOps program (WellFormed program) Laws.State.Settled) :
    Laws.Flow.JoinOps program (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  park s waiting holds waits :=
    ⟨ops.park s waiting holds.1 waits, side.park s waiting holds.1 waits holds.2⟩
  unpark s keep holds :=
    ⟨ops.unpark s keep holds.1, side.frame s _ (.same (parked := fun _ kept => (List.mem_filter.mp kept).1)) holds.2⟩
  parked s waiting holds member := ops.parked s waiting holds.1 member
  begun s occurrence holds member begun := ops.begun s occurrence holds.1 member begun
  reparked := ops.reparked
  complete s id leave writes rule holds settled offered :=
    ⟨ops.complete s id leave writes rule holds.1 settled (offered.mono fun _ held => held.1),
      side.complete s id leave writes rule (.inl offered) holds.2⟩
  completed := ops.completed
  armGateway s occurrence header payload holds member begun gateway :=
    ⟨ops.armGateway s occurrence header payload holds.1 member begun gateway,
      side.armGateway s occurrence header payload holds.1 member gateway holds.2⟩

/-- Leaving a scope occurrence keeps no instance entry it did not have. -/
private theorem leaveScope_entries (s : State) (scope : ScopeOccurrenceId) :
    ∀ entry ∈ (s.leaveScope scope).slots.instances, entry ∈ s.slots.instances := by
  intro entry inside
  rw [Laws.State.leaveScope_slots_eq] at inside
  obtain ⟨_, shape⟩ := Laws.State.clearInside_eq s scope []
  rw [shape] at inside
  exact (List.mem_filter.mp inside).1

/-- The bodies' slot records after `next` is set in a state `t`: each held in `t`, or `next`, anchored in `t`. -/
private theorem setRun_anchored {inv : State → Prop} {program : Program} {t : State} {next : MultiInstanceRun}
    (anchored : Laws.Flow.Anchored inv program t next.element next.scope) :
    ∀ run ∈ (Feature.MultiInstance.setRun t next).slots.multiInstances,
      Laws.Flow.Anchored inv program t run.element run.scope := fun run member => by
  rcases Proofs.MultiInstance.mem_setRun member with ⟨old, _⟩ | rfl
  · exact ⟨run.element, .inl rfl, .inl (.inr (.inr (.inr (.inr (.inl ⟨run, old, rfl, rfl⟩)))))⟩
  · exact anchored

/-- Multi-Instance's record beside `WellFormed`, through `Alongside`'s instance leave and run replacement. -/
theorem multiInstanceOps_alongside {program : Program} (side : Alongside program rel)
    (ops : Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled) :
    Laws.MultiInstance.MultiInstanceOps program (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  issued s holds := ops.issued s holds.1
  contexts s holds := ops.contexts s holds.1
  record s run index scope output results holds member slot stands fits := by
    have recorded := ops.record s run index scope output results holds.1 member slot stands fits
    have parentOf := (holds.1.settled.placed run member _ (List.mem_of_getElem? slot)).2
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
    subst named
    obtain ⟨left, -, frame⟩ := Laws.State.leaveChild_wellFormed holds.1 inside (parentOf entry inside rfl)
    have held : Laws.Flow.Anchored (fun t => WellFormed program t ∧ rel t) program (s.leaveScope entry.id)
        run.element run.scope :=
      Laws.Flow.Anchored.weaken holds ⟨run.element, .inl rfl, .inl (.inr (.inr (.inr (.inr (.inl ⟨run, member, rfl,
        rfl⟩)))))⟩ (Nat.le_of_eq (Laws.State.leaveScope_nextIssue s entry.id).symm)
        (fun _ present => frame.scopesSublist.subset present) (leaveScope_entries s entry.id)
    refine ⟨⟨recorded.1, ?_⟩, recorded.2⟩
    rw [Laws.MultiInstance.leftWith, Laws.MultiInstance.setRun_eq]
    exact side.runs _ _ left (setRun_anchored held) (side.leaveInstance s run entry.id holds.1 member
      (List.mem_of_getElem? slot) stands holds.2)
  bodies s run holds member := ops.bodies s run holds.1 member
  placed s run holds member := ops.placed s run holds.1 member
  complete s id leave writes rule holds settled unnamed :=
    ⟨ops.complete s id leave writes rule holds.1 settled unnamed, side.signal holds.2 _ (unplacing := Laws.Step.placing_complete unnamed)⟩
  begun s occurrence holds member begun := ops.begun s occurrence holds.1 member begun
  housed s occurrence holds member := ops.housed s occurrence holds.1 member
  hold s held holds := ⟨ops.hold s held holds.1, side.hold holds.2 held⟩
  enter s element parent locals owner holds stands owned anchored :=
    have entered := ops.enter s element parent locals owner holds.1 stands owned (anchored.mono fun _ => And.left)
    ⟨⟨entered.1, side.enterScope s element parent locals owner holds.1 anchored holds.2⟩, entered.2⟩
  arm s occurrence element holds member begun named :=
    have armed := ops.arm s occurrence element holds.1 member begun named
    ⟨⟨armed.1, side.arm s _ _ _ holds.1 ⟨occurrence, member, rfl, named.symm, rfl⟩ holds.2⟩, armed.2⟩
  begin s request holds bare stands anchored :=
    have begun := ops.begin s request holds.1 bare stands (anchored.mono fun _ => And.left)
    ⟨⟨begun.1, side.instanceBegin s request holds.1 anchored holds.2⟩, begun.2⟩
  defer s requests holds bare anchored :=
    have deferred := ops.defer s requests holds.1 bare fun request member => (anchored request member).mono
      fun _ => And.left
    ⟨⟨deferred.1, side.defer s requests holds.1 anchored holds.2⟩, deferred.2⟩
  runs s base next loop holds settledNext placedNext opens anchored linked :=
    have ran := ops.runs s base next loop holds.1 settledNext placedNext opens (anchored.mono fun _ => And.left) linked
    ⟨⟨ran.1, by
      rw [Laws.MultiInstance.setRun_eq]
      exact side.runs _ _ holds.1 (setRun_anchored anchored) holds.2⟩, ran.2⟩
  write s scope writes rule holds :=
    have written := ops.write s scope writes rule holds.1
    ⟨⟨written.1, side.signal holds.2 _⟩, written.2⟩

theorem startsOps_alongside {program : Program} (side : FrameAlongside program rel)
    (ops : Laws.Starts.StartsOps (WellFormed program)) :
    Laws.Starts.StartsOps fun s => WellFormed program s ∧ rel s where
  clock s atMs holds :=
    ⟨ops.clock s atMs holds.1, side.frame s _ .same holds.2⟩
  complete s occurrence leave writes rule holds member begun unnamed :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun unnamed, side.signal holds.2 _ (unplacing := Laws.Step.placing_complete unnamed)⟩

theorem scopesOps_alongside {program : Program} (side : FrameAlongside program rel)
    (ops : Laws.Scopes.ScopesOps program (WellFormed program)) :
    Laws.Scopes.ScopesOps program fun s => WellFormed program s ∧ rel s where
  owner s scope occurrence holds member owned link := ops.owner s scope occurrence holds.1 member owned link
  complete s occurrence leave writes rule holds member begun unnamed :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun unnamed, side.signal holds.2 _ (unplacing := Laws.Step.placing_complete unnamed)⟩
  clear s occurrence inner holds member begun ready :=
    have cleared := ops.clear s occurrence inner holds.1 member begun ready
    have kept : ∀ o ∈ s.occurrences, o.id ∈ occurrence.id :: inner.toList →
        ¬ Laws.State.StrictlyWithin s o.scope occurrence.scope := fun o inside keeps strictly => by
      rcases List.mem_cons.mp keeps with same | reserved
      · exact strictly.2 (congrArg Occurrence.scope (Laws.State.nodup_map_eq holds.1.distinct.occurrences inside member same))
      · exact strictly.2 ((ready o.id reserved).2.2 o inside rfl)
    ⟨⟨cleared.1, side.clearInside s _ _ holds.1 (holds.1.owned.occurrenceScopes occurrence member) kept holds.2⟩,
      cleared.2⟩
  enter s element locals occurrence inner holds member begun named ready :=
    have entered := ops.enter s element locals occurrence inner holds.1 member begun named ready
    ⟨⟨entered.1, side.enterScope s _ _ _ _ holds.1 (named ▸ Laws.Flow.Anchored.occurrence member) holds.2⟩,
      entered.2⟩
  arm s occurrence element holds member begun named := ⟨ops.arm s occurrence element holds.1 member begun named,
    side.arm s _ _ _ holds.1 ⟨occurrence, member, rfl, named.symm, rfl⟩ holds.2⟩
  armScope s scope holds stands := ⟨ops.armScope s scope holds.1 stands, side.signal holds.2 _⟩
  begin s request holds stands inner flows owned nodup admitted anchored :=
    ⟨ops.begin s request holds.1 stands inner flows owned nodup admitted (anchored.mono fun _ => And.left),
      side.signalBegin _ _ holds.1 (.flows flows owned) anchored holds.2⟩
  armed := ops.armed
  scopeArmed := ops.scopeArmed
  signalScopes := ops.signalScopes

/-- A clearing keeps no scope occurrence and no instance entry it did not have. -/
private theorem cleared_within (s : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    (∀ entry ∈ (s.clearInside scope keep).scopes, entry ∈ s.scopes) ∧
      ∀ entry ∈ (s.clearInside scope keep).slots.instances, entry ∈ s.slots.instances := by
  obtain ⟨_, shape⟩ := Laws.State.clearInside_eq s scope keep
  rw [shape]
  exact ⟨fun _ inside => (List.mem_filter.mp inside).1, fun _ inside => (List.mem_filter.mp inside).1⟩

theorem propagationOps_alongside {program : Program} (side : FrameAlongside program rel)
    (occurs : OccursAlongside program rel)
    (ops : Laws.Propagation.PropagationOps program (WellFormed program)) :
    Laws.Propagation.PropagationOps program fun s => WellFormed program s ∧ rel s where
  complete s occurrence leave writes rule holds member begun unnamed :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun unnamed, side.signal holds.2 _ (unplacing := Laws.Step.placing_complete unnamed)⟩
  raise s raised occurrence holds member begun raises :=
    ⟨ops.raise s raised occurrence holds.1 member begun (raises.imp fun _ => And.left),
      occurs.raise s raised occurrence holds.1 raises holds.2⟩
  fire s item fired holds := ⟨ops.fire s item fired holds.1, side.signal holds.2 _⟩
  outbox s outbox holds :=
    ⟨ops.outbox s outbox holds.1, side.frame s _ .same holds.2⟩
  compensate s occurrence scope activity trigger leave holds member begun begunFrom unnamed named :=
    ⟨ops.compensate s occurrence scope activity trigger leave holds.1 member begun (begunFrom.imp fun _ => And.left)
      unnamed named, occurs.throwCompensate s occurrence scope activity trigger leave holds.1 begunFrom named unnamed
        holds.2⟩
  terminate s occurrence holds member begun :=
    have cleared := ops.terminate s occurrence holds.1 member begun
    ⟨⟨cleared.1, side.clearInside s _ _ holds.1 (holds.1.owned.occurrenceScopes occurrence member)
      (fun _ inside keeps strictly => strictly.2 (congrArg Occurrence.scope (Laws.State.nodup_map_eq
        holds.1.distinct.occurrences inside member (List.mem_singleton.mp keeps)))) holds.2⟩, cleared.2⟩
  openItem s kind occurrence holds member begun unstarted role :=
    ⟨ops.openItem s kind occurrence holds.1 member begun unstarted role, side.openItem holds.2 kind occurrence⟩
  signalOccurrences := ops.signalOccurrences
  signalFrame := ops.signalFrame
  begin s element scope holds stands anchored :=
    ⟨ops.begin s element scope holds.1 stands (anchored.mono fun _ => And.left), side.signalBegin _ _ holds.1
      (.fresh rfl rfl) ⟨anchored, fun _ _ none => (by cases none), fun _ none => by cases none⟩ holds.2⟩
  cancel s id holds := ⟨ops.cancel s id holds.1, side.signal holds.2 _⟩
  occur s element scope leave writes rule holds bounded anchored :=
    ⟨ops.occur s element scope leave writes rule holds.1 bounded (anchored.mono fun _ => And.left),
      occurs.occur _ _ _ _ _ _ holds.1 (.inl bounded) anchored holds.2⟩
  write s scope writes rule holds := ⟨ops.write s scope writes rule holds.1, side.signal holds.2 _⟩
  failCompensation s handler code message origin holds :=
    ⟨ops.failCompensation s handler code message origin holds.1, side.signal holds.2 _⟩
  fail s failure holds := ⟨ops.fail s failure holds.1, side.signal holds.2 _⟩
  disarm s host holds :=
    have disarmed := ops.disarm s host holds.1
    ⟨⟨disarmed.1, side.disarm s host holds.1 holds.2⟩, disarmed.2⟩
  rollBack s scope trigger leave element parent flows holds stands bounded rolls anchored listed :=
    ⟨ops.rollBack s scope trigger leave element parent flows holds.1 stands bounded (rolls.imp fun _ => And.left)
      (anchored.mono fun _ => And.left) listed,
      occurs.compensate _ _ _ _ _ _ _ _ (.inl bounded) ⟨s, rfl, holds.1, List.mem_map.mpr stands, rolls⟩
        (.inl ⟨anchored.weaken holds (Nat.le_of_eq (Laws.State.clearInside_nextIssue s scope []).symm)
          (cleared_within s scope []).1 (cleared_within s scope []).2, listed⟩)
        (side.clearInside s scope [] holds.1 (List.mem_map.mpr stands) (fun _ _ none => by simp at none) holds.2)⟩

/-- Compensation runs' record beside `WellFormed`: a context `Laws.Compensation.RunsOps` leaves is a running one
(`LeavesOwned`), the runs it stores hold only contexts held or fresh (`StoresHeldOrFresh`) and resume by pending
reservations (`ResumesPending`), and an ended run's resume is pending. -/
theorem runsOps_alongside {program : Program} (side : StoresAlongside program rel)
    (occurs : OccursAlongside program rel)
    (ops : Laws.Compensation.RunsOps program (WellFormed program) Laws.State.Settled) :
    Laws.Compensation.RunsOps program (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  fits s run holds member := ops.fits s run holds.1 member
  issued s holds := ops.issued s holds.1
  slotsIssued s holds := ops.slotsIssued s holds.1
  store s compensation holds kept contexts resumes provenance :=
    have stored := ops.store s compensation holds.1 kept contexts (fun run member element at_ leave resumed =>
      (resumes run member element at_ leave resumed).imp fun _ => And.imp_left And.left)
      (provenance.weaken fun _ => And.left)
    ⟨⟨stored.1, side.storeRuns s compensation holds.1 (fun run member context running =>
      (contexts run member context running).imp_right fun none ⟨body, inside, active⟩ => none body inside active)
      (fun run member element at_ leave resumed => .inr ((resumes run member element at_ leave resumed).imp
        fun _ => And.imp_left And.right)) provenance holds.2⟩, stored.2⟩
  enter s element parent locals holds stands anchor :=
    have entered := ops.enter s element parent locals holds.1 stands anchor
    ⟨⟨entered.1, side.enterScope s element parent locals none holds.1
      ⟨element, .inl rfl, .inl (.inr (.inr (.inr (.inr (.inr anchor)))))⟩ holds.2⟩, entered.2⟩
  entered := ops.entered
  signalled := ops.signalled
  cancel s id holds := have queued := ops.cancel s id holds.1; ⟨⟨queued.1, side.signal holds.2 _⟩, queued.2⟩
  complete s id leave writes rule holds settled resumed :=
    have queued := ops.complete s id leave writes rule holds.1 settled (resumed.imp fun _ => And.imp_left And.left)
    ⟨⟨queued.1, side.complete s id leave writes rule (.inr (resumed.imp fun _ held => ⟨held.1.1, held.1.2, held.2⟩))
      holds.2⟩, queued.2⟩
  occur s element scope leave writes rule holds pending resumed :=
    have queued := ops.occur s element scope leave writes rule holds.1 (pending.imp fun _ => And.imp_left And.left)
      (resumed.imp fun _ held => ⟨held.1.1, held.2⟩)
    ⟨⟨queued.1, occurs.occur _ _ _ _ _ _ holds.1 (.inr (pending.imp fun _ => And.imp_left And.right)) (.inr resumed) holds.2⟩,
      queued.2⟩
  begin s handler context scope holds stands entered :=
    have queued := ops.begin s handler context scope holds.1 stands entered
    have ⟨entry, member, facts⟩ := entered
    ⟨⟨queued.1, side.signalBegin _ _ holds.1 (.handler rfl rfl)
      ⟨⟨handler, .inl rfl, .inl (.inr (.inl ⟨entry, member, facts.2.1, .inr ⟨facts.1, facts.2.2⟩⟩))⟩,
        fun _ _ none => (by cases none), fun _ none => by cases none⟩ holds.2⟩, queued.2⟩
  leave s entry parent holds member link running :=
    have left := ops.leave s entry parent holds.1 member link running
    ⟨⟨left.1, side.leaveScope s entry.id holds.1 (List.mem_map.mpr ⟨entry, member, rfl⟩) (.inr running)
      holds.2⟩, left.2⟩

/-- A fired item's completion by flows its element lists is offered where its occurrence lies, in the state the item
was open in, which holds every occurrence of that identity the completion is queued beside. -/
private theorem item_completesFrom {program : Program} {s t : State} (formed : WellFormed program s) (kept : rel s)
    {item : OpenItem} (member : item ∈ s.openItems)
    (occurrences : ∀ o ∈ t.occurrences, o.id = item.occurrence → o ∈ s.occurrences) (scopes : t.scopes = s.scopes)
    (instances : t.slots.instances = s.slots.instances) {leave : Leave}
    (named : ∀ selected, leave = .flows selected → ∀ flow ∈ selected, Laws.Flow.Lists program item.element flow) :
    CompletesFrom rel program t item.occurrence leave :=
  .inl fun selected same flow inside => by
    obtain ⟨occurrence, present, waits⟩ := formed.owned.itemOccurrences item member
    obtain ⟨identity, element, -⟩ := waits
    exact ⟨s, ⟨formed, kept⟩, occurrences, fun _ inside => scopes ▸ inside, fun _ inside => instances ▸ inside,
      .inl ⟨occurrence, present, identity, occurrence, present, rfl, .inl (element ▸ named selected same flow inside)⟩⟩

/-- Reopening a fired item's subscription reserves a fresh occurrence, so the occurrences of the item's identity are
those the item's state held. -/
private theorem reopened_occurrences {program : Program} {s : State} (formed : WellFormed program s) {item : OpenItem}
    (member : item ∈ s.openItems) {kind : OpenKind} {element : ElementId} {scope : ScopeOccurrenceId}
    {host : Option Nat} {passive : Bool} {o : Occurrence}
    (inside : o ∈ ((s.closeItem item.id).openSubscription kind element scope host passive).1.occurrences)
    (same : o.id = item.occurrence) : o ∈ s.occurrences := by
  have reserves := Laws.State.reserve_reserves (s.closeItem item.id) element scope
  rw [Laws.State.openSubscription_eq, reserves.occurrences] at inside
  rcases List.mem_append.mp inside with old | fresh
  · rwa [Laws.State.closeItem_eq] at old
  · obtain ⟨waiting, present, identity, -⟩ := formed.owned.itemOccurrences item member
    have below := formed.issued.occurrences waiting present
    have issued : (s.closeItem item.id).nextIssue = s.nextIssue := by rw [Laws.State.closeItem_eq]
    rw [List.mem_singleton.mp fresh, reserves.id, issued] at same
    omega

/-- Withdrawing an occurrence's items keeps the scope occurrences and the slots, and drops occurrences only. -/
private theorem withdrawOccurrence_kept (s : State) (id : Nat) :
    (∀ o ∈ (s.withdrawOccurrence id).occurrences, o ∈ s.occurrences) ∧ (s.withdrawOccurrence id).scopes = s.scopes ∧
      (s.withdrawOccurrence id).slots = s.slots := by
  obtain ⟨items, frame⟩ := Laws.State.withdrawAll_frame
    (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
  rw [Laws.State.withdrawOccurrence_eq, frame, Laws.State.disarm_eq, Laws.State.closeOwnItems_eq]
  exact ⟨fun _ inside => (List.mem_filter.mp inside).1, rfl, rfl⟩

/-- Closing an item keeps every occurrence. -/
private theorem closed_occurrences {s : State} {id : Nat} :
    ∀ occurrence ∈ s.occurrences, occurrence ∈ (s.closeItem id).occurrences :=
  fun _ inside => by rw [Laws.State.closeItem_eq]; exact inside

/-- An open item's scope occurrence stands once any item is closed, which keeps the scope occurrences. -/
theorem item_stands {program : Program} {s : State} {item : OpenItem} (formed : WellFormed program s)
    (member : item ∈ s.openItems) {id : Nat} : Laws.Step.ScopeStands (s.closeItem id) item.scope := by
  rw [Laws.State.closeItem_eq]
  exact List.mem_map.mp (formed.owned.itemScopes item member)

/-- Work linked to what an open item of a well-formed state waits on is anchored in the item's scope occurrence of
any state that keeps the item's occurrences: the item's reservation lies there (`Owned.itemOccurrences`). -/
theorem item_anchored {inv : State → Prop} {program : Program} {s t : State} {item : OpenItem} {element : ElementId}
    (formed : WellFormed program s) (member : item ∈ s.openItems)
    (kept : ∀ occurrence ∈ s.occurrences, occurrence ∈ t.occurrences)
    (linked : Laws.Flow.Linked program item.element element) : Laws.Flow.Anchored inv program t element item.scope := by
  obtain ⟨occurrence, inside, facts⟩ := formed.owned.itemOccurrences item member
  exact ⟨item.element, linked, .inl (.inl ⟨occurrence, kept _ inside, facts.2.2, facts.2.1⟩)⟩

/-- A begin in an open item's scope occurrence, of an element linked to what the item waits on, naming no reservation
and no incoming flow, comes from the item's reservation. -/
theorem item_begins {inv : State → Prop} {program : Program} {s t : State} {item : OpenItem} {element : ElementId}
    {locals : List (String × Value)} {inner : Option Nat} (formed : WellFormed program s) (member : item ∈ s.openItems)
    (kept : ∀ occurrence ∈ s.occurrences, occurrence ∈ t.occurrences)
    (linked : Laws.Flow.Linked program item.element element) :
    Laws.Flow.BeginAnchored inv program t { element, scope := item.scope, locals, inner } :=
  ⟨item_anchored formed member kept linked, fun _ _ none => (by cases none), fun _ none => by cases none⟩

theorem subscriptionsOps_alongside {program : Program} (side : FrameAlongside program rel)
    (occurs : OccursAlongside program rel)
    (ops : Laws.Subscriptions.SubscriptionsOps program (WellFormed program)) :
    Laws.Subscriptions.SubscriptionsOps program fun s => WellFormed program s ∧ rel s where
  fire s item fired holds := ⟨ops.fire s item fired holds.1, side.signal holds.2 _⟩
  rekind s change holds kept waits :=
    ⟨ops.rekind s change holds.1 kept waits,
      side.frame s _ .same holds.2⟩
  awaits := ops.awaits
  disarm s host holds := ⟨ops.disarm s host holds.1, side.disarm s host holds.1 holds.2⟩
  openItem s kind occurrence holds member begun unstarted role :=
    ⟨ops.openItem s kind occurrence holds.1 member begun unstarted role, side.openItem holds.2 kind occurrence⟩
  openSubscription s kind element scope host passive holds stands hangs waits reservable anchored :=
    ⟨ops.openSubscription s kind element scope host passive holds.1 stands hangs waits reservable
      (anchored.mono fun _ => And.left),
      side.openSubscription occurs holds.1 holds.2 kind element scope host passive stands reservable anchored⟩
  subscribed s kind element scope host passive holds := ops.subscribed s kind element scope host passive holds.1
  closeComplete s item leave writes holds member named :=
    ⟨ops.closeComplete s item leave writes holds.1 member named, side.complete _ _ _ _ _
      (item_completesFrom holds.1 holds.2 member (fun _ inside _ => by rwa [Laws.State.closeItem_eq] at inside)
        (by rw [Laws.State.closeItem_eq]) (by rw [Laws.State.closeItem_eq]) named) (side.closeItem holds.2 item.id)⟩
  gatewayComplete s item gateway leave writes holds member attached named :=
    ⟨ops.gatewayComplete s item gateway leave writes holds.1 member attached named, side.complete _ _ _ _ _
      (item_completesFrom holds.1 holds.2 member
        (fun _ inside _ => by
          rw [Laws.State.signal_eq, Laws.State.disarm_eq, Laws.State.closeItem_eq] at inside
          exact (List.mem_filter.mp inside).1)
        (by rw [Laws.State.signal_eq, Laws.State.disarm_eq, Laws.State.closeItem_eq])
        (by rw [Laws.State.signal_eq, Laws.State.disarm_eq, Laws.State.closeItem_eq]) named)
      (side.signal (side.disarm _ gateway (Laws.State.closeItem_fired holds.1 member).1
        (side.closeItem holds.2 item.id)) _)⟩
  interruptComplete s item host leave writes holds member named :=
    have kept := withdrawOccurrence_kept (s.closeItem item.id) host
    ⟨ops.interruptComplete s item host leave writes holds.1 member named, side.complete _ _ _ _ _
      (item_completesFrom holds.1 holds.2 member
        (fun _ inside _ => by
          rw [Laws.State.signal_eq] at inside
          have held := kept.1 _ inside
          rwa [Laws.State.closeItem_eq] at held)
        (by rw [Laws.State.signal_eq, kept.2.1, Laws.State.closeItem_eq])
        (by rw [Laws.State.signal_eq, kept.2.2, Laws.State.closeItem_eq]) named)
      (side.signal (side.withdrawOccurrence (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id)
        host) _)⟩
  reopenComplete s item detail leave writes holds member reservable named :=
    ⟨ops.reopenComplete s item detail leave writes holds.1 member reservable named, side.complete _ _ _ _ _
      (item_completesFrom holds.1 holds.2 member (fun o inside same => reopened_occurrences holds.1 member inside same)
        (by rw [Laws.State.openSubscription_eq, (Laws.State.reserve_reserves _ _ _).scopes, Laws.State.closeItem_eq])
        (by rw [Laws.State.openSubscription_eq, Laws.State.reserve_slots, Laws.State.closeItem_eq]) named)
      (side.openSubscription occurs (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id) _ _ _ _ _
        (item_stands holds.1 member) reservable (item_anchored holds.1 member closed_occurrences (.inl rfl)))⟩
  occur s item element leave writes holds member bounded named listed :=
    ⟨ops.occur s item element leave writes holds.1 member bounded named listed, occurs.occur _ _ _ _ _ _ holds.1 (.inl bounded)
      (.inl ⟨item_anchored holds.1 member (fun _ => id) (.inl named), fun selected same => named ▸ listed selected same⟩)
      holds.2⟩
  insideBegin s item element locals holds member start linked :=
    have ⟨closed, fired⟩ := Laws.State.closeItem_fired holds.1 member
    ⟨ops.insideBegin s item element locals holds.1 member start linked,
      side.signalBegin _ _ (Laws.State.withdrawInside_fired closed fired item.scope).1 (.fresh rfl rfl)
        (item_begins holds.1 member (fun _ inside => by
          rw [Laws.State.withdrawInside_eq, Laws.State.closeItem_eq]; exact inside) linked)
        (side.withdrawInside (side.closeItem holds.2 item.id) item.scope)⟩
  closeBegin s item element locals holds member start linked :=
    ⟨ops.closeBegin s item element locals holds.1 member start linked,
      side.signalBegin _ _ (Laws.State.closeItem_fired holds.1 member).1 (.fresh rfl rfl)
        (item_begins holds.1 member closed_occurrences linked) (side.closeItem holds.2 item.id)⟩
  reopenBegin s item detail element locals holds member start reservable linked :=
    have ⟨closed, fired⟩ := Laws.State.closeItem_fired holds.1 member
    ⟨ops.reopenBegin s item detail element locals holds.1 member start reservable linked,
      side.signalBegin _ _ (Laws.State.openSubscription_fired closed fired (.timer detail) item.element fired.1
          (fun id attached => by rw [Laws.State.closeItem_eq]; exact holds.1.owned.attachments item member id attached)
          item.passive (Laws.State.triggers_await.1 detail)).1 (.fresh rfl rfl)
        (item_begins holds.1 member (fun _ inside => (ops.subscribed _ _ _ _ _ _ closed).2.1 _
          (closed_occurrences _ inside)) linked)
        (side.openSubscription occurs closed (side.closeItem holds.2 item.id) _ _ _ _ _
          (item_stands holds.1 member) reservable
          (item_anchored holds.1 member closed_occurrences (.inl rfl)))⟩
  bareBegin s item element locals holds member linked :=
    ⟨ops.bareBegin s item element locals holds.1 member linked,
      side.signalBegin _ _ holds.1 (.fresh rfl rfl) (item_begins holds.1 member (fun _ => id) linked) holds.2⟩

theorem compensationOps_alongside {program : Program} (side : StoresAlongside program rel)
    (ops : Laws.Compensation.CompensationOps program (WellFormed program)) :
    Laws.Compensation.CompensationOps program fun s => WellFormed program s ∧ rel s where
  store s compensation holds runs provenance :=
    ⟨ops.store s compensation holds.1 runs provenance, side.storeRuns s compensation holds.1
      (fun run member _ inside => .inl ⟨run, runs run member, inside⟩)
      (fun run member _ at_ leave resumed => .inl (.inr (.inr ⟨run, runs run member, at_, leave, resumed⟩)))
      (provenance.mono fun _ => False.elim) holds.2⟩
  issue s holds := ⟨ops.issue s holds.1, side.issue s holds.2⟩
  issued := ops.issued
  fail s failure holds := ⟨ops.fail s failure holds.1, side.signal holds.2 _⟩

end Alongside

/-! ## The registered hooks' feature records beside `WellFormed` -/

/-- The feature records but Multi-Instance's and Compensation's of `WellFormed` and a property beside it, which may
read the step's program, from those of `WellFormed`, `FrameAlongside` and `OccursAlongside` alone
(`Proofs.Step.registered_contract_of` turns them and what the Multi-Instance and compensation hooks keep into the
registered hooks' contract). -/
theorem featureOps_frame {rel : Program → State → Prop} (ops : Proofs.Step.FeatureOps WellFormed)
    (side : ∀ program, FrameAlongside program (rel program))
    (occurs : ∀ program, OccursAlongside program (rel program)) :
    Proofs.Step.FeatureOps fun program s => WellFormed program s ∧ rel program s where
  operations := operations_alongside side ops.operations
  work _ := workOps_alongside (side _) (occurs _) (ops.work _)
  flow _ := flowOps_alongside (side _) (ops.flow _)
  join _ := joinOps_alongside (side _) (ops.join _)
  starts _ := startsOps_alongside (side _) (ops.starts _)
  scopes _ := scopesOps_alongside (side _) (ops.scopes _)
  subscriptions _ := subscriptionsOps_alongside (side _) (occurs _) (ops.subscriptions _)
  propagation _ := propagationOps_alongside (side _) (occurs _) (ops.propagation _)

/-- What the registered compensation hooks keep of `WellFormed` and a property beside it that storing runs keeps, from
the compensation records of `WellFormed`. -/
theorem compensationKeeps_frame {rel : Program → State → Prop} (ops : Proofs.Step.RegisteredOps WellFormed)
    (side : ∀ program, StoresAlongside program (rel program)) (occurs : ∀ program, OccursAlongside program (rel program)) :
    Proofs.Step.CompensationKeeps fun program s => WellFormed program s ∧ rel program s :=
  Proofs.Step.compensationKeeps_of (fun _ => compensationOps_alongside (side _) (ops.compensation _))
    (fun _ => runsOps_alongside (side _) (occurs _) (ops.runs _))

/-- The feature records of `WellFormed` and a property beside it that `Alongside` and `StoresAlongside` gather, from
those of `WellFormed`. -/
theorem registeredOps_alongside {rel : State → Prop} (ops : Proofs.Step.RegisteredOps WellFormed)
    (side : ∀ program, Alongside program rel) (stores : ∀ program, StoresAlongside program rel)
    (occurs : ∀ program, OccursAlongside program rel) :
    Proofs.Step.RegisteredOps fun program s => WellFormed program s ∧ rel s :=
  { featureOps_frame ops.toFeatureOps (fun program => (side program).toFrameAlongside) occurs with
    multiInstance := fun _ => multiInstanceOps_alongside (side _) (ops.multiInstance _)
    compensation := fun _ => compensationOps_alongside (stores _) (ops.compensation _)
    runs := fun _ => runsOps_alongside (stores _) (occurs _) (ops.runs _) }

/-! ## Subtree removal of the registered hooks -/

/-- Reservations and queued occurrences keep the scope occurrences of any before-state: a reservation issues one
identity and enters none. -/
theorem scopesKept_occursAlongside (before : State) (program : Program) :
    OccursAlongside program (ScopesKept before) where
  reserve s element scope _ _ _ _ kept :=
    have reserves := Laws.State.reserve_reserves s element scope
    kept.enter reserves.nextIssue fun _ member => .inl (reserves.scopes ▸ member)
  occur s _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  compensate s _ _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  throwCompensate s _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  raise s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  enterCalled s call variables definition formed _ _ _ _ _ kept := by
    rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
    exact kept.enter rfl fun entry member => (List.mem_append.mp member).imp_right fun fresh => by
      rw [List.mem_singleton.mp fresh]

/-- The registered hooks keep the scope occurrences of any before-state beside `WellFormed`. -/
theorem keepsScopes_contract (ops : Proofs.Step.RegisteredOps WellFormed) (before : State) :
    Laws.Step.HookContract Registry.hooks (KeepsScopes before) :=
  Proofs.Step.registered_contract (registeredOps_alongside ops (scopesKept_alongside before)
    (scopesKept_stores before) (scopesKept_occursAlongside before)) Proofs.State.stateFacts

/-- `SubtreeRemoved` of the registered hooks, from the records and phases of `WellFormed`. -/
theorem subtreeRemoved_registered (ops : Proofs.Step.RegisteredOps WellFormed) (phases : Laws.Step.Phases WellFormed)
    (pipeline : Laws.Step.PipelinePhases WellFormed) : SubtreeRemoved Registry.hooks :=
  subtreeRemoved_of_keeps (keepsScopes_contract ops) (keepsScopes_phases phases) (keepsScopes_pipelinePhases pipeline)
    Proofs.State.stateFacts

/-! ## End facts of the registered hooks -/

/-- The state operations the hooks apply keep an input's end facts from its start under any exemption, since each frames
them (`Kernel.Laws.Step.EndsFrames`): the hooks then keep `Laws.Step.EndsInv` by their feature lemmas
(`endsInv_contract`). -/
theorem endsKept_alongside (b : State) (x : Option (Nat × OccurrenceKey)) (program : Program) {srel : State → Prop} :
    Alongside program (Laws.Step.EndsKept b x) srel where
  frame _ _ moved kept := kept.unmoved moved.occurrences moved.activations ⟨moved.scopes, moved.instanceId⟩
    (Nat.le_of_eq moved.nextIssue.symm) (.of_eq (by simp only [Laws.Step.endKeys, moved.journal, moved.draft]))
  emit s _ _ _ _ _ kept := by
    rw [Laws.State.emit_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  complete s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  park _ _ _ _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  arm s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  armGateway s _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  raise s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  signalBegin s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  issue _ kept := by
    rw [Laws.State.issue_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_succ _) (.refl _)
  enterScope s element parent locals owner formed _ kept :=
    kept.step formed (Laws.Step.enterScope_frame formed element parent locals owner)
  reserve _ element scope formed _ _ _ kept := kept.step formed (Laws.Step.reserve_frame formed element scope)
  leaveScope _ _ formed present _ kept := kept.step formed (Laws.Step.leaveScope_frame formed present)
  clearInside _ _ _ formed present inside kept := kept.step formed (Laws.Step.clearInside_frame formed present inside)
  disarm s host formed kept := kept.step formed (Laws.Step.disarm_frame s host)
  setVariable s target name value formed kept := kept.step formed (Laws.Step.setVariable_frame s target name value)
  removeVariable s target name formed kept := kept.step formed (Laws.Step.removeVariable_frame s target name)
  instanceBegin s _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  defer s _ _ _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  leaveInstance _ _ _ formed _ _ present kept := kept.step formed (Laws.Step.leaveScope_frame formed present)
  runs _ _ _ _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)

/-- Storing compensation runs keeps an input's end facts from its start. -/
theorem endsKept_stores (b : State) (x : Option (Nat × OccurrenceKey)) (program : Program) :
    StoresAlongside program (Laws.Step.EndsKept b x) :=
  { (endsKept_alongside b x program).toFrameAlongside with
    storeRuns := fun _ _ _ _ _ _ kept => kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _) }

/-- `Step`'s phases keep an input's end facts from its start: journalling the draft and ordering the journal permute
them, and beginning and cancelling frame them (`Kernel.Laws.Step.EndsFrames`). -/
theorem endsKept_stepAlongside (b : State) (program : Program) :
    StepAlongside program (Laws.Step.EndsKept b none) where
  toFrameAlongside := (endsKept_alongside b none program).toFrameAlongside
  journal s transition _ kept _ ended := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (by
    simp only [Laws.Step.endKeys, List.flatMap_cons, ended, List.map_append]
    simpa using List.perm_append_comm)
  runOrder s _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _)
    ((((List.reverse_perm s.journal).flatMap_right _).append_right _).map _)
  dequeue _ _ _ _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  untoken _ _ _ _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  begin _ _ role sourceType formed stands admitted _ _ kept :=
    kept.step formed (Laws.Step.beginOccurrence_frame formed stands admitted role sourceType)
  cancel _ id formed kept := kept.step formed (Laws.Step.cancelOccurrence_frame formed id)

/-- Reservations and queued occurrences keep an input's end facts from its start, which they frame
(`Kernel.Laws.Step.EndsFrames`). -/
theorem endsKept_occursAlongside (b : State) (x : Option (Nat × OccurrenceKey)) (program : Program) :
    OccursAlongside program (Laws.Step.EndsKept b x) where
  reserve _ element scope formed _ _ _ kept := kept.step formed (Laws.Step.reserve_frame formed element scope)
  occur s _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  compensate s _ _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  throwCompensate s _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  raise s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  enterCalled s call variables definition formed _ _ _ _ _ kept :=
    kept.step formed (Laws.Step.enterCalled_frame formed program call variables definition)

/-- The registered hooks keep an input's end facts from its start beside `WellFormed`, under any exemption
(`Laws.Step.EndsInv`), the hook contract `Laws.Step.complete_ends` and `MicroStepsKeepEnds` rest on. -/
theorem endsInv_contract (ops : Proofs.Step.RegisteredOps WellFormed) (b : State) (x : Option (Nat × OccurrenceKey)) :
    Laws.Step.HookContract Registry.hooks (Laws.Step.EndsInv b x) :=
  Proofs.Step.registered_contract (registeredOps_alongside ops (fun program => endsKept_alongside b x program) (endsKept_stores b x)
    (endsKept_occursAlongside b x))
    Proofs.State.stateFacts

/-- The registered hooks keep an input's end facts under any exemption, an outflow's flows read off states that kept
`WellFormed` alone (`Laws.Step.complete_ends`): the end facts read no flow token. -/
theorem endsInv_sourced (ops : Proofs.Step.RegisteredOps WellFormed) (b : State) (x : Option (Nat × OccurrenceKey)) :
    Laws.Step.HookContract Registry.hooks (Laws.Step.EndsInv b x) fun program s => WellFormed program s ∧ True :=
  Proofs.Step.registered_sourced (endsInv_contract ops b x) fun program =>
    flowOps_alongside (endsKept_alongside b x program (srel := fun _ => True)).toFrameAlongside (ops.flow program)

/-! ## The draft the registered hooks leave -/

section Draft

private theorem signal_draft (s : State) (signal : Signal) : (s.signal signal).draft = s.draft := by
  rw [Laws.State.signal_eq]

private theorem closeItem_draft (s : State) (id : Nat) : (s.closeItem id).draft = s.draft := by
  rw [Laws.State.closeItem_eq]

private theorem disarm_draft (s : State) (host : Nat) : (s.disarm host).draft = s.draft := by
  rw [Laws.State.disarm_eq]

private theorem withdrawInside_draft (s : State) (scope : ScopeOccurrenceId) : (s.withdrawInside scope).draft = s.draft := by
  rw [Laws.State.withdrawInside_eq]

private theorem withdrawOccurrence_draft (s : State) (id : Nat) : (s.withdrawOccurrence id).draft = s.draft := by
  obtain ⟨items, frame⟩ := Laws.State.withdrawAll_frame
    (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
  rw [Laws.State.withdrawOccurrence_eq, frame, Laws.State.disarm_eq, Laws.State.closeOwnItems_eq]

/-- Opening a subscription keeps the draft's end facts: its reservation journals nothing (`Laws.State.Reserves`). -/
private theorem openSubscription_ended (s : State) (kind : OpenKind)
    (element : ElementId) (scope : ScopeOccurrenceId) (host : Option Nat) (passive : Bool) :
    (s.openSubscription kind element scope host passive).1.draft.ended = s.draft.ended := by
  rw [Laws.State.openSubscription_eq]
  exact congrArg (·.ended) (Laws.State.reserve_reserves s element scope).draft

/-- Subscriptions' operations keep the draft's end facts: they queue firings and completions, open, close, withdraw
and rekind items and disarm hosts, and a subscription reserves its occurrence, which journals nothing. -/
theorem subscriptionsOps_draft (program : Program)
    (ended : List (OccurrenceKey × Terminal)) :
    Laws.Subscriptions.SubscriptionsOps program fun s => s.draft.ended = ended where
  fire s _ _ same := by rw [signal_draft]; exact same
  rekind _ _ same _ _ := same
  awaits := Laws.State.triggers_await
  disarm s host same := by rw [disarm_draft]; exact same
  openItem s kind occurrence same _ _ _ _ := by
    rw [Laws.State.openItem_eq]
    exact same
  openSubscription s kind element scope host passive same _ _ _ _ _ :=
    (openSubscription_ended s kind element scope host passive).trans same
  subscribed s kind element scope host passive _ := by
    have reserves := Laws.State.reserve_reserves s element scope
    rw [Laws.State.openSubscription_eq]
    exact ⟨reserves.scopes, fun o inside => reserves.occurrences ▸ List.mem_append_left _ inside,
      by rw [Laws.State.reserve_slots]⟩
  closeComplete s _ _ _ same _ _ := by rw [signal_draft, closeItem_draft]; exact same
  gatewayComplete s _ _ _ _ same _ _ _ := by rw [signal_draft, signal_draft, disarm_draft, closeItem_draft]; exact same
  interruptComplete s _ _ _ _ same _ _ := by
    rw [signal_draft, signal_draft, withdrawOccurrence_draft, closeItem_draft]
    exact same
  reopenComplete s _ _ _ _ same _ _ _ := by rw [signal_draft, openSubscription_ended, closeItem_draft]; exact same
  occur s _ _ _ _ same _ _ _ _ := by rw [signal_draft]; exact same
  insideBegin s _ _ _ same _ _ _ := by rw [signal_draft, withdrawInside_draft, closeItem_draft]; exact same
  closeBegin s _ _ _ same _ _ _ := by rw [signal_draft, closeItem_draft]; exact same
  reopenBegin s _ _ _ _ same _ _ _ _ := by rw [signal_draft, openSubscription_ended, closeItem_draft]; exact same
  bareBegin s _ _ _ same _ _ := by rw [signal_draft]; exact same

end Draft

/-- The registered hooks journal no end when told of a cancellation, which no feature hears, or of variable writes,
which Subscriptions offers to Conditional items by queueing the firings they decide (`Laws.Subscriptions`), so each
micro-step leaves the draft without end facts (`Laws.Step.microStep_drafts`). -/
theorem registered_quiet :
    (∀ ctx occurrence state after, state.draft.ended = [] → Registry.hooks.cancelled ctx occurrence state = .ok after →
      after.draft.ended = []) ∧
    ∀ ctx writes state after, state.draft.ended = [] → Registry.hooks.written ctx writes state = .ok after →
      after.draft.ended = [] :=
  ⟨fun _ _ _ _ empty ran => by
    rw [Laws.Registry.hooks_cancelled] at ran
    cases ran
    exact empty, fun ctx _ _ _ empty ran => by
    rw [Laws.Registry.hooks_written] at ran
    exact Laws.Subscriptions.offerWrites_keeps (subscriptionsOps_draft ctx.program []) empty ran⟩

/-- `MicroStepsKeepEnds` of the registered hooks, from the records and phases of `WellFormed`; `removedEndOnce` then
gives `RemovedEndOnce`. -/
theorem microStepsKeepEnds_registered (ops : Proofs.Step.RegisteredOps WellFormed)
    (phases : Laws.Step.Phases WellFormed) (pipeline : Laws.Step.PipelinePhases WellFormed) :
    MicroStepsKeepEnds Registry.hooks := by
  have kept := fun b => microStepsKeep_alongside (rel := fun _ => Laws.Step.EndsKept b none) (endsInv_contract ops b none)
    phases.toClosurePhases (fun program => (endsKept_stepAlongside b program).toClosureAlongside) Proofs.State.stateFacts
    (Laws.Step.complete_ends (endsInv_sourced ops b) (fun _ _ holds => ⟨holds.1, trivial⟩) phases pipeline
      Proofs.State.stateFacts)
  obtain ⟨cancelled, written⟩ := registered_quiet
  refine ⟨fun ctx cause transition b state after runs holds ran =>
    ⟨(kept b).1 ctx cause transition state after runs holds ran, Laws.Step.microStep_drafts cancelled written ran⟩,
    fun ctx b state after holds step => ⟨(kept b).2 ctx state after holds step, ?_⟩⟩
  obtain ⟨_, _, _, ⟨_, _, ran⟩⟩ := step.microStep
  exact Laws.Step.microStep_drafts cancelled written ran

/-- `RemovedEndOnce` of the registered hooks, from the records and phases of `WellFormed`. -/
theorem removedEndOnce_registered (ops : Proofs.Step.RegisteredOps WellFormed) (phases : Laws.Step.Phases WellFormed)
    (pipeline : Laws.Step.PipelinePhases WellFormed) : RemovedEndOnce Registry.hooks :=
  removedEndOnce (microStepsKeepEnds_registered ops phases pipeline)

/-! ## The clearings of the registered hooks

A Terminate End's and an interrupting Event Sub-Process start's clearings are `Laws.State.ClearsInside` transitions of a
well-formed state (`Laws.Scopes.clearInside_clears`). -/

/-- `Laws.Scopes.TerminateClears` of the registered hooks: a Terminate End arriving as an occurrence of a well-formed
state clears its scope occurrence, keeping only that occurrence, and queues its completion, which the clearing does not
read (TEND-REGION-01, BPMN 2.0.2 §13.5.6). -/
theorem registered_terminateClears {ctx : Ctx} {header : Header} {payload : EventPayload} {occurrence : Occurrence}
    {state after : State} (formed : WellFormed ctx.program state) (member : occurrence ∈ state.occurrences)
    (ran : Registry.hooks.arriveThrow ctx header payload .terminate occurrence state = .ok after) :
    Laws.Scopes.TerminateClears true occurrence.scope occurrence.id state after := fun _ => by
  rw [Laws.Registry.hooks_arriveThrow, Laws.Propagation.arriveThrow_terminate] at ran
  cases ran
  exact Laws.Scopes.clearsInside_signal
    (Laws.Scopes.clearInside_clears formed (formed.owned.occurrenceScopes occurrence member) _) _

/-- `Laws.Scopes.InterruptingStart` of the registered hooks: an Event Sub-Process arriving as an occurrence of a
well-formed state enters its Scope on the clearing of its parent scope occurrence that keeps only its own occurrence and
its start Event's reservation when its start interrupts, and on the arrival's state otherwise (§13.5.4, IMESP). -/
theorem registered_interruptingStart {ctx : Ctx} {header : Header} {payload : ScopePayload} {occurrence : Occurrence}
    {entry : ScopeEntry} {state after : State} {start : Subscription} {interrupting : Bool}
    (formed : WellFormed ctx.program state) (member : occurrence ∈ state.occurrences)
    (kind : payload.kind = .eventSubProcess start interrupting)
    (ran : Registry.hooks.arriveScope ctx header payload occurrence entry state = .ok after) :
    ∃ cleared, Laws.Scopes.InterruptingStart interrupting occurrence.scope (occurrence.id :: entry.inner.toList) state
      cleared ∧ (interrupting = false → cleared = state) ∧
      Feature.Scopes.enter ctx header payload occurrence entry cleared = .ok after := by
  rw [Laws.Registry.hooks_arriveScope] at ran
  exact Laws.Scopes.arriveScope_interrupts formed member kind ran

end Kernel.Proofs.Cancellation
