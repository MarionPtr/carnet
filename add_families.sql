-- Familles : regroupent plusieurs catégories d'ingrédients
-- (exemple : la famille "Protéines" regroupe Viande, Poisson, Oeuf...)
-- Relation : une famille contient plusieurs catégories ; une catégorie appartient à
-- au plus une famille (family_id peut rester vide).

create table if not exists families (
  id text primary key default gen_random_uuid()::text,
  name text unique not null
);

-- Même fonctionnement que les autres tables de l'app : pas de restriction d'accès
alter table families disable row level security;

-- Lien catégorie -> famille.
-- "on delete set null" : si tu supprimes une famille, ses catégories ne sont pas
-- supprimées, elles se retrouvent simplement sans famille.
alter table categories
  add column if not exists family_id text references families(id) on delete set null;

-- Vérification (doit retourner la colonne family_id)
select column_name, data_type from information_schema.columns
where table_name = 'categories' and column_name = 'family_id';
