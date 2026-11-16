module

public import Kernel.Step
public import Kernel.Laws.State.Frames
public import Kernel.Laws.IL
public import Kernel.Laws.Flow.Sources

/-! # Laws of the step function: the preservation contract

What `Step.step` needs of the hooks and of the state operations it applies for an invariant of the state to pass through
it: one obligation per field of `Hooks` (`HookContract`) and one per phase `Step` runs itself (`Phases`), each from
what `Step` establishes before it runs them, and what the state operations do to the fields `Step` and the hooks read,
whatever the invariant (`StateFacts`). `Kernel.Laws.Step.Keeps` composes them.

A feature proves the field of each hook it fills generically in the invariant, without importing `Laws.State` or this
module: its `Laws` module states, in `Kernel.State`'s vocabulary, an operations record of what its hooks' bodies need of
the state operations they apply (that each keeps the invariant under the conditions the hook establishes, and the
invariant-free facts it reads), and proves one lemma per hook from it. `Kernel.Proofs.Step` fills each feature's record
from `Operations` and `StateFacts` and assembles the registered hooks' contract; `Laws.State` proves `Operations` and
`Phases` of `Laws.State.WellFormed` and `StateFacts`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- The scope occurrence `scope` stands in `state`. -/
def ScopeStands (state : State) (scope : ScopeOccurrenceId) : Prop := ∃ entry ∈ state.scopes, entry.id = scope

/-- The occurrence `id` stands in `state`. -/
def OccurrenceStands (state : State) (id : Nat) : Prop := ∃ occurrence ∈ state.occurrences, occurrence.id = id

/-- A begin request `Step` may begin in `state`: the reservations it names are distinct, each beginnable in the
request's scope occurrence and claimed by nothing queued or slotted (`Laws.State.ReservationsClaimed`), and its Event
Sub-Process start reservation lies in that scope occurrence. A request an arrival or a start makes names none. -/
def Admitted (state : State) (request : BeginRequest) : Prop :=
  (Laws.State.names request).Nodup ∧ (∀ id ∈ Laws.State.names request,
    Laws.State.Beginnable state request.scope id ∧ Laws.State.Unclaimed state id) ∧
    Laws.State.InnerPlaced state request

/-! ## Queued begins

What `Step` reads of the begin requests its queues hold, the ones an invariant over the queued begins sees: the requests
of the `begin` signals and of the deferred begins, each in queue order. -/

/-- The requests of the `begin` signals of `signals`, in queue order. -/
def beginsOf (signals : List Signal) : List BeginRequest :=
  signals.filterMap fun
    | .begin request => some request
    | .arm _ _ _ | .armScope _ | .armGateway _ _ _ | .raise _ _ | .complete _ _ _ _ | .write _ _ _ | .remove _ _
    | .occur _ _ _ _ _ | .cancel _ | .fire _ _ | .endInstance _ _ | .compensate _ _ _ _ _
    | .compensationFailed _ _ _ _ => none

/-- The requests of the deferred begins of `tokens`, in stack order. -/
def deferredOf (tokens : List Token) : List BeginRequest :=
  tokens.filterMap fun
    | .begin request => some request
    | .flow _ _ => none

/-- A request's `begin` signal is queued exactly when the request is among the queued begins. -/
theorem mem_beginsOf {signals : List Signal} {request : BeginRequest} :
    request ∈ beginsOf signals ↔ Signal.begin request ∈ signals := by
  simp only [beginsOf, List.mem_filterMap]
  constructor
  · rintro ⟨signal, member, made⟩
    cases signal <;> simp_all
  · exact fun member => ⟨_, member, rfl⟩

/-- A request's deferred begin is on the stack exactly when the request is among the deferred begins. -/
theorem mem_deferredOf {tokens : List Token} {request : BeginRequest} :
    request ∈ deferredOf tokens ↔ Token.begin request ∈ tokens := by
  simp only [deferredOf, List.mem_filterMap]
  constructor
  · rintro ⟨token, member, made⟩
    cases token <;> simp_all
  · exact fun member => ⟨_, member, rfl⟩

/-- A sublist of `filterMap f` is the image of a sublist, for `f` inverse to `g`. -/
theorem sublist_filterMap_map {α β : Type} {f : α → Option β} {g : β → α} (inverse : ∀ a b, f a = some b ↔ a = g b) :
    ∀ {l : List α} {l₁ : List β}, (l₁.map g).Sublist l ↔ l₁.Sublist (l.filterMap f)
  | [], l₁ => by cases l₁ <;> simp
  | a :: l, l₁ => by
    have rest := @sublist_filterMap_map α β f g inverse l
    rw [List.filterMap_cons]
    cases found : f a with
    | none =>
      rw [← rest]
      refine ⟨fun sub => ?_, fun sub => sub.cons a⟩
      rcases List.sublist_cons_iff.mp sub with tail | ⟨r, same, _⟩
      · exact tail
      · cases l₁ with
        | nil => simp at same
        | cons b _ =>
          simp only [List.map_cons, List.cons.injEq] at same
          rw [(inverse a b).mpr same.1.symm] at found
          cases found
    | some b =>
      obtain rfl := (inverse a b).mp found
      cases l₁ with
      | nil => simp
      | cons c cs =>
        have injective : g c = g b → c = b := fun same => by
          have := (inverse (g c) c).mpr rfl
          rw [same, (inverse (g b) b).mpr rfl] at this
          exact (Option.some.inj this).symm
        simp only [List.map_cons, List.sublist_cons_iff, List.cons.injEq]
        rw [← List.map_cons, rest]
        constructor
        · rintro (tail | ⟨r, ⟨same, rfl⟩, tail⟩)
          · exact .inl tail
          · exact .inr ⟨cs, ⟨injective same, rfl⟩, rest.mp tail⟩
        · rintro (tail | ⟨r, ⟨rfl, rfl⟩, tail⟩)
          · exact .inl tail
          · exact .inr ⟨_, ⟨rfl, rfl⟩, rest.mpr tail⟩

/-- Begin signals lie in queue order exactly as their requests lie among the queued begins. -/
theorem sublist_beginsOf {signals : List Signal} {requests : List BeginRequest} :
    (requests.map Signal.begin).Sublist signals ↔ requests.Sublist (beginsOf signals) :=
  sublist_filterMap_map fun signal request => by cases signal <;> simp

/-- Deferred begins lie in stack order exactly as their requests lie among the deferred begins. -/
theorem sublist_deferredOf {tokens : List Token} {requests : List BeginRequest} :
    (requests.map Token.begin).Sublist tokens ↔ requests.Sublist (deferredOf tokens) :=
  sublist_filterMap_map fun token request => by cases token <;> simp

/-- A `begin` signal precedes another exactly when its request precedes the other's among the queued begins. -/
theorem precedes_beginsOf {signals : List Signal} {first second : BeginRequest} :
    Laws.State.Precedes signals (.begin first) (.begin second) ↔ Laws.State.Precedes (beginsOf signals) first second :=
  sublist_beginsOf (requests := [first, second])

/-- A deferred begin precedes another exactly when its request precedes the other's among the deferred begins. -/
theorem precedes_deferredOf {tokens : List Token} {first second : BeginRequest} :
    Laws.State.Precedes tokens (.begin first) (.begin second) ↔ Laws.State.Precedes (deferredOf tokens) first second :=
  sublist_deferredOf (requests := [first, second])

/-- Queuing signals adds the requests of their begins to the queued begins. -/
theorem beginsOf_append (signals more : List Signal) : beginsOf (signals ++ more) = beginsOf signals ++ beginsOf more :=
  List.filterMap_append

/-- Deferring tokens adds their requests to the deferred begins. -/
theorem deferredOf_append (tokens more : List Token) :
    deferredOf (tokens ++ more) = deferredOf tokens ++ deferredOf more :=
  List.filterMap_append

/-- Flow tokens defer no begin. -/
theorem deferredOf_flows (flows : List FlowId) (scope : ScopeOccurrenceId) :
    deferredOf (flows.map (Token.flow · scope)) = [] := by
  simp [deferredOf, List.filterMap_map]

/-! ## Queued reservations

What the closure reads of the reservations its queue still makes: the elements of the `occur` signals and of the
compensations that resume by one, each in queue order, which with the compensation runs' resumes are the reservations
`OccurPending` calls pending. -/

/-- A reservation of `element` still to be made: a queued `Signal.occur`, or the resume of a queued compensation or of a
compensation run that ends by reserving it (`Compensation.advance`). -/
def OccurPending (s : State) (element : ElementId) : Prop :=
  (∃ scope leave writes rule, Signal.occur element scope leave writes rule ∈ s.signals) ∨
    (∃ scope activity trigger leave at_ resumed,
      Signal.compensate scope activity trigger leave (some (.occur element at_ resumed)) ∈ s.signals) ∨
    ∃ run ∈ s.slots.compensation.runs, ∃ at_ leave, run.resume = some (.occur element at_ leave)

/-- `element` is a reservation still to be made in a state that keeps `rel`: where a queued `Signal.occur`, a queued
compensation's resume or a held compensation run's resume came from once the closure has taken it. -/
def PendingIn (rel : State → Prop) (element : ElementId) : Prop :=
  ∃ held, rel held ∧ OccurPending held element

/-- The elements the queued `occur` signals and the queued compensations that resume by one reserve, in queue order. -/
def occursOf (signals : List Signal) : List ElementId :=
  signals.filterMap fun
    | .occur element _ _ _ _ => some element
    | .compensate _ _ _ _ (some (.occur element _ _)) => some element
    | .compensate _ _ _ _ (some (.complete _ _)) | .compensate _ _ _ _ (some (.group _ _)) | .compensate _ _ _ _ none
    | .arm _ _ _ | .armScope _ | .armGateway _ _ _ | .raise _ _ | .begin _ | .complete _ _ _ _ | .write _ _ _
    | .remove _ _ | .cancel _ | .fire _ _ | .endInstance _ _ | .compensationFailed _ _ _ _ => none

/-- An element is among the queued reservations exactly when an `occur` signal or a compensation that resumes by
one reserves it. -/
theorem mem_occursOf {signals : List Signal} {element : ElementId} :
    element ∈ occursOf signals ↔ (∃ scope leave writes rule, Signal.occur element scope leave writes rule ∈ signals) ∨
      ∃ scope activity trigger leave at_ resumed,
        Signal.compensate scope activity trigger leave (some (.occur element at_ resumed)) ∈ signals := by
  simp only [occursOf, List.mem_filterMap]
  constructor
  · rintro ⟨signal, member, made⟩
    cases signal with
    | occur => cases made; exact .inl ⟨_, _, _, _, member⟩
    | compensate scope activity trigger leave resume =>
      rcases resume with _ | ⟨_, _⟩ | ⟨_, _, _⟩ | ⟨_, _⟩
      all_goals first | cases made | skip
      exact .inr ⟨_, _, _, _, _, _, member⟩
    | _ => cases made
  · rintro (queued | resumed)
    · obtain ⟨_, _, _, rest⟩ := queued
      obtain ⟨_, member⟩ := rest
      exact ⟨_, member, rfl⟩
    · obtain ⟨_, _, _, rest⟩ := resumed
      obtain ⟨_, _, _, member⟩ := rest
      exact ⟨_, member, rfl⟩

/-- Queuing signals adds the reservations they make to the queued ones. -/
theorem occursOf_append (signals more : List Signal) : occursOf (signals ++ more) = occursOf signals ++ occursOf more :=
  List.filterMap_append

/-- A reservation pending in `t` is pending in `s` when `t`'s queued reservations and compensation runs are among
`s`'s. -/
theorem occurPending_of {s t : State} (occurs : ∀ element ∈ occursOf t.signals, element ∈ occursOf s.signals)
    (runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs) {element : ElementId}
    (pending : OccurPending t element) : OccurPending s element := by
  rcases pending with queued | resumed | ⟨run, member, rest⟩
  · exact (mem_occursOf.mp (occurs _ (mem_occursOf.mpr (.inl queued)))).elim .inl (.inr ∘ .inl)
  · exact (mem_occursOf.mp (occurs _ (mem_occursOf.mpr (.inr resumed)))).elim .inl (.inr ∘ .inl)
  · exact .inr (.inr ⟨run, runs run member, rest⟩)

/-- A queued signal that places work: an arming, which reserves its element's boundaries or its gateway's arms in its
scope occurrence, a `Signal.occur`, which reserves its element there, a raise, whose catch reads its origin there, and
a completion by named flows, whose tokens it queues there. An invariant over where queued work lies reads them. -/
def placing : Signal → Bool
  | .arm _ _ _ | .armGateway _ _ _ | .occur _ _ _ _ _ | .raise _ _ => true
  | .complete _ (.flows selected) _ _ => !selected.isEmpty
  | .complete _ .outgoing _ _ | .complete _ .raised _ _ | .armScope _ | .begin _ | .write _ _ _
  | .remove _ _ | .cancel _ | .fire _ _ | .endInstance _ _ | .compensate _ _ _ _ _ | .compensationFailed _ _ _ _ => false

/-- A completion by no named flow places nothing. -/
theorem placing_complete {occurrence : Nat} {leave : Leave} {writes : List (String × Value)} {rule : WriteRule}
    (unnamed : ∀ selected, leave = .flows selected → selected = []) :
    placing (.complete occurrence leave writes rule) = false := by
  cases leave with
  | flows selected => rw [unnamed selected rfl]; rfl
  | outgoing | raised => rfl

/-- A completion by named flows places work. -/
theorem placing_named {occurrence : Nat} {selected : List FlowId} {writes : List (String × Value)} {rule : WriteRule}
    (named : selected ≠ []) : placing (.complete occurrence (.flows selected) writes rule) = true := by
  simpa [placing] using named

/-- The flow tokens of `tokens`, each with its scope occurrence, in stack order. -/
def flowsOf (tokens : List Token) : List (FlowId × ScopeOccurrenceId) :=
  tokens.filterMap fun
    | .flow flow scope => some (flow, scope)
    | .begin _ => none

/-- A flow token is on the stack exactly when its flow and scope occurrence are among `flowsOf`. -/
theorem mem_flowsOf {tokens : List Token} {flow : FlowId} {scope : ScopeOccurrenceId} :
    (flow, scope) ∈ flowsOf tokens ↔ Token.flow flow scope ∈ tokens := by
  simp only [flowsOf, List.mem_filterMap]
  constructor
  · rintro ⟨token, member, made⟩
    cases token with
    | flow => cases made; exact member
    | begin => cases made
  · exact fun member => ⟨_, member, rfl⟩

/-- Stacking tokens adds the flow tokens among them. -/
theorem flowsOf_append (tokens more : List Token) : flowsOf (tokens ++ more) = flowsOf tokens ++ flowsOf more :=
  List.filterMap_append

/-! ## Queued triggers

What the closure reads of the compensation triggers its queue carries: a queued compensation's trigger, and a queued
Cancel raise's origin, whose thrower the compensation its catch queues takes as trigger
(`Feature.Propagation.leaveOccurrence`). An invariant that keeps the keys of compensation runs apart reads them. -/

/-- The triggers of the queued compensations of `signals` and the origins of its queued Cancel raises, in queue order;
a raise is read by `Raised.isCancel`, its owner's query. -/
def triggersOf (signals : List Signal) : List (OccurrenceRef ⊕ Origin) :=
  signals.filterMap fun
    | .compensate _ _ trigger _ _ => some (.inl trigger)
    | .raise event origin => if event.isCancel then some (.inr origin) else none
    | .arm _ _ _ | .armScope _ | .armGateway _ _ _ | .begin _ | .complete _ _ _ _ | .write _ _ _ | .remove _ _
    | .occur _ _ _ _ _ | .cancel _ | .fire _ _ | .endInstance _ _ | .compensationFailed _ _ _ _ => none

/-- An empty queue carries no trigger. -/
theorem triggersOf_nil : triggersOf [] = [] := rfl

/-- Queuing signals adds the triggers they carry to the queued ones. -/
theorem triggersOf_append (signals more : List Signal) :
    triggersOf (signals ++ more) = triggersOf signals ++ triggersOf more :=
  List.filterMap_append

/-- A queued compensation carries its trigger. -/
theorem triggersOf_compensate (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef)
    (leave : Option Nat) (resume : Option Resume) :
    triggersOf [.compensate scope activity trigger leave resume] = [.inl trigger] := rfl

/-- A queued Cancel raise carries its origin, and any other raise nothing. -/
theorem triggersOf_raise (event : Raised) (origin : Origin) :
    triggersOf [.raise event origin] = if event.isCancel then [.inr origin] else [] := by
  cases cancels : event.isCancel <;> simp [triggersOf, cancels]

/-- The resumes of the queued compensations of `signals`, in queue order: what an invariant that reads how a queued
compensation ends reads, which `triggersOf` drops. -/
def resumesOf (signals : List Signal) : List (Option Resume) :=
  signals.filterMap fun
    | .compensate _ _ _ _ resume => some resume
    | .raise _ _ | .arm _ _ _ | .armScope _ | .armGateway _ _ _ | .begin _ | .complete _ _ _ _ | .write _ _ _
    | .remove _ _ | .occur _ _ _ _ _ | .cancel _ | .fire _ _ | .endInstance _ _ | .compensationFailed _ _ _ _ => none

/-- Queuing signals adds the resumes they carry to the queued ones. -/
theorem resumesOf_append (signals more : List Signal) :
    resumesOf (signals ++ more) = resumesOf signals ++ resumesOf more :=
  List.filterMap_append

/-- A sublist of a queue carries a sublist of its triggers. -/
theorem triggersOf_sublist {signals more : List Signal} (fewer : signals.Sublist more) :
    (triggersOf signals).Sublist (triggersOf more) :=
  fewer.filterMap _

/-- A sublist of a queue carries a sublist of its resumes. -/
theorem resumesOf_sublist {signals more : List Signal} (fewer : signals.Sublist more) :
    (resumesOf signals).Sublist (resumesOf more) :=
  fewer.filterMap _

/-- A resume is queued exactly when a queued compensation carries it. -/
theorem mem_resumesOf {signals : List Signal} {resume : Option Resume} :
    resume ∈ resumesOf signals ↔
      ∃ scope activity trigger leave, Signal.compensate scope activity trigger leave resume ∈ signals := by
  unfold resumesOf
  constructor
  · intro member
    obtain ⟨signal, inside, carried⟩ := List.mem_filterMap.mp member
    cases signal with
    | compensate scope activity trigger leave carriedResume =>
      cases carried
      exact ⟨scope, activity, trigger, leave, inside⟩
    | raise | arm | armScope | armGateway | begin | complete | write | remove | occur | cancel | fire | endInstance
    | compensationFailed => cases carried
  · intro queued
    obtain ⟨scope, activity, trigger, rest⟩ := queued
    obtain ⟨leave, inside⟩ := rest
    exact List.mem_filterMap.mpr ⟨_, inside, rfl⟩

/-- Signals that carry no trigger (`Laws.State.Untriggered`) carry no resume. -/
theorem resumesOf_untriggered {signals : List Signal} (quiet : ∀ signal ∈ signals, Laws.State.Untriggered signal) :
    resumesOf signals = [] := by
  refine List.filterMap_eq_nil_iff.mpr fun signal inside => ?_
  cases signal with
  | compensate scope activity trigger leave resume => exact absurd rfl ((quiet _ inside).1 scope activity trigger leave resume)
  | raise | arm | armScope | armGateway | begin | complete | write | remove | occur | cancel | fire | endInstance
  | compensationFailed => rfl

/-- Signals that carry no trigger (`Laws.State.Untriggered`) queue none. -/
theorem triggersOf_untriggered {signals : List Signal} (quiet : ∀ signal ∈ signals, Laws.State.Untriggered signal) :
    triggersOf signals = [] := by
  refine List.filterMap_eq_nil_iff.mpr fun signal inside => ?_
  obtain ⟨uncompensated, uncancelled⟩ := quiet signal inside
  cases signal with
  | compensate scope activity trigger leave resume => exact absurd rfl (uncompensated scope activity trigger leave resume)
  | raise event origin => simp [uncancelled event origin rfl]
  | arm | armScope | armGateway | begin | complete | write | remove | occur | cancel | fire | endInstance
  | compensationFailed => rfl

/-- The signals a compensation run's begin and end queue, and an instance's end, carry no trigger: a handler's begin,
a cancellation, a completion and an occurrence. -/
theorem untriggered_begin (request : BeginRequest) : Laws.State.Untriggered (.begin request) :=
  ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_cancel (occurrence : Nat) : Laws.State.Untriggered (.cancel occurrence) :=
  ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_complete (occurrence : Nat) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.Untriggered (.complete occurrence leave writes rule) := ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_occur (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave)
    (writes : List (String × Value)) (rule : WriteRule) : Laws.State.Untriggered (.occur element scope leave writes rule) :=
  ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_endInstance (status : InstanceStatus) (failure : Option InstanceFailure) :
    Laws.State.Untriggered (.endInstance status failure) := ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

/-- An Event carries its element's header and no envelope. -/
theorem event?_bare {element : Element} {header : Header} {payload : EventPayload}
    (typed : element.event? = some (header, payload)) : element.header = header ∧ element.envelope? = none := by
  cases element <;> simp_all [Laws.IL.event?_event, Laws.IL.header_event, Laws.IL.envelope?_event,
    Laws.IL.event?_activity, Laws.IL.event?_scope, Laws.IL.event?_gateway, Laws.IL.event?_start]

/-- A start carries its element's header and no envelope. -/
theorem start?_bare {element : Element} {header : Header} {payload : StartPayload}
    (typed : element.start? = some (header, payload)) : element.header = header ∧ element.envelope? = none := by
  cases element <;> simp_all [Laws.IL.start?_start, Laws.IL.header_start, Laws.IL.envelope?_start,
    Laws.IL.start?_activity, Laws.IL.start?_event, Laws.IL.start?_scope, Laws.IL.start?_gateway]

/-- An occurrence that continues by its flows is no Multi-Instance instance. -/
theorem flow_ne_multiInstance (body : Nat) : Continuation.flow ≠ .multiInstance body := nofun

/-- A compensation handler is no Multi-Instance instance. -/
theorem compensation_ne_multiInstance (run : ScopeOccurrenceId) (body : Nat) :
    Continuation.compensation run ≠ .multiInstance body := nofun

/-- An instance continues into one body. -/
theorem multiInstance_inj {body other : Nat} (same : Continuation.multiInstance body = .multiInstance other) :
    body = other := by
  injection same

/-- With no signal queued, the closure took `token` off `queue`'s work stack, leaving `popped`: the oldest under
`orderInvariant` and the newest otherwise (`Step.nextToken`). -/
def TokenTaken (program : Program) (queue : State) (token : Token) (popped : State) : Prop :=
  queue.signals = [] ∧ ∃ rest, ((program.options.branchSchedule = .orderInvariant ∧ queue.tokens = token :: rest) ∨
    queue.tokens = rest ++ [token]) ∧ popped = { queue with tokens := rest }

/-- The closure took the queued begin `request` off `queue`, leaving `popped`: the head `begin` signal, or the deferred
begin it took off the work stack (`TokenTaken`). -/
def Dequeued (program : Program) (queue : State) (request : BeginRequest) (popped : State) : Prop :=
  (∃ rest, queue.signals = .begin request :: rest ∧ popped = { queue with signals := rest }) ∨
    TokenTaken program queue (.begin request) popped

/-- Where a fresh begin's request comes from: the arrival of a flow token the closure took off a queue that keeps `inv`,
which begins the element the token's flow ends at in the token's scope occurrence, arriving by that flow
(`Step.arrive`), or a start input's begin, in the process root and by no flow, of a root-process start Event
(`Program.children none`, `HookContract.startsFired`). An invariant that places what a token or a start begins, and the
flow it arrived by, reads it (`Proofs.Former.foreign_incoming_rejected`). -/
def FreshSource (inv : Program → State → Prop) (program : Program) (state : State) (request : BeginRequest) : Prop :=
  (∃ queue flow, inv program queue ∧ (program.target? flow = some request.element ∧ request.incoming = some flow) ∧
    TokenTaken program queue (.flow flow request.scope) state) ∨
  (request.scope = State.root ∧ request.incoming = none ∧
    ∃ element ∈ program.children none, element.header.id = request.element)

/-- Where a begin `Step` runs comes from: a fresh request that continues by its flows and names no reservation, made by
an arrival or a start (`FreshSource`), or a queued begin the closure took off a state that keeps `inv`, which an
invariant over the queued begins reads to place the begun occurrence among them. -/
def BeginOrigin (inv : Program → State → Prop) (program : Program) (state : State) (request : BeginRequest) : Prop :=
  (request.continuation = .flow ∧ request.reserved = none ∧ FreshSource inv program state request) ∨
    ∃ queue, inv program queue ∧ Dequeued program queue request state

/-- An origin from states that keep `inv` is one from states that keep what `inv` implies of the same program. -/
theorem BeginOrigin.mono {inv weaker : Program → State → Prop} {program : Program}
    (implies : ∀ s, inv program s → weaker program s) {state : State} {request : BeginRequest}
    (origin : BeginOrigin inv program state request) : BeginOrigin weaker program state request := by
  rcases origin with ⟨flows, fresh, (⟨queue, flow, held, target, taken⟩ | started)⟩ | ⟨queue, held, dequeued⟩
  · exact .inl ⟨flows, fresh, .inl ⟨queue, flow, implies _ held, target, taken⟩⟩
  · exact .inl ⟨flows, fresh, .inr started⟩
  · exact .inr ⟨queue, implies _ held, dequeued⟩

/-- What the completion pipeline needs of each phase it runs between closing the completing occurrence's own items and
removing its record (`Step.complete`): the scope occurrences and the begun occurrences stay, and no open item is added,
so the record goes with nothing left waiting for it or hanging on it. -/
structure PipelineFrame (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  begun : ∀ occurrence ∈ before.occurrences, occurrence.begun = true → occurrence ∈ after.occurrences
  items : ∀ item ∈ after.openItems, item ∈ before.openItems
  instances : ∀ entry ∈ after.slots.instances, entry ∈ before.slots.instances

/-- What each hook must keep of `inv`, given what `Step` establishes before it calls the hook: the occurrence it hands
over stands (a begun occurrence, an idle scope occurrence's owner, a parked join's latest occurrence, the completing
occurrence), and an arrival's is begun, as `Step.begin` hands it over and as a parked join's offer finds it, and an
activity's, catch's or throw's is of an element the program declares no start Event of (`Step.dispatch` sends those to
`Hooks.arriveStart`) and numbered under its element's counter (it sends a Multi-Instance body to
`Hooks.arriveMultiInstance`, with the header naming the body's element and the loop its envelope carries), a throw's
header naming its element (`Program.element?` finds it by that name); the item it hands over is open; the scope occurrence and occurrence a queued signal names stand (`Step.stale`, `Step.gone`), an arming's
host is begun in the scope occurrence the arming names, a compensation may end as it asks (`Laws.State.Resumable`)
and the reservation it resumes by was pending in a state that kept `inv` (`PendingIn`),
and a raise finds what its origin names and a settled host (`Laws.State.Raisable`); a throw's occurrence was begun from
a state that kept `inv`, and a raise or compensation was taken off a queue that kept it (`Laws.State.BegunFrom`,
`Laws.State.Popped`), which an invariant over the queued triggers reads (`triggersOf`); a completed occurrence's continuation runs while its scope occurrence stands;
an Event Sub-Process's start Event reservation (`ScopeEntry.inner`) is beginnable in, and lies in, the scope occurrence
its occurrence began in, and nothing claims it. The completion pipeline's hooks also keep its frame (`PipelineFrame`),
and `Hooks.leave` leaves nothing hanging on the completing occurrence. `Hooks.delivered`, a query, picks an open item,
and `Hooks.startsFired`, another, root-process starts.
Each field keeps `inv` under the program of the hook's context, which is the program the step runs
(`Laws.Step.inputCtx_program`). An outflow's flows are read off states that kept `src`, the invariant of the state the
completion it continues ran on: `inv` but in `Laws.Step.complete_ends`, whose continuation runs under an exemption that
state does not have. Each feature's `Laws` module proves the fields of the hooks it fills. -/
structure HookContract (hooks : Hooks) (inv : Program → State → Prop) (src : Program → State → Prop := inv) : Prop where
  arriveStart : ∀ ctx header payload trigger occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    occurrence.begun = true → hooks.arriveStart ctx header payload trigger occurrence state = .ok after →
    inv ctx.program after
  /-- An Activity's occurrence owns no scope occurrence yet, since `Step.begin` has just begun it (`Phases.unowned`), and
  is of the Activity handed over, which `Step.dispatch` found as its element. -/
  arriveActivity : ∀ ctx header payload occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    occurrence.begun = true → (ctx.program.element? occurrence.element).bind (·.start?) = none →
    occurrence.role = .element → (∀ scope ∈ state.scopes, scope.occurrence ≠ some occurrence.id) →
    header.id = occurrence.element → (ctx.program.element? occurrence.element).bind (·.activity?) = some (header, payload) →
    hooks.arriveActivity ctx header payload occurrence state = .ok after → inv ctx.program after
  /-- A body occurrence arrives with the loop its element's envelope carries (`Step.bodyLoop?`), its start the newest the
  draft holds and no running body keyed by it, since `Step.begin` has just begun it (`Phases.newest`, `Phases.unrun`). -/
  arriveMultiInstance : ∀ ctx header envelope loop occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences → occurrence.begun = true → occurrence.role = .multiInstanceBody →
    header.id = occurrence.element →
    ((ctx.program.element? header.id).bind (·.envelope?)).bind (·.multiInstance) = some loop →
    state.draft.started.getLast?.map (·.occurrence) = some (Laws.State.key state occurrence) →
    (∀ run ∈ state.slots.multiInstances, run.occurrence ≠ occurrence.id) →
    hooks.arriveMultiInstance ctx header envelope loop occurrence state = .ok after → inv ctx.program after
  arriveScope : ∀ ctx header payload occurrence entry state after, inv ctx.program state →
    occurrence ∈ state.occurrences → occurrence.begun = true → header.id = occurrence.element →
    (∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧ Laws.State.Unclaimed state id ∧
      ∀ found ∈ state.occurrences, found.id = id → found.scope = occurrence.scope) →
    hooks.arriveScope ctx header payload occurrence entry state = .ok after → inv ctx.program after
  arriveGateway : ∀ ctx header payload occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    occurrence.begun = true → Laws.Flow.GatewayOf ctx.program state occurrence header payload →
    hooks.arriveGateway ctx header payload occurrence state = .ok after → inv ctx.program after
  arriveCatch : ∀ ctx header payload subscription occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    occurrence.begun = true → (ctx.program.element? occurrence.element).bind (·.start?) = none →
    occurrence.role = .element → hooks.arriveCatch ctx header payload subscription occurrence state = .ok after →
    inv ctx.program after
  /-- A throw's occurrence arrives as `Step.begin` has just begun it, from a state that kept `inv`. -/
  arriveThrow : ∀ ctx header payload thrown occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    (ctx.program.element? occurrence.element).bind (·.start?) = none → occurrence.role = .element →
    header.id = occurrence.element → Laws.State.BegunFrom (inv ctx.program) state occurrence →
    hooks.arriveThrow ctx header payload thrown occurrence state = .ok after → inv ctx.program after
  arriveLink : ∀ ctx header payload occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    occurrence.begun = true → (∃ element, ctx.program.element? occurrence.element = some element ∧
      element.header = header) →
    hooks.arriveLink ctx header payload occurrence state = .ok after → inv ctx.program after
  completeScope : ∀ ctx header payload scope occurrence state after, inv ctx.program state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    hooks.completeScope ctx header payload scope occurrence state = .ok after → inv ctx.program after
  completeCall : ∀ ctx header payload scope occurrence state after, inv ctx.program state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    hooks.completeCall ctx header payload scope occurrence state = .ok after → inv ctx.program after
  completeBody : ∀ ctx header envelope loop occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    hooks.completeBody ctx header envelope loop occurrence state = .ok after → inv ctx.program after
  /-- A task command, effect result, incident retry or Activity delivery addresses an item of an Activity, or one that
  waits for an effect or an incident, as `Step` finds it. -/
  completeUserTask : ∀ ctx header payload item values state after, inv ctx.program state → item ∈ state.openItems →
    (ctx.program.element? item.element).bind (·.activity?) = some (header, payload) → hooks.completeUserTask ctx header payload item values state = .ok after → inv ctx.program after
  effectResult : ∀ ctx item outcome state after, inv ctx.program state → item ∈ state.openItems →
    item.kind.view.effect.isSome = true → hooks.effectResult ctx item outcome state = .ok after → inv ctx.program after
  retryIncident : ∀ ctx item detail generation state after, inv ctx.program state → item ∈ state.openItems →
    item.kind.view.incident = some detail → hooks.retryIncident ctx item detail generation state = .ok after → inv ctx.program after
  cancelIncidentProcess : ∀ ctx detail generation state after, inv ctx.program state →
    hooks.cancelIncidentProcess ctx detail generation state = .ok after → inv ctx.program after
  triggerActivity : ∀ ctx header payload item fired state after, inv ctx.program state → item ∈ state.openItems →
    (ctx.program.element? item.element).bind (·.activity?) = some (header, payload) → hooks.triggerActivity ctx header payload item fired state = .ok after → inv ctx.program after
  trigger : ∀ ctx item fired state after, inv ctx.program state → item ∈ state.openItems →
    hooks.trigger ctx item fired state = .ok after → inv ctx.program after
  /-- An arming is taken off a queue that kept `inv`. -/
  arm : ∀ ctx host element scope state after, inv ctx.program state → OccurrenceStands state host →
    ScopeStands state scope →
    (∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope) →
    Laws.State.Popped (inv ctx.program) (.arm host element scope) state →
    hooks.arm ctx host element scope state = .ok after → inv ctx.program after
  armScope : ∀ ctx scope state after, inv ctx.program state → ScopeStands state scope →
    hooks.armScope ctx scope state = .ok after → inv ctx.program after
  /-- An Event-Based Gateway's arming is taken off a queue that kept `inv`. -/
  armGateway : ∀ ctx occurrence gateway scope state after, inv ctx.program state → OccurrenceStands state occurrence →
    ScopeStands state scope →
    (∀ found ∈ state.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope) →
    Laws.State.Popped (inv ctx.program) (.armGateway occurrence gateway scope) state →
    hooks.armGateway ctx occurrence gateway scope state = .ok after → inv ctx.program after
  /-- A raise finds what its origin names and a settled host, as the closure takes it off a queue that kept `inv`. -/
  raise : ∀ ctx event origin state after, inv ctx.program state → Laws.State.Raisable ctx.program state origin →
    (∀ host, origin.host = some host → Laws.State.Settled state host) →
    Laws.State.Popped (inv ctx.program) (.raise event origin) state → hooks.raise ctx event origin state = .ok after →
    inv ctx.program after
  /-- A compensation is taken off a queue that kept `inv`. -/
  compensate : ∀ ctx scope activity trigger leave resume state after, inv ctx.program state → ScopeStands state scope →
    (∀ next, resume = some next → Laws.State.Resumable state scope next) →
    (∀ element at_ resumed, resume = some (.occur element at_ resumed) →
      PendingIn (inv ctx.program) element) →
    Laws.State.Popped (inv ctx.program) (.compensate scope activity trigger leave resume) state →
    hooks.compensate ctx scope activity trigger leave resume state = .ok after → inv ctx.program after
  failCompensation : ∀ ctx handler code message origin state after, inv ctx.program state → ScopeStands state handler →
    hooks.failCompensation ctx handler code message origin state = .ok after → inv ctx.program after
  leave : ∀ ctx occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    hooks.leave ctx occurrence state = .ok after →
    inv ctx.program after ∧ PipelineFrame state after ∧ ∀ item ∈ after.openItems, item.attachedTo ≠ some occurrence.id
  writeOutputs : ∀ ctx scope writes rule state after, inv ctx.program state → ScopeStands state scope →
    hooks.writeOutputs ctx scope writes rule state = .ok after → inv ctx.program after ∧ PipelineFrame state after
  removeVariables : ∀ ctx scope names state after, inv ctx.program state → ScopeStands state scope →
    hooks.removeVariables ctx scope names state = .ok after → inv ctx.program after
  completed : ∀ ctx occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    hooks.completed ctx occurrence state = .ok after → inv ctx.program after ∧ PipelineFrame state after
  outflow : ∀ ctx occurrence leave state after, inv ctx.program state → ScopeStands state occurrence.scope →
    Laws.Flow.LeavesFrom (src ctx.program) ctx.program state occurrence leave →
    hooks.outflow ctx occurrence leave state = .ok after → inv ctx.program after
  instanceCompleted : ∀ ctx body occurrence writes state after, inv ctx.program state →
    ScopeStands state occurrence.scope →
    hooks.instanceCompleted ctx body occurrence writes state = .ok after → inv ctx.program after
  handlerCompleted : ∀ ctx run occurrence state after, inv ctx.program state → ScopeStands state occurrence.scope →
    hooks.handlerCompleted ctx run occurrence state = .ok after → inv ctx.program after
  handlerEnded : ∀ ctx run occurrence state after, inv ctx.program state → ScopeStands state occurrence.scope →
    hooks.handlerEnded ctx run occurrence state = .ok after → inv ctx.program after
  cancelled : ∀ ctx occurrence state after, inv ctx.program state →
    hooks.cancelled ctx occurrence state = .ok after → inv ctx.program after
  written : ∀ ctx writes state after, inv ctx.program state → hooks.written ctx writes state = .ok after →
    inv ctx.program after
  delivered : ∀ ctx data state item fired, hooks.delivered ctx data state = .ok (item, fired) → item ∈ state.openItems
  /-- `Hooks.select`, a query, keeps a completion's leave or picks flows the occurrence's element lists. -/
  select : ∀ ctx occurrence leave state chosen, hooks.select ctx occurrence leave state = .ok chosen →
    chosen = leave ∨ ∃ flows, chosen = .flows flows ∧ ∀ flow ∈ flows, Laws.Flow.Lists ctx.program occurrence.element flow
  /-- `Hooks.startsFired`, a query, returns root-process start Events only. -/
  startsFired : ∀ ctx input fired, hooks.startsFired ctx input = .ok fired →
    ∀ id ∈ fired, ∃ element ∈ ctx.program.children none, element.header.id = id

/-- What each phase `Step` runs itself must keep of `inv`, and what the closure reads of `inv`: the arming a queued
signal asks for names issued identities, so one that `Step.stale` lets run finds them standing, and a host that stands
begun in the scope occurrence it names; a queued begin is
`Admitted` once it leaves the queue, and a queued completion completes no reservation a queued begin names; and a queued
instance end records a failure exactly when it fails. The state operations' obligations are `Laws.State`'s. The phases
only the completion pipeline runs are apart (`PipelinePhases`), and so is the reset that starts an input
(`Laws.Step.running_keeps`): an invariant that counts an input's end facts holds across the pipeline only as a unit and
from the input's start only (`Kernel.Laws.Step.Ends`), and so is ordering the journal at the input's end (`Phases`):
an invariant that reads the order of the journal's facts cannot hold both before and after it. -/
structure ClosurePhases (inv : Program → State → Prop) : Prop where
  clock : ∀ program state atMs, inv program state → inv program { state with logicalTimeMs := atMs }
  /-- `Step.conclude` journals the draft and empties it and the write log. -/
  journal : ∀ program state (transition : Transition), inv program state → transition.started = state.draft.started →
    transition.ended = state.draft.ended →
    inv program { state with journal := transition :: state.journal, draft := {}, writes := [] }
  /-- Signals leave the queue: the closure's next, or a micro-step's sole completion that `Step.absorb` runs. -/
  dequeue : ∀ program state signals, inv program state → signals.Sublist state.signals →
    inv program { state with signals := signals }
  /-- The closure's next token leaves the work stack. -/
  untoken : ∀ program state tokens, inv program state → tokens.Sublist state.tokens →
    inv program { state with tokens := tokens }
  /-- A variable command queues its write or its removal. -/
  queueWrite : ∀ program state scope writes rule, inv program state →
    inv program (state.signal (.write scope writes rule))
  queueRemove : ∀ program state scope names, inv program state → inv program (state.signal (.remove scope names))
  armIssued : ∀ program state host element scope, inv program state → Signal.arm host element scope ∈ state.signals →
    host < state.nextIssue ∧ scope.value < state.nextIssue ∧
      ∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope
  armScopeIssued : ∀ program state scope, inv program state → Signal.armScope scope ∈ state.signals →
    scope.value < state.nextIssue
  armGatewayIssued : ∀ program state occurrence gateway scope, inv program state →
    Signal.armGateway occurrence gateway scope ∈ state.signals →
    occurrence < state.nextIssue ∧ scope.value < state.nextIssue ∧
      ∀ found ∈ state.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope
  endRecorded : ∀ program state status failure, inv program state → Signal.endInstance status failure ∈ state.signals →
    (failure.isSome = true ↔ status = .failed)
  /-- The closure's next signal or token, a begin, may begin once it leaves the queue. -/
  admittedSignal : ∀ program state request rest, inv program state → state.signals = .begin request :: rest →
    Admitted { state with signals := rest } request
  admittedToken : ∀ program state request rest, inv program state →
    (state.tokens = .begin request :: rest ∨ state.tokens = rest ++ [.begin request]) →
    Admitted { state with tokens := rest } request
  completeQueued : ∀ program state id leave writes rule, inv program state →
    Signal.complete id leave writes rule ∈ state.signals →
    ∀ request, Laws.State.Queued state request → id ∉ Laws.State.names request
  /-- The closure's next signal, a compensation, may end as it asks once it leaves the queue. -/
  resumable : ∀ program state scope activity trigger leave resume rest, inv program state →
    state.signals = .compensate scope activity trigger leave (some resume) :: rest →
    Laws.State.Resumable { state with signals := rest } scope resume
  /-- The closure's next signal, a raise, finds what its origin names and a settled host once it leaves the queue. -/
  raisable : ∀ program state raised origin rest, inv program state → state.signals = .raise raised origin :: rest →
    Laws.State.Raisable program { state with signals := rest } origin ∧
      ∀ host, origin.host = some host → Laws.State.Settled { state with signals := rest } host
  /-- An occurrence's scope occurrence stands. -/
  housed : ∀ program state occurrence, inv program state → occurrence ∈ state.occurrences →
    ScopeStands state occurrence.scope
  /-- Every occurrence was issued, so a reservation's number names it alone. -/
  issued : ∀ program state occurrence, inv program state → occurrence ∈ state.occurrences →
    occurrence.id < state.nextIssue
  /-- An occurrence numbered as a Multi-Instance body is of an element with a Multi-Instance envelope, so a dispatch
  hands every other hook an occurrence of the element role (`Laws.Step.dispatch_unstarted`). -/
  bodied : ∀ program state occurrence, inv program state → occurrence ∈ state.occurrences →
    occurrence.role = .multiInstanceBody →
      (((program.element? occurrence.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true
  /-- `State.beginOccurrence` journals the start of the occurrence it begins as the draft's newest
  (`Laws.State.Begins.started`). -/
  newest : ∀ program state request role sourceType, inv program state →
    (state.beginOccurrence request role sourceType).1.draft.started.getLast?.map (·.occurrence) =
      some (Laws.State.key (state.beginOccurrence request role sourceType).1 (state.beginOccurrence request role sourceType).2)
  /-- `State.beginOccurrence` of an admitted request begins an occurrence no running Multi-Instance body is keyed by:
  a fresh one is issued at the counter, above every body's, and a reservation is one no slot completes
  (`Laws.State.Unclaimed`). -/
  unrun : ∀ program state request role sourceType, inv program state → Admitted state request →
    ∀ run ∈ (state.beginOccurrence request role sourceType).1.slots.multiInstances,
      run.occurrence ≠ (state.beginOccurrence request role sourceType).2.id
  /-- `State.beginOccurrence` of an admitted request begins an occurrence that owns no scope occurrence: a fresh one is
  issued at the counter, and a reservation is unbegun, while only a begun occurrence owns one (`Laws.State.Owned`). -/
  unowned : ∀ program state request role sourceType, inv program state → Admitted state request →
    ∀ scope ∈ (state.beginOccurrence request role sourceType).1.scopes,
      scope.occurrence ≠ some (state.beginOccurrence request role sourceType).2.id
  /-- An occurrence parked at a join is begun while it stands, so a join offered again hands over a begun one. -/
  parkedBegun : ∀ program state waiting occurrence, inv program state → waiting ∈ state.slots.parked →
    occurrence ∈ state.occurrences →
    occurrence.id = waiting.occurrence → occurrence.begun = true
  /-- `Step.endInstance`, with a failure exactly when the instance fails. -/
  endInstance : ∀ program state status failure, inv program state → (failure.isSome = true ↔ status = .failed) →
    inv program (endInstance status failure state)
  /-- `State.beginOccurrence` of an admitted request, in a scope occurrence that stands (`Step.requireScope`); the
  request's start Event reservation stays beginnable, unclaimed and placed in the scope occurrence its begun occurrence
  runs in. The role is the request's (`Step.roleOf`): an Event's occurrence numbers under its element's counter
  (`Laws.Step.roleOf_event`), and a body only an element with a Multi-Instance envelope's (`Laws.Step.roleOf_body`); and
  the request is fresh or was queued (`BeginOrigin`). -/
  begin : ∀ program state request role sourceType, inv program state → ScopeStands state request.scope →
    Admitted state request → (((program.element? request.element).bind (·.event?)).isSome = true → role = .element) →
    (role = .multiInstanceBody →
      (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true) →
    role = roleOf program request → BeginOrigin inv program state request →
    inv program (state.beginOccurrence request role sourceType).1 ∧ ∀ id ∈ request.inner.toList,
      Laws.State.Beginnable (state.beginOccurrence request role sourceType).1
        (state.beginOccurrence request role sourceType).2.scope id ∧
      Laws.State.Unclaimed (state.beginOccurrence request role sourceType).1 id ∧
      ∀ found ∈ (state.beginOccurrence request role sourceType).1.occurrences, found.id = id →
        found.scope = (state.beginOccurrence request role sourceType).2.scope
  /-- `State.reserve` for `Signal.occur`, in a scope occurrence that stands, of an element the signal reserved in a
  state that kept `inv`, taken off a queue that kept it; nothing queued names the reservation. -/
  reserve : ∀ program state element scope, inv program state → ScopeStands state scope →
    PendingIn (inv program) element →
    (∃ leave writes rule, Laws.State.Popped (inv program) (.occur element scope leave writes rule) state) →
    inv program (state.reserve element scope).1 ∧
    ∀ request, Laws.State.Queued (state.reserve element scope).1 request →
      (state.reserve element scope).2.id ∉ Laws.State.names request
  cancel : ∀ program state id, inv program state → inv program (state.cancelOccurrence id)

/-- The phases of `ClosurePhases` and ordering the journal once the closure has settled (`Step.orderJournal`): what
`Laws.Step.running_keeps` needs for an invariant of the committed state, while `Laws.Step.running_settles` gives the
settled state before the ordering. -/
structure Phases (inv : Program → State → Prop) : Prop extends ClosurePhases inv where
  runOrder : ∀ program state, inv program state → inv program { state with journal := state.journal.reverse }

/-- What the completion pipeline's own phases must keep of `inv` (`Step.complete`): starting the completing reservation
and closing its items, removing its record and journalling its end. -/
structure PipelinePhases (inv : Program → State → Prop) : Prop where
  /-- `State.startReserved` of an occurrence no queued begin names, which the completion pipeline starts, then
  `State.closeOwnItems` of it, which closes what waited for it. -/
  startReserved : ∀ program state occurrence sourceType, inv program state → occurrence ∈ state.occurrences →
    (∀ request, Laws.State.Queued state request → occurrence.id ∉ Laws.State.names request) →
    inv program ((state.startReserved occurrence sourceType).1.closeOwnItems occurrence.id)
  /-- `State.removeOccurrence` of an occurrence on which nothing waits or hangs; its scope occurrence stays. -/
  removeOccurrence : ∀ program state occurrence, inv program state → occurrence ∈ state.occurrences →
    (∀ item ∈ state.openItems, item.occurrence ≠ occurrence.id ∧ item.attachedTo ≠ some occurrence.id) →
    inv program (state.removeOccurrence occurrence.id) ∧ ScopeStands (state.removeOccurrence occurrence.id) occurrence.scope
  recordEnd : ∀ program state key terminal, inv program state → inv program (state.recordEnd key terminal)

/-- The completion pipeline keeps `inv`, from a state in which no queued begin names the completing occurrence and
which says where it comes from (`Laws.Flow.LeavesFrom`):
`Laws.Step.complete_keeps` gives it from the hook contract, `Phases` and `PipelinePhases`, and the walk of
`Laws.Step.Keeps` takes it as a premise. -/
def PipelineKeeps (hooks : Hooks) (inv : Program → State → Prop) : Prop :=
  ∀ (ctx : Ctx) (id : Nat) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) (state after : State),
    inv ctx.program state → (∀ request, Laws.State.Queued state request → id ∉ Laws.State.names request) →
    (∀ occurrence ∈ state.occurrences, occurrence.id = id →
      Laws.Flow.LeavesFrom (inv ctx.program) ctx.program state occurrence leave) →
    complete hooks ctx id leave writes rule state = .ok after → inv ctx.program after

/-- What the state operations `Step` applies do to the fields it reads, whatever the invariant (`Laws.State`). -/
structure StateFacts : Prop where
  found : ∀ (state : State) id occurrence, state.occurrence? id = some occurrence →
    occurrence ∈ state.occurrences ∧ occurrence.id = id
  begun : ∀ (state : State) request role sourceType,
    (state.beginOccurrence request role sourceType).2 ∈ (state.beginOccurrence request role sourceType).1.occurrences ∧
    (state.beginOccurrence request role sourceType).2.begun = true
  startReserved : ∀ (state : State) occurrence sourceType, occurrence ∈ state.occurrences →
    (state.startReserved occurrence sourceType).2 ∈ (state.startReserved occurrence sourceType).1.occurrences ∧
    (state.startReserved occurrence sourceType).2.begun = true ∧
    (state.startReserved occurrence sourceType).2.id = occurrence.id ∧
    (state.startReserved occurrence sourceType).2.scope = occurrence.scope ∧
    (state.startReserved occurrence sourceType).1.scopes = state.scopes ∧
    (state.startReserved occurrence sourceType).2.element = occurrence.element ∧
    (state.startReserved occurrence sourceType).1.slots.instances = state.slots.instances
  closeOwnItems : ∀ (state : State) id,
    PipelineFrame state (state.closeOwnItems id) ∧ ∀ item ∈ (state.closeOwnItems id).openItems, item.occurrence ≠ id
  recordEnd : ∀ (state : State) key terminal, (state.recordEnd key terminal).scopes = state.scopes ∧
    (state.recordEnd key terminal).slots.instances = state.slots.instances
  /-- A reservation adds one occurrence, of its element in its scope occurrence and numbered by the next issue. -/
  reserve : ∀ (state : State) element scope,
    (state.reserve element scope).1.occurrences = state.occurrences ++ [(state.reserve element scope).2] ∧
    (state.reserve element scope).2.element = element ∧ (state.reserve element scope).2.scope = scope ∧
    (state.reserve element scope).2.id = state.nextIssue ∧ (state.reserve element scope).1.scopes = state.scopes ∧
    (state.reserve element scope).1.slots.instances = state.slots.instances
  /-- Removing an occurrence keeps no scope occurrence and no instance entry it did not have. -/
  removeOccurrence : ∀ (state : State) id, (∀ entry ∈ (state.removeOccurrence id).scopes, entry ∈ state.scopes) ∧
    ∀ entry ∈ (state.removeOccurrence id).slots.instances, entry ∈ state.slots.instances
  /-- A variable write or removal changes no scope occurrence, occurrence or open item. -/
  setVariable : ∀ (state : State) target name value, (state.setVariable target name value).scopes = state.scopes ∧
    (state.setVariable target name value).occurrences = state.occurrences ∧
    (state.setVariable target name value).openItems = state.openItems
  removeVariable : ∀ (state : State) target name, (state.removeVariable target name).scopes = state.scopes ∧
    (state.removeVariable target name).occurrences = state.occurrences ∧
    (state.removeVariable target name).openItems = state.openItems
  /-- A scope occurrence a lookup finds stands, or, for `State.owner?`, holds a variable set. -/
  declaring : ∀ (state : State) scope element found, state.declaring? scope element = some found →
    ScopeStands state found
  owner : ∀ (state : State) scope name found, state.owner? scope name = some found →
    ∃ variables ∈ state.variables, variables.scope = found
  /-- An instance root is the process root or a scope occurrence that stands. -/
  instanceRoot : ∀ (state : State) scope, state.instanceRoot scope = State.root ∨ ScopeStands state (state.instanceRoot scope)
  /-- A scope occurrence with a child is busy. -/
  parentBusy : ∀ (state : State) child, child ∈ state.scopes → ∀ parent, child.parent = some parent →
    parent ∈ state.busyScopes

/-- What the state operations the hooks' bodies apply must keep of `inv`, under the conditions a hook establishes, and
what `inv` tells a hook of the state it runs on: the obligations each feature's operations record draws on (see the
module documentation). An operation enters when a feature proof first needs it. -/
structure Operations (inv : Program → State → Prop) : Prop where
  /-- Every variable set belongs to a scope occurrence that stands. -/
  variablesHoused : ∀ program state, inv program state →
    ∀ variables ∈ state.variables, ScopeStands state variables.scope
  /-- The process root stands. -/
  rootStands : ∀ program state, inv program state → ScopeStands state State.root
  /-- A write to a scope occurrence that stands. -/
  setVariable : ∀ program state target name value, inv program state → ScopeStands state target →
    inv program (state.setVariable target name value)
  removeVariable : ∀ program state target name, inv program state → inv program (state.removeVariable target name)

end Kernel.Laws.Step
