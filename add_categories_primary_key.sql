-- Vérifie d'abord qu'il n'y a pas déjà une clé primaire sous un autre nom
select conname from pg_constraint
where conrelid = 'categories'::regclass and contype = 'p';

-- Si la requête ci-dessus ne retourne aucune ligne, ajoute la clé primaire sur id
alter table categories add constraint categories_pkey primary key (id);
