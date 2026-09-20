import './style.css'
import {
  loadIngredients,
  loadRecipes,
  loadProfile,
  loadLogs,
  saveIngredient,
  deleteIngredient,
  saveRecipe,
  setRecipeFavorite,
  deleteRecipe,
  saveProfile,
  addLog,
  deleteLog,
  uid,
  loadCategories,
  addCategory,
  renameCategory,
  deleteCategory,
  loadRecipeTypes,
  addRecipeType,
  renameRecipeType,
  deleteRecipeType
} from './lib/db'
import {
  round,
  clamp,
  todayStr,
  parseLocalDate,
  addDays,
  calculateAge,
  computeTargets,
  recipeMacrosPerServing,
  dayTotals,
  formatDateFR,
  esc
} from './lib/utils'

// Mot de passe d'accès à l'app
const APP_PASSWORD = 'SkodaRouge12/'
const AUTH_STORAGE_KEY = 'carnet_authenticated'
const THEME_STORAGE_KEY = 'carnet_theme'
const PERSON_STORAGE_KEY = 'carnet_person'
const DISPLAY_PREFS_KEY = 'carnet_display_prefs'
const DISPLAY_PREF_FIELDS = [
  'ingViewMode',
  'ingVisibleCategories',
  'ingFavoritesOnly',
  'collapsedCategories',
  'recipeViewMode',
  'recipeVisibleTypes',
  'recipeFavoritesOnly',
  'collapsedRecipeTypes'
]

function loadDisplayPrefs() {
  try {
    return JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY)) || {}
  } catch (e) {
    return {}
  }
}

function saveDisplayPrefs() {
  const prefs = {}
  DISPLAY_PREF_FIELDS.forEach(f => {
    prefs[f] = state[f]
  })
  try {
    localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(prefs))
  } catch (e) {}
}

const savedPrefs = loadDisplayPrefs()

const MEALS = [
  { key: 'petit-dej', label: 'Petit-déjeuner' },
  { key: 'dejeuner', label: 'Déjeuner' },
  { key: 'diner', label: 'Dîner' },
  { key: 'snacks', label: 'Snacks' }
]

function defaultMealForNow() {
  const h = new Date().getHours()
  if (h < 11) return 'petit-dej'
  if (h < 15) return 'dejeuner'
  if (h < 19) return 'snacks'
  return 'diner'
}

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: light)')

function applyTheme(theme) {
  const resolved = theme === 'system' ? (systemThemeQuery.matches ? 'light' : 'dark') : theme
  document.documentElement.setAttribute('data-theme', resolved)
}

// Si le mode "système" est actif, suivre les changements de préférence en direct
systemThemeQuery.addEventListener('change', () => {
  if (state.theme === 'system') applyTheme('system')
})

// État global
const state = {
  authenticated: false,
  currentPerson: null, // 'person1' ou 'person2'
  theme: 'system',
  tab: 'today',
  ready: false,
  ingredients: [],
  recipes: [],
  profile: null,
  logs: [],
  currentDate: todayStr(),
  modal: null,
  toastMsg: null,
  ingSearch: '',
  collapsedCategories: savedPrefs.collapsedCategories || {},
  ingViewMode: savedPrefs.ingViewMode || 'category', // 'category' ou 'alphabetical'
  ingVisibleCategories: savedPrefs.ingVisibleCategories || null, // null = toutes visibles, sinon tableau de catégories cochées
  ingFavoritesOnly: !!savedPrefs.ingFavoritesOnly,
  recipeSearch: '',
  recipeViewMode: savedPrefs.recipeViewMode || 'category', // 'category' ou 'alphabetical'
  recipeVisibleTypes: savedPrefs.recipeVisibleTypes || null, // null = tous visibles, sinon tableau de types cochés
  recipeFavoritesOnly: !!savedPrefs.recipeFavoritesOnly,
  collapsedRecipeTypes: savedPrefs.collapsedRecipeTypes || {},
  logType: 'recipe',
  logMeal: 'petit-dej',
  logIngId: null,
  logPortionIdx: null, // null = grammes personnalisés, sinon index dans getIngredientPortions(ing)
  _ingDetailPortionIdx: null,
  _draftIngredient: null,
  _draftRecipe: null,
  _recipeDetailServings: null, // nombre de parts affiché dans le détail (null = celui de la recette)
  _recipeIngPickerIdx: null,
  _recipeIngPickerSearch: '',
  _recipeIngPickerViewMode: 'alphabetical', // 'alphabetical' ou 'category'
  categories: [],
  recipeTypes: []
}

// Initialisation
async function init() {
  // Thème
  state.theme = localStorage.getItem(THEME_STORAGE_KEY) || 'system'
  applyTheme(state.theme)

  // Vérifier si déjà authentifié (stocké localement)
  state.authenticated = localStorage.getItem(AUTH_STORAGE_KEY) === 'true'

  if (!state.authenticated) {
    state.ready = true
    render()
    return
  }

  // Vérifier si une personne est déjà sélectionnée
  state.currentPerson = localStorage.getItem(PERSON_STORAGE_KEY)

  if (!state.currentPerson) {
    state.ready = true
    render()
    return
  }

  try {
    state.ingredients = await loadIngredients()
    state.recipes = await loadRecipes()
    state.profile = await loadProfile(state.currentPerson)
    state.logs = await loadLogs(state.currentDate, state.currentPerson)
    state.categories = await loadCategories()
    state.recipeTypes = await loadRecipeTypes()
  } catch (e) {
    console.error('Erreur lors du chargement:', e)
  }
  state.ready = true
  render()
}

// Change le jour affiché dans le journal et recharge ses logs
async function changeDate(newDate) {
  state.currentDate = newDate
  state.logs = await loadLogs(state.currentDate, state.currentPerson)
  render()
}

// Rendu principal
function render() {
  const app = document.getElementById('app')

  if (!state.ready) {
    app.innerHTML = '<div class="empty" style="margin-top:50%;">Chargement…</div>'
    return
  }

  // Si pas authentifié, afficher l'écran de mot de passe
  if (!state.authenticated) {
    app.innerHTML = renderAuth()
    bindAuthEvents()
    return
  }

  // Si pas de personne sélectionnée, afficher le choix du profil
  if (!state.currentPerson) {
    app.innerHTML = renderPersonSelect()
    bindPersonSelectEvents()
    return
  }

  let html = ''
  if (state.tab === 'today') html = renderToday()
  else if (state.tab === 'ingredients') html = renderIngredients()
  else if (state.tab === 'recipes') html = renderRecipes()
  else if (state.tab === 'profile') html = renderProfile()

  if (state.tab !== 'profile') html += renderTabs()
  if (state.modal) html += renderModal()
  if (state.toastMsg) html += `<div class="toast">${esc(state.toastMsg)}</div>`

  app.innerHTML = html
  bindEvents()
}

// ========== AUTH ==========
function renderAuth() {
  let h = '<div style="max-width:480px;margin:0 auto;padding:20px;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">'
  h += '<div style="width:100%;max-width:400px;">'
  h += '<h1 style="text-align:center;font-size:var(--text-h1);font-weight:700;margin-bottom:30px;">Carnet</h1>'
  h += '<label class="field"><span class="lbl">Mot de passe</span><input id="auth-password" type="password" placeholder="••••••••"/></label>'
  h += '<button class="btn primary block" data-action="auth-submit">Accéder</button>'
  h += '</div></div>'
  if (state.toastMsg) h += `<div class="toast">${esc(state.toastMsg)}</div>`
  return h
}

function bindAuthEvents() {
  const app = document.getElementById('app')
  const passwordInput = document.getElementById('auth-password')

  const trySubmit = () => {
    const password = passwordInput.value
    if (!password) {
      showToast('Entre le mot de passe')
      return
    }
    if (password === APP_PASSWORD) {
      localStorage.setItem(AUTH_STORAGE_KEY, 'true')
      state.authenticated = true
      state.ready = false
      render()
      init()
    } else {
      showToast('Mot de passe incorrect')
    }
  }

  app.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.getAttribute('data-action') === 'auth-submit') trySubmit()
    })
  })

  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') trySubmit()
    })
    passwordInput.focus()
  }
}

// ========== PERSON SELECT ==========
function renderPersonSelect() {
  const names = state.personNames || { person1: 'Personne 1', person2: 'Personne 2' }
  let h = '<div style="max-width:480px;margin:0 auto;padding:20px;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">'
  h += '<div class="profile-picker">'
  ;['person1', 'person2'].forEach(id => {
    h += '<button class="profile-picker-item" data-action="select-person" data-person="' + id + '">'
    h += '<span class="profile-picker-avatar">👤</span>'
    h += '<span class="profile-picker-name">' + esc(names[id]) + '</span>'
    h += '</button>'
  })
  h += '</div></div>'
  if (state.toastMsg) h += `<div class="toast">${esc(state.toastMsg)}</div>`
  return h
}

function bindPersonSelectEvents() {
  const app = document.getElementById('app')

  // Charger les noms personnalisés si pas déjà fait
  if (!state.personNames) {
    Promise.all([loadProfile('person1'), loadProfile('person2')]).then(([p1, p2]) => {
      state.personNames = {
        person1: p1.display_name || 'Personne 1',
        person2: p2.display_name || 'Personne 2'
      }
      render()
    })
  }

  app.querySelectorAll('[data-action="select-person"]').forEach(el => {
    el.addEventListener('click', () => {
      const person = el.getAttribute('data-person')
      localStorage.setItem(PERSON_STORAGE_KEY, person)
      state.currentPerson = person
      state.ready = false
      render()
      init()
    })
  })
}

// ========== TODAY ==========
function renderToday() {
  const targets = computeTargets(state.profile)
  const totals = dayTotals(state.logs)
  const pct = clamp(totals.kcal / Math.max(1, targets.kcal), 0, 1)

  const isToday = state.currentDate === todayStr()
  let h = '<header class="top">'
  h += '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">'
  h += '<button data-action="open-profile" title="Profil" style="width:40px;height:40px;flex-shrink:0;padding:0;border-radius:50%;background:var(--surface-raised);color:var(--text);border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;cursor:pointer;"><span class="header-icon">' + tabIcon('profile') + '</span></button>'
  h += '</div>'
  h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'
  h += '<button class="icon-btn" data-action="prev-day" style="font-size:var(--text-h2);padding:4px 10px;flex-shrink:0;">‹</button>'
  h += '<h1 data-action="open-date-picker" style="cursor:pointer;text-align:center;flex:1;">' + (isToday ? 'Aujourd\'hui' : formatDateFR(parseLocalDate(state.currentDate))) + '</h1>'
  h += '<button class="icon-btn" data-action="next-day" style="font-size:var(--text-h2);padding:4px 10px;flex-shrink:0;">›</button>'
  h += '</div>'
  h += '</header>'
  h += '<section>'
  h += '<div class="card">'
  h += '<div class="kcal-hero"><span class="num">' + round(totals.kcal) + ' <span style="font-size:var(--text-small);color:var(--text-muted);font-weight:400;">kcal</span></span><span class="target">objectif ' + targets.kcal + '</span></div>'
  h += '<div class="macro-row"><span class="label">&nbsp;</span><div class="bar-track"><div class="bar-fill" style="width:' + (pct * 100) + '%;background:var(--kcal)"></div></div><span class="amt"></span></div>'
  h += '<div class="macro-grid">'
  h += macroTile('Protéines', totals.protein, targets.protein, 'var(--protein)')
  h += macroTile('Glucides', totals.carbs, targets.carbs, 'var(--carbs)')
  h += macroTile('Lipides', totals.fat, targets.fat, 'var(--fat)')
  h += '</div>'
  h += '</div>'
  h += '<h2 style="margin:20px 0 12px;">' + (isToday ? 'Repas' : 'Repas du ' + formatDateFR(parseLocalDate(state.currentDate))) + '</h2>'

  MEALS.forEach(meal => {
    const entries = state.logs.filter(log => (log.meal || 'snacks') === meal.key)
    const mealTotals = dayTotals(entries)
    h += '<div class="card">'
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    h += '<div><h3 style="margin:0;">' + meal.label + '</h3>'
    if (entries.length > 0) {
      h += '<div style="font-size:var(--text-caption);color:var(--text-muted);margin-top:2px;">' + round(mealTotals.kcal) + ' kcal · ' + round(mealTotals.protein) + 'g P · ' + round(mealTotals.carbs) + 'g G · ' + round(mealTotals.fat) + 'g L</div>'
    }
    h += '</div>'
    h += '<button data-action="open-add-log" data-meal="' + meal.key + '" style="width:32px;height:32px;flex-shrink:0;padding:0;line-height:1;border-radius:50%;background:var(--surface-raised);border:1px solid var(--border-strong);color:var(--text);font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;">+</button>'
    h += '</div>'
    if (entries.length > 0) {
      entries
        .slice()
        .reverse()
        .forEach(log => {
          h += '<div class="list-item" style="padding-left:20px;">'
          h += '<div><div class="name" style="font-size:var(--text-small);">' + esc(log.name) + '</div><div class="sub" style="font-size:var(--text-caption);">' + round(log.kcal) + ' kcal · ' + round(log.protein) + 'g P · ' + round(log.carbs) + 'g G · ' + round(log.fat) + 'g L</div></div>'
          h += '<div class="actions"><button class="icon-btn" data-action="del-log" data-id="' + log.id + '">✕</button></div>'
          h += '</div>'
        })
    }
    h += '</div>'
  })

  h += '</section>'
  return h
}

function macroTile(label, val, target, color) {
  const pct = clamp(val / Math.max(1, target), 0, 1)
  return `<div class="macro-tile"><div class="mt-title">${label}</div><div class="mt-value">${round(val)}/${round(target)}g</div><div class="bar-track"><div class="bar-fill" style="width:${pct * 100}%;background:${color}"></div></div></div>`
}

function datePickerForm() {
  const { year, month } = state._calendarMonth
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

  const firstOfMonth = new Date(year, month, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7 // 0 = lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = todayStr()

  let h = '<h2 style="text-align:center;">Choisir une date</h2>'
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
  h += '<button class="icon-btn" data-action="calendar-prev-month" style="font-size:var(--text-h2);">‹</button>'
  h += '<div style="font-weight:600;">' + monthNames[month] + ' ' + year + '</div>'
  h += '<button class="icon-btn" data-action="calendar-next-month" style="font-size:var(--text-h2);">›</button>'
  h += '</div>'

  h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px;">'
  dayLabels.forEach(d => {
    h += '<div style="text-align:center;font-size:var(--text-caption);color:var(--text-muted);font-weight:600;">' + d + '</div>'
  })
  h += '</div>'

  h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px;">'
  for (let i = 0; i < startOffset; i++) {
    h += '<div></div>'
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0')
    const isSelected = dateStr === state.currentDate
    const isToday = dateStr === today
    let style = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;font-size:var(--text-body);'
    if (isSelected) style += 'background:var(--protein);color:#221705;font-weight:700;'
    else if (isToday) style += 'border:1px solid var(--protein);color:var(--protein);font-weight:600;'
    h += '<div data-action="calendar-select-day" data-date="' + dateStr + '" style="' + style + '">' + day + '</div>'
  }
  h += '</div>'

  return h
}

// ========== INGREDIENTS ==========
function renderIngredients() {
  const q = state.ingSearch.toLowerCase()
  const filtered = state.ingredients.filter(i => i.name.toLowerCase().indexOf(q) > -1 && (!state.ingFavoritesOnly || i.is_favorite))

  // Group by category
  const grouped = {}
  filtered.forEach(i => {
    const cat = i.category || 'Sans catégorie'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(i)
  })

  // Sort each group by name
  Object.keys(grouped).forEach(cat => {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name))
  })

  const categories = Object.keys(grouped).sort()

  let h = '<header class="top" style="display:flex;align-items:center;justify-content:space-between;">'
  h += '<h1>Ingrédients</h1>'
  h += '<button data-action="open-add-ing" style="width:40px;height:40px;flex-shrink:0;padding:0;line-height:1;border-radius:50%;background:var(--surface-raised);color:var(--text);border:1px solid var(--border-strong);font-size:22px;font-weight:500;display:flex;align-items:center;justify-content:center;cursor:pointer;">+</button>'
  h += '</header>'
  h += '<section>'
  const isFilterActive = state.ingViewMode === 'alphabetical' || (state.ingVisibleCategories !== null) || state.ingFavoritesOnly
  h += '<div style="display:flex;gap:8px;">'
  h += '<div class="search-wrap" style="position:relative;flex:1;margin-bottom:0;">'
  h += '<input placeholder="Rechercher…" id="ing-search" value="' + esc(state.ingSearch) + '" style="' + (state.ingSearch ? 'padding-right:36px;' : '') + '"/>'
  if (state.ingSearch) {
    h += '<button class="icon-btn" data-action="clear-ing-search" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:var(--text-h3);">✕</button>'
  }
  h += '</div>'
  h += '<button data-action="open-ing-filter" style="position:relative;flex-shrink:0;width:44px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:var(--surface-raised);color:var(--text);border:1px solid var(--border-strong);cursor:pointer;">'
  h += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>'
  if (isFilterActive) {
    h += '<span style="position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:var(--protein);"></span>'
  }
  h += '</button>'
  h += '</div>'

  const useAlphabetical = state.ingViewMode === 'alphabetical'
  const alphaList = filtered.slice().sort((a, b) => a.name.localeCompare(b.name))

  if (filtered.length === 0) {
    h += '<div class="empty">Aucun ingrédient. Ajoute-en un pour commencer.</div>'
  } else if (useAlphabetical) {
    h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px;">'
    alphaList.forEach((i, idx) => {
      h += '<div class="list-item" style="cursor:pointer;padding:10px 12px;border-bottom:' + (idx < alphaList.length - 1 ? '1px solid var(--border)' : 'none') + ';" data-action="view-ing" data-id="' + i.id + '">'
      h += '<div style="width:56px;height:56px;flex-shrink:0;border-radius:10px;overflow:hidden;margin-right:12px;background:var(--surface-raised);border:1px solid var(--border);">'
      if (i.photo) {
        h += '<img src="' + i.photo + '" style="width:100%;height:100%;object-fit:cover;"/>'
      } else {
        h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:var(--text-h2);">🥘</div>'
      }
      h += '</div>'
      h += '<div style="flex:1;"><div class="name" style="font-size:var(--text-h3);font-weight:600;">' + (i.is_favorite ? '⭐ ' : '') + esc(i.name) + '</div></div>'
      h += '<div style="color:var(--text-muted);font-size:28px;line-height:1;flex-shrink:0;padding-left:6px;">›</div>'
      h += '</div>'
    })
    h += '</div>'
  } else {
    const visibleCategories = state.ingVisibleCategories === null
      ? categories
      : categories.filter(cat => state.ingVisibleCategories.includes(cat))
    visibleCategories.forEach(cat => {
      const isCollapsed = !state.ingSearch && state.collapsedCategories[cat] !== false
      h += '<div data-action="toggle-category" data-cat="' + esc(cat) + '" style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 8px;cursor:pointer;">'
      h += '<h4 style="font-size:var(--text-h3);font-weight:700;margin:0;">' + esc(cat) + '</h4>'
      h += '<span style="color:var(--text-muted);display:inline-flex;padding:4px;transform:rotate(' + (isCollapsed ? '-90deg' : '0deg') + ');transition:transform .15s ease;">'
      h += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
      h += '</span>'
      h += '</div>'
      if (!isCollapsed) {
        h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px;">'
        grouped[cat].forEach((i, idx) => {
          h += '<div class="list-item" style="cursor:pointer;padding:10px 12px;border-bottom:' + (idx < grouped[cat].length - 1 ? '1px solid var(--border)' : 'none') + ';" data-action="view-ing" data-id="' + i.id + '">'
          // Thumbnail
          h += '<div style="width:56px;height:56px;flex-shrink:0;border-radius:10px;overflow:hidden;margin-right:12px;background:var(--surface-raised);border:1px solid var(--border);">'
          if (i.photo) {
            h += '<img src="' + i.photo + '" style="width:100%;height:100%;object-fit:cover;"/>'
          } else {
            h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:var(--text-h2);">🥘</div>'
          }
          h += '</div>'
          // Info
          h += '<div style="flex:1;"><div class="name" style="font-size:var(--text-h3);font-weight:600;">' + (i.is_favorite ? '⭐ ' : '') + esc(i.name) + '</div></div>'
          h += '<div style="color:var(--text-muted);font-size:28px;line-height:1;flex-shrink:0;padding-left:6px;">›</div>'
          h += '</div>'
        })
        h += '</div>'
      }
    })
  }

  h += '</section>'
  return h
}

function ingGroupKeys() {
  const keys = state.categories.slice()
  state.ingredients.forEach(i => {
    const key = i.category || 'Sans catégorie'
    if (!keys.includes(key)) keys.push(key)
  })
  return keys
}

function ingFilterForm() {
  const mode = state.ingViewMode
  let h = '<h2>Affichage</h2>'
  h += '<div class="segmented" style="margin-bottom:20px;">'
  h += '<button type="button" class="' + (mode === 'category' ? 'active' : '') + '" data-action="set-ing-view-mode" data-mode="category">Par catégorie</button>'
  h += '<button type="button" class="' + (mode === 'alphabetical' ? 'active' : '') + '" data-action="set-ing-view-mode" data-mode="alphabetical">Liste alphabétique</button>'
  h += '</div>'

  if (mode === 'category') {
    const keys = ingGroupKeys()
    const allExpanded = keys.length > 0 && keys.every(c => state.collapsedCategories[c] === false)
    h += '<span class="lbl" style="display:block;margin-bottom:10px;">Sections</span>'
    h += '<div class="segmented" style="margin-bottom:20px;">'
    h += '<button type="button" class="' + (!allExpanded ? 'active' : '') + '" data-action="set-ing-collapse-all" data-collapsed="true">Repliées</button>'
    h += '<button type="button" class="' + (allExpanded ? 'active' : '') + '" data-action="set-ing-collapse-all" data-collapsed="false">Dépliées</button>'
    h += '</div>'
  }

  h += '<label class="list-item" style="cursor:pointer;margin-bottom:20px;">'
  h += '<span>⭐ Favoris uniquement</span>'
  h += '<input type="checkbox" data-action="toggle-fav-filter" style="width:auto;" ' + (state.ingFavoritesOnly ? 'checked' : '') + '/>'
  h += '</label>'

  if (mode === 'category') {
    h += '<span class="lbl" style="display:block;margin-bottom:10px;">Catégories visibles</span>'
    state.categories.forEach(cat => {
      const checked = state.ingVisibleCategories === null || state.ingVisibleCategories.includes(cat)
      h += '<label class="list-item" style="cursor:pointer;">'
      h += '<span>' + esc(cat) + '</span>'
      h += '<input type="checkbox" data-action="toggle-ing-visible-category" data-cat="' + esc(cat) + '" style="width:auto;" ' + (checked ? 'checked' : '') + '/>'
      h += '</label>'
    })
  }

  return h
}

// ========== RECIPES ==========
function recipeTypeOptions() {
  const options = state.recipeTypes.slice()
  if (state.recipes.some(r => !r.type)) options.push('Sans type')
  return options
}

function recipeGroupKeys() {
  const keys = recipeTypeOptions()
  state.recipes.forEach(r => {
    const key = r.type || 'Sans type'
    if (!keys.includes(key)) keys.push(key)
  })
  return keys
}

function recipeRowHtml(r, isLast) {
  const m = recipeMacrosPerServing(r, state.ingredients)
  let h = '<div class="list-item" style="cursor:pointer;padding:12px;align-items:center;border-bottom:' + (isLast ? 'none' : '1px solid var(--border)') + ';" data-action="view-recipe" data-id="' + r.id + '">'
  h += '<div style="width:88px;height:88px;flex-shrink:0;border-radius:12px;overflow:hidden;margin-right:14px;background:var(--surface-raised);border:1px solid var(--border);">'
  h += r.photo
    ? '<img src="' + esc(r.photo) + '" style="width:100%;height:100%;object-fit:cover;"/>'
    : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:34px;">🍽️</div>'
  h += '</div>'
  h += '<div style="flex:1;min-width:0;">'
  h += '<div class="name" style="font-size:var(--text-h3);font-weight:600;">' + (r.is_favorite ? '⭐ ' : '') + esc(r.name) + '</div>'
  h += '<div class="sub">' + r.servings + ' part. · ' + round(m.kcal) + ' kcal/part</div>'
  h += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;"><span class="pill protein">P ' + round(m.protein) + 'g</span><span class="pill carbs">G ' + round(m.carbs) + 'g</span><span class="pill fat">L ' + round(m.fat) + 'g</span></div>'
  h += '</div>'
  h += '<div style="color:var(--text-muted);font-size:28px;line-height:1;flex-shrink:0;padding-left:6px;">›</div>'
  h += '</div>'
  return h
}

function renderRecipes() {
  const q = state.recipeSearch.toLowerCase()
  const filtered = state.recipes.filter(r => r.name.toLowerCase().indexOf(q) > -1 && (!state.recipeFavoritesOnly || r.is_favorite))

  const grouped = {}
  filtered.forEach(r => {
    const type = r.type || 'Sans type'
    if (!grouped[type]) grouped[type] = []
    grouped[type].push(r)
  })
  Object.keys(grouped).forEach(type => {
    grouped[type].sort((a, b) => a.name.localeCompare(b.name))
  })
  const types = Object.keys(grouped).sort()

  let h = '<header class="top" style="display:flex;align-items:center;justify-content:space-between;">'
  h += '<h1>Recettes</h1>'
  h += '<button data-action="open-add-recipe" style="width:40px;height:40px;flex-shrink:0;padding:0;line-height:1;border-radius:50%;background:var(--surface-raised);color:var(--text);border:1px solid var(--border-strong);font-size:22px;font-weight:500;display:flex;align-items:center;justify-content:center;cursor:pointer;">+</button>'
  h += '</header>'
  h += '<section>'

  const isFilterActive = state.recipeViewMode === 'alphabetical' || state.recipeVisibleTypes !== null || state.recipeFavoritesOnly
  h += '<div style="display:flex;gap:8px;">'
  h += '<div class="search-wrap" style="position:relative;flex:1;margin-bottom:0;">'
  h += '<input placeholder="Rechercher…" id="recipe-search" value="' + esc(state.recipeSearch) + '" style="' + (state.recipeSearch ? 'padding-right:36px;' : '') + '"/>'
  if (state.recipeSearch) {
    h += '<button class="icon-btn" data-action="clear-recipe-search" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:var(--text-h3);">✕</button>'
  }
  h += '</div>'
  h += '<button data-action="open-recipe-filter" style="position:relative;flex-shrink:0;width:44px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:var(--surface-raised);color:var(--text);border:1px solid var(--border-strong);cursor:pointer;">'
  h += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>'
  if (isFilterActive) {
    h += '<span style="position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:var(--protein);"></span>'
  }
  h += '</button>'
  h += '</div>'

  const listWrapStyle = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px;'

  if (state.recipes.length === 0) {
    h += '<div class="empty">Aucune recette. Crée-en une à partir de tes ingrédients.</div>'
  } else if (filtered.length === 0) {
    h += '<div class="empty">Aucune recette trouvée.</div>'
  } else if (state.recipeViewMode === 'alphabetical') {
    const alphaList = filtered.slice().sort((a, b) => a.name.localeCompare(b.name))
    h += '<div style="' + listWrapStyle + 'margin-top:16px;">'
    alphaList.forEach((r, idx) => {
      h += recipeRowHtml(r, idx === alphaList.length - 1)
    })
    h += '</div>'
  } else {
    const visibleTypes = state.recipeVisibleTypes === null
      ? types
      : types.filter(t => state.recipeVisibleTypes.includes(t))
    visibleTypes.forEach(type => {
      const isCollapsed = !state.recipeSearch && state.collapsedRecipeTypes[type] !== false
      h += '<div data-action="toggle-recipe-type-collapse" data-type="' + esc(type) + '" style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 8px;cursor:pointer;">'
      h += '<h4 style="font-size:var(--text-h3);font-weight:700;margin:0;">' + esc(type) + '</h4>'
      h += '<span style="color:var(--text-muted);display:inline-flex;padding:4px;transform:rotate(' + (isCollapsed ? '-90deg' : '0deg') + ');transition:transform .15s ease;">'
      h += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
      h += '</span>'
      h += '</div>'
      if (!isCollapsed) {
        h += '<div style="' + listWrapStyle + '">'
        grouped[type].forEach((r, idx) => {
          h += recipeRowHtml(r, idx === grouped[type].length - 1)
        })
        h += '</div>'
      }
    })
  }

  h += '</section>'
  return h
}

function recipeFilterForm() {
  const mode = state.recipeViewMode
  let h = '<h2>Affichage</h2>'
  h += '<div class="segmented" style="margin-bottom:20px;">'
  h += '<button type="button" class="' + (mode === 'category' ? 'active' : '') + '" data-action="set-recipe-view-mode" data-mode="category">Par type</button>'
  h += '<button type="button" class="' + (mode === 'alphabetical' ? 'active' : '') + '" data-action="set-recipe-view-mode" data-mode="alphabetical">Liste alphabétique</button>'
  h += '</div>'

  if (mode === 'category') {
    const keys = recipeGroupKeys()
    const allExpanded = keys.length > 0 && keys.every(t => state.collapsedRecipeTypes[t] === false)
    h += '<span class="lbl" style="display:block;margin-bottom:10px;">Sections</span>'
    h += '<div class="segmented" style="margin-bottom:20px;">'
    h += '<button type="button" class="' + (!allExpanded ? 'active' : '') + '" data-action="set-recipe-collapse-all" data-collapsed="true">Repliées</button>'
    h += '<button type="button" class="' + (allExpanded ? 'active' : '') + '" data-action="set-recipe-collapse-all" data-collapsed="false">Dépliées</button>'
    h += '</div>'
  }

  h += '<label class="list-item" style="cursor:pointer;margin-bottom:20px;">'
  h += '<span>⭐ Favoris uniquement</span>'
  h += '<input type="checkbox" data-action="toggle-recipe-fav-filter" style="width:auto;" ' + (state.recipeFavoritesOnly ? 'checked' : '') + '/>'
  h += '</label>'

  if (mode === 'category') {
    h += '<span class="lbl" style="display:block;margin-bottom:10px;">Types visibles</span>'
    recipeTypeOptions().forEach(type => {
      const checked = state.recipeVisibleTypes === null || state.recipeVisibleTypes.includes(type)
      h += '<label class="list-item" style="cursor:pointer;">'
      h += '<span>' + esc(type) + '</span>'
      h += '<input type="checkbox" data-action="toggle-recipe-visible-type" data-type="' + esc(type) + '" style="width:auto;" ' + (checked ? 'checked' : '') + '/>'
      h += '</label>'
    })
  }

  return h
}

function recipeDetailModal(recipeId) {
  const r = state.recipes.find(x => x.id === recipeId)
  if (!r) return ''
  const m = recipeMacrosPerServing(r, state.ingredients)

  let h = ''

  h += '<div style="width:100%;aspect-ratio:16/10;border-radius:14px;overflow:hidden;margin:0 0 16px;background:var(--surface-raised);border:1px solid var(--border);">'
  if (r.photo) {
    h += '<img src="' + esc(r.photo) + '" style="width:100%;height:100%;object-fit:cover;"/>'
  } else {
    h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:56px;">🍽️</div>'
  }
  h += '</div>'

  if (r.type) {
    h += '<div style="font-size:var(--text-caption);color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">' + esc(r.type) + '</div>'
  }
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'
  h += '<h2 style="margin:0;">' + esc(r.name) + '</h2>'
  h += '<button data-action="toggle-recipe-favorite" data-id="' + r.id + '" style="background:none;border:none;cursor:pointer;font-size:22px;line-height:1;padding:2px;color:' + (r.is_favorite ? 'var(--protein)' : 'var(--text-muted)') + ';">' + (r.is_favorite ? '★' : '☆') + '</button>'
  h += '</div>'

  if (r.reference_url) {
    h += '<a href="' + esc(r.reference_url) + '" target="_blank" rel="noopener" style="display:inline-block;color:var(--protein);font-size:var(--text-small);font-weight:600;margin:6px 0 16px;text-decoration:none;">🔗 Recette de référence</a>'
  } else {
    h += '<div style="margin-bottom:12px;"></div>'
  }

  h += '<div class="card" style="background:var(--surface-raised);padding:14px;margin-bottom:16px;">'
  h += '<div style="font-size:var(--text-caption);color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">Valeurs nutritionnelles par part</div>'
  h += '<div style="border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:10px;">'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;">'
  h += '<div style="font-size:var(--text-small);">Énergie</div>'
  h += '<div style="font-size:var(--text-h2);font-weight:700;">' + round(m.kcal) + ' <span style="font-size:var(--text-small);">kcal</span></div>'
  h += '</div></div>'
  h += '<div style="display:flex;flex-direction:column;gap:10px;">'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:var(--text-small);">Protéines</div><div style="font-weight:600;color:var(--protein);font-size:var(--text-h3);">' + round(m.protein) + ' <span style="font-size:var(--text-caption);color:var(--text-muted);font-weight:400;">g</span></div></div>'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:var(--text-small);">Glucides</div><div style="font-weight:600;color:var(--carbs);font-size:var(--text-h3);">' + round(m.carbs) + ' <span style="font-size:var(--text-caption);color:var(--text-muted);font-weight:400;">g</span></div></div>'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:var(--text-small);">Lipides</div><div style="font-weight:600;color:var(--fat);font-size:var(--text-h3);">' + round(m.fat) + ' <span style="font-size:var(--text-caption);color:var(--text-muted);font-weight:400;">g</span></div></div>'
  h += '</div></div>'

  if ((r.items || []).length > 0) {
    const baseServings = Math.max(1, r.servings || 1)
    const viewServings = state._recipeDetailServings || baseServings
    const factor = viewServings / baseServings
    const stepBtn = 'width:28px;height:28px;padding:0;line-height:1;border-radius:50%;background:var(--surface);color:var(--text);border:1px solid var(--border-strong);font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;'

    h += '<div class="card" style="background:var(--surface-raised);padding:14px;margin-bottom:16px;">'
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
    h += '<div style="font-size:var(--text-caption);color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Ingrédients</div>'
    h += '<div style="display:flex;align-items:center;gap:10px;">'
    h += '<button data-action="recipe-servings-step" data-delta="-1" style="' + stepBtn + '">−</button>'
    h += '<span style="font-size:var(--text-small);font-weight:600;min-width:52px;text-align:center;">' + viewServings + ' part.</span>'
    h += '<button data-action="recipe-servings-step" data-delta="1" style="' + stepBtn + '">+</button>'
    h += '</div></div>'
    r.items.forEach((it, idx) => {
      const ing = state.ingredients.find(i => i.id === it.ingredient_id)
      h += '<div style="display:flex;justify-content:space-between;font-size:var(--text-small);padding:6px 0;' + (idx < r.items.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + '"><div>' + (ing ? esc(ing.name) : 'Ingrédient supprimé') + '</div><div style="font-weight:500;">' + round(it.grams * factor, 1) + ' ' + (ing && ing.unit ? esc(ing.unit) : 'g') + '</div></div>'
    })
    h += '</div>'
  }

  if (r.instructions && r.instructions.trim()) {
    h += '<div class="card" style="background:var(--surface-raised);padding:14px;margin-bottom:16px;">'
    h += '<div style="font-size:var(--text-caption);color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">Instructions</div>'
    h += '<div style="font-size:var(--text-small);line-height:1.5;white-space:pre-wrap;">' + esc(r.instructions) + '</div>'
    h += '</div>'
  }

  h += '<div class="row2">'
  h += '<button class="btn primary" data-action="edit-recipe" data-id="' + r.id + '">Modifier</button>'
  h += '<button class="btn danger-outline" data-action="del-recipe" data-id="' + r.id + '">Supprimer</button>'
  h += '</div>'

  return h
}

// ========== PROFILE ==========
function renderProfile() {
  const p = state.profile
  const targets = computeTargets(p)

  let h = '<header class="top" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'
  h += '<button data-action="close-profile" title="Retour au journal" style="width:40px;height:40px;flex-shrink:0;padding:0;border-radius:50%;background:var(--surface-raised);color:var(--text);border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;cursor:pointer;"><span class="header-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></span></button>'
  h += '<h1 style="font-size:var(--text-small);color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:center;flex:1;">Profil</h1>'
  h += '<div style="width:40px;flex-shrink:0;"></div>'
  h += '</header>'
  h += '<section>'

  // === SECTION PROFIL ===
  const activityLabels = { 1.2: 'Sédentaire', 1.375: 'Légère', 1.55: 'Modérée', 1.725: 'Active', 1.9: 'Très active' }
  const goalLabels = { cut: 'Sèche', maintain: 'Maintien', bulk: 'Prise de masse' }

  h += '<div class="card">'
  h += '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">'
  h += '<div style="width:56px;height:56px;border-radius:50%;background:var(--surface-raised);display:flex;align-items:center;justify-content:center;font-size:var(--text-h1);flex-shrink:0;">👤</div>'
  h += '<div>'
  h += '<div style="font-size:var(--text-h3);font-weight:600;">' + esc(p.display_name || 'Sans nom') + '</div>'
  h += '<div style="font-size:var(--text-small);color:var(--text-muted);margin-top:2px;">' + (calculateAge(p.birthdate) ?? p.age) + ' ans</div>'
  h += '</div>'
  h += '</div>'

  h += '<div style="border-top:1px solid var(--border);margin-bottom:4px;"></div>'

  h += '<div class="list-item" style="font-size:var(--text-body);"><span>Poids actuel</span><span style="font-weight:600;">' + p.weight + ' kg</span></div>'
  h += '<div class="list-item" style="font-size:var(--text-body);"><span>Activité</span><span style="font-weight:600;">' + activityLabels[p.activity] + '</span></div>'
  h += '<div class="list-item" style="font-size:var(--text-body);"><span>Objectif</span><span style="font-weight:600;">' + goalLabels[p.goal] + '</span></div>'

  h += '<button class="btn primary block" data-action="open-edit-profile" style="margin-top:16px;">Modifier</button>'
  h += '</div>'

  // === SECTION OBJECTIFS ===
  h += '<div class="card">'
  h += '<button class="list-item" style="width:100%;background:none;border:none;text-align:left;cursor:pointer;color:var(--text);" data-action="open-objectives">'
  h += '<div><div style="font-size:var(--text-h3);font-weight:600;">Objectifs</div>'
  h += '<div style="font-size:var(--text-body);color:var(--text-muted);margin-top:4px;"><span style="color:var(--text);font-weight:600;">' + targets.kcal + '</span> kcal / jour</div></div>'
  h += '<span style="color:var(--text-muted);font-size:var(--text-body);">›</span>'
  h += '</button>'
  h += '</div>'

  // === PARAMÈTRES ===
  h += '<div class="card" style="padding-top:2px;padding-bottom:2px;">'
  h += '<button class="list-item" style="width:100%;background:none;border:none;text-align:left;cursor:pointer;color:var(--text);font-size:var(--text-body);" data-action="open-settings"><span><span style="margin-right:10px;">⚙️</span>Paramètres</span><span style="color:var(--text-muted);">›</span></button>'
  h += '</div>'

  h += '</section>'
  return h
}

function settingsForm() {
  let h = '<h2>Paramètres</h2>'

  // === CATÉGORIES ===
  h += '<h3 style="margin:0 0 12px;">Catégories d\'ingrédients</h3>'
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">'
  state.categories.forEach((cat, idx) => {
    h += '<div style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:var(--surface-raised);border-radius:8px;font-size:var(--text-small);">'
    h += '<span>' + esc(cat) + '</span>'
    h += '<button class="icon-btn" data-action="edit-category" data-idx="' + idx + '" style="font-size:var(--text-small);padding:0;margin:0;opacity:0.6;">✎</button>'
    h += '<button class="icon-btn" data-action="rm-category" data-idx="' + idx + '" style="font-size:var(--text-small);padding:0;margin:0;">✕</button>'
    h += '</div>'
  })
  h += '</div>'
  h += '<div style="display:flex;gap:6px;margin-bottom:24px;">'
  h += '<input id="new-category-input" placeholder="Nouvelle catégorie" style="flex:1;"/>'
  h += '<button class="btn small" data-action="add-category">+</button>'
  h += '</div>'

  // === TYPES DE RECETTE ===
  h += '<h3 style="margin:0 0 12px;">Types de recette</h3>'
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">'
  state.recipeTypes.forEach((t, idx) => {
    h += '<div style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:var(--surface-raised);border-radius:8px;font-size:var(--text-small);">'
    h += '<span>' + esc(t) + '</span>'
    h += '<button class="icon-btn" data-action="edit-recipe-type" data-idx="' + idx + '" style="font-size:var(--text-small);padding:0;margin:0;opacity:0.6;">✎</button>'
    h += '<button class="icon-btn" data-action="rm-recipe-type" data-idx="' + idx + '" style="font-size:var(--text-small);padding:0;margin:0;">✕</button>'
    h += '</div>'
  })
  h += '</div>'
  h += '<div style="display:flex;gap:6px;margin-bottom:24px;">'
  h += '<input id="new-recipe-type-input" placeholder="Nouveau type" style="flex:1;"/>'
  h += '<button class="btn small" data-action="add-recipe-type">+</button>'
  h += '</div>'

  // === APPARENCE ===
  h += '<h3 style="margin:0 0 12px;">Apparence</h3>'
  h += '<div class="segmented" style="margin-bottom:24px;">'
  h += '<button type="button" class="' + (state.theme === 'system' ? 'active' : '') + '" data-action="set-theme" data-theme="system">📱 Système</button>'
  h += '<button type="button" class="' + (state.theme === 'dark' ? 'active' : '') + '" data-action="set-theme" data-theme="dark">🌙 Sombre</button>'
  h += '<button type="button" class="' + (state.theme === 'light' ? 'active' : '') + '" data-action="set-theme" data-theme="light">☀️ Clair</button>'
  h += '</div>'

  // === COMPTE ===
  h += '<button class="btn block" style="margin-bottom:10px;" data-action="switch-person">Changer de profil</button>'
  h += '<button class="btn danger-outline block" data-action="logout">Se déconnecter</button>'

  return h
}

// ========== TABS ==========
function tabIcon(name) {
  const icons = {
    today: '<rect x="3" y="3" width="14" height="18" rx="2"/><path d="M7 3v18"/><path d="M16 17l5-5a1.5 1.5 0 1 0-2-2l-5 5v2h2z"/>',
    ingredients:
      '<path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>',
    recipes:
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'
  }
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    icons[name] +
    '</svg>'
  )
}

function renderTabs() {
  const tabs = [
    ['today', 'Journal'],
    ['ingredients', 'Ingrédients'],
    ['recipes', 'Recettes']
  ]
  let h = '<nav class="tabs">'
  tabs.forEach(t => {
    h += '<button class="' + (state.tab === t[0] ? 'active' : '') + '" data-tab="' + t[0] + '">' + tabIcon(t[0]) + '<span>' + t[1] + '</span></button>'
  })
  h += '</nav>'
  return h
}

// ========== MODALS ==========
function renderModal() {
  const m = state.modal
  let body = ''

  if (m.type === 'add-ing') body = ingredientForm(m.editId)
  else if (m.type === 'add-recipe') body = recipeForm(m.editId)
  else if (m.type === 'add-log') body = addLogForm()
  else if (m.type === 'ing-detail') body = ingredientDetailModal(m.ingId)
  else if (m.type === 'edit-profile') body = editProfileForm()
  else if (m.type === 'edit-category') body = editCategoryForm(m.categoryIdx)
  else if (m.type === 'date-picker') body = datePickerForm()
  else if (m.type === 'settings') body = settingsForm()
  else if (m.type === 'ing-filter') body = ingFilterForm()
  else if (m.type === 'objectives') body = objectivesModal()
  else if (m.type === 'recipe-detail') body = recipeDetailModal(m.recipeId)
  else if (m.type === 'recipe-filter') body = recipeFilterForm()
  else if (m.type === 'recipe-ing-picker') body = recipeIngPickerModal()
  else if (m.type === 'edit-recipe-type') body = editRecipeTypeForm(m.typeIdx)

  return (
    '<div class="modal-backdrop" data-action="close-modal-bg">' +
    '<div class="modal" onclick="event.stopPropagation()">' +
    '<div class="modal-close-row"><button class="icon-btn" data-action="close-modal">✕</button></div>' +
    body +
    '</div></div>'
  )
}

function ingredientForm(editId) {
  const ing = editId
    ? state.ingredients.find(i => i.id === editId)
    : { name: '', kcal: '', protein: '', carbs: '', fat: '', saturated_fat: '', fiber: '', sugar: '', salt: '', brands: [], photo: '', portions: [], unit: 'g' }

  if (!state._draftIngredient) {
    state._draftIngredient = { ...ing, portions: getIngredientPortions(ing) }
  }
  const draft = state._draftIngredient

  let h = '<h2>' + (editId ? 'Modifier' : 'Nouvel') + ' ingrédient</h2>'

  // Photo en premier
  h += '<label class="field"><span class="lbl">Photo</span>'
  h += '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;">'
  h += '<div style="width:80px;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--surface-raised);border:1px solid var(--border);flex-shrink:0;" id="photo-preview">'
  if (draft.photo) {
    h += '<img src="' + draft.photo + '" style="width:100%;height:100%;object-fit:cover;"/>'
  } else {
    h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:var(--text-h2);">📷</div>'
  }
  h += '</div>'
  h += '<div style="flex:1;">'
  h += '<input type="text" id="f-photo-url" placeholder="Colle un lien URL d\'image" value="' + esc(draft.photo || '') + '" style="width:100%;"/>'
  h += '</div>'
  h += '</div>'
  h += '</label>'

  h += '<label class="field"><span class="lbl">Nom</span><input id="f-name" value="' + esc(draft.name) + '" placeholder="ex. Blanc de poulet"/></label>'

  h += '<label class="field"><span class="lbl">Catégorie</span><select id="f-category">'
  h += '<option value="">Sélectionner une catégorie</option>'
  state.categories.forEach(cat => {
    h += '<option value="' + cat + '" ' + (draft.category === cat ? 'selected' : '') + '>' + cat + '</option>'
  })
  h += '<option value="__new__">+ Ajouter une catégorie</option>'
  h += '</select></label>'
  h += '<input id="f-new-category" type="text" placeholder="Nouvelle catégorie" style="display:none;margin-bottom:10px;"/>'

  h += '<label class="field"><span class="lbl">Marques</span>'
  h += '<div style="margin-bottom:8px;">'
  if (draft.brands && draft.brands.length > 0) {
    draft.brands.forEach((brand, idx) => {
      h += '<div style="display:flex;gap:6px;margin-bottom:6px;"><span style="flex:1;padding:8px;background:var(--surface-raised);border-radius:6px;font-size:var(--text-small);">' + esc(brand) + '</span><button class="icon-btn" data-action="rm-brand" data-idx="' + idx + '">✕</button></div>'
    })
  }
  h += '</div>'
  h += '<div style="display:flex;gap:6px;"><input id="f-brand-input" placeholder="Ajouter une marque" style="flex:1;"/><button class="btn small" data-action="add-brand">+</button></div>'
  h += '</label>'

  h += '<label class="field"><span class="lbl">Portions</span>'
  h += '<div style="margin-bottom:8px;">'
  if (draft.portions && draft.portions.length > 0) {
    draft.portions.forEach((p, idx) => {
      h += '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">'
      h += '<span style="flex:1;padding:8px;background:var(--surface-raised);border-radius:6px;font-size:var(--text-small);">' + esc(p.name) + ' (' + p.grams + 'g)</span>'
      h += '<button class="icon-btn" data-action="rm-portion" data-idx="' + idx + '">✕</button>'
      h += '</div>'
    })
  }
  h += '</div>'
  h += '<div class="row2" style="margin-bottom:8px;">'
  h += '<input id="f-portion-name" placeholder="ex. 1 yaourt, 1 tranche"/>'
  h += '<input type="number" id="f-portion-grams" placeholder="Poids (g)"/>'
  h += '</div>'
  h += '<button class="btn small block" data-action="add-portion">+ Ajouter une portion</button>'
  h += '</label>'

  // Séparateur avant la partie valeurs nutritionnelles
  h += '<div style="border-top:1px solid var(--border);margin:16px 0;"></div>'
  const unit = draft.unit || 'g'
  h += '<label class="field"><span class="lbl">Valeurs nutritionnelles pour 100</span>'
  h += '<div class="segmented">'
  h += '<button type="button" class="' + (unit === 'g' ? 'active' : '') + '" data-action="set-ing-unit" data-unit="g">g</button>'
  h += '<button type="button" class="' + (unit === 'ml' ? 'active' : '') + '" data-action="set-ing-unit" data-unit="ml">ml</button>'
  h += '</div>'
  h += '</label>'

  h += '<label class="field"><span class="lbl">Calories (kcal)</span><input type="number" id="f-kcal" value="' + (draft.kcal || '') + '"/></label>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Lipides (g)</span><input type="number" id="f-fat" value="' + (draft.fat || '') + '"/></label>'
  h += '<label class="field"><span class="lbl">dont acides gras saturés (g)</span><input type="number" id="f-saturated-fat" value="' + (draft.saturated_fat || '') + '"/></label>'
  h += '</div>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Glucides (g)</span><input type="number" id="f-carbs" value="' + (draft.carbs || '') + '"/></label>'
  h += '<label class="field"><span class="lbl">dont sucres (g)</span><input type="number" id="f-sugar" value="' + (draft.sugar || '') + '"/></label>'
  h += '</div>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Protéines (g)</span><input type="number" id="f-protein" value="' + (draft.protein || '') + '"/></label>'
  h += '<label class="field"><span class="lbl">Fibres (g)</span><input type="number" id="f-fiber" value="' + (draft.fiber || '') + '"/></label>'
  h += '</div>'
  h += '<label class="field"><span class="lbl">Sel (g)</span><input type="number" id="f-salt" value="' + (draft.salt || '') + '"/></label>'

  h += '<button class="btn primary block" id="save-ing-btn" data-action="save-ing" data-id="' + (editId || '') + '">Enregistrer</button>'
  return h
}

function recipeForm(editId) {
  if (!state._draftRecipe || state._draftRecipe.__for !== editId) {
    const r = editId
      ? state.recipes.find(x => x.id === editId)
      : { name: '', servings: 4, type: '', reference_url: '', photo: '', instructions: '', items: [] }
    state._draftRecipe = {
      __for: editId,
      name: r.name,
      servings: r.servings,
      type: r.type || '',
      reference_url: r.reference_url || '',
      photo: r.photo || '',
      instructions: r.instructions || '',
      items: (r.items || []).map(i => ({ ingredient_id: i.ingredient_id, grams: i.grams }))
    }
  }

  const draft = state._draftRecipe

  let h = '<h2>' + (editId ? 'Modifier' : 'Nouvelle') + ' recette</h2>'
  h += '<label class="field"><span class="lbl">Nom</span><input id="rf-name" value="' + esc(draft.name) + '"/></label>'

  h += '<label class="field"><span class="lbl">Type</span><select id="rf-type">'
  h += '<option value="">Sélectionner un type</option>'
  state.recipeTypes.forEach(t => {
    h += '<option value="' + t + '" ' + (draft.type === t ? 'selected' : '') + '>' + t + '</option>'
  })
  h += '<option value="__new__" ' + (draft.type === '__new__' ? 'selected' : '') + '>+ Ajouter un type</option>'
  h += '</select></label>'
  h += '<input id="rf-new-type" type="text" placeholder="Nouveau type" value="' + esc(draft.newType || '') + '" style="display:' + (draft.type === '__new__' ? 'block' : 'none') + ';margin-bottom:10px;"/>'

  h += '<label class="field"><span class="lbl">Lien de la recette de référence</span><input id="rf-reference-url" value="' + esc(draft.reference_url) + '" placeholder="https://…"/></label>'
  h += '<label class="field"><span class="lbl">Lien de la photo</span><input id="rf-photo-url" value="' + esc(draft.photo) + '" placeholder="https://…"/></label>'

  const stepBtn = 'width:36px;height:36px;padding:0;line-height:1;border-radius:50%;background:var(--surface-raised);color:var(--text);border:1px solid var(--border-strong);font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;'
  h += '<span class="lbl" style="display:block;margin-bottom:6px;">Nombre de portions</span>'
  h += '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">'
  h += '<button type="button" data-action="rf-servings-step" data-delta="-1" style="' + stepBtn + '">−</button>'
  h += '<span style="font-size:var(--text-h3);font-weight:600;min-width:28px;text-align:center;">' + Math.max(1, parseInt(draft.servings) || 1) + '</span>'
  h += '<button type="button" data-action="rf-servings-step" data-delta="1" style="' + stepBtn + '">+</button>'
  h += '</div>'

  h += '<span class="lbl" style="display:block;margin-bottom:6px;">Ingrédients</span>'

  if (state.ingredients.length === 0) {
    h += '<div class="empty">Ajoute d\'abord des ingrédients.</div>'
  } else {
    draft.items.forEach((it, idx) => {
      const ing = state.ingredients.find(i => i.id === it.ingredient_id)
      const portions = ing ? getIngredientPortions(ing) : []
      h += '<div class="ing-line">'
      h += '<button type="button" class="btn small" style="flex:2;text-align:left;" data-action="open-recipe-ing-picker" data-idx="' + idx + '">' + (ing ? esc(ing.name) : 'Choisir un ingrédient') + '</button>'
      h += '<input type="number" placeholder="g" data-ridx="' + idx + '" data-field="grams" value="' + it.grams + '"/>'
      h += '<button class="icon-btn" data-action="rm-recipe-item" data-idx="' + idx + '">✕</button>'
      h += '</div>'
      if (portions.length > 0) {
        h += '<select data-portion-ridx="' + idx + '" style="margin:-4px 0 8px;font-size:var(--text-small);">'
        h += '<option value="">Grammes personnalisés</option>'
        portions.forEach(p => {
          h += '<option value="' + p.grams + '">' + esc(p.name) + ' (' + p.grams + 'g)</option>'
        })
        h += '</select>'
      }
    })
    h += '<button class="btn small" data-action="add-recipe-item" style="margin-bottom:14px;">+ Ajouter un ingrédient</button>'
  }

  if (draft.items.length > 0) {
    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    draft.items.forEach(it => {
      const ing = state.ingredients.find(i => i.id === it.ingredient_id)
      if (ing) {
        const f = it.grams / 100
        totals.kcal += ing.kcal * f
        totals.protein += ing.protein * f
        totals.carbs += ing.carbs * f
        totals.fat += ing.fat * f
      }
    })
    const s = Math.max(1, parseInt(draft.servings) || 1)
    h += '<div class="card" style="background:var(--surface-raised);margin-bottom:14px;"><div class="sub">Par portion : ' + round(totals.kcal / s) + ' kcal · P ' + round(totals.protein / s) + 'g · G ' + round(totals.carbs / s) + 'g · L ' + round(totals.fat / s) + 'g</div></div>'
  }

  h += '<label class="field"><span class="lbl">Instructions</span><textarea id="rf-instructions" rows="6" placeholder="Étapes de la recette…" style="resize:vertical;">' + esc(draft.instructions) + '</textarea></label>'

  h += '<button class="btn primary block" data-action="save-recipe" data-id="' + (editId || '') + '">Enregistrer la recette</button>'
  return h
}

function addLogForm() {
  let h = '<h2>Ajouter au journal</h2>'
  h += '<label class="field"><span class="lbl">Repas</span><select id="log-meal">'
  MEALS.forEach(meal => {
    h += '<option value="' + meal.key + '" ' + (state.logMeal === meal.key ? 'selected' : '') + '>' + meal.label + '</option>'
  })
  h += '</select></label>'
  h += '<div class="segmented" id="log-type" style="margin-bottom:14px;">'
  h += '<button type="button" class="' + (state.logType !== 'ingredient' ? 'active' : '') + '" data-logtype="recipe">Recette</button>'
  h += '<button type="button" class="' + (state.logType === 'ingredient' ? 'active' : '') + '" data-logtype="ingredient">Ingrédient</button>'
  h += '</div>'

  if ((state.logType || 'recipe') === 'recipe') {
    if (state.recipes.length === 0) {
      h += '<div class="empty">Aucune recette pour l\'instant.</div>'
    } else {
      h += '<label class="field"><span class="lbl">Recette</span><select id="log-recipe">'
      state.recipes.forEach(r => {
        h += '<option value="' + r.id + '">' + esc(r.name) + '</option>'
      })
      h += '</select></label>'
      h += '<label class="field"><span class="lbl">Portions</span><input type="number" id="log-servings" value="1" step="0.5" min="0.25"/></label>'
      h += '<button class="btn primary block" data-action="confirm-log-recipe">Ajouter</button>'
    }
  } else {
    if (state.ingredients.length === 0) {
      h += '<div class="empty">Aucun ingrédient pour l\'instant.</div>'
    } else {
      if (!state.logIngId || !state.ingredients.find(i => i.id === state.logIngId)) {
        state.logIngId = state.ingredients[0].id
      }
      const selectedIng = state.ingredients.find(i => i.id === state.logIngId)
      h += '<label class="field"><span class="lbl">Ingrédient</span><select id="log-ing">'
      state.ingredients.forEach(i => {
        h += '<option value="' + i.id + '" ' + (i.id === state.logIngId ? 'selected' : '') + '>' + esc(i.name) + '</option>'
      })
      h += '</select></label>'

      const logPortions = selectedIng ? getIngredientPortions(selectedIng) : []
      const activeLogPortion = (state.logPortionIdx != null && logPortions[state.logPortionIdx]) ? logPortions[state.logPortionIdx] : null

      if (logPortions.length > 0) {
        h += '<div class="segmented" style="margin-bottom:10px;flex-wrap:wrap;">'
        h += '<button type="button" class="' + (!activeLogPortion ? 'active' : '') + '" data-action="set-log-portion" data-idx="-1">Grammes</button>'
        logPortions.forEach((p, idx) => {
          h += '<button type="button" class="' + (state.logPortionIdx === idx ? 'active' : '') + '" data-action="set-log-portion" data-idx="' + idx + '">' + esc(p.name) + ' (' + p.grams + 'g)</button>'
        })
        h += '</div>'
      }

      if (activeLogPortion) {
        h += '<label class="field"><span class="lbl">Nombre de ' + esc(activeLogPortion.name) + '</span><input type="number" id="log-portions" value="1" step="0.5" min="0.25"/></label>'
      } else {
        h += '<label class="field"><span class="lbl">Quantité (' + (selectedIng.unit || 'g') + ')</span><input type="number" id="log-grams" value="100"/></label>'
      }
      h += '<button class="btn primary block" data-action="confirm-log-ing">Ajouter</button>'
    }
  }

  return h
}

function editProfileForm() {
  const p = state.profile

  let h = '<h2>Modifier profil</h2>'
  h += '<label class="field"><span class="lbl">Prénom</span><input type="text" id="p-display-name" value="' + esc(p.display_name || '') + '" placeholder="ex. Marion"/></label>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Poids (kg)</span><input type="number" id="p-weight" value="' + p.weight + '"/></label>'
  h += '<label class="field"><span class="lbl">Taille (cm)</span><input type="number" id="p-height" value="' + p.height + '"/></label>'
  h += '</div>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Date de naissance</span><input type="date" id="p-birthdate" value="' + (p.birthdate || '') + '"/></label>'
  h += '<label class="field"><span class="lbl">Sexe</span><select id="p-sex"><option value="f" ' + (p.sex === 'f' ? 'selected' : '') + '>Femme</option><option value="m" ' + (p.sex === 'm' ? 'selected' : '') + '>Homme</option></select></label>'
  h += '</div>'
  h += '<label class="field"><span class="lbl">Activité</span><select id="p-activity">'
  ;[
    [1.2, 'Sédentaire'],
    [1.375, 'Légère'],
    [1.55, 'Modérée'],
    [1.725, 'Active'],
    [1.9, 'Très active']
  ].forEach(o => {
    h += '<option value="' + o[0] + '" ' + (p.activity == o[0] ? 'selected' : '') + '>' + o[1] + '</option>'
  })
  h += '</select></label>'
  h += '<button class="btn primary block" data-action="save-profile" style="margin-top:12px;">Enregistrer</button>'

  return h
}

function objectiveSummaryHtml() {
  const p = state.profile
  const t = computeTargets(p)
  const share = (g, kcalPerG) => (t.kcal > 0 ? Math.round((g * kcalPerG * 100) / t.kcal) : 0)
  const activityLabels = { 1.2: 'Sédentaire', 1.375: 'Légère', 1.55: 'Modérée', 1.725: 'Active', 1.9: 'Très active' }

  let h = '<div style="text-align:center;margin-bottom:14px;">'
  h += '<div style="font-size:var(--text-h1);font-weight:700;">' + t.kcal + ' <span style="font-size:var(--text-small);color:var(--text-muted);font-weight:500;">kcal / jour</span></div>'
  h += '</div>'
  h += '<div style="display:flex;justify-content:space-around;align-items:flex-start;gap:8px;">'
  ;[
    ['Protéines', t.protein, 4, 'var(--protein)'],
    ['Glucides', t.carbs, 4, 'var(--carbs)'],
    ['Lipides', t.fat, 9, 'var(--fat)']
  ].forEach(m => {
    h += '<div style="text-align:center;flex:1;"><div style="font-size:var(--text-small);color:var(--text-muted);margin-bottom:4px;">' + m[0] + '</div>'
    h += '<div style="font-size:var(--text-h3);font-weight:700;color:' + m[3] + ';">' + m[1] + 'g</div>'
    h += '<div style="font-size:var(--text-small);color:var(--text-muted);margin-top:2px;">' + share(m[1], m[2]) + ' % des kcal</div></div>'
  })
  h += '</div>'
  h += '<div style="font-size:var(--text-small);color:var(--text-muted);text-align:center;margin-top:14px;">'
  if (p.use_custom) {
    h += '🔧 Définis manuellement'
  } else {
    h += '📊 Calculés automatiquement<br>' + p.weight + ' kg · ' + p.height + ' cm · ' + (calculateAge(p.birthdate) ?? p.age) + ' ans · activité ' + (activityLabels[p.activity] || '—').toLowerCase()
  }
  h += '</div>'
  return h
}

function refreshObjectiveSummary() {
  const el = document.getElementById('obj-summary')
  if (el) el.innerHTML = objectiveSummaryHtml()
}

function objectivesModal() {
  const p = state.profile

  let h = '<h2>Objectifs</h2>'
  h += '<div class="card" id="obj-summary" style="background:var(--surface-raised);margin-bottom:20px;">' + objectiveSummaryHtml() + '</div>'

  h += '<span class="lbl" style="display:block;margin-bottom:6px;">Objectif</span><div class="segmented" id="p-goal" style="margin-bottom:20px;">'
  ;[
    ['cut', 'Sèche'],
    ['maintain', 'Maintien'],
    ['bulk', 'Prise de masse']
  ].forEach(o => {
    h += '<button type="button" class="' + (p.goal === o[0] ? 'active' : '') + '" data-goal="' + o[0] + '">' + o[1] + '</button>'
  })
  h += '</div>'


  h += '<span class="lbl" style="display:block;margin-bottom:8px;">Manière de calculer</span>'
  h += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><input type="radio" id="p-auto" name="macro-mode" value="auto" style="width:auto;" ' + (!p.use_custom ? 'checked' : '') + '/> <span>Calculés automatiquement</span></label>'
  h += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><input type="radio" id="p-custom" name="macro-mode" value="custom" style="width:auto;" ' + (p.use_custom ? 'checked' : '') + '/> <span>Définis manuellement</span></label>'

  h += '<div id="custom-macros" style="display:' + (p.use_custom ? 'block' : 'none') + ';">'
  const customMode = p.custom_mode || 'grams'
  h += '<div class="segmented" style="margin-bottom:14px;">'
  h += '<button type="button" class="' + (customMode !== 'kcal_pct' ? 'active' : '') + '" data-action="set-custom-mode" data-mode="grams">Grammes</button>'
  h += '<button type="button" class="' + (customMode === 'kcal_pct' ? 'active' : '') + '" data-action="set-custom-mode" data-mode="kcal_pct">Kcal + %</button>'
  h += '</div>'

  if (customMode === 'kcal_pct') {
    h += '<label class="field"><span class="lbl">Kcal</span><input type="number" id="c-kcal" value="' + p.custom_kcal + '"/></label>'
    h += '<div class="row2">'
    h += '<label class="field"><span class="lbl">% Protéines</span><input type="number" id="c-pct-protein" value="' + (p.custom_pct_protein ?? 30) + '"/></label>'
    h += '<label class="field"><span class="lbl">% Glucides</span><input type="number" id="c-pct-carbs" value="' + (p.custom_pct_carbs ?? 40) + '"/></label>'
    h += '</div>'
    h += '<label class="field"><span class="lbl">% Lipides</span><input type="number" id="c-pct-fat" value="' + (p.custom_pct_fat ?? 30) + '"/></label>'
    h += '<div class="sub" id="c-grams-computed" style="margin-top:4px;">' + round(p.custom_protein) + 'g P · ' + round(p.custom_carbs) + 'g G · ' + round(p.custom_fat) + 'g L</div>'
  } else {
    h += '<div class="row2">'
    h += '<label class="field"><span class="lbl">Protéines (g)</span><input type="number" id="c-protein" value="' + p.custom_protein + '"/></label>'
    h += '<label class="field"><span class="lbl">Glucides (g)</span><input type="number" id="c-carbs" value="' + p.custom_carbs + '"/></label>'
    h += '</div>'
    h += '<label class="field"><span class="lbl">Lipides (g)</span><input type="number" id="c-fat" value="' + p.custom_fat + '"/></label>'
    h += '<div class="sub" style="margin-top:4px;">Total : <span id="c-kcal-computed">' + round(p.custom_kcal) + '</span> kcal</div>'
  }
  h += '</div>'


  h += '<button class="btn primary block" data-action="close-modal" style="margin-top:12px;">Terminé</button>'

  return h
}

function editCategoryForm(idx) {
  const currentName = state.categories[idx]

  let h = '<h2>Modifier la catégorie</h2>'
  h += '<label class="field"><span class="lbl">Nom</span><input id="edit-cat-input" value="' + esc(currentName) + '"/></label>'
  h += '<div class="row2">'
  h += '<button class="btn primary block" data-action="save-category" data-idx="' + idx + '">Enregistrer</button>'
  h += '<button class="btn block" data-action="close-modal">Annuler</button>'
  h += '</div>'

  return h
}

function editRecipeTypeForm(idx) {
  const currentName = state.recipeTypes[idx]

  let h = '<h2>Modifier le type</h2>'
  h += '<label class="field"><span class="lbl">Nom</span><input id="edit-recipe-type-input" value="' + esc(currentName) + '"/></label>'
  h += '<div class="row2">'
  h += '<button class="btn primary block" data-action="save-recipe-type" data-idx="' + idx + '">Enregistrer</button>'
  h += '<button class="btn block" data-action="close-modal">Annuler</button>'
  h += '</div>'

  return h
}

function recipeIngPickerModal() {
  const q = state._recipeIngPickerSearch.toLowerCase()
  const categoryMode = state._recipeIngPickerViewMode === 'category'
  const filtered = state.ingredients.filter(i => i.name.toLowerCase().indexOf(q) > -1)

  let h = '<h2>Choisir un ingrédient</h2>'
  h += '<div style="display:flex;gap:8px;margin-bottom:14px;">'
  h += '<div class="search-wrap" style="position:relative;flex:1;margin-bottom:0;">'
  h += '<input placeholder="Rechercher…" id="recipe-ing-picker-search" value="' + esc(state._recipeIngPickerSearch) + '"/>'
  h += '</div>'
  h += '<button data-action="toggle-recipe-ing-picker-view" title="Trier par catégorie" style="flex-shrink:0;width:44px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:' + (categoryMode ? 'var(--protein)' : 'var(--surface-raised)') + ';color:' + (categoryMode ? '#221705' : 'var(--text)') + ';border:1px solid var(--border-strong);cursor:pointer;">'
  h += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>'
  h += '</button>'
  h += '</div>'

  const ingRow = (i, isLast) => {
    let row = '<div class="list-item" style="cursor:pointer;padding:10px 12px;border-bottom:' + (isLast ? 'none' : '1px solid var(--border)') + ';" data-action="pick-recipe-ingredient" data-id="' + i.id + '">'
    row += '<div style="flex:1;">' + (i.is_favorite ? '⭐ ' : '') + esc(i.name) + '</div>'
    row += '</div>'
    return row
  }

  if (filtered.length === 0) {
    h += '<div class="empty">Aucun ingrédient trouvé.</div>'
  } else if (categoryMode) {
    const grouped = {}
    filtered.forEach(i => {
      const cat = i.category || 'Sans catégorie'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(i)
    })
    Object.keys(grouped).forEach(cat => grouped[cat].sort((a, b) => a.name.localeCompare(b.name)))
    const categories = Object.keys(grouped).sort()

    h += '<div style="max-height:55vh;overflow-y:auto;">'
    categories.forEach(cat => {
      h += '<h4 style="font-size:var(--text-h3);font-weight:700;margin:14px 0 8px;">' + esc(cat) + '</h4>'
      h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;">'
      grouped[cat].forEach((i, idx) => {
        h += ingRow(i, idx === grouped[cat].length - 1)
      })
      h += '</div>'
    })
    h += '</div>'
  } else {
    const alphaList = filtered.slice().sort((a, b) => a.name.localeCompare(b.name))
    h += '<div style="max-height:50vh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:12px;">'
    alphaList.forEach((i, idx) => {
      h += ingRow(i, idx === alphaList.length - 1)
    })
    h += '</div>'
  }

  return h
}

function getIngredientPortions(ing) {
  if (ing.portions && ing.portions.length > 0) return ing.portions

  // Repli pour les ingrédients pas encore migrés vers le champ unifié "portions"
  const list = []
  if (ing.serving_size_grams) {
    list.push({ name: ing.serving_size || '1 portion', grams: ing.serving_size_grams })
  }
  ;(ing.extra_portions || []).forEach(p => {
    if (p && p.grams) list.push({ name: p.name || '1 portion', grams: p.grams })
  })
  return list
}

function ingredientDetailModal(ingId) {
  const ing = state.ingredients.find(i => i.id === ingId)
  if (!ing) return ''

  let h = ''

  // Photo (carré arrondi très petit, centré)
  h += '<div style="width:80px;aspect-ratio:1;border-radius:10px;overflow:hidden;margin:0 auto 16px;background:var(--surface-raised);border:1px solid var(--border);">'
  if (ing.photo) {
    h += '<img src="' + ing.photo + '" style="width:100%;height:100%;object-fit:cover;"/>'
  } else {
    h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:var(--text-h1);">🥘</div>'
  }
  h += '</div>'

  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'
  h += '<h2 style="margin:0;">' + esc(ing.name) + '</h2>'
  h += '<button data-action="toggle-favorite" data-id="' + ing.id + '" style="background:none;border:none;cursor:pointer;font-size:22px;line-height:1;padding:2px;color:' + (ing.is_favorite ? 'var(--protein)' : 'var(--text-muted)') + ';">' + (ing.is_favorite ? '★' : '☆') + '</button>'
  h += '</div>'

  const portions = getIngredientPortions(ing)

  // Serving size
  if (portions.length > 0) {
    const label = 'Portion' + (portions.length > 1 ? 's' : '') + ' : ' + portions.map(p => esc(p.name) + ' (' + p.grams + 'g)').join(' · ')
    h += '<div style="color:var(--text-muted);font-size:var(--text-small);margin-bottom:12px;font-weight:500;">' + label + '</div>'
  }

  // Category + Brands
  if (ing.category) {
    h += '<div style="display:inline-block;padding:4px 10px;background:var(--protein);color:#221705;border-radius:6px;font-size:var(--text-caption);font-weight:600;margin-bottom:12px;">' + esc(ing.category) + '</div>'
  }
  if (ing.brands && ing.brands.length > 0) {
    h += '<div style="color:var(--text-muted);font-size:var(--text-small);margin-bottom:16px;">' + ing.brands.join(', ') + '</div>'
  }

  // Toggle 100g / portion(s)
  const activePortion = (state._ingDetailPortionIdx != null && portions[state._ingDetailPortionIdx]) ? portions[state._ingDetailPortionIdx] : null
  const factor = activePortion ? activePortion.grams / 100 : 1
  const ingUnit = ing.unit || 'g'

  if (portions.length > 0) {
    h += '<div class="segmented" style="margin-bottom:12px;flex-wrap:wrap;">'
    h += '<button type="button" class="' + (!activePortion ? 'active' : '') + '" data-action="set-ing-detail-portion" data-idx="-1">Pour 100 ' + ingUnit + '</button>'
    portions.forEach((p, idx) => {
      h += '<button type="button" class="' + (state._ingDetailPortionIdx === idx ? 'active' : '') + '" data-action="set-ing-detail-portion" data-idx="' + idx + '">' + esc(p.name) + '</button>'
    })
    h += '</div>'
  }

  // Macros en listing (style étiquette)
  h += '<div class="card" style="background:var(--surface-raised);padding:14px;margin-bottom:16px;">'
  h += '<div style="font-size:var(--text-caption);color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">Valeurs nutritionnelles ' + (activePortion ? 'pour ' + esc(activePortion.name) + ' (' + activePortion.grams + 'g)' : 'pour 100 ' + ingUnit) + '</div>'

  // Ligne principale : kcal
  h += '<div style="border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:10px;">'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;">'
  h += '<div style="font-size:var(--text-small);">Énergie</div>'
  h += '<div style="font-size:var(--text-h2);font-weight:700;">' + round(ing.kcal * factor) + ' <span style="font-size:var(--text-small);">kcal</span></div>'
  h += '</div></div>'

  // Macros principales
  h += '<div style="display:flex;flex-direction:column;gap:10px;">'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:var(--text-small);">Protéines</div><div style="font-weight:600;color:var(--protein);font-size:var(--text-h3);">' + round(ing.protein * factor) + ' <span style="font-size:var(--text-caption);color:var(--text-muted);font-weight:400;">g</span></div></div>'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:var(--text-small);">Glucides</div><div style="font-weight:600;color:var(--carbs);font-size:var(--text-h3);">' + round(ing.carbs * factor) + ' <span style="font-size:var(--text-caption);color:var(--text-muted);font-weight:400;">g</span></div></div>'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:var(--text-small);">Lipides</div><div style="font-weight:600;color:var(--fat);font-size:var(--text-h3);">' + round(ing.fat * factor) + ' <span style="font-size:var(--text-caption);color:var(--text-muted);font-weight:400;">g</span></div></div>'

  // Détails supplémentaires
  if (ing.saturated_fat || ing.fiber || ing.sugar || ing.salt) {
    h += '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">'
    if (ing.saturated_fat) h += '<div style="display:flex;justify-content:space-between;font-size:var(--text-small);margin-bottom:6px;"><div>Acides gras saturés</div><div style="font-weight:500;">' + round(ing.saturated_fat * factor) + ' g</div></div>'
    if (ing.sugar) h += '<div style="display:flex;justify-content:space-between;font-size:var(--text-small);margin-bottom:6px;"><div>Sucres</div><div style="font-weight:500;">' + round(ing.sugar * factor) + ' g</div></div>'
    if (ing.fiber) h += '<div style="display:flex;justify-content:space-between;font-size:var(--text-small);margin-bottom:6px;"><div>Fibres</div><div style="font-weight:500;">' + round(ing.fiber * factor) + ' g</div></div>'
    if (ing.salt) h += '<div style="display:flex;justify-content:space-between;font-size:var(--text-small);"><div>Sel</div><div style="font-weight:500;">' + round(ing.salt * factor) + ' g</div></div>'
    h += '</div>'
  }

  h += '</div></div>'

  h += '<div class="row2">'
  h += '<button class="btn primary" data-action="edit-ing" data-id="' + ing.id + '">Modifier</button>'
  h += '<button class="btn danger-outline" data-action="del-ing" data-id="' + ing.id + '">Supprimer</button>'
  h += '</div>'

  return h
}

// ========== EVENTS ==========
function showToast(msg, duration) {
  state.toastMsg = msg
  render()
  setTimeout(() => {
    state.toastMsg = null
    render()
  }, duration || 2200)
}

function bindEvents() {
  const app = document.getElementById('app')

  // Tabs
  app.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.getAttribute('data-tab')
      state.modal = null
      render()
    })
  })

  // Ingredient search
  const searchInput = document.getElementById('ing-search')
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.ingSearch = searchInput.value
      render()
      setTimeout(() => {
        const el = document.getElementById('ing-search')
        if (el) {
          el.focus()
          el.selectionStart = el.selectionEnd = el.value.length
        }
      }, 0)
    })
  }

  // Recipe search
  const recipeSearchInput = document.getElementById('recipe-search')
  if (recipeSearchInput) {
    recipeSearchInput.addEventListener('input', () => {
      state.recipeSearch = recipeSearchInput.value
      render()
      setTimeout(() => {
        const el = document.getElementById('recipe-search')
        if (el) {
          el.focus()
          el.selectionStart = el.selectionEnd = el.value.length
        }
      }, 0)
    })
  }

  // Actions
  app.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.getAttribute('data-action')
      handleAction(action, el)
      saveDisplayPrefs()
    })
  })

  // Goal buttons
  app.querySelectorAll('[data-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.profile.goal = btn.getAttribute('data-goal')
      saveProfile(state.profile)
      render()
    })
  })

  // Profile field changes - auto-save
  const profileFields = [
    { id: 'p-display-name', field: 'display_name', type: 'string' },
    { id: 'p-weight', field: 'weight', type: 'float' },
    { id: 'p-height', field: 'height', type: 'float' },
    { id: 'p-birthdate', field: 'birthdate', type: 'string' },
    { id: 'p-sex', field: 'sex', type: 'string' },
    { id: 'p-activity', field: 'activity', type: 'float' },
    { id: 'p-custom', field: 'use_custom', type: 'bool' }
  ]

  profileFields.forEach(({ id, field, type }) => {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
      let value
      if (type === 'float') value = parseFloat(el.value) || (field.startsWith('custom_') ? 0 : state.profile[field])
      else if (type === 'int') value = parseInt(el.value) || state.profile[field]
      else if (type === 'bool') value = el.checked
      else value = el.value

      state.profile[field] = value
      saveProfile(state.profile)
      if (field === 'display_name') state.personNames = null
    })
  })

  // Macro mode toggle (in edit-profile modal)
  const autoRadio = document.getElementById('p-auto')
  const customRadio = document.getElementById('p-custom')
  const customMacrosDiv = document.getElementById('custom-macros')

  if (autoRadio && customRadio && customMacrosDiv) {
    autoRadio.addEventListener('change', () => {
      state.profile.use_custom = false
      customMacrosDiv.style.display = 'none'
      saveProfile(state.profile)
      refreshObjectiveSummary()
    })
    customRadio.addEventListener('change', () => {
      state.profile.use_custom = true
      customMacrosDiv.style.display = 'block'
      saveProfile(state.profile)
      refreshObjectiveSummary()
    })
  }

  bindCustomMacroInputs()

  // Log meal select
  const logMealSelect = document.getElementById('log-meal')
  if (logMealSelect) {
    logMealSelect.addEventListener('change', () => {
      state.logMeal = logMealSelect.value
    })
  }

  // Log type toggle
  app.querySelectorAll('[data-logtype]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.logType = btn.getAttribute('data-logtype')
      render()
    })
  })

  // Log ingredient select - refresh to show/hide the portion shortcut
  const logIngSelect = document.getElementById('log-ing')
  if (logIngSelect) {
    logIngSelect.addEventListener('change', () => {
      state.logIngId = logIngSelect.value
      state.logPortionIdx = null
      render()
    })
  }

  // Recipe item fields
  app.querySelectorAll('[data-ridx]').forEach(inp => {
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (!state._draftRecipe) return
      const idx = parseInt(inp.getAttribute('data-ridx'))
      const field = inp.getAttribute('data-field')
      state._draftRecipe.items[idx][field] = field === 'grams' ? parseFloat(inp.value) || 0 : inp.value
      render()
    })
  })

  // Recipe item portion quick-select
  app.querySelectorAll('[data-portion-ridx]').forEach(sel => {
    sel.addEventListener('change', () => {
      if (!state._draftRecipe || !sel.value) return
      const idx = parseInt(sel.getAttribute('data-portion-ridx'))
      state._draftRecipe.items[idx].grams = parseFloat(sel.value)
      render()
    })
  })

  // Category select & form validation
  const catSelect = document.getElementById('f-category')
  const newCatInput = document.getElementById('f-new-category')
  const nameInput = document.getElementById('f-name')
  const saveBtn = document.getElementById('save-ing-btn')

  const updateButtonState = () => {
    if (saveBtn && nameInput && catSelect) {
      const name = nameInput.value.trim()
      const cat = catSelect.value
      const isValid = name.length > 0 && cat !== '' && cat !== '__new__'
      saveBtn.disabled = !isValid
    }
  }

  if (catSelect) {
    catSelect.addEventListener('change', () => {
      if (catSelect.value === '__new__') {
        newCatInput.style.display = 'block'
        newCatInput.focus()
      } else {
        newCatInput.style.display = 'none'
        if (!state._draftIngredient) state._draftIngredient = {}
        state._draftIngredient.category = catSelect.value
      }
      updateButtonState()
    })
  }

  if (nameInput) {
    nameInput.addEventListener('input', updateButtonState)
  }

  updateButtonState()

  // Photo URL field - update preview live
  const photoUrlInput = document.getElementById('f-photo-url')
  if (photoUrlInput) {
    photoUrlInput.addEventListener('input', () => {
      if (!state._draftIngredient) state._draftIngredient = {}
      state._draftIngredient.photo = photoUrlInput.value.trim()
      const preview = document.getElementById('photo-preview')
      if (preview) {
        preview.innerHTML = state._draftIngredient.photo
          ? '<img src="' + esc(state._draftIngredient.photo) + '" style="width:100%;height:100%;object-fit:cover;"/>'
          : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:var(--text-h2);">📷</div>'
      }
    })
  }

  // Recipe form fields - keep draft in sync so it survives a re-render (e.g. adding an ingredient line)
  const rfName = document.getElementById('rf-name')
  if (rfName) {
    rfName.addEventListener('input', () => {
      if (!state._draftRecipe) return
      state._draftRecipe.name = rfName.value
    })
  }
  const rfReferenceUrl = document.getElementById('rf-reference-url')
  if (rfReferenceUrl) {
    rfReferenceUrl.addEventListener('input', () => {
      if (!state._draftRecipe) return
      state._draftRecipe.reference_url = rfReferenceUrl.value
    })
  }
  const rfInstructions = document.getElementById('rf-instructions')
  if (rfInstructions) {
    rfInstructions.addEventListener('input', () => {
      if (!state._draftRecipe) return
      state._draftRecipe.instructions = rfInstructions.value
    })
  }
  const rfPhotoUrl = document.getElementById('rf-photo-url')
  if (rfPhotoUrl) {
    rfPhotoUrl.addEventListener('input', () => {
      if (!state._draftRecipe) return
      state._draftRecipe.photo = rfPhotoUrl.value
    })
  }

  // Recipe type select
  const rfTypeSelect = document.getElementById('rf-type')
  const rfNewTypeInput = document.getElementById('rf-new-type')
  if (rfTypeSelect) {
    rfTypeSelect.addEventListener('change', () => {
      if (!state._draftRecipe) state._draftRecipe = {}
      state._draftRecipe.type = rfTypeSelect.value
      if (rfTypeSelect.value === '__new__') {
        rfNewTypeInput.style.display = 'block'
        rfNewTypeInput.focus()
      } else {
        rfNewTypeInput.style.display = 'none'
      }
    })
  }
  if (rfNewTypeInput) {
    rfNewTypeInput.addEventListener('input', () => {
      if (state._draftRecipe) state._draftRecipe.newType = rfNewTypeInput.value
    })
  }

  // Recipe ingredient picker search
  const recipeIngPickerSearch = document.getElementById('recipe-ing-picker-search')
  if (recipeIngPickerSearch) {
    recipeIngPickerSearch.addEventListener('input', () => {
      state._recipeIngPickerSearch = recipeIngPickerSearch.value
      render()
      setTimeout(() => {
        const el = document.getElementById('recipe-ing-picker-search')
        if (el) {
          el.focus()
          el.selectionStart = el.selectionEnd = el.value.length
        }
      }, 0)
    })
  }
}

function bindCustomMacroInputs() {
  const mode = state.profile.custom_mode || 'grams'

  if (mode === 'kcal_pct') {
    const kcalEl = document.getElementById('c-kcal')
    const pctProteinEl = document.getElementById('c-pct-protein')
    const pctCarbsEl = document.getElementById('c-pct-carbs')
    const pctFatEl = document.getElementById('c-pct-fat')
    const gramsDisplay = document.getElementById('c-grams-computed')
    if (!kcalEl || !pctProteinEl || !pctCarbsEl || !pctFatEl) return

    const recompute = () => {
      const kcal = parseFloat(kcalEl.value) || 0
      const pctProtein = parseFloat(pctProteinEl.value) || 0
      const pctCarbs = parseFloat(pctCarbsEl.value) || 0
      const pctFat = parseFloat(pctFatEl.value) || 0
      const protein = (kcal * pctProtein) / 100 / 4
      const carbs = (kcal * pctCarbs) / 100 / 4
      const fat = (kcal * pctFat) / 100 / 9

      state.profile.custom_kcal = kcal
      state.profile.custom_pct_protein = pctProtein
      state.profile.custom_pct_carbs = pctCarbs
      state.profile.custom_pct_fat = pctFat
      state.profile.custom_protein = protein
      state.profile.custom_carbs = carbs
      state.profile.custom_fat = fat

      if (gramsDisplay) {
        const totalPct = pctProtein + pctCarbs + pctFat
        gramsDisplay.innerHTML = round(protein) + 'g P · ' + round(carbs) + 'g G · ' + round(fat) + 'g L' +
          (totalPct !== 100 ? ' <span style="color:var(--danger);">(total ' + round(totalPct) + '%)</span>' : '')
      }
      saveProfile(state.profile)
      refreshObjectiveSummary()
    }

    ;[kcalEl, pctProteinEl, pctCarbsEl, pctFatEl].forEach(el => el.addEventListener('input', recompute))
  } else {
    const proteinEl = document.getElementById('c-protein')
    const carbsEl = document.getElementById('c-carbs')
    const fatEl = document.getElementById('c-fat')
    const kcalDisplay = document.getElementById('c-kcal-computed')
    if (!proteinEl || !carbsEl || !fatEl) return

    const recompute = () => {
      const protein = parseFloat(proteinEl.value) || 0
      const carbs = parseFloat(carbsEl.value) || 0
      const fat = parseFloat(fatEl.value) || 0
      const kcal = protein * 4 + carbs * 4 + fat * 9

      state.profile.custom_protein = protein
      state.profile.custom_carbs = carbs
      state.profile.custom_fat = fat
      state.profile.custom_kcal = kcal

      if (kcalDisplay) kcalDisplay.textContent = round(kcal)
      saveProfile(state.profile)
      refreshObjectiveSummary()
    }

    ;[proteinEl, carbsEl, fatEl].forEach(el => el.addEventListener('input', recompute))
  }
}

function handleAction(action, el) {
  if (action === 'clear-ing-search') {
    state.ingSearch = ''
    render()
  } else if (action === 'toggle-category') {
    const cat = el.getAttribute('data-cat')
    const currentlyCollapsed = state.collapsedCategories[cat] !== false
    state.collapsedCategories[cat] = !currentlyCollapsed
    render()
  } else if (action === 'set-ing-collapse-all') {
    const collapsed = el.getAttribute('data-collapsed') === 'true'
    ingGroupKeys().forEach(c => {
      state.collapsedCategories[c] = collapsed
    })
    render()
  } else if (action === 'open-ing-filter') {
    state.modal = { type: 'ing-filter' }
    render()
  } else if (action === 'set-ing-view-mode') {
    state.ingViewMode = el.getAttribute('data-mode')
    render()
  } else if (action === 'toggle-fav-filter') {
    state.ingFavoritesOnly = el.checked
    render()
  } else if (action === 'toggle-favorite') {
    const id = el.getAttribute('data-id')
    const ing = state.ingredients.find(i => i.id === id)
    if (ing) {
      ing.is_favorite = !ing.is_favorite
      saveIngredient(ing)
      render()
    }
  } else if (action === 'toggle-ing-visible-category') {
    const cat = el.getAttribute('data-cat')
    if (state.ingVisibleCategories === null) {
      state.ingVisibleCategories = state.categories.filter(c => c !== cat)
    } else if (el.checked) {
      if (!state.ingVisibleCategories.includes(cat)) state.ingVisibleCategories.push(cat)
    } else {
      state.ingVisibleCategories = state.ingVisibleCategories.filter(c => c !== cat)
    }
    if (state.ingVisibleCategories.length === state.categories.length) {
      state.ingVisibleCategories = null
    }
    render()
  } else if (action === 'clear-recipe-search') {
    state.recipeSearch = ''
    render()
  } else if (action === 'toggle-recipe-type-collapse') {
    const type = el.getAttribute('data-type')
    const currentlyCollapsed = state.collapsedRecipeTypes[type] !== false
    state.collapsedRecipeTypes[type] = !currentlyCollapsed
    render()
  } else if (action === 'set-recipe-collapse-all') {
    const collapsed = el.getAttribute('data-collapsed') === 'true'
    recipeGroupKeys().forEach(t => {
      state.collapsedRecipeTypes[t] = collapsed
    })
    render()
  } else if (action === 'open-recipe-filter') {
    state.modal = { type: 'recipe-filter' }
    render()
  } else if (action === 'set-recipe-view-mode') {
    state.recipeViewMode = el.getAttribute('data-mode')
    render()
  } else if (action === 'toggle-recipe-fav-filter') {
    state.recipeFavoritesOnly = el.checked
    render()
  } else if (action === 'toggle-recipe-visible-type') {
    const type = el.getAttribute('data-type')
    const allTypes = recipeTypeOptions()
    if (state.recipeVisibleTypes === null) {
      state.recipeVisibleTypes = allTypes.filter(t => t !== type)
    } else if (el.checked) {
      if (!state.recipeVisibleTypes.includes(type)) state.recipeVisibleTypes.push(type)
    } else {
      state.recipeVisibleTypes = state.recipeVisibleTypes.filter(t => t !== type)
    }
    if (state.recipeVisibleTypes.length === allTypes.length) {
      state.recipeVisibleTypes = null
    }
    render()
  } else if (action === 'view-recipe') {
    state._recipeDetailServings = null
    state.modal = { type: 'recipe-detail', recipeId: el.getAttribute('data-id') }
    render()
  } else if (action === 'recipe-servings-step') {
    const recipe = state.recipes.find(r => r.id === state.modal.recipeId)
    if (recipe) {
      const current = state._recipeDetailServings || Math.max(1, recipe.servings || 1)
      state._recipeDetailServings = Math.max(1, current + parseInt(el.getAttribute('data-delta')))
      render()
    }
  } else if (action === 'toggle-recipe-favorite') {
    const recipe = state.recipes.find(r => r.id === el.getAttribute('data-id'))
    if (recipe) {
      recipe.is_favorite = !recipe.is_favorite
      setRecipeFavorite(recipe.id, recipe.is_favorite)
      render()
    }
  } else if (action === 'set-ing-unit') {
    if (!state._draftIngredient) state._draftIngredient = {}
    state._draftIngredient.unit = el.getAttribute('data-unit')
    render()
  } else if (action === 'set-custom-mode') {
    state.profile.custom_mode = el.getAttribute('data-mode')
    saveProfile(state.profile)
    render()
  } else if (action === 'close-profile') {
    state.tab = 'today'
    state.modal = null
    render()
  } else if (action === 'open-objectives') {
    state.modal = { type: 'objectives' }
    render()
  } else if (action === 'open-profile') {
    state.tab = 'profile'
    state.modal = null
    render()
  } else if (action === 'prev-day') {
    changeDate(addDays(state.currentDate, -1))
  } else if (action === 'next-day') {
    changeDate(addDays(state.currentDate, 1))
  } else if (action === 'open-date-picker') {
    const d = parseLocalDate(state.currentDate)
    state._calendarMonth = { year: d.getFullYear(), month: d.getMonth() }
    state.modal = { type: 'date-picker' }
    render()
  } else if (action === 'calendar-prev-month') {
    state._calendarMonth.month--
    if (state._calendarMonth.month < 0) {
      state._calendarMonth.month = 11
      state._calendarMonth.year--
    }
    render()
  } else if (action === 'calendar-next-month') {
    state._calendarMonth.month++
    if (state._calendarMonth.month > 11) {
      state._calendarMonth.month = 0
      state._calendarMonth.year++
    }
    render()
  } else if (action === 'calendar-select-day') {
    const dateStr = el.getAttribute('data-date')
    state.modal = null
    changeDate(dateStr)
  } else if (action === 'logout') {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(PERSON_STORAGE_KEY)
    state.authenticated = false
    state.currentPerson = null
    render()
  } else if (action === 'switch-person') {
    localStorage.removeItem(PERSON_STORAGE_KEY)
    state.currentPerson = null
    render()
  } else if (action === 'set-theme') {
    const theme = el.getAttribute('data-theme')
    state.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    applyTheme(theme)
    render()
  } else if (action === 'open-edit-profile') {
    state.modal = { type: 'edit-profile' }
    render()
  } else if (action === 'open-settings') {
    state.modal = { type: 'settings' }
    render()
  } else if (action === 'view-ing') {
    state._ingDetailPortionIdx = null
    state.modal = { type: 'ing-detail', ingId: el.getAttribute('data-id') }
    render()
  } else if (action === 'set-ing-detail-portion') {
    const idx = parseInt(el.getAttribute('data-idx'))
    state._ingDetailPortionIdx = idx === -1 ? null : idx
    render()
  } else if (action === 'open-add-ing') {
    state._draftIngredient = null
    state.modal = { type: 'add-ing' }
    render()
  } else if (action === 'edit-ing') {
    state._draftIngredient = null
    state.modal = { type: 'add-ing', editId: el.getAttribute('data-id') }
    render()
  } else if (action === 'del-ing') {
    const id = el.getAttribute('data-id')
    state.ingredients = state.ingredients.filter(i => i.id !== id)
    deleteIngredient(id)
    state.modal = null
    render()
  } else if (action === 'add-brand') {
    if (!state._draftIngredient) state._draftIngredient = {}
    const input = document.getElementById('f-brand-input')
    const brand = input.value.trim()
    if (!brand) {
      showToast('Saisis le nom de la marque')
      return
    }
    if (!state._draftIngredient.brands) state._draftIngredient.brands = []
    state._draftIngredient.brands.push(brand)
    input.value = ''
    render()
  } else if (action === 'rm-brand') {
    if (!state._draftIngredient) return
    const idx = parseInt(el.getAttribute('data-idx'))
    state._draftIngredient.brands.splice(idx, 1)
    render()
  } else if (action === 'add-portion') {
    if (!state._draftIngredient) state._draftIngredient = {}
    const nameInput = document.getElementById('f-portion-name')
    const gramsInput = document.getElementById('f-portion-grams')
    const name = nameInput.value.trim()
    const grams = parseFloat(gramsInput.value)
    if (!name || !grams) {
      showToast('Donne un nom et un poids pour la portion')
      return
    }
    if (!state._draftIngredient.portions) state._draftIngredient.portions = []
    state._draftIngredient.portions.push({ name, grams })
    render()
  } else if (action === 'rm-portion') {
    if (!state._draftIngredient) return
    const idx = parseInt(el.getAttribute('data-idx'))
    state._draftIngredient.portions.splice(idx, 1)
    render()
  } else if (action === 'save-ing') {
    const editId = el.getAttribute('data-id')
    const name = document.getElementById('f-name').value.trim()
    if (!name) {
      showToast('Donne un nom à l\'ingrédient')
      return
    }

    const photo = document.getElementById('f-photo-url').value.trim()

    saveIngredientWithPhoto()

    function saveIngredientWithPhoto() {
      let category = document.getElementById('f-category').value
      if (!category || category === '') {
        showToast('Sélectionne une catégorie')
        return
      }

      if (category === '__new__') {
        category = document.getElementById('f-new-category').value.trim()
        if (!category) {
          showToast('Donne un nom à la nouvelle catégorie')
          return
        }
        if (!state.categories.includes(category)) {
          state.categories.push(category)
          addCategory(category)
        }
      }

      const obj = {
        id: editId || uid(),
        name,
        category: category,
        portions: state._draftIngredient?.portions || [],
        kcal: parseFloat(document.getElementById('f-kcal').value) || 0,
        protein: parseFloat(document.getElementById('f-protein').value) || 0,
        carbs: parseFloat(document.getElementById('f-carbs').value) || 0,
        fat: parseFloat(document.getElementById('f-fat').value) || 0,
        saturated_fat: parseFloat(document.getElementById('f-saturated-fat').value) || 0,
        fiber: parseFloat(document.getElementById('f-fiber').value) || 0,
        sugar: parseFloat(document.getElementById('f-sugar').value) || 0,
        salt: parseFloat(document.getElementById('f-salt').value) || 0,
        unit: state._draftIngredient?.unit || 'g',
        brands: state._draftIngredient?.brands || [],
        photo: photo
      }
      if (editId) {
        state.ingredients = state.ingredients.map(i => (i.id === editId ? { ...obj, is_favorite: i.is_favorite } : i))
      } else {
        state.ingredients.push(obj)
      }
      saveIngredient(obj)
      state._draftIngredient = null
      state.modal = null
      render()
      showToast('Ingrédient enregistré')
    }
  } else if (action === 'open-add-recipe') {
    state._draftRecipe = null
    state.modal = { type: 'add-recipe' }
    render()
  } else if (action === 'edit-recipe') {
    state._draftRecipe = null
    state.modal = { type: 'add-recipe', editId: el.getAttribute('data-id') }
    render()
  } else if (action === 'del-recipe') {
    const rid = el.getAttribute('data-id')
    state.recipes = state.recipes.filter(r => r.id !== rid)
    deleteRecipe(rid)
    state.modal = null
    render()
  } else if (action === 'rf-servings-step') {
    if (!state._draftRecipe) return
    const current = Math.max(1, parseInt(state._draftRecipe.servings) || 1)
    state._draftRecipe.servings = Math.max(1, current + parseInt(el.getAttribute('data-delta')))
    render()
  } else if (action === 'add-recipe-item') {
    if (!state._draftRecipe) return
    state._draftRecipe.items.push({ ingredient_id: null, grams: 100 })
    state._recipeIngPickerIdx = state._draftRecipe.items.length - 1
    state._recipeIngPickerSearch = ''
    state.modal = { type: 'recipe-ing-picker' }
    render()
  } else if (action === 'open-recipe-ing-picker') {
    state._recipeIngPickerIdx = parseInt(el.getAttribute('data-idx'))
    state._recipeIngPickerSearch = ''
    state.modal = { type: 'recipe-ing-picker' }
    render()
  } else if (action === 'toggle-recipe-ing-picker-view') {
    state._recipeIngPickerViewMode = state._recipeIngPickerViewMode === 'category' ? 'alphabetical' : 'category'
    render()
  } else if (action === 'pick-recipe-ingredient') {
    if (state._draftRecipe && state._recipeIngPickerIdx != null) {
      state._draftRecipe.items[state._recipeIngPickerIdx].ingredient_id = el.getAttribute('data-id')
    }
    state.modal = { type: 'add-recipe', editId: state._draftRecipe ? state._draftRecipe.__for : null }
    render()
  } else if (action === 'rm-recipe-item') {
    const idx = parseInt(el.getAttribute('data-idx'))
    state._draftRecipe.items.splice(idx, 1)
    render()
  } else if (action === 'save-recipe') {
    const editId2 = el.getAttribute('data-id')
    const name2 = document.getElementById('rf-name').value.trim()
    if (!name2) {
      showToast('Donne un nom à la recette')
      return
    }
    const draft = state._draftRecipe
    if (draft.items.some(it => !it.ingredient_id)) {
      showToast('Choisis un ingrédient pour chaque ligne')
      return
    }
    const servings = Math.max(1, parseInt(draft.servings) || 1)
    let type = document.getElementById('rf-type').value
    if (type === '__new__') {
      type = document.getElementById('rf-new-type').value.trim()
      if (!type) {
        showToast('Donne un nom au nouveau type')
        return
      }
      if (!state.recipeTypes.includes(type)) {
        state.recipeTypes.push(type)
        addRecipeType(type)
      }
    }
    const obj2 = {
      id: editId2 || uid(),
      name: name2,
      servings: servings,
      type: type,
      reference_url: document.getElementById('rf-reference-url').value.trim(),
      photo: document.getElementById('rf-photo-url').value.trim(),
      items: draft.items
    }
    const instructions = document.getElementById('rf-instructions').value.trim()
    const existingRecipe = editId2 ? state.recipes.find(r => r.id === editId2) : null
    if (instructions || (existingRecipe && 'instructions' in existingRecipe)) {
      obj2.instructions = instructions
    }
    if (editId2) {
      state.recipes = state.recipes.map(r => (r.id === editId2 ? { ...obj2, is_favorite: r.is_favorite } : r))
    } else {
      state.recipes.push(obj2)
    }
    saveRecipe(obj2)
    state._draftRecipe = null
    state.modal = null
    render()
    showToast('Recette enregistrée')
  } else if (action === 'set-log-portion') {
    const idx = parseInt(el.getAttribute('data-idx'))
    state.logPortionIdx = idx === -1 ? null : idx
    render()
  } else if (action === 'open-add-log') {
    state.logType = 'recipe'
    state.logIngId = null
    state.logPortionIdx = null
    state.logMeal = el.getAttribute('data-meal') || defaultMealForNow()
    state.modal = { type: 'add-log' }
    render()
  } else if (action === 'confirm-log-recipe') {
    const rid3 = document.getElementById('log-recipe').value
    const servings2 = parseFloat(document.getElementById('log-servings').value) || 1
    logRecipe(rid3, servings2)
    state.modal = null
    render()
    showToast('Ajouté au journal')
  } else if (action === 'confirm-log-ing') {
    const iid = document.getElementById('log-ing').value
    let grams
    if (state.logPortionIdx != null) {
      const ing = state.ingredients.find(i => i.id === iid)
      const portions = getIngredientPortions(ing)
      const p = portions[state.logPortionIdx]
      const count = parseFloat(document.getElementById('log-portions').value) || 0
      grams = count * (p ? p.grams : 0)
    } else {
      grams = parseFloat(document.getElementById('log-grams').value) || 0
    }
    logIngredient(iid, grams)
    state.modal = null
    render()
    showToast('Ajouté au journal')
  } else if (action === 'del-log') {
    const lid = el.getAttribute('data-id')
    state.logs = state.logs.filter(e => e.id !== lid)
    deleteLog(lid)
    render()
  } else if (action === 'save-profile') {
    const p = state.profile
    p.weight = parseFloat(document.getElementById('p-weight').value) || p.weight
    p.height = parseFloat(document.getElementById('p-height').value) || p.height
    p.birthdate = document.getElementById('p-birthdate').value || p.birthdate
    p.sex = document.getElementById('p-sex').value
    p.activity = parseFloat(document.getElementById('p-activity').value)
    saveProfile(p)
    state.modal = null
    render()
    showToast('Profil enregistré')
  } else if (action === 'add-category') {
    const input = document.getElementById('new-category-input')
    const cat = input.value.trim()
    if (!cat) {
      showToast('Saisis le nom de la catégorie')
      return
    }
    if (!state.categories.includes(cat)) {
      state.categories.push(cat)
      addCategory(cat)
      input.value = ''
      render()
    } else {
      showToast('Cette catégorie existe déjà')
    }
  } else if (action === 'edit-category') {
    const idx = parseInt(el.getAttribute('data-idx'))
    state.modal = { type: 'edit-category', categoryIdx: idx }
    render()
  } else if (action === 'save-category') {
    const idx = parseInt(el.getAttribute('data-idx'))
    const oldName = state.categories[idx]
    const newName = document.getElementById('edit-cat-input').value.trim()
    if (!newName) {
      showToast('Saisis un nom pour la catégorie')
      return
    }
    if (state.categories.includes(newName) && oldName !== newName) {
      showToast('Cette catégorie existe déjà')
      return
    }
    state.categories[idx] = newName
    state.ingredients.forEach(i => {
      if (i.category === oldName) i.category = newName
    })
    renameCategory(oldName, newName)
    state.modal = null
    render()
    showToast('Catégorie modifiée')
  } else if (action === 'rm-category') {
    const idx = parseInt(el.getAttribute('data-idx'))
    const name = state.categories[idx]
    state.categories.splice(idx, 1)
    deleteCategory(name)
    render()
  } else if (action === 'add-recipe-type') {
    const input = document.getElementById('new-recipe-type-input')
    const type = input.value.trim()
    if (!type) {
      showToast('Saisis le nom du type')
      return
    }
    if (!state.recipeTypes.includes(type)) {
      state.recipeTypes.push(type)
      addRecipeType(type)
      input.value = ''
      render()
    } else {
      showToast('Ce type existe déjà')
    }
  } else if (action === 'edit-recipe-type') {
    const idx = parseInt(el.getAttribute('data-idx'))
    state.modal = { type: 'edit-recipe-type', typeIdx: idx }
    render()
  } else if (action === 'save-recipe-type') {
    const idx = parseInt(el.getAttribute('data-idx'))
    const oldName = state.recipeTypes[idx]
    const newName = document.getElementById('edit-recipe-type-input').value.trim()
    if (!newName) {
      showToast('Saisis un nom pour le type')
      return
    }
    if (state.recipeTypes.includes(newName) && oldName !== newName) {
      showToast('Ce type existe déjà')
      return
    }
    state.recipeTypes[idx] = newName
    state.recipes.forEach(r => {
      if (r.type === oldName) r.type = newName
    })
    renameRecipeType(oldName, newName)
    state.modal = null
    render()
    showToast('Type modifié')
  } else if (action === 'rm-recipe-type') {
    const idx = parseInt(el.getAttribute('data-idx'))
    const name = state.recipeTypes[idx]
    state.recipeTypes.splice(idx, 1)
    deleteRecipeType(name)
    render()
  } else if (action === 'close-modal' || action === 'close-modal-bg') {
    if (state.modal && state.modal.type === 'recipe-ing-picker') {
      state.modal = { type: 'add-recipe', editId: state._draftRecipe ? state._draftRecipe.__for : null }
    } else {
      state.modal = null
      state._draftRecipe = null
    }
    render()
  }
}

function logRecipe(recipeId, servings) {
  const r = state.recipes.find(x => x.id === recipeId)
  if (!r) return
  const m = recipeMacrosPerServing(r, state.ingredients)
  const entry = {
    id: uid(),
    log_date: state.currentDate,
    person_id: state.currentPerson,
    kind: 'recipe',
    ref_id: r.id,
    meal: state.logMeal,
    name: r.name + ' (' + servings + ' part.)',
    kcal: m.kcal * servings,
    protein: m.protein * servings,
    carbs: m.carbs * servings,
    fat: m.fat * servings,
    ts: Date.now()
  }
  state.logs.push(entry)
  addLog(entry)
}

function logIngredient(ingId, grams) {
  const i = state.ingredients.find(x => x.id === ingId)
  if (!i) return
  const f = grams / 100
  const entry = {
    id: uid(),
    log_date: state.currentDate,
    person_id: state.currentPerson,
    kind: 'ingredient',
    ref_id: i.id,
    meal: state.logMeal,
    name: i.name + ' (' + grams + 'g)',
    kcal: i.kcal * f,
    protein: i.protein * f,
    carbs: i.carbs * f,
    fat: i.fat * f,
    ts: Date.now()
  }
  state.logs.push(entry)
  addLog(entry)
}

// Click outside modal
document.addEventListener('click', ev => {
  if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-action') === 'close-modal-bg') {
    if (state.modal && state.modal.type === 'recipe-ing-picker') {
      state.modal = { type: 'add-recipe', editId: state._draftRecipe ? state._draftRecipe.__for : null }
    } else {
      state.modal = null
      state._draftRecipe = null
    }
    render()
  }
})

// Start app
init()
