-- Supprime les anciennes colonnes de portion, remplacées par la colonne unique "portions"
-- (vérifié : toutes leurs données sont déjà dans "portions", rien n'est perdu)
alter table ingredients
  drop column if exists serving_size,
  drop column if exists serving_size_grams,
  drop column if exists extra_portions;
