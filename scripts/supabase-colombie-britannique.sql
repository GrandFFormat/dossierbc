-- DossierBC — les tables du site, dans le projet Supabase de DossierQuébec.
--
-- À exécuter UNE FOIS dans le projet Supabase de DQ : SQL Editor → coller → Run.
-- Re-exécutable sans erreur. Ne touche à AUCUNE table de DQ, du N.-B., de l'Ontario
-- ni de la Saskatchewan.
--
-- Même compte pour toute la famille Dossier : une personne connectée sur DQ l'est aussi ici.
-- Mais des tables À PART, préfixées bc_, exactement pour les mêmes trois raisons qu'en
-- Saskatchewan (scripts/supabase-saskatchewan.sql de ce site-là) :
--   - les projets de la C.-B. ont leurs propres identifiants (législature × 100 000 +
--     session × 1 000 + numéro : 4302249 pour le n° 249 de la 2e session de la 43e) ;
--     versés dans bill_flags, ils se mêleraient aux identifiants de Données Québec ;
--   - les plafonds de DQ comptent TOUS les suivis d'une personne : sans tables à part, suivre
--     3 dossiers au Québec empêcherait d'en suivre un seul en Colombie-Britannique ;
--   - les envois de courriels de DQ parcourent ses tables : ils ne doivent jamais tomber sur un
--     projet de la C.-B.
--
-- Mêmes règles que DQ, l'Ontario et la Saskatchewan :
--   - chaque personne ne voit et ne modifie que ses propres lignes (RLS) ;
--   - les plafonds s'appliquent ICI, pas dans le navigateur ;
--   - le public ne voit que des TOTAUX (bc_flag_counts, bc_suivis), jamais qui a demandé quoi ;
--   - un compte de consultation (bibliothèque) ne peut rien écrire : même déclencheur que DQ
--     (public.refus_lecture_seule, défini par dossierquebec/scripts/supabase-schema-cadeaux.sql).
--
-- Chaque table reçoit ses GRANT dans CE fichier : sans eux, la RLS est en place mais le rôle
-- n'a tout simplement pas le droit sur la table, et le site renvoie une erreur sèche.


-- ---------------------------------------------------------------------------------------------
-- 1. « Demander une explication » (le challenge) — commun/dq.js, requestExplanation()
-- ---------------------------------------------------------------------------------------------
create table if not exists public.bc_bill_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id bigint not null,                    -- 4302249 = projet n° 249, 2e session de la 43e
  created_at timestamptz not null default now(),
  unique (user_id, bill_id)
);
alter table public.bc_bill_flags enable row level security;

-- 10 demandes par compte par 30 jours — le chiffre que le site annonce dans son message
-- d'erreur. Fonction security definer : une sous-requête directe dans la policy déclenche
-- « infinite recursion detected in policy for relation bc_bill_flags ».
create or replace function public.bc_my_recent_flag_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bc_bill_flags
  where user_id = auth.uid() and created_at > now() - interval '30 days';
$$;
revoke execute on function public.bc_my_recent_flag_count() from public, anon;
grant execute on function public.bc_my_recent_flag_count() to authenticated;

drop policy if exists "bc insert own flag" on public.bc_bill_flags;
drop policy if exists "bc select own flag" on public.bc_bill_flags;
drop policy if exists "bc delete own flag" on public.bc_bill_flags;
drop policy if exists "bc admins view all flags" on public.bc_bill_flags;
create policy "bc insert own flag" on public.bc_bill_flags for insert
  with check (auth.uid() = user_id and public.bc_my_recent_flag_count() < 10);
create policy "bc select own flag" on public.bc_bill_flags for select
  using (auth.uid() = user_id);
create policy "bc delete own flag" on public.bc_bill_flags for delete
  using (auth.uid() = user_id);
-- Le panneau d'administration (commun/dq.js, renderAdminFlags) lit tous les projets signalés.
-- La sous-requête porte sur public.admins, PAS sur bc_bill_flags : aucune récursion.
create policy "bc admins view all flags" on public.bc_bill_flags for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
grant select, insert, delete on public.bc_bill_flags to authenticated;

-- Les totaux publics — jamais d'identité. Même forme que flag_counts() de DQ, et le site
-- montre un projet dès la PREMIÈRE demande (CHALLENGE_DISPLAY_MIN = 1 dans commun/dq.js),
-- d'où le « >= 1 » et non le premier palier (500).
create or replace function public.bc_flag_counts()
returns table (bill_id bigint, cnt bigint)
language sql stable security definer set search_path = public as $$
  select bill_id, count(*)::bigint as cnt
  from public.bc_bill_flags
  group by bill_id
  having count(*) >= 1
  order by count(*) desc;
$$;
grant execute on function public.bc_flag_counts() to anon, authenticated;


-- ---------------------------------------------------------------------------------------------
-- 2. Les ministres et député·e·s suivis (même forme que follows de DQ)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.bc_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_type text not null check (person_type in ('minister', 'depute')),
  person_key text not null check (length(person_key) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (user_id, person_type, person_key)
);
alter table public.bc_follows enable row level security;

drop policy if exists "bc select own follows" on public.bc_follows;
drop policy if exists "bc insert own follows" on public.bc_follows;
drop policy if exists "bc delete own follows" on public.bc_follows;
create policy "bc select own follows" on public.bc_follows for select using (auth.uid() = user_id);
create policy "bc insert own follows" on public.bc_follows for insert with check (auth.uid() = user_id);
create policy "bc delete own follows" on public.bc_follows for delete using (auth.uid() = user_id);
grant select, insert, delete on public.bc_follows to authenticated;

-- Au plus 150 personnes suivies (il y a 93 sièges, et une personne peut être suivie comme
-- ministre et comme député·e) : seulement contre l'abus, pas un plafond de produit.
create or replace function public.bc_limite_follows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.bc_follows where user_id = new.user_id) >= 150 then
    raise exception 'limite de 150 personnes suivies atteinte';
  end if;
  return new;
end;
$$;
drop trigger if exists bc_limite_follows on public.bc_follows;
create trigger bc_limite_follows before insert on public.bc_follows
  for each row execute function public.bc_limite_follows();

-- Le compteur affiché à côté de chaque bouton « Suivre » (commun/dq.js, nbSuivisCharger) :
-- combien de personnes suivent cet·te élu·e, toutes clés confondues. Des TOTAUX par nom,
-- jamais une identité. person_key vaut « Nom » (ministre) ou « Nom|Circonscription » : on ne
-- garde que ce qui précède la barre, et on compte les personnes distinctes.
create or replace function public.bc_suivis()
returns table (nom text, nb bigint)
language sql stable security definer set search_path = public as $$
  select split_part(person_key, '|', 1) as nom, count(distinct user_id)::bigint as nb
  from public.bc_follows
  group by split_part(person_key, '|', 1)
  having count(distinct user_id) >= 1;
$$;
grant execute on function public.bc_suivis() to anon, authenticated;


-- ---------------------------------------------------------------------------------------------
-- 3. Les projets de loi suivis (ils apparaissent dans « My file »)
--
-- Même forme que dossiers_suivis de DQ, parce que le code du site est le sien : la colonne
-- `ville` existe, et elle vaut toujours « assemblee » ici — la C.-B. n'a aucun volet de ville.
-- Le contrôle le dit, pour qu'une ligne de ville ne puisse pas s'y glisser par erreur.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.bc_dossiers_suivis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ville text not null default 'assemblee' check (ville = 'assemblee'),
  dossier_id text not null check (length(dossier_id) between 1 and 120),   -- « pl:4302249 »
  numero text check (length(numero) <= 20),
  objet text check (length(objet) <= 600),
  created_at timestamptz not null default now(),
  unique (user_id, ville, dossier_id)
);
alter table public.bc_dossiers_suivis enable row level security;

drop policy if exists "bc select own suivis" on public.bc_dossiers_suivis;
drop policy if exists "bc insert own suivis" on public.bc_dossiers_suivis;
drop policy if exists "bc delete own suivis" on public.bc_dossiers_suivis;
create policy "bc select own suivis" on public.bc_dossiers_suivis for select using (auth.uid() = user_id);
create policy "bc insert own suivis" on public.bc_dossiers_suivis for insert with check (auth.uid() = user_id);
create policy "bc delete own suivis" on public.bc_dossiers_suivis for delete using (auth.uid() = user_id);
grant select, insert, delete on public.bc_dossiers_suivis to authenticated;

-- 3 projets suivis par compte gratuit — le chiffre que la page annonce (MD_PLAFOND dans
-- commun/dq.js). Pas d'abonnement sur DossierBC : le plafond est le même pour tout le monde.
-- Le message reprend mot pour mot la forme que le site sait lire (« limite de N suivis »).
-- Un suivi déjà là passe, pour que l'upsert sans doublon ne lève rien.
create or replace function public.bc_limite_suivis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.bc_dossiers_suivis
             where user_id = new.user_id and ville = new.ville and dossier_id = new.dossier_id) then
    return new;
  end if;
  if (select count(*) from public.bc_dossiers_suivis where user_id = new.user_id) >= 3 then
    raise exception 'limite de 3 suivis atteinte';
  end if;
  return new;
end;
$$;
drop trigger if exists bc_limite_suivis on public.bc_dossiers_suivis;
create trigger bc_limite_suivis before insert on public.bc_dossiers_suivis
  for each row execute function public.bc_limite_suivis();


-- ---------------------------------------------------------------------------------------------
-- 4. La sauvegarde du dimanche
--
-- Documents/sauvegardes-supabase/sauvegarde-du-dimanche.cjs lit TOUTES les tables avec le rôle
-- service_role et en fait une copie JSON. Sans ce GRANT, il ne voit pas la table et la saute en
-- silence : la copie dit « 0 table non lue » alors que trois manquent. Le même oubli avait eu lieu
-- le 2 nov. 2026 sur on_bill_flags et les sk_*.
-- ---------------------------------------------------------------------------------------------
grant select on public.bc_bill_flags to service_role;
grant select on public.bc_follows to service_role;
grant select on public.bc_dossiers_suivis to service_role;


-- ---------------------------------------------------------------------------------------------
-- 5. Comptes de consultation (bibliothèque) : lecture seule sur les trois tables
-- ---------------------------------------------------------------------------------------------
drop trigger if exists refus_lecture_seule_bc_bill_flags on public.bc_bill_flags;
create trigger refus_lecture_seule_bc_bill_flags before insert or update or delete on public.bc_bill_flags
  for each row execute function public.refus_lecture_seule();
drop trigger if exists refus_lecture_seule_bc_follows on public.bc_follows;
create trigger refus_lecture_seule_bc_follows before insert or update or delete on public.bc_follows
  for each row execute function public.refus_lecture_seule();
drop trigger if exists refus_lecture_seule_bc_dossiers_suivis on public.bc_dossiers_suivis;
create trigger refus_lecture_seule_bc_dossiers_suivis before insert or update or delete on public.bc_dossiers_suivis
  for each row execute function public.refus_lecture_seule();
