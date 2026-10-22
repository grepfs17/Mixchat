import { join } from "path";
import type { WheelStoreOptions } from "./wheelStore";

/**
 * Resolve the on-disk base directory for Wheel Spin wheels:
 * `MIXCHAT_WHEEL_DIR`, else `<cwd>/data/wheels`.
 */
export function getWheelStoreOptions(override?: string): WheelStoreOptions {
  const baseDir =
    override ||
    (typeof process !== "undefined" && process.env?.MIXCHAT_WHEEL_DIR) ||
    join(process.cwd(), "data", "wheels");
  return { baseDir };
}
