import {
  decodeDefinitionSchedule,
  decodeDefinitionScheduleListResponse,
  decodePublicApiErrorResponse,
  decodePutDefinitionScheduleRequest,
  definitionSchedulePath,
  definitionSchedulesPath,
  DefinitionScheduleStatus,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DefinitionScheduleListResponse,
  DeployedDefinitionVersion,
  PutDefinitionScheduleRequest,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "./definitions-api.ts";

/** Same-origin public schedule client bound only to exact deployed definitions. */
export class DefinitionScheduleApiClient {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("definition schedule API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async create(
    definition: DeployedDefinitionVersion,
    scheduleId: string,
    request: PutDefinitionScheduleRequest,
  ): Promise<DefinitionSchedule> {
    const expectedDefinition = snapshotDefinition(definition);
    const expectedRequest = decodePutDefinitionScheduleRequest({
      activationAt: request.activationAt,
    });
    const expectedScheduleId = snapshotScheduleId(scheduleId);
    const response = await this.#fetch(this.#url(definitionSchedulePath(
      expectedDefinition.processId,
      expectedDefinition.version,
      expectedScheduleId,
    )), {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(expectedRequest),
    });
    if (response.status !== 200 && response.status !== 201) {
      return await this.#throwApiError(response);
    }
    const schedule = await readSchedule(
      response,
      "definition-schedule creation response",
    );
    if (
      response.status === 201 &&
      schedule.status === DefinitionScheduleStatus.Cancelled
    ) {
      throw new DefinitionProtocolError(
        "newly created definition schedule cannot be cancelled",
      );
    }
    requireScheduleIdentity(
      schedule,
      expectedDefinition,
      expectedScheduleId,
    );
    if (schedule.activationAt !== expectedRequest.activationAt) {
      throw new DefinitionProtocolError(
        "definition-schedule response does not match the requested activation instant",
      );
    }
    return schedule;
  }

  async list(
    definition: DeployedDefinitionVersion,
  ): Promise<DefinitionScheduleListResponse> {
    const expectedDefinition = snapshotDefinition(definition);
    const response = await this.#fetch(this.#url(definitionSchedulesPath(
      expectedDefinition.processId,
      expectedDefinition.version,
    )), {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const result = decodeResponse(
      await readJson(response),
      decodeDefinitionScheduleListResponse,
      "definition-schedule list response",
    );
    if (!sameDefinition(result.definition, expectedDefinition)) {
      throw new DefinitionProtocolError(
        "definition-schedule list does not match the requested definition identity",
      );
    }
    return result;
  }

  async get(
    definition: DeployedDefinitionVersion,
    scheduleId: string,
  ): Promise<DefinitionSchedule> {
    return await this.#readItem("GET", definition, scheduleId);
  }

  async cancel(
    definition: DeployedDefinitionVersion,
    scheduleId: string,
  ): Promise<DefinitionSchedule> {
    const schedule = await this.#readItem("DELETE", definition, scheduleId);
    if (schedule.status !== DefinitionScheduleStatus.Cancelled) {
      throw new DefinitionProtocolError(
        "definition-schedule cancellation response is not cancelled",
      );
    }
    return schedule;
  }

  async #readItem(
    method: "DELETE" | "GET",
    definition: DeployedDefinitionVersion,
    scheduleId: string,
  ): Promise<DefinitionSchedule> {
    const expectedDefinition = snapshotDefinition(definition);
    const expectedScheduleId = snapshotScheduleId(scheduleId);
    const response = await this.#fetch(this.#url(definitionSchedulePath(
      expectedDefinition.processId,
      expectedDefinition.version,
      expectedScheduleId,
    )), {
      method,
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const schedule = await readSchedule(
      response,
      "definition-schedule item response",
    );
    requireScheduleIdentity(
      schedule,
      expectedDefinition,
      expectedScheduleId,
    );
    return schedule;
  }

  #url(pathname: string): URL {
    return new URL(pathname, this.#origin);
  }

  async #throwApiError(response: Response): Promise<never> {
    const decoded = decodeResponse(
      await readJson(response),
      decodePublicApiErrorResponse,
      "definition-schedule API error response",
    );
    throw new DefinitionApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

async function readSchedule(
  response: Response,
  label: string,
): Promise<DefinitionSchedule> {
  return decodeResponse(
    await readJson(response),
    decodeDefinitionSchedule,
    label,
  );
}

async function readJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new DefinitionProtocolError(
      "definition schedule API JSON response has an unexpected media type",
    );
  }
  try {
    return await response.json() as unknown;
  } catch (cause: unknown) {
    throw new DefinitionProtocolError(
      "definition schedule API returned malformed JSON",
      { cause },
    );
  }
}

function decodeResponse<Result>(
  value: unknown,
  decoder: (candidate: unknown) => Result,
  label: string,
): Result {
  try {
    return decoder(value);
  } catch (cause: unknown) {
    throw new DefinitionProtocolError(`${label} violates the public contract`, { cause });
  }
}

function requireScheduleIdentity(
  schedule: DefinitionSchedule,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): void {
  if (
    schedule.scheduleId !== scheduleId ||
    !sameDefinition(schedule.definition, definition)
  ) {
    throw new DefinitionProtocolError(
      "definition-schedule response does not match the requested identity",
    );
  }
}

function snapshotScheduleId(scheduleId: string): string {
  if (typeof scheduleId !== "string" || scheduleId.length === 0) {
    throw new TypeError("scheduleId must not be empty");
  }
  return scheduleId;
}

function snapshotDefinition(
  definition: DeployedDefinitionVersion,
): DeployedDefinitionVersion {
  return {
    processId: definition.processId,
    version: definition.version,
    source: { ...definition.source },
    semanticProfile: definition.semanticProfile,
    startCapabilities: {
      timerStarts: definition.startCapabilities.timerStarts.map(
        ({ startEventId, durationMs }) => ({ startEventId, durationMs }),
      ),
    },
  };
}

function sameDefinition(
  actual: DeployedDefinitionVersion,
  expected: DeployedDefinitionVersion,
): boolean {
  return actual.processId === expected.processId &&
    actual.version === expected.version &&
    actual.semanticProfile === expected.semanticProfile &&
    actual.source.kind === expected.source.kind &&
    actual.source.id === expected.source.id &&
    actual.source.sha256 === expected.source.sha256 &&
    actual.source.byteLength === expected.source.byteLength &&
    actual.source.declaredEncoding === expected.source.declaredEncoding &&
    actual.source.decodedAs === expected.source.decodedAs &&
    sameTimerStarts(
      actual.startCapabilities.timerStarts,
      expected.startCapabilities.timerStarts,
    );
}

function sameTimerStarts(
  actual: DeployedDefinitionVersion["startCapabilities"]["timerStarts"],
  expected: DeployedDefinitionVersion["startCapabilities"]["timerStarts"],
): boolean {
  return actual.length === expected.length && actual.every((capability, index) => {
    const expectedCapability = expected[index];
    return expectedCapability !== undefined &&
      capability.startEventId === expectedCapability.startEventId &&
      capability.durationMs === expectedCapability.durationMs;
  });
}
