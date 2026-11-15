module

public import Kernel.Hooks
public import Kernel.Laws.Hooks
public import Kernel.Laws.State.Frames
public import Kernel.Laws.IL
public import Kernel.Feature.Propagation
import all Kernel.Feature.Propagation

/-! # Laws of propagation

The rules of the [propagation semantics](../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#finding-the-catcher),
independent of `Kernel.Feature.Propagation`'s and `Kernel.Step`'s code: the search visits its candidate levels from the
raising scope occurrence outward and the first level holding a catcher wins, so a nearer catch-all precedes a farther
exact code, while within one level the lowest precedence wins, an exact code before a catch-all, document order
breaking ties (CIB-INT-0010); at a compensation handler's context the search stops under `failsInstance` and goes on
from the trigger's scope occurrence under `propagatesFromTrigger` (I11); a caught interrupting event removes everything
inside the interrupted scope occurrence, keeps every activation counter, and puts exactly one token on each of the
catcher's flows in the parent; an Error no catcher takes fails the instance or ends only the throwing path, as the
profile selects; an Escalation no catcher takes changes nothing beyond its thrower's own leave; and admission keeps
every Cancel throw caught.

The laws take the candidate levels, a catcher's precedence (`rank`, `none` for a candidate that does not catch the
event) and the scope chains as parameters, since computing them is the IL's and `Ctx.catches`'; the proof wave relates
them to the program. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Propagation

open Kernel

/-! ## The catcher -/

/-- No candidate at a level nearer than `index` catches the event. -/
def NothingNearer (rank : ElementId → Option Nat) (levels : List (List ElementId)) (index : Nat) : Prop :=
  ∀ nearer < index, ∀ other, levels[nearer]? = some other → ∀ candidate ∈ other, rank candidate = none

/-- `catcher` catches with the lowest precedence of `level`, the first in document order among equals. -/
def LeastIn (rank : ElementId → Option Nat) (level : List ElementId) (catcher : ElementId) : Prop :=
  ∃ precedence, rank catcher = some precedence ∧
    ∀ candidate ∈ level, ∀ other, rank candidate = some other →
      precedence < other ∨ (precedence = other ∧ level.idxOf catcher ≤ level.idxOf candidate)

/-- The catcher a raised event's search picks among its candidate levels, nearest first (the raising Activity's
boundaries, then per scope occurrence outward its Event Sub-Processes, then its element's boundaries): a candidate at
the first level that holds a catcher, of the lowest precedence there, the first in document order among equals; none
when no level holds one. -/
def Chosen (rank : ElementId → Option Nat) (levels : List (List ElementId)) : Option ElementId → Prop
  | some catcher => ∃ (index : Nat) (level : List ElementId), (levels[index]? = some level ∧ catcher ∈ level) ∧
      NothingNearer rank levels index ∧ LeastIn rank level catcher
  | none => ∀ level ∈ levels, ∀ candidate ∈ level, rank candidate = none

/-- So within its level the chosen catcher's precedence is the lowest: an exact code is chosen over a catch-all. -/
theorem Chosen.lowest {rank : ElementId → Option Nat} {levels : List (List ElementId)} {catcher : ElementId}
    (law : Chosen rank levels (some catcher)) : ∃ (index : Nat) (level : List ElementId) (precedence : Nat), levels[index]? = some level ∧
      rank catcher = some precedence ∧ ∀ candidate ∈ level, ∀ other, rank candidate = some other → precedence ≤ other := by
  obtain ⟨index, level, located, rest⟩ := law
  obtain ⟨at_, _⟩ := located
  obtain ⟨precedence, ranked, least⟩ := rest.2
  exact ⟨index, level, precedence, at_, ranked, fun candidate mem other ranks =>
    (least candidate mem other ranks).elim Nat.le_of_lt (fun ⟨same, _⟩ => same ▸ Nat.le_refl _)⟩

/-- Where a search that reaches a compensation handler's context (`handlerAt`, its index on the outward chain
`outward`) looks: under `failsInstance` no further than that context; under `propagatesFromTrigger` on from the scope
occurrence the trigger ran in, along its own chain `fromTrigger` (I11, D8). A search that meets no handler context
walks the whole chain. -/
def Searched (policy : CompensationHandlerFailure) (outward : List ScopeOccurrenceId) (handlerAt : Option Nat)
    (fromTrigger searched : List ScopeOccurrenceId) : Prop :=
  match handlerAt with
  | none => searched = outward
  | some index =>
    (policy = .failsInstance → searched = outward.take (index + 1)) ∧
      (policy = .propagatesFromTrigger → searched = outward.take (index + 1) ++ fromTrigger)

/-! ## A caught interrupting event -/

/-- A catch that interrupts (`interrupting`) the scope occurrences `inside` removes every one of them with every token
in them, keeps every activation counter monotonic, and adds exactly one token on each of the catcher's flows in
`parent` (§10.5, §13.5.3). -/
def InterruptingCatch (interrupting : Bool) (inside : ScopeOccurrenceId → Prop) (parent : ScopeOccurrenceId)
    (flows : List FlowId) (before after : State) : Prop :=
  interrupting = true →
    (∀ scope ∈ after.scopes, ¬ inside scope.id) ∧
    (∃ kept, after.tokens = kept ++ flows.map (Token.flow · parent) ∧
      ∀ token ∈ kept, token ∈ before.tokens ∧ ¬ inside token.busyScope) ∧
    ∀ counter ∈ before.activations, ∃ later ∈ after.activations, later.processInstance = counter.processInstance ∧
      later.element = counter.element ∧ later.role = counter.role ∧ counter.count ≤ later.count

/-! ## Events no catcher takes -/

/-- An Error no catcher takes (`caught = false`): under `failsInstance` the input commits a failed instance with no token
left (Table 10.88); under `endsThrowingPath` (CIB-INT-0013) a committed input never fails the instance. -/
def UncaughtError (policy : UnhandledError) (caught : Bool) (result : Except Failure State) : Prop :=
  caught = false →
    (policy = .failsInstance → ∃ after, result = .ok after ∧ after.status = .failed ∧ after.tokens = []) ∧
      (policy = .endsThrowingPath → ∀ after, result = .ok after → after.status ≠ .failed)

/-- An Escalation no catcher takes changes nothing beyond its thrower's own leave (`leave`), under every profile
(PC-ESCALATION-01, CIB-INT-0021). -/
def UncaughtEscalation (caught : Bool) (leave : State → State) (before after : State) : Prop :=
  caught = false → after = leave before

/-- Admission of a Cancel throw: one whose direct parent is no Transaction is `throw.cancel.outsideTransaction`, one whose
Transaction has no Cancel boundary `throw.cancel.uncaught` (§10.3.5, §10.5.5, I13), so every admitted Cancel is
caught. -/
def CancelAdmission (inTransaction : Bool) (boundaries : Nat) : Option String → Prop
  | some code => (inTransaction = false ∧ code = "throw.cancel.outsideTransaction") ∨
      (inTransaction = true ∧ boundaries = 0 ∧ code = "throw.cancel.uncaught")
  | none => inTransaction = true ∧ 0 < boundaries

theorem CancelAdmission.caught {inTransaction : Bool} {boundaries : Nat}
    (admitted : CancelAdmission inTransaction boundaries none) : 0 < boundaries :=
  admitted.2

/-! ## Non-vacuity

A catch-all `C` on the raising Activity's boundary and an exact code `E` one level out. -/

def catchAll : ElementId := ⟨"C"⟩
def exact : ElementId := ⟨"E"⟩
def silent : ElementId := ⟨"S"⟩

def rank (candidate : ElementId) : Option Nat :=
  if candidate = exact then some 0 else if candidate = catchAll then some 1 else none

theorem nearer_catch_all : Chosen rank [[catchAll], [exact]] (some catchAll) :=
  ⟨0, [catchAll], ⟨rfl, by simp⟩, fun _ nearer => absurd nearer (Nat.not_lt_zero _), 1, by simp [rank, catchAll, exact],
    fun candidate mem other ranks => by simp at mem; subst mem; simp [rank, catchAll, exact] at ranks; exact .inr ⟨ranks, by simp⟩⟩

/-- Choosing the farther exact code over the nearer catch-all is rejected. -/
theorem farther_exact_rejected : ¬ Chosen rank [[catchAll], [exact]] (some exact) := by
  rintro ⟨index, level, ⟨at_, mem⟩, rest⟩
  have nearer := rest.1
  rcases index with _ | _ | index
  · simp at at_
    subst at_
    simp [exact, catchAll] at mem
  · have := nearer 0 (by omega) [catchAll] rfl catchAll (by simp)
    simp [rank, catchAll, exact] at this
  · simp at at_

theorem exact_in_level : Chosen rank [[catchAll, exact]] (some exact) :=
  ⟨0, [catchAll, exact], ⟨rfl, by simp⟩, fun _ nearer => absurd nearer (Nat.not_lt_zero _), 0, by simp [rank],
    fun candidate mem other ranks => by
      simp at mem
      rcases mem with rfl | rfl
      · simp [rank, catchAll, exact] at ranks
        exact .inl (by omega)
      · simp [rank] at ranks
        exact .inr ⟨ranks, Nat.le_refl _⟩⟩

/-- Choosing the catch-all over the exact code of its own level is rejected. -/
theorem catch_all_in_level_rejected : ¬ Chosen rank [[catchAll, exact]] (some catchAll) := by
  rintro ⟨index, level, ⟨at_, _⟩, rest⟩
  obtain ⟨precedence, ranked, least⟩ := rest.2
  rcases index with _ | index
  · simp at at_
    subst at_
    simp [rank, catchAll, exact] at ranked
    subst ranked
    rcases least exact (by simp) 0 (by simp [rank]) with lower | ⟨same, _⟩ <;> omega
  · simp at at_

theorem none_catches : Chosen rank [[silent]] none := by
  simp [Chosen, rank, silent, exact, catchAll]

/-- Calling an event caught that no candidate catches is rejected. -/
theorem silent_caught_rejected : ¬ Chosen rank [[silent], [exact]] none := fun law => by
  have := law [exact] (by simp) exact (by simp)
  simp [rank] at this

def raising : ScopeOccurrenceId := ⟨3⟩
def handlerContext : ScopeOccurrenceId := ⟨2⟩
def above : ScopeOccurrenceId := ⟨1⟩
def triggerScope : ScopeOccurrenceId := ⟨0⟩

theorem stops_at_handler :
    Searched .failsInstance [raising, handlerContext, above] (some 1) [triggerScope] [raising, handlerContext] :=
  ⟨fun _ => rfl, fun wrong => by simp at wrong⟩

/-- Under `failsInstance`, searching past the handler's context is rejected. -/
theorem past_handler_rejected :
    ¬ Searched .failsInstance [raising, handlerContext, above] (some 1) [triggerScope] [raising, handlerContext, above] :=
  fun law => by
    have := law.1 rfl
    simp [raising, handlerContext, above] at this

theorem on_from_trigger :
    Searched .propagatesFromTrigger [raising, handlerContext, above] (some 1) [triggerScope]
      [raising, handlerContext, triggerScope] :=
  ⟨fun wrong => by simp at wrong, fun _ => rfl⟩

/-- Under `propagatesFromTrigger`, going on to the handler context's own enclosing chain instead of the trigger's is
rejected. -/
theorem on_from_context_rejected :
    ¬ Searched .propagatesFromTrigger [raising, handlerContext, above] (some 1) [triggerScope]
      [raising, handlerContext, above] := fun law => by
  have := law.2 rfl
  simp [above, triggerScope] at this

def boundaryFlow : FlowId := ⟨"ToRecovery"⟩
def counter : ActivationCount := { processInstance := "p", element := exact, role := .element, count := 2 }

def running : State :=
  { instanceId := "p", scopes := [{ id := triggerScope, element := none, parent := none },
      { id := raising, element := some ⟨"Sub"⟩, parent := some triggerScope }],
    tokens := [.flow ⟨"Inner"⟩ raising], activations := [counter] }

def recovered : State :=
  { running with
    scopes := [{ id := triggerScope, element := none, parent := none }]
    tokens := [.flow boundaryFlow triggerScope] }

theorem catch_interrupts : InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running recovered := fun _ =>
  ⟨by simp [recovered, triggerScope, raising], ⟨[], rfl, by simp⟩, fun counter' mem => ⟨counter', mem, rfl, rfl, rfl, Nat.le_refl _⟩⟩

/-- Keeping the interrupted scope occurrence is rejected. -/
theorem keeps_inner_scope_rejected :
    ¬ InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running { recovered with scopes := running.scopes } :=
  fun law => (law rfl).1 { id := raising, element := some ⟨"Sub"⟩, parent := some triggerScope } (by simp [running]) rfl

/-- Adding no token on the catcher's flow is rejected. -/
theorem no_boundary_token_rejected :
    ¬ InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running { recovered with tokens := [] } := fun law => by
  obtain ⟨_, ⟨kept, split, _⟩, _⟩ := law rfl
  have := congrArg List.length split
  simp at this

/-- Resetting an activation counter is rejected. -/
theorem counter_reset_rejected :
    ¬ InterruptingCatch true (· = raising) triggerScope [boundaryFlow] running
      { recovered with activations := [{ counter with count := 0 }] } := fun law => by
  obtain ⟨_, _, monotonic⟩ := law rfl
  obtain ⟨later, mem, same⟩ := monotonic counter (by simp [running])
  obtain ⟨_, _, _, le⟩ := same
  simp at mem
  subst mem
  simp [counter] at le

def failed : State := { instanceId := "p", status := .failed }

theorem uncaught_fails : UncaughtError .failsInstance false (.ok failed) :=
  fun _ => ⟨fun _ => ⟨failed, rfl, rfl, rfl⟩, fun wrong => by simp at wrong⟩

/-- Under `failsInstance`, leaving the instance running is rejected. -/
theorem uncaught_running_rejected : ¬ UncaughtError .failsInstance false (.ok running) := fun law => by
  obtain ⟨after, same, status, _⟩ := (law rfl).1 rfl
  simp at same
  subst same
  simp [running] at status

theorem uncaught_ends_path : UncaughtError .endsThrowingPath false (.ok recovered) :=
  fun _ => ⟨fun wrong => by simp at wrong, fun _ after same => by cases same; intro failed; cases failed⟩

/-- Under `endsThrowingPath`, failing the instance is rejected. -/
theorem ends_path_fails_rejected : ¬ UncaughtError .endsThrowingPath false (.ok failed) := fun law =>
  (law rfl).2 rfl failed rfl rfl

def leaveThrower (state : State) : State := { state with tokens := [] }

theorem escalation_leaves_only : UncaughtEscalation false leaveThrower running (leaveThrower running) := fun _ => rfl

/-- An uncaught Escalation that fails the instance is rejected. -/
theorem escalation_fails_rejected : ¬ UncaughtEscalation false leaveThrower running { leaveThrower running with status := .failed } :=
  fun law => by
    have := congrArg State.status (law rfl)
    revert this
    simp [leaveThrower, running]

theorem cancel_admitted : CancelAdmission true 1 none := ⟨rfl, by omega⟩

theorem cancel_uncaught_refused : CancelAdmission true 0 (some "throw.cancel.uncaught") := .inr ⟨rfl, rfl, rfl⟩

/-- Admitting a Cancel throw whose Transaction has no Cancel boundary is rejected. -/
theorem cancel_uncaught_admitted_rejected : ¬ CancelAdmission true 0 none := fun law =>
  absurd law.caught (Nat.lt_irrefl 0)

/-! ## The state invariant under Propagation's throws and raises

Propagation's share of the proof wave's state-invariant lane (P2) for `Hooks.arriveThrow` and `Hooks.raise`, stated over
`PropagationOps` and, for the hooks a raise's search takes, `SearchHooks`, generic in `inv`; `Kernel.Proofs.Step` fills
both for `Laws.State.WellFormed` and the registered hooks. A throw completes its own begun occurrence, raises from it,
fires the receivers of a Signal, opens a Message throw's effect item or queues the compensation that completes it; a
Terminate End first clears its scope occurrence, keeping itself. A raise reads two facts of the state the closure takes it
off the queue in, which its steps keep (`Steady`): a raising Activity, its host, is settled, so its Error-path leave may
complete it (`HostSettled`); and an Event's occurrences its origin names have begun, so `throwerLeaves` completes a begun
one (`Thrown`). -/

/-- What a raise's own steps keep of what it reads: the occurrences, the scope occurrences and the queued begins, with no
identity issued back. -/
structure Steady (before after : State) : Prop where
  occurrences : after.occurrences = before.occurrences
  scopes : after.scopes = before.scopes
  issued : before.nextIssue ≤ after.nextIssue
  queued : ∀ request, Laws.State.Queued after request → Laws.State.Queued before request

theorem Steady.refl (state : State) : Steady state state := ⟨rfl, rfl, Nat.le_refl _, fun _ => id⟩

theorem Steady.trans {first second third : State} (one : Steady first second) (two : Steady second third) :
    Steady first third :=
  ⟨two.occurrences.trans one.occurrences, two.scopes.trans one.scopes, Nat.le_trans one.issued two.issued,
    fun request queued => one.queued request (two.queued request queued)⟩

/-- A raising Activity, the raise's host, is settled (`Laws.State.Settled`). -/
def HostSettled (origin : Origin) (state : State) : Prop :=
  ∀ host, origin.host = some host → Laws.State.Settled state host

/-- The occurrences a raise from an Event names have begun (`Laws.State.Raisable`). -/
def Thrown (program : Program) (origin : Origin) (state : State) : Prop :=
  ((program.element? origin.element).bind (·.event?)).isSome = true → ∀ occurrence ∈ state.occurrences,
    occurrence.element = origin.element → occurrence.scope = origin.scope → occurrence.activation = origin.activation →
      occurrence.begun = true

theorem HostSettled.steady {origin : Origin} {before after : State} (settled : HostSettled origin before)
    (steady : Steady before after) : HostSettled origin after := fun host named =>
  (settled host named).transport steady.issued (fun _ member _ => .inl (steady.occurrences ▸ member)) steady.queued

theorem Thrown.steady {program : Program} {origin : Origin} {before after : State} (thrown : Thrown program origin before)
    (occurrences : after.occurrences = before.occurrences) : Thrown program origin after := fun event occurrence member =>
  thrown event occurrence (occurrences ▸ member)

/-- What a raise needs of the hooks its search takes (`Feature.Propagation.PropagationHooks`), for an invariant `inv` of
an instance under `ctx`: each keeps `inv` and is `Steady`, the Error-path leave of a settled host. -/
structure SearchHooks (ctx : Ctx) (inv : State → Prop) (hooks : Feature.Propagation.PropagationHooks) : Prop where
  mappedErrorOutputs : ∀ origin installed state after, inv state → HostSettled origin state →
    hooks.mappedErrorOutputs ctx origin installed state = .ok after → inv after ∧ Steady state after
  writeCaught : ∀ scope writes state after, inv state → hooks.writeCaught ctx scope writes state = .ok after →
    inv after ∧ Steady state after
  callOutputs : ∀ root state after, inv state → hooks.callOutputs ctx root state = .ok after →
    inv after ∧ Steady state after
  dropRuns : ∀ scope state, inv state →
    inv (hooks.dropRuns ctx scope state) ∧ Steady state (hooks.dropRuns ctx scope state)

/-- What Propagation's throws and raises need of the state operations they apply, for an invariant `inv`. -/
structure PropagationOps (program : Program) (inv : State → Prop) : Prop where
  /-- The completion of a begun occurrence that stands. -/
  complete : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → inv (state.signal (.complete occurrence.id leave writes rule))
  /-- A raise from a begun occurrence that stands, at its element, scope occurrence and activation. -/
  raise : ∀ state raised occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    inv (state.signal (.raise raised
      { element := occurrence.element, scope := occurrence.scope, activation := occurrence.activation }))
  /-- An item's firing. -/
  fire : ∀ state item fired, inv state → inv (state.signal (.fire item fired))
  /-- A Signal throw's broadcast intent. -/
  outbox : ∀ state outbox, inv state → inv { state with outbox }
  /-- The compensation a begun occurrence's throw queues, which completes it once it ends. -/
  compensate : ∀ state occurrence scope activity trigger leave, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true →
    inv (state.signal (.compensate scope activity trigger none (some (.complete occurrence.id leave))))
  /-- A Terminate End's clearing of its scope occurrence, keeping its own begun occurrence. -/
  terminate : ∀ state occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    inv (state.clearInside occurrence.scope [occurrence.id]) ∧
      occurrence ∈ (state.clearInside occurrence.scope [occurrence.id]).occurrences
  /-- An item for a begun occurrence of an element the program declares no start Event, numbered under its element's
  counter. -/
  openItem : ∀ state kind occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    (program.element? occurrence.element).bind (·.start?) = none → occurrence.role = .element →
    inv (state.openItem kind occurrence)
  /-- A queued signal keeps the occurrences. -/
  signalOccurrences : ∀ (state : State) signal, (state.signal signal).occurrences = state.occurrences
  /-- A caught Event Sub-Process's begin, naming no reservation, in a scope occurrence that stands. -/
  begin : ∀ state element scope, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    inv (state.signal (.begin { element, scope }))
  /-- An interrupting boundary's cancellation of its host. -/
  cancel : ∀ state id, inv state → inv (state.signal (.cancel id))
  /-- A caught boundary's fresh occurrence. -/
  occur : ∀ state element scope leave writes rule, inv state → Laws.IL.BoundaryOf program element →
    inv (state.signal (.occur element scope leave writes rule))
  /-- An interrupted Scope's output mappings. -/
  write : ∀ state scope writes rule, inv state → inv (state.signal (.write scope writes rule))
  /-- An Error that reached a compensation handler's context. -/
  failCompensation : ∀ state handler code message origin, inv state →
    inv (state.signal (.compensationFailed handler code message origin))
  /-- An uncaught Error's failed instance end. -/
  fail : ∀ state failure, inv state → inv (state.signal (.endInstance .failed (some failure)))
  /-- A rolled-back Transaction's disarmed boundaries, keeping the scope occurrences. -/
  disarm : ∀ state host, inv state → inv (state.disarm host) ∧ (state.disarm host).scopes = state.scopes
  /-- A caught Cancel's rollback: the scope occurrence, which stands, cleared, then its compensation queued, which takes
  the boundary once it ends. -/
  rollBack : ∀ state scope trigger leave element parent flows, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    Laws.IL.BoundaryOf program element → inv ((state.clearInside scope).signal (.compensate scope none trigger leave (some (.occur element parent flows))))

/-- Firing each of a Signal throw's receivers keeps `inv` and the occurrences. -/
theorem fireAll_keeps {inv : State → Prop} (ops : PropagationOps program inv) (fired : State → OpenItem → Fired) :
    ∀ (receivers : List OpenItem) (state : State), inv state →
      inv (receivers.foldl (fun state item => state.signal (.fire item.id (fired state item))) state) ∧
      (receivers.foldl (fun state item => state.signal (.fire item.id (fired state item))) state).occurrences =
        state.occurrences
  | [], _, holds => ⟨holds, rfl⟩
  | item :: rest, state, holds => by
    obtain ⟨kept, same⟩ := fireAll_keeps ops fired rest _ (ops.fire state item.id (fired state item) holds)
    exact ⟨kept, same.trans (ops.signalOccurrences _ _)⟩

/-- `Hooks.arriveThrow` keeps `inv`: a raise names the thrower's element (`Laws.Step.HookContract.arriveThrow`). -/
theorem arriveThrow_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv) {header : Header}
    {payload : EventPayload} {thrown : Throw} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (ctx.program.element? occurrence.element).bind (·.start?) = none) (role : occurrence.role = .element)
    (named : header.id = occurrence.element)
    (ran : Feature.Propagation.arriveThrow ctx header payload thrown occurrence state = .ok after) : inv after := by
  have complete := ops.complete state occurrence (Feature.Propagation.throwLeave payload) [] .outward holds member begun
  have left : occurrence ∈ (state.signal (.complete occurrence.id (Feature.Propagation.throwLeave payload) [] .outward)).occurrences := by
    rw [ops.signalOccurrences]; exact member
  unfold Feature.Propagation.arriveThrow at ran
  cases thrown with
  | none => cases ran; exact complete
  | terminate =>
    cases ran
    obtain ⟨cleared, stays⟩ := ops.terminate state occurrence holds member begun
    exact ops.complete _ _ _ _ _ cleared stays begun
  | error record => cases ran; rw [named]; exact ops.raise _ _ _ complete left begun
  | escalation record => cases ran; rw [named]; exact ops.raise _ _ _ holds member begun
  | message record =>
    cases ran
    unfold Feature.Propagation.throwMessage
    split
    · exact complete
    · exact ops.openItem _ _ _ holds member begun unstarted role
  | signal record =>
    dsimp only at ran
    unfold Feature.Propagation.throwSignal at ran
    simp only [bind, Except.bind] at ran
    repeat' split at ran
    all_goals try cases ran
    obtain ⟨fired, same⟩ := fireAll_keeps ops _ (Feature.Propagation.ownReceivers state _) state holds
    exact ops.complete _ _ _ _ _ (ops.outbox _ _ fired) (same ▸ member) begun
  | compensation record =>
    dsimp only at ran
    unfold Feature.Propagation.throwCompensation at ran
    split at ran
    · cases ran
    · cases ran
      exact ops.compensate _ _ _ _ _ _ holds member begun
  | cancel => cases ran; rw [named]; exact ops.raise _ _ _ complete left begun

/-! ### The search -/

private theorem ok_bind {α β ε : Type} {x : Except ε α} {f : α → Except ε β} {b : β} (ran : (x >>= f) = .ok b) :
    ∃ a, x = .ok a ∧ f a = .ok b := by
  cases x with
  | error failure => exact absurd ran (by simp [bind, Except.bind])
  | ok a => exact ⟨a, by simp, by simpa [bind, Except.bind] using ran⟩

private theorem ok_map {α β ε : Type} {x : Except ε α} {f : α → β} {b : β} (ran : x.map f = .ok b) :
    ∃ a, x = .ok a ∧ b = f a := by
  cases x with
  | error failure => simp [Except.map] at ran
  | ok a => exact ⟨a, rfl, (Except.ok.inj ran).symm⟩

/-- `List.foldl` keeps what each step keeps. -/
private theorem foldl_holds {α β : Type} (holds : β → Prop) (f : β → α → β) :
    ∀ (items : List α) (b : β), holds b → (∀ b a, a ∈ items → holds b → holds (f b a)) → holds (items.foldl f b)
  | [], _, start, _ => start
  | a :: rest, b, start, each => foldl_holds holds f rest (f b a) (each b a List.mem_cons_self start)
      fun b a inside => each b a (List.mem_cons_of_mem _ inside)

/-- The candidate `Propagation.best?` picks is one of the candidates. -/
theorem best?_mem {α : Type} {ctx : Ctx} {raised : Raised} {trigger : α → Trigger} {candidates : List α}
    {chosen : α} {writes : List (String × Value)}
    (found : Feature.Propagation.best? ctx raised trigger candidates = some (chosen, writes)) : chosen ∈ candidates := by
  unfold Feature.Propagation.best? at found
  obtain ⟨⟨caught, candidate⟩, folded, same⟩ := Option.map_eq_some_iff.mp found
  have named : candidate = chosen := congrArg Prod.fst same
  subst named
  refine foldl_holds (fun chosen => ∀ pair ∈ chosen, pair.2 ∈ candidates) _ candidates none (by simp)
    (fun chosen candidate inside held pair member => ?_) _ folded
  split at member
  · exact held pair member
  · cases member
    exact inside
  · split at member
    · cases member
      exact inside
    · exact held pair member

/-- A boundary `Propagation.boundariesOf` lists is one of the program's. -/
theorem boundariesOf_boundaryOf {ctx : Ctx} {element : ElementId} {boundary : Boundary}
    (member : boundary ∈ Feature.Propagation.boundariesOf ctx element) : Laws.IL.BoundaryOf ctx.program boundary.id := by
  unfold Feature.Propagation.boundariesOf at member
  cases found : (ctx.program.element? element).bind (·.envelope?) with
  | none => simp [found] at member
  | some envelope =>
    rw [found] at member
    exact Laws.IL.boundaryOf_envelope found member

/-- A caught boundary fires: it cancels its host if it interrupts one, and a fresh occurrence occurs. -/
theorem boundaryFire_keeps {inv : State → Prop} (ops : PropagationOps program inv) (boundary : Boundary)
    (host : Option Nat) (scope : ScopeOccurrenceId) (writes : List (String × Value)) {state : State} (holds : inv state)
    (bounded : Laws.IL.BoundaryOf program boundary.id) :
    inv (boundary.fire host none scope writes state) ∧ (boundary.fire host none scope writes state).occurrences =
      state.occurrences := by
  rw [Laws.Hooks.fire_eq]
  have interrupted : inv (if boundary.interrupting then host.elim state (state.signal <| .cancel ·) else state) ∧
      (if boundary.interrupting then host.elim state (state.signal <| .cancel ·) else state).occurrences =
        state.occurrences := by
    split
    · cases host with
      | none => exact ⟨holds, rfl⟩
      | some owner => exact ⟨ops.cancel _ _ holds, ops.signalOccurrences _ _⟩
    · exact ⟨holds, rfl⟩
  exact ⟨ops.occur _ _ _ _ _ _ interrupted.1 bounded, (ops.signalOccurrences _ _).trans interrupted.2⟩

/-- An Escalation's thrower leaves once the search has decided: the occurrence it finds has begun. -/
theorem throwerLeaves_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv) {origin : Origin}
    {state : State} (holds : inv state) (thrown : Thrown ctx.program origin state) :
    inv (Feature.Propagation.throwerLeaves ctx origin state) := by
  unfold Feature.Propagation.throwerLeaves
  dsimp only
  cases found : state.occurrences.find? fun occurrence => occurrence.element == origin.element &&
      occurrence.scope == origin.scope && occurrence.activation == origin.activation with
  | none => exact holds
  | some occurrence =>
    cases event : (ctx.program.element? origin.element).bind (·.event?) with
    | none => exact holds
    | some pair =>
      have same := List.find?_some found
      simp only [Bool.and_eq_true, beq_iff_eq] at same
      exact ops.complete _ _ _ _ _ holds (List.mem_of_find?_eq_some found)
        (thrown (by rw [event]; rfl) occurrence (List.mem_of_find?_eq_some found) same.1.1 same.1.2 same.2)

theorem hostLeaves_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {state after : State} (holds : inv state)
    (settled : HostSettled origin state) (ran : Feature.Propagation.hostLeaves hooks ctx origin state = .ok after) :
    inv after ∧ Steady state after := by
  unfold Feature.Propagation.hostLeaves at ran
  split at ran
  · exact search.mappedErrorOutputs _ _ _ _ holds settled ran
  · cases ran
    exact ⟨holds, .refl _⟩

theorem catchDecided_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {state after : State} (holds : inv state) (settled : HostSettled origin state)
    (ran : Feature.Propagation.catchDecided hooks ctx origin scope writes state = .ok after) :
    inv after ∧ Steady state after := by
  unfold Feature.Propagation.catchDecided at ran
  dsimp only at ran
  split at ran
  · exact hostLeaves_keeps search holds settled (by simpa [bind, Except.bind] using ran)
  · obtain ⟨written, wrote, ran⟩ := ok_bind ran
    obtain ⟨kept, steady⟩ := search.writeCaught _ _ _ _ holds wrote
    obtain ⟨left, more⟩ := hostLeaves_keeps search kept (settled.steady steady) ran
    exact ⟨left, steady.trans more⟩

theorem passCallOutputs_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {catches : Bool} {occurrence : ScopeOccurrence}
    {state after : State} (holds : inv state)
    (ran : Feature.Propagation.passCallOutputs hooks ctx origin catches occurrence state = .ok after) :
    inv after ∧ Steady state after := by
  unfold Feature.Propagation.passCallOutputs at ran
  repeat' split at ran
  all_goals first | (simp at ran; done) | (cases ran; exact ⟨holds, .refl _⟩) |
    exact search.callOutputs _ _ _ holds ran

/-- The walk an uncaught Error's path takes to its instance's root changes nothing. -/
theorem enclosingInstances_ok {ctx : Ctx} {state after : State} :
    ∀ fuel current, Feature.Propagation.enclosingInstances ctx state fuel current = .ok after → after = state
  | 0, _, ran => by simpa [Feature.Propagation.enclosingInstances] using ran.symm
  | fuel + 1, current, ran => by
    unfold Feature.Propagation.enclosingInstances at ran
    repeat' split at ran
    all_goals first | (simp at ran; done) | exact (Except.ok.inj ran).symm |
      exact enclosingInstances_ok fuel _ ran

theorem exhausted_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {handler : Option ScopeOccurrenceId} {state after : State} (holds : inv state) (settled : HostSettled origin state)
    (thrown : Thrown ctx.program origin state)
    (ran : Feature.Propagation.exhausted hooks ctx raised origin handler state = .ok after) : inv after := by
  unfold Feature.Propagation.exhausted at ran
  obtain ⟨left, leaves, ran⟩ := ok_bind ran
  obtain ⟨kept, steady⟩ := hostLeaves_keeps search holds settled leaves
  split at ran
  · cases ran
    exact ops.failCompensation _ _ _ _ _ kept
  · unfold Feature.Propagation.unhandledError at ran
    split at ran
    · cases ran
      exact ops.fail _ _ kept
    · obtain ⟨walked, walk, ran⟩ := ok_bind ran
      cases enclosingInstances_ok _ _ walk
      split at ran
      · cases ran
        exact kept
      · simp at ran
  · simp at ran
  · cases ran
    exact throwerLeaves_keeps ops kept (thrown.steady steady.occurrences)
  · simp at ran

/-- The scope occurrence a caught Cancel rolls back stands. -/
theorem cancelledScope_stands {origin : Origin} {occurrence : ScopeOccurrence} {state : State}
    (present : occurrence ∈ state.scopes) :
    ∃ entry ∈ state.scopes, entry.id = Feature.Propagation.cancelledScope origin occurrence state := by
  unfold Feature.Propagation.cancelledScope
  suffices walk : ∀ fuel current, ∃ entry ∈ state.scopes,
      entry.id = Feature.Propagation.cancelledScope.nearest occurrence state fuel current from walk _ _
  intro fuel
  induction fuel with
  | zero => intro current; exact ⟨occurrence, present, by simp [Feature.Propagation.cancelledScope.nearest]⟩
  | succ fuel ih =>
    intro current
    unfold Feature.Propagation.cancelledScope.nearest
    split
    · exact ⟨occurrence, present, rfl⟩
    · rename_i entry found
      split
      · exact ⟨entry, List.mem_of_find?_eq_some found, rfl⟩
      · cases parent : entry.parent with
        | none => exact ⟨occurrence, present, rfl⟩
        | some outer => simpa using ih outer

theorem interruptedOutputs_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv)
    {occurrence : ScopeOccurrence} {parent : ScopeOccurrenceId} {state after : State} (holds : inv state)
    (ran : Feature.Propagation.interruptedOutputs ctx occurrence parent state = .ok after) : inv after := by
  unfold Feature.Propagation.interruptedOutputs at ran
  dsimp only at ran
  repeat' split at ran
  all_goals first | (cases ran; exact holds) | skip
  obtain ⟨outputs, _, made⟩ := ok_map ran
  subst made
  exact ops.write _ _ _ _ holds

theorem leaveOccurrence_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {occurrence : ScopeOccurrence} {parent : ScopeOccurrenceId} {boundary : Boundary} {writes : List (String × Value)}
    {state after : State} (holds : inv state) (settled : HostSettled origin state) (thrown : Thrown ctx.program origin state)
    (present : occurrence ∈ state.scopes) (bounded : Laws.IL.BoundaryOf ctx.program boundary.id)
    (ran : Feature.Propagation.leaveOccurrence hooks ctx raised origin occurrence parent boundary writes state = .ok after) :
    inv after := by
  unfold Feature.Propagation.leaveOccurrence at ran
  split at ran
  · cases ran
    obtain ⟨entry, inside, named⟩ := cancelledScope_stands (origin := origin) present
    repeat' split
    all_goals first
      | exact ops.rollBack _ _ _ _ _ _ _ holds ⟨entry, inside, named⟩ bounded
      | exact ops.rollBack _ _ _ _ _ _ _ (ops.disarm _ _ holds).1 ⟨entry, (ops.disarm _ _ holds).2 ▸ inside, named⟩
          bounded
  · split at ran
    · obtain ⟨dropped, steady⟩ := search.dropRuns occurrence.id state holds
      obtain ⟨decided, decision, ran⟩ := ok_bind ran
      obtain ⟨kept, _⟩ := catchDecided_keeps search dropped (settled.steady steady) decision
      obtain ⟨outputs, out, made⟩ := ok_map ran
      subst made
      exact (boundaryFire_keeps ops _ _ _ _ (interruptedOutputs_keeps ops kept out) bounded).1
    · obtain ⟨decided, decision, ran⟩ := ok_bind ran
      obtain ⟨kept, steady⟩ := catchDecided_keeps search holds settled decision
      cases ran
      obtain ⟨fired, same⟩ := boundaryFire_keeps ops boundary occurrence.occurrence parent [] kept bounded
      exact throwerLeaves_keeps ops fired (thrown.steady (same.trans steady.occurrences))

theorem searchScopes_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin} :
    ∀ fuel current (state after : State), inv state → HostSettled origin state → Thrown ctx.program origin state →
      Feature.Propagation.searchScopes hooks ctx raised origin state fuel current = .ok after → inv after
  | 0, _, _, _, holds, settled, thrown, ran => exhausted_keeps ops search holds settled thrown (by
      simpa [Feature.Propagation.searchScopes] using ran)
  | _ + 1, none, _, _, holds, settled, thrown, ran => exhausted_keeps ops search holds settled thrown (by
      simpa [Feature.Propagation.searchScopes] using ran)
  | fuel + 1, some current, state, after, holds, settled, thrown, ran => by
    unfold Feature.Propagation.searchScopes at ran
    split at ran
    · simp at ran
    · rename_i occurrence found
      have present := List.mem_of_find?_eq_some found
      dsimp only at ran
      split at ran
      · exact exhausted_keeps ops search holds settled thrown ran
      · obtain ⟨handlers, _, ran⟩ := ok_bind ran
        obtain ⟨passed, pass, ran⟩ := ok_bind ran
        obtain ⟨kept, steady⟩ := passCallOutputs_keeps search holds pass
        split at ran
        · rename_i element start interrupting writes _
          have dropped : inv (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed) ∧
              Steady passed (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed) := by
            split
            · exact search.dropRuns _ _ kept
            · exact ⟨kept, .refl _⟩
          obtain ⟨decided, decision, ran⟩ := ok_bind ran
          obtain ⟨decidedKept, decidedSteady⟩ :=
            catchDecided_keeps search dropped.1 (settled.steady (steady.trans dropped.2)) decision
          cases ran
          have chain := (steady.trans dropped.2).trans decidedSteady
          have begun := ops.begin _ element occurrence.id decidedKept ⟨occurrence, chain.scopes ▸ present, rfl⟩
          split
          · exact begun
          · exact throwerLeaves_keeps ops begun (thrown.steady ((ops.signalOccurrences _ _).trans chain.occurrences))
        · have inside := best?_mem ‹Feature.Propagation.best? _ _ _ _ = some _›
          refine leaveOccurrence_keeps ops search kept (settled.steady steady) (thrown.steady steady.occurrences)
            (steady.scopes ▸ present) ?_ ran
          split at inside
          · split at inside
            · simp at inside
            · exact boundariesOf_boundaryOf inside
          · simp at inside
        · exact searchScopes_keeps ops search fuel _ _ _ kept (settled.steady steady) (thrown.steady steady.occurrences)
            ran

/-- `Hooks.raise` keeps `inv` for a raise whose host is settled and whose origin, an Event's, names begun occurrences. -/
theorem raise_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {state after : State} (holds : inv state) (settled : HostSettled origin state) (thrown : Thrown ctx.program origin state)
    (ran : Feature.Propagation.raise hooks ctx raised origin state = .ok after) : inv after := by
  unfold Feature.Propagation.raise at ran
  dsimp only at ran
  split at ran
  · obtain ⟨left, leaves, made⟩ := ok_map ran
    subst made
    have inside := best?_mem ‹Feature.Propagation.best? _ _ _ _ = some _›
    refine (boundaryFire_keeps ops _ _ _ _ (search.mappedErrorOutputs _ _ _ _ holds settled leaves).1 ?_).1
    split at inside
    · simp at inside
    · exact boundariesOf_boundaryOf inside
  · exact searchScopes_keeps ops search _ _ _ _ holds settled thrown ran

/-! ## Cancellation

The cancellation lane's (P3) share: what a Terminate End's arrival does, from which
`Kernel.Proofs.Cancellation.Registered` proves `Laws.Scopes.TerminateClears` of the registered hooks. -/

/-- A Terminate End's arrival clears its scope occurrence, keeping its own occurrence, and then completes it on no
flow. -/
theorem arriveThrow_terminate (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence)
    (state : State) : Feature.Propagation.arriveThrow ctx header payload .terminate occurrence state =
      .ok ((state.clearInside occurrence.scope [occurrence.id]).signal
        (.complete occurrence.id (.flows []) [] .outward)) := by
  unfold Feature.Propagation.arriveThrow
  rfl

end Kernel.Laws.Propagation
