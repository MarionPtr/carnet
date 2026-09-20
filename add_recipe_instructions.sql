-- Ajoute les instructions (texte) aux recettes
alter table recipes add column if not exists instructions text;
