-- Comptes de joueurs.
--
-- Une ligne par compte, la sauvegarde entière dans une colonne JSONB. C'est
-- volontairement grossier, et ça le reste : un compte pèse quelques dizaines
-- de kilo-octets, et découper le roster en tables séparées coûterait des
-- jointures à chaque lecture pour un gain nul. Le jour où deux joueurs
-- devront écrire dans la même partie — les raids en coopération — c'est une
-- table `parties` à côté qu'il faudra, pas un éclatement de celle-ci.
--
-- Deux choses que la version précédente n'avait pas et qui manquaient :
--
--   * l'identité. L'identifiant de compte était un UUID tiré dans le
--     navigateur : n'importe qui muni de la clé anonyme pouvait lire et
--     écrire n'importe quelle ligne. La clé primaire est désormais l'`uid`
--     d'authentification, ce qui rend RLS possible ;
--   * la concurrence. Deux onglets ouverts s'écrasaient en silence. La
--     colonne `version` permet une écriture conditionnelle : on n'écrit que
--     si personne n'a écrit depuis notre lecture.

create extension if not exists "pgcrypto";

create table if not exists public.comptes (
  -- L'identifiant du compte EST celui de l'utilisateur authentifié. Pas de
  -- colonne `user_id` séparée : elle aurait permis à une ligne d'exister sans
  -- propriétaire, ce qui est exactement ce qu'on veut rendre impossible.
  id uuid primary key references auth.users (id) on delete cascade,

  -- La sauvegarde, telle que le jeu la sérialise. Le schéma applicatif vit
  -- dans `src/data/types.ts` et migre côté client : la base n'a pas à le
  -- connaître, et n'a donc pas à être migrée quand il change.
  payload jsonb not null,

  -- Version de ligne, incrémentée par le trigger à chaque écriture. C'est
  -- elle qui porte la détection de conflit, pas `updated_at` : deux écritures
  -- dans la même milliseconde auraient le même horodatage.
  version bigint not null default 1,

  -- Horodatage applicatif : celui que le jeu connaît. Sert à départager deux
  -- sauvegardes divergentes, quand la version ne suffit plus.
  updated_at timestamptz not null default now(),

  -- Horodatage serveur, non falsifiable par le client. Sert au diagnostic.
  ecrit_le timestamptz not null default now()
);

comment on table public.comptes is
  'Sauvegardes de Poke tower. Une ligne par joueur, clé = uid d''authentification.';

-- Le trigger fait deux choses que le client ne doit pas décider lui-même :
-- incrémenter la version, et horodater côté serveur.
create or replace function public.comptes_avant_ecriture()
returns trigger
language plpgsql
as $$
begin
  new.ecrit_le := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists comptes_avant_ecriture on public.comptes;
create trigger comptes_avant_ecriture
  before insert or update on public.comptes
  for each row execute function public.comptes_avant_ecriture();

-- Row Level Security : un joueur ne voit et n'écrit que sa propre ligne.
--
-- Sans ça, la clé anonyme — qui est publique par construction, elle part dans
-- le bundle — donnerait accès à toutes les sauvegardes. C'est la seule chose
-- qui sépare « sauvegarde en ligne » de « base de données ouverte ».
alter table public.comptes enable row level security;

drop policy if exists "lire son compte" on public.comptes;
create policy "lire son compte"
  on public.comptes for select
  using (auth.uid() = id);

drop policy if exists "creer son compte" on public.comptes;
create policy "creer son compte"
  on public.comptes for insert
  with check (auth.uid() = id);

drop policy if exists "ecrire son compte" on public.comptes;
create policy "ecrire son compte"
  on public.comptes for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Pas de politique de suppression : rien dans le jeu ne supprime un compte,
-- et une politique qui n'a pas d'appelant est une surface d'attaque de plus.

-- Écriture conditionnelle.
--
-- Le client passe la version qu'il a lue. Si la ligne a bougé depuis, rien
-- n'est écrit et la fonction renvoie la ligne courante : l'appelant sait
-- alors qu'il y a conflit et peut décider. Faire ça en deux requêtes —
-- lire puis écrire — laisserait une fenêtre entre les deux.
create or replace function public.ecrire_compte(
  p_payload jsonb,
  p_updated_at timestamptz,
  p_version bigint
)
returns public.comptes
language plpgsql
security invoker
as $$
declare
  resultat public.comptes;
begin
  -- p_version = 0 : première écriture, la ligne ne doit pas exister encore.
  if p_version = 0 then
    insert into public.comptes (id, payload, updated_at)
    values (auth.uid(), p_payload, p_updated_at)
    on conflict (id) do nothing
    returning * into resultat;

    if resultat.id is null then
      select * into resultat from public.comptes where id = auth.uid();
    end if;
    return resultat;
  end if;

  update public.comptes
     set payload = p_payload,
         updated_at = p_updated_at
   where id = auth.uid()
     and version = p_version
  returning * into resultat;

  -- Aucune ligne touchée : conflit. On renvoie l'état réel plutôt qu'une
  -- erreur, pour que l'appelant puisse comparer et choisir.
  if resultat.id is null then
    select * into resultat from public.comptes where id = auth.uid();
  end if;

  return resultat;
end;
$$;

revoke all on function public.ecrire_compte(jsonb, timestamptz, bigint) from public;
grant execute on function public.ecrire_compte(jsonb, timestamptz, bigint) to authenticated;
