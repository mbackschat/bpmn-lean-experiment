# Lean build modularity proposal

## Status

Lifecycle: implementation-in-progress
Review: approved-with-required-edits

## Problem

Ordinary work must never need a complete Lean rebuild (owner direction, 2026-10-23). Three mechanisms used to defeat this:

- Closed-world shared definitions enumerate every family in one module low in the import graph.
- Kernel types carry per-family constructors and fields.
- Kernel-decided fixtures reduce those shared definitions, so a hub edit rebuilds them.

More build threads only change wall time by a fixed factor: a cache-free hosted build ran 44 minutes at three threads against 67–68 at one (run 39966178466, 2026-10-23). The rebuild set stays the same.

## Contract

Required:

1. **Module-aware guards.** Every Lean-source guard that parses imports reads the module syntax (`public import`, `import all`, `meta import`), and unrecognized import forms fail closed. This covers [import boundaries](../scripts/lean-import-boundaries.test.ts), [source contracts](../scripts/lean-source-contracts.test.ts) and the source analysis behind `what-binds`.
2. **Module-system enforcement (Lean `module`).** Every library module is a Lean `module`. A module cannot import a plain file, so only the files listed under [module rules](#module-rules) stay plain.
   - Definition bodies stay hidden unless kernel reduction needs them.
   - Kernel decision through hidden bodies needs `import all` of every module on the reduction path.
   - A public theorem may not name a constant that its module imports privately.
   - Proofs characterize a dispatcher with `by rfl` or `by unfold f; rfl` lemmas, never with `simp [f]` or `rw [f]` over a hidden `f`. Those export the equation lemmas, and with them the body, from the rewriting module.
   - The rewrites that predate this rule are recorded per module in [`lean-fanout-bounds.ts`](../scripts/lean-fanout-bounds.ts). A shrink-only ratchet in [`lean-fanout.test.ts`](../scripts/lean-fanout.test.ts) fails any new one, and turning one into `unfold` shrinks it.
3. **Kernel and families.**
   - The kernel owns the shared types and the generic composition laws.
   - Each family owns its step, admission, descriptor, proofs, and the fixtures that reduce only its own functions.
   - The closed-world functions are named and stay above the families: checked-source well-formedness, program structural well-formedness, runtime-state well-formedness, scope cancellation, publication projection, the global dispatch and the profile registry. Their bodies are hidden, except where the [module rules](#module-rules) keep exposed a body that fixtures reduce. Consumers reason through characterization lemmas in bridge modules.
   - Adding a family arm to a hidden closed-world body is a body-only edit.
   - When a closed-world function changes, these rebuild: its bridges, the proved-lane theorems over it (such as cancellation and well-formedness preservation), and the fixtures that reduce it. While its body stays exposed, every module that loads it rebuilds too.
4. **Kernel types change at most once per family.**
   - Changes to checked source, IL, value domain and runtime-state types are batched at family start and recorded in the family proposal.
   - That one change is a complete rebuild, and may run in hosted CI.
   - Per-family extension points in these types would remove that rebuild, but they change the IL and runtime representation, so they are excluded.
5. **Fixture placement.**
   - A fixture that reduces only family-owned functions imports only the kernel and its family.
   - A fixture that reduces a closed-world function is global.
   - If an ordinary increment's global fixtures exceed 15 minutes of serial build, the owner decides between two remedies:
     - registry-instantiated whole-model fixtures, which reduce a closed-world function instantiated with only the families the model uses, and need a generic lemma stating agreement with the full registry;
     - more executable guards.
6. **Fanout ratchet.** [`lean-fanout.test.ts`](../scripts/lean-fanout.test.ts) bounds three static fanouts per module and the library's opening imports, with the model in [`lean-fanout.ts`](../scripts/lean-fanout.ts) and the bounds in [`lean-fanout-bounds.ts`](../scripts/lean-fanout-bounds.ts). Both are upper bounds.
   - **Interface fanout.** This counts the importers an interface edit rebuilds. It follows `public import` and cuts at a private import, except that `import all` loads the private imports of what it opens and `meta import` loads its whole import closure.
     - It counts only importers the semantic root builds.
     - The default bound is 100.
     - The declared kernel type modules are exempt.
     - Every wider module is recorded at its count plus a tenth, at least ten. Without that headroom a single new leaf failed the bound of every module it re-exports, while a widely imported module that starts re-exporting another still fails.
   - **Hidden-edit fanout.** This counts the importers an edit to a proof, a private declaration or a hidden body rebuilds: `import all` chains, `meta import` closures and plain files.
     - It includes everything that loads an `import all` importer which rewrites with one of the module's hidden definitions.
     - The default bound is 10, and every wider module is recorded at its count.
   - **Body-edit fanout.** This counts the importers an edit to a definition body rebuilds: the interface fanout for a module with an exposed scope, otherwise the hidden-edit fanout. The scan follows Lean's own scope rules, so every section-header spelling, nested and namespace scope, attribute line and non-Prop `instance` counts as the exposure it is, and a section header outside Lean's grammar fails closed.
     - The default bound is 10, and every wider module is recorded at its count plus the interface fanout's headroom.
     - A definition a wide module exposes on its own, `@[expose]`, an `abbrev` or an `instance`, is named in the exposed-definition allowance.
   - **Opening imports.** The library's `import all` and `meta import` lines are bounded in total, with at most 50 lines of headroom, and [`lean-import-all-minimize.ts`](../scripts/lean-import-all-minimize.ts) drops each one, and each plain import it would leave, that a module compiles without.
   - **Rewrite sites.** A rewrite site is any element of a bracketed argument list after a word or a closing parenthesis, whatever the tactic, including a `(f ·)` alias, a local `simp` attribute, a named equation or functional-induction lemma, or an `unfold` of a recursive definition, unless a binder of the enclosing declaration shadows the name.
   - **Bounds.** Bounds only shrink. An entry whose module falls to the default must go. A bound or allowance entry above that of the last commit or of the merge base with `origin/main` records in `raised` why, and in `raisedFrom` the bound it rose from: either genuine interface growth a review accepted, or a known regression with the change that removes it, whose reason goes once the bound falls back to `raisedFrom`. `raised` never answers growth that a firing guard or a Rule 2 check reports; such growth is reverted and root-caused first, and keeping it needs an owner exception. The [review packet](../scripts/semantic-review-packet.ts) shows the reviewer each reason together with every change to the model, its test and the import parser. A kernel addition, a default or a total rises only by owner decision. The ratchet measures graph shape, not commits, so the once-per-family kernel change needs no exemption.
7. **Executable guards for standalone checks** (owner decision, 2026-10-24).
   - **What moves.** A standalone finite check runs as a compiled executable guard over retained data, through [`ConformanceChecksMain`](../BpmnSemantics/ConformanceChecksMain.lean) and the [native-driver helper](../scripts/lean-native-driver.ts). Its evidence names the guard, never a kernel decision, and its JSON decoders join the trusted base.
   - **What stays kernel-decided.** A check stays kernel-decided when any proof or tool names it, when a `Lane shape: proved` document links or names it or its module, or when its module's executable closure reaches a proofs-only module (the [import-boundary guard](../scripts/lean-import-boundaries.test.ts)).
   - **Memory ceiling.** Lean runs each module under a 2 GiB ceiling (`-M2048` in [lakefile.toml](../lakefile.toml), owner decision of 2026-10-25). Under it, a finite witness in a `Lane shape: proved` module becomes an executable check when the lane's quantified theorems, named as its guaranteeing declarations, carry the proved claim. A fact a proof consumes is split into kernel-decided parts instead.
8. **Hosted CI for full builds.** Complete builds may run in hosted CI through feature-branch pushes (owner authorization, 2026-10-23).

Excluded:

- per-family extension points in kernel types;
- a speculative up-front design of all remaining family semantics;
- dropping the shared kernel;
- consolidating per-slice checkpoint profiles into cumulative family profiles, which changes profile identity and needs its own review;
- raising local build threads or memory ceilings. The hosted CI pin (2026-10-23) and the local two-thread pin under a 4768 MiB brake (2026-10-25, [build memory](CONTRIBUTOR-SETUP-GUIDE.md#lean-decision-procedures-and-build-memory)) are separate owner decisions;
- weakening any lane shape, claim or gate.

## Module rules

- **New declarations.** A new declaration lives in a family-owned leaf module, never appended to a hub. Existing families move into the family shape when next touched, and profile identity branches become per-family descriptors as their families move.
- **Imports.**
  - A module re-exports only the modules its public declarations name.
  - It imports a hub with `import all` only where its own build needs it.
- **Exposure.**
  - A hub definition that importers reduce implicitly (`rfl`, a definitional `exact`, an anonymous-constructor `rfl`) is `@[expose]`, together with every hub definition its body calls, as the build's "not unfolded because their definition is not exposed" notes list.
  - `import all` serves explicit unfolding and tactic-mode reduction.
  - The closed-world functions keep their bodies hidden like every other hub. Their reduction closures span 226 library modules, and exposed, a body edit in one of them rebuilds a median of 640 importers (scratch conversion of `7bedde10`, 2026-10-28); the fixtures that kernel-decide them open what they unfold instead (next rule).
- **Consumers.** A module reasons about another module's definition through its laws, never by unfolding or rewriting with the hidden body. A module that must rewrite with a hidden definition declares its equation lemmas privately first with `privateEquations` ([`PrivateEquationLemmas.lean`](../BpmnSemantics/PrivateEquationLemmas.lean)), because `simp [f]` and `simp only [f]` otherwise realize and export them (owner decision 2, 2026-10-29); `dsimp [f]` only unfolds and exports none.
- **Laws modules.** A hidden hub's theorems live in a `<Hub>Laws` module that imports the hub with `import all`, so a proof edit rebuilds only that module's `import all` importers. The exception is laws an executable closure consumes, which stay beside their definitions (AA-05 keeps proof-only modules out of those closures).
- **Distinct names.** A helper made public gets a distinct name whenever a file could resolve it unqualified next to another declaration of the same short name, because a newly public name can silently change what a statement means. [`lean-name-shadowing.ts`](../scripts/lean-name-shadowing.ts) checks this.
- **Kernel-decided fixtures.** A module that kernel-decides through hidden bodies opens with `import all` exactly the modules whose bodies its decisions unfold. [`lean-fixture-owners.ts`](../scripts/lean-fixture-owners.ts) prints those lines from one plain-file compile whose diagnostics list every unfolded definition. A static call graph over-approximates: a fixture deciding `applyStimulus` unfolded bodies from 72 modules of the function's 200-module closure. A hub module opening a function's whole closure for its fixtures was measured and rejected, because its fixtures would rebuild about 7.7 times as often as exact opening requires (scratch conversion, 2026-10-28).
- **Plain files.** These stay plain, with every file that imports them: files that interpret library code (`#eval`, or a driver run through `./scripts/lake.sh run`), proof-consumed `native_decide` owners, and fixtures whose decision does not reduce inside a module. A driver the library imports runs as its declared executable instead. Lean core bodies hidden from modules reduce once their owners are imported with `import all` (see the observations below). A plain file rebuilds on every edit to what it imports.

## Mechanism observations (Lean v4.34.1, 2026-10-23)

These come from small scratch projects or scratch conversions of the library, and are not retained in the repository.

| Observation | Result |
|---|---|
| Hidden definition body or theorem proof edited | Module importers not rebuilt |
| Private import | Stops transitive propagation |
| Imported module's public interface unchanged | Dependents not rebuilt |
| A family added to a record-of-functions kernel whose dispatch was exposed and whose all-families fixture was not a module | Rebuilt only that family, the registry and that fixture. The composition law was proved once against the interface. Hidden dispatch bodies were not tested in this run |
| Kernel decision through hidden bodies | Fails unless every module on the reduction path is imported with `import all` |
| Kernel decision through Lean core bodies hidden from modules | `Nat.repr`, `List.mergeSort`, `List.filterM` and its monadic siblings, most `String` operations and the strict JSON decoder reduce, under `decide +kernel`, `cbv`, `simp` and `rfl`, once the module imports their owners with `import all`: `Init.Data.Repr`, `Init.Data.List.Sort.Basic`, `Init.Data.List.Control`, the `Init.Data.String` modules, `Init.Data.Ord.String`, the `Lean.Data.Json` modules and the `Std` tree-map modules behind `Json.obj`. `String.splitOn` and `String.trim` still do not (scratch probes on the pinned toolchain, 2026-10-25, not retained) |
| Bridge module (`import all` plus a `by rfl` lemma) | An edit to another family's arm or body left this family's proof and family-local fixture unrebuilt (probe output not retained) |
| Proof edited in a hidden hub of the library | Rebuilt every `import all` importer, every module that reaches the hub through a chain of `import all` imports, and every plain file above it, but no other importer: one line added to a `ProgramStructuralValidation` proof rebuilt 264 modules in 42 minutes on one contended CPU, exactly the set the hidden-edit ratchet's `import all` chains predict, which its rewrite term now over-approximates for proof edits (pinned container, 2026-10-25, probe output not retained) |
| Equation-lemma trap | `simp [f]` and `simp only [f]` propagated an arm edit; `by rfl` and `by unfold f; rfl` did not; term-mode `rfl` was rejected for a hidden body (probe output not retained) |
| Equation lemmas in the library | Reverting the family's `operationWellFormed` arm left the public `.olean` of `ProgramStructuralValidation` unchanged and changed it in each of the nine `import all` importers that rewrite with `simp only [operationWellFormed]`. After one of them switched to `unfold`, its `.olean` stayed unchanged. Generating the lemmas in the owner instead exported them from the owner. (Local pins, 2026-10-26, hashes not retained.) |
| `import all` and `meta import` | Both load the private imports of what they import, and a `meta import` loads its whole import closure. One public declaration added to `NestedScopeControlAdmission`, which the profile registry imports privately, rebuilt exactly the 102 modules this predicts (pinned container, 2026-10-26) |
| `import all` of a module that only opens others | The importer sees what that module opens: a fixture compiled identically, at the same 970 MB peak, through such a module and with the same lines written directly (scratch conversion, 2026-10-28) |
| Diagnostics at threshold 0 (`set_option diagnostics true`, `diagnostics.threshold 0`) | List every definition the kernel and the elaborator unfolded. The modules hiding those bodies were exactly what each file's module form needed: `MessageStartAdmissionConformance` compiled with its 30 and `EventBasedGatewayConformance` with its 72 and no other `import all` line, where the earlier step-by-step repair had not converged (scratch conversion, 2026-10-28) |

Hub functions are explicitly unfolded in few files: `programWellFormed` in 18 of the 235 that mention it, and `applyStimulus` in 7 of 84. A broader scan found 80 modules unfolding a hub function through some route, so bridge work is larger than those direct counts suggest.

## Module matcher defect

Inside a `module`, a `match` lambda restated in a proof elaborates to a new private matcher instead of reusing the identical public matcher of a definition or statement, so `rw` and `cases` no longer find a syntactically restated term. The same file compiles without `module`. Lean v4.34.1's `mkMatcherAuxDefinition` (`src/lean/Lean/Meta/Match/Match.lean`, line 1099) states that "private contexts may reuse public matchers", but its cache is registered with `asyncMode := .local`. That probably explains the miss, but the cause is not yet demonstrated, and no upstream report was found on 2026-10-24. Reproducer, which fails at the `rw` only with the first three lines:

```lean
module

@[expose] public section

inductive Op where
  | a (key : Nat)
  | b

theorem sole (ops : List Op) (k : Nat) (h : (ops.filter fun | .a key => decide (key = k) | _ => false) = [.a k]) :
    (ops.filter fun | .a key => decide (key = k) | _ => false) = [.a k] := h

theorem use (ops : List Op) (k : Nat) (h : (ops.filter fun | .a key => decide (key = k) | _ => false) = [.a k])
    (m : Op.a k ∈ ops) : True := by
  have mem : Op.a k ∈ ops.filter (fun | .a key => decide (key = k) | _ => false) := List.mem_filter.mpr ⟨m, by simp⟩
  rw [sole ops k h] at mem
  trivial
```

The owner approved a proof-level workaround on 2026-10-24. Each affected proof either restates its goal once through a binding with `show` before `cases`, or rewrites with `erw`, which compares up to unfolding. Every such site carries a comment linking here. Theorem statements, claims and gates are unchanged. Remove the workaround when the pinned Lean reuses the public matcher in this reproducer.

## Acceptance

- The fanout ratchet is green.
- An increment that adds no kernel type invalidates only its family's modules, the registry, the closed-world functions it extends with their bridges, the proved-lane theorems over them and the global fixtures. A body edit rebuilds only the modules that load the body: the `import all` importers and the fixtures that reduce it, plus, for a definition named in the exposed-definition allowance, its public cone.
- An increment that adds kernel types costs one complete rebuild, at family start.
- The serial build time of the global fixtures an ordinary increment rebuilds is measured at the first converted family. If it exceeds 15 minutes, the owner decides between registry-instantiated whole-model fixtures (required item 5) and the optional executable guards.
- No lane shape, claim or gate is weaker, and the guards are migrated before the first conversion.

## Current boundary

**Hidden-by-default bodies are converted, not yet proven.** Contract item 2 stays open until the probe matrix that [PLAN](PLAN.md#exact-resume-point) owns measures body edits across the core and every family. After the conversion (owner decisions of 2026-10-29), 15 of the 1,023 library files still open an `@[expose] public section` and 6 stay plain. 214 modules exceed the body-edit default of 10; the widest are a body edit of `ActivityOccurrence` at 624 importers and of the `privateEquations` helper at 784, whose every loader re-runs its meta code. Over the 67 history commits the fan-out model predicts a mean of 118 and a p90 of 490 rebuilt modules, with 6 commits above 500; that is the restated target of owner decision 1, not a measurement. One real build backs it so far: comment and module-doc edits to 19 modules rebuilt 499 modules where the model allows 561 (scratch tree, pinned container, 2026-10-29). The first conversion attempt was reverted unmerged on 2026-10-28 ([Finding 84](PROCESS-ASSESSMENT-LEDGER.md#finding-84)).

The first family-shaped increment was [concurrent scope Service Tasks](capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md), measured in the pinned container on one CPU, 2026-10-26.

- **Rebuild set.** It rebuilt 312 modules, 144 of them library modules, all in the classes the acceptance admits. On the graph before the import shake of `8857320f`, the same edits invalidate 831 modules (static model).
- **Fixture time.** Its global fixtures and roots rebuilt in 725 serial seconds, so the fixture decision of contract item 5 has not arisen.
- **Equation-lemma leak.** 82 of those library modules rebuilt only because nine `import all` importers rewrote with `simp only [operationWellFormed]`, which exports its equation lemmas. Those nine now `unfold` it, and an edit to its body leaves their public `.olean` unchanged (local hash check, 2026-10-26).
- **Hidden-edit bounds.** The rewrites that predate contract item 2 widen the recorded hidden-edit bounds of `ProgramStructuralValidation`, `EffectDataAdmission`, `SequentialScopeDataAdmission` and `MessageStartAdmission` to most of the build. Converting their rewriters to `unfold` shrinks them.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `056241144bd4e3828355e2e88f3a2de715815c93` | `fork-turns-none` | `approve-with-required-edits` | `c46dcce614d999e0a9976339f405f2cfdfcf5c8d, 02ff88ba6cda59a67119dc3a536b175ab14b6ae5` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `463ee3375951f98b35e264fb10ded4c890fa23b4` | `fork-turns-none` | `approve-with-required-edits` | `e86d21e6811e96292d9db122bd56a5530d8f25e1, 67abfe779f17034b9f2c5b226e9a50d19f3fffa4` |

The cold review of `05624114` (baseline `af8828a9`, packet `3b1bf9ed3419574012cf3d79c850381590c41bec006c3997945b68ffe61aee5b`) required eight edits: kernel types that enumerate families, cross-family operations, global whole-model fixtures, the fixture classification, the ratchet measure, guard migration, retained mechanism evidence and the rule-ID claim. The first audit closed them at `c46dcce6` and required the resume point to order guard migration first. The second audit approved `02ff88ba`. The owner adopted the proposal on 2026-10-23 after the hosted thread measurement.

The closure review of `463ee337` (baseline `02ff88ba`, packet `a739be1916bc834d0476c1e9b55fa01ab830323457e7f5c6512d08df6a11ff3c`) required six findings:

- measuring the family's real increment instead of a synthetic edit;
- the ratchet's upper bound, which the private imports that `import all` and `meta import` load had broken;
- the `InternalArmingOrder` re-export;
- the fixture time;
- the accuracy of the evidence;
- the graduation itself.

The first audit approved those corrections at `e86d21e6` and required three more: a rewrite-site ratchet, the admission of modules that load an exposed closed-world body, and corrected prediction claims. The second audit approved them at `67abfe77`.
