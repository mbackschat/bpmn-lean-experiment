# Contributor setup

## Status

Implemented. This guide owns clean-machine bootstrap and diagnostics for human contributors and coding agents.

## Clean-clone path

A checkout is ready only when the exact project toolchain, workspace packages, and external verification inputs are present. From a fresh clone:

```sh
nvm install
nvm use
./scripts/setup-external-sources.sh verify
./scripts/pnpm.sh install --frozen-lockfile
./scripts/doctor.sh verify
./scripts/verify.sh
```

`setup-external-sources.sh` provisions the external sibling root at `../oss` by default. Set `BPMN_EXTERNAL_ROOT` to an absolute directory when repositories on a machine use another shared location. Setup, diagnosis, schema/metamodel checks, the explicit A12 source-adoption check, MIWG calibration, CIB breadth inventory, and the complete default gate honor that override.

The setup script is intentionally narrower than a machine package installer. Install the prerequisites listed in the top-level [README](../README.md) with the operating system's normal package manager, then let the script provision only content whose exact identity this repository owns.

M1 and M2 browser acceptance additionally need the development-only Chromium revision pinned by Playwright. It is not a production or engine prerequisite. Install it once after the frozen workspace install, then run the required browser gates:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m1-definition-deployment exec playwright install chromium
./scripts/pnpm.sh run test:showcase:m1
./scripts/pnpm.sh run test:showcase:m2
```

Hosted Linux CI uses `playwright install --with-deps chromium` to provision both that browser revision and its image-specific shared libraries before running the same acceptance commands. The Playwright packages, browser binary, and host libraries do not enter the static web distribution or reachable production package graph.

Tokei-backed README statistics are a maintainer-only publication aid. Tokei is available only on the maintainer's machine and is not required by contributor setup, hooks, normal builds, tests, or CI.

## Provisioning scopes

| Scope | Inputs | Required for |
|---|---|---|
| `verify` | The 15-file official OMG BPMN 2.0.2 corpus; no A12 checkout | The complete MIT engine verification gate and CI |
| `adoption` | The OMG corpus plus exact A12 Workflows `release/2025.06` source at its pinned commit | Optional downstream exact-source evidence through `./scripts/test-a12-adoption.sh` |
| `research` | The OMG corpus plus every checkout registered as research input, including the A12 full-stack blueprint | Calibration, breadth inventory, and source-grounded proposal work |
| `all` | The union of `verify`, `adoption`, and `research` | A deliberately complete multi-purpose workspace |

The scope split is an architecture boundary. Default verification is complete for the MIT BPMN engine and does not obtain or inspect A12. The optional adoption lane is not a weakened default lane: when selected, it fails unless the external EUPL-1.2 checkout is present at the exact pinned pristine revision and both registered source facts pass. `verify.sh` announces `A12_ADOPTION_EVIDENCE status=not-run` so absence of downstream evidence is explicit without turning A12 into a lower-layer dependency.

## Memory-bounded Lean measurements

Ordinary Lean development runs through [`scripts/lake.sh`](../scripts/lake.sh). Its conservative `LEAN_NUM_THREADS` default bounds build parallelism and does not start Docker. A hard memory ceiling is additionally required for a Lean cost measurement and for the first narrow build after changing a kernel-decided fixture, a dispatcher reduced by those fixtures, admission logic reduced by many fixtures, or proof-lane layout. This is development and CI assurance work only. Lean and the measurement environment are absent from the engine and platform runtime dependency graphs.

Prefer the host operating system's native process-tree memory controller when it provides a verifiable hard resident-memory limit:

- On Linux with cgroup v2 and a delegated systemd user manager, run the narrow target in a transient scope with `MemoryMax`, set `MemorySwapMax=0` when the measurement requires no swap, and use `CPUQuota=100%` when comparing one-CPU measurements. Verify that the properties were applied. If the user manager cannot delegate the memory controller, use the container fallback rather than substituting an address-space limit.
- On macOS, `setrlimit` and shell `ulimit` do not provide the required hard process-tree resident-memory ceiling. Use a Linux container with explicit `--memory`, equal `--memory-swap` to prohibit additional swap, and `--cpus=1` when reproducing the one-CPU cost lane. The container must use the repository-pinned Lean version and a Linux build cache separate from host artifacts. Docker is a measurement harness here, not a build, test, or product runtime dependency.
- On another operating system, use its native facility only when it hard-limits the complete process tree and the applied limit can be verified. Otherwise use a constrained container. Record the backend with the result so unlike measurements are not compared as though they used the same enforcement.

Do not use a polling watchdog, Activity Monitor sample, `ulimit -v`, or a virtual-address-space limit as a substitute. Those can observe or constrain a different resource while a Lean process allocates resident memory between samples. Record the exact target, commit, Lean version, `LEAN_NUM_THREADS`, CPU allowance, memory ceiling, swap policy, elapsed/user/system time, peak resident memory, cache state, exit status, and enforcement backend. A timed-out or OOM-killed build is evidence that the target did not fit the declared bound; do not raise the bound merely to make it green.

Run the exact A12 source-adoption lane only after deliberately selecting that license-separated input:

```sh
./scripts/setup-external-sources.sh adoption
./scripts/doctor.sh adoption
./scripts/test-a12-adoption.sh
```

Prepare a full research workstation with:

```sh
./scripts/setup-external-sources.sh research
./scripts/doctor.sh research
```

An explicitly invoked adoption or research lane must fail when its registered input is absent or at the wrong revision. It must never skip, substitute web memory, or make a weaker claim. `all` is available when one task genuinely needs every class of material; it is not the routine setup recommendation.

## What setup guarantees

[`external-sources.lock`](../scripts/external-sources.lock) is the machine-readable Git material inventory. Each row fixes a scope, relative path, canonical GitHub remote, immutable-reference kind, full 40-character commit, and whether the material is a top-level repository or a named submodule of another locked repository. A release branch is recorded in [SOURCES.md](SOURCES.md) as provenance context but never substitutes for the commit. When the inspected commit has an exact tag, the lock records and validates the tag-to-commit association; untagged sources say `commit` explicitly. The OMG corpus has a separate [official-input digest manifest](reference/bpmn-2.0.2/LOCAL-CORPUS.sha256) because it is an OMG download set rather than a Git repository.

Setup downloads the OMG inputs only from `www.omg.org`, stages them inside the target parent filesystem, verifies all hashes, and installs the corpus with one same-filesystem rename only after the complete set passes. Top-level Git inputs are cloned to temporary paths and detached at their exact revisions before atomic installation. Declared submodules are then initialized from the superproject gitlink and independently verified against their redundant lock rows. An existing initialized target is never reset, cleaned, switched, or overwritten.

If a target path is a partial or non-Git directory, or an existing checkout has the wrong revision or tracked/untracked source changes, setup stops and distinguishes those cases. Preserve the work, then explicitly repair the checkout, select another `BPMN_EXTERNAL_ROOT`, or replace the checkout after deciding that its local state is disposable. The automation does not make that destructive decision.

[`doctor.sh`](../scripts/doctor.sh) is read-only. It checks Git, curl, XML and hash tools, exact Node and pnpm versions, Java 21 using the project Java-home resolver, Lean/Lake, installed workspace packages, corpus hashes, canonical Git remotes, exact commits, declared tag associations, superproject gitlinks, and checkout cleanliness. It always lists all eighteen external Git material pins—fourteen top-level repositories and four submodules—including research inputs outside the selected scope, then verifies the selected scope.

The doctor asks pnpm for the current workspace package graph and hashes every reported package manifest, then hashes the fixed non-pnpm owners: Node selectors, pnpm workspace and frozen lock, Lean toolchain/build manifest, Maven POM/wrapper, both machine-readable external/cache inventories, and the OMG manifest. It reads shared and external cache roots from [`workspace-cache.lock`](../scripts/workspace-cache.lock), resolves dependency-backed cache owners from package-name selectors, and derives each workspace package's build-output cache from that same pnpm graph, so adding or moving a package does not require a second diagnostic inventory. The report includes `node_modules`, the pnpm store, Lean and uv caches, root and package build outputs, coverage output, both Temporal download caches, Maven build output, external Maven artifact/wrapper caches, and the optional external BPMN Markdown/figure conversion caches with present/absent status and size. It also reports the observed hashes of cached Temporal platform binaries and verifies an existing Apache Maven `3.8.8` distribution against its known SHA-256. Derived caches may be absent; their owner and regeneration identity remain visible. Required dependency material and selected source evidence may not be absent.

The Maven wrapper pins release `3.8.8` by versioned Maven Central URL and enforces distribution SHA-256 `2e181515ce8ae14b7a904c40bb4794831f5fd1d9641107a13b916af15af4001a`; the tracked wrapper JAR identifies wrapper `3.2.0`, and Git pins both wrapper files. Node `24.18.0`, pnpm `11.20.0`, Lean `v4.31.0`, Temporal SDK `1.21.0`, Temporal CLI `v1.8.1`, CIB Seven artifacts `2.0.0`/`2.2.0`, and every direct package dependency remain exact in their owning manifests. Java is intentionally a checked Java 21 capability range rather than a vendor-specific binary pin; the doctor reports the resolved home used on the machine.

The Node and pnpm pins have exactly one owner: [package.json](../package.json) declares pnpm through `packageManager` and Node through `engines.node`. [`pinned-toolchain.sh`](../scripts/pinned-toolchain.sh) reads that manifest and prints both as shell assignments, and the pnpm wrapper, the doctor, and the CI setup steps derive their required versions from it. Bumping either tool therefore edits that one manifest field plus the prose that quotes it; an executable guard fails when a Node selector, `engines` entry, derived consumer, or documented version disagrees with the owner.

Targeted diagnostics may override `BPMN_XSD_PATH`, `BPMN_CMOF_PATH`, or `BPMN_MIWG_ROOT`. Those variables select another complete input for the named command; they do not allow the default gate or CI to omit an input. `BPMN_EXTERNAL_ROOT` applies uniformly to all four setup/check/doctor scopes and to the optional A12 adoption harness. A cold or contended host may set `BPMN_CIB_MAVEN_TIMEOUT_MS` to a larger positive integer of milliseconds for each release-specific CIB Maven invocation; the normal workstation deadline remains 60000 milliseconds.

## Coding-agent startup checklist

1. Read the current checkpoint in [PLAN.md](PLAN.md) and exact implemented/absent boundary in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).
2. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated work.
3. Run `./scripts/doctor.sh verify`. If it reports missing external inputs, run `./scripts/setup-external-sources.sh verify`; if it reports missing workspace packages, install the frozen pnpm lock.
4. Use `./scripts/setup-external-sources.sh research` and `./scripts/doctor.sh research` before a task that depends on registered research checkouts.
5. Use `./scripts/setup-external-sources.sh adoption` and `./scripts/test-a12-adoption.sh` only when the task explicitly needs the optional A12 exact-source evidence lane. Never infer A12 evidence from a green default gate.
6. Never report a skipped, web-substituted, locally remembered, or absent selected lane as evidence. Missing material is an infrastructure failure for the lane that selected it; a lane outside the selected scope makes no claim.
7. Do not add an unregistered checkout, change a revision, or establish a fork without updating [SOURCES.md](SOURCES.md), the lock, license/provenance facts, and the applicable evidence owner in the same reviewed change.

## Why the engine repository has no submodules

Git submodules are useful when every checkout is Git-addressable, belongs inside one repository's worktree, and shares its clone/update lifecycle. This workspace fails all three conditions: the OMG normative corpus is an official download set rather than a Git repository; A12 is license-separated EUPL evidence that must remain outside the MIT project tree; and most large reference checkouts are optional research inputs rather than build or runtime dependencies.

Putting those trees into this repository as submodules would not make the workspace self-contained—the OMG fetch would still be required—and would blur the project's redistribution and dependency boundaries. It would also force ordinary engine contributors to initialize unrelated large research trees. The repository therefore owns reproducibility through an exact lock plus idempotent provisioning and fail-closed diagnosis, while keeping source material outside its worktree.

If repeated onboarding of every research tree later justifies one Git operation, create a separate `bpmn-lean-workspace` meta-repository whose submodules point at the engine and Git-addressable reference repositories. That workspace meta-repository is an optional convenience only: this engine repository must remain independently bootstrappable, CI must continue to use its setup script, and the OMG corpus must still be fetched and hash-verified.

## Fork and source-loss policy

A controlled fork is appropriate when an upstream repository cannot reliably serve a recorded commit, is deleted, or requires a stable organization-owned mirror. Create the fork only when that concrete availability risk occurs. Preserve the upstream URL and commit provenance, record the fork URL and relationship in [SOURCES.md](SOURCES.md), update the lock atomically, verify that the pinned tree is byte-identical, and review the new license/distribution boundary before relying on it.

A fork is not a place to mix instrumentation into the pristine evidence baseline. Reference-source experiments still follow [REFERENCE-INSTRUMENTATION-POLICY.md](REFERENCE-INSTRUMENTATION-POLICY.md) with a separate branch or worktree and shadow comparison. OMG artifacts must not be placed in a new Git repository without explicit owner resolution of their redistribution terms.

## CI contract

Both CI platforms provision the `verify` scope from the repository-owned OMG hash manifest before installing workspace packages and running the full MIT engine gate. They do not fetch A12. Network availability is part of provisioning, not semantic execution. Once provisioned, verification is fail-closed and offline with respect to the normative corpus identity; a missing or mismatched input fails before semantic claims are evaluated. A hosted A12 adoption job may be added only as a separately named opt-in job that invokes the same fail-closed `adoption` scope and never becomes a prerequisite for the engine gate.
