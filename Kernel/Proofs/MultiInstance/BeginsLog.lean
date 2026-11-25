module

public import Kernel.Proofs.MultiInstance.Begins

/-! # Proofs: the order instances begin in, through a closure

The second half of `Kernel.Proofs.MultiInstance.Begins`' order (DC4): a micro-step's conclusion journals its draft
under its unit, which the run log records last, so the transitions of units that ran later carry later activations
(`LogOrder`, carried by `Laws.Step.settle_induction_log`), and the committed journal, in run order (`byRun`), carries
them in order (`beginsInOrder_of`). The walk is generic in what rides beside the log (`RidesLog`), which
`Kernel.Proofs.MultiInstance.Registered` supplies. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

variable {le : Issue → Issue → Bool}

open Kernel
open Kernel.Step (RunLog byRun orderJournal microStep settle unitCtx closureBound closureWorkBound)
open Kernel.Laws.State (WellFormed scopeIds)
open Kernel.Laws.IL (BoundaryOf Reservable)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique UnbegunUnlooped BeginsInOrder)
open Kernel.Laws.Step (OccurPending PendingIn)
open Kernel.Proofs.Frame (OccursAlongside ResumesPending Alongside StoresAlongside BodyAlongside)

variable {T : TreeMap UnitKey Transition compare} {log : RunLog} {unit : UnitKey}

/-! ## Through a closure -/

/-- What the closure's run log says of its transitions (DC4): every unit it records holds a transition, every
transition's unit ran at a position the log records, a transition's start facts of a looping element carry activations
issued in order, each before every one of a transition whose unit ran later. -/
structure LogOrder (program : Program) (log : RunLog) (transitions : TreeMap UnitKey Transition compare) : Prop where
  ran : ∀ unit, unit ∈ log.positions → unit ∈ transitions
  logged : ∀ unit, unit ∈ transitions → unit ∈ log.positions ∧ log.runPosition unit < log.positions.size
  ordered : ∀ (unit : UnitKey) (transition : Transition), transitions[unit]? = some transition →
    ∀ element loop, LoopOf program element loop → MadeInOrder log transition.started element
  later : ∀ (one two : UnitKey) (first second : Transition), transitions[one]? = some first → transitions[two]? = some second → one ≠ two →
    log.runPosition one ≤ log.runPosition two → ∀ element loop, LoopOf program element loop →
      MadeAbove log first.started second.started element

theorem LogOrder.empty (program : Program) : LogOrder program {} ∅ :=
  ⟨fun _ inside => by simp at inside, fun _ inside => by simp at inside, fun _ _ found => by simp at found,
    fun _ _ _ _ found => by simp at found⟩

/-- A transition's start facts are among the closure's. -/
theorem blockFacts_mem {transitions : TreeMap UnitKey Transition compare} {key : UnitKey} {transition : Transition}
    {fact : StartedFact} (found : transitions[key]? = some transition) (inside : fact ∈ transition.started) :
    fact ∈ blockFacts transitions :=
  List.mem_flatMap.mpr ⟨transition, Laws.State.mem_values.mpr ⟨key, found⟩, inside⟩

/-! ### Recording the unit that ran -/

/-- Every pending activation a start fact of a micro-step of `unit` carries is `unit`'s or one of a unit that ran:
the issue table holds it (`StartsCounted`), as the running unit's or a transition's (`IssuerFresh.ran`). -/
theorem starts_logged {other : Program} {s : State} (formed : WellFormed other s) (issuing : s.issuing = unit)
    (frame : LogFrame log unit s.transitions) {fact : StartedFact} (inside : fact ∈ Laws.State.starts s) {u : UnitKey}
    {i : Nat} (pending : fact.occurrence.activation = .fresh u i) : u = unit ∨ u ∈ log.positions := by
  have counted := formed.counted fact inside
  unfold Laws.State.Counted at counted
  rw [pending] at counted
  rcases formed.issuer.ran u i _ counted with ran | same
  · exact (frame.logged u ran).imp id (·.1)
  · exact .inl (same.trans issuing)

theorem FreshBefore.record {a b : Issue} (held : FreshBefore log a b) (unrun : unit ∉ log.positions)
    (bounded : ∀ other ∈ log.positions, log.runPosition other < log.positions.size)
    (first : ∀ u i, a = .fresh u i → u = unit ∨ u ∈ log.positions)
    (second : ∀ u i, b = .fresh u i → u = unit ∨ u ∈ log.positions) : FreshBefore (log.record unit) a b :=
  ⟨held.1, held.2.1, held.2.2.record unrun bounded first second⟩

theorem MadeInOrder.record {facts : List StartedFact} {element : ElementId} (ordered : MadeInOrder log facts element)
    (unrun : unit ∉ log.positions) (bounded : ∀ other ∈ log.positions, log.runPosition other < log.positions.size)
    (units : ∀ fact ∈ facts, ∀ u i, fact.occurrence.activation = .fresh u i → u = unit ∨ u ∈ log.positions) :
    MadeInOrder (log.record unit) facts element := by
  unfold MadeInOrder at ordered ⊢
  refine ordered.imp_of_mem fun aIn bIn held => held.record unrun bounded ?_ ?_
  · obtain ⟨fact, factIn, rfl⟩ := List.mem_map.mp aIn
    exact units fact (List.mem_filter.mp factIn).1
  · obtain ⟨fact, factIn, rfl⟩ := List.mem_map.mp bIn
    exact units fact (List.mem_filter.mp factIn).1

theorem MadeAbove.record {earlier later : List StartedFact} {element : ElementId} (above : MadeAbove log earlier later element)
    (unrun : unit ∉ log.positions) (bounded : ∀ other ∈ log.positions, log.runPosition other < log.positions.size)
    (units : ∀ fact ∈ earlier ++ later, ∀ u i, fact.occurrence.activation = .fresh u i → u = unit ∨ u ∈ log.positions) :
    MadeAbove (log.record unit) earlier later element :=
  fun first firstIn second secondIn firstLooping secondLooping =>
    (above first firstIn second secondIn firstLooping secondLooping).record unrun bounded
      (units first (List.mem_append_left _ firstIn)) (units second (List.mem_append_right _ secondIn))

/-- The run log's units ran at positions below its size. -/
theorem LogOrder.bounded {program : Program} (order : LogOrder program log T) :
    ∀ other ∈ log.positions, log.runPosition other < log.positions.size :=
  fun other inside => (order.logged other (order.ran other inside)).2

/-- Journalling a micro-step's draft, whose start facts are in order and after the closure's transitions', as the
transition of its unit, which the run log then records last, keeps `LogOrder`. -/
theorem LogOrder.record {program other : Program} {s : State} {transition : Transition}
    (order : LogOrder program log T) (kept : Unlooped program T log s) (formed : WellFormed other s)
    (issuing : s.issuing = unit) (frame : LogFrame log unit T)
    (started : transition.started = s.draft.started) : LogOrder program (log.record unit) (T.insert unit transition) := by
  have unlogged := frame.running
  have bounded := order.bounded
  have units : ∀ fact ∈ blockFacts T ++ s.draft.started, ∀ u i, fact.occurrence.activation = .fresh u i →
      u = unit ∨ u ∈ log.positions := fun fact inside u i pending =>
    starts_logged formed issuing (by rw [kept.transitions]; exact frame)
      (starts_mem (by rw [kept.transitions]; exact List.mem_append.mp inside)) pending
  have older : ∀ other, other ≠ unit → (T.insert unit transition)[other]? = T[other]? := fun other apart => by
    rw [Std.ExtTreeMap.getElem?_insert, ite_eq_right fun same => apart (Std.LawfulEqOrd.eq_of_compare same).symm]
  have logIn : ∀ other, other ∈ T.insert unit transition → other = unit ∨ other ∈ log.positions := fun other inside => by
    by_cases same : other = unit
    · exact .inl same
    · refine .inr (order.logged other ?_).1
      rw [Std.ExtTreeMap.mem_iff_isSome_getElem?, ← older other same, ← Std.ExtTreeMap.mem_iff_isSome_getElem?]
      exact inside
  have blockUnits : ∀ (key : UnitKey) (block : Transition), T[key]? = some block → ∀ fact ∈ block.started,
      ∀ u i, fact.occurrence.activation = .fresh u i → u = unit ∨ u ∈ log.positions :=
    fun key block found fact inside => units fact (List.mem_append_left _ (blockFacts_mem found inside))
  refine ⟨fun other inside => ?_, fun other inside => ?_, fun other block found element loop looped => ?_,
    fun one two first second found found' apart below element loop looped => ?_⟩
  · rcases Laws.Step.mem_record.mp inside with same | old
    · rw [same]; exact Std.ExtTreeMap.mem_insert_self
    · exact Std.ExtTreeMap.mem_insert.mpr (.inr (order.ran other old))
  · rw [Laws.Step.size_record unlogged, Laws.Step.runPosition_record _ _ _ (logIn other inside)]
    by_cases same : other = unit
    · rw [ite_eq_left same]
      exact ⟨Laws.Step.mem_record.mpr (.inl same), Nat.lt_succ_self _⟩
    · rw [ite_eq_right same]
      have old : other ∈ T := by
        rw [Std.ExtTreeMap.mem_iff_isSome_getElem?, ← older other same, ← Std.ExtTreeMap.mem_iff_isSome_getElem?]
        exact inside
      exact ⟨Laws.Step.mem_record.mpr (.inr (order.logged other old).1), Nat.lt_succ_of_lt (order.logged other old).2⟩
  · by_cases same : other = unit
    · rw [same, Std.ExtTreeMap.getElem?_insert_self] at found
      cases found
      rw [started]
      exact (kept.ordered element loop looped).record unlogged bounded fun fact inside =>
        units fact (List.mem_append_right _ inside)
    · rw [older other same] at found
      exact (order.ordered other block found element loop looped).record unlogged bounded (blockUnits other block found)
  · rw [Laws.Step.runPosition_record _ _ _
      (logIn one (Std.ExtTreeMap.mem_iff_isSome_getElem?.mpr (by simp [found]))),
      Laws.Step.runPosition_record _ _ _ (logIn two (Std.ExtTreeMap.mem_iff_isSome_getElem?.mpr (by simp [found'])))] at below
    by_cases oneSame : one = unit <;> by_cases twoSame : two = unit
    · exact absurd (oneSame.trans twoSame.symm) apart
    · rw [ite_eq_left oneSame, ite_eq_right twoSame] at below
      rw [older two twoSame] at found'
      have old : two ∈ T := Std.ExtTreeMap.mem_iff_isSome_getElem?.mpr (by simp [found'])
      exact absurd (Nat.lt_of_le_of_lt below (order.logged two old).2) (Nat.lt_irrefl _)
    · rw [twoSame, Std.ExtTreeMap.getElem?_insert_self] at found'
      cases found'
      rw [older one oneSame] at found
      rw [started]
      refine MadeAbove.record (fun fact factIn later laterIn => kept.above element loop looped fact
        (blockFacts_mem found factIn) later laterIn) unlogged bounded fun fact inside => ?_
      rcases List.mem_append.mp inside with old | new
      · exact blockUnits one first found fact old
      · exact units fact (List.mem_append_right _ new)
    · rw [ite_eq_right oneSame, ite_eq_right twoSame] at below
      rw [older one oneSame] at found
      rw [older two twoSame] at found'
      refine (order.later one two first second found found' apart below element loop looped).record unlogged bounded
        fun fact inside => ?_
      rcases List.mem_append.mp inside with old | new
      · exact blockUnits one first found fact old
      · exact blockUnits two second found' fact new

/-- What a closure carries under its run log `log`: `WellFormed`, and under a program whose identifiers are unique
`Unlooped` of the state's transitions and `LogOrder`. -/
def Logged (program : Program) (log : RunLog) (s : State) : Prop :=
  WellFormed program s ∧ (IdsUnique program → Unlooped program s.transitions log s ∧ LogOrder program log s.transitions)

/-- Facts in order that were each issued after the ones before keep their order when joined. -/
theorem MadeInOrder.append_of {earlier later : List StartedFact} {element : ElementId}
    (first : MadeInOrder log earlier element) (second : MadeInOrder log later element)
    (above : MadeAbove log earlier later element) : MadeInOrder log (earlier ++ later) element := by
  unfold MadeInOrder at first second ⊢
  rw [List.filter_append, List.map_append]
  refine List.pairwise_append.mpr ⟨first, second, fun a aIn b bIn => ?_⟩
  obtain ⟨one, oneIn, rfl⟩ := List.mem_map.mp aIn
  obtain ⟨two, twoIn, rfl⟩ := List.mem_map.mp bIn
  obtain ⟨oneMember, oneKept⟩ := List.mem_filter.mp oneIn
  obtain ⟨twoMember, twoKept⟩ := List.mem_filter.mp twoIn
  simp only [Bool.and_eq_true, beq_iff_eq] at oneKept twoKept
  exact above one oneMember two twoMember oneKept twoKept

/-- Transitions each in order, each issued after the ones listed before it, list their start facts in order. -/
theorem MadeInOrder.flatMap {blocks : List (UnitKey × Transition)} {element : ElementId}
    (ordered : ∀ block ∈ blocks, MadeInOrder log block.2.started element)
    (above : blocks.Pairwise fun one two => MadeAbove log one.2.started two.2.started element) :
    MadeInOrder log ((blocks.map (·.2)).flatMap (·.started)) element := by
  induction blocks with
  | nil => simp [MadeInOrder]
  | cons block rest ih =>
    obtain ⟨heads, tails⟩ := List.pairwise_cons.mp above
    rw [List.map_cons, List.flatMap_cons]
    refine MadeInOrder.append_of (ordered block (by simp))
      (ih (fun other inside => ordered other (List.mem_cons_of_mem _ inside)) tails) fun one oneIn two twoIn => ?_
    obtain ⟨transition, transitionIn, twoIn'⟩ := List.mem_flatMap.mp twoIn
    obtain ⟨other, otherIn, rfl⟩ := List.mem_map.mp transitionIn
    exact heads other otherIn one oneIn two twoIn'

/-- The transitions of a closure in the order its units ran (`byRun`) list a looping element's start facts with
activations issued in order, under `LogOrder`. -/
theorem LogOrder.byRun {program : Program} {element : ElementId} {loop : MultiInstance}
    (order : LogOrder program log T) (looped : LoopOf program element loop) :
    MadeInOrder log ((byRun log T).flatMap (·.started)) element := by
  obtain ⟨sorted, made, perm, positions⟩ := Laws.Step.byRun_sorted log T
  have found : ∀ entry ∈ sorted, T[entry.1]? = some entry.2 := fun entry inside =>
    Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp (perm.subset inside)
  rw [made]
  refine MadeInOrder.flatMap (fun entry inside => order.ordered entry.1 entry.2 (found entry inside) element loop
    looped) ((positions.and ((perm.nodup_iff).mpr (Laws.State.toList_nodup T))).imp_of_mem
      fun {one two} oneIn twoIn ⟨below, apart⟩ => ?_)
  have keys : one.1 ≠ two.1 := fun same => apart (Prod.ext same (by
    have := (found one oneIn).symm.trans (same ▸ found two twoIn)
    exact Option.some.inj this))
  exact order.later one.1 two.1 one.2 two.2 (found one oneIn) (found two twoIn) keys below element loop looped

/-- An input's reset keeps every reservation and leaves no transition and no start fact, under the empty run log and
the state's issuer. -/
theorem beginsKept_reset {program : Program} {s : State} (unbegun : IdsUnique program → UnbegunUnlooped program s)
    (occurs : IdsUnique program → ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop) :
    BeginsKept program ∅ {} s.issuing
      { s with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := s.nextCompletion } := fun apart =>
  ⟨⟨unbegun apart, occurs apart, rfl, fun _ _ _ _ inside => by simp [blockFacts] at inside,
    fun _ _ _ => by simp [MadeInOrder], fun _ _ _ _ _ _ inside => by simp at inside⟩, rfl,
    ⟨fun inside => by simp at inside, fun _ inside => by simp at inside⟩⟩

/-- A start's fresh instance holds no occurrence, no reservation still to be made and no transition. -/
theorem beginsKept_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    BeginsKept program ∅ {} (State.initial instanceId variables businessKey).issuing
      ((State.initial instanceId variables businessKey).signal (.armScope State.root)) := by
  obtain ⟨occurrences, signals, _, runs⟩ := Laws.State.initial_empty instanceId variables businessKey
  have empty : BeginsKept program ∅ {} (State.initial instanceId variables businessKey).issuing
      (State.initial instanceId variables businessKey) := fun _ =>
    ⟨⟨fun o inside => by simp [occurrences] at inside, fun element named => by
      rcases named with occur | compensate | resumed
      · simp [Laws.State.allSignals, Laws.State.initial_eq] at occur
      · simp [Laws.State.allSignals, Laws.State.initial_eq] at compensate
      · simp [runs] at resumed,
      by simp [Laws.State.initial_eq], fun _ _ _ _ inside => by simp [blockFacts, Laws.State.initial_eq] at inside,
      fun _ _ _ => by simp [MadeInOrder, Laws.State.initial_eq],
      fun _ _ _ _ _ _ inside => by simp [Laws.State.initial_eq] at inside⟩, rfl,
      ⟨fun inside => by simp at inside, fun _ inside => by simp at inside⟩⟩
  exact empty.signal _ fun _ _ inside => absurd inside List.not_mem_nil

/-- What the reservations of looping elements need of a committed input: after one from a well-formed committed state
none is made or still to be made, and after a committed start none is made, under a program whose identifiers are
unique. -/
structure UnbegunKept (hooks : Hooks) : Prop where
  step : ∀ program input before after, IdsUnique program → WellFormed program before → Laws.State.Committed before →
    UnbegunUnlooped program before → (∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop) →
    Step.step hooks program (some before) input = .ok after → UnbegunUnlooped program after
  start : ∀ program input after, IdsUnique program → Step.step hooks program none input = .ok after →
    UnbegunUnlooped program after

/-- What a property `carried` of the run log and the state needs to ride the log-aware walk beside `Logged`: a
micro-step's body keeps `side` of the closure's transitions, its run log and its unit, which holds `BeginsKept` beside
`WellFormed`; a state between micro-steps that keeps `carried` enters it, and the conclusion, from the transitions and
the issuer the body started with, leaves `carried` under the run log that records the unit. -/
structure RidesLog (hooks : Hooks) (carried : RunLog → Program → State → Prop)
    (side : TreeMap UnitKey Transition compare → RunLog → UnitKey → Program → State → Prop) : Prop where
  contract : ∀ T log unit, Laws.Step.HookContract hooks (side T log unit)
  phases : ∀ T log unit, Laws.Step.BodyPhases (side T log unit)
  pipeline : ∀ T log unit, Laws.Step.PipelinePhases (side T log unit)
  kept : ∀ T log unit program s, side T log unit program s → WellFormed program s ∧ BeginsKept program T log unit s
  clock : ∀ log program (s : State) atMs, carried log program s → carried log program { s with logicalTimeMs := atMs }
  enter : ∀ program log (before : State) unit, carried log program before →
    WellFormed program { before with issuing := unit, issueNext := 0 } ∧
      BeginsKept program before.transitions log unit { before with issuing := unit, issueNext := 0 } →
    side before.transitions log unit program { before with issuing := unit, issueNext := 0 }
  conclude : ∀ (ctx : Ctx) log unit cause element owner (before mid after : State),
    side before.transitions log unit ctx.program mid →
    Laws.Step.Framed WellFormed { before with issuing := unit, issueNext := 0 } ctx.program mid →
    before.transitions.contains unit = false → (IdsUnique ctx.program → LogOrder ctx.program log before.transitions) →
    WellFormed ctx.program after → Step.conclude hooks ctx unit cause element owner mid = .ok after →
    carried (log.record unit) ctx.program after

/-- `BeginsKept` beside `WellFormed` rides the walk carrying nothing more. -/
theorem ridesLog_self {hooks : Hooks}
    (contract : ∀ T log unit, Laws.Step.HookContract hooks fun program s =>
      WellFormed program s ∧ BeginsKept program T log unit s)
    (phases : ∀ T log unit, Laws.Step.BodyPhases fun program s => WellFormed program s ∧ BeginsKept program T log unit s)
    (pipeline : ∀ T log unit, Laws.Step.PipelinePhases fun program s =>
      WellFormed program s ∧ BeginsKept program T log unit s) :
    RidesLog hooks (fun _ _ _ => True) fun T log unit program s => WellFormed program s ∧ BeginsKept program T log unit s where
  contract := contract
  phases := phases
  pipeline := pipeline
  kept _ _ _ _ _ held := held
  clock _ _ _ _ _ := trivial
  enter _ _ _ _ _ entered := entered
  conclude _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ := trivial

section Walk

variable {hooks : Hooks}
  (contract : ∀ T log unit, Laws.Step.HookContract hooks fun program s =>
    WellFormed program s ∧ BeginsKept program T log unit s)
  (phases : ∀ T log unit, Laws.Step.BodyPhases fun program s => WellFormed program s ∧ BeginsKept program T log unit s)
  (pipeline : ∀ T log unit, Laws.Step.PipelinePhases fun program s =>
    WellFormed program s ∧ BeginsKept program T log unit s)
  (wellFormed : Laws.Step.HookContract hooks WellFormed) (formed : Laws.Step.ClosurePhases WellFormed)
  (formedPipeline : Laws.Step.PipelinePhases WellFormed) (framing : Laws.Step.Framing hooks WellFormed)
  (facts : Laws.Step.StateFacts)
  {carried : RunLog → Program → State → Prop}
  {side : TreeMap UnitKey Transition compare → RunLog → UnitKey → Program → State → Prop}
  (carries : RidesLog hooks carried side)
  {aux : State → Program → State → Prop} (relative : Laws.Step.StartKeeps hooks aux)
  (auxBased : ∀ start program s, aux start program s → WellFormed program s)
  (entry : ∀ program s, WellFormed program s → (∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) →
    aux s program s)
  (queued : ∀ (state : State) unit grouped, Laws.Step.Unbatched (state.queueBatch unit grouped))

include contract formed in
/-- A micro-step's conclusion from a well-formed state that keeps `BeginsKept` of the closure's transitions `T`, which
do not hold its unit, journals its draft under its unit, which the run log records last: the state it commits keeps
`Logged`'s order. -/
theorem logged_conclude {ctx : Ctx} {log : RunLog} {unit : UnitKey} {cause : Cause}
    {element : Option ElementId} {owner : ScopeOccurrenceId} {mid after : State}
    (holds : WellFormed ctx.program mid ∧ BeginsKept ctx.program T log unit mid) (fresh : T.contains unit = false)
    (order : IdsUnique ctx.program → LogOrder ctx.program log T)
    (ran : Step.conclude hooks ctx unit cause element owner mid = .ok after) :
    IdsUnique ctx.program → Unlooped ctx.program after.transitions (log.record unit) after ∧
      LogOrder ctx.program (log.record unit) after.transitions := fun apart => by
  obtain ⟨notified, written, grouped, rest⟩ := Laws.Step.conclude_ok ran
  obtain ⟨notifying, writing, _, made⟩ := rest
  subst made
  obtain ⟨before, issuing, frame⟩ := holds.2 apart
  have unrun : mid.transitions.contains unit = false := by rw [before.transitions]; exact fresh
  let transition : Transition := ⟨cause, element, owner, mid.draft.started, mid.draft.ended, mid.draft.ready⟩
  have journalled := And.intro
    (formed.journal _ mid unit transition holds.1 (Laws.State.getElem?_of_contains unrun) (by simp [transition])
      (by simp [transition]))
    (holds.2.journal transition)
  have kept := (contract (mid.transitions.insert unit transition) log unit).written _ _ _ _
    (Laws.Step.foldlM_keeps
      (inv := fun program s => WellFormed program s ∧
        BeginsKept program (mid.transitions.insert unit transition) log unit s)
      (fun _ _ _ kept ran => (contract _ _ _).cancelled _ _ _ _ kept ran) _ _ _ journalled notifying) writing
  obtain ⟨settled, writtenIssuing, writtenFrame⟩ := kept.2 apart
  have bounded := (order apart).bounded
  have units : ∀ fact ∈ blockFacts (mid.transitions.insert unit transition) ++ written.draft.started, ∀ u i,
      fact.occurrence.activation = .fresh u i → u = unit ∨ u ∈ log.positions := fun fact inside u i pending =>
    starts_logged kept.1 writtenIssuing (by rw [settled.transitions]; exact writtenFrame)
      (starts_mem (by rw [settled.transitions]; exact List.mem_append.mp inside)) pending
  obtain ⟨queued, -, -⟩ := (kept.2.queueBatch unit grouped) apart
  have drafted : (written.queueBatch unit grouped).draft = written.draft := by
    rw [Laws.State.queueBatch_grouped_eq]
  -- The issuer moves to the seed, which `Unlooped` does not read; the run log records the unit.
  change Unlooped ctx.program (written.queueBatch unit grouped).transitions (log.record unit) _ ∧
    LogOrder ctx.program (log.record unit) (written.queueBatch unit grouped).transitions
  rw [queued.transitions]
  refine ⟨⟨queued.unbegun, queued.occurs, queued.transitions, queued.pending, fun element loop looped => ?_,
    fun element loop looped => ?_⟩, ?_⟩
  · exact (queued.ordered element loop looped).record frame.running bounded fun fact inside =>
      units fact (List.mem_append_right _ (by rw [← drafted]; exact inside))
  · exact (queued.above element loop looped).record frame.running bounded fun fact inside => units fact (by
      rcases List.mem_append.mp inside with old | new
      · exact List.mem_append_left _ old
      · exact List.mem_append_right _ (by rw [← drafted]; exact new))
  · rw [before.transitions]
    exact (order apart).record before holds.1 issuing frame (by simp [transition])

/-- Entering a micro-step of a unit the closure has not run keeps `BeginsKept` of the closure's transitions under its
run log: the unit has not run, and every transition's unit has (`LogOrder`). -/
theorem logged_enter {program : Program} {before : State} (holds : Logged program log before)
    (unrun : before.transitions.contains unit = false) :
    BeginsKept program before.transitions log unit { before with issuing := unit, issueNext := 0 } := fun apart =>
  have kept := holds.2 apart
  ⟨⟨kept.1.unbegun, kept.1.occurs, kept.1.transitions, kept.1.pending, kept.1.ordered, kept.1.above⟩, rfl,
    { running := fun logged => by
        have inside := kept.2.ran unit logged
        rw [Std.ExtTreeMap.mem_iff_contains, unrun] at inside
        cases inside
      logged := fun other inside => .inr (kept.2.logged other (Std.ExtTreeMap.mem_iff_contains.mpr inside)) }⟩

include contract wellFormed formed formedPipeline framing facts carries in
/-- A micro-step whose body every hook contract and body phases keep keeps `Logged` and `carried` and leaves the closure
`Between` micro-steps, the run log gaining its unit: its body sees the transitions as a snapshot, which
`Laws.Step.BodyPhases` keep, and its conclusion journals the draft under the unit. -/
theorem logged_micro {ctx : Ctx} {log : RunLog} {unit : UnitKey} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} {before after : State} (holds : Logged ctx.program log before)
    (held : carried log ctx.program before) (between : Laws.Step.Between before)
    (byBody : ∀ (keep : Program → State → Prop), Laws.Step.HookContract hooks keep → Laws.Step.BodyPhases keep →
      keep ctx.program { before with issuing := unit, issueNext := 0 } →
      ∀ next, body { before with issuing := unit, issueNext := 0 } = .ok next → keep ctx.program next)
    (ran : microStep hooks ctx unit cause element owner body before = .ok after) :
    (Logged ctx.program (log.record unit) after ∧ carried (log.record unit) ctx.program after) ∧
      Laws.Step.Between after := by
  obtain ⟨unrun, unseeded, -⟩ := Laws.Step.microStep_ok ran
  have keeps := Laws.Step.complete_keeps (carries.contract before.transitions log unit) (carries.phases _ _ _)
    (carries.pipeline _ _ _) facts
  have moved := Laws.Step.microStep_carries wellFormed formed
    (Laws.Step.complete_keeps wellFormed formed.toBodyPhases formedPipeline facts) framing (fun _ _ held => held) holds.1
    between byBody ran
  have entered : WellFormed ctx.program { before with issuing := unit, issueNext := 0 } ∧
      BeginsKept ctx.program before.transitions log unit { before with issuing := unit, issueNext := 0 } :=
    ⟨formed.enterUnit _ _ _ holds.1 unrun unseeded between.untabled, logged_enter holds unrun⟩
  have framed : Laws.Step.Framed WellFormed { before with issuing := unit, issueNext := 0 } ctx.program
      { before with issuing := unit, issueNext := 0 } := ⟨entered.1, rfl, rfl⟩
  obtain ⟨mid, ⟨kept, framedMid⟩, concluded⟩ := Laws.Step.microStep_concludes (carries.phases _ _ _) keeps
    (framing.body _) (framing.pipeline _) (fun next made =>
      ⟨byBody _ (carries.contract _ _ _) (carries.phases _ _ _) (carries.enter _ _ _ _ held entered) next made,
        byBody _ (framing.contract _) (framing.body _) framed next made⟩) ran
  have order := fun apart => (holds.2 apart).2
  exact ⟨⟨⟨moved.1, logged_conclude contract formed (carries.kept _ _ _ _ _ kept) unrun order concluded⟩,
    carries.conclude _ _ _ _ _ _ _ _ _ kept framedMid unrun order moved.1 concluded⟩, moved.2⟩

include contract wellFormed formed formedPipeline framing facts carries in
/-- A closure micro-step keeps `Logged` and `carried` and leaves the closure `Between` micro-steps, the run log gaining
the unit it ran. -/
theorem logged_step {ctx : Ctx} {log : RunLog} {unit : UnitKey} {before after : State}
    (holds : Logged ctx.program log before) (held : carried log ctx.program before) (between : Laws.Step.Between before)
    (step : Laws.Step.ClosureStep hooks ctx log unit before after) :
    (Logged ctx.program (log.record unit) after ∧ carried (log.record unit) ctx.program after) ∧
      Laws.Step.Between after := by
  obtain ⟨unrun, unseeded⟩ := Laws.Step.closureStep_fresh step
  have keeps := Laws.Step.complete_keeps (carries.contract before.transitions log unit) (carries.phases _ _ _)
    (carries.pipeline _ _ _) facts
  have moved := Laws.Step.closureStep_carries wellFormed formed facts
    (Laws.Step.complete_keeps wellFormed formed.toBodyPhases formedPipeline facts) framing (fun _ _ held => held) holds.1
    between step
  have entered : WellFormed ctx.program { before with issuing := unit, issueNext := 0 } ∧
      BeginsKept ctx.program before.transitions log unit { before with issuing := unit, issueNext := 0 } :=
    ⟨formed.enterUnit _ _ _ holds.1 unrun unseeded between.untabled, logged_enter holds unrun⟩
  have framed : Laws.Step.Framed WellFormed { before with issuing := unit, issueNext := 0 } ctx.program
      { before with issuing := unit, issueNext := 0 } := ⟨entered.1, rfl, rfl⟩
  obtain ⟨mid, _, _, rest⟩ := Laws.Step.closureStep_concludes (carries.contract _ _ _) (carries.phases _ _ _) keeps
    (framing.contract _) (framing.body _) (framing.pipeline _) facts (carries.enter _ _ _ _ held entered) framed step
  obtain ⟨_, ⟨kept, framedMid⟩, concluded⟩ := rest
  have order := fun apart => (holds.2 apart).2
  exact ⟨⟨⟨moved.1, logged_conclude (ctx := unitCtx ctx log) contract formed (carries.kept _ _ _ _ _ kept) unrun
    order concluded⟩, carries.conclude (unitCtx ctx log) _ _ _ _ _ _ _ _ kept framedMid unrun order moved.1
      concluded⟩, moved.2⟩

include contract wellFormed formed formedPipeline framing facts carries in
/-- An input's first micro-step and the closure after it settle in a state that keeps `Logged` and `carried` under its
run log, from a well-formed start `Between` micro-steps that keeps `BeginsKept` of no transitions and `carried` under
the empty log. -/
theorem logged_settles {ctx : Ctx} {unit issuer : UnitKey} {cause : Cause} {element : Option ElementId} {body : State → Outcome}
    {start moved : State} {settled : State × RunLog}
    (started : WellFormed ctx.program start ∧ BeginsKept ctx.program ∅ {} issuer start)
    (held : carried {} ctx.program start) (between : Laws.Step.Between start)
    (byBody : ∀ (keep : Program → State → Prop), Laws.Step.HookContract hooks keep → Laws.Step.BodyPhases keep →
      keep ctx.program { start with issuing := unit, issueNext := 0 } →
      ∀ next, body { start with issuing := unit, issueNext := 0 } = .ok next → keep ctx.program next)
    (stepped : microStep hooks ctx unit cause element State.root body start = .ok moved)
    (settling : settle hooks ctx closureBound closureWorkBound (RunLog.record {} unit) moved =
      .ok settled) :
    Logged ctx.program settled.2 settled.1 ∧ carried settled.2 ctx.program settled.1 := by
  have logged : Logged ctx.program {} start := ⟨started.1, fun apart => by
    have held := (started.2 apart).1
    rw [held.transitions]
    exact ⟨held, LogOrder.empty _⟩⟩
  have movedLogged := logged_micro contract wellFormed formed formedPipeline framing facts carries logged held between
    byBody stepped
  exact (Laws.Step.settle_induction_log
    (fun log s => (Logged ctx.program log s ∧ carried log ctx.program s) ∧ Laws.Step.Between s)
    (fun _ _ _ _ holds step => logged_step contract wellFormed formed formedPipeline framing facts carries holds.1.1
      holds.1.2 holds.2 step)
    _ _ _ _ _ movedLogged settling).1

include contract phases wellFormed formed formedPipeline framing facts carries relative auxBased entry queued in
/-- A committed input on a running instance settles in a state that keeps `Logged` and `carried` under its run log,
`aux` of the state its closure began from and no running batch, which `orderJournal` commits, from a well-formed
committed before-state whose reservations, made or still to be made, name no looping element, and whose input's start
keeps `carried` under the empty log. -/
theorem logged_running {program : Program} {before after : State} {input : Input}
    (formedBefore : WellFormed program before) (committed : Laws.State.Committed before)
    (unbegun : IdsUnique program → UnbegunUnlooped program before)
    (occurs : IdsUnique program → ∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop)
    (held : carried {} program
      { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := before.nextCompletion })
    (ran : Step.step hooks program (some before) input = .ok after) :
    ∃ (start : State) (settled : State × RunLog),
      (Logged program settled.2 settled.1 ∧ carried settled.2 program settled.1) ∧ aux start program settled.1 ∧
      Laws.Step.Unbatched settled.1 ∧ orderJournal program.options.branchSchedule start (.ok settled) = .ok after := by
  rcases Laws.Step.step_ok ran with ⟨_, _, fresh, _⟩ | ⟨_, _, runs, ran⟩
  · simp at fresh
  obtain ⟨_, start, moved, rest⟩ := Laws.Step.onRunning_ok ran
  obtain ⟨settled, present, _, rest⟩ := rest
  obtain ⟨clocked, stepped, settling, made⟩ := rest
  cases Option.some.inj present
  have entered : WellFormed (Laws.Step.inputCtx hooks program input).program
        { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := before.nextCompletion } ∧
      BeginsKept (Laws.Step.inputCtx hooks program input).program ∅ {} before.issuing
        { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := before.nextCompletion } := by
    rw [Laws.Step.inputCtx_program]
    exact ⟨Laws.State.reset_wellFormed formedBefore committed, beginsKept_reset unbegun occurs⟩
  have clockedHeld : carried {} (Laws.Step.inputCtx hooks program input).program start := by
    rw [Laws.Step.inputCtx_program]
    rcases Laws.Step.advanceClock_ok clocked with same | ⟨_, same⟩ <;> subst same
    · exact held
    · exact carries.clock _ _ _ _ held
  have between := Laws.Step.advanceClock_between (Laws.Step.reset_between committed) clocked
  have keys : ∀ occurrence ∈ start.occurrences, occurrence.id.scope = occurrence.scope := by
    rcases Laws.Step.advanceClock_ok clocked with same | ⟨_, same⟩ <;> subst same <;> exact committed.keyed
  have started := Laws.Step.advanceClock_keeps (phases ∅ {} _) entered clocked
  have done := logged_settles contract wellFormed formed formedPipeline framing facts carries started clockedHeld between
    (fun _ keeps keepPhases kept _ transitioned => Laws.Step.transition_keeps keeps keepPhases runs kept transitioned)
    stepped settling
  have related := Laws.Step.input_carries (relative.contract start) (relative.phases start) facts
    (relative.pipeline start) framing (auxBased start) runs (entry _ _ started.1 keys) between stepped settling
  rw [Laws.Step.inputCtx_program] at done related made
  exact ⟨start, settled, done, related.1,
    Laws.Step.settle_unbatched queued (Laws.Step.microStep_unbatched queued stepped) settling, made⟩

include contract phases wellFormed formed formedPipeline framing facts carries relative auxBased entry queued in
/-- A committed start settles in a state that keeps `Logged` and `carried` under its run log, `aux` of the state its
closure began from and no running batch, which `orderJournal` commits, when a fresh instance with its root's
Event Sub-Process starts queued for arming keeps `carried` under the empty log. -/
theorem logged_start
    (initial : ∀ program instanceId variables businessKey,
      WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)))
    (fresh : ∀ instanceId variables businessKey,
      Laws.Step.Between (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch
        (.ofRoot .seed)) ∧
      ∀ occurrence ∈ (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch
        (.ofRoot .seed)).occurrences, occurrence.id.scope = occurrence.scope)
    (heldInitial : ∀ program instanceId variables businessKey, carried {} program
      (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch (.ofRoot .seed)))
    {program : Program} {input : Input} {after : State} (ran : Step.step hooks program none input = .ok after) :
    ∃ (start : State) (settled : State × RunLog),
      (Logged program settled.2 settled.1 ∧ carried settled.2 program settled.1) ∧ aux start program settled.1 ∧
      Laws.Step.Unbatched settled.1 ∧ orderJournal program.options.branchSchedule start (.ok settled) = .ok after := by
  rcases Laws.Step.step_ok ran with ⟨payload, same, _, started⟩ | ⟨_, _, _, ran⟩
  · subst same
    obtain ⟨start, moved, settled, rest⟩ := Laws.Step.start_body facts started
    obtain ⟨clocked, _, _, rest⟩ := rest
    obtain ⟨byBody, stepped, settling, made⟩ := rest
    have seeded : WellFormed (Laws.Step.inputCtx hooks program (.start payload)).program
          (((State.initial payload.instanceId payload.variables payload.businessKey).signal
            (.armScope State.root)).queueBatch (.ofRoot .seed)) ∧
        BeginsKept (Laws.Step.inputCtx hooks program (.start payload)).program ∅ {}
          (State.initial payload.instanceId payload.variables payload.businessKey).issuing
          (((State.initial payload.instanceId payload.variables payload.businessKey).signal
            (.armScope State.root)).queueBatch (.ofRoot .seed)) := by
      rw [Laws.Step.inputCtx_program]
      exact ⟨formed.queueBatch _ _ _ _ (Laws.Step.groupsRoots_none _) (initial _ _ _ _),
        (beginsKept_initial _ _ _ _).queueBatch _⟩
    have clockedHeld : carried {} (Laws.Step.inputCtx hooks program (.start payload)).program start := by
      rw [Laws.Step.inputCtx_program]
      rcases Laws.Step.advanceClock_ok clocked with same | ⟨_, same⟩ <;> subst same
      · exact heldInitial _ _ _ _
      · exact carries.clock _ _ _ _ (heldInitial _ _ _ _)
    have between := Laws.Step.advanceClock_between (fresh _ _ _).1 clocked
    have keys : ∀ occurrence ∈ start.occurrences, occurrence.id.scope = occurrence.scope := by
      rcases Laws.Step.advanceClock_ok clocked with same | ⟨_, same⟩ <;> subst same <;> exact (fresh _ _ _).2
    have begun := Laws.Step.advanceClock_keeps (phases ∅ {} _) seeded clocked
    have done := logged_settles contract wellFormed formed formedPipeline framing facts carries begun clockedHeld between
      byBody stepped settling
    have movedAux := Laws.Step.microStep_carries (relative.contract start) (relative.phases start)
      (relative.pipeline start) framing (auxBased start) (entry _ _ begun.1 keys) between byBody stepped
    have related := Laws.Step.settle_carries (relative.contract start) (relative.phases start) facts
      (relative.pipeline start) framing (auxBased start) _ _ _ _ _ movedAux.1 movedAux.2 settling
    rw [Laws.Step.inputCtx_program] at done related made
    exact ⟨start, settled, done, related.1,
      Laws.Step.settle_unbatched queued (Laws.Step.microStep_unbatched queued stepped) settling, made⟩
  · obtain ⟨_, _, rest⟩ := Laws.Step.onRunning_ok ran
    obtain ⟨_, _, present, _⟩ := rest
    simp at present

include contract phases pipeline wellFormed formed formedPipeline framing facts relative auxBased entry queued in
/-- Hooks that keep `BeginsKept` beside `WellFormed` keep the reservations of looping elements unmade: the commit keeps
every unbegun occurrence's element and flag (`orderJournal_unbegunUnlooped`). -/
theorem unbegunKept_of
    (initial : ∀ program instanceId variables businessKey,
      WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)))
    (fresh : ∀ instanceId variables businessKey,
      Laws.Step.Between (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch
        (.ofRoot .seed)) ∧
      ∀ occurrence ∈ (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch
        (.ofRoot .seed)).occurrences, occurrence.id.scope = occurrence.scope) :
    UnbegunKept hooks where
  step _ _ _ _ apart formedBefore committed unbegun occurs ran := by
    obtain ⟨_, _, ⟨kept, -⟩, more⟩ := logged_running contract phases wellFormed formed formedPipeline framing facts
      (ridesLog_self contract phases pipeline) relative auxBased entry queued formedBefore committed (fun _ => unbegun)
      (fun _ => occurs) trivial ran
    obtain ⟨-, -, made⟩ := more
    exact orderJournal_unbegunUnlooped ((kept.2 apart).1).unbegun made
  start _ _ _ apart ran := by
    obtain ⟨_, _, ⟨kept, -⟩, more⟩ := logged_start contract phases wellFormed formed formedPipeline framing facts
      (ridesLog_self contract phases pipeline) relative auxBased entry queued initial fresh (fun _ _ _ _ => trivial) ran
    obtain ⟨-, -, made⟩ := more
    exact orderJournal_unbegunUnlooped ((kept.2 apart).1).unbegun made

include contract phases pipeline wellFormed formed formedPipeline framing facts relative auxBased entry queued in
/-- Under hooks that keep `BeginsKept` beside `WellFormed`, and under `declarationDepthFirst`, a committed input's start
facts of a looping element under the element role carry increasing activations in journal order, from a well-formed
committed before-state whose reservations, made or still to be made, name no looping element: the settled closure lists
the transitions in the order their units ran (`byRun`), which `LogOrder` orders, and the commit numbers them in
that order (`orderJournal_madeInOrder`). -/
theorem beginsInOrder_of {program : Program} {before after : State} {input : Input} {element : ElementId}
    {loop : MultiInstance} (processInstance : InstanceName) (apart : IdsUnique program) (formedBefore : WellFormed program before)
    (committed : Laws.State.Committed before) (unbegun : UnbegunUnlooped program before)
    (occurs : ∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop)
    (ran : Step.step hooks program (some before) input = .ok after) (looped : LoopOf program element loop)
    (depthFirst : program.options.branchSchedule = .declarationDepthFirst)
    (counted : ∀ start program s, aux start program s → Laws.State.CountersFrom start s) :
    BeginsInOrder (after.journal.flatMap (·.started)) processInstance element := by
  obtain ⟨_, _, ⟨kept, -⟩, more⟩ := logged_running contract phases wellFormed formed formedPipeline framing
    facts (ridesLog_self contract phases pipeline) relative auxBased entry queued formedBefore committed (fun _ => unbegun)
    (fun _ => occurs) trivial ran
  obtain ⟨related, -, made⟩ := more
  rw [depthFirst] at made
  exact orderJournal_madeInOrder kept.1 (counted _ _ _ related) (((kept.2 apart).2).byRun looped) made

end Walk

end Kernel.Proofs.MultiInstance
