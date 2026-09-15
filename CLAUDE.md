# Carnet — suivi nutrition & batch cook

## Le projet

App personnelle (iPhone + Mac) pour :
- gérer une liste d'ingrédients (macros pour 100g/100ml)
- créer des recettes à partir de ces ingrédients (macros calculées automatiquement)
- suivre les repas du jour vs des objectifs de kcal/protéines/glucides/lipides
- générer des suggestions de batch cook selon les ingrédients disponibles

Usage strictement personnel, un seul utilisateur. Pas besoin de comptes multiples,
pas besoin d'authentification complexe.

## État actuel

Un prototype fonctionnel existe : `tracker.html`, un fichier unique (HTML + CSS +
JS vanilla, sans framework, sans build step). Il a été construit comme artifact
Claude.ai et utilise `window.storage` (API propre aux artifacts Claude.ai) pour la
persistance — **cette API n'existe pas en dehors de claude.ai et doit être
remplacée**.

C'est le point de départ, pas un legacy à préserver à tout prix : n'hésite pas à
restructurer si c'est plus propre.

## Objectif de cette session

1. Remplacer `window.storage` par une vraie solution de persistance qui
   synchronise entre iPhone et Mac : **Supabase** est le choix recommandé
   (gratuit, simple, REST + client JS). Alternative plus simple mais sans sync
   multi-appareil : `localStorage`.
2. Décider avec moi si on garde le HTML/JS vanilla (plus simple, zéro build) ou
   si on migre vers un petit projet Vite + vanilla JS / React (plus confortable
   à faire évoluer). Pas de préférence forte de mon côté — proposer et discuter.
3. Une fois stable, m'aider à déployer (Vercel ou Netlify, gratuit) pour avoir
   une URL fixe, installable sur l'écran d'accueil iPhone via Safari > Partager >
   Sur l'écran d'accueil (PWA-like).
4. Pas d'appel à une API d'IA dans l'app elle-même : le batch cook doit rester un
   algorithme à règles, pas un appel LLM en runtime (pas de coût récurrent,
   fonctionne hors ligne).

## Modèle de données actuel (à conserver ou adapter dans la nouvelle persistance)

```
ingredient: { id, name, kcal, protein, carbs, fat }   // valeurs pour 100g/100ml

recipe: {
  id, name, servings,
  items: [ { ingredientId, grams } ]
}

profile: {
  weight, height, age, sex, activity,       // pour le calcul auto des objectifs
  goal: 'cut' | 'maintain' | 'bulk',
  useCustom: bool,
  customTargets: { kcal, protein, carbs, fat }  // si useCustom = true
}

logs: {
  "YYYY-MM-DD": [
    { id, kind: 'recipe' | 'ingredient', refId, name, kcal, protein, carbs, fat, ts }
  ]
}
```

## Logique métier à préserver

**Calcul des objectifs** (formule Mifflin-St Jeor) :
- BMR (homme) = 10×poids + 6.25×taille − 5×âge + 5
- BMR (femme) = 10×poids + 6.25×taille − 5×âge − 161
- TDEE = BMR × facteur d'activité (1.2 à 1.9)
- kcal cible = TDEE, TDEE−450 (sèche), ou TDEE+300 (prise de masse)
- Protéines = 1.8g/kg, Lipides = 0.85g/kg, reste en glucides

**Score de batch cook** (moyenne à parts égales de trois facteurs, 0 à 1) :
- disponibilité : proportion des ingrédients de la recette déjà cochés comme
  "disponibles"
- équilibre macro : proximité entre la répartition %kcal (protéines/glucides/
  lipides) de la recette et celle des objectifs du profil
- praticité : portion proche de (kcal cible ÷ 3), recette pas trop complexe

Les repas à préparer sont ensuite répartis entre les meilleures recettes au
prorata de leur score.

## Fichier de référence

Le fichier `tracker.html` (à copier dans ce projet) contient l'implémentation
complète actuelle : structure des pages (Aujourd'hui / Ingrédients / Recettes /
Batch cook / Profil), logique de rendu, et tous les calculs ci-dessus. Utilise-le
comme référence fonctionnelle même si l'implémentation change.

## Contraintes de design

- Mobile-first (iPhone), doit aussi bien fonctionner sur grand écran (Mac)
- Palette actuelle : fond vert pin foncé (#1F2A24), accents distincts par macro
  (protéines ambre, glucides sauge, lipides terracotta) — à garder ou faire
  évoluer, pas de contrainte stricte
- Pas de jargon technique dans l'interface, vocabulaire simple ("Ajouter au
  journal", pas "Créer une entrée")
