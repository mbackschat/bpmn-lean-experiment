module

public import Kernel.Hooks

/-! # Laws of compensation runs: what preserving an invariant needs

What `Kernel.Laws.Compensation` needs to show that beginning, advancing and releasing compensation runs keep an
invariant `inv` of the state, given which occurrences it calls settled, stated without reading
`Kernel.Feature.Compensation`: what a run must satisfy in the state holding it (`Fits`), the operations record its
hooks need (`RunsOps`), and how the state evolves while runs begin and end (`Follows`). Nothing executable imports
this module.
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
  /-- The records and runs replaced, each run held before or fitting. -/
  store : ∀ state compensation, inv state →
    (∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs ∨ Fits settled state run) →
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
  occur : ∀ state element scope leave writes rule, inv state → inv (state.signal (.occur element scope leave writes rule)) ∧
    ∀ other, settled state other → settled (state.signal (.occur element scope leave writes rule)) other
  /-- A handler's begin in its context. -/
  begin : ∀ state handler context scope, inv state → context ∈ state.scopes.map (·.id) →
    inv (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope })) ∧
      ∀ other, settled state other →
        settled (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope })) other
  /-- A context left, which keeps its parent standing; it is a running handler's context, so an invariant that
  keeps every other scope occurrence a hook does not own (a Multi-Instance instance's) is kept by leaving it. -/
  leave : ∀ state entry parent, inv state → entry ∈ state.scopes → entry.parent = some parent →
    (∃ run ∈ state.slots.compensation.runs, entry.id ∈ run.running.map (·.1)) →
    inv (state.leaveScope entry.id) ∧ parent ∈ (state.leaveScope entry.id).scopes.map (·.id) ∧
      (state.leaveScope entry.id).nextIssue = state.nextIssue ∧ (∀ kept ∈ (state.leaveScope entry.id).scopes, kept ∈ state.scopes) ∧
      ∀ id, settled state id → settled (state.leaveScope entry.id) id

/-- `after` follows `before` while runs begin, advance and end: nothing issued is issued again, each scope occurrence
of `after` stood in `before` or was issued since, and what has settled stays settled. -/
def Follows (settled : State → Nat → Prop) (before after : State) : Prop :=
  before.nextIssue ≤ after.nextIssue ∧
    (∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ before.nextIssue ≤ entry.id.value) ∧
    ∀ id, settled before id → settled after id

theorem Follows.refl {settled : State → Nat → Prop} (state : State) : Follows settled state state :=
  ⟨Nat.le_refl _, fun _ member => .inl member, fun _ => id⟩

theorem Follows.trans {settled : State → Nat → Prop} {first second third : State} (one : Follows settled first second)
    (two : Follows settled second third) : Follows settled first third :=
  ⟨Nat.le_trans one.1 two.1, fun entry member => (two.2.1 entry member).elim (one.2.1 entry)
    fun fresh => .inr (Nat.le_trans one.1 fresh), fun id settled => two.2.2 id (one.2.2 id settled)⟩

/-- A change that keeps the scope occurrences and the issued identities and what has settled is followed. -/
theorem Follows.same {settled : State → Nat → Prop} {before after : State} (kept : ∀ id, settled before id → settled after id)
    (scopes : after.scopes = before.scopes) (issued : after.nextIssue = before.nextIssue) :
    Follows settled before after :=
  ⟨Nat.le_of_eq issued.symm, fun _ member => .inl (scopes ▸ member), kept⟩

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

/-- What ending a run leaves before it resumes: `inv`, what follows, every scope occurrence, and only runs held
before. -/
def Ended (inv : State → Prop) (settled : State → Nat → Prop) (state ended : State) : Prop :=
  inv ended ∧ Follows settled state ended ∧ ended.scopes = state.scopes ∧
    ∀ run ∈ ended.slots.compensation.runs, run ∈ state.slots.compensation.runs

end Kernel.Laws.Compensation
