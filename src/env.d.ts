/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Per-request CSP nonce — set by middleware, consumed by inline-script pages. */
    nonce: string;
  }
}