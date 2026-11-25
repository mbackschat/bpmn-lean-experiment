module

public import Kernel.Laws.State.Called
public import Kernel.Laws.Step.Commit

/-! # Laws of the step function: a same-element pair's exact content (KD5)

Two units of one closure that each begin a fresh occurrence leave the same issue table, occurrences, counters and slots
in either order, and under `orderInvariant` the commit numbers both activations alike whatever the run log, so the
called instance a Call's activation names is the same in either order too: the exact-content law for a same-element
pair, P07's guard for the class seen twice (the elements are arbitrary, so the pair may share one). The draft is left
out: each unit's draft is journalled under the unit (`journalDraft`). Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step Kernel.Laws.State

/-- `request` begun fresh by `unit` as the running unit, from its first issue. -/
abbrev beginBy (unit : UnitKey) (request : BeginRequest) (role : ActivationRole) (sourceType : String) (s : State) :
    State × Occurrence :=
  ({ s with issuing := unit, issueNext := 0 }).beginOccurrence request role sourceType

private theorem instanceOf_issuer (s : State) (unit : UnitKey) (next : Nat) (x : ScopeOccurrenceId) :
    ({ s with issuing := unit, issueNext := next }).instanceOf x = s.instanceOf x :=
  instanceOf_congr (s := s) (t := { s with issuing := unit, issueNext := next }) rfl rfl x

/-- What a fresh begin keeps, for the pair: the counters, the slots, the process instances, and the occurrences but for
the begun one, which it inserts. -/
private theorem beginBy_keeps {unit : UnitKey} {request : BeginRequest} (fresh : request.reserved = none)
    (role : ActivationRole) (sourceType : String) {s : State} (keyed : ActivationsKeyed s) :
    (beginBy unit request role sourceType s).1.occurrenceMap =
        s.occurrenceMap.insert (beginBy unit request role sourceType s).2.id (beginBy unit request role sourceType s).2 ∧
      (beginBy unit request role sourceType s).1.activations = s.activations ∧
      (beginBy unit request role sourceType s).1.slots = s.slots ∧
      ((∀ x, (beginBy unit request role sourceType s).1.instanceOf x = s.instanceOf x) ∧
        ActivationsKeyed (beginBy unit request role sourceType s).1) := by
  have begins := beginOccurrence_begins (state := { s with issuing := unit, issueNext := 0 })
    ⟨keyed.keys, keyed.positive, keyed.resolved⟩ request role sourceType
  have activations := begins.activations
  refine ⟨?_, activations, begins.slots, fun x => (begins.instances x).trans (instanceOf_issuer s unit 0 x),
    by rw [activations]; exact keyed.keys, by rw [activations]; exact keyed.positive,
    by rw [activations]; exact keyed.resolved⟩
  rw [begins.occurrenceMap, Keyed.filter_eq_self fun _ o _ => by simp [fresh]]

/-- What a fresh begin by `unit` tables: its occurrence's key, then its activation, as `unit`'s first two issues. -/
private theorem beginBy_issued {request : BeginRequest} (fresh : request.reserved = none) (role : ActivationRole)
    (sourceType : String) (unit : UnitKey) (s : State) :
    (beginBy unit request role sourceType s).1.issued =
      (s.issued.insert (.fresh unit 0) (.occurrence ⟨request.scope, request.element⟩)).insert (.fresh unit 1)
        (.activation ⟨s.instanceOf request.scope, request.element, role⟩) := by
  rw [beginBy, (beginOccurrence_issues fresh role sourceType).2, instanceOf_issuer]

/-- What a fresh begin by `unit` begins: an occurrence keyed and numbered by `unit`'s first two issues. -/
private theorem beginBy_begun {request : BeginRequest} (fresh : request.reserved = none) (role : ActivationRole)
    (sourceType : String) (unit : UnitKey) (s : State) :
    (beginBy unit request role sourceType s).2 = ⟨⟨request.scope, request.element, .fresh unit 0⟩, request.element,
      request.scope, .fresh unit 1, .fresh unit 0, role, request.continuation, request.incoming, true⟩ :=
  (beginOccurrence_issues fresh role sourceType).1

private theorem issues_apart {u v : UnitKey} (distinct : u ≠ v) (i j : Nat) : Issue.fresh u i ≠ Issue.fresh v j :=
  fun same => distinct (Issue.fresh.inj same).1

/-- **Exact content, part 1.** Two units each beginning a fresh occurrence, in either order: the same issue table,
occurrences, counters and slots, and `u`'s occurrence (key, activation, position) the same. -/
theorem begins_commute {u v : UnitKey} (distinct : u ≠ v) {r r' : BeginRequest} (freshR : r.reserved = none)
    (freshR' : r'.reserved = none) (role role' : ActivationRole) (st st' : String) {s : State} (keyed : ActivationsKeyed s) :
    let ab := beginBy v r' role' st' (beginBy u r role st s).1
    let ba := beginBy u r role st (beginBy v r' role' st' s).1
    ab.1.issued = ba.1.issued ∧ ab.1.occurrenceMap = ba.1.occurrenceMap ∧ ab.1.activations = ba.1.activations ∧
      ab.1.slots = ba.1.slots ∧ (beginBy u r role st s).2 = ba.2 := by
  intro ab ba
  obtain ⟨mapU, countsU, slotsU, ⟨instancesU, keyedU⟩⟩ := beginBy_keeps (unit := u) freshR role st keyed
  obtain ⟨mapV, countsV, slotsV, ⟨instancesV, keyedV⟩⟩ := beginBy_keeps (unit := v) freshR' role' st' keyed
  obtain ⟨mapAB, countsAB, slotsAB, -⟩ := beginBy_keeps (unit := v) freshR' role' st' keyedU
  obtain ⟨mapBA, countsBA, slotsBA, -⟩ := beginBy_keeps (unit := u) freshR role st keyedV
  have keys : (⟨r.scope, r.element, .fresh u 0⟩ : OccurrenceId) ≠ ⟨r'.scope, r'.element, .fresh v 0⟩ :=
    fun same => issues_apart distinct 0 0 (congrArg OccurrenceId.ordinal same)
  refine ⟨?_, ?_, countsAB.trans (countsU.trans (countsBA.trans countsV).symm), slotsAB.trans
    (slotsU.trans (slotsBA.trans slotsV).symm), ?_⟩
  · rw [beginBy_issued freshR' role' st' v, beginBy_issued freshR role st u, beginBy_issued freshR role st u,
      beginBy_issued freshR' role' st' v, instancesU, instancesV]
    exact Keyed.insert_pairs_comm _ _ _ _ _ (issues_apart distinct 0 0) (issues_apart distinct 0 1)
      (issues_apart distinct 1 0) (issues_apart distinct 1 1)
  · rw [mapAB, mapBA, mapU, mapV, beginBy_begun freshR' role' st' v, beginBy_begun freshR role st u,
      beginBy_begun freshR role st u, beginBy_begun freshR' role' st' v]
    exact Keyed.insert_comm_ne _ _ _ keys
  · rw [beginBy_begun freshR role st u, beginBy_begun freshR role st u]

/-- Under `orderInvariant` the commit numbers every activation of the pair alike in either order, whatever the two runs'
logs: `u`'s activation (`fresh u 1`) takes one committed number, and so does every identity derived from it. -/
theorem pair_numbered_alike {u v : UnitKey} (distinct : u ≠ v) {r r' : BeginRequest} (freshR : r.reserved = none)
    (freshR' : r'.reserved = none) (role role' : ActivationRole) (st st' : String) {s : State} (keyed : ActivationsKeyed s)
    (start : State) (log log' : RunLog) :
    let ab := (beginBy v r' role' st' (beginBy u r role st s).1).1
    let ba := (beginBy u r role st (beginBy v r' role' st' s).1).1
    assign .orderInvariant start log ab = assign .orderInvariant start log' ba := by
  intro ab ba
  have same := begins_commute distinct freshR freshR' role role' st st' keyed
  exact assign_orderInvariant_congr start log log' same.1 same.2.1 same.2.2.2.1

/-- The called instance a Call's activation names, once the commit numbers it: the same in either order. -/
theorem called_alike {u v : UnitKey} (distinct : u ≠ v) {r r' : BeginRequest} (freshR : r.reserved = none)
    (freshR' : r'.reserved = none) (role role' : ActivationRole) (st st' : String) {s : State} (keyed : ActivationsKeyed s)
    (start : State) (log log' : RunLog) (caller : String) (call : ElementId) :
    let ab := (beginBy v r' role' st' (beginBy u r role st s).1).1
    let ba := (beginBy u r role st (beginBy v r' role' st' s).1).1
    State.calledInstanceId caller call (renameBy (assign .orderInvariant start log ab).1 (.fresh u 1)).number =
      State.calledInstanceId caller call (renameBy (assign .orderInvariant start log' ba).1 (.fresh u 1)).number := by
  intro ab ba
  rw [pair_numbered_alike distinct freshR freshR' role role' st st' keyed start log log']

end Kernel.Laws.Step
