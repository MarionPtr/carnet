-- Active la sécurité au niveau des lignes (RLS) sur toutes les tables de l'app,
-- pour faire disparaître les alertes "RLS Disabled in Public" de Supabase.
--
-- Contexte : l'app est un usage strictement personnel, sans système de comptes.
-- Elle se connecte avec la clé publique "anon" et gère l'accès via un mot de
-- passe côté app (pas une vraie authentification Supabase). Il n'y a donc pas
-- de notion d'utilisateur pour restreindre les lignes par propriétaire.
--
-- Ce script active RLS (ce que Supabase demande) puis ajoute une règle
-- permissive qui autorise toutes les opérations (lecture, ajout, modification,
-- suppression) pour la clé anon, sur chaque table. Le comportement de l'app ne
-- change pas : tout ce qui marchait avant continue de marcher, mais RLS est
-- désormais explicitement activé au lieu d'être simplement désactivé.

do $$
declare
  t text;
begin
  foreach t in array array['ingredients','recipes','recipe_items','categories','families','recipe_types','profile','logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Supprime une éventuelle ancienne règle du même nom avant de la recréer
    execute format('drop policy if exists "allow anon all" on public.%I', t);
    execute format('create policy "allow anon all" on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- Vérification : doit lister les 8 tables avec rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('ingredients','recipes','recipe_items','categories','families','recipe_types','profile','logs')
order by tablename;
