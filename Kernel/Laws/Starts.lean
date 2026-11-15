module

public import Kernel.Hooks
public import Kernel.Feature.Starts
import all Kernel.Feature.Starts

/-! # Laws of root starts

The rules of [start selection](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) and of
[triggered starts](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts), independent of
`Kernel.Feature.Starts`' and `Kernel.Step`'s code: the root starts are the start Events at process level, never one
inside a Sub-Process; a named start input considers only the start it names; the starts an input fires keep document
order; admission keeps one initial root start, so an unnamed none input is never ambiguous in an admitted process; one
input starts one instance at one start, refusing none and several; and an instance begins at most once.

The laws take a process's elements, their parents and their triggers as parameters, since reading them is the IL's and
`Kernel.Step`'s, and whether a trigger fires a start as a function `fires`, whose matching on `Trigger`
`Kernel.Feature.Subscriptions` owns; the proof wave relates them to the program. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.

Its laws read no body of `Kernel.Feature.Starts`; what `Hooks.startsFired` returns (`startsFired_root`) and its share of
the state-invariant lane, at the end, read its bodies.
-/

@[expose] public section

namespace Kernel.Laws.Starts

open Kernel

/-! ## Root starts -/

/-- A root start in document order, with whether it is a none start, one without a trigger. -/
structure RootStart where
  id : ElementId
  untriggered : Bool

/-- The root starts of a process are its start Events in document order whose parent is the process itself, `none`; a
start inside an embedded Sub-Process starts that Sub-Process's occurrence, never an instance (§10.5.2). -/
def RootStarts (elements : List ElementId) (isStart : ElementId → Bool) (parent : ElementId → Option ElementId)
    (starts : List ElementId) : Prop :=
  starts = elements.filter fun element => isStart element && (parent element).isNone

theorem RootStarts.notNested {elements : List ElementId} {isStart : ElementId → Bool}
    {parent : ElementId → Option ElementId} {starts : List ElementId} (roots : RootStarts elements isStart parent starts)
    {element sub : ElementId} (nested : parent element = some sub) : element ∉ starts := by
  unfold RootStarts at roots
  subst roots
  simp [nested]

theorem RootStarts.ordered {elements : List ElementId} {isStart : ElementId → Bool}
    {parent : ElementId → Option ElementId} {starts : List ElementId} (roots : RootStarts elements isStart parent starts) :
    starts.Sublist elements := by
  rw [roots]
  exact List.filter_sublist

/-! ## Fired starts -/

/-- The root starts a start input fires, and the starts whose trigger predicate it evaluates. A named input evaluates
only the start it names, so no other start's predicate runs for it: each start is its own unit of commitment
([population](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#conditional-start-evaluations)). An unnamed
none trigger evaluates nothing and fires every none start, so several are `start-ambiguous` (`Chosen`), not
`no-start-event`. Any other unnamed trigger evaluates every root start and fires those it fires. -/
def Fired (starts : List RootStart) (fires : ElementId → Bool) (named : Option ElementId) (noneTrigger : Bool)
    (evaluated fired : List ElementId) : Prop :=
  match named with
  | some id => evaluated = ((starts.filter (·.id == id)).map (·.id)) ∧ fired = evaluated.filter fires
  | none =>
    if noneTrigger then
      evaluated = [] ∧ fired = (starts.filter (·.untriggered)).map (·.id)
    else evaluated = starts.map (·.id) ∧ fired = evaluated.filter fires

/-- The fired starts keep document order. -/
theorem Fired.ordered {starts : List RootStart} {fires : ElementId → Bool} {named : Option ElementId}
    {noneTrigger : Bool} {evaluated fired : List ElementId} (law : Fired starts fires named noneTrigger evaluated fired) :
    fired.Sublist (starts.map (·.id)) := by
  unfold Fired at law
  split at law
  · rw [law.2, law.1]
    exact (List.filter_sublist).trans ((List.filter_sublist).map _)
  · split at law
    · rw [law.2]
      exact (List.filter_sublist).map _
    · rw [law.2, law.1]
      exact List.filter_sublist

/-! ## Admitted root starts -/

/-- Admission's verdict on a process's root starts: a second initial start, a None or a Timer start, is refused as
`start.rootCombination`, as pinned CIB parses one initial start per process; BPMN 2.0.2 §10.5.2 admits several, which
lie outside the target ([CIB-LIM-0007](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0007-pinned-cib-parses-one-initial-start-per-process-and-one-start-per-sub-process),
[flow, start combinations](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md)). `timer` says which starts a Timer
triggers. -/
def RootCombination (starts : List RootStart) (timer : ElementId → Bool) : Option String → Prop
  | some code => 2 ≤ (starts.filter fun start => start.untriggered || timer start.id).length ∧
      code = "start.rootCombination"
  | none => (starts.filter fun start => start.untriggered || timer start.id).length < 2

/-- So an admitted process fires at most one start for an unnamed none trigger, and such an input is never
`start-ambiguous`. -/
theorem RootCombination.noneUnambiguous {starts : List RootStart} {timer : ElementId → Bool}
    {fires : ElementId → Bool} {evaluated fired : List ElementId} (admitted : RootCombination starts timer none)
    (law : Fired starts fires none true evaluated fired) : fired.length ≤ 1 := by
  simp only [Fired, ite_true] at law
  rw [law.2, List.length_map, ← List.countP_eq_length_filter]
  have : (starts.filter (·.untriggered)).length ≤ (starts.filter fun start => start.untriggered || timer start.id).length := by
    simp only [← List.countP_eq_length_filter]
    exact List.countP_mono_left fun start _ untriggered => by simp [untriggered]
  simp only [RootCombination] at admitted
  rw [List.countP_eq_length_filter]
  omega

/-! ## The one start an input starts -/

/-- One input starts one instance at one start: the start it names if its trigger fired it, else `no-start-event`; for
an unnamed input the only fired start, `no-start-event` for none and `start-ambiguous` for several
([population](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection)). -/
def Chosen (named : Option ElementId) (fired : List ElementId) (result : Except Failure ElementId) : Prop :=
  match named with
  | some id => (id ∈ fired ∧ result = .ok id) ∨ (id ∉ fired ∧ result = .error (.rejected "no-start-event"))
  | none =>
    (∃ only, fired = [only] ∧ result = .ok only) ∨ (fired = [] ∧ result = .error (.rejected "no-start-event")) ∨
      (2 ≤ fired.length ∧ result = .error (.rejected "start-ambiguous"))

/-! ## Beginning once -/

/-- A start input to an instance that has begun is refused as `instance-already-started`, so it changes nothing
([publication, rejections](../../docs/kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md)). -/
def StartRefused (before : Option State) (result : Except Failure State) : Prop :=
  before.isSome = true → result = .error (.rejected "instance-already-started")

/-- Over the successive states of one run an instance begins at most once: the states before it are absent, every one
after it present, and all of them one instance. -/
def BeginsOnce (trace : List (Option State)) : Prop :=
  ∃ unstarted started, trace = unstarted ++ started ∧ (∀ state ∈ unstarted, state = none) ∧
    (∀ state ∈ started, state.isSome = true) ∧
    ∀ first ∈ started, ∀ later ∈ started, (first.map (·.instanceId)) = (later.map (·.instanceId))

/-! ## Non-vacuity

A process with a none start `S`, a Message start `M` and a start `N` inside the Sub-Process `Sub`. -/

def startS : ElementId := ⟨"S"⟩
def startM : ElementId := ⟨"M"⟩
def startN : ElementId := ⟨"N"⟩
def sub : ElementId := ⟨"Sub"⟩
def task : ElementId := ⟨"T"⟩

def elements : List ElementId := [startS, sub, startN, task, startM]
def isStart (element : ElementId) : Bool := element == startS || element == startM || element == startN
def parentOf (element : ElementId) : Option ElementId := if element == startN then some sub else none

def noneStart : RootStart := { id := startS, untriggered := true }
def messageStart : RootStart := { id := startM, untriggered := false }
def roots : List RootStart := [noneStart, messageStart]

/-- The predicate a Message trigger for `M` gives. -/
def firesM (element : ElementId) : Bool := element == startM

theorem root_starts : RootStarts elements isStart parentOf [startS, startM] := by
  simp [RootStarts, elements, isStart, parentOf, startS, startM, startN, sub, task]

/-- Counting the nested start as a root start is rejected. -/
theorem nested_start_rejected : ¬ RootStarts elements isStart parentOf [startS, startN, startM] := fun roots =>
  RootStarts.notNested roots (element := startN) (sub := sub) (by simp [parentOf]) (by simp)

theorem unnamed_message_fires : Fired roots firesM none false [startS, startM] [startM] := by
  simp [Fired, roots, noneStart, messageStart, firesM, startS, startM]

theorem named_evaluates_only_named : Fired roots firesM (some startM) false [startM] [startM] := by
  simp [Fired, roots, noneStart, messageStart, firesM, startS, startM]

/-- A named input never evaluates another start's predicate. -/
theorem named_evaluates_other_rejected : ¬ Fired roots firesM (some startM) false [startS, startM] [startM] := by
  simp [Fired, roots, noneStart, messageStart, startS, startM]

theorem sole_none_fires : Fired roots firesM none true [] [startS] := by
  simp [Fired, roots, noneStart, messageStart]

/-- Two none starts both fire for an unnamed none trigger, so the input is `start-ambiguous`. -/
theorem several_none_fire : Fired [noneStart, { noneStart with id := task }] firesM none true [] [startS, task] := by
  simp [Fired, noneStart]

/-- Firing nothing for several none starts, which answers `no-start-event`, is rejected. -/
theorem several_none_silent_rejected : ¬ Fired [noneStart, { noneStart with id := task }] firesM none true [] [] := by
  simp [Fired, noneStart]

/-- A process whose only initial start is `S` is admitted. -/
theorem one_initial_admitted : RootCombination roots (fun _ => false) none := by
  simp [RootCombination, roots, noneStart, messageStart]

/-- A None start beside a Timer start is refused. -/
theorem none_and_timer_refused :
    RootCombination roots (· == startM) (some "start.rootCombination") := by
  simp [RootCombination, roots, noneStart, messageStart]

/-- Admitting two none starts is rejected. -/
theorem two_none_admitted_rejected : ¬ RootCombination [noneStart, { noneStart with id := task }] (fun _ => false) none := by
  simp [RootCombination, noneStart]

/-- Firing a start out of document order is rejected. -/
theorem out_of_order_rejected : ¬ Fired roots (fun _ => true) none false [startS, startM] [startM, startS] := by
  simp [Fired, roots, noneStart, messageStart, startS, startM]

theorem named_chosen : Chosen (some startM) [startM] (.ok startM) := .inl ⟨by simp, rfl⟩

theorem named_unfired : Chosen (some startS) [startM] (.error (.rejected "no-start-event")) :=
  .inr ⟨by simp [startS, startM], rfl⟩

theorem only_chosen : Chosen none [startM] (.ok startM) := .inl ⟨startM, rfl, rfl⟩

theorem nothing_fired : Chosen none [] (.error (.rejected "no-start-event")) := .inr (.inl ⟨rfl, rfl⟩)

theorem several_ambiguous : Chosen none [startS, startM] (.error (.rejected "start-ambiguous")) :=
  .inr (.inr ⟨by simp, rfl⟩)

/-- Picking the first of several fired starts is rejected. -/
theorem first_of_several_rejected : ¬ Chosen none [startS, startM] (.ok startS) := by
  simp [Chosen]

def begun : State := { instanceId := "p" }

theorem restart_refused : StartRefused (some begun) (.error (.rejected "instance-already-started")) := fun _ => rfl

/-- Starting a begun instance anew is rejected. -/
theorem restart_rejected : ¬ StartRefused (some begun) (.ok begun) := fun refused => by
  have := refused rfl
  simp at this

theorem begins_once : BeginsOnce [none, some begun, some begun] :=
  ⟨[none], [some begun, some begun], rfl, by simp, by simp, by simp⟩

/-- A second instance in one run is rejected. -/
theorem second_instance_rejected : ¬ BeginsOnce [some begun, some { begun with instanceId := "q" }] := by
  rintro ⟨unstarted, started, split, laws⟩
  obtain ⟨absent, _, same⟩ := laws
  match unstarted, split with
  | [], split =>
    subst split
    have := same (some begun) (by simp) (some { begun with instanceId := "q" }) (by simp)
    simp [begun] at this
  | _ :: _, split =>
    have := absent (some begun) (by simp at split; simp [split.1])
    simp at this

/-! ## The starts `Hooks.startsFired` returns -/

/-- An element a list's `filterMapM` keeps is one its function kept from a member. -/
private theorem filterMapM_mem {α β ε : Type} {f : α → Except ε (Option β)} :
    ∀ {items : List α} {kept : List β}, items.filterMapM f = .ok kept → ∀ b ∈ kept, ∃ a ∈ items, f a = .ok (some b) := by
  intro items
  induction items with
  | nil =>
    intro kept ran b inside
    simp only [List.filterMapM_nil, pure, Except.pure, Except.ok.injEq] at ran
    subst ran
    cases inside
  | cons a rest ih =>
    intro kept ran b inside
    rw [List.filterMapM_cons] at ran
    cases found : f a with
    | error _ => simp [found, bind, Except.bind] at ran
    | ok result =>
      simp only [found, bind, Except.bind] at ran
      cases result with
      | none =>
        obtain ⟨member, present, made⟩ := ih ran b inside
        exact ⟨member, List.mem_cons_of_mem _ present, made⟩
      | some first =>
        cases tail : rest.filterMapM f with
        | error _ => simp [tail] at ran
        | ok more =>
          simp only [tail, pure, Except.pure, Except.ok.injEq] at ran
          subst ran
          rcases List.mem_cons.mp inside with rfl | later
          · exact ⟨a, List.mem_cons_self .., found⟩
          · obtain ⟨member, present, made⟩ := ih tail b later
            exact ⟨member, List.mem_cons_of_mem _ present, made⟩

/-- Every start `Hooks.startsFired` returns is a root-process start Event: it reads only the starts of
`Program.children none`, so no start of a called process or inside a Scope begins an instance. -/
theorem startsFired_root {hooks : Feature.Starts.StartsHooks} {ctx : Ctx} {input : StartInput} {fired : List ElementId}
    (ran : Feature.Starts.startsFired hooks ctx input = .ok fired) :
    ∀ id ∈ fired, ∃ element ∈ ctx.program.children none, ∃ header payload,
      element.start? = some (header, payload) ∧ header.id = id := by
  have started : ∀ start ∈ (ctx.program.children none).filterMap Element.start?,
      ∃ element ∈ ctx.program.children none, ∃ header payload,
        element.start? = some (header, payload) ∧ header.id = start.1.id := fun start inside => by
    obtain ⟨element, member, typed⟩ := List.mem_filterMap.mp inside
    exact ⟨element, member, start.1, start.2, typed, rfl⟩
  have kept : ∀ (starts : List (Header × StartPayload)), (∀ start ∈ starts, start ∈
      (ctx.program.children none).filterMap Element.start?) → ∀ (fires : Header × StartPayload → Except Failure Bool)
      (kept : List ElementId), starts.filterMapM (fun start => do
        pure (if ← fires start then some start.1.id else none)) = .ok kept → ∀ id ∈ kept,
      ∃ element ∈ ctx.program.children none, ∃ header payload, element.start? = some (header, payload) ∧ header.id = id :=
    fun starts within fires kept made id inside => by
      obtain ⟨start, member, chose⟩ := filterMapM_mem made id inside
      cases fired : fires start with
      | error _ => simp [fired, bind, Except.bind] at chose
      | ok fires =>
        cases fires <;> simp [fired, bind, Except.bind, pure, Except.pure] at chose
        rw [← chose]
        exact started start (within start member)
  unfold Feature.Starts.startsFired at ran
  split at ran
  · exact kept _ (fun _ inside => (List.mem_filter.mp inside).1) _ _ ran
  · cases ran
    intro id inside
    obtain ⟨start, member, named⟩ := List.mem_map.mp inside
    exact named ▸ started start (List.mem_filter.mp member).1
  · exact kept _ (fun _ inside => inside) _ _ ran

/-! ## The state invariant under Starts' hooks

Starts' share of the proof wave's state-invariant lane (P2), stated over `StartsOps`, generic in `inv`;
`Kernel.Proofs.Step` fills `StartsOps` for `Laws.State.WellFormed`. A start Event completes its own begun occurrence,
after a timer start has moved the logical time. -/

/-- What Starts' hooks need of the state operations they apply, for an invariant `inv`. -/
structure StartsOps (inv : State → Prop) : Prop where
  /-- The logical time moves. -/
  clock : ∀ state atMs, inv state → inv { state with logicalTimeMs := atMs }
  /-- The completion of a begun occurrence that stands. -/
  complete : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → inv (state.signal (.complete occurrence.id leave writes rule))

/-- `Hooks.arriveStart` keeps `inv`: a start Event completes its own begun occurrence. -/
theorem arriveStart_keeps {inv : State → Prop} (ops : StartsOps inv) {hooks : Feature.Starts.StartsHooks} {ctx : Ctx}
    {header : Header} {payload : StartPayload} {trigger : StartTrigger} {occurrence : Occurrence} {state after : State}
    (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (ran : Feature.Starts.arriveStart hooks ctx header payload trigger occurrence state = .ok after) : inv after := by
  unfold Feature.Starts.arriveStart at ran
  split at ran
  · simp only [bind, Except.bind] at ran
    cases ran
    exact ops.complete _ _ _ _ _ (ops.clock _ _ holds) member begun
  · cases paid : Feature.Starts.startPayload hooks ctx state.logicalTimeMs ‹_› ‹_› with
    | error failure => simp [paid, bind, Except.bind] at ran
    | ok values =>
      simp only [paid, bind, Except.bind] at ran
      cases ran
      exact ops.complete _ _ _ _ _ holds member begun
  · split at ran
    · simp [throw, throwThe, MonadExcept.throw, bind, Except.bind] at ran
    · simp only [bind, Except.bind] at ran
      split at ran
      · cases ran
      · cases ran
        exact ops.complete _ _ _ _ _ holds member begun
  all_goals
    simp only [bind, Except.bind] at ran
    cases ran
    exact ops.complete _ _ _ _ _ holds member begun

end Kernel.Laws.Starts
