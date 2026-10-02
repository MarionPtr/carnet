-- Plats : des regroupements d'ingrédients et/ou de recettes avec leurs quantités habituelles,
-- à ajouter d'un coup au journal. Propres à chaque personne.
create table if not exists dishes (
  id text primary key default gen_random_uuid()::text,
  person_id text not null,
  name text not null,
  -- repas habituel (petit-dej, dejeuner, diner, snacks) : sert à proposer ce plat en premier à ce repas
  default_meal text,
  -- [{ "kind": "ingredient" | "recipe", "ref_id": "...", "qty": 100 }]
  -- qty = grammes (ou ml) pour un ingrédient, nombre de parts pour une recette
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  unique (person_id, name)
);

-- Même politique d'accès que les autres tables de l'app (voir enable_rls.sql) :
-- usage strictement personnel, clé anon, pas de comptes séparés.
alter table dishes enable row level security;
drop policy if exists "allow anon all" on dishes;
create policy "allow anon all" on dishes for all to anon using (true) with check (true);
