# BPMN source reader

`@bpmn-lean/bpmn-source` reads untrusted BPMN 2.0.2 XML and emits the kernel IL that the Lean and TypeScript kernels execute. It preserves the exact source identity, bounds the input, and keeps `bpmn-moddle` and raw parser objects inside the package. The reader chooses no semantics and never branches on a profile: it refuses only what it cannot read faithfully, and every semantic refusal belongs to the kernel's admission (see the [admission semantics](../../docs/kernel/semantics/ADMISSION-SEMANTICS-SPEC.md)).

## What you can do

Read exact BPMN bytes into a kernel program, or receive one stable refusal code with the element and evidence that caused it:

```ts
import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

const read = await readKernelProgram(
  {
    bytes,
    expectedSha256: undefined,
    overlay: null,
    profile: "bpmn-2.0.2",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  },
  kernelProfileOptions(["CIB-EXT-0005"]),
);

if (read.kind === "refused") {
  throw new Error(`${read.code} at ${read.element ?? "source"}: ${read.evidence}`);
}
// read.program is the kernel IL as JSON; read.notCarried lists source facts the IL deliberately does not carry.
```

- `readKernelProgram(source, options)` returns `{ kind: "read", program, notCarried }` or `{ kind: "refused", code, element, evidence }`. The program carries the source SHA-256 and the profile as identity data only.
- `kernelProfileOptions(relations)` derives the kernel's profile options from the selected [CIB relation identifiers](../../docs/CIB-BPMN-RELATION-REGISTER.md), never from a profile name; `defaultKernelProfileOptions` is the standards reading with no relation selected.
- `ReadRefusalCode` enumerates the reader's refusals: source limits and identity (`source.*`), parser failures and warnings (`parser.*`), and unknown or unrepresentable source shapes (`reader.*`).
- `declaredSourceEncoding(bytes)` reports the encoding an XML declaration names; the reader accepts only UTF-8.

The reader is organized one module per mechanism under [`src/kernel-reader/`](src/kernel-reader/index.ts) (flow, work, events, scopes, data, Multi-Instance, compensation), matching the kernel's feature split described in the [kernel architecture](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape). The kernel IL itself is specified in the [IL specification](../../docs/kernel/IL-SPEC.md).

The package also hosts an optional pinned MIWG observation lane ([`calibration/miwg-observation.ts`](calibration/miwg-observation.ts), `./scripts/pnpm.sh run test:miwg`) for source-interchange research. External MIWG files remain outside the repository, and interchange import establishes no execution conformance.

## Quick start

Run the focused reader tests, including one refusal test per `ReadRefusalCode`:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

## Learn more

- [BPMN XML ingestion decision](../../docs/BPMN-XML-INGESTION-DECISION.md) owns the trust, parser and source-preservation boundary.
- [Interchange admission specification](../../docs/INTERCHANGE-ADMISSION-SPEC.md) and [preserve-only admission specification](../../docs/PRESERVE-ONLY-ADMISSION-SPEC.md) own what the reader preserves without executing.
- [Kernel IL specification](../../docs/kernel/IL-SPEC.md) owns the program shape the reader emits.
