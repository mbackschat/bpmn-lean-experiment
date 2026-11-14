module

public import Kernel.Laws.MultiInstance.Rules
public import Kernel.Feature.MultiInstance
import all Kernel.Feature.MultiInstance

/-! # Laws of Multi-Instance Activities

What `Kernel.Feature.MultiInstance`'s hooks keep: the state invariant of the proof wave through the operations record
`MultiInstanceOps`, and the Multi-Instance lane's rules of `Kernel.Laws.MultiInstance.Rules`. This is the one module
that sees the feature's bodies. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel
open Kernel.Laws.State (Within)

/-! ## Preservation

A body that completes completes the occurrence its run holds, which may since have left the state; `MultiInstanceOps`
names what such an occurrence keeps as `settled`, which `Kernel.Proofs.Step` fills with `Laws.State.Settled`. An
arrival enters the body's scope occurrence below its own and one per instance below that, and queues each instance's
begin, which names no reservation, in its instance's scope occurrence. -/

/-- What the Multi-Instance hooks need of the state operations they apply, for an invariant `inv` and what the
occurrence a body completes keeps, `settled`. -/
structure MultiInstanceOps (inv : State → Prop) (settled : State → Nat → Prop) : Prop where
  bodies : ∀ state run, inv state → run ∈ state.slots.multiInstances → settled state run.occurrence
  placed : ∀ state run, inv state → run ∈ state.slots.multiInstances → Laws.State.Placed state run
  complete : ∀ state id leave writes rule, inv state → settled state id →
    inv (state.signal (.complete id leave writes rule))
  begun : ∀ state occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    settled state occurrence.id
  housed : ∀ state occurrence, inv state → occurrence ∈ state.occurrences →
    occurrence.scope ∈ Laws.State.scopeIds state
  hold : ∀ state held, inv state → inv (state.hold held)
  /-- A scope occurrence entered below one that stands; it alone holds the identity entering issues. -/
  enter : ∀ state element parent locals owner, inv state → parent ∈ Laws.State.scopeIds state →
    (∀ id, owner = some id → ∃ occurrence ∈ state.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = parent) → inv (state.enterScope element parent locals owner).1 ∧
      (∀ id, settled state id → settled (state.enterScope element parent locals owner).1 id) ∧
      ∀ entry ∈ state.scopes, entry.id ≠ (state.enterScope element parent locals owner).2
  arm : ∀ state occurrence element, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    inv (state.signal (.arm occurrence.id element occurrence.scope)) ∧
      ∀ id, settled state id → settled (state.signal (.arm occurrence.id element occurrence.scope)) id
  begin : ∀ state request, inv state → Laws.State.names request = [] → request.scope ∈ Laws.State.scopeIds state →
    inv (state.signal (.begin request)) ∧ ∀ id, settled state id → settled (state.signal (.begin request)) id
  defer : ∀ state requests, inv state →
    (∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state) →
    inv (state.deferBegins requests) ∧ ∀ id, settled state id → settled (state.deferBegins requests) id
  runs : ∀ state runs, inv state → (∀ run ∈ runs, run ∈ state.slots.multiInstances ∨
      settled state run.occurrence ∧ Laws.State.Placed state run) →
    inv { state with slots := { state.slots with multiInstances := runs } } ∧
      ∀ id, settled state id → settled { state with slots := { state.slots with multiInstances := runs } } id
  /-- An instance's scope occurrence left, which keeps the body's standing. -/
  leave : ∀ state run scope, inv state → run ∈ state.slots.multiInstances → Iteration.active scope ∈ run.instances →
    scope ∈ Laws.State.scopeIds state → inv (state.leaveScope scope) ∧ settled (state.leaveScope scope) run.occurrence ∧
      run.scope ∈ Laws.State.scopeIds (state.leaveScope scope) ∧ Laws.State.Placed (state.leaveScope scope) run
  write : ∀ state scope writes rule, inv state → inv (state.signal (.write scope writes rule)) ∧
    ∀ id, settled state id → settled (state.signal (.write scope writes rule)) id

/-- `Hooks.completeBody` keeps `inv`: an idle body completes its run's occurrence. -/
theorem completeBody_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance} {occurrence : Occurrence}
    {state after : State} (holds : inv state)
    (ran : Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after) : inv after := by
  unfold Feature.MultiInstance.completeBody Feature.MultiInstance.runOf? at ran
  split at ran
  · cases ran
  · rename_i run found
    cases ran
    exact ops.complete _ _ _ _ _ holds (ops.bodies _ _ holds (List.mem_of_find?_eq_some found))

/-- A property every step of a left fold keeps over the list's members holds of the fold. -/
theorem foldl_keeps {α β : Type} (P : α → Prop) (f : α → β → α) :
    ∀ (l : List β) (a : α), (∀ a b, b ∈ l → P a → P (f a b)) → P a → P (l.foldl f a)
  | [], _, _, holds => holds
  | b :: l, a, step, holds =>
    foldl_keeps P f l (f a b) (fun a' b' member => step a' b' (List.mem_cons_of_mem _ member)) (step a b (by simp) holds)

/-- What a body keeps while it enters and queues its instances, `instances` its slots so far: `inv`, that its
occurrence has settled, its scope occurrence, its instances' placement and the scope occurrences the queued begins
name. -/
def Entering (inv : State → Prop) (settled : State → Nat → Prop) (run : MultiInstanceRun) (state : State)
    (instances : List Iteration) (requests : List BeginRequest) : Prop :=
  inv state ∧ settled state run.occurrence ∧ run.scope ∈ Laws.State.scopeIds state ∧
    Laws.State.Placed state { run with instances } ∧
    ∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state

/-- A change that keeps the scope occurrences and the counter keeps what a body keeps while it enters. -/
theorem Entering.frame {inv : State → Prop} {settled : State → Nat → Prop} {run : MultiInstanceRun}
    {state after : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (holds : inv after)
    (carried : settled after run.occurrence) (scopes : after.scopes = state.scopes)
    (issued : after.nextIssue = state.nextIssue) : Entering inv settled run after instances requests := by
  obtain ⟨_, _, stands, rest⟩ := entering
  obtain ⟨placed, queued⟩ := rest
  have same : Laws.State.scopeIds after = Laws.State.scopeIds state := by simp [Laws.State.scopeIds, scopes]
  exact ⟨holds, carried, same ▸ stands, placed.transport (Nat.le_of_eq issued.symm)
    (fun _ member => .inl (scopes ▸ member)), fun request member => same ▸ queued request member⟩

/-- Queuing the instances' begins keeps what a body keeps while it enters. -/
theorem queueInstances_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {mode : MultiInstanceMode} {run : MultiInstanceRun} {state : State} {instances : List Iteration}
    {requests : List BeginRequest} (entering : Entering inv settled run state instances requests) :
    Entering inv settled run (Feature.MultiInstance.queueInstances ctx mode requests state) instances [] := by
  have empty : ∀ {current}, Entering inv settled run current instances requests →
      Entering inv settled run current instances [] := fun held => ⟨held.1, held.2.1, held.2.2.1, held.2.2.2.1, by simp⟩
  have signalled : Entering inv settled run
      (requests.foldl (fun state request => state.signal (.begin request)) state) instances requests := by
    refine foldl_keeps (fun state => Entering inv settled run state instances requests) _ requests state
      (fun current request member held => ?_) entering
    obtain ⟨begun, carry⟩ := ops.begin _ _ held.1 (held.2.2.2.2 request member).1 (held.2.2.2.2 request member).2
    exact held.frame begun (carry _ held.2.1) (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq])
  unfold Feature.MultiInstance.queueInstances
  split
  · exact empty signalled
  · split
    · obtain ⟨deferred, carry⟩ := ops.defer _ _ entering.1 entering.2.2.2.2
      exact empty (entering.frame deferred (carry _ entering.2.1) (by rw [Laws.State.deferBegins_eq])
        (by rw [Laws.State.deferBegins_eq]))
    · exact empty signalled

/-- Entering one instance's scope occurrence below the body's keeps what the body keeps, its slot active there and its
begin queued. -/
theorem enterInstance_entering {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {run : MultiInstanceRun} {state : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (index : Nat) (locals : List (String × Value))
    (continuation : Continuation) :
    Entering inv settled run (state.enterScope run.element run.scope locals none).1
      (instances.set index (.active (state.enterScope run.element run.scope locals none).2))
      (requests ++ [{ element := run.element, continuation, scope := (state.enterScope run.element run.scope
        locals none).2 }]) := by
  obtain ⟨holds, carried, stands, rest⟩ := entering
  obtain ⟨placed, queued⟩ := rest
  obtain ⟨entered, carry, fresh⟩ := ops.enter state run.element run.scope locals none holds stands
    fun _ named => by cases named
  rw [Laws.State.enterScope_eq] at entered carry fresh ⊢
  refine ⟨entered, carry _ carried, by simp [Laws.State.scopeIds] at stands ⊢; exact .inl stands,
    fun scope active => ?_, fun request inside => ?_⟩
  · rcases List.mem_or_eq_of_mem_set active with old | new
    · obtain ⟨below, parent⟩ := placed scope old
      refine ⟨Nat.lt_succ_of_lt below, fun entry member named => ?_⟩
      rcases List.mem_append.mp member with present | added
      · exact parent entry present named
      · rw [List.mem_singleton.mp added] at named
        rw [← named] at below
        exact absurd below (Nat.lt_irrefl _)
    · obtain rfl := Iteration.active.inj new
      refine ⟨Nat.lt_succ_self _, fun entry member named => ?_⟩
      rcases List.mem_append.mp member with present | added
      · exact absurd named (fresh entry present)
      · rw [List.mem_singleton.mp added]
  · rcases List.mem_append.mp inside with old | new
    · refine ⟨(queued request old).1, ?_⟩
      have := (queued request old).2
      simp [Laws.State.scopeIds] at this ⊢
      exact .inl this
    · rw [List.mem_singleton.mp new]
      exact ⟨by simp [Laws.State.names], by simp [Laws.State.scopeIds]⟩

/-- Entering and queuing a body's instances below its scope occurrence keeps `inv`. -/
theorem beginInstances_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances []) :
    inv (Feature.MultiInstance.beginInstances ctx loop items run state) := by
  unfold Feature.MultiInstance.beginInstances
  split
  rename_i current instances requests folded
  have same := congrArg (fun acc : State × List Iteration × List BeginRequest =>
    Entering inv settled run acc.1 acc.2.1 acc.2.2) folded
  have done : Entering inv settled run current instances requests :=
    same.mp (foldl_keeps (fun acc : State × List Iteration × List BeginRequest =>
      Entering inv settled run acc.1 acc.2.1 acc.2.2) _ _ _
        (fun acc index _ held => enterInstance_entering ops held index _ _) entering)
  obtain ⟨holds, carried, _, rest⟩ := queueInstances_keeps (ctx := ctx) (mode := loop.mode) ops done
  have placed := rest.1
  unfold Feature.MultiInstance.setRun
  refine (ops.runs _ _ holds fun other inside => ?_).1
  dsimp only at inside
  split at inside
  · obtain ⟨found, kept, rfl⟩ := List.mem_map.mp inside
    split
    · exact .inr ⟨carried, placed⟩
    · exact .inl kept
  · rcases List.mem_append.mp inside with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr ⟨carried, placed⟩

/-- Entering the body's scope occurrence below a begun occurrence's own, which it owns, arming its boundaries or not, and
beginning the instances below it, none active yet, keeps `inv`. -/
theorem enterBody_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {occurrence : Occurrence} {state : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId)
    (locals : List (String × Value)) (unarmed : Bool) (collection : Value) (instances : List Iteration)
    (waiting : ∀ scope, Iteration.active scope ∉ instances) :
    inv (Feature.MultiInstance.beginInstances ctx loop items
      { scope := (state.enterScope element occurrence.scope locals (some occurrence.id)).2, element,
        occurrence := occurrence.id, collection, instances }
      (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope))) := by
  have stands := ops.housed _ _ holds member
  obtain ⟨entered, carry, _⟩ := ops.enter state element occurrence.scope locals (some occurrence.id) holds stands
    fun id named => ⟨occurrence, member, Option.some.inj named, begun, rfl⟩
  have carried := carry _ (ops.begun _ _ holds member begun)
  rw [Laws.State.enterScope_eq] at entered carried ⊢
  refine beginInstances_keeps ops ?_
  have none : ∀ (current : State) (run : MultiInstanceRun), run.instances = instances →
      Laws.State.Placed current { run with instances := run.instances } := fun _ run same scope active => by
    rw [same] at active
    exact absurd active (waiting scope)
  cases unarmed
  · have present : occurrence ∈ (_ : State).occurrences := member
    obtain ⟨armed, carryArm⟩ := ops.arm _ occurrence element entered present begun
    refine ⟨armed, carryArm _ carried, ?_, none _ _ rfl, fun _ none => by cases none⟩
    rw [Laws.State.signal_eq]
    simp [Laws.State.scopeIds]
  · exact ⟨entered, carried, by simp [Laws.State.scopeIds], none _ _ rfl, fun _ none => by cases none⟩

/-- `Hooks.arriveMultiInstance` keeps `inv`: an unavailable read holds the begun occurrence, an empty body completes
it, and otherwise it enters the body's scope occurrence, which it owns, arms its boundaries and begins the instances. -/
theorem arriveMultiInstance_keeps {inv : State → Prop} {settled : State → Nat → Prop}
    (ops : MultiInstanceOps inv settled) {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences)
    (begun : occurrence.begun = true)
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    inv after := by
  unfold Feature.MultiInstance.arriveMultiInstance at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · cases ran
  · split at ran
    · cases ran
      exact ops.hold _ _ holds
    · cases ran
      exact ops.complete _ _ _ _ _ holds (ops.begun _ _ holds member begun)
    · cases ran
      exact enterBody_keeps ops holds member begun _ _ _ _ _ fun _ active => by simp at active

/-- An instance's completion, leaving its scope occurrence and recording its slot, keeps what the body keeps while it
enters, whatever its slot now records. -/
theorem left_entering {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {run next : MultiInstanceRun} {scope : ScopeOccurrenceId} {state : State} (holds : inv state)
    (member : run ∈ state.slots.multiInstances) (active : Iteration.active scope ∈ run.instances)
    (stands : scope ∈ Laws.State.scopeIds state) (occurrence : next.occurrence = run.occurrence)
    (body : next.scope = run.scope) (fewer : ∀ inner, Iteration.active inner ∈ next.instances →
      Iteration.active inner ∈ run.instances) :
    Entering inv settled next (Feature.MultiInstance.setRun (state.leaveScope scope) next) next.instances [] := by
  obtain ⟨left, carried, standing, placed⟩ := ops.leave state run scope holds member active stands
  have placedNext : Laws.State.Placed (state.leaveScope scope) next := fun inner inside => by
    rw [body]
    exact placed inner (fewer inner inside)
  obtain ⟨recorded, carry⟩ := ops.runs (state.leaveScope scope)
    (Feature.MultiInstance.setRun (state.leaveScope scope) next).slots.multiInstances left fun other inside => by
      unfold Feature.MultiInstance.setRun at inside
      dsimp only at inside
      split at inside
      · obtain ⟨found, kept, rfl⟩ := List.mem_map.mp inside
        split
        · exact .inr ⟨occurrence ▸ carried, placedNext⟩
        · exact .inl kept
      · rcases List.mem_append.mp inside with old | new
        · exact .inl old
        · rw [List.mem_singleton.mp new]
          exact .inr ⟨occurrence ▸ carried, placedNext⟩
  exact ⟨recorded, carry _ (occurrence ▸ carried), body ▸ standing, placedNext, fun _ none => by cases none⟩

/-- Writing the body's counters keeps what the body keeps while it enters. -/
theorem written_entering {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {run : MultiInstanceRun} {state : State} (entering : Entering inv settled run state run.instances [])
    (scope : ScopeOccurrenceId) (writes : List (String × Value)) (rule : WriteRule) :
    Entering inv settled run (state.signal (.write scope writes rule)) run.instances [] := by
  obtain ⟨written, carry⟩ := ops.write state scope writes rule entering.1
  exact entering.frame written (carry _ entering.2.1) (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq])

/-- A body whose instances are done completes its occurrence. -/
theorem finish_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {loop : MultiInstance} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances []) :
    inv (Feature.MultiInstance.finish ctx loop run state) := by
  unfold Feature.MultiInstance.finish
  exact ops.complete _ _ _ _ _ entering.1 entering.2.1

/-- `Hooks.instanceCompleted` keeps `inv` for an instance in a scope occurrence that stands: it leaves the instance's
scope occurrence and records its slot, then completes the body or begins the next instances. -/
theorem instanceCompleted_keeps {inv : State → Prop} {settled : State → Nat → Prop}
    (ops : MultiInstanceOps inv settled) {ctx : Ctx} {body : Nat} {occurrence : Occurrence}
    {writes : List (String × Value)} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ Laws.State.scopeIds state)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) : inv after := by
  unfold Feature.MultiInstance.instanceCompleted at ran
  simp only [bind, Except.bind] at ran
  cases found : Feature.MultiInstance.runOf? state body with
  | none => rw [found] at ran; cases ran
  | some run =>
  rw [found] at ran
  dsimp only at ran
  have member : run ∈ state.slots.multiInstances := by
    unfold Feature.MultiInstance.runOf? at found
    exact List.mem_of_find?_eq_some found
  cases looped : Feature.MultiInstance.loopOf? ctx run with
  | none => rw [looped] at ran; cases ran
  | some loop =>
  rw [looped] at ran
  dsimp only at ran
  split at ran
  rotate_left
  · cases ran
  rename_i index indexed
  have active : Iteration.active occurrence.scope ∈ run.instances := by
    obtain ⟨bound, matched, _⟩ := List.findIdx?_eq_some_iff_getElem.mp indexed
    have inside := List.getElem_mem bound
    generalize run.instances[index] = slot at matched inside
    cases slot <;> simp_all
  have recorded : ∀ {next : MultiInstanceRun}, next.occurrence = run.occurrence → next.scope = run.scope →
      (∀ inner, Iteration.active inner ∈ next.instances → Iteration.active inner ∈ run.instances) →
      Entering inv settled next (Feature.MultiInstance.setRun (state.leaveScope occurrence.scope) next) next.instances [] :=
    fun occurrence body fewer => left_entering ops holds member active stands occurrence body fewer
  have fewer : ∀ (output : Option Value) inner, Iteration.active inner ∈ run.instances.set index (.completed output) →
      Iteration.active inner ∈ run.instances := fun _ _ inside =>
    (List.mem_or_eq_of_mem_set inside).resolve_right (by simp)
  repeat' split at ran
  all_goals first
    | (cases ran; done)
    | (cases ran; exact finish_keeps ops (recorded (by rfl) (by rfl) (fewer _)))
    | (cases ran; exact finish_keeps ops (written_entering ops (recorded (by rfl) (by rfl) (fewer _)) _ _ _))
    | (cases ran; exact beginInstances_keeps ops (recorded (by rfl) (by rfl) (fewer _)))
    | (cases ran; exact beginInstances_keeps ops (written_entering ops (recorded (by rfl) (by rfl) (fewer _)) _ _ _))

end Kernel.Laws.MultiInstance
