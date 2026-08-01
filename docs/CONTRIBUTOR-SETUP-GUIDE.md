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

`setup-external-sources.sh` provisions the external sibling root at `../oss` by default. Set `BPMN_EXTERNAL_ROOT` to an absolute directory when repositories on a machine use another shared location. Setup, diagnosis, the schema/metamodel checks, TypeScript source evidence, MIWG calibration, and CIB breadth inventory honor that override. The CIB Java gate temporarily also requires its retained A12 witness at default sibling `../oss` because the pending Receive Task semantic-review barrier freezes that runner tree; the gate fails explicitly rather than skipping when the default witness is absent. Removing that narrow compatibility preflight is required with the first permitted post-review runner edit.

The setup script is intentionally narrower than a machine package installer. Install the prerequisites listed in the top-level [README](../README.md) with the operating system's normal package manager, then let the script provision only content whose exact identity this repository owns.

## Provisioning scopes

| Scope | Inputs | Required for |
|---|---|---|
| `verify` | The 15-file official OMG BPMN 2.0.2 corpus and the exact A12 Workflows checkout used by retained source-boundary evidence | The default verification gate and CI |
| `all` | Everything in `verify` plus every pinned Git research checkout registered in [SOURCES.md](SOURCES.md) | Research, calibration, breadth inventory, and source-grounded proposal work |

The name `verify` is deliberate: A12 Workflows remains external EUPL research/evidence and is not an engine runtime or build dependency. It is nevertheless mandatory for the default gate because two retained checks compare project-authored artifacts with exact external source facts.

Prepare a full research workstation with:

```sh
./scripts/setup-external-sources.sh all
./scripts/doctor.sh all
```

An explicitly invoked research lane must fail when its registered input is absent or at the wrong revision. It must never skip, substitute web memory, or make a weaker claim.

## What setup guarantees

[`external-sources.lock`](../scripts/external-sources.lock) is the machine-readable Git material inventory. Each row fixes a scope, relative path, canonical GitHub remote, immutable-reference kind, full 40-character commit, and whether the material is a top-level repository or a named submodule of another locked repository. A release branch is recorded in [SOURCES.md](SOURCES.md) as provenance context but never substitutes for the commit. When the inspected commit has an exact tag, the lock records and validates the tag-to-commit association; untagged sources say `commit` explicitly. The OMG corpus has a separate [official-input digest manifest](reference/bpmn-2.0.2/LOCAL-CORPUS.sha256) because it is an OMG download set rather than a Git repository.

Setup downloads the OMG inputs only from `www.omg.org`, verifies all hashes in a temporary directory, and installs the corpus only after the complete set passes. Top-level Git inputs are cloned to temporary paths and detached at their exact revisions before atomic installation. Declared submodules are then initialized from the superproject gitlink and independently verified against their redundant lock rows. An existing initialized target is never reset, cleaned, switched, or overwritten.

If an existing checkout has the wrong revision or tracked/untracked source changes, setup stops and reports it. Preserve the work, then explicitly repair the checkout, select another `BPMN_EXTERNAL_ROOT`, or replace the checkout after deciding that its local state is disposable. The automation does not make that destructive decision.

[`doctor.sh`](../scripts/doctor.sh) is read-only. It checks Git, curl, XML and hash tools, exact Node and pnpm versions, Java 21 using the project Java-home resolver, Lean/Lake, installed workspace packages, corpus hashes, canonical Git remotes, exact commits, declared tag associations, superproject gitlinks, and checkout cleanliness. It always lists all seventeen external Git material pins—thirteen top-level repositories and four submodules—including research inputs outside the selected scope, then verifies the selected scope.

The doctor hashes all eighteen dependency owners: every Node selector and workspace package manifest, pnpm workspace and frozen lock, Lean toolchain/build manifest, Maven POM/wrapper, both machine-readable external/cache inventories, and the OMG manifest. It inventories every known dependency/cache root from [`workspace-cache.lock`](../scripts/workspace-cache.lock), including every repository-ignored cache or generated-output root. The report includes `node_modules`, the pnpm store, Lean and uv caches, root and package build outputs, coverage output, both Temporal download caches, Maven build output, external Maven artifact/wrapper caches, and the optional external BPMN Markdown/figure conversion caches with present/absent status and size. It also reports the observed hashes of cached Temporal platform binaries and verifies an existing Apache Maven `3.8.8` distribution against its known SHA-256. Derived caches may be absent; their owner and regeneration identity remain visible. Required dependency material and selected source evidence may not be absent.

The Maven wrapper pins release `3.8.8` by versioned Maven Central URL, while the tracked wrapper JAR identifies wrapper `3.2.0` and Git pins both files. The known distribution SHA-256 is `2e181515ce8ae14b7a904c40bb4794831f5fd1d9641107a13b916af15af4001a`, but adding the wrapper-enforced checksum is blocked by the pending Receive Task review's runner-tree freeze and must be the first permitted post-review runner infrastructure edit. Node `24.18.0`, pnpm `11.18.0`, Lean `v4.31.0`, Temporal SDK `1.21.0`, Temporal CLI `v1.8.1`, CIB Seven artifacts `2.0.0`/`2.2.0`, and every direct package dependency remain exact in their owning manifests. Java is intentionally a checked Java 21 capability range rather than a vendor-specific binary pin; the doctor reports the resolved home used on the machine.

Targeted diagnostics may override `BPMN_XSD_PATH`, `BPMN_CMOF_PATH`, or `BPMN_MIWG_ROOT`. Those variables select another complete input for the named command; they do not allow the default gate or CI to omit an input.

## Coding-agent startup checklist

1. Read the current checkpoint in [PLAN.md](PLAN.md) and exact implemented/absent boundary in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).
2. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated work.
3. Run `./scripts/doctor.sh verify`. If it reports missing external inputs, run `./scripts/setup-external-sources.sh verify`; if it reports missing workspace packages, install the frozen pnpm lock.
4. Use `./scripts/setup-external-sources.sh all` and `./scripts/doctor.sh all` before a task that depends on any research checkout.
5. Never report a skipped, well-formedness-only, web-substituted, or locally remembered lane as the registered evidence lane. Missing material is an infrastructure failure.
6. Do not add an unregistered checkout, change a revision, or establish a fork without updating [SOURCES.md](SOURCES.md), the lock, license/provenance facts, and the applicable evidence owner in the same reviewed change.

## Why the engine repository has no submodules

Git submodules are useful when every checkout is Git-addressable, belongs inside one repository's worktree, and shares its clone/update lifecycle. This workspace fails all three conditions: the OMG normative corpus is an official download set rather than a Git repository; A12 is license-separated EUPL evidence that must remain outside the MIT project tree; and most large reference checkouts are optional research inputs rather than build or runtime dependencies.

Putting those trees into this repository as submodules would not make the workspace self-contained—the OMG fetch would still be required—and would blur the project's redistribution and dependency boundaries. It would also force ordinary engine contributors to initialize unrelated large research trees. The repository therefore owns reproducibility through an exact lock plus idempotent provisioning and fail-closed diagnosis, while keeping source material outside its worktree.

If repeated onboarding of every research tree later justifies one Git operation, create a separate `bpmn-lean-workspace` meta-repository whose submodules point at the engine and Git-addressable reference repositories. That workspace meta-repository is an optional convenience only: this engine repository must remain independently bootstrappable, CI must continue to use its setup script, and the OMG corpus must still be fetched and hash-verified.

## Fork and source-loss policy

A controlled fork is appropriate when an upstream repository cannot reliably serve a recorded commit, is deleted, or requires a stable organization-owned mirror. Create the fork only when that concrete availability risk occurs. Preserve the upstream URL and commit provenance, record the fork URL and relationship in [SOURCES.md](SOURCES.md), update the lock atomically, verify that the pinned tree is byte-identical, and review the new license/distribution boundary before relying on it.

A fork is not a place to mix instrumentation into the pristine evidence baseline. Reference-source experiments still follow [REFERENCE-INSTRUMENTATION-POLICY.md](REFERENCE-INSTRUMENTATION-POLICY.md) with a separate branch or worktree and shadow comparison. OMG artifacts must not be placed in a new Git repository without explicit owner resolution of their redistribution terms.

## CI contract

Both CI platforms provision the `verify` scope from the repository-owned lock and hash manifest before installing workspace packages and running the full gate. Network availability is part of provisioning, not semantic execution. Once provisioned, verification is fail-closed and offline with respect to those source identities; a missing or mismatched input fails before semantic claims are evaluated.
