'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Send,
  Paperclip,
  LayoutDashboard,
  MessageSquare,
  FolderKanban,
  CheckCheck,
  CalendarDays,
  Wallet,
  Brain,
  Activity,
  Settings,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Clock,
  Lock,
  Users,
  LogOut,
  Menu,
  Target,
  ShieldCheck,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import type { Item, Snapshot } from '@/lib/types';
import { taskStates } from '@/lib/types';
import { canTransition } from '@/lib/rules';
import Avatar from './avatar';
import AvatarEditor from './avatar-editor';
type Page =
  | 'HQ'
  | 'Conversazioni'
  | 'Progetti'
  | 'Task'
  | 'Calendario'
  | 'Finanze'
  | 'Memoria'
  | 'Attività'
  | 'Team'
  | 'Impostazioni';
const nav = [
  { name: 'HQ', icon: LayoutDashboard },
  { name: 'Conversazioni', icon: MessageSquare },
  { name: 'Progetti', icon: FolderKanban },
  { name: 'Task', icon: CheckCheck },
  { name: 'Calendario', icon: CalendarDays },
  { name: 'Finanze', icon: Wallet },
  { name: 'Memoria', icon: Brain },
  { name: 'Attività', icon: Activity },
  { name: 'Team', icon: Users },
  { name: 'Impostazioni', icon: Settings },
] as const;
const euro = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(v);
const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    : 'Da definire';
const n = (v: unknown) => Number(v) || 0;
function Goat() {
  return (
    <span className="goat" aria-label="ARPAC">
      Λ
    </span>
  );
}
function Status({ value }: { value: string }) {
  return <span className={'badge ' + value.replaceAll(' ', '-')}>{value}</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Sparkles size={24} />
      <p>{children}</p>
    </div>
  );
}
export default function Workspace({ initial }: { initial: Snapshot }) {
  const [s, setS] = useState(initial),
    [page, setPage] = useState<Page>('HQ'),
    [project, setProject] = useState(''),
    [conversation, setConversation] = useState(
      initial.items.find((i) => i.kind === 'conversation' && !i.project_id)?.id || '',
    ),
    [modal, setModal] = useState(''),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [search, setSearch] = useState(''),
    [message, setMessage] = useState(''),
    [drawer, setDrawer] = useState(false),
    [month, setMonth] = useState(new Date().getMonth()),
    [year, setYear] = useState(new Date().getFullYear());
  const dialog = useRef<HTMLDialogElement>(null),
    end = useRef<HTMLDivElement>(null),
    providerInput = useRef<HTMLInputElement>(null),
    modelInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              description: string;
              inputSchema: object;
              annotations: object;
              execute: (input: unknown) => unknown;
            },
            options: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: 'start_task_proposal',
          description: 'Apre il modulo visibile per proporre un task. Non crea né approva un task.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false },
          execute(input) {
            if (!input || typeof input !== 'object' || Object.keys(input).length)
              throw new Error('Nessun parametro previsto.');
            setModal('task');
            return { status: 'modulo aperto' };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {
      /* WebMCP opzionale non supportato dal browser. */
    }
    return () => lifecycle.abort();
  }, []);
  const notify = useCallback((m: string) => {
    setToast(m);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/workspace');
      if (r.ok) setS(await r.json());
    } catch {
      /* La vista resta disponibile durante una disconnessione. */
    }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (s.demo) return;
    const poll = setInterval(refresh, 15000);
    if (
      s.storage !== 'supabase' ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
      return () => clearInterval(poll);
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const channel = client
      .channel('arpac')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'records' },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
      clearInterval(poll);
    };
  }, [s.demo, s.storage, refresh]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [s.items.length, conversation]);
  async function act(payload: Record<string, unknown>, success = 'Salvato.') {
    setBusy(true);
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setS(result);
      notify(success);
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const items = (kind: string) =>
    s.items.filter(
      (i) =>
        i.kind === kind &&
        i.status !== 'eliminato' &&
        (!search || `${i.title} ${i.body}`.toLowerCase().includes(search.toLowerCase())),
    );
  const projects = items('project'),
    tasks = items('task').filter((i) => !project || i.project_id === project),
    finances = items('financial_entry'),
    proposals = s.items.filter(
      (i) =>
        ['ai_proposal', 'financial_proposal', 'task', 'skill_change_request'].includes(i.kind) &&
        i.status === 'proposto',
    ),
    currentProject = projects.find((p) => p.id === project),
    selectedConversation = s.items.find((i) => i.id === conversation),
    balance = finances.reduce((sum, r) => sum + n(r.data.amount), 0),
    completed = tasks.filter((t) => t.status === 'completato').length;
  const go = (p: Page) => {
    setPage(p);
    setDrawer(false);
    setSearch('');
  };
  const today = new Date().toDateString();
  const chat = () => (
    <section className="chat panel">
      <div className="chat-head">
        <div className="avatar violet">
          {selectedConversation?.owner_id ? <Lock size={18} /> : <MessageSquare size={20} />}
        </div>
        <div>
          <h3>{selectedConversation?.title || 'Chat del team'}</h3>
          <small>
            {selectedConversation?.owner_id
              ? 'Solo tu e ARPAC'
              : 'Uno spazio condiviso per far avanzare le cose'}
          </small>
        </div>
        <span className="live">
          <i /> {s.demo ? 'Demo' : 'Team'}
        </span>
      </div>
      <div className="messages">
        {!s.demo && (
          <button
            className="text-button"
            onClick={async () => {
              const first = s.items.filter(
                (i) => i.kind === 'message' && i.conversation_id === conversation,
              )[0];
              const res = await fetch(
                '/api/history?conversation=' +
                  conversation +
                  '&before=' +
                  encodeURIComponent(first?.created_at || new Date().toISOString()),
              );
              const d = await res.json();
              if (!res.ok) {
                notify(d.error);
                return;
              }
              setS((prev) => ({
                ...prev,
                items: [
                  ...d.items.filter((i: Item) => !prev.items.some((x) => x.id === i.id)),
                  ...prev.items,
                ].sort((a: Item, b: Item) => a.created_at.localeCompare(b.created_at)),
              }));
              if (!d.items.length) notify('Hai raggiunto il primo messaggio.');
            }}
          >
            Carica messaggi precedenti
          </button>
        )}
        {s.items
          .filter(
            (i) =>
              (i.kind === 'message' || i.kind === 'attachment') &&
              i.conversation_id === conversation,
          )
          .map((m) => (
            <div
              key={m.id}
              className={`message ${m.title === 'ARPAC' ? 'ai' : ''} ${m.data.author_id === s.user.id ? 'mine' : ''}`}
            >
              <div className="message-avatar">
                {m.title === 'ARPAC' ? (
                  <Goat />
                ) : (
                  <Avatar value={m.data.author_avatar as string} name={m.title} />
                )}
              </div>
              <div className="bubble">
                <div className="message-meta">
                  <strong>{m.title}</strong>
                  {m.title === 'ARPAC' && <span className="ai-label">IL TUO MANAGER AI</span>}
                  <time>
                    {new Date(m.created_at).toLocaleTimeString('it-IT', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                {m.kind === 'attachment' ? (
                  <a href={'/api/files?id=' + m.id} target="_blank" rel="noreferrer">
                    <Paperclip size={14} /> {m.title}
                  </a>
                ) : (
                  <p>{m.body}</p>
                )}
                {Boolean(m.data.simulated) && <small>Risposta simulata · demo locale</small>}
              </div>
            </div>
          ))}
        {!conversation && <Empty>Nessuna conversazione disponibile.</Empty>}
        <div ref={end} />
      </div>
      <form
        className="composer"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await act(
              { action: 'create', kind: 'message', body: message, conversation_id: conversation },
              s.demo ? 'Messaggio salvato.' : 'Messaggio salvato. ARPAC risponderà dalla coda.',
            )
          )
            setMessage('');
        }}
      >
        <label className="attach" title="Allega file">
          <Paperclip size={20} />
          <input
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (s.demo) {
                notify(
                  'Gli allegati richiedono Supabase Storage. In demo puoi condividere un link.',
                );
                return;
              }
              const form = new FormData();
              form.set('file', f);
              form.set('conversation_id', conversation);
              setBusy(true);
              try {
                const r = await fetch('/api/files', { method: 'POST', body: form });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                await refresh();
                notify('File caricato.');
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <input
          aria-label="Messaggio"
          placeholder="Scrivi al team. ARPAC è qui con voi…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={s.role === 'viewer'}
        />
        <button
          className="send"
          aria-label="Invia messaggio"
          disabled={busy || !message.trim() || !conversation}
        >
          <Send size={18} />
        </button>
      </form>
      <div className="composer-note">
        <ShieldCheck size={12} /> Le decisioni importanti passano sempre dall’owner.
      </div>
    </section>
  );
  const taskRow = (t: Item) => (
    <div className="task-row" key={t.id}>
      <span className={'task-dot ' + (t.status === 'completato' ? 'done' : '')}>
        {t.status === 'completato' ? <Check size={13} /> : null}
      </span>
      <div className="grow">
        <strong>{t.title}</strong>
        <small>
          {projects.find((p) => p.id === t.project_id)?.title} <span>·</span>{' '}
          {s.profiles.find((p) => p.id === t.data.assignee)?.name || 'Da assegnare'}
        </small>
      </div>
      <Status value={t.status} />
      <span className="date">{date(t.data.due)}</span>
      <button
        className="icon-button"
        aria-label={'Apri ' + t.title}
        onClick={() => setModal('task:' + t.id)}
      >
        <ArrowUpRight size={17} />
      </button>
    </div>
  );
  return (
    <div className="app-shell">
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="private">
              <Lock size={12} /> Spazio privato
            </span>
            <button
              className="icon-button"
              aria-label="Notifiche"
              onClick={() => setModal('notifications')}
            >
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
            <Avatar value={s.user.avatar} name={s.user.name} className="owner" />
            <button
              className="mobile-menu icon-button"
              aria-label="Apri menu"
              onClick={() => setDrawer(!drawer)}
            >
              <Menu />
            </button>
          </div>
        </header>
        <div className="content">
          {s.demo && (
            <div className="demo-bar">
              <span>
                <i /> Modalità demo locale · dati di esempio persistenti
              </span>
              <button onClick={() => go('Impostazioni')}>
                Collega il tuo team <ArrowRight size={13} />
              </button>
            </div>
          )}
          {!s.user.onboarded && (
            <div className="notice">
              Completa il tuo profilo per presentarti al team.{' '}
              <button onClick={() => setModal('profile')}>Completa profilo</button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'HQ'
                  ? 'IL PUNTO DI PARTENZA DEL TEAM'
                  : 'WORKSPACE / ' + page.toUpperCase()}
              </div>
              <h1>
                {page === 'HQ' ? (
                  <>
                    Buongiorno, {s.user.name}. <span className="wave">✦</span>
                  </>
                ) : page === 'Progetti' && currentProject ? (
                  currentProject.title
                ) : page === 'Conversazioni' ? (
                  'Le idee prendono forma qui.'
                ) : page === 'Memoria' ? (
                  'Niente va perso.'
                ) : page === 'Impostazioni' ? (
                  'Il tuo ARPAC.'
                ) : (
                  page + '.'
                )}
              </h1>
              <p>
                {page === 'HQ'
                  ? 'Meno rumore. Più direzione. Ecco dove siamo oggi.'
                  : page === 'Task'
                    ? 'Dalla proposta al risultato, un passo alla volta.'
                    : page === 'Finanze'
                      ? 'Numeri chiari. Nessuna spesa senza una decisione.'
                      : page === 'Memoria'
                        ? 'Decisioni, risultati e lezioni che restano con il team.'
                        : 'Tutto il necessario per portare avanti il lavoro.'}
              </p>
            </div>
            <div className="heading-actions">
              {page === 'HQ' ? (
                <span className="today">
                  <CalendarDays size={15} />
                  {new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                </span>
              ) : (
                <label className="search">
                  <Search size={15} />
                  <input
                    aria-label="Cerca"
                    placeholder="Cerca…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              )}
              {['Progetti', 'Task', 'Finanze', 'Memoria'].includes(page) && s.role !== 'viewer' && (
                <button
                  className="primary"
                  onClick={() =>
                    setModal(
                      page === 'Progetti'
                        ? 'project'
                        : page === 'Task'
                          ? 'task'
                          : page === 'Finanze'
                            ? 'finance'
                            : 'memory',
                    )
                  }
                >
                  <Plus size={16} />
                  {page === 'Progetti'
                    ? 'Proponi progetto'
                    : page === 'Task'
                      ? 'Proponi task'
                      : page === 'Finanze'
                        ? 'Nuova voce'
                        : 'Nuova memoria'}
                </button>
              )}
            </div>
          </div>
          {page === 'HQ' && (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat-label">
                    Progetti attivi <FolderKanban size={17} />
                  </div>
                  <strong>
                    {projects
                      .filter((p) => p.status === 'attivo')
                      .length.toString()
                      .padStart(2, '0')}
                  </strong>
                  <span>
                    <i className="green-dot" /> Un obiettivo, insieme
                  </span>
                </div>
                <div className="stat">
                  <div className="stat-label">
                    Task completati <CheckCheck size={17} />
                  </div>
                  <strong>
                    {completed}
                    <em> / {tasks.length}</em>
                  </strong>
                  <div className="progress">
                    <i style={{ width: `${(completed / (tasks.length || 1)) * 100}%` }} />
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">
                    Saldo del team <Wallet size={17} />
                  </div>
                  <strong>{euro(balance)}</strong>
                  <span className="green">
                    <ArrowUpRight size={13} /> Risorse disponibili
                  </span>
                </div>
                <button className="stat pending-stat" onClick={() => setModal('approvals')}>
                  <div className="stat-label">
                    In attesa di te <ShieldCheck size={17} />
                  </div>
                  <strong>
                    {proposals.length.toString().padStart(2, '0')}
                    <ArrowUpRight size={25} />
                  </strong>
                  <span className="amber">Proposte da valutare</span>
                </button>
              </div>
              <section className="focus-banner">
                <Goat />
                <div>
                  <div className="eyebrow">IL FOCUS DI ARPAC</div>
                  <h2>
                    {tasks.some((t) => t.status === 'bloccato')
                      ? 'Prima sciogliamo i blocchi. Poi acceleriamo.'
                      : 'Una priorità chiara cambia la giornata.'}
                  </h2>
                  <p>
                    {tasks.find((t) => t.status === 'bloccato')?.title ||
                      tasks.find((t) => t.status === 'in corso')?.title ||
                      'Definiamo insieme il prossimo passo.'}{' '}
                    <span>Facciamo avanzare ciò che conta.</span>
                  </p>
                </div>
                <button onClick={() => go('Task')}>
                  Vediamo il piano <ArrowRight size={16} />
                </button>
              </section>
              <div className="hq-columns">
                <div className="left-col">
                  {chat()}
                  <section className="panel">
                    <div className="section-head">
                      <h2>
                        Il lavoro di oggi{' '}
                        <span className="count">
                          {
                            tasks.filter(
                              (t) => new Date(String(t.data.due)).toDateString() === today,
                            ).length
                          }
                        </span>
                      </h2>
                      <button onClick={() => go('Task')}>
                        Tutti i task <ArrowRight size={14} />
                      </button>
                    </div>
                    {tasks
                      .filter((t) => t.status !== 'completato')
                      .slice(0, 3)
                      .map(taskRow)}
                  </section>
                </div>
                <div className="right-col">
                  <section className="panel project-preview">
                    <div className="section-head">
                      <h2>Sotto i riflettori</h2>
                      <FolderKanban size={16} />
                    </div>
                    {projects.slice(0, 2).map((p) => {
                      const pTasks = s.items.filter(
                        (t) => t.kind === 'task' && t.project_id === p.id && t.status !== 'eliminato',
                      );
                      const pDone = pTasks.filter((t) => t.status === 'completato').length;
                      return (
                        <div className="project-preview-item" key={p.id}>
                          <div className="project-preview-body">
                            <Status value={p.status} />
                            <h3>{p.title}</h3>
                            <p>{p.body}</p>
                            <div className="progress">
                              <i style={{ width: `${(pDone / (pTasks.length || 1)) * 100}%` }} />
                            </div>
                            <div className="between">
                              <div className="avatar-stack">
                                {s.profiles.map((u) => (
                                  <Avatar key={u.id} value={u.avatar} name={u.name} />
                                ))}
                              </div>
                              <button
                                onClick={() => {
                                  setProject(p.id);
                                  go('Progetti');
                                }}
                                aria-label="Apri progetto"
                              >
                                <ArrowUpRight size={20} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                  <section className="panel">
                    <div className="section-head">
                      <h2>In arrivo</h2>
                      <CalendarDays size={17} />
                    </div>
                    {items('calendar_event')
                      .sort((a, b) => String(a.data.due).localeCompare(String(b.data.due)))
                      .slice(0, 3)
                      .map((e) => (
                        <div className="event-mini" key={e.id}>
                          <div className="calendar-date">
                            <strong>{new Date(String(e.data.due)).getDate()}</strong>
                            <small>
                              {new Date(String(e.data.due)).toLocaleDateString('it-IT', {
                                month: 'short',
                              })}
                            </small>
                          </div>
                          <div>
                            <strong>{e.title}</strong>
                            <small>{e.body}</small>
                          </div>
                        </div>
                      ))}
                  </section>
                  <div className="quiet-note">
                    <i className="green-dot" />
                    <span>
                      ARPAC tiene il filo.
                      <small>
                        {s.demo
                          ? 'Automazioni simulate in questa demo.'
                          : 'I controlli automatici richiedono il worker attivo.'}
                      </small>
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
          {page === 'Conversazioni' && (
            <div className="conversation-layout">
              <section className="panel conversation-list">
                <div className="section-head">
                  <h3>Le tue conversazioni</h3>
                  <button
                    className="icon-button"
                    aria-label="Nuova chat privata"
                    onClick={() => setModal('conversation')}
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <div className="channel-tree">
                  <div className="channel-category">
                    <span>⌄</span>
                    <strong>HQ · TEAM</strong>
                  </div>
                  {items('conversation')
                    .filter((c) => !c.project_id && !c.owner_id)
                    .map((c) => (
                      <button
                        key={c.id}
                        className={conversation === c.id ? 'selected' : ''}
                        onClick={() => setConversation(c.id)}
                      >
                        <MessageSquare size={15} />
                        <span>
                          # {c.title.replace(/^HQ · /, '')}
                          <small>Canale condiviso</small>
                        </span>
                      </button>
                    ))}
                  {projects.map((p) => (
                    <div key={p.id} className="project-channel-group">
                      <div className="channel-category">
                        <span>⌄</span>
                        <strong>{p.title.toUpperCase()}</strong>
                        <button
                          className="mini-plus"
                          aria-label={'Nuovo canale in ' + p.title}
                          onClick={() => {
                            setProject(p.id);
                            setModal('channel');
                          }}
                        >
                          +
                        </button>
                      </div>
                      {items('conversation')
                        .filter((c) => c.project_id === p.id && !c.owner_id)
                        .map((c) => (
                          <button
                            key={c.id}
                            className={conversation === c.id ? 'selected' : ''}
                            onClick={() => setConversation(c.id)}
                          >
                            <MessageSquare size={15} />
                            <span>
                              # {c.title}
                              <small>{String(c.data.channel || 'canale')} · condiviso</small>
                            </span>
                          </button>
                        ))}
                    </div>
                  ))}
                  <div className="channel-category private-title">
                    <span>⌄</span>
                    <strong>CHAT PRIVATE</strong>
                    <button
                      className="mini-plus"
                      aria-label="Nuova chat privata"
                      onClick={() => setModal('conversation')}
                    >
                      +
                    </button>
                  </div>
                  {items('conversation')
                    .filter((c) => c.owner_id)
                    .map((c) => (
                      <button
                        key={c.id}
                        className={conversation === c.id ? 'selected' : ''}
                        onClick={() => setConversation(c.id)}
                      >
                        <Lock size={15} />
                        <span>
                          {c.title}
                          <small>Solo tu e ARPAC</small>
                        </span>
                      </button>
                    ))}
                </div>
              </section>
              {chat()}
            </div>
          )}
          {page === 'Progetti' && (
            <>
              {currentProject ? (
                <>
                  <button className="text-button" onClick={() => setProject('')}>
                    <ChevronLeft size={16} /> Tutti i progetti
                  </button>
                  <section className="panel overview">
                    <Status value={currentProject.status} />
                    <h2>{currentProject.title}</h2>
                    <p>{currentProject.body}</p>
                    <div className="overview-stats">
                      <span>
                        Obiettivo
                        <strong>
                          {String(currentProject.data.goal || 'Da definire nell’onboarding')}
                        </strong>
                      </span>
                      <span>
                        Budget<strong>{euro(n(currentProject.data.budget))}</strong>
                      </span>
                      <span>
                        Lancio<strong>{date(currentProject.data.launch)}</strong>
                      </span>
                    </div>
                    <div className="toolbar">
                      <button onClick={() => setModal('plan:' + currentProject.id)}>
                        Proponi piano
                        <Target size={14} />
                      </button>
                      <button onClick={() => setModal('event:' + currentProject.id)}>
                        Proponi evento
                        <CalendarDays size={14} />
                      </button>
                      {s.role === 'owner' && (
                        <button onClick={() => setModal('close-project:' + currentProject.id)}>
                          {currentProject.status === 'chiuso'
                            ? 'Riapri progetto'
                            : 'Chiudi progetto'}
                        </button>
                      )}
                      {(
                        ['Conversazioni', 'Task', 'Calendario', 'Finanze', 'Memoria'] as Page[]
                      ).map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            if (p === 'Conversazioni')
                              setConversation(
                                s.items.find(
                                  (i) =>
                                    i.kind === 'conversation' &&
                                    i.project_id === project &&
                                    !i.owner_id,
                                )?.id || '',
                              );
                            go(p);
                          }}
                        >
                          {p}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                      <button onClick={() => setModal('files')}>
                        File
                        <Paperclip size={14} />
                      </button>
                      {s.role === 'owner' && (
                        <button onClick={() => setModal('members')}>
                          Accessi
                          <Users size={14} />
                        </button>
                      )}
                    </div>
                  </section>
                  <section className="panel">{tasks.map(taskRow)}</section>
                </>
              ) : (
                <div className="project-grid">
                  {projects.map((p) => (
                    <button
                      className="panel project-card"
                      key={p.id}
                      onClick={() => setProject(p.id)}
                    >
                      <div className="between">
                        <span className="project-icon">
                          <FolderKanban />
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                      <Status value={p.status} />
                      <h2>{p.title}</h2>
                      <p>{p.body}</p>
                      <div className="between">
                        <span>Budget {euro(n(p.data.budget))}</span>
                        <span>
                          {s.items.filter((t) => t.kind === 'task' && t.project_id === p.id).length}{' '}
                          task
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!projects.length && (
                <Empty>Il prossimo progetto parte da un’idea. Proponila al team.</Empty>
              )}
            </>
          )}
          {page === 'Task' && (
            <>
              <div className="toolbar">
                <label>
                  Progetto
                  <select value={project} onChange={(e) => setProject(e.target.value)}>
                    <option value="">Tutti i progetti</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {completed} completati · {tasks.length} totali
                </span>
              </div>
              <div className="kanban">
                {[
                  'proposto',
                  'approvato',
                  'in corso',
                  'in revisione',
                  'completato',
                  'bloccato',
                ].map((status) => (
                  <section className="kanban-column" key={status}>
                    <h3>
                      <i className={'state-dot ' + status.replaceAll(' ', '-')} />
                      {status}
                      <span>{tasks.filter((t) => t.status === status).length}</span>
                    </h3>
                    {tasks
                      .filter((t) => t.status === status)
                      .map((t) => (
                        <button
                          className="kanban-card"
                          key={t.id}
                          onClick={() => setModal('task:' + t.id)}
                        >
                          <small>{projects.find((p) => p.id === t.project_id)?.title}</small>
                          <h4>{t.title}</h4>
                          <p>{t.body}</p>
                          <div className="between">
                            <span>
                              <Clock size={12} /> {date(t.data.due)}
                            </span>
                            <Avatar
                              value={s.profiles.find((p) => p.id === t.data.assignee)?.avatar}
                              name={s.profiles.find((p) => p.id === t.data.assignee)?.name}
                            />
                          </div>
                        </button>
                      ))}
                    {!tasks.some((t) => t.status === status) && (
                      <div className="kanban-empty">Nessun task</div>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {page === 'Calendario' && (
            <section className="panel calendar">
              <div className="section-head">
                <h2>
                  {new Date(year, month).toLocaleDateString('it-IT', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </h2>
                <div className="toolbar">
                  <button
                    aria-label="Mese precedente"
                    onClick={() => {
                      const d = new Date(year, month - 1);
                      setMonth(d.getMonth());
                      setYear(d.getFullYear());
                    }}
                  >
                    <ChevronLeft />
                  </button>
                  <button
                    aria-label="Mese successivo"
                    onClick={() => {
                      const d = new Date(year, month + 1);
                      setMonth(d.getMonth());
                      setYear(d.getFullYear());
                    }}
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>
              <div className="calendar-grid">
                {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => (
                  <div className="weekday" key={d}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: 42 }, (_, index) => {
                  const d = new Date(
                    year,
                    month,
                    index - ((new Date(year, month, 1).getDay() + 6) % 7) + 1,
                  );
                  return (
                    <div
                      className={
                        'calendar-cell ' +
                        (d.getMonth() !== month ? 'muted' : '') +
                        (d.toDateString() === today ? ' current' : '')
                      }
                      key={index}
                    >
                      <span>{d.getDate()}</span>
                      {items('calendar_event')
                        .filter(
                          (e) =>
                            (!project || e.project_id === project) &&
                            new Date(String(e.data.due)).toDateString() === d.toDateString(),
                        )
                        .map((e) => (
                          <button
                            key={e.id}
                            title={e.body}
                            onClick={() => setModal('event:' + e.id)}
                          >
                            {e.title}
                          </button>
                        ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {page === 'Finanze' && (
            <>
              <div className="stat-grid three">
                <div className="stat">
                  <div className="stat-label">Saldo</div>
                  <strong>{euro(balance)}</strong>
                  <span>Totale delle voci registrate</span>
                </div>
                <div className="stat">
                  <div className="stat-label">
                    Entrate <ArrowUpRight size={18} />
                  </div>
                  <strong className="green">
                    {euro(finances.reduce((a, r) => a + Math.max(0, n(r.data.amount)), 0))}
                  </strong>
                </div>
                <div className="stat">
                  <div className="stat-label">
                    Spese <ArrowDownRight size={18} />
                  </div>
                  <strong>
                    {euro(-finances.reduce((a, r) => a + Math.min(0, n(r.data.amount)), 0))}
                  </strong>
                </div>
              </div>
              <section className="panel">
                <div className="section-head">
                  <h2>Budget per progetto</h2>
                  <small>Spese registrate / budget</small>
                </div>
                {projects.map((p) => {
                  const spent = -finances
                    .filter((f) => f.project_id === p.id && n(f.data.amount) < 0)
                    .reduce((a, f) => a + n(f.data.amount), 0);
                  return (
                    <div className="budget-row" key={p.id}>
                      <div className="between">
                        <strong>{p.title}</strong>
                        <span>
                          {euro(spent)} / {euro(n(p.data.budget))}
                        </span>
                      </div>
                      <div className="progress">
                        <i
                          style={{
                            width: Math.min(100, (spent / (n(p.data.budget) || 1)) * 100) + '%',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>
              <section className="panel">
                <div className="section-head">
                  <h2>Movimenti</h2>
                  <span className="badge">Solo registrazione · nessun pagamento</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Descrizione</th>
                        <th>Progetto</th>
                        <th>Data</th>
                        <th>Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finances.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <strong>{f.title}</strong>
                            <small>{f.body}</small>
                          </td>
                          <td>{projects.find((p) => p.id === f.project_id)?.title || 'Team'}</td>
                          <td>{date(f.created_at)}</td>
                          <td className={n(f.data.amount) > 0 ? 'green' : ''}>
                            {euro(n(f.data.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <button className="text-button" onClick={() => setModal('approvals')}>
                Valuta proposte finanziarie <ArrowRight size={15} />
              </button>
            </>
          )}
          {page === 'Memoria' && (
            <>
              <div className="toolbar">
                <button className="secondary" onClick={() => setModal('research')}>
                  <Search size={15} /> Ricerca online
                </button>
                <span>Le memorie obsolete sono escluse dal contesto AI.</span>
              </div>
              <div className="memory-grid">
                {items('memory')
                  .filter((m) => !project || m.project_id === project)
                  .map((m) => (
                    <section className="panel memory-card" key={m.id}>
                      <div className="between">
                        <Brain size={19} />
                        <Status value={m.status} />
                      </div>
                      <h3>{m.title}</h3>
                      <p>{m.body}</p>
                      <div className="between">
                        <small>
                          {projects.find((p) => p.id === m.project_id)?.title || 'Memoria del team'}
                        </small>
                        {['owner', 'admin'].includes(s.role) && (
                          <button onClick={() => setModal('memory:' + m.id)}>
                            Correggi <ArrowUpRight size={14} />
                          </button>
                        )}
                      </div>
                    </section>
                  ))}
              </div>
              {items('research_item').map((r) => (
                <section className="panel memory-card" key={r.id}>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                  {Array.isArray(r.data.sources) &&
                    (r.data.sources as { url: string; title: string; content: string }[]).map(
                      (source) =>
                        /^https?:\/\//.test(source.url) && (
                          <p key={source.url}>
                            <a href={source.url} target="_blank" rel="noreferrer">
                              {source.title} ↗
                            </a>
                            <small>{source.content}</small>
                          </p>
                        ),
                    )}
                </section>
              ))}
            </>
          )}
          {page === 'Attività' && (
            <section className="panel">
              <div className="section-head">
                <h2>Il registro di ARPAC</h2>
                <span className="live">
                  <i /> {s.demo ? 'Simulazione' : 'Registro reale'}
                </span>
              </div>
              {items('ai_activity_log')
                .slice()
                .reverse()
                .map((a) => (
                  <div className="activity-row" key={a.id}>
                    <Goat />
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.body}</p>
                      <small>
                        {date(a.created_at)} · {new Date(a.created_at).toLocaleTimeString('it-IT')}
                      </small>
                    </div>
                    {Boolean(a.data.error) && <Status value="bloccato" />}
                  </div>
                ))}
              {!items('ai_activity_log').length && (
                <Empty>Le prime azioni automatiche appariranno qui.</Empty>
              )}
            </section>
          )}
          {page === 'Team' && (
            <>
              <div className="toolbar">
                <button className="secondary" onClick={() => setModal('profile')}>
                  Il mio profilo
                </button>
                {s.role === 'owner' && (
                  <button className="primary" onClick={() => setModal('invite')}>
                    <Plus size={16} /> Invita un membro
                  </button>
                )}
              </div>
              <div className="project-grid">
                {s.profiles.map((p) => (
                  <section className="panel person" key={p.id}>
                    <Avatar value={p.avatar} name={p.name} className="large" />
                    <h2>{p.name}</h2>
                    <p>{p.bio}</p>
                    <small>COMPETENZE</small>
                    <p>{p.skills || 'Da completare'}</p>
                    <small>DISPONIBILITÀ</small>
                    <p>{p.availability || 'Da concordare'}</p>
                    {s.role === 'owner' && p.id !== s.user.id && (
                      <button className="text-button" onClick={() => setModal('role:' + p.id)}>
                        Gestisci ruolo <ArrowUpRight size={14} />
                      </button>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {page === 'Impostazioni' && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <div className="section-head">
                  <h2>AI Provider</h2>
                  <span className="badge">Solo owner</span>
                </div>
                {s.role === 'owner' ? (
                  <>
                    <div className="provider-brand">
                      <Sparkles />
                      <div>
                        <h3>Google Gemini</h3>
                        <p>Il motore di ARPAC, lato server.</p>
                      </div>
                      <Status value={s.ai.configured ? 'configurata' : 'da configurare'} />
                    </div>
                    {s.demo && (
                      <p className="notice">
                        Collega Supabase e imposta APP_ENCRYPTION_KEY per salvare una chiave. La
                        demo non memorizza segreti.
                      </p>
                    )}
                    <label>
                      Modello
                      <input
                        id="model"
                        ref={modelInput}
                        key={`model-${s.ai.model}`}
                        defaultValue={s.ai.model}
                        placeholder="llama-3.3-70b-versatile"
                      />
                    </label>
                    <label>
                      Chiave AI Provider
                      <input
                        id="api-key"
                        ref={providerInput}
                        type="password"
                        autoComplete="new-password"
                        key={`apikey-${s.ai.last4 ?? 'empty'}`}
                        placeholder={
                          s.ai.last4
                            ? '✓ Configurata · ultime 4 cifre: ' + s.ai.last4
                            : 'Chiave Gemini (AIzaSy...) o Groq (gsk_...)'
                        }
                        disabled={s.demo}
                      />
                    </label>
                    <p>
                      <Lock size={12} /> Cifratura AES-256-GCM. La chiave salvata non torna al
                      browser.
                    </p>
                    <div className="toolbar">
                      <button
                        className="primary"
                        disabled={s.demo || busy}
                        onClick={() => setModal('provider-save')}
                      >
                        {s.ai.configured ? 'Sostituisci chiave' : 'Salva e verifica'}
                      </button>
                      <button
                        className="danger-button"
                        disabled={s.demo || !s.ai.configured}
                        onClick={() => setModal('provider-remove')}
                      >
                        Rimuovi chiave
                      </button>
                    </div>
                  </>
                ) : (
                  <p>Questa configurazione è riservata all’owner.</p>
                )}
              </section>
              <section className="panel settings-card">
                <h2>Utilizzo e automazioni</h2>
                <div className="usage-row">
                  <span>Chiamate generative registrate</span>
                  <strong>{items('ai_activity_log').filter((i) => i.data.tokens).length}</strong>
                </div>
                <div className="usage-row">
                  <span>Token registrati</span>
                  <strong>
                    {items('ai_activity_log')
                      .reduce((a, r) => a + n(r.data.tokens), 0)
                      .toLocaleString('it-IT')}
                  </strong>
                </div>
                <div className="usage-row">
                  <span>Errori</span>
                  <strong>{items('ai_activity_log').filter((i) => i.data.error).length}</strong>
                </div>
                <p>
                  La quota residua dipende dal tuo account Google e non è esposta da questa API.
                  Consulta AI Studio.
                </p>
                {s.role === 'owner' && (
                  <button
                    className="secondary"
                    onClick={() =>
                      void act({ action: 'retry' }, 'Richieste fallite rimesse in coda.')
                    }
                  >
                    Riprova richieste fallite
                  </button>
                )}
                <hr />
                <h3>Il ritmo del team</h3>
                <p>
                  08:00 · Briefing mattutino
                  <br />
                  Ogni ora · Controllo cambiamenti
                  <br />
                  20:00 · Report e piano di domani
                </p>
                <small>Fuso orario Europe/Rome. Richiede il worker Railway.</small>
                {s.demo && (
                  <>
                    <hr />
                    <button className="danger-button" onClick={() => setModal('reset')}>
                      Ripristina dati demo
                    </button>
                  </>
                )}
              </section>
            </div>
          )}
          <footer>
            ARPAC <span>Un membro in più. Una direzione condivisa.</span>
            <span className="footer-right">
              <Lock size={10} /> Privato per scelta.
            </span>
          </footer>
        </div>
      </main>
      <aside className={'sidebar ' + (drawer ? 'open' : '')}>
        <div className="brand">
          <Goat />
          <span>
            ARPAC<small>TEAM OPERATING SPACE</small>
          </span>
        </div>
        <div className="workspace-selector">
          <div className="workspace-logo">A</div>
          <div>
            <strong>Il nostro team</strong>
            <small>{s.profiles.length} membri · workspace privato</small>
          </div>
        </div>
        <span className="nav-caption">IL TUO SPAZIO</span>
        <nav>
          {nav
            .filter((i) => i.name !== 'Impostazioni' || s.role === 'owner')
            .map(({ name, icon: Icon }) => (
              <button key={name} className={page === name ? 'active' : ''} onClick={() => go(name)}>
                <Icon size={18} />
                <span>{name}</span>
                {name === 'Task' && (
                  <em>{tasks.filter((t) => t.status !== 'completato').length}</em>
                )}
                {page === name && <i />}
              </button>
            ))}
        </nav>
        <div className="sidebar-projects">
          <div className="between">
            <span className="nav-caption">PROGETTI</span>
            <button
              className="icon-button"
              aria-label="Proponi progetto"
              onClick={() => setModal('project')}
            >
              <Plus size={14} />
            </button>
          </div>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProject(p.id);
                go('Progetti');
              }}
            >
              <i />
              {p.title}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="arpac-status">
            <Goat />
            <div>
              <strong>ARPAC è nel team</strong>
              <small>
                <i className="green-dot" />
                {s.demo ? 'In modalità demo' : 'Pronto a collaborare'}
              </small>
            </div>
          </div>
          <button className="profile-button" onClick={() => setModal('profile')}>
            <Avatar value={s.user.avatar} name={s.user.name} className="owner" />
            <span>
              {s.user.name}
              <small>{s.role}</small>
            </span>
            <Settings size={16} />
          </button>
          {!s.demo && (
            <button
              className="logout"
              onClick={async () => {
                await fetch('/api/auth', { method: 'DELETE' });
                location.reload();
              }}
            >
              <LogOut size={13} /> Esci
            </button>
          )}
        </div>
      </aside>
      <dialog
        ref={dialog}
        onCancel={() => setModal('')}
        onClick={(e) => {
          if (e.target === dialog.current) setModal('');
        }}
      >
        <div className="modal">
          <button className="close icon-button" aria-label="Chiudi" onClick={() => setModal('')}>
            <X size={20} />
          </button>
          <ModalContent
            key={modal}
            modal={modal}
            s={s}
            project={project}
            busy={busy}
            act={act}
            close={() => setModal('')}
            notify={notify}
            refresh={refresh}
            openModal={setModal}
            providerInput={providerInput}
            modelInput={modelInput}
          />
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="Chiudi notifica" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function ModalContent({
  modal,
  s,
  project,
  busy,
  act,
  close,
  notify,
  refresh,
  openModal,
  providerInput,
  modelInput,
}: {
  modal: string;
  s: Snapshot;
  project: string;
  busy: boolean;
  act: (p: Record<string, unknown>, success?: string) => Promise<boolean>;
  close: () => void;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
  openModal: (s: string) => void;
  providerInput: React.RefObject<HTMLInputElement | null>;
  modelInput: React.RefObject<HTMLInputElement | null>;
}) {
  const [localBusy, setLocalBusy] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{
    email: string;
    password: string;
    name: string;
  } | null>(null);
  const [accessIds, setAccessIds] = useState<string[] | null>(
    s.demo ? s.profiles.map((u) => u.id) : null,
  );
  useEffect(() => {
    if (modal !== 'members' || s.demo) return;
    const controller = new AbortController();
    fetch('/api/members?project=' + project, { signal: controller.signal })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setAccessIds(d.user_ids);
      })
      .catch((e) => {
        if (!controller.signal.aborted) notify((e as Error).message);
      });
    return () => controller.abort();
  }, [modal, project, s.demo, notify]);
  const [type, id] = modal.split(':');
  const r = s.items.find((i) => i.id === id);
  const projects = s.items.filter((i) => i.kind === 'project');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) || '');
    let payload: Record<string, unknown> = {
      action: 'create',
      title: v('title'),
      body: v('body'),
      project_id: v('project') || null,
    };
    if (type === 'project')
      payload = { ...payload, kind: 'ai_proposal', data: { budget: Number(v('budget')) } };
    if (type === 'plan')
      payload = {
        action: 'plan',
        id,
        body: v('body'),
        data: {
          goal: v('goal'),
          budget: Number(v('budget')),
          launch: new Date(v('launch')).toISOString(),
          audience: v('audience'),
          expected_revenue: Number(v('expected_revenue')),
          risks: v('risks'),
        },
      };
    if (type === 'event')
      payload = {
        action: 'event',
        id,
        title: v('title'),
        body: v('body'),
        data: { due: new Date(v('due')).toISOString(), type: v('event_type') },
      };
    if (type === 'task')
      payload = {
        ...payload,
        kind: 'task',
        data: {
          assignee: v('assignee'),
          due: new Date(v('due')).toISOString(),
          minutes: Number(v('minutes')),
        },
      };
    if (type === 'finance')
      payload = { ...payload, kind: v('kind'), data: { amount: Number(v('amount')) } };
    if (type === 'memory')
      payload = id
        ? { action: 'memory', id, body: v('body'), status: v('status') }
        : { ...payload, kind: 'memory' };
    if (type === 'conversation')
      payload = { ...payload, kind: 'conversation', project_id: null, data: { private: true } };
    if (type === 'channel')
      payload = {
        ...payload,
        kind: 'conversation',
        project_id: project || null,
        data: { channel: v('channel'), kind: 'text' },
      };
    if (type === 'research') payload = { ...payload, kind: 'research_item' };
    if (type === 'profile')
      payload = {
        action: 'profile',
        data: {
          name: v('name'),
          avatar: v('avatar'),
          bio: v('bio'),
          skills: v('skills'),
          availability: v('availability'),
        },
      };
    if (type === 'role') payload = { action: 'role', data: { user_id: id, role: v('role') } };
    if (await act(payload, 'Operazione salvata.')) close();
  }
  const projectSelect = (
    <label>
      Progetto
      <select
        name="project"
        defaultValue={project}
        required={['task', 'conversation', 'channel'].includes(type)}
      >
        <option value="">Team / HQ</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </label>
  );
  if (type === 'approvals')
    return (
      <>
        <div className="eyebrow">DECIDI TU</div>
        <h2>Proposte in attesa</h2>
        {s.items
          .filter(
            (i) =>
              ['ai_proposal', 'financial_proposal', 'task', 'skill_change_request'].includes(
                i.kind,
              ) && i.status === 'proposto',
          )
          .map((p) => (
            <div className="approval-card" key={p.id}>
              <Status value={p.status} />
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              {p.data.amount !== undefined && <strong>{euro(n(p.data.amount))}</strong>}
              <div className="toolbar">
                <button
                  className="primary"
                  disabled={busy || s.role !== 'owner'}
                  onClick={() => void act({ action: 'approve', id: p.id }, 'Proposta approvata.')}
                >
                  Approva
                </button>
                <button
                  disabled={busy || s.role !== 'owner'}
                  onClick={() => void act({ action: 'reject', id: p.id }, 'Proposta rifiutata.')}
                >
                  Rifiuta
                </button>
              </div>
            </div>
          ))}
      </>
    );
  if (type === 'task' && r)
    return (
      <>
        <Status value={r.status} />
        <h2>{r.title}</h2>
        <p>{r.body}</p>
        <p>
          Scadenza: {date(r.data.due)} · {n(r.data.minutes)} minuti
        </p>
        <label>
          Dettagli, risultati o link
          <textarea
            id="task-note"
            placeholder="Cosa hai fatto? Aggiungi un link o segnala un blocco."
          />
        </label>
        <div className="toolbar">
          {r.status === 'proposto' && s.role === 'owner' ? (
            <button
              className="primary"
              onClick={async () => {
                if (await act({ action: 'approve', id: r.id })) close();
              }}
            >
              Approva task e scadenza
            </button>
          ) : (
            taskStates
              .filter((to) => canTransition(r.status, to, s.role, r.data.assignee === s.user.id))
              .map((to) => (
                <button
                  className="secondary"
                  key={to}
                  onClick={async () => {
                    if (
                      await act({
                        action: 'transition',
                        id: r.id,
                        status: to,
                        body: (document.getElementById('task-note') as HTMLTextAreaElement).value,
                      })
                    )
                      close();
                  }}
                >
                  {to === 'in revisione' ? 'Fatto · invia in revisione' : to}
                </button>
              ))
          )}
        </div>
        <h3>Aggiornamenti</h3>
        {s.items
          .filter((i) => i.kind === 'task_update' && i.data.task_id === r.id)
          .map((i) => (
            <p key={i.id}>
              {i.body || String(i.data.status)} <small>{date(i.created_at)}</small>
            </p>
          ))}
      </>
    );
  if (type === 'event' && r)
    return (
      <>
        <CalendarDays />
        <h2>{r.title}</h2>
        <p>{r.body}</p>
        <p>{new Date(String(r.data.due)).toLocaleString('it-IT')}</p>
      </>
    );
  if (type === 'notifications')
    return (
      <>
        <h2>Notifiche</h2>
        {s.items
          .filter((i) => i.kind === 'notification')
          .map((n) => (
            <div className="approval-card" key={n.id}>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </div>
          ))}
      </>
    );
  if (type === 'files')
    return (
      <>
        <h2>File del progetto</h2>
        {s.items
          .filter((i) => i.kind === 'attachment' && i.project_id === project)
          .map((i) => (
            <p key={i.id}>
              <a href={'/api/files?id=' + i.id}>{i.title} ↗</a>
            </p>
          ))}
        <p>Carica un file dalla chat del progetto. PNG, JPG, WEBP, PDF, TXT e CSV, fino a 10 MB.</p>
      </>
    );
  if (type === 'members')
    return (
      <>
        <h2>Accessi al progetto</h2>
        <p>Seleziona i membri che possono accedere. Le finanze sono visibili a tutto il team.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (s.demo) {
              notify('La gestione accessi richiede Supabase.');
              return;
            }
            const user_ids = new FormData(e.currentTarget).getAll('users');
            const res = await fetch('/api/members', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project_id: project, user_ids }),
            });
            const d = await res.json();
            notify(d.error || 'Accessi aggiornati.');
            if (res.ok) close();
          }}
        >
          {s.profiles.map((u) => (
            <label className="checkbox" key={u.id}>
              <input
                name="users"
                type="checkbox"
                value={u.id}
                disabled={accessIds === null}
                checked={accessIds?.includes(u.id) || false}
                onChange={(e) =>
                  setAccessIds((ids) =>
                    e.target.checked
                      ? [...(ids || []), u.id]
                      : (ids || []).filter((id) => id !== u.id),
                  )
                }
              />
              {u.name}
            </label>
          ))}
          <button className="primary" disabled={accessIds === null}>
            Salva accessi
          </button>
        </form>
      </>
    );
  if (type === 'close-project' && r)
    return (
      <>
        <h2>{r.status === 'chiuso' ? 'Riaprire il progetto?' : 'Chiudere il progetto?'}</h2>
        <p>Memorie, risultati e conversazioni restano conservati per le decisioni future.</p>
        <button
          className="primary"
          onClick={async () => {
            if (
              await act({
                action: 'project_status',
                id: r.id,
                status: r.status === 'chiuso' ? 'attivo' : 'chiuso',
              })
            )
              close();
          }}
        >
          Conferma
        </button>
      </>
    );
  if (type === 'reset')
    return (
      <>
        <h2>Ripristinare la demo?</h2>
        <p>I dati locali di questa demo saranno sostituiti dagli esempi iniziali.</p>
        <button
          className="danger-button"
          onClick={async () => {
            if (await act({ action: 'reset' })) close();
          }}
        >
          Conferma ripristino
        </button>
      </>
    );
  if (type === 'provider-save' || type === 'provider-remove')
    return (
      <>
        <h2>
          {type === 'provider-save'
            ? 'Salvare e verificare la chiave?'
            : 'Rimuovere la chiave salvata?'}
        </h2>
        <p>
          {type === 'provider-save'
            ? 'La chiave precedente sarà sostituita solo dopo una verifica riuscita.'
            : 'ARPAC userà il fallback server, se configurato. Altrimenti le risposte resteranno in coda.'}
        </p>
        <button
          className="primary"
          disabled={localBusy}
          onClick={async () => {
            setLocalBusy(true);
            try {
              const input = providerInput.current;
              const model = modelInput.current;
              if (type === 'provider-save' && !input?.value.trim()) {
                throw new Error('Incolla prima la chiave API nel campo sopra (Groq: gsk_... oppure Gemini: AIzaSy...).');
              }
              if (!model?.value.trim()) throw new Error('Inserisci il nome del modello (es. llama-3.3-70b-versatile per Groq).');
              const res = await fetch('/api/provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: type === 'provider-save' ? 'save' : 'remove',
                  key: input?.value || '',
                  model: model.value.trim(),
                  confirm: true,
                }),
                signal: AbortSignal.timeout(60000),
              });
              const result = await res.json();
              if (!res.ok) throw new Error(result.error);
              await refresh();
              notify(
                type === 'provider-save'
                  ? `Chiave verificata e salvata (••••${result.last4}).`
                  : 'Chiave AI rimossa.',
              );
              close();
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setLocalBusy(false);
            }
          }}
        >
          {localBusy ? 'Verifica in corso…' : 'Conferma'}
        </button>
      </>
    );
  if (type === 'avatar')
    return (
      <AvatarEditor
        value={s.user.avatar}
        name={s.user.name}
        busy={busy}
        onCancel={close}
        onSave={(avatar) =>
          act(
            {
              action: 'profile',
              data: {
                name: s.user.name,
                avatar,
                bio: s.user.bio,
                skills: s.user.skills,
                availability: s.user.availability,
              },
            },
            'Avatar aggiornato.',
          ).then((ok) => {
            if (ok) close();
            return ok;
          })
        }
      />
    );
  if (type === 'invite')
    return (
      <>
        <h2>Crea accesso membro</h2>
        <p>Crea tu email e password e consegnale al membro. Non serve aspettare un’email.</p>
        {createdAccount ? (
          <div className="account-created" role="status">
            <strong>Account creato.</strong>
            <p>Consegna queste credenziali a {createdAccount.name}:</p>
            <label>
              Email
              <input readOnly value={createdAccount.email} />
            </label>
            <label>
              Password
              <input readOnly value={createdAccount.password} />
            </label>
            <small>La password non verrà mostrata di nuovo dopo aver chiuso questa finestra.</small>
            <button type="button" className="primary" onClick={close}>
              Ho copiato le credenziali
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLocalBusy(true);
              try {
                const form = new FormData(e.currentTarget);
                const password = String(form.get('password') || '');
                const r = await fetch('/api/accounts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: form.get('name'),
                    email: form.get('email'),
                    password,
                    role: form.get('role'),
                    project_ids: form.getAll('project_ids'),
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                setCreatedAccount({
                  name: String(form.get('name')),
                  email: String(form.get('email')),
                  password,
                });
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setLocalBusy(false);
              }
            }}
          >
            <label>
              Nome
              <input name="name" required maxLength={80} />
            </label>
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            <label>
              Password (almeno 10 caratteri)
              <input
                name="password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Ruolo
              <select name="role" defaultValue="membro">
                <option value="membro">Membro</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            {s.items.some((i) => i.kind === 'project') && (
              <fieldset>
                <legend>Accesso ai progetti</legend>
                {s.items
                  .filter((i) => i.kind === 'project')
                  .map((p) => (
                    <label className="checkbox" key={p.id}>
                      <input type="checkbox" name="project_ids" value={p.id} />
                      {p.title}
                    </label>
                  ))}
              </fieldset>
            )}
            <button className="primary" disabled={localBusy}>
              {localBusy ? 'Creazione…' : 'Crea account'}
            </button>
          </form>
        )}
      </>
    );
  const titles: Record<string, string> = {
    project: 'Proponi un nuovo progetto',
    task: 'Un prossimo passo concreto',
    finance: 'Registra o proponi una voce',
    memory: id ? 'Correggi la memoria' : 'Una cosa da ricordare',
    conversation: 'Nuova chat privata',
    channel: 'Nuovo canale del progetto',
    research: 'Cerca fonti online',
    profile: 'Presentati al team',
    avatar: 'Il tuo avatar Wii',
    role: 'Proponi modifica ruolo',
    plan: 'Il piano del progetto',
    event: 'Proponi evento o milestone',
  };
  return (
    <>
      <div className="eyebrow">ARPAC / TEAM</div>
      <h2>{titles[type]}</h2>
      <form onSubmit={submit}>
        {type === 'profile' ? (
          <>
            <label>
              Nome
              <input name="name" defaultValue={s.user.name} required maxLength={80} />
            </label>
            <div className="profile-avatar-row">
              <Avatar value={s.user.avatar} name={s.user.name} className="large" />
              <div>
                <strong>Avatar Wii</strong>
                <small>Personalizzalo con volto, capelli, occhi e colori.</small>
                <button type="button" className="secondary" onClick={() => openModal('avatar')}>
                  Personalizza avatar Wii
                </button>
              </div>
            </div>
            <input type="hidden" name="avatar" value={s.user.avatar} readOnly />
            <label>
              Di te
              <textarea name="bio" defaultValue={s.user.bio} />
            </label>
            <label>
              Competenze
              <textarea name="skills" defaultValue={s.user.skills} />
            </label>
            <label>
              Disponibilità
              <input name="availability" defaultValue={s.user.availability} />
            </label>
            <small>
              Le modifiche a competenze e disponibilità richiedono approvazione owner dopo il primo
              accesso.
            </small>
          </>
        ) : type === 'role' ? (
          <label>
            Ruolo
            <select name="role">
              <option value="membro">Membro</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
        ) : (
          <>
            {!((type === 'memory' || type === 'plan') && id) && (
              <label>
                {type === 'research' ? 'Cosa cerchiamo?' : 'Titolo'}
                <input name="title" required maxLength={200} defaultValue={r?.title} />
              </label>
            )}
            {type !== 'research' && (
              <label>
                {type === 'finance' ? 'Motivo, alternative, rischi e impatto' : 'Descrizione'}
                <textarea name="body" required defaultValue={r?.body} />
              </label>
            )}
            {['task', 'channel'].includes(type) && !id && projectSelect}
            {type === 'channel' && (
              <label>
                Nome canale
                <input
                  name="channel"
                  required
                  maxLength={60}
                  placeholder="es. marketing, contenuti, lancio"
                />
                <small>Il canale sarà visibile a tutti i membri con accesso al progetto.</small>
              </label>
            )}
            {type === 'project' && (
              <label>
                Budget proposto (€)
                <input name="budget" type="number" min="0" defaultValue="0" />
              </label>
            )}
            {type === 'plan' && (
              <>
                <label>
                  Obiettivo misurabile
                  <input name="goal" required defaultValue={String(r?.data.goal || '')} />
                </label>
                <label>
                  Pubblico
                  <input name="audience" required />
                </label>
                <label>
                  Data di lancio
                  <input name="launch" type="datetime-local" required />
                </label>
                <label>
                  Budget massimo (€)
                  <input name="budget" type="number" min="0" defaultValue={n(r?.data.budget)} />
                </label>
                <label>
                  Entrate previste, stima (€)
                  <input name="expected_revenue" type="number" min="0" defaultValue="0" />
                </label>
                <label>
                  Rischi e alternative
                  <textarea name="risks" required />
                </label>
              </>
            )}
            {type === 'event' && (
              <>
                <label>
                  Quando
                  <input name="due" type="datetime-local" required />
                </label>
                <label>
                  Tipo
                  <select name="event_type">
                    {['sessione', 'pubblicazione', 'milestone', 'beta', 'lancio', 'promemoria'].map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </>
            )}
            {type === 'task' && (
              <>
                <label>
                  Proposto a
                  <select name="assignee">
                    {s.profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-row">
                  <label>
                    Quando
                    <input name="due" type="datetime-local" required />
                  </label>
                  <label>
                    Minuti stimati
                    <input name="minutes" type="number" min="1" defaultValue="60" required />
                  </label>
                </div>
              </>
            )}
            {type === 'finance' && (
              <>
                <label>
                  Tipo
                  <select name="kind">
                    <option value="financial_proposal">Proposta di spesa · da approvare</option>
                    {s.role === 'owner' && (
                      <option value="financial_entry">Movimento già avvenuto · registra</option>
                    )}
                  </select>
                </label>
                <label>
                  Importo (€)
                  <input name="amount" type="number" step="0.01" required />
                </label>
                <small>
                  Per movimenti: entrate positive, spese negative. Per proposte: importo positivo.
                  Nessun pagamento viene eseguito.
                </small>
              </>
            )}
            {type === 'memory' && id && (
              <label>
                Stato
                <select name="status" defaultValue={r?.status}>
                  <option value="attivo">Attiva</option>
                  <option value="obsoleto">Obsoleta</option>
                  <option value="archiviato">Archiviata</option>
                  <option value="eliminato">Elimina contenuto</option>
                </select>
              </label>
            )}
          </>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? 'Salvataggio…'
            : ['project', 'task', 'role'].includes(type)
              ? 'Invia proposta all’owner'
              : 'Salva'}
        </button>
      </form>
    </>
  );
}
