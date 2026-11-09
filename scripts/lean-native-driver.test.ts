import assert from "node:assert/strict";
import { test } from "node:test";

import { declaredLeanExecutables, nativeLeanDriverFor } from "./lean-native-driver.ts";

const lakefile = `name = "example"

[[lean_lib]]
name = "Kernel"

[[lean_exe]]
name = "kernelRun"
root = "Kernel.Run"

[[lean_exe]]
root = "Kernel.Nested.OtherMain"
name = "emitOther"
`;

test("declared executables map each driver root module to its executable name", () => {
  assert.deepEqual([...declaredLeanExecutables(lakefile)], [
    ["Kernel.Run", "kernelRun"],
    ["Kernel.Nested.OtherMain", "emitOther"],
  ]);
});

test("a driver source resolves to the executable whose root is its module", () => {
  assert.equal(nativeLeanDriverFor(lakefile, "Kernel/Run.lean"), "kernelRun");
  assert.equal(nativeLeanDriverFor(lakefile, "Kernel/Nested/OtherMain.lean"), "emitOther");
});

test("an undeclared driver or a non-driver path is refused rather than interpreted", () => {
  assert.throws(() => nativeLeanDriverFor(lakefile, "Kernel/MissingMain.lean"),
    /Kernel\/MissingMain\.lean has no \[\[lean_exe\]\] whose root is Kernel\.MissingMain/u);
  assert.throws(() => nativeLeanDriverFor(lakefile, "scripts/ExampleMain.lean"), /not a Kernel driver source/u);
  assert.throws(() => nativeLeanDriverFor(lakefile, "BpmnSemantics/ExampleMain.lean"), /not a Kernel driver source/u);
});
