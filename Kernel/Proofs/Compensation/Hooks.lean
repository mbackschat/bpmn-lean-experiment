module

public import Kernel.Laws.Compensation
public import Kernel.Proofs.Compensation
public import Kernel.Laws.Propagation
public import Kernel.Proofs.Compensation.Triggers

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

variable {le : Issue → Issue → Bool}

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Counted Untriggered)
open Kernel.Laws.Compensation (ClaimsApart Advances Ready Keyed Holds FirstOf BeginsEach claimed)

/-! ## §13.5.5's data dependency over the footprints -/

/-- Every name the footprints of the program's elements read or write (`subjectData`), after one that no
footprint needs to name: what a footprint of every name (`NameSet.all`) lists. -/
def footprintNames (ctx : Ctx) : List String :=
  "" :: ctx.program.elements.flatMap fun element =>
    (subjectData ctx.program element.header.id).reads.names ++
      (subjectData ctx.program element.header.id).writes.names

/-- The names a run of `subject` reads, every name for a footprint that reads every name (`Laws.IL.listed`). -/
def footprintReads (ctx : Ctx) (subject : ElementId) : List String :=
  Laws.IL.listed (footprintNames ctx) (subjectData ctx.program subject).reads

/-- The names a run of `subject` writes, every name for a footprint that writes every name. -/
def footprintWrites (ctx : Ctx) (subject : ElementId) : List String :=
  Laws.IL.listed (footprintNames ctx) (subjectData ctx.program subject).writes

/-- A subject's footprint names only names `footprintNames` holds. -/
theorem footprint_listed (ctx : Ctx) (subject : ElementId) :
    (∀ name ∈ (subjectData ctx.program subject).reads.names, name ∈ footprintNames ctx) ∧
      ∀ name ∈ (subjectData ctx.program subject).writes.names, name ∈ footprintNames ctx := by
  cases found : ctx.program.element? subject with
  | none => rw [Laws.IL.subjectData_missing found]; exact ⟨nofun, nofun⟩
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
    (∀ record, Laws.State.ScopeIssued s record.scope →
      (record ∈ t.slots.compensation.retained ↔ record ∈ s.slots.compensation.retained)) ∧
    ∀ next ∈ t.slots.compensation.runs, Keyed scope trigger next ∨ next ∈ s.slots.compensation.runs ∨
      ¬ Laws.State.ScopeIssued s next.scope
  scopesKept : Laws.Compensation.Unheld s scope → ∀ entry ∈ s.scopes, entry ∈ t.scopes

/-- What a release keeps from `s` to `t`, each run it leaves `Steps` from `s`. -/
structure ReleaseFormed (precedes : Compensable → Compensable → Prop) (s t : State) : Prop where
  tame : Tame t
  moves : Moves s t
  counted : ∀ n, (completions t.slots.compensation).count n ≤ (completions s.slots.compensation).count n
  runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ Good precedes run
  steps : ∀ next ∈ t.slots.compensation.runs, Steps precedes s next

/-- What beginning the handlers of `records` keeps from `s` to `t`, the children of the begun records added to what it
holds, each begun in a context issued meanwhile, keeping every record retained in a scope occurrence `s` had issued and
leaving no run but `s`'s and freshly scoped ones, keeping every scope occurrence, each context lying directly in
`scope`. -/
structure BegunFormed (precedes : Compensable → Compensable → Prop) (scope : ScopeOccurrenceId)
    (records : List Compensable) (contexts : List ScopeOccurrenceId) (s t : State) : Prop where
  tame : Tame t
  moves : Moves s t
  counted : ∀ n, (completions t.slots.compensation).count n ≤
    (completions s.slots.compensation).count n + (childrenCompletions records).count n
  runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ Good precedes run
  kept : ∀ run ∈ s.slots.compensation.runs, run ∈ t.slots.compensation.runs
  fresh : ∀ context ∈ contexts, ¬ Laws.State.ScopeIssued s context ∧ Laws.State.ScopeIssued t context
  retained : ∀ record, Laws.State.ScopeIssued s record.scope →
    (record ∈ t.slots.compensation.retained ↔ record ∈ s.slots.compensation.retained)
  plain : ∀ next ∈ t.slots.compensation.runs, next ∈ s.slots.compensation.runs ∨ ¬ Laws.State.ScopeIssued s next.scope
  scopesKept : ∀ entry ∈ s.scopes, entry ∈ t.scopes
  parented : ∀ context ∈ contexts, context.parent? = some scope

/-- What `Compensation.advance` keeps at `fuel`, of a run whose scope occurrence stands (`Laws.Compensation.AdvanceKeeps`
reads the same premise). -/
def AdvanceKept (precedes : Compensable → Compensable → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ scope trigger s t, Tame s → scope ∈ scopeIds s → Feature.Compensation.advance ctx scope trigger s fuel = .ok t →
    AdvanceFormed precedes scope trigger s t

/-- What `Compensation.release` keeps at `fuel`, of a context that stands. -/
def ReleaseKept (precedes : Compensable → Compensable → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ context s t, Tame s → context ∈ scopeIds s → Feature.Compensation.release ctx context s fuel = .ok t →
    ReleaseFormed precedes s t

/-- What `Compensation.beginHandler` keeps at `fuel`, in a scope occurrence that stands, for a trigger a run of the
state holds. -/
def BeginKept (precedes : Compensable → Compensable → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ trigger scope s record t context, Tame s → scope ∈ scopeIds s →
    (∃ run ∈ s.slots.compensation.runs, run.trigger = trigger) →
    Feature.Compensation.beginHandler ctx trigger scope s record fuel = .ok (t, context) →
      BegunFormed precedes scope [record] [context] s t

/-- A state that is `s` or `s` with an untriggered signal queued holds `s`'s scope occurrences. -/
theorem quieted_scopes {s t : State} (quieted : Quieted s t) : t.scopes = s.scopes := by
  rcases quieted with rfl | ⟨signal, _, rfl⟩
  · rfl
  · rw [Laws.State.signal_eq]

theorem store_stored (s : State) (compensation : Compensations) :
    Feature.Compensation.store s compensation = stored s compensation :=
  Laws.Compensation.store_eq s compensation

/-- `Compensation.beginHandler` keeps what `BeginKept` says, given what the advance of a group's nested run keeps. -/
theorem begin_formed {precedes : Compensable → Compensable → Prop} {ctx : Ctx} {less : Nat}
    (advances : AdvanceKept precedes ctx less) {trigger : OccurrenceRef} {scope : ScopeOccurrenceId} {s : State}
    {record : Compensable} {t : State} {context : ScopeOccurrenceId} (tame : Tame s) (stands : scope ∈ scopeIds s)
    (source : ∃ run ∈ s.slots.compensation.runs, run.trigger = trigger)
    (ran : Feature.Compensation.beginHandler ctx trigger scope s record (less + 1) = .ok (t, context)) :
    BegunFormed precedes scope [record] [context] s t := by
  obtain ⟨less', entered, same, begun⟩ := Laws.Compensation.beginHandler_spec ran
  obtain rfl : less' = less := (Nat.succ.inj same).symm
  rcases begun with ⟨_, entering, nested⟩ | ⟨handler, element, _, rest⟩
  · obtain ⟨rfl, rfl⟩ : entered = _ ∧ context = _ :=
      ⟨(congrArg Prod.fst entering).symm, (congrArg Prod.snd entering).symm⟩
    obtain ⟨contextEq, slots, -⟩ := entered_eq s record.subject scope record.snapshot
    have scopes := entered_scopes tame record.subject stands record.snapshot
    obtain ⟨unissued, issuedNew, grows⟩ := entered_fresh tame record.subject stands record.snapshot
    rw [store_stored] at nested
    have post := advances _ _ _ _ (tame_withRun tame record.subject stands record.snapshot rfl rfl
      fun context resumed => by cases resumed; rfl)
      ((entered_scopeIds tame record.subject stands record.snapshot _).mpr (.inr rfl)) nested
    have unheld : Laws.Compensation.Unheld (withRun (s.enterScope record.subject scope record.snapshot none).1
        { trigger, scope := (s.enterScope record.subject scope record.snapshot none).2,
          pending := Feature.Compensation.begunChildren record (s.enterScope record.subject scope record.snapshot none).2,
          leave := none, resume := some (.group (s.enterScope record.subject scope record.snapshot none).2) })
        (s.enterScope record.subject scope record.snapshot none).2 := fun run inside running => by
      simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at inside
      rcases inside with old | rfl
      · exact unissued (tame.running run old _ running)
      · cases running
    have direct := post.direct (.inr unheld)
    refine ⟨post.tame, (moves_withRun tame record.subject stands record.snapshot (by simp [resumesGroup])
      (source.imp fun _ found => ⟨found.1, found.2⟩)).trans post.moves, fun n => ?_, fun run inside => ?_,
      fun run inside => ?_, fun context' inside => ?_, fun record' below => ?_, fun later inside => ?_,
      fun entry inside => post.scopesKept unheld entry ((scopes entry).mpr (.inl inside)),
      fun context' inside => by
        rw [List.mem_singleton.mp inside, contextEq]; exact Laws.State.ScopeOccurrenceId.parent?_child _ _ _⟩
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
      exact absurd (tame.runsIssued run inside) (by rw [keyed.1]; exact unissued)
    · rw [List.mem_singleton.mp inside]
      exact ⟨unissued, post.moves.grows.issued issuedNew⟩
    · have kept := direct.1 record' (grows.issued below)
      simp only [withRun, stored, slots] at kept
      exact kept
    · rcases direct.2 later inside with keyed | old | fresh
      · exact .inr (by rw [keyed.1]; exact unissued)
      · simp only [withRun, stored, slots, List.mem_append, List.mem_singleton] at old
        rcases old with older | rfl
        · exact .inl older
        · exact .inr unissued
      · exact .inr fun held => fresh (grows.issued held)
  · obtain ⟨_, _, entering, rfl⟩ := rest
    obtain ⟨rfl, rfl⟩ : entered = _ ∧ context = _ :=
      ⟨(congrArg Prod.fst entering).symm, (congrArg Prod.snd entering).symm⟩
    obtain ⟨contextEq, slots, -⟩ := entered_eq s handler scope record.snapshot
    have scopes := entered_scopes tame handler stands record.snapshot
    obtain ⟨unissued, issuedNew, _⟩ := entered_fresh tame handler stands record.snapshot
    rw [store_stored]
    have tameHandled := tame_withRetained tame handler stands record.snapshot
      (records := Feature.Compensation.begunChildren record (s.enterScope handler scope record.snapshot none).2)
      (Laws.Compensation.begunChildren_scope record _)
    refine ⟨tame_signal tameHandled _, (moves_withRetained tame handler stands record.snapshot _).trans
      (moves_signal _ (Laws.Step.untriggered_begin _)), fun n => ?_, fun run inside => .inl ?_, fun run inside => ?_,
      fun context' inside => ?_, fun record' below => ?_, fun next inside => .inl ?_, fun entry inside => ?_,
      fun context' inside => by
        rw [List.mem_singleton.mp inside, contextEq]; exact Laws.State.ScopeOccurrenceId.parent?_child _ _ _⟩
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
    · rw [List.mem_singleton.mp inside]
      exact ⟨unissued, by rw [Laws.State.signal_eq]; exact issuedNew⟩
    · rw [Laws.State.signal_eq]
      simp only [stored, slots, List.mem_append]
      constructor
      · rintro (old | new)
        · exact old
        · rw [Laws.Compensation.begunChildren_scope record _ _ new] at below
          exact absurd below unissued
      · exact .inl
    · rw [Laws.State.signal_eq] at inside
      simpa only [withRetained, stored, slots] using inside
    · rw [Laws.State.signal_eq]
      exact (scopes entry).mpr (.inl inside)

/-- Beginning the handlers of `started` one after another keeps what each begin keeps. -/
theorem chain_formed {precedes : Compensable → Compensable → Prop} {ctx : Ctx} {less : Nat}
    (begins : BeginKept precedes ctx less) {trigger : OccurrenceRef} {scope : ScopeOccurrenceId} {s t : State}
    {started : List (ScopeOccurrenceId × Compensable)}
    (chain : BeginsEach (fun current record => Feature.Compensation.beginHandler ctx trigger scope current record less)
      s started t) (tame : Tame s) (stands : scope ∈ scopeIds s)
    (source : ∃ run ∈ s.slots.compensation.runs, run.trigger = trigger) :
    BegunFormed precedes scope (started.map (·.2)) (started.map (·.1)) s t := by
  induction chain with
  | nil s =>
    exact ⟨tame, .refl s, fun n => by simp [childrenCompletions], fun run inside => .inl inside, fun _ inside => inside,
      fun _ inside => (by cases inside), fun _ _ => Iff.rfl, fun _ inside => .inl inside, fun _ inside => inside,
      fun _ inside => by cases inside⟩
  | cons began _ ih =>
    have first := begins _ _ _ _ _ _ tame stands source began
    obtain ⟨run, member, named⟩ := source
    have later := ih first.tame (by
      obtain ⟨entry, inside, same⟩ := List.mem_map.mp stands
      exact List.mem_map.mpr ⟨entry, first.scopesKept entry inside, same⟩) ⟨run, first.kept run member, named⟩
    refine ⟨later.tame, first.moves.trans later.moves, fun n => ?_, fun run inside => ?_,
      fun run inside => later.kept run (first.kept run inside), fun context inside => ?_,
      fun record below => (later.retained record (first.moves.grows.issued below)).trans
        (first.retained record below), fun next inside => ?_,
      fun entry inside => later.scopesKept entry (first.scopesKept entry inside), fun context inside => ?_⟩
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
        exact ⟨bounds.1, later.moves.grows.issued bounds.2⟩
      · have bounds := later.fresh _ rest
        exact ⟨fun held => bounds.1 (first.moves.grows.issued held), bounds.2⟩
    · rcases later.plain next inside with old | fresh
      · exact first.plain next old
      · exact .inr fun held => fresh (first.moves.grows.issued held)
    · simp only [List.map_cons, List.mem_cons] at inside
      rcases inside with rfl | rest
      · exact first.parented _ (List.mem_singleton_self _)
      · exact later.parented _ rest

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
    (retained : t.slots.compensation.retained = s.slots.compensation.retained) (scopes : t.scopes = s.scopes) :
    AdvanceFormed precedes scope trigger s t := by
  have left : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∧ ¬ Keyed scope trigger run :=
    fun run inside => by
      rw [runs, List.mem_filter, Bool.not_eq_true', isRun_false] at inside
      exact inside
  refine ⟨tame, moves, counted, fun run inside => .inl (left run inside), fun _ run inside other => ?_,
    fun next inside keyed => absurd keyed (left next inside).2,
    fun next inside _ => .inr ⟨next, (left next inside).1, rfl, rfl, .inl rfl⟩,
    fun _ => ⟨fun record _ => by rw [retained], fun next inside => .inr (.inl (left next inside).1)⟩,
    fun _ _ inside => scopes ▸ inside⟩
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
    {trigger : OccurrenceRef} {s t : State} (tame : Tame s) (stands : scope ∈ scopeIds s)
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
    have scopesEnded : ended.scopes = s.scopes := (quieted_scopes quieted).trans rfl
    have left : ∀ other ∈ ended.slots.compensation.runs,
        other ∈ s.slots.compensation.runs ∧ ¬ Keyed scope trigger other := fun other inside => by
      rw [runsEnded, List.mem_filter, Bool.not_eq_true', isRun_false] at inside
      exact inside
    rcases resumed : run.resume with _ | ⟨occurrence, leave⟩ | ⟨element, at_, leave⟩ | context
    · rw [resumedNone resumed]
      exact advanceFormed_filtered tameEnded movesEnded countedEnded runsEnded retainedEnded scopesEnded
    · have last : Quieted ended t := .inr ⟨_, Laws.Step.untriggered_complete _ _ _ _, resumedComplete _ _ resumed⟩
      exact advanceFormed_filtered (last.tame tameEnded) (movesEnded.trans last.moves)
        (fun n => by rw [last.slots]; exact countedEnded n) (by rw [last.slots]; exact runsEnded)
        (by rw [last.slots]; exact retainedEnded) ((quieted_scopes last).trans scopesEnded)
    · have last : Quieted ended t := .inr ⟨_, Laws.Step.untriggered_occur _ _ _ _ _, resumedOccur _ _ _ resumed⟩
      exact advanceFormed_filtered (last.tame tameEnded) (movesEnded.trans last.moves)
        (fun n => by rw [last.slots]; exact countedEnded n) (by rw [last.slots]; exact runsEnded)
        (by rw [last.slots]; exact retainedEnded) ((quieted_scopes last).trans scopesEnded)
    · have released := resumedGroup context resumed
      have own : context = scope := (tame.grouped run first.mem context resumed).trans first.1.1
      have post := releases _ _ _ tameEnded (by unfold scopeIds; rw [scopesEnded, own]; exact stands) released
      have never : ¬ Laws.Compensation.Unheld s scope := fun unheld => by
        have own : context = scope := (tame.grouped run first.mem context resumed).trans first.1.1
        obtain ⟨_, owner, _, rest⟩ := Laws.Compensation.release_spec released
        have found := rest.1
        have held := found.mem
        rw [runsEnded, List.mem_filter] at held
        exact absurd (own ▸ found.1) (unheld owner held.1)
      have below : Laws.State.ScopeIssued s scope := first.1.1 ▸ tame.runsIssued run first.mem
      refine ⟨post.tame, movesEnded.trans post.moves, fun n => Nat.le_trans (post.counted n) (countedEnded n),
        fun other inside => ?_, fun unheld => absurd unheld never, fun next inside keyed => ?_,
        fun next inside _ => Steps.mono (fun other member => (left other member).1) movesEnded.grows
          (post.steps next inside), fun unresumed => ?_, fun unheld => absurd unheld never⟩
      · rcases post.runs other inside with old | good
        · exact .inl (left other old)
        · exact .inr good
      · rcases post.steps next inside with fresh | ⟨other, member, rest⟩
        · exact absurd (movesEnded.grows.issued below) (by rw [← keyed.1]; exact fresh)
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
    have post := chain_formed begins chain tame stands ⟨run, first.mem, first.1.2⟩
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
      fun other inside context resumed' => ?_, post.tame.parents,
      fun other inside context running entry entered named => ?_, post.tame.issuer.same rfl rfl rfl rfl,
      fun other inside grouped => by
        rcases List.mem_append.mp inside with old | new
        · exact post.tame.groupsStanding other (List.mem_filter.mp old).1 grouped
        · rw [List.mem_singleton.mp new] at grouped ⊢; exact post.tame.groupsStanding run member grouped,
      post.tame.scopesKeyed⟩,
      ?_, fun n => ?_, fun other inside => ?_,
      fun _ other inside differs => ?_, fun other inside keyed' => ?_, fun other inside differs' => ?_,
      fun _ => ⟨fun record below => post.retained record below, fun other inside => ?_⟩,
      fun _ entry inside => post.scopesKept entry inside⟩
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
      · exact post.tame.grouped other (List.mem_filter.mp old).1 context resumed'
      · rw [List.mem_singleton.mp new] at resumed' ⊢
        exact post.tame.grouped run member context resumed'
    · rcases List.mem_append.mp inside with old | new
      · exact post.tame.runningIn other (List.mem_filter.mp old).1 context running entry entered named
      · rw [List.mem_singleton.mp new] at running ⊢
        simp only [List.map_append, List.mem_append] at running
        rcases running with held | begun'
        · exact post.tame.runningIn run member context held entry entered named
        · show entry.id.parent? = some run.scope
          rw [named, post.parented context begun', first.1.1]
    · refine post.moves.trans ⟨Nat.le_refl _, .of_same rfl rfl (.of_eq rfl), fun entry inside => .inl inside, rfl, rfl,
        ⟨[], by simp [stored, Laws.State.allSignals], by simp⟩,
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
    (stands : context ∈ scopeIds s)
    (ran : Feature.Compensation.release ctx context s (less + 1) = .ok t) : ReleaseFormed precedes s t := by
  obtain ⟨less', owner, same, rest⟩ := Laws.Compensation.release_spec ran
  have advanced := rest.2
  obtain ⟨entry, entered, named⟩ := List.mem_map.mp stands
  have ownerStands : owner.scope ∈ scopeIds (s.leaveScope ctx.positionLe context) :=
    left_parent tame.parents entered named (tame.runningIn owner rest.1.mem context rest.1.1 entry entered named)
  obtain rfl : less' = less := (Nat.succ.inj same).symm
  rw [store_stored] at advanced
  have trims : Trims fun candidate => if Feature.Compensation.isRun owner.scope owner.trigger candidate then
      { candidate with running := candidate.running.filter (·.1 != context) } else candidate :=
    ⟨fun run => by split <;> rfl, fun run => by split <;> rfl, fun run => by split <;> rfl,
      fun run => by split <;> rfl, fun run => by split <;> first | exact List.filter_sublist | exact .refl _⟩
  have post := advances _ _ _ _ (tame_trimmed tame context trims) ownerStands advanced
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
      · exact .inl fun held => fresh ((Laws.State.leaveScope_grows s context).issued held)
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
    refine ⟨fun _ _ _ _ _ _ ran => ?_, fun _ _ _ _ _ ran => ?_, fun _ _ _ _ _ _ _ _ _ ran => ?_⟩
    · obtain ⟨_, _, same, _⟩ := Laws.Compensation.advance_spec ran
      exact absurd same (by omega)
    · obtain ⟨_, _, same, _⟩ := Laws.Compensation.release_spec ran
      exact absurd same (by omega)
    · obtain ⟨_, _, same, _⟩ := Laws.Compensation.beginHandler_spec ran
      exact absurd same (by omega)
  | less + 1 =>
    have ⟨advances, releases, begins⟩ := runs_form orders less
    ⟨fun _ _ _ _ tame stands ran => advance_formed orders begins releases tame stands ran,
      fun _ _ _ tame stands ran => release_formed advances tame stands ran,
      fun _ _ _ _ _ _ tame stands source ran => begin_formed advances tame stands source ran⟩

/-! ## Each hook's result -/

/-- A release from a well-formed state that keeps the lane relation ends in one that keeps it. -/
theorem released_formed (hooks : Hooks) {ctx : Ctx} {context : ScopeOccurrenceId} {s t : State} {fuel : Nat}
    (before : WellFormed ctx.program s) (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (stands : context ∈ scopeIds s) (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.release ctx context s fuel = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  obtain ⟨less, _, rfl, _⟩ := Laws.Compensation.release_spec ran
  have post := (runs_form (precedes_dependsIn hooks ctx) (less + 1)).2.1 _ _ _
    (tame_of before formed.retained formed.keyed formed.runsIssued formed.groupsStanding) stands ran
  exact formed_of formed post.tame.retained post.tame.keyed post.tame.runsIssued
    (apart_of_counts post.counted formed.completions formed.issued post.moves.issued) post.runs
    (triggers_moved before (.refl s) after post.moves formed.triggers formed.ungrouped) post.tame.groupsStanding

theorem handlerCompleted_formed (hooks : Hooks) {ctx : Ctx} {occurrence : Occurrence}
    {s t : State} (before : WellFormed ctx.program s)
    (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (stands : Laws.Step.ScopeStands s occurrence.scope) (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.handlerCompleted ctx occurrence s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  rw [Laws.Compensation.handlerCompleted_spec] at ran
  exact released_formed hooks before formed (List.mem_map.mpr stands) after ran

theorem handlerEnded_formed (hooks : Hooks) {ctx : Ctx} {occurrence : Occurrence}
    {s t : State} (before : WellFormed ctx.program s)
    (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (stands : Laws.Step.ScopeStands s occurrence.scope) (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.handlerEnded ctx occurrence s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  rcases Laws.Compensation.handlerEnded_spec ran with ⟨_, _, released⟩ | ⟨_, rfl⟩
  · exact released_formed hooks before formed (List.mem_map.mpr stands) after released
  · exact formed

theorem dropWithin_formed (hooks : Hooks) {ctx : Ctx} {scope : ScopeOccurrenceId} {s : State}
    (before : WellFormed ctx.program s) (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (after : WellFormed ctx.program (Feature.Compensation.dropWithin ctx scope s)) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) (Feature.Compensation.dropWithin ctx scope s) := by
  have fewer := List.filter_sublist (p := fun run => !(s.inside scope).contains run.scope)
    (l := s.slots.compensation.runs)
  have tame := tame_fewer (tame_of before formed.retained formed.keyed formed.runsIssued formed.groupsStanding) fewer
  have moves := moves_fewer s fewer
  rw [Laws.Compensation.dropWithin_spec, store_stored] at after ⊢
  exact formed_of formed tame.retained tame.keyed tame.runsIssued
    (apart_of_counts (counted_fewer s fewer) formed.completions formed.issued moves.issued)
    (fun run inside => .inl (fewer.subset inside)) (triggers_moved before (.refl s) after moves formed.triggers formed.ungrouped)
    tame.groupsStanding

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
theorem moves_retained (s : State) (retained : List Compensable) {next : Nat} (issued : s.nextCompletion ≤ next) :
    Moves s (stored { s with nextCompletion := next } { s.slots.compensation with retained }) :=
  ⟨issued, .of_same rfl rfl (.of_eq rfl), fun _ inside => .inl inside, rfl, rfl, ⟨[], by simp [stored, Laws.State.allSignals], by simp⟩, fun _ => Nat.le_refl _,
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
      (triggers_moved before (.refl s) after moves formed.triggers formed.ungrouped) formed.groupsStanding
    · simp only [stored, List.mem_append, List.mem_map] at inside
      rcases inside with old | ⟨_, _, rfl⟩
      · exact outerPresent record old
      · exact standing
    · have same := whole n
      simp only [stored, count_completions, completionsIn_append, List.count_append, completionsIn_rescope] at same ⊢
      omega
  · obtain ⟨_, placedAt, numbered, rest⟩ := rest
    obtain ⟨children, rfl⟩ := rest
    rw [store_stored, Laws.State.takeCompletion_eq] at after ⊢
    rw [Laws.State.takeCompletion_eq] at numbered
    have moves := moves_retained s (outer ++ [record]) (Nat.le_succ s.nextCompletion)
    refine formed_of formed (fun record' inside => ?_) formed.keyed
      (fun run inside => formed.runsIssued run inside)
      (apart_of_fresh (fun n => ?_) formed.completions formed.issued rfl) (fun _ inside => .inl inside)
      (triggers_moved before (.refl s) after moves formed.triggers formed.ungrouped) formed.groupsStanding
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
  intro precedes program queue scope activity trigger leave resume unit _ formed found
  have split : (ungroupedTriggers queue ++ queuedTriggers queue).Nodup := formed.triggers.apart
  have head : trigger ∈ queuedTriggers queue := (queuedTriggers_pop found).mem_iff.mpr (List.mem_cons_self ..)
  refine ⟨fun run inside _ same => ?_,
    formed.ungrouped scope activity trigger leave resume (Laws.State.mem_allSignals_of found)⟩
  cases grouped : resumesGroup run.resume
  · exact (List.nodup_append.mp split).2.2 _
      (List.mem_map.mpr ⟨run, List.mem_filter.mpr ⟨inside, by simp [grouped]⟩, rfl⟩) _ head same
  · exact formed.triggers.grouped run inside grouped (by rw [same]; exact head)

theorem compensate_formed (hooks : Hooks) {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {s t : State}
    (before : WellFormed ctx.program s) (formed : Formed (DependsIn hooks footprintReads footprintWrites ctx.program) s)
    (stands : Laws.Step.ScopeStands s scope)
    (popped : Laws.State.Popped (fun queue => WellFormed ctx.program queue ∧
      Formed (DependsIn hooks footprintReads footprintWrites ctx.program) queue)
      (.compensate scope activity trigger leave resume) s)
    (after : WellFormed ctx.program t)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume s = .ok t) :
    Formed (DependsIn hooks footprintReads footprintWrites ctx.program) t := by
  obtain ⟨queue, unit, ⟨queueFormed, queueRelation⟩, rest₁⟩ := popped
  obtain ⟨found, shape⟩ := rest₁
  have fresh := compensationsFresh _ _ _ _ _ _ _ _ _ queueFormed queueRelation found
  rw [← shape] at fresh
  obtain ⟨taken, others, rest⟩ := Laws.Compensation.compensate_spec ran
  obtain ⟨_, perm, advanced⟩ := rest
  rw [store_stored] at advanced
  obtain ⟨less, _, fuel, _⟩ := Laws.Compensation.advance_spec advanced
  rw [fuel] at advanced
  have below : Laws.State.ScopeIssued s scope := by
    obtain ⟨entry, inside, rfl⟩ := stands
    exact before.issued.scopes entry inside
  have opening := tame_opened (others := others) (run := { trigger, scope, pending := taken, leave, resume })
    (tame_of before formed.retained formed.keyed formed.runsIssued formed.groupsStanding)
    (fun record inside => perm.subset (List.mem_append_right _ inside)) fresh.1 below rfl fresh.2
  have post := (runs_form (precedes_dependsIn hooks ctx) (less + 1)).1 _ _ _ _ opening (List.mem_map.mpr stands) advanced
  have triggers := triggers_opened (others := others) (run := { trigger, scope, pending := taken, leave, resume })
    queueRelation.triggers queueRelation.ungrouped found shape rfl fresh.2
  refine formed_of formed post.tame.retained post.tame.keyed post.tame.runsIssued
    (apart_of_counts (fun n => Nat.le_trans (post.counted n) (Nat.le_of_eq (count_opened perm rfl rfl n))) formed.completions
      formed.issued post.moves.issued) (fun run inside => ?_)
    (triggers_moved before (⟨rfl, rfl, rfl, rfl, rfl, rfl⟩ : Twin s (opened s others _)) after post.moves triggers.1
      triggers.2) post.tame.groupsStanding
  rcases post.runs run inside with ⟨held, other⟩ | good
  · simp only [opened, stored, List.mem_append, List.mem_singleton] at held
    rcases held with old | rfl
    · exact .inl old
    · exact absurd ⟨rfl, rfl⟩ other
  · exact .inr good

end Kernel.Proofs.Compensation
