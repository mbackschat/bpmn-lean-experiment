module

public import Kernel.Laws.MultiInstance.Rules
public import Kernel.Laws.IL
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

/-! ## The body's slot record

`MultiInstance.setRun` sets a body's slot record in place of every record of its occurrence, or adds it. -/

/-- Setting a body's slot record changes the Multi-Instance slot only. -/
theorem setRun_eq (state : State) (next : MultiInstanceRun) :
    Feature.MultiInstance.setRun state next = { state with slots := { state.slots with
      multiInstances := (Feature.MultiInstance.setRun state next).slots.multiInstances } } := by
  unfold Feature.MultiInstance.setRun
  rfl

/-- A record after setting `next` is `next` or one of another occurrence held before. -/
theorem mem_setRun {state : State} {next other : MultiInstanceRun}
    (member : other ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances) :
    (other ∈ state.slots.multiInstances ∧ other.occurrence ≠ next.occurrence) ∨ other = next := by
  unfold Feature.MultiInstance.setRun at member
  dsimp only at member
  split at member
  · obtain ⟨found, kept, rfl⟩ := List.mem_map.mp member
    split
    · exact .inr rfl
    · rename_i differs
      exact .inl ⟨kept, fun same => differs (by simp [same])⟩
  · rename_i absent
    rcases List.mem_append.mp member with old | new
    · refine .inl ⟨old, fun same => absent ?_⟩
      exact List.any_eq_true.mpr ⟨other, old, by simp [same]⟩
    · exact .inr (List.mem_singleton.mp new)

/-- The record set is held. -/
theorem setRun_mem (state : State) (next : MultiInstanceRun) :
    next ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances := by
  unfold Feature.MultiInstance.setRun
  dsimp only
  split
  · rename_i present
    obtain ⟨found, inside, same⟩ := List.any_eq_true.mp present
    exact List.mem_map.mpr ⟨found, inside, by simp [same]⟩
  · exact List.mem_append_right _ (List.mem_singleton_self _)

/-- A record of another occurrence stays. -/
theorem setRun_keeps {state : State} {next other : MultiInstanceRun} (member : other ∈ state.slots.multiInstances)
    (differs : other.occurrence ≠ next.occurrence) :
    other ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances := by
  unfold Feature.MultiInstance.setRun
  dsimp only
  split
  · exact List.mem_map.mpr ⟨other, member, by simp [differs]⟩
  · exact List.mem_append_left _ member

/-- Setting a body's slot record keeps one record per body occurrence. -/
theorem setRun_keyed {state : State} (keyed : RunsKeyed state) (next : MultiInstanceRun) :
    RunsKeyed (Feature.MultiInstance.setRun state next) := by
  unfold RunsKeyed Feature.MultiInstance.setRun at *
  dsimp only
  split
  · rw [List.map_map]
    have same : ((·.occurrence) ∘ fun other : MultiInstanceRun =>
        if (other.occurrence == next.occurrence) = true then next else other) = (·.occurrence) := by
      funext other
      simp only [Function.comp]
      split
      · rename_i equal
        exact (beq_iff_eq.mp equal).symm
      · rfl
    rw [same]
    exact keyed
  · rename_i absent
    rw [List.map_append]
    refine List.nodup_append.mpr ⟨keyed, by simp, fun occurrence old added fresh same => ?_⟩
    simp only [List.map_cons, List.map_nil, List.mem_singleton] at fresh
    obtain ⟨other, inside, named⟩ := List.mem_map.mp old
    exact absent (List.any_eq_true.mpr ⟨other, inside, by simp [named, same, fresh]⟩)

/-- `run` with slot `index` filled by `output` and the result names `results`: the slot record an instance's
completion sets (`MultiInstance.instanceCompleted`). -/
def recorded (run : MultiInstanceRun) (index : Nat) (output : Option Value) (results : List String) :
    MultiInstanceRun :=
  { run with instances := run.instances.set index (.completed output), results }

/-- The state an instance's completion leaves: its scope occurrence `scope` left and the body's slot record `next`
set. -/
def leftWith (state : State) (scope : ScopeOccurrenceId) (next : MultiInstanceRun) : State :=
  Feature.MultiInstance.setRun (state.leaveScope scope) next

/-- What an instance's completion fills its slot with fits the loop of the body's element and the input collection:
an output when the loop names an output data item, a String in a String List body (`MultiInstance.submitted`). -/
def OutputFits (program : Program) (run : MultiInstanceRun) (output : Option Value) : Prop :=
  (∀ loop, LoopOf program run.element loop → loop.outputDataItem.isSome → output.isSome) ∧
    ∀ value, output = some value → ∀ items, run.collection = .stringList items → ∃ text, value = .string text

/-- A scope occurrence entered for an instance of the body `base`: it stands, directly below the body's scope
occurrence, owned by no occurrence, holding no compensation handler, and no slot of `base` is active in it. -/
def EnteredFor (s : State) (base : MultiInstanceRun) (scope : ScopeOccurrenceId) : Prop :=
  scope ∈ Laws.State.scopeIds s ∧
    (∀ entry ∈ s.scopes, entry.id = scope → entry.parent = some base.scope ∧ entry.occurrence = none) ∧
    (∀ other ∈ s.slots.compensation.runs, scope ∉ other.running.map (·.1)) ∧ Iteration.active scope ∉ base.instances

/-- What entering instances made of the body's slot record `base`: `next` differs only in the slots
`MultiInstance.opening` names under the loop's mode, each now active in a scope occurrence `EnteredFor` it, of its
own. -/
structure Opens (s : State) (base next : MultiInstanceRun) (loop : MultiInstance) : Prop where
  kept : next = { base with instances := next.instances }
  length : next.instances.length = base.instances.length
  unopened : ∀ index, index ∉ Feature.MultiInstance.opening loop.mode base.instances →
    next.instances[index]? = base.instances[index]?
  opened : ∀ index ∈ Feature.MultiInstance.opening loop.mode base.instances, ∃ scope,
    next.instances[index]? = some (.active scope) ∧ EnteredFor s base scope
  apart : ∀ (first second : Nat) (scope : ScopeOccurrenceId),
    first ∈ Feature.MultiInstance.opening loop.mode base.instances → next.instances[first]? = some (.active scope) →
    next.instances[second]? = some (.active scope) → first = second

/-! ## Preservation

A body that completes completes the occurrence its run holds, which may since have left the state; `MultiInstanceOps`
names what such an occurrence keeps as `settled`, which `Kernel.Proofs.Step` fills with `Laws.State.Settled`. An
arrival enters the body's scope occurrence below its own and one per instance below that, and queues each instance's
begin, which names no reservation, in its instance's scope occurrence. The two operations that set a body's slot record
carry what they set it to, `recorded` and `Opens`, so that an invariant over the slot records, such as the
Multi-Instance lane's, is kept by them alone and holds wherever a hook's other operations apply. -/

/-- What the Multi-Instance hooks need of the state operations they apply, for an invariant `inv` of states running
`program` and what the occurrence a body completes keeps, `settled`. -/
structure MultiInstanceOps (program : Program) (inv : State → Prop) (settled : State → Nat → Prop) : Prop where
  bodies : ∀ state run, inv state → run ∈ state.slots.multiInstances → settled state run.occurrence
  placed : ∀ state run, inv state → run ∈ state.slots.multiInstances → Laws.State.Placed state run
  complete : ∀ state id leave writes rule, inv state → settled state id →
    inv (state.signal (.complete id leave writes rule))
  begun : ∀ state occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    settled state occurrence.id
  housed : ∀ state occurrence, inv state → occurrence ∈ state.occurrences →
    occurrence.scope ∈ Laws.State.scopeIds state
  /-- Every scope occurrence was issued, so one entered later is new. -/
  issued : ∀ state, inv state → ∀ entry ∈ state.scopes, entry.id.value < state.nextIssue
  /-- Every running compensation handler's context was issued, so no scope occurrence entered later is one. -/
  contexts : ∀ state, inv state → ∀ run ∈ state.slots.compensation.runs, ∀ context ∈ run.running.map (·.1),
    context.value < state.nextIssue
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
  /-- An instance's completion recorded: its scope occurrence left and its slot filled with an output that fits,
  which keeps the body's occurrence settled, its scope occurrence standing and its instances placed. -/
  record : ∀ state run index scope output results, inv state → run ∈ state.slots.multiInstances →
    run.instances[index]? = some (.active scope) → scope ∈ Laws.State.scopeIds state → OutputFits program run output →
    inv (leftWith state scope (recorded run index output results)) ∧
      settled (leftWith state scope (recorded run index output results)) run.occurrence ∧
      run.scope ∈ Laws.State.scopeIds (leftWith state scope (recorded run index output results)) ∧
      Laws.State.Placed (leftWith state scope (recorded run index output results)) (recorded run index output results)
  /-- A body's slot record set once its instances are entered: `next` opens `base`, which, unless every slot of it
  waits, is the body's record already held and opens by its element's loop. -/
  runs : ∀ state base next loop, inv state → settled state next.occurrence → Laws.State.Placed state next →
    Opens state base next loop →
    ((∃ slot ∈ base.instances, slot ≠ .waiting) → base ∈ state.slots.multiInstances ∧ LoopOf program base.element loop) →
    inv (Feature.MultiInstance.setRun state next) ∧
      ∀ id, settled state id → settled (Feature.MultiInstance.setRun state next) id
  write : ∀ state scope writes rule, inv state → inv (state.signal (.write scope writes rule)) ∧
    ∀ id, settled state id → settled (state.signal (.write scope writes rule)) id

variable {program : Program} {inv : State → Prop} {settled : State → Nat → Prop}

/-- `Hooks.completeBody` keeps `inv`: an idle body completes its run's occurrence. -/
theorem completeBody_keeps (ops : MultiInstanceOps program inv settled)
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

/-- A property of the members folded so far, which each step of a left fold over `whole` extends by its member, holds
of the fold with all of `whole`. -/
theorem foldl_prefix {α β : Type} (P : List β → α → Prop) (f : α → β → α) (whole : List β) :
    ∀ (rest pre : List β) (a : α), pre ++ rest = whole →
      (∀ pre b post a, whole = pre ++ b :: post → P pre a → P (pre ++ [b]) (f a b)) → P pre a →
      P whole (rest.foldl f a)
  | [], pre, _, split, _, holds => by
    rw [List.append_nil] at split
    exact split ▸ holds
  | b :: rest, pre, a, split, step, holds =>
    foldl_prefix P f whole rest (pre ++ [b]) (f a b) (by rw [← split]; simp) step (step pre b rest a split.symm holds)

/-- What a body keeps while it enters and queues its instances, `instances` its slots so far: `inv`, that its
occurrence has settled, its scope occurrence, its instances' placement and the scope occurrences the queued begins
name. -/
def Entering (inv : State → Prop) (settled : State → Nat → Prop) (run : MultiInstanceRun) (state : State)
    (instances : List Iteration) (requests : List BeginRequest) : Prop :=
  inv state ∧ settled state run.occurrence ∧ run.scope ∈ Laws.State.scopeIds state ∧
    Laws.State.Placed state { run with instances } ∧
    ∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state

/-- A change that keeps the scope occurrences and the counter keeps what a body keeps while it enters. -/
theorem Entering.frame {run : MultiInstanceRun}
    {state after : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (holds : inv after)
    (carried : settled after run.occurrence) (scopes : after.scopes = state.scopes)
    (issued : after.nextIssue = state.nextIssue) : Entering inv settled run after instances requests := by
  obtain ⟨_, _, stands, rest⟩ := entering
  obtain ⟨placed, queued⟩ := rest
  have same : Laws.State.scopeIds after = Laws.State.scopeIds state := by simp [Laws.State.scopeIds, scopes]
  exact ⟨holds, carried, same ▸ stands, placed.transport (Nat.le_of_eq issued.symm)
    (fun _ member => .inl (scopes ▸ member)), fun request member => same ▸ queued request member⟩

/-- Queuing begins moves no scope occurrence, variable, slot or issued identity. -/
theorem queueInstances_frame (ctx : Ctx) (mode : MultiInstanceMode) (requests : List BeginRequest) (state : State) :
    (Feature.MultiInstance.queueInstances ctx mode requests state).scopes = state.scopes ∧
      (Feature.MultiInstance.queueInstances ctx mode requests state).variables = state.variables ∧
      (Feature.MultiInstance.queueInstances ctx mode requests state).slots = state.slots ∧
      (Feature.MultiInstance.queueInstances ctx mode requests state).nextIssue = state.nextIssue := by
  have signalled : ∀ (rest : List BeginRequest) (current : State),
      (rest.foldl (fun state request => state.signal (.begin request)) current).scopes = current.scopes ∧
      (rest.foldl (fun state request => state.signal (.begin request)) current).variables = current.variables ∧
      (rest.foldl (fun state request => state.signal (.begin request)) current).slots = current.slots ∧
      (rest.foldl (fun state request => state.signal (.begin request)) current).nextIssue = current.nextIssue := by
    intro rest
    induction rest with
    | nil => intro _; exact ⟨rfl, rfl, rfl, rfl⟩
    | cons request rest held =>
      intro current
      rw [List.foldl_cons]
      obtain ⟨scopes, variables, slots, issued⟩ := held (current.signal (.begin request))
      rw [Laws.State.signal_eq] at scopes variables slots issued ⊢
      exact ⟨scopes, variables, slots, issued⟩
  unfold Feature.MultiInstance.queueInstances
  split
  · exact signalled _ _
  · split
    · rw [Laws.State.deferBegins_eq]
      exact ⟨rfl, rfl, rfl, rfl⟩
    · exact signalled _ _

/-- Queuing the instances' begins keeps what a body keeps while it enters. -/
theorem queueInstances_keeps (ops : MultiInstanceOps program inv settled)
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

/-! ### Opening instances -/

/-- The instances `MultiInstance.opening` names wait. -/
theorem opening_waiting {mode : MultiInstanceMode} {instances : List Iteration} {index : Nat}
    (named : index ∈ Feature.MultiInstance.opening mode instances) : instances[index]? = some .waiting := by
  have waiting : ∀ {index}, index ∈ (instances.zipIdx.filterMap fun (slot, index) =>
      match slot with
      | .waiting => some index
      | .active _ => none
      | .completed _ => none) → instances[index]? = some .waiting := fun {index} member => by
    obtain ⟨⟨slot, at_⟩, inside, picked⟩ := List.mem_filterMap.mp member
    have found := List.mem_zipIdx_iff_getElem?.mp inside
    cases slot <;> simp at picked
    subst picked
    exact found
  unfold Feature.MultiInstance.opening at named
  cases mode with
  | parallel => exact waiting named
  | sequential =>
    dsimp only at named
    split at named
    · simp at named
    · exact waiting (List.mem_of_mem_take named)

/-- `MultiInstance.opening` names each slot once. -/
theorem opening_nodup (mode : MultiInstanceMode) (instances : List Iteration) :
    (Feature.MultiInstance.opening mode instances).Nodup := by
  have ordered : (instances.zipIdx.filterMap fun (slot, index) =>
      match slot with
      | .waiting => some index
      | .active _ => none
      | .completed _ => none).Pairwise (· < ·) := by
    refine List.Pairwise.filterMap (R := fun a b : Iteration × Nat => a.2 < b.2) _ ?_ ?_
    · intro first second lower one picked two picked'
      obtain ⟨slot, at_⟩ := first
      obtain ⟨slot', at'⟩ := second
      cases slot <;> cases slot' <;> simp at picked picked'
      subst picked picked'
      exact lower
    · have := List.pairwise_map (R := (· < ·)) (f := Prod.snd) (l := instances.zipIdx) |>.mp
      apply this
      rw [List.zipIdx_map_snd]
      exact List.pairwise_lt_range'
  unfold Feature.MultiInstance.opening
  cases mode with
  | parallel => exact ordered.imp Nat.ne_of_lt
  | sequential =>
    dsimp only
    split
    · exact List.nodup_nil
    · exact (ordered.imp Nat.ne_of_lt).sublist (List.take_sublist _ _)

/-- Entering one instance's scope occurrence below the body's keeps what the body keeps, its slot active there and its
begin queued. -/
theorem enterInstance_entering (ops : MultiInstanceOps program inv settled)
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

/-- Under `cibLocals` and an item local not named `loopCounter`, the scope occurrence `scope` holds
`loopCounter = index` (CIB-INT-0018). -/
def CounterIn (ctx : Ctx) (loop : MultiInstance) (s : State) (index : Nat) (scope : ScopeOccurrenceId) : Prop :=
  ctx.program.options.multiInstanceCounters = .cibLocals → Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter" →
    ∃ locals ∈ s.variables, locals.scope = scope ∧ ("loopCounter", Value.int index) ∈ locals.entries

/-- What entering the instances `done`, the first of those `MultiInstance.opening` names, keeps and records from the
state `start` the entering began in: `Entering`, an issue counter that only grows, the feature slots, each scope
occurrence new since `start` issued afresh below the body's and owned by no occurrence, the other slots as `run` had
them, and each entered slot active in a scope occurrence of its own issued since `start`, holding its counter. -/
structure Opening (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (loop : MultiInstance)
    (start : State) (run : MultiInstanceRun) (acc : State × List Iteration × List BeginRequest) (done : List Nat) :
    Prop where
  entering : Entering inv settled run acc.1 acc.2.1 acc.2.2
  issue : start.nextIssue ≤ acc.1.nextIssue
  slots : acc.1.slots = start.slots
  scopes : ∀ entry ∈ acc.1.scopes, entry ∈ start.scopes ∨
    start.nextIssue ≤ entry.id.value ∧ entry.parent = some run.scope ∧ entry.occurrence = none
  length : acc.2.1.length = run.instances.length
  untouched : ∀ index, index ∉ done → acc.2.1[index]? = run.instances[index]?
  entered : ∀ index ∈ done, ∃ scope, acc.2.1[index]? = some (.active scope) ∧
    (start.nextIssue ≤ scope.value ∧ scope.value < acc.1.nextIssue) ∧ scope ∈ Laws.State.scopeIds acc.1 ∧
    CounterIn ctx loop acc.1 index scope
  apart : ∀ first ∈ done, ∀ (second : Nat) (scope : ScopeOccurrenceId), acc.2.1[first]? = some (.active scope) →
    acc.2.1[second]? = some (.active scope) → first = second

/-- Entering the waiting slot `index` extends what entering the instances keeps and records. -/
theorem enterInstance_opening (ops : MultiInstanceOps program inv settled) {ctx : Ctx} {loop : MultiInstance}
    {start : State} {run : MultiInstanceRun} {s : State} {instances : List Iteration} {requests : List BeginRequest}
    {done : List Nat} (opening : Opening inv settled ctx loop start run (s, instances, requests) done) (index : Nat)
    (fresh : index ∉ done) (waiting : run.instances[index]? = some .waiting)
    (placedStart : ∀ scope, Iteration.active scope ∈ run.instances → scope.value < start.nextIssue)
    (locals : List (String × Value))
    (counted : ctx.program.options.multiInstanceCounters = .cibLocals →
      Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter" → ∃ earlier later,
        locals = earlier ++ ("loopCounter", Value.int index) :: later ∧ ∀ other ∈ later, other.1 ≠ "loopCounter")
    (continuation : Continuation) :
    Opening inv settled ctx loop start run ((s.enterScope run.element run.scope locals none).1,
      instances.set index (.active (s.enterScope run.element run.scope locals none).2),
      requests ++ [{ element := run.element, continuation, scope := (s.enterScope run.element run.scope
        locals none).2 }]) (done ++ [index]) := by
  have entering := enterInstance_entering ops opening.entering index locals continuation
  have below : index < instances.length := by
    rw [opening.length]
    exact (List.getElem?_eq_some_iff.mp waiting).1
  rw [Laws.State.enterScope_eq] at entering ⊢
  have issue := opening.issue
  have untouched := opening.untouched
  have entered := opening.entered
  have apart := opening.apart
  dsimp only at issue untouched entered apart
  refine ⟨entering, Nat.le_succ_of_le issue, opening.slots, fun entry member => ?_, by simp [opening.length],
    fun other outside => ?_, fun other inside => ?_, fun first inside second scope one two => ?_⟩
  · rcases List.mem_append.mp member with old | new
    · exact opening.scopes entry old
    · rw [List.mem_singleton.mp new]
      exact .inr ⟨issue, rfl, rfl⟩
  · have differs : index ≠ other := fun same => outside (by simp [same])
    rw [List.getElem?_set_ne differs]
    exact untouched other fun inside => outside (List.mem_append_left _ inside)
  · rcases List.mem_append.mp inside with old | new
    · have differs : index ≠ other := fun same => fresh (same ▸ old)
      obtain ⟨scope, slot, bounds, rest⟩ := entered other old
      obtain ⟨stands, counter⟩ := rest
      refine ⟨scope, by rw [List.getElem?_set_ne differs]; exact slot, ⟨bounds.1, Nat.lt_succ_of_lt bounds.2⟩,
        by simp [Laws.State.scopeIds] at stands ⊢; exact .inl stands, fun cib named => ?_⟩
      obtain ⟨locals', present, at_, entry⟩ := counter cib named
      exact ⟨locals', List.mem_append_left _ present, at_, entry⟩
    · rw [List.mem_singleton.mp new]
      refine ⟨⟨s.nextIssue⟩, by rw [List.getElem?_set_self below], ⟨issue, Nat.lt_succ_self _⟩,
        by simp [Laws.State.scopeIds], fun cib named => ?_⟩
      obtain ⟨earlier, later, split, last⟩ := counted cib named
      refine ⟨{ scope := ⟨s.nextIssue⟩, entries := keyed locals }, by simp, rfl, ?_⟩
      rw [split]
      exact Laws.State.mem_keyed earlier last
  · have fresh' : ∀ other, other ∈ done → ∀ scope', instances[other]? = some (.active scope') →
        scope'.value < s.nextIssue := fun other inside scope' slot => by
      obtain ⟨found, slot', bounds, _⟩ := entered other inside
      rw [slot] at slot'
      cases slot'
      exact bounds.2
    have older : ∀ other, other ≠ index → instances[other]? = some (.active ⟨s.nextIssue⟩) → False := by
      intro other differs slot
      by_cases inside' : other ∈ done
      · exact Nat.lt_irrefl _ (fresh' other inside' _ slot)
      · rw [untouched other inside'] at slot
        exact Nat.lt_irrefl _ (Nat.lt_of_lt_of_le (placedStart _ (List.mem_of_getElem? slot)) issue)
    rcases List.mem_append.mp inside with old | new
    · have differs : index ≠ first := fun same => fresh (same ▸ old)
      rw [List.getElem?_set_ne differs] at one
      by_cases at_ : index = second
      · subst at_
        rw [List.getElem?_set_self below] at two
        obtain rfl := Iteration.active.inj (Option.some.inj two)
        exact absurd (fresh' first old _ one) (Nat.lt_irrefl _)
      · rw [List.getElem?_set_ne at_] at two
        exact apart first old second scope one two
    · rw [List.mem_singleton.mp new] at one ⊢
      rw [List.getElem?_set_self below] at one
      obtain rfl := Iteration.active.inj (Option.some.inj one)
      by_cases at_ : index = second
      · exact at_
      · rw [List.getElem?_set_ne at_] at two
        exact absurd two fun slot => older second (Ne.symm at_) slot

/-- The locals an instance is entered with hold its `loopCounter` last under `cibLocals` and an item local not named
`loopCounter`. -/
theorem instanceLocals_counted (ctx : Ctx) (loop : MultiInstance) (index : Nat) (item : List (String × Value))
    (named : ∀ other ∈ item, ∃ name, Feature.MultiInstance.itemName ctx loop = some name ∧ other.1 = name) :
    ctx.program.options.multiInstanceCounters = .cibLocals →
      Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter" → ∃ earlier later,
        Feature.MultiInstance.counterLocals ctx (Feature.MultiInstance.instanceCounts index) ++ item =
          earlier ++ ("loopCounter", Value.int index) :: later ∧ ∀ other ∈ later, other.1 ≠ "loopCounter" := by
  intro cib apart
  refine ⟨[], item, ?_, fun other inside same => ?_⟩
  · unfold Feature.MultiInstance.counterLocals Feature.MultiInstance.instanceCounts
    rw [cib, Laws.IL.multiInstanceCounterNames_eq]
    rfl
  · obtain ⟨name, found, is⟩ := named other inside
    exact apart (by rw [found, ← is, same])

/-- What beginning a body's instances, from `state`, leaves in the state `queued` it sets the body's slot record in, to
`run` with the slots `instances`: what the body keeps while it enters, slots that open `run` by the loop's mode, the
feature slots of `state`, an issue counter that only grew, and each slot active anew in a scope occurrence issued since
`state` that, under `cibLocals`, holds its counter. -/
structure Begun (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (loop : MultiInstance) (state : State)
    (run : MultiInstanceRun) (queued : State) (instances : List Iteration) : Prop where
  entering : Entering inv settled run queued instances []
  opens : Opens queued run { run with instances } loop
  slots : queued.slots = state.slots
  issue : state.nextIssue ≤ queued.nextIssue
  counted : ∀ index scope, instances[index]? = some (.active scope) → run.instances[index]? = some (.active scope) ∨
    state.nextIssue ≤ scope.value ∧ CounterIn ctx loop queued index scope

/-- Beginning a body's instances, from a state where it keeps what it keeps while it enters, queues their begins in a
state it then sets the body's slot record in, as `Begun` says. -/
theorem beginInstances_spec (ops : MultiInstanceOps program inv settled) {ctx : Ctx} {loop : MultiInstance}
    {items : List Value} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances []) :
    ∃ queued instances, Feature.MultiInstance.beginInstances ctx loop items run state =
        Feature.MultiInstance.setRun queued { run with instances } ∧
      Begun inv settled ctx loop state run queued instances := by
  have placedStart : ∀ scope, Iteration.active scope ∈ run.instances → scope.value < state.nextIssue :=
    fun scope active => (entering.2.2.2.1 scope active).1
  unfold Feature.MultiInstance.beginInstances
  split
  rename_i current instances requests folded
  have opened : Opening inv settled ctx loop state run (current, instances, requests)
      (Feature.MultiInstance.opening loop.mode run.instances) := by
    rw [← folded]
    refine foldl_prefix (fun pre acc => Opening inv settled ctx loop state run acc pre) _ _ _ [] _ (by simp)
      (fun pre index post acc whole held => ?_)
      ⟨entering, Nat.le_refl _, rfl, fun entry member => .inl member, rfl, fun _ _ => rfl,
        fun _ none => (by cases none), fun _ none => (by cases none)⟩
    obtain ⟨s, held_instances, held_requests⟩ := acc
    have nodup := whole ▸ opening_nodup loop.mode run.instances
    have fresh : index ∉ pre := fun inside =>
      (List.nodup_append.mp nodup).2.2 index inside index (List.mem_cons_self ..) rfl
    have waiting := opening_waiting (whole ▸ List.mem_append_right _ (List.mem_cons_self ..) :
      index ∈ Feature.MultiInstance.opening loop.mode run.instances)
    refine enterInstance_opening ops held index fresh waiting placedStart _
      (instanceLocals_counted ctx loop index _ fun other inside => ?_) _
    split at inside
    · rename_i name value found _
      exact ⟨name, found, (List.mem_singleton.mp inside) ▸ rfl⟩
    · cases inside
  obtain ⟨scopes, variables, slots, issued⟩ := queueInstances_frame ctx loop.mode requests current
  have scopeIds : Laws.State.scopeIds (Feature.MultiInstance.queueInstances ctx loop.mode requests current) =
      Laws.State.scopeIds current := by simp [Laws.State.scopeIds, scopes]
  refine ⟨_, instances, rfl, queueInstances_keeps ops opened.entering, ⟨rfl, opened.length, fun index outside =>
    opened.untouched index outside, fun index inside => ?_, fun first second scope inside one two =>
    opened.apart first inside second scope one two⟩, slots.trans opened.slots, issued ▸ opened.issue, ?_⟩
  · obtain ⟨scope, slot, bounds, rest⟩ := opened.entered index inside
    refine ⟨scope, slot, scopeIds ▸ rest.1, fun entry member named => ?_, fun other held context => ?_, fun active => ?_⟩
    · rcases opened.scopes entry (scopes ▸ member) with old | new
      · have := ops.issued state entering.1 entry old
        rw [named] at this
        exact absurd bounds.1 (Nat.not_le.mpr this)
      · exact new.2
    · rw [slots, opened.slots] at held
      have := ops.contexts state entering.1 other held scope context
      exact absurd bounds.1 (Nat.not_le.mpr this)
    · exact absurd bounds.1 (Nat.not_le.mpr (placedStart scope active))
  · intro index scope slot
    by_cases inside : index ∈ Feature.MultiInstance.opening loop.mode run.instances
    · obtain ⟨found, slot', bounds, rest⟩ := opened.entered index inside
      rw [slot] at slot'
      obtain rfl := Iteration.active.inj (Option.some.inj slot')
      refine .inr ⟨bounds.1, fun cib named => ?_⟩
      obtain ⟨locals, present, at_, entry⟩ := rest.2 cib named
      exact ⟨locals, variables ▸ present, at_, entry⟩
    · rw [opened.untouched index inside] at slot
      exact .inl slot

/-- Entering and queuing a body's instances below its scope occurrence keeps `inv`, given that a body some slot of
which no longer waits is held and opens by its element's loop. -/
theorem beginInstances_keeps (ops : MultiInstanceOps program inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances [])
    (linked : (∃ slot ∈ run.instances, slot ≠ .waiting) →
      run ∈ state.slots.multiInstances ∧ LoopOf program run.element loop) :
    inv (Feature.MultiInstance.beginInstances ctx loop items run state) := by
  obtain ⟨queued, instances, ran, begun⟩ := beginInstances_spec (ctx := ctx) (loop := loop) (items := items) ops
    entering
  rw [ran]
  exact (ops.runs queued run { run with instances } loop begun.entering.1 begun.entering.2.1 begun.entering.2.2.2.1
    begun.opens fun waiting => ⟨begun.slots ▸ (linked waiting).1, (linked waiting).2⟩).1

/-- What a committed `Hooks.arriveMultiInstance` did: an unavailable read held the begun occurrence, an empty body
completed it, and otherwise it entered the body's scope occurrence below the occurrence's own, which it owns, armed its
boundaries or not, and began the instances, every slot waiting. -/
theorem arriveMultiInstance_spec {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State}
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    (∃ held, after = state.hold held) ∨
      (∃ writes, after = state.signal (.complete occurrence.id .outgoing writes .outward)) ∨
      ∃ locals, ∃ unarmed : Bool, ∃ collection count items, after = Feature.MultiInstance.beginInstances ctx loop items
        { scope := (state.enterScope header.id occurrence.scope locals (some occurrence.id)).2, element := header.id,
          occurrence := occurrence.id, collection, instances := List.replicate count .waiting }
        (if unarmed then (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1
          else (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1.signal
            (.arm occurrence.id header.id occurrence.scope)) := by
  unfold Feature.MultiInstance.arriveMultiInstance at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · cases ran
  · split at ran
    · cases ran
      exact .inl ⟨_, rfl⟩
    · cases ran
      exact .inr (.inl ⟨_, rfl⟩)
    · cases ran
      exact .inr (.inr ⟨_, _, _, _, _, rfl⟩)

/-- Writing the body's counters keeps what the body keeps while it enters. -/
theorem written_entering (ops : MultiInstanceOps program inv settled)
    {run : MultiInstanceRun} {state : State} (entering : Entering inv settled run state run.instances [])
    (scope : ScopeOccurrenceId) (writes : List (String × Value)) (rule : WriteRule) :
    Entering inv settled run (state.signal (.write scope writes rule)) run.instances [] := by
  obtain ⟨written, carry⟩ := ops.write state scope writes rule entering.1
  exact entering.frame written (carry _ entering.2.1) (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq])

/-- A body whose instances are done completes its occurrence. -/
theorem finish_keeps (ops : MultiInstanceOps program inv settled)
    {ctx : Ctx} {loop : MultiInstance} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances []) :
    inv (Feature.MultiInstance.finish ctx loop run state) := by
  unfold Feature.MultiInstance.finish
  exact ops.complete _ _ _ _ _ entering.1 entering.2.1

/-- What an instance submits fits the loop of its body's element and the input collection. -/
theorem submitted_fits {ctx : Ctx} {run : MultiInstanceRun} {loop : MultiInstance} {writes : List (String × Value)}
    {output : Option Value} (looped : Feature.MultiInstance.loopOf? ctx run = some loop)
    (ran : Feature.MultiInstance.submitted loop run writes = .ok output) : OutputFits ctx.program run output := by
  unfold Feature.MultiInstance.submitted at ran
  constructor
  · intro other linked named
    obtain rfl : other = loop := Option.some.inj ((linked : _ = some other).symm.trans looped)
    split at ran
    · simp_all
    · split at ran <;> (try cases ran) <;> rfl
    · cases ran
  · intro value is items collection
    split at ran
    · cases ran
      cases is
    · split at ran
      · cases ran
        simp_all
        exact ⟨_, is.symm⟩
      · cases ran
      · simp_all
    · cases ran

/-- The slot an instance's completion finds active in its scope occurrence. -/
theorem slot_found {run : MultiInstanceRun} {scope : ScopeOccurrenceId} {index : Nat}
    (found : run.instances.findIdx? (fun
      | .active active => active == scope
      | .waiting => false
      | .completed _ => false) = some index) : run.instances[index]? = some (.active scope) := by
  obtain ⟨bound, matched, _⟩ := List.findIdx?_eq_some_iff_getElem.mp found
  rw [List.getElem?_eq_getElem bound]
  generalize run.instances[index] = slot at matched
  cases slot <;> simp_all

/-- What a committed `Hooks.instanceCompleted` did for the instance in `scope`: it found the body's record `run` and
its loop, the slot `index` active in `scope`, an output that fits and the counters held (its `intact` check), recorded
the slot (`recorded`), leaving `scope`, wrote the body's counters or not, and completed the body or began the next
instances. -/
structure Completes (ctx : Ctx) (body : Nat) (scope : ScopeOccurrenceId) (state after : State) (run : MultiInstanceRun)
    (loop : MultiInstance) (index : Nat) (output : Option Value) : Prop where
  found : Feature.MultiInstance.runOf? state body = some run
  looped : LoopOf ctx.program run.element loop
  slot : run.instances[index]? = some (.active scope)
  fits : OutputFits ctx.program run output
  intact : Feature.MultiInstance.holdsCounts ctx (state.ownVariables run.scope)
      (Feature.MultiInstance.bodyCounts loop run.instances) = true ∧
    Feature.MultiInstance.holdsCounts ctx (state.ownVariables scope) (Feature.MultiInstance.instanceCounts index) = true
  ends : ∃ results counted, (counted = leftWith state scope (recorded run index output results) ∨
      ∃ target writes rule, counted = (leftWith state scope (recorded run index output results)).signal
        (.write target writes rule)) ∧
    (after = Feature.MultiInstance.finish ctx loop (recorded run index output results) counted ∨
      ∃ items, after = Feature.MultiInstance.beginInstances ctx loop items (recorded run index output results) counted)

/-- A name none of a loop's item locals carries is not the item local's name under either binding. -/
theorem itemName_ne {ctx : Ctx} {loop : MultiInstance} {name : String} (data : loop.inputDataItem ≠ some name)
    (named : loop.inputDataItemName ≠ some name) (element : loop.elementVariable ≠ some name) :
    Feature.MultiInstance.itemName ctx loop ≠ some name := by
  unfold Feature.MultiInstance.itemName
  split
  · exact data
  · intro same
    cases found : loop.inputDataItemName with
    | none => rw [found] at same; exact element same
    | some other => rw [found] at same; exact named (found.trans same)

/-- The record `MultiInstance.runOf?` finds is one of the state's. -/
theorem found_mem {state : State} {body : Nat} {run : MultiInstanceRun}
    (found : Feature.MultiInstance.runOf? state body = some run) : run ∈ state.slots.multiInstances := by
  unfold Feature.MultiInstance.runOf? at found
  exact List.mem_of_find?_eq_some found

/-- A committed `Hooks.instanceCompleted` did what `Completes` says. -/
theorem instanceCompleted_spec {ctx : Ctx} {body : Nat} {occurrence : Occurrence} {writes : List (String × Value)}
    {state after : State} (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) :
    ∃ run loop index output, Completes ctx body occurrence.scope state after run loop index output := by
  unfold Feature.MultiInstance.instanceCompleted at ran
  simp only [bind, Except.bind] at ran
  cases found : Feature.MultiInstance.runOf? state body with
  | none => rw [found] at ran; cases ran
  | some run =>
  rw [found] at ran
  dsimp only at ran
  cases looped : Feature.MultiInstance.loopOf? ctx run with
  | none => rw [looped] at ran; cases ran
  | some loop =>
  rw [looped] at ran
  dsimp only at ran
  split at ran
  rotate_left
  · cases ran
  rename_i index indexed
  split at ran
  · cases ran
  rename_i output submittedOk
  split at ran
  · cases ran
  rename_i passed
  simp only [Bool.or_eq_true, Bool.not_eq_true', not_or, Bool.not_eq_false] at passed
  refine ⟨run, loop, index, output, found, looped, slot_found indexed, submitted_fits looped submittedOk,
    Bool.and_eq_true _ _ ▸ passed.2, ?_⟩
  repeat' split at ran
  all_goals first
    | (cases ran; done)
    | (cases ran; exact ⟨_, _, .inl rfl, .inl rfl⟩)
    | (cases ran; exact ⟨_, _, .inr ⟨_, _, _, rfl⟩, .inl rfl⟩)
    | (cases ran; exact ⟨_, _, .inl rfl, .inr ⟨_, rfl⟩⟩)
    | (cases ran; exact ⟨_, _, .inr ⟨_, _, _, rfl⟩, .inr ⟨_, rfl⟩⟩)

/-- A body's completion issues nothing. -/
theorem finish_issue (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (state : State) :
    (Feature.MultiInstance.finish ctx loop run state).nextIssue = state.nextIssue := by
  unfold Feature.MultiInstance.finish
  rw [Laws.State.signal_eq]

/-! ## Counters

What `Hooks.instanceCompleted` reads of CIB's counter locals (CIB-INT-0018). -/

/-- The run `MultiInstance.runOf?` finds for a body occurrence is the one record of it. -/
theorem runOf?_keyed {state : State} {body : Nat} {found run : MultiInstanceRun} (keyed : RunsKeyed state)
    (located : Feature.MultiInstance.runOf? state body = some found) (member : run ∈ state.slots.multiInstances)
    (owns : run.occurrence = body) : found = run := by
  unfold Feature.MultiInstance.runOf? at located
  have inside := List.mem_of_find?_eq_some located
  have same := List.find?_some located
  exact Laws.State.nodup_map_eq keyed inside member ((beq_iff_eq.mp same).trans owns.symm)

/-- `MultiInstance.holdsCounts` holding a count binds its counter local to it. -/
theorem holdsCounts_lookup {ctx : Ctx} {variables : List (String × Value)} {name : String} {count : Nat}
    {counts : List (String × Nat)} (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (held : Feature.MultiInstance.holdsCounts ctx variables counts = true) (named : counts.lookup name = some count)
    (listed : (name, count) ∈ counts) : variables.lookup name = some (.int count) := by
  unfold Feature.MultiInstance.holdsCounts Feature.MultiInstance.counterLocals at held
  rw [cib] at held
  have each := List.all_eq_true.mp held (name, .int count) (List.mem_map.mpr ⟨(name, count), listed, rfl⟩)
  dsimp only at each
  rw [named] at each
  split at each
  · rename_i actual expected found same
    obtain rfl := Option.some.inj same
    rw [found, beq_iff_eq.mp each]
  · cases each

/-- The filled slots `MultiInstance.bodyCounts` counts. -/
theorem filledCount_eq (run : MultiInstanceRun) :
    (run.instances.filter Feature.MultiInstance.slotFilled).length = filledCount run := by
  unfold filledCount
  congr 2

/-- Under `cibLocals`, a committed instance completion found the counters it reads held: its scope occurrence's
`loopCounter` and its body's counts (`CountersHeld`), given one record per body occurrence and an instance's scope
occurrence in one slot. -/
theorem instanceCompleted_countersHeld {ctx : Ctx} {body : Nat} {occurrence : Occurrence}
    {writes : List (String × Value)} {state after : State} {run : MultiInstanceRun} {loop : MultiInstance} {index : Nat}
    (keyed : RunsKeyed state) (owned : Owned state run)
    (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after)
    (member : run ∈ state.slots.multiInstances) (owns : run.occurrence = body) (looped : LoopOf ctx.program run.element loop)
    (slot : run.instances[index]? = some (.active occurrence.scope)) :
    CountersHeld (state.ownVariables occurrence.scope) (state.ownVariables run.scope) run loop index := by
  obtain ⟨found, other, at_, rest⟩ := instanceCompleted_spec ran
  obtain ⟨_, done⟩ := rest
  obtain rfl := runOf?_keyed keyed done.found member owns
  obtain rfl : other = loop := Option.some.inj ((done.looped : _ = some other).symm.trans looped)
  obtain rfl := owned.ownScopes at_ index occurrence.scope done.slot slot
  obtain ⟨bodyHeld, instanceHeld⟩ := done.intact
  have names := Laws.IL.multiInstanceCounterNames_eq
  have instanceCounts : Feature.MultiInstance.instanceCounts at_ = [("loopCounter", at_)] := by
    unfold Feature.MultiInstance.instanceCounts
    rw [names]
    rfl
  have bodyCounts : Feature.MultiInstance.bodyCounts other found.instances =
      [("nrOfInstances", found.instances.length), ("nrOfActiveInstances", activeCount other.mode found),
        ("nrOfCompletedInstances", filledCount found)] := by
    unfold Feature.MultiInstance.bodyCounts activeCount
    rw [names, filledCount_eq]
    cases other.mode <;> rfl
  rw [instanceCounts] at instanceHeld
  rw [bodyCounts] at bodyHeld
  exact ⟨holdsCounts_lookup cib instanceHeld rfl (by simp), holdsCounts_lookup cib bodyHeld rfl (by simp),
    holdsCounts_lookup cib bodyHeld rfl (by simp), holdsCounts_lookup cib bodyHeld rfl (by simp)⟩

end Kernel.Laws.MultiInstance
