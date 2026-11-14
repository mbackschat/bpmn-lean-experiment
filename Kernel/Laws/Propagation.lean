module

public import Kernel.Hooks
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

/-! ## The state invariant under Propagation's throws

Propagation's share of the proof wave's state-invariant lane (P2) for `Hooks.arriveThrow`, stated over
`PropagationOps`, generic in `inv`; `Kernel.Proofs.Step` fills `PropagationOps` for `Laws.State.WellFormed`. A throw
completes its own begun occurrence, raises from it, fires the receivers of a Signal, opens a Message throw's effect
item or queues the compensation that completes it; a Terminate End first clears its scope occurrence, keeping itself. -/

/-- What Propagation's throws need of the state operations they apply, for an invariant `inv`. -/
structure PropagationOps (program : Program) (inv : State → Prop) : Prop where
  /-- The completion of a begun occurrence that stands. -/
  complete : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → inv (state.signal (.complete occurrence.id leave writes rule))
  /-- A raised event. -/
  raise : ∀ state raised origin, inv state → inv (state.signal (.raise raised origin))
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
  /-- An item for a begun occurrence of an element the program declares no start Event. -/
  openItem : ∀ state kind occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    (program.element? occurrence.element).bind (·.start?) = none → inv (state.openItem kind occurrence)
  /-- A queued signal keeps the occurrences. -/
  signalOccurrences : ∀ (state : State) signal, (state.signal signal).occurrences = state.occurrences

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

/-- `Hooks.arriveThrow` keeps `inv`. -/
theorem arriveThrow_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv) {header : Header}
    {payload : EventPayload} {thrown : Throw} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (ctx.program.element? occurrence.element).bind (·.start?) = none)
    (ran : Feature.Propagation.arriveThrow ctx header payload thrown occurrence state = .ok after) : inv after := by
  have complete := ops.complete state occurrence (Feature.Propagation.throwLeave payload) [] .outward holds member begun
  unfold Feature.Propagation.arriveThrow at ran
  cases thrown with
  | none => cases ran; exact complete
  | terminate =>
    cases ran
    obtain ⟨cleared, stays⟩ := ops.terminate state occurrence holds member begun
    exact ops.complete _ _ _ _ _ cleared stays begun
  | error record => cases ran; exact ops.raise _ _ _ complete
  | escalation record => cases ran; exact ops.raise _ _ _ holds
  | message record =>
    cases ran
    unfold Feature.Propagation.throwMessage
    split
    · exact complete
    · exact ops.openItem _ _ _ holds member begun unstarted
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
  | cancel => cases ran; exact ops.raise _ _ _ complete

end Kernel.Laws.Propagation
