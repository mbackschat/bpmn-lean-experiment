import Lean

/-!
Guards 17, 18 and 19 of the [kernel architecture](../docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation),
read from the built environment because who calls what, which state field a structure update writes and which field a
pattern reads are only visible after elaboration. The dispatch guards see matches and miss effects: nine completers
passed guards 1 and 2 (hence guard 17), so this scan reads calls and writes rather than matches.

- One writer per effect (17): one writer per `Token` case, flow tokens emitted only by `Feature.Flow` and deferred begins
  stacked only by `Feature.MultiInstance`; variables are written only by `Feature.Data`; occurrences and activations are created and removed only by `Step` and `State`; the completion pipeline's hooks are
  called only by `Step`. A rule that sees no permitted caller fails, so a renamed primitive cannot read as clean.
- Field liveness (19): every field of a structure in `Kernel.IL.Types` is read by a non-codec declaration or refused by
  `Kernel.Admission`, which reads it. A matcher over a structure counts as reading all of its fields, because the
  binder cap of guard 9 keeps such patterns exhaustive.
- Fan-out (18): match sites per guarded type, codecs excluded, against `budgets` below; a new mechanism that needs
  another site changes the seam, not the budget, and the budget moves only by owner decision.

Usage, after `./scripts/lake.sh build Kernel kernelRun`: `./scripts/lake.sh run scripts/kernel-effects.lean`.
Prints one line per finding and exits 1 when it prints any. `--self-test` elaborates the fixture below with violations
seeded (guard 23) and exits 0 only when each is reported, and when a scan of an environment with no kernel fails.
-/

open Lean Meta

namespace KernelEffects

structure CallRule where
  primitive : Name
  writers : List Name
  label : String

/-- The effect primitives and the modules that may call them; the module defining one may always call it. -/
def callRules : List CallRule :=
  let flow := [`Kernel.Feature.Flow]
  let data := [`Kernel.Feature.Data]
  let lifecycle := [`Kernel.Step, `Kernel.State]
  let tokens := "flow tokens are emitted only by Flow"
  let variables := "variables are written only by Data"
  let occurrences := "occurrences are created and removed only by Step and State"
  [ ⟨`Kernel.State.emit, flow, tokens⟩,
    ⟨`Kernel.State.deferBegins, [`Kernel.Feature.MultiInstance], "deferred begins are stacked only by MultiInstance"⟩,
    ⟨`Kernel.State.setVariable, data, variables⟩,
    ⟨`Kernel.State.beginOccurrence, lifecycle, occurrences⟩,
    ⟨`Kernel.State.startReserved, lifecycle, occurrences⟩,
    ⟨`Kernel.State.reserve, lifecycle, occurrences⟩,
    ⟨`Kernel.State.removeOccurrence, lifecycle, occurrences⟩,
    ⟨`Kernel.State.cancelOccurrence, lifecycle, occurrences⟩,
    ⟨`Kernel.State.activate, lifecycle, occurrences⟩,
    ⟨`Kernel.Step.complete, [`Kernel.Step], "an Activity completes only through Step's one pipeline"⟩ ]

/-- The completion pipeline's hooks, idle completion and the lifecycle notifications, which only `Kernel.Step` calls
(guard 17). Each must have a caller there, so a renamed hook fails rather than leaving its rule empty. -/
def pipelineHooks : List Name :=
  [`Kernel.Hooks.leave, `Kernel.Hooks.writeOutputs, `Kernel.Hooks.completed, `Kernel.Hooks.outflow,
   `Kernel.Hooks.instanceCompleted, `Kernel.Hooks.handlerCompleted, `Kernel.Hooks.completeScope,
   `Kernel.Hooks.completeCall, `Kernel.Hooks.completeBody, `Kernel.Hooks.cancelled, `Kernel.Hooks.written]

/-- The `State` fields whose writes are ruled, and the modules that may write them through a structure update. -/
def fieldWriters : List (Name × List Name) :=
  let lifecycle := [`Kernel.State, `Kernel.Step]
  [(`tokens, lifecycle), (`occurrences, lifecycle), (`activations, lifecycle), (`variables, [`Kernel.State]),
   (`writes, lifecycle)]

/-- Maximum match sites per guarded type across the kernel, codecs excluded (guard 18). Values measured 2026-11-08 on
the mid-rewrite tree; the owner sets them once the W0.1 shape lands, and only by owner decision after. -/
def budgets : List (Name × Nat) := [
  (`Kernel.Element, 13), (`Kernel.EventRole, 7), (`Kernel.Input, 3), (`Kernel.Signal, 3),
  (`Kernel.Continuation, 4), (`Kernel.Raised, 9), (`Kernel.OpenKind, 2), (`Kernel.Trigger, 11),
  (`Kernel.Work, 11), (`Kernel.GatewayKind, 4), (`Kernel.ScopeKind, 7), (`Kernel.Throw, 4),
  (`Kernel.MultiInstanceMode, 4),
  -- The JUEL types (M2), measured 2026-11-10; each is its TypeScript budget plus the derived `Repr` instance that
  -- `Expression`'s derived `Repr` requires.
  (`Kernel.JuelNode, 3), -- Admission.Data.juelNode, Feature.Data.Juel.visit, Repr
  (`Kernel.JuelBinary, 3), -- Admission.Data.juelOperator, Feature.Data.Juel.operate, Repr (2026-11-10: guard 2's owner clause)
  (`Kernel.JuelUnary, 2), -- Feature.Data.Juel.unary, Repr
  (`Kernel.JuelCall, 3), -- Admission.Data.juelCall, Feature.Data.Juel.methodCall, Repr
  (`Kernel.JuelMethod, 5)] -- the String, List and Map methods, JuelMethod.admits, Repr

structure Uses where
  constants : NameSet := {}
  projections : Std.HashSet (Name × Nat) := {}
  writtenFields : NameSet := {}

/-- What a value references: constants, `.proj` projections, and the `State` fields a `State.mk` application replaces.
A structure update elaborates to `State.mk` with every kept field re-projected from the source, so a field whose
argument is not a projection of its own index is a written field. -/
partial def collect (stateFields : Array Name) (root : Expr) : Uses := Id.run do
  let mut uses : Uses := {}
  let mut visited : Std.HashSet Expr := {}
  let mut stack := [root]
  while !stack.isEmpty do
    let expr := stack.head!
    stack := stack.tail!
    if visited.contains expr then continue
    visited := visited.insert expr
    match expr with
    | .const name _ => uses := { uses with constants := uses.constants.insert name }
    | .proj owner index body =>
      uses := { uses with projections := uses.projections.insert (owner, index) }
      stack := body :: stack
    | .app .. =>
      let function := expr.getAppFn
      let arguments := expr.getAppArgs
      if function.isConstOf `Kernel.State.mk && arguments.size == stateFields.size then
        for h : index in [0:arguments.size] do
          let argument := arguments[index]
          let field := stateFields[index]!
          let keeps := match argument with
            | .proj _ source _ => source == index
            | _ => argument.getAppFn.isConstOf (`Kernel.State ++ field)
          unless keeps do uses := { uses with writtenFields := uses.writtenFields.insert field }
      stack := function :: arguments.toList ++ stack
    | .lam _ type body _ | .forallE _ type body _ => stack := type :: body :: stack
    | .letE _ type value body _ => stack := type :: value :: body :: stack
    | .mdata _ body => stack := body :: stack
    | _ => pure ()
  return uses

/-- The discriminant type heads of a matcher, by position. -/
def matcherTypes (matcher : Name) (info : Match.MatcherInfo) : MetaM (List Name) := do
  let constant ← getConstInfo matcher
  forallTelescope constant.type fun xs _ => do
    let discriminants := (xs.extract (info.numParams + 1) (info.numParams + 1 + info.numDiscrs)).toList
    discriminants.filterMapM fun discriminant => do
      pure (← whnf (← inferType discriminant)).getAppFn.constName?

/-- Compiler-generated declarations (derived instances, recursors, match helpers) are not readers: a derived `Repr`
touches every field, so counting one would mark every field live. -/
def isGenerated (env : Environment) (declaration : Name) : Bool :=
  declaration.isInternal || declaration.hasMacroScopes || isAuxRecursor env declaration ||
    isNoConfusion env declaration || env.isProjectionFn declaration ||
    (Match.Extension.getMatcherInfo? env declaration).isSome ||
    (match declaration with
     | .str _ last => ["sizeOf", "ctorIdx", "toCtorIdx", "injEq", "inj", "sizeOf_spec", "noConfusionType"].contains last
     | _ => false)

structure Config where
  /-- The module a declaration belongs to; the fixture maps by namespace, a real scan by the module table. -/
  moduleOf : Name → Option Name
  budgets : List (Name × Nat)
  /-- A real scan requires each guarded type to have at least one site, so a renamed type empties no budget silently. -/
  requireEveryGuardedType : Bool

def allowedFor (config : Config) (module : Name) (writers : List Name) (primitive : Name) : Bool :=
  config.moduleOf primitive == some module || writers.any (·.isPrefixOf module)

/-- Every executable kernel declaration with a value, across imported and local constants. `Kernel.Laws` and
`Kernel.Proofs` are not executable: a law's example state is no effect, and a law reading a field must not make a field
the executable kernel never reads look live (guard 19). -/
def kernelDeclarations (env : Environment) (config : Config) : Array (Name × Name × ConstantInfo) :=
  env.constants.fold (init := #[]) fun acc declaration info =>
    match config.moduleOf declaration with
    | some module =>
      if (`Kernel).isPrefixOf module && !(`Kernel.Laws).isPrefixOf module && !(`Kernel.Proofs).isPrefixOf module then
        acc.push (declaration, module, info)
      else acc
    | none => acc

structure Report where
  findings : Array String := #[]
  /-- Match sites per guarded type, as `(type, count)`. -/
  sites : Array (Name × Nat) := #[]

/-- The reading kinds a declaration may do, reduced to one fold over the environment. -/
def scan (config : Config) : MetaM Report := do
  let env ← getEnv
  let declarations := kernelDeclarations env config
  let stateFields := if isStructure env `Kernel.State then getStructureFields env `Kernel.State else #[]
  let mut findings : Array String := #[]
  let mut sawCaller : NameSet := {}
  let mut sawHookCaller : NameSet := {}
  let mut sawFieldWriter : NameSet := {}
  let mut readFields : Std.HashSet (Name × Name) := {}
  let mut matched : NameSet := {}
  let mut matcherCache : Std.HashMap Name (List Name) := {}
  let mut siteCounts : Std.HashMap Name Nat := {}
  for (declaration, module, info) in declarations do
    if (Match.Extension.getMatcherInfo? env declaration).isSome then continue
    let some value := info.value? (allowOpaque := true) | continue
    let uses := collect stateFields value
    for rule in callRules do
      if uses.constants.contains rule.primitive && declaration != rule.primitive then
        if allowedFor config module rule.writers rule.primitive then
          sawCaller := sawCaller.insert rule.primitive
        else
          findings := findings.push s!"G17 {module} {declaration}: calls {rule.primitive} ({rule.label})"
    for hook in pipelineHooks do
      if uses.constants.contains hook then
        if module == `Kernel.Step then sawHookCaller := sawHookCaller.insert hook
        else if config.moduleOf hook != some module then
          findings := findings.push s!"G17 {module} {declaration}: calls pipeline hook {hook} outside Step"
    for field in uses.writtenFields do
      if let some (_, writers) := fieldWriters.find? (·.1 == field) then
        if writers.any (·.isPrefixOf module) then sawFieldWriter := sawFieldWriter.insert field
        else findings := findings.push s!"G17 {module} {declaration}: writes State.{field} through a structure update"
    let reader := !(`Kernel.IL.Codec).isPrefixOf module && !isGenerated env declaration &&
      (info matches .defnInfo _ || info matches .opaqueInfo _) && !(← isInstance declaration)
    for used in uses.constants do
      if reader then
        if let some projection := env.getProjectionFnInfo? used then
          if isStructure env projection.ctorName.getPrefix then
            readFields := readFields.insert (projection.ctorName.getPrefix, used.componentsRev.head!)
      if let some matcherInfo := Match.Extension.getMatcherInfo? env used then
        let types ← match matcherCache.get? used with
          | some types => pure types
          | none => do
            let types ← matcherTypes used matcherInfo
            matcherCache := matcherCache.insert used types
            pure types
        for type in types.eraseDups do
          if reader then matched := matched.insert type
          if config.budgets.any (·.1 == type) && !(`Kernel.IL.Codec).isPrefixOf module then
            siteCounts := siteCounts.insert type ((siteCounts.getD type 0) + 1)
      if reader then
        if let .str inductName suffix := used then
          if ["casesOn", "rec", "recOn"].contains suffix then matched := matched.insert inductName
    if reader then
      for (owner, index) in uses.projections.toList do
        let fields := getStructureFields env owner
        if h : index < fields.size then readFields := readFields.insert (owner, fields[index])
  for rule in callRules do
    unless sawCaller.contains rule.primitive do
      findings := findings.push s!"G17: {rule.primitive} has no permitted caller, so its rule read nothing"
  for hook in pipelineHooks do
    unless sawHookCaller.contains hook do
      findings := findings.push s!"G17: {hook} is not called from Kernel.Step, so its rule read nothing"
  for (field, _) in fieldWriters do
    unless sawFieldWriter.contains field do
      findings := findings.push s!"G17: State.{field} has no permitted writer, so its rule read nothing"
  let mut structures : Array Name := #[]
  for (declaration, module, info) in declarations do
    if (`Kernel.IL.Types).isPrefixOf module && isStructure env declaration && (info matches .inductInfo _) then
      structures := structures.push declaration
  if structures.isEmpty then
    findings := findings.push "G19: read no structure in Kernel.IL.Types, so no field was checked"
  for owner in structures do
    unless matched.contains owner do
      for field in getStructureFields env owner do
        unless readFields.contains (owner, field) do
          findings := findings.push s!"G19 {owner}.{field}: read by no non-codec declaration and refused by no admission"
  let mut sites : Array (Name × Nat) := #[]
  for (type, budget) in config.budgets do
    let count := siteCounts.getD type 0
    sites := sites.push (type, count)
    if config.requireEveryGuardedType && count == 0 then
      findings := findings.push s!"G18: {type} has no match site, so the budget read nothing"
    if count > budget then
      findings := findings.push s!"G18: {count} match sites on {type}, above its budget of {budget}"
  pure { findings, sites }

def run (env : Environment) (config : Config) : IO Report :=
  Prod.fst <$> (scan config).run'.toIO { fileName := "kernel-effects", fileMap := default } { env }

/-- A self-contained kernel that keeps every rule's permitted caller and seeds each violation once. -/
def fixture : String := "
namespace Kernel
structure State where
  tokens : List Nat := []
  occurrences : List Nat := []
  activations : List Nat := []
  variables : List Nat := []
  writes : List Nat := []
structure Hooks where
  outflow : State → State := id
  completed : State → State := id
  leave : State → State := id
  writeOutputs : State → State := id
  instanceCompleted : State → State := id
  handlerCompleted : State → State := id
  completeScope : State → State := id
  completeCall : State → State := id
  completeBody : State → State := id
  cancelled : State → State := id
  written : State → State := id
namespace State
def emit (state : State) : State := { state with tokens := 1 :: state.tokens }
def deferBegins (state : State) : State := { state with tokens := 2 :: state.tokens }
def setVariable (state : State) : State := { state with variables := 1 :: state.variables, writes := [1] }
def beginOccurrence (state : State) : State := { state with occurrences := 1 :: state.occurrences }
def startReserved (state : State) : State := beginOccurrence state
def reserve (state : State) : State := beginOccurrence state
def removeOccurrence (state : State) : State := { state with occurrences := [] }
def cancelOccurrence (state : State) : State := removeOccurrence state
def activate (state : State) : State := { state with activations := 1 :: state.activations }
end State
namespace Step
def complete (hooks : Hooks) (state : State) : State :=
  hooks.handlerCompleted (hooks.instanceCompleted (hooks.writeOutputs (hooks.leave (hooks.completed (hooks.outflow state)))))
def idle (hooks : Hooks) (state : State) : State :=
  hooks.written (hooks.cancelled (hooks.completeBody (hooks.completeCall (hooks.completeScope state))))
def lifecycle (state : State) : State :=
  state.beginOccurrence.startReserved.reserve.removeOccurrence.cancelOccurrence.activate
def run (hooks : Hooks) (state : State) : State := complete hooks state
end Step
namespace Feature.Flow
def good (state : State) : State := state.emit
end Feature.Flow
namespace Feature.Data
def good (state : State) : State := state.setVariable
end Feature.Data
namespace Feature.MultiInstance
def good (state : State) : State := state.deferBegins
end Feature.MultiInstance
namespace Feature.Work
def seededEmit (state : State) : State := state.emit
def seededDefer (state : State) : State := state.deferBegins
def seededWrite (state : State) : State := { state with tokens := [] }
def seededHook (hooks : Hooks) (state : State) : State := hooks.outflow state
end Feature.Work
inductive Element where
  | task
  | gateway
structure Used where
  read : Nat
  unread : Nat
namespace IL.Types
def consume (used : Used) : Nat := used.read
end IL.Types
namespace IL.Codec
def codecOnly (used : Used) : Nat := used.unread
end IL.Codec
namespace Laws.State
def lawWrite (state : State) : State := { state with tokens := [], occurrences := [] }
def lawRead (used : Used) : Nat := used.unread
def lawLifecycle (state : State) : State := state.emit.beginOccurrence
end Laws.State
namespace Step
def firstMatch (element : Element) : Nat := match element with
  | .task => 1
  | .gateway => 2
def secondMatch (element : Element) : Nat := match element with
  | .task => 3
  | .gateway => 4
end Step
end Kernel
"

/-- Which fixture namespace is a module: the longest prefix among the fixture's stand-in modules. -/
def fixtureModuleOf (declaration : Name) : Option Name :=
  let modules := [`Kernel.Step, `Kernel.Feature.Flow, `Kernel.Feature.Data, `Kernel.Feature.MultiInstance,
    `Kernel.Feature.Work, `Kernel.IL.Codec, `Kernel.IL.Types, `Kernel.Hooks, `Kernel.State, `Kernel.Laws.State]
  match modules.filter (·.isPrefixOf declaration) with
  | [] => if (`Kernel).isPrefixOf declaration then some `Kernel.IL.Types else none
  | head :: tail => some (tail.foldl (fun best module => if best.isPrefixOf module then module else best) head)

def expectedInFixture : List String := [
  "calls Kernel.State.emit (flow tokens are emitted only by Flow)",
  "calls Kernel.State.deferBegins (deferred begins are stacked only by MultiInstance)",
  "writes State.tokens through a structure update",
  "calls pipeline hook Kernel.Hooks.outflow outside Step",
  "Kernel.Used.unread: read by no non-codec declaration",
  "2 match sites on Kernel.Element, above its budget of 1"]

def selfTest : IO UInt32 := do
  let base ← importModules #[{ module := `Init }] {} (loadExts := true)
  let (env, messages) ← Elab.process fixture base {} (some "kernel-effects-fixture")
  if messages.hasErrors then
    for message in messages.toList do IO.eprintln (← message.toString)
    IO.eprintln "the self-test fixture did not elaborate"
    return 1
  let config : Config := { moduleOf := fixtureModuleOf, budgets := [(`Kernel.Element, 1)], requireEveryGuardedType := false }
  let report ← run env config
  let joined := "\n".intercalate report.findings.toList
  let mut failed := false
  for expected in expectedInFixture do
    unless (joined.splitOn expected).length > 1 do
      IO.eprintln s!"self-test: the seeded violation was not reported: {expected}"
      failed := true
  -- A law builds states and reads fields without being an executable effect or reader (`lawWrite`, `lawRead`).
  if (joined.splitOn "Kernel.Laws").length > 1 then
    IO.eprintln "self-test: a Laws declaration was scanned as executable"
    failed := true
  let empty ← run base { moduleOf := fixtureModuleOf, budgets := [], requireEveryGuardedType := false }
  unless empty.findings.any (fun line => (line.splitOn "read nothing").length > 1 || (line.splitOn "read no ").length > 1) do
    IO.eprintln "self-test: a scan of an environment with no kernel did not fail"
    failed := true
  if failed then
    IO.eprintln joined
    return 1
  IO.println "kernel-effects self-test: every seeded violation was reported and the empty input failed"
  return 0

end KernelEffects

open KernelEffects in
unsafe def main (arguments : List String) : IO UInt32 := do
  initSearchPath (← findSysroot)
  -- Matcher information lives in an environment extension, which only loads with initializers enabled.
  enableInitializersExecution
  if arguments.contains "--self-test" then return ← selfTest
  let env ← importModules #[{ module := `Kernel, importAll := true }, { module := `Kernel.Run, importAll := true }]
    {} (loadExts := true)
  let moduleOf (declaration : Name) : Option Name :=
    (env.getModuleIdxFor? declaration).bind fun idx => env.header.moduleNames[idx.toNat]?
  let report ← run env { moduleOf, budgets, requireEveryGuardedType := true }
  for (type, count) in report.sites do IO.println s!"G18 sites {type}: {count}"
  let lines := report.findings.toList.eraseDups.toArray.qsort (· < ·)
  for line in lines do IO.println line
  return if lines.isEmpty then 0 else 1
