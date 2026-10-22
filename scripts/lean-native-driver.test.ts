import assert from "node:assert/strict";
import { test } from "node:test";

import { declaredLeanExecutables, nativeLeanDriverFor } from "./lean-native-driver.ts";

const lakefile = `name = "example"

[[lean_lib]]
name = "BpmnSemantics"

[[lean_exe]]
name = "emitExample"
root = "BpmnSemantics.ExampleMain"

[[lean_exe]]
root = "BpmnSemantics.Nested.OtherMain"
name = "emitOther"
`;

test("declared executables map each driver root module to its executable name", () => {
  assert.deepEqual([...declaredLeanExecutables(lakefile)], [
    ["BpmnSemantics.ExampleMain", "emitExample"],
    ["BpmnSemantics.Nested.OtherMain", "emitOther"],
  ]);
});

test("a driver source resolves to the executable whose root is its module", () => {
  assert.equal(nativeLeanDriverFor(lakefile, "BpmnSemantics/ExampleMain.lean"), "emitExample");
  assert.equal(nativeLeanDriverFor(lakefile, "BpmnSemantics/Nested/OtherMain.lean"), "emitOther");
});

test("an undeclared driver or a non-driver path is refused rather than interpreted", () => {
  assert.throws(() => nativeLeanDriverFor(lakefile, "BpmnSemantics/MissingMain.lean"),
    /BpmnSemantics\/MissingMain\.lean has no \[\[lean_exe\]\] whose root is BpmnSemantics\.MissingMain/u);
  assert.throws(() => nativeLeanDriverFor(lakefile, "scripts/ExampleMain.lean"), /not a BpmnSemantics driver source/u);
});
