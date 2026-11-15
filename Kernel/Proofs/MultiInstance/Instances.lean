module

public import Kernel.Laws.MultiInstance
public import Kernel.Proofs.MultiInstance.Numbered
public import Kernel.Proofs.MultiInstance.Hooks

/-! # Proofs: the numbering through a body's instances

What beginning a body's instances keeps of `Numbered`: the slots it opens lie in scope occurrences issued since, which
no occurrence and no begin queued before names, and their begins queue in slot order behind every begin queued before;
it opens a slot only of a body none of whose slots is active, so no begin queued before is one of its body's. The
Multi-Instance hooks keep `Numbered` beside `WellFormed` and the slot invariant's ownership, given the ownership of the
states a hook passes through (`numbered_arrive`, `numbered_completeBody`, `numbered_instanceCompleted`). It imports no
feature but Multi-Instance (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Precedes)
open Kernel.Laws.MultiInstance (LoopOf QueuedFor Begun Requested instanceRequest)
open Kernel.Laws.Step (OccurPending)

/-! ## Lists -/

/-- A pair in order in an appended list lies in order in the front, across the seam, or in the back. -/
theorem precedes_split {α : Type} {front back : List α} {first second : α}
    (precedes : Precedes (front ++ back) first second) :
    Precedes front first second ∨ (first ∈ front ∧ second ∈ back) ∨ Precedes back first second := by
  obtain ⟨one, two, rest⟩ := List.sublist_append_iff.mp precedes
  obtain ⟨split, oneIn, twoIn⟩ := rest
  rcases one with _ | ⟨x, _ | ⟨y, _ | ⟨z, more⟩⟩⟩
  · rw [List.nil_append] at split
    exact .inr (.inr (show [first, second].Sublist back from split ▸ twoIn))
  · obtain ⟨rfl, tail⟩ := List.cons.inj split
    simp only [List.append_eq, List.nil_append] at tail
    exact .inr (.inl ⟨oneIn.subset (List.mem_singleton_self _),
      twoIn.subset (tail ▸ List.mem_singleton_self second)⟩)
  · obtain ⟨rfl, tail⟩ := List.cons.inj split
    obtain ⟨rfl, _⟩ := List.cons.inj tail
    exact .inl oneIn
  · obtain ⟨_, tail⟩ := List.cons.inj split
    obtain ⟨_, empty⟩ := List.cons.inj tail
    exact absurd empty.symm (List.cons_ne_nil _ _)

/-- A pair in order in a reversed list lies in the other order in the list. -/
theorem precedes_reverse {α : Type} {l : List α} {first second : α} (precedes : Precedes l.reverse first second) :
    Precedes l second first := by
  exact List.reverse_sublist.mp (show [second, first].reverse.Sublist l.reverse from precedes)

/-- The instance begin a slot's request names. -/
theorem instanceRequest_fields (run : MultiInstanceRun) (scope : ScopeOccurrenceId) :
    (instanceRequest run scope).continuation = .multiInstance run.occurrence ∧ (instanceRequest run scope).scope = scope ∧
      (instanceRequest run scope).element = run.element ∧ (instanceRequest run scope).reserved = none :=
  ⟨rfl, rfl, rfl, rfl⟩

/-- The two branch schedules differ. -/
theorem schedule_ne : BranchSchedule.orderInvariant ≠ .declarationDepthFirst := nofun

/-- Two requests of slots `opened` lists, in order, are of slots in increasing order when `opened` increases: each the
slot its request is active in. -/
theorem requested_ordered {run : MultiInstanceRun} {opened : List Nat} {instances : List Iteration}
    {requests : List BeginRequest} (requested : Requested run opened instances requests)
    (ordered : opened.Pairwise (· < ·)) {first second : BeginRequest} (precedes : Precedes requests first second) :
    ∃ one two, one < two ∧ one ∈ opened ∧ two ∈ opened ∧ instances[one]? = some (.active first.scope) ∧
      instances[two]? = some (.active second.scope) := by
  obtain ⟨slots, indices, rest⟩ := requested
  obtain ⟨rfl, active⟩ := rest
  obtain ⟨picked, pickedIn, same⟩ := List.sublist_map_iff.mp precedes
  rcases picked with _ | ⟨x, _ | ⟨y, _ | ⟨z, more⟩⟩⟩
  · exact absurd same (List.cons_ne_nil _ _)
  · exact absurd (List.cons.inj same).2 (List.cons_ne_nil _ _)
  · obtain ⟨rfl, tail⟩ := List.cons.inj same
    obtain ⟨rfl, _⟩ := List.cons.inj tail
    have sub : ([x, y].map Prod.fst).Sublist opened := indices ▸ pickedIn.map Prod.fst
    have lower : x.1 < y.1 := List.rel_of_pairwise_cons (l := [y.1]) (ordered.sublist sub) (List.mem_singleton_self _)
    refine ⟨x.1, y.1, lower, indices ▸ List.mem_map_of_mem (f := Prod.fst) (pickedIn.subset (List.mem_cons_self ..)),
      indices ▸ List.mem_map_of_mem (f := Prod.fst) (pickedIn.subset (List.mem_cons_of_mem _ (List.mem_singleton_self _))),
      ?_, ?_⟩
    · rw [(instanceRequest_fields run x.2).2.1]
      exact active x (pickedIn.subset (List.mem_cons_self ..))
    · rw [(instanceRequest_fields run y.2).2.1]
      exact active y (pickedIn.subset (List.mem_cons_of_mem _ (List.mem_singleton_self _)))
  · exact absurd (List.cons.inj (List.cons.inj same).2).2.symm (List.cons_ne_nil _ _)

/-- A request of the slots `opened` lists is the begin of the instance active in one of them. -/
theorem requested_mem {run : MultiInstanceRun} {opened : List Nat} {instances : List Iteration}
    {requests : List BeginRequest} (requested : Requested run opened instances requests) {request : BeginRequest}
    (member : request ∈ requests) : ∃ index ∈ opened, request = instanceRequest run request.scope ∧
      instances[index]? = some (.active request.scope) := by
  obtain ⟨slots, indices, rest⟩ := requested
  obtain ⟨rfl, active⟩ := rest
  obtain ⟨slot, inside, rfl⟩ := List.mem_map.mp member
  rw [(instanceRequest_fields run slot.2).2.1]
  exact ⟨slot.1, indices ▸ List.mem_map_of_mem inside, rfl, active slot inside⟩

/-- A body's slot record with other slots keeps the body. -/
theorem withInstances_fields (base : MultiInstanceRun) (instances : List Iteration) :
    ({ base with instances } : MultiInstanceRun).occurrence = base.occurrence ∧
      ({ base with instances } : MultiInstanceRun).element = base.element ∧
      ({ base with instances } : MultiInstanceRun).instances = instances :=
  ⟨rfl, rfl, rfl⟩

/-! ## Beginning a body's instances -/

/-- Beginning a body's instances keeps `Numbered` when the body is running or keyed by no running body and none of its
slots active, it opens a slot only while none of its slots is active, and its element loops: an occurrence lies in a
scope occurrence issued before, so in none of the slots it opens, and every begin queued before targets a slot it does
not open, so the begins it queues, of the slots it opens in increasing order, follow every other of their body's. -/
theorem Numbered.beginInstances {inv : State → Prop} {settled : State → Nat → Prop} {ctx : Ctx} {loop : MultiInstance}
    {state queued : State} {base : MultiInstanceRun} {instances : List Iteration}
    (formed : WellFormed ctx.program state) (owns : SlotsOwned state) (held : Numbered ctx.program state)
    (begun : Begun inv settled ctx loop state base queued instances)
    (based : base ∈ state.slots.multiInstances ∨ (∀ run ∈ state.slots.multiInstances, run.occurrence ≠ base.occurrence) ∧
      ∀ scope, Iteration.active scope ∉ base.instances)
    (quiet : Feature.MultiInstance.opening loop.mode base.instances ≠ [] →
      ∀ scope, Iteration.active scope ∉ base.instances)
    (looped : LoopOf ctx.program base.element loop) :
    Numbered ctx.program (Feature.MultiInstance.setRun queued { base with instances }) := by
  obtain ⟨each, qs⟩ := held
  obtain ⟨requests, requested, queuedAs⟩ := begun.queues
  have fields := withInstances_fields base instances
  have opens := begun.opens
  have aRuns : ∀ r ∈ (Feature.MultiInstance.setRun queued { base with instances }).slots.multiInstances,
      (r ∈ state.slots.multiInstances ∧ r.occurrence ≠ base.occurrence) ∨ r = { base with instances } :=
    fun r member => (mem_setRun member).imp_left fun old => ⟨begun.slots ▸ old.1, fields.1 ▸ old.2⟩
  have aNext := setRun_mem queued { base with instances }
  have aKeep : ∀ r ∈ state.slots.multiInstances, r.occurrence ≠ base.occurrence →
      r ∈ (Feature.MultiInstance.setRun queued { base with instances }).slots.multiInstances := fun r member differs =>
    setRun_keeps (begun.slots ▸ member) (fields.1 ▸ differs)
  have aSame := Laws.MultiInstance.setRun_eq queued { base with instances }
  have aScopes : (Feature.MultiInstance.setRun queued { base with instances }).scopes = queued.scopes := by rw [aSame]
  have aOccs : (Feature.MultiInstance.setRun queued { base with instances }).occurrences = state.occurrences := by
    rw [aSame]; exact begun.occurrences
  have aSignals : (Feature.MultiInstance.setRun queued { base with instances }).signals = queued.signals := by
    rw [aSame]
  have aTokens : (Feature.MultiInstance.setRun queued { base with instances }).tokens = queued.tokens := by rw [aSame]
  have aComp : (Feature.MultiInstance.setRun queued { base with instances }).slots.compensation.runs =
      state.slots.compensation.runs := by
    rw [aSame]; exact congrArg (·.compensation.runs) begun.slots
  clear aSame
  revert aRuns aNext aKeep aScopes aOccs aSignals aTokens aComp
  generalize Feature.MultiInstance.setRun queued { base with instances } = after
  intro aRuns aNext aKeep aScopes aOccs aSignals aTokens aComp
  revert aRuns aNext fields opens
  generalize ({ base with instances } : MultiInstanceRun) = next
  intro fields opens aRuns aNext
  -- What lies below the counter of `state`.
  have occBelow : ∀ o ∈ state.occurrences, o.scope.value < state.nextIssue := fun o member => by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes o member)
    exact named ▸ formed.issued.scopes entry inside
  have queuedBelow : ∀ request, Laws.State.Queued state request → request.scope.value < state.nextIssue :=
    formed.claimed.scopesIssued
  have oldSlot : ∀ (i : Nat) (scope : ScopeOccurrenceId), next.instances[i]? = some (.active scope) → scope.value < state.nextIssue →
      base.instances[i]? = some (.active scope) := fun i scope slot below => by
    rcases begun.counted i scope (fields.2.2 ▸ slot) with old | fresh
    · exact old
    · exact absurd below (Nat.not_lt.mpr fresh.1)
  have baseIn : ∀ (i : Nat) (scope : ScopeOccurrenceId), base.instances[i]? = some (.active scope) → base ∈ state.slots.multiInstances :=
    fun i scope slot => based.elim id fun apart => absurd (List.mem_of_getElem? slot) (apart.2 scope)
  have oldEntry : ∀ entry ∈ queued.scopes, entry.id.value < state.nextIssue → entry ∈ state.scopes :=
    fun entry inside below => (begun.scopes entry inside).resolve_right (Nat.not_le.mpr below)
  have newReq : ∀ request ∈ requests, request.continuation = .multiInstance base.occurrence ∧
      request.element = base.element ∧ request.reserved = none ∧
      (∃ i ∈ Feature.MultiInstance.opening loop.mode base.instances,
        next.instances[i]? = some (.active request.scope)) ∧ ∀ scope, Iteration.active scope ∉ base.instances :=
    fun request member => by
      obtain ⟨i, opened, same, slot⟩ := requested_mem requested member
      have parts := instanceRequest_fields base request.scope
      rw [← same] at parts
      exact ⟨parts.1, parts.2.2.1, parts.2.2.2, ⟨i, opened, fields.2.2 ▸ slot⟩, quiet (List.ne_nil_of_mem opened)⟩
  -- Where the queued begins of `after` came from.
  have queues : (Laws.Step.beginsOf after.signals = Laws.Step.beginsOf state.signals ++ requests ∧
        Laws.Step.deferredOf after.tokens = Laws.Step.deferredOf state.tokens) ∨
      (ctx.program.options.branchSchedule = .declarationDepthFirst ∧
        Laws.Step.beginsOf after.signals = Laws.Step.beginsOf state.signals ∧
        Laws.Step.deferredOf after.tokens = Laws.Step.deferredOf state.tokens ++ requests.reverse) := by
    rw [aSignals, aTokens]
    rcases queuedAs with ⟨signals, tokens⟩ | ⟨schedule, _, signals, tokens⟩
    · exact .inl ⟨by rw [signals, Laws.Step.beginsOf_append, Laws.Step.beginsOf_map], by rw [tokens]⟩
    · exact .inr ⟨schedule, by rw [signals], by
        rw [tokens, Laws.Step.deferredOf_append, ← List.map_reverse, Laws.Step.deferredOf_map]⟩
  have signalsIn : ∀ signal ∈ after.signals, signal ∈ state.signals ∨ ∃ request ∈ requests, signal = .begin request :=
    fun signal member => by
      rw [aSignals] at member
      rcases queuedAs with ⟨signals, _⟩ | ⟨_, _, signals, _⟩
      · rw [signals] at member
        rcases List.mem_append.mp member with old | new
        · exact .inl old
        · obtain ⟨request, inside, same⟩ := List.mem_map.mp new
          exact .inr ⟨request, inside, same.symm⟩
      · exact .inl (signals ▸ member)
  have queuedAfter : ∀ request, Laws.State.Queued after request → Laws.State.Queued state request ∨ request ∈ requests :=
    fun request inQueue => by
      rcases inQueue with signal | token
      · have inside := Laws.Step.mem_beginsOf.mpr signal
        rcases queues with ⟨begins, _⟩ | ⟨_, begins, _⟩ <;> rw [begins] at inside
        · exact (List.mem_append.mp inside).imp_left fun old => .inl (Laws.Step.mem_beginsOf.mp old)
        · exact .inl (.inl (Laws.Step.mem_beginsOf.mp inside))
      · have inside := Laws.Step.mem_deferredOf.mpr token
        rcases queues with ⟨_, deferred⟩ | ⟨_, _, deferred⟩ <;> rw [deferred] at inside
        · exact .inl (.inr (Laws.Step.mem_deferredOf.mp inside))
        · exact (List.mem_append.mp inside).imp (fun old => .inr (Laws.Step.mem_deferredOf.mp old))
            List.mem_reverse.mp
  -- A run of `after` a begin queued before is for is one of `state`, or the body's, which ran in `state`.
  have back : ∀ r ∈ after.slots.multiInstances, ∀ i request, QueuedFor r i request → Laws.State.Queued state request →
      ∃ r' ∈ state.slots.multiInstances, ∀ j other, QueuedFor r j other → Laws.State.Queued state other →
        QueuedFor r' j other := by
    intro r member i request for_ old
    rcases aRuns r member with mine | same
    · exact ⟨r, mine.1, fun _ _ for' _ => for'⟩
    · subst same
      have slot := oldSlot i request.scope for_.2 (queuedBelow request old)
      exact ⟨base, baseIn _ _ slot, fun j other for' old' =>
        ⟨fields.1 ▸ for'.1, oldSlot j other.scope for'.2 (queuedBelow other old')⟩⟩
  -- A run of `after` a new begin is for is the body's, none of whose slots was active.
  have newFor : ∀ r ∈ after.slots.multiInstances, ∀ i request, QueuedFor r i request → request ∈ requests →
      r = next ∧ ∀ scope, Iteration.active scope ∉ base.instances := by
    intro r member i request for_ new
    have parts := newReq request new
    have same : r.occurrence = base.occurrence := Laws.Step.multiInstance_inj (for_.1.symm.trans parts.1)
    rcases aRuns r member with mine | here
    · exact absurd same mine.2
    · exact ⟨here, parts.2.2.2.2⟩
  have mixed : ∀ r ∈ after.slots.multiInstances, ∀ i j old new, QueuedFor r i old → Laws.State.Queued state old →
      QueuedFor r j new → new ∈ requests → False := by
    intro r member i j old new oldFor inQueue newFor' fresh
    obtain ⟨rfl, idle⟩ := newFor r member j new newFor' fresh
    exact idle _ (List.mem_of_getElem? (oldSlot i old.scope oldFor.2 (queuedBelow old inQueue)))
  have pair : ∀ r ∈ after.slots.multiInstances, ∀ i j first second, QueuedFor r i first → QueuedFor r j second →
      Precedes requests first second → i < j := by
    intro r member i j first second one two precedes
    obtain ⟨rfl, _⟩ := newFor r member j second two (precedes.subset (List.mem_cons_of_mem _ (List.mem_singleton_self _)))
    obtain ⟨i', j', ordered⟩ := requested_ordered requested
      (Laws.MultiInstance.opening_ordered loop.mode base.instances) precedes
    obtain ⟨lower, iIn, jIn, rest⟩ := ordered
    have iSame := opens.apart i' i first.scope iIn (fields.2.2 ▸ rest.1) one.2
    have jSame := opens.apart j' j second.scope jIn (fields.2.2 ▸ rest.2) two.2
    exact iSame ▸ jSame ▸ lower
  refine ⟨fun r member => ?_, ?_⟩
  · rcases aRuns r member with mine | same
    · unfold Laws.MultiInstance.NumberedInOrder Laws.MultiInstance.InstancesPlaced
      rw [aOccs]
      exact each r mine.1
    · subst same
      refine ⟨fun first second firstScope secondScope lower one two earlier earlierIn later laterIn earlierAt laterAt
        earlierOn laterOn => ?_, fun scope active o inside at_ named role => ?_⟩
      · rw [aOccs] at earlierIn laterIn
        have one' := oldSlot first firstScope one (earlierAt ▸ occBelow earlier earlierIn)
        have two' := oldSlot second secondScope two (laterAt ▸ occBelow later laterIn)
        exact (each base (baseIn _ _ one')).1 first second firstScope secondScope lower one' two' earlier earlierIn
          later laterIn earlierAt laterAt (fields.1 ▸ earlierOn) (fields.1 ▸ laterOn)
      · rw [aOccs] at inside
        obtain ⟨i, slot⟩ := List.mem_iff_getElem?.mp active
        have slot' := oldSlot i scope slot (at_ ▸ occBelow o inside)
        exact fields.1 ▸ (each base (baseIn _ _ slot')).2 scope (List.mem_of_getElem? slot') o inside at_
          (fields.2.1 ▸ named) role
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · exact fun r member => by
      rcases aRuns r member with mine | same
      · exact qs.looped r mine.1
      · subst same
        exact ⟨loop, fields.2.1 ▸ looped⟩
  · exact fun r member scope active entry inside named => by
      rw [aScopes] at inside
      by_cases below : scope.value < state.nextIssue
      · have old := oldEntry entry inside (named ▸ below)
        rcases aRuns r member with mine | same
        · exact qs.uncalled r mine.1 scope active entry old named
        · subst same
          obtain ⟨i, slot⟩ := List.mem_iff_getElem?.mp active
          have slot' := oldSlot i scope slot below
          exact qs.uncalled base (baseIn _ _ slot') scope (List.mem_of_getElem? slot') entry old named
      · exact begun.uncalled entry inside fun old => below (named ▸ formed.issued.scopes entry old)
  · exact fun r member o inside on active => by
      rw [aOccs] at inside
      rcases aRuns r member with mine | same
      · exact qs.continued r mine.1 o inside on active
      · subst same
        obtain ⟨i, slot⟩ := List.mem_iff_getElem?.mp active
        have slot' := oldSlot i o.scope slot (occBelow o inside)
        exact fields.2.1 ▸ qs.continued base (baseIn _ _ slot') o inside (fields.1 ▸ on) (List.mem_of_getElem? slot')
  · exact fun request inQueue body on stands => by
      rcases queuedAfter request inQueue with old | new
      · have standsOld : request.scope ∈ scopeIds state := by
          rw [scopeIds, aScopes] at stands
          obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
          exact List.mem_map.mpr ⟨entry, oldEntry entry inside (named ▸ queuedBelow request old), named⟩
        obtain ⟨r, mine, owner, rest⟩ := qs.targets request old body on standsOld
        by_cases differs : r.occurrence = base.occurrence
        · have baseMember : base ∈ state.slots.multiInstances := based.elim id fun apart =>
            absurd differs (apart.1 r mine)
          obtain rfl := Laws.State.nodup_map_eq owns.keyed mine baseMember differs
          obtain ⟨element, unreserved, active⟩ := rest
          obtain ⟨j, slot⟩ := List.mem_iff_getElem?.mp active
          have unopened : j ∉ Feature.MultiInstance.opening loop.mode r.instances := fun opened =>
            quiet (List.ne_nil_of_mem opened) _ active
          refine ⟨next, aNext, fields.1.trans owner, element.trans fields.2.1.symm, unreserved, ?_⟩
          exact List.mem_of_getElem? (by rw [opens.unopened j unopened]; exact slot)
        · exact ⟨r, aKeep r mine differs, owner, rest⟩
      · have parts := newReq request new
        obtain ⟨i, _, slot⟩ := parts.2.2.2.1
        have same := Laws.Step.multiInstance_inj (on.symm.trans parts.1)
        exact ⟨next, aNext, fields.1.trans same.symm, parts.2.1.trans fields.2.1.symm, parts.2.2.1,
          List.mem_of_getElem? slot⟩
  · exact fun request inQueue r member active id named o inside xid xelement xrole => by
      rw [aOccs] at inside
      rcases queuedAfter request inQueue with old | new
      · rcases aRuns r member with mine | same
        · exact qs.reserved request old r mine.1 active id named o inside xid xelement xrole
        · subst same
          obtain ⟨i, slot⟩ := List.mem_iff_getElem?.mp active
          have slot' := oldSlot i request.scope slot (queuedBelow request old)
          exact qs.reserved request old base (baseIn _ _ slot') (List.mem_of_getElem? slot') id named o inside xid
            (fields.2.1 ▸ xelement) xrole
      · obtain ⟨_, _, unreserved, _⟩ := newReq request new
        rw [unreserved] at named
        cases named
  · exact fun o inside unbegun => qs.reservations o (aOccs ▸ inside) unbegun
  · exact fun element pending => qs.occurs element (by
      rcases pending with occur | compensate | resumed
      · obtain ⟨scope, rest⟩ := occur
        obtain ⟨leave, writes, rule, member⟩ := rest
        rcases signalsIn _ member with old | ⟨_, _, same⟩
        · exact .inl ⟨scope, leave, writes, rule, old⟩
        · exact absurd same Laws.Step.occur_ne_begin
      · obtain ⟨scope, activity, trigger, rest⟩ := compensate
        obtain ⟨leave, at_, resumed, member⟩ := rest
        rcases signalsIn _ member with old | ⟨_, _, same⟩
        · exact .inr (.inl ⟨scope, activity, trigger, leave, at_, resumed, old⟩)
        · exact absurd same Laws.Step.compensate_ne_begin
      · obtain ⟨run, member, rest⟩ := resumed
        exact .inr (.inr ⟨run, aComp ▸ member, rest⟩))
  · exact fun r member first second first' second' precedes one two => by
      have inBegins := Laws.Step.precedes_beginsOf.mp precedes
      have oldOrder : Precedes (Laws.Step.beginsOf state.signals) first second → first' < second' := fun old => by
        have firstOld : Laws.State.Queued state first :=
          .inl (Laws.Step.mem_beginsOf.mp (old.subset (List.mem_cons_self ..)))
        obtain ⟨r', mine, conv⟩ := back r member first' first one firstOld
        exact qs.signalsOrdered r' mine first second first' second' (Laws.Step.precedes_beginsOf.mpr old)
          (conv _ _ one firstOld) (conv _ _ two
            (.inl (Laws.Step.mem_beginsOf.mp (old.subset (List.mem_cons_of_mem _ (List.mem_singleton_self _))))))
      rcases queues with ⟨begins, _⟩ | ⟨_, begins, _⟩ <;> rw [begins] at inBegins
      · rcases precedes_split inBegins with old | ⟨firstOld, secondNew⟩ | new
        · exact oldOrder old
        · exact (mixed r member first' second' first second one (.inl (Laws.Step.mem_beginsOf.mp firstOld)) two
            secondNew).elim
        · exact pair r member first' second' first second one two new
      · exact oldOrder inBegins
  · exact fun r member first second first' second' precedes one two => by
      have inDeferred := Laws.Step.precedes_deferredOf.mp precedes
      have oldOrder : Precedes (Laws.Step.deferredOf state.tokens) first second → second' < first' := fun old => by
        have firstOld : Laws.State.Queued state first :=
          .inr (Laws.Step.mem_deferredOf.mp (old.subset (List.mem_cons_self ..)))
        obtain ⟨r', mine, conv⟩ := back r member first' first one firstOld
        exact qs.tokensOrdered r' mine first second first' second' (Laws.Step.precedes_deferredOf.mpr old)
          (conv _ _ one firstOld) (conv _ _ two
            (.inr (Laws.Step.mem_deferredOf.mp (old.subset (List.mem_cons_of_mem _ (List.mem_singleton_self _))))))
      rcases queues with ⟨_, deferred⟩ | ⟨_, _, deferred⟩ <;> rw [deferred] at inDeferred
      · exact oldOrder inDeferred
      · rcases precedes_split inDeferred with old | ⟨firstOld, secondNew⟩ | new
        · exact oldOrder old
        · exact (mixed r member first' second' first second one (.inr (Laws.Step.mem_deferredOf.mp firstOld)) two
            (List.mem_reverse.mp secondNew)).elim
        · exact pair r member second' first' second first two one (precedes_reverse new)
  · exact fun r member first second first' second' signal token one two => by
      have firstIn := Laws.Step.mem_beginsOf.mpr signal
      have secondIn := Laws.Step.mem_deferredOf.mpr token
      have both : Laws.State.Queued state first → Laws.State.Queued state second →
          Signal.begin first ∈ state.signals → Token.begin second ∈ state.tokens → first' < second' :=
        fun firstOld _ signalOld tokenOld => by
          obtain ⟨r', mine, conv⟩ := back r member first' first one firstOld
          exact qs.queuesOrdered r' mine first second first' second' signalOld tokenOld (conv _ _ one firstOld)
            (conv _ _ two (.inr tokenOld))
      rcases queues with ⟨begins, deferred⟩ | ⟨_, begins, deferred⟩ <;> rw [begins] at firstIn <;>
        rw [deferred] at secondIn
      · have tokenOld := Laws.Step.mem_deferredOf.mp secondIn
        rcases List.mem_append.mp firstIn with old | new
        · have signalOld := Laws.Step.mem_beginsOf.mp old
          exact both (.inl signalOld) (.inr tokenOld) signalOld tokenOld
        · exact (mixed r member second' first' second first two (.inr tokenOld) one new).elim
      · have signalOld := Laws.Step.mem_beginsOf.mp firstIn
        rcases List.mem_append.mp secondIn with old | new
        · have tokenOld := Laws.Step.mem_deferredOf.mp old
          exact both (.inl signalOld) (.inr tokenOld) signalOld tokenOld
        · exact (mixed r member first' second' first second one (.inl signalOld) two (List.mem_reverse.mp new)).elim
  · exact fun schedule request token => by
      have inside := Laws.Step.mem_deferredOf.mpr token
      rcases queues with ⟨_, deferred⟩ | ⟨depthFirst, _, _⟩
      · rw [deferred] at inside
        exact qs.deferred schedule request (Laws.Step.mem_deferredOf.mp inside)
      · exact schedule_ne (schedule.symm.trans depthFirst)
  · exact fun r member request index queued' scope inQueue for_ slot begun' => by
      obtain ⟨o, inside, at_, on⟩ := begun'
      rw [aOccs] at inside
      rcases queuedAfter request inQueue with old | new
      · rcases aRuns r member with mine | same
        · exact qs.above r mine.1 request index queued' scope old for_ slot ⟨o, inside, at_, on⟩
        · subst same
          have slot' := oldSlot index scope slot (at_ ▸ occBelow o inside)
          exact qs.above base (baseIn _ _ slot') request index queued' scope old
            ⟨fields.1 ▸ for_.1, oldSlot queued' request.scope for_.2 (queuedBelow request old)⟩ slot'
            ⟨o, inside, at_, fields.1 ▸ on⟩
      · obtain ⟨rfl, idle⟩ := newFor r member queued' request for_ new
        exact (idle _ (List.mem_of_getElem? (oldSlot index scope slot (at_ ▸ occBelow o inside)))).elim

/-! ## The other operations of the hooks -/

/-- Queuing a signal that is no begin, reservation or compensation keeps `Numbered`. -/
theorem Numbered.signalOther {program : Program} {s : State} {signal : Signal}
    (apart : (∀ request, Signal.begin request ≠ signal) ∧
      (∀ element scope leave writes rule, Signal.occur element scope leave writes rule ≠ signal) ∧
      ∀ scope activity trigger leave resume, Signal.compensate scope activity trigger leave resume ≠ signal)
    (held : Numbered program s) : Numbered program (s.signal signal) := by
  rw [Laws.State.signal_eq]
  have none : Laws.Step.beginsOf [signal] = [] := List.eq_nil_iff_forall_not_mem.mpr fun request inside =>
    apart.1 request (List.mem_singleton.mp (Laws.Step.mem_beginsOf.mp inside))
  refine held.unmoved rfl rfl rfl (by rw [Laws.Step.beginsOf_append, none, List.append_nil]) rfl
    fun element pending => .inl ?_
  rcases pending with occur | compensate | resumed
  · obtain ⟨scope, rest⟩ := occur
    obtain ⟨leave, writes, rule, member⟩ := rest
    refine .inl ⟨scope, leave, writes, rule, (List.mem_append.mp member).resolve_right fun new => ?_⟩
    exact apart.2.1 element scope leave writes rule (List.mem_singleton.mp new)
  · obtain ⟨scope, activity, trigger, rest⟩ := compensate
    obtain ⟨leave, at_, resumed, member⟩ := rest
    refine .inr (.inl ⟨scope, activity, trigger, leave, at_, resumed,
      (List.mem_append.mp member).resolve_right fun new => ?_⟩)
    exact apart.2.2 scope activity trigger leave _ (List.mem_singleton.mp new)
  · exact .inr (.inr resumed)

/-- Holding an occurrence keeps `Numbered`. -/
theorem Numbered.hold {program : Program} {s : State} (kept : Held) (held : Numbered program s) :
    Numbered program (s.hold kept) := by
  rw [Laws.Hooks.hold_eq]
  exact held.shrink (.same rfl (fun _ inside => inside) rfl rfl rfl fun _ pending => .inl pending)

/-- Setting a body's record to one of fewer active slots keeps `Numbered` when every active slot whose scope occurrence
stands stays active. -/
theorem Numbered.narrow {program : Program} {t : State} {run next : MultiInstanceRun}
    (keyed : Laws.MultiInstance.RunsKeyed t) (member : run ∈ t.slots.multiInstances)
    (occurrence : next.occurrence = run.occurrence) (element : next.element = run.element)
    (kept : ∀ (i : Nat) (scope : ScopeOccurrenceId), next.instances[i]? = some (.active scope) →
      run.instances[i]? = some (.active scope))
    (stays : ∀ (i : Nat) (scope : ScopeOccurrenceId), run.instances[i]? = some (.active scope) → scope ∈ scopeIds t →
      next.instances[i]? = some (.active scope))
    (held : Numbered program t) : Numbered program (Feature.MultiInstance.setRun t next) := by
  obtain ⟨each, qs⟩ := held
  have toOld : ∀ r ∈ (Feature.MultiInstance.setRun t next).slots.multiInstances, ∃ r' ∈ t.slots.multiInstances,
      (∀ (i : Nat) (scope : ScopeOccurrenceId), r.instances[i]? = some (.active scope) →
        r'.instances[i]? = some (.active scope)) ∧ r'.occurrence = r.occurrence ∧ r'.element = r.element :=
    fun r inside => by
      rcases mem_setRun inside with old | rfl
      · exact ⟨r, old.1, fun _ _ slot => slot, rfl, rfl⟩
      · exact ⟨run, member, kept, occurrence.symm, element.symm⟩
  have act : ∀ (r r' : MultiInstanceRun), (∀ (i : Nat) (scope : ScopeOccurrenceId),
      r.instances[i]? = some (.active scope) → r'.instances[i]? = some (.active scope)) →
      ∀ scope, Iteration.active scope ∈ r.instances → Iteration.active scope ∈ r'.instances := fun _ _ slots scope active => by
    obtain ⟨i, slot⟩ := List.mem_iff_getElem?.mp active
    exact List.mem_of_getElem? (slots i scope slot)
  have forOf : ∀ (r r' : MultiInstanceRun), (∀ (i : Nat) (scope : ScopeOccurrenceId),
      r.instances[i]? = some (.active scope) → r'.instances[i]? = some (.active scope)) → r'.occurrence = r.occurrence →
      ∀ i request, QueuedFor r i request → QueuedFor r' i request := fun _ _ slots same i request for_ =>
    ⟨same ▸ for_.1, slots i request.scope for_.2⟩
  rw [Laws.MultiInstance.setRun_eq]
  refine ⟨fun r inside => ?_, ?_⟩
  · obtain ⟨r', mine, parts⟩ := toOld r inside
    obtain ⟨slots, same, named⟩ := parts
    exact ⟨fun first second firstScope secondScope lower one two earlier earlierIn later laterIn earlierAt laterAt
      earlierOn laterOn => (each r' mine).1 first second firstScope secondScope lower (slots _ _ one) (slots _ _ two)
        earlier earlierIn later laterIn earlierAt laterAt (same ▸ earlierOn) (same ▸ laterOn),
      fun scope active o present at_ named' role => same ▸ (each r' mine).2 scope (act r r' slots scope active) o present
        at_ (named ▸ named') role⟩
  exact {
    looped := fun r inside => by
      obtain ⟨r', mine, parts⟩ := toOld r inside
      obtain ⟨_, _, named⟩ := parts
      exact named ▸ qs.looped r' mine
    uncalled := fun r inside scope active entry present named => by
      obtain ⟨r', mine, slots, _⟩ := toOld r inside
      exact qs.uncalled r' mine scope (act r r' slots scope active) entry present named
    continued := fun r inside o present on active => by
      obtain ⟨r', mine, parts⟩ := toOld r inside
      obtain ⟨slots, same, named⟩ := parts
      exact named ▸ qs.continued r' mine o present (same ▸ on) (act r r' slots _ active)
    targets := fun request inQueue body on stands => by
      obtain ⟨r, mine, owner, rest⟩ := qs.targets request inQueue body on stands
      obtain ⟨named, unreserved, active⟩ := rest
      by_cases differs : r.occurrence = next.occurrence
      · obtain rfl := Laws.State.nodup_map_eq keyed mine member (differs.trans occurrence)
        obtain ⟨j, slot⟩ := List.mem_iff_getElem?.mp active
        exact ⟨next, setRun_mem t next, occurrence.trans owner, named.trans element.symm, unreserved,
          List.mem_of_getElem? (stays j _ slot stands)⟩
      · exact ⟨r, setRun_keeps mine differs, owner, named, unreserved, active⟩
    reserved := fun request inQueue r inside active id named o present xid xelement xrole => by
      obtain ⟨r', mine, parts⟩ := toOld r inside
      obtain ⟨slots, _, same⟩ := parts
      exact qs.reserved request inQueue r' mine (act r r' slots _ active) id named o present xid (same ▸ xelement) xrole
    signalsOrdered := fun r inside first second first' second' precedes one two => by
      obtain ⟨r', mine, parts⟩ := toOld r inside
      obtain ⟨slots, same, _⟩ := parts
      exact qs.signalsOrdered r' mine first second first' second' precedes (forOf r r' slots same _ _ one)
        (forOf r r' slots same _ _ two)
    tokensOrdered := fun r inside first second first' second' precedes one two => by
      obtain ⟨r', mine, parts⟩ := toOld r inside
      obtain ⟨slots, same, _⟩ := parts
      exact qs.tokensOrdered r' mine first second first' second' precedes (forOf r r' slots same _ _ one)
        (forOf r r' slots same _ _ two)
    queuesOrdered := fun r inside first second first' second' signal token one two => by
      obtain ⟨r', mine, parts⟩ := toOld r inside
      obtain ⟨slots, same, _⟩ := parts
      exact qs.queuesOrdered r' mine first second first' second' signal token (forOf r r' slots same _ _ one)
        (forOf r r' slots same _ _ two)
    above := fun r inside request index queued' scope inQueue for_ slot begun => by
      obtain ⟨r', mine, parts⟩ := toOld r inside
      obtain ⟨slots, same, _⟩ := parts
      obtain ⟨o, present, at_, on⟩ := begun
      exact qs.above r' mine request index queued' scope inQueue (forOf r r' slots same _ _ for_) (slots _ _ slot)
        ⟨o, present, at_, same ▸ on⟩
    reservations := qs.reservations
    occurs := qs.occurs
    deferred := qs.deferred }

/-- A body opens a slot only while none of its slots is active when, run in parallel, none of them waits. -/
theorem quiet_of_parallel {mode : MultiInstanceMode} {instances : List Iteration}
    (parallel : mode = .parallel → ∀ slot ∈ instances, slot ≠ .waiting) :
    Feature.MultiInstance.opening mode instances ≠ [] → ∀ scope, Iteration.active scope ∉ instances := by
  intro opened scope active
  rcases Laws.MultiInstance.opening_quiet opened with running | idle
  · obtain ⟨index, inside⟩ := List.exists_mem_of_ne_nil _ opened
    exact parallel running _ (List.mem_of_getElem? (Laws.MultiInstance.opening_waiting inside)) rfl
  · exact idle scope active

/-- A running body stays through leaving one of its instances' scope occurrences, which lies below the body's. -/
theorem leaveScope_keeps_body {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    {run : MultiInstanceRun} (member : run ∈ s.slots.multiInstances) {index : Nat} {scope : ScopeOccurrenceId}
    (slot : run.instances[index]? = some (.active scope)) : run ∈ (s.leaveScope scope).slots.multiInstances := by
  obtain ⟨e, eIn, eNamed, eLink⟩ := (owns.owned run member).instanceScopes index scope slot
  have present : scope ∈ scopeIds s := List.mem_map.mpr ⟨e, eIn, eNamed⟩
  have away : ¬ Laws.State.Within s run.scope scope := eNamed ▸ Laws.State.parent_not_within formed eIn eLink
  rw [(Laws.State.leaveScope_slots s scope).2.1, (Laws.State.clearInside_cleared formed present []).bodies]
  refine List.mem_filter.mpr ⟨member, ?_⟩
  cases contained : (s.subtree scope).contains run.scope
  · rfl
  · exact absurd ((Laws.State.subtree_iff formed present _).mp (List.contains_iff_mem.mp contained)) away

/-! ## The registered Multi-Instance hooks -/

/-- `Hooks.completeBody` keeps `Numbered`: it queues the body's completion. -/
theorem numbered_completeBody {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State} (held : Numbered ctx.program state)
    (ran : Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after) :
    Numbered ctx.program after := by
  obtain ⟨run, _, rfl⟩ := Laws.MultiInstance.completeBody_spec ran
  obtain ⟨writes, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop run state
  rw [same]
  exact held.signalOther Laws.Step.complete_apart

/-- `Hooks.arriveMultiInstance` keeps `Numbered`: it holds the occurrence, completes it, or enters the body's scope
occurrence, arms its boundaries or not, and begins the instances of a body no running body is keyed by, every slot
waiting. -/
theorem numbered_arrive {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State}
    (ops : Laws.MultiInstance.MultiInstanceOps ctx.program (WellFormed ctx.program) Laws.State.Settled)
    (formed : WellFormed ctx.program state) (owns : SlotsOwned state) (held : Numbered ctx.program state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (named : header.id = occurrence.element)
    (looped : LoopOf ctx.program header.id loop) (ownsEntered : ∀ locals (unarmed : Bool), SlotsOwned (if unarmed then
      (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1
      else (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1.signal
        (.arm occurrence.id header.id occurrence.scope)))
    (unrun : ∀ run ∈ state.slots.multiInstances, run.occurrence ≠ occurrence.id)
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    Numbered ctx.program after := by
  rcases Laws.MultiInstance.arriveMultiInstance_spec ran with ⟨kept, rfl⟩ | ⟨writes, rfl⟩ | ⟨locals, unarmed, entered⟩
  · exact held.hold kept
  · exact held.signalOther Laws.Step.complete_apart
  · obtain ⟨collection, count, items, ⟨_, rfl⟩⟩ := entered
    have waiting : ∀ slot ∈ List.replicate count Iteration.waiting, slot = .waiting := fun _ inside =>
      List.eq_of_mem_replicate inside
    obtain ⟨entering, slots, _⟩ := enterBody_entering ops formed member begun header.id
      (fun current kept present => ops.arm current occurrence _ kept present begun named) locals unarmed collection _ waiting
    have enteredHeld : Numbered ctx.program (if unarmed then
        (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id header.id occurrence.scope)) := by
      have base := held.enterScope formed owns header.id occurrence.scope locals
        (some occurrence.id)
      cases unarmed <;> simp only [Bool.false_eq_true, ↓reduceIte]
      · exact base.signalOther Laws.Step.arm_apart
      · exact base
    have idle : ∀ scope, Iteration.active scope ∉ List.replicate count Iteration.waiting := fun _ active => by
      cases List.eq_of_mem_replicate active
    obtain ⟨queued, instances, made, begunAt⟩ := Laws.MultiInstance.beginInstances_spec ops entering
    rw [made]
    exact Numbered.beginInstances entering.1 (ownsEntered locals unarmed) enteredHeld begunAt
      (.inr ⟨fun run inside => unrun run (slots ▸ inside), idle⟩) (fun _ => idle) looped

/-- `Hooks.instanceCompleted` keeps `Numbered` for an instance in a scope occurrence that stands: it records the
instance's slot, leaving its scope occurrence, which takes nothing else of the numbering, writes the body's counters or
not, then completes the body or begins its next instances. -/
theorem numbered_instanceCompleted {ctx : Ctx} {body : Nat} {occurrence : Occurrence} {writes : List (String × Value)}
    {state after : State} (ops : Laws.MultiInstance.MultiInstanceOps ctx.program (WellFormed ctx.program) Laws.State.Settled)
    (formed : WellFormed ctx.program state) (owns : SlotsOwned state) (held : Numbered ctx.program state)
    (stands : occurrence.scope ∈ scopeIds state)
    (ownsLeft : ∀ run index output results, run ∈ state.slots.multiInstances →
      run.instances[index]? = some (.active occurrence.scope) → Laws.MultiInstance.OutputFits ctx.program run output →
      SlotsOwned (Laws.MultiInstance.leftWith state occurrence.scope (Laws.MultiInstance.recorded run index output results)))
    (parallel : ∀ run ∈ state.slots.multiInstances, ∀ loop, LoopOf ctx.program run.element loop →
      loop.mode = .parallel → ∀ slot ∈ run.instances, slot ≠ .waiting)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) :
    Numbered ctx.program after := by
  obtain ⟨run, loop, index, found⟩ := Laws.MultiInstance.instanceCompleted_spec ran
  obtain ⟨output, done⟩ := found
  obtain ⟨results, counted, left, ended⟩ := done.ends
  have member := Laws.MultiInstance.found_mem done.found
  have leaves := Laws.State.leaveScope_left formed stands
  have recordedSlot : ∀ (i : Nat) (scope : ScopeOccurrenceId),
      (Laws.MultiInstance.recorded run index output results).instances[i]? = some (.active scope) →
        i ≠ index ∧ run.instances[i]? = some (.active scope) := fun i scope slot => by
    have differs : i ≠ index := fun same => by
      rw [same, show (Laws.MultiInstance.recorded run index output results).instances =
        run.instances.set index (.completed output) from rfl,
        List.getElem?_set_self (List.getElem?_eq_some_iff.mp done.slot).1] at slot
      cases slot
    exact ⟨differs, by
      rw [show (Laws.MultiInstance.recorded run index output results).instances =
        run.instances.set index (.completed output) from rfl, List.getElem?_set_ne (Ne.symm differs)] at slot
      exact slot⟩
  have leftHeld : Numbered ctx.program
      (Laws.MultiInstance.leftWith state occurrence.scope (Laws.MultiInstance.recorded run index output results)) := by
    have keyedLeft : Laws.MultiInstance.RunsKeyed (state.leaveScope occurrence.scope) := by
      unfold Laws.MultiInstance.RunsKeyed
      rw [(Laws.State.leaveScope_slots state occurrence.scope).2.1,
        (Laws.State.clearInside_cleared formed stands []).bodies]
      exact owns.keyed.sublist (List.filter_sublist.map _)
    refine (held.leaveScope formed owns stands).narrow keyedLeft (leaveScope_keeps_body formed owns member done.slot)
      rfl rfl (fun i scope slot => (recordedSlot i scope slot).2) fun i scope slot present => ?_
    have differs : i ≠ index := fun same => by
      rw [same, done.slot] at slot
      obtain rfl := Iteration.active.inj (Option.some.inj slot)
      obtain ⟨entry, inside, entryNamed⟩ := List.mem_map.mp present
      exact ((leaves.scopes entry).mp inside).2 (entryNamed ▸ .refl _)
    rw [show (Laws.MultiInstance.recorded run index output results).instances =
      run.instances.set index (.completed output) from rfl, List.getElem?_set_ne (Ne.symm differs)]
    exact slot
  have leftOwned := ownsLeft run index output results member done.slot done.fits
  have countedHeld : Numbered ctx.program counted ∧ SlotsOwned counted := by
    rcases left with rfl | ⟨target, counts, rule, rfl⟩
    · exact ⟨leftHeld, leftOwned⟩
    · refine ⟨leftHeld.signalOther Laws.Step.write_apart, ?_⟩
      rw [Laws.State.signal_eq]
      have owned := leftOwned
      exact ⟨owned.keyed, fun run inside => have each := owned.owned run inside
        ⟨each.body, each.bodyScope, each.instanceScopes, each.ownScopes⟩, owned.bodyOwns, owned.unowned⟩
  rcases ended with rfl | ⟨items, rfl⟩
  · obtain ⟨written, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop
      (Laws.MultiInstance.recorded run index output results) counted
    rw [same]
    exact countedHeld.1.signalOther Laws.Step.complete_apart
  · obtain ⟨entering, _, present⟩ := counted_entering ops formed stands done left
    obtain ⟨queued, instances, made, begunAt⟩ := Laws.MultiInstance.beginInstances_spec ops entering
    rw [made]
    refine Numbered.beginInstances entering.1 countedHeld.2 countedHeld.1 begunAt (.inl present)
      (quiet_of_parallel fun mode slot inside => ?_) done.looped
    rw [show (Laws.MultiInstance.recorded run index output results).instances =
      run.instances.set index (.completed output) from rfl] at inside
    obtain ⟨i, at_⟩ := List.mem_iff_getElem?.mp inside
    by_cases same : i = index
    · rw [same, List.getElem?_set_self (List.getElem?_eq_some_iff.mp done.slot).1] at at_
      obtain rfl := Option.some.inj at_
      exact nofun
    · rw [List.getElem?_set_ne (Ne.symm same)] at at_
      exact parallel run member loop done.looped mode slot (List.mem_of_getElem? at_)

end Kernel.Proofs.MultiInstance
