module

public import Kernel.Hooks
public import Kernel.Feature.Flow
public import Kernel.Laws.State
public import Kernel.Laws.Flow.Rules
public import Kernel.Laws.Flow.Sources
public import Kernel.Laws.IL
import all Kernel.Feature.Flow

/-! # Laws of flow: Flow's hooks against the rules

What `Kernel.Feature.Flow`'s hooks do, stated by the rules of `Kernel.Laws.Flow.Rules` (which flows a split takes,
when a join may fire, what a firing consumes, the reach as a path relation), Flow's share of the state invariant, and
the reach search's own laws. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Flow

open Kernel

/-! ## Flow's hooks against the laws

What `Kernel.Feature.Flow`'s hooks do, stated by the rules, for `Kernel.Proofs` to compose with `Step`. -/

/-- Whether a candidate's condition holds in `context`: its Sequence Flow is unconditioned, or its condition evaluates
to `true`. A missing flow, a failing or a non-Boolean evaluation holds for no candidate, since it rolls the command back
before any flow is taken. -/
def candidateHolds (ctx : Ctx) (context : EvalContext) (candidate : FlowId) : Bool :=
  match ctx.program.flow? candidate with
  | none => false
  | some flow =>
    match flow.condition with
    | none => true
    | some condition =>
      match ctx.evaluate context condition with
      | .value result =>
        match result with
        | .bool value => value
        | .null | .int _ | .decimal _ _ | .double _ | .date _ | .string _ | .stringList _ | .list _ | .map _ => false
      | _ => false

/-- A condition `Kernel.Feature.Flow` reads without failing has the value `candidateHolds` gives it. -/
private theorem condition_holds {ctx : Ctx} {context : EvalContext} {candidate : FlowId} {value : Bool}
    (ran : Feature.Flow.condition ctx context candidate = .ok value) : candidateHolds ctx context candidate = value := by
  unfold Feature.Flow.condition at ran
  unfold candidateHolds
  split at ran
  · simp at ran
  · rename_i flow found
    simp only [found]
    split at ran
    · rename_i none_
      simp only [none_]
      simpa using ran
    · rename_i condition some_
      simp only [some_]
      split at ran
      · rename_i result evaluated
        simp only [evaluated]
        cases result <;> simp_all
      all_goals (rename_i evaluated; simp_all)

private theorem firstTrue_spec {ctx : Ctx} {context : EvalContext} :
    ∀ {candidates : List FlowId} {chosen : Option FlowId},
      Feature.Flow.firstTrue ctx context candidates = .ok chosen →
      (∀ flow, chosen = some flow → ∃ earlier later, candidates = earlier ++ flow :: later ∧
        (∀ other ∈ earlier, candidateHolds ctx context other = false) ∧ candidateHolds ctx context flow = true) ∧
      (chosen = none → ∀ other ∈ candidates, candidateHolds ctx context other = false)
  | [], chosen, ran => by
    simp only [Feature.Flow.firstTrue] at ran
    cases ran
    exact ⟨fun _ found => by simp at found, fun _ _ member => by simp at member⟩
  | candidate :: rest, chosen, ran => by
    simp only [Feature.Flow.firstTrue] at ran
    cases holds : Feature.Flow.condition ctx context candidate with
    | error failure => simp [holds, bind, Except.bind] at ran
    | ok value =>
      simp only [holds, bind, Except.bind] at ran
      cases value with
      | true =>
        simp only [ite_true] at ran
        cases ran
        refine ⟨fun flow found => ?_, fun absent => by simp at absent⟩
        cases found
        exact ⟨[], rest, by simp, by simp, condition_holds holds⟩
      | false =>
        simp only [Bool.false_eq_true, ite_false] at ran
        have false_ : candidateHolds ctx context candidate = false := condition_holds holds
        obtain ⟨found, absent⟩ := firstTrue_spec ran
        refine ⟨fun flow chosen_ => ?_, fun none_ other member => ?_⟩
        · obtain ⟨earlier, later, split_, ⟨before, here⟩⟩ := found flow chosen_
          refine ⟨candidate :: earlier, later, by simp [split_], ?_, here⟩
          intro other member
          rcases List.mem_cons.mp member with same | inner
          · subst same; exact false_
          · exact before other inner
        · rcases List.mem_cons.mp member with same | inner
          · subst same; exact false_
          · exact absent none_ other inner

/-- `Hooks.arriveGateway` of Flow on an Exclusive Gateway enqueues the completion of the gateway's occurrence on the
flows `ExclusiveTakes` allows, its conditions read in the state it arrived in; the conditions evaluated are exactly
those up to the first true one. -/
theorem arriveGateway_exclusive {ctx : Ctx} {header : Header} {payload : GatewayPayload} {occurrence : Occurrence}
    {state after : State} {candidates : List FlowId} {default : Option FlowId}
    (kind : payload.kind = .exclusive candidates default)
    (ran : Feature.Flow.arriveGateway ctx header payload occurrence state = .ok after) :
    ∃ taken evaluated, after = state.signal (.complete occurrence.id (.flows taken) [] .outward) ∧
      ExclusiveTakes candidates default (candidateHolds ctx (state.evalContext ctx.program occurrence.scope)) evaluated
        (some taken) := by
  simp only [Feature.Flow.arriveGateway, kind, Feature.Flow.exclusive] at ran
  cases first : Feature.Flow.firstTrue ctx (state.evalContext ctx.program occurrence.scope) candidates with
  | error failure => simp [first, bind, Except.bind] at ran
  | ok chosen =>
    simp only [first, bind, Except.bind] at ran
    obtain ⟨found, absent⟩ := firstTrue_spec first
    cases chosen with
    | some flow =>
      simp only [HOrElse.hOrElse, OrElse.orElse, Option.orElse, Except.ok.injEq] at ran
      subst ran
      obtain ⟨earlier, later, split_, ⟨before, here⟩⟩ := found flow (by simp)
      exact ⟨[flow], earlier ++ [flow], by simp [Feature.Flow.signalComplete],
        .inl ⟨earlier, flow, later, split_, before, here, by simp, by simp⟩⟩
    | none =>
      cases default with
      | none => simp [HOrElse.hOrElse, OrElse.orElse, Option.orElse] at ran
      | some fallback =>
        simp only [HOrElse.hOrElse, OrElse.orElse, Option.orElse, Except.ok.injEq] at ran
        subst ran
        exact ⟨[fallback], candidates, by simp [Feature.Flow.signalComplete],
          .inr ⟨absent (by simp), by simp, fallback, by simp, by simp⟩⟩

/-! ## The state invariant under Flow's hooks

Flow's share of the proof wave's state-invariant lane (P2), stated over `FlowOps`, generic in `inv`, so the proof reads
of `Laws.State` only that queuing a signal moves nothing but the queue; `Kernel.Proofs.Step` fills `FlowOps` for
`Laws.State.WellFormed`. `Hooks.outflow` queues flow tokens in the completing occurrence's scope occurrence, and a Link
queues its own begun occurrence's completion. -/

/-- What Flow's hooks need of the state operations they apply, for an invariant `inv` over `program`, with the flows
an outflow queues read off states that kept `src`, which the completion the outflow continues ran on kept (`inv` by
default; `Laws.Step.complete_ends` reads them under a weaker one). -/
structure FlowOps (program : Program) (inv : State → Prop) (src : State → Prop := inv) : Prop where
  /-- Flow tokens queued in the scope occurrence, which stands, of an occurrence they continue from (`LeavesFrom`). -/
  emit : ∀ state occurrence flows, inv state → (∃ entry ∈ state.scopes, entry.id = occurrence.scope) →
    LeavesFrom src program state occurrence (.flows flows) → inv (state.emit flows occurrence.scope)
  /-- The completion of a begun occurrence that stands, by flows offered where it lies. -/
  complete : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → LeaveOffered inv program state occurrence.id leave →
    inv (state.signal (.complete occurrence.id leave writes rule))

private theorem holding_mem {ctx : Ctx} {context : EvalContext} :
    ∀ (candidates found : List FlowId), Feature.Flow.holding ctx context candidates = .ok found →
      ∀ chosen ∈ found, chosen ∈ candidates
  | [], found, ran => by
    simp only [Feature.Flow.holding, Except.ok.injEq] at ran
    subst ran
    exact fun _ member => nomatch member
  | candidate :: rest, found, ran => by
    simp only [Feature.Flow.holding, bind, Except.bind] at ran
    cases holds : Feature.Flow.condition ctx context candidate with
    | error failure => simp [holds] at ran
    | ok held =>
    cases inner : Feature.Flow.holding ctx context rest with
    | error failure => simp [holds, inner] at ran
    | ok others =>
    simp only [holds, inner, Except.ok.injEq] at ran
    subst ran
    intro chosen member
    cases held <;> simp only [Bool.false_eq_true, ite_true, ite_false] at member
    · exact List.mem_cons_of_mem _ (holding_mem rest others inner chosen member)
    · rcases List.mem_cons.mp member with same | later
      · exact same ▸ List.mem_cons_self ..
      · exact List.mem_cons_of_mem _ (holding_mem rest others inner chosen later)

/-- The flows an inclusive choice takes are among its candidates, its default and its outgoing flows. -/
theorem inclusiveChoice_mem {ctx : Ctx} {context : EvalContext} {candidates : List FlowId} {default : Option FlowId}
    {outgoing : List FlowId} {noFlow : String} {flows : List FlowId}
    (chosen : Feature.Flow.inclusiveChoice ctx context candidates default outgoing noFlow = .ok flows) :
    ∀ flow ∈ flows, flow ∈ candidates ∨ default = some flow ∨ flow ∈ outgoing := by
  unfold Feature.Flow.inclusiveChoice at chosen
  by_cases empty : candidates.isEmpty = true
  · simp only [empty, ite_true, pure, Except.pure, Except.ok.injEq] at chosen
    subst chosen
    exact fun _ member => .inr (.inr member)
  simp only [empty, Bool.false_eq_true, ite_false, bind, Except.bind] at chosen
  split at chosen
  · cases chosen
  rename_i taken filtered
  have among : ∀ flow ∈ taken, flow ∈ candidates := holding_mem candidates taken filtered
  split at chosen
  · cases chosen
    exact fun _ member => .inr (.inl (by simpa [eq_comm] using member))
  · cases chosen
  · cases chosen
    exact fun flow member => .inl (among flow member)

/-- The flows an element's own selection takes are among its outgoing flows and its default. -/
theorem ownFlows_lists {ctx : Ctx} {element : Element} {context : EvalContext} {flows : List FlowId}
    (chosen : Feature.Flow.ownFlows ctx element context = .ok flows) :
    ∀ flow ∈ flows, flow ∈ element.outgoing ∨ element.envelope?.bind (·.defaultFlow) = some flow := by
  intro flow member
  rcases inclusiveChoice_mem chosen flow member with candidate | fallback | listed
  · exact .inl (List.mem_filter.mp candidate).1
  · exact .inr fallback
  · exact .inl listed

theorem mem_queued {ctx : Ctx} {flows : List FlowId} {flow : FlowId} :
    flow ∈ Feature.Flow.queued ctx flows ↔ flow ∈ flows := by
  unfold Feature.Flow.queued
  split <;> simp

/-- `Hooks.outflow` keeps `inv` from a scope occurrence that stands, continuing from where its occurrence came from. -/
theorem outflow_keeps {inv src : State → Prop} {ctx : Ctx} (ops : FlowOps ctx.program inv src)
    {occurrence : Occurrence} {leave : Leave} {state after : State} (holds : inv state)
    (stands : ∃ entry ∈ state.scopes, entry.id = occurrence.scope)
    (continues : LeavesFrom src ctx.program state occurrence leave)
    (ran : Feature.Flow.outflow ctx occurrence leave state = .ok after) : inv after := by
  unfold Feature.Flow.outflow at ran
  split at ran
  · cases ran
    exact ops.emit _ _ _ holds stands (continues.flows fun _ member => mem_queued.mp member)
  · rename_i _
    split at ran
    · rename_i element found
      cases selected : Feature.Flow.ownFlows ctx element (state.evalContext ctx.program occurrence.scope) with
      | error failure => simp [selected, bind, Except.bind] at ran
      | ok flows =>
        simp only [selected, bind, Except.bind] at ran
        cases ran
        refine ops.emit _ _ _ holds stands (continues.listed fun flow member => .inl ⟨element, found, ?_⟩)
        rcases ownFlows_lists selected flow (mem_queued.mp member) with listed | fallback
        · exact .inl listed
        · exact .inr (.inl fallback)
    · cases ran
  · cases ran

/-- `Hooks.select` keeps a completion's leave or picks flows its occurrence's element lists. -/
theorem select_lists {ctx : Ctx} {occurrence : Occurrence} {leave chosen : Leave} {state : State}
    (picked : Feature.Flow.select ctx occurrence leave state = .ok chosen) :
    chosen = leave ∨ ∃ flows, chosen = .flows flows ∧ ∀ flow ∈ flows, Lists ctx.program occurrence.element flow := by
  unfold Feature.Flow.select at picked
  split at picked
  · cases picked; exact .inl rfl
  · cases picked; exact .inl rfl
  · cases picked; exact .inl rfl
  · split at picked
    · cases picked
    · rename_i element found
      cases selected : Feature.Flow.ownFlows ctx element (state.evalContext ctx.program
          (((state.scopes.find? (·.occurrence == some occurrence.id)).map (·.id)).getD occurrence.scope)) with
      | error failure => simp [selected, bind, Except.bind] at picked
      | ok flows =>
        simp only [selected, bind, Except.bind, Except.ok.injEq] at picked
        refine .inr ⟨flows, picked.symm, fun flow member => .inl ⟨element, found, ?_⟩⟩
        rcases ownFlows_lists selected flow member with listed | fallback
        · exact .inl listed
        · exact .inr (.inl fallback)

/-- The catching Links `Feature.Flow.linkCatches` finds lie on the throwing Link's level. -/
theorem linkCatches_siblings {program : Program} {header found : Header} {name : String} {payload : EventPayload}
    (member : (found, payload) ∈ Feature.Flow.linkCatches program header name) :
    ∃ link ∈ program.siblings header, link.event? = some (found, payload) := by
  obtain ⟨link, inside, made⟩ := List.mem_filterMap.mp member
  refine ⟨link, inside, ?_⟩
  cases event : link.event? with
  | none => simp [event] at made
  | some pair =>
    simp only [event, Option.bind_some] at made
    split at made
    · cases made; rfl
    · cases made

/-- `Hooks.arriveLink` keeps `inv`: a Link completes its own begun occurrence, a throwing one by the flows of the
catching Link on its level. -/
theorem arriveLink_keeps {inv : State → Prop} {ctx : Ctx} (ops : FlowOps ctx.program inv) {header : Header}
    {payload : EventPayload} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (named : ∃ element, ctx.program.element? occurrence.element = some element ∧ element.header = header)
    (ran : Feature.Flow.arriveLink ctx header payload occurrence state = .ok after) :
    inv after := by
  unfold Feature.Flow.arriveLink Feature.Flow.signalComplete at ran
  split at ran
  · split at ran
    · rename_i _ caught target catches
      cases ran
      refine ops.complete _ _ _ _ _ holds member begun fun _ same flow inside => ?_
      cases same
      obtain ⟨element, found, headed⟩ := named
      obtain ⟨link, sibling, event⟩ := linkCatches_siblings (catches ▸ List.mem_singleton_self _)
      exact ⟨state, holds, fun _ h _ => h, fun _ h => h, fun _ h => h, .inl ⟨occurrence, member, rfl, occurrence, member, rfl,
        .inr (.inl ⟨element, found, link, headed ▸ sibling, _, _, event, inside⟩)⟩⟩
    · cases ran
    · cases ran
  · cases ran
    exact ops.complete _ _ _ _ _ holds member begun fun _ same => by cases same


/-! ### Joins

A join completes occurrences it parked earlier, which may since have left the state; `JoinOps` names what such an
occurrence keeps as `settled`, which `Kernel.Proofs.Step` fills with `Laws.State.Settled`. -/

/-- What Flow's gateway arrival needs of the state operations it applies, for an invariant `inv` over `program` and
what an occurrence a join may complete keeps, `settled`. -/
structure JoinOps (program : Program) (inv : State → Prop) (settled : State → OccurrenceId → Prop) : Prop where
  /-- A begun occurrence that stands parked at a join in its own scope occurrence, on the flow it arrived by. -/
  park : ∀ state waiting, inv state → (∃ occurrence ∈ state.occurrences, occurrence.id = waiting.occurrence ∧
    occurrence.begun = true ∧ occurrence.scope = waiting.scope ∧ occurrence.incoming = some waiting.flow) →
      inv { state with slots := { state.slots with parked := state.slots.parked ++ [waiting] } }
  /-- Some join waits taken off. -/
  unpark : ∀ state (keep : Parked → Bool), inv state →
    inv { state with slots := { state.slots with parked := state.slots.parked.filter keep } }
  parked : ∀ state waiting, inv state → waiting ∈ state.slots.parked → settled state waiting.occurrence
  begun : ∀ state occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    settled state occurrence.id
  /-- Changing the join waits keeps what has settled. -/
  reparked : ∀ state parked id, settled state id → settled { state with slots := { state.slots with parked } } id
  complete : ∀ state id leave writes rule, inv state → settled state id → LeaveOffered inv program state id leave →
    inv (state.signal (.complete id leave writes rule))
  /-- Queuing a completion keeps what has settled. -/
  completed : ∀ state id other leave writes rule, settled state id →
    settled (state.signal (.complete other leave writes rule)) id
  /-- A begun occurrence that stands arms its Event-Based Gateway in its own scope occurrence. -/
  armGateway : ∀ state occurrence header payload, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → GatewayOf program state occurrence header payload →
    inv (state.signal (.armGateway occurrence.id header.id occurrence.scope))

/-- A completion by no flow is offered everywhere. -/
theorem leaveOffered_none {inv : State → Prop} {program : Program} {state : State} {id : OccurrenceId} :
    LeaveOffered inv program state id (.flows []) :=
  fun _ same _ inside => by cases same; cases inside

/-- Completing occurrences by no flow queues their completions and moves nothing else. -/
theorem completeAll_eq (ids : List OccurrenceId) (state : State) :
    ids.foldl (Feature.Flow.signalComplete · · (.flows [])) state =
      { state with batchSignals := state.batchSignals ++ ids.map fun id => .complete id (.flows []) [] .outward } := by
  induction ids generalizing state with
  | nil => simp
  | cons id rest grows =>
    rw [List.foldl_cons, grows]
    simp [Feature.Flow.signalComplete, Laws.State.signal_eq]

/-- Completing occurrences that have settled, by no flow, keeps `inv` and what has settled. -/
theorem completeAll_keeps {program : Program} {inv : State → Prop} {settled : State → OccurrenceId → Prop}
    (ops : JoinOps program inv settled) : ∀ (ids : List OccurrenceId) (state : State), inv state → (∀ id ∈ ids, settled state id) →
      inv (ids.foldl (Feature.Flow.signalComplete · · (.flows [])) state) ∧
        ∀ id, settled state id → settled (ids.foldl (Feature.Flow.signalComplete · · (.flows [])) state) id
  | [], _, holds, _ => ⟨holds, fun _ kept => kept⟩
  | id :: rest, state, holds, all => by
    simp only [List.foldl_cons]
    have next : inv (Feature.Flow.signalComplete state id (.flows [])) :=
      ops.complete state id _ [] .outward holds (all id (List.mem_cons_self ..)) leaveOffered_none
    obtain ⟨kept, carried⟩ := completeAll_keeps ops rest _ next fun other member =>
      ops.completed state other id _ [] .outward (all other (List.mem_cons_of_mem _ member))
    exact ⟨kept, fun other held => carried other (ops.completed state other id _ [] .outward held)⟩

/-- The join waits a firing consumes are parked in its scope occurrence. -/
theorem consumed_scope {state : State} {incoming : List FlowId} {scope : ScopeOccurrenceId} {waiting : Parked}
    (member : waiting ∈ Feature.Flow.consumed state incoming scope) :
    waiting ∈ state.slots.parked ∧ waiting.scope = scope := by
  obtain ⟨flow, _, found⟩ := List.mem_filterMap.mp member
  have matched := List.find?_some found
  simp only [Bool.and_eq_true, beq_iff_eq] at matched
  exact ⟨List.mem_of_find?_eq_some found, matched.2⟩

/-- Where the gateway an arrival runs lists a flow, the flow is offered in the arriving occurrence's scope occurrence of
any state holding the occurrence and its join waits. -/
theorem gateway_offered {program : Program} {state held : State} {occurrence : Occurrence} {element : Element}
    (gateway : program.element? occurrence.element = some element ∨
      ∃ waiting ∈ state.slots.parked, waiting.occurrence = occurrence.id ∧
        (program.target? waiting.flow).bind program.element? = some element)
    (present : occurrence ∈ held.occurrences) (waits : ∀ waiting ∈ state.slots.parked, waiting ∈ held.slots.parked)
    {flow : FlowId} (listed : Listed element flow) : Offered program held occurrence.scope flow := by
  refine ⟨occurrence, present, rfl, ?_⟩
  rcases gateway with found | ⟨waiting, parked, named, target⟩
  · exact .inl (.inl ⟨element, found, listed⟩)
  · exact .inr (.inr ⟨waiting, waits waiting parked, named, element, target, listed⟩)

/-- A join keeps `inv` for a begun occurrence that stands: it parks it, and a firing completes occurrences parked,
the one that leaves by flows the gateway `element` lists. -/
theorem join_keeps {program : Program} {inv : State → Prop} {settled : State → OccurrenceId → Prop}
    (ops : JoinOps program inv settled) {occurrence : Occurrence} {incoming : List FlowId} {state after : State}
    {ready : State → Bool} {flows : State → Except Failure (List FlowId)} {element : Element} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (gateway : program.element? occurrence.element = some element ∨ ∃ waiting ∈ state.slots.parked,
      waiting.occurrence = occurrence.id ∧ (program.target? waiting.flow).bind program.element? = some element)
    (listed : ∀ current selected, flows current = .ok selected → ∀ flow ∈ selected, Listed element flow)
    (ran : Feature.Flow.join occurrence incoming state ready flows = .ok after) :
    inv after := by
  unfold Feature.Flow.join at ran
  have own := ops.begun _ _ holds member begun
  cases arrived : occurrence.incoming with
  | none => simp [arrived] at ran
  | some flow =>
  simp only [arrived, bind, Except.bind] at ran
  by_cases short : incoming.length ≤ 1
  · rw [ite_eq_left short] at ran
    split at ran
    · cases ran
    · rename_i selected taken
      cases ran
      exact ops.complete _ _ _ _ _ holds own fun _ same flow inside => by
        cases same
        exact ⟨state, holds, fun _ h _ => h, fun _ h => h, fun _ h => h, .inl ⟨occurrence, member, rfl,
          gateway_offered gateway member (fun _ waiting => waiting) (listed _ _ taken flow inside)⟩⟩
  rw [ite_eq_right short] at ran
  -- The parked state: the occurrence was parked already, or is parked now.
  generalize parkedState : (if state.slots.parked.any (·.occurrence == occurrence.id) = true then state
    else Feature.Flow.park state { occurrence := occurrence.id, flow, scope := occurrence.scope }) = parked at ran
  have parkedHolds : inv parked ∧ settled parked occurrence.id ∧ parked.occurrences = state.occurrences ∧
      ∀ waiting ∈ state.slots.parked, waiting ∈ parked.slots.parked := by
    rw [← parkedState]
    split
    · exact ⟨holds, own, rfl, fun _ waiting => waiting⟩
    · exact ⟨ops.park _ _ holds ⟨occurrence, member, rfl, begun, rfl, arrived⟩, ops.reparked _ _ _ own, rfl,
        fun _ waiting => List.mem_append_left _ waiting⟩
  obtain ⟨parkedInv, parkedOwn, parkedOccurrences, parkedWaits⟩ := parkedHolds
  have present : occurrence ∈ parked.occurrences := parkedOccurrences ▸ member
  split at ran
  · cases ran
    exact parkedInv
  generalize consumedList : Feature.Flow.consumed parked incoming occurrence.scope = consumed at ran
  have taken : ∀ waiting ∈ consumed, settled parked waiting.occurrence ∧ waiting ∈ parked.slots.parked ∧
      waiting.scope = occurrence.scope := fun waiting inside => by
    rw [← consumedList] at inside
    obtain ⟨parkedHere, inScope⟩ := consumed_scope inside
    exact ⟨ops.parked _ _ parkedInv parkedHere, parkedHere, inScope⟩
  have unparkedHolds := ops.unpark parked (!consumed.contains ·) parkedInv
  have carry : ∀ id, settled parked id → settled (Feature.Flow.unpark parked consumed) id :=
    fun id kept => ops.reparked _ _ _ kept
  split at ran
  · cases ran
  rename_i selected chosen
  cases ran
  generalize firingIs : (if consumed.any (·.occurrence == occurrence.id) = true then occurrence.id
    else (consumed.getLast?.map (·.occurrence)).getD occurrence.id) = firing
  obtain ⟨kept, carried⟩ := completeAll_keeps ops ((consumed.map (·.occurrence)).filter (· != firing))
    (Feature.Flow.unpark parked consumed) unparkedHolds fun id inside => by
      obtain ⟨waiting, held, rfl⟩ := List.mem_map.mp (List.mem_filter.mp inside).1
      exact carry _ (taken waiting held).1
  have offered : ∀ flow ∈ selected, Offered program parked occurrence.scope flow :=
    fun flow inside => gateway_offered gateway present parkedWaits (listed _ _ chosen flow inside)
  rw [completeAll_eq] at kept carried ⊢
  split at firingIs
  · subst firingIs
    exact ops.complete _ _ _ _ _ kept (carried _ (carry _ parkedOwn)) fun _ equal flow inside => by
      cases equal
      exact ⟨parked, parkedInv, fun _ h _ => h, fun _ h => h, fun _ h => h, .inl ⟨occurrence, present, rfl, offered flow inside⟩⟩
  · cases last : consumed.getLast? with
    | none =>
      rw [last] at firingIs
      subst firingIs
      exact ops.complete _ _ _ _ _ kept (carried _ (carry _ parkedOwn)) fun _ equal flow inside => by
        cases equal
        exact ⟨parked, parkedInv, fun _ h _ => h, fun _ h => h, fun _ h => h, .inl ⟨occurrence, present, rfl, offered flow inside⟩⟩
    | some waiting =>
      rw [last] at firingIs
      subst firingIs
      obtain ⟨settledHere, parkedHere, inScope⟩ := taken waiting (List.mem_of_getLast? last)
      refine ops.complete _ _ _ _ _ kept (carried _ (carry _ settledHere)) fun _ equal flow inside => ?_
      cases equal
      exact ⟨parked, parkedInv, fun _ h _ => h, fun _ h => h, fun _ h => h, .inr ⟨waiting, parkedHere, rfl, inScope ▸ offered flow inside⟩⟩

/-- The flows an inclusive split takes its outgoing flows, its candidates and its default list. -/
theorem inclusiveFlows_mem {ctx : Ctx} {candidates : List FlowId} {default : Option FlowId} {outgoing : List FlowId}
    {scope : ScopeOccurrenceId} {state : State} {flows : List FlowId}
    (chosen : Feature.Flow.inclusiveFlows ctx candidates default outgoing scope state = .ok flows) :
    ∀ flow ∈ flows, flow ∈ candidates ∨ default = some flow ∨ flow ∈ outgoing :=
  inclusiveChoice_mem chosen

/-- `Hooks.arriveGateway` keeps `inv` for a begun occurrence that stands, of the gateway it runs. -/
theorem arriveGateway_keeps {inv : State → Prop} {settled : State → OccurrenceId → Prop} {ctx : Ctx}
    (ops : JoinOps ctx.program inv settled) {header : Header} {payload : GatewayPayload} {occurrence : Occurrence}
    {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (named : GatewayOf ctx.program state occurrence header payload)
    (ran : Feature.Flow.arriveGateway ctx header payload occurrence state = .ok after) : inv after := by
  obtain ⟨element, isGateway, gateway⟩ := id named
  have listing : ∀ flow, (flow ∈ payload.outgoing ∨ ∃ candidates default, (payload.kind = .exclusive candidates default ∨
      payload.kind = .inclusive candidates default) ∧ (flow ∈ candidates ∨ default = some flow)) → Listed element flow :=
    fun flow listed => .inr (.inr ⟨header, payload, isGateway, listed⟩)
  unfold Feature.Flow.arriveGateway at ran
  split at ran
  · rename_i candidates default kind
    unfold Feature.Flow.exclusive at ran
    cases first : Feature.Flow.firstTrue ctx (state.evalContext ctx.program occurrence.scope) candidates with
    | error failure => simp [first, bind, Except.bind] at ran
    | ok chosen =>
      simp only [first, bind, Except.bind] at ran
      have takes : ∀ flow, (chosen <|> default) = some flow → flow ∈ candidates ∨ default = some flow := by
        intro flow picked
        cases chosen with
        | some found =>
          simp only [HOrElse.hOrElse, OrElse.orElse, Option.orElse, Option.some.injEq] at picked
          subst picked
          obtain ⟨earlier, later, split_, _⟩ := (firstTrue_spec first).1 _ rfl
          exact .inl (split_ ▸ List.mem_append_right _ (List.mem_cons_self ..))
        | none =>
          simp only [HOrElse.hOrElse, OrElse.orElse, Option.orElse] at picked
          exact .inr picked
      split at ran
      · rename_i flow picked
        cases ran
        refine ops.complete _ _ _ _ _ holds (ops.begun _ _ holds member begun) fun _ same taken inside => ?_
        cases same
        rw [List.mem_singleton.mp inside]
        exact ⟨state, holds, fun _ h _ => h, fun _ h => h, fun _ h => h, .inl ⟨occurrence, member, rfl,
          gateway_offered gateway member (fun _ waiting => waiting)
          (listing _ (.inr ⟨candidates, default, .inl kind, takes flow picked⟩))⟩⟩
      · cases ran
  · exact join_keeps ops holds member begun gateway (fun _ _ taken flow inside => by
      cases taken
      exact listing flow (.inl inside)) ran
  · rename_i candidates default kind
    exact join_keeps ops holds member begun gateway (fun _ _ taken flow inside => by
      rcases inclusiveFlows_mem taken flow inside with candidate | fallback | outgoing
      · exact listing flow (.inr ⟨candidates, default, .inr kind, .inl candidate⟩)
      · exact listing flow (.inr ⟨candidates, default, .inr kind, .inr fallback⟩)
      · exact listing flow (.inl outgoing)) ran
  · cases ran
    exact ops.armGateway _ _ _ _ holds member begun named

/-! ## The reach search (DC3) and suspended positions (DC19)

`Feature.Flow.reaches` answers exactly whether a path of `reachNext` steps leads from a member of its start list to a
target (`reaches_iff`), so it answers from the members of the start list alone: more members answer at least as much
(`reaches_mono`) and duplicates change nothing (`reaches_congr`). Before DC3 a fuel figure bounded the search, and an
exhausted fuel answered "reachable" whatever the graph, which no such law admits. `ReachPath` is the search's own step
relation; relating it to `CanReach` above is the proof wave's. A suspended occurrence of the slots is a position
(`suspended_mem_positions`), so it keeps a join waiting while it can reach an empty input (`suspended_keeps_waiting`). -/

section Reach

open Kernel.Feature.Flow

/-- A path of the reach query's steps from `flow` to `target`, passing no join `gateway`. -/
inductive ReachPath (ctx : Ctx) (gateway : ElementId) : FlowId → FlowId → Prop where
  | here (flow : FlowId) : ReachPath ctx gateway flow flow
  | step {flow after target : FlowId} :
      after ∈ reachNext ctx gateway flow → ReachPath ctx gateway after target → ReachPath ctx gateway flow target

/-- A flow the program does not declare leads nowhere. -/
theorem reachNext_undeclared {ctx : Ctx} {gateway : ElementId} {flow : FlowId}
    (undeclared : ¬(ctx.program.flows.map (·.id)).contains flow = true) : reachNext ctx gateway flow = [] := by
  simp [reachNext, Laws.IL.target?_undeclared undeclared]

/-- Some target is at the end of a path from `start`. -/
def ReachLeads (ctx : Ctx) (gateway : ElementId) (targets : List FlowId) (start : FlowId) : Prop :=
  ∃ target ∈ targets, ReachPath ctx gateway start target

/-- What the search answers "reachable" for is reachable: some frontier flow leads to a target. -/
theorem reachSearch_sound {ctx : Ctx} {gateway : ElementId} {targets seen frontier : List FlowId}
    (found : reachSearch ctx gateway targets seen frontier = true) :
    ∃ start ∈ frontier, ReachLeads ctx gateway targets start := by
  fun_induction reachSearch ctx gateway targets seen frontier with
  | case1 => simp at found
  | case2 _ flow rest hit => exact ⟨flow, by simp, flow, by simpa using hit, .here flow⟩
  | case3 _ flow rest _ _ ih =>
    obtain ⟨start, mem, leads⟩ := ih found
    exact ⟨start, List.mem_cons_of_mem _ mem, leads⟩
  | case4 _ flow rest _ _ _ ih =>
    obtain ⟨start, mem, leads⟩ := ih found
    obtain ⟨target, isTarget, path⟩ := leads
    rcases List.mem_append.mp mem with inRest | after
    · exact ⟨start, List.mem_cons_of_mem _ inRest, target, isTarget, path⟩
    · exact ⟨flow, by simp, target, isTarget, .step after path⟩
  | case5 _ flow rest _ _ _ ih =>
    obtain ⟨start, mem, leads⟩ := ih found
    exact ⟨start, List.mem_cons_of_mem _ mem, leads⟩

/-- What the search answers "unreachable" for is unreachable: when it ends without a target, no path from a seen or
frontier flow reaches one, given that no seen flow is a target and every step out of a seen flow lands on a seen flow,
a frontier flow or a non-target flow that leads nowhere. -/
theorem reachSearch_complete {ctx : Ctx} {gateway : ElementId} {targets seen frontier : List FlowId}
    (missed : reachSearch ctx gateway targets seen frontier = false)
    (seenFree : ∀ flow ∈ seen, flow ∉ targets)
    (closed : ∀ flow ∈ seen, ∀ after ∈ reachNext ctx gateway flow,
      after ∈ seen ∨ after ∈ frontier ∨ (reachNext ctx gateway after = [] ∧ after ∉ targets)) :
    ∀ start, (start ∈ seen ∨ start ∈ frontier) → ∀ target, ReachPath ctx gateway start target → target ∉ targets := by
  fun_induction reachSearch ctx gateway targets seen frontier with
  | case1 seen =>
    -- Every path from a seen flow stays among seen flows and dead ends, none a target.
    have safe : ∀ start target, ReachPath ctx gateway start target →
        start ∈ seen ∨ (reachNext ctx gateway start = [] ∧ start ∉ targets) → target ∉ targets := by
      intro start target path
      induction path with
      | here flow =>
        rintro (mem | ⟨_, free⟩)
        · exact seenFree flow mem
        · exact free
      | step after _ ih =>
        rintro (mem | ⟨dead, _⟩)
        · rcases closed _ mem _ after with seenAfter | none | dead
          · exact ih (.inl seenAfter)
          · simp at none
          · exact ih (.inr dead)
        · simp [dead] at after
    intro start inSome target path
    exact safe start target path (.inl (by simpa using inSome))
  | case2 => simp at missed
  | case3 seen flow rest _ old ih =>
    have inSeen : flow ∈ seen := by simpa using old
    intro start inSome
    refine ih missed seenFree (fun x mem after step => ?_) start ?_
    · rcases closed x mem after step with s | f | d
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact .inl (same ▸ inSeen)
        · exact .inr (.inl r)
      · exact .inr (.inr d)
    · rcases inSome with s | f
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact .inl (same ▸ inSeen)
        · exact .inr r
  | case4 seen flow rest hit _ _ ih =>
    have free : flow ∉ targets := by simpa using hit
    intro start inSome
    refine ih missed ?_ (fun x mem after step => ?_) start ?_
    · intro x mem
      rcases List.mem_cons.mp mem with same | s
      · exact same ▸ free
      · exact seenFree x s
    · rcases List.mem_cons.mp mem with same | s
      · subst same
        exact .inr (.inl (List.mem_append_right _ step))
      · rcases closed x s after step with s' | f | d
        · exact .inl (List.mem_cons_of_mem _ s')
        · rcases List.mem_cons.mp f with same | r
          · exact .inl (same ▸ List.mem_cons_self)
          · exact .inr (.inl (List.mem_append_left _ r))
        · exact .inr (.inr d)
    · rcases inSome with s | f
      · exact .inl (List.mem_cons_of_mem _ s)
      · rcases List.mem_cons.mp f with same | r
        · exact .inl (same ▸ List.mem_cons_self)
        · exact .inr (List.mem_append_left _ r)
  | case5 seen flow rest hit _ undeclared ih =>
    have free : flow ∉ targets := by simpa using hit
    have dead : reachNext ctx gateway flow = [] := reachNext_undeclared undeclared
    intro start inSome target path
    -- The undeclared flow leads nowhere, so a path from it ends where it starts.
    have fromDead : start = flow → target ∉ targets := by
      rintro rfl
      cases path with
      | here => exact free
      | step after _ => simp [dead] at after
    refine (Classical.em (start = flow)).elim fromDead fun other => ?_
    refine ih missed seenFree (fun x mem after step => ?_) start ?_ target path
    · rcases closed x mem after step with s | f | d
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact .inr (.inr (same ▸ ⟨dead, free⟩))
        · exact .inr (.inl r)
      · exact .inr (.inr d)
    · rcases inSome with s | f
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact absurd same other
        · exact .inr r

/-- `reaches` answers exactly whether some member of `start` leads to a target. -/
theorem reaches_iff {ctx : Ctx} {gateway : ElementId} {targets start : List FlowId} :
    reaches ctx gateway targets start = true ↔ ∃ flow ∈ start, ReachLeads ctx gateway targets flow := by
  constructor
  · exact reachSearch_sound
  · rintro ⟨flow, mem, leads⟩
    obtain ⟨target, isTarget, path⟩ := leads
    cases answer : reaches ctx gateway targets start with
    | true => rfl
    | false =>
      exact absurd isTarget (reachSearch_complete answer (by simp) (by simp) flow (.inr mem) target path)

/-- **Monotone reach (DC3).** A start list holding at least the members of another answers "reachable" whenever that
one does, so more positions never let a join fire that fewer would keep waiting. -/
theorem reaches_mono {ctx : Ctx} {gateway : ElementId} {targets start more : List FlowId}
    (sub : ∀ flow ∈ start, flow ∈ more) (reached : reaches ctx gateway targets start = true) :
    reaches ctx gateway targets more = true := by
  obtain ⟨flow, mem, leads⟩ := reaches_iff.mp reached
  exact reaches_iff.mpr ⟨flow, sub flow mem, leads⟩

/-- Start lists with the same members answer alike: a duplicate entry changes nothing, the defect class DC3 removed. -/
theorem reaches_congr {ctx : Ctx} {gateway : ElementId} {targets start other : List FlowId}
    (same : ∀ flow, flow ∈ start ↔ flow ∈ other) :
    reaches ctx gateway targets start = reaches ctx gateway targets other := by
  cases answer : reaches ctx gateway targets start with
  | true => exact (reaches_mono (fun flow mem => (same flow).mp mem) answer).symm
  | false =>
    cases answer' : reaches ctx gateway targets other with
    | false => rfl
    | true => rw [reaches_mono (fun flow mem => (same flow).mpr mem) answer'] at answer; cases answer

/-- A start list that repeats one flow answers as that flow alone, however many times it repeats. -/
theorem reaches_duplicate {ctx : Ctx} {gateway : ElementId} {targets : List FlowId} (flow : FlowId) :
    reaches ctx gateway targets [flow, flow] = reaches ctx gateway targets [flow] :=
  reaches_congr fun _ => by simp

/-- Every flow a suspended occurrence of `scope` leaves on is a position of `scope` (DC19). -/
theorem suspended_mem_positions {ctx : Ctx} {state : State} {gateway : ElementId} {scope : ScopeOccurrenceId}
    {waiting : Suspended} {flow : FlowId} (mem : waiting ∈ state.slots.suspended) (here : waiting.scope = scope)
    (leaves : flow ∈ suspendedFlows ctx waiting) : flow ∈ positions ctx state gateway scope := by
  unfold positions
  simp only [List.mem_append, List.mem_flatMap, List.mem_filter]
  exact .inr ⟨waiting, ⟨mem, by simp [here]⟩, leaves⟩

/-- **A join waits for its suspended occurrences (DC19).** While a held occurrence or a compensation resume of the
join's scope occurrence leaves on a flow with a path to an empty incoming flow, the reach answers "reachable", so the
join keeps waiting (CIB-INT-0016). -/
theorem suspended_keeps_waiting {ctx : Ctx} {state : State} {gateway : ElementId} {scope : ScopeOccurrenceId}
    {waiting : Suspended} {flow target : FlowId} {empty : List FlowId} (mem : waiting ∈ state.slots.suspended)
    (here : waiting.scope = scope) (leaves : flow ∈ suspendedFlows ctx waiting) (path : ReachPath ctx gateway flow target)
    (isEmpty : target ∈ empty) : reaches ctx gateway empty (positions ctx state gateway scope) = true :=
  reaches_iff.mpr ⟨flow, suspended_mem_positions mem here leaves, target, isEmpty, path⟩

end Reach

end Kernel.Laws.Flow
