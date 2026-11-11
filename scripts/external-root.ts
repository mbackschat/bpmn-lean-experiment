import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The directory holding the external reference checkouts: `BPMN_EXTERNAL_ROOT` when set, else the project's sibling
 * `../oss`, the default `scripts/doctor.sh` provisions. The shell scripts resolve the same default themselves.
 */
export const externalRoot: string = process.env["BPMN_EXTERNAL_ROOT"] ??
  path.resolve(fileURLToPath(new URL("../", import.meta.url)), "../oss");
