import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { HighlighterGeneric } from "@shikijs/core";
import type { editor as MonacoEditorNs } from "monaco-editor";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import {
  MONACO_THEME_BY_SCHEME,
  SHIKI_MONACO_THEMES,
  type MonacoShikiTheme,
} from "@/constants/monacoThemes";
import { preloadShikiEngine } from "@/utils/shikiEngine";

const MERMAID_LANGUAGE_ID = "mermaid";

type MonacoModule = typeof import("monaco-editor");
type MonacoEditorInstance = MonacoEditorNs.IStandaloneCodeEditor;
type ShikiHighlighter = HighlighterGeneric<"mermaid", MonacoShikiTheme>;
type WorkerConstructor = new () => Worker;

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (_workerId: string, label: string) => Worker;
    };
  }
}

export type MermaidEditorHandle = {
  focus: () => void;
  focusToEnd: () => void;
  layout: () => void;
  redo: () => void;
  undo: () => void;
};

export type EditorHistoryState = {
  canRedo: boolean;
  canUndo: boolean;
};

type MermaidEditorProps = {
  value: string;
  fontSize: number;
  fontFamily: string;
  colorScheme: "light" | "dark";
  surfaceColor: string;
  focusToEndToken: number;
  onChange: (value: string) => void;
  onHistoryStateChange: (value: EditorHistoryState) => void;
};

let monacoPromise: Promise<MonacoModule> | null = null;
let highlighter: ShikiHighlighter | null = null;
let highlighterPromise: Promise<ShikiHighlighter> | null = null;
let mermaidLanguageConfigured = false;

const MONACO_THEME_LOADERS: Record<MonacoShikiTheme, () => Promise<{ default: unknown }>> = {
  "one-light": () => import("@shikijs/themes/one-light"),
  "one-dark-pro": () => import("@shikijs/themes/one-dark-pro"),
};

const MONACO_WORKERS: Record<string, WorkerConstructor> = {
  css: CssWorker,
  handlebars: HtmlWorker,
  html: HtmlWorker,
  javascript: TsWorker,
  json: JsonWorker,
  less: CssWorker,
  razor: HtmlWorker,
  scss: CssWorker,
  typescript: TsWorker,
};

function ensureMonacoEnvironment(): void {
  window.MonacoEnvironment = {
    getWorker: (_workerId, label) => {
      const WorkerClass = MONACO_WORKERS[label] ?? EditorWorker;
      return new WorkerClass();
    },
  };
}

function getMonacoTheme(colorScheme: "light" | "dark"): MonacoShikiTheme {
  return MONACO_THEME_BY_SCHEME[colorScheme];
}

function ensureMermaidLanguageConfigured(monacoModule: MonacoModule): void {
  if (mermaidLanguageConfigured) {
    return;
  }

  const { languages } = monacoModule;
  if (!languages.getLanguages().some(({ id }) => id === MERMAID_LANGUAGE_ID)) {
    languages.register({ id: MERMAID_LANGUAGE_ID });
  }

  languages.setLanguageConfiguration(MERMAID_LANGUAGE_ID, {
    comments: { lineComment: "%%" },
    brackets: [
      ["[", "]"],
      ["(", ")"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: '"', close: '"' },
    ],
  });

  mermaidLanguageConfigured = true;
}

async function loadShikiHighlighter(): Promise<ShikiHighlighter> {
  if (highlighter) {
    return highlighter;
  }

  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createBundledHighlighter }, engine] = await Promise.all([
        import("@shikijs/core"),
        preloadShikiEngine(),
      ]);

      const createHighlighter = createBundledHighlighter({
        langs: {
          mermaid: () => import("@shikijs/langs/mermaid"),
        },
        themes: MONACO_THEME_LOADERS as Record<MonacoShikiTheme, never>,
        engine: () => engine,
      });

      return createHighlighter({
        themes: SHIKI_MONACO_THEMES,
        langs: [],
      });
    })().catch((error) => {
      highlighterPromise = null;
      throw error;
    });
  }

  return highlighterPromise;
}

async function loadMonacoRuntime(): Promise<MonacoModule> {
  if (monacoPromise) {
    return monacoPromise;
  }

  monacoPromise = (async () => {
    ensureMonacoEnvironment();

    const [monaco, { shikiToMonaco }, { default: mermaidLanguages }] = await Promise.all([
      import("monaco-editor"),
      import("@shikijs/monaco"),
      import("@shikijs/langs/mermaid"),
    ]);

    ensureMermaidLanguageConfigured(monaco);

    if (!highlighter) {
      const [mermaidGrammar] = mermaidLanguages;
      if (!mermaidGrammar) {
        throw new Error("Failed to load Mermaid grammar");
      }

      highlighter = await loadShikiHighlighter();
      await highlighter.loadLanguage({
        ...mermaidGrammar,
        scopeName: "source.mermaid",
        injectionSelector: undefined,
        patterns: [{ include: "#mermaid" }],
      } as never);
      shikiToMonaco(highlighter, monaco);
    }

    return monaco;
  })().catch((error) => {
    monacoPromise = null;
    throw error;
  });

  return monacoPromise;
}

const MermaidEditor = forwardRef<MermaidEditorHandle, MermaidEditorProps>(
  function MermaidEditor(props, ref) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const monacoModuleRef = useRef<MonacoModule | null>(null);
    const editorRef = useRef<MonacoEditorInstance | null>(null);
    const propsRef = useRef(props);
    const lastHandledFocusToEndToken = useRef(-1);
    const [isReady, setIsReady] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);

    useEffect(() => {
      propsRef.current = props;
    }, [props]);

    const focusEditor = (): void => {
      editorRef.current?.focus();
    };

    const focusEditorToEnd = (): void => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const model = editor.getModel();
      if (!model) {
        focusEditor();
        return;
      }

      const lineNumber = model.getLineCount();
      const column = model.getLineMaxColumn(lineNumber);
      editor.focus();
      editor.setPosition({ lineNumber, column });
      editor.revealPositionInCenterIfOutsideViewport({ lineNumber, column });
    };

    const layoutEditor = (): void => {
      editorRef.current?.layout();
    };

    const emitHistoryState = (): void => {
      const model = editorRef.current?.getModel();
      propsRef.current.onHistoryStateChange({
        canRedo: model?.canRedo() ?? false,
        canUndo: model?.canUndo() ?? false,
      });
    };

    const runHistoryCommand = (command: "redo" | "undo"): void => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      editor.trigger("preview-toolbar", command, null);
      editor.focus();
    };

    useImperativeHandle(ref, () => ({
      focus: focusEditor,
      focusToEnd: focusEditorToEnd,
      layout: layoutEditor,
      redo: () => runHistoryCommand("redo"),
      undo: () => runHistoryCommand("undo"),
    }));

    useEffect(() => {
      let mounted = true;
      let modelDisposable: { dispose: () => void } | null = null;
      let fontLoadingDoneHandler: (() => void) | null = null;

      async function mountEditor(): Promise<void> {
        if (!rootRef.current) {
          return;
        }

        try {
          const monacoInstance = await loadMonacoRuntime();
          if (!mounted || !rootRef.current) {
            return;
          }

          monacoModuleRef.current = monacoInstance;
          const { editor: monacoEditor } = monacoInstance;
          const initialProps = propsRef.current;
          const editor = monacoEditor.create(rootRef.current, {
            value: initialProps.value,
            language: MERMAID_LANGUAGE_ID,
            theme: getMonacoTheme(initialProps.colorScheme),
            automaticLayout: true,
            detectIndentation: false,
            insertSpaces: true,
            tabSize: 2,
            fontSize: initialProps.fontSize,
            fontFamily: initialProps.fontFamily,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbersMinChars: 3,
            wordWrap: "on",
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            padding: {
              top: 14,
              bottom: 14,
            },
          });

          const model = editor.getModel();
          if (model) {
            model.updateOptions({
              insertSpaces: true,
              indentSize: 2,
              tabSize: 2,
            });
            monacoEditor.setModelLanguage(model, MERMAID_LANGUAGE_ID);
          }

          editorRef.current = editor;
          modelDisposable = editor.onDidChangeModelContent(() => {
            propsRef.current.onChange(editor.getValue());
            emitHistoryState();
          });

          setIsReady(true);
          emitHistoryState();
          requestAnimationFrame(() => {
            monacoInstance.editor.remeasureFonts();
            editor.layout();
          });

          fontLoadingDoneHandler = () => {
            requestAnimationFrame(() => {
              monacoInstance.editor.remeasureFonts();
              editor.layout();
            });
          };
          document.fonts.addEventListener("loadingdone", fontLoadingDoneHandler);
          void document.fonts.ready.then(fontLoadingDoneHandler);
        } catch (error) {
          setInitError(error instanceof Error ? error.message : String(error));
        }
      }

      void mountEditor();

      return () => {
        mounted = false;
        if (fontLoadingDoneHandler) {
          document.fonts.removeEventListener("loadingdone", fontLoadingDoneHandler);
        }
        modelDisposable?.dispose();
        editorRef.current?.dispose();
        editorRef.current = null;
        monacoModuleRef.current = null;
        propsRef.current.onHistoryStateChange({ canRedo: false, canUndo: false });
      };
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || editor.getValue() === props.value) {
        return;
      }

      editor.setValue(props.value);
    }, [props.value]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || props.focusToEndToken === lastHandledFocusToEndToken.current) {
        return;
      }

      lastHandledFocusToEndToken.current = props.focusToEndToken;
      focusEditorToEnd();
    }, [props.focusToEndToken]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      editor.updateOptions({ fontSize: props.fontSize, fontFamily: props.fontFamily });
      requestAnimationFrame(() => {
        monacoModuleRef.current?.editor.remeasureFonts();
        editor.layout();
      });
    }, [props.fontFamily, props.fontSize]);

    useEffect(() => {
      monacoModuleRef.current?.editor.setTheme(getMonacoTheme(props.colorScheme));
    }, [props.colorScheme]);

    function handleRootPointerDown(event: React.PointerEvent<HTMLElement>): void {
      if (event.button !== 0) {
        return;
      }

      requestAnimationFrame(focusEditor);
    }

    return (
      <section className="panel-shell" aria-label="Mermaid source editor">
        <div className="panel-header">
          <h2>Editor</h2>
        </div>
        <div
          className="editor-shell"
          style={{ "--editor-bg": props.surfaceColor } as React.CSSProperties}
          tabIndex={-1}
          onPointerDownCapture={handleRootPointerDown}
        >
          <div ref={rootRef} className="editor-root" />
          {!isReady && !initError ? (
            <div className="editor-overlay" aria-busy="true" aria-live="polite">
              <div className="skeleton-stack" aria-hidden="true">
                <span style={{ width: "44%" }} />
                <span style={{ width: "66%" }} />
                <span style={{ width: "52%" }} />
                <span style={{ width: "72%" }} />
                <span style={{ width: "58%" }} />
              </div>
            </div>
          ) : null}
          {initError ? (
            <div className="editor-overlay error">Failed to load Monaco: {initError}</div>
          ) : null}
        </div>
      </section>
    );
  },
);

export default MermaidEditor;
