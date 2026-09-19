-- Ajoute le type, le lien de référence et la photo aux recettes
alter table recipes add column if not exists type text;
alter table recipes add column if not exists reference_url text;
alter table recipes add column if not exists photo text;

-- Table des types de recette, éditable comme les catégories d'ingrédients
create table if not exists recipe_types (
  id text primary key default gen_random_uuid()::text,
  name text unique not null
);

insert into recipe_types (name)
values ('Plat complet'), ('Accompagnement'), ('Protéine'), ('Sauce'), ('Dessert')
on conflict (name) do nothing;
