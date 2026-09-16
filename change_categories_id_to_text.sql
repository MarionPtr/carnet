-- Remplace l'id bigint par un id texte (UUID), cohérent avec ingredients/recipes/logs

-- 1. Ajoute une nouvelle colonne texte, avec un UUID généré pour les lignes existantes
--    et un DEFAULT pour que les futures lignes en reçoivent un automatiquement
alter table categories add column id_new text default gen_random_uuid()::text;
update categories set id_new = gen_random_uuid()::text where id_new is null;
alter table categories alter column id_new set not null;

-- 2. Retire l'ancienne clé primaire et l'ancienne colonne id (bigint)
alter table categories drop constraint categories_pkey;
alter table categories drop column id;

-- 3. Renomme la nouvelle colonne en "id" et la déclare comme clé primaire
alter table categories rename column id_new to id;
alter table categories add constraint categories_pkey primary key (id);
