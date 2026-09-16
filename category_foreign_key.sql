-- ÉTAPE 1 : ajouter les catégories orphelines détectées à la table categories
-- (id est généré automatiquement ; WHERE NOT EXISTS plutôt que ON CONFLICT
-- car on ne sait pas avec certitude si "name" a déjà une contrainte unique)
insert into categories (name)
select v.name from (values ('Epicerie'), ('Crèmerie')) as v(name)
where not exists (select 1 from categories c where c.name = v.name);

-- ÉTAPE 2 : vérifier qu'il ne reste plus de catégories orphelines (doit retourner 0 ligne)
select distinct category
from ingredients
where category is not null
  and category not in (select name from categories);

-- ÉTAPE 3 : s'assurer que categories.name a une contrainte unique
-- (nécessaire pour qu'une clé étrangère puisse la référencer ; ne fait rien si elle existe déjà)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'categories'::regclass and contype = 'u'
    and conkey = (select array_agg(attnum) from pg_attribute
                  where attrelid = 'categories'::regclass and attname = 'name')
  ) then
    alter table categories add constraint categories_name_unique unique (name);
  end if;
end $$;

-- ÉTAPE 4 : ajouter la contrainte de clé étrangère
-- (à exécuter seulement si l'étape 2 ci-dessus ne retourne aucune ligne)
alter table ingredients
  add constraint ingredients_category_fkey
  foreign key (category) references categories(name)
  on update cascade;
