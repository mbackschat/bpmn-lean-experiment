/** Sequence token used by view owners to ignore responses from abandoned selections. */
export class LatestRequest {
  #generation = 0;

  begin(): number {
    this.#generation += 1;
    return this.#generation;
  }

  invalidate(): void {
    this.#generation += 1;
  }

  isCurrent(generation: number): boolean {
    return this.#generation === generation;
  }
}
