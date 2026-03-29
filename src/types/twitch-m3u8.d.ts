declare module "twitch-m3u8" {
  export function getStream(channel: string, raw?: boolean): Promise<string>;
  export default {
    getStream,
  };
}
