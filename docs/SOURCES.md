# Sources

This document owns source provenance and controlled reference navigation. Reference checkouts are not project dependencies. Recorded baseline revisions remain pristine evidence anchors; separately named local branches or worktrees may be instrumented under [REFERENCE-INSTRUMENTATION.md](REFERENCE-INSTRUMENTATION.md).

## Project license audit

Project-authored code and documentation are released under the root [MIT License](../LICENSE). The current dependency surface permits that choice:

| Surface | License status | Project consequence |
|---|---|---|
| Lean `v4.31.0` toolchain and Lake | Apache-2.0 in the installed distribution and the [upstream Lean repository](https://github.com/leanprover/lean4) | External toolchain, not vendored or redistributed; it retains its own license |
| Lake packages | `lake-manifest.json` records an empty `packages` array | No external Lean package license enters the tracked source or package graph |
| Shell verification tools | Git, `jq`, `xmllint`, and `shasum` are environment prerequisites | Invoked as external tools and not distributed by this repository |
| Node and pnpm | Node `24.18.0` and pnpm `11.17.0`; Homebrew formulae report MIT | External runtime and package manager; exact nvm/asdf pins and a non-mutating Homebrew fallback are tracked |
| TypeScript compiler graph | `typescript@7.0.2` and the resolved `@typescript/typescript-darwin-arm64@7.0.2` platform package are Apache-2.0 | Development-only compiler; exact integrities are locked, packages are not vendored, and no runtime dependency enters the semantic core |
| Temporal adapter graph | Direct `@temporalio/client`, `testing`, `worker`, and `workflow` packages at `1.21.0` are MIT; the locked non-vendored graph contains MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, `Apache-2.0 AND MIT`, and CC-BY-4.0 data | External adapter/runtime and test dependencies only; no Temporal dependency enters Lean or the semantic core |
| Temporal CLI `v1.8.1` | MIT; downloaded from the official Temporal distribution endpoint and Git-ignored | Full local development server for M0.5 integration tests; exact binary is cached locally and not redistributed |
| Maven wrapper and build plugins | Wrapper `3.2.0`, Maven `3.8.8`, Compiler Plugin `3.14.1`, and Surefire Plugin `3.5.4` are Apache-2.0 | The wrapper script/JAR is retained under its upstream license; build tooling is isolated to the Java oracle |
| CIB Seven oracle graph | CIB engine `2.2.0` and most transitives are Apache-2.0; the resolved graph also contains MIT and BSD-3-Clause components | External Java oracle only; no CIB type or algorithm enters Lean, the semantic core, or project-authored semantic authority |
| H2 `2.3.232` | Dual MPL-2.0 or EPL-1.0 | External in-memory oracle database; compatible with distribution of MIT-licensed project source |
| Jackson `2.21.2` | Apache-2.0 | External Java JSON transport implementation |
| JUnit `4.13.2` and Hamcrest | EPL-1.0 and BSD-3-Clause | Test-only Java oracle dependencies |
| Temporal, MIWG, Betsy, fUML, and other research trees | Separate checkouts under their own upstream terms | Evidence inputs only; they are not project dependencies and are not relicensed |
| OMG BPMN corpus | Copyrighted external material retained only in ignored local paths | Excluded from the MIT-licensed tracked repository material |

The approved M0.2 Java, M0.4 TypeScript compiler, and M0.5 Temporal graphs remain compatible with releasing project-authored source under MIT. `unionfs@4.6.0` omits a package-manifest license value, but its distributed `LICENSE` is the Unlicense/public-domain dedication. The CC-BY-4.0 entry is `caniuse-lite` browser-support data pulled transitively by the Worker bundler and is neither copied into project source nor separately redistributed by this repository. Before adopting any further Maven, pnpm, Lake, parser, Temporal, test, build, or runtime package, inspect its exact transitive license graph, preserve required notices, and update this record. An incompatible future dependency must be replaced, isolated behind a non-distributed research boundary, or explicitly reconsidered; it must never silently alter the project license.

## OMG BPMN 2.0.2

The normative standard source is OMG **Business Process Model and Notation, Version 2.0.2**, January 2014, document `formal/13-12-09`. The official specification catalog and machine-readable catalog are:

- `https://www.omg.org/spec/BPMN/2.0.2`
- `https://www.omg.org/spec/BPMN/machine-readable`
- `https://issues.omg.org/issues/spec/BPMN/2.0.2`

The downloaded PDF, digital-first Markdown conversion, figures, and normative CMOF/XSD/XSLT files are described in the local [BPMN 2.0.2 reference corpus](reference/bpmn-2.0.2/README.md). They are Git-ignored because the full Markdown is a modified copy of the copyrighted standard; the tracked [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md) is an original project digest.

## Architecture handoff

The project-local [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) preserves the supplied content with trailing Markdown whitespace normalized and is the primary requirements source for this experiment.

The handoff reports an investigation of CIB Seven source revision `5a45b47ea22688d774de97277c3ff7013f54fdd2` (`2.3.0-SNAPSHOT`) while its embedded prototype executed published CIB Seven `2.2.0`, Java 17, and H2 `2.3.232`. This mismatch is architectural evidence only; it must not become one merged semantic profile.

## Controlled source experiments

The CIB Seven and Temporal source checkouts may host local experimental branches for profiling, deterministic fault points, tracing, batching, or reduced harness overhead. The exact pinned revision remains the evidence lane. A modified build is a diagnostic surrogate until the same neutral scenarios have been shadow-compared against that lane.

Every such experiment must record its base revision, patch or branch revision, build and runtime configuration, question, measurements, and shadow scenarios. See [REFERENCE-INSTRUMENTATION.md](REFERENCE-INSTRUMENTATION.md) for permitted acceleration, candidate probe locations, and the shadow-equivalence gate.

## CIB Seven

Pinned baseline checkout: [cibseven/cibseven at `5a45b47`](https://github.com/cibseven/cibseven/tree/5a45b47ea22688d774de97277c3ff7013f54fdd2)

- Remote: `https://github.com/cibseven/cibseven.git`
- Checked-out revision: `5a45b47ea22688d774de97277c3ff7013f54fdd2`
- Published `v2.2.0` tag revision: `834a9874760de8a0107f7c1b32806e37f17fb017`
- Inherited baseline: Camunda `7.22.0` at `1727de82ed7b655ade4f84fe70eff7b52e81a5ca`
- License: Apache-2.0
- Role: complete executable behavioral oracle source and diagnostic reference, never a semantic-core dependency

The checked-out `main` revision exactly matches the source revision named by the handoff.

The core BPMN Java and resource trees, and the BPMN model-API Java and resource trees, are byte-identical between CIB Seven `v2.2.0` and the investigated `main` revision. The initial executable oracle can therefore use the published release without losing any core BPMN test evidence found on `main`.

| Test tree | Git tree identity |
|---|---|
| Core BPMN Java tests | `bda480226e6537d97d656395cfa3ed056c37f351` |
| Core BPMN resource fixtures | `ac70d17dce2e5e26878e8b6dc7f43bfc48caabfb` |
| BPMN model-API Java tests | `e171ab57b80291bd1225ed8efbb700befd38c231` |
| BPMN model-API resource fixtures | `e03b50769d00a6ca559179ab5e99a66c7d5e5cba` |

The core execution corpus at both revisions contains 261 Java files, 1,808 explicit `@Test` methods, and 1,144 paired BPMN fixtures under `engine/src/test/.../bpmn`. The entire engine test resource tree contains 1,947 BPMN models. Most of this evidence is inherited from Camunda 7.22; the CIB fork adds only one core BPMN test class and five net engine fixtures relative to that baseline.

CIB’s [implemented-standards page](https://docs.cibseven.org/manual/latest/introduction/implemented-standards/) claims support for BPMN 2.0, while its [BPMN implementation reference](https://docs.cibseven.org/manual/latest/reference/bpmn20/) documents product coverage. Neither the repository nor the documentation declares BPMN 2.0.2 Process Execution Conformance, an OMG certificate, or passage of an OMG execution TCK. Its executable corpus is the compatibility oracle for a pinned CIB profile, not proof of the independent standards claim.

## Temporal TypeScript SDK

Pinned baseline checkout: [temporalio/sdk-typescript at `2595d1b`](https://github.com/temporalio/sdk-typescript/tree/2595d1b62cf5c3ff1748df0df2f9b303902bb31c)

- Remote: `https://github.com/temporalio/sdk-typescript.git`
- Inspected revision: `2595d1b62cf5c3ff1748df0df2f9b303902bb31c`
- License: MIT
- Role: authoritative implementation reference for TypeScript Workflow replay, timers, Activities, cancellation, delivery, and SDK boundaries

M0.5 separately pins the released packages `@temporalio/client@1.21.0`, `@temporalio/testing@1.21.0`, `@temporalio/worker@1.21.0`, and `@temporalio/workflow@1.21.0`. They are isolated to `@bpmn-lean/temporal-adapter`; the semantic core remains dependency-free. The SDK requires Node `>=20.3.0`, satisfied by the project’s pinned Node `24.18.0`.

The resolved pnpm graph is locked. pnpm’s supply-chain guard explicitly denies install scripts for `@swc/core@1.15.46` and `protobufjs@7.6.5`; the installed native SWC binding was verified without its optional fallback script, and protobufjs’s postinstall is not required for runtime behavior. The exact freshly released Temporal `1.21.0` suite is listed in `minimumReleaseAgeExclude` because the user explicitly approved that coordinated version set. Temporal’s published declarations currently fail library checking under TypeScript `7.0.2`, so only the adapter sets `skipLibCheck: true`; project source remains strict and the semantic core continues to check dependency-free with library checking enabled.

M0.5 uses Temporal CLI `v1.8.1` through `TestWorkflowEnvironment.createLocal` with the SDK’s `cached-download` strategy. The CLI starts the full local development server rather than the time-skipping test server, is cached under ignored `.cache/temporal-cli/`, and is not committed. The retained replay fixture was exported with the CLI’s documented `workflow show --output json` format.

## Temporal TypeScript samples

Pinned baseline checkout: [temporalio/samples-typescript at `fb0aa23`](https://github.com/temporalio/samples-typescript/tree/fb0aa23d75394a132646de883842dfacdacd5aa0)

- Remote: `https://github.com/temporalio/samples-typescript.git`
- Inspected revision: `fb0aa23d75394a132646de883842dfacdacd5aa0`
- License: MIT
- Role: concrete Workflow, Activity, signal, update, timer, cancellation, testing, replay, and data-driven DSL-interpreter research

The [`dsl-interpreter`](https://github.com/temporalio/samples-typescript/tree/fb0aa23d75394a132646de883842dfacdacd5aa0/dsl-interpreter) sample parses YAML into a data AST and recursively interprets sequence, parallel, and Activity nodes inside one Workflow rather than generating TypeScript. It supports the project’s hosting direction but cannot define BPMN behavior; its lessons and limitations are recorded in [TEMPORAL-EXECUTION-MODEL.md](TEMPORAL-EXECUTION-MODEL.md).

## Temporal documentation

Pinned baseline checkout: [temporalio/documentation at `16c1899`](https://github.com/temporalio/documentation/tree/16c1899a0380eaf3457a0b163b2b2232c39a5d)

- Remote: `https://github.com/temporalio/documentation.git`
- Inspected revision: `16c1899a0380eaf3457a0b163b2b2b2232c39a5d`
- Role: authoritative current documentation for Workflow execution, Event History, Commands, messaging, retries, concurrency, Continue-As-New, versioning, testing, and operational features

The project-authored [Temporal execution-model research](TEMPORAL-EXECUTION-MODEL.md) combines this documentation with pinned TypeScript SDK implementation evidence and records the consequences for the BPMN adapter boundary. Current documentation can describe features newer than the eventual project dependency, so every implemented feature still requires an exact SDK and server version pin.

## Formal methods and behavioral refinement

The project-authored [formal-methods toolbox](TLA-AND-BISIMULATION-RESEARCH.md) evaluates temporal specification, model checking, process algebra, behavioral relations, relational modeling, and Petri-net analysis against this project’s existing Lean, differential, Temporal-refinement, and replay boundaries.

Primary sources inspected:

- Leslie Lamport’s [Specifying Systems](https://lamport.azurewebsites.net/tla/book.html) for TLA+ behaviors, stuttering, refinement mappings, fairness, composition, and TLC
- Abadi and Lamport’s [The Existence of Refinement Mappings](https://lics.siglog.org/archive/1988/AbadiLamport-Theexistenceofrefin.html) for the lower-level-to-higher-level implementation relation
- the [TLA+ Wiki](https://docs.tlapl.us/) and [TLC trace validation](https://docs.tlapl.us/using%3Atlc%3Atrace_validation) for current tool behavior
- the [Apalache documentation](https://apalache-mc.org/docs/apalache/index.html) for bounded symbolic checking and its documented experimental status
- [Quint](https://quint-lang.org/) for typed executable TLA-style specifications, simulation, model checking, and model-based testing
- the [P language](https://github.com/p-org/P) for event-driven state machines, systematic asynchronous testing, safety, liveness, and implementation trace validation
- [SPIN](https://spinroot.com/spin/whatispin.html) for mature Promela process/channel verification, assertions, progress, and LTL
- the [mCRL2 user manual](https://mcrl2.org/web/user_manual/index.html) for process algebra, labelled transition systems, behavioral-relation comparison, deadlock, and modal properties
- [FDR](https://cocotec.io/fdr/) for CSP traces, failures, failures-divergences, refinement, and deadlock
- [Alloy](https://alloytools.org/) and [Electrum](https://haslab.github.io/Electrum/) for relational and temporal structure exploration
- [LoLA](https://theo.informatik.uni-rostock.de/theo-forschung/tools/lola/) for Petri-net reachability, deadlock, and temporal properties
- [UPPAAL](https://uppaal.org/) for timed automata and [PRISM](https://www.prismmodelchecker.org/) for probabilistic model checking
- van Glabbeek and Weijland’s [Branching Time and Abstraction in Bisimulation Semantics](https://theory.stanford.edu/~rvg/abstraction/) for branching bisimulation and silent actions
- Kiepuszewski, ter Hofstede, and van der Aalst’s [Fundamentals of Control Flow in Workflows](https://pure.tue.nl/ws/files/1688655/612177.pdf) for simulation, branching, deadlock, termination, and workflow-net equivalence

The latest stable GitHub releases inspected on 2026-07-23 were TLA+ tools `v1.7.4` under MIT and Apalache `v0.58.3` under Apache-2.0. These are research observations, not approved dependencies or project pins. The alternatives have not been selected or installed. No first-party formal adapter model was located in the inspected Temporal documentation, TypeScript SDK, samples, or current server repository tree, so the project cannot inherit an official Temporal formal specification.

## BPMN XML/metamodel reference

Read-only checkout: [bpmn-io/bpmn-moddle at `47d8f75`](https://github.com/bpmn-io/bpmn-moddle/tree/47d8f75eed773829f20537adbb7086b290096006)

- Remote: `https://github.com/bpmn-io/bpmn-moddle.git`
- Inspected revision: `47d8f75eed773829f20537adbb7086b290096006`
- Role: independent research reference for parsing, serializing, and representing BPMN 2.0 XML and its metamodel in JavaScript

This project may teach ingestion techniques but is neither a normative semantic authority nor an adopted dependency.

## BPMN MIWG interchange corpus

Read-only checkout: [bpmn-miwg/bpmn-miwg-test-suite at `cb26295`](https://github.com/bpmn-miwg/bpmn-miwg-test-suite/tree/cb2629519cee6280ab521f99dc46a9815a221a35)

- Remote: `https://github.com/bpmn-miwg/bpmn-miwg-test-suite.git`
- Checked-out revision: `cb2629519cee6280ab521f99dc46a9815a221a35`
- Role: OMG working-group BPMN XML import, export, round-trip, and cross-tool reference models
- License: Creative Commons Attribution 3.0 Unported

This suite can support ingestion and interchange qualification. It is not an execution-semantics oracle.

The suite should be reused at three boundaries:

1. Validate that the XML front end accepts the published reference models and resolves their namespaces and references without inventing execution meaning.
2. If export is implemented, compare normalized import/export/import models while preserving allowed extension and diagram-interchange data.
3. Record tool-specific fixtures as interoperability evidence, separately from semantic execution cases.

Passing these models demonstrates interchange coverage only. It does not establish token semantics, Activity lifecycle behavior, CIB compatibility, or Temporal refinement.

At the pinned revision, `Reference/` contains 21 BPMN models and 25 reference images. `test-case-structure.json`, `BPMN 2.0 Attribute Coverage Matrix.xlsx`, and submitted vendor round-trip results provide additional interchange inputs.

## Betsy cross-engine execution benchmark

Read-only checkout: [uniba-dsg/betsy at `fd40241`](https://github.com/uniba-dsg/betsy/tree/fd402415665e914ba7e4d9948de66c4156f08bab)

- Remote: `https://github.com/uniba-dsg/betsy.git`
- Checked-out revision: `fd402415665e914ba7e4d9948de66c4156f08bab`
- Last release: `2.1.0`, September 2015
- Role: historical black-box BPMN execution cases and cross-engine observation strategy
- License: LGPL-3.0

Betsy groups executable cases into gateways, Activities, errors, Events, basics, data, patterns, and minimal cases, and it automates deployments and observations against old Camunda, Activiti, and jBPM releases. Its models can seed modern separating examples, but its installers and engine transforms are obsolete, its supported engines predate current CIB Seven, and it is not an OMG-issued TCK. Adopt only independently reviewed cases with recorded provenance.

## Other engine evidence

The public evidence pattern across Camunda 7, Camunda 8, Flowable, Activiti, jBPM, and Kogito is a product coverage matrix plus product-specific regression suites. No maintained OMG-issued BPMN Process Execution TCK or public execution-conformance certificate was found.

- Camunda 7’s [`7.24` BPMN implementation reference](https://docs.camunda.org/manual/7.24/reference/bpmn20/) is a coverage map, and its core BPMN package has 261 Java files and 1,144 paired BPMN models. This is the direct lineage of nearly all CIB evidence.
- Activiti exposes named project “conformance” test sets, but they assert Activiti APIs and runtime events rather than OMG conformance points.
- Flowable, jBPM, Kogito, and Camunda 8 publish substantial execution suites while also documenting subsets, deviations, or separate profiles.

These engines are useful for discovering ambiguity and constructing hostile separating cases. They cannot vote on the standard, override the pinned CIB oracle, or substitute for the Lean and Temporal assurance lanes. Additional large checkouts are deferred until a requirement needs one that CIB, MIWG, or Betsy does not already supply.

## Lean sibling experiment

Read-only checkout: [mbackschat/a12-kernel-lean at `6f9bbf6`](https://github.com/mbackschat/a12-kernel-lean/tree/6f9bbf64489c3eee9ffebf72b70116f7e02e36b5)

- Inspected revision: `6f9bbf64489c3eee9ffebf72b70116f7e02e36b5`
- Role: precedent for a pinned dependency-free Lean toolchain, executable-first semantic capsules, proof/evidence separation, documentation ownership, honest claim boundaries, and shared `CLAUDE.md`/`AGENTS.md` guidance

This project adopts those working conventions where they fit, but it does not copy A12 domain semantics, evidence, or project-specific governance.

The bounded process-transfer study in [research/A12-KERNEL-LEAN-PROCESS-TRANSFER.md](research/A12-KERNEL-LEAN-PROCESS-TRANSFER.md) also inspected the sibling’s ongoing worktree on 2026-07-24 at committed base [`d25a0ce`](https://github.com/mbackschat/a12-kernel-lean/tree/d25a0ce2fcd61e4b3df50b054adc07d490331875). That worktree contained uncommitted owner changes and was treated as read-only evolving process evidence, not as a replacement pinned semantic source. The stable reference revision above remains unchanged.

## fUML reference implementation

Read-only checkout: [ModelDriven/fUML-Reference-Implementation at `45e5063`](https://github.com/ModelDriven/fUML-Reference-Implementation/tree/45e506336d4cd56965d4ad3b684149245f899f3a)

- Remote: `https://github.com/ModelDriven/fUML-Reference-Implementation.git`
- Inspected revision: `45e506336d4cd56965d4ad3b684149245f899f3a`
- Role: concrete Java companion for understanding fUML 1.5 syntax, Locus/Executor setup, semantic visitors, Activity node activations, edge instances, offers, and tokens

The repository describes itself as an open-source reference implementation of fUML and accepts conforming UML XMI for execution. It is a research reference, not a project dependency, BPMN authority, or proof that its implementation satisfies every fUML requirement. Its architecture and transfer limits are recorded in [semantic-representation research](research/SEMANTIC-REPRESENTATIONS.md).

Normative authority remains the [OMG fUML 1.5 specification catalog](https://www.omg.org/spec/FUML/1.5) and its syntax, semantics, library, and PDF artifacts.
