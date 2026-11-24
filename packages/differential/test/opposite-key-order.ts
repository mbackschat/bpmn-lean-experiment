/**
 * The opposite-key-order test build of the TypeScript kernel (KD7). Loaded before the kernel (`node --import`), it puts
 * itself in place of the built kernel's `state/key-order.js`, the module that selects the orientation of the scope-led
 * key orders, so this process's kernel reverses the order of every map keyed by a scope-led key. It substitutes no other
 * module and changes no source: the build differs from the normal one in that constant alone, which no host or model can
 * set. Its exports must stay those of `packages/kernel/src/state/key-order.ts`.
 */
import { registerHooks } from "node:module";

/** The substituted constant: the scope-led key orders are reversed. */
export const keyOrderOpposite: boolean = true;

/** The built module this one replaces, wherever the kernel's build is reached from. */
const substituted = /\/packages\/kernel\/dist\/state\/key-order\.js$/u;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    return substituted.test(resolved.url) ? { url: import.meta.url, format: "module", shortCircuit: true } : resolved;
  },
});
