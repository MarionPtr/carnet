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
      ingredient_id: item.ingredientId,
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

// Charger le profil
export async function loadProfile() {
  const { data, error } = await supabase
    .from('profile')
    .select('*')
    .eq('id', 'default')
    .single()

  if (error && error.code === 'PGRST116') {
    // Pas trouvé, créer le profil par défaut
    const defaultProfile = {
      id: 'default',
      weight: 70,
      height: 175,
      age: 30,
      sex: 'f',
      activity: 1.4,
      goal: 'maintain',
      use_custom: false,
      custom_kcal: 2000,
      custom_protein: 130,
      custom_carbs: 220,
      custom_fat: 65,
      categories: ['condiment', 'dessert', 'epice', 'feculent', 'fromage', 'fruit', 'legume', 'legumineuse', 'Proteine']
    }
    await supabase.from('profile').insert([defaultProfile])
    return defaultProfile
  }

  if (error) {
    console.error('Erreur chargement profil:', error)
    throw error
  }

  // Assurer que categories existe
  if (!data.categories || data.categories.length === 0) {
    data.categories = ['condiment', 'dessert', 'epice', 'feculent', 'fromage', 'fruit', 'legume', 'legumineuse', 'Proteine']
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

// Charger les logs pour une date
export async function loadLogs(dateStr) {
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('log_date', dateStr)

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
