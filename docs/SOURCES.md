# Sources

This document owns source provenance and controlled reference navigation. Reference checkouts are not project dependencies. Recorded baseline revisions remain pristine evidence anchors; separately named local branches or worktrees may be instrumented under [REFERENCE-INSTRUMENTATION-POLICY.md](REFERENCE-INSTRUMENTATION-POLICY.md).

Local external reference trees are checked out under `~/Projects/oss`. Treat that location as a portable workspace convention rather than source identity: the repository and revision recorded for each source below remain authoritative, and the checkouts remain read-only research inputs unless an explicitly named experiment follows the instrumentation policy.

## Project-created local reference checkouts

The following checkouts under `~/Projects/oss` were cloned specifically for this project. Future research must inspect the applicable trees rather than relying only on remembered summaries or web search. The links are root-relative workspace navigation; the repository and evidence revision remain the source identity.

| Local checkout | Repository and evidence revision | Project role |
|---|---|---|
| [`cibseven/cibseven`](../../oss/cibseven/cibseven) | `cibseven/cibseven` at `5a45b47ea22688d774de97277c3ff7013f54fdd2` | Pinned complete CIB Seven source oracle and diagnostic reference |
| [`temporal/sdk-typescript`](../../oss/temporal/sdk-typescript) | `temporalio/sdk-typescript` at `2595d1b62cf5c3ff1748df0df2f9b303902bb31c` | TypeScript SDK implementation evidence |
| [`temporal/samples-typescript`](../../oss/temporal/samples-typescript) | `temporalio/samples-typescript` at `fb0aa23d75394a132646de883842dfacdacd5aa0` | Concrete Workflow, Activity, testing, and interpreter examples |
| [`temporal/documentation`](../../oss/temporal/documentation) | `temporalio/documentation` at `16c1899a0380eaf3457a0b163b2b2232c39a5d` | Temporal behavior and operational contract documentation |
| [`bpmn-io/bpmn-moddle`](../../oss/bpmn-io/bpmn-moddle) | `bpmn-io/bpmn-moddle` at `47d8f75eed773829f20537adbb7086b290096006` | BPMN XML and metamodel implementation reference |
| [`bpmn-miwg/bpmn-miwg-test-suite`](../../oss/bpmn-miwg/bpmn-miwg-test-suite) | `bpmn-miwg/bpmn-miwg-test-suite` at `cb2629519cee6280ab521f99dc46a9815a221a35` | BPMN interchange corpus |
| [`uniba-dsg/betsy`](../../oss/uniba-dsg/betsy) | `uniba-dsg/betsy` at `fd402415665e914ba7e4d9948de66c4156f08bab` | Historical cross-engine execution cases |
| [`fuml-reference-implementation`](../../oss/fuml-reference-implementation) | `ModelDriven/fUML-Reference-Implementation` at `45e506336d4cd56965d4ad3b684149245f899f3a` | Executable semantic-representation reference |
| [`webassembly-spec`](../../oss/webassembly-spec) | `WebAssembly/spec` at `dfa3f32a881aecc60a8c792da3c25787ccb15572` | Specification/interpreter/conformance-workbench precedent |
| [`wasm-spectec`](../../oss/wasm-spectec) | `Wasm-DSL/spectec` at `acc6e834ff403c82554d081237f327346190ad96` | SpecTec development and multi-backend mechanization evidence |
| [`spectec`](../../oss/spectec) | `zilinc/spectec` at `6191426aeaa1e9a30f2372526b5d1018eb34f0ac` | Generated Lean/Isabelle experiment evidence |

The pre-existing A12 sibling checkouts were not cloned for this project and therefore are not part of this registry. Their exact inspected revisions and roles remain recorded in their owning sections below. Ignore unknown or unregistered repositories and folders; local presence alone never makes a tree a project research input.

## A12 Workflows product target

The project compatibility target and canonical downstream blueprint are checked out read-only under the shared A12 reference tree:

| Local checkout | Repository and inspected revision | License and project role |
|---|---|---|
| [`a12/a12-workflows`](../../oss/a12/a12-workflows) | `mgm-tp/a12-workflows`, branch `release/2025.06`, revision `bb79e490ecc1bfebfb959c79edb44264aa003060` | EUPL-1.2; A12 Workflows is the product compatibility target layered on CIB Seven for downstream A12 projects |
| [`a12/a12-full-stack-project-template`](../../oss/a12/a12-full-stack-project-template) | `mgm-tp/a12-full-stack-project-template`, branch `release/2025.06`, revision `5083b5cd2b99dbc6b58da8124a00407c1e4e5e0d` | EUPL-1.2; canonical downstream-project blueprint and future Workflows-enabled integration fixture |

A12 Workflows `release/2025.06` declares CIB Seven `2.0.0`. The local CIB checkout has tag `v2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371`. The project keeps its `2.0.0` CreateDocument target profile and its `2.2.0` semantic profiles distinct, runs each against the corresponding published engine artifact, and never treats a result from one as evidence for the other. The [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) owns the defined product denominator and resulting priorities.

Both A12 repositories remain external EUPL-1.2 research, compatibility, and optional exact-source evidence inputs. They must not be linked into this project, vendored, used as build or runtime dependencies, copied into project-authored artifacts, redistributed from this repository, or represented as MIT-licensed material. This project must remain distributable under the root MIT license. A confirmed or potential breach of that boundary blocks affected work until the owner resolves it explicitly.

## Project license audit

Project-authored code and documentation are released under the root [MIT License](../LICENSE). The current dependency surface permits that choice:

| Surface | License status | Project consequence |
|---|---|---|
| Lean `v4.31.0` toolchain and Lake | Apache-2.0 in the installed distribution and the [upstream Lean repository](https://github.com/leanprover/lean4) | External toolchain, not vendored or redistributed; it retains its own license |
| Lake packages | `lake-manifest.json` records an empty `packages` array | No external Lean package license enters the tracked source or package graph |
| Shell verification tools | Git, `jq`, `xmllint`, and `shasum` are environment prerequisites | Invoked as external tools and not distributed by this repository |
| Node and pnpm | Node `24.18.0` and pnpm `11.18.0`; Homebrew formulae report MIT | External runtime and package manager; exact nvm/asdf pins and a non-mutating Homebrew fallback are tracked; the project wrapper disables pnpm's automatic project-driven CLI switching after performing its own exact version check so offline and sandboxed runs cannot stall in a hidden tool download |
| TypeScript compiler graph | `typescript@7.0.2` and the resolved `@typescript/typescript-darwin-arm64@7.0.2` platform package are Apache-2.0 | Development-only compiler; exact integrities are locked, packages are not vendored, and no runtime dependency enters the semantic core |
| Node TypeScript declarations | Direct development dependency `@types/node@24.13.3` and its locked `undici-types@7.18.2` dependency are MIT | Strict no-emit checking for directly executed Node TypeScript harnesses only; Node 24 performs runtime type stripping, neither package enters runtime or the semantic core, and both are removable if Node later supplies an equivalent checked declaration surface |
| JSON Schema validation | Direct development dependency `ajv@8.20.0` is MIT | Draft 2020-12 boundary validation and mutation tests only; it is removable with the artifact-validation harness and never enters Lean, the semantic core, or Temporal Workflow code |
| BPMN source graph | Direct `bpmn-moddle@10.0.0` plus locked `moddle@8.2.0`, `moddle-xml@12.1.0`, `min-dash@5.1.0`, and `saxen@11.1.0` are MIT | External parser graph isolated to deployment-time `@bpmn-lean/bpmn-source`; no package is vendored and no parser type enters Lean, the semantic core, or Temporal Workflow code |
| Temporal adapter graph | Direct `@temporalio/client`, `testing`, `worker`, and `workflow` packages at `1.21.0` are MIT; the locked non-vendored graph contains MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, `Apache-2.0 AND MIT`, and CC-BY-4.0 data | External adapter/runtime and test dependencies only; no Temporal dependency enters Lean or the semantic core |
| Temporal CLI `v1.8.1` | MIT; downloaded from the official Temporal distribution endpoint and Git-ignored | Full local development server for M0.5 integration tests; exact binary is cached locally and not redistributed |
| Temporal time-skipping Test Server selected by SDK `1.21.0` | Apache-2.0; downloaded by `@temporalio/testing` under its SDK-version-bound `default` selector and Git-ignored | Optional timer calibration only; cached locally, not redistributed, and removable with `test:timer-time-skipping` |
| Maven wrapper and build plugins | Wrapper `3.2.0`, Maven `3.8.8`, Compiler Plugin `3.14.1`, and Surefire Plugin `3.5.4` are Apache-2.0 | The wrapper script/JAR is retained under its upstream license; build tooling is isolated to the Java oracle |
| CIB Seven oracle graph | CIB engine `2.2.0`, directly declared test-scope `cibseven-bpmn-model` at the matching release, and most transitives are Apache-2.0; the resolved graph also contains MIT and BSD-3-Clause components | External Java oracle and typed probe-fixture construction only; the model artifact was already engine-transitive, so the direct declaration adds no resolved artifact, and no CIB type or algorithm enters Lean, the semantic core, or project-authored semantic authority |
| H2 `2.3.232` | Dual MPL-2.0 or EPL-1.0 | External in-memory oracle database; compatible with distribution of MIT-licensed project source |
| Jackson `2.21.5` | Apache-2.0 | External Java JSON transport implementation in the local CIB oracle; the owner-approved 2026-07-30 patch upgrade aligns it with the advisory-clean family selected for the deferred JUEL evaluator Worker |
| JUnit `4.13.2` and Hamcrest | EPL-1.0 and BSD-3-Clause | Test-only Java oracle dependencies |
| Temporal, MIWG, Betsy, fUML, and other research trees | Separate checkouts under their own upstream terms | Evidence inputs only; they are not project dependencies and are not relicensed |
| OMG BPMN corpus | Copyrighted external material retained only in ignored local paths | Excluded from the MIT-licensed tracked repository material |

The approved M0.2 Java, M0.4 TypeScript compiler, BPMN source, and M0.5 Temporal graphs remain compatible with releasing project-authored source under MIT. `unionfs@4.6.0` omits a package-manifest license value, but its distributed `LICENSE` is the Unlicense/public-domain dedication. The CC-BY-4.0 entry is `caniuse-lite` browser-support data pulled transitively by the Worker bundler and is neither copied into project source nor separately redistributed by this repository. Before adopting any further Maven, pnpm, Lake, parser, Temporal, test, build, or runtime package, inspect its exact transitive license graph, preserve required notices, and update this record. An incompatible future dependency must be replaced, isolated behind a non-distributed research boundary, or explicitly reconsidered; it must never silently alter the project license.

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

Every such experiment must record its base revision, patch or branch revision, build and runtime configuration, question, measurements, and shadow scenarios. See [REFERENCE-INSTRUMENTATION-POLICY.md](REFERENCE-INSTRUMENTATION-POLICY.md) for permitted acceleration, candidate probe locations, and the shadow-equivalence gate.

## CIB Seven

Pinned baseline checkout: [cibseven/cibseven at `5a45b47`](https://github.com/cibseven/cibseven/tree/5a45b47ea22688d774de97277c3ff7013f54fdd2)

- Remote: `https://github.com/cibseven/cibseven.git`
- Checked-out revision: `5a45b47ea22688d774de97277c3ff7013f54fdd2`
- Published `v2.2.0` tag revision: `834a9874760de8a0107f7c1b32806e37f17fb017`
- Inherited baseline: Camunda `7.22.0` at `1727de82ed7b655ade4f84fe70eff7b52e81a5ca`
- License: Apache-2.0
- Role: complete executable behavioral oracle source and diagnostic reference, never a semantic-core dependency

The read-only JUEL feasibility check inspected the published Maven Central artifact [`org.cibseven.bpm.juel:cibseven-juel:2.0.0`](https://repo1.maven.org/maven2/org/cibseven/bpm/juel/cibseven-juel/2.0.0/cibseven-juel-2.0.0.jar), corresponding to source tag [`v2.0.0`](https://github.com/cibseven/cibseven/tree/57ed69550f1c9c2619b9711d8877418bb084a371). The Apache-2.0 jar has SHA-256 `f0d5c3c35e98ff9cf9aaf2bf12b2f81e10d6fbea5144039810e827dd5b5d8453`; its published POM shades Jakarta EL `4.0.0` into the CIB namespace. It is present only in the user's external Maven cache for the bounded feasibility probe and candidate graph audit and is not a project dependency, lockfile entry, redistributed artifact, or active runtime. The [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) owns the deferred adoption prerequisites.

The checked-out `main` revision exactly matches the source revision named by the handoff.

The CIB oracle runner directly declares `org.cibseven.bpm.model:cibseven-bpmn-model` at the same version as `cibseven-engine` for test-scope BPMN construction. The artifact was already a transitive engine dependency, so this declaration changes dependency ownership rather than the resolved graph. Ordinary Exclusive Gateway probes use a project helper that can construct only the exact two-condition-plus-default profile shape. The lexical declaration-order witness remains literal XML, and the excluded language-qualified control uses a private typed-model helper that explicitly registers the BPMN namespace and writes a qualified formal-expression type. The pristine engine and model artifacts remain unmodified.

The core BPMN Java and resource trees, and the BPMN model-API Java and resource trees, are byte-identical between CIB Seven `v2.2.0` and the investigated `main` revision. The initial executable oracle can therefore use the published release without losing any core BPMN test evidence found on `main`.

| Test tree | Git tree identity |
|---|---|
| Core BPMN Java tests | `bda480226e6537d97d656395cfa3ed056c37f351` |
| Core BPMN resource fixtures | `ac70d17dce2e5e26878e8b6dc7f43bfc48caabfb` |
| BPMN model-API Java tests | `e171ab57b80291bd1225ed8efbb700befd38c231` |
| BPMN model-API resource fixtures | `e03b50769d00a6ca559179ab5e99a66c7d5e5cba` |

The core execution corpus at both revisions contains 261 Java files, 1,808 explicit `@Test` methods, and 1,144 paired BPMN fixtures under `engine/src/test/.../bpmn`. The entire engine test resource tree contains 1,947 BPMN models. Most of this evidence is inherited from Camunda 7.22; the CIB fork adds only one core BPMN test class and five net engine fixtures relative to that baseline.

CIB’s [implemented-standards page](https://docs.cibseven.org/manual/latest/introduction/implemented-standards/) claims support for BPMN 2.0, while its [BPMN implementation reference](https://docs.cibseven.org/manual/latest/reference/bpmn20/) documents product coverage. Neither the repository nor the documentation declares BPMN 2.0.2 Process Execution Conformance, an OMG certificate, or passage of an OMG execution TCK. Its executable corpus is the compatibility oracle for a pinned CIB profile, not proof of the independent standards claim.

## Candidate Java JUEL evaluator Worker

The owner-approved [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) selects an isolated Java Temporal Activity Worker if the deferred CIB compatibility lane is reopened. Independent review verified this exact dependency record and the owner approved the set on 2026-07-30, but the standards-first expression decision removed the uncommitted empty Worker module and no dependency is adopted. The candidate graph was resolved from Maven Central on 2026-07-30 with direct runtime roots [`org.cibseven.bpm.juel:cibseven-juel:2.0.0`](https://repo1.maven.org/maven2/org/cibseven/bpm/juel/cibseven-juel/2.0.0/) and [`io.temporal:temporal-sdk:1.35.0`](https://repo1.maven.org/maven2/io/temporal/temporal-sdk/1.35.0/), plus build-time import of [`com.fasterxml.jackson:jackson-bom:2.21.5`](https://repo1.maven.org/maven2/com/fasterxml/jackson/jackson-bom/2.21.5/). Temporal Java SDK [`v1.35.0`](https://github.com/temporalio/sdk-java/releases/tag/v1.35.0) is the inspected released source line. Direct artifact integrity is:

| Artifact | SHA-256 |
|---|---|
| `cibseven-juel-2.0.0.jar` | `f0d5c3c35e98ff9cf9aaf2bf12b2f81e10d6fbea5144039810e827dd5b5d8453` |
| `temporal-sdk-1.35.0.jar` | `b6d903f5fecbc36ddffae3b6005bf6abd70ba4cc3a8bab37a1dfbbbb855e5009` |
| `jackson-bom-2.21.5.pom` | `57fe22dec659de0655357fad0582ef7c8b2fe5a8906a6f1ff1bcbbd1e4554846` |

The resolved runtime graph contains exactly 38 jars:

- JUEL: `org.cibseven.bpm.juel:cibseven-juel:2.0.0`.
- Temporal and Nexus: `io.temporal:temporal-sdk:1.35.0`, `io.temporal:temporal-serviceclient:1.35.0`, and `io.nexusrpc:nexus-sdk:0.5.0-alpha`.
- gRPC: `io.grpc:grpc-api:1.76.0`, `grpc-stub:1.76.0`, `grpc-netty-shaded:1.76.0`, `grpc-util:1.76.0`, `grpc-core:1.76.0`, `grpc-context:1.76.0`, `grpc-protobuf:1.76.0`, `grpc-protobuf-lite:1.76.0`, `grpc-services:1.76.0`, and `grpc-inprocess:1.76.0`.
- Protobuf: `com.google.protobuf:protobuf-java:3.25.8`, `com.google.protobuf:protobuf-java-util:3.25.8`, and `com.google.api.grpc:proto-google-common-protos:2.59.2`.
- Jackson: `com.fasterxml.jackson.core:jackson-databind:2.21.5`, `jackson-annotations:2.21`, `jackson-core:2.21.5`, `com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.21.5`, and `jackson-datatype-jdk8:2.21.5`.
- Guava family: `com.google.guava:guava:33.4.8-android`, `failureaccess:1.0.3`, `listenablefuture:9999.0-empty-to-avoid-conflict-with-guava`, `org.jspecify:jspecify:1.0.0`, `com.google.errorprone:error_prone_annotations:2.36.0`, and `com.google.j2objc:j2objc-annotations:3.0.0`.
- Metrics and serialization support: `com.uber.m3:tally-core:0.13.0`, `org.slf4j:slf4j-api:1.7.36`, `com.google.code.gson:gson:2.10.1`, `io.micrometer:micrometer-core:1.9.9`, `org.hdrhistogram:HdrHistogram:2.1.12`, and `org.latencyutils:LatencyUtils:2.0.3`.
- Annotations and instrumentation: `com.google.code.findbugs:jsr305:3.0.2`, `org.codehaus.mojo:animal-sniffer-annotations:1.24`, `com.google.android:annotations:4.1.1.4`, and `io.perfmark:perfmark-api:0.27.0`.

The aggregate SHA-256 over sorted `group:artifact:version:scope sha256(jar)` lines is `6925110b2e869eae35aa47234d352ae3d4db3537a7d86630c8254abd5b62c918`. Published metadata reports only Apache-2.0, BSD-3-Clause, BSD-2-Clause/CC0, CC0, and MIT across this graph. An OSV batch query for every exact Maven coordinate returned no known advisory on 2026-07-30.

Temporal SDK `1.35.0` otherwise resolves Jackson `2.15.4`; that unaligned family and the oracle's former direct `jackson-databind:2.21.2` each returned current advisories in the same scan. The candidate therefore imports Jackson BOM `2.21.5`, whose complete aligned runtime family returned no known advisory. The owner separately approved the oracle's `2.21.2 → 2.21.5` hygiene update, which is now adopted without changing its transport contract.

The graph is cached only under ignored external Maven storage and is not a project dependency, lockfile entry, or redistributed artifact. Its future runtime role is confined to the deferred Java evaluator Worker: CIB JUEL parses and evaluates the approved read-only compatibility profile; Temporal SDK hosts the Activity and payload boundary; Jackson serializes that boundary. The active Simple Boolean profile requires none of this graph.

## Temporal TypeScript SDK

Pinned baseline checkout: [temporalio/sdk-typescript at `2595d1b`](https://github.com/temporalio/sdk-typescript/tree/2595d1b62cf5c3ff1748df0df2f9b303902bb31c)

- Remote: `https://github.com/temporalio/sdk-typescript.git`
- Inspected revision: `2595d1b62cf5c3ff1748df0df2f9b303902bb31c`
- License: MIT
- Role: authoritative implementation reference for TypeScript Workflow replay, timers, Activities, cancellation, delivery, and SDK boundaries

M0.5 separately pins the released packages `@temporalio/client@1.21.0`, `@temporalio/testing@1.21.0`, `@temporalio/worker@1.21.0`, and `@temporalio/workflow@1.21.0`. They are isolated to `@bpmn-lean/temporal-adapter`; the semantic core remains dependency-free. The SDK requires Node `>=20.3.0`, satisfied by the project’s pinned Node `24.18.0`.

The resolved pnpm graph is locked. pnpm’s supply-chain guard explicitly denies install scripts for `@swc/core@1.15.46` and `protobufjs@7.6.5`; the installed native SWC binding was verified without its optional fallback script, and protobufjs’s postinstall is not required for runtime behavior. The exact freshly released Temporal `1.21.0` suite is listed in `minimumReleaseAgeExclude` because the user explicitly approved that coordinated version set. Temporal’s published declarations currently fail library checking under TypeScript `7.0.2`, so only the adapter sets `skipLibCheck: true`; project source remains strict and the semantic core continues to check dependency-free with library checking enabled.

The adapter uses Temporal CLI `v1.8.1` through `TestWorkflowEnvironment.createLocal` with the SDK’s `cached-download` strategy. The CLI starts the full local development server, is cached under ignored `.cache/temporal-cli/`, and is not committed. Current pre-release tests fetch and replay histories produced during the same clean server run; no external Temporal history is redistributed or committed.

The optional timer calibration uses `TestWorkflowEnvironment.createTimeSkipping`. Its `cached-download` executable selector is `default`, which `@temporalio/testing` resolves against the pinned SDK name and version; the resulting binary is cached under ignored `.cache/temporal-test-server/` and is not redistributed. This lane runs the same exact semantic result and durable timer-history assertion but does not replace the pinned CLI full-server duration, Worker-restart, replay, or cleanup evidence.

## Temporal TypeScript samples

Pinned baseline checkout: [temporalio/samples-typescript at `fb0aa23`](https://github.com/temporalio/samples-typescript/tree/fb0aa23d75394a132646de883842dfacdacd5aa0)

- Remote: `https://github.com/temporalio/samples-typescript.git`
- Inspected revision: `fb0aa23d75394a132646de883842dfacdacd5aa0`
- License: MIT
- Role: concrete Workflow, Activity, signal, update, timer, cancellation, testing, replay, and data-driven DSL-interpreter research

The [`dsl-interpreter`](https://github.com/temporalio/samples-typescript/tree/fb0aa23d75394a132646de883842dfacdacd5aa0/dsl-interpreter) sample parses YAML into a data AST and recursively interprets sequence, parallel, and Activity nodes inside one Workflow rather than generating TypeScript. It supports the project’s hosting direction but cannot define BPMN behavior; its lessons and limitations are recorded in [TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md).

## Temporal documentation

Pinned baseline checkout: [temporalio/documentation at `16c1899`](https://github.com/temporalio/documentation/tree/16c1899a0380eaf3457a0b163b2b2232c39a5d)

- Remote: `https://github.com/temporalio/documentation.git`
- Inspected revision: `16c1899a0380eaf3457a0b163b2b2b2232c39a5d`
- Role: authoritative current documentation for Workflow execution, Event History, Commands, messaging, retries, concurrency, Continue-As-New, versioning, testing, and operational features

The project-authored [Temporal execution-model research](research/TEMPORAL-EXECUTION-RESEARCH.md) combines this documentation with pinned TypeScript SDK implementation evidence and records the consequences for the BPMN adapter boundary. Current documentation can describe features newer than the eventual project dependency, so every implemented feature still requires an exact SDK and server version pin.

## Formal methods and behavioral refinement

The project-authored [formal-methods toolbox](research/TLA-AND-BISIMULATION-RESEARCH.md) evaluates temporal specification, model checking, process algebra, behavioral relations, relational modeling, and Petri-net analysis against this project’s existing Lean, differential, Temporal-refinement, and replay boundaries.

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

## WebAssembly specification and semantics workbench

Read-only checkout: [WebAssembly/spec at `dfa3f32`](https://github.com/WebAssembly/spec/tree/dfa3f32a881aecc60a8c792da3c25787ccb15572)

- Remote: `https://github.com/WebAssembly/spec.git`
- Inspected revision: `dfa3f32a881aecc60a8c792da3c25787ccb15572`
- License: directory-specific; SpecTec, the OCaml interpreter, and tests are Apache-2.0, while specification documents use the W3C Software and Document Notice and License
- Role: research reference for declarative operational semantics, generated prose and formal notation, reference interpreters, language-neutral conformance scripts, versioned specifications, and proof-claim boundaries

Read-only checkout: [`Wasm-DSL/spectec` at `acc6e83`](https://github.com/Wasm-DSL/spectec/tree/acc6e834ff403c82554d081237f327346190ad96)

- Remote: `https://github.com/Wasm-DSL/spectec.git`
- Inspected main revision: `acc6e834ff403c82554d081237f327346190ad96`
- Inspected experimental revisions: Lean 4 `16b70bde873d7ded498f9b81fd13ddcee95281fa`, Isabelle `9bcba3d1b8599b1c2cdff9f26e21a745949f85f2`, and Rocq `65187f939a83d3206f50813cd362592fc4ec0a62`
- License: directory-specific; SpecTec, the OCaml interpreter, and tests are Apache-2.0, while specification documents use the W3C Software and Document Notice and License
- Role: standalone SpecTec development incubator and research evidence for multi-backend mechanization; not an independent semantic oracle

Read-only checkout: [`zilinc/spectec` at `6191426`](https://github.com/zilinc/spectec/tree/6191426aeaa1e9a30f2372526b5d1018eb34f0ac)

- Remote: `https://github.com/zilinc/spectec.git`
- Inspected main revision: `6191426aeaa1e9a30f2372526b5d1018eb34f0ac`
- Inspected experimental revisions: Lean 4 `40077cfe8e5879d742462f915ca2e29e4c7574ed` and Isabelle proof-first `8c20098523514559add26233844e714bb53f314b`
- License: directory-specific; the repository root delegates terms to top-level directories, with specification documents under the W3C Software and Document Notice and License, the interpreter and tests under Apache-2.0, and papers under CC BY 4.0
- Role: fork and active experimental-branch evidence for generated Lean and Isabelle definitions and proof work; not an independent semantic oracle

These repositories share lineage and periodically synchronized code, so agreement among them is not differential evidence. All remain external research inputs and contribute no dependency or copied source to this project. The [WebAssembly and SpecTec semantics transfer study](research/WEBASSEMBLY-SEMANTICS-RESEARCH.md) records which mechanisms fit this project and why a general SpecTec-like DSL, generated TypeScript semantic core, or current proof-assistant backend is not recommended now.

## BPMN XML/metamodel reference

Read-only checkout: [bpmn-io/bpmn-moddle at `47d8f75`](https://github.com/bpmn-io/bpmn-moddle/tree/47d8f75eed773829f20537adbb7086b290096006)

- Remote: `https://github.com/bpmn-io/bpmn-moddle.git`
- Inspected revision: `47d8f75eed773829f20537adbb7086b290096006`
- Role: independent research reference for parsing, serializing, and representing BPMN 2.0 XML and its metamodel in JavaScript

This checkout remains a research reference and is not a normative semantic authority. The adopted production dependency is the separately published package described below, not this mutable source checkout.

The adopted production dependency is the separately published [`bpmn-moddle@10.0.0`](https://www.npmjs.com/package/bpmn-moddle), whose `v10.0.0` tag resolves to `b72949eb6f7d0522f73cb723633ebdbcefd22762`. Its registry tarball integrity is `sha512-vXePD5jkatcILmM3zwJG/m6IIHIghTGB7WvgcdEraEw8E8VdJHrTgrvBUhbzqaXJpnsGQz15QS936xeBY6l9aA==`. The exact locked runtime graph—`bpmn-moddle@10.0.0`, `moddle@8.2.0`, `moddle-xml@12.1.0`, `min-dash@5.1.0`, and `saxen@11.1.0`—is MIT-licensed and has no registry `preinstall`, `install`, or `postinstall` scripts. It is isolated in [`@bpmn-lean/bpmn-source`](../packages/bpmn-source/README.md); no parser dependency enters Lean, the semantic core, or the Temporal Workflow bundle.

The pre-adoption [ingestion spike](experiments/BPMN-XML-INGESTION-EXPERIMENT.md) loaded the published UMD bundle from a temporary directory without changing this repository’s dependency graph. The exact tag’s BPMN20, BPMNDI, DC, and DI CMOF resources are XML-canonical-identical to the official local BPMN 2.0.2 files, and its five published XSDs are content-identical after CRLF normalization. The inspected `main` revision has newer dependency ranges and unpublished generated-type work; it must not be conflated with the installed `10.0.0` package.

## BPMN MIWG interchange corpus

Read-only checkout: [bpmn-miwg/bpmn-miwg-test-suite at `cb26295`](https://github.com/bpmn-miwg/bpmn-miwg-test-suite/tree/cb2629519cee6280ab521f99dc46a9815a221a35)

- Remote: `https://github.com/bpmn-miwg/bpmn-miwg-test-suite.git`
- Checked-out revision: `cb2629519cee6280ab521f99dc46a9815a221a35`
- Role: OMG working-group BPMN XML import, export, round-trip, and cross-tool reference models
- License: Creative Commons Attribution 3.0 Unported

This suite supports the optional local ingestion/interchange observation gate. It is not an execution-semantics oracle.

The suite should be reused at three boundaries:

1. Validate that the XML front end accepts the published reference models and resolves their namespaces and references without inventing execution meaning.
2. If export is implemented, compare normalized import/export/import models while preserving allowed extension and diagram-interchange data.
3. Record tool-specific fixtures as interoperability evidence, separately from semantic execution cases.

Passing these models demonstrates interchange coverage only. It does not establish token semantics, Activity lifecycle behavior, CIB compatibility, or Temporal refinement.

At the pinned revision, `Reference/` contains 21 BPMN models and 25 reference images. `test-case-structure.json`, `BPMN 2.0 Attribute Coverage Matrix.xlsx`, and submitted vendor round-trip results provide additional interchange inputs. `./scripts/pnpm.sh run test:miwg` reads the external checkout without copying it, retains exact source identity, and currently classifies fourteen models as structurally imported but outside the first compiler, six as unsupported encoding, and one as parser-warning-blocked. These are honest boundary results, not 21 execution passes.

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

## Parallel independent research effort

Colleague-authored review of this project's architecture and feasibility summary, inspected as local read-only documents on 2026-07-29 and 2026-07-30. External authorship; the documents are retained outside this repository and are deliberately neither committed nor summarized here. Their content digests are recorded so that a later citation can be bound to the exact text reviewed:

| Inspected document | SHA-256 |
|---|---|
| `bpmn-lean-experiment-review-grounded.md` | `a5966df6ef39529218a164ac38f73220e6034ed2b2b8c5c355f14f69d92d2f7c` |
| `sema-enabled-apply-schedule-split.md` | `9628047a2e0832bc09bbe2a0481bf6b94f77cbeeda5b8bf94ff7109fad3611c8` |

**Standing: unvalidated external design input. It is not a semantic authority and is not evidence for any claim in this project.** Nothing in it may be carried on its authority. A suggestion from it may be acted on only after this project independently establishes the underlying fact from its own source, gates, or normative review, and the result is then recorded as this project's finding in the owning document rather than as an external one.

Two reasons for that standing, both established after the review was written. The owner has confirmed that the workload profile underpinning its central argument was a hypothetical illustration rather than a recorded requirement. Independent re-check separately found that the same argument measured the wrong unit for this architecture. Neither the argument nor its corrected arithmetic is retained here, and the deferral it bore on was already recorded in [PLAN.md](PLAN.md).

Third-party product assessments, comparative substrate claims, effort estimates, and tool or prover comparisons appearing in the review are explicitly **not** carried into this repository. Where this project needs such an assessment it produces its own under the applicable [research owner](research/README.md).

One durable takeaway is retained, as this project's own and about form rather than content. The review labels the confidence of individual claims and closes by listing those most likely to be wrong, which is good practice worth borrowing. But it attaches no label to *premise selection*, so a hypothetical premise carried a chain of individually-labelled reasoning to a confident conclusion. Per-claim confidence labels do not protect against an unlabelled premise, and a document that reads as rigorous is not thereby grounded. [TESTING-SPEC.md](TESTING-SPEC.md) owns evidence-lane discipline; this is its review-reading counterpart.

## Documentation-discipline precedent

Read-only checkout: [mbackschat/a12-dmkits at `446e668`](https://github.com/mbackschat/a12-dmkits/tree/446e668de19e86447458f89a89ee201affce1ee0)

- Remote: `https://github.com/mbackschat/a12-dmkits.git`
- Inspected revision: `446e668de19e86447458f89a89ee201affce1ee0`
- Inspected artifact: [`docs/DOC-DISCIPLINE.md`](https://github.com/mbackschat/a12-dmkits/blob/446e668de19e86447458f89a89ee201affce1ee0/docs/DOC-DISCIPLINE.md)
- License: MIT
- Role: owner-authored precedent for lifecycle-sensitive `-SPEC`, `-PROPOSAL`, `-GAPS`, and `-LEDGER` naming, proposal graduation, documentation indexing, same-change updates, and the separation of stable contracts from moving results

The checkout’s `DOC-DISCIPLINE.md` matched its committed revision when inspected on 2026-07-26; unrelated files in the worktree had uncommitted owner changes and were ignored. This project applies the shared lifecycle rules in its own words in [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md). It deliberately retains [PLAN.md](PLAN.md) and [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) as assurance-specific living owners rather than copying `a12-dmkits`’ no-status-surface architecture.

## Lean sibling experiment

Read-only checkout: [mbackschat/a12-kernel-lean at `6f9bbf6`](https://github.com/mbackschat/a12-kernel-lean/tree/6f9bbf64489c3eee9ffebf72b70116f7e02e36b5)

- Inspected revision: `6f9bbf64489c3eee9ffebf72b70116f7e02e36b5`
- Role: precedent for a pinned dependency-free Lean toolchain, executable-first semantic capsules, proof/evidence separation, documentation ownership, honest claim boundaries, and shared `CLAUDE.md`/`AGENTS.md` guidance

This project adopts those working conventions where they fit, but it does not copy A12 domain semantics, evidence, or project-specific governance.

The bounded process-transfer study in [research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md](research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md) also inspected the sibling’s ongoing worktree on 2026-07-24 at committed base [`d25a0ce`](https://github.com/mbackschat/a12-kernel-lean/tree/d25a0ce2fcd61e4b3df50b054adc07d490331875). That worktree contained uncommitted owner changes and was treated as read-only evolving process evidence, not as a replacement pinned semantic source. The stable reference revision above remains unchanged.

On 2026-07-26 the later read-only worktree at committed base [`a225157`](https://github.com/mbackschat/a12-kernel-lean/tree/a2251579e2205a6b051ccabb0291285abb8406c4) supplied the archived [`SEMANTIC-CORE-IL-PROPOSAL.md`](https://github.com/mbackschat/a12-kernel-lean/blob/a2251579e2205a6b051ccabb0291285abb8406c4/docs/archived/SEMANTIC-CORE-IL-PROPOSAL.md) as negative design evidence. A12 rejected its universal Core IL because material domain semantics preceded the boundary, typed structure was erased, legacy family evaluators remained underneath it, malformed structure was conflated with semantic uncertainty, and preservation obligations were not fixed before implementation. The BPMN project’s bounded [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md) adopts those rejection criteria rather than transferring the rejected architecture. The evolving sibling worktree had unrelated uncommitted changes and remained a read-only research input.

## fUML reference implementation

Read-only checkout: [ModelDriven/fUML-Reference-Implementation at `45e5063`](https://github.com/ModelDriven/fUML-Reference-Implementation/tree/45e506336d4cd56965d4ad3b684149245f899f3a)

- Remote: `https://github.com/ModelDriven/fUML-Reference-Implementation.git`
- Inspected revision: `45e506336d4cd56965d4ad3b684149245f899f3a`
- Role: concrete Java companion for understanding fUML 1.5 syntax, Locus/Executor setup, semantic visitors, Activity node activations, edge instances, offers, and tokens

The repository describes itself as an open-source reference implementation of fUML and accepts conforming UML XMI for execution. It is a research reference, not a project dependency, BPMN authority, or proof that its implementation satisfies every fUML requirement. Its architecture and transfer limits are recorded in [semantic-representation research](research/SEMANTIC-REPRESENTATIONS-RESEARCH.md).

Normative authority remains the [OMG fUML 1.5 specification catalog](https://www.omg.org/spec/FUML/1.5) and its syntax, semantics, library, and PDF artifacts.
