import pkg from "../../package.json" with { type: "json" };

const APP_VERSION = pkg.version;
export const DISPLAY_VERSION = `Beta ${pkg.version.replace(/-beta$/, "")}`;

// Injected by `astro.config.mjs` at build time. Declared so TypeScript knows
// the identifier; the `typeof` guard keeps it safe where no define ran (tests).
declare const __GIT_BRANCH__: string;

/**
 * Git branch this bundle was built from. Empty when the build had no git
 * context, in which case the footer omits it.
 */
export const GIT_BRANCH =
  typeof __GIT_BRANCH__ === "string" ? __GIT_BRANCH__ : "";
