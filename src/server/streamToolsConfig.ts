import { join } from "path";

export interface StreamToolsStoreOptions {
  baseDir: string;
}

/**
 * Resolve the on-disk base directory for Stream tools channel settings:
 * `MIXCHAT_STREAM_TOOLS_DIR`, else `<cwd>/data/stream-tools`.
 */
export function getStreamToolsStoreOptions(
  override?: string,
): StreamToolsStoreOptions {
  const baseDir =
    override ||
    (typeof process !== "undefined" && process.env?.MIXCHAT_STREAM_TOOLS_DIR) ||
    join(process.cwd(), "data", "stream-tools");
  return { baseDir };
}
