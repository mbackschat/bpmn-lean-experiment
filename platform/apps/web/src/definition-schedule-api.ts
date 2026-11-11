import {
  decodeDefinitionSchedule,
  decodeDefinitionScheduleListResponse,
  decodeDefinitionScheduleOccurrenceListResponse,
  decodePublicApiErrorResponse,
  decodePutDefinitionScheduleRequest,
  definitionScheduleOccurrencesPath,
  definitionSchedulePath,
  definitionSchedulesPath,
  DefinitionScheduleStatus,
  LegacyPublicApiErrorCodes,
  parseWireJson,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DefinitionScheduleListResponse,
  DefinitionScheduleOccurrenceListResponse,
  DeployedDefinitionVersion,
  PutDefinitionScheduleRequest,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "./definitions-api.ts";
import {
  sameExactDefinition,
  snapshotExactDefinition,
} from "./exact-definition.ts";

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
    const expectedDefinition = snapshotExactDefinition(definition);
    const expectedRequest = decodePutDefinitionScheduleRequest({
      dueAt: request.dueAt,
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
    if (schedule.dueAt !== expectedRequest.dueAt) {
      throw new DefinitionProtocolError(
        "definition-schedule response does not match the requested occurrence",
      );
    }
    return schedule;
  }

  /** The engine's occurrences of the version's Timer start due at or after `from` (the server's now when absent). */
  async occurrences(
    definition: DeployedDefinitionVersion,
    query: Readonly<{ from?: string; limit?: number }> = {},
  ): Promise<DefinitionScheduleOccurrenceListResponse> {
    const expectedDefinition = snapshotExactDefinition(definition);
    const search = new URLSearchParams();
    if (query.from !== undefined) search.set("from", query.from);
    if (query.limit !== undefined) search.set("limit", String(query.limit));
    const path = definitionScheduleOccurrencesPath(expectedDefinition.processId, expectedDefinition.version);
    const response = await this.#fetch(this.#url(search.size === 0 ? path : `${path}?${search.toString()}`), {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const result = decodeResponse(
      await readJson(response),
      decodeDefinitionScheduleOccurrenceListResponse,
      "definition-schedule occurrence response",
    );
    if (!sameExactDefinition(result.definition, expectedDefinition)) {
      throw new DefinitionProtocolError(
        "definition-schedule occurrences do not match the requested definition identity",
      );
    }
    const from = query.from === undefined ? null : Date.parse(query.from);
    if (from !== null && result.occurrences.some((occurrence) => Date.parse(occurrence.dueAt) < from)) {
      throw new DefinitionProtocolError("definition-schedule occurrences precede the requested instant");
    }
    return result;
  }

  async list(
    definition: DeployedDefinitionVersion,
  ): Promise<DefinitionScheduleListResponse> {
    const expectedDefinition = snapshotExactDefinition(definition);
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
    if (!sameExactDefinition(result.definition, expectedDefinition)) {
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
    const expectedDefinition = snapshotExactDefinition(definition);
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
      (value) => decodePublicApiErrorResponse(value, LegacyPublicApiErrorCodes),
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
    const bytes = new Uint8Array(await response.arrayBuffer());
    return parseWireJson(bytes);
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
    !sameExactDefinition(schedule.definition, definition)
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
