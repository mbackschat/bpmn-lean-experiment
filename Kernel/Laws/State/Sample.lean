module

public import Kernel.Laws.State.Derived
public import Kernel.Laws.State.Witnesses

/-! # Laws of the kernel state: the sample's witnesses that read `State.root` or the program

That the sample instance of `Kernel.Laws.State.Invariant` is well-formed, the witnesses of `ReservationsUnstarted`
and `Rooted` that read its process instance or `State.root` (`Laws.State.root_eq`), and those of the clauses on what an
item, a queued begin or a queued raise holds: `Typed`, `EventRoles`, `BodyRoles` and `Raisable`, which read the
program, `Worked`, `AttachedReserved` and `InnerPlaced`. It reads no body. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/- The sample queues nothing under a unit key, so its queue views are its batches. -/
attribute [local simp] allSignals allQueuedTokens scopes_eq

/-- The sample's scope occurrences read the instance `p`. -/
private theorem sample_instance (kind : OpenKind) :
    (sample kind).instanceOf processRoot = "p" ∧ (sample kind).instanceOf subScope = "p" := by
  have nodup : (scopeIds (sample kind)).Nodup := by rw [scopeIds, scopes_eq]; exact scopeList_nodup (scopesKeyed_ofScopes _)
  have parentless : ∀ entry ∈ (sample kind).scopes, entry.parent = none → entry.id = State.root := by
    simp [sample, rootScope, childScope, processRoot, subScope, root_eq]
  have root : InstanceIn (sample kind) processRoot (sample kind).instanceId [rootScope] :=
    .root rootScope (by simp [sample]) (by simp [rootScope, processRoot]) (by simp [rootScope, processRoot])
  have sub : InstanceIn (sample kind) subScope (sample kind).instanceId [childScope, rootScope] :=
    .up childScope processRoot _ [rootScope] (by simp [sample]) rfl (by simp [childScope, subScope, processRoot]) root
  exact ⟨instanceOf_eq nodup parentless root (by simp), instanceOf_eq nodup parentless sub
    (by simp [rootScope, childScope, processRoot, subScope])⟩

/-- The sample instance is well-formed under a program that declares neither of its waiting elements a start Event. -/
theorem sample_wellFormed (kind : OpenKind) {program : Program}
    (unstarted : ∀ item ∈ itemList (sample kind).openItems, ((program.element? item.element).bind (·.start?)).isSome = false) :
    WellFormed program (sample kind) where
  issued := ⟨fun occurrence member => by
      simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
      rcases member with rfl | rfl | rfl <;>
        refine ⟨(sample_historic kind).issued_key
          (by simp [sample, rootScope, childScope, subProcess, innerTask, outerTask]),
          .committed rfl (by simp [subProcess, innerTask, outerTask, processRoot, subScope]) fun _ => ?_⟩ <;>
        simp [occurrenceCount, sample, sampleCounters, subProcess, innerTask, outerTask, Std.ExtTreeMap.getD_insert],
    fun item member => by
      simp only [sample, mem_ofItems (show ([innerItem kind, outerItem kind].map (·.id)).Nodup by
        simp [innerItem, outerItem]), List.mem_cons, List.not_mem_nil, or_false] at member
      rcases member with rfl | rfl <;>
        exact .committed rfl (by simp [innerItem, outerItem, OccurrenceId.fresh_eq, processRoot, subScope])
          fun _ => by simp [sample, innerItem, outerItem, Std.ExtTreeMap.getD_insert],
    fun _ member => (sample_historic kind).issued member,
    by simp [sample, rootScope, childScope]⟩
  distinct := ⟨by simp [occurrenceIds, sample, subProcess, innerTask, outerTask], keyedBy_ofItems _,
    scopesKeyed_ofScopes _,
    by simp [key, sample, subProcess, innerTask, outerTask]⟩
  startedOnce := by simp [StartedOnce, starts, sample]
  activations := ⟨by simp [sample], by simp [sample]⟩
  reservations := by simp [ReservationsUnstarted, sample, subProcess, innerTask, outerTask]
  owned := {
    occurrenceScopes := by simp [sample, scopeIds, subProcess, innerTask, outerTask, rootScope, childScope]
    itemScopes := by simp [sample, scopeIds, innerItem, outerItem, rootScope, childScope]
    itemOccurrences := by simp [sample, innerItem, outerItem, subProcess, innerTask, outerTask]
    attachments := by simp [sample, innerItem, outerItem]
    scopeOwners := by simp [sample, rootScope, childScope, subProcess, innerTask, outerTask]
    variableScopes := by
      simp [sample, scopeIds, rootScope, childScope]
      rintro _ (rfl | rfl) <;> simp
    tokenScopes := by simp [sample] }
  rooted := ⟨by simp [scopeIds, sample, rootScope, processRoot, root_eq],
    by simp [sample, rootScope, childScope, processRoot, subScope, root_eq], by
      simp only [sample, scopes_eq, mem_sampleScopes]
      rintro scope (rfl | rfl) <;> rw [root_eq]
      · exact .refl _
      · exact sub_within⟩
  failure := by simp [FailureRecorded, sample]
  queue := ⟨by simp [sample], by simp [sample], by simp [sample], by simp [sample], by simp [sample]⟩
  counted := by simp [StartsCounted, starts, sample]
  occurrencesCounted := by
    obtain ⟨root, sub⟩ := sample_instance kind
    intro occurrence member
    simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
    rcases member with rfl | rfl | rfl <;> simp only [Counted, key, subProcess, innerTask, outerTask, root, sub] <;>
      simp [sample]
  ownedBelow := by
    simp only [OwnedBelow, sample, scopes_eq, mem_sampleScopes, List.mem_cons, List.not_mem_nil, or_false]
    rintro scope (rfl | rfl) occurrence (rfl | rfl | rfl) owner <;>
      simp_all [rootScope, childScope, subProcess, innerTask, outerTask, processRoot, subScope]
  claimed := ⟨by simp [sample, innerItem, outerItem], by simp [Queued, sample], by simp [Precedes, sample],
    by simp [Precedes, sample], by simp [sample], by simp [Queued, sample], by simp [Queued, sample],
    by simp [Queued, sample]⟩
  settled := ⟨by simp [sample], by simp [sample], by simp [sample], by simp [sample], by simp [sample],
    by simp [sample], by simp [sample], by simp [sample]⟩
  attachedReserved := by simp [AttachedReserved, sample, innerItem, outerItem]
  typed := fun item member started => by simp [unstarted item member] at started
  worked := by
    simp only [Worked, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro item _ _ occurrence (rfl | rfl | rfl) _ <;> rfl
  roles := by
    simp only [EventRoles, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro occurrence (rfl | rfl | rfl) _ <;> rfl
  raises := by simp [RaisesSound, sample]
  bodyRoles := by simp [BodyRoles, sample, subProcess, innerTask, outerTask]
  itemRoles := by simp [ItemRoles, sample, subProcess, innerTask, outerTask]
  issuer := ⟨fun _ _ held => by simp [sample] at held, fun _ _ held => by simp [sample] at held,
    fun _ _ _ held => by simp [sample] at held⟩

/-- A start fact carrying the armed reservation's key breaks `ReservationsUnstarted`. -/
theorem early_start_rejected (kind : OpenKind) :
    ¬ ReservationsUnstarted { armedState kind with draft := { started := [startFact reservation] } } := fun unstarted => by
  have := unstarted reservation (by simp [armedState]) rfl (startFact reservation) (by simp [starts])
  simp [key, startFact, reservation] at this
  have same : ∀ t : State, t.scopes = (sample kind).scopes → t.instanceId = (sample kind).instanceId →
      t.instanceOf processRoot = "p" := fun _ scopes named => (instanceOf_congr scopes named processRoot).trans (sample_instance kind).1
  exact this (same { armedState kind with draft := { started := [startFact reservation] } } rfl rfl).symm

/-- A second parentless scope occurrence is unrepresentable: a key's parent is its tail (KD1), so only the root's key
has none, and `Rooted`'s parentless clause holds of every scope occurrence. -/
theorem parentless_iff_root (scope : ScopeOccurrence) : scope.parent = none ↔ scope.id = State.root := by
  obtain ⟨id, _⟩ := scope
  simp only [ScopeOccurrence.parent, root_eq]
  rcases keyed : id.segments with _ | ⟨segment, rest⟩
  · have root : id = .ofSegments [] := ScopeOccurrenceId.ext (by simp [keyed, ScopeOccurrenceId.ofSegments_segments])
    subst root
    simp
  · simp [ScopeOccurrenceId.parent?_cons_eq keyed, ScopeOccurrenceId.ext_iff, keyed]

/-- A lone parentless scope occurrence other than `State.root` breaks `Rooted`. -/
theorem foreign_root_rejected (kind : OpenKind) :
    ¬ Rooted { sample kind with scopeMap := ofScopes [{ rootScope with id := (.ofSegments [{ element := ⟨"Foreign"⟩, ordinal := 7 }]) }] } := by
  rintro ⟨present, _, _⟩
  simp [scopeIds, root_eq] at present

/-- An item of `Outer` holding the reservation `timerKey`, for a program that declares `Outer` a start Event, as an Event
Sub-Process's is, and `Inner` none. -/
def startItem (kind : OpenKind) : OpenItem :=
  { id := ⟨timerKey, .subscription, 0⟩, position := 8, kind, element := ⟨"Outer"⟩, scope := processRoot, passive := true }

theorem start_item_typed (kind : OpenKind) {program : Program}
    (inner : ((program.element? ⟨"Inner"⟩).bind (·.start?)).isSome = false) (waits : AwaitsTrigger kind) :
    Typed program { armedState kind with openItems := ofItems [innerItem kind, startItem kind] } := by
  intro item member started
  simp only [mem_ofItems (show ([innerItem kind, startItem kind].map (·.id)).Nodup by
    simp [innerItem, startItem]), List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl
  · simp [innerItem, inner] at started
  · refine ⟨fun occurrence present named => ?_, fun other inside same => ?_, by simp [armedState, sample], waits⟩
    · simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at present
      rcases present with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation, startItem]
    · simp only [mem_ofItems (show ([innerItem kind, startItem kind].map (·.id)).Nodup by
        simp [innerItem, startItem]), List.mem_cons, List.not_mem_nil, or_false] at inside
      rcases inside with rfl | rfl <;> simp_all [innerItem, startItem]

/-- Under such a program, the item of `Outer` waiting for the begun occurrence `outerKey` breaks `Typed`: its firing
would begin `outerKey` again; so do two items of `Outer` holding the reservation `timerKey`, since the firing of one
would leave the other waiting on a begun occurrence. -/
theorem begun_start_rejected (kind : OpenKind) {program : Program}
    (outer : ((program.element? ⟨"Outer"⟩).bind (·.start?)).isSome = true) : ¬ Typed program (sample kind) :=
  fun typed => by
    have := (typed (outerItem kind) (by simp [sample, innerItem, outerItem]) (by simpa [outerItem] using outer)).1 outerTask
      (by simp [sample]) (by simp [outerTask, outerItem])
    simp [outerTask] at this

theorem shared_start_rejected (kind : OpenKind) {program : Program}
    (outer : ((program.element? ⟨"Outer"⟩).bind (·.start?)).isSome = true) :
    ¬ Typed program { armedState kind with openItems := ofItems [startItem kind, { startItem kind with id := ⟨timerKey, .subscription, 1⟩ }] } :=
  fun typed => by
    have := (typed (startItem kind) (by simp [startItem]) (by simpa [startItem] using outer)).2.1 { startItem kind with id := ⟨timerKey, .subscription, 1⟩ }
      (by simp [startItem]) (by simp [startItem])
    simp [startItem] at this

/-- So does a completion of the reservation `timerKey` queued while its item waits, which would begin it once more, and an item
of `Outer` waiting for an effect result, which would complete it. -/
theorem completed_start_rejected (kind : OpenKind) {program : Program}
    (outer : ((program.element? ⟨"Outer"⟩).bind (·.start?)).isSome = true) :
    ¬ Typed program
      { armedState kind with openItems := ofItems [startItem kind], batchSignals := [.complete timerKey .outgoing [] .outward] } :=
  fun typed => (typed (startItem kind) (by simp [startItem]) (by simpa [startItem] using outer)).2.2.1 .outgoing [] .outward
    (by simp [startItem])

theorem working_start_rejected (kind : OpenKind) {program : Program}
    (outer : ((program.element? ⟨"Outer"⟩).bind (·.start?)).isSome = true) (work : kind.view.effect.isSome = true) :
    ¬ Typed program { armedState kind with openItems := ofItems [startItem kind] } :=
  fun typed => by
    have : kind.view.effect = none := (typed (startItem kind) (by simp [startItem]) (by simpa [startItem] using outer)).2.2.2.1
    simp [this] at work

/-- An item that waits for an effect on the reservation `timerKey` breaks `Worked`: no effect result completes a reservation,
and a raise from its occurrence would leave an unbegun host. -/
theorem working_reservation_rejected (kind : OpenKind) (work : kind.view.effect.isSome = true) :
    ¬ Worked { armedState kind with openItems := ofItems [{ outerItem kind with id := ⟨timerKey, .wait, 0⟩ }] } := fun worked => by
  have := worked { outerItem kind with id := ⟨timerKey, .wait, 0⟩ } (by simp [outerItem]) (fun waits => by
    simp only [outerItem] at waits
    rw [waits.1] at work
    cases work) reservation (by simp [armedState]) (by simp [reservation])
  simp [reservation] at this

/-- Under a program that declares `Outer` an Event, its occurrence numbered as a Multi-Instance body breaks
`EventRoles`: a raise names the thrower by its element's counter. -/
theorem body_event_rejected (kind : OpenKind) {program : Program}
    (event : ((program.element? ⟨"Outer"⟩).bind (·.event?)).isSome = true) :
    ¬ EventRoles program { sample kind with occurrences := [{ outerTask with role := .multiInstanceBody }] } :=
  fun roles => by
    have := roles { outerTask with role := .multiInstanceBody } (by simp) (by simpa [outerTask] using event)
    simp at this

/-- Under a program that declares `Outer` no Multi-Instance envelope, its occurrence numbered as a body breaks
`BodyRoles`: `Step.dispatch` would hand it to `Outer`'s own hook as an instance of its element. -/
theorem envelopeless_body_rejected (kind : OpenKind) {program : Program}
    (single : (((program.element? ⟨"Outer"⟩).bind (·.envelope?)).bind (·.multiInstance)).isSome = false) :
    ¬ BodyRoles program { sample kind with occurrences := [{ outerTask with role := .multiInstanceBody }] } :=
  fun bodies => by
    have := bodies { outerTask with role := .multiInstanceBody } (by simp) rfl
    simp [outerTask, single] at this

/-- Under a program that declares `Outer` an Event, a raise from its begun occurrence `outerKey` is `Raisable`. -/
theorem thrower_raisable (kind : OpenKind) {program : Program} :
    Raisable program (sample kind)
      { element := ⟨"Outer"⟩, scope := processRoot, activation := 1, thrower := outerKey } := fun _ => by
  refine ⟨(sample_historic kind).issued_key (by simp [sample, rootScope]),
    ⟨(sample_historic kind).issued_key (by simp [sample, rootScope]), .committed rfl (by simp [processRoot]) fun _ => by
      simp [occurrenceCount, sample, sampleCounters, Std.ExtTreeMap.getD_insert]⟩, ?_⟩
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false]
  rintro occurrence (rfl | rfl | rfl) <;> simp [subProcess, innerTask, outerTask]

/-- Under a program that declares `Timer` an Event, a raise whose origin names the reservation `timerKey` breaks `Raisable`:
`throwerLeaves` would complete an unbegun occurrence. -/
theorem reservation_raise_rejected (kind : OpenKind) {program : Program}
    (event : ((program.element? ⟨"Timer"⟩).bind (·.event?)).isSome = true) :
    ¬ Raisable program (armedState kind)
      { element := ⟨"Timer"⟩, scope := processRoot, activation := 1, thrower := timerKey } :=
  fun raisable => by
    have := (raisable event).2.2 reservation (by simp [armedState]) rfl
    simp [reservation] at this

/-- An item attached to the root's task `outerKey` holding the reservation `timerKey` is reserved; one waiting for the begun occurrence `outerKey`
itself breaks `AttachedReserved`. -/
theorem attached_reserved (kind : OpenKind) :
    AttachedReserved { armedState kind with openItems := ofItems [{ startItem kind with attachedTo := some outerKey }] } := by
  intro item member _ occurrence present named
  simp only [mem_ofItems_singleton] at member
  subst member
  simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at present
  rcases present with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation, startItem]

theorem attached_begun_rejected (kind : OpenKind) :
    ¬ AttachedReserved { sample kind with openItems := ofItems [{ outerItem kind with attachedTo := some subKey }] } :=
  fun reserved => by
    have := reserved { outerItem kind with attachedTo := some subKey } (by simp [outerItem]) rfl outerTask (by simp [sample])
      (by simp [outerTask, outerItem])
    simp [outerTask] at this

/-- A queued Event Sub-Process begin in the root holding the root's reservation `timerKey` places it; one in the Sub-Process's
scope occurrence does not. -/
theorem inner_placed (kind : OpenKind) :
    InnerPlaced (armedState kind) { element := ⟨"Esp"⟩, scope := processRoot, inner := some timerKey } := by
  intro id named occurrence member same
  simp only [Option.toList_some, List.mem_singleton] at named
  subst named
  simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation]

theorem misplaced_inner_rejected (kind : OpenKind) :
    ¬ InnerPlaced (armedState kind) { element := ⟨"Esp"⟩, scope := subScope, inner := some timerKey } := fun placed => by
  have := placed timerKey (by simp) reservation (by simp [armedState]) rfl
  simp [reservation, processRoot, subScope] at this

end Kernel.Laws.State
