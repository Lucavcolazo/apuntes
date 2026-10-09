// Copia los recursos que pdf.js carga en runtime (fuentes estándar, cmaps, wasm) a public/pdfjs.
import { cpSync, existsSync } from 'node:fs';

const src = 'node_modules/pdfjs-dist';
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (existsSync(`${src}/${dir}`)) cpSync(`${src}/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
}
