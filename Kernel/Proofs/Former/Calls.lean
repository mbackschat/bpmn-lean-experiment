module

public import Kernel.Laws.Step.Signals
public import Kernel.Proofs.Frame
public import Kernel.Laws.Work
public import Kernel.Laws.State.Chain
public import Kernel.Laws.State.Begin
public import Kernel.Laws.Population

/-! # Proofs: the former lanes, Calls (P7)

The former theorems (`Kernel.Proofs.Former`) of PC-SCOPE-04 and PC-SCOPE-05 that read a Call's own hooks or the
identities of the instances it calls: a Call installs its evaluated inputs as the called root's only variables, its
return continues exactly the Call occurrence that owns the root, and each derived instance identity names exactly one
called instance. Each statement is over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of
`Registry.hooks`.

The model premise is that a process's authored identifiers are distinct (`PublicIdsApart`), which the codec does not
check. The names of called roots are a lane invariant beside `Laws.State.WellFormed`, as P4's `RunsFormed` is
(`CallsFormed`): held at a start, in every instance of a population run and across a committed input, by every state
operation the hooks and `Step` apply. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed Within Queues InstanceRoot)

/-- The program's authored identifiers (`Program.publicId`) are distinct within each process it carries, the root
process's included: two elements of one process with one `ElementOrigin.sourceId` are one element. Admission refuses a
repeated authored identifier in the root process (`element.origin.sourceId`); a carried copy of another deployment's
process is renamed uniformly by its deployment (`packages/bpmn-source/src/kernel-reader/assembly.ts`), which keeps a
process's distinct authored identifiers distinct. Two Calls of one process sharing an authored identifier would name
their instances alike at one activation, so `CalledIdentityUnique` is false of a program that breaks it. -/
def PublicIdsApart (program : Program) : Prop :=
  ∀ first ∈ program.elements, ∀ second ∈ program.elements,
    (program.processOf first.header).map (·.definition) = (program.processOf second.header).map (·.definition) →
    first.header.origin.sourceId = second.header.origin.sourceId → first.header.id = second.header.id

/-- PC-SCOPE-04 (`CVM-IN-01`): a Call's invocation installs a called root whose variable set is exactly its input
mappings (`CallWork.inputs`) evaluated against what the Call's scope occurrence sees. Stated of `Hooks.arriveActivity`,
which `Step` calls when the Call's occurrence begins; the failed-source half is `FailedSourcesRead`.

P0 stated it for some mappings, which any list of literal mappings rebuilding the installed frame witnesses, so it is
bound to the Call's own inputs; and it reads the before-state's context, which the occurrence's local scope occurrence,
entered before the Call evaluates its inputs, leaves unchanged only in a well-formed state and for an occurrence of the
state, as `Step` hands the hook (`Laws.Step.HookContract.arriveActivity`): an occurrence whose scope occurrence is the
next identifier to issue would enter its local scope occurrence as that very scope occurrence, and its Call's inputs
would read the Activity's own locals (2026-11-15, rule 10). -/
def CallInstallsSnapshot (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : ActivityPayload) (work : CallWork) (occurrence : Occurrence)
    (state after : State) (root : ScopeOccurrence),
    WellFormed ctx.program state → occurrence ∈ state.occurrences → payload.work.call? = some work →
    hooks.arriveActivity ctx header payload occurrence state = .ok after →
    root ∈ after.scopes → root.calledInstance.isSome → root.occurrence = some occurrence.id → root ∉ state.scopes →
    ∃ installed, ctx.evaluateMappings (state.evalContext ctx.program occurrence.scope) work.inputs = .ok (some installed) ∧
      ∃ frame ∈ after.variables, frame.scope = root.id ∧ frame.entries = installed

/-- PC-SCOPE-05 (`CALLN-RETURN-01`, `CALLN-OUTSIDE-01`): a called root that is idle continues exactly the Call
occurrence that owns it, found by its own `occurrence`, never by the called definition, and keeps every other scope
occurrence, wait and token. Stated of `Hooks.completeCall`, of the signals it newly queues (`Laws.State.Queues`); that
`Step` calls it only for a called root, with the occurrence the root's own `occurrence` names, is
`Laws.Step.completeIdleScope_called`. -/
def ReturnContinuesCaller (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : ActivityPayload) (root : ScopeOccurrence) (occurrence : Occurrence)
    (state after : State),
    root.occurrence = some occurrence.id → hooks.completeCall ctx header payload root occurrence state = .ok after →
    (∃ new, Queues state after new ∧ ∀ queued ∈ new, ∀ id leave writes rule, queued = .complete id leave writes rule →
      id = occurrence.id) ∧
    (∀ other ∈ state.scopes, other.id ≠ root.id → other ∈ after.scopes) ∧
    (∀ item ∈ state.openItems, ¬ Within state item.scope root.id → item ∈ after.openItems) ∧ after.tokens = state.tokens

/-! ## The identities of called instances -/

/-- Every called root belongs to an occurrence, and an occurrence that owns one names it: `State.calledInstanceId` of
its own instance, its element's authored identifier and its activation. Stated of every owner rather than of one that
stands, so that removing an occurrence keeps it; `Laws.State.Owned.scopeOwners` supplies the owner. -/
def Named (program : Program) (s : State) : Prop :=
  ∀ root ∈ s.scopes, root.calledInstance.isSome → root.occurrence.isSome ∧ ∀ call ∈ s.occurrences,
    root.occurrence = some call.id →
      root.calledInstance = some (State.calledInstanceId (s.instanceOf call.scope) (program.publicId call.element) call.activation)

/-- An occurrence that owns a called root numbers under its element's own counter, never as a Multi-Instance body: a
looping Call's body and its first instance share their element and activation, each role numbering apart, so a body
owning a called root would name it as the first instance's invocation does (root decision C-1, 2026-11-15). -/
def Roled (s : State) : Prop :=
  ∀ root ∈ s.scopes, root.calledInstance.isSome → ∀ call ∈ s.occurrences, root.occurrence = some call.id →
    call.role = .element

/-- No occurrence owns two called roots. -/
def OwnersApart (s : State) : Prop :=
  ∀ first ∈ s.scopes, ∀ second ∈ s.scopes, first.calledInstance.isSome → second.calledInstance.isSome →
    first.occurrence = second.occurrence → first.id = second.id

/-- Each derived identity names exactly one called instance: two called roots with one instance identifier are one
scope occurrence. A state property, not a clause of `CallsFormed`: it follows from `CallsFormed` where every occurrence
lies in the process its instance runs (`identitiesApart_of`). -/
def IdentitiesApart (s : State) : Prop :=
  ∀ first ∈ s.scopes, ∀ second ∈ s.scopes, first.calledInstance.isSome →
    first.calledInstance = second.calledInstance → first.id = second.id

/-- The lane invariant of called instances, beside `Laws.State.WellFormed`, as P4's `RunsFormed` is: every called root
is named by the occurrence that owns it (`Named`), which numbers under its element's counter (`Roled`) and owns no
other (`OwnersApart`). An input keeps it (root decisions D3, C-1 and C-7, 2026-11-15). -/
structure CallsFormed (program : Program) (s : State) : Prop where
  named : Named program s
  roled : Roled s
  ownersApart : OwnersApart s

/-- Under `WellFormed`, a called root is named by the occurrence that owns it, which stands. -/
theorem Named.owner {program : Program} {s : State} (formed : WellFormed program s) (named : Named program s)
    {root : ScopeOccurrence} (member : root ∈ s.scopes) (called : root.calledInstance.isSome) :
    ∃ call ∈ s.occurrences, root.occurrence = some call.id ∧
      root.calledInstance = some (State.calledInstanceId (s.instanceOf call.scope) (program.publicId call.element)
        call.activation) := by
  obtain ⟨owned, names⟩ := named root member called
  obtain ⟨id, link⟩ := Option.isSome_iff_exists.mp owned
  obtain ⟨call, present, same, _⟩ := formed.owned.scopeOwners root member id link
  have owns : root.occurrence = some call.id := link.trans (congrArg some same.symm)
  exact ⟨call, present, owns, names call present owns⟩

/-! ### Distinct identities

Two called roots with one identifier have owners with one caller instance, one authored identifier and one activation
(`Laws.State.calledInstanceId_inj`). The caller instance names one instance root: the process root, whose identifier no
called root takes since each is longer than its caller's, or a called root whose identifier is shorter, one by
induction on the identifier's length. Where owners of one instance root with one authored identifier are of one element
(`OwnersPlaced`), the owners share their key and are one occurrence (`Laws.State.Distinct`), which owns one called root
(`OwnersApart`). -/

/-- Two owners of called roots whose scope occurrences lie in one process instance and whose elements have one
authored identifier are of one element: what `PublicIdsApart` gives where every occurrence lies in the process its
instance runs. -/
def OwnersPlaced (program : Program) (s : State) : Prop :=
  ∀ first ∈ s.occurrences, ∀ second ∈ s.occurrences,
    (∃ root ∈ s.scopes, root.calledInstance.isSome ∧ root.occurrence = some first.id) →
    (∃ root ∈ s.scopes, root.calledInstance.isSome ∧ root.occurrence = some second.id) →
    s.instanceRoot first.scope = s.instanceRoot second.scope →
    program.publicId first.element = program.publicId second.element → first.element = second.element

/-- A present scope occurrence lies in the process instance, rooted at `State.root`, or in the called instance whose
root carries its identifier. -/
theorem instanceOf_home {program : Program} {s : State} (formed : WellFormed program s) {x : ScopeOccurrenceId}
    (present : x ∈ Laws.State.scopeIds s) :
    (s.instanceOf x = s.instanceId ∧ s.instanceRoot x = State.root) ∨
      ∃ root ∈ s.scopes, root.id = s.instanceRoot x ∧ root.calledInstance = some (s.instanceOf x) := by
  have inInstance := Laws.State.instanceRoot_spec formed present
  rw [Laws.State.instanceOf_root]
  by_cases called : Laws.State.CalledRoot s (s.instanceRoot x)
  · obtain ⟨root, member, named, isCalled⟩ := called
    obtain ⟨name, carried⟩ := Option.isSome_iff_exists.mp isCalled
    refine .inr ⟨root, member, named, ?_⟩
    rw [← named, Laws.State.find?_record formed.distinct.scopes member]
    simp [carried]
  · have rooted := inInstance.2.1.resolve_left called
    refine .inl ⟨?_, rooted⟩
    cases found : s.scopes.find? (·.id == s.instanceRoot x) with
    | none => rfl
    | some entry =>
      have named : entry.id = s.instanceRoot x := by simpa using List.find?_some found
      cases carried : entry.calledInstance with
      | none => simp [carried]
      | some name =>
        exact absurd ⟨entry, List.mem_of_find?_eq_some found, named, by simp [carried]⟩ called

/-- Every called root's identifier is longer than the process instance's, so none is the instance's own. -/
theorem instanceId_shorter {program : Program} {s : State} (formed : WellFormed program s) (named : Named program s) :
    ∀ root ∈ s.scopes, ∀ name, root.calledInstance = some name → s.instanceId.length < name.length := by
  suffices bounded : ∀ bound, ∀ root ∈ s.scopes, ∀ name, root.calledInstance = some name → name.length ≤ bound →
      s.instanceId.length < name.length from
    fun root member name carried => bounded _ root member name carried (Nat.le_refl _)
  intro bound
  induction bound with
  | zero =>
    intro root member name carried short
    obtain ⟨call, _, _, names⟩ := named.owner formed member (by simp [carried])
    rw [carried] at names
    have longer := Laws.State.calledInstanceId_longer (s.instanceOf call.scope) (program.publicId call.element)
      call.activation
    rw [← Option.some.inj names] at longer
    omega
  | succ bound ih =>
    intro root member name carried short
    obtain ⟨call, present, _, names⟩ := named.owner formed member (by simp [carried])
    rw [carried] at names
    have longer := Laws.State.calledInstanceId_longer (s.instanceOf call.scope) (program.publicId call.element)
      call.activation
    rw [← Option.some.inj names] at longer
    rcases instanceOf_home formed (formed.owned.occurrenceScopes call present) with ⟨own, _⟩ | ⟨caller, inside, _, calls⟩
    · rw [own] at longer; exact longer
    · have := ih caller inside _ calls (by omega)
      omega

/-- Under `WellFormed` and the lane invariant, where owners of one instance root with one authored identifier are of one
element, each derived identity names exactly one called instance. -/
theorem identitiesApart_of {program : Program} {s : State} (formed : WellFormed program s) (calls : CallsFormed program s)
    (placed : OwnersPlaced program s) : IdentitiesApart s := by
  suffices bounded : ∀ bound, ∀ first ∈ s.scopes, ∀ second ∈ s.scopes, ∀ name, first.calledInstance = some name →
      second.calledInstance = some name → name.length ≤ bound → first.id = second.id by
    intro first one second two called same
    obtain ⟨name, carried⟩ := Option.isSome_iff_exists.mp called
    exact bounded _ first one second two name carried (same ▸ carried) (Nat.le_refl _)
  intro bound
  induction bound with
  | zero =>
    intro first one _ _ name carried _ short
    have := instanceId_shorter formed calls.named first one name carried
    omega
  | succ bound ih =>
    intro first one second two name carried carried' short
    obtain ⟨call, present, owns, names⟩ := calls.named.owner formed one (by simp [carried])
    obtain ⟨call', present', owns', names'⟩ := calls.named.owner formed two (by simp [carried'])
    rw [carried] at names
    rw [carried'] at names'
    obtain ⟨caller, element, activation⟩ := Laws.State.calledInstanceId_inj ((Option.some.inj names).symm.trans
      (Option.some.inj names'))
    have longer := Laws.State.calledInstanceId_longer (s.instanceOf call.scope) (program.publicId call.element)
      call.activation
    rw [← Option.some.inj names] at longer
    have rooted : s.instanceRoot call.scope = s.instanceRoot call'.scope := by
      rcases instanceOf_home formed (formed.owned.occurrenceScopes call present) with ⟨own, home⟩ |
          ⟨root, inside, home, carries⟩ <;>
        rcases instanceOf_home formed (formed.owned.occurrenceScopes call' present') with ⟨own', home'⟩ |
          ⟨root', inside', home', carries'⟩
      · rw [home, home']
      · rw [← caller, own] at carries'
        exact absurd (instanceId_shorter formed calls.named root' inside' _ carries') (Nat.lt_irrefl _)
      · rw [caller, own'] at carries
        exact absurd (instanceId_shorter formed calls.named root inside _ carries) (Nat.lt_irrefl _)
      · rw [← home, ← home', ih root inside root' inside' _ carries (caller ▸ carries') (by omega)]
    have same := placed call present call' present' ⟨first, one, by simp [carried], owns⟩
      ⟨second, two, by simp [carried'], owns'⟩ rooted element
    have keys : Laws.State.key s call = Laws.State.key s call' := by
      simp only [Laws.State.key, caller, same, activation,
        calls.roled first one (by simp [carried]) call present owns,
        calls.roled second two (by simp [carried']) call' present' owns']
    have one_ := Laws.State.nodup_map_eq formed.distinct.keys present present' keys
    subst one_
    exact calls.ownersApart first one second two (by simp [carried]) (by simp [carried']) (owns.trans owns'.symm)

/-! ### The clauses reject

A Call `CallIt`'s occurrence 1 in the process root and called roots 2 and 3 below it: each clause rejects a state the
others accept. -/

/-- The process root of the witnesses. -/
def witnessRoot : ScopeOccurrence := { id := ⟨0⟩, element := none, parent := none }

/-- A called root of the witnesses, owned by `owner`. -/
def witnessCalled (id : Nat) (owner : Option Nat) : ScopeOccurrence :=
  { id := ⟨id⟩, element := some ⟨"CallIt"⟩, parent := some ⟨0⟩, occurrence := owner, calledInstance := some "I1-call" }

/-- A called root that no occurrence owns breaks `Named`. -/
theorem unowned_root_rejected (program : Program) :
    ¬ Named program { instanceId := "I1", scopes := [witnessRoot, witnessCalled 2 none] } := fun named => by
  simpa [witnessCalled] using (named (witnessCalled 2 none) (by simp) rfl).1

/-- A called root owned by a Multi-Instance body breaks `Roled`: the body and its first instance share their element
and activation, so the instance's invocation would name its root alike. -/
theorem body_owner_rejected :
    ¬ Roled { instanceId := "I1", scopes := [witnessRoot, witnessCalled 2 (some 1)]
              occurrences := [{ id := 1, element := ⟨"CallIt"⟩, scope := ⟨0⟩, activation := 1
                                role := .multiInstanceBody }] } := fun roled => by
  have := roled (witnessCalled 2 (some 1)) (by simp) rfl _ (List.mem_singleton_self _) rfl
  cases this

/-- One occurrence owning two called roots breaks `OwnersApart`. -/
theorem twice_owned_rejected :
    ¬ OwnersApart { instanceId := "I1", scopes := [witnessRoot, witnessCalled 2 (some 1), witnessCalled 3 (some 1)] } :=
  fun apart => by
    simpa [witnessCalled] using apart (witnessCalled 2 (some 1)) (by simp) (witnessCalled 3 (some 1)) (by simp) rfl rfl rfl

/-- A committed start keeps the lane invariant. -/
def CallsFormedAtStart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State),
    Step.step hooks program none input = .ok after → CallsFormed program after

/-- Every instance a committed population run holds keeps the lane invariant under its deployment's program. -/
def CallsFormedInPopulation (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
    ∀ instance_ ∈ result.instances, CallsFormed instance_.deployment.program instance_.state

/-- PC-SCOPE-05: an invocation creates exactly the derived identity, and keeps call associations valid. Every called
root an input creates belongs to a present Call occurrence and is named `State.calledInstanceId` of its caller's
instance, the Call's authored identifier and its activation; and the lane invariant holds after the input. That two
called roots with one instance identifier are one scope occurrence (`IdentitiesApart`) follows from the lane invariant
only where every occurrence lies in the process its instance runs (root decision C-7, 2026-11-15).

P0 stated it of every well-formed before-state, which is false twice. A program whose process lists two Calls with
one authored identifier names both instances alike at one activation (`PublicIdsApart`). And a well-formed state
whose called roots are already named alike, or misnamed, is no state a run reaches: `WellFormed` does not speak of
called identities, so the before-state keeps the lane invariant (`CallsFormed`), which `CallsFormedAtStart` and
`CallsFormedInPopulation` establish. -/
def CalledIdentityUnique (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    PublicIdsApart program → WellFormed program before → CallsFormed program before →
    Step.step hooks program (some before) input = .ok after →
    (∀ root ∈ after.scopes, root ∉ before.scopes → root.calledInstance.isSome →
      ∃ call ∈ after.occurrences, root.occurrence = some call.id ∧ root.calledInstance =
        some (State.calledInstanceId (after.instanceOf call.scope) (program.publicId call.element) call.activation)) ∧
    CallsFormed program after

/-! ## A Call's own hooks

Generic in the hooks: a statement of `Hooks.arriveActivity` or `Hooks.completeCall` holds of every hooks record whose
hook is Work's (`Laws.Work.arriveActivity_call`, `Laws.Work.completeCall_queues`); `Kernel.Proofs.Step` instantiates it
at `Registry.hooks`. -/

open Kernel.Laws.State (scopeIds)

/-- Last writes are keyed already: one binding per name. -/
private theorem keyed_lastWrites (made : List (String × Value)) : keyed (lastWrites made) = lastWrites made := by
  rw [Laws.Hooks.lastWrites_eq]
  exact Laws.State.keyed_of_nodup ((List.mergeSort_perm _ _).map _ |>.nodup_iff.mpr (Laws.State.keyed_names made))

/-- An Activity's inputs, entered from a well-formed state, change nothing its scope occurrence's context reads, add only
a scope occurrence that calls no instance, and leave every identifier below the next one to issue. -/
private theorem enterLocal_facts {program : Program} {header : Header} {inputs : List (String × Value)}
    {occurrence : Occurrence} {state : State} (formed : WellFormed program state) (member : occurrence ∈ state.occurrences) :
    (Feature.Work.enterLocal header inputs occurrence state).evalContext program occurrence.scope =
        state.evalContext program occurrence.scope ∧
      (∀ root ∈ (Feature.Work.enterLocal header inputs occurrence state).scopes, root.calledInstance.isSome →
        root ∈ state.scopes) ∧
      ∀ entry ∈ (Feature.Work.enterLocal header inputs occurrence state).scopes,
        entry.id ≠ ⟨(Feature.Work.enterLocal header inputs occurrence state).nextIssue⟩ := by
  have below : ∀ entry ∈ state.scopes, entry.id.value < state.nextIssue := formed.issued.scopes
  rw [Laws.Work.enterLocal_eq]
  split
  · exact ⟨rfl, fun _ inside _ => inside, fun entry inside same => by
      have := below entry inside; rw [same] at this; exact Nat.lt_irrefl _ this⟩
  · refine ⟨?_, fun root inside called => ?_, fun entry inside same => ?_⟩
    · rw [Laws.Hooks.evalContext_eq, Laws.Hooks.evalContext_eq,
        Laws.State.visible_enterScope formed (formed.owned.occurrenceScopes occurrence member)]
      rw [Laws.State.enterScope_eq]
    · rw [Laws.State.enterScope_eq] at inside
      rcases List.mem_append.mp inside with old | new
      · exact old
      · rw [List.mem_singleton.mp new] at called; cases called
    · rw [Laws.State.enterScope_eq] at inside same
      rcases List.mem_append.mp inside with old | new
      · have := below entry old; rw [same] at this; simp at this; omega
      · rw [List.mem_singleton.mp new] at same; simp at same

theorem callInstallsSnapshot {hooks : Hooks} {workHooks : Feature.Work.WorkHooks}
    (arrive : hooks.arriveActivity = Feature.Work.arriveActivity workHooks) : CallInstallsSnapshot hooks := by
  intro ctx header payload work occurrence state after root formed member called ran inside isCalled _ fresh
  rw [arrive] at ran
  rcases Laws.Work.arriveActivity_call called ran with ⟨held, rfl⟩ | ⟨inputs, entered, installed, invoked⟩
  · rw [Laws.Hooks.hold_eq] at inside
    exact absurd inside fresh
  obtain ⟨definition, start, rfl, rest⟩ := invoked
  obtain ⟨evaluated, armed, armedIs, rfl⟩ := rest
  obtain ⟨context, rootsKept, unissued⟩ := enterLocal_facts (header := header) (inputs := inputs) formed member
  refine ⟨installed, context ▸ evaluated, ?_⟩
  obtain ⟨made, rfl⟩ := Laws.Hooks.evaluateMappings_some evaluated
  have scopes : armed.scopes = (Feature.Work.enterLocal header inputs occurrence state).scopes ++
      [{ id := ⟨(Feature.Work.enterLocal header inputs occurrence state).nextIssue⟩, element := some occurrence.element,
         parent := some occurrence.scope, occurrence := some occurrence.id
         calledInstance := some (State.calledInstanceId
           ((Feature.Work.enterLocal header inputs occurrence state).instanceOf occurrence.scope)
           (ctx.program.publicId occurrence.element) occurrence.activation) }] ∧
      armed.variables = (Feature.Work.enterLocal header inputs occurrence state).variables ++
        [{ scope := ⟨(Feature.Work.enterLocal header inputs occurrence state).nextIssue⟩,
           entries := keyed (lastWrites made) }] := by
    rcases armedIs with rfl | rfl <;> rw [Laws.State.enterCalled_eq _ _ _ _ _ unissued] <;> simp [Laws.State.signal_eq]
  simp only [Laws.State.signal_eq] at inside ⊢
  rw [scopes.1] at inside
  rcases List.mem_append.mp inside with old | new
  · exact absurd (rootsKept root old isCalled) fresh
  · rw [List.mem_singleton.mp new, scopes.2, keyed_lastWrites]
    exact ⟨_, List.mem_append_right _ (List.mem_singleton_self _), rfl, rfl⟩

theorem returnContinuesCaller {hooks : Hooks} (call : hooks.completeCall = Feature.Work.completeCall) :
    ReturnContinuesCaller hooks := by
  intro ctx header payload root occurrence state after _ ran
  rw [call] at ran
  obtain ⟨outputs, rfl⟩ := Laws.Work.completeCall_queues ran
  rw [Laws.State.signal_eq]
  refine ⟨⟨[.complete occurrence.id .outgoing outputs .outward], rfl, fun queued member id leave writes rule same => ?_⟩,
    fun other inside _ => inside, fun item inside _ => inside, rfl⟩
  rw [List.mem_singleton.mp member] at same
  exact (Laws.Step.complete_inj same).1.symm

/-! ## The lane invariant through an input

Every state operation but a Call's entry keeps the called roots and their owners' names: it adds no called root, and
an owner that stays keeps its record and its process instance (`CallsFormed.carry`), since what an operation removes
lies within what it removes (`Laws.State.Left`, `Laws.State.Cleared`) and what it adds lies below what stands. A
Call's entry adds the one called root its begun Call, which owns none yet, names (`CallsFormed.enterCalled`). The
feature records follow from these frames (`Proofs.Frame`); `Kernel.Proofs.Step` composes them for the registered
hooks. -/

open Kernel.Proofs.Frame (Alongside StoresAlongside OccursAlongside ClosureAlongside StepAlongside phases_alongside)

/-- `call` of `t` names the called roots it owns as a record of `s` with its identity and role named them. -/
def NamesAlike (program : Program) (s t : State) (call : Occurrence) : Prop :=
  ∃ old ∈ s.occurrences, old.id = call.id ∧ old.role = call.role ∧
    State.calledInstanceId (t.instanceOf call.scope) (program.publicId call.element) call.activation =
      State.calledInstanceId (s.instanceOf old.scope) (program.publicId old.element) old.activation

/-- A record of `s` that stays in its process instance names alike. -/
theorem NamesAlike.same {program : Program} {s t : State} {call : Occurrence} (member : call ∈ s.occurrences)
    (stays : t.instanceOf call.scope = s.instanceOf call.scope) : NamesAlike program s t call :=
  ⟨call, member, rfl, rfl, by rw [stays]⟩

section Carry

variable {program under : Program} {s t : State}

/-- A change that adds no called root, and whose owners of called roots name alike, keeps the lane invariant. -/
theorem CallsFormed.carry (kept : CallsFormed program s)
    (roots : ∀ root ∈ t.scopes, root.calledInstance.isSome → root ∈ s.scopes)
    (owners : ∀ root ∈ t.scopes, root.calledInstance.isSome → ∀ call ∈ t.occurrences, root.occurrence = some call.id →
      NamesAlike program s t call) : CallsFormed program t where
  named root member called := by
    have old := roots root member called
    refine ⟨(kept.named root old called).1, fun call inside owned => ?_⟩
    obtain ⟨record, present, alike⟩ := owners root member called call inside owned
    obtain ⟨same, _, names⟩ := alike
    rw [names]
    exact (kept.named root old called).2 record present (owned.trans (congrArg some same.symm))
  roled root member called call inside owned := by
    obtain ⟨record, present, alike⟩ := owners root member called call inside owned
    obtain ⟨same, role, _⟩ := alike
    exact role ▸ kept.roled root (roots root member called) called record present (owned.trans (congrArg some same.symm))
  ownersApart first one second two called called' same :=
    kept.ownersApart first (roots first one called) second (roots second two called') called called' same

/-- A change that keeps the scope occurrences and the instance identifier and adds no occurrence keeps the lane
invariant. -/
theorem CallsFormed.same (kept : CallsFormed program s) (scopes : t.scopes = s.scopes)
    (occurrences : ∀ occurrence ∈ t.occurrences, occurrence ∈ s.occurrences) (named : t.instanceId = s.instanceId) :
    CallsFormed program t :=
  kept.carry (fun _ member _ => scopes ▸ member) fun _ _ _ call inside _ =>
    .same (occurrences call inside) (Laws.State.instanceOf_congr scopes named _)

/-- Queuing a signal keeps the lane invariant. -/
theorem CallsFormed.signal (kept : CallsFormed program s) (signal : Signal) : CallsFormed program (s.signal signal) :=
  kept.same (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq]; exact fun _ member => member)
    (by rw [Laws.State.signal_eq])

/-- Dropping an occurrence record keeps the lane invariant. -/
theorem CallsFormed.withoutRecord (kept : CallsFormed program s) (id : Nat) :
    CallsFormed program (Laws.State.withoutRecord s id) :=
  kept.same rfl (fun _ member => (List.mem_filter.mp member).1) rfl

/-- A change that removes what lies within the scope occurrence it leaves keeps the lane invariant: an owner that stays
lies outside it, and so does its scope occurrence, which keeps its process instance. -/
theorem CallsFormed.left {scope : ScopeOccurrenceId} (formed : WellFormed under s) (left : Laws.State.Left s t scope)
    (kept : CallsFormed program s) : CallsFormed program t :=
  kept.carry (fun _ member _ => left.scopesSublist.subset member) fun _ _ _ call inside _ => by
    obtain ⟨present, outside⟩ := (left.occurrences call).mp inside
    obtain ⟨entry, member, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes call present)
    exact .same present (left.instances _
      (List.mem_map.mpr ⟨entry, (left.scopes entry).mpr ⟨member, named ▸ outside⟩, named⟩))

/-- A clearing that keeps only occurrences lying in no scope occurrence strictly within the cleared one keeps the lane
invariant. -/
theorem CallsFormed.cleared {scope : ScopeOccurrenceId} {keep : List Nat} (formed : WellFormed under s)
    (cleared : Laws.State.Cleared s t scope keep)
    (kept : ∀ occurrence ∈ s.occurrences, occurrence.id ∈ keep → ¬ Laws.State.StrictlyWithin s occurrence.scope scope)
    (holds : CallsFormed program s) : CallsFormed program t :=
  holds.carry (fun _ member _ => cleared.scopesSublist.subset member) fun _ _ _ call inside _ => by
    obtain ⟨present, outside⟩ := (cleared.occurrences call).mp inside
    have strict : ¬ Laws.State.StrictlyWithin s call.scope scope := by
      rcases outside with outside | stays
      · exact fun within => outside within.1
      · exact kept call present stays
    obtain ⟨entry, member, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes call present)
    exact .same present (cleared.instances _
      (List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr ⟨member, named ▸ strict⟩, named⟩))

/-- A scope occurrence added below a parent, with an identifier not yet taken, keeps the process instance of every
scope occurrence that stood. -/
theorem instanceOf_grown {entry : ScopeOccurrence} (formed : WellFormed under s) (scopes : t.scopes = s.scopes ++ [entry])
    (fresh : ∀ other ∈ s.scopes, other.id ≠ entry.id) (linked : entry.parent.isSome) (named : t.instanceId = s.instanceId)
    {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) : t.instanceOf x = s.instanceOf x := by
  have nodup : (scopeIds t).Nodup := by
    simp only [scopeIds, scopes, List.map_append, List.map_cons, List.map_nil]
    refine List.nodup_append.mpr ⟨formed.distinct.scopes, by simp, fun a inside b new => ?_⟩
    obtain ⟨other, member, rfl⟩ := List.mem_map.mp inside
    rw [List.mem_singleton.mp new]
    exact fresh other member
  refine Laws.State.instanceOf_kept formed nodup (fun other member orphan => ?_) named present
    fun above upper _ => scopes ▸ List.mem_append_left _ upper
  rw [scopes] at member
  rcases List.mem_append.mp member with old | new
  · exact (formed.rooted.2.1 other old).mp orphan
  · obtain rfl := List.mem_singleton.mp new
    rw [orphan] at linked; cases linked

/-- Entering a scope occurrence, which calls no instance, keeps the lane invariant. -/
theorem CallsFormed.entered (formed : WellFormed under s) (holds : CallsFormed program s) (element : ElementId)
    (parent : ScopeOccurrenceId) (locals : List (String × Value)) (owner : Option Nat) :
    CallsFormed program (s.enterScope element parent locals owner).1 := by
  have scopes := (Laws.State.enterScope_eq s element parent locals owner ▸ rfl :
    (s.enterScope element parent locals owner).1.scopes =
      s.scopes ++ [{ id := ⟨s.nextIssue⟩, element := some element, parent := some parent, occurrence := owner }])
  have occurrences : (s.enterScope element parent locals owner).1.occurrences = s.occurrences := by
    rw [Laws.State.enterScope_eq]
  have named : (s.enterScope element parent locals owner).1.instanceId = s.instanceId := by
    rw [Laws.State.enterScope_eq]
  refine holds.carry (fun root member called => ?_) fun _ _ _ call inside _ => ?_
  · rw [scopes] at member
    rcases List.mem_append.mp member with old | new
    · exact old
    · rw [List.mem_singleton.mp new] at called; cases called
  · rw [occurrences] at inside
    exact .same inside (instanceOf_grown formed scopes (Laws.State.scopes_fresh formed) rfl named
      (formed.owned.occurrenceScopes call inside))

/-- Reserving an occurrence keeps the lane invariant: the reservation's identity is fresh, so it owns no called root. -/
theorem CallsFormed.reserved (formed : WellFormed under s) (holds : CallsFormed program s) (element : ElementId)
    (scope : ScopeOccurrenceId) : CallsFormed program (s.reserve element scope).1 := by
  have reserves := Laws.State.reserve_reserves s element scope
  refine holds.carry (fun _ member _ => reserves.scopes ▸ member) fun root member _ call inside owned => ?_
  rw [reserves.occurrences] at inside
  rcases List.mem_append.mp inside with old | new
  · exact .same old (reserves.instances _)
  · rw [List.mem_singleton.mp new, reserves.id] at owned
    rw [reserves.scopes] at member
    obtain ⟨owner, present, named, _⟩ := formed.owned.scopeOwners root member _ owned
    have below := formed.issued.occurrences owner present
    rw [named] at below
    exact absurd below (Nat.lt_irrefl _)

/-- Beginning an admitted request keeps the lane invariant: the begun occurrence owns no scope occurrence
(`Laws.State.begin_unowned`). -/
theorem CallsFormed.begun (formed : WellFormed under s) (holds : CallsFormed program s) (request : BeginRequest)
    (role : ActivationRole) (sourceType : String)
    (admitted : ∀ id ∈ Laws.State.names request, Laws.State.Beginnable s request.scope id ∧ Laws.State.Unclaimed s id) :
    CallsFormed program (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  have unowned := Laws.State.begin_unowned formed request role sourceType admitted
  refine holds.carry (fun _ member _ => begins.scopes ▸ member) fun root member _ call inside owned => ?_
  rw [begins.occurrences] at inside
  rcases List.mem_append.mp inside with old | new
  · exact .same (List.mem_filter.mp old).1 (begins.instances _)
  · rw [List.mem_singleton.mp new] at owned
    exact absurd owned (unowned root member)

/-- Starting a reservation's occurrence keeps the lane invariant: its record keeps its identity, role, element, scope
occurrence and activation. -/
theorem CallsFormed.startReserved (holds : CallsFormed program s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) (sourceType : String) :
    CallsFormed program (s.startReserved occurrence sourceType).1 := by
  cases begun : occurrence.begun with
  | true => rw [Laws.State.startReserved_begun s sourceType begun]; exact holds
  | false =>
    have starts := Laws.State.startReserved_starts s sourceType begun
    refine holds.carry (fun _ inside _ => starts.scopes ▸ inside) fun _ _ _ call inside _ => ?_
    rw [starts.occurrences] at inside
    obtain ⟨other, present, made⟩ := List.mem_map.mp inside
    split at made
    · subst made
      exact ⟨occurrence, member, rfl, rfl, by rw [starts.instances]⟩
    · subst made
      exact .same present (starts.instances _)

/-- A Call's entry of its called root keeps the lane invariant, for a present Call of the element role that owns no
called root yet: the new root is the one called root its Call owns, named as `State.enterCalled` names it, and every
scope occurrence that stood keeps its process instance. -/
theorem CallsFormed.enterCalled (formed : WellFormed under s) (holds : CallsFormed program s) {call : Occurrence}
    (member : call ∈ s.occurrences) (role : call.role = .element)
    (unowned : ∀ root ∈ s.scopes, root.calledInstance.isSome → root.occurrence ≠ some call.id)
    (variables : List (String × Value)) (definition : DefinitionRef) :
    CallsFormed program (s.enterCalled program call variables definition).1 := by
  rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
  have stays := fun {x} => instanceOf_grown (t := { s with
      nextIssue := s.nextIssue + 1
      scopes := s.scopes ++ [{ id := ⟨s.nextIssue⟩, element := some call.element, parent := some call.scope
                               occurrence := some call.id
                               calledInstance := some (State.calledInstanceId (s.instanceOf call.scope)
                                 (program.publicId call.element) call.activation) }]
      variables := s.variables ++ [{ scope := ⟨s.nextIssue⟩, entries := keyed variables }]
      slots := { s.slots with
        instances := s.slots.instances ++ [{ root := ⟨s.nextIssue⟩, definition := some definition }] } })
    (x := x) formed rfl (Laws.State.scopes_fresh formed) rfl rfl
  have only : ∀ other ∈ s.occurrences, other.id = call.id → other = call := fun other inside same =>
    Laws.State.nodup_map_eq formed.distinct.occurrences inside member same
  refine ⟨fun root inside called => ?_, fun root inside called other present owned => ?_,
    fun first one second two called called' same => ?_⟩
  · rcases List.mem_append.mp inside with old | new
    · refine ⟨(holds.named root old called).1, fun other present owned => ?_⟩
      rw [stays (formed.owned.occurrenceScopes other present)]
      exact (holds.named root old called).2 other present owned
    · rw [List.mem_singleton.mp new]
      refine ⟨rfl, fun other present owned => ?_⟩
      obtain rfl := only other present (Option.some.inj owned).symm
      rw [stays (formed.owned.occurrenceScopes other present)]
  · rcases List.mem_append.mp inside with old | new
    · exact holds.roled root old called other present owned
    · rw [List.mem_singleton.mp new] at owned
      obtain rfl := only other present (Option.some.inj owned).symm
      exact role
  · rcases List.mem_append.mp one with old | new <;> rcases List.mem_append.mp two with old' | new'
    · exact holds.ownersApart first old second old' called called' same
    · rw [List.mem_singleton.mp new'] at same
      exact absurd same (unowned first old called)
    · rw [List.mem_singleton.mp new] at same
      exact absurd same.symm (unowned second old' called')
    · rw [List.mem_singleton.mp new, List.mem_singleton.mp new']

end Carry

/-- The state operations the hooks apply keep the lane invariant. -/
theorem callsFormed_alongside (program : Program) : Alongside (CallsFormed program) where
  frame _ _ moved held := held.same moved.scopes (fun _ member => moved.occurrences ▸ member) moved.instanceId
  signalBegin _ request _ held := held.signal (.begin request)
  issue _ held := held.same (by rw [Laws.State.issue_eq]) (by rw [Laws.State.issue_eq]; exact fun _ member => member)
    (by rw [Laws.State.issue_eq])
  enterScope _ _ element parent locals owner formed held := held.entered formed element parent locals owner
  reserve _ _ element scope formed _ held := held.reserved formed element scope
  leaveScope _ _ _ formed present _ held := held.left formed (Laws.State.leaveScope_left formed present)
  clearInside _ _ _ keep formed present kept held :=
    held.cleared formed (Laws.State.clearInside_cleared formed present keep) kept
  disarm _ _ host _ held := held.same (by rw [Laws.State.disarm_eq])
    (by rw [Laws.State.disarm_eq]; exact fun _ member => (List.mem_filter.mp member).1) (by rw [Laws.State.disarm_eq])
  setVariable _ s target name value _ held :=
    have same := Laws.State.setVariable_same s target name value
    held.same same.scopes (fun _ member => same.occurrences ▸ member) same.instanceId
  removeVariable _ s target name _ held :=
    have same := Laws.State.removeVariable_same s target name
    held.same same.scopes (fun _ member => same.occurrences ▸ member) same.instanceId
  instanceBegin _ request held := held.signal (.begin request)
  defer _ requests held := held.same (by rw [Laws.State.deferBegins_eq]) (by rw [Laws.State.deferBegins_eq]; exact fun _ member => member)
    (by rw [Laws.State.deferBegins_eq])
  leaveInstance _ _ _ _ formed _ _ present held := held.left formed (Laws.State.leaveScope_left formed present)
  runs _ _ held := held.same rfl (fun _ member => member) rfl

/-- Storing compensation runs keeps the lane invariant. -/
theorem callsFormed_stores (program : Program) : StoresAlongside (CallsFormed program) :=
  { (callsFormed_alongside program).toFrameAlongside with
    storeRuns := fun _ _ _ _ _ _ held => held.same rfl (fun _ member => member) rfl }

/-- The features' reservations, queued triggers and a Call's entry of its called root keep the lane invariant. -/
theorem callsFormed_occursAlongside (program : Program) : OccursAlongside program (CallsFormed program) where
  reserve _ element scope formed _ held := held.reserved formed element scope
  occur _ element scope leave writes rule _ held := held.signal (.occur element scope leave writes rule)
  compensate _ _ _ _ _ _ _ _ _ _ held := held.signal _
  throwCompensate _ _ _ _ _ _ _ _ _ held := held.signal _
  raise _ _ _ _ _ held := held.signal _
  enterCalled _ _ variables definition formed member _ role unowned held :=
    held.enterCalled formed member role unowned variables definition

/-- `Step`'s own phases keep the lane invariant; cancelling is `Proofs.Frame.FrameAlongside.cancelOccurrence`. -/
theorem callsFormed_stepAlongside (program : Program) : StepAlongside (CallsFormed program) where
  toFrameAlongside := (callsFormed_alongside program).toFrameAlongside
  journal _ _ _ _ held _ _ := held.same rfl (fun _ member => member) rfl
  dequeue _ _ _ _ _ held := held.same rfl (fun _ member => member) rfl
  untoken _ _ _ _ _ held := held.same rfl (fun _ member => member) rfl
  begin _ _ request role sourceType formed _ admitted _ _ held := held.begun formed request role sourceType admitted.2.1
  cancel _ _ _ formed held := (callsFormed_alongside program).toFrameAlongside.cancelOccurrence
    (fun _ id _ kept => kept.withoutRecord id) (fun _ _ _ kept => kept.same rfl (fun _ member => member) rfl) formed held
  runOrder _ _ _ held := held.same rfl (fun _ member => member) rfl

/-- `WellFormed` and the lane invariant of called instances. -/
def Formed (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ CallsFormed program s

/-- An input starts from an empty journal, outbox, draft and write log (`Step.onRunning`), which keeps `Formed`. -/
theorem formed_reset {s : State} (holds : Formed program s) :
    Formed program { s with journal := [], outbox := [], draft := {}, writes := [] } :=
  ⟨Laws.State.reset_wellFormed holds.1, holds.2.same rfl (fun _ inside => inside) rfl⟩

/-- The completion pipeline's own phases keep the lane invariant where they keep `WellFormed`. -/
theorem callsFormed_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) : Laws.Step.PipelinePhases Formed where
  startReserved _ s occurrence sourceType holds member unnamed :=
    ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, by
      rw [Laws.State.closeOwnItems_eq]
      exact (holds.2.startReserved member sourceType).same rfl (fun _ inside => inside) rfl⟩
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (callsFormed_alongside program).toFrameAlongside.removeOccurrence
      (fun _ id _ kept => kept.withoutRecord id) holds.1 holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds :=
    ⟨pipeline.recordEnd _ _ key terminal holds.1, by
      rw [Laws.State.recordEnd_eq]
      exact holds.2.same rfl (fun _ inside => inside) rfl⟩

/-- `Step`'s phases keep `WellFormed` and the lane invariant. -/
theorem formed_phases (phases : Laws.Step.Phases WellFormed) : Laws.Step.Phases Formed :=
  phases_alongside phases callsFormed_stepAlongside

/-- A start's fresh instance calls no instance. -/
theorem callsFormed_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    CallsFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)) := by
  rw [Laws.State.signal_eq, Laws.State.initial_eq]
  refine ⟨fun root member called => ?_, fun root member called => ?_, fun first member _ _ called => ?_⟩ <;>
    simp only [List.mem_singleton] at member <;> subst member <;> cases called

end Kernel.Proofs.Former
