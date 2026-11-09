/**
 * Refusal tests of `admission/flow.ts`: a condition is read only on the candidates of an exclusive or inclusive gateway,
 * an Event-Based Gateway arms only catch Events, and a throwing Link needs exactly one catching Link of its name.
 */
import {
  activity, append, catchEvent, conditionOn, duration, gateway, link, receiveWork, refusalTests, replace, simpleBoolean,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` is replaced by `source`, whose outgoing flow `f2` carries a condition. */
const conditionalFrom = (source: Json) => (program: Json): Json => conditionOn(replace(program, "T", source), "f2", simpleBoolean());

/** `T` becomes an Event-Based Gateway and `E` the one arm `arm` its outgoing flow `f2` reaches. */
const armedBy = (arm: Json) => (program: Json): Json =>
  replace(replace(program, "T", gateway("T", "eventBased")), "E", arm);

const exclusive = (candidates: string[]): Json => gateway("T", { exclusive: { candidates, default: null } });

const linkThrow = (program: Json): Json => replace(program, "T", link("T", "linkThrow", "L"));

export const rows: readonly Row[] = [
  {
    code: "gateway.eventBased.receiveArm",
    description: "an Event-Based Gateway arm that is a Receive Task",
    mutate: armedBy(activity("E", receiveWork(), { incoming: ["f2"], outgoing: [] })),
    control: armedBy(catchEvent("E", duration("PT1S"))),
  },
  {
    code: "flow.conditionalOutflow",
    description: "a condition on the outflow of a Task",
    mutate: conditionalFrom(activity("T", "manual")),
    control: conditionalFrom(exclusive(["f2"])),
  },
  {
    code: "flow.conditionalOutflow",
    description: "a condition on the outflow of a Parallel Gateway",
    mutate: conditionalFrom(gateway("T", "parallel")),
    control: conditionalFrom(exclusive(["f2"])),
  },
  {
    code: "flow.conditionalOutflow",
    description: "a condition on a flow the exclusive gateway does not list as a candidate",
    mutate: conditionalFrom(exclusive([])),
    control: conditionalFrom(exclusive(["f2"])),
  },
  {
    code: "link.catch",
    description: "a throwing Link with no catching Link of its name",
    mutate: linkThrow,
    control: (program) => append(linkThrow(program), link("C", "linkCatch", "L")),
  },
  {
    code: "link.catch",
    description: "a throwing Link with two catching Links of its name",
    mutate: (program) => append(linkThrow(program), link("C1", "linkCatch", "L"), link("C2", "linkCatch", "L")),
    control: (program) => append(linkThrow(program), link("C1", "linkCatch", "L"), link("C2", "linkCatch", "Other")),
  },
];

refusalTests("flow", rows);
