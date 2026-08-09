const definitionsBasePath = "/api/v1/definitions";

/** Public collection endpoint for deployment and definition listing. */
export function definitionsCollectionPath(): string {
  return definitionsBasePath;
}

/** Public endpoint listing every version of one BPMN process identifier. */
export function definitionVersionsPath(processId: string): string {
  return `${definitionProcessPath(processId)}/versions`;
}

/** Public endpoint returning the exact admitted source bytes for one version. */
export function definitionVersionSourcePath(
  processId: string,
  version: number,
): string {
  return `${definitionVersionPath(processId, version)}/source`;
}

/** Public command endpoint that starts one exact definition version. */
export function definitionVersionStartPath(
  processId: string,
  version: number,
): string {
  return `${definitionVersionPath(processId, version)}/start`;
}

function definitionProcessPath(processId: string): string {
  if (typeof processId !== "string" || processId.length === 0) {
    throw new TypeError("processId must not be empty");
  }
  if (!processId.isWellFormed()) {
    throw new TypeError("processId must contain well-formed Unicode");
  }
  return `${definitionsBasePath}/${encodeURIComponent(processId)}`;
}

function definitionVersionPath(processId: string, version: number): string {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new RangeError("version must be a positive safe integer");
  }
  return `${definitionVersionsPath(processId)}/${version}`;
}
