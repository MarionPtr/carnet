-- Ajoute la date de naissance au profil (l'âge est maintenant calculé automatiquement)
alter table profile add column if not exists birthdate date;
