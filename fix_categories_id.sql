-- Ajoute une colonne id auto-générée (remplit automatiquement les lignes existantes)
alter table categories add column id bigint generated always as identity;

-- La définit comme clé primaire (nécessaire pour éditer/supprimer des lignes dans Table Editor)
alter table categories add constraint categories_pkey primary key (id);
