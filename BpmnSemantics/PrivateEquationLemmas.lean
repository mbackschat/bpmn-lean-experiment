module

public meta import Lean.Meta.Constructions.SparseCasesOn
public meta import Lean.Meta.Constructions.SparseCasesOnEq
public meta import Lean.Meta.Eqns
public meta import Lean.Meta.Match.MatchEqsExt
public meta import Lean.Meta.Match.MatcherInfo
public meta import Lean.ReservedNameAction
public meta import Lean.DefEqAttrib

/-!
Declares equation lemmas of hidden definitions as ordinary private declarations, before a proof's `simp [f]`,
`rw [f]` or `unfold f` would realize them. Lean v4.34.1 exports every realized constant, even a private one
(`Environment.lean:723-724`, an upstream `TODO`), so a realized lemma states a hidden body in the module's public
`.olean` and a body edit rebuilds every importer; an ordinary private declaration is never exported
(`AddDecl.lean:138-143`), and Lean reuses an equation lemma already present under its expected name
(`Eqns.lean:225`, `:313`). The lemmas are the ones Lean would realize, computed by the same functions.

A `match` leaks the same way: `split`, `simp` and `unfold` realize its equations, splitter, congruence equations and a
sparse case split's `else_eq`, whose statements and binder names follow the owning body, so an edit inside the owner
changes the public `.olean` of every module that realized them (#55, 2026-10-30). Lean names the equations and the
splitter after the realizing module (`MatchEqs.lean:151-152`), so each module that proves through a matcher declares
them itself; the congruence equations and `else_eq` carry the owner's prefix and are found once declared there.
-/

public meta section

open Lean Meta

/-- The constants `names` need that `env₀` lacks, dependencies first. -/
private partial def realizedClosure (env₀ : Environment) (names : Array Name) : MetaM (Array ConstantInfo) := do
  let rec visit (n : Name) (seen : NameSet) (out : Array ConstantInfo) : MetaM (NameSet × Array ConstantInfo) := do
    if seen.contains n || env₀.contains n then return (seen, out)
    let info ← withoutExporting <| getConstInfo n
    let mut state := (seen.insert n, out)
    let used := info.type.getUsedConstants ++
      ((info.value? (allowOpaque := true)).map (·.getUsedConstants) |>.getD #[])
    for dependency in used do
      state ← visit dependency state.1 state.2
    return (state.1, state.2.push info)
  let mut state : NameSet × Array ConstantInfo := ({}, #[])
  for n in names do
    state ← visit n state.1 state.2
  return state.2

/-- The constants whose user-facing name is `user`: itself, else this module's private one, else every opened module's. -/
private def constantsNamed (user : Name) : MetaM (Array Name) := do
  let env ← getEnv
  if env.contains user then return #[user]
  let own := mkPrivateName env user
  if env.contains own then return #[own]
  return env.constants.map₁.fold (init := #[]) fun found n _ =>
    if privateToUserName? n == some user then found.push n else found

/-- The one constant whose user-facing name is `user`; several are an error, since none of them is the definition. -/
private def constantNamed? (user : Name) : MetaM (Option Name) := do
  match ← constantsNamed user with
  | #[n] => return some n
  | #[] => return none
  | several => throwError "{user} names several private constants: {several}"

/--
The matcher among the prefixes of `user`, whose equations, splitter and their helpers Lean realizes together. A prefix
may name helpers that several opened modules realized privately, such as a splitter; only the matcher, which its
definition's module declares once, has to be unique.
-/
private partial def matcherAbove? (user : Name) : MetaM (Option Name) := do
  match user with
  | .str parent _ | .num parent _ =>
    let env ← getEnv
    match (← constantsNamed parent).filter (isMatcherCore env) with
    | #[matcher] => return some matcher
    | #[] => matcherAbove? parent
    | several => throwError "{parent} names several matchers: {several}"
  | .anonymous => return none

/--
Declares what `realize` adds to the environment as ordinary private declarations, returning `realize`'s result: it
runs once and without keeping its effect, since a second realization in the same module finds Lean's cached one and
adds nothing, and the constants it names, with the dependencies they lack, are added in dependency order.
-/
private def declareRealized (realize : MetaM (α × Array Name)) : MetaM α := do
  let env₀ ← getEnv
  let (result, infos) ← withoutModifyingEnv do
    let (result, names) ← realize
    return (result, ← realizedClosure env₀ names)
  for info in infos do
    if (← getEnv).contains info.name then continue
    match info with
    | .thmInfo thm => addDecl (.thmDecl thm)
    | .defnInfo defn => addDecl (.defnDecl defn)
    | _ => throwError "unexpected realized constant {info.name}"
  return result

/--
Declares a matcher's equations and splitter, and optionally its congruence equations, privately, and registers the
equations, which later lookups need (`failed to retrieve match equations`, `MatchEqs.lean:157-159`). It fails when
they were realized earlier in the module, since those are exported already.
-/
private def declareMatcher (matcher : Name) (congruence : Bool) : MetaM Unit := do
  let splitter := mkPrivateName (← getEnv) matcher ++ `splitter
  if (((← getEnv).setExporting true).find? splitter).isSome then
    throwError "{matcher}: its equations were realized before this call; move the call before its first use"
  unless (← getEnv).contains splitter do
    let eqns ← declareRealized do
      let eqns ← Match.getEquationsFor matcher
      return (eqns, eqns.eqnNames.push eqns.splitterName)
    Match.registerMatchEqns matcher eqns
  if congruence then
    declareRealized do return ((), ← Match.genMatchCongrEqns matcher)

/--
Declares a dependency of an equation lemma privately, as Lean would realize it: a matcher's equations and splitter
through `declareMatcher`, any other reserved name, such as a sparse case split's `else_eq`, through its action.
Realizing it instead would export it (`Environment.lean:723-724`).
-/
private def declareDependency (dependency : Name) : MetaM Unit := do
  if (← getEnv).contains dependency then return
  if let some matcher ← matcherAbove? ((privateToUserName? dependency).getD dependency) then
    declareMatcher matcher (congruence := false)
  else if isReservedName (← getEnv) dependency then
    declareRealized do
      executeReservedNameAction dependency
      return ((), #[dependency])
  unless (← getEnv).contains dependency do
    throwError "unexpected realized dependency {dependency}"

/--
`name`, or the private definition, of this module or an opened one, whose user-facing name it is. An exposed body is
refused: its edit changes the public `.olean` anyway, so declaring its lemmas privately only hides that from a reader.
-/
private def definitionNamed (name : Name) : MetaM Name := do
  let some declName ← constantNamed? name | throwError "no definition {name}"
  if (((← getEnv).setExporting true).find? declName >>= (·.value? (allowOpaque := true))).isSome then
    throwError "{declName}: its body is exposed, so declaring its lemmas privately keeps nothing out of the interface"
  return declName

/-- The constants of `owner` whose user-facing name is `owner.<pfx><index>`, such as its matchers `match_1`…. -/
private def auxiliariesOf (owner : Name) (pfx : String) : MetaM (Array Name) := do
  return (← getEnv).constants.fold (init := #[]) fun found n _ =>
    match (privateToUserName? n).getD n with
    | .str parent s => if parent == owner && s.startsWith pfx then found.push n else found
    | _ => found

/--
Declares the equation lemmas, and the unfolding lemma of a recursive definition, of each definition `scope ++ name`
as ordinary private declarations; the names are appended, never resolved, so no open namespace can redirect one. It
fails when a definition's lemmas were realized earlier in the module, since those are exported already.
-/
def privateEquations (scope : Name) (names : Array Name) : MetaM Unit := do
  for name in names do
    let declName ← definitionNamed (scope ++ name)
    let env₀ ← getEnv
    -- Only an exported lemma is a leak, and the `.olean` writer exports what `find?` finds while exporting,
    -- realizations included (`Environment.lean:1874-1875`); well-founded recursion's eager private `eq_def`
    -- (`WF/Unfold.lean:211-238`) is no realization and stays out of that view.
    for suffix in #["eq_1", "eq_def", "eq_unfold"] do
      if ((env₀.setExporting true).find? (mkEqLikeNameFor env₀ declName suffix)).isSome then
        throwError "{declName}: its {suffix} lemma was realized before this call; move the call before its first use"
    let infos ← withoutModifyingEnv do
      let some eqns ← getEqnsFor? declName | throwError "{declName} has no equation lemmas"
      let unfold? ← getUnfoldEqnFor? declName
      realizedClosure env₀ (eqns ++ unfold?.toArray)
    for info in infos do
      if (← getEnv).contains info.name then continue
      -- Only an equation-like lemma states a definition's body; it is the one to keep out of the public `.olean`.
      unless (declFromEqLikeName env₀ info.name).isSome do
        declareDependency info.name
        continue
      let .thmInfo thm := info | throwError "{declName}: unexpected realized constant {info.name}"
      addDecl (.thmDecl thm)
      inferDefEqAttr info.name

/--
Declares, as ordinary private declarations, what proofs in this module realize for the `match`es of each definition
`scope ++ name`: the equations and splitter of each of its matchers, their congruence equations when `congruence`, and
the `else_eq` of each of its sparse case splits. Call it before the first proof that splits, simplifies or unfolds
through one of them. The names are appended, never resolved, as in `privateEquations`.
-/
def privateMatchEquations (scope : Name) (names : Array Name) (congruence := false) : MetaM Unit := do
  for name in names do
    let declName ← definitionNamed (scope ++ name)
    let owner := (privateToUserName? declName).getD declName
    let matchers := (← auxiliariesOf owner "match_").filter (isMatcherCore (← getEnv))
    let splits ← (← auxiliariesOf owner "_sparseCasesOn_").filterM fun n => return (← getSparseCasesOnInfo n).isSome
    if matchers.isEmpty && splits.isEmpty then throwError "{declName} has no matcher and no sparse case split"
    for matcher in matchers do
      declareMatcher matcher congruence
    for split in splits do
      if (((← getEnv).setExporting true).find? (split.str "else_eq")).isSome then
        throwError "{split}: its else_eq was realized before this call; move the call before its first use"
      declareRealized do return ((), #[← getSparseCasesOnEq split])

end
