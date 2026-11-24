module

public import Kernel.Proofs.MultiInstance.Numbered

/-! # Proofs: the numbering of Multi-Instance instances through the frame

What each state operation the hooks and `Step`'s phases apply keeps of `Numbered`, the numbering lane's relation
(`Kernel.Proofs.MultiInstance.Numbered`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

variable {le : Issue → Issue → Bool}

open Kernel
open Kernel.Laws.State (WellFormed scopeIds)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique NumberedInOrder InstancesPlaced BeginsQueued BeginsOrdered
  QueuedFor Owned BodyOwns InstancesUnowned RunsKeyed)
open Kernel.Laws.Step (OccurPending)
/-! ## The frame -/

/-- A change that keeps everything `Numbered` reads but the scope occurrences, which it only takes away from, and the
pending reservations, which it adds to only with elements that do not loop, `Shrinks`. -/
theorem Shrinks.same {program : Program} {s t : State} (occurrences : t.occurrences = s.occurrences)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes) (runs : t.slots.multiInstances = s.slots.multiInstances)
    (fewer : BeginsFewer s t)
    (pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop) :
    Shrinks program s t :=
  ⟨runs ▸ .refl _, fun _ inside => occurrences ▸ inside, fun entry inside => .inl (scopes entry inside),
    fun _ member outside => absurd (runs ▸ member) outside, fewer, pending⟩

/-- An active instance's scope occurrence of a body whose scope occurrence lies within `scope` lies strictly within it:
it lies directly below the body's, which no scope occurrence below it holds. -/
theorem slot_strictly {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    {run : MultiInstanceRun} (member : run ∈ s.slots.multiInstances) {scope : ScopeOccurrenceId}
    (within : Laws.State.Within s run.scope scope) {inner : ScopeOccurrenceId} (active : Iteration.active inner ∈ run.instances) :
    Laws.State.StrictlyWithin s inner scope := by
  obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
  obtain ⟨e, eIn, eNamed, eLink⟩ := (owns.owned run member).instanceScopes index inner slot
  subst eNamed
  exact ⟨.parent e run.scope scope eIn eLink within, fun same =>
    Laws.State.parent_not_within formed eIn eLink (same ▸ within)⟩

/-- Clearing a scope occurrence that stands keeps `Numbered`: a body that goes lies within it, so its instances' scope
occurrences go too. -/
theorem Numbered.clearInside (le : Issue → Issue → Bool) {program other : Program} {s : State} (formed : WellFormed other s) (owns : SlotsOwned s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (keep : List OccurrenceId) (held : Numbered program s) :
    Numbered program (s.clearInside le scope keep) := by
  have cleared := Laws.State.clearInside_cleared (le := le) formed present keep
  refine held.shrink ⟨by rw [cleared.bodies]; exact List.filter_sublist,
    fun o inside => ((cleared.occurrences o).mp inside).1, fun e inside => .inl ((cleared.scopes e).mp inside).1,
    fun run member outside inner active stands => ?_, .of_kept cleared.queues,
    fun _ pending => .inl (pending_of_sublist cleared.queues.signal_mem cleared.slots.runs pending)⟩
  obtain ⟨e, eIn, eNamed⟩ := List.mem_map.mp stands
  obtain ⟨_, notWithin⟩ := (cleared.scopes e).mp eIn
  have within : Laws.State.Within s run.scope scope := by
    rw [cleared.bodies] at outside
    have contained : (s.inside scope).contains run.scope = true := Classical.byContradiction fun other =>
      outside (List.mem_filter.mpr ⟨member, by simpa using other⟩)
    exact (Laws.State.inside_iff formed present _).mp (by simpa using contained)
  exact notWithin (eNamed ▸ slot_strictly formed owns member within active)

/-- Leaving a scope occurrence that stands keeps `Numbered`, as clearing it does. -/
theorem Numbered.leaveScope (le : Issue → Issue → Bool) {program other : Program} {s : State} (formed : WellFormed other s) (owns : SlotsOwned s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (held : Numbered program s) :
    Numbered program (s.leaveScope le scope) := by
  have left := Laws.State.leaveScope_left (le := le) formed present
  have cleared := Laws.State.clearInside_cleared (le := le) formed present []
  obtain ⟨_, bodies, _⟩ := Laws.State.leaveScope_slots s scope
  refine held.shrink ⟨by rw [bodies, cleared.bodies]; exact List.filter_sublist,
    fun o inside => ((left.occurrences o).mp inside).1, fun e inside => .inl ((left.scopes e).mp inside).1,
    fun run member outside inner active stands => ?_, .of_kept left.queues,
    fun _ pending => .inl (pending_of_sublist left.queues.signal_mem left.slots.runs pending)⟩
  obtain ⟨e, eIn, eNamed⟩ := List.mem_map.mp stands
  obtain ⟨_, notWithin⟩ := (left.scopes e).mp eIn
  have within : Laws.State.Within s run.scope scope := by
    rw [bodies, cleared.bodies] at outside
    have contained : (s.inside scope).contains run.scope = true := Classical.byContradiction fun other =>
      outside (List.mem_filter.mpr ⟨member, by simpa using other⟩)
    exact (Laws.State.inside_iff formed present _).mp (by simpa using contained)
  exact notWithin (eNamed ▸ (slot_strictly formed owns member within active).1)

/-- Disarming a host keeps `Numbered`: it drops only reservations. -/
theorem Numbered.disarm {program : Program} {s : State} (host : OccurrenceId) (held : Numbered program s) :
    Numbered program (s.disarm host) := by
  rw [Laws.State.disarm_eq]
  exact held.shrink ⟨.refl _, fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1, fun _ inside => .inl inside,
    fun _ _ outside => absurd ‹_› outside, .of_kept (.of_eq rfl rfl rfl rfl), fun _ pending => .inl pending⟩

/-- Dropping an occurrence's record keeps `Numbered`. -/
theorem Numbered.withoutRecord {program : Program} {s : State} (id : OccurrenceId) (held : Numbered program s) :
    Numbered program (Laws.State.withoutRecord s id) :=
  held.shrink ⟨.refl _, fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1, fun _ inside => .inl inside,
    fun _ _ outside => absurd ‹_› outside, .of_kept (.of_eq rfl rfl rfl rfl), fun _ pending => .inl pending⟩

/-- A variable write keeps `Numbered`. -/
theorem Numbered.setVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (value : Value) (held : Numbered program s) : Numbered program (s.setVariable target name value) :=
  have same := Laws.State.setVariable_same s target name value
  held.shrink (.same same.occurrences (fun _ inside => same.scopes ▸ inside) (congrArg (·.multiInstances) same.slots)
    (.of_kept same.queues) fun _ pending => .inl (pending_kept same.queues
      (congrArg (·.compensation.runs) same.slots) pending))

/-- A variable removal keeps `Numbered`. -/
theorem Numbered.removeVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (held : Numbered program s) : Numbered program (s.removeVariable target name) :=
  have same := Laws.State.removeVariable_same s target name
  held.shrink (.same same.occurrences (fun _ inside => same.scopes ▸ inside) (congrArg (·.multiInstances) same.slots)
    (.of_kept same.queues) fun _ pending => .inl (pending_kept same.queues
      (congrArg (·.compensation.runs) same.slots) pending))

/-- Issuing an identity keeps `Numbered`. -/
theorem Numbered.takeCompletion {program : Program} {s : State} (held : Numbered program s) : Numbered program s.takeCompletion.1 := by
  rw [Laws.State.takeCompletion_eq]
  exact held.shrink (.same (.refl _) (fun _ inside => inside) (.refl _) (.of_kept (.of_eq rfl rfl rfl rfl))
    fun _ pending => .inl pending)

/-- A change that moves nothing `Numbered` reads but the queued signals and tokens, keeping the begins among them, and
adds only reservations pending of elements that do not loop keeps `Numbered`. -/
theorem Numbered.unmoved {program : Program} {s t : State} (held : Numbered program s)
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences)
    (runs : t.slots.multiInstances = s.slots.multiInstances)
    (begins : Laws.Step.beginsOf t.batchSignals = Laws.Step.beginsOf s.batchSignals)
    (deferred : Laws.Step.deferredOf t.batchTokens = Laws.Step.deferredOf s.batchTokens)
    (queuedSignals : t.queuedSignals = s.queuedSignals) (queuedTokens : t.queuedTokens = s.queuedTokens)
    (pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop) :
    Numbered program t :=
  held.shrink ⟨runs ▸ .refl _, fun _ inside => occurrences ▸ inside, fun _ inside => .inl (scopes ▸ inside),
    fun _ _ outside => absurd (runs ▸ ‹_›) outside, .same begins deferred queuedSignals queuedTokens, pending⟩

/-- Entering a scope occurrence at a key not issued keeps `Numbered`: no active instance and no queued begin names the
fresh key, each issued. -/
theorem Numbered.enter {program other : Program} {s t : State} (formed : WellFormed other s) (owns : SlotsOwned s)
    (held : Numbered program s) (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ ¬ Laws.State.ScopeIssued s entry.id)
    (occurrences : t.occurrences = s.occurrences) (runs : t.slots.multiInstances = s.slots.multiInstances)
    (queues : Laws.State.QueuesKept s t)
    (compensation : t.slots.compensation.runs = s.slots.compensation.runs) : Numbered program t := by
  refine held.shrink ⟨runs ▸ .refl _, fun _ inside => occurrences ▸ inside, fun entry inside => ?_,
    fun _ _ outside => absurd (runs ▸ ‹_›) outside, .of_kept queues,
    fun _ pending => .inl (pending_kept queues compensation pending)⟩
  refine (scopes entry inside).imp_right fun fresh => ⟨fun run member active => ?_, fun request inQueue named => ?_⟩
  · obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
    obtain ⟨placed, placedIn, placedNamed, _⟩ := (owns.owned run member).instanceScopes index entry.id slot
    have below := formed.issued.scopes placed placedIn
    rw [placedNamed] at below
    exact fresh below
  · have below := formed.claimed.scopesIssued request inQueue
    rw [named] at below
    exact fresh below

/-- Entering a scope occurrence keeps `Numbered`. -/
theorem Numbered.enterScope {program other : Program} {s : State} (formed : WellFormed other s) (owns : SlotsOwned s)
    (element : ElementId) (parent : ScopeOccurrenceId) (locals : List (String × Value)) (owner : Option OccurrenceId)
    (stands : parent ∈ Laws.State.scopeIds s) (held : Numbered program s) :
    Numbered program (s.enterScope element parent locals owner).1 := by
  have fresh := (Laws.State.enterScope_fresh formed.historic formed.issuer element stands locals owner).1
  rw [Laws.State.enterScope_eq] at fresh ⊢
  exact held.enter formed owns (fun entry inside => (Laws.State.mem_scopeList_insert_cases inside).imp_right fun new => by
    rw [new]; exact fresh) rfl rfl (.of_eq rfl rfl rfl rfl) rfl

/-- Entering a Call's called root keeps `Numbered`. -/
theorem Numbered.enterCalled {program other : Program} {s : State} (formed : WellFormed other s) (owns : SlotsOwned s)
    (called : Program) (call : Occurrence) (variables : List (String × Value)) (definition : DefinitionRef)
    (stands : call.scope ∈ Laws.State.scopeIds s) (held : Numbered program s) :
    Numbered program (s.enterCalled called call variables definition).1 := by
  have fresh := (Laws.State.enterCalled_fresh formed called stands variables definition).1
  rw [Laws.State.enterCalled_eq _ _ _ _ _] at fresh ⊢
  exact held.enter formed owns (fun entry inside => (Laws.State.mem_scopeList_insert_cases inside).imp_right fun new => by
    rw [new]; exact fresh) rfl rfl (.of_eq rfl rfl rfl rfl) rfl

/-- A pair in order in a list with `last` appended was in order before, or ends at `last`. -/
theorem precedes_append {α : Type} {l : List α} {last first second : α}
    (precedes : Laws.State.Precedes (l ++ [last]) first second) :
    Laws.State.Precedes l first second ∨ second = last := by
  obtain ⟨front, back, rest⟩ := List.sublist_append_iff.mp precedes
  obtain ⟨split, frontIn, backIn⟩ := rest
  rcases List.sublist_cons_iff.mp backIn with empty | ⟨rest, rfl, restIn⟩
  · rw [List.sublist_nil.mp empty, List.append_nil] at split
    exact .inl (by rw [Laws.State.Precedes, split]; exact frontIn)
  · rw [List.sublist_nil.mp restIn] at split
    have reversed := congrArg List.reverse split
    simp only [List.reverse_cons, List.reverse_nil, List.nil_append, List.reverse_append, List.cons_append]
      at reversed
    exact .inr (List.cons.inj reversed).1

/-- Queuing the begin of a request that begins no instance keeps `Numbered` when a reservation it names lies in a
scope occurrence some occurrence owns, which no active instance's is (`InstancesUnowned`). -/
theorem Numbered.signalBegin {program : Program} {s : State} {request : BeginRequest} (owns : SlotsOwned s)
    (other : ∀ body, request.continuation ≠ .multiInstance body)
    (owned : ∀ id, request.reserved = some id → ∃ entry ∈ s.scopes, entry.id = request.scope ∧ entry.occurrence.isSome)
    (held : Numbered program s) : Numbered program (s.signal (.begin request)) := by
  obtain ⟨each, queued⟩ := held
  rw [Laws.State.signal_eq]
  have queuedIn : ∀ next, Laws.State.Queued { s with batchSignals := s.batchSignals ++ [.begin request] } next →
      Laws.State.Queued s next ∨ next = request := fun next named => by
    rcases named with signal | token
    · rcases List.mem_append.mp (Laws.State.allSignals_append s _ ▸ signal) with old | new
      · exact .inl (.inl old)
      · exact .inr (Laws.Step.begin_inj (List.mem_singleton.mp new))
    · exact .inl (.inr token)
  have instanceIn : ∀ next, Laws.State.Queued { s with batchSignals := s.batchSignals ++ [.begin request] } next → ∀ body,
      next.continuation = .multiInstance body → Laws.State.Queued s next := fun next named body on =>
    (queuedIn next named).resolve_right fun same => other body (same ▸ on)
  refine ⟨each, { queued with
    targets := fun next inQueue body on stands => queued.targets next (instanceIn next inQueue body on) body on stands
    reserved := fun next inQueue run member active id named o inside xid xelement xrole => ?_
    occurs := fun element pending => queued.occurs element ?_
    ordered := fun run member => ?_
    above := fun run member next index queued' scope inQueue for_ slot begun =>
      queued.above run member next index queued' scope (instanceIn next inQueue _ for_.1) for_ slot begun }⟩
  · rcases queuedIn next inQueue with old | rfl
    · exact queued.reserved next old run member active id named o inside xid xelement xrole
    · obtain ⟨entry, entryIn, entryNamed, some⟩ := owned id named
      have none := owns.unowned run member next.scope active entry entryIn entryNamed
      rw [none] at some
      exact Bool.false_ne_true some
  · rcases pending with occur | compensate | resumed
    · obtain ⟨scope, rest⟩ := occur
      obtain ⟨leave, writes, rule, member⟩ := rest
      refine .inl ⟨scope, leave, writes, rule,
        (List.mem_append.mp (Laws.State.allSignals_append s _ ▸ member)).resolve_right fun new => ?_⟩
      exact Laws.Step.occur_ne_begin (List.mem_singleton.mp new)
    · obtain ⟨scope, activity, trigger, rest⟩ := compensate
      obtain ⟨leave, at_, resumed, member⟩ := rest
      refine .inr (.inl ⟨scope, activity, trigger, leave, at_, resumed,
        (List.mem_append.mp (Laws.State.allSignals_append s _ ▸ member)).resolve_right fun new => ?_⟩)
      exact Laws.Step.compensate_ne_begin (List.mem_singleton.mp new)
    · exact .inr (.inr resumed)
  · have ordered := queued.ordered run member
    exact { ordered with
      signals := fun first second first' second' precedes one two => by
        rcases precedes_append precedes with old | new
        · exact ordered.signals first second first' second' old one two
        · exact absurd (Laws.Step.begin_inj new ▸ two.1) (other _)
      queues := fun first second first' second' signal token one two => by
        rcases List.mem_append.mp signal with old | new
        · exact ordered.queues first second first' second' old token one two
        · exact absurd (Laws.Step.begin_inj (List.mem_singleton.mp new) ▸ one.1) (other _)
      apart := fun first second first' second' batch one => by
        rcases batch with signal | token
        · rcases List.mem_append.mp signal with old | new
          · exact ordered.apart first second first' second' (.inl old) one
          · exact absurd (Laws.Step.begin_inj (List.mem_singleton.mp new) ▸ one.1) (other _)
        · exact ordered.apart first second first' second' (.inr token) one }

/-- Storing compensation runs keeps `Numbered` when each reservation they resume is pending already or of an element
that does not loop. -/
theorem Numbered.storeRuns {program : Program} {s : State} (compensation : Compensations)
    (resumes : ∀ run ∈ compensation.runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
      OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop)
    (held : Numbered program s) : Numbered program { s with slots := { s.slots with compensation } } :=
  held.shrink (.same rfl (fun _ inside => inside) rfl (.of_kept (.of_eq rfl rfl rfl rfl)) fun element pending => by
    rcases pending with occur | compensate | resumed
    · exact .inl (.inl occur)
    · exact .inl (.inr (.inl compensate))
    · obtain ⟨run, member, rest⟩ := resumed
      obtain ⟨at_, leave, resume⟩ := rest
      exact resumes run member element at_ leave resume)

/-- Taking signals or tokens off the running batch keeps `Numbered`. -/
theorem Numbered.dequeue {program : Program} {s : State} {signals : List Signal} {tokens : List Token}
    (fewer : signals.Sublist s.batchSignals) (fewerTokens : tokens.Sublist s.batchTokens) (held : Numbered program s) :
    Numbered program { s with batchSignals := signals, batchTokens := tokens } :=
  have kept : Laws.State.QueuesKept s { s with batchSignals := signals, batchTokens := tokens } :=
    ⟨fewer, fewerTokens, fun _ _ found => found, fun _ _ found => found⟩
  held.shrink ⟨.refl _, fun _ inside => inside, fun _ inside => .inl inside, fun _ _ outside => absurd ‹_› outside,
    .of_kept kept, fun _ pending => .inl (pending_of_sublist kept.signal_mem (fun _ member => member) pending)⟩

/-- Taking the closure's next signal off the queue keeps `Numbered`. -/
theorem Numbered.unqueue {program : Program} {s : State} (unit : UnitKey) (held : Numbered program s) :
    Numbered program { s with queuedSignals := s.queuedSignals.erase unit } :=
  have kept : Laws.State.QueuesKept s { s with queuedSignals := s.queuedSignals.erase unit } :=
    ⟨.refl _, .refl _, fun _ _ found => (Laws.State.getElem?_of_erase found).1, fun _ _ found => found⟩
  held.shrink ⟨.refl _, fun _ inside => inside, fun _ inside => .inl inside, fun _ _ outside => absurd ‹_› outside,
    .of_kept kept, fun _ pending => .inl (pending_of_sublist kept.signal_mem (fun _ member => member) pending)⟩

/-- Taking the closure's next token off the queue keeps `Numbered`. -/
theorem Numbered.untoken {program : Program} {s : State} (unit : UnitKey) (held : Numbered program s) :
    Numbered program { s with queuedTokens := s.queuedTokens.erase unit } :=
  have kept : Laws.State.QueuesKept s { s with queuedTokens := s.queuedTokens.erase unit } :=
    ⟨.refl _, .refl _, fun _ _ found => found, fun _ _ found => (Laws.State.getElem?_of_erase found).1⟩
  held.shrink ⟨.refl _, fun _ inside => inside, fun _ inside => .inl inside, fun _ _ outside => absurd ‹_› outside,
    .of_kept kept, fun _ pending => .inl (pending_of_sublist kept.signal_mem (fun _ member => member) pending)⟩

/-- The keyed entry of a batch moved under `unit` is the batch's entry at its index, or was keyed before. -/
theorem batch_entry {β : Type} {batch : List β} {m : TreeMap UnitKey β compare} {step : Nat → UnitKey} {key : UnitKey}
    {value : β} (found : (batch.zipIdx.foldl (fun queued (entry, index) => queued.insert (step index) entry) m)[key]? =
      some value) : (∃ index, key = step index ∧ batch[index]? = some value) ∨ m[key]? = some value :=
  (Laws.State.foldl_insert_getElem? step batch.zipIdx m key value found).imp_left fun ⟨index, named, inside⟩ =>
    ⟨index, named, List.mem_zipIdx_iff_getElem?.mp inside⟩

/-- Moving the running batch under the micro-step's unit key keeps `Numbered`: the batch's begins become siblings under
that unit, whose index order is their batch order, and a body's begins are never both in the batch and keyed. -/
theorem Numbered.queueBatch {program : Program} {s : State} (unit : UnitKey) (held : Numbered program s) :
    Numbered program (s.queueBatch unit) := by
  have signalsIn := (Laws.State.allSignals_queueBatch s unit).subset
  have tokensIn := (Laws.State.allQueuedTokens_queueBatch s unit).subset
  obtain ⟨each, queued⟩ := held
  have queuedIn : ∀ request, Laws.State.Queued (s.queueBatch unit) request → Laws.State.Queued s request :=
    fun _ inQueue => inQueue.imp (fun signal => signalsIn signal) fun token => tokensIn token
  rw [Laws.State.queueBatch_eq] at signalsIn tokensIn queuedIn ⊢
  refine ⟨each, { queued with
    targets := fun request inQueue => queued.targets request (queuedIn request inQueue)
    reserved := fun request inQueue => queued.reserved request (queuedIn request inQueue)
    occurs := fun element pending => queued.occurs element (pending_of_sublist (fun _ inside => signalsIn inside)
      (fun _ member => member) pending)
    ordered := fun run member => ?_
    deferred := fun schedule request token => queued.deferred schedule request (tokensIn token)
    above := fun run member request index queued' scope inQueue =>
      queued.above run member request index queued' scope (queuedIn request inQueue) }⟩
  have ordered := queued.ordered run member
  exact {
    signals := fun _ _ _ _ precedes => absurd precedes.length_le (by simp)
    tokens := fun _ _ _ _ precedes => absurd precedes.length_le (by simp)
    queues := fun _ _ _ _ signal => absurd signal (by simp)
    apart := fun _ _ _ _ batch => absurd batch (by simp)
    keyedSignals := fun one two first second first' second' found found' a b order => by
      rcases batch_entry found with ⟨x, rfl, atX⟩ | old <;> rcases batch_entry found' with ⟨y, rfl, atY⟩ | old'
      · rw [Laws.State.UnitKey.breadth_siblings, Laws.State.UnitKey.compare_signal] at order
        exact ordered.signals first second first' second'
          (Laws.State.pair_of_getElem? (Nat.compare_eq_lt.mp order) atX atY) a b
      · exact (ordered.apart first second first' second' (.inl (List.mem_of_getElem? atX)) a two (.inl old') b).elim
      · exact (ordered.apart second first second' first' (.inl (List.mem_of_getElem? atY)) b one (.inl old) a).elim
      · exact ordered.keyedSignals one two first second first' second' old old' a b order
    keyedTokens := fun one two first second first' second' found found' a b => by
      rcases batch_entry found with ⟨x, rfl, atX⟩ | old <;> rcases batch_entry found' with ⟨y, rfl, atY⟩ | old'
      · exact ⟨unit, x, y, rfl, rfl, fun lower => ordered.tokens first second first' second'
          (Laws.State.pair_of_getElem? lower atX atY) a b⟩
      · exact (ordered.apart first second first' second' (.inr (List.mem_of_getElem? atX)) a two (.inr old') b).elim
      · exact (ordered.apart second first second' first' (.inr (List.mem_of_getElem? atY)) b one (.inr old) a).elim
      · exact ordered.keyedTokens one two first second first' second' old old' a b
    keyedQueues := fun one two first second first' second' found found' a b => by
      rcases batch_entry found with ⟨x, rfl, atX⟩ | old <;> rcases batch_entry found' with ⟨y, rfl, atY⟩ | old'
      · exact ordered.queues first second first' second' (List.mem_of_getElem? atX) (List.mem_of_getElem? atY) a b
      · exact (ordered.apart first second first' second' (.inl (List.mem_of_getElem? atX)) a two (.inr old') b).elim
      · exact (ordered.apart second first second' first' (.inr (List.mem_of_getElem? atY)) b one (.inl old) a).elim
      · exact ordered.keyedQueues one two first second first' second' old old' a b }

/-- A fresh instance numbers nothing: it holds no body, occurrence, queued signal or token, nor compensation run. -/
theorem numbered_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) : Numbered program (State.initial instanceId variables businessKey) := by
  have bodies := Laws.State.initial_bodies instanceId variables businessKey
  unfold Numbered
  refine ⟨fun _ member => by simp [bodies] at member, ?_⟩
  constructor <;> simp [Laws.State.Queued, Laws.State.allSignals, Laws.State.allQueuedTokens, Laws.State.initial_eq,
    OccurPending, Laws.State.occurrences_eq, Laws.State.occurrenceList_empty]

end Kernel.Proofs.MultiInstance
