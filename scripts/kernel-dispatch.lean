import Lean

/-!
Guards 1 and 2 of the [kernel architecture](../docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation):
closed dispatch and no catch-all, read from the built environment because only the elaborated matchers show which
type a `match`, `if let` or `matches` discriminates and which alternatives cover which constructors; and guard 9's
nested-inductive rule, read from the same environment because only the elaborated inductive shows its nesting.

- Closed dispatch: a guarded type is matched (`match`, `casesOn`, `rec`, `ctorIdx`) only in its owner module, the
  module that defines it, `Kernel.IL.Codec` and its submodules, the owner's own `Admission` and `Laws` modules, and
  `Kernel.Proofs.Step`; `Element` and `EventRole` also in `Kernel.AdmissionRegistry`. A `Laws` module's compiler-generated lemmas about a
  body it sees (`generatedFromSeen`) are not its matches. Nothing compares one with `==` or
  `decide`: no guarded type has a `DecidableEq` or `BEq` instance outside its defining module.
- No catch-all: no match alternative binds a guarded-type discriminant to a variable, so every alternative names
  the constructors it covers and a new constructor fails to compile at every dispatch site. The same holds at any
  depth of a pattern, for the guarded types and for the types in `unowned`, which have no dispatch owner: where one
  alternative names a constructor of such a type, no other alternative covers that position with a variable (`_`, a
  name, `if let`'s fall-through), at that position or above it.

- No nested inductive: no inductive type of an IL or state module (`Kernel.IL`, `Kernel.State` and their submodules)
  is nested or mutual, but `Kernel.Value`, the bounded value tree the owner admitted (OD2 (4), 2026-11-17), which
  carries the mark `guard-exception(9): OD2 (4)` at its definition and nests only through its `list` constructor's
  `List` of itself and its `map` constructor's `List` of `String` pairs. The mark is read from the source, so a
  removed mark fails without a rebuild; a mark on another type fails, and so does a field of a marked type that nests
  any other way.

The scan must see `Kernel.Step` match `Element` and `Kernel.Value` nest, so a scan that reads nothing fails too.

Usage, after `./scripts/lake.sh build Kernel kernelRun`: `./scripts/lake.sh run scripts/kernel-dispatch.lean`.
Prints one line per violation and exits 1 when it prints any.
-/

open Lean Meta

/-- Each guarded type with the modules, besides its defining module and `Kernel.IL.Codec` with its submodules, that may
match it. A listed module also covers its submodules. -/
def owners : List (Name × List Name) := [
  (`Kernel.Element, [`Kernel.Step, `Kernel.AdmissionRegistry, `Kernel.Laws.Step, `Kernel.Proofs.Step]),
  (`Kernel.EventRole, [`Kernel.Step, `Kernel.AdmissionRegistry, `Kernel.Laws.Step, `Kernel.Proofs.Step]),
  (`Kernel.Input, [`Kernel.Step, `Kernel.Laws.Step, `Kernel.Proofs.Step]),
  (`Kernel.Signal, [`Kernel.Step, `Kernel.Laws.Step, `Kernel.Proofs.Step]),
  (`Kernel.Continuation, [`Kernel.Step, `Kernel.Laws.Step, `Kernel.Proofs.Step]),
  (`Kernel.Raised, [`Kernel.Feature.Propagation, `Kernel.Feature.Subscriptions, `Kernel.Laws.Propagation,
    `Kernel.Laws.Subscriptions, `Kernel.Proofs.Step]),
  (`Kernel.OpenKind, [`Kernel.Proofs.Step]),
  (`Kernel.Trigger, [`Kernel.Feature.Subscriptions, `Kernel.Admission.Subscriptions, `Kernel.Laws.Subscriptions,
    `Kernel.Proofs.Step]),
  (`Kernel.Work, [`Kernel.Feature.Work, `Kernel.Admission.Work, `Kernel.Laws.Work, `Kernel.Proofs.Step]),
  (`Kernel.GatewayKind, [`Kernel.Feature.Flow, `Kernel.Admission.Flow, `Kernel.Laws.Flow, `Kernel.Proofs.Step]),
  (`Kernel.ScopeKind, [`Kernel.Feature.Scopes, `Kernel.Admission.Scopes, `Kernel.Laws.Scopes, `Kernel.Proofs.Step]),
  (`Kernel.Throw, [`Kernel.Feature.Propagation, `Kernel.Admission.Propagation, `Kernel.Laws.Propagation,
    `Kernel.Proofs.Step]),
  (`Kernel.MultiInstanceMode, [`Kernel.Feature.MultiInstance, `Kernel.Admission.MultiInstance,
    `Kernel.Laws.MultiInstance, `Kernel.Proofs.Step]),
  (`Kernel.JuelNode, [`Kernel.Feature.Data, `Kernel.Admission.Data, `Kernel.Laws.Data, `Kernel.Proofs.Step]),
  (`Kernel.JuelBinary, [`Kernel.Feature.Data, `Kernel.Admission.Data, `Kernel.Laws.Data, `Kernel.Proofs.Step]),
  (`Kernel.JuelUnary, [`Kernel.Feature.Data, `Kernel.Admission.Data, `Kernel.Laws.Data, `Kernel.Proofs.Step]),
  (`Kernel.JuelCall, [`Kernel.Feature.Data, `Kernel.Admission.Data, `Kernel.Laws.Data, `Kernel.Proofs.Step]),
  (`Kernel.JuelMethod, [`Kernel.Feature.Data, `Kernel.Admission.Data, `Kernel.Laws.Data, `Kernel.Proofs.Step]),
  (`Kernel.Feature.Data.Juel.JVal, [`Kernel.Feature.Data, `Kernel.Laws.Data, `Kernel.Proofs.Step])]

def guarded (type : Name) : Bool := owners.any (·.1 == type)

/-- Types that no catch-all may cover, with no dispatch owner: `Value`, whose meaning each feature decides at its own
site (owner decision 2026-11-17, recorded in `docs/REWRITE-2-PROPOSAL.md`): one owner would move per-feature
semantics into the IL layer or hide each site's decision behind accessors. -/
def unowned : List Name := [`Kernel.Value]

def allowed (env : Environment) (type module : Name) : Bool :=
  let defining := (env.getModuleIdxFor? type).bind fun idx => env.header.moduleNames[idx.toNat]?
  defining == some module || (`Kernel.IL.Codec).isPrefixOf module ||
    ((owners.find? (·.1 == type)).map (·.2.any (·.isPrefixOf module))).getD false

/-- The modules whose bodies the `Laws` module `laws` sees through `import all`: `Kernel.X`, `Kernel.Feature.X` and
their submodules for `Kernel.Laws.X`; none for any other module. -/
def seenBy (env : Environment) (laws : Name) : List Name :=
  match laws with
  | .str `Kernel.Laws own => env.header.moduleNames.toList.filter fun module =>
    (Name.str `Kernel own).isPrefixOf module || (Name.str `Kernel.Feature own).isPrefixOf module
  | _ => []

/-- Whether `declaration` of the `Laws` module `laws` is a lemma the compiler generated when a proof there unfolded a
body `laws` sees: the equation or splitter lemma of a matcher (the shape `Lean.Meta.Match`'s reserved-name predicate
accepts, `eq_<n>` or `splitter` on a matcher), or the equation or unfolding lemma of a definition
(`Lean.Meta.declFromEqLikeName`), in either case of a declaration a seen module defines. Lean names such a lemma
after its source with the generating module's private prefix, so the source is the user name, public or private to
a seen module. A hand-written declaration has no such name and stays scanned. -/
def generatedFromSeen (env : Environment) (laws declaration : Name) : Bool :=
  match declaration with
  | .str parent suffix =>
    let seen := seenBy env laws
    let user := privateToUserName parent
    let definedInSeen (source : Name) : Bool :=
      ((env.getModuleIdxFor? source).bind fun idx => env.header.moduleNames[idx.toNat]?).any seen.contains
    let sources := (user :: seen.map (mkPrivateNameCore · user)).filter definedInSeen
    ((isEqnReservedNameSuffix suffix || suffix == "splitter") && sources.any (isMatcherCore env)) ||
      sources.any fun source => (declFromEqLikeName env (.str source suffix)).isSome
  | _ => false

/-- The guarded type a constant inspects directly, other than through a matcher. -/
def directUse (env : Environment) (constant : Name) : Option Name :=
  match constant with
  | .str type suffix =>
    if guarded type && ["casesOn", "rec", "recOn", "brecOn", "ctorIdx", "toCtorIdx"].contains suffix then some type
    else if suffix.startsWith "instDecidableEq" || suffix.startsWith "instBEq" then
      (owners.find? fun (guardedType, _) => suffix.endsWith guardedType.getString!).map (·.1)
        |>.filter fun _ => (env.find? constant).isSome
    else none
  | _ => none

structure Finding where
  module : Name
  declaration : Name
  message : String

/-- The guarded discriminant types of a matcher, by position, and the positions some alternative binds to a
variable while the type has more than one constructor. -/
def analyzeMatcher (matcher : Name) (info : Match.MatcherInfo) : MetaM (List (Nat × Name) × List Name) := do
  let constant ← getConstInfo matcher
  forallTelescope constant.type fun xs _ => do
    let discriminants := (xs.extract (info.numParams + 1) (info.numParams + 1 + info.numDiscrs)).toList
    let alternatives := (xs.extract (info.numParams + 1 + info.numDiscrs) xs.size).toList
    let mut types : List (Nat × Name) := []
    for (discriminant, position) in discriminants.zipIdx do
      let type ← whnf (← inferType discriminant)
      if let .const name _ := type.getAppFn then
        if guarded name then types := types ++ [(position, name)]
    let mut catchAll : List Name := []
    for alternative in alternatives do
      let patterns ← forallTelescope (← inferType alternative) fun _ conclusion => pure conclusion.getAppArgs
      for (position, type) in types do
        let constructors := match (← getEnv).find? type with
          | some (.inductInfo induct) => induct.ctors.length
          | _ => 0
        if let some pattern := patterns[position]? then
          if pattern.isFVar && constructors > 1 && !catchAll.contains type then catchAll := catchAll ++ [type]
    pure (types, catchAll)

/-- A step into a pattern: the constructor applied and the index of its field. -/
abbrev PatternStep := Name × Nat

/-- The positions of a pattern where a constructor of a guarded or `unowned` type is named, with that type, and the
positions a variable covers, each as a path from its discriminant. -/
partial def positions (env : Environment) (path : List PatternStep) (pattern : Expr) :
    MetaM (List (List PatternStep × Name) × List (List PatternStep)) := do
  let pattern := pattern.consumeMData
  if pattern.isFVar then return ([], [path])
  let .const head _ := pattern.getAppFn | return ([], [])
  let some (.ctorInfo ctor) := env.find? head | return ([], [])
  let mut named : List (List PatternStep × Name) := []
  if guarded ctor.induct || unowned.contains ctor.induct then named := [(path, ctor.induct)]
  let mut variables : List (List PatternStep) := []
  for (field, index) in (pattern.getAppArgs.extract ctor.numParams pattern.getAppNumArgs).toList.zipIdx do
    let (inner, covered) ← positions env (path ++ [(head, index)]) field
    named := named ++ inner
    variables := variables ++ covered
  return (named, variables)

/-- The guarded and `unowned` types some alternative of a matcher covers with a variable at or above a position where
another alternative names one of their constructors. -/
def nestedCatchAll (matcher : Name) (info : Match.MatcherInfo) : MetaM (List Name) := do
  let constant ← getConstInfo matcher
  let env ← getEnv
  forallTelescope constant.type fun xs _ => do
    let alternatives := (xs.extract (info.numParams + 1 + info.numDiscrs) xs.size).toList
    let mut perAlternative : List (List (List PatternStep × Name) × List (List PatternStep)) := []
    for alternative in alternatives do
      let found ← forallTelescope (← inferType alternative) fun _ conclusion => do
        let mut named : List (List PatternStep × Name) := []
        let mut variables : List (List PatternStep) := []
        for (pattern, position) in (conclusion.getAppArgs.toList.take info.numDiscrs).zipIdx do
          let (inner, covered) ← positions env [(`discriminant, position)] pattern
          named := named ++ inner
          variables := variables ++ covered
        pure (named, variables)
      perAlternative := perAlternative ++ [found]
    let mut types : List Name := []
    for ((_, variables), index) in perAlternative.zipIdx do
      for ((named, _), other) in perAlternative.zipIdx do
        if other == index then continue
        for (path, type) in named do
          if variables.any (·.isPrefixOf path) && !types.contains type then types := types ++ [type]
    pure types

def scan (env : Environment) : MetaM (List Finding × Bool) := do
  let mut findings : List Finding := []
  let mut stepMatchesElement := false
  let mut analyzed : Std.HashMap Name (List (Nat × Name) × List Name) := {}
  let mut nestedAnalyzed : Std.HashMap Name (List Name) := {}
  for (declaration, info) in env.constants.map₁.toList do
    let some idx := env.getModuleIdxFor? declaration | continue
    let some module := env.header.moduleNames[idx.toNat]? | continue
    unless (`Kernel).isPrefixOf module do continue
    if (Match.Extension.getMatcherInfo? env declaration).isSome then continue
    if generatedFromSeen env module declaration then continue
    let some value := info.value? (allowOpaque := true) | continue
    for used in value.getUsedConstants do
      if let some type := directUse env used then
        unless allowed env type module do
          findings := findings ++ [{ module, declaration, message := s!"uses {used} on guarded {type}" }]
      if let some matcherInfo := Match.Extension.getMatcherInfo? env used then
        let result ← match analyzed.get? used with
          | some result => pure result
          | none => do
            let result ← analyzeMatcher used matcherInfo
            analyzed := analyzed.insert used result
            pure result
        let (types, catchAll) := result
        for (_, type) in types do
          if module == `Kernel.Step && type == `Kernel.Element then stepMatchesElement := true
          unless allowed env type module do
            findings := findings ++ [{ module, declaration, message := s!"matches guarded {type} outside its owner" }]
        for type in catchAll do
          findings := findings ++ [{ module, declaration, message := s!"catch-all alternative over guarded {type}" }]
        let nestedCatchAlls ← match nestedAnalyzed.get? used with
          | some result => pure result
          | none => do
            let result ← nestedCatchAll used matcherInfo
            nestedAnalyzed := nestedAnalyzed.insert used result
            pure result
        for type in nestedCatchAlls do
          -- A codec decodes `Value` from the wire and decides no meaning; no module may cover a guarded type.
          if guarded type then
            findings := findings ++ [{ module, declaration, message := s!"catch-all alternative over guarded {type}" }]
          else unless (`Kernel.IL.Codec).isPrefixOf module do
            findings := findings ++ [{ module, declaration, message := s!"catch-all alternative over {type}" }]
  pure (findings, stepMatchesElement)

/-- The modules whose inductive types are IL or state types, none of which may be nested or mutual. -/
def shapeModules : List Name := [`Kernel.IL, `Kernel.State]

/-- The one nested inductive type the owner admitted (OD2 (4), 2026-11-17), the bounded value tree. -/
def admittedNested : Name := `Kernel.Value

/-- The exception mark the admitted type carries at its definition, from the line above it to the line naming it. -/
def nestingMark : String := "guard-exception(9): OD2 (4)"

/-- Whether `field`, of `constructor` of the marked `type`, is a nesting the mark admits: a `list` constructor's `List`
of `type`, or a `map` constructor's `List` of pairs of a `String` and `type`. -/
def admittedField (constructor type : Name) (field : Expr) : Bool :=
  field.isAppOfArity ``List 1 &&
    match constructor, field.appArg! with
    | .str _ "list", element => element.isConstOf type
    | .str _ "map", element =>
      element.isAppOfArity ``Prod 2 && element.appArg!.isConstOf type && element.appFn!.appArg!.isConstOf ``String
    | _, _ => false

/-- A nested or mutual inductive type of an IL or state module: where its exception mark may lie, from the line above
its declaration to the line naming it, and the constructor fields that nest it outside the admitted ones. -/
structure Nesting where
  module : Name
  type : Name
  isMutual : Bool
  firstLine : Nat
  nameLine : Nat
  fields : List String

/-- The constructor fields of `type` that mention it and that the mark does not admit. -/
def unadmittedFields (type : Name) (info : InductiveVal) : MetaM (List String) := do
  let mut found : List String := []
  for constructor in info.ctors do
    let constant ← getConstInfo constructor
    let here ← forallTelescope constant.type fun fields _ => do
      let mut here : List String := []
      for field in fields.toList.drop info.numParams do
        let fieldType ← inferType field
        if (fieldType.find? (·.isConstOf type)).isSome && !admittedField constructor type fieldType then
          here := here ++ [s!"{constructor} nests it through {← ppExpr fieldType}"]
      pure here
    found := found ++ here
  pure found

def nestings (env : Environment) : MetaM (List Nesting) := do
  let mut found : List Nesting := []
  for (type, info) in env.constants.map₁.toList do
    let .inductInfo induct := info | continue
    let some idx := env.getModuleIdxFor? type | continue
    let some module := env.header.moduleNames[idx.toNat]? | continue
    unless shapeModules.any (·.isPrefixOf module) do continue
    unless induct.numNested > 0 || induct.all.length > 1 do continue
    let (firstLine, nameLine) := match ← findDeclarationRanges? type with
      | some ranges => (ranges.range.pos.line, ranges.selectionRange.pos.line)
      | none => (0, 0)
    let fields ← unadmittedFields type induct
    let isMutual := induct.all.length > 1
    found := found ++ [{ module := module, type := type, isMutual, firstLine, nameLine, fields : Nesting }]
  pure found

/-- What one nesting violates: a nested type is admitted only when it is `admittedNested`, carries the mark and nests
only through the fields the mark admits; a mutual one never is. -/
def nestingFindings (nesting : Nesting) : IO (List Finding) := do
  let finding (message : String) : Finding := { module := nesting.module, declaration := nesting.type, message }
  if nesting.isMutual then return [finding "is a mutual inductive IL or state type"]
  let path := (System.FilePath.mk ("/".intercalate (nesting.module.components.map (·.toString)))).addExtension "lean"
  let lines := (← IO.FS.readFile path).splitOn "\n"
  let window := (lines.drop (nesting.firstLine - 2)).take (nesting.nameLine + 2 - nesting.firstLine)
  unless nesting.nameLine > 0 && window.any (fun line => (line.splitOn nestingMark).length > 1) do
    return [finding "is a nested inductive IL or state type"]
  let other := if nesting.type == admittedNested then [] else
    [finding s!"carries the {nestingMark} mark, which admits only {admittedNested}"]
  return other ++ nesting.fields.map finding

unsafe def main (_ : List String) : IO UInt32 := do
  initSearchPath (← findSysroot)
  -- Matcher information lives in an environment extension, which only loads with initializers enabled.
  enableInitializersExecution
  let env ← importModules #[{ module := `Kernel, importAll := true }, { module := `Kernel.Run, importAll := true }]
    {} (loadExts := true)
  let context : Core.Context := { fileName := "kernel-dispatch", fileMap := default }
  let ((findings, sawStep), _) ← (scan env).run'.toIO context { env }
  let (nested, _) ← (nestings env).run'.toIO context { env }
  let mut nestingFound : List Finding := []
  for nesting in nested do nestingFound := nestingFound ++ (← nestingFindings nesting)
  let sawValue := nested.any (·.type == admittedNested)
  let lines := ((findings ++ nestingFound).map fun finding =>
    s!"{finding.module} {finding.declaration}: {finding.message}").eraseDups
  for line in lines.toArray.qsort (· < ·) do IO.println line
  unless sawStep do IO.println "the scan saw no match on Kernel.Element in Kernel.Step, so it read nothing"
  unless sawValue do IO.println s!"the scan saw no nested {admittedNested}, so it read no IL or state inductive"
  return if lines.isEmpty && sawStep && sawValue then 0 else 1
