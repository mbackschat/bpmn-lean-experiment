module

public import Kernel.State.Slots
import all Kernel.State.Slots

/-! # Laws of the kernel state: the feature slots

What `Kernel.State.Slots`' operations do, read from their bodies; this is the one module that sees them. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- `Variables.ofBindings` inserts the bindings in order, so a name bound twice keeps the value bound last. -/
theorem ofBindings_eq (bindings : List (String × Value)) :
    Variables.ofBindings bindings = bindings.foldl (fun set binding => set.insert binding.1 binding.2) ∅ := by
  simp only [Variables.ofBindings]

/-- `Variables.ofBindings` binds a name no later binding repeats to that binding's value (#147). -/
theorem ofBindings_getElem?_last (earlier : List (String × Value)) {binding : String × Value}
    {later : List (String × Value)} (last : ∀ other ∈ later, other.1 ≠ binding.1) :
    (Variables.ofBindings (earlier ++ binding :: later))[binding.1]? = some binding.2 := by
  rw [ofBindings_eq, List.foldl_append, List.foldl_cons]
  suffices kept : ∀ (m : Variables), (later.foldl (fun set b => set.insert b.1 b.2) m)[binding.1]? = m[binding.1]? by
    rw [kept, Std.ExtTreeMap.getElem?_insert_self]
  intro m
  induction later generalizing m with
  | nil => rfl
  | cons other rest ih =>
    rw [List.foldl_cons, ih (fun o h => last o (List.mem_cons_of_mem _ h)) _, Std.ExtTreeMap.getElem?_insert,
      ite_eq_right (fun e => absurd (Std.LawfulEqCmp.eq_of_compare e) (last other List.mem_cons_self))]

/-- `FeatureSlots.clear` filters each slot by the scope occurrences it removes: what `Kernel.Laws.State.Removal` reads
of the slots when it clears a scope occurrence. -/
theorem featureSlotsClear_eq (slots : FeatureSlots) (inside nested : List ScopeOccurrenceId) :
    slots.clear inside nested = {
      parked := slots.parked.filter (!inside.contains ·.scope)
      heldMap := slots.heldMap.filter fun _ scope => !inside.contains scope
      multiInstanceMap := slots.multiInstanceMap.filter fun _ record => !inside.contains record.scope
      compensation := {
        retained := slots.compensation.retained.filter (!nested.contains ·.scope)
        runMap := slots.compensation.runMap.filter fun key _ => !inside.contains key.scope }
      instances := slots.instances.filter (!nested.contains ·.root) } := by
  simp only [FeatureSlots.clear]

/-- A run `CompensationRun.holds` a context in a scope occurrence when it is in that scope occurrence and runs a handler
there. -/
theorem holds_iff (scope context : ScopeOccurrenceId) (run : CompensationRun) :
    run.holds scope context = true ↔ run.scope = scope ∧ context ∈ run.running.map (·.1) := by
  simp [CompensationRun.holds]

/-- A held occurrence is suspended, leaving by its outgoing flows. -/
theorem held_suspended {slots : FeatureSlots} {held : Held} (mem : held ∈ slots.held) :
    { element := held.occurrence.element, scope := held.scope, leave := .outgoing : Suspended } ∈ slots.suspended :=
  List.mem_append_left _ (List.mem_map.mpr ⟨held, mem, rfl⟩)

/-- A compensation run that completes an existing occurrence once its handlers end, as a waiting Compensation throw's
does, holds that occurrence suspended. -/
theorem resume_suspended {slots : FeatureSlots} {run : CompensationRun} {occurrence : OccurrenceId} {leave : Leave}
    (mem : run ∈ slots.compensation.runs) (resume : run.resume = some (.complete occurrence leave)) :
    { element := occurrence.element, scope := occurrence.scope, leave : Suspended } ∈ slots.suspended :=
  List.mem_append_right _ (List.mem_filterMap.mpr ⟨run, mem, by simp [resume]⟩)

/-- `Parked.leastBy` picks one of the arrivals, under any order. -/
theorem leastBy_mem {le : Issue → Issue → Bool} {entries : List Parked} {least : Parked}
    (found : Parked.leastBy le entries = some least) : least ∈ entries := by
  unfold Parked.leastBy at found
  suffices ∀ (acc : Option Parked), (∀ best, acc = some best → best ∈ entries) → ∀ rest : List Parked, rest ⊆ entries →
      rest.foldl (fun found waiting => match found with
        | some best => if le best.occurrence.ordinal waiting.occurrence.ordinal then found else some waiting
        | none => some waiting) acc = some least → least ∈ entries from
    this none (by simp) entries (List.Subset.refl _) found
  intro acc kept rest
  induction rest generalizing acc with
  | nil => intro _ ended; exact kept _ ended
  | cons head tail ih =>
    intro sub ran
    have headIn : head ∈ entries := sub List.mem_cons_self
    refine ih _ ?_ (fun x member => sub (List.mem_cons_of_mem _ member)) ran
    intro best picked
    cases acc with
    | none => simp only [Option.some.injEq] at picked; exact picked ▸ headIn
    | some prior =>
      simp only at picked
      split at picked
      · exact kept _ picked
      · simp only [Option.some.injEq] at picked; exact picked ▸ headIn

/-! ## The compensation run map -/

theorem runs_eq (compensation : Compensations) : compensation.runs = runList compensation.runMap := rfl

@[simp] theorem toRecord_toRun (record : RunRecord) (key : RunKey) : (record.toRun key).toRecord = record := by
  simp only [RunRecord.toRun, CompensationRun.toRecord]

@[simp] theorem toRun_toRecord (run : CompensationRun) : run.toRecord.toRun run.key = run := by
  simp only [RunRecord.toRun, CompensationRun.toRecord, CompensationRun.key]

/-- A record's run, field by field. -/
theorem toRun_eq (record : RunRecord) (key : RunKey) : record.toRun key =
    { trigger := key.trigger, scope := key.scope, pending := record.pending, running := record.running
      leave := record.leave, resume := record.resume, joins := record.joins } := by
  simp only [RunRecord.toRun]

@[simp] theorem key_toRun (record : RunRecord) (key : RunKey) : (record.toRun key).key = key := by
  simp only [RunRecord.toRun, CompensationRun.key]

@[simp] theorem scope_toRun (record : RunRecord) (key : RunKey) : (record.toRun key).scope = key.scope := by
  simp only [RunRecord.toRun]

@[simp] theorem trigger_toRun (record : RunRecord) (key : RunKey) : (record.toRun key).trigger = key.trigger := by
  simp only [RunRecord.toRun]

@[simp] theorem key_scope (run : CompensationRun) : run.key.scope = run.scope := by
  simp only [CompensationRun.key]

@[simp] theorem key_trigger (run : CompensationRun) : run.key.trigger = run.trigger := by
  simp only [CompensationRun.key]

theorem key_mk (run : CompensationRun) : run.key = { scope := run.scope, trigger := run.trigger } := by
  simp only [CompensationRun.key]

theorem toRecord_mk (run : CompensationRun) : run.toRecord =
    { pending := run.pending, running := run.running, leave := run.leave, resume := run.resume, joins := run.joins } := by
  simp only [CompensationRun.toRecord]

theorem key_eq_iff {run other : CompensationRun} : run.key = other.key ↔ run.scope = other.scope ∧ run.trigger = other.trigger := by
  simp only [CompensationRun.key, RunKey.mk.injEq]

/-- The list view of a literal's map. -/
@[simp] theorem runs_mk (retained : List Compensable) (runMap : RunMap) :
    ({ retained, runMap } : Compensations).runs = runList runMap := rfl

theorem mem_runList {m : RunMap} {run : CompensationRun} : run ∈ runList m ↔ m[run.key]? = some run.toRecord := by
  simp only [runList, List.mem_map]
  constructor
  · rintro ⟨⟨k, v⟩, inside, rfl⟩
    simpa using Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside
  · intro found
    exact ⟨(run.key, run.toRecord), Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr found, toRun_toRecord run⟩

/-- One run per key: the list view's keys are the map's distinct keys. -/
theorem runList_nodup (m : RunMap) : ((runList m).map (·.key)).Nodup := by
  have keys : (runList m).map (·.key) = m.toList.map (·.1) := by
    simp only [runList, List.map_map]
    exact List.map_congr_left fun entry _ => key_toRun entry.2 entry.1
  rw [keys, List.Nodup, List.pairwise_map]
  exact Std.ExtTreeMap.distinct_keys_toList.imp fun ne eq => ne (by rw [eq]; exact Std.ReflCmp.compare_self)

/-- So no two runs of the list view share a scope occurrence and a trigger (`isRun`'s key). -/
theorem runList_keyed (m : RunMap) : ((runList m).map fun run => (run.scope, run.trigger)).Nodup := by
  rw [List.Nodup, List.pairwise_map]
  exact (List.pairwise_map.mp (runList_nodup m)).imp fun apart same => apart (key_eq_iff.mpr (Prod.mk.inj same))

theorem runList_nodup' (m : RunMap) : (runList m).Nodup :=
  (List.pairwise_map.mp (runList_nodup m)).imp fun apart same => apart (congrArg CompensationRun.key same)

@[simp] theorem runList_empty : runList (∅ : RunMap) = [] := by simp [runList]

/-- A filter of the map filters the list view, in key order. -/
theorem runList_filter (m : RunMap) (f : RunKey → RunRecord → Bool) :
    runList (m.filter f) = (runList m).filter fun run => f run.key run.toRecord := by
  simp only [runList, Std.ExtTreeMap.toList_filter, List.filter_map]
  congr 1

/-- A map over the records filters nothing and keeps the keys: the list view maps each run. -/
theorem runList_map (m : RunMap) (f : RunKey → RunRecord → RunRecord) :
    runList (m.map f) = (runList m).map fun run => (f run.key run.toRecord).toRun run.key := by
  simp only [runList, Std.ExtTreeMap.toList_map, List.map_map]
  exact List.map_congr_left fun entry _ => by simp

/-- Erasing a key filters the list view. -/
theorem runList_erase (m : RunMap) (k : RunKey) : runList (m.erase k) = (runList m).filter (·.key != k) := by
  have : m.erase k = m.filter fun key _ => key != k := by
    ext key value
    rw [Std.ExtTreeMap.getElem?_erase, Std.ExtTreeMap.getElem?_filter']
    by_cases same : k = key
    · subst same; simp
    · have : compare k key ≠ .eq := fun eq => same (Std.LawfulEqCmp.eq_of_compare eq)
      simp [this, Ne.symm same]
  rw [this, runList_filter]

/-- Putting a run puts it in place of the one under its key. -/
theorem mem_runList_put {m : RunMap} {next run : CompensationRun} :
    run ∈ runList (m.put next) ↔ run = next ∨ (run ∈ runList m ∧ run.key ≠ next.key) := by
  rw [RunMap.put, mem_runList, mem_runList, Std.ExtTreeMap.getElem?_insert]
  constructor
  · intro found
    split at found
    · rename_i same
      have key := Std.LawfulEqCmp.eq_of_compare same
      have record := Option.some.inj found
      rw [← toRun_toRecord run, ← toRun_toRecord next, ← key, record]
      exact .inl rfl
    · rename_i apart
      exact .inr ⟨found, fun eq => apart (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro (rfl | ⟨found, apart⟩)
    · simp
    · rw [ite_eq_right fun same => apart (Std.LawfulEqCmp.eq_of_compare same).symm]; exact found

/-- The list view of one run's map is that run. -/
@[simp] theorem mem_runList_single {next run : CompensationRun} :
    run ∈ runList ((∅ : RunMap).put next) ↔ run = next := by
  rw [mem_runList_put]
  simp

/-- A run of the map a run was put into is one of the map or that run. -/
theorem mem_put_or {m : RunMap} {next run : CompensationRun} (member : run ∈ runList (m.put next)) :
    run ∈ runList m ∨ run = next :=
  (mem_runList_put.mp member).elim .inr fun old => .inl old.1

theorem mem_put_old {m : RunMap} {next run : CompensationRun} (inside : run ∈ runList m) (apart : run.key ≠ next.key) :
    run ∈ runList (m.put next) :=
  mem_runList_put.mpr (.inr ⟨inside, apart⟩)

theorem mem_put_new (m : RunMap) (next : CompensationRun) : next ∈ runList (m.put next) :=
  mem_runList_put.mpr (.inl rfl)

/-- Runs of two scope occurrences have two keys. -/
theorem key_ne_of_scope {run other : CompensationRun} (apart : run.scope ≠ other.scope) : run.key ≠ other.key :=
  fun same => apart (key_eq_iff.mp same).1

theorem mem_runList_erase {m : RunMap} {k : RunKey} {run : CompensationRun} :
    run ∈ runList (m.erase k) ↔ run ∈ runList m ∧ run.key ≠ k := by
  rw [runList_erase, List.mem_filter, bne_iff_ne]

/-- A filter of the map by the runs' scope occurrences filters the list view. -/
theorem mem_filter_scope {m : RunMap} {p : ScopeOccurrenceId → Bool} {run : CompensationRun} :
    run ∈ runList (m.filter fun key _ => p key.scope) ↔ run ∈ runList m ∧ p run.scope = true := by
  rw [runList_filter, List.mem_filter, key_scope]

/-- Taking a context off what the run under `k` runs maps the list view in place. -/
theorem runList_unhold (m : RunMap) (k : RunKey) (context : ScopeOccurrenceId) :
    runList (m.map fun key record =>
      if key == k then { record with running := record.running.filter (·.1 != context) } else record) =
      (runList m).map fun run =>
        if run.key == k then { run with running := run.running.filter (·.1 != context) } else run := by
  rw [runList_map]
  refine List.map_congr_left fun run _ => ?_
  split
  · cases run; rfl
  · exact toRun_toRecord run

/-- Up to order, putting a run drops the one under its key and adds it. -/
theorem runList_put_perm (m : RunMap) (next : CompensationRun) :
    (runList (m.put next)).Perm ((runList m).filter (·.key != next.key) ++ [next]) := by
  refine (List.perm_ext_iff_of_nodup (runList_nodup' _) ?_).mpr fun run => ?_
  · refine List.nodup_append.mpr ⟨(runList_nodup' m).filter _, (by simp), fun a inside b new same => ?_⟩
    rw [List.mem_singleton.mp new] at same
    subst same
    simp at inside
  · rw [mem_runList_put, List.mem_append, List.mem_filter, List.mem_singleton]
    constructor
    · rintro (rfl | ⟨inside, apart⟩)
      · exact .inr rfl
      · exact .inl ⟨inside, by simpa using apart⟩
    · rintro (⟨inside, apart⟩ | rfl)
      · exact .inr ⟨inside, by simpa using apart⟩
      · exact .inl rfl

/-- Putting a run the map holds changes nothing. -/
theorem put_mem {m : RunMap} {run : CompensationRun} (member : run ∈ runList m) : m.put run = m := by
  apply Std.ExtTreeMap.ext_getElem?
  intro k
  rw [RunMap.put, Std.ExtTreeMap.getElem?_insert]
  split
  · rename_i same
    rw [← Std.LawfulEqCmp.eq_of_compare same]
    exact (mem_runList.mp member).symm
  · rfl

/-- Putting a run under a key no run holds adds it, up to order. -/
theorem runList_put_fresh {m : RunMap} {next : CompensationRun} (fresh : ∀ other ∈ runList m, other.key ≠ next.key) :
    (runList (m.put next)).Perm (runList m ++ [next]) := by
  refine (runList_put_perm m next).trans (.of_eq ?_)
  rw [List.filter_eq_self.mpr fun other inside => bne_iff_ne.mpr (fresh other inside)]

/-- The list view of a map of one run. -/
@[simp] theorem runList_single (run : CompensationRun) : runList ((∅ : RunMap).put run) = [run] :=
  List.perm_singleton.mp ((runList_put_perm _ run).trans (by simp))

/-! ## The held map -/

theorem held_eq (slots : FeatureSlots) : slots.held = heldList slots.heldMap := rfl

theorem mem_heldList {m : HeldMap} {h : Held} : h ∈ heldList m ↔ m[h.occurrence]? = some h.scope := by
  simp only [heldList, List.mem_map]
  constructor
  · rintro ⟨⟨k, v⟩, inside, rfl⟩; exact Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside
  · intro found; exact ⟨(h.occurrence, h.scope), Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr found, rfl⟩

theorem heldList_empty : heldList (∅ : HeldMap) = [] := by simp [heldList]

/-- A filter by the scope occurrence filters the list view, in key order. -/
theorem heldList_filter (m : HeldMap) (p : ScopeOccurrenceId → Bool) :
    heldList (m.filter fun _ scope => p scope) = (heldList m).filter fun h => p h.scope := by
  simp only [heldList, Std.ExtTreeMap.toList_filter, List.filter_map]; rfl

theorem mem_heldList_filter {m : HeldMap} {p : ScopeOccurrenceId → Bool} {h : Held} :
    h ∈ heldList (m.filter fun _ scope => p scope) ↔ h ∈ heldList m ∧ p h.scope = true := by
  rw [heldList_filter, List.mem_filter]

/-- Holding an occurrence puts its entry in place of the one under its key. -/
theorem mem_heldList_insert {m : HeldMap} {k : OccurrenceId} {scope : ScopeOccurrenceId} {h : Held} :
    h ∈ heldList (m.insert k scope) ↔ h = { occurrence := k, scope } ∨ (h ∈ heldList m ∧ h.occurrence ≠ k) := by
  rw [mem_heldList, mem_heldList, Std.ExtTreeMap.getElem?_insert]
  constructor
  · intro found
    split at found
    · rename_i same
      obtain ⟨occurrence, scope'⟩ := h
      cases Std.LawfulEqCmp.eq_of_compare same
      cases Option.some.inj found
      exact .inl rfl
    · rename_i apart
      exact .inr ⟨found, fun eq => apart (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro (rfl | ⟨found, apart⟩)
    · simp
    · rw [ite_eq_right fun same => apart (Std.LawfulEqCmp.eq_of_compare same).symm]; exact found

/-! ## The Multi-Instance map -/

theorem multiInstances_eq (slots : FeatureSlots) : slots.multiInstances = multiInstanceList slots.multiInstanceMap := rfl

@[simp] theorem record_run (record : MultiInstanceRecord) (occurrence : OccurrenceId) :
    (record.toRun occurrence).toRecord = record := by
  simp only [MultiInstanceRecord.toRun, MultiInstanceRun.toRecord]

@[simp] theorem run_record (run : MultiInstanceRun) : run.toRecord.toRun run.occurrence = run := by
  simp only [MultiInstanceRecord.toRun, MultiInstanceRun.toRecord]

theorem record_instances (run : MultiInstanceRun) : run.toRecord.instances = run.instances := by
  simp only [MultiInstanceRun.toRecord]

/-- A record's run, field by field. -/
theorem run_eq (record : MultiInstanceRecord) (occurrence : OccurrenceId) : record.toRun occurrence =
    { scope := record.scope, element := record.element, occurrence, members := record.members, strings := record.strings
      instances := record.instances, results := record.results } := by
  simp only [MultiInstanceRecord.toRun]

/-- The list view of a literal's map. -/
@[simp] theorem multiInstances_mk (parked : List Parked) (heldMap : HeldMap) (multiInstanceMap : MultiInstanceMap)
    (compensation : Compensations) (instances : List InstanceData) :
    ({ parked, heldMap, multiInstanceMap, compensation, instances } : FeatureSlots).multiInstances =
      multiInstanceList multiInstanceMap := rfl

@[simp] theorem run_occurrence (record : MultiInstanceRecord) (occurrence : OccurrenceId) :
    (record.toRun occurrence).occurrence = occurrence := by
  simp only [MultiInstanceRecord.toRun]

theorem mem_multiInstanceList {m : MultiInstanceMap} {run : MultiInstanceRun} :
    run ∈ multiInstanceList m ↔ m[run.occurrence]? = some run.toRecord := by
  simp only [multiInstanceList, List.mem_map]
  constructor
  · rintro ⟨⟨k, v⟩, inside, rfl⟩; exact Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside
  · intro found; exact ⟨(run.occurrence, run.toRecord), Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr found, rfl⟩

/-- One run per body occurrence: the list view's body occurrences are the map's distinct keys. -/
theorem multiInstanceList_nodup (m : MultiInstanceMap) : ((multiInstanceList m).map (·.occurrence)).Nodup := by
  have keys : (multiInstanceList m).map (·.occurrence) = m.toList.map (·.1) := by
    simp only [multiInstanceList, List.map_map]; rfl
  rw [keys, List.Nodup, List.pairwise_map]
  exact Std.ExtTreeMap.distinct_keys_toList.imp fun ne eq => ne (by rw [eq]; exact Std.ReflCmp.compare_self)

@[simp] theorem multiInstanceList_empty : multiInstanceList (∅ : MultiInstanceMap) = [] := by simp [multiInstanceList]

/-- A filter of the map filters the list view, in key order: what clearing reads. -/
theorem multiInstanceList_filter_map (m : MultiInstanceMap) (f : OccurrenceId → MultiInstanceRecord → Bool) :
    multiInstanceList (m.filter f) = (multiInstanceList m).filter fun run => f run.occurrence run.toRecord := by
  simp only [multiInstanceList, Std.ExtTreeMap.toList_filter, List.filter_map]; rfl

@[simp] theorem record_scope (run : MultiInstanceRun) : run.toRecord.scope = run.scope := by
  simp only [MultiInstanceRun.toRecord]

/-- Setting a run puts it in place of the one under its body occurrence's key. -/
theorem mem_multiInstanceList_insert {m : MultiInstanceMap} {next run : MultiInstanceRun} :
    run ∈ multiInstanceList (m.insert next.occurrence next.toRecord) ↔
      run = next ∨ (run ∈ multiInstanceList m ∧ run.occurrence ≠ next.occurrence) := by
  rw [mem_multiInstanceList, mem_multiInstanceList, Std.ExtTreeMap.getElem?_insert]
  constructor
  · intro found
    split at found
    · rename_i same
      have key := Std.LawfulEqCmp.eq_of_compare same
      have record := Option.some.inj found
      rw [← run_record run, ← run_record next, ← key, record]
      exact .inl rfl
    · rename_i apart
      exact .inr ⟨found, fun eq => apart (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro (rfl | ⟨found, apart⟩)
    · simp
    · rw [ite_eq_right fun same => apart (Std.LawfulEqCmp.eq_of_compare same).symm]; exact found

/-- The list view of one run's map is that run. -/
@[simp] theorem mem_multiInstanceList_single {next run : MultiInstanceRun} :
    run ∈ multiInstanceList ((∅ : MultiInstanceMap).insert next.occurrence next.toRecord) ↔ run = next := by
  rw [mem_multiInstanceList_insert]
  simp

end Kernel.Laws.State
