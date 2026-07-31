/** Direct executable wrapper; orchestration and reporting remain independently testable. */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runRunnableMvpCommand } from "./runnable-mvp-command.ts";

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(entryPoint)).href
) {
  process.exitCode = await runRunnableMvpCommand(process.argv.slice(2));
}
