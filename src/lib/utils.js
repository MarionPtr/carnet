// Calculs métier pour Carnet

export function round(n, d = 0) {
  const f = Math.pow(10, d)
  return Math.round((n || 0) * f) / f
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

export function todayStr() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

// Parse une date "YYYY-MM-DD" en objet Date local (évite les décalages UTC)
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Calcule l'âge en années révolues à partir d'une date de naissance "YYYY-MM-DD"
export function calculateAge(birthdate) {
  if (!birthdate) return null
  const birth = parseLocalDate(birthdate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!hasHadBirthdayThisYear) age--
  return age
}

// Ajoute (ou retire) des jours à une date "YYYY-MM-DD", retourne une "YYYY-MM-DD"
export function addDays(dateStr, delta) {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Calcul des objectifs de macros (Mifflin-St Jeor)
export function computeTargets(profile) {
  if (profile.use_custom) {
    return {
      kcal: profile.custom_kcal,
      protein: profile.custom_protein,
      carbs: profile.custom_carbs,
      fat: profile.custom_fat
    }
  }

  const age = calculateAge(profile.birthdate) ?? profile.age
  const bmr =
    profile.sex === 'm'
      ? 10 * profile.weight + 6.25 * profile.height - 5 * age + 5
      : 10 * profile.weight + 6.25 * profile.height - 5 * age - 161

  const tdee = bmr * profile.activity
  const kcal =
    profile.goal === 'cut' ? tdee - 450 : profile.goal === 'bulk' ? tdee + 300 : tdee

  const protein = profile.weight * 1.8
  const fat = profile.weight * 0.85
  const proteinKcal = protein * 4
  const fatKcal = fat * 9
  const carbsKcal = Math.max(0, kcal - proteinKcal - fatKcal)
  const carbs = carbsKcal / 4

  return {
    kcal: round(kcal),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat)
  }
}

// Calcul des macros d'une recette par portion
export function recipeMacrosPerServing(recipe, ingredients) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

  ;(recipe.items || []).forEach(item => {
    const ing = ingredients.find(i => i.id === item.ingredient_id)
    if (!ing) return

    const factor = item.grams / 100
    totals.kcal += ing.kcal * factor
    totals.protein += ing.protein * factor
    totals.carbs += ing.carbs * factor
    totals.fat += ing.fat * factor
  })

  const servings = Math.max(1, recipe.servings || 1)
  return {
    kcal: totals.kcal / servings,
    protein: totals.protein / servings,
    carbs: totals.carbs / servings,
    fat: totals.fat / servings
  }
}

// Totaux des macros pour un jour
export function dayTotals(logs) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  logs.forEach(log => {
    totals.kcal += log.kcal
    totals.protein += log.protein
    totals.carbs += log.carbs
    totals.fat += log.fat
  })
  return totals
}

// Formatage de la date en français
export function formatDateFR(d) {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const mois = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre'
  ]
  const jour = jours[d.getDay()]
  const jourCapitalized = jour.charAt(0).toUpperCase() + jour.slice(1)
  return `${jourCapitalized} ${d.getDate()} ${mois[d.getMonth()]}`
}

// Échappement HTML
export function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}
