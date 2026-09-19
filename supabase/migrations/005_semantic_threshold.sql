-- Con l'embedding locale (hashing trick, vedi lib/embed.ts) una query debole
-- o generica (es. una conversazione appena creata, senza ancora messaggi)
-- poteva restituire comunque i "6 più vicini" anche quando NESSUNO era
-- davvero pertinente: la funzione ordinava per distanza e tagliava a 6 senza
-- una soglia minima di somiglianza. Il modello, istruito a fidarsi della
-- memoria semantica, finiva per raccontare come fatti reali ricordi presi
-- da progetti/conversazioni non correlati ("allucinazioni" che in realtà
-- erano dati veri ma del contesto sbagliato).
create or replace function public.match_memories(
  query_embedding extensions.vector(768),
  p_project uuid,
  p_owner uuid,
  p_conversation uuid
) returns table(record_id uuid, content text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select e.record_id, e.content, 1 - (e.embedding <=> query_embedding) as similarity
  from embeddings e
  join records r on r.id = e.record_id and r.kind in ('memory', 'message', 'attachment')
  where r.status not in ('obsoleto', 'archiviato', 'eliminato')
    and e.project_id is not distinct from p_project
    and (e.owner_id is null or e.owner_id = p_owner)
    and (e.conversation_id is null or e.conversation_id = p_conversation)
    -- Soglia minima: sotto 0.12 il match è rumore, non un ricordo pertinente.
    and 1 - (e.embedding <=> query_embedding) > 0.12
  order by e.embedding <=> query_embedding
  limit 6
$$;
