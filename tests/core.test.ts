import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../lib/crypto';
import { canTransition, canRead, canEditMemory, requireOwner } from '../lib/rules';
import { item, seed } from '../lib/demo';
test('AES-GCM: round trip, nonce casuale, nessun testo in chiaro', () => {
  const key = randomBytes(32).toString('base64');
  const encrypted = encrypt('secret-key-1234', key);
  assert.equal(decrypt(encrypted, key), 'secret-key-1234');
  assert.notEqual(encrypted, encrypt('secret-key-1234', key));
  assert(!encrypted.includes('secret-key'));
  assert.throws(() => decrypt(encrypted, randomBytes(32).toString('base64')));
  assert.throws(() => encrypt('x', 'invalid'));
});
test('AES-GCM rifiuta manomissione', () => {
  const key = randomBytes(32).toString('base64');
  const parts = encrypt('secret', key).split('.');
  const data = Buffer.from(parts[2], 'base64');
  data[0] ^= 1;
  parts[2] = data.toString('base64');
  assert.throws(() => decrypt(parts.join('.'), key));
});
test('Chat privata invisibile anche ad admin e owner diversi dal destinatario', () => {
  const r = item('message', 'Privato', '', { owner_id: 'jamal', project_id: 'mc' });
  assert(!canRead(r, 'owner', ['mc']));
  assert(!canRead(r, 'luigi', ['mc']));
  assert(canRead(r, 'jamal', ['mc']));
  assert(!canRead(r, 'jamal', []));
});
test('Solo owner approva proposte, membro non può autoapprovare o validare', () => {
  assert.throws(() => requireOwner('admin'));
  assert.throws(() => requireOwner('membro'));
  requireOwner('owner');
  assert(!canTransition('proposto', 'approvato', 'membro', true));
  assert(canTransition('proposto', 'approvato', 'owner', false));
  assert(!canTransition('in corso', 'completato', 'membro', true));
  assert(canTransition('in corso', 'in revisione', 'membro', true));
  assert(!canTransition('in revisione', 'completato', 'membro', true));
  assert(canTransition('in revisione', 'completato', 'admin', false));
  assert(!canTransition('approvato', 'in corso', 'membro', false));
  assert(!canTransition('approvato', 'in corso', 'viewer', true));
});
test('Memorie: solo owner/admin; demo esplicitamente simulata', () => {
  assert(canEditMemory('owner'));
  assert(canEditMemory('admin'));
  assert(!canEditMemory('membro'));
  assert(!canEditMemory('viewer'));
  const state = seed();
  assert(state.demo);
  assert(state.items.some((i) => i.kind === 'ai_activity_log' && i.data.simulated));
  assert(!JSON.stringify(state).includes('ciphertext'));
});
