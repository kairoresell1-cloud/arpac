import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { item } from '../lib/demo';
test('Migrazioni PostgreSQL, RLS, approvazioni atomiche, coda e isolamento segreti', async () => {
  const db = await PGlite.create({ extensions: { vector } });
  try {
    await db.exec(
      `create schema auth;create schema storage;create schema extensions;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create publication supabase_realtime;grant usage on schema public,auth to anon,authenticated,service_role;`,
    );
    for (const file of [
      '001_arpac.sql',
      '002_members.sql',
      '003_hardening.sql',
      '004_atomic_ai.sql',
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    const owner = '00000000-0000-4000-a000-000000000001',
      member = '00000000-0000-4000-a000-000000000002',
      other = '00000000-0000-4000-a000-000000000003',
      project = '00000000-0000-4000-a000-000000000010',
      conv = '00000000-0000-4000-a000-000000000020',
      task = '00000000-0000-4000-a000-000000000030';
    await db.exec(
      `insert into auth.users values('${owner}'),('${member}'),('${other}');insert into profiles(id) select id from auth.users;insert into team_memberships values('${owner}','owner'),('${member}','membro'),('${other}','viewer');insert into records(kind,id,title) values('project','${project}','Privato');insert into project_members values('${project}','${owner}'),('${project}','${member}');insert into records(kind,id,title,project_id,owner_id) values('conversation','${conv}','Privata','${project}','${member}');insert into records(kind,title,project_id,conversation_id,owner_id) values('message','Segreto','${project}','${conv}','${member}');insert into records(kind,id,title,project_id,status,data) values('task','${task}','Test','${project}','proposto','{"due":"2026-09-11T10:00:00Z"}');`,
    );
    async function as(id: string) {
      await db.exec(
        `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
      );
    }
    await as(owner);
    assert.equal((await db.query("select * from records where kind='message'")).rows.length, 0);
    await as(member);
    assert.equal((await db.query("select * from records where kind='message'")).rows.length, 1);
    await assert.rejects(db.exec("insert into records(kind,title) values('project','Bypass')"));
    await assert.rejects(db.query('select * from ai_provider_settings'));
    await assert.rejects(db.query('select * from messages'));
    await assert.rejects(db.query(`select approve_record('${task}','${member}',true)`));
    await as(other);
    assert.equal((await db.query("select * from records where kind='project'")).rows.length, 0);
    assert.equal((await db.query("select * from records where kind='message'")).rows.length, 0);
    await db.exec('reset role');
    await assert.rejects(db.query(`select approve_record('${task}','${member}',true)`));
    await db.query(`select approve_record('${task}','${owner}',true)`);
    await assert.rejects(db.query(`select approve_record('${task}','${owner}',true)`));
    assert.equal(
      (await db.query("select * from records where kind='calendar_event'")).rows.length,
      1,
    );
    assert.equal((await db.query("select * from records where kind='approval'")).rows.length, 1);
    await db.exec("insert into ai_jobs(kind,payload) values('reply','{}')");
    const claimed = await db.query<{ id: string }>('select * from claim_job()');
    assert.equal(claimed.rows.length, 1);
    assert.equal((await db.query('select * from claim_job()')).rows.length, 0);
    const output = item('memory', 'Memoria atomica', 'Risultato riferito dal membro');
    await db.query('select commit_ai_reply($1,$2)', [claimed.rows[0].id, JSON.stringify([output])]);
    await db.query('select commit_ai_reply($1,$2)', [claimed.rows[0].id, JSON.stringify([output])]);
    assert.equal(
      (await db.query("select * from records where title='Memoria atomica'")).rows.length,
      1,
    );
    assert.equal((await db.query("select * from ai_jobs where kind='index'")).rows.length, 1);
    for (let i = 0; i < 12; i++)
      assert.equal(
        (await db.query<{ consume_rate: boolean }>(`select consume_rate('${member}')`)).rows[0]
          .consume_rate,
        true,
      );
    assert.equal(
      (await db.query<{ consume_rate: boolean }>(`select consume_rate('${member}')`)).rows[0]
        .consume_rate,
      false,
    );
  } finally {
    await db.close();
  }
});
