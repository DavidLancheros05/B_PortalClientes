/**
 * Corrige requires emitidos con extensión .ts (moduleResolution nodenext) → .js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '../dist');

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith('.js')) {
      let c = fs.readFileSync(p, 'utf8');
      const n = c.replace(/next-shim\.ts/g, 'next-shim.js');
      if (n !== c) fs.writeFileSync(p, n);
    }
  }
}

if (fs.existsSync(dist)) walk(dist);
