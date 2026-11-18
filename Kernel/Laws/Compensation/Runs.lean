module

public import Kernel.Hooks
public import Kernel.Laws.Step.Contract
public import Kernel.Laws.Compensation.Rules

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
    ∀ context ∈ run.running.map (·.1), Laws.State.ScopeIssued state context ∧
      ∀ entry ∈ state.scopes, entry.id = context → entry.parent = some run.scope

/-- `resume` is the resume of a compensation queued in a state that kept `inv`, issued no more than `state`, with
`state`'s scope occurrences and instance entries: where a run a compensation starts resumes from (`StoredFrom`). -/
def ResumeQueued (inv : State → Prop) (state : State) (resume : Resume) : Prop :=
  ∃ queue, inv queue ∧ Laws.State.ScopeGrows queue state ∧ some resume ∈ Laws.Step.resumesOf queue.signals ∧
    queue.scopes = state.scopes ∧ queue.slots.instances = state.slots.instances

/-- What compensation runs need of the state operations they apply, for an invariant `inv` of instances of `program`
and what it calls settled; each operation also keeps what has settled. -/
structure RunsOps (program : Program) (inv : State → Prop) (settled : State → Nat → Prop) : Prop where
  fits : ∀ state run, inv state → run ∈ state.slots.compensation.runs → Fits settled state run
  issued : ∀ state, inv state → ∀ entry ∈ state.scopes, Laws.State.ScopeIssued state entry.id
  /-- Every active Multi-Instance instance's scope occurrence was issued, so no context entered later is one. -/
  slotsIssued : ∀ state, inv state → ∀ body ∈ state.slots.multiInstances, ∀ scope,
    Iteration.active scope ∈ body.instances → Laws.State.ScopeIssued state scope
  /-- The records and runs replaced, each run held before or fitting, and each context they hold running a running
  context before or no active Multi-Instance instance's scope occurrence, so that an invariant keeping instances apart
  from handlers is kept by storing them; a run that resumes by a reservation names one pending in a state that kept
  `inv`; and what they hold comes from `state`, a fresh resume from a queued compensation (`StoredFrom`). -/
  store : ∀ state compensation, inv state →
    (∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs ∨ Fits settled state run) →
    (∀ run ∈ compensation.runs, ∀ context ∈ run.running.map (·.1),
      (∃ other ∈ state.slots.compensation.runs, context ∈ other.running.map (·.1)) ∨
        ∀ body ∈ state.slots.multiInstances, Iteration.active context ∉ body.instances) →
    (∀ run ∈ compensation.runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
      Laws.Step.PendingIn inv element) → StoredFrom program state (ResumeQueued inv state) compensation →
    inv { state with slots := { state.slots with compensation } } ∧
      ∀ id, settled state id → settled { state with slots := { state.slots with compensation } } id
  /-- A context entered below a scope occurrence that stands, for a pending record's subject or handler there. -/
  enter : ∀ state element parent locals, inv state → parent ∈ state.scopes.map (·.id) →
    Laws.Flow.RecordAnchor state element parent →
    inv (state.enterScope element parent locals none).1 ∧
      ∀ id, settled state id → settled (state.enterScope element parent locals none).1 id
  entered : ∀ (state : State) element parent locals, (state.enterScope element parent locals none).2.parent? = some parent ∧
    (state.enterScope element parent locals none).1.nextIssue = state.nextIssue ∧
    (state.enterScope element parent locals none).1.scopes = state.scopes ++
      [{ id := (state.enterScope element parent locals none).2, element := some element, occurrence := none }] ∧
    (state.enterScope element parent locals none).1.slots = state.slots
  /-- A context entered below a scope occurrence that stands takes a key never issued, which every history then holds. -/
  fresh : ∀ state element parent locals, inv state → parent ∈ state.scopes.map (·.id) →
    Laws.State.ScopeFresh state (state.enterScope element parent locals none).1 (state.enterScope element parent locals none).2
  signalled : ∀ (state : State) signal, (state.signal signal).scopes = state.scopes ∧
    (state.signal signal).nextIssue = state.nextIssue ∧ (state.signal signal).slots = state.slots
  signalGrows : ∀ (state : State) signal, Laws.State.ScopeGrows state (state.signal signal)
  cancel : ∀ state id, inv state → inv (state.signal (.cancel id)) ∧
    ∀ other, settled state other → settled (state.signal (.cancel id)) other
  /-- The completion a run held in a state that kept `inv` resumes by. -/
  complete : ∀ state id leave writes rule, inv state → settled state id →
    (∃ held, inv held ∧ ∃ run ∈ held.slots.compensation.runs, run.resume = some (.complete id leave)) →
    inv (state.signal (.complete id leave writes rule)) ∧
      ∀ other, settled state other → settled (state.signal (.complete id leave writes rule)) other
  /-- An ended run's resume, pending in a state that kept `inv`, which held the run (`Laws.Flow.ResumedBy`). -/
  occur : ∀ state element scope leave writes rule, inv state → Laws.Step.PendingIn inv element →
    Laws.Flow.ResumedBy inv state element scope leave →
    inv (state.signal (.occur element scope leave writes rule)) ∧
    ∀ other, settled state other → settled (state.signal (.occur element scope leave writes rule)) other
  /-- A handler's begin in its context, entered for it without calling an instance. -/
  begin : ∀ state handler context scope, inv state → context ∈ state.scopes.map (·.id) →
    (∃ entry ∈ state.scopes, entry.id = context ∧ entry.element = some handler ∧ entry.calledInstance = none) →
    inv (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope })) ∧
      ∀ other, settled state other →
        settled (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope })) other
  /-- A context left, which keeps its parent standing and adds no Multi-Instance body; it is a running handler's
  context, so an invariant that keeps every other scope occurrence a hook does not own (a Multi-Instance instance's) is
  kept by leaving it. -/
  leave : ∀ state entry parent, inv state → entry ∈ state.scopes → entry.parent = some parent →
    (∃ run ∈ state.slots.compensation.runs, entry.id ∈ run.running.map (·.1)) →
    inv (state.leaveScope entry.id) ∧ parent ∈ (state.leaveScope entry.id).scopes.map (·.id) ∧
      (state.leaveScope entry.id).nextIssue = state.nextIssue ∧ Laws.State.ScopeGrows state (state.leaveScope entry.id) ∧
      (∀ kept ∈ (state.leaveScope entry.id).scopes, kept ∈ state.scopes) ∧
      (∀ body ∈ (state.leaveScope entry.id).slots.multiInstances, body ∈ state.slots.multiInstances) ∧
      ∀ id, settled state id → settled (state.leaveScope entry.id) id

/-- `after` follows `before` while runs begin, advance and end: nothing issued is issued again, each scope occurrence
of `after` stood in `before` or was issued since, what has settled stays settled, no Multi-Instance body is added, and
every scope key issued stays issued. -/
def Follows (settled : State → Nat → Prop) (before after : State) : Prop :=
  before.nextIssue ≤ after.nextIssue ∧
    (∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ ¬ Laws.State.ScopeIssued before entry.id) ∧
    (∀ id, settled before id → settled after id) ∧
    (∀ body ∈ after.slots.multiInstances, body ∈ before.slots.multiInstances) ∧ Laws.State.ScopeGrows before after

theorem Follows.grows {settled : State → Nat → Prop} {before after : State} (follows : Follows settled before after) :
    Laws.State.ScopeGrows before after :=
  follows.2.2.2.2

theorem Follows.refl {settled : State → Nat → Prop} (state : State) : Follows settled state state :=
  ⟨Nat.le_refl _, fun _ member => .inl member, fun _ => id, fun _ => id, .refl _⟩

theorem Follows.trans {settled : State → Nat → Prop} {first second third : State} (one : Follows settled first second)
    (two : Follows settled second third) : Follows settled first third :=
  ⟨Nat.le_trans one.1 two.1, fun entry member => (two.2.1 entry member).elim (one.2.1 entry)
    fun fresh => .inr fun issued => fresh (one.grows.issued issued), fun id settled => two.2.2.1 id (one.2.2.1 id settled),
    fun body member => one.2.2.2.1 body (two.2.2.2.1 body member), one.grows.trans two.grows⟩

/-- A change that keeps the scope occurrences, the issued identities, the Multi-Instance bodies and what has settled is
followed. -/
theorem Follows.same {settled : State → Nat → Prop} {before after : State} (kept : ∀ id, settled before id → settled after id)
    (scopes : after.scopes = before.scopes) (issued : after.nextIssue = before.nextIssue)
    (bodies : after.slots.multiInstances = before.slots.multiInstances) (grows : Laws.State.ScopeGrows before after) :
    Follows settled before after :=
  ⟨Nat.le_of_eq issued.symm, fun _ member => .inl (scopes ▸ member), kept, fun _ member => bodies ▸ member, grows⟩

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
    (¬ Laws.State.ScopeIssued state context ∧ Laws.State.ScopeIssued after context) ∧
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
    (resumed : run.resume = some (.occur element at_ leave)) : Laws.Step.PendingIn inv element :=
  ⟨state, holds, .inr (.inr ⟨run, member, at_, leave, resumed⟩)⟩

/-- The runs `held`, of `state`, which keeps `inv`, resume only by reservations pending in a state that kept it. -/
theorem held_resumes {inv : State → Prop} {state : State} {runs : List CompensationRun} (holds : inv state)
    (held : ∀ run ∈ runs, run ∈ state.slots.compensation.runs) :
    ∀ run ∈ runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
      Laws.Step.PendingIn inv element :=
  fun run member _ _ _ resumed => held_pending holds (held run member) resumed

/-- Runs `state`, which keeps `inv`, held, followed by one whose resume, if a reservation, is pending, resume only by
pending reservations. -/
theorem appended_resumes {inv : State → Prop} {state : State} {runs : List CompensationRun} {run : CompensationRun}
    (holds : inv state) (held : ∀ other ∈ runs, other ∈ state.slots.compensation.runs)
    (pending : ∀ element at_ leave, run.resume = some (.occur element at_ leave) → Laws.Step.PendingIn inv element) :
    ∀ other ∈ runs ++ [run], ∀ element at_ leave, other.resume = some (.occur element at_ leave) →
      Laws.Step.PendingIn inv element := fun other member element at_ leave resumed =>
  (List.mem_append.mp member).elim (fun old => held_pending holds (held other old) resumed) fun new =>
    pending element at_ leave (List.mem_singleton.mp new ▸ resumed)

/-- A run that ends by queuing a completion or an occurrence keeps what `Compensation.advance` keeps. -/
theorem Ended.queue {inv : State → Prop} {settled : State → Nat → Prop} {program : Program} (ops : RunsOps program inv settled)
    {state ended : State} {scope : ScopeOccurrenceId} (done : Ended inv settled scope state ended) {signal : Signal}
    (queued : inv (ended.signal signal) ∧ ∀ id, settled ended id → settled (ended.signal signal) id) :
    Advanced inv settled scope state (ended.signal signal) :=
  have shape := ops.signalled ended signal
  ⟨queued.1, done.2.1.trans (.same queued.2 shape.1 shape.2.1 (congrArg (·.multiInstances) shape.2.2)
    (ops.signalGrows ended signal)), fun _ =>
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

theorem Ended.complete {inv : State → Prop} {settled : State → Nat → Prop} {program : Program} (ops : RunsOps program inv settled)
    {state ended : State} {scope : ScopeOccurrenceId} (done : Ended inv settled scope state ended) {id : Nat}
    (completes : settled state id) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule)
    (resumed : ∃ held, inv held ∧ ∃ run ∈ held.slots.compensation.runs, run.resume = some (.complete id leave)) :
    Advanced inv settled scope state (ended.signal (.complete id leave writes rule)) :=
  done.queue ops (ops.complete _ _ _ _ _ done.1 (done.2.1.2.2.1 _ completes) resumed)

/-! ## Where stored records come from -/

/-- A record held in `state` names its own elements where it is held. -/
theorem RecordHeld.narrow {program : Program} {state : State} {elements others : List ElementId}
    {scope at_ : ScopeOccurrenceId} (held : RecordHeld program state elements scope)
    (fewer : ∀ element ∈ others, element ∈ elements)
    (linked : InstanceLinked program state scope at_) : RecordHeld program state others at_ := by
  obtain ⟨source, from_, holding, rest⟩ := held
  exact ⟨source, from_, holding, rest.1.trans linked, fun element named => rest.2 element (fewer element named)⟩

/-- A compensation that retains records `state` retains and whose runs are `state`'s, holding some of their pending
records, comes from `state`. -/
theorem StoredFrom.held {program : Program} {state : State} {resumed : Resume → Prop} {compensation : Compensations}
    (retained : ∀ record ∈ compensation.retained, record ∈ state.slots.compensation.retained)
    (runs : ∀ run ∈ compensation.runs, ∃ held ∈ state.slots.compensation.runs, held.scope = run.scope ∧
      held.resume = run.resume ∧ ∀ record ∈ run.pending, record ∈ held.pending) :
    StoredFrom program state resumed compensation := by
  refine ⟨fun record member => .inl ⟨record, _, .inl ⟨retained record member, rfl⟩, .refl _, fun _ => id⟩,
    fun run member => ?_⟩
  obtain ⟨held, inside, placedAt, rest⟩ := runs run member
  exact ⟨fun record pending => .inl ⟨record, run.scope, .inr ⟨held, inside, rest.2 record pending, placedAt⟩, .refl _,
    fun _ => id⟩, fun resume same => .inl ⟨held, inside, rest.1.trans same⟩⟩

/-- Provenance that admits fewer fresh resumes admits more. -/
theorem StoredFrom.mono {program : Program} {state : State} {resumed more : Resume → Prop}
    {compensation : Compensations} (stored : StoredFrom program state resumed compensation)
    (implies : ∀ resume, resumed resume → more resume) : StoredFrom program state more compensation :=
  ⟨stored.1, fun run member => ⟨(stored.2 run member).1, fun resume same =>
    ((stored.2 run member).2 resume same).imp_right (Or.imp_right (implies resume))⟩⟩

/-- A record `state` retains is held where it is retained. -/
theorem RecordHeld.retained {program : Program} {state : State} {record : Compensable}
    (member : record ∈ state.slots.compensation.retained) :
    RecordHeld program state (recordElements record) record.scope :=
  ⟨record, _, .inl ⟨member, rfl⟩, .refl _, fun _ => id⟩

/-- A record a run of `state` holds pending is held in the run's scope occurrence. -/
theorem RecordHeld.pending {program : Program} {state : State} {run : CompensationRun} {record : Compensable}
    (member : run ∈ state.slots.compensation.runs) (pending : record ∈ run.pending) :
    RecordHeld program state (recordElements record) run.scope :=
  ⟨record, _, .inr ⟨run, member, pending, rfl⟩, .refl _, fun _ => id⟩

/-- A run appended to a compensation that comes from `state` keeps it coming from there, for records from there and a
resume that is a group's or one `resumed` admits. -/
theorem StoredFrom.append {program : Program} {state : State} {resumed : Resume → Prop}
    {retained : List Compensable} {runs : List CompensationRun} {run : CompensationRun}
    (stored : StoredFrom program state resumed ⟨retained, runs⟩)
    (pending : ∀ record ∈ run.pending, RecordFrom program state record run.scope)
    (resumes : ∀ resume, run.resume = some resume → (∃ outer context, resume = .group outer context) ∨ resumed resume) :
    StoredFrom program state resumed ⟨retained, runs ++ [run]⟩ := by
  refine ⟨stored.1, fun other member => ?_⟩
  rcases List.mem_append.mp member with old | new
  · exact stored.2 other old
  · rw [List.mem_singleton.mp new]
    exact ⟨pending, fun resume same => .inr (resumes resume same)⟩

/-- Where a record comes from reads only the scope occurrences, the occurrences and the compensation slot. -/
theorem RecordHeld.congr {program : Program} {s t : State} {elements : List ElementId} {scope : ScopeOccurrenceId}
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences)
    (slot : t.slots.compensation = s.slots.compensation) (held : RecordHeld program s elements scope) :
    RecordHeld program t elements scope := by
  obtain ⟨source, at_, holding, rest⟩ := held
  exact ⟨source, at_, by rw [slot]; exact holding, rest.1.congr scopes occurrences, rest.2⟩

theorem RecordFrom.congr {program : Program} {s t : State} {record : Compensable} {scope : ScopeOccurrenceId}
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences)
    (slot : t.slots.compensation = s.slots.compensation) (from_ : RecordFrom program s record scope) :
    RecordFrom program t record scope :=
  from_.imp (.congr scopes occurrences slot) fun ⟨occurrence, member, rest⟩ => ⟨occurrence, occurrences ▸ member,
    rest.1, rest.2.1.congr scopes occurrences, rest.2.2.1, fun child inside => (rest.2.2.2 child inside).congr scopes
      occurrences slot⟩

theorem StoredFrom.congr {program : Program} {s t : State} {resumed : Resume → Prop} {compensation : Compensations}
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences)
    (slot : t.slots.compensation = s.slots.compensation) (stored : StoredFrom program s resumed compensation) :
    StoredFrom program t resumed compensation :=
  ⟨fun record member => (stored.1 record member).congr scopes occurrences slot, fun run member =>
    ⟨fun record pending => ((stored.2 run member).1 record pending).congr scopes occurrences slot, fun resume same =>
      ((stored.2 run member).2 resume same).imp_left fun ⟨held, inside, resumes⟩ => ⟨held, slot ▸ inside, resumes⟩⟩⟩

/-- Provenance whose resumes were queued in states that kept `inv` holds of any weaker invariant. -/
theorem StoredFrom.weaken {program : Program} {state : State} {inv more : State → Prop} {compensation : Compensations}
    (stored : StoredFrom program state (ResumeQueued inv state) compensation) (implies : ∀ t, inv t → more t) :
    StoredFrom program state (ResumeQueued more state) compensation :=
  stored.mono fun _ ⟨queue, holds, rest⟩ => ⟨queue, implies queue holds, rest⟩

/-- Records naming only elements of a record a run of `state` holds pending, as the records it keeps do once they are
begun in a context entered for it below the run's scope occurrence, come from that record: the context calls no
instance. -/
theorem entered_children {inv : State → Prop} {settled : State → Nat → Prop} {program : Program}
    (ops : RunsOps program inv settled) {state : State} {run : CompensationRun} {scope : ScopeOccurrenceId}
    (member : run ∈ state.slots.compensation.runs) (own : run.scope = scope) {record : Compensable}
    (pending : record ∈ run.pending) (element : ElementId) (locals : List (String × Value)) {records : List Compensable}
    (kept : ∀ child ∈ records, ∀ named ∈ recordElements child, named ∈ recordElements record) :
    ∀ child ∈ records,
      RecordFrom program (state.enterScope element scope locals none).1 child (state.enterScope element scope locals none).2 := by
  subst own
  obtain ⟨link, -, scopesEq, slotsEq⟩ := ops.entered state element run.scope locals
  intro child inside
  have linked : InstanceLinked program (state.enterScope element run.scope locals none).1
      (state.enterScope element run.scope locals none).2 run.scope :=
    .parent { id := (state.enterScope element run.scope locals none).2, element := some element, occurrence := none }
      run.scope (by rw [scopesEq]; exact List.mem_append_right _ (List.mem_singleton_self _)) link (Or.inl rfl)
  exact .inl (RecordHeld.narrow (.pending (by rw [slotsEq]; exact member) pending) (kept child inside) linked.symm)

theorem ended_store {inv : State → Prop} {settled : State → Nat → Prop} {program : Program} (ops : RunsOps program inv settled) {state : State}
    (holds : inv state) (scope : ScopeOccurrenceId) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs)
    (kept : ∀ run ∈ state.slots.compensation.runs, run.scope ≠ scope → run ∈ compensation.runs)
    (retained : compensation.retained = state.slots.compensation.retained) :
    Ended inv settled scope state { state with slots := { state.slots with compensation } } :=
  have stored := ops.store state compensation holds (fun run member => .inl (held run member)) (held_running held)
    (held_resumes holds held) (.held (fun _ member => retained ▸ member) fun run member =>
      ⟨run, held run member, rfl, rfl, fun _ => id⟩)
  ⟨stored.1, .same stored.2 rfl rfl rfl (.refl _), rfl, held, kept⟩

theorem ended_cancel {inv : State → Prop} {settled : State → Nat → Prop} {program : Program} (ops : RunsOps program inv settled) {state : State}
    (holds : inv state) (scope : ScopeOccurrenceId) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs)
    (kept : ∀ run ∈ state.slots.compensation.runs, run.scope ≠ scope → run ∈ compensation.runs)
    (retained : compensation.retained = state.slots.compensation.retained) (occurrence : Nat) :
    Ended inv settled scope state (({ state with slots := { state.slots with compensation } } : State).signal (.cancel occurrence)) :=
  have stored := ended_store ops holds scope compensation held kept retained
  have cancelled := ops.cancel _ occurrence stored.1
  have shape := ops.signalled { state with slots := { state.slots with compensation } } (.cancel occurrence)
  ⟨cancelled.1, stored.2.1.trans (.same cancelled.2 shape.1 shape.2.1 (congrArg (·.multiInstances) shape.2.2)
    (ops.signalGrows _ _)),
    shape.1.trans stored.2.2.1, fun run member => by
      rw [shape.2.2] at member
      exact held run member, fun run member other => by
      rw [shape.2.2]
      exact kept run member other⟩

/-- A handler begun in a context entered below a scope occurrence that stands keeps what `Compensation.beginHandler`
keeps. -/
theorem handler_keeps {inv : State → Prop} {settled : State → Nat → Prop} {program : Program} (ops : RunsOps program inv settled) {state : State}
    (holds : inv state) {scope : ScopeOccurrenceId} (stands : scope ∈ state.scopes.map (·.id)) (handler : ElementId)
    (anchor : Laws.Flow.RecordAnchor state handler scope)
    {locals : List (String × Value)} (compensation : Compensations)
    (runs : compensation.runs = (state.enterScope handler scope locals none).1.slots.compensation.runs)
    (provenance : StoredFrom program (state.enterScope handler scope locals none).1
      (ResumeQueued inv (state.enterScope handler scope locals none).1) compensation) :
    Begun inv settled scope state ({ (state.enterScope handler scope locals none).1 with
      slots := { (state.enterScope handler scope locals none).1.slots with compensation } }.signal (.begin
        { element := handler, scope := (state.enterScope handler scope locals none).2, continuation := .compensation scope }))
      (state.enterScope handler scope locals none).2 := by
  obtain ⟨link, issuedNext, scopesEq, slotsEq⟩ := ops.entered state handler scope locals
  obtain ⟨unissued, issuedAfter, grows⟩ := ops.fresh state handler scope locals holds stands
  have enter := ops.enter state handler scope locals holds stands anchor
  generalize entering : state.enterScope handler scope locals none = entered
    at link issuedNext scopesEq slotsEq unissued issuedAfter grows enter runs provenance
  have fresh : ∀ entry ∈ state.scopes, entry.id ≠ entered.2 := fun entry member same =>
    unissued (same ▸ ops.issued state holds entry member)
  have stored := ops.store entered.1 compensation enter.1 (fun run member => .inl (runs ▸ member))
    (held_running fun run member => runs ▸ member) (held_resumes enter.1 fun run member => runs ▸ member) provenance
  have standsEntered : entered.2 ∈ ({ entered.1 with slots := { entered.1.slots with compensation } } : State).scopes.map (·.id) := by
    change _ ∈ entered.1.scopes.map _
    rw [scopesEq]
    simp
  have entry : ∃ entry ∈ ({ entered.1 with slots := { entered.1.slots with compensation } } : State).scopes, entry.id = entered.2 ∧
      entry.element = some handler ∧ entry.calledInstance = none := by
    change ∃ entry ∈ entered.1.scopes, _
    rw [scopesEq]
    exact ⟨_, List.mem_append_right _ (List.mem_singleton_self _), rfl, rfl, rfl⟩
  have begun := ops.begin _ handler _ scope stored.1 standsEntered entry
  have shape := ops.signalled { entered.1 with slots := { entered.1.slots with compensation } }
    (.begin { element := handler, scope := entered.2, continuation := .compensation scope })
  have scopesAfter : (({ entered.1 with slots := { entered.1.slots with compensation } } : State).signal
      (.begin { element := handler, scope := entered.2, continuation := .compensation scope })).scopes = state.scopes ++
      [{ id := entered.2, element := some handler, occurrence := none }] :=
    shape.1.trans scopesEq
  have signalGrows := ops.signalGrows { entered.1 with slots := { entered.1.slots with compensation } }
    (.begin { element := handler, scope := entered.2, continuation := .compensation scope })
  refine ⟨begun.1, ⟨?_, fun entry member => ?_, fun id settled => begun.2 id (stored.2 id (enter.2 id settled)),
    fun body member => ?_, grows.trans signalGrows⟩, fun entry member => by rw [scopesAfter]; exact List.mem_append_left _ member,
    ⟨unissued, signalGrows.issued issuedAfter⟩, fun entry member same => ?_, fun run member _ => ?_⟩
  · rw [shape.2.1]
    change state.nextIssue ≤ entered.1.nextIssue
    omega
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr unissued
  · rw [shape.2.2] at member
    change body ∈ entered.1.slots.multiInstances at member
    rwa [slotsEq] at member
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact absurd same (fresh entry old)
    · rw [List.mem_singleton.mp new]
      exact link
  · rw [shape.2.2]
    change run ∈ compensation.runs
    rw [runs, slotsEq]
    exact member

end Kernel.Laws.Compensation
