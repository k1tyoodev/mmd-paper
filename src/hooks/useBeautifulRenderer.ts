import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AsciiRenderOptions as BeautifulAsciiRenderOptions } from "beautiful-mermaid";
import type { RenderOptions as BeautifulRenderOptions } from "beautiful-mermaid";
import { BASE_FONT_FAMILY, MONO_FONT_FAMILY, type DiagramTokens } from "@/theme/vercel";
import { parseHexColor, toHexChannel } from "@/utils/color";
import { normalizeTextOutputHtmlForDisplay } from "@/utils/textOutputDisplay";
import type { RenderConfig, RenderOutputMode, RenderState, TextColorMode } from "@/types/playground";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isRendererLoadError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror")
  );
}

type BeautifulMermaidRuntime = typeof import("beautiful-mermaid");
type AsciiRenderOptions = BeautifulAsciiRenderOptions;
type RenderOptions = BeautifulRenderOptions;
type AsciiThemeValues = Required<NonNullable<AsciiRenderOptions["theme"]>>;

type SvgRenderResult = {
  svg: string;
  usedFallback: boolean;
};

// Layout and text spacing are fixed; the options panel that once exposed these
// was removed, so the former defaults are inlined here.
const RENDER_PADDING = 40;
const RENDER_NODE_SPACING = 24;
const RENDER_LAYER_SPACING = 40;
const RENDER_COMPONENT_SPACING = 24;
const TEXT_PADDING_X = 5;
const TEXT_PADDING_Y = 5;
const TEXT_BOX_BORDER_PADDING = 1;

const EDGE_LABEL_FONT_SIZE = 11;
const MONO_FONT_CSS = `'${MONO_FONT_FAMILY}'`;

// Fixed "soft" subgraph treatment (the only preset the UI ever shipped).
const SOFT_SUBGRAPH_RULES = `
  .subgraph > rect:nth-of-type(1) {
    fill: color-mix(in srgb, var(--fg) 2.5%, var(--bg));
    fill-opacity: 0.96;
  }
  .subgraph > rect:nth-of-type(2), .subgraph > .subgraph-header-shape {
    fill: color-mix(in srgb, var(--fg) 9%, var(--bg));
  }
  .subgraph > text {
    font-weight: 600;
  }`;

let beautifulMermaidRuntimePromise: Promise<BeautifulMermaidRuntime> | null = null;

function loadBeautifulMermaid(): Promise<BeautifulMermaidRuntime> {
  if (!beautifulMermaidRuntimePromise) {
    beautifulMermaidRuntimePromise = import("beautiful-mermaid");
  }

  return beautifulMermaidRuntimePromise;
}

export async function preloadRenderer(): Promise<void> {
  await loadBeautifulMermaid();
}

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function toHexColor(color: RgbColor): string {
  return `#${toHexChannel(color.r)}${toHexChannel(color.g)}${toHexChannel(color.b)}`;
}

function mixHexColors(fg: string, bg: string, percent: number): string | null {
  const fgColor = parseHexColor(fg);
  const bgColor = parseHexColor(bg);
  if (!fgColor || !bgColor) {
    return null;
  }

  const ratio = percent / 100;
  return toHexColor({
    r: fgColor.r * ratio + bgColor.r * (1 - ratio),
    g: fgColor.g * ratio + bgColor.g * (1 - ratio),
    b: fgColor.b * ratio + bgColor.b * (1 - ratio),
  });
}

function resolveHexColor(color: string): string | null {
  if (color.trim().toLowerCase() === "transparent") {
    return null;
  }

  const rgb = parseHexColor(color);
  return rgb ? toHexColor(rgb) : null;
}

function buildAsciiThemeFromTokens(tokens: DiagramTokens): AsciiThemeValues {
  return {
    fg: tokens.fg,
    border: tokens.border,
    line: tokens.line,
    arrow: tokens.accent,
    accent: tokens.accent,
    bg: tokens.bg,
    corner: tokens.line,
    junction: tokens.border,
  };
}

function sanitizeAsciiTheme(theme: AsciiThemeValues): AsciiThemeValues {
  const bg = resolveHexColor(theme.bg) ?? "#ffffff";
  const fg = resolveHexColor(theme.fg) ?? "#111111";
  const lineFallback = mixHexColors(fg, bg, 50) ?? fg;
  const borderFallback = mixHexColors(fg, bg, 20) ?? fg;
  const arrowFallback = mixHexColors(fg, bg, 85) ?? fg;

  const line = resolveHexColor(theme.line) ?? lineFallback;
  const border = resolveHexColor(theme.border) ?? borderFallback;
  const arrow = resolveHexColor(theme.arrow) ?? arrowFallback;

  return {
    fg,
    border,
    line,
    arrow,
    accent: arrow,
    bg,
    corner: line,
    junction: border,
  };
}

function buildAsciiRenderOptions(
  theme: AsciiThemeValues,
  colorMode: TextColorMode,
  outputMode: Exclude<RenderOutputMode, "svg">,
): AsciiRenderOptions {
  return {
    useAscii: outputMode === "ascii",
    colorMode,
    paddingX: TEXT_PADDING_X,
    paddingY: TEXT_PADDING_Y,
    boxBorderPadding: TEXT_BOX_BORDER_PADDING,
    theme,
  };
}

function resolveTextTheme(tokens: DiagramTokens): AsciiThemeValues {
  return sanitizeAsciiTheme(buildAsciiThemeFromTokens(tokens));
}

function stripCommonLeadingIndent(source: string): string {
  const lines = source.split("\n");
  let minIndent = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const indent = line.match(/^ */u)?.[0].length ?? 0;
    minIndent = Math.min(minIndent, indent);
  }

  if (!Number.isFinite(minIndent) || minIndent <= 0) {
    return source;
  }

  return lines.map((line) => line.slice(minIndent)).join("\n");
}

function resolveRenderSource(codeValue: string): string {
  return stripCommonLeadingIndent(codeValue.trim());
}

function renderTextOutput(
  runtime: BeautifulMermaidRuntime,
  source: string,
  tokens: DiagramTokens,
  colorMode: TextColorMode,
  outputMode: Exclude<RenderOutputMode, "svg">,
): string {
  return runtime.renderMermaidASCII(
    source,
    buildAsciiRenderOptions(resolveTextTheme(tokens), colorMode, outputMode),
  );
}

function buildBeautifulMermaidOptions(config: RenderConfig): RenderOptions {
  const { tokens } = config;
  return {
    bg: tokens.bg,
    fg: tokens.fg,
    line: tokens.line,
    accent: tokens.accent,
    muted: tokens.muted,
    surface: tokens.surface,
    border: tokens.border,
    font: BASE_FONT_FAMILY,
    transparent: config.transparent,
    padding: RENDER_PADDING,
    nodeSpacing: RENDER_NODE_SPACING,
    layerSpacing: RENDER_LAYER_SPACING,
    componentSpacing: RENDER_COMPONENT_SPACING,
  };
}

function isRetryableLayoutError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return /scanline constraint|invalid hitboxes/i.test(message);
}

function buildSafeLayoutOptions(base: RenderOptions): RenderOptions {
  return {
    ...base,
    padding: Math.max(base.padding ?? 0, 36),
    nodeSpacing: Math.max(base.nodeSpacing ?? 0, 24),
    layerSpacing: Math.max(base.layerSpacing ?? 0, 48),
    componentSpacing: Math.max(base.componentSpacing ?? 0, 32),
  };
}

function renderSvgWithFallback(
  runtime: BeautifulMermaidRuntime,
  source: string,
  renderOptions: RenderOptions,
): SvgRenderResult {
  try {
    return {
      svg: runtime.renderMermaidSVG(source, renderOptions),
      usedFallback: false,
    };
  } catch (error: unknown) {
    if (!isRetryableLayoutError(error)) {
      throw error;
    }
  }

  return {
    svg: runtime.renderMermaidSVG(source, buildSafeLayoutOptions(renderOptions)),
    usedFallback: true,
  };
}

// Fixed "subtle" edge-label treatment (the only styled preset the UI shipped).
function applyEdgeLabelStyle(doc: XMLDocument): void {
  const groups = doc.querySelectorAll<SVGGElement>("g.edge-label");
  for (const group of Array.from(groups)) {
    const textNodes = group.querySelectorAll<SVGTextElement>("text");
    for (const textNode of Array.from(textNodes)) {
      textNode.setAttribute("font-size", String(EDGE_LABEL_FONT_SIZE));
      textNode.setAttribute("stroke", "none");
      textNode.setAttribute("paint-order", "normal");
      textNode.setAttribute("stroke-width", "0");
      textNode.setAttribute("fill", "var(--_text-muted)");
    }

    const backgroundRect = group.querySelector<SVGRectElement>("rect");
    if (!backgroundRect) {
      continue;
    }

    backgroundRect.setAttribute("rx", "5");
    backgroundRect.setAttribute("ry", "5");
    backgroundRect.setAttribute("fill", "var(--bg)");
    backgroundRect.setAttribute("stroke", "color-mix(in srgb, var(--fg) 14%, var(--bg))");
    backgroundRect.setAttribute("stroke-width", "1");
  }
}

function buildVisualCss(): string {
  return `
  .mono {
    font-family: ${MONO_FONT_CSS}, 'SF Mono', 'Fira Code', ui-monospace, monospace !important;
  }

  .edge,
  .class-relationship,
  .er-relationship,
  .message > line,
  .message > polyline,
  .message > path {
    stroke: var(--_line) !important;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .lifeline {
    stroke: var(--_line) !important;
  }

  .node > rect,
  .node > ellipse,
  .node > polygon,
  .node > path,
  .class-node > rect,
  .class-node > .class-header-shape,
  .entity > rect,
  .entity > .entity-header-shape,
  .actor > rect,
  .activation,
  .subgraph > .subgraph-header-shape,
  .subgraph > rect {
    stroke: var(--_node-stroke) !important;
  }

  .node > line,
  .class-node > line,
  .entity > line {
    stroke: var(--_inner-stroke) !important;
  }

  ${SOFT_SUBGRAPH_RULES}`;
}

function applyVisualOverrides(svg: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) {
    return svg;
  }

  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    return svg;
  }

  applyEdgeLabelStyle(document);

  const existingStyle = root.querySelector("style[data-playground-visual-overrides]");
  existingStyle?.remove();

  const styleElement = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleElement.setAttribute("data-playground-visual-overrides", "");
  styleElement.textContent = buildVisualCss();
  root.append(styleElement);

  return new XMLSerializer().serializeToString(document);
}

export function useBeautifulRenderer(code: string, config: RenderConfig, delayMs = 300) {
  const [renderState, setRenderState] = useState<RenderState>({
    svg: null,
    asciiHtml: null,
    textOutputMode: null,
    error: null,
    durationMs: null,
    renderId: 0,
  });
  const codeRef = useRef(code);
  const configRef = useRef(config);
  const renderStateRef = useRef(renderState);
  const latestRenderToken = useRef(0);
  const latestScheduleToken = useRef(0);
  const timerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    codeRef.current = code;
    configRef.current = config;
  }, [code, config]);

  useEffect(() => {
    renderStateRef.current = renderState;
  }, [renderState]);

  const commitRenderState = useCallback((nextState: RenderState): void => {
    renderStateRef.current = nextState;
    setRenderState(nextState);
  }, []);

  const renderNow = useCallback(async (): Promise<void> => {
    const renderToken = latestRenderToken.current + 1;
    latestRenderToken.current = renderToken;
    const configValue = configRef.current;

    const source = resolveRenderSource(codeRef.current);

    if (!source) {
      if (renderToken !== latestRenderToken.current) {
        return;
      }

      commitRenderState({
        svg: null,
        asciiHtml: null,
        textOutputMode: null,
        error: null,
        durationMs: 0,
        renderId: renderToken,
      });
      return;
    }

    const previousSvg = renderStateRef.current.svg;
    const previousAsciiHtml = renderStateRef.current.asciiHtml;
    const previousTextOutputMode = renderStateRef.current.textOutputMode;

    try {
      const runtime = await loadBeautifulMermaid();
      if (renderToken !== latestRenderToken.current) {
        return;
      }
      const startedAt = performance.now();

      if (configValue.outputMode === "svg") {
        const renderOptions = buildBeautifulMermaidOptions(configValue);
        const result = renderSvgWithFallback(runtime, source, renderOptions);
        const styledSvg = applyVisualOverrides(result.svg);

        if (result.usedFallback) {
          // Keep this visible in devtools without interrupting successful output.
          console.warn("[playground] layout fallback applied after ELK scanline hitbox failure");
        }

        commitRenderState({
          svg: styledSvg,
          asciiHtml: previousAsciiHtml,
          textOutputMode: previousTextOutputMode,
          error: null,
          durationMs: Math.round(performance.now() - startedAt),
          renderId: renderToken,
        });
      } else {
        const asciiTheme = resolveTextTheme(configValue.tokens);
        const renderedTextHtml = runtime.renderMermaidASCII(
          source,
          buildAsciiRenderOptions(asciiTheme, "html", configValue.outputMode),
        );
        const asciiHtml = normalizeTextOutputHtmlForDisplay(
          renderedTextHtml,
          configValue.outputMode,
        );

        commitRenderState({
          svg: previousSvg,
          asciiHtml,
          textOutputMode: configValue.outputMode,
          error: null,
          durationMs: Math.round(performance.now() - startedAt),
          renderId: renderToken,
        });
      }
    } catch (error: unknown) {
      if (renderToken !== latestRenderToken.current) {
        return;
      }

      const errorMessage = isRendererLoadError(error)
        ? `Failed to load renderer runtime: ${getErrorMessage(error)}`
        : getErrorMessage(error);
      commitRenderState({
        svg: previousSvg,
        asciiHtml: previousAsciiHtml,
        textOutputMode: previousTextOutputMode,
        error: errorMessage,
        durationMs: null,
        renderId: renderToken,
      });
    }
  }, [commitRenderState]);

  const cancelScheduledRender = useCallback((): void => {
    latestScheduleToken.current += 1;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleRender = useCallback((): void => {
    const scheduleToken = latestScheduleToken.current + 1;
    latestScheduleToken.current = scheduleToken;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (scheduleToken !== latestScheduleToken.current) {
        return;
      }
      void renderNow();
    }, delayMs);
  }, [delayMs, renderNow]);

  const renderTextByColorMode = useCallback(
    async (
      colorMode: TextColorMode,
      outputMode: Exclude<RenderOutputMode, "svg">,
    ): Promise<string | null> => {
      const source = resolveRenderSource(codeRef.current);
      if (!source) {
        return null;
      }

      const runtime = await loadBeautifulMermaid();
      const text = renderTextOutput(
        runtime,
        source,
        configRef.current.tokens,
        colorMode,
        outputMode,
      );
      return colorMode === "html" ? text : stripCommonLeadingIndent(text);
    },
    [],
  );

  useEffect(() => {
    scheduleRender();
  }, [code, scheduleRender]);

  useLayoutEffect(() => {
    cancelScheduledRender();
    void renderNow();
  }, [cancelScheduledRender, config, renderNow]);

  useEffect(
    () => () => {
      cancelScheduledRender();
      latestRenderToken.current += 1;
    },
    [cancelScheduledRender],
  );

  return {
    renderState,
    renderTextByColorMode,
  };
}
