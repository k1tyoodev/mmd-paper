// Vercel Geist design system tokens lifted from docs/design/design.md (Light)
// and docs/design/design.dark.md (Dark). The app shell consumes the full token
// object through CSS variables; the Mermaid renderer receives the distilled
// diagram palette below.

export type ColorMode = "light" | "dark";

type ColorScale = "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "1000";

export interface GeistColorTokens {
  primary: string;
  secondary: string;
  tertiary: string;
  neutral: string;
  background100: string;
  background200: string;
  gray: Record<ColorScale, string>;
  grayAlpha: Record<ColorScale, string>;
  blue: Record<ColorScale, string>;
  red: Record<ColorScale, string>;
  amber: Record<ColorScale, string>;
  green: Record<ColorScale, string>;
  teal: Record<ColorScale, string>;
  purple: Record<ColorScale, string>;
  pink: Record<ColorScale, string>;
}

export interface DiagramTokens {
  bg: string;
  fg: string;
  line: string;
  accent: string;
  muted: string;
  surface: string;
  border: string;
  solidBorder: string;
}

export const GEIST_COLOR_TOKENS: Record<ColorMode, GeistColorTokens> = {
  light: {
    primary: "#171717",
    secondary: "#4d4d4d",
    tertiary: "#006bff",
    neutral: "#f2f2f2",
    background100: "#ffffff",
    background200: "#fafafa",
    gray: {
      100: "#f2f2f2",
      200: "#ebebeb",
      300: "#e6e6e6",
      400: "#eaeaea",
      500: "#c9c9c9",
      600: "#a8a8a8",
      700: "#8f8f8f",
      800: "#7d7d7d",
      900: "#4d4d4d",
      1000: "#171717",
    },
    grayAlpha: {
      100: "#0000000d",
      200: "#00000015",
      300: "#0000001a",
      400: "#00000014",
      500: "#00000036",
      600: "#0000003d",
      700: "#00000070",
      800: "#00000082",
      900: "#000000b3",
      1000: "#000000e8",
    },
    blue: {
      100: "#f0f7ff",
      200: "#e9f4ff",
      300: "#dfefff",
      400: "#cae7ff",
      500: "#94ccff",
      600: "#48aeff",
      700: "#006bff",
      800: "#0059ec",
      900: "#005ff2",
      1000: "#002359",
    },
    red: {
      100: "#ffeeef",
      200: "#ffe8ea",
      300: "#ffe3e4",
      400: "#ffd7d6",
      500: "#ffb1b3",
      600: "#ff676d",
      700: "#fc0035",
      800: "#ea001d",
      900: "#d8001b",
      1000: "#47000c",
    },
    amber: {
      100: "#fff6de",
      200: "#fff4cf",
      300: "#fff1c1",
      400: "#ffdc73",
      500: "#ffc543",
      600: "#ffa600",
      700: "#ffae00",
      800: "#ff9300",
      900: "#aa4d00",
      1000: "#561900",
    },
    green: {
      100: "#ecfdec",
      200: "#e5fce7",
      300: "#d3fad1",
      400: "#b9f5bc",
      500: "#82eb8d",
      600: "#4ce15e",
      700: "#28a948",
      800: "#279141",
      900: "#107d32",
      1000: "#003a00",
    },
    teal: {
      100: "#defffb",
      200: "#ddfef6",
      300: "#ccf9f1",
      400: "#b1f7ec",
      500: "#52f0db",
      600: "#00e3c4",
      700: "#00ac96",
      800: "#00927f",
      900: "#007f70",
      1000: "#003f34",
    },
    purple: {
      100: "#faf0ff",
      200: "#f9f0ff",
      300: "#f6e8ff",
      400: "#f2d9ff",
      500: "#dfa7ff",
      600: "#c979ff",
      700: "#a000f8",
      800: "#8500d1",
      900: "#7d00cc",
      1000: "#2f004e",
    },
    pink: {
      100: "#ffe8f6",
      200: "#ffe8f3",
      300: "#ffdfeb",
      400: "#ffd3e1",
      500: "#fdb3cc",
      600: "#f97ea7",
      700: "#f22782",
      800: "#e4106e",
      900: "#c41562",
      1000: "#460523",
    },
  },
  dark: {
    primary: "#ededed",
    secondary: "#a0a0a0",
    tertiary: "#006efe",
    neutral: "#1a1a1a",
    background100: "#000000",
    background200: "#000000",
    gray: {
      100: "#1a1a1a",
      200: "#1f1f1f",
      300: "#292929",
      400: "#2e2e2e",
      500: "#454545",
      600: "#878787",
      700: "#8f8f8f",
      800: "#7d7d7d",
      900: "#a0a0a0",
      1000: "#ededed",
    },
    grayAlpha: {
      100: "#ffffff12",
      200: "#ffffff17",
      300: "#ffffff21",
      400: "#ffffff24",
      500: "#ffffff3d",
      600: "#ffffff82",
      700: "#ffffff8a",
      800: "#ffffff78",
      900: "#ffffff9c",
      1000: "#ffffffeb",
    },
    blue: {
      100: "#06193a",
      200: "#022248",
      300: "#002f62",
      400: "#003674",
      500: "#00418b",
      600: "#0090ff",
      700: "#006efe",
      800: "#005be7",
      900: "#47a8ff",
      1000: "#eaf6ff",
    },
    red: {
      100: "#330a11",
      200: "#440d13",
      300: "#5d0e17",
      400: "#6f101b",
      500: "#88151f",
      600: "#f32e40",
      700: "#f13242",
      800: "#e2162a",
      900: "#ff565f",
      1000: "#ffe9ed",
    },
    amber: {
      100: "#2a1700",
      200: "#361900",
      300: "#502800",
      400: "#5b3000",
      500: "#703e00",
      600: "#ed9a00",
      700: "#ffae00",
      800: "#ff9300",
      900: "#ff9300",
      1000: "#fff3d5",
    },
    green: {
      100: "#002608",
      200: "#00320b",
      300: "#003a0e",
      400: "#004615",
      500: "#006717",
      600: "#00952d",
      700: "#00ac3a",
      800: "#009432",
      900: "#00ca50",
      1000: "#d8ffe4",
    },
    teal: {
      100: "#00231b",
      200: "#002b22",
      300: "#003d34",
      400: "#004035",
      500: "#006354",
      600: "#009e86",
      700: "#00aa95",
      800: "#00927f",
      900: "#00cfb7",
      1000: "#cbfff5",
    },
    purple: {
      100: "#290c33",
      200: "#341142",
      300: "#47185e",
      400: "#541a76",
      500: "#642290",
      600: "#9440d5",
      700: "#9440d5",
      800: "#7d2bba",
      900: "#c472fb",
      1000: "#fbecff",
    },
    pink: {
      100: "#310d1e",
      200: "#420c25",
      300: "#571032",
      400: "#5d0c34",
      500: "#76063f",
      600: "#ba0056",
      700: "#f12b82",
      800: "#e7006d",
      900: "#ff4d8d",
      1000: "#ffe9f4",
    },
  },
};

// Diagram palette per color mode.
//   bg           background-100   page/card surface
//   fg           gray-1000        primary text/icons
//   line         gray-900         connectors
//   accent       blue-700/900     links, focus, arrow heads
//   muted        gray-700         secondary/faint text
//   surface      background-200   subtle node fill
//   border       gray-alpha-400   default layered border
//   solidBorder  gray-400         fallback for renderers that need opaque hex
export const VERCEL_DIAGRAM_TOKENS: Record<ColorMode, DiagramTokens> = {
  light: {
    bg: GEIST_COLOR_TOKENS.light.background100,
    fg: GEIST_COLOR_TOKENS.light.gray[1000],
    line: GEIST_COLOR_TOKENS.light.gray[900],
    accent: GEIST_COLOR_TOKENS.light.blue[700],
    muted: GEIST_COLOR_TOKENS.light.gray[700],
    surface: GEIST_COLOR_TOKENS.light.background200,
    border: GEIST_COLOR_TOKENS.light.grayAlpha[400],
    solidBorder: GEIST_COLOR_TOKENS.light.gray[400],
  },
  dark: {
    bg: GEIST_COLOR_TOKENS.dark.background100,
    fg: GEIST_COLOR_TOKENS.dark.gray[1000],
    line: GEIST_COLOR_TOKENS.dark.gray[900],
    accent: GEIST_COLOR_TOKENS.dark.blue[900],
    muted: GEIST_COLOR_TOKENS.dark.gray[700],
    surface: GEIST_COLOR_TOKENS.dark.gray[100],
    border: GEIST_COLOR_TOKENS.dark.grayAlpha[400],
    solidBorder: GEIST_COLOR_TOKENS.dark.gray[400],
  },
};

export const BASE_FONT_FAMILY = "Geist";
export const MONO_FONT_FAMILY = "Geist Mono";
