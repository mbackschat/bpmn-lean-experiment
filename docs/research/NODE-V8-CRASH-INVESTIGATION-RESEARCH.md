# Node and V8 native crash investigation

## Status

Investigated through 2026-10-02. A live debugger capture demonstrates the invalid saved-register mechanism behind one reproduced GC fault. Equivalent private Node `24.18.0` builds validate V8 correction `0b94a9fd`: a deterministic witness faults on the baseline and passes on the candidate, and the candidate passes the complete Temporal package gate. Adopting a corrected runtime remains open. The direct-VM timeout and async-hooks abort have separately demonstrated mechanisms; a private Node correction removes the abort, and both corrections await owner decisions. This is diagnostic research, not an adopted runtime change. The RC owner accepted publishing with the disclosed intermittent qualification risk; final MUE runtime acceptance remains open.

The [project defect ledger](../TEMPORAL-DEFECTS-LEDGER.md) tracks the GC crash, VM initialization timeout and async-hooks abort separately, including attribution, next actions and closure requirements.

## Environment and observed failures

The local runtime is Node `v24.18.0`, V8 `13.6.233.17-node.50`, macOS arm64. A clean-commit `test:pre-push` at `717da4a7` passed Lean and reached the Temporal hosted lane, then its `repeatable-subscription-pipeline.temporal-test.ts` child crashed. The command receipt is `/tmp/mue-ci-repair-pre-push` (exit 1); macOS report `node-2026-09-28-044202.ips` has SHA-256 `6c3ca61fcde2570ea42aa5382df0cf1b65b0f5ea92bd77eee1014f4683e6a074`. The crash is `EXC_BAD_ACCESS/SIGSEGV` at `0xe`; the triggered stack enters `ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers`, `InternalFrame::Iterate`, mark-compact collection, `Runtime_StackGuardWithGap`, and `Builtins_BaselineOutOfLinePrologue`. The Node test runner reports a failed child file rather than a TypeScript assertion failure. Earlier subscription/VM native failures and the historical Sparkplug suppression are retained in [the cost ledger](../capsule-costs/COMPENSATION-AND-FAILED-PROCESS-LEDGER.md#public-compensation-registration-2026-09-24).

An independent diagnostic command, `node --stress-compaction --max-old-space-size=192 --test --test-concurrency=2 --test-reporter=spec packages/temporal-adapter/testkit/test/repeatable-subscription-temporal.test.ts packages/temporal-adapter/testkit/test/oversized-command-ingress.test.ts`, reproduced a child crash after 11 passing checks. Receipt `/tmp/mue-v8-focused-collection` exits 1; report `node-2026-09-28-050628.ips`, SHA-256 `b9fd82f769fcffe11f9d1867b3cc1881ccda1a60799cd38463ebda1c07bed657`, again faults at `0xe` in the same V8 root visitor and baseline prologue. The stressed run is a diagnostic discriminator, not release evidence or a production setting. The distinct test file and same native failure class argue against a single BPMN test assertion as the explanation; they do not identify the instruction that first produced the invalid stack slot.

The ordinary serial Temporal lane at `0b47c750` reproduced the native failure without diagnostic GC flags: `/tmp/mue-rc-temporal-serial-isolation-20260928` exited 1 after `workflow-chain-publication-segments.temporal-serial-test.ts` passed, when the `workflow-chain-recovery-capacity.temporal-serial-test.ts` child exited without an assertion. The matching macOS report `node-2026-09-28-132512.ips`, SHA-256 `480a7a4817c4a37bdda4700378256ad470d14b4f76558edb9d1b410d3086cff8`, records `EXC_BAD_ACCESS/SIGSEGV` at `0xe` in the same V8 root visitor, mark-compact collection and baseline prologue. This is a second distinct ordinary test file with the same native signature; it does not establish the source of the invalid stack slot. An earlier clean-commit gate at the same target had instead returned `unavailable` from a final publication query; that assertion passed alone and in this serial run, so its cause remains separate and unproven.

A separate 2026-09-24 report, `node-2026-09-24-182812.ips`, SHA-256 `aa2efd8824d486be874e781bb7b3a8fa48c1f4bb422a249314f3f171deecd69a`, records `SIGABRT` at `node::InternalCallbackScope::Close` and an `execution_async_id` assertion. A small diagnostic using `vm.runInContext` with a timeout, Promise/`AsyncLocalStorage` work, and async hooks can reproduce this callback failure. The adapter's direct-VM harness has an execution timeout, making this worth investigating, but the diagnostic does not prove that a production Worker follows that path. This abort must not be counted as another instance of the `0xe` GC fault.

### 2026-09-30 documentation checkpoint recurrence

At clean commit `6dc643d3`, `./scripts/pnpm.sh run test:pre-push` passed the 611 infrastructure checks, Lean checks, semantic-core and importer tests, and CIB/comparator checks before failing in the concurrent Temporal testkit lane. Receipt `/tmp/bpmn-readme-audience-6dc643d3-pre-push-host` retains exit 1 and the exact command. The selected test command was `node --test --test-concurrency=4 packages/temporal-adapter/testkit/test/*.test.ts`; its summary reports 358 passing checks and two failures. This commit changed only documentation, so the failure does not demonstrate a runtime regression introduced by that change.

The `temporal-adapter.test.ts` child failed without a reported TypeScript assertion. The matching macOS report `node-2026-09-30-035021.ips` captures PID `30735` at `2026-09-30 03:50:06.7227 +0200` and has SHA-256 `f6050158d2f6dce30596559a491cc540dc79fa5e7016ac646d95fea8653159de`. It records `EXC_BAD_ACCESS/SIGSEGV` at `0xe`, the same root visitor and mark-compact stack, and `Builtins_BaselineOutOfLinePrologue`. The environment remains Node `v24.18.0`, V8 `13.6.233.17-node.50`, macOS arm64, without diagnostic GC or compiler-suppression flags. This confirms recurrence of the observed native failure class; it does not establish its originating instruction or a corrective patch.

Separately, `repeatable-subscription-temporal.test.ts` failed its initialization assertion when the SDK VM returned `Script execution timed out after 1000ms`. The [direct-VM harness](../../packages/temporal-adapter/testkit/test/direct-vm-activation-harness.ts) supplies that one-second execution limit. Host load measured after completion was `11.88`, but that observation does not prove contention caused the timeout or connect it to the native crash. The timeout's cause and the smallest independently failing pair remain unresolved. No flags, deadlines, concurrency settings, dependencies, or test coverage were changed; the failed gate remains failed under the existing RC publication exception.

The clean security-correction commit `811ce35a` reproduced the native fault twice under the ordinary concurrent Temporal testkit command on 2026-09-30. Receipt `/tmp/bpmn-security-811ce35a-pre-push` exits 1 after the shared security audit, 612 infrastructure checks, Lean and preceding Product 1 lanes passed; the Temporal testkit reports 355 passes and two failed child files. `oversized-command-ingress.test.ts` matches report `node-2026-09-30-133513.ips` (SHA-256 `01cd1a8867db5e9d330fc89b419c347fd860302ace887b8efb574bce9dd6f92a`), and `repeatable-subscription-temporal.test.ts` matches `node-2026-09-30-133527.ips` (SHA-256 `ec31ef964c855e5edcd70ba9cb9e186d7e54582766aeaacc1c378b776045b573`). Both record `EXC_BAD_ACCESS/SIGSEGV` at `0xe` in `ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers`, `InternalFrame::Iterate` and mark-compact root scanning. No diagnostic compiler or GC flags were used. This is further recurrence evidence, not a cause or correction; the complete pre-push qualification remains failed.

## Mechanism assessment

The direct failure boundary is native V8 stack-root scanning during collection, below the BPMN semantic core. [Node issue #62393](https://github.com/nodejs/node/issues/62393) reports the same near-null fault, root-visitor frames and baseline-prologue frame on macOS arm64 with VM workloads. [V8 change 0b94a9f](https://github.com/v8/v8/commit/0b94a9fd23ba5f59b3f675fb04d60a9b0102e27d) corrects a baseline prologue that saves an unused dispatch-handle register on non-sandbox builds with leaptiering. The source and live stack investigation below now connects that mechanism to this Node binary and a captured project crash. It does not establish that every historical native failure has this cause; the [corrected-build validation](#2026-10-01-corrected-build-validation) tests the correction in rebuilt runtimes. The async-hook abort has a [separate Node mechanism](#2026-10-01-direct-vm-timeout-and-async-hooks-abort-mechanisms).

The earlier `--no-sparkplug` setting removed one observed baseline path and let a concurrent test lane pass; it was symptom suppression, not a demonstrated repair. The owner rejected that workaround. `--no-sparkplug` and `--no-parallel-scavenge` were removed from maintained Temporal test commands. With ordinary V8 settings, `./scripts/pnpm.sh run test:temporal:built` passed all 818 checks once (`/tmp/mue-temporal-unsuppressed-complete`, exit 0). This single pass establishes that the package can pass with those settings; it cannot establish that the intermittent native crash is gone. A transient Transaction-publication failure in earlier diagnosis later passed focused reruns and the package gate; no stable cause was demonstrated, so it is not folded into either native crash explanation.

### 2026-10-01 source, binary and live stack evidence

The exact [Node `v24.18.0` ARM64 source](https://github.com/nodejs/node/blob/20da4aeadabc5b0a01e3fcf520f91df8285c68a2/deps/v8/src/builtins/arm64/builtins-arm64.cc) still chooses the saved register using `V8_ENABLE_LEAPTIERING_BOOL`; the upstream correction instead uses `V8_JS_LINKAGE_INCLUDES_DISPATCH_HANDLE_BOOL`. The same revision's [linkage definitions](https://github.com/nodejs/node/blob/20da4aeadabc5b0a01e3fcf520f91df8285c68a2/deps/v8/src/common/globals.h) exclude the dispatch handle when the V8 sandbox is disabled. The installed runtime reports `v8_enable_sandbox: 0`. Its executable SHA-256 is `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a`. LLDB disassembly confirms that `Builtins_BaselineOutOfLinePrologue+92` pushes `x3, x4` into the internal frame before calling `Runtime_StackGuardWithGap`; the saved `x4` slot is at frame pointer minus 24 bytes. Thus the suspect instruction is present in the actual binary, not merely an upstream source version.

Receipt `/tmp/mue-vm-initialization-profile` ran the repeatable-subscription and oversized-ingress files with concurrency two, the released SDK and ordinary V8 flags, adding only a process-local timing wrapper around `vm.runInContext`. After 11 passing checks the subscription child crashed; report `node-2026-10-01-104305.ips`, PID `6127`, SHA-256 `98ad6633e7c1f5ba118d1714872848760b44090a27a2edbac322acd59523dd7e`, records the same `0xe` fault. Its stack additionally identifies `Builtins_SortCompareUserFn` below the baseline prologue. No VM timeout was logged before the crash; the last emitted activation timing was 122.4 milliseconds against the unchanged one-second deadline. The crashed child's exit-time timing summary was not written, so this does not provide a complete initialization profile or close the timeout investigation.

The mechanism predicts that a failing root slot will equal the baseline frame pointer minus 24 and contain the unused saved `x4` value. `/tmp/mue-v8-live-stack-stress` tests that prediction using the same two files under LLDB, `--stress-compaction --max-old-space-size=192`, and `--test-isolation=none` so the debugger owns the test process. It stops at `EXC_BAD_ACCESS`, address `0xe`. The root visitor's `x8` contains `0x0f`, and its failing instruction is `ldur x9, [x8, #-0x1]`. The scanned slot is `0x16d4eb1c8`; unwinding to the baseline prologue gives frame pointer `0x16d4eb1e0`, exactly 24 bytes higher. Memory at that slot contains `0x0f`. This demonstrates the invalid saved-register mechanism for the captured crash and violates V8's invariant that this internal-frame slot must contain a valid tagged root or small integer. It supports attribution to V8's prologue generation rather than BPMN semantics. The debugger command exits zero after explicitly killing the stopped process; that is a successful capture, not a passing test run. `/tmp/mue-v8-source-check/stack-verdict.json` records the independently checked address arithmetic.

Negative diagnostics remain informative but unqualified: two pure-Node VM allocation probes without native addons completed without this fault, including a sort-callback variant; an earlier oversized synthetic activation hit its own one-second timeout. The ordinary-setting LLDB run completed all 14 checks, then its capture script failed because there was no stopped process. These outcomes do not repair or exclude the native defect. No compiler/GC feature was suppressed, no dependency was replaced, and production deadlines and concurrency remain unchanged.

The exact sources, binary disassembly, crash report, probe scripts and debugger receipts are retained locally under `/tmp/mue-v8-source-check` and their named receipt directories. Ignored archive `.cache/mue-runtime-investigation-20261001.tar.gz` retains those files, the focused Core product receipts and Transaction capture inputs with a per-file manifest; its SHA-256 is `9ac51f6f27bdccdb6db9569ed8dcf402f897637203cbc5e03803dd2a76f6871c`. This evidence-only increment is non-material under the cold-review gate: it changes no runtime contract or adopted dependency, and the documentation/infrastructure guards cover its retained claims.

### Private source-build validation

The owner authorized equivalent private Node builds on 2026-10-01. The official `node-v24.18.0.tar.xz` source archive matches its published SHA-256 `e94afde24db08e0c564ee7110a2d5aab51ee0059382c9fd8233c54eec47b28f9`; its ARM64 prologue and linkage-definition files match the immutable source inputs above. The isolated source directory is `/tmp/mue-private-node/node-v24.18.0`, configured for arm64 macOS with full ICU, the installed Apple Clang 21 toolchain and Python 3.12. No installed runtime or project pin is replaced.

The private native-build budget is a measured exception to the ordinary two-minute package-build budget. A two-job, 120-second calibration retained partial object outputs and stopped at its deadline; `/tmp/mue-node-build-calibration` retains the failed command rather than a build-success claim. The generated Node target plans 4,230 object compilations, so this cold native build is substantially larger than a package build. Each build invocation has a one-hour outer ceiling with progress monitoring; this is a diagnostic build allowance, not a changed test deadline. The cold baseline needed three invocations because make resumes from completed objects: `/tmp/mue-node-baseline-build` was stopped for the session handoff (exit 143), `/tmp/mue-node-baseline-build-resumed` reached the ceiling at 4,108 objects (exit 124), and `/tmp/mue-node-baseline-build-resumed-2` completed in eight minutes (exit 0, asserted). `/tmp/mue-private-node/build-provenance.json` retains the measurements, exact source/configuration and artifact provenance.

### 2026-10-01 corrected-build validation

**Equivalence.** The private baseline executable has SHA-256 `f68ec3ab188189981d40fdf971138d43f6e0e5fc8dcd2cccce4c047f95f7e039` and UUID `081CDD3B-04BB-312D-9A23-7388D3F06D71`. All 34 instructions of its `Builtins_BaselineOutOfLinePrologue` match the installed release binary apart from absolute addresses, including `stp x3, x4` at `+92`. Every `v8_*` build variable equals the release configuration; the only differing scalar variables are the compiler versions (release LLVM/Xcode 16, private Apple Clang 21). V8 generates this builtin with its own macro assembler, so the compiler difference does not reach the compared instructions.

**Backport.** The unmodified upstream patch, retained as [`v8-0b94a9fd.patch`](../experiments/node-runtime-corrections/v8-0b94a9fd.patch), `https://github.com/v8/v8/commit/0b94a9fd23ba5f59b3f675fb04d60a9b0102e27d.patch` (SHA-256 `edf7074cbc79b3667b1cbf73978dbaef14c541e0fa763c721e6e7508785bc18a`) applies to `deps/v8` with `git apply --directory=deps/v8` and only line offsets. The applied diff touches the same ten files with the same 46 additions and 23 deletions as upstream; its SHA-256 is `5bb839eb7215c10b7cde9c05c2967cc1aa0f528729f0d61e06b5a283f39738db`. Only the two ARM64 files are compiled for this target. The incremental candidate build `/tmp/mue-node-candidate-build` (exit 0, asserted, 85 seconds) recompiled them, regenerated the V8 and Node snapshots and relinked. The candidate executable has SHA-256 `1cd8ecf5bea7142d4f73806a94603f515b760cab633f5dfee112c05d5e750906` and UUID `36B63F33-B711-3235-8DAB-F9DE43BD3A0E`. Its prologue differs from the baseline only at `+92` and `+116`, which save and restore `x3, xzr` instead of `x3, x4`. The private artifacts and the upstream patch stay outside the repository; neither is a project dependency or distribution artifact.

**Deterministic separating witness.** The defect requires a dead `x4` value that is not a valid tagged root while a GC runs inside the baseline prologue's stack-guard call. Natural register contents make that rare. The witness makes it deterministic. It compiles a function with Sparkplug, requests a GC at the next stack check before each call, and runs under LLDB. LLDB writes `0xf` into `x4` at the prologue's slow-path label (`+76`, the `b.lo` target) and continues. `x4` carries no JavaScript-linkage value in this non-sandbox configuration, so the injection models arbitrary caller state without changing program meaning.

```js
function callee(value) { return value + 1; }
%CompileBaseline(callee);
if (!%ActiveTierIsSparkplug(callee)) throw new Error('callee is not running Sparkplug code');
let sum = 0;
for (let i = 0; i < 64; i++) { %ScheduleGCInStackCheck(); sum = callee(sum); }
if (sum !== 64) throw new Error('unexpected sum ' + sum);
```

The run uses `node --allow-natives-syntax --expose-gc`, with an LLDB breakpoint at `Builtins_BaselineOutOfLinePrologue` address slide 76 whose commands are `register write x4 0xf` and `continue`. Without `--expose-gc` the installed runtime's fatal-error trace confirms the routing: `Runtime_StackGuardWithGap` called from `Builtins_BaselineOutOfLinePrologue` in `callee`. A parser of the LLDB log classifies each run. The witness, LLDB commands, driver and classifier are reproduced under [retained diagnostic sources](#retained-diagnostic-sources).

| Binary | Injected `x4` | Result |
|---|---|---|
| Installed release | none | completes, exit 0 |
| Installed release | `0xf` | `EXC_BAD_ACCESS` at `0xe` in `ClearStaleLeftTrimmedPointerVisitor` under `InternalFrame::Iterate` and mark-compact root marking |
| Private baseline | none | completes, exit 0 |
| Private baseline | `0xf` | same `0xe` root-visitor fault after 3 injections |
| Candidate | none | completes, exit 0 |
| Candidate | `0xf` | completes after 66 injections, exit 0 |

Thus the injected value reaches the GC root set only through the baseline's `x4` save, and the correction removes that path. The installed and private baselines both reproduce the production crash signature, so the private build is a faithful baseline for this defect.

**Captured workload with ordinary settings.** The same injection, driven by `run-workload-inject.sh` from the [retained sources](#retained-diagnostic-sources), was applied to the captured repeatable-subscription and oversized-ingress files under LLDB, using the released SDK, `--test --test-isolation=none` and ordinary V8 flags. The baseline faulted at `0xe` in `InternalFrame::Iterate` after 606 injections and six passing checks (`/tmp/mue-v8-workload-inject-baseline`). The 600-second debugger bound then expired during symbolicated teardown. The candidate passed all 14 checks after 2,452 injections and exited zero in 76 seconds (`/tmp/mue-v8-workload-inject-candidate`). This shows the corrected runtime keeps the product workload's behavior while the faulty register path is exercised continuously.

**Unforced stress comparison.** Six alternating rounds per binary of the earlier stress command (`--stress-compaction --max-old-space-size=192 --test --test-concurrency=2`, receipts under `/tmp/mue-v8-stress-compare`) produced no `0xe` fault on either binary. That workload had faulted on the installed binary in its single calibration run (`/tmp/mue-v8-stress-installed-1`, report `node-2026-10-01-130855.ips`, SHA-256 `e214fe5e3a10f38641b908d8249f83059d82abe3b42267142553f5059ac33423`). At this base rate the unforced comparison does not separate the builds and is not repair evidence. Every assertion failure in it, on both binaries, was `Script execution timed out after 1000ms` from the oversized-ingress direct-VM harness under stress compaction. Those failures are diagnostic-setting observations and do not by themselves explain TD-004.

**Async-hooks abort in a real test child.** In baseline round 3 the oversized-ingress child aborted with `Assertion failed: (env_->execution_async_id()) == (0)` in `node::InternalCallbackScope::Close`, reached from `Environment::CheckImmediate` (report `node-2026-10-01-141649.ips`, PID 63020). Its preceding test had just failed with the direct-VM execution timeout. This is the first observation of the TD-005 signature inside a project test child rather than the standalone diagnostic. It connects that abort to the timed direct-VM harness path but does not demonstrate its mechanism or any production-Worker relevance. The V8 correction does not touch this path, and the summary reported 11 of 14 checks after the abort.

**Ordinary product gate.** `env PATH=/tmp/mue-private-node/artifacts/candidate/bin:$PATH CI=true ./scripts/pnpm.sh run test:temporal` passed at `a47099cb` (`/tmp/mue-node-candidate-test-temporal`, exit 0, asserted, 14:35:31–14:42:55). Process inspection confirmed the candidate executable. The component, concurrent testkit, hosted and serial lanes passed 404, 363, 25 and 26 checks, 818 in total, with no new crash report. The clean-commit Product 1 workflow equivalent, `test:pre-push:verify`, then passed on the candidate at committed target `46752ec7` (`dirty: false`; `/tmp/mue-node-candidate-pre-push-verify`, exit 0, asserted, 14:48:09–15:01:03). That workflow had failed with this native fault at `811ce35a`. Its infrastructure, Lean, semantic-core, importer, comparator, pipeline and all four Temporal lanes passed with no new crash report. One pass of each cannot show that an intermittent crash is gone. It does show that the corrected runtime passes the unchanged Temporal package gate under ordinary settings, while the deterministic witness carries the causal claim.

The witness script, LLDB command file, log classifiers and every receipt named here are retained under `/tmp/mue-v8-witness` and the named receipt directories. The ignored local archive `.cache/mue-node-v8-validation-20261001.tar.gz` also retains both private executables, the patch and applied diff, build provenance, the two crash reports and a per-file SHA-256 manifest. The archive's SHA-256 is `01887e0081e275431c7ffcbb91de46f961ca99dfdc49f6d6eb0241501ac9b993`. This evidence-only increment changes no runtime contract, project pin or adopted dependency, so it is non-material under the cold-review gate.

### 2026-10-01 direct-VM timeout and async-hooks abort mechanisms

These runs used the V8-corrected candidate so that TD-003 could not confound them. A process-local preload timed each SDK `vm.runInContext` call and attributed overlapping main-thread GC pauses from `PerformanceObserver` `gc` entries. No test, deadline or dependency changed. The GC-attribution preload, synchronous timeout log, retention probe and summary are reproduced under [retained diagnostic sources](#retained-diagnostic-sources). Run evidence is under `/tmp/mue-td004`.

**Deadline provenance.** The [direct-VM harness](../../packages/temporal-adapter/testkit/test/direct-vm-activation-harness.ts) passed `1_000` milliseconds to `VMWorkflowCreator.create`. The pinned `@temporalio/worker` `1.21.0` defaults `isolateExecutionTimeout` to `5s`, and no project Worker overrides it. The harness limit was therefore five times stricter than the production Worker it emulates. The SDK enforces it with Node's wall-clock `vm` watchdog.

**Activation time is GC-dominated and stretches under CPU starvation.** All runs used the concurrent testkit lane (`--test-concurrency=4`) with ordinary flags.

| Condition | Timed calls | Slowest activation | Main-thread GC in it | Timeouts |
|---|---|---|---|---|
| Quiet host | 2,083 | 224 ms | 160 ms | 0 |
| 8 bounded spinners on 8 cores | 2,083 | 601 ms | not attributed | 0 |
| 16 bounded spinners | 2,082 | 847 ms | 552 ms, against about 270 ms process CPU | 0 |
| 32 spinners, three-file subset, three rounds | not summarized | over 1,000 ms | not attributed | 1, 2 and 1 |

Under diagnostic stress compaction, GC accounted for 71–97 percent of each timed-out call's wall time. Forced GCs after each of 70 Workflow VM disposals in the repeatable-subscription file retained a flat 85–91 MB with zero detached contexts, so the growing pauses do not come from Workflow VM retention. An earlier 32-spinner summary showed no timeout only because its aborting child never wrote its exit-time record. A synchronous per-event log replaced it.

**TD-004 mechanism.** An activation needs about 250 ms of CPU, but its wall time includes main-thread GC pauses and descheduled intervals, and both grow when the host is oversubscribed. The harness's one-second watchdog then terminates an otherwise correct activation. The failure measures host scheduling against a deadline stricter than the production default; it does not show slow BPMN or SDK work.

**Harness deadline correction.** On the owner's decision, the harness now passes the execution timeout that the installed SDK's `compileWorkerOptions` produces for a Worker that leaves it unset: 5,000 ms for `@temporalio/worker` `1.21.0`. A [harness test](../../packages/temporal-adapter/testkit/test/direct-vm-activation-harness.test.ts) loads a hand-written bundle whose initialization spins for 1.5 s of wall time; it timed out under the one-second limit and completes under the derived one. On the same V8-corrected candidate, with 32 bounded spinners and the same three-file subset, three rounds each passed 22 of 22 tests and logged no VM timeout, and every child exited normally (`/tmp/mue-td004/receipt-deadline-fixed-1` to `-3`, asserted). The one-second rounds under the same load had 1, 2 and 1 failures. With the creation cleanup also corrected, the complete `test:temporal` lane passes 820 of 820 at `2eae85c0` on the V8-corrected candidate (`/tmp/mue-td004-test-temporal-candidate`, asserted).

**TD-005 mechanism.** Node's `ContextifyScript::EvalMachine` runs a `microtaskMode: 'afterEvaluate'` context's microtask checkpoint inside the watchdog scope. A termination can interrupt a promise job after its async-hook `before` callback has pushed an async context but before `after` pops it. `CancelTerminateExecution` then returns with the async-id stack deeper than at entry. The next top-level `InternalCallbackScope::Close` aborts with `execution_async_id() == 0` or `async hook stack has become corrupted`. The Temporal SDK creates exactly such contexts. Node's test runner arms the check by enabling an `async_hooks` hook in every test process (`lib/internal/test_runner/harness.js` at the exact `v24.18.0` source). Plain Node and the SDK's V8 promise hooks alone do not arm it.

```js
const vm = require('node:vm');
const ctx = vm.createContext({}, { microtaskMode: 'afterEvaluate' });
require('node:test').test('vm timeout', () => {
  try { vm.runInContext('Promise.resolve().then(()=>{while(1){}})', ctx, { timeout: 5 }); } catch {}
});
```

The retained `async-stack-timeout-repro.cjs` [listing](#retained-diagnostic-sources) runs this with `MODE=node-test`. Under `node --test` it aborts in 3 of 3 runs on the installed `v24.18.0`, the V8-corrected candidate, official `v24.21.0` LTS and official `v26.10.0`; the newest two were downloaded from nodejs.org and their published SHA-256 sums were checked. It matches the older [Node issue 38503](https://github.com/nodejs/node/issues/38503) and [Temporal TypeScript SDK issue 939](https://github.com/temporalio/sdk-typescript/issues/939), neither of which records a fix. In three contended product rounds, each aborted `managed-wait-host-wakeup` child had logged a direct-VM `activate` timeout of 1,001–1,040 ms and then no exit. Not every timeout aborts: a repeatable-subscription child timed out and failed normally.

**Private Node correction.** The patch records the async-id stack length on entry to `EvalMachine`. After `CancelTerminateExecution` for this invocation's watchdog or SIGINT, it pops contexts back to that length with the existing `pop_async_context`. Outer contexts, including those of an enclosing timed evaluation, remain intact. The retained [Node patch](../experiments/node-runtime-corrections/node-contextify-async-stack.patch) applies with `git apply` to the pristine source and adds ten lines to `src/node_contextify.cc` on top of the V8 candidate tree. `/tmp/mue-node-candidate2-build` (exit 0, asserted) produced the executable with SHA-256 `2ce7564c4ff8b820e27dce0938beb9be1bc4bdbafabdd5e39fcf34cb8e75b650` and UUID `2AD803DC-07A1-361C-B395-C8EBE992079B`.

| Check | V8-only candidate | V8 + Node candidate |
|---|---|---|
| Reproducer under `node --test`, and with an explicit `async_hooks` hook, three runs each | abort every run | survives every run, timeout still thrown |
| Caller `executionAsyncId`, `AsyncLocalStorage` store and later microtasks after a timeout ([check](#retained-diagnostic-sources)) | abort | all preserved |
| Contended three-file rounds | abort in 3 of 3 rounds | no abort in 3 rounds; every child exits; failures equal the 1, 3 and 1 logged timeouts |
| Node `tools/test.py` vm, async-hooks and AsyncLocalStorage selection | not run | 241 of 241 pass (`/tmp/mue-node-td005-node-suite-2`) |
| `test:temporal` | 818 of 818 | 818 of 818 (`/tmp/mue-node-candidate-td005-test-temporal`) |

During the Node suite, report `node-2026-10-01-153439.ips` records `node::Abort` called from JavaScript. The selection contains intentional-abort tests and reported success, so the report is expected test output. The correction removes the abort; it does not prevent TD-004's timeout, which still fails the affected test. Production relevance remains unproven. A production Worker uses the five-second default and is not a test-runner process, so an abort there needs both a terminated activation and some component that arms async-hook checks.

The ignored local archive `.cache/mue-td004-td005-investigation-20261001.tar.gz` (SHA-256 `ad5254abdcf57f76f379e372c6012a4dd1207ee32b30319dff08644aadcbb355`) retains the preloads, timing records, receipts, Node patch, TD-005 executable, release checksums and a 453-file SHA-256 manifest.

**Upstream report.** The defect was reported as [Node issue 66439](https://github.com/nodejs/node/issues/66439) on 2026-10-01; the owner had approved the report only for joint review, and filing it unreviewed is [process finding 74](../PROCESS-ASSESSMENT-LEDGER.md#finding-74). The issue was filed with a ten-line reproducer that arms the check through an explicit `async_hooks` hook rather than the test runner. Before filing, the reproducer exited with status 1 and `async hook stack has become corrupted (actual: 3, expected: 1)` in 3 of 3 runs on installed `v24.18.0`, official `v24.21.0`, official `v26.10.0` and the `main` nightly `v27.0.0-nightly20261001cede7e6740`. The nightly's darwin-arm64 archive matched its published SHA-256 sum. Without the hook the nightly survives, and the V8 + Node candidate survives with it. The retained Node patch applies to `main` revision `cede7e6740` with a 12-line offset. [Issue 38503](https://github.com/nodejs/node/issues/38503), which analysed the same mechanism, was closed in July 2026 by commit `4f844f4` (`repl: use inspector over vm`). That commit removed the REPL trigger, not the `vm` defect. [Temporal TypeScript SDK issue 939](https://github.com/temporalio/sdk-typescript/issues/939) is still open and reports the same message from a Worker on a Workflow Task timeout under Node 16.

**Concurrent observation.** One 16-spinner round on the released SDK failed `execution publication Query returned unavailable`. That matches TD-001's symptom; it was not diagnosed and is not attributed here.

**Official releases.** The same witness classifies the newest official darwin-arm64 releases, whose published SHA-256 sums were checked. Node `v24.21.0` LTS (V8 `13.6.233.17-node.53`) still saves `x3, x4` at `+92` and faults at `0xe` after 2 injections. Node `v26.10.0` (V8 `14.6.202.34-node.34`) saves `x3, xzr` and completes after 65 injections. Both are non-sandbox builds. No official v24 release checked so far contains the correction, so adopting one without a private build means a major-version runtime change. Evidence is in `/tmp/mue-v8-witness/v24.21.0-inject` and `/tmp/mue-v8-witness/v26.10.0-inject`.

### 2026-10-02 production Worker hook control

The next question was whether the actual production BPMN Worker arms the hooks needed by TD-005, independently of Node's test runner. A process-local diagnostic reads each Workflow thread's native async-hook fields immediately before SDK activation. `kTotals` selects the callback-scope abort checks in Node `v24.18.0` `src/api/callback.cc`; `kCheck == 1` is present even when no hook is enabled. The earlier SDK-only control and its rejected zero-for-both assertion are retained in the [Temporal investigation](TEMPORAL-EXECUTION-RESEARCH.md#legacy-query-pending-input-clock-investigation).

At `1a8b85c3`, `/tmp/mue-production-bpmn-hooks-addressed-20261002` passes through the production `ExternalTemporalRuntime.initializeFreshNamespace` factory and its exact compiled BPMN bundle. The witness initializes the versioned Worker, starts the registered empty Transaction, withdraws its reservation, completes acknowledgement and checks the completed terminal receipt. Five activations in the ordinary Workflow thread observe `kTotals == 0`, `kCheck == 1`. No `node:test`, termination, stress, changed Worker deadline or performance assertion is used. The process selects the approved V8-corrected Node and combined private Core bridge; installed dependencies remain unchanged. Earlier diagnostic import/address setup failures are retained separately and establish no product failure.

This is evidence that the witnessed production factory and journey do not arm TD-005's hook gate. It does not exclude external instrumentation, explicit hooks, another runtime/configuration, an unobserved workload or the Linux distribution; no general production-path exclusion or closure is claimed. The private Node correction and upstream adoption remain open. The ignored archive `.cache/mue-production-hooks-evidence-20261002.tar.gz`, SHA-256 `38972ee78b15594ce1cb2046b88c8a60cd0d2aad8ec82a81569eab4ce6bdfd90`, retains the diagnostic sources, exact production-factory source, counter facts, successful and failed receipts, configuration and manifest. The successful receipt was read and separately asserted.

### 2026-10-01 recurrences after the harness correction

**Recurrences on the installed runtime.** After the TD-004 harness correction, the installed `v24.18.0` crashed three times in ordinary runs: once in a focused direct-VM selection, and twice in the concurrent part of `test:temporal` at `2ecbe7f6`, where 759 of 761 tests passed before the lane stopped (`/tmp/mue-td004-test-temporal`). Every report records `SIGSEGV` at `0xe` in `ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers` called from `InternalFrame::Iterate`, the TD-003 signature.

**The harness change does not cause the crashes.** The comparison alternated runtime and harness revision for the two crashing files under `--test-concurrency=4`. The V8-corrected candidate differs from the stock build only in the prologue's saved register pair.

| Runtime and harness | Rounds | Rounds with a TD-003 crash |
|---|---|---|
| Installed `v24.18.0`, harness before `79eb1f71` | 30 | 8 |
| Installed `v24.18.0`, corrected harness | 30 | 7 |
| V8-corrected candidate, corrected harness | 20 | 0 |

All 13 crash reports from the 20-round arm have the TD-003 signature. The crash rate does not depend on the harness revision, and the crashes disappear when only the prologue register changes. Today's rate on the installed runtime is much higher than in the earlier unforced stress comparison, which recorded no fault; the cause of that variation is not established. The drivers, outputs and crash reports are under `/tmp/mue-td004` (`ab.sh`, `ab2.sh`, `ab.out`, `ab2.out`, `ab2-node-*.ips`).

**Linux release prologues.** The official linux-arm64 and linux-x64 archives of `v24.18.0` and `v26.10.0` matched their published SHA-256 sums. A static disassembly of `Builtins_BaselineOutOfLinePrologue` locates the slow path that saves registers into the INTERNAL frame before `Runtime::kStackGuardWithGap`. On linux-arm64, `v24.18.0` stores `stp x3, x4` (word `0xa9bf13e3`) and `v26.10.0` stores `stp x3, xzr` (`0xa9bf7fe3`), matching the darwin builds. On linux-x64, `v24.18.0` pushes and pops the unused dispatch-handle register `%r15` around the call, and `v26.10.0` omits both, which is the x64 hunk of `0b94a9fd`. This is static evidence only; the separating witness has not run on Linux. Disassemblies are in `/tmp/mue-node26-linux`.

## Remaining discriminator and release boundary

The causal V8 correction is demonstrated for the reproduced `0xe` failure class on macOS arm64; it is not adopted. Closing TD-003 requires a runtime containing `0b94a9fd`, or an equivalent fix, to become the project's pinned Node through the dependency-adoption decision and to pass the applicable product and distribution gates on that exact artifact. Upstream issue 62393 includes conflicting reports about newer Node lines, so a version change counts only after its prologue disassembly and the separating witness have been checked. A private source build is not a distributable runtime. The Linux and distribution images need their own check, because their Node binaries come from different build pipelines. The [direct-VM timeout and async-hooks mechanisms](#2026-10-01-direct-vm-timeout-and-async-hooks-abort-mechanisms) are separate from TD-003 and need their own decisions. [The plan](../PLAN.md#current-evidence) owns current qualification status; this note owns the investigation and its uncertainty.

## Retained diagnostic sources

All listings except `run-workload-inject.sh` are byte-identical to the files that produced the evidence above; `async-stack-timeout-repro.cjs` was run as `timeout-variants.cjs`. `run-workload-inject.sh` generalizes the hard-coded driver used for `/tmp/mue-v8-workload-inject-*` to take the executable and bound as arguments. Rerun from an extracted copy against the V8 candidate, it reproduced the result: 2,409 injections and 14 of 14 checks passing. Before the listings moved here, the witness driver, reproducer and context check reproduced their separating verdicts from repository copies. They are kept as Markdown listings because the repository admits no hand-written JavaScript module, and the V8 witness's natives syntax is not TypeScript. The [upstream V8 patch](../experiments/node-runtime-corrections/v8-0b94a9fd.patch) and the project's [Node correction](../experiments/node-runtime-corrections/node-contextify-async-stack.patch) are retained as files. To run a listing, save it under its heading name, keeping each group's files in one directory. They are diagnostics, not product code, gates or dependencies.

### V8 prologue witness

#### `stack-check-gc.js`

V8 separating witness; run with `--allow-natives-syntax --expose-gc`.

```js
// Separating witness for V8 0b94a9fd: a GC requested at a Sparkplug
// out-of-line prologue stack check scans the INTERNAL frame that saves x4.
// Run with --allow-natives-syntax --sparkplug under stack-check-gc.lldb.
function callee(value) {
  return value + 1;
}
%CompileBaseline(callee);
if (!%ActiveTierIsSparkplug(callee)) {
  throw new Error('callee is not running Sparkplug code');
}
let sum = 0;
for (let i = 0; i < 64; i++) {
  %ScheduleGCInStackCheck();
  sum = callee(sum);
}
if (sum !== 64) throw new Error('unexpected sum ' + sum);
console.log('stack-check-gc witness completed');
```

#### `stack-check-gc.lldb`

LLDB commands writing an invalid `x4` at the slow-path label.

```text
settings set target.disable-aslr false
settings set auto-confirm true
disassemble --name Builtins_BaselineOutOfLinePrologue --count 34
breakpoint set --name Builtins_BaselineOutOfLinePrologue --address-slide 76
breakpoint command add 1
register write x4 0xf
script print("MUE-X4-INJECTED")
continue
DONE
```

#### `run-witness.sh`

Witness driver: `run-witness.sh <node> <inject|control> <output-directory>`.

```bash
#!/usr/bin/env bash
# usage: run-witness.sh <node-executable> <inject|control> <output-directory>
set -uo pipefail
node_bin=$1 mode=$2 out=$3
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
[ -e "$out/lldb.log" ] && { echo "refusing to reuse $out" >&2; exit 2; }
shasum -a 256 "$node_bin" "$here/stack-check-gc.js" "$here/stack-check-gc.lldb" > "$out/inputs.sha256"
"$node_bin" -p 'JSON.stringify({version:process.version,v8:process.versions.v8,sandbox:process.config.variables.v8_enable_sandbox})' > "$out/runtime.json"
args=(--batch)
if [ "$mode" = inject ]; then args+=(-s "$here/stack-check-gc.lldb"); fi
args+=(-o run -k 'thread backtrace -c 12' -k 'register read x4 x8 pc' -k 'breakpoint list' -k 'process kill')
gtimeout --kill-after=5s 120s lldb "${args[@]}" -- "$node_bin" --allow-natives-syntax --expose-gc "$here/stack-check-gc.js" > "$out/lldb.log" 2>&1
echo $? > "$out/lldb-exit-status"
python3 "$here/verdict.py" "$mode" "$out/lldb.log" > "$out/verdict.json"
cat "$out/verdict.json"
```

#### `verdict.py`

Classifier for the witness LLDB log.

```python
import json, re, sys
mode, path = sys.argv[1], sys.argv[2]
log = open(path, encoding='utf-8', errors='replace').read()
slow = re.search(r'b\.lo\s+0x[0-9a-f]+\s+; <\+76>', log) is not None
save = re.search(r'<\+92>:\s+stp\s+(x3), (x4|xzr), \[sp, #-0x10\]!', log)
hits = len(re.findall(r'^MUE-X4-INJECTED$', log, re.M))
crash = re.search(r'stop reason = EXC_BAD_ACCESS \(code=1, address=(0x[0-9a-f]+)\)', log)
visitor = 'ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers' in log and 'InternalFrame::Iterate' in log
exit_m = re.search(r'Process \d+ exited with status = (\d+)', log)
completed = 'stack-check-gc witness completed' in log
v = {
  'mode': mode,
  'slowPathLabelAt76': slow if mode == 'inject' else None,
  'savedPairAt92': list(save.groups()) if save else None,
  'injectionHits': hits,
  'faultAddress': crash.group(1) if crash else None,
  'gcRootVisitorFault': bool(crash and visitor),
  'processExitStatus': int(exit_m.group(1)) if exit_m else None,
  'witnessCompleted': completed,
}
v['outcome'] = ('gc-root-fault' if v['gcRootVisitorFault'] and v['faultAddress'] == '0xe'
  else 'completed' if completed and v['processExitStatus'] == 0 else 'indeterminate')
print(json.dumps(v, indent=2))
```

#### `run-workload-inject.sh`

Captured Temporal workload under the same injection: `run-workload-inject.sh <node> <output-directory> [lldb-bound-seconds]`.

```bash
#!/usr/bin/env bash
# usage: run-workload-inject.sh <node-executable> <output-directory> [lldb-bound-seconds]
# Runs the captured Temporal workload under LLDB with ordinary V8 flags, writing an invalid x4 at
# every Sparkplug out-of-line-prologue slow path. Diagnostic only; run from inside a built checkout.
set -uo pipefail
node_bin=$1 out=$2 bound=${3:-600}
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git rev-parse --show-toplevel)
mkdir -p "$out"; [ -e "$out/lldb.log" ] && { echo "refusing to reuse $out" >&2; exit 2; }
cd "$repo"
git rev-parse HEAD > "$out/git-head"
shasum -a 256 "$node_bin" "$here/stack-check-gc.lldb" > "$out/inputs.sha256"
env CI=true gtimeout --kill-after=5s "${bound}s" lldb --batch -s "$here/stack-check-gc.lldb" -o run \
  -k 'thread backtrace -c 12' -k 'register read x4 x8 pc' -k 'process kill' -- \
  "$node_bin" --test --test-isolation=none --test-reporter=spec \
  packages/temporal-adapter/testkit/test/repeatable-subscription-temporal.test.ts \
  packages/temporal-adapter/testkit/test/oversized-command-ingress.test.ts > "$out/lldb.log" 2>&1
echo $? > "$out/lldb-exit-status"
python3 - "$out/lldb.log" > "$out/verdict.json" <<'PY'
import json, re, sys
log = open(sys.argv[1], errors='replace').read()
crash = re.search(r'stop reason = EXC_BAD_ACCESS \(code=1, address=(0x[0-9a-f]+)\)', log)
def count(key):
    match = re.search(r'^ℹ ' + key + r' (\d+)$', log, re.M)
    return int(match.group(1)) if match else None
saved = re.search(r'<\+92>:\s+stp\s+(x3), (x4|xzr)', log)
exited = re.search(r'Process \d+ exited with status = (\d+)', log)
print(json.dumps({
    'injectionHits': len(re.findall(r'^MUE-X4-INJECTED$', log, re.M)),
    'savedPairAt92': list(saved.groups()) if saved else None,
    'faultAddress': crash.group(1) if crash else None,
    'gcRootVisitorFault': bool(crash) and 'InternalFrame::Iterate' in log,
    'processExit': int(exited.group(1)) if exited else None,
    'tests': count('tests'), 'pass': count('pass'), 'fail': count('fail'),
}, indent=1))
PY
cat "$out/verdict.json"
```

### VM timeout and async-stack diagnostics

#### `async-stack-timeout-repro.cjs`

TD-005 reproducer; `MODE=node-test node --test async-stack-timeout-repro.cjs` aborts on affected runtimes, `MODE=promise-hook` and the default survive.

```js
const vm = require('node:vm');
const v8 = require('node:v8');
const mode = process.env.MODE;
if (mode === 'promise-hook') v8.promiseHooks.createHook({ init() {}, settled() {} });
const a = vm.createContext({}, { microtaskMode: 'afterEvaluate' });
const run = () => {
  try { vm.runInContext('Promise.resolve().then(()=>{while(1){}})', a, { timeout: 5 }); }
  catch (e) { console.log('caught:', e.message); }
};
if (mode === 'node-test') require('node:test').test('vm timeout', run); else run();
setImmediate(() => console.log('immediate ran; process survived'));
```

#### `context-preserved.cjs`

Adversarial check that a corrected runtime preserves the caller async context.

```js
// After a terminated afterEvaluate evaluation, the caller's async context must be unchanged.
const vm = require('node:vm');
const { AsyncLocalStorage, AsyncResource, createHook, executionAsyncId } = require('node:async_hooks');
createHook({ init() {} }).enable();
const als = new AsyncLocalStorage();
const ctx = vm.createContext({}, { microtaskMode: 'afterEvaluate' });
const results = [];
new AsyncResource('Outer').runInAsyncScope(() => als.run('outer', () => {
  const before = executionAsyncId();
  try { vm.runInContext('Promise.resolve().then(()=>{while(1){}})', ctx, { timeout: 5 }); } catch (e) { results.push(e.code); }
  results.push(executionAsyncId() === before, als.getStore() === 'outer');
  // A non-timed-out evaluation in the same context still runs its microtasks.
  vm.runInContext('globalThis.ok = 0; Promise.resolve().then(() => { globalThis.ok = 1; })', ctx, { timeout: 1000 });
  results.push(vm.runInContext('globalThis.ok', ctx) === 1);
}));
setImmediate(() => { results.push(executionAsyncId() > 0); console.log(JSON.stringify(results)); });
```

#### `vm-gc-timing-preload.cjs`

`--require` preload timing SDK VM calls and attributing GC pauses; writes to `MUE_VM_TIMING_DIR` at exit.

```js
// Diagnostic only: times SDK vm.runInContext calls and attributes overlapping GC pauses.
const vm = require('node:vm');
const fs = require('node:fs');
const { PerformanceObserver, performance } = require('node:perf_hooks');
const v8 = require('node:v8');
const original = vm.runInContext;
const calls = [];
const gcs = [];
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) gcs.push({ start: e.startTime, duration: e.duration, kind: e.detail?.kind });
}).observe({ entryTypes: ['gc'] });
vm.runInContext = function (code, context, options) {
  const start = performance.now();
  const cpu = process.cpuUsage();
  let error;
  try { return original.apply(this, arguments); }
  catch (e) { error = e.message; throw e; }
  finally {
    if (options?.timeout) {
      const d = process.cpuUsage(cpu);
      calls.push({ heapMB: v8.getHeapStatistics().used_heap_size / 1048576, phase: String(code).split('(')[0].slice(0, 60), start, wallMs: performance.now() - start, cpuMs: (d.user + d.system) / 1000, timeoutMs: options.timeout, error });
    }
  }
};
process.on('exit', () => {
  for (const c of calls) {
    const end = c.start + c.wallMs;
    const overlapping = gcs.filter((g) => g.start < end && g.start + g.duration > c.start);
    c.gcMs = overlapping.reduce((s, g) => s + Math.min(end, g.start + g.duration) - Math.max(c.start, g.start), 0);
    c.gcCount = overlapping.length;
    c.gcMaxMs = overlapping.reduce((m, g) => Math.max(m, g.duration), 0);
  }
  const heapMB = calls.map((c) => c.heapMB);
  const slow = calls.filter((c) => c.wallMs > 100 || c.error).sort((a, b) => b.wallMs - a.wallMs);
  fs.writeFileSync(`${process.env.MUE_VM_TIMING_DIR}/vm-gc-${process.pid}.json`, JSON.stringify({ file: process.argv[1], execArgv: process.execArgv, node: process.execPath, calls: calls.length, timeouts: calls.filter((c) => c.error).length, heapFirstMB: heapMB[0], heapMaxMB: Math.max(...heapMB), heapLastMB: heapMB.at(-1), slow }, null, 1));
});
```

#### `vm-event-preload.cjs`

`--require` preload logging each VM timeout synchronously, so an aborting child keeps its evidence.

```js
// Diagnostic only: synchronously logs each SDK VM timeout so an aborting child keeps its evidence.
const vm = require('node:vm');
const fs = require('node:fs');
const original = vm.runInContext;
const log = `${process.env.MUE_VM_TIMING_DIR}/vm-events-${process.pid}.log`;
fs.appendFileSync(log, `${Date.now()} start ${process.argv.slice(1).join(' ')}\n`);
vm.runInContext = function (code, context, options) {
  const start = performance.now();
  try { return original.apply(this, arguments); }
  catch (e) {
    if (/timed out/.test(e.message)) fs.appendFileSync(log, `${Date.now()} timeout ${(performance.now() - start).toFixed(1)}ms ${String(code).split('(')[0].slice(0, 50)}\n`);
    throw e;
  }
};
process.on('exit', (code) => fs.appendFileSync(log, `${Date.now()} exit ${code}\n`));
```

#### `retention-preload.cjs`

Retention probe; requires `--expose-gc` and forces a full GC after each SDK VM `destroy`.

```js
// Diagnostic only: retained heap after a forced full GC following each SDK VM destroy.
const vm = require('node:vm');
const v8 = require('node:v8');
const fs = require('node:fs');
const original = vm.runInContext;
const samples = [];
let destroys = 0;
vm.runInContext = function (code) {
  const result = original.apply(this, arguments);
  if (String(code).startsWith('__TEMPORAL__.api.destroy')) {
    destroys += 1;
    const ordinal = destroys;
    setImmediate(() => { global.gc(); samples.push({ ordinal, retainedMB: v8.getHeapStatistics().used_heap_size / 1048576, contexts: v8.getHeapStatistics().number_of_native_contexts, detached: v8.getHeapStatistics().number_of_detached_contexts }); });
  }
  return result;
};
process.on('exit', () => fs.writeFileSync(`${process.env.MUE_VM_TIMING_DIR}/retention-${process.pid}.json`, JSON.stringify({ file: process.argv.slice(1), destroys, samples }, null, 1)));
```

#### `summarize-gc.py`

Summary of the GC-attribution records: `summarize-gc.py <directory> [rows]`.

```python
import json,glob,sys
rows=[]; n=0
for p in glob.glob(sys.argv[1]+'/vm-gc-*.json'):
    d=json.load(open(p)); n+=d['calls']
    for c in d['slow']: c['file']=d['file'].split('/')[-1]; rows.append(c)
rows.sort(key=lambda r:-r['wallMs'])
heaps=[(json.load(open(p))) for p in glob.glob(sys.argv[1]+'/vm-gc-*.json')]
for d in sorted(heaps,key=lambda d:-(d.get('heapMaxMB') or 0))[:5]: print('heap', d['file'].split('/')[-1][:40], 'calls',d['calls'], 'first %.0f max %.0f last %.0f MB'%(d.get('heapFirstMB') or 0,d.get('heapMaxMB') or 0,d.get('heapLastMB') or 0))
print('timed calls',n,'timeouts',sum(1 for r in rows if r.get('error')))
for r in rows[:int(sys.argv[2]) if len(sys.argv)>2 else 10]:
    print(f"wall={r['wallMs']:7.1f} gc={r['gcMs']:7.1f} (n={r['gcCount']:3d} max={r['gcMaxMs']:6.1f}) cpu={r['cpuMs']:7.1f} {r['phase'][:28]:28s} {r['file'][:34]} {'TIMEOUT' if r.get('error') else ''}")
```
