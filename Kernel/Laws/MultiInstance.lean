module

public import Kernel.Laws.MultiInstance.Rules
public import Kernel.Laws.MultiInstance.Entering
public import Kernel.Laws.MultiInstance.Opening
public import Kernel.Laws.IL
public import Kernel.Feature.MultiInstance
import all Kernel.Feature.MultiInstance

/-! # Laws of Multi-Instance Activities

What `Kernel.Feature.MultiInstance`'s hooks keep and do: the state invariant of the proof wave through the operations
record `MultiInstanceOps`, what a committed hook did (`*_spec`), what a body's completion writes (`WritesCollection`),
and the Multi-Instance lane's rules of `Kernel.Laws.MultiInstance.Rules`. This is the one module that sees the feature's
bodies; what follows from these facts without them is `Kernel.Proofs.MultiInstance.Hooks`'. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel
open Kernel.Laws.State (Within)

/-! ## The body's slot record

`MultiInstance.setRun` sets a body's slot record in place of every record of its occurrence, or adds it
(`Kernel.Proofs.MultiInstance.Records` reads what it keeps). -/

/-- Setting a body's slot record changes the Multi-Instance slot only. -/
theorem setRun_eq (state : State) (next : MultiInstanceRun) :
    Feature.MultiInstance.setRun state next = { state with slots := { state.slots with
      multiInstances := (Feature.MultiInstance.setRun state next).slots.multiInstances } } := by
  unfold Feature.MultiInstance.setRun
  rfl

/-- The records after setting `next`: `next` in place of each record of its occurrence, or added. -/
theorem setRun_runs (state : State) (next : MultiInstanceRun) :
    (Feature.MultiInstance.setRun state next).slots.multiInstances =
      if state.slots.multiInstances.any (·.occurrence == next.occurrence) then
        state.slots.multiInstances.map fun other => if other.occurrence == next.occurrence then next else other
      else state.slots.multiInstances ++ [next] := by
  unfold Feature.MultiInstance.setRun
  rfl

/-- The state an instance's completion leaves: its scope occurrence `scope` left and the body's slot record `next`
set. -/
def leftWith (state : State) (scope : ScopeOccurrenceId) (next : MultiInstanceRun) : State :=
  Feature.MultiInstance.setRun (state.leaveScope scope) next

/-- The state `counted` an instance's completion reaches before it completes or continues its body: `leftWith`, then
the body's counters written or not. -/
def Counted (state : State) (scope : ScopeOccurrenceId) (next : MultiInstanceRun) (counted : State) : Prop :=
  counted = leftWith state scope next ∨
    ∃ target writes rule, counted = (leftWith state scope next).signal (.write target writes rule)

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
structure MultiInstanceOps (program : Program) (inv : State → Prop) (settled : State → OccurrenceId → Prop) : Prop where
  bodies : ∀ state run, inv state → run ∈ state.slots.multiInstances → settled state run.occurrence
  placed : ∀ state run, inv state → run ∈ state.slots.multiInstances → Laws.State.Placed state run
  complete : ∀ state id leave writes rule, inv state → settled state id →
    (∀ selected, leave = .flows selected → selected = []) → inv (state.signal (.complete id leave writes rule))
  begun : ∀ state occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    settled state occurrence.id
  housed : ∀ state occurrence, inv state → occurrence ∈ state.occurrences →
    occurrence.scope ∈ Laws.State.scopeIds state
  /-- Every scope occurrence was issued, so one entered later is new. -/
  issued : ∀ state, inv state → ∀ entry ∈ state.scopes, Laws.State.ScopeIssued state entry.id
  /-- Every running compensation handler's context was issued, so no scope occurrence entered later is one. -/
  contexts : ∀ state, inv state → ∀ run ∈ state.slots.compensation.runs, ∀ context ∈ run.running.map (·.1),
    Laws.State.ScopeIssued state context
  hold : ∀ state held, inv state → inv (state.hold held)
  /-- A scope occurrence entered below one that stands, for an element anchored there, under a key never issued before,
  which every history then holds. -/
  enter : ∀ state element parent locals owner, inv state → parent ∈ Laws.State.scopeIds state →
    (∀ id, owner = some id → ∃ occurrence ∈ state.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = parent) → Laws.Flow.Anchored inv program state element parent →
    inv (state.enterScope element parent locals owner).1 ∧
      (∀ id, settled state id → settled (state.enterScope element parent locals owner).1 id) ∧
      Laws.State.ScopeFresh state (state.enterScope element parent locals owner).1 (state.enterScope element parent locals owner).2
  arm : ∀ state occurrence element, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    element = occurrence.element → inv (state.signal (.arm occurrence.id element occurrence.scope)) ∧
      ∀ id, settled state id → settled (state.signal (.arm occurrence.id element occurrence.scope)) id
  begin : ∀ state request, inv state → Laws.State.names request = [] → request.scope ∈ Laws.State.scopeIds state →
    Laws.Flow.BeginAnchored inv program state request →
    inv (state.signal (.begin request)) ∧ ∀ id, settled state id → settled (state.signal (.begin request)) id
  defer : ∀ state requests, inv state →
    (∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state) →
    (∀ request ∈ requests, Laws.Flow.BeginAnchored inv program state request) →
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
  waits, is the body's record already held and opens by its element's loop; its element is anchored at its scope
  occurrence. -/
  runs : ∀ state base next loop, inv state → settled state next.occurrence → Laws.State.Placed state next →
    Opens state base next loop → Laws.Flow.Anchored inv program state next.element next.scope →
    ((∃ slot ∈ base.instances, slot ≠ .waiting) → base ∈ state.slots.multiInstances ∧ LoopOf program base.element loop) →
    inv (Feature.MultiInstance.setRun state next) ∧
      ∀ id, settled state id → settled (Feature.MultiInstance.setRun state next) id
  write : ∀ state scope writes rule, inv state → inv (state.signal (.write scope writes rule)) ∧
    ∀ id, settled state id → settled (state.signal (.write scope writes rule)) id

variable {program : Program} {inv : State → Prop} {settled : State → OccurrenceId → Prop}

/-- A committed `Hooks.completeBody` finished the slot record `MultiInstance.runOf?` finds for its occurrence. -/
theorem completeBody_spec {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State}
    (ran : Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after) :
    ∃ run, Feature.MultiInstance.runOf? state occurrence.id = some run ∧
      after = Feature.MultiInstance.finish ctx loop run state := by
  unfold Feature.MultiInstance.completeBody at ran
  split at ran
  · cases ran
  · rename_i run found
    cases ran
    exact ⟨run, found, rfl⟩

/-- Queuing begins keeps everything but the queued signals and tokens, and queues them as `QueuedAs` says. -/
theorem queueInstances_frame (ctx : Ctx) (mode : MultiInstanceMode) (requests : List BeginRequest) (state : State) :
    QueueKeeps state (Feature.MultiInstance.queueInstances ctx mode requests state) ∧
      QueuedAs ctx.program mode state (Feature.MultiInstance.queueInstances ctx mode requests state) requests := by
  have signalled : ∀ (rest : List BeginRequest) (current : State),
      QueueKeeps current (rest.foldl (fun state request => state.signal (.begin request)) current) ∧
      (rest.foldl (fun state request => state.signal (.begin request)) current).signals =
        current.signals ++ rest.map .begin ∧
      (rest.foldl (fun state request => state.signal (.begin request)) current).tokens = current.tokens := by
    intro rest
    induction rest with
    | nil => intro _; exact ⟨⟨rfl, rfl, rfl, rfl, rfl⟩, by simp, rfl⟩
    | cons request rest held =>
      intro current
      rw [List.foldl_cons]
      obtain ⟨keeps, signals, tokens⟩ := held (current.signal (.begin request))
      have same := Laws.State.signal_eq current (.begin request)
      exact ⟨⟨keeps.scopes.trans (by rw [same]), keeps.occurrences.trans (by rw [same]),
        keeps.variables.trans (by rw [same]), keeps.slots.trans (by rw [same]), keeps.occurrenceOrdinals.trans (by rw [same])⟩,
        by rw [signals, same]; simp, tokens.trans (by rw [same])⟩
  unfold Feature.MultiInstance.queueInstances
  split
  · obtain ⟨keeps, signals, tokens⟩ := signalled requests state
    exact ⟨keeps, .inl ⟨signals, tokens⟩⟩
  · rename_i schedule
    split
    · rename_i parallel
      rw [Laws.State.deferBegins_eq]
      exact ⟨⟨rfl, rfl, rfl, rfl, rfl⟩, .inr ⟨schedule, beq_iff_eq.mp parallel, rfl, rfl⟩⟩
    · obtain ⟨keeps, signals, tokens⟩ := signalled requests state
      exact ⟨keeps, .inl ⟨signals, tokens⟩⟩

/-- Queuing the instances' begins keeps what a body keeps while it enters. -/
theorem queueInstances_keeps (ops : MultiInstanceOps program inv settled)
    {ctx : Ctx} {mode : MultiInstanceMode} {run : MultiInstanceRun} {state : State} {instances : List Iteration}
    {requests : List BeginRequest} (entering : Entering inv settled run state instances requests) :
    Entering inv settled run (Feature.MultiInstance.queueInstances ctx mode requests state) instances [] := by
  have empty : ∀ {current}, Entering inv settled run current instances requests →
      Entering inv settled run current instances [] := fun held =>
        ⟨held.1, held.2.1, held.2.2.1, held.2.2.2.1, by simp, held.2.2.2.2.2⟩
  have signalled : Entering inv settled run
      (requests.foldl (fun state request => state.signal (.begin request)) state) instances requests := by
    refine Laws.State.foldl_keeps (fun state => Entering inv settled run state instances requests) _ requests state
      (fun current request member held => ?_) entering
    obtain ⟨begun, carry⟩ := ops.begin _ _ held.1 (held.2.2.2.2.1 request member).1
      (held.2.2.2.2.1 request member).2.1 (held.begins member)
    exact held.frame begun (carry _ held.2.1) (by rw [Laws.State.signal_eq])
      (by rw [Laws.State.signal_eq]; exact .refl _) (by rw [Laws.State.signal_eq])
  unfold Feature.MultiInstance.queueInstances
  split
  · exact empty signalled
  · split
    · obtain ⟨deferred, carry⟩ := ops.defer _ _ entering.1
        (fun request member => ⟨(entering.2.2.2.2.1 request member).1, (entering.2.2.2.2.1 request member).2.1⟩)
        fun _ member => entering.begins member
      exact empty (entering.frame deferred (carry _ entering.2.1) (by rw [Laws.State.deferBegins_eq])
        (by rw [Laws.State.deferBegins_eq]; exact .refl _) (by rw [Laws.State.deferBegins_eq]))
    · exact empty signalled

/-- Under `cibLocals` and an item local not named `loopCounter`, the scope occurrence `scope` holds
`loopCounter = index` (CIB-INT-0018). -/
def CounterIn (ctx : Ctx) (loop : MultiInstance) (s : State) (index : Nat) (scope : ScopeOccurrenceId) : Prop :=
  ctx.program.options.multiInstanceCounters = .cibLocals → Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter" →
    ∃ locals ∈ s.variables, locals.scope = scope ∧ ("loopCounter", Value.int index) ∈ locals.entries

/-- What entering the instances `done`, the first of those `MultiInstance.opening` names, keeps and records from the
state `start` the entering began in: `Entering`, the occurrence counters, the feature slots, the occurrences,
the queued signals and tokens, each scope occurrence of `start` and new since `start` issued afresh below the body's and
owned by no occurrence, the other slots as `run` had them, each entered slot active in a scope occurrence of its own
issued since `start`, holding its counter, and the begins of the entered slots in the order entered. -/
structure Opening (inv : State → Prop) (settled : State → OccurrenceId → Prop) (ctx : Ctx) (loop : MultiInstance)
    (start : State) (run : MultiInstanceRun) (acc : State × List Iteration × List BeginRequest) (done : List Nat) :
    Prop where
  entering : Entering inv settled run acc.1 acc.2.1 acc.2.2
  counters : acc.1.occurrenceOrdinals = start.occurrenceOrdinals
  grows : Laws.State.ScopeGrows start acc.1
  slots : acc.1.slots = start.slots
  occurrences : acc.1.occurrences = start.occurrences
  signals : acc.1.signals = start.signals
  tokens : acc.1.tokens = start.tokens
  kept : ∀ entry ∈ start.scopes, entry ∈ acc.1.scopes
  scopes : ∀ entry ∈ acc.1.scopes, entry ∈ start.scopes ∨
    ¬ Laws.State.ScopeIssued start entry.id ∧ entry.parent = some run.scope ∧ entry.occurrence = none ∧
      entry.calledInstance = none
  length : acc.2.1.length = run.instances.length
  untouched : ∀ index, index ∉ done → acc.2.1[index]? = run.instances[index]?
  entered : ∀ index ∈ done, ∃ scope, acc.2.1[index]? = some (.active scope) ∧
    (¬ Laws.State.ScopeIssued start scope ∧ Laws.State.ScopeIssued acc.1 scope) ∧ scope ∈ Laws.State.scopeIds acc.1 ∧
    CounterIn ctx loop acc.1 index scope
  apart : ∀ first ∈ done, ∀ (second : Nat) (scope : ScopeOccurrenceId), acc.2.1[first]? = some (.active scope) →
    acc.2.1[second]? = some (.active scope) → first = second
  requested : Requested run done acc.2.1 acc.2.2

/-- Entering one instance's scope occurrence below the body's keeps what the body keeps, its slot active there and its
begin queued, under a key never issued before, which every history then holds. -/
theorem enterInstance_entering (ops : MultiInstanceOps program inv settled)
    {run : MultiInstanceRun} {state : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (index : Nat) (locals : List (String × Value))
    (continuation : Continuation) :
    Entering inv settled run (state.enterScope run.element run.scope locals none).1
      (instances.set index (.active (state.enterScope run.element run.scope locals none).2))
      (requests ++ [{ element := run.element, continuation, scope := (state.enterScope run.element run.scope
        locals none).2 }]) ∧
      Laws.State.ScopeFresh state (state.enterScope run.element run.scope locals none).1
        (state.enterScope run.element run.scope locals none).2 := by
  have anchored := entering.anchored (program := program)
  obtain ⟨holds, carried, stands, rest⟩ := entering
  obtain ⟨placed, queued, held⟩ := rest
  obtain ⟨entered, carry, fresh⟩ := ops.enter state run.element run.scope locals none holds stands
    (fun _ named => by cases named) anchored
  obtain ⟨unissued, issuedAfter, grows⟩ := fresh
  have apart : ∀ entry ∈ state.scopes, entry.id ≠ (state.enterScope run.element run.scope locals none).2 :=
    fun entry member same => unissued (same ▸ ops.issued state holds entry member)
  rw [Laws.State.enterScope_eq] at entered carry apart unissued issuedAfter grows ⊢
  refine ⟨⟨entered, carry _ carried, by simp [Laws.State.scopeIds] at stands ⊢; exact .inl stands,
    fun scope active => ?_, fun request inside => ?_,
    held.imp id fun ⟨entry, member, facts⟩ => ⟨entry, List.mem_append_left _ member, facts⟩⟩,
    unissued, issuedAfter, grows⟩
  · rcases List.mem_or_eq_of_mem_set active with old | new
    · obtain ⟨below, parent⟩ := placed scope old
      refine ⟨grows.issued below, fun entry member named => ?_⟩
      rcases List.mem_append.mp member with present | added
      · exact parent entry present named
      · rw [List.mem_singleton.mp added] at named
        rw [← named] at below
        exact absurd below unissued
    · obtain rfl := Iteration.active.inj new
      refine ⟨issuedAfter, fun entry member named => ?_⟩
      rcases List.mem_append.mp member with present | added
      · exact absurd named (apart entry present)
      · rw [List.mem_singleton.mp added]
  · rcases List.mem_append.mp inside with old | new
    · obtain ⟨bare, standing, rest⟩ := queued request old
      obtain ⟨incoming, entry, member, facts⟩ := rest
      refine ⟨bare, ?_, incoming, entry, List.mem_append_left _ member, facts⟩
      simp [Laws.State.scopeIds] at standing ⊢
      exact .inl standing
    · rw [List.mem_singleton.mp new]
      exact ⟨by simp [Laws.State.names], by simp [Laws.State.scopeIds], rfl, _,
        List.mem_append_right _ (List.mem_singleton_self _), rfl, rfl, rfl⟩

/-- Entering the waiting slot `index` extends what entering the instances keeps and records. -/
theorem enterInstance_opening (ops : MultiInstanceOps program inv settled) {ctx : Ctx} {loop : MultiInstance}
    {start : State} {run : MultiInstanceRun} {s : State} {instances : List Iteration} {requests : List BeginRequest}
    {done : List Nat} (opening : Opening inv settled ctx loop start run (s, instances, requests) done) (index : Nat)
    (fresh : index ∉ done) (waiting : run.instances[index]? = some .waiting)
    (placedStart : ∀ scope, Iteration.active scope ∈ run.instances → Laws.State.ScopeIssued start scope)
    (locals : List (String × Value))
    (counted : ctx.program.options.multiInstanceCounters = .cibLocals →
      Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter" → ∃ earlier later,
        locals = earlier ++ ("loopCounter", Value.int index) :: later ∧ ∀ other ∈ later, other.1 ≠ "loopCounter") :
    Opening inv settled ctx loop start run ((s.enterScope run.element run.scope locals none).1,
      instances.set index (.active (s.enterScope run.element run.scope locals none).2),
      requests ++ [instanceRequest run (s.enterScope run.element run.scope locals none).2]) (done ++ [index]) := by
  obtain ⟨entering, unissued, issuedAfter, grows⟩ :=
    enterInstance_entering ops opening.entering index locals (.multiInstance run.occurrence)
  have below : index < instances.length := by
    rw [opening.length]
    exact (List.getElem?_eq_some_iff.mp waiting).1
  have unissuedStart := fun issued => unissued (opening.grows.issued issued)
  rw [Laws.State.enterScope_eq] at entering unissued issuedAfter grows unissuedStart ⊢
  have counters := opening.counters
  have untouched := opening.untouched
  have entered := opening.entered
  have apart := opening.apart
  dsimp only at counters untouched entered apart
  have requested := opening.requested
  dsimp only at requested
  refine ⟨entering, counters, opening.grows.trans grows, opening.slots, opening.occurrences, opening.signals, opening.tokens,
    fun entry member => List.mem_append_left _ (opening.kept entry member), fun entry member => ?_,
    by simp [opening.length], fun other outside => ?_, fun other inside => ?_, fun first inside second scope one two => ?_,
    ?_⟩
  · rcases List.mem_append.mp member with old | new
    · exact opening.scopes entry old
    · rw [List.mem_singleton.mp new]
      exact .inr ⟨unissuedStart, rfl, rfl, rfl⟩
  · have differs : index ≠ other := fun same => outside (by simp [same])
    rw [List.getElem?_set_ne differs]
    exact untouched other fun inside => outside (List.mem_append_left _ inside)
  · rcases List.mem_append.mp inside with old | new
    · have differs : index ≠ other := fun same => fresh (same ▸ old)
      obtain ⟨scope, slot, bounds, rest⟩ := entered other old
      obtain ⟨stands, counter⟩ := rest
      refine ⟨scope, by rw [List.getElem?_set_ne differs]; exact slot, ⟨bounds.1, grows.issued bounds.2⟩,
        by simp [Laws.State.scopeIds] at stands ⊢; exact .inl stands, fun cib named => ?_⟩
      obtain ⟨locals', present, at_, entry⟩ := counter cib named
      exact ⟨locals', List.mem_append_left _ present, at_, entry⟩
    · rw [List.mem_singleton.mp new]
      refine ⟨_, by rw [List.getElem?_set_self below], ⟨unissuedStart, issuedAfter⟩,
        by simp [Laws.State.scopeIds], fun cib named => ?_⟩
      obtain ⟨earlier, later, split, last⟩ := counted cib named
      refine ⟨⟨_, keyed locals⟩, by simp, rfl, ?_⟩
      rw [split]
      exact Laws.State.mem_keyed earlier last
  · have fresh' : ∀ other, other ∈ done → ∀ scope', instances[other]? = some (.active scope') →
        Laws.State.ScopeIssued s scope' := fun other inside scope' slot => by
      obtain ⟨found, slot', bounds, _⟩ := entered other inside
      rw [slot] at slot'
      cases slot'
      exact bounds.2
    have older : ∀ other, other ≠ index → instances[other]? =
        some (.active (run.scope.child run.element (Laws.State.slotCount s run.scope run.element))) → False := by
      intro other differs slot
      by_cases inside' : other ∈ done
      · exact unissued (fresh' other inside' _ slot)
      · rw [untouched other inside'] at slot
        exact unissuedStart (placedStart _ (List.mem_of_getElem? slot))
    rcases List.mem_append.mp inside with old | new
    · have differs : index ≠ first := fun same => fresh (same ▸ old)
      rw [List.getElem?_set_ne differs] at one
      by_cases at_ : index = second
      · subst at_
        rw [List.getElem?_set_self below] at two
        obtain rfl := Iteration.active.inj (Option.some.inj two)
        exact absurd (fresh' first old _ one) unissued
      · rw [List.getElem?_set_ne at_] at two
        exact apart first old second scope one two
    · rw [List.mem_singleton.mp new] at one ⊢
      rw [List.getElem?_set_self below] at one
      obtain rfl := Iteration.active.inj (Option.some.inj one)
      by_cases at_ : index = second
      · exact at_
      · rw [List.getElem?_set_ne at_] at two
        exact absurd two fun slot => older second (Ne.symm at_) slot
  · obtain ⟨slots, indices, requests, active⟩ := requested
    refine ⟨slots ++ [(index, run.scope.child run.element (Laws.State.slotCount s run.scope run.element))],
      by simp [indices], by rw [requests]; simp [instanceRequest],
      fun slot member => ?_⟩
    rcases List.mem_append.mp member with old | new
    · have differs : index ≠ slot.1 := fun same => fresh (indices ▸ List.mem_map.mpr ⟨slot, old, same.symm⟩)
      rw [List.getElem?_set_ne differs]
      exact active slot old
    · rw [List.mem_singleton.mp new]
      exact List.getElem?_set_self below

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
feature slots and occurrences of `state`, its scope occurrences and others issued since, its occurrence
counters, each slot active anew in a scope occurrence issued since `state` that, under `cibLocals`, holds its counter, the
begins of the opened slots, in index order, queued as the loop's mode and the branch schedule say, and scope
occurrences new since `state` of no called instance, so that an instance shares its body's activation counter. -/
structure Begun (inv : State → Prop) (settled : State → OccurrenceId → Prop) (ctx : Ctx) (loop : MultiInstance) (state : State)
    (run : MultiInstanceRun) (queued : State) (instances : List Iteration) : Prop where
  entering : Entering inv settled run queued instances []
  opens : Opens queued run { run with instances } loop
  slots : queued.slots = state.slots
  occurrences : queued.occurrences = state.occurrences
  kept : ∀ entry ∈ state.scopes, entry ∈ queued.scopes
  scopes : ∀ entry ∈ queued.scopes, entry ∈ state.scopes ∨ ¬ Laws.State.ScopeIssued state entry.id
  counters : queued.occurrenceOrdinals = state.occurrenceOrdinals
  queues : ∃ requests, Requested run (Feature.MultiInstance.opening loop.mode run.instances) instances requests ∧
    QueuedAs ctx.program loop.mode state queued requests
  counted : ∀ index scope, instances[index]? = some (.active scope) → run.instances[index]? = some (.active scope) ∨
    ¬ Laws.State.ScopeIssued state scope ∧ CounterIn ctx loop queued index scope
  uncalled : ∀ entry ∈ queued.scopes, entry ∉ state.scopes → entry.calledInstance = none

/-- Beginning a body's instances, from a state where it keeps what it keeps while it enters, queues their begins in a
state it then sets the body's slot record in, as `Begun` says. -/
theorem beginInstances_spec (ops : MultiInstanceOps program inv settled) {ctx : Ctx} {loop : MultiInstance}
    {items : List Value} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances []) :
    ∃ queued instances, Feature.MultiInstance.beginInstances ctx loop items run state =
        Feature.MultiInstance.setRun queued { run with instances } ∧
      Begun inv settled ctx loop state run queued instances := by
  have placedStart : ∀ scope, Iteration.active scope ∈ run.instances → Laws.State.ScopeIssued state scope :=
    fun scope active => (entering.2.2.2.1 scope active).1
  unfold Feature.MultiInstance.beginInstances
  split
  rename_i current instances requests folded
  have opened : Opening inv settled ctx loop state run (current, instances, requests)
      (Feature.MultiInstance.opening loop.mode run.instances) := by
    rw [← folded]
    refine foldl_prefix (fun pre acc => Opening inv settled ctx loop state run acc pre) _ _ _ [] _ (by simp)
      (fun pre index post acc whole held => ?_)
      ⟨entering, rfl, .refl _, rfl, rfl, rfl, rfl, fun _ member => member, fun entry member => .inl member, rfl,
        fun _ _ => rfl, fun _ none => (by cases none), fun _ none => (by cases none),
        ⟨[], rfl, rfl, fun _ none => by cases none⟩⟩
    obtain ⟨s, held_instances, held_requests⟩ := acc
    have nodup := whole ▸ opening_nodup loop.mode run.instances
    have fresh : index ∉ pre := fun inside =>
      (List.nodup_append.mp nodup).2.2 index inside index (List.mem_cons_self ..) rfl
    have waiting := opening_waiting (whole ▸ List.mem_append_right _ (List.mem_cons_self ..) :
      index ∈ Feature.MultiInstance.opening loop.mode run.instances)
    refine enterInstance_opening ops held index fresh waiting placedStart _
      (instanceLocals_counted ctx loop index _ fun other inside => ?_)
    split at inside
    · rename_i name value found _
      exact ⟨name, found, (List.mem_singleton.mp inside) ▸ rfl⟩
    · cases inside
  obtain ⟨keeps, queuedAs⟩ := queueInstances_frame ctx loop.mode requests current
  have scopes := keeps.scopes
  have slots := keeps.slots
  have variables := keeps.variables
  have signals : current.signals = state.signals := opened.signals
  have tokens : current.tokens = state.tokens := opened.tokens
  have scopeIds : Laws.State.scopeIds (Feature.MultiInstance.queueInstances ctx loop.mode requests current) =
      Laws.State.scopeIds current := by simp [Laws.State.scopeIds, scopes]
  refine ⟨_, instances, rfl, queueInstances_keeps ops opened.entering, ⟨rfl, opened.length, fun index outside =>
    opened.untouched index outside, fun index inside => ?_, fun first second scope inside one two =>
    opened.apart first inside second scope one two⟩, slots.trans opened.slots,
    keeps.occurrences.trans opened.occurrences, fun entry member => scopes ▸ opened.kept entry member,
    fun entry member => ?_, keeps.occurrenceOrdinals.trans opened.counters, ⟨requests, opened.requested, ?_⟩, ?_,
    fun entry member outside => (opened.scopes entry (scopes ▸ member)).elim (fun old => absurd old outside)
      fun fresh => fresh.2.2.2⟩
  · obtain ⟨scope, slot, bounds, rest⟩ := opened.entered index inside
    refine ⟨scope, slot, scopeIds ▸ rest.1, fun entry member named => ?_, fun other held context => ?_, fun active => ?_⟩
    · rcases opened.scopes entry (scopes ▸ member) with old | new
      · have := ops.issued state entering.1 entry old
        rw [named] at this
        exact absurd this bounds.1
      · exact ⟨new.2.1, new.2.2.1⟩
    · rw [slots, opened.slots] at held
      exact absurd (ops.contexts state entering.1 other held scope context) bounds.1
    · exact absurd (placedStart scope active) bounds.1
  · rcases opened.scopes entry (scopes ▸ member) with old | ⟨fresh, _⟩
    · exact .inl old
    · exact .inr fresh
  · rcases queuedAs with ⟨queued, kept⟩ | ⟨schedule, parallel, queued, kept⟩
    · exact .inl ⟨signals ▸ queued, tokens ▸ kept⟩
    · exact .inr ⟨schedule, parallel, signals ▸ queued, tokens ▸ kept⟩
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

/-- What a committed `Hooks.arriveMultiInstance` did: an unavailable read held the begun occurrence, an empty body
completed it, and otherwise it entered the body's scope occurrence below the occurrence's own, which it owns, armed its
boundaries or not, and began the instances, at least one, every slot waiting. -/
theorem arriveMultiInstance_spec {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State}
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    (∃ held, after = state.hold held) ∨
      (∃ writes, after = state.signal (.complete occurrence.id .outgoing writes .outward)) ∨
      ∃ locals, ∃ unarmed : Bool, ∃ collection count items, 0 < count ∧
        after = Feature.MultiInstance.beginInstances ctx loop items
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
    · rename_i nonempty _
      cases ran
      refine .inr (.inr ⟨_, _, _, _, _, Nat.pos_of_ne_zero fun empty => ?_, rfl⟩)
      subst empty
      exact nonempty rfl

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
    · split at ran <;> (try split at ran) <;> cases ran <;> rfl
    · cases ran
  · intro value is items collection
    split at ran
    · cases ran
      cases is
    · simp only [collection] at ran
      split at ran
      · cases ran
        cases is
        exact ⟨_, rfl⟩
      all_goals cases ran
    · cases ran

/-- What a committed `Hooks.instanceCompleted` did for the instance in `scope`: it found the body's record `run` and
its loop, the slot `index` active in `scope`, an output that fits and the counters held (its `intact` check), recorded
the slot (`recorded`), leaving `scope`, wrote the body's counters or not, and completed the body or began the next
instances, completing it whenever the slot it recorded was the body's last unfilled one (`exhausts`). -/
structure Completes (ctx : Ctx) (body : OccurrenceId) (scope : ScopeOccurrenceId) (state after : State) (run : MultiInstanceRun)
    (loop : MultiInstance) (index : Nat) (output : Option Value) : Prop where
  found : Feature.MultiInstance.runOf? state body = some run
  looped : LoopOf ctx.program run.element loop
  slot : run.instances[index]? = some (.active scope)
  fits : OutputFits ctx.program run output
  intact : Feature.MultiInstance.holdsCounts ctx (state.ownVariables run.scope)
      (Feature.MultiInstance.bodyCounts loop run.instances) = true ∧
    Feature.MultiInstance.holdsCounts ctx (state.ownVariables scope) (Feature.MultiInstance.instanceCounts index) = true
  ends : ∃ results counted, Counted state scope (recorded run index output results) counted ∧
    (after = Feature.MultiInstance.finish ctx loop (recorded run index output results) counted ∨
      ∃ items, after = Feature.MultiInstance.beginInstances ctx loop items (recorded run index output results) counted)
  exhausts : (∀ slot ∈ run.instances.set index (.completed output), ∃ filled, slot = .completed filled) →
    ∃ results counted, Counted state scope (recorded run index output results) counted ∧
      after = Feature.MultiInstance.finish ctx loop (recorded run index output results) counted

/-- Slots each filled are all filled, as `MultiInstance.instanceCompleted` reads its exhaustion. -/
theorem filled_all {slots : List Iteration} (filled : ∀ slot ∈ slots, ∃ output, slot = .completed output) :
    slots.all Feature.MultiInstance.slotFilled = true :=
  List.all_eq_true.mpr fun slot inside => by
    obtain ⟨_, rfl⟩ := filled slot inside
    rfl

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
theorem found_mem {state : State} {body : OccurrenceId} {run : MultiInstanceRun}
    (found : Feature.MultiInstance.runOf? state body = some run) : run ∈ state.slots.multiInstances := by
  unfold Feature.MultiInstance.runOf? at found
  exact List.mem_of_find?_eq_some found

/-- The record `MultiInstance.runOf?` finds for a body occurrence is that occurrence's. -/
theorem found_occurrence {state : State} {body : OccurrenceId} {run : MultiInstanceRun}
    (found : Feature.MultiInstance.runOf? state body = some run) : run.occurrence = body := by
  unfold Feature.MultiInstance.runOf? at found
  have same := List.find?_some found
  exact beq_iff_eq.mp same

/-- A committed `Hooks.instanceCompleted` did what `Completes` says. -/
theorem instanceCompleted_spec {ctx : Ctx} {body : OccurrenceId} {occurrence : Occurrence} {writes : List (String × Value)}
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
    Bool.and_eq_true _ _ ▸ passed.2, ?_, fun filled => ?_⟩
  all_goals repeat' split at ran
  all_goals first
    | (cases ran; done)
    | (cases ran; exact ⟨_, _, .inl rfl, .inl rfl⟩)
    | (cases ran; exact ⟨_, _, .inr ⟨_, _, _, rfl⟩, .inl rfl⟩)
    | (cases ran; exact ⟨_, _, .inl rfl, .inr ⟨_, rfl⟩⟩)
    | (cases ran; exact ⟨_, _, .inr ⟨_, _, _, rfl⟩, .inr ⟨_, rfl⟩⟩)
    | (cases ran; exact ⟨_, _, .inl rfl, rfl⟩)
    | (cases ran; exact ⟨_, _, .inr ⟨_, _, _, rfl⟩, rfl⟩)
    | (exact absurd (Bool.or_eq_true _ _ ▸ Or.inr (filled_all filled)) ‹_›)

/-! ## The output collection

What a body's completion writes (`MultiInstance.finish`, `MultiInstance.written`) and what else the Multi-Instance hooks
queue: the begins of instances (`MultiInstance.queueInstances`). -/

/-- Slots each filled with an output are those `MultiInstance.output?` reads off them, in order. -/
theorem filled_outputs : ∀ {slots : List Iteration}, (∀ slot ∈ slots, ∃ value, slot = .completed (some value)) →
    slots = (slots.filterMap Feature.MultiInstance.output?).map fun value => .completed (some value)
  | [], _ => rfl
  | slot :: rest, filled => by
    obtain ⟨value, rfl⟩ := filled slot (List.mem_cons_self ..)
    rw [List.filterMap_cons_some (by rfl), List.map_cons,
      ← filled_outputs fun other inside => filled other (List.mem_cons_of_mem _ inside)]

/-- The output collection of outputs that are Strings whenever the input collection is a String List lists them. -/
theorem outputCollection_lists {collection : Value} {outputs : List Value}
    (texts : ∀ value ∈ outputs, ∀ items, collection = .stringList items → ∃ text, value = .string text) :
    ListsOutputs (Feature.MultiInstance.outputCollection collection outputs) outputs := by
  unfold Feature.MultiInstance.outputCollection
  cases collection with
  | stringList items =>
    refine .inr ⟨_, rfl, ?_⟩
    induction outputs with
    | nil => rfl
    | cons value rest held =>
      obtain ⟨text, rfl⟩ := texts value (List.mem_cons_self ..) items rfl
      rw [List.filterMap_cons_some (by rfl), List.map_cons,
        held fun other inside => texts other (List.mem_cons_of_mem _ inside)]
  | list _ | null | bool _ | int _ | decimal _ _ | double _ | date _ | string _ | map _ => exact .inl rfl

/-- A body's completion completes its occurrence, writing what `WritesCollection` allows. -/
theorem finish_spec (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (state : State) :
    ∃ writes, Feature.MultiInstance.finish ctx loop run state =
      state.signal (.complete run.occurrence .outgoing writes .outward) ∧ WritesCollection ctx.program loop run writes := by
  refine ⟨_, rfl, fun name value member => ?_⟩
  split at member
  · rename_i filled
    have each : ∀ slot ∈ run.instances, ∃ output, slot = .completed output := fun slot inside => by
      have := List.all_eq_true.mp filled slot inside
      cases slot <;> first | exact ⟨_, rfl⟩ | cases this
    unfold Feature.MultiInstance.written at member
    split at member
    · rename_i _ aggregates _
      obtain ⟨-, rfl⟩ := Prod.mk.inj (List.mem_singleton.mp member)
      refine ⟨aggregates, each, fun named fits => ⟨_, outputCollection_lists fun value inside items collection => ?_,
        filled_outputs fun slot inside => ?_⟩⟩
      · obtain ⟨slot, present, read⟩ := List.mem_filterMap.mp inside
        obtain ⟨output, rfl⟩ := each slot present
        exact (fits output present).2 value read items collection
      · obtain ⟨output, rfl⟩ := each slot inside
        obtain ⟨value, rfl⟩ := Option.isSome_iff_exists.mp ((fits output inside).1 named)
        exact ⟨value, rfl⟩
    · cases member
    · cases member
  · cases member

/-- Under `MultiInstanceOutputs.aggregates` the completion of a body whose loop names an output collection and whose
every slot is filled writes that collection. -/
theorem finish_collects (ctx : Ctx) {loop : MultiInstance} (run : MultiInstanceRun) (state : State) {name : String}
    (aggregates : ctx.program.options.multiInstanceOutputs = .aggregates) (named : loop.outputCollection = some name)
    (filled : ∀ slot ∈ run.instances, ∃ output, slot = .completed output) :
    ∃ writes value, Feature.MultiInstance.finish ctx loop run state =
      state.signal (.complete run.occurrence .outgoing writes .outward) ∧ (name, value) ∈ writes := by
  refine ⟨_, Feature.MultiInstance.outputCollection run.collection (run.instances.filterMap Feature.MultiInstance.output?),
    rfl, ?_⟩
  rw [ite_eq_left_of_eq_true _ _ (eq_true (filled_all filled))]
  unfold Feature.MultiInstance.written
  rw [aggregates, named]
  exact List.mem_singleton_self _

/-- Beginning a body's instances queues only signals that begin its instances (`instanceRequest`). -/
theorem beginInstances_signals (ctx : Ctx) (loop : MultiInstance) (items : List Value) (run : MultiInstanceRun)
    (state : State) : ∃ begins : List BeginRequest,
      (Feature.MultiInstance.beginInstances ctx loop items run state).signals = state.signals ++ begins.map .begin ∧
        ∀ request ∈ begins, ∃ scope, request = instanceRequest run scope := by
  unfold Feature.MultiInstance.beginInstances
  split
  rename_i current instances requests folded
  have kept : (fun acc : State × List Iteration × List BeginRequest => acc.1.signals = state.signals ∧
      ∀ request ∈ acc.2.2, ∃ scope, request = instanceRequest run scope) (current, instances, requests) := by
    rw [← folded]
    refine Laws.State.foldl_keeps (fun acc : State × List Iteration × List BeginRequest => acc.1.signals = state.signals ∧
      ∀ request ∈ acc.2.2, ∃ scope, request = instanceRequest run scope) _ _ _ (fun acc _ _ held => ?_)
      ⟨rfl, fun _ none => by cases none⟩
    obtain ⟨s, _, _⟩ := acc
    dsimp only at held ⊢
    rw [Laws.State.enterScope_eq]
    refine ⟨held.1, fun request member => ?_⟩
    rcases List.mem_append.mp member with old | new
    · exact held.2 request old
    · exact ⟨_, List.mem_singleton.mp new⟩
  obtain ⟨_, queuedAs⟩ := queueInstances_frame ctx loop.mode requests current
  rw [setRun_eq]
  rcases queuedAs with ⟨queued, _⟩ | ⟨_, _, queued, _⟩
  · exact ⟨requests, queued.trans (by rw [kept.1]), kept.2⟩
  · exact ⟨[], queued.trans (by rw [kept.1]; simp), fun _ none => by cases none⟩

/-! ## Counters

What `Hooks.instanceCompleted` reads of CIB's counter locals (CIB-INT-0018). -/

/-- The run `MultiInstance.runOf?` finds for a body occurrence is the one record of it. -/
theorem runOf?_keyed {state : State} {body : OccurrenceId} {found run : MultiInstanceRun} (keyed : RunsKeyed state)
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
    rw [found]
    cases actual <;> simp_all
  · cases each

/-- The filled slots `MultiInstance.bodyCounts` counts. -/
theorem filledCount_eq (run : MultiInstanceRun) :
    (run.instances.filter Feature.MultiInstance.slotFilled).length = filledCount run := by
  unfold filledCount
  congr 2

/-- An instance's counter and its body's counts as `MultiInstance.instanceCounts` and `MultiInstance.bodyCounts` list
them. -/
theorem counts_eq (loop : MultiInstance) (run : MultiInstanceRun) (index : Nat) :
    Feature.MultiInstance.instanceCounts index = [("loopCounter", index)] ∧
      Feature.MultiInstance.bodyCounts loop run.instances = [("nrOfInstances", run.instances.length),
        ("nrOfActiveInstances", activeCount loop.mode run), ("nrOfCompletedInstances", filledCount run)] := by
  have names := Laws.IL.multiInstanceCounterNames_eq
  refine ⟨?_, ?_⟩
  · unfold Feature.MultiInstance.instanceCounts
    rw [names]
    rfl
  · unfold Feature.MultiInstance.bodyCounts activeCount
    rw [names, filledCount_eq]
    cases loop.mode <;> rfl

end Kernel.Laws.MultiInstance
