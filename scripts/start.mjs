import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');
if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('Build assente. Esegui prima npm run build.');
  process.exit(1);
}
if (fs.existsSync(path.join(root, '.env.local')))
  process.loadEnvFile(path.join(root, '.env.local'));
fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
fs.cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});
process.env.HOSTNAME = '0.0.0.0';
process.env.ARPAC_DATA_DIR = path.resolve(process.env.ARPAC_DATA_DIR || path.join(root, 'data'));
await import(pathToFileURL(path.join(standalone, 'server.js')).href);
