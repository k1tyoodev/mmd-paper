import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const stylesheetPath = fileURLToPath(new URL("../src/styles/global.css", import.meta.url));

function readRuleBody(stylesheet: string, selector: string): string {
  const rulePattern = new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{([^}]*)\\}`, "u");
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
