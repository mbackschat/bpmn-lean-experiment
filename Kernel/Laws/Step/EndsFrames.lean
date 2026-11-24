module

public import Kernel.Laws.Step.Contract
public import Kernel.Laws.State.RemovalKeeps
public import Kernel.Laws.State.Enter

/-! # Laws of the step function: what each state operation does to the end facts

Each state operation a hook or a phase of `Step` applies frames the end facts (`EndsStep`): what it adds to them are
the keys of the begun occurrences it removes, each once, and every occurrence it leaves keeps its key. The frames compose
`Laws.State`'s equations and frames of each operation (`Laws.State.Enters`, `Reserves`, `Begins`, `StartsReserved`,
`Cleared`, `Left`, `SameButVariables`) with what clearing and cancelling journal (`Laws.State.clearInside_ends`,
`Laws.State.cancelOccurrence_ended`) and the instance identity clearing keeps (`Laws.State.clearInside_instanceId`).
`Kernel.Laws.Step.Ends` carries an input's end facts through them. The module reads no body. Nothing executable imports
it.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {le : Issue → Issue → Bool}

open Kernel
open Kernel.Laws.State (WellFormed key Counted CountsGrow occurrenceIds scopeIds Within StrictlyWithin)

/-- The keys of the end facts of the input in progress: its units' transitions' and its draft's. The journal holds
none until the commit orders the transitions into it (`Step.orderJournal`). -/
def endKeys (s : State) : List OccurrenceKey :=
  ((s.transitions.toList.map (·.2)).flatMap (·.ended) ++ s.draft.ended).map (·.1)

theorem counted_grow {s t : State} (grow : CountsGrow s t) {k : OccurrenceKey} (counted : Counted s k) : Counted t k := by
  obtain ⟨count, member, named, ⟨element, role, below⟩⟩ := counted
  obtain ⟨grown, inside, named', ⟨element', role', more⟩⟩ := grow count member
  exact ⟨grown, inside, named'.trans named, element'.trans element, role'.trans role, Nat.le_trans below more⟩

/-- `o'` of `t` holds the key of the unbegun occurrence `o` of `s`, which `t` no longer holds and `spare` does not name,
under an identity `s` never issued: a reservation re-keyed where it begins (DC26). -/
structure TakesKey (s t : State) (spare : Option OccurrenceId) (o' o : Occurrence) : Prop where
  unbegun : o.begun = false
  spared : spare ≠ some o.id
  absent : o.id ∉ occurrenceIds t
  keyed : key t o' = key s o
  fresh : ¬ Laws.State.OccurrenceIssued s o'.id

/-- What a state operation from `s` to `t` does to the end facts, sparing `spare`'s removal from being journalled: every
occurrence `t` holds is one of `s` under the same key, unchanged if begun, a fresh one whose key `s`'s counters have
not issued, or a fresh one under the key of an unbegun occurrence of `s` that `t` no longer holds and `spare` does not
name (a reservation re-keyed where it begins, DC26); the end facts `t` adds are the keys in `s` of begun occurrences of
`s` it no longer holds, each once, among them every such occurrence but `spare`; the instance stays, and the counters and
the keys issued stay or grow. -/
structure EndsStep (s t : State) (spare : Option OccurrenceId) : Prop where
  instanceId : t.instanceId = s.instanceId
  issued : Laws.State.OccurrenceGrows s t
  grow : CountsGrow s t
  held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
    (¬ Laws.State.OccurrenceIssued s o'.id ∧ ¬ Counted s (key t o')) ∨
    ∃ o ∈ s.occurrences, TakesKey s t spare o' o
  ends : ∃ gone : List Occurrence, (endKeys t).Perm (endKeys s ++ gone.map (key s)) ∧ (gone.map (·.id)).Nodup ∧
    (∀ o ∈ gone, o ∈ s.occurrences ∧ spare ≠ some o.id ∧ o.id ∉ occurrenceIds t ∧ o.begun = true) ∧
    ∀ o ∈ s.occurrences, o.begun = true → o.id ∉ occurrenceIds t → spare ≠ some o.id → o ∈ gone

/-! ## Composing frames -/

section Compose

variable {program : Program} {s u t : State}

theorem countsGrow_same (same : t.activations = s.activations) : CountsGrow s t :=
  fun count member => ⟨count, same ▸ member, rfl, rfl, rfl, Nat.le_refl _⟩

/-- A counter step raises one counter and keeps the others. -/
theorem countsGrow_activated {inst : String} {element : ElementId} {role : ActivationRole} {n : Nat}
    (activated : Laws.State.Activated s t inst element role n) : CountsGrow s t := fun count member => by
  rw [activated.activations]
  by_cases raised : (count.processInstance == inst && count.element == element && count.role == role) = true
  · simp only [Bool.and_eq_true, beq_iff_eq] at raised
    obtain ⟨⟨one, two⟩, three⟩ := raised
    exact ⟨_, List.mem_cons_self .., one.symm, two.symm, three.symm,
      Nat.le_of_lt (activated.above count member one two three)⟩
  · refine ⟨count, List.mem_cons_of_mem _ (List.mem_filter.mpr ⟨member, ?_⟩), rfl, rfl, rfl, Nat.le_refl _⟩
    rw [Bool.not_eq_true']
    exact Bool.eq_false_iff.mpr raised

/-- An operation that removes no begun occurrence and adds no end fact frames the end facts, sparing nothing. -/
theorem EndsStep.quiet (instanceId : t.instanceId = s.instanceId) (issued : Laws.State.OccurrenceGrows s t)
    (grow : CountsGrow s t) (ends : endKeys t = endKeys s)
    (held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
      (¬ Laws.State.OccurrenceIssued s o'.id ∧ ¬ Counted s (key t o')) ∨
      ∃ o ∈ s.occurrences, TakesKey s t none o' o)
    (stays : ∀ o ∈ s.occurrences, o.begun = true → o.id ∈ occurrenceIds t) : EndsStep s t none where
  instanceId := instanceId
  issued := issued
  grow := grow
  held := held
  ends := ⟨[], by rw [ends]; simp, .nil, by simp, fun o member begun absent _ => absurd (stays o member begun) absent⟩

/-- An operation that changes nothing `EndsStep` reads but drops unbegun occurrences frames the end facts. -/
theorem EndsStep.prune (tree : t.scopes = s.scopes ∧ t.instanceId = s.instanceId) (issued : Laws.State.OccurrenceGrows s t)
    (counters : t.activations = s.activations) (ends : endKeys t = endKeys s)
    (within : ∀ o ∈ t.occurrences, o ∈ s.occurrences) (stays : ∀ o ∈ s.occurrences, o.begun = true → o ∈ t.occurrences) :
    EndsStep s t none :=
  .quiet tree.2 issued (countsGrow_same counters) ends
    (fun o' inside => .inl ⟨o', within o' inside, rfl,
      Laws.State.key_congr (Laws.State.instanceOf_congr tree.1 tree.2 _), fun _ => rfl⟩)
    fun o member begun => List.mem_map.mpr ⟨o, stays o member begun, rfl⟩

theorem EndsStep.refl : EndsStep s s none :=
  .prune ⟨rfl, rfl⟩ (.refl _) rfl rfl (fun _ => id) fun _ member _ => member

/-- An occurrence `t` holds of a well-formed `s`'s occurrences, which `s`'s frame to `t` kept, has the same key. -/
private theorem kept_key (formed : WellFormed program s) (step : EndsStep s t none) {o : Occurrence}
    (inS : o ∈ s.occurrences) (inT : o ∈ t.occurrences) : key t o = key s o := by
  rcases step.held o inT with ⟨o', held, same, ⟨keyed, _⟩⟩ | ⟨fresh, _⟩ | ⟨_, _, takes⟩
  · obtain rfl := Laws.State.nodup_map_eq formed.distinct.occurrences inS held same
    exact keyed
  · exact absurd (formed.issued.occurrences o inS) fresh
  · exact absurd (formed.issued.occurrences o inS) takes.fresh

/-- Two frames compose when the first adds no occurrence and the second spares only an occurrence the first leaves. -/
theorem EndsStep.trans {spare : Option OccurrenceId} (formed : WellFormed program s)
    (sub : ∀ o ∈ u.occurrences, o ∈ s.occurrences) (first : EndsStep s u none) (second : EndsStep u t spare)
    (spared : ∀ id, spare = some id → id ∈ occurrenceIds u) : EndsStep s t spare := by
  have keyed : ∀ o ∈ u.occurrences, key u o = key s o := fun o inU => kept_key formed first (sub o inU) inU
  obtain ⟨gone, perm, ids, ⟨within, complete⟩⟩ := first.ends
  obtain ⟨gone', perm', ids', ⟨within', complete'⟩⟩ := second.ends
  have later : ∀ o ∈ gone, o.id ∉ occurrenceIds t := fun o inGone held => by
    obtain ⟨o', inT, same⟩ := List.mem_map.mp held
    rcases second.held o' inT with ⟨o'', inU, named, _⟩ | ⟨fresh, _⟩ | ⟨_, _, takes⟩
    · exact (within o inGone).2.2.1 (List.mem_map.mpr ⟨o'', inU, named.symm.trans same⟩)
    · exact fresh (by rw [same]; exact first.issued _ (formed.issued.occurrences o (within o inGone).1))
    · exact takes.fresh (by rw [same]; exact first.issued _ (formed.issued.occurrences o (within o inGone).1))
  refine ⟨second.instanceId.trans first.instanceId, first.issued.trans second.issued, fun count member => ?_,
    fun o' inT => ?_, gone ++ gone', ?_, ?_, fun o inGone => ?_, fun o member begun absent other => ?_⟩
  · obtain ⟨grown, inside, named, ⟨element, role, below⟩⟩ := first.grow count member
    obtain ⟨grown', inside', named', ⟨element', role', below'⟩⟩ := second.grow grown inside
    exact ⟨grown', inside', named'.trans named, element'.trans element, role'.trans role, Nat.le_trans below below'⟩
  · rcases second.held o' inT with ⟨o, inU, same, ⟨keyedT, unchanged⟩⟩ | ⟨fresh, uncounted⟩ | ⟨o, inU, takes⟩
    · exact .inl ⟨o, sub o inU, same, keyedT.trans (keyed o inU), unchanged⟩
    · exact .inr (.inl ⟨fun issued => fresh (first.issued _ issued),
        fun counted => uncounted (counted_grow first.grow counted)⟩)
    · exact .inr (.inr ⟨o, sub o inU, takes.unbegun, takes.spared, takes.absent, takes.keyed.trans (keyed o inU),
        fun issued => takes.fresh (first.issued _ issued)⟩)
  · refine perm'.trans ?_
    rw [List.map_append, ← List.append_assoc, List.map_congr_left fun o inGone => keyed o (within' o inGone).1]
    exact perm.append_right _
  · rw [List.map_append]
    refine List.nodup_append.mpr ⟨ids, ids', fun x old y new same => ?_⟩
    obtain ⟨o, inGone, rfl⟩ := List.mem_map.mp old
    obtain ⟨o', inGone', rfl⟩ := List.mem_map.mp new
    exact (within o inGone).2.2.1 (same ▸ List.mem_map.mpr ⟨o', (within' o' inGone').1, rfl⟩)
  · rcases List.mem_append.mp inGone with old | new
    · exact ⟨(within o old).1, fun named => (within o old).2.2.1 (spared _ named), later o old, (within o old).2.2.2⟩
    · exact ⟨sub o (within' o new).1, (within' o new).2⟩
  · by_cases inU : o.id ∈ occurrenceIds u
    · obtain ⟨o'', held, named⟩ := List.mem_map.mp inU
      rcases first.held o'' held with ⟨o0, inS, same, ⟨_, unchanged⟩⟩ | ⟨fresh, _⟩ | ⟨_, _, takes⟩
      · obtain rfl := Laws.State.nodup_map_eq formed.distinct.occurrences inS member (same.symm.trans named)
        obtain rfl := unchanged begun
        exact List.mem_append_right _ (complete' _ held begun absent other)
      · exact absurd (by rw [named]; exact formed.issued.occurrences o member) fresh
      · exact absurd (by rw [named]; exact formed.issued.occurrences o member) takes.fresh
    · exact List.mem_append_left _ (complete o member begun inU (by simp))

/-- Removing occurrences of `s` and journalling, once each, the keys of the begun ones among them frames the end facts. -/
theorem EndsStep.remove (formed : WellFormed program s) (instanceId : t.instanceId = s.instanceId)
    (issued : Laws.State.OccurrenceGrows s t) (counters : t.activations = s.activations)
    (transitions : t.transitions = s.transitions) (within : ∀ o ∈ t.occurrences, o ∈ s.occurrences) (keyed : ∀ o ∈ t.occurrences, key t o = key s o)
    {gone : List Occurrence} (ended : t.draft.ended = s.draft.ended ++ gone.map (fun o => (key s o, Terminal.cancelled)))
    (ids : (gone.map (·.id)).Nodup)
    (exactly : ∀ o, o ∈ gone ↔ o ∈ s.occurrences ∧ o.begun = true ∧ o ∉ t.occurrences) : EndsStep s t none := by
  have absent : ∀ o ∈ s.occurrences, o ∉ t.occurrences → o.id ∉ occurrenceIds t := fun o member out held => by
    obtain ⟨o', inT, same⟩ := List.mem_map.mp held
    exact out (Laws.State.nodup_map_eq formed.distinct.occurrences (within o' inT) member same ▸ inT)
  refine ⟨instanceId, issued, countsGrow_same counters,
    fun o' inside => .inl ⟨o', within o' inside, rfl, keyed o' inside, fun _ => rfl⟩, gone, ?_, ids, fun o inGone => ?_,
    fun o member begun out _ => (exactly o).mpr ⟨member, begun, fun inT => out (List.mem_map.mpr ⟨o, inT, rfl⟩)⟩⟩
  · have same : endKeys t = endKeys s ++ gone.map (key s) := by
      simp [endKeys, transitions, ended, Function.comp_def]
    rw [same]
  · obtain ⟨member, flag, out⟩ := (exactly o).mp inGone
    exact ⟨member, by simp, absent o member out, flag⟩

end Compose

/-! ## The operations the hooks apply -/

section Hooks

variable {program : Program} {s t : State}

/-- Entering a scope occurrence below a parent, under a key no scope occurrence holds, keeps every occurrence and its
key. -/
theorem enters_frame (formed : WellFormed program s) {entry : ScopeOccurrence} {locals : List (String × Value)}
    (enters : Laws.State.ScopeAppended s t entry locals) (apart : ∀ old ∈ s.scopes, old.id ≠ entry.id)
    (parented : entry.parent ≠ none) (issued : Laws.State.OccurrenceGrows s t) : EndsStep s t none := by
  have keyedAfter : Laws.State.ScopesKeyed t.scopeMap := by
    rw [enters.scopeMap]; exact Laws.State.scopesKeyed_insert formed.distinct.scopesKeyed entry
  have nodup : (scopeIds t).Nodup := Laws.State.scopeList_nodup keyedAfter
  have members := fun found => enters.mem_scopes (found := found) formed.distinct.scopesKeyed apart
  have keyed : ∀ o ∈ s.occurrences, key t o = key s o := fun o member =>
    Laws.State.key_congr (Laws.State.instanceOf_kept formed nodup (fun e inside orphan => by
        rcases (members e).mp inside with old | rfl
        · exact (formed.rooted.2.1 e old).mp orphan
        · exact absurd orphan parented)
      enters.instanceId (formed.owned.occurrenceScopes o member)
      fun e inside _ => (members e).mpr (.inl inside))
  refine .quiet enters.instanceId issued (countsGrow_same enters.activations)
    (by simp [endKeys, enters.transitions, enters.draft]) (fun o' inside => ?_) fun o member _ => ?_
  · rw [enters.occurrences] at inside
    exact .inl ⟨o', inside, rfl, keyed o' inside, fun _ => rfl⟩
  · rw [occurrenceIds, enters.occurrences]
    exact List.mem_map.mpr ⟨o, member, rfl⟩

theorem enterScope_frame (formed : WellFormed program s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) (owner : Option OccurrenceId) :
    EndsStep s (s.enterScope element parent locals owner).1 none := by
  have issued := Laws.State.enterScope_occurrenceGrows formed.historic formed.issuer element stands locals owner
  rw [Laws.State.enterScope_eq] at issued ⊢
  -- The entry's fields as holes: the scope map's insert names its key through the entry, which unification cannot read
  -- back from a bare metavariable.
  refine enters_frame formed (entry := { id := _, element := _, position := _, occurrence := _, calledInstance := _ }) {
      occurrenceOrdinals := rfl, scopeMap := rfl, variables := rfl, occurrenceMap := rfl, itemMap := ⟨rfl, rfl⟩,
      tokens := rfl, signals := rfl, activations := rfl, journal := rfl, transitions := rfl, draft := rfl, status := rfl, failure := rfl,
      instanceId := rfl, slots := .same rfl } ?_ (by simp) issued
  exact Laws.State.scopes_fresh formed

theorem enterCalled_frame (formed : WellFormed program s) (called : Program) {call : Occurrence}
    (stands : call.scope ∈ scopeIds s) (variables : List (String × Value)) (definition : DefinitionRef) :
    EndsStep s (s.enterCalled called call variables definition).1 none := by
  have issued := Laws.State.enterCalled_occurrenceGrows formed called stands variables definition
  rw [Laws.State.enterCalled_eq _ _ _ _ _] at issued ⊢
  refine enters_frame formed (entry := { id := _, element := _, position := _, occurrence := _, calledInstance := _ }) {
      occurrenceOrdinals := rfl, scopeMap := rfl, variables := rfl, occurrenceMap := rfl, itemMap := ⟨rfl, rfl⟩,
      tokens := rfl, signals := rfl, activations := rfl, journal := rfl, transitions := rfl, draft := rfl, status := rfl, failure := rfl,
      instanceId := rfl, slots := ⟨fun _ inside => inside, fun _ inside => inside, fun _ inside => inside⟩ }
    ?_ (by simp) issued
  exact Laws.State.scopes_fresh formed

/-- A reservation in a scope occurrence that stands is a fresh occurrence under a key never issued, whose public key
the counters had not issued. -/
theorem reserve_frame (formed : WellFormed program s) (element : ElementId)
    {scope : ScopeOccurrenceId} (stands : scope ∈ scopeIds s) : EndsStep s (s.reserve element scope).1 none := by
  have reserves := Laws.State.reserve_reserves s element scope
  have activated := reserves.activated formed.activations
  refine .quiet reserves.instanceId (reserves.occurrenceGrows formed.issuer) (countsGrow_activated activated)
    (by simp [endKeys, reserves.transitions, reserves.draft]) (fun o' inside => ?_) fun o member _ => ?_
  · rcases reserves.mem_occurrences inside with old | new
    · exact .inl ⟨o', old, rfl, Laws.State.key_congr (reserves.instances _), fun _ => rfl⟩
    · subst new
      refine .inr (.inl ⟨reserves.fresh formed.issuer (by rw [reserves.placed]; exact stands),
        fun counted => activated.fresh counted ?_⟩)
      simp [key, reserves.instances, reserves.placed, reserves.kind, reserves.role]
  · exact List.mem_map.mpr ⟨o, reserves.mem_of member, rfl⟩

/-- Clearing a present scope occurrence, keeping occurrences that lie in no scope occurrence strictly within it,
journals the begun occurrences it removes. -/
theorem clearInside_frame (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) {keep : List OccurrenceId}
    (kept : ∀ o ∈ s.occurrences, o.id ∈ keep → ¬ StrictlyWithin s o.scope scope) :
    EndsStep s (s.clearInside le scope keep) none := by
  have cleared := Laws.State.clearInside_cleared (le := le) formed present keep
  obtain ⟨gone, ended, ids, exactly⟩ := Laws.State.clearInside_ends formed present keep
  refine .remove formed (Laws.State.clearInside_instanceId s scope keep) cleared.occurrenceGrows cleared.activations
    cleared.transitions cleared.occurrencesSublist.subset (fun o inside => ?_) ended ids fun o => (exactly o).trans ?_
  · obtain ⟨member, stays⟩ := (cleared.occurrences o).mp inside
    obtain ⟨entry, inScope, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes o member)
    refine Laws.State.key_congr (cleared.instances _ (List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr
      ⟨inScope, fun strictly => ?_⟩, named⟩))
    rcases stays with outside | keeps
    · exact outside (named ▸ strictly.1)
    · exact kept o member keeps (named ▸ strictly)
  · constructor
    · rintro ⟨member, begun, within, out⟩
      exact ⟨member, begun, fun inside => ((cleared.occurrences o).mp inside).2.elim (· within) out⟩
    · rintro ⟨member, begun, out⟩
      exact ⟨member, begun, Classical.byContradiction fun outside => out ((cleared.occurrences o).mpr ⟨member, .inl outside⟩),
        fun keeps => out ((cleared.occurrences o).mpr ⟨member, .inr keeps⟩)⟩

/-- Leaving a present scope occurrence journals the begun occurrences within it. -/
theorem leaveScope_frame (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) : EndsStep s (s.leaveScope le scope) none := by
  have left := Laws.State.leaveScope_left (le := le) formed present
  obtain ⟨gone, ended, ids, exactly⟩ := Laws.State.clearInside_ends formed present []
  have drafted : (s.leaveScope le scope).draft = (s.clearInside le scope).draft :=
    (congrArg State.draft (Laws.State.leaveScope_eq s scope).1).trans rfl
  refine .remove formed (Laws.State.leaveScope_eq s scope).2 left.occurrenceGrows left.activations left.transitions
    left.occurrencesSublist.subset (fun o inside => ?_) (drafted ▸ ended) ids fun o => (exactly o).trans ?_
  · obtain ⟨member, outside⟩ := (left.occurrences o).mp inside
    obtain ⟨entry, inScope, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes o member)
    exact Laws.State.key_congr (left.instances _ (List.mem_map.mpr ⟨entry, (left.scopes entry).mpr
      ⟨inScope, named ▸ outside⟩, named⟩))
  · constructor
    · rintro ⟨member, begun, within, _⟩
      exact ⟨member, begun, fun inside => ((left.occurrences o).mp inside).2 within⟩
    · rintro ⟨member, begun, out⟩
      exact ⟨member, begun, Classical.byContradiction fun outside => out ((left.occurrences o).mpr ⟨member, outside⟩),
        List.not_mem_nil⟩

/-- Disarming drops reservations only. -/
theorem disarm_frame (s : State) (host : OccurrenceId) : EndsStep s (s.disarm host) none := by
  rw [Laws.State.disarm_eq]
  exact .prune ⟨rfl, rfl⟩ (.refl _) rfl rfl (fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1)
    fun _ member begun => Laws.State.mem_occurrenceList_filter_val.mpr ⟨member, by simp [begun]⟩

theorem setVariable_frame (s : State) (target : ScopeOccurrenceId) (name : String)
    (value : Value) : EndsStep s (s.setVariable target name value) none :=
  have same := Laws.State.setVariable_same s target name value
  .prune ⟨same.scopes, same.instanceId⟩
    (.of_same (congrArg (List.map ScopeOccurrence.id) same.scopes) same.scopeOrdinals same.occurrenceOrdinals
      (.of_eq same.issued)) same.activations
    (by simp [endKeys, same.transitions, same.draft]) (fun _ inside => same.occurrences ▸ inside)
    fun _ member _ => same.occurrences ▸ member

theorem removeVariable_frame (s : State) (target : ScopeOccurrenceId) (name : String) :
    EndsStep s (s.removeVariable target name) none :=
  have same := Laws.State.removeVariable_same s target name
  .prune ⟨same.scopes, same.instanceId⟩
    (.of_same (congrArg (List.map ScopeOccurrence.id) same.scopes) same.scopeOrdinals same.occurrenceOrdinals
      (.of_eq same.issued)) same.activations
    (by simp [endKeys, same.transitions, same.draft]) (fun _ inside => same.occurrences ▸ inside)
    fun _ member _ => same.occurrences ▸ member

end Hooks

/-! ## The operations of `Step` -/

section Phases

variable {program : Program} {s : State}

/-- Beginning an admitted request in a scope occurrence that stands begins its reservation under its key, or a fresh
occurrence under a key the counters had not issued, or re-keys its reservation under a fresh key (DC26). -/
theorem beginOccurrence_frame (formed : WellFormed program s) {request : BeginRequest}
    (stands : ScopeStands s request.scope) (admitted : Admitted s request) (role : ActivationRole) (sourceType : String) :
    EndsStep s (s.beginOccurrence request role sourceType).1 none := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  have present : request.scope ∈ scopeIds s := by
    obtain ⟨entry, inside, named⟩ := stands
    exact List.mem_map.mpr ⟨entry, inside, named⟩
  generalize made : s.beginOccurrence request role sourceType = pair at begins
  obtain ⟨t, begun⟩ := pair
  dsimp only at begins
  have keyed : ∀ o, key t o = key s o := fun o => Laws.State.key_congr (begins.instances _)
  have issued : Laws.State.OccurrenceGrows s t ∧ CountsGrow s t := by
    rcases begins.source with ⟨_, reserved⟩ | ⟨_, rekeyed⟩ | fresh
    · exact ⟨.of_same (congrArg (List.map ScopeOccurrence.id) begins.scopes) begins.scopeOrdinals
        reserved.occurrenceOrdinals (begins.table formed.issuer), countsGrow_same reserved.activations⟩
    · exact ⟨rekeyed.occurrenceGrows formed.issuer, countsGrow_same rekeyed.activations⟩
    · exact ⟨fresh.occurrenceGrows formed.issuer, countsGrow_activated fresh.activated⟩
  refine .quiet begins.instanceId issued.1 issued.2 (by simp [endKeys, begins.transitions, begins.ended])
    (fun o' inside => ?_) fun o member flag => ?_
  · rcases begins.mem_occurrences inside with old | new
    · exact .inl ⟨o', old, rfl, keyed o', fun _ => rfl⟩
    · subst new
      rcases begins.source with ⟨reserved, facts⟩ | ⟨reserved, rekeyed⟩ | fresh
      · have named : reserved.id ∈ Laws.State.names request := by simp [Laws.State.names, facts.named]
        obtain ⟨_, beginnable⟩ := (admitted.2.1 reserved.id named).1
        obtain ⟨unbegun, _, sameInstance⟩ := beginnable reserved facts.member rfl
        refine .inl ⟨reserved, facts.member, facts.id, ?_, fun begun => by simp [unbegun] at begun⟩
        simp [key, begins.instances, begins.scope, sameInstance present, facts.element, facts.activation,
          facts.role]
      · have named : reserved.id ∈ Laws.State.names request := by simp [Laws.State.names, rekeyed.named]
        obtain ⟨_, beginnable⟩ := (admitted.2.1 reserved.id named).1
        obtain ⟨unbegun, _, sameInstance⟩ := beginnable reserved rekeyed.member rfl
        have absent : reserved.id ∉ occurrenceIds t := by
          rw [occurrenceIds, ((begins.occurrences formed.distinct.occurrencesKeyed).map _).mem_iff, List.map_append,
            List.mem_append]
          rintro (old | new)
          · obtain ⟨o, inside, same⟩ := List.mem_map.mp old
            have kept := (List.mem_filter.mp inside).2
            simp [rekeyed.named, same] at kept
          · simp only [List.map_cons, List.map_nil, List.mem_singleton] at new
            exact rekeyed.fresh formed.issuer present (new ▸ formed.issued.occurrences reserved rekeyed.member)
        refine .inr (.inr ⟨reserved, rekeyed.member, unbegun, by simp, absent, ?_, rekeyed.fresh formed.issuer present⟩)
        simp [key, begins.instances, begins.scope, sameInstance present, rekeyed.element, rekeyed.activation,
          rekeyed.role]
      · refine .inr (.inl ⟨fresh.fresh formed.issuer present, fun counted => fresh.activated.fresh counted ?_⟩)
        simp [key, begins.instances, begins.scope, fresh.element, fresh.roled]
  · rw [occurrenceIds, ((begins.occurrences formed.distinct.occurrencesKeyed).map _).mem_iff, List.map_append,
      List.mem_append]
    by_cases same : o.id = begun.id
    · exact .inr (by simp [same])
    · refine .inl (List.mem_map.mpr ⟨o, List.mem_filter.mpr ⟨member, ?_⟩, rfl⟩)
      by_cases named : request.reserved = some o.id
      · obtain ⟨_, beginnable⟩ := (admitted.2.1 o.id (by simp [Laws.State.names, named])).1
        obtain ⟨unbegun, _, _⟩ := beginnable o member rfl
        simp [unbegun] at flag
      · simp [same, named]

/-- Starting a reservation begins it under its key. -/
theorem startReserved_frame (formed : WellFormed program s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) (sourceType : String) :
    EndsStep s (s.startReserved occurrence sourceType).1 none := by
  cases flag : occurrence.begun
  · have starts := Laws.State.startReserved_starts s sourceType flag
    refine .quiet starts.instanceId (.of_same (congrArg (List.map ScopeOccurrence.id) starts.scopes) starts.scopeOrdinals
      starts.occurrenceOrdinals (.of_eq starts.issued)) (countsGrow_same starts.activations)
      (by simp [endKeys, starts.transitions, starts.ended]) (fun o' inside => ?_) fun o inS _ => ?_
    · rw [(starts.occurrences formed.distinct.occurrencesKeyed member).mem_iff] at inside
      obtain ⟨other, inS, rfl⟩ := List.mem_map.mp inside
      by_cases same : other.id = occurrence.id
      · obtain rfl := Laws.State.nodup_map_eq formed.distinct.occurrences inS member same
        refine .inl ⟨other, inS, by simp, ?_, fun begun => by simp [flag] at begun⟩
        simp [key, starts.instances]
      · exact .inl ⟨other, inS, by simp [same], by simp [same, key, starts.instances], fun _ => by simp [same]⟩
    · rw [occurrenceIds, ((starts.occurrences formed.distinct.occurrencesKeyed member).map _).mem_iff, List.map_map]
      refine List.mem_map.mpr ⟨o, inS, ?_⟩
      by_cases same : o.id = occurrence.id <;> simp [same]
  · rw [Laws.State.startReserved_begun s sourceType flag]
    exact .refl

end Phases

/-! ## Removing and cancelling an occurrence

`State.removeOccurrence` removes the record first and then leaves the scope occurrences it owns; as `Laws.State`'s proof
of its well-formedness does, the frame leaves them first, each from a well-formed state, and removes the record last,
which ends in the same state since the record lies outside each of them (`Laws.State.leaveScope_withoutRecord`). -/

section Removal

variable {program : Program} {s u : State}

private theorem withoutRecord_instanceOf (u : State) (id : OccurrenceId) (x : ScopeOccurrenceId) :
    (Laws.State.withoutRecord u id).instanceOf x = u.instanceOf x :=
  Laws.State.instanceOf_congr (s := u) (t := Laws.State.withoutRecord u id) rfl rfl x

private theorem draft_key (r : State) (draft : Draft) (o : Occurrence) : key { r with draft } o = key r o :=
  Laws.State.key_congr (Laws.State.instanceOf_congr (s := r) (t := { r with draft }) rfl rfl _)

/-- Removing a record without journalling it spares it. -/
theorem withoutRecord_frame (u : State) (id : OccurrenceId) : EndsStep u (Laws.State.withoutRecord u id) (some id) where
  instanceId := rfl
  issued := .refl _
  grow := countsGrow_same rfl
  held o' inside := .inl ⟨o', (Laws.State.mem_occurrenceList_filter_val.mp inside).1, rfl,
    Laws.State.key_congr (withoutRecord_instanceOf u id _), fun _ => rfl⟩
  ends := ⟨[], by simp [endKeys, Laws.State.withoutRecord], .nil, by simp, fun o member _ absent other =>
    absurd (List.mem_map.mpr ⟨o, Laws.State.mem_occurrenceList_filter_val.mpr
      ⟨member, by simpa using fun same => other (by rw [same])⟩, rfl⟩)
      absent⟩

/-- Leaving the scope occurrences of `owned`. -/
private abbrev leaveAll (le : Issue → Issue → Bool) (owned : List ScopeOccurrence) (t : State) : State :=
  owned.foldl (fun state entry => state.leaveScope le entry.id) t

/-- Leaving the scope occurrences an occurrence `record` owns, siblings below its scope occurrence, frames the end facts,
keeps the record and its scope occurrence with its process instance, and commutes with removing the record. -/
private theorem leaveOwned_frame {record : Occurrence} :
    ∀ (owned : List ScopeOccurrence) (t : State), WellFormed program t → record ∈ t.occurrences → owned.Nodup →
      (∀ entry ∈ owned, entry ∈ t.scopes ∧ entry.parent = some record.scope) →
      leaveAll le owned (Laws.State.withoutRecord t record.id) = Laws.State.withoutRecord (leaveAll le owned t) record.id ∧
      EndsStep t (leaveAll le owned t) none ∧ (∀ o ∈ (leaveAll le owned t).occurrences, o ∈ t.occurrences) ∧
      record ∈ (leaveAll le owned t).occurrences ∧ (leaveAll le owned t).scopes ⊆ t.scopes ∧
      record.scope ∈ scopeIds (leaveAll le owned t) ∧
      ∀ x ∈ scopeIds (leaveAll le owned t), (leaveAll le owned t).instanceOf x = t.instanceOf x
  | [], t, formed, member, _, _ =>
    ⟨rfl, .refl, fun _ => id, member, List.Subset.refl _, formed.owned.occurrenceScopes record member, fun _ _ => rfl⟩
  | first :: rest, t, formed, member, nodup, placed => by
    obtain ⟨firstMember, firstLink⟩ := placed first (List.mem_cons_self ..)
    have present : first.id ∈ scopeIds t := List.mem_map.mpr ⟨first, firstMember, rfl⟩
    have notRoot : first.id ≠ State.root := fun same => by
      simp [(formed.rooted.2.1 first firstMember).mpr same] at firstLink
    have left := Laws.State.leaveScope_left (le := le) formed present
    have outside : ¬ Within t record.scope first.id := Laws.State.parent_not_within formed firstMember firstLink
    have apart : ∀ occurrence ∈ t.occurrences, occurrence.id = record.id → occurrence.scope ∉ t.subtree le first.id :=
      fun occurrence inside same within => by
        rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside member same] at within
        exact outside ((Laws.State.subtree_iff formed present _).mp within)
    have restPlaced : ∀ entry ∈ rest, entry ∈ (t.leaveScope le first.id).scopes ∧ entry.parent = some record.scope :=
      fun entry inside => by
        obtain ⟨entryMember, entryLink⟩ := placed entry (List.mem_cons_of_mem _ inside)
        have other : entry.id ≠ first.id := fun same =>
          (List.nodup_cons.mp nodup).1 (Laws.State.scope_unique formed.distinct entryMember firstMember same ▸ inside)
        exact ⟨(left.scopes entry).mpr ⟨entryMember,
          Laws.State.sibling_outside formed firstMember entryMember firstLink entryLink other⟩, entryLink⟩
    obtain ⟨commutes, frame, rest⟩ := leaveOwned_frame rest (t.leaveScope le first.id)
      (left.wellFormed formed present notRoot) ((left.occurrences record).mpr ⟨member, outside⟩) (List.nodup_cons.mp nodup).2
      restPlaced
    obtain ⟨within, recorded, fewer, rest⟩ := rest
    obtain ⟨stands, instances⟩ := rest
    simp only [leaveAll, List.foldl_cons] at commutes frame within recorded fewer stands instances ⊢
    rw [Laws.State.leaveScope_withoutRecord t record.id first.id apart]
    exact ⟨commutes, (leaveScope_frame formed present).trans formed left.occurrencesSublist.subset frame
      (fun _ none => by cases none), fun o inside => left.occurrencesSublist.subset (within o inside), recorded,
      List.Subset.trans fewer left.scopesSubset, stands, fun x inside => (instances x inside).trans (left.instances x
        (List.map_subset _ fewer inside))⟩

/-- Removing an occurrence `record` of a well-formed state journals the begun occurrences inside the scope occurrences
it owns but not `record`, which it removes; its scope occurrence stands and keeps its process instance. -/
theorem removeOccurrence_frame (formed : WellFormed program s) {record : Occurrence}
    (member : record ∈ s.occurrences) :
    EndsStep s (s.removeOccurrence le record.id) (some record.id) ∧ record.id ∉ occurrenceIds (s.removeOccurrence le record.id) ∧
      record.scope ∈ scopeIds (s.removeOccurrence le record.id) ∧
      ∀ x ∈ scopeIds (s.removeOccurrence le record.id), (s.removeOccurrence le record.id).instanceOf x = s.instanceOf x := by
  have scopesNodup : s.scopes.Nodup :=
    List.Pairwise.of_map (R := (· ≠ ·)) (S := (· ≠ ·)) (·.id) (fun _ _ apart same => apart (congrArg _ same))
      formed.distinct.scopes
  obtain ⟨commutes, frame, rest⟩ := leaveOwned_frame
    ((s.scopes.filter (·.occurrence == some record.id)).mergeSort fun a b => le a.position b.position) s formed
    member ((List.mergeSort_perm _ _).nodup_iff.mpr (scopesNodup.sublist List.filter_sublist)) fun entry inside => by
      obtain ⟨entryMember, owns⟩ := List.mem_filter.mp (List.mem_mergeSort.mp inside)
      exact ⟨entryMember, formed.ownedBelow entry entryMember record member (by simpa using owns)⟩
  obtain ⟨within, recorded, _, rest⟩ := rest
  obtain ⟨stands, instances⟩ := rest
  simp only [leaveAll] at commutes frame within recorded stands instances
  rw [Laws.State.removeOccurrence_eq, commutes]
  refine ⟨frame.trans formed within (withoutRecord_frame _ _) fun _ same => ?_, fun named => ?_, stands,
    fun x inside => (withoutRecord_instanceOf _ record.id x).trans (instances x inside)⟩
  · obtain rfl := Option.some.inj same
    exact List.mem_map.mpr ⟨record, recorded, rfl⟩
  · obtain ⟨o, inside, same⟩ := List.mem_map.mp named
    simp [Laws.State.withoutRecord, Laws.State.occurrences_eq, Laws.State.mem_occurrenceList_filter_val, same] at inside

/-- Removing the record `id` of a well-formed state that holds none removes nothing. -/
private theorem removeOccurrence_absent (formed : WellFormed program s) {id : OccurrenceId} (absent : id ∉ occurrenceIds s) :
    s.removeOccurrence le id = Laws.State.withoutRecord s id := by
  have unowned : s.scopes.filter (·.occurrence == some id) = [] := List.filter_eq_nil_iff.mpr fun entry inside owns => by
    obtain ⟨owner, held, named, _⟩ := formed.owned.scopeOwners entry inside id (by simpa using owns)
    exact absent (List.mem_map.mpr ⟨owner, held, named⟩)
  rw [Laws.State.removeOccurrence_eq, unowned, List.mergeSort_nil]
  rfl

/-- Journalling the cancelled end of a removed occurrence the removal spared closes the frame. -/
theorem EndsStep.close {r : State} {occurrence : Occurrence}
    (step : EndsStep u r (some occurrence.id)) (gone : occurrence.id ∉ occurrenceIds r)
    (only : ∀ o ∈ u.occurrences, o.id = occurrence.id → o = occurrence)
    (begun : occurrence.begun = true → occurrence ∈ u.occurrences ∧ key r occurrence = key u occurrence)
    {ended : List (OccurrenceKey × Terminal)} (cancelled : List Occurrence)
    (endedEq : ended = r.draft.ended ++ ([occurrence].filter (·.begun)).map fun o => (key r o, .cancelled)) :
    EndsStep u { r with draft := { r.draft with ended, cancelled } } none := by
  have keyed : ∀ o, key { r with draft := { r.draft with ended, cancelled } } o = key r o := draft_key r _
  have closing : ∀ o ∈ [occurrence].filter (·.begun), o = occurrence ∧ o.begun = true := fun o inside => by
    simpa using inside
  obtain ⟨removed, perm, ids, ⟨within, complete⟩⟩ := step.ends
  refine ⟨step.instanceId, step.issued, step.grow, fun o' inside => ?_, removed ++ [occurrence].filter (·.begun), ?_, ?_,
    fun o inGone => ?_, fun o member flag absent _ => ?_⟩
  · rcases step.held o' inside with ⟨o, inU, same, ⟨keyedR, unchanged⟩⟩ | ⟨fresh, uncounted⟩ | ⟨o, inU, takes⟩
    · exact .inl ⟨o, inU, same, (keyed o').trans keyedR, unchanged⟩
    · exact .inr (.inl ⟨fresh, (keyed o') ▸ uncounted⟩)
    · exact .inr (.inr ⟨o, inU, takes.unbegun, by simp, takes.absent, (keyed o').trans takes.keyed, takes.fresh⟩)
  · have ended : endKeys { r with draft := { r.draft with ended, cancelled } } =
        endKeys r ++ ([occurrence].filter (·.begun)).map (key u) := by
      simp only [endKeys, endedEq, List.map_append, List.append_assoc, List.map_map]
      congr 2
      exact List.map_congr_left fun o inside => by
        obtain ⟨rfl, flag⟩ := closing o inside
        exact (begun flag).2
    rw [ended, List.map_append, ← List.append_assoc]
    exact perm.append_right _
  · rw [List.map_append]
    refine List.nodup_append.mpr ⟨ids, (List.filter_sublist.map _).nodup (by simp), fun x old y new same => ?_⟩
    obtain ⟨o, inGone, rfl⟩ := List.mem_map.mp old
    obtain ⟨o', inClose, rfl⟩ := List.mem_map.mp new
    obtain ⟨rfl, _⟩ := closing o' inClose
    exact (within o inGone).2.1 (by rw [same])
  · rcases List.mem_append.mp inGone with old | new
    · exact ⟨(within o old).1, by simp, (within o old).2.2⟩
    · obtain ⟨rfl, flag⟩ := closing o new
      exact ⟨(begun flag).1, by simp, gone, flag⟩
  · by_cases same : o.id = occurrence.id
    · obtain rfl := only o member same
      exact List.mem_append_right _ (by simp [flag])
    · exact List.mem_append_left _ (complete o member flag absent fun named => same (Option.some.inj named).symm)

/-- Withdrawing the items inside scope occurrences changes only the open items, which it narrows. -/
private theorem withdrawn_shape : ∀ (scopes : List ScopeOccurrence) (t : State), ∃ items : OpenItems,
    Laws.State.ItemsSub items t.openItems ∧ scopes.foldl (fun state entry => state.withdrawInside entry.id) t = { t with openItems := items }
  | [], t => ⟨t.openItems, Laws.State.ItemsSub.refl _, rfl⟩
  | entry :: rest, t => by
    obtain ⟨items, fewer, same⟩ := withdrawn_shape rest (t.withdrawInside entry.id)
    refine ⟨items, Laws.State.ItemsSub.trans ?_ fewer, ?_⟩
    · rw [Laws.State.withdrawInside_eq]
      exact Laws.State.ItemsSub.filter _ _
    · simp only [List.foldl_cons]
      rw [same, Laws.State.withdrawInside_eq]

/-- Cancelling an occurrence of a well-formed state journals each begun occurrence it removes, itself included, once. -/
theorem cancelOccurrence_frame (formed : WellFormed program s) (id : OccurrenceId) :
    EndsStep s (s.cancelOccurrence le id) none := by
  cases found : s.occurrence? id with
  | none =>
    rw [Laws.State.cancelOccurrence_absent found]
    exact .refl
  | some occurrence =>
    obtain ⟨member, rfl⟩ := Laws.State.occurrence?_some found
    have ended := Laws.State.cancelOccurrence_ended (le := le) found
    obtain ⟨endedR, cancelled, shape⟩ := Laws.State.cancelOccurrence_some found
    have disarmed := Laws.State.disarm_wellFormed (Laws.State.closeOwnItems_wellFormed formed occurrence.id) occurrence.id
    obtain ⟨items, fewer, withdrawn⟩ := withdrawn_shape
      (((s.closeOwnItems occurrence.id).disarm occurrence.id).scopes.filter (·.occurrence == some occurrence.id))
      ((s.closeOwnItems occurrence.id).disarm occurrence.id)
    rw [← Laws.State.withdrawOccurrence_eq] at withdrawn
    have uFormed : WellFormed program (s.withdrawOccurrence occurrence.id) := by
      rw [withdrawn]
      exact disarmed.narrow {
          scopeMap := rfl, scopeOrdinals := rfl, occurrenceMap := rfl, activations := rfl, occurrenceOrdinals := rfl,
          instances := Laws.State.instanceOf_congr rfl rfl, recorded := id, items := ⟨fewer, fun _ => Nat.le_refl _⟩,
          tokens := .refl _, signals := .refl _, starts := fun _ => id, slots := .same rfl, issued := rfl, issuing := rfl,
          issueNext := rfl } rfl disarmed.startedOnce
    have within : ∀ o ∈ (s.withdrawOccurrence occurrence.id).occurrences, o ∈ s.occurrences := fun o inside => by
      rw [withdrawn, Laws.State.disarm_eq, Laws.State.closeOwnItems_eq] at inside
      exact (Laws.State.mem_occurrenceList_filter_val.mp inside).1
    have stays : occurrence.begun = true → occurrence ∈ (s.withdrawOccurrence occurrence.id).occurrences := fun flag => by
      rw [withdrawn, Laws.State.disarm_eq, Laws.State.closeOwnItems_eq]
      exact Laws.State.mem_occurrenceList_filter_val.mpr ⟨member, by simp [flag]⟩
    have pruned : EndsStep s (s.withdrawOccurrence occurrence.id) none := by
      rw [withdrawn, Laws.State.disarm_eq, Laws.State.closeOwnItems_eq]
      exact .prune ⟨rfl, rfl⟩ (.refl _) rfl rfl (fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1)
        fun _ inside flag => Laws.State.mem_occurrenceList_filter_val.mpr ⟨inside, by simp [flag]⟩
    have only : ∀ o ∈ (s.withdrawOccurrence occurrence.id).occurrences, o.id = occurrence.id → o = occurrence :=
      fun o inside same => Laws.State.nodup_map_eq formed.distinct.occurrences (within o inside) member same
    have removal : EndsStep (s.withdrawOccurrence occurrence.id)
        ((s.withdrawOccurrence occurrence.id).removeOccurrence le occurrence.id) (some occurrence.id) ∧
        occurrence.id ∉ occurrenceIds ((s.withdrawOccurrence occurrence.id).removeOccurrence le occurrence.id) ∧
        (occurrence.begun = true → occurrence ∈ (s.withdrawOccurrence occurrence.id).occurrences ∧
          key ((s.withdrawOccurrence occurrence.id).removeOccurrence le occurrence.id) occurrence =
            key (s.withdrawOccurrence occurrence.id) occurrence) := by
      by_cases held : occurrence.id ∈ occurrenceIds (s.withdrawOccurrence occurrence.id)
      · obtain ⟨record, inside, named⟩ := List.mem_map.mp held
        obtain rfl := only record inside named
        obtain ⟨frame, gone, stands, instances⟩ := removeOccurrence_frame uFormed inside
        exact ⟨frame, gone, fun _ => ⟨inside, Laws.State.key_congr (instances _ stands)⟩⟩
      · rw [removeOccurrence_absent uFormed held]
        refine ⟨withoutRecord_frame _ _, fun named => held ?_, fun flag => absurd (List.mem_map.mpr ⟨_, stays flag, rfl⟩)
          held⟩
        obtain ⟨o, inside, same⟩ := List.mem_map.mp named
        exact List.mem_map.mpr ⟨o, (Laws.State.mem_occurrenceList_filter_val.mp inside).1, same⟩
    obtain ⟨frame, gone, begun⟩ := removal
    rw [shape] at ended ⊢
    exact pruned.trans formed within (EndsStep.close frame gone only begun cancelled ended) fun _ none => by
      cases none

end Removal

end Kernel.Laws.Step
