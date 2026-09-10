import test from 'node:test';
import assert from 'node:assert/strict';
const origin = process.env.TEST_URL || 'http://localhost:3000';
test('Demo HTTP: messaggi persistenti, proposte, calendario, revisione, memoria e reset', async () => {
  const initial = await (await fetch(origin + '/api/workspace')).json();
  assert.equal(initial.demo, true, 'Eseguire questo test solo sul server demo locale.');
  assert(initial.items.some((r: { kind: string; project_id: string | null; title: string }) => r.kind === 'conversation' && r.project_id === 'minecraft' && r.title === 'Decisioni'));
  async function post(payload: object, expected = 200) {
    const response = await fetch(origin + '/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, expected);
    return response.json();
  }
  try {
    let state = await post({
      action: 'create',
      kind: 'ai_proposal',
      title: 'Progetto test HTTP',
      body: 'Un obiettivo verificabile',
      data: { budget: 50 },
    });
    const proposal = state.items.find(
      (r: { title: string; kind: string }) =>
        r.title === 'Progetto test HTTP' && r.kind === 'ai_proposal',
    );
    assert(proposal);
    assert(
      !state.items.some(
        (r: { title: string; kind: string }) =>
          r.title === 'Progetto test HTTP' && r.kind === 'project',
      ),
    );
    state = await post({ action: 'approve', id: proposal.id });
    const project = state.items.find(
      (r: { title: string; kind: string }) =>
        r.title === 'Progetto test HTTP' && r.kind === 'project',
    );
    assert(project);
    await post({ action: 'approve', id: proposal.id }, 400);
    state = await post({
      action: 'plan',
      id: project.id,
      body: 'Piano da approvare',
      data: {
        goal: '30 utenti',
        budget: 120,
        launch: new Date(Date.now() + 86400000).toISOString(),
        audience: 'Community italiana',
        expected_revenue: 0,
        risks: 'Tempi di sviluppo',
      },
    });
    const plan = state.items.find((r: { data: { type?: string } }) => r.data.type === 'plan');
    state = await post({ action: 'approve', id: plan.id });
    assert.equal(state.items.find((r: { id: string }) => r.id === project.id).data.budget, 120);
    state = await post({
      action: 'event',
      id: project.id,
      title: 'Milestone di test',
      body: 'Beta privata',
      data: { due: new Date(Date.now() + 86400000).toISOString(), type: 'milestone' },
    });
    const event = state.items.find((r: { title: string }) => r.title === 'Milestone di test');
    state = await post({ action: 'approve', id: event.id });
    assert(
      state.items.some(
        (r: { kind: string; title: string }) =>
          r.kind === 'calendar_event' && r.title === 'Milestone di test',
      ),
    );
    state = await post({
      action: 'create',
      kind: 'task',
      title: 'Test task',
      body: 'Consegna con prova',
      project_id: project.id,
      data: { assignee: 'owner', due: new Date(Date.now() + 86400000).toISOString(), minutes: 30 },
    });
    const task = state.items.find((r: { title: string }) => r.title === 'Test task');
    assert.equal(task.status, 'proposto');
    state = await post({ action: 'approve', id: task.id });
    assert(
      state.items.some(
        (r: { kind: string; title: string }) =>
          r.kind === 'calendar_event' && r.title === 'Test task',
      ),
    );
    await post({ action: 'transition', id: task.id, status: 'completato' }, 400);
    await post({ action: 'transition', id: task.id, status: 'in corso' });
    await post({
      action: 'transition',
      id: task.id,
      status: 'in revisione',
      body: 'Fatto, link alla prova.',
    });
    state = await post({ action: 'transition', id: task.id, status: 'completato' });
    assert.equal(state.items.find((r: { id: string }) => r.id === task.id).status, 'completato');
    state = await post({
      action: 'create',
      kind: 'message',
      conversation_id: 'hq',
      body: 'Test persistenza HTTP',
    });
    assert(state.items.some((r: { body: string }) => r.body === 'Test persistenza HTTP'));
    const read = await (await fetch(origin + '/api/workspace')).json();
    assert(read.items.some((r: { body: string }) => r.body === 'Test persistenza HTTP'));
    state = await post({
      action: 'create',
      kind: 'memory',
      title: 'Test memoria',
      body: 'Dato da correggere',
    });
    const memory = state.items.find((r: { title: string }) => r.title === 'Test memoria');
    state = await post({ action: 'memory', id: memory.id, body: 'Corretto', status: 'obsoleto' });
    assert.equal(state.items.find((r: { id: string }) => r.id === memory.id).status, 'obsoleto');
    const cron = await fetch(origin + '/api/cron', { method: 'POST' });
    assert.equal(cron.status, 401);
    const provider = await fetch(origin + '/api/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        model: 'gemini-2.5-flash',
        key: 'not-a-real-key',
        confirm: true,
      }),
    });
    assert.equal(provider.status, 400);
  } finally {
    await post({ action: 'reset' });
  }
});
