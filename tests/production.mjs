import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test(
  'Produzione: login, profilo, canali, messaggi, riavvio e errori di archivio',
  { timeout: 60000 },
  async () => {
    const root = path.resolve('../work/production-tests');
    await mkdir(root, { recursive: true });
    const dataDir = await mkdtemp(path.join(root, 'run-'));
    const email = 'test-owner@example.com';
    const password = 'production-fixture-only';
    let child;
    let base;
    let origin;
    async function stop() {
      if (child && child.exitCode === null) {
        const closed = once(child, 'close');
        child.kill();
        await closed;
      }
    }
    async function start(domain = '') {
      let output = '';
      child = spawn(process.execPath, ['scripts/start.mjs'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: '0',
          ARPAC_DATA_DIR: dataDir,
          OWNER_EMAIL: email,
          OWNER_PASSWORD: password,
          APP_URL: '',
          RAILWAY_PUBLIC_DOMAIN: domain,
          NEXT_PUBLIC_SUPABASE_URL: '',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
          GEMINI_API_KEY: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (d) => {
        output += d;
      });
      child.stderr.on('data', (d) => {
        output += d;
      });
      for (let i = 0; i < 100; i++) {
        const port = output.match(/localhost:(\d+)/)?.[1];
        if (port && port !== '0') {
          base = 'http://localhost:' + port;
          origin = domain ? 'https://' + domain : base;
          try {
            await fetch(base + '/api/health');
            return;
          } catch {}
        }
        if (child.exitCode !== null) throw new Error('Server non avviato: ' + output);
        await delay(100);
      }
      throw new Error('Timeout avvio: ' + output);
    }
    function request(route, body, cookie = '', extraHeaders = {}) {
      return fetch(base + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          origin,
          cookie,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    async function stateChange(body, cookie) {
      const r = await request('/api/workspace', body, cookie);
      const state = await r.json();
      assert.equal(r.status, 200, state.error);
      return state;
    }
    try {
      await start();
      assert.equal((await request('/api/workspace')).status, 401);
      assert.equal(
        (await request('/api/workspace', undefined, 'arpac_local_session=owner')).status,
        401,
      );
      assert.equal(
        (
          await request('/api/provider', {
            action: 'remove',
            confirm: true,
            model: 'gemini-2.5-flash',
          })
        ).status,
        401,
      );
      assert.equal((await request('/api/auth', { email, password: 'wrong' })).status, 401);
      const login = await request('/api/auth', { email: ' TEST-OWNER@EXAMPLE.COM ', password });
      assert.equal(login.status, 200);
      const setCookie = login.headers.get('set-cookie');
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=lax/i);
      assert.doesNotMatch(setCookie, /; Secure/i);
      const cookie = setCookie.split(';')[0];
      let state = await (await request('/api/workspace', undefined, cookie)).json();
      assert.equal(state.demo, false);
      assert.equal(state.storage, 'local');
      assert.equal(state.items.length, 1);
      assert.equal(state.profiles.length, 1);
      state = await stateChange(
        {
          action: 'profile',
          data: {
            name: 'QA Owner',
            avatar: 'QA',
            bio: '',
            skills: 'Testing',
            availability: '1 ora',
          },
        },
        cookie,
      );
      assert.equal(state.user.onboarded, true);
      assert.equal(state.user.name, 'QA Owner');
      state = await stateChange(
        { action: 'create', kind: 'ai_proposal', title: 'Progetto QA', data: { budget: 0 } },
        cookie,
      );
      const proposal = state.items.find((i) => i.kind === 'ai_proposal');
      state = await stateChange({ action: 'approve', id: proposal.id }, cookie);
      const project = state.items.find((i) => i.kind === 'project');
      assert(project);
      assert.equal(
        state.items.filter((i) => i.kind === 'conversation' && i.project_id === project.id).length,
        3,
      );
      state = await stateChange(
        { action: 'create', kind: 'conversation', title: 'test', project_id: project.id },
        cookie,
      );
      const channel = state.items.find((i) => i.kind === 'conversation' && i.title === 'test');
      state = await stateChange(
        {
          action: 'create',
          kind: 'message',
          conversation_id: channel.id,
          body: 'Messaggio di prova',
        },
        cookie,
      );
      assert(state.items.some((i) => i.body === 'Messaggio di prova'));
      assert.equal(
        (
          await request(
            '/api/history?conversation=' +
              channel.id +
              '&before=' +
              new Date(Date.now() + 1000).toISOString(),
            undefined,
            cookie,
          )
        ).status,
        200,
      );
      assert.equal((await request('/api/workspace', { action: 'reset' }, cookie)).status, 400);
      const logout = await fetch(base + '/api/auth', {
        method: 'DELETE',
        headers: { origin, cookie },
      });
      assert.equal(logout.status, 200);
      assert.match(logout.headers.get('set-cookie'), /expires=Thu, 01 Jan 1970/i);
      await stop();

      await start('example.up.railway.app');
      const restored = await (await request('/api/workspace', undefined, cookie)).json();
      assert.equal(restored.user.name, 'QA Owner');
      assert(restored.items.some((i) => i.body === 'Messaggio di prova'));
      const secureLogin = await request('/api/auth', { email, password });
      assert.equal(secureLogin.status, 200);
      assert.match(secureLogin.headers.get('set-cookie'), /; Secure/i);
      assert.equal(
        (
          await request('/api/workspace', { action: 'profile' }, cookie, {
            origin: 'https://untrusted.example',
          })
        ).status,
        400,
      );
      await stop();

      await writeFile(path.join(dataDir, 'workspace.json'), '{corrupted-test-fixture');
      await start();
      const failedLogin = await request('/api/auth', { email, password });
      assert.equal(failedLogin.status, 503);
      assert.equal(failedLogin.headers.get('set-cookie'), null);
      assert.match((await failedLogin.json()).error, /Archivio dati/);
      assert.equal((await request('/api/workspace', undefined, cookie)).status, 503);
      assert.equal((await request('/api/health')).status, 503);
      const page = await request('/', undefined, cookie);
      assert.match(await page.text(), /Archivio dati non disponibile/);
      assert.equal(
        await readFile(path.join(dataDir, 'workspace.json'), 'utf8'),
        '{corrupted-test-fixture',
      );
    } finally {
      await stop();
    }
  },
);
