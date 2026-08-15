import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const cloudflareWorkersUrl =
  "data:text/javascript," +
  encodeURIComponent(`
    export const env = new Proxy({}, {
      get(_target, property) {
        return globalThis.__THEUS_RUNTIME_ENV__?.[property];
      },
    });
  `);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return { url: cloudflareWorkersUrl, shortCircuit: true };
    }
    if (
      context.parentURL?.startsWith("file:") &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z0-9]+$/i.test(specifier)
    ) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
