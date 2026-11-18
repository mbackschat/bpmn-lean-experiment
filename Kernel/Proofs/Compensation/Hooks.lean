module

public import Kernel.Laws.Compensation
public import Kernel.Proofs.Compensation
public import Kernel.Laws.Propagation
public import Kernel.Proofs.Compensation.Lane

/-! # Proofs: what the compensation hooks keep of the lane relation

Each compensation hook's result keeps the lane relation `Formed` beside `Laws.State.WellFormed` (`completed_formed` to
`handlerEnded_formed`, composed into `CompensationKeeps` by `Kernel.Proofs.Compensation.Registered`): each hook is proved
from what `Laws.Compensation` says it does, and the operations a compensation runs, beginning, advancing and releasing
runs, by one fuel induction (`runs_form`), which carries what the lane relation needs across the states inside one hook
that keep none of it, a run advanced while its handlers begin (`Kernel.Proofs.Compensation.Lane`). Every compensation
`Step` performs is a `FreshCall` (`compensationsFresh`). §13.5.5's dependency is read over the kernel's footprints
(`footprintReads`, `footprintWrites`, root decision D3, 2026-11-15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Counted Untriggered)
open Kernel.Laws.Compensation (ClaimsApart Advances Ready Keyed Holds FirstOf BeginsEach claimed)

/-! ## §13.5.5's data dependency over the footprints -/

/-- Every name the footprints of the program's elements read or write (`Compensation.data`), after one that no
footprint needs to name: what a footprint of every name (`NameSet.all`) lists. -/
def footprintNames (ctx : Ctx) : List String :=
  "" :: ctx.program.elements.flatMap fun element =>
    (Feature.Compensation.data ctx element.header.id).reads.names ++
      (Feature.Compensation.data ctx element.header.id).writes.names

/-- The names a run of `subject` reads, every name for a footprint that reads every name (`Laws.IL.listed`). -/
def footprintReads (ctx : Ctx) (subject : ElementId) : List String :=
  Laws.IL.listed (footprintNames ctx) (Feature.Compensation.data ctx subject).reads

/-- The names a run of `subject` writes, every name for a footprint that writes every name. -/
def footprintWrites (ctx : Ctx) (subject : ElementId) : List String :=
  Laws.IL.listed (footprintNames ctx) (Feature.Compensation.data ctx subject).writes

/-- A subject's footprint names only names `footprintNames` holds. -/
theorem footprint_listed (ctx : Ctx) (subject : ElementId) :
    (∀ name ∈ (Feature.Compensation.data ctx subject).reads.names, name ∈ footprintNames ctx) ∧
      ∀ name ∈ (Feature.Compensation.data ctx subject).writes.names, name ∈ footprintNames ctx := by
  cases found : ctx.program.element? subject with
  | none => rw [Laws.Compensation.data_missing found]; exact ⟨nofun, nofun⟩
  | some element =>
    have member := Laws.IL.element?_mem found
    have named := Laws.IL.element?_header found
    refine ⟨fun name inside => ?_, fun name inside => ?_⟩ <;>
      exact List.mem_cons_of_mem _ (List.mem_flatMap.mpr ⟨element, member, by simp [named, inside]⟩)

/-- The kernel's dependency is `Depends` over the footprints' names. -/
theorem precedes_depends (ctx : Ctx) (record other : Compensable) :
    Feature.Compensation.precedes ctx record other = true ↔
      Depends ctx.program (footprintReads ctx) (footprintWrites ctx) record other := by
  rw [Laws.Compensation.precedes_spec, Laws.IL.NameSet.meets_iff_listed (sentinel := "") (by simp [footprintNames])
    (footprint_listed ctx other.subject).1 (footprint_listed ctx record.subject).2]
  rfl

/-- So under any context of a program the kernel's dependency is the one the lane relation of an instance of the
program is settled by (`DependsIn`). -/
theorem precedes_dependsIn (hooks : Hooks) (ctx : Ctx) (record other : Compensable) :
    Feature.Compensation.precedes ctx record other = true ↔
      DependsIn hooks footprintReads footprintWrites ctx.program record other := by
  have same : ctx.program = (Step.context hooks ctx.program).program := (Laws.Step.context_program hooks _).symm
  rw [Laws.Compensation.precedes_congr same, precedes_depends]
  unfold DependsIn
  rw [← same]

/-- The run of a key keyed apart from the others is the only one a search by that key keeps. -/
theorem filter_keyed {runs : List CompensationRun} (keyed : (runs.map fun run => (run.scope, run.trigger)).Nodup)
    {run : CompensationRun} (member : run ∈ runs) {scope : ScopeOccurrenceId} {trigger : OccurrenceRef}
    (own : Keyed scope trigger run) : runs.filter (Feature.Compensation.isRun scope trigger ·) = [run] := by
  induction runs with
  | nil => cases member
  | cons first rest ih =>
    simp only [List.map_cons, List.nodup_cons, List.mem_map] at keyed
    have test : ∀ other, Feature.Compensation.isRun scope trigger other = true ↔
        (other.scope, other.trigger) = (run.scope, run.trigger) := fun other => by
      rw [Laws.Compensation.isRun_iff, own.1, own.2]; simp [Keyed]
    rcases List.mem_cons.mp member with rfl | later
    · have none : rest.filter (Feature.Compensation.isRun scope trigger ·) = [] :=
        List.filter_eq_nil_iff.mpr fun other inside tested => keyed.1 ⟨other, inside, (test other).mp tested⟩
      have found : Feature.Compensation.isRun scope trigger run = true := (test run).mpr rfl
      simp [found, none]
    · have differs : Feature.Compensation.isRun scope trigger first = false := by
        cases tested : Feature.Compensation.isRun scope trigger first
        · rfl
        · exact absurd ⟨run, later, ((test first).mp tested).symm⟩ keyed.1
      simp [differs, ih keyed.2 later]

/-- So the runs of a state keyed apart are, up to order, the others and that run. -/
theorem perm_keyed {runs : List CompensationRun} (keyed : (runs.map fun run => (run.scope, run.trigger)).Nodup)
    {run : CompensationRun} (member : run ∈ runs) {scope : ScopeOccurrenceId} {trigger : OccurrenceRef}
    (own : Keyed scope trigger run) :
    runs.Perm (runs.filter (!Feature.Compensation.isRun scope trigger ·) ++ [run]) := by
  have split := List.filter_append_perm (Feature.Compensation.isRun scope trigger ·) runs
  rw [filter_keyed keyed member own] at split
  exact split.symm.trans List.perm_append_comm

/-- The kernel's dependency and the lane relation's agree on which pending handler may start. -/
theorem ready_iff {ctx : Ctx} {precedes : Compensable → Compensable → Prop}
    (orders : ∀ record other, Feature.Compensation.precedes ctx record other = true ↔ precedes record other)
    (run : CompensationRun) (record : Compensable) :
    Ready (Feature.Compensation.precedes ctx · · = true) run record ↔ Ready precedes run record := by
  simp only [Ready, orders]

/-! ## The fuel induction -/

/-- What an advance of the run `trigger` started in `scope` keeps from `s` to `t`: what a hook keeps (`Tame`, `Moves`),
no completion number more often, and every run it leaves either one of `s`'s of another key or one the lane relation
accepts; while no run holds `scope` as a running context, it keeps every run of another key. Each run of its key is
one advance of the first run of `s` of that key, every other run `Steps` from `s`, and while no run of the key resumes
a group or no run holds `scope`, it releases nothing: every record retained in a scope occurrence `s` had issued stays
as it was, and every run it leaves is of the key, one of `s`'s or freshly scoped. -/
structure AdvanceFormed (precedes : Compensable → Compensable → Prop) (scope : ScopeOccurrenceId) (trigger : OccurrenceRef)
    (s t : State) : Prop where
  tame : Tame t
  moves : Moves s t
  counted : ∀ n, (completions t.slots.compensation).count n ≤ (completions s.slots.compensation).count n
  runs : ∀ run ∈ t.slots.compensation.runs,
    (run ∈ s.slots.compensation.runs ∧ ¬ Keyed scope trigger run) ∨ Good precedes run
  kept : Laws.Compensation.Unheld s scope → ∀ run ∈ s.slots.compensation.runs, ¬ Keyed scope trigger run →
    run ∈ t.slots.compensation.runs
  keyedSteps : ∀ next ∈ t.slots.compensation.runs, Keyed scope trigger next →
    ∃ first ∈ s.slots.compensation.runs, Keyed scope trigger first ∧ ∃ started, Advances precedes first next started
  steps : ∀ next ∈ t.slots.compensation.runs, ¬ Keyed scope trigger next → Steps precedes s next
  direct : ((∀ run ∈ s.slots.compensation.runs, Keyed scope trigger run → resumesGroup run.resume = false) ∨
      Laws.Compensation.Unheld s scope) →
    (∀ record, record.scope.value < s.nextIssue →
      (record ∈ t.slots.compensation.retained ↔ record ∈ s.slots.compensation.retained)) ∧
    ∀ next ∈ t.slots.compensation.runs, Keyed scope trigger next ∨ next ∈ s.slots.compensation.runs ∨
      s.nextIssue ≤ next.scope.value

/-- What a release keeps from `s` to `t`, each run it leaves `Steps` from `s`. -/
structure ReleaseFormed (precedes : Compensable → Compensable → Prop) (s t : State) : Prop where
  tame : Tame t
  moves : Moves s t
  counted : ∀ n, (completions t.slots.compensation).count n ≤ (completions s.slots.compensation).count n
  runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ Good precedes run
  steps : ∀ next ∈ t.slots.compensation.runs, Steps precedes s next

/-- What beginning the handlers of `records` keeps from `s` to `t`, the children of the begun records added to what it
holds, each begun in a context issued meanwhile, keeping every record retained in a scope occurrence `s` had issued and
leaving no run but `s`'s and freshly scoped ones. -/
structure BegunFormed (precedes : Compensable → Compensable → Prop) (records : List Compensable)
    (contexts : List ScopeOccurrenceId) (s t : State) : Prop where
  tame : Tame t
  moves : Moves s t
  counted : ∀ n, (completions t.slots.compensation).count n ≤
    (completions s.slots.compensation).count n + (childrenCompletions records).count n
  runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ Good precedes run
  kept : ∀ run ∈ s.slots.compensation.runs, run ∈ t.slots.compensation.runs
  fresh : ∀ context ∈ contexts, s.nextIssue ≤ context.value ∧ context.value < t.nextIssue
  retained : ∀ record, record.scope.value < s.nextIssue →
    (record ∈ t.slots.compensation.retained ↔ record ∈ s.slots.compensation.retained)
  plain : ∀ next ∈ t.slots.compensation.runs, next ∈ s.slots.compensation.runs ∨ s.nextIssue ≤ next.scope.value

/-- What `Compensation.advance` keeps at `fuel`. -/
def AdvanceKept (precedes : Compensable → Compensable → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ scope trigger s t, Tame s → Feature.Compensation.advance ctx scope trigger s fuel = .ok t →
    AdvanceFormed precedes scope trigger s t

/-- What `Compensation.release` keeps at `fuel`. -/
def ReleaseKept (precedes : Compensable → Compensable → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ context s t, Tame s → Feature.Compensation.release ctx context s fuel = .ok t → ReleaseFormed precedes s t

/-- What `Compensation.beginHandler` keeps at `fuel`, for a trigger a run of the state holds. -/
def BeginKept (precedes : Compensable → Compensable → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ trigger scope s record t context, Tame s → (∃ run ∈ s.slots.compensation.runs, run.trigger = trigger) →
    Feature.Compensation.beginHandler ctx trigger scope s record fuel = .ok (t, context) →
      BegunFormed precedes [record] [context] s t

theorem store_stored (s : State) (compensation : Compensations) :
    Feature.Compensation.store s compensation = stored s compensation :=
  Laws.Compensation.store_eq s compensation

/-- `Compensation.beginHandler` keeps what `BeginKept` says, given what the advance of a group's nested run keeps. -/
theorem begin_formed {precedes : Compensable → Compensable → Prop} {ctx : Ctx} {less : Nat}
    (advances : AdvanceKept precedes ctx less) {trigger : OccurrenceRef} {scope : ScopeOccurrenceId} {s : State}
    {record : Compensable} {t : State} {context : ScopeOccurrenceId} (tame : Tame s)
    (source : ∃ run ∈ s.slots.compensation.runs, run.trigger = trigger)
    (ran : Feature.Compensation.beginHandler ctx trigger scope s record (less + 1) = .ok (t, context)) :
    BegunFormed precedes [record] [context] s t := by
  obtain ⟨less', entered, same, begun⟩ := Laws.Compensation.beginHandler_spec ran
  obtain rfl : less' = less := (Nat.succ.inj same).symm
  rcases begun with ⟨_, entering, nested⟩ | ⟨handler, element, _, rest⟩
  · obtain ⟨rfl, rfl⟩ : entered = _ ∧ context = _ :=
      ⟨(congrArg Prod.fst entering).symm, (congrArg Prod.snd entering).symm⟩
    obtain ⟨contextEq, slots, next, _⟩ := entered_eq s record.subject scope record.snapshot
    rw [store_stored] at nested
    have post := advances _ _ _ _ (tame_withRun tame record.subject scope record.snapshot rfl rfl
      fun outer context resumed => by cases resumed; rfl) nested
    have unheld : Laws.Compensation.Unheld (withRun (s.enterScope record.subject scope record.snapshot none).1
        { trigger, scope := (s.enterScope record.subject scope record.snapshot none).2,
          pending := Feature.Compensation.begunChildren record (s.enterScope record.subject scope record.snapshot none).2,
          leave := none, resume := some (.group scope (s.enterScope record.subject scope record.snapshot none).2) })
        (s.enterScope record.subject scope record.snapshot none).2 := fun run inside running => by
      simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
      rcases inside with old | rfl
      · have := tame.running run old _ running
        rw [contextEq] at this
        exact Nat.lt_irrefl _ this
      · cases running
    have direct := post.direct (.inr unheld)
    refine ⟨post.tame, (moves_withRun s record.subject scope record.snapshot (by simp [resumesGroup])
      (source.imp fun _ found => ⟨found.1, found.2⟩)).trans post.moves, fun n => ?_, fun run inside => ?_,
      fun run inside => ?_, fun context' inside => ?_, fun record' below => ?_, fun later inside => ?_⟩
    · have bound := post.counted n
      have fewer : (completionsIn (Feature.Compensation.begunChildren record
          (s.enterScope record.subject scope record.snapshot none).2)).count n ≤
            (record.children.map (·.completion)).count n :=
        Laws.Compensation.begunChildren_count record _ n
      simp only [withRun, stored, slots, count_completions, List.flatMap_append, List.count_append, List.flatMap_cons,
        List.flatMap_nil, List.append_nil, runCompletions, List.map_nil, childrenCompletions_one] at bound ⊢
      omega
    · rcases post.runs run inside with ⟨old, other⟩ | good
      · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at old
        rcases old with older | rfl
        · exact .inl older
        · exact absurd ⟨rfl, rfl⟩ other
      · exact .inr good
    · refine post.kept unheld run (by simp only [withRun, stored, slots]; exact List.mem_append_left _ inside)
        fun keyed => ?_
      have below := tame.runsIssued run inside
      rw [keyed.1, contextEq] at below
      exact Nat.lt_irrefl _ below
    · rw [List.mem_singleton.mp inside, contextEq]
      exact ⟨Nat.le_refl _, Nat.lt_of_lt_of_le (by simp only [withRun, stored, next]; exact Nat.lt_succ_self _)
        post.moves.issued⟩
    · have kept := direct.1 record' (by simp only [withRun, stored, next]; omega)
      simp only [withRun, stored, slots] at kept
      exact kept
    · rcases direct.2 later inside with keyed | old | fresh
      · exact .inr (Nat.le_of_eq (by rw [keyed.1, contextEq]))
      · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at old
        rcases old with older | rfl
        · exact .inl older
        · exact .inr (Nat.le_of_eq (by rw [contextEq]))
      · simp only [withRun, stored, next] at fresh
        exact .inr (by omega)
  · obtain ⟨_, _, entering, rfl⟩ := rest
    obtain ⟨rfl, rfl⟩ : entered = _ ∧ context = _ :=
      ⟨(congrArg Prod.fst entering).symm, (congrArg Prod.snd entering).symm⟩
    obtain ⟨contextEq, slots, next, _⟩ := entered_eq s handler scope record.snapshot
    rw [store_stored]
    have tameHandled := tame_withRetained tame handler scope record.snapshot
      (records := Feature.Compensation.begunChildren record (s.enterScope handler scope record.snapshot none).2)
      (Laws.Compensation.begunChildren_scope record _)
    refine ⟨tame_signal tameHandled _, (moves_withRetained s handler scope record.snapshot _).trans
      (moves_signal _ (Laws.Step.untriggered_begin _)), fun n => ?_, fun run inside => .inl ?_, fun run inside => ?_,
      fun context' inside => ?_, fun record' below => ?_, fun next inside => .inl ?_⟩
    · have fewer : (completionsIn (Feature.Compensation.begunChildren record
          (s.enterScope handler scope record.snapshot none).2)).count n ≤
            (record.children.map (·.completion)).count n :=
        Laws.Compensation.begunChildren_count record _ n
      rw [Laws.State.signal_eq]
      simp only [stored, slots, count_completions, completionsIn_append, List.count_append, childrenCompletions_one]
      omega
    · rw [Laws.State.signal_eq] at inside
      simpa only [withRetained, stored, slots] using inside
    · rw [Laws.State.signal_eq]
      simpa only [withRetained, stored, slots] using inside
    · rw [List.mem_singleton.mp inside, Laws.State.signal_eq, contextEq]
      simp only [stored, next]
      exact ⟨Nat.le_refl _, Nat.lt_succ_self _⟩
    · rw [Laws.State.signal_eq]
      simp only [stored, slots, List.mem_append]
      constructor
      · rintro (old | new)
        · exact old
        · rw [Laws.Compensation.begunChildren_scope record _ _ new, contextEq] at below
          exact absurd below (Nat.lt_irrefl _)
      · exact .inl
    · rw [Laws.State.signal_eq] at inside
      simpa only [withRetained, stored, slots] using inside

/-- Beginning the handlers of `started` one after another keeps what each begin keeps. -/
theorem chain_formed {precedes : Compensable → Compensable → Prop} {ctx : Ctx} {less : Nat}
    (begins : BeginKept precedes ctx less) {trigger : OccurrenceRef} {scope : ScopeOccurrenceId} {s t : State}
    {started : List (ScopeOccurrenceId × Compensable)}
    (chain : BeginsEach (fun current record => Feature.Compensation.beginHandler ctx trigger scope current record less)
      s started t) (tame : Tame s) (source : ∃ run ∈ s.slots.compensation.runs, run.trigger = trigger) :
    BegunFormed precedes (started.map (·.2)) (started.map (·.1)) s t := by
  induction chain with
  | nil s =>
    exact ⟨tame, .refl s, fun n => by simp [childrenCompletions], fun run inside => .inl inside, fun _ inside => inside,
      fun _ inside => (by cases inside), fun _ _ => Iff.rfl, fun _ inside => .inl inside⟩
  | cons began _ ih =>
    have first := begins _ _ _ _ _ _ tame source began
    obtain ⟨run, member, named⟩ := source
    have later := ih first.tame ⟨run, first.kept run member, named⟩
    refine ⟨later.tame, first.moves.trans later.moves, fun n => ?_, fun run inside => ?_,
      fun run inside => later.kept run (first.kept run inside), fun context inside => ?_,
      fun record below => (later.retained record (Nat.lt_of_lt_of_le below first.moves.issued)).trans
        (first.retained record below), fun next inside => ?_⟩
    · have one := first.counted n
      have two := later.counted n
      simp only [List.map_cons, childrenCompletions, List.flatMap_cons, List.flatMap_nil, List.append_nil,
        List.count_append] at one two ⊢
      omega
    · rcases later.runs run inside with old | good
      · exact first.runs run old
      · exact .inr good
    · simp only [List.map_cons, List.mem_cons] at inside
      rcases inside with rfl | rest
      · have bounds := first.fresh _ (List.mem_singleton_self _)
        exact ⟨bounds.1, Nat.lt_of_lt_of_le bounds.2 later.moves.issued⟩
      · have bounds := later.fresh _ rest
        exact ⟨Nat.le_trans first.moves.issued bounds.1, bounds.2⟩
    · rcases later.plain next inside with old | fresh
      · exact first.plain next old
      · exact .inr (Nat.le_trans first.moves.issued fresh)

/-- A run of another key is no `isRun` of that key. -/
theorem isRun_false {scope : ScopeOccurrenceId} {trigger : OccurrenceRef} {run : CompensationRun} :
    Feature.Compensation.isRun scope trigger run = false ↔ ¬ Keyed scope trigger run := by
  rw [← Laws.Compensation.isRun_iff]
  simp

/-- An advance whose result holds the runs of `s` but those of its key keeps what `AdvanceKept` says. -/
theorem advanceFormed_filtered {precedes : Compensable → Compensable → Prop} {scope : ScopeOccurrenceId}
    {trigger : OccurrenceRef} {s t : State} (tame : Tame t) (moves : Moves s t)
    (counted : ∀ n, (completions t.slots.compensation).count n ≤ (completions s.slots.compensation).count n)
    (runs : t.slots.compensation.runs = s.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·))
    (retained : t.slots.compensation.retained = s.slots.compensation.retained) :
    AdvanceFormed precedes scope trigger s t := by
  have left : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∧ ¬ Keyed scope trigger run :=
    fun run inside => by
      rw [runs, List.mem_filter, Bool.not_eq_true', isRun_false] at inside
      exact inside
  refine ⟨tame, moves, counted, fun run inside => .inl (left run inside), fun _ run inside other => ?_,
    fun next inside keyed => absurd keyed (left next inside).2,
    fun next inside _ => .inr ⟨next, (left next inside).1, rfl, rfl, .inl rfl⟩,
    fun _ => ⟨fun record _ => by rw [retained], fun next inside => .inr (.inl (left next inside).1)⟩⟩
  rw [runs, List.mem_filter, Bool.not_eq_true', isRun_false]
  exact ⟨inside, other⟩

/-- An advance under the kernel's dependency is one under the lane relation's. -/
theorem advances_of {ctx : Ctx} {precedes : Compensable → Compensable → Prop}
    (orders : ∀ record other, Feature.Compensation.precedes ctx record other = true ↔ precedes record other)
    {run after : CompensationRun} {started : List Compensable}
    (law : Advances (Feature.Compensation.precedes ctx · · = true) run after started) : Advances precedes run after started := by
  simpa only [Advances, ready_iff orders] using law

/-- `Compensation.advance` keeps what `AdvanceKept` says, given what the begins and releases it runs keep. -/
theorem advance_formed {precedes : Compensable → Compensable → Prop} {ctx : Ctx} {less : Nat}
    (orders : ∀ record other, Feature.Compensation.precedes ctx record other = true ↔ precedes record other)
    (begins : BeginKept precedes ctx less) (releases : ReleaseKept precedes ctx less) {scope : ScopeOccurrenceId}
    {trigger : OccurrenceRef} {s t : State} (tame : Tame s)
    (ran : Feature.Compensation.advance ctx scope trigger s (less + 1) = .ok t) :
    AdvanceFormed precedes scope trigger s t := by
  obtain ⟨less', run, same, rest⟩ := Laws.Compensation.advance_spec ran
  obtain rfl : less' = less := (Nat.succ.inj same).symm
  obtain ⟨first, ended | progressed⟩ := rest
  · obtain ⟨_, _, dropped, rest⟩ := ended
    obtain ⟨ended, droppedEq, endedEq, rest⟩ := rest
    obtain ⟨resumedNone, resumedComplete, resumedOccur, resumedGroup⟩ := rest
    rw [store_stored] at droppedEq
    have fewer := List.filter_sublist (p := (!Feature.Compensation.isRun scope trigger ·)) (l := s.slots.compensation.runs)
    have quieted : Quieted dropped ended := by
      rw [endedEq]
      cases run.leave with
      | none => exact .inl rfl
      | some occurrence => exact .inr ⟨_, Laws.Step.untriggered_cancel occurrence, rfl⟩
    subst droppedEq
    have tameEnded := quieted.tame (tame_fewer tame fewer)
    have movesEnded := (moves_fewer s fewer).trans quieted.moves
    have countedEnded : ∀ n, (completions ended.slots.compensation).count n ≤ (completions s.slots.compensation).count n :=
      fun n => by rw [quieted.slots]; exact counted_fewer s fewer n
    have runsEnded : ended.slots.compensation.runs =
        s.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) := by
      rw [quieted.slots]
      rfl
    have retainedEnded : ended.slots.compensation.retained = s.slots.compensation.retained := by
      rw [quieted.slots]
      rfl
    have left : ∀ other ∈ ended.slots.compensation.runs,
        other ∈ s.slots.compensation.runs ∧ ¬ Keyed scope trigger other := fun other inside => by
      rw [runsEnded, List.mem_filter, Bool.not_eq_true', isRun_false] at inside
      exact inside
    rcases resumed : run.resume with _ | ⟨occurrence, leave⟩ | ⟨element, at_, leave⟩ | ⟨outer, context⟩
    · rw [resumedNone resumed]
      exact advanceFormed_filtered tameEnded movesEnded countedEnded runsEnded retainedEnded
    · have last : Quieted ended t := .inr ⟨_, Laws.Step.untriggered_complete _ _ _ _, resumedComplete _ _ resumed⟩
      exact advanceFormed_filtered (last.tame tameEnded) (movesEnded.trans last.moves)
        (fun n => by rw [last.slots]; exact countedEnded n) (by rw [last.slots]; exact runsEnded)
        (by rw [last.slots]; exact retainedEnded)
    · have last : Quieted ended t := .inr ⟨_, Laws.Step.untriggered_occur _ _ _ _ _, resumedOccur _ _ _ resumed⟩
      exact advanceFormed_filtered (last.tame tameEnded) (movesEnded.trans last.moves)
        (fun n => by rw [last.slots]; exact countedEnded n) (by rw [last.slots]; exact runsEnded)
        (by rw [last.slots]; exact retainedEnded)
    · have released := resumedGroup outer context resumed
      have post := releases _ _ _ tameEnded released
      have never : ¬ Laws.Compensation.Unheld s scope := fun unheld => by
        have own : context = scope := (tame.grouped run first.mem outer context resumed).trans first.1.1
        obtain ⟨_, owner, _, rest⟩ := Laws.Compensation.release_spec released
        have found := rest.1
        have held := found.mem
        rw [runsEnded, List.mem_filter] at held
        exact absurd (own ▸ found.1) (unheld owner held.1)
      have below : scope.value < s.nextIssue := first.1.1 ▸ tame.runsIssued run first.mem
      refine ⟨post.tame, movesEnded.trans post.moves, fun n => Nat.le_trans (post.counted n) (countedEnded n),
        fun other inside => ?_, fun unheld => absurd unheld never, fun next inside keyed => ?_,
        fun next inside _ => Steps.mono (fun other member => (left other member).1) movesEnded.issued
          (post.steps next inside), fun unresumed => ?_⟩
      · rcases post.runs other inside with old | good
        · exact .inl (left other old)
        · exact .inr good
      · rcases post.steps next inside with fresh | ⟨other, member, rest⟩
        · have := Nat.lt_of_lt_of_le below (Nat.le_trans movesEnded.issued fresh)
          rw [keyed.1] at this
          exact absurd this (Nat.lt_irrefl _)
        · exact absurd ⟨rest.1.trans keyed.1, rest.2.1.trans keyed.2⟩ (left other member).2
      · rcases unresumed with unresumed | unheld
        · have ungrouped := unresumed run first.mem first.1
          rw [resumed] at ungrouped
          cases ungrouped
        · exact absurd unheld never
  · obtain ⟨later, started, begun, rest⟩ := progressed
    obtain ⟨advanced, perm, progress, rest⟩ := rest
    obtain ⟨chain, rfl⟩ := rest
    rw [store_stored]
    have post := chain_formed begins chain tame ⟨run, first.mem, first.1.2⟩
    have member := post.kept run first.mem
    have split := perm_keyed post.tame.keyed member first.1
    have resumed : ({ run with pending := later, running := run.running ++ started } : CompensationRun).resume =
      run.resume := rfl
    -- the advanced run in place of `run`
    have keysEq : ((begun.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) ++
        [{ run with pending := later, running := run.running ++ started }]).map fun (run : CompensationRun) => (run.scope, run.trigger)) =
        ((begun.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) ++ [run]).map
          fun (run : CompensationRun) => (run.scope, run.trigger)) := by simp
    refine ⟨⟨post.tame.retained, ?_, fun other inside => ?_, fun other inside context running => ?_, post.tame.scopes,
      fun other inside outer context resumed' => ?_⟩, ?_, fun n => ?_, fun other inside => ?_, fun _ other inside differs => ?_,
      fun other inside keyed' => ?_, fun other inside differs' => ?_,
      fun _ => ⟨fun record below => post.retained record below, fun other inside => ?_⟩⟩
    · unfold RunsKeyed
      dsimp only [stored]
      rw [keysEq]
      exact ((split.map _).nodup_iff).mp post.tame.keyed
    · rcases List.mem_append.mp inside with old | new
      · exact post.tame.runsIssued other (List.mem_filter.mp old).1
      · rw [List.mem_singleton.mp new]; exact post.tame.runsIssued run member
    · rcases List.mem_append.mp inside with old | new
      · exact post.tame.running other (List.mem_filter.mp old).1 context running
      · rw [List.mem_singleton.mp new] at running
        simp only [List.map_append, List.mem_append] at running
        rcases running with held | begun'
        · exact post.tame.running run member context held
        · exact (post.fresh context begun').2
    · rcases List.mem_append.mp inside with old | new
      · exact post.tame.grouped other (List.mem_filter.mp old).1 outer context resumed'
      · rw [List.mem_singleton.mp new] at resumed' ⊢
        exact post.tame.grouped run member outer context resumed'
    · refine post.moves.trans ⟨Nat.le_refl _, fun entry inside => .inl inside, rfl, rfl, ⟨[], by simp [stored], by simp⟩,
        fun key => ?_, fun other inside => ?_, fun _ inside => inside⟩
      · have same := ((split.filter (!resumesGroup ·.resume)).map (·.trigger)).count_eq key
        simp only [ungroupedTriggers, stored, List.filter_append, List.map_append, List.count_append] at same ⊢
        rw [same]
        simp only [List.filter_cons, List.filter_nil]
        split <;> simp
      · rcases List.mem_append.mp inside with old | new
        · exact ⟨other, (List.mem_filter.mp old).1, rfl⟩
        · exact ⟨run, member, by rw [List.mem_singleton.mp new]⟩
    · have bound := post.counted n
      have whole := (List.Perm.flatMap_right runCompletions split).count_eq n
      have pendingCount := count_completionsIn_perm n perm
      have startedCount := count_completionsIn n (started.map (·.2))
      simp only [count_completions, stored, List.flatMap_append, List.flatMap_cons, List.flatMap_nil, List.append_nil,
        List.count_append, runCompletions, completionsIn_append, List.map_append, List.map_map]
        at bound whole pendingCount startedCount ⊢
      simp only [Function.comp_def] at startedCount
      omega
    · rcases List.mem_append.mp inside with old | new
      · have kept := List.mem_filter.mp old
        rw [Bool.not_eq_true', isRun_false] at kept
        rcases post.runs other kept.1 with older | good
        · exact .inl ⟨older, kept.2⟩
        · exact .inr good
      · rw [List.mem_singleton.mp new]
        refine .inr ⟨.inr ?_, fun record ready => ?_⟩
        · rcases progress with begun' | held
          · simp [begun']
          · simp [held]
        · exact Laws.Compensation.Advances.settles advanced record ((ready_iff orders _ record).mpr ready)
    · refine List.mem_append_left _ (List.mem_filter.mpr ⟨post.kept other inside, ?_⟩)
      rw [Bool.not_eq_true', isRun_false]
      exact differs
    · rcases List.mem_append.mp inside with old | new
      · have kept := List.mem_filter.mp old
        rw [Bool.not_eq_true', isRun_false] at kept
        exact absurd keyed' kept.2
      · rw [List.mem_singleton.mp new]
        exact ⟨run, first.mem, first.1, started.map (·.2), advances_of orders advanced⟩
    · rcases List.mem_append.mp inside with old | new
      · rcases post.plain other (List.mem_filter.mp old).1 with older | fresh
        · exact .inr ⟨other, older, rfl, rfl, .inl rfl⟩
        · exact .inl fresh
      · rw [List.mem_singleton.mp new] at differs'
        exact absurd first.1 differs'
    · rcases List.mem_append.mp inside with old | new
      · rcases post.plain other (List.mem_filter.mp old).1 with older | fresh
        · exact .inr (.inl older)
        · exact .inr (.inr fresh)
      · rw [List.mem_singleton.mp new]
        exact .inl first.1

/-- `Compensation.release` keeps what `ReleaseKept` says, given what the advance it runs keeps. -/
theorem release_formed {precedes : Compensable → Compensable → Prop} {ctx : Ctx} {less : Nat}
    (advances : AdvanceKept precedes ctx less) {context : ScopeOccurrenceId} {s t : State} (tame : Tame s)
    (ran : Feature.Compensation.release ctx context s (less + 1) = .ok t) : ReleaseFormed precedes s t := by
  obtain ⟨less', owner, same, rest⟩ := Laws.Compensation.release_spec ran
  have advanced := rest.2
  obtain rfl : less' = less := (Nat.succ.inj same).symm
  rw [store_stored] at advanced
  have trims : Trims fun candidate => if Feature.Compensation.isRun owner.scope owner.trigger candidate then
      { candidate with running := candidate.running.filter (·.1 != context) } else candidate :=
    ⟨fun run => by split <;> rfl, fun run => by split <;> rfl, fun run => by split <;> rfl,
      fun run => by split <;> rfl, fun run => by split <;> first | exact List.filter_sublist | exact .refl _⟩
  have post := advances _ _ _ _ (tame_trimmed tame context trims) advanced
  have nextEq : (s.leaveScope context).nextIssue = s.nextIssue := (Laws.State.leaveScope_compensation s context).2.2.2.2
  refine ⟨post.tame, (moves_trimmed s context trims).trans post.moves,
    fun n => Nat.le_trans (post.counted n) (counted_trimmed s context trims n), fun run inside => ?_,
    fun next inside => ?_⟩
  rotate_left
  · by_cases keyed : Keyed owner.scope owner.trigger next
    · obtain ⟨first, member, rest⟩ := post.keyedSteps next inside keyed
      obtain ⟨firstKeyed, started, law⟩ := rest
      simp only [trimmed, stored, List.mem_map] at member
      obtain ⟨source, sourceIn, rfl⟩ := member
      exact .inr ⟨source, (left_runs s context).subset sourceIn,
        (trims.sameScope source).symm.trans (firstKeyed.1.trans keyed.1.symm),
        (trims.sameTrigger source).symm.trans (firstKeyed.2.trans keyed.2.symm),
        .inr ⟨_, started, law, trims.samePending source, trims.sameTrigger source⟩⟩
    · rcases post.steps next inside keyed with fresh | ⟨run, member, rest⟩
      · simp only [trimmed, stored, nextEq] at fresh
        exact .inl fresh
      · obtain ⟨sameScope, sameTrigger, which⟩ := rest
        simp only [trimmed, stored, List.mem_map] at member
        obtain ⟨source, sourceIn, rfl⟩ := member
        refine .inr ⟨source, (left_runs s context).subset sourceIn, (trims.sameScope source).symm.trans sameScope,
          (trims.sameTrigger source).symm.trans sameTrigger, ?_⟩
        rcases which with same | ⟨released, started, rest⟩
        · by_cases run : Feature.Compensation.isRun owner.scope owner.trigger source = true
          · have sourceKeyed := (Laws.Compensation.isRun_iff _ _ _).mp run
            exact absurd ⟨((congrArg (·.scope) same).trans (trims.sameScope source)).trans sourceKeyed.1,
              ((congrArg (·.trigger) same).trans (trims.sameTrigger source)).trans sourceKeyed.2⟩ keyed
          · rw [ite_eq_right run] at same
            exact .inl same
        · obtain ⟨law, pending, named⟩ := rest
          exact .inr ⟨released, started, law, pending.trans (trims.samePending source),
            named.trans (trims.sameTrigger source)⟩
  rcases post.runs run inside with ⟨held, other⟩ | good
  · simp only [trimmed, stored, List.mem_map] at held
    obtain ⟨source, member, rfl⟩ := held
    by_cases keyed : Feature.Compensation.isRun owner.scope owner.trigger source = true
    · rw [ite_eq_left keyed] at other
      exact absurd ((Laws.Compensation.isRun_iff _ _ _).mp keyed) other
    · rw [ite_eq_right keyed]
      exact .inl ((left_runs s context).subset member)
  · exact .inr good

/-- What every advance, release and begin keeps, at every fuel. -/
theorem runs_form {precedes : Compensable → Compensable → Prop} {ctx : Ctx}
    (orders : ∀ record other, Feature.Compensation.precedes ctx record other = true ↔ precedes record other) :
    ∀ fuel, AdvanceKept precedes ctx fuel ∧ ReleaseKept precedes ctx fuel ∧ BeginKept precedes ctx fuel
  | 0 => by
    refine ⟨fun _ _ _ _ _ ran => ?_, fun _ _ _ _ ran => ?_, fun _ _ _ _ _ _ _ _ ran => ?_⟩
    · obtain ⟨_, _, same, _⟩ := Laws.Compensation.advance_spec ran
      exact absurd same (by omega)
    · obtain ⟨_, _, same, _⟩ := Laws.Compensation.release_spec ran
      exact absurd same (by omega)
    · obtain ⟨_, _, same, _⟩ := Laws.Compensation.beginHandler_spec ran
      exact absurd same (by omega)
  | less + 1 =>
    have ⟨advances, releases, begins⟩ := runs_form orders less
    ⟨fun _ _ _ _ tame ran => advance_formed orders begins releases tame ran,
      fun _ _ _ tame ran => release_formed advances tame ran,
      fun _ _ _ _ _ _ tame source ran => begin_formed advances tame source ran⟩

/-! ## Each hook's result -/

/-- A release from a well-formed state that keeps the lane relation ends in one that keeps it. -/
theorem released_formed (hooks : Hooks) {ctx : Ctx} {context : ScopeOccurrenceId} {s t : State} {fuel : Nat}
    (before : WellFormed ctx.program s) (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (after : WellFormed ctx.program t) (ran : Feature.Compensation.release ctx context s fuel = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  obtain ⟨less, _, rfl, _⟩ := Laws.Compensation.release_spec ran
  have post := (runs_form (precedes_dependsIn hooks ctx) (less + 1)).2.1 _ _ _
    (tame_of before formed.retained formed.keyed formed.runsIssued) ran
  exact formed_of formed post.tame.retained post.tame.keyed post.tame.runsIssued
    (apart_of_counts post.counted formed.completions formed.issued post.moves.issued) post.runs
    (triggers_moved before (.refl s) after post.moves formed.triggers formed.ungrouped)

theorem handlerCompleted_formed (hooks : Hooks) {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence}
    {s t : State} (before : WellFormed ctx.program s)
    (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s) (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.handlerCompleted ctx run occurrence s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  rw [Laws.Compensation.handlerCompleted_spec] at ran
  exact released_formed hooks before formed after ran

theorem handlerEnded_formed (hooks : Hooks) {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence}
    {s t : State} (before : WellFormed ctx.program s)
    (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s) (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.handlerEnded ctx run occurrence s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  rcases Laws.Compensation.handlerEnded_spec ran with ⟨_, _, released⟩ | ⟨_, rfl⟩
  · exact released_formed hooks before formed after released
  · exact formed

theorem dropWithin_formed (hooks : Hooks) {ctx : Ctx} {scope : ScopeOccurrenceId} {s : State}
    (before : WellFormed ctx.program s) (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (after : WellFormed ctx.program (Feature.Compensation.dropWithin ctx scope s)) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) (Feature.Compensation.dropWithin ctx scope s) := by
  have fewer := List.filter_sublist (p := fun run => !(s.subtree scope).contains run.scope)
    (l := s.slots.compensation.runs)
  have tame := tame_fewer (tame_of before formed.retained formed.keyed formed.runsIssued) fewer
  have moves := moves_fewer s fewer
  rw [Laws.Compensation.dropWithin_spec, store_stored] at after ⊢
  exact formed_of formed tame.retained tame.keyed tame.runsIssued
    (apart_of_counts (counted_fewer s fewer) formed.completions formed.issued moves.issued)
    (fun run inside => .inl (fewer.subset inside)) (triggers_moved before (.refl s) after moves formed.triggers formed.ungrouped)

theorem failCompensation_formed (hooks : Hooks) {ctx : Ctx} {handler : ScopeOccurrenceId} {code : String}
    {message : Option String} {origin : Origin} {s t : State}
    (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (ran : Feature.Compensation.failCompensation ctx handler code message origin s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  obtain ⟨_, _, _, rest⟩ := Laws.Compensation.failCompensation_spec ran
  obtain ⟨_, rest⟩ := rest
  obtain rfl := rest.2.2.2.2
  exact formed.signal _

/-- Retaining other records in place of `s`'s, the counter stepped by `issued`, moves nothing else. -/
theorem moves_retained (s : State) (retained : List Compensable) {next : Nat} (issued : s.nextIssue ≤ next) :
    Moves s (stored { s with nextIssue := next } { s.slots.compensation with retained }) :=
  ⟨issued, fun _ inside => .inl inside, rfl, rfl, ⟨[], by simp [stored], by simp⟩, fun _ => Nat.le_refl _,
    fun run inside => ⟨run, inside, rfl⟩, fun _ inside => inside⟩

theorem completed_formed (hooks : Hooks) {ctx : Ctx} {occurrence : Occurrence} {s t : State}
    (before : WellFormed ctx.program s) (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (member : occurrence ∈ s.occurrences) (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.completed ctx occurrence s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  rcases Laws.Compensation.completed_spec ran with ⟨_, rfl⟩ | ⟨handler, target, inner, rest⟩
  · exact formed
  obtain ⟨outer, placed, perm, rest⟩ := rest
  obtain ⟨_, _, retains⟩ := rest
  have standing : target ∈ scopeIds s := by
    rcases Laws.Compensation.placement_target placed with rfl | ⟨entry, inside, _, link⟩
    · exact before.owned.occurrenceScopes occurrence member
    · obtain ⟨_, depth⟩ := (before.rooted.2.2 entry inside).depth
      obtain ⟨_, _, up⟩ := depth.parent before inside link
      exact up.present before
  have outerPresent : ∀ record ∈ outer, record.scope ∈ scopeIds s := fun record inside =>
    formed.retained record (perm.subset (List.mem_append_right _ inside))
  have whole := fun n => count_completionsIn_perm n perm
  rcases retains with ⟨_, rfl⟩ | ⟨record, _, rest⟩
  · rw [store_stored] at after ⊢
    have moves := moves_retained s (outer ++ inner.map fun record => { record with scope := target }) (Nat.le_refl _)
    refine formed_of formed (fun record inside => ?_) formed.keyed formed.runsIssued
      (apart_of_counts (fun n => ?_) formed.completions formed.issued (Nat.le_refl _)) (fun _ inside => .inl inside)
      (triggers_moved before (.refl s) after moves formed.triggers formed.ungrouped)
    · simp only [stored, List.mem_append, List.mem_map] at inside
      rcases inside with old | ⟨_, _, rfl⟩
      · exact outerPresent record old
      · exact standing
    · have same := whole n
      simp only [stored, count_completions, completionsIn_append, List.count_append, completionsIn_rescope] at same ⊢
      omega
  · obtain ⟨_, placedAt, numbered, rest⟩ := rest
    obtain ⟨children, rfl⟩ := rest
    rw [store_stored, Laws.State.issue_eq] at after ⊢
    rw [Laws.State.issue_eq] at numbered
    have moves := moves_retained s (outer ++ [record]) (Nat.le_succ s.nextIssue)
    refine formed_of formed (fun record' inside => ?_) formed.keyed
      (fun run inside => Nat.lt_succ_of_lt (formed.runsIssued run inside))
      (apart_of_fresh (fun n => ?_) formed.completions formed.issued rfl) (fun _ inside => .inl inside)
      (triggers_moved before (.refl s) after moves formed.triggers formed.ungrouped)
    · simp only [stored, List.mem_append, List.mem_singleton] at inside
      rcases inside with old | rfl
      · exact outerPresent record' old
      · rw [placedAt]; exact standing
    · have same := whole n
      have single : completionsIn [record] = record.completion :: completionsIn inner := by
        simp only [completionsIn, List.flatMap_cons, List.flatMap_nil, List.append_nil, completionsOf_eq, children,
          List.map_flatMap, Laws.Compensation.keptRecords_completions]
        rfl
      simp only [stored, count_completions, completionsIn_append, List.count_append, single, List.count_cons,
        numbered] at same ⊢
      omega

/-- Every compensation `Step` performs is a `FreshCall`: its trigger is queued, so no run that is no group's holds it
(`TriggersApart.apart`) and no group's does (`TriggersApart.grouped`), and it resumes no group (`QueuedUngrouped`).
`WellFormed` is not needed. -/
theorem compensationsFresh : CompensationsFresh := by
  intro precedes program queue scope activity trigger leave resume rest _ formed queued
  have split : (ungroupedTriggers queue ++ queuedTriggers queue).Nodup := formed.triggers.apart
  have head : trigger ∈ queuedTriggers queue := by rw [queuedTriggers_cons queued]; exact List.mem_cons_self ..
  refine ⟨fun run inside _ same => ?_,
    formed.ungrouped scope activity trigger leave resume (by rw [queued]; exact List.mem_cons_self ..)⟩
  cases grouped : resumesGroup run.resume
  · exact (List.nodup_append.mp split).2.2 _
      (List.mem_map.mpr ⟨run, List.mem_filter.mpr ⟨inside, by simp [grouped]⟩, rfl⟩) _ head same
  · exact formed.triggers.grouped run inside grouped (by rw [same]; exact head)

theorem compensate_formed (hooks : Hooks) {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option Nat} {resume : Option Resume} {s t : State}
    (before : WellFormed ctx.program s) (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (stands : Laws.Step.ScopeStands s scope)
    (popped : Laws.State.Popped (fun queue => WellFormed ctx.program queue ∧
      Formed (DependsIn hooks footprintReads footprintWrites ctx.program) queue)
      (.compensate scope activity trigger leave resume) s)
    (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  obtain ⟨queue, ⟨queueFormed, queueRelation⟩, queued, shape⟩ := popped
  have fresh := compensationsFresh _ _ _ _ _ _ _ _ _ queueFormed queueRelation queued
  rw [← shape] at fresh
  obtain ⟨taken, others, rest⟩ := Laws.Compensation.compensate_spec ran
  obtain ⟨_, perm, advanced⟩ := rest
  rw [store_stored] at advanced
  obtain ⟨less, _, fuel, _⟩ := Laws.Compensation.advance_spec advanced
  rw [fuel] at advanced
  have below : scope.value < s.nextIssue := by
    obtain ⟨entry, inside, rfl⟩ := stands
    exact before.issued.scopes entry inside
  have opening := tame_opened (others := others) (run := { trigger, scope, pending := taken, leave, resume })
    (tame_of before formed.retained formed.keyed formed.runsIssued)
    (fun record inside => perm.subset (List.mem_append_right _ inside)) fresh.1 below rfl fresh.2
  have post := (runs_form (precedes_dependsIn hooks ctx) (less + 1)).1 _ _ _ _ opening advanced
  have triggers := triggers_opened (others := others) (run := { trigger, scope, pending := taken, leave, resume })
    queueRelation.triggers queueRelation.ungrouped queued shape rfl fresh.2
  refine formed_of formed post.tame.retained post.tame.keyed post.tame.runsIssued
    (apart_of_counts (fun n => Nat.le_trans (post.counted n) (Nat.le_of_eq (count_opened perm rfl rfl n))) formed.completions
      formed.issued post.moves.issued) (fun run inside => ?_)
    (triggers_moved before (⟨rfl, rfl, rfl, rfl⟩ : Twin s (opened s others _)) after post.moves triggers.1
      triggers.2)
  rcases post.runs run inside with ⟨held, other⟩ | good
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at held
    rcases held with old | rfl
    · exact .inl old
    · exact absurd ⟨rfl, rfl⟩ other
  · exact .inr good

end Kernel.Proofs.Compensation
