import { mkdir, chown, lstat } from 'node:fs/promises';

// Railway mounts volumes as root at runtime. Prepare only ARPAC's data directory,
// then permanently drop privileges before serving any requests.
const dir = '/app/data';
process.env.ARPAC_DATA_DIR = dir;
await mkdir(dir, { recursive: true });
if ((await lstat(dir)).isSymbolicLink())
  throw new Error('La directory dati non può essere un link.');
if (process.getuid?.() === 0) {
  await chown(dir, 1000, 1000);
  for (const name of ['demo.json', 'workspace.json', '.app-key', 'ai-provider.json']) {
    try {
      const file = dir + '/' + name;
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('File dati non valido.');
      await chown(file, 1000, 1000);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
await import('../server.js');
