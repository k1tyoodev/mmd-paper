const MONACO_SHIKI_THEME_VALUES = ["one-light", "one-dark-pro"] as const;

export type MonacoShikiTheme = (typeof MONACO_SHIKI_THEME_VALUES)[number];

export const SHIKI_MONACO_THEMES: MonacoShikiTheme[] = [...MONACO_SHIKI_THEME_VALUES];

export const MONACO_THEME_BY_SCHEME: Record<"light" | "dark", MonacoShikiTheme> = {
  light: "one-light",
  dark: "one-dark-pro",
};
