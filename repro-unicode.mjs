import { renderMermaidASCII } from 'beautiful-mermaid';

const code = `stateDiagram-v2
    [*] --> A
    A --> [*]`;

const result = renderMermaidASCII(code, {
  useAscii: false,
  colorMode: 'none',
  theme: {
    fg: '#171717',
    border: '#eaeaea',
    line: '#4d4d4d',
    arrow: '#006bff',
    accent: '#006bff',
    bg: '#ffffff',
    corner: '#4d4d4d',
    junction: '#eaeaea',
  },
});

console.log(result);
