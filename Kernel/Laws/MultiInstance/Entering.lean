module

public import Kernel.Laws.MultiInstance.Rules

/-! # Laws of Multi-Instance Activities: what a body keeps while it enters

What a running body keeps while `Kernel.Feature.MultiInstance` enters and queues its instances (`Entering`), the
left-fold lemma the entering runs on (`foldl_prefix`), the begins it queues (`Requested`, `QueuedAs`, `QueueKeeps`),
what an instance's completion records and a body's completion writes (`recorded`, `OutputFits`, `WritesCollection`),
and the facts about the waiting slots `MultiInstance.opening` picks from, stated without naming the feature so that they
stay outside its rebuild cone (guard 15); `Kernel.Laws.MultiInstance` proves what the hooks keep and do of them. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel

variable {inv : State → Prop} {settled : State → Nat → Prop}

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
occurrence has settled, its scope occurrence, its instances' placement, the scope occurrences the queued begins name,
each entered for the begin's element and calling no instance, and where its element lies: it is held, or its scope
occurrence was entered for its element and calls no instance. -/
def Entering (inv : State → Prop) (settled : State → Nat → Prop) (run : MultiInstanceRun) (state : State)
    (instances : List Iteration) (requests : List BeginRequest) : Prop :=
  inv state ∧ settled state run.occurrence ∧ run.scope ∈ Laws.State.scopeIds state ∧
    Laws.State.Placed state { run with instances } ∧
    (∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state ∧
      request.incoming = none ∧ ∃ entry ∈ state.scopes, entry.id = request.scope ∧
        entry.element = some request.element ∧ entry.calledInstance = none) ∧
    (run ∈ state.slots.multiInstances ∨ ∃ entry ∈ state.scopes, entry.id = run.scope ∧
      entry.element = some run.element ∧ entry.calledInstance = none)

/-- A change that keeps the scope occurrences, the counter and the bodies' slot records keeps what a body keeps while
it enters. -/
theorem Entering.frame {run : MultiInstanceRun}
    {state after : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (holds : inv after)
    (carried : settled after run.occurrence) (scopes : after.scopes = state.scopes)
    (issued : after.nextIssue = state.nextIssue) (runs : after.slots.multiInstances = state.slots.multiInstances) :
    Entering inv settled run after instances requests := by
  obtain ⟨_, _, stands, rest⟩ := entering
  obtain ⟨placed, queued, held⟩ := rest
  have same : Laws.State.scopeIds after = Laws.State.scopeIds state := by simp [Laws.State.scopeIds, scopes]
  exact ⟨holds, carried, same ▸ stands, placed.transport (Nat.le_of_eq issued.symm)
    (fun _ member => .inl (scopes ▸ member)), fun request member =>
      have ⟨bare, standing, rest⟩ := queued request member
      ⟨bare, same ▸ standing, rest.1, scopes ▸ rest.2⟩, held.imp (fun inside => runs ▸ inside) fun entered => scopes ▸ entered⟩

/-- Where a body's element lies while it enters: in its scope occurrence, held or entered for it. -/
theorem Entering.anchored {program : Program} {run : MultiInstanceRun} {state : State} {instances : List Iteration}
    {requests : List BeginRequest} (entering : Entering inv settled run state instances requests) :
    Laws.Flow.Anchored inv program state run.element run.scope := by
  refine ⟨run.element, .inl rfl, .inl ?_⟩
  rcases entering.2.2.2.2.2 with held | ⟨entry, member, facts⟩
  · exact .inr (.inr (.inr (.inr (.inl ⟨run, held, rfl, rfl⟩))))
  · exact .inr (.inl ⟨entry, member, facts.2.1, .inr ⟨facts.1, facts.2.2⟩⟩)

/-- A begin a body queues comes from the scope occurrence entered for its instance. -/
theorem Entering.begins {program : Program} {run : MultiInstanceRun} {state : State} {instances : List Iteration}
    {requests : List BeginRequest} (entering : Entering inv settled run state instances requests)
    {request : BeginRequest} (member : request ∈ requests) : Laws.Flow.BeginAnchored inv program state request := by
  obtain ⟨bare, -, rest⟩ := entering.2.2.2.2.1 request member
  obtain ⟨incoming, entry, inside, facts⟩ := rest
  refine ⟨⟨request.element, .inl rfl, .inl (.inr (.inl ⟨entry, inside, facts.2.1, .inr ⟨facts.1, facts.2.2⟩⟩))⟩,
    fun _ _ reserved => ?_, fun _ some_ => by rw [incoming] at some_; cases some_⟩
  simp [Laws.State.names, reserved] at bare

/-- `run` with slot `index` filled by `output` and the result names `results`: the slot record an instance's
completion sets (`MultiInstance.instanceCompleted`). -/
def recorded (run : MultiInstanceRun) (index : Nat) (output : Option Value) (results : List String) :
    MultiInstanceRun :=
  { run with instances := run.instances.set index (.completed output), results }

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

/-- The begin of `run`'s instance in the scope occurrence `scope`: an occurrence of the run's element that continues into
its body and names no reservation (`MultiInstance.beginInstances`). -/
def instanceRequest (run : MultiInstanceRun) (scope : ScopeOccurrenceId) : BeginRequest :=
  { element := run.element, scope, continuation := .multiInstance run.occurrence }

/-- The begins `requests` of the slots `opened` of `instances`, in the order `opened` lists them: each the begin of the
instance active in its slot (`instanceRequest`). -/
def Requested (run : MultiInstanceRun) (opened : List Nat) (instances : List Iteration) (requests : List BeginRequest) :
    Prop :=
  ∃ slots : List (Nat × ScopeOccurrenceId), slots.map (·.1) = opened ∧
    requests = slots.map (fun slot => instanceRequest run slot.2) ∧
    ∀ slot ∈ slots, instances[slot.1]? = some (.active slot.2)

/-- Where queuing a body's begins `requests` under `mode` put them, from `state` to `queued`: after the queued signals,
in order, or, under `declarationDepthFirst` for a parallel body, on the closure's work stack with the first on top
(`MultiInstance.queueInstances`). -/
def QueuedAs (program : Program) (mode : MultiInstanceMode) (state queued : State) (requests : List BeginRequest) :
    Prop :=
  (queued.signals = state.signals ++ requests.map .begin ∧ queued.tokens = state.tokens) ∨
    (program.options.branchSchedule = .declarationDepthFirst ∧ mode = .parallel ∧ queued.signals = state.signals ∧
      queued.tokens = state.tokens ++ (requests.map Token.begin).reverse)

/-- What queuing begins keeps of `state`: everything but the queued signals and tokens (`MultiInstance.queueInstances`). -/
structure QueueKeeps (state queued : State) : Prop where
  scopes : queued.scopes = state.scopes
  occurrences : queued.occurrences = state.occurrences
  variables : queued.variables = state.variables
  slots : queued.slots = state.slots
  nextIssue : queued.nextIssue = state.nextIssue

/-- `value` lists `outputs` as an output collection does: as a List, or as a String List of their texts. -/
def ListsOutputs (value : Value) (outputs : List Value) : Prop :=
  value = .list outputs ∨ ∃ texts, value = .stringList texts ∧ texts.map .string = outputs

/-- What a body's completion may write, `writes`, for the slot record `run` under the loop `loop`: an entry only under
`MultiInstanceOutputs.aggregates` once every slot is filled, listing each slot's output in item order when the loop
names an output data item and the filled slots fit it. -/
def WritesCollection (program : Program) (loop : MultiInstance) (run : MultiInstanceRun)
    (writes : List (String × Value)) : Prop :=
  ∀ name value, (name, value) ∈ writes → program.options.multiInstanceOutputs = .aggregates ∧
    (∀ slot ∈ run.instances, ∃ output, slot = .completed output) ∧
    (loop.outputDataItem.isSome → OutputsFit run loop → ∃ outputs, ListsOutputs value outputs ∧ Collects run (some outputs))

/-- The slots of `instances` whose index the waiting-slot list `MultiInstance.opening` picks from lists are the waiting
ones. -/
theorem waiting_mem {instances : List Iteration} {index : Nat} :
    index ∈ (instances.zipIdx.filterMap fun (slot, index) =>
      match slot with
      | .waiting => some index
      | .active _ => none
      | .completed _ => none) ↔ instances[index]? = some .waiting := by
  constructor
  · intro member
    obtain ⟨⟨slot, at_⟩, inside, picked⟩ := List.mem_filterMap.mp member
    have found := List.mem_zipIdx_iff_getElem?.mp inside
    cases slot <;> simp at picked
    subst picked
    exact found
  · intro found
    exact List.mem_filterMap.mpr ⟨(.waiting, index), List.mem_zipIdx_iff_getElem?.mpr found, rfl⟩

/-- The waiting-slot list `MultiInstance.opening` picks from is in increasing index order. -/
theorem waiting_ordered (instances : List Iteration) :
    (instances.zipIdx.filterMap fun (slot, index) =>
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

/-- The first member of a list in increasing order is its member no smaller member precedes. -/
theorem take_one_ordered {l : List Nat} (ordered : l.Pairwise (· < ·)) {x : Nat} :
    x ∈ l.take 1 ↔ x ∈ l ∧ ∀ y < x, y ∉ l := by
  cases l with
  | nil => simp
  | cons first rest =>
    have later := (List.pairwise_cons.mp ordered).1
    rw [List.take_succ_cons, List.take_zero, List.mem_singleton]
    constructor
    · rintro rfl
      refine ⟨List.mem_cons_self .., fun y lower member => ?_⟩
      rcases List.mem_cons.mp member with rfl | inside
      · exact Nat.lt_irrefl _ lower
      · exact Nat.lt_asymm lower (later y inside)
    · rintro ⟨member, least⟩
      rcases List.mem_cons.mp member with same | inside
      · exact same
      · exact absurd (List.mem_cons_self ..) (least first (later x inside))

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

end Kernel.Laws.MultiInstance
