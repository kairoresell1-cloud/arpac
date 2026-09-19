-- ARPAC schema completo. Incolla tutto questo file in Supabase > SQL Editor > Run.
-- Esegui una sola volta, dopo aver creato un progetto Supabase vuoto.


-- ARPAC: un team privato per istanza. Eseguire come postgres nel SQL Editor.
create extension if not exists vector with schema extensions;
create table public.profiles (id uuid primary key references auth.users on delete cascade,name text not null default 'Nuovo membro',avatar text not null default 'ME',skills text not null default '',bio text not null default '',availability text not null default '',onboarded boolean not null default false);
create table public.team_memberships(user_id uuid primary key references public.profiles on delete cascade,role text not null check(role in ('owner','admin','membro','viewer')));
create unique index one_owner on public.team_memberships(role) where role='owner';
create table public.project_members(project_id uuid not null,user_id uuid not null references public.profiles on delete cascade,primary key(project_id,user_id));
create table public.records(id uuid not null default gen_random_uuid(),kind text not null,title text not null,body text not null default '',project_id uuid,conversation_id uuid,owner_id uuid references public.profiles,status text not null default 'attivo',data jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(kind,id)) partition by list(kind);
do $$ declare names text[][]:=array[array['project','projects'],array['conversation','conversations'],array['message','messages'],array['attachment','attachments'],array['task','tasks'],array['task_update','task_updates'],array['calendar_event','calendar_events'],array['financial_entry','financial_entries'],array['financial_proposal','financial_proposals'],array['ai_proposal','ai_proposals'],array['approval','approvals'],array['memory','memories'],array['memory_source','memory_sources'],array['ai_activity_log','ai_activity_log'],array['notification','notifications'],array['research_item','research_items'],array['invite','invites'],array['skill_change_request','skill_change_requests']]; pair text[]; begin foreach pair slice 1 in array names loop execute format('create table public.%I partition of public.records for values in (%L)',pair[2],pair[1]);execute format('alter table public.%I enable row level security',pair[2]);execute format('revoke all on public.%I from anon, authenticated',pair[2]);end loop;end $$;
create index record_project on public.records(project_id);
create index record_conversation on public.records(conversation_id,created_at);
create table public.ai_provider_settings(id int primary key check(id=1),ciphertext text not null,last4 text not null,model text not null,updated_at timestamptz default now());
create table public.ai_jobs(id uuid primary key default gen_random_uuid(),kind text not null,payload jsonb not null,status text not null default 'pending',attempts int not null default 0,available_at timestamptz not null default now(),locked_at timestamptz,created_at timestamptz default now(),dedup_key text unique);
create table public.embeddings(record_id uuid primary key,project_id uuid,owner_id uuid,conversation_id uuid,content text not null,embedding extensions.vector(768));
create table public.scheduler_state(id int primary key check(id=1),last_run timestamptz not null default now());
insert into public.scheduler_state(id) values(1);
create table public.rate_limits(actor_id uuid primary key,window_start timestamptz not null default now(),count int not null default 0);
create function public.is_member() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from team_memberships where user_id=auth.uid())$$;
create function public.can_project(p uuid) returns boolean language sql stable security definer set search_path=public as $$select public.is_member() and (p is null or exists(select 1 from project_members where project_id=p and user_id=auth.uid()))$$;
create function public.can_conversation(c uuid) returns boolean language sql stable security definer set search_path=public as $$select c is null or exists(select 1 from records where kind='conversation' and id=c and public.can_project(project_id) and (owner_id is null or owner_id=auth.uid()))$$;
alter table public.records enable row level security;
create policy records_read on public.records for select to authenticated using(public.is_member() and (kind='financial_entry' or kind='financial_proposal' or public.can_project(case when kind='project' then id else project_id end)) and (owner_id is null or owner_id=auth.uid()) and public.can_conversation(conversation_id) and (kind not in ('invite','approval') or exists(select 1 from team_memberships where user_id=auth.uid() and role='owner')));
alter table public.profiles enable row level security;
alter table public.team_memberships enable row level security;
alter table public.project_members enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(public.is_member());
create policy memberships_read on public.team_memberships for select to authenticated using(public.is_member());
create policy project_members_read on public.project_members for select to authenticated using(public.can_project(project_id));
-- Le mutazioni passano dalle route autorizzate; nessuna policy INSERT/UPDATE/DELETE pubblica.
alter table public.ai_provider_settings enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.embeddings enable row level security;
alter table public.scheduler_state enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.ai_provider_settings,public.ai_jobs,public.embeddings,public.scheduler_state,public.rate_limits from anon,authenticated;
create function public.claim_job() returns setof public.ai_jobs language sql security definer set search_path=public as $$update ai_jobs set status='running',locked_at=now(),attempts=attempts+1 where id=(select id from ai_jobs where (status='pending' and available_at<=now()) or (status='running' and locked_at<now()-interval '10 minutes') order by available_at for update skip locked limit 1) returning *$$;
create function public.consume_rate(p_actor uuid) returns boolean language plpgsql security definer set search_path=public as $$declare n int;begin insert into rate_limits(actor_id,count) values(p_actor,1) on conflict(actor_id) do update set count=case when rate_limits.window_start<now()-interval '1 minute' then 1 else rate_limits.count+1 end,window_start=case when rate_limits.window_start<now()-interval '1 minute' then now() else rate_limits.window_start end returning count into n;return n<=12;end$$;
create function public.match_memories(query_embedding extensions.vector(768),p_project uuid,p_owner uuid,p_conversation uuid) returns table(record_id uuid,content text,similarity float) language sql stable security definer set search_path=public,extensions as $$select e.record_id,e.content,1-(e.embedding <=> query_embedding) from embeddings e join records r on r.id=e.record_id and r.kind in ('memory','message','attachment') where r.status not in ('obsoleto','archiviato','eliminato') and e.project_id is not distinct from p_project and (e.owner_id is null or e.owner_id=p_owner) and (e.conversation_id is null or e.conversation_id=p_conversation) and 1-(e.embedding <=> query_embedding) > 0.12 order by e.embedding <=> query_embedding limit 6$$;
create function public.approve_record(p_id uuid,p_actor uuid,p_approve boolean) returns void language plpgsql security definer set search_path=public as $$declare r records;new_id uuid;begin
 if not exists(select 1 from team_memberships where user_id=p_actor and role='owner') then raise exception 'Solo owner';end if;
 select * into r from records where id=p_id and kind in ('ai_proposal','financial_proposal','task','skill_change_request') for update;
 if not found or r.status<>'proposto' then raise exception 'Proposta già elaborata';end if;
 update records set status=case when p_approve then 'approvato' else 'annullato' end,updated_at=now() where id=r.id and kind=r.kind;
 insert into records(kind,title,body,data) values('approval',case when p_approve then 'Approvata' else 'Rifiutata' end,r.title,jsonb_build_object('actor',p_actor,'proposal',r.id));
 if not p_approve then return;end if;
 if r.kind='ai_proposal' and r.data->>'type'='project' then
 new_id=gen_random_uuid();insert into records(kind,id,title,body,data) values('project',new_id,r.title,r.body,r.data);
 insert into project_members(project_id,user_id) select new_id,user_id from team_memberships;
 insert into records(kind,title,body,project_id,data) values
 ('conversation','Generale','Canale principale del progetto.',new_id,'{"channel":"generale","kind":"text"}'),
 ('conversation','Decisioni','Decisioni approvate e priorità.',new_id,'{"channel":"decisioni","kind":"text"}'),
 ('conversation','Operatività','Coordinamento del lavoro quotidiano.',new_id,'{"channel":"operativita","kind":"text"}');
 insert into records(kind,title,body,project_id,conversation_id,data) select 'message','ARPAC','Partiamo dalle basi: quale obiettivo misurabile vogliamo raggiungere? Poi definiamo pubblico, lancio, budget, entrate attese, competenze, disponibilità, rischi e metriche.',new_id,id,'{"author":"ARPAC"}' from records where kind='conversation' and project_id=new_id;
 elsif r.kind='ai_proposal' and r.data->>'type'='plan' then update records set data=data||r.data,updated_at=now() where kind='project' and id=r.project_id;
 elsif r.kind='ai_proposal' and r.data->>'type'='event' then insert into records(kind,title,body,project_id,data) values('calendar_event',r.title,r.body,r.project_id,r.data);
 elsif r.kind='task' then insert into records(kind,title,body,project_id,data) values('calendar_event',r.title,r.body,r.project_id,r.data||jsonb_build_object('task_id',r.id));
 elsif r.kind='skill_change_request' then update profiles set skills=coalesce(r.data->>'skills',skills),availability=coalesce(r.data->>'availability',availability) where id=r.owner_id;
 elsif r.kind='ai_proposal' and r.data->>'type'='role' then update team_memberships set role=r.data->>'role' where user_id=(r.data->>'user_id')::uuid and role<>'owner';
 end if;
 insert into records(kind,title,body,project_id,owner_id) values('memory','Decisione approvata: '||r.title,r.body,r.project_id,r.owner_id);
end$$;
revoke all on function public.claim_job(),public.consume_rate(uuid),public.match_memories(extensions.vector,uuid,uuid,uuid),public.approve_record(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_job(),public.consume_rate(uuid),public.match_memories(extensions.vector,uuid,uuid,uuid),public.approve_record(uuid,uuid,boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('team-files','team-files',false,10485760);
-- Solo URL firmati emessi dal backend dopo verifica della conversazione.
alter publication supabase_realtime add table public.records;



create function public.set_project_members(p_project uuid,p_users uuid[],p_actor uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from team_memberships where user_id=p_actor and role='owner') then raise exception 'Solo owner';end if;
 if exists(select 1 from unnest(p_users) u where not exists(select 1 from team_memberships m where m.user_id=u)) then raise exception 'Membro non valido';end if;
 delete from project_members where project_id=p_project;
 insert into project_members(project_id,user_id) select p_project,unnest(p_users);
 insert into records(kind,title,body,owner_id,data) values('ai_activity_log','Accessi progetto aggiornati','',p_actor,jsonb_build_object('project_id',p_project,'actor',p_actor));
end$$;
revoke all on function public.set_project_members(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.set_project_members(uuid,uuid[],uuid) to service_role;



-- Le richieste profilo sono private al membro ma devono essere approvabili dall’owner.
create function public.is_owner() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from team_memberships where user_id=auth.uid() and role='owner')$$;
drop policy records_read on public.records;
create policy records_read on public.records for select to authenticated using(public.is_member() and (kind in ('financial_entry','financial_proposal') or public.can_project(case when kind='project' then id else project_id end)) and (owner_id is null or owner_id=auth.uid() or (kind='skill_change_request' and public.is_owner())) and public.can_conversation(conversation_id) and (kind not in ('invite','approval') or public.is_owner()));
grant select on public.records,public.profiles,public.team_memberships,public.project_members to authenticated;
grant all on all tables in schema public to service_role;
create unique index message_job_once on public.messages((data->>'job_id')) where data ? 'job_id';
create function public.project_audience(p_project uuid) returns uuid[] language sql stable security definer set search_path=public as $$select array_agg(user_id) from project_members where project_id=p_project$$;
revoke all on function public.project_audience(uuid) from public,anon,authenticated;
grant execute on function public.project_audience(uuid) to service_role;



create function public.commit_ai_reply(p_job uuid,p_records jsonb) returns void language plpgsql security definer set search_path=public as $$declare r records;begin
 perform 1 from ai_jobs where id=p_job and status='running' for update;
 if not found then return;end if;
 insert into records select * from jsonb_populate_recordset(null::records,p_records);
 for r in select * from jsonb_populate_recordset(null::records,p_records) where kind='memory' loop
 insert into ai_jobs(kind,payload,dedup_key) values('index',jsonb_build_object('record_id',r.id),'index:'||r.id) on conflict(dedup_key) do nothing;
 end loop;
 update ai_jobs set status='done' where id=p_job;
end$$;
revoke all on function public.commit_ai_reply(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commit_ai_reply(uuid,jsonb) to service_role;



