import { expect, type Assertion, type AsymmetricMatchersContaining } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { type TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';

declare module 'vitest' {
  interface Assertion<T = any> extends TestingLibraryMatchers<typeof expect.stringContaining, T> { }
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> { }
}

expect.extend(matchers);


// In Node 20 / Vitest environment, Response and Headers are already
// defined globally. Polyfilling them from node-fetch is no longer
// required and avoids deprecation warnings.
if (typeof globalThis.Response === 'undefined') {
  console.warn('Polyfilling Response for test environment');
}
