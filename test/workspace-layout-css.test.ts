import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const stylesheetPath = fileURLToPath(new URL("../src/styles/global.css", import.meta.url));
const previewComponentPath = fileURLToPath(
  new URL("../src/components/MermaidPreview.tsx", import.meta.url),
);

function readRuleBody(stylesheet: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const rulePattern = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u");
  const match = rulePattern.exec(stylesheet);
  assert.ok(match?.[1], `Expected ${selector} rule to exist`);
  return match[1];
}

await test("keeps workspace panes on the first grid row when a hidden pane spans columns", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  const paneRule = readRuleBody(stylesheet, ".pane");
  const dividerRule = readRuleBody(stylesheet, ".divider");
  const editorHiddenPreviewRule = readRuleBody(
    stylesheet,
    ".workspace-editor-hidden .preview-pane",
  );
  const previewHiddenEditorRule = readRuleBody(
    stylesheet,
    ".workspace-preview-hidden .editor-pane",
  );

  assert.match(paneRule, /grid-row:\s*1;/u);
  assert.match(dividerRule, /grid-row:\s*1;/u);
  assert.match(editorHiddenPreviewRule, /grid-column:\s*1\s*\/\s*4;/u);
  assert.match(previewHiddenEditorRule, /grid-column:\s*1\s*\/\s*4;/u);
});

await test("keeps editor scrollbar radius aligned with the preview output switcher", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  const rootRule = readRuleBody(stylesheet, ":root");

  assert.match(rootRule, /--control-radius:\s*6px;/u);
  assert.match(
    stylesheet,
    /\.preview-toolbar-right\s*\{[^}]*--segmented-control-radius:\s*var\(--control-radius\);/su,
  );
  assert.match(
    stylesheet,
    /\.monaco-editor \.scrollbar \.slider\s*\{[^}]*border-radius:\s*var\(--control-radius\);/su,
  );
});

await test("keeps viewport fullscreen controls inside the preview viewport", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  const fullscreenRule = readRuleBody(stylesheet, ".preview-viewport.preview-viewport-fullscreen");
  const controlsRule = readRuleBody(stylesheet, ".preview-viewport-controls");

  assert.match(fullscreenRule, /position:\s*fixed;/u);
  assert.match(fullscreenRule, /inset:\s*0;/u);
  assert.match(fullscreenRule, /width:\s*100vw;/u);
  assert.match(fullscreenRule, /height:\s*100vh;/u);
  assert.match(controlsRule, /position:\s*absolute;/u);
  assert.match(controlsRule, /right:\s*12px;/u);
  assert.match(controlsRule, /bottom:\s*12px;/u);
});

await test("keeps preview viewport hover colors in one atomic state change", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  const viewportButtonRule = readRuleBody(stylesheet, ".preview-viewport-controls button");
  const shortcutsCloseRule = readRuleBody(stylesheet, ".preview-shortcuts-close");

  assert.match(viewportButtonRule, /transition:\s*none;/u);
  assert.match(shortcutsCloseRule, /transition:\s*none;/u);
  assert.match(
    stylesheet,
    /\.preview-zoom-control \.zoom-percent-button:hover:enabled\s*\{[^}]*border-color:\s*var\(--border\);/su,
  );
});

await test("keeps a viewport inset beside the compact desktop zoom menu", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  const zoomMenuRule = readRuleBody(stylesheet, ".preview-zoom-menu");

  assert.match(zoomMenuRule, /right:\s*50%;/u);
  assert.match(zoomMenuRule, /width:\s*196px;/u);
  assert.match(zoomMenuRule, /transform:\s*translateX\(50%\) translateY\(5px\) scale\(0\.98\);/u);
});

await test("animates the zoom menu in and out without leaving hidden controls interactive", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  const previewComponent = await readFile(previewComponentPath, "utf8");
  const zoomMenuRule = readRuleBody(stylesheet, ".preview-zoom-menu");
  const openMenuRule = readRuleBody(stylesheet, '.preview-zoom-menu[data-state="open"]');

  assert.match(zoomMenuRule, /visibility:\s*hidden;/u);
  assert.match(zoomMenuRule, /opacity:\s*0;/u);
  assert.match(zoomMenuRule, /pointer-events:\s*none;/u);
  assert.match(zoomMenuRule, /transition:[^}]*opacity 140ms[^}]*transform 160ms/su);
  assert.match(openMenuRule, /visibility:\s*visible;/u);
  assert.match(openMenuRule, /opacity:\s*1;/u);
  assert.match(openMenuRule, /pointer-events:\s*auto;/u);
  assert.match(previewComponent, /data-state=\{isViewportMenuOpen \? "open" : "closed"\}/u);
  assert.match(previewComponent, /inert=\{!isViewportMenuOpen\}/u);
});

await test("keeps shortcut surfaces contained by the preview viewport", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  const panelRule = readRuleBody(stylesheet, ".preview-shortcuts-panel");
  const guardRule = readRuleBody(stylesheet, ".preview-shortcuts-interaction-guard");

  assert.match(panelRule, /position:\s*absolute;/u);
  assert.match(panelRule, /width:\s*320px;/u);
  assert.match(panelRule, /max-width:\s*80%;/u);
  assert.match(guardRule, /position:\s*absolute;/u);
  assert.match(guardRule, /inset:\s*0;/u);
  assert.match(stylesheet, /@media\s*\(max-width:\s*960px\)[\s\S]*\.preview-shortcuts-panel\s*\{/u);
  assert.match(stylesheet, /top:\s*max\(0px,\s*calc\(100%\s*-\s*75dvh\)\);/u);
  assert.match(stylesheet, /height:\s*auto;/u);
});

await test("keeps shortcut panel interactions out of canvas pointer capture", async () => {
  const previewComponent = await readFile(previewComponentPath, "utf8");
  const functionStart = previewComponent.indexOf("function isViewportChromeEvent");
  const functionEnd = previewComponent.indexOf("function isEditableTarget", functionStart);

  assert.notEqual(functionStart, -1, "Expected isViewportChromeEvent to exist");
  assert.notEqual(functionEnd, -1, "Expected isViewportChromeEvent boundary to exist");
  assert.match(previewComponent.slice(functionStart, functionEnd), /\.preview-shortcuts-panel/u);
  assert.match(
    previewComponent.slice(functionStart, functionEnd),
    /\.preview-shortcuts-interaction-guard/u,
  );
});
