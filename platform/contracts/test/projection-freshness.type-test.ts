import type { ProjectionRead } from "../src/index.js";

declare const read: ProjectionRead<Readonly<{ count: number }>>;

// @ts-expect-error Projection read values are immutable.
read.value = { count: 2 };
// @ts-expect-error Projection freshness is immutable.
read.freshness = null;

if (read.freshness !== null) {
  // @ts-expect-error Projection freshness fields are immutable.
  read.freshness.maxAgeMs = 1;
}
