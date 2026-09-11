import { mkdir, readFile, writeFile, rename, unlink, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { LocalStorageError } from './errors';

export const dataDirectory = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.ARPAC_DATA_DIR || path.join(process.cwd(), 'data'),
  );
export const dataFile = (name: string) =>
  path.join(/* turbopackIgnore: true */ dataDirectory(), name);

export async function readOptional(name: string): Promise<string | null> {
  try {
    // User data is created at runtime and must never be bundled into the build.
    return await readFile(/* turbopackIgnore: true */ dataFile(name), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new LocalStorageError(error);
  }
}

export async function readJson<T>(name: string): Promise<T | null> {
  const text = await readOptional(name);
  try {
    return text === null ? null : (JSON.parse(text) as T);
  } catch (error) {
    throw new LocalStorageError(error);
  }
}

export async function writeJson(name: string, value: unknown) {
  const temp = dataFile(name + '.' + randomUUID() + '.tmp');
  try {
    await mkdir(dataDirectory(), { recursive: true });
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temp, dataFile(name));
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw new LocalStorageError(error);
  }
}

export async function createIfMissing(name: string, value: string) {
  try {
    await mkdir(dataDirectory(), { recursive: true });
    await writeFile(dataFile(name), value, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new LocalStorageError(error);
  }
}

export async function writeBinary(name: string, buffer: Buffer) {
  const temp = dataFile(name + '.' + randomUUID() + '.tmp');
  try {
    await mkdir(path.dirname(dataFile(name)), { recursive: true });
    await writeFile(temp, buffer, { mode: 0o600 });
    await rename(temp, dataFile(name));
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw new LocalStorageError(error);
  }
}

export async function readBinary(name: string): Promise<Buffer> {
  try {
    return await readFile(/* turbopackIgnore: true */ dataFile(name));
  } catch (error) {
    throw new LocalStorageError(error);
  }
}

export async function removeFile(name: string) {
  try {
    await unlink(dataFile(name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new LocalStorageError(error);
  }
}

export async function checkDataAccess() {
  try {
    await mkdir(dataDirectory(), { recursive: true });
    await access(dataDirectory(), constants.R_OK | constants.W_OK);
  } catch (error) {
    throw new LocalStorageError(error);
  }
}
