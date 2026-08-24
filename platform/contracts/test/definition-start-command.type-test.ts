import type { DefinitionVersionStartCommand } from "@bpmn-lean/platform-contracts";

declare const command: DefinitionVersionStartCommand;

command.initialVariables[0]!.name satisfies string;
// @ts-expect-error start commands and nested list values are deeply immutable
command.initialVariables[0]!.name = "changed";
const first = command.initialVariables[0]!.value;
if (first.kind === "stringList") {
  // @ts-expect-error start commands and nested list values are deeply immutable
  first.value.push("changed");
}
