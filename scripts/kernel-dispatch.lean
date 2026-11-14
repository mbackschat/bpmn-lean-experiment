import Lean

/-!
Guards 1 and 2 of the [kernel architecture](../docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation):
closed dispatch and no catch-all, read from the built environment because only the elaborated matchers show which
type a `match`, `if let` or `matches` discriminates and which alternatives cover which constructors.

- Closed dispatch: a guarded type is matched (`match`, `casesOn`, `rec`, `ctorIdx`) only in its owner module, the
  module that defines it, `Kernel.IL.Codec`, the owner's own `Admission` and `Laws` modules, and `Kernel.Proofs.Step`;
  `Element` and `EventRole` also in `Kernel.AdmissionRegistry`. Nothing compares one with `==` or
  `decide`: no guarded type has a `DecidableEq` or `BEq` instance outside its defining module.
- No catch-all: no match alternative binds a guarded-type discriminant to a variable, so every alternative names
  the constructors it covers and a new constructor fails to compile at every dispatch site.

The scan must see `Kernel.Step` match `Element`, so a scan that reads nothing fails too.

Usage, after `./scripts/lake.sh build Kernel kernelRun`: `./scripts/lake.sh run scripts/kernel-dispatch.lean`.
Prints one line per violation and exits 1 when it prints any.
-/

open Lean Meta

/-- Each guarded type with the modules, besides its defining module and `Kernel.IL.Codec`, that may match it. A
listed module also covers its submodules. -/
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
  (`Kernel.JuelMethod, [`Kernel.Feature.Data, `Kernel.Admission.Data, `Kernel.Laws.Data, `Kernel.Proofs.Step])]

def guarded (type : Name) : Bool := owners.any (·.1 == type)

def allowed (env : Environment) (type module : Name) : Bool :=
  let defining := (env.getModuleIdxFor? type).bind fun idx => env.header.moduleNames[idx.toNat]?
  defining == some module || module == `Kernel.IL.Codec ||
    ((owners.find? (·.1 == type)).map (·.2.any (·.isPrefixOf module))).getD false

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

def scan (env : Environment) : MetaM (List Finding × Bool) := do
  let mut findings : List Finding := []
  let mut stepMatchesElement := false
  let mut analyzed : Std.HashMap Name (List (Nat × Name) × List Name) := {}
  for (declaration, info) in env.constants.map₁.toList do
    let some idx := env.getModuleIdxFor? declaration | continue
    let some module := env.header.moduleNames[idx.toNat]? | continue
    unless (`Kernel).isPrefixOf module do continue
    if (Match.Extension.getMatcherInfo? env declaration).isSome then continue
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
  pure (findings, stepMatchesElement)

unsafe def main (_ : List String) : IO UInt32 := do
  initSearchPath (← findSysroot)
  -- Matcher information lives in an environment extension, which only loads with initializers enabled.
  enableInitializersExecution
  let env ← importModules #[{ module := `Kernel, importAll := true }, { module := `Kernel.Run, importAll := true }]
    {} (loadExts := true)
  let ((findings, sawStep), _) ← (scan env).run'.toIO { fileName := "kernel-dispatch", fileMap := default } { env }
  let lines := (findings.map fun finding => s!"{finding.module} {finding.declaration}: {finding.message}").eraseDups
  for line in lines.toArray.qsort (· < ·) do IO.println line
  unless sawStep do IO.println "the scan saw no match on Kernel.Element in Kernel.Step, so it read nothing"
  return if lines.isEmpty && sawStep then 0 else 1
