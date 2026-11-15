module

public import Kernel.Hooks
public import Kernel.Laws.State.Frames
public import Kernel.Laws.IL

/-! # Laws of propagation: the rules

The rules of the [propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#finding-the-catcher),
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
them to the program. Each law has its non-vacuity witness in `Kernel.Laws.Propagation.Witnesses`. Beside the laws, this
module holds the vocabulary `Kernel.Laws.Propagation` states the feature's hooks in, which reads no feature body either,
so that the rules, the witnesses and that vocabulary stay outside `Kernel.Feature.Propagation`'s rebuild cone
(guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Propagation

open Kernel
open Kernel.Laws.State (Steady BegunFrom RaisesFrom RollsBack)

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

/-! ## The vocabulary of the state-invariant lane

What `Kernel.Laws.Propagation` states Propagation's throws and raises over (P2): the two facts of the state a raise
reads (`HostSettled`, `Thrown`), kept by the search steps that move nothing it reads (`Laws.State.Steady`), and
the state operations a throw or raise applies (`PropagationOps`). -/

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

/-- What Propagation's throws and raises need of the state operations they apply, for an invariant `inv`. -/
structure PropagationOps (program : Program) (inv : State → Prop) : Prop where
  /-- The completion of a begun occurrence that stands. -/
  complete : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → inv (state.signal (.complete occurrence.id leave writes rule))
  /-- A raise from a begun occurrence that stands, at its element, scope occurrence and activation, which a begin from a
  state that kept `inv` began. -/
  raise : ∀ state raised occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    RaisesFrom inv occurrence state → inv (state.signal (.raise raised
      { element := occurrence.element, scope := occurrence.scope, activation := occurrence.activation }))
  /-- An item's firing. -/
  fire : ∀ state item fired, inv state → inv (state.signal (.fire item fired))
  /-- A Signal throw's broadcast intent. -/
  outbox : ∀ state outbox, inv state → inv { state with outbox }
  /-- The compensation a begun occurrence's throw queues, which completes it once it ends; the occurrence was begun from
  a state that kept `inv`, and is the trigger. -/
  compensate : ∀ state occurrence scope activity trigger leave, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → BegunFrom inv state occurrence →
    trigger = { processInstanceId := state.instanceOf occurrence.scope, element := occurrence.element,
                activation := occurrence.activation } →
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
  the boundary once it ends and the trigger of the Cancel raise it was taken off. -/
  rollBack : ∀ state scope trigger leave element parent flows, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    Laws.IL.BoundaryOf program element → RollsBack inv trigger state →
    inv ((state.clearInside scope).signal (.compensate scope none trigger leave (some (.occur element parent flows))))

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
end Kernel.Laws.Propagation
