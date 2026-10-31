import Lean

/-!
The realized-constant check of the [build modularity specification](../docs/LEAN-BUILD-MODULARITY-SPEC.md#module-rules):
no module-system module this project builds for the given roots may carry a realized private constant in its public
`.olean`. An ordinary private declaration is never exported (Lean v4.34.1 `AddDecl.lean:138-143`), but a realized one
is (`Environment.lean:723-724`, an upstream `TODO`): the equation, unfolding and functional induction lemmas a `simp`,
`rw` or `induction` realizes for a hidden definition, and the equations, splitters and congruence equations of its
`match`es and a sparse case split's `else_eq`. Their statements follow the owning body, so an edit inside it would
rebuild the module's public cone; `privateEquations` and `privateMatchEquations`
(`BpmnSemantics/PrivateEquationLemmas.lean`) declare them privately first. Lean also exports the name of every sparse
case split, a private owner's included (`sparseCasesOnExt`, `AuxRecursor.lean:53`), which no declaration can keep
private, so an edit adding or removing one changes the interface; the library therefore builds with
`backward.match.sparseCases` off, and the check counts each exported sparse case split like a realized constant. A
source scan cannot tell which proofs realize what, so the check reads the built `.olean` files.

Only a hidden body is guarded. A realized constant whose matcher or sparse case split the owner's public declaration
already states, in an exposed body or in a theorem's statement, changes only with an edit that changes that
declaration's interface anyway, and so does an equation lemma of a definition whose body is exposed, such as
`Option.bind` from Lean core; the check exempts both. Owners are looked up in the public `.olean` files of every module
the roots reach, Lean's own included.

The check is a ratchet over the recorded leaks in `scripts/lean-realized-leaks.tsv`, one
`<module>\t<owner module>\t<owner>\t<kind>` line per module leaking constants of an owner's hidden body, the kind
`realized` for a realized lemma and `sparse` for an exported sparse case split, so that a recorded sparse case split of an
owner never covers a realized lemma of the same owner (correction audit R2, 2026-10-31): a sweep that declared every
recorded leak privately was rejected (2026-10-30), because each realizing module needs its own declaration, a hidden
copy makes importers that reused it generate their own, and a `@[simp] def` or a theorem whose own proof splits a
`match` generates them before any declaration can. Recorded leaks go by consuming the owner through lemmas; the
fan-out model (`scripts/lean-fanout.ts`) counts each one meanwhile, so an unrecorded leak would let the fan-out bounds
under-predict, and a stale line would let them over-predict.

The witness module must leak a realized lemma, not only a sparse case split, so a check that reads nothing, the wrong
files, or no realized constant fails too.

Usage, after the owning gate built the roots:
`./scripts/lake.sh run scripts/lean-realized-leaks.lean <witness> <recorded leaks> <root>...`. Prints each unrecorded
leak as `new <line>` with one of its constants, and each recorded line no module leaks any more as `stale <line>`, and
exits 1 when it prints anything or the witness does not leak.
-/

open Lean System

/-- The modules the roots reach through imports of any form whose `.olean` this project built, below `build`. -/
private partial def reachable (build : FilePath) (pending : List Name) (seen : NameSet) : IO NameSet := do
  match pending with
  | [] => return seen
  | module :: rest =>
    if seen.contains module then return ← reachable build rest seen
    let olean ← findOLean module
    unless olean.toString.startsWith build.toString do return ← reachable build rest seen
    let (data, _) ← readModuleData olean
    reachable build (data.imports.toList.map (·.module) ++ rest) (seen.insert module)

/--
Whether a name ends in a component Lean realizes on demand (`Eqns.lean`, `MatchEqs.lean`, `SparseCasesOnEq.lean`,
`FunInd.lean`). A private inductive type, which Lean exports with its constructors and recursor, is no realization.
-/
private def isRealized : Name → Bool
  | .str _ s =>
    let indexed (pfx : String) := s.startsWith pfx && (s.drop pfx.length).all Char.isDigit && s.length > pfx.length
    indexed "eq_" || indexed "congr_eq_" ||
      ["eq_def", "eq_unfold", "splitter", "else_eq", "induct", "mutual_induct", "fun_cases"].contains s
  | _ => false

/-- The user-facing name of a constant, without the private prefix of the module that declared or realized it. -/
private def userName (n : Name) : Name := (privateToUserName? n).getD n

/-- The owner of a realized constant and the matcher or sparse case split it belongs to, if it belongs to one. -/
private def auxiliaryOf? (n : Name) : Option (Name × Name) := Id.run do
  let parts := (userName n).components
  for i in [1:parts.length] do
    if let .str _ s := parts[i]! then
      if s.startsWith "match_" || s.startsWith "_sparseCasesOn_" then
        let owner := (parts.take i).foldl (· ++ ·) .anonymous
        return some (owner, owner ++ parts[i]!)
  return none

/-- The definition a realized constant was generated for: the owner of its matcher or sparse case split, else the constant's prefix. -/
private def ownerOf (n : Name) : Name := (auxiliaryOf? n).map (·.1) |>.getD (userName n).getPrefix

/-- What an owner's public declaration states: the user-facing names its type and value use, and whether it exports a body. -/
private structure PublicFacts where
  module : Name
  uses : NameSet
  exposed : Bool

/-- The public facts of each `wanted` owner, read from the public `.olean` of every module the roots reach. -/
private partial def publicFacts (wanted : NameSet) (pending : List Name) (seen : NameSet)
    (found : Std.HashMap Name PublicFacts) : IO (Std.HashMap Name PublicFacts) := do
  match pending with
  | [] => return found
  | module :: rest =>
    if seen.contains module then return ← publicFacts wanted rest seen found
    let olean ← findOLean module
    unless ← olean.pathExists do return ← publicFacts wanted rest (seen.insert module) found
    let (data, _) ← readModuleData olean
    let mut found := found
    for info in data.constants do
      let owner := userName info.name
      if wanted.contains owner then
        let value := match info with | .defnInfo d => some d.value | _ => none
        let uses := (info.type.getUsedConstants ++ (value.map (·.getUsedConstants) |>.getD #[])).foldl
          (fun uses n => uses.insert (userName n)) {}
        found := found.insert owner { module, uses, exposed := value.isSome }
    publicFacts wanted (data.imports.toList.map (·.module) ++ rest) (seen.insert module) found

/--
Whether a realized constant's owner states it publicly anyway, so that only an interface edit can change it: the owner
exports its body, or its public declaration uses the constant's matcher or sparse case split.
-/
private def statedPublicly (facts : Std.HashMap Name PublicFacts) (n : Name) : Bool :=
  (facts.get? (ownerOf n)).any fun facts => facts.exposed || (auxiliaryOf? n).any (facts.uses.contains ·.2)

/-- The module of a private name `_private.<module>.0.<name>`. -/
private def privateModule? : Name → Option Name
  | .num p 0 => if p.getRoot == `_private then some (p.components.drop 1 |>.foldl (· ++ ·) .anonymous) else privateModule? p
  | .num p _ | .str p _ => privateModule? p
  | .anonymous => none

/--
The module declaring a realized constant's owner: where the owner's public declaration is, else the constant's own
private prefix, which a private owner's equations and `else_eq` carry.
-/
private def ownerModule? (facts : Std.HashMap Name PublicFacts) (n : Name) : Option Name :=
  (facts.get? (ownerOf n)).map (·.module) <|> privateModule? n

/--
The sparse case splits a module's `.olean` tags; the tag extension stores each entry as a `Name`. It also tags each
inductive type's constructor eliminators (`CtorElim.lean:206`), which belong to the type's interface, so only
`_sparseCasesOn_` auxiliaries of a body count.
-/
private unsafe def sparseCaseSplitsImpl (data : ModuleData) : Array Name :=
  data.entries.foldl (init := #[]) fun found (extension, entries) =>
    if extension.componentsRev.head? == some `sparseCasesOnExt then found ++ entries.map (unsafeCast ·) else found

@[implemented_by sparseCaseSplitsImpl]
private opaque sparseCaseSplits (data : ModuleData) : Array Name

/--
The realized private constants and the sparse case splits in a module-system module's public `.olean`, each with its
kind; a plain file exports everything.
-/
private def leaks (module : Name) : IO (Array (Name × String)) := do
  let olean ← findOLean module
  unless ← (olean.addExtension "private").pathExists do return #[]
  let (data, _) ← readModuleData olean
  return (data.constNames.filter (fun n => isPrivateName n && isRealized n)).map (·, "realized") ++
    ((sparseCaseSplits data).filter (auxiliaryOf? · |>.isSome)).map (·, "sparse")

def main (args : List String) : IO UInt32 := do
  let witness :: recordedPath :: roots@(_ :: _) := args | throw <| IO.userError "usage: <witness module> <recorded leaks> <root module>..."
  let witness := witness.toName
  let roots := roots.map String.toName
  let recorded := (← IO.FS.lines recordedPath).filter (!·.isEmpty)
  initSearchPath (← findSysroot)
  let modules ← reachable ((← IO.currentDir) / ".lake" / "build") roots {}
  unless modules.contains witness do throw <| IO.userError s!"the roots do not reach the witness {witness}"
  let ordered := modules.toList.toArray.qsort Name.lt
  let realized ← ordered.mapM fun module => return (module, ← leaks module)
  let owners := realized.foldl (init := ({} : NameSet)) fun owners (_, found) => found.foldl (init := owners) fun owners (n, _) =>
    owners.insert (ownerOf n)
  let facts ← publicFacts owners roots {} {}
  let mut failed := false
  let mut leaking : Std.HashSet String := {}
  for (module, all) in realized do
    let found := all.filter (!statedPublicly facts ·.1)
    if module == witness then
      unless found.any (·.2 == "realized") do
        IO.eprintln s!"the witness {witness} carries no realized lemma, so the check would not see one"
        failed := true
      continue
    for (constant, kind) in found do
      let some ownerModule := ownerModule? facts constant
        | IO.println s!"unattributed {module} {constant}"; failed := true; continue
      let line := s!"{module}\t{ownerModule}\t{ownerOf constant}\t{kind}"
      unless leaking.contains line || recorded.contains line do
        IO.println s!"new {line}\t{constant}"
        failed := true
      leaking := leaking.insert line
  for line in recorded do
    unless leaking.contains line do
      IO.println s!"stale {line}"
      failed := true
  return if failed then 1 else 0
