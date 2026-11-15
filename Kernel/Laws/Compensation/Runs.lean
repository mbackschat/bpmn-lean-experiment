module

public import Kernel.Hooks
public import Kernel.Laws.MultiInstance.Rules

/-! # Laws of compensation runs: what preserving an invariant needs

What `Kernel.Laws.Compensation` needs to show that beginning, advancing and releasing compensation runs keep an
invariant `inv` of the state, given which occurrences it calls settled, stated without reading
`Kernel.Feature.Compensation`: what a run must satisfy in the state holding it (`Fits`), the operations record its
hooks need (`RunsOps`), how the state evolves while runs begin and end (`Follows`), and what an advance, an ending and
a handler's begin keep (`Advanced`, `Ended`, `Begun`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Compensation

open Kernel

/-! ## What a run needs

What beginning, advancing and releasing compensation runs keep of `inv`, given which occurrences it calls `settled`:
each run fits the state holding it (`Fits`), so the context a handler completed in stands directly in its run's scope
occurrence, which leaving the context keeps standing; and while a run's handlers begin, a group's nested run cannot end,
since no run holds its fresh context yet, so every scope occurrence that stood still does. -/

/-- A compensation run fits `state`: the occurrence it completes once it ends has settled, a group it resumes is its
own context, and each running handler's context was issued and, while it stands, lies directly in the run's scope
occurrence. -/
def Fits (settled : State → Nat → Prop) (state : State) (run : CompensationRun) : Prop :=
  (∀ occurrence leave, run.resume = some (.complete occurrence leave) → settled state occurrence) ∧
    (∀ outer context, run.resume = some (.group outer context) → context = run.scope) ∧
    ∀ context ∈ run.running.map (·.1), context.value < state.nextIssue ∧
      ∀ entry ∈ state.scopes, entry.id = context → entry.parent = some run.scope

/-- What compensation runs need of the state operations they apply, for an invariant `inv` and what it calls settled;
each operation also keeps what has settled. -/
structure RunsOps (inv : State → Prop) (settled : State → Nat → Prop) : Prop where
  fits : ∀ state run, inv state → run ∈ state.slots.compensation.runs → Fits settled state run
  issued : ∀ state, inv state → ∀ entry ∈ state.scopes, entry.id.value < state.nextIssue
  /-- Every active Multi-Instance instance's scope occurrence was issued, so no context entered later is one. -/
  slotsIssued : ∀ state, inv state → ∀ body ∈ state.slots.multiInstances, ∀ scope,
    Iteration.active scope ∈ body.instances → scope.value < state.nextIssue
  /-- The records and runs replaced, each run held before or fitting, and each context they hold running a running
  context before or no active Multi-Instance instance's scope occurrence, so that an invariant keeping instances apart
  from handlers is kept by storing them; a run that resumes by a reservation names one pending in a state that kept
  `inv`. -/
  store : ∀ state compensation, inv state →
    (∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs ∨ Fits settled state run) →
    (∀ run ∈ compensation.runs, ∀ context ∈ run.running.map (·.1),
      (∃ other ∈ state.slots.compensation.runs, context ∈ other.running.map (·.1)) ∨
        ∀ body ∈ state.slots.multiInstances, Iteration.active context ∉ body.instances) →
    (∀ run ∈ compensation.runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
      Laws.MultiInstance.PendingIn inv element) →
    inv { state with slots := { state.slots with compensation } } ∧
      ∀ id, settled state id → settled { state with slots := { state.slots with compensation } } id
  /-- A context entered below a scope occurrence that stands. -/
  enter : ∀ state element parent locals, inv state → parent ∈ state.scopes.map (·.id) →
    inv (state.enterScope element parent locals none).1 ∧
      ∀ id, settled state id → settled (state.enterScope element parent locals none).1 id
  entered : ∀ (state : State) element parent locals, (state.enterScope element parent locals none).2 = ⟨state.nextIssue⟩ ∧
    (state.enterScope element parent locals none).1.nextIssue = state.nextIssue + 1 ∧
    (state.enterScope element parent locals none).1.scopes =
      state.scopes ++ [{ id := ⟨state.nextIssue⟩, element := some element, parent := some parent, occurrence := none }] ∧
    (state.enterScope element parent locals none).1.slots = state.slots
  signalled : ∀ (state : State) signal, (state.signal signal).scopes = state.scopes ∧
    (state.signal signal).nextIssue = state.nextIssue ∧ (state.signal signal).slots = state.slots
  cancel : ∀ state id, inv state → inv (state.signal (.cancel id)) ∧
    ∀ other, settled state other → settled (state.signal (.cancel id)) other
  complete : ∀ state id leave writes rule, inv state → settled state id →
    inv (state.signal (.complete id leave writes rule)) ∧
      ∀ other, settled state other → settled (state.signal (.complete id leave writes rule)) other
  /-- An ended run's resume, pending in a state that kept `inv`. -/
  occur : ∀ state element scope leave writes rule, inv state → Laws.MultiInstance.PendingIn inv element →
    inv (state.signal (.occur element scope leave writes rule)) ∧
    ∀ other, settled state other → settled (state.signal (.occur element scope leave writes rule)) other
  /-- A handler's begin in its context. -/
  begin : ∀ state handler context scope, inv state → context ∈ state.scopes.map (·.id) →
    inv (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope })) ∧
      ∀ other, settled state other →
        settled (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope })) other
  /-- A context left, which keeps its parent standing and adds no Multi-Instance body; it is a running handler's
  context, so an invariant that keeps every other scope occurrence a hook does not own (a Multi-Instance instance's) is
  kept by leaving it. -/
  leave : ∀ state entry parent, inv state → entry ∈ state.scopes → entry.parent = some parent →
    (∃ run ∈ state.slots.compensation.runs, entry.id ∈ run.running.map (·.1)) →
    inv (state.leaveScope entry.id) ∧ parent ∈ (state.leaveScope entry.id).scopes.map (·.id) ∧
      (state.leaveScope entry.id).nextIssue = state.nextIssue ∧ (∀ kept ∈ (state.leaveScope entry.id).scopes, kept ∈ state.scopes) ∧
      (∀ body ∈ (state.leaveScope entry.id).slots.multiInstances, body ∈ state.slots.multiInstances) ∧
      ∀ id, settled state id → settled (state.leaveScope entry.id) id

/-- `after` follows `before` while runs begin, advance and end: nothing issued is issued again, each scope occurrence
of `after` stood in `before` or was issued since, what has settled stays settled, and no Multi-Instance body is added. -/
def Follows (settled : State → Nat → Prop) (before after : State) : Prop :=
  before.nextIssue ≤ after.nextIssue ∧
    (∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ before.nextIssue ≤ entry.id.value) ∧
    (∀ id, settled before id → settled after id) ∧
    ∀ body ∈ after.slots.multiInstances, body ∈ before.slots.multiInstances

theorem Follows.refl {settled : State → Nat → Prop} (state : State) : Follows settled state state :=
  ⟨Nat.le_refl _, fun _ member => .inl member, fun _ => id, fun _ => id⟩

theorem Follows.trans {settled : State → Nat → Prop} {first second third : State} (one : Follows settled first second)
    (two : Follows settled second third) : Follows settled first third :=
  ⟨Nat.le_trans one.1 two.1, fun entry member => (two.2.1 entry member).elim (one.2.1 entry)
    fun fresh => .inr (Nat.le_trans one.1 fresh), fun id settled => two.2.2.1 id (one.2.2.1 id settled),
    fun body member => one.2.2.2 body (two.2.2.2 body member)⟩

/-- A change that keeps the scope occurrences, the issued identities, the Multi-Instance bodies and what has settled is
followed. -/
theorem Follows.same {settled : State → Nat → Prop} {before after : State} (kept : ∀ id, settled before id → settled after id)
    (scopes : after.scopes = before.scopes) (issued : after.nextIssue = before.nextIssue)
    (bodies : after.slots.multiInstances = before.slots.multiInstances) : Follows settled before after :=
  ⟨Nat.le_of_eq issued.symm, fun _ member => .inl (scopes ▸ member), kept, fun _ member => bodies ▸ member⟩

/-- No run holds `context` as a running handler's. -/
def Unheld (state : State) (context : ScopeOccurrenceId) : Prop :=
  ∀ run ∈ state.slots.compensation.runs, context ∉ run.running.map (·.1)

/-- A property every step of a monadic left fold in `Except` keeps holds of its result. -/
theorem foldlM_keeps {α β ε : Type} (P : α → Prop) (f : α → β → Except ε α) :
    ∀ (l : List β) (a b : α), (∀ a x c, x ∈ l → P a → f a x = .ok c → P c) → P a → l.foldlM f a = .ok b → P b
  | [], _, _, _, holds, ran => by
    cases ran
    exact holds
  | x :: l, a, b, step, holds, ran => by
    simp only [List.foldlM_cons, bind, Except.bind] at ran
    split at ran
    · cases ran
    · rename_i c applied
      exact foldlM_keeps P f l c b (fun a' x' c' member => step a' x' c' (List.mem_cons_of_mem _ member))
        (step a x c (List.mem_cons_self ..) holds applied) ran

/-- What ending the run in `scope` leaves before it resumes: `inv`, what follows, every scope occurrence, only runs
held before, and every run of another scope occurrence. -/
def Ended (inv : State → Prop) (settled : State → Nat → Prop) (scope : ScopeOccurrenceId) (state ended : State) : Prop :=
  inv ended ∧ Follows settled state ended ∧ ended.scopes = state.scopes ∧
    (∀ run ∈ ended.slots.compensation.runs, run ∈ state.slots.compensation.runs) ∧
    ∀ run ∈ state.slots.compensation.runs, run.scope ≠ scope → run ∈ ended.slots.compensation.runs

/-- What an advance of the run in `scope` keeps from `state` to `after`: `inv`, what follows, and, while no run holds
`scope` as a handler's context, every scope occurrence and every run of another scope occurrence that stands. -/
def Advanced (inv : State → Prop) (settled : State → Nat → Prop) (scope : ScopeOccurrenceId) (state after : State) :
    Prop :=
  inv after ∧ Follows settled state after ∧ (Unheld state scope → (∀ entry ∈ state.scopes, entry ∈ after.scopes) ∧
    ∀ run ∈ state.slots.compensation.runs, run.scope ∈ state.scopes.map (·.id) → run.scope ≠ scope →
      run ∈ after.slots.compensation.runs)

/-- What a handler or group begun in `scope` keeps from `state` to `after`: `inv`, what follows, every scope
occurrence and every run whose scope occurrence stands, and the context it began in is issued at or after `state`'s
counter and lies directly in `scope`. -/
def Begun (inv : State → Prop) (settled : State → Nat → Prop) (scope : ScopeOccurrenceId) (state after : State)
    (context : ScopeOccurrenceId) : Prop :=
  inv after ∧ Follows settled state after ∧ (∀ entry ∈ state.scopes, entry ∈ after.scopes) ∧
    (state.nextIssue ≤ context.value ∧ context.value < after.nextIssue) ∧
    (∀ entry ∈ after.scopes, entry.id = context → entry.parent = some scope) ∧
    ∀ run ∈ state.slots.compensation.runs, run.scope ∈ state.scopes.map (·.id) → run ∈ after.slots.compensation.runs

/-- Every context the runs `held`, of `state`, hold running is a running context of `state`. -/
theorem held_running {state : State} {runs : List CompensationRun}
    (held : ∀ run ∈ runs, run ∈ state.slots.compensation.runs) :
    ∀ run ∈ runs, ∀ context ∈ run.running.map (·.1),
      (∃ other ∈ state.slots.compensation.runs, context ∈ other.running.map (·.1)) ∨
        ∀ body ∈ state.slots.multiInstances, Iteration.active context ∉ body.instances :=
  fun run member _ running => .inl ⟨run, held run member, running⟩

/-- A run `state` holds resumes only by a reservation pending in `state`, which keeps `inv`. -/
theorem held_pending {inv : State → Prop} {state : State} (holds : inv state) {run : CompensationRun}
    (member : run ∈ state.slots.compensation.runs) {element : ElementId} {at_ : ScopeOccurrenceId} {leave : Leave}
    (resumed : run.resume = some (.occur element at_ leave)) : Laws.MultiInstance.PendingIn inv element :=
  ⟨state, holds, .inr (.inr ⟨run, member, at_, leave, resumed⟩)⟩

/-- The runs `held`, of `state`, which keeps `inv`, resume only by reservations pending in a state that kept it. -/
theorem held_resumes {inv : State → Prop} {state : State} {runs : List CompensationRun} (holds : inv state)
    (held : ∀ run ∈ runs, run ∈ state.slots.compensation.runs) :
    ∀ run ∈ runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
      Laws.MultiInstance.PendingIn inv element :=
  fun run member _ _ _ resumed => held_pending holds (held run member) resumed

/-- Runs `state`, which keeps `inv`, held, followed by one whose resume, if a reservation, is pending, resume only by
pending reservations. -/
theorem appended_resumes {inv : State → Prop} {state : State} {runs : List CompensationRun} {run : CompensationRun}
    (holds : inv state) (held : ∀ other ∈ runs, other ∈ state.slots.compensation.runs)
    (pending : ∀ element at_ leave, run.resume = some (.occur element at_ leave) → Laws.MultiInstance.PendingIn inv element) :
    ∀ other ∈ runs ++ [run], ∀ element at_ leave, other.resume = some (.occur element at_ leave) →
      Laws.MultiInstance.PendingIn inv element := fun other member element at_ leave resumed =>
  (List.mem_append.mp member).elim (fun old => held_pending holds (held other old) resumed) fun new =>
    pending element at_ leave (List.mem_singleton.mp new ▸ resumed)

/-- A run that ends by queuing a completion or an occurrence keeps what `Compensation.advance` keeps. -/
theorem Ended.queue {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {state ended : State} {scope : ScopeOccurrenceId} (done : Ended inv settled scope state ended) {signal : Signal}
    (queued : inv (ended.signal signal) ∧ ∀ id, settled ended id → settled (ended.signal signal) id) :
    Advanced inv settled scope state (ended.signal signal) :=
  have shape := ops.signalled ended signal
  ⟨queued.1, done.2.1.trans (.same queued.2 shape.1 shape.2.1 (congrArg (·.multiInstances) shape.2.2)), fun _ =>
    ⟨fun entry member => by
      rw [shape.1, done.2.2.1]
      exact member, fun run member _ other => by
      rw [shape.2.2]
      exact done.2.2.2.2 run member other⟩⟩

/-- A run that ends without resuming anything keeps what `Compensation.advance` keeps. -/
theorem Ended.done {inv : State → Prop} {settled : State → Nat → Prop} {state ended : State}
    {scope : ScopeOccurrenceId} (done : Ended inv settled scope state ended) : Advanced inv settled scope state ended :=
  ⟨done.1, done.2.1, fun _ => ⟨fun _entry member => done.2.2.1 ▸ member,
    fun run member _ other => done.2.2.2.2 run member other⟩⟩

theorem Ended.complete {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {state ended : State} {scope : ScopeOccurrenceId} (done : Ended inv settled scope state ended) {id : Nat}
    (completes : settled state id) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    Advanced inv settled scope state (ended.signal (.complete id leave writes rule)) :=
  done.queue ops (ops.complete _ _ _ _ _ done.1 (done.2.1.2.2.1 _ completes))

end Kernel.Laws.Compensation
