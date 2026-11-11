/**
 * The derived instance identities the CIB runner maps CIB's instances to (M8-OP-A) are the kernel's, byte for byte: each
 * literal here is also pinned by the runner's `PopulationContractTest`, so a change on either side fails one of them.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { cascadeInstanceId } from "@bpmn-lean/kernel";

test("the kernel names a cascade-started instance as the CIB runner does, multi-byte identifiers included", () => {
  assert.equal(
    cascadeInstanceId("publish-ä", 2, "Start_Ü", { processInstanceId: "Antrag-ß", element: "Throw_1", activation: 3 }),
    "start:10:publish-ä:1:2:8:Start_Ü:23:9:Antrag-ß:7:Throw_1:3",
  );
  assert.equal(
    cascadeInstanceId("c-1", 3, "Start", { processInstanceId: "Bestellung-ä", element: "Wurf-€", activation: 2 }),
    "start:3:c-1:1:3:5:Start:29:13:Bestellung-ä:8:Wurf-€:2",
  );
});
