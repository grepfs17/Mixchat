declare module "twemoji" {
  interface TwemojiOptions {
    /** Base URL for emoji assets. Default: MaxCDN. */
    base?: string;
    /** Asset folder. Default: "72x72". */
    folder?: string;
    /** File extension. Default: ".png". */
    ext?: string;
    /** Image size. */
    size?: string;
    /** CSS class name for generated <img> tags. Default: "emoji". */
    className?: string;
    /** Callback for setting custom attributes on the <img> element. */
    attributes?: (icon: string, variant: string) => Record<string, string>;
    /** Callback to handle failed image loads. */
    onerror?: (event: Event) => void;
    /** Callback to build a custom replacement string. */
    callback?: (
      icon: string,
      options: TwemojiOptions,
      variant: string,
    ) => string | false;
  }

  interface Twemoji {
    parse(what: string | HTMLElement, options?: TwemojiOptions): string;
    replace(
      text: string,
      callback: (icon: string, options: TwemojiOptions) => string,
    ): string;
    test(text: string): boolean;
    convert: {
      toCodePoint(utf16: string): string;
      fromCodePoint(...codepoints: number[]): string;
    };
  }

  const twemoji: Twemoji;
  export default twemoji;
}
