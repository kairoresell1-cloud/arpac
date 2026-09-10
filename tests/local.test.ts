import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  blank,
  seed,
  readDemo,
  readStandalone,
  mutateStandalone,
  localEncryptionKey,
  readLocalAi,
  writeLocalAi,
} from '../lib/demo';
import { createSession, validSession, validCredentials, sessionMaxAge } from '../lib/local-auth';
import { LocalStorageError } from '../lib/errors';
import { publicOrigin, requireSameOrigin } from '../lib/request-origin';

test('Archivio autonomo: dati vuoti separati dalla demo, migrazione e login persistente', async () => {
  const root = path.resolve('../work/local-tests');
  await mkdir(root, { recursive: true });
  const original = process.env.ARPAC_DATA_DIR;
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerEmail = process.env.OWNER_EMAIL;
  process.env.ARPAC_DATA_DIR = await mkdtemp(path.join(root, 'empty-'));
  delete process.env.OWNER_EMAIL;
  delete process.env.OWNER_PASSWORD;
  try {
    await readDemo();
    const fresh = await readStandalone();
    assert.equal(fresh.demo, false);
    assert.equal(fresh.storage, 'local');
    assert.equal(fresh.items.length, 1);
    assert.equal(fresh.items[0].id, 'hq');
    assert.equal(fresh.profiles.length, 1);
    await mutateStandalone((s) => {
      s.user.name = 'Test Owner';
      s.user.onboarded = true;
    });
    assert.equal((await readStandalone()).user.name, 'Test Owner');
    assert.equal((await readDemo()).user.name, seed().user.name);

    assert(validCredentials(' OWNER@ARPAC.LOCAL ', 'arpac-local-setup'));
    assert(!validCredentials('owner@arpac.local', 'wrong'));
    assert(!(await validSession('owner')));
    const now = Date.now();
    const token = await createSession(now);
    assert(await validSession(token, now));
    assert(!(await validSession(token, now + sessionMaxAge * 1000)));
    assert(!(await validSession(token.slice(0, -3) + 'abc', now)));
    assert.notEqual(token, await createSession(now));
    const key = await localEncryptionKey();
    assert.equal(key, await localEncryptionKey());
    process.env.OWNER_PASSWORD = 'changed-test-password';
    assert(!(await validSession(token, now)));
    delete process.env.OWNER_PASSWORD;
    await writeLocalAi({ ciphertext: 'test-encrypted', last4: 'test', model: 'gemini-2.5-flash' });
    assert.equal((await readLocalAi())?.last4, 'test');
    await writeLocalAi(null);
    assert.equal(await readLocalAi(), null);

    process.env.ARPAC_DATA_DIR = await mkdtemp(path.join(root, 'legacy-'));
    const legacy = blank();
    legacy.user.name = 'Existing owner';
    await writeFile(path.join(process.env.ARPAC_DATA_DIR, 'demo.json'), JSON.stringify(legacy));
    assert.equal((await readStandalone()).user.name, 'Existing owner');
    assert.equal(
      JSON.parse(await readFile(path.join(process.env.ARPAC_DATA_DIR, 'demo.json'), 'utf8')).user
        .name,
      'Existing owner',
    );
    await writeFile(path.join(process.env.ARPAC_DATA_DIR, 'workspace.json'), '{broken');
    await assert.rejects(readStandalone(), LocalStorageError);
    assert.equal(
      await readFile(path.join(process.env.ARPAC_DATA_DIR, 'workspace.json'), 'utf8'),
      '{broken',
    );

    const blocked = path.join(root, 'file-' + Date.now());
    await writeFile(blocked, 'Cannot be used as a directory');
    process.env.ARPAC_DATA_DIR = blocked;
    await assert.rejects(readStandalone(), LocalStorageError);
  } finally {
    if (original === undefined) delete process.env.ARPAC_DATA_DIR;
    else process.env.ARPAC_DATA_DIR = original;
    if (ownerPassword === undefined) delete process.env.OWNER_PASSWORD;
    else process.env.OWNER_PASSWORD = ownerPassword;
    if (ownerEmail === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = ownerEmail;
  }
});

test('Origine pubblica Railway riconosciuta senza APP_URL; siti esterni rifiutati', () => {
  const app = process.env.APP_URL;
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  delete process.env.APP_URL;
  process.env.RAILWAY_PUBLIC_DOMAIN = 'example.up.railway.app';
  try {
    const request = new Request('http://0.0.0.0:3000/api/workspace', {
      headers: { origin: 'https://example.up.railway.app' },
    });
    assert.equal(publicOrigin(request), 'https://example.up.railway.app');
    assert.doesNotThrow(() => requireSameOrigin(request));
    assert.throws(() =>
      requireSameOrigin(
        new Request(request.url, { headers: { origin: 'https://untrusted.example' } }),
      ),
    );
  } finally {
    if (app === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = app;
    if (domain === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
    else process.env.RAILWAY_PUBLIC_DOMAIN = domain;
  }
});
