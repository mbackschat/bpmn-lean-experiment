module

public import Kernel.Laws.State.Transitions

/-! # Laws of the kernel state: the invariant's witnesses

That each clause of `Kernel.Laws.State.Invariant`'s `WellFormed` excludes states: a variant of the sample instance it
declares that breaks the clause, and the sample with an armed reservation (`armedState`) that keeps them. It reads no
body. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/- The witnesses read their scopes through the scope map's list view. -/
attribute [local simp] scopes_eq

/- The witnesses' states queue nothing under a unit key, so the views are their batches. -/
attribute [local simp] allSignals allQueuedTokens

/-- An occurrence key at or above its counter in a standing scope occurrence violates `IssuedBelow`, so the law excludes
states. -/
theorem stale_counter_rejected (kind : OpenKind) : ¬ IssuedBelow { sample kind with occurrenceOrdinals := ∅ } :=
  fun issued => by
  have := (issued.occurrences outerTask (by simp [sample])).2.2.1 _ rfl (by simp [sample] <;> simp [rootScope, outerTask])
  simp [occurrenceCount] at this

/-- A root wait with an armed reservation `timerKey` beside it, and the start facts of the begun waits in the draft. -/
def reservation : Occurrence :=
  { id := timerKey, element := ⟨"Timer"⟩, scope := processRoot, activation := 1, begun := false }

def startFact (occurrence : Occurrence) : StartedFact :=
  { occurrence := { processInstanceId := "p", element := occurrence.element, activation := occurrence.activation }
    owner := occurrence.scope, sourceType := "task" }

def armedState (kind : OpenKind) : State :=
  { sample kind with
    occurrences := [subProcess, innerTask, outerTask, reservation], nextCompletion := 8,
    occurrenceOrdinals := sampleCounters.insert { parent := processRoot, element := ⟨"Timer"⟩ } 1,
    draft := { started := [startFact innerTask, startFact outerTask] } }

/- The sample and the armed state queue nothing under a unit key. -/
@[local simp] theorem sample_queuedSignals (kind : OpenKind) : (sample kind).queuedSignals = ∅ := rfl
@[local simp] theorem sample_queuedTokens (kind : OpenKind) : (sample kind).queuedTokens = ∅ := rfl
@[local simp] theorem armed_queuedSignals (kind : OpenKind) : (armedState kind).queuedSignals = ∅ := rfl
@[local simp] theorem armed_queuedTokens (kind : OpenKind) : (armedState kind).queuedTokens = ∅ := rfl

theorem armed_unstarted (kind : OpenKind) : ReservationsUnstarted (armedState kind) := by
  simp [ReservationsUnstarted, starts, key, armedState, sample, subProcess, innerTask, outerTask, reservation, startFact]

theorem armed_started_once (kind : OpenKind) : StartedOnce (armedState kind) := by
  simp [StartedOnce, starts, armedState, sample, startFact, innerTask, outerTask]

theorem restart_rejected (kind : OpenKind) :
    ¬ StartedOnce { armedState kind with draft := { started := [startFact innerTask, startFact innerTask] } } := by
  simp [StartedOnce, starts, armedState, sample]

/-- An item waiting for an occurrence that is gone breaks `Owned`. -/
theorem dangling_item_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := ofItems [{ innerItem kind with id := ⟨ghostKey, .wait, 0⟩ }] } := fun owned => by
  obtain ⟨occurrence, member, same, _⟩ := owned.itemOccurrences { innerItem kind with id := ⟨ghostKey, .wait, 0⟩ } (by simp)
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask] at same

/-- An item filed in another scope occurrence than its occurrence's breaks `Owned`. -/
theorem misfiled_item_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := ofItems [{ innerItem kind with scope := processRoot }] } := fun owned => by
  obtain ⟨occurrence, member, same, facts⟩ := owned.itemOccurrences { innerItem kind with scope := processRoot } (by simp)
  obtain ⟨_, scope⟩ := facts
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask, innerItem, processRoot, subScope] at same scope

/-- A name bound twice in one variable set breaks `VariablesKeyed`. -/
theorem repeated_name_rejected (kind : OpenKind) :
    ¬ VariablesKeyed
      { sample kind with variables := (∅ : TreeMap ScopeOccurrenceId _ compare).insert processRoot [("a", .int 1), ("a", .int 2)] } :=
  fun keyed => by
    have := keyed.names processRoot [("a", .int 1), ("a", .int 2)] Std.ExtTreeMap.getElem?_insert_self
    simp at this

/-- A start fact pending without its counter breaks `StartsCounted`. -/
theorem uncounted_start_rejected (kind : OpenKind) :
    ¬ StartsCounted { sample kind with draft := { started := [startFact innerTask] }, activations := [] } :=
  fun counted => by
    obtain ⟨_, member, _⟩ := counted (startFact innerTask) (by simp [starts])
    simp at member

/-- A Sub-Process scope owned by an occurrence of another scope occurrence breaks `OwnedBelow`. -/
theorem misplaced_owner_rejected (kind : OpenKind) :
    ¬ OwnedBelow { sample kind with occurrences := [{ subProcess with scope := subScope }, innerTask, outerTask] } :=
  fun owned => by
    have := owned childScope (by simp [sample]) { subProcess with scope := subScope } (by simp) (by simp [childScope, subProcess])
    simp [childScope, subScope] at this

/-- An arming of a scope occurrence never issued breaks `QueueSound`, and so `WellFormed`: queued work may name a scope
occurrence that is gone, never one that was never issued. -/
theorem unissued_arming (kind : OpenKind) : ¬ WellFormed program { sample kind with batchSignals := [.armScope (.ofSegments [{ element := ⟨"Sub"⟩, ordinal := 9 }])] } := fun formed => by
  exact sample_unissued (kind := kind) (formed.queue.armScope _ (by simp)) rfl rfl

/-- So does a completion of an identity never issued: a reservation made later would be completed. -/
theorem unissued_completion (kind : OpenKind) :
    ¬ WellFormed program { sample kind with batchSignals := [.complete ghostKey .outgoing [] .outward] } := fun formed => by
  have := (formed.queue.completes ghostKey .outgoing [] .outward (by simp)).2.2.1 _ rfl (by simp [sample] <;> simp [rootScope])
  simp [occurrenceCount, sample, sampleCounters, Std.ExtTreeMap.getD_insert] at this

/-- An arming of the Sub-Process occurrence `subKey`'s boundaries in its own scope occurrence `Sub#0` breaks `QueueSound`: its host
runs in the root, and an arming opens its items in its host's scope occurrence. -/
theorem misplaced_arming_rejected (kind : OpenKind) :
    ¬ QueueSound { sample kind with batchSignals := [.arm subKey ⟨"Sub"⟩ subScope] } := fun queue => by
  have := ((queue.arm subKey ⟨"Sub"⟩ subScope (by simp)).2.2 subProcess (by simp [sample]) rfl).2
  simp [subProcess, processRoot, subScope] at this

/-- An Event-Based Gateway arming whose gateway occurrence is the unbegun reservation `timerKey` breaks `QueueSound`. -/
theorem reserved_gateway_rejected (kind : OpenKind) :
    ¬ QueueSound { armedState kind with batchSignals := [.armGateway timerKey ⟨"Timer"⟩ processRoot] } := fun queue => by
  have := ((queue.armGateway timerKey ⟨"Timer"⟩ processRoot (by simp)).2.2 reservation (by simp [armedState]) rfl).1
  simp [reservation] at this

/-- A queued failing instance end without a failure breaks `QueueSound`: it would leave `FailureRecorded` broken. -/
theorem unrecorded_failure_rejected (kind : OpenKind) :
    ¬ QueueSound { sample kind with batchSignals := [.endInstance .failed none] } := fun queue => by
  have := queue.ends .failed none (by simp)
  simp at this

/-- A boundary item filed in the Sub-Process scope but attached to the root's task `outerKey` breaks `Owned`: an arming opens
its items in its host's scope occurrence. -/
theorem misattached_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := ofItems [{ innerItem kind with attachedTo := some outerKey }] } := fun owned => by
  obtain ⟨occurrence, member, named, rest⟩ := owned.attachments { innerItem kind with attachedTo := some outerKey } (by simp) outerKey rfl
  have placed := rest.2
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask, innerItem, processRoot, subScope] at named placed

/-- A scope occurrence owned by the unbegun reservation `timerKey` breaks `Owned`: only a begun occurrence enters a scope. -/
theorem reservation_owner_rejected (kind : OpenKind) :
    ¬ Owned { armedState kind with scopeMap := ofScopes [rootScope, { childScope with occurrence := some timerKey }] } := fun owned => by
  obtain ⟨occurrence, member, named, begun⟩ := owned.scopeOwners { childScope with occurrence := some timerKey } (by simp [rootScope, childScope, processRoot, subScope]) timerKey rfl
  simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask, reservation] at named begun

/-- An occurrence the counters never numbered breaks `OccurrencesCounted`, so a fresh activation could repeat it. -/
theorem uncounted_occurrence_rejected (kind : OpenKind) :
    ¬ OccurrencesCounted { sample kind with activations := [] } := fun counted => by
  obtain ⟨_, member, _⟩ := counted subProcess (by simp [sample])
  simp at member

/-- Two occurrences of one key break `Distinct`. -/
theorem rekeyed_rejected (kind : OpenKind) :
    ¬ Distinct { sample kind with occurrences := [subProcess, { subProcess with id := ghostKey }] } := fun distinct => by
  have := distinct.keys
  simp [key] at this

/-- A queued begin naming the begun occurrence `outerKey` breaks `ReservationsClaimed`: it would start it twice. -/
theorem rebegin_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { sample kind with batchSignals := [.begin { element := ⟨"Outer"⟩, scope := processRoot, reserved := some outerKey }] } :=
  fun claimed => by
    obtain ⟨_, beginnable⟩ := claimed.named { element := ⟨"Outer"⟩, scope := processRoot, reserved := some outerKey }
      (.inl (by simp))
    have := (beginnable outerKey (by simp [names, Option.toList])).2 outerTask (by simp [sample]) rfl
    simp [outerTask] at this

/-- Two queued begins naming the reservation `timerKey` break `ReservationsClaimed`. -/
theorem claimed_twice_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { armedState kind with batchSignals :=
      [.begin { element := ⟨"Timer"⟩, scope := processRoot, reserved := some timerKey },
        .begin { element := ⟨"Timer"⟩, scope := processRoot, reserved := some timerKey }] } := fun claimed => by
  have := claimed.signalsApart { element := ⟨"Timer"⟩, scope := processRoot, reserved := some timerKey }
    { element := ⟨"Timer"⟩, scope := processRoot, reserved := some timerKey } (by simp [Precedes]) timerKey (by simp [names])
  simp [names] at this

/-- A second item holding the reservation `timerKey` an attached item holds breaks `ReservationsClaimed`: disarming the host
would remove the reservation under it. -/
theorem shared_reservation_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { armedState kind with openItems := (ofItems
      [{ id := ⟨timerKey, .subscription, 0⟩, position := 8, kind, element := ⟨"Timer"⟩, scope := processRoot, attachedTo := some outerKey },
        { id := ⟨timerKey, .subscription, 1⟩, position := 9, kind, element := ⟨"Timer"⟩, scope := processRoot }]) } :=
      fun claimed => by
  have := claimed.attached
    { id := ⟨timerKey, .subscription, 0⟩, position := 8, kind, element := ⟨"Timer"⟩, scope := processRoot, attachedTo := some outerKey }
    (by rw [mem_ofItems (by simp)]; simp) rfl ⟨reservation, by simp [armedState], by simp [reservation], rfl⟩
    { id := ⟨timerKey, .subscription, 1⟩, position := 9, kind, element := ⟨"Timer"⟩, scope := processRoot }
    (by simp) (by simp)
  simp at this

/-- A begin of the reservation `timerKey` in the root. -/
def reservedBegin : BeginRequest := { element := ⟨"Timer"⟩, scope := processRoot, reserved := some timerKey }

/-- Two deferred begins of the reservation `timerKey` break `ReservationsClaimed`, as do a queued and a deferred one. -/
theorem deferred_twice_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { armedState kind with batchTokens := [.begin reservedBegin, .begin reservedBegin] } :=
  fun claimed => by
    have := claimed.tokensApart reservedBegin reservedBegin (by simp [Precedes]) timerKey (by simp [names, reservedBegin])
    simp [names, reservedBegin] at this

theorem queued_and_deferred_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { armedState kind with batchSignals := [.begin reservedBegin], batchTokens := [.begin reservedBegin] } :=
  fun claimed => by
    have := claimed.queuesApart reservedBegin reservedBegin (by simp) (by simp) timerKey
      (by simp [names, reservedBegin])
    simp [names, reservedBegin] at this

/-- A completion of the reservation `timerKey` queued beside its begin breaks `ReservationsClaimed`: it would complete the
occurrence before it begins. -/
theorem completed_reservation_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { armedState kind with batchSignals := [.begin reservedBegin, .complete timerKey .outgoing [] .outward] } :=
  fun claimed => claimed.uncompleted reservedBegin timerKey .outgoing [] .outward
    (.inl (List.mem_append_right _ List.mem_cons_self)) (by simp [names, reservedBegin])
    (List.mem_append_right _ (List.mem_cons_of_mem _ List.mem_cons_self))

/-- A begin queued in the scope occurrence `Sub#9`, never issued, breaks `ReservationsClaimed`: a scope occurrence entered
later would be the one it begins in. -/
theorem unissued_begin_scope_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { sample kind with batchSignals := [.begin { element := ⟨"Outer"⟩, scope := (.ofSegments [{ element := ⟨"Sub"⟩, ordinal := 9 }]) }] } :=
  fun claimed => by
    exact sample_unissued (kind := kind) (claimed.scopesIssued { element := ⟨"Outer"⟩, scope := (.ofSegments [{ element := ⟨"Sub"⟩, ordinal := 9 }]) } (.inl (by simp))) rfl rfl

/-- An unbegun reservation parked at a join breaks `SlotsSettled`: the join's firing would complete it. -/
theorem parked_reservation_rejected (kind : OpenKind) :
    ¬ SlotsSettled { armedState kind with slots := { parked := [{ occurrence := timerKey, flow := ⟨"F"⟩, scope := processRoot }] } } :=
  fun settled => by
    have := (settled.parked _ (List.mem_singleton.mpr rfl)).2.1 reservation (by simp [armedState]) rfl
    simp [reservation] at this

/-- The root's task `outerKey` was issued in the armed state. -/
theorem armed_outer_issued (kind : OpenKind) : OccurrenceIssued (armedState kind) outerKey :=
  ⟨(sample_historic kind : Historic (armedState kind)).issued_key (by simp [sample] <;> simp [rootScope]), fun _ _ => by simp [processRoot],
    fun n same _ => by
      cases (Issue.committed.inj same : 0 = n)
      simp [occurrenceCount, armedState, sampleCounters, Std.ExtTreeMap.getD_insert],
    fun _ _ same => Issue.noConfusion same⟩

/-- A parked begun occurrence settles. -/
theorem parked_begun_settled (kind : OpenKind) :
    SlotsSettled { armedState kind with slots := { parked := [{ occurrence := outerKey, flow := ⟨"F"⟩, scope := processRoot }] } } where
  parked := by
    simp only [List.mem_singleton]
    rintro _ rfl
    refine ⟨armed_outer_issued kind, fun occurrence member same => ?_, fun request queued => ?_⟩
    · simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at member
      rcases member with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation]
    · simp [Queued, armedState, sample] at queued
  bodies := by simp
  resumed := by simp
  queued := by simp [armedState, sample]
  placed := by simp
  runsPlaced := by simp
  grouped := by simp [armedState, sample]
  raised := by simp [armedState, sample]

/-- A body's run, in `body`, whose one instance is active in `subScope`. -/
def instanceRun (body : ScopeOccurrenceId) : MultiInstanceRun :=
  { scope := body, element := ⟨"Sub"⟩, occurrence := subKey, collection := .null, instances := [.active subScope] }

/-- An instance entered below the body's scope occurrence is placed. -/
theorem nested_instance_placed (kind : OpenKind) : Placed (sample kind) (instanceRun processRoot) := by
  intro scope active
  simp only [instanceRun, List.mem_singleton, Iteration.active.injEq] at active
  subst active
  refine ⟨(sample_historic kind).issued_key (by simp [sample] <;> simp [childScope]), fun entry member named => ?_⟩
  simp only [sample, scopes_eq, mem_sampleScopes] at member
  rcases member with rfl | rfl <;> simp_all [rootScope, childScope, processRoot, subScope, instanceRun]

/-- An instance standing below another scope occurrence than the body's breaks `Placed`. -/
theorem misplaced_instance_rejected (kind : OpenKind) : ¬ Placed (sample kind) (instanceRun subScope) := fun placed => by
  have := (placed subScope (by simp [instanceRun])).2 childScope (by simp [sample]) rfl
  simp [childScope, subScope, instanceRun] at this

/-- The Sub-Process occurrence's public identity, a compensation's trigger. -/
def subTrigger : OccurrenceRef := { processInstanceId := "p", element := ⟨"Sub"⟩, activation := 1 }

/-- A compensation run in `scope` whose one handler runs in the context `subScope`. -/
def handlerRun (scope : ScopeOccurrenceId) : CompensationRun :=
  { trigger := subTrigger, scope, pending := [], leave := none, resume := none,
    running := [(subScope, { subject := ⟨"Sub"⟩, handler := some ⟨"Undo"⟩, scope := processRoot })] }

/-- A handler context standing below another scope occurrence than its run's breaks `RunPlaced`. -/
theorem misplaced_handler_rejected (kind : OpenKind) : ¬ RunPlaced (sample kind) (handlerRun subScope) := fun placed => by
  have := (placed.2 subScope (by simp [handlerRun])).2 childScope (by simp [sample]) rfl
  simp [childScope, subScope, handlerRun] at this

/-- A compensation that ends by completing the unbegun reservation `timerKey` breaks `Resumable`. -/
theorem unsettled_resume_rejected (kind : OpenKind) :
    ¬ Resumable (armedState kind) processRoot (.complete timerKey .outgoing) := fun resumable => by
  have := (resumable.1 timerKey .outgoing rfl).2.1 reservation (by simp [armedState]) rfl
  simp [reservation] at this

/-- The unbegun reservation `timerKey` as a Multi-Instance body breaks `SlotsSettled`, as it does as what a compensation run, or
a queued one, completes once it ends, and as the host a queued raise leaves. -/
theorem reserved_body_rejected (kind : OpenKind) :
    ¬ SlotsSettled { armedState kind with slots := { multiInstances := [{ instanceRun processRoot with occurrence := timerKey }] } } :=
  fun settled => by
    have := (settled.bodies _ (List.mem_singleton.mpr rfl)).2.1 reservation (by simp [armedState]) rfl
    simp [reservation] at this

theorem reserved_resume_rejected (kind : OpenKind) :
    ¬ SlotsSettled { armedState kind with
      slots := { compensation := { runs := [{ handlerRun processRoot with resume := some (.complete timerKey .outgoing) }] } } } :=
  fun settled => by
    have := (settled.resumed _ (List.mem_singleton.mpr rfl) timerKey .outgoing rfl).2.1 reservation (by simp [armedState]) rfl
    simp [reservation] at this

theorem queued_resume_rejected (kind : OpenKind) :
    ¬ SlotsSettled { armedState kind with
      batchSignals := [.compensate processRoot none subTrigger none (some (.complete timerKey .outgoing))] } := fun settled => by
  have := (settled.queued processRoot none subTrigger none timerKey .outgoing (by simp)).2.1 reservation
    (by simp [armedState]) rfl
  simp [reservation] at this

theorem reserved_raise_host_rejected (kind : OpenKind) :
    ¬ SlotsSettled { armedState kind with
      batchSignals := [.raise .cancel
        { element := ⟨"Timer"⟩, scope := processRoot, activation := 1, thrower := timerKey, host := some timerKey }] } :=
  fun settled => by
    have := (settled.raised .cancel _ timerKey (List.mem_singleton.mpr rfl) rfl).2.1 reservation (by simp [armedState]) rfl
    simp [reservation] at this

/-- The root's task `outerKey` numbered as a Multi-Instance body while its item waits for it breaks `ItemRoles`: the item's
public identity would be the body's, which shares its element and activation with the body's first instance. -/
theorem body_item_rejected (kind : OpenKind) :
    ¬ ItemRoles { sample kind with occurrences := [subProcess, innerTask, { outerTask with role := .multiInstanceBody }] } :=
  fun roles => by
    have := roles (outerItem kind) (by simp [sample, innerItem, outerItem]) { outerTask with role := .multiInstanceBody } (by simp) (by simp [outerTask, outerItem])
    simp at this

/-- A queued compensation in the Sub-Process's scope occurrence that releases the root as its group context breaks
`SlotsSettled`. -/
theorem foreign_group_rejected (kind : OpenKind) :
    ¬ SlotsSettled { sample kind with
      batchSignals := [.compensate subScope none subTrigger none (some (.group processRoot))] } := fun settled => by
  have := settled.grouped subScope none subTrigger none processRoot (by simp)
  simp [processRoot, subScope] at this

end Kernel.Laws.State
