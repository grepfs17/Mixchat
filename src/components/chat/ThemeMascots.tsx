import type { ChatTheme } from "../../lib/types";

interface ThemeMascotsProps {
  chatTheme: ChatTheme;
}

export default function ThemeMascots({ chatTheme }: ThemeMascotsProps) {
  if (chatTheme !== "mushu" && chatTheme !== "lunita") return null;

  return (
    <>
      {chatTheme === "mushu" && (
        <>
          <img
            src="/themes/Mushu/mushu.webp"
            alt="Mushu"
            className="mushu-theme-mascot"
          />
          <img
            src="/themes/Mushu/mushuKnife.webp"
            alt="Mushu Knife"
            className="mushu-theme-knife"
          />
        </>
      )}
      {chatTheme === "lunita" && (
        <>
          <img
            src="/themes/Lunita/lunateDrama.webp"
            alt="Lunita Drama"
            className="lunita-theme-drama"
          />
          <img
            src="/themes/Lunita/lunateLurk.webp"
            alt="Lunita Lurk"
            className="lunita-theme-lurk"
          />
        </>
      )}
    </>
  );
}
