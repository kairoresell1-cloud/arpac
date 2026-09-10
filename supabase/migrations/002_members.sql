create function public.set_project_members(p_project uuid,p_users uuid[],p_actor uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from team_memberships where user_id=p_actor and role='owner') then raise exception 'Solo owner';end if;
 if exists(select 1 from unnest(p_users) u where not exists(select 1 from team_memberships m where m.user_id=u)) then raise exception 'Membro non valido';end if;
 delete from project_members where project_id=p_project;
 insert into project_members(project_id,user_id) select p_project,unnest(p_users);
 insert into records(kind,title,body,owner_id,data) values('ai_activity_log','Accessi progetto aggiornati','',p_actor,jsonb_build_object('project_id',p_project,'actor',p_actor));
end$$;
revoke all on function public.set_project_members(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.set_project_members(uuid,uuid[],uuid) to service_role;
