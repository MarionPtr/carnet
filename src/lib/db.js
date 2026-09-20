import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fmocmtvfbifwsuduigcy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtb2NtdHZmYmlmd3N1ZHVpZ2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODE3OTEsImV4cCI6MjEwNTA1Nzc5MX0.BT9O92Pz8_LOWGUysngsCRj1W2QLwMY7iihkFd8FfHQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Helper: générer un ID unique
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// Charger les ingrédients
export async function loadIngredients() {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
  if (error) {
    console.error('Erreur chargement ingrédients:', error)
    return []
  }
  return data || []
}

// Ajouter/modifier un ingrédient
export async function saveIngredient(ingredient) {
  const { error } = await supabase
    .from('ingredients')
    .upsert([ingredient], { onConflict: 'id' })
  if (error) {
    console.error('Erreur sauvegarde ingrédient:', error)
    throw error
  }
}

// Supprimer un ingrédient
export async function deleteIngredient(id) {
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id)
  if (error) {
    console.error('Erreur suppression ingrédient:', error)
    throw error
  }
}

// Charger les recettes (avec leurs items)
export async function loadRecipes() {
  const { data: recipes, error: recipesError } = await supabase
    .from('recipes')
    .select('*')

  if (recipesError) {
    console.error('Erreur chargement recettes:', recipesError)
    return []
  }

  // Charger les items pour chaque recette
  for (let recipe of recipes) {
    const { data: items, error: itemsError } = await supabase
      .from('recipe_items')
      .select('*')
      .eq('recipe_id', recipe.id)

    recipe.items = items || []
  }

  return recipes || []
}

// Ajouter/modifier une recette
export async function saveRecipe(recipe) {
  const { items, ...recipeData } = recipe

  // Sauvegarder la recette
  const { error: recipeError } = await supabase
    .from('recipes')
    .upsert([recipeData], { onConflict: 'id' })

  if (recipeError) {
    console.error('Erreur sauvegarde recette:', recipeError)
    throw recipeError
  }

  // Supprimer les items existants et sauvegarder les nouveaux
  await supabase
    .from('recipe_items')
    .delete()
    .eq('recipe_id', recipe.id)

  if (items && items.length > 0) {
    const itemsWithRecipeId = items.map(item => ({
      id: uid(),
      recipe_id: recipe.id,
      ingredient_id: item.ingredient_id,
      grams: item.grams
    }))

    const { error: itemsError } = await supabase
      .from('recipe_items')
      .insert(itemsWithRecipeId)

    if (itemsError) {
      console.error('Erreur sauvegarde items:', itemsError)
      throw itemsError
    }
  }
}

// Marquer/démarquer une recette comme favorite
export async function setRecipeFavorite(id, isFavorite) {
  const { error } = await supabase
    .from('recipes')
    .update({ is_favorite: isFavorite })
    .eq('id', id)
  if (error) {
    console.error('Erreur mise à jour favori recette:', error)
    throw error
  }
}

// Supprimer une recette
export async function deleteRecipe(id) {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id)
  if (error) {
    console.error('Erreur suppression recette:', error)
    throw error
  }
}

// Charger le profil d'une personne (person1 ou person2)
export async function loadProfile(personId) {
  const { data, error } = await supabase
    .from('profile')
    .select('*')
    .eq('id', personId)
    .single()

  if (error && error.code === 'PGRST116') {
    // Pas trouvé, créer le profil par défaut
    const defaultProfile = {
      id: personId,
      weight: 70,
      height: 175,
      age: 30,
      sex: 'f',
      activity: 1.375,
      goal: 'maintain',
      use_custom: false,
      custom_mode: 'grams',
      custom_kcal: 2000,
      custom_protein: 130,
      custom_carbs: 220,
      custom_fat: 65,
      custom_pct_protein: 30,
      custom_pct_carbs: 40,
      custom_pct_fat: 30,
      display_name: personId === 'person1' ? 'Personne 1' : 'Personne 2'
    }
    await supabase.from('profile').insert([defaultProfile])
    return defaultProfile
  }

  if (error) {
    console.error('Erreur chargement profil:', error)
    throw error
  }

  return data
}

// Sauvegarder le profil
export async function saveProfile(profile) {
  const { error } = await supabase
    .from('profile')
    .upsert([profile], { onConflict: 'id' })

  if (error) {
    console.error('Erreur sauvegarde profil:', error)
    throw error
  }
}

// Charger les logs pour une date et une personne
export async function loadLogs(dateStr, personId) {
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('log_date', dateStr)
    .eq('person_id', personId)

  if (error) {
    console.error('Erreur chargement logs:', error)
    return []
  }

  return data || []
}

// Ajouter un log
export async function addLog(log) {
  const { error } = await supabase
    .from('logs')
    .insert([log])

  if (error) {
    console.error('Erreur ajout log:', error)
    throw error
  }
}

// Supprimer un log
export async function deleteLog(id) {
  const { error } = await supabase
    .from('logs')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erreur suppression log:', error)
    throw error
  }
}

// Charger les catégories d'ingrédients
export async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) {
    console.error('Erreur chargement catégories:', error)
    return []
  }
  return (data || []).map(c => c.name)
}

// Ajouter une catégorie
export async function addCategory(name) {
  const { error } = await supabase
    .from('categories')
    .insert([{ name }])

  if (error) {
    console.error('Erreur ajout catégorie:', error)
    throw error
  }
}

// Renommer une catégorie
export async function renameCategory(oldName, newName) {
  const { error } = await supabase
    .from('categories')
    .update({ name: newName })
    .eq('name', oldName)

  if (error) {
    console.error('Erreur renommage catégorie:', error)
    throw error
  }

  // Répercuter le renommage sur les ingrédients qui référencent l'ancien nom
  const { error: ingError } = await supabase
    .from('ingredients')
    .update({ category: newName })
    .eq('category', oldName)

  if (ingError) {
    console.error('Erreur mise à jour catégorie des ingrédients:', ingError)
    throw ingError
  }
}

// Supprimer une catégorie
export async function deleteCategory(name) {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('name', name)

  if (error) {
    console.error('Erreur suppression catégorie:', error)
    throw error
  }
}

// Charger les familles (regroupements de catégories)
export async function loadFamilies() {
  const { data, error } = await supabase
    .from('families')
    .select('*')
    .order('name')

  if (error) {
    console.error('Erreur chargement familles:', error)
    return []
  }
  return data || []
}

// Charger le lien catégorie -> famille, sous la forme { nomCatégorie: idFamille }
export async function loadCategoryFamilies() {
  const { data, error } = await supabase
    .from('categories')
    .select('name, family_id')

  if (error) {
    console.error('Erreur chargement familles des catégories:', error)
    return {}
  }
  const map = {}
  ;(data || []).forEach(c => {
    if (c.family_id) map[c.name] = c.family_id
  })
  return map
}

// Ajouter une famille (renvoie la famille créée, avec son id)
export async function addFamily(name) {
  const { data, error } = await supabase
    .from('families')
    .insert([{ name }])
    .select()
    .single()

  if (error) {
    console.error('Erreur ajout famille:', error)
    throw error
  }
  return data
}

// Renommer une famille
export async function renameFamily(id, newName) {
  const { error } = await supabase
    .from('families')
    .update({ name: newName })
    .eq('id', id)

  if (error) {
    console.error('Erreur renommage famille:', error)
    throw error
  }
}

// Supprimer une famille (ses catégories restent, sans famille)
export async function deleteFamily(id) {
  const { error } = await supabase
    .from('families')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erreur suppression famille:', error)
    throw error
  }
}

// Rattacher une catégorie à une famille (familyId = null pour la détacher)
export async function setCategoryFamily(categoryName, familyId) {
  const { error } = await supabase
    .from('categories')
    .update({ family_id: familyId })
    .eq('name', categoryName)

  if (error) {
    console.error('Erreur mise à jour famille de la catégorie:', error)
    throw error
  }
}

// Charger les types de recette
export async function loadRecipeTypes() {
  const { data, error } = await supabase
    .from('recipe_types')
    .select('*')
    .order('name')

  if (error) {
    console.error('Erreur chargement types de recette:', error)
    return []
  }
  return (data || []).map(t => t.name)
}

// Ajouter un type de recette
export async function addRecipeType(name) {
  const { error } = await supabase
    .from('recipe_types')
    .insert([{ name }])

  if (error) {
    console.error('Erreur ajout type de recette:', error)
    throw error
  }
}

// Renommer un type de recette
export async function renameRecipeType(oldName, newName) {
  const { error } = await supabase
    .from('recipe_types')
    .update({ name: newName })
    .eq('name', oldName)

  if (error) {
    console.error('Erreur renommage type de recette:', error)
    throw error
  }

  // Répercuter le renommage sur les recettes qui référencent l'ancien nom
  const { error: recipeError } = await supabase
    .from('recipes')
    .update({ type: newName })
    .eq('type', oldName)

  if (recipeError) {
    console.error('Erreur mise à jour type des recettes:', recipeError)
    throw recipeError
  }
}

// Supprimer un type de recette
export async function deleteRecipeType(name) {
  const { error } = await supabase
    .from('recipe_types')
    .delete()
    .eq('name', name)

  if (error) {
    console.error('Erreur suppression type de recette:', error)
    throw error
  }
}
