import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodePreservationArtifact,
  readPreservationFixtureBytes,
  verifyCyclicControlFlowPreservation,
  verifyPreservationFixtureBytes,
} from "./cyclic-control-flow-preservation-support.ts";

/**
 * The immutable baseline compiler is the projection oracle. Ordinary verification is read-only, and
 * every seed below demonstrates one promised drift class reaching that same verifier.
 */
test("preserves every registered baseline compilation projection", async () => {
  const before = await readPreservationFixtureBytes();
  await verifyPreservationFixtureBytes(before);

  const after = await readPreservationFixtureBytes();
  assert.deepEqual(after, before, "ordinary verification must not rewrite its fixture");
});

test("binds ordinary verification to the exact immutable baseline artifact", async () => {
  const candidate = new Uint8Array(await readPreservationFixtureBytes());
  candidate[candidate.length - 1] = candidate[candidate.length - 1] === 0x0a ? 0x20 : 0x0a;

  await assert.rejects(
    verifyPreservationFixtureBytes(candidate),
    /baseline artifact SHA-256/u,
  );
});

test("seeded mismatches reach the ordinary preservation verifier", async (context) => {
  const artifact = decodePreservationArtifact(await readPreservationFixtureBytes());
  const seeds = [
    {
      name: "source SHA-256",
      expected: /catalog binding/u,
      mutate: (root: MutableObject): void => {
        firstCatalogEntry(root).sourceSha256 = "0".repeat(64);
      },
    },
    {
      name: "profile SHA-256",
      expected: /catalog binding/u,
      mutate: (root: MutableObject): void => {
        firstCatalogEntry(root).profileSha256 = "0".repeat(64);
      },
    },
    {
      name: "checked projection",
      expected: /checked projection/u,
      mutate: (root: MutableObject): void => {
        mutableObject(firstCatalogEntry(root).checkedProcess, "checkedProcess").processId =
          "Seeded_Checked_Process";
      },
    },
    {
      name: "Semantic Process projection",
      expected: /Semantic Process projection/u,
      mutate: (root: MutableObject): void => {
        mutableObject(firstCatalogEntry(root).semanticProcess, "semanticProcess").processId =
          "Seeded_Semantic_Process";
      },
    },
    {
      name: "admission result",
      expected: /admission\.status/u,
      mutate: (root: MutableObject): void => {
        mutableObject(firstCatalogEntry(root).admission, "admission").status = "rejected";
      },
    },
    {
      name: "omitted baseline registration",
      expected: /baseline registration count/u,
      mutate: (root: MutableObject): void => {
        root.registrations = mutableArray(root.registrations, "registrations").slice(1);
      },
    },
    {
      name: "redirected baseline registration",
      expected: /catalog key/u,
      mutate: (root: MutableObject): void => {
        const registrations = mutableArray(root.registrations, "registrations");
        const first = mutableObject(registrations[0], "registrations[0]");
        const last = mutableObject(registrations.at(-1), "registrations[last]");
        first.catalogKey = last.catalogKey;
      },
    },
    {
      name: "omitted baseline catalog entry",
      expected: /baseline catalog count/u,
      mutate: (root: MutableObject): void => {
        root.catalog = mutableArray(root.catalog, "catalog").slice(1);
      },
    },
  ] as const;

  for (const seed of seeds) {
    await context.test(seed.name, async () => {
      const candidate: unknown = structuredClone(artifact);
      seed.mutate(mutableObject(candidate, "artifact"));
      await assert.rejects(
        verifyCyclicControlFlowPreservation(candidate),
        seed.expected,
      );
    });
  }
});

type MutableObject = Record<string, unknown>;

function firstCatalogEntry(root: MutableObject): MutableObject {
  return mutableObject(mutableArray(root.catalog, "catalog")[0], "catalog[0]");
}

function mutableObject(value: unknown, label: string): MutableObject {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be an object`);
  return value as MutableObject;
}

function mutableArray(value: unknown, label: string): Array<unknown> {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
}
