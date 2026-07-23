# Reference-engine instrumentation and fast research lanes

## Status

The local CIB Seven and Temporal checkouts are evidence sources and potential experimental substrates. This note permits controlled local instrumentation and acceleration but creates no branch, worktree, patch, dependency, or behavior claim by itself.

The governing rule is:

> Preserve a pinned, unmodified evidence lane. Put every source modification in a separately identified experimental lane and continuously shadow-check its semantic observations against the evidence lane.

An instrumented or reduced-overhead build is never the CIB oracle and never evidence about an unmodified Temporal SDK or Service. It is a research instrument whose correspondence must be measured.

## Why source access matters

Public APIs and black-box traces are the preferred compatibility evidence, but source access can shorten the probe-to-learning cycle when it helps to:

- locate where time is spent across deployment, parsing, persistence, Workflow activation, replay, command production, and cleanup;
- expose internal phase boundaries that are otherwise collapsed into one slow observation;
- attach stable research identifiers to correlated public and internal events;
- create deterministic fault points or schedule controls for experiments;
- batch probes and reuse heavyweight infrastructure;
- test a semantic hypothesis near its actual decision point;
- produce an execution profile that explains why a supposedly small capsule is slow or nondeterministic.

This is diagnostic leverage, not permission to derive the independent Lean model or TypeScript semantic core by transplanting engine algorithms.

## Two lanes

| Lane | Source state | Purpose | Permitted evidence |
|---|---|---|---|
| Pinned evidence lane | Exact recorded upstream revision, clean working tree, recorded build and configuration | CIB black-box oracle runs; unmodified Temporal replay and adapter qualification | Claims about the pinned engine within the declared observation boundary |
| Experimental fast lane | Explicit local branch or worktree based on the pinned revision, with a recorded patch | Profiling, tracing, fault control, batching, startup reduction, and semantic hypothesis testing | Diagnostic findings and candidate scenarios only, until shadow-equivalence is established |

The evidence lane must remain reproducible even when the experimental lane is faster. A source patch must never silently replace the executable named by a profile or result artifact.

## Prefer the least invasive instrument

Use the first sufficient level:

1. Existing public API observations, documented logging, metrics, replay, interceptors, test hooks, Java Flight Recorder, or sampling profilers.
2. Project-owned harness timing, batching, process reuse, controlled clocks, targeted module builds, and cached immutable artifacts.
3. A feature-gated source instrumentation patch that is observational only when disabled.
4. A source modification that changes scheduling, persistence, or execution only as an explicitly labelled surrogate, with mandatory shadow runs.

Level 4 is useful for hypothesis generation but cannot establish compatibility or refinement on its own.

## CIB Seven opportunities

Potential phase and count probes include:

- deployment parse, validation, definition-cache, and start timing;
- command-context entry, transaction commit or rollback, persistence-session flush, and database statement counts;
- Process Virtual Machine atomic-operation and Activity-behavior transitions;
- User Task creation, completion, deletion, and scope cleanup;
- job acquisition, due-time selection, execution, retry, and incident transitions;
- public runtime, task, and history projection query cost;
- fixture deployment and database cleanup cost.

The initial fast lane should first reuse one embedded engine, one H2 database lifecycle, explicit command execution, disabled automatic job acquisition, and targeted tests. Removing transaction, persistence, job, or lifecycle work changes the very behavior being measured and therefore produces only a surrogate engine.

## Temporal opportunities

Prefer official SDK observability boundaries before patching source:

- client, Workflow inbound/outbound, and Activity interceptors;
- Worker and Core metrics;
- Event History export and offline replay;
- deterministic Workflow-safe logging and sinks used only for diagnostics;
- controlled Worker cache and replay tests;
- targeted SDK test suites and a reused local test server.

If those boundaries cannot answer a named question, candidate TypeScript SDK instrumentation points include:

- Workflow Task polling, activation decode, sandbox dispatch, and activation completion;
- handler admission, input queueing, semantic core invocation, and Temporal Command collection;
- replay matching, cache hit or eviction, and nondeterminism reporting;
- Activity scheduling, attempt delivery, completion, cancellation, and result decode;
- payload codec and history serialization cost;
- Continue-As-New handoff and retained-state size.

Server or Core source should be brought into an experiment only when the question is below the SDK boundary. The existing checkouts do not imply that every Temporal component must be forked.

## What may be accelerated

Safe initial acceleration targets are harness overhead:

- reuse compiled artifacts and long-lived engine or Worker processes;
- keep immutable deployments or parsed fixtures cached when the scenario contract permits it;
- batch scenarios while preserving per-scenario isolation and cleanup assertions;
- run only the affected module and retained separating cases in the inner loop;
- defer verbose diagnostics until failure while retaining machine-readable phase timings;
- separate cold-start, warm semantic, and extended-assurance gates.

Removing history writes, transaction boundaries, retries, replay, lifecycle callbacks, persistence flushes, or command ordering may alter semantics. Such a fork must be named a surrogate and cannot replace the shadow baseline regardless of speed.

## Execution-profile contract

Performance diagnostics stay outside canonical semantic observations. A profile should correlate data with stable neutral identifiers such as profile version, model hash, scenario ID, logical command ID, and fault-schedule ID, while retaining runtime IDs only as diagnostics.

Candidate measurements are:

- wall and CPU time for build, startup, deployment, start, wait discovery, command handling, semantic advance, persistence, projection, replay, and cleanup;
- database statements, flushes, and rows touched;
- Workflow activations, Event History events and bytes, emitted Temporal Commands, replayed events, and cache evictions;
- Activity attempts, timers, message deliveries, duplicate suppressions, and Continue-As-New boundaries;
- payload encode/decode counts and bytes;
- peak resident memory and allocation samples where a profiler can collect them without destabilizing the loop.

Timestamps, thread order, internal object IDs, SQL shape, and SDK activation structure do not become semantic profile observations merely because instrumentation exposes them.

## Shadow-equivalence gate

Every semantics-relevant fast-lane change must run the same neutral scenario and controlled stimuli against the pinned evidence lane and experimental lane. Compare:

- canonical observations and command outcomes;
- enabled semantic stimuli and active waits;
- logical time and stable semantic identities;
- declared externally visible retry, history, job, or lifecycle behavior when the active profile includes it.

Internal diagnostic events and performance counters are compared separately.

A retained gate must first detect a deliberately seeded behavior-changing mutation; otherwise a green comparison does not demonstrate that the observer can detect drift. Passing a finite shadow corpus establishes agreement only for that corpus and configuration.

## Branch, worktree, and provenance discipline

When an experiment is started:

1. Verify and record the pristine upstream revision.
2. Create a clearly named local branch or worktree, for example `experiment/bpmn-lean-probe-<question>`.
3. Record the base revision, experimental revision or patch hash, build flags, runtime configuration, exact question, measurements, and shadow scenarios.
4. Keep generated profiles and counterexamples in this project with links to their provenance; do not make absolute local checkout paths part of portable result formats.
5. Rebase or recreate an experiment deliberately when the pinned reference revision changes; never blur results from two bases.
6. Delete or archive an experiment only after its useful probes, scenarios, and conclusions have been transferred into durable project artifacts.

No experimental branch is required now. The first one should be created only when a public hook cannot answer a measured bottleneck or semantic question.

## Relationship to formal techniques

Source instrumentation and formal methods can reinforce each other without being coupled:

- runtime traces can bound a protocol model and reveal the concrete hidden actions that an abstraction mapping must forget;
- a model-checker counterexample can become an executable fault schedule and guide placement of a deterministic source probe;
- shadow comparison can test whether an accelerated surrogate preserves the observations used by a refinement relation;
- an instrumented execution graph can supply a finite labelled transition system for trace, simulation, or bisimulation analysis.

None of these combinations is mandatory. The shortest feedback loop that answers the named question while preserving the evidence boundary wins.
