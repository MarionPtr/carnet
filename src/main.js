import './style.css'
import {
  loadIngredients,
  loadRecipes,
  loadProfile,
  loadLogs,
  saveIngredient,
  deleteIngredient,
  saveRecipe,
  deleteRecipe,
  saveProfile,
  addLog,
  deleteLog,
  uid,
  loadCategories,
  addCategory,
  renameCategory,
  deleteCategory
} from './lib/db'
import {
  round,
  clamp,
  todayStr,
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
  modal: null,
  toastMsg: null,
  ingSearch: '',
  logType: 'recipe',
  _draftIngredient: null,
  _draftRecipe: null,
  categories: []
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
    state.logs = await loadLogs(todayStr(), state.currentPerson)
    state.categories = await loadCategories()
  } catch (e) {
    console.error('Erreur lors du chargement:', e)
  }
  state.ready = true
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

  html += renderTabs()
  if (state.modal) html += renderModal()
  if (state.toastMsg) html += `<div class="toast">${esc(state.toastMsg)}</div>`

  app.innerHTML = html
  bindEvents()
}

// ========== AUTH ==========
function renderAuth() {
  let h = '<div style="max-width:480px;margin:0 auto;padding:20px;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">'
  h += '<div style="width:100%;max-width:400px;">'
  h += '<h1 style="text-align:center;font-size:28px;margin-bottom:30px;font-family:Fraunces,serif;">Carnet</h1>'
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
  h += '<div style="width:100%;max-width:400px;">'
  h += '<h1 style="text-align:center;font-size:28px;margin-bottom:30px;font-family:Fraunces,serif;">Qui es-tu ?</h1>'
  h += '<button class="btn primary block" style="margin-bottom:12px;padding:16px;font-size:16px;" data-action="select-person" data-person="person1">' + esc(names.person1) + '</button>'
  h += '<button class="btn primary block" style="padding:16px;font-size:16px;" data-action="select-person" data-person="person2">' + esc(names.person2) + '</button>'
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

  let h = '<header class="top"><p class="eyebrow">Aujourd\'hui</p><h1>' + formatDateFR(new Date()) + '</h1></header>'
  h += '<section>'
  h += '<div class="card">'
  h += '<div class="kcal-hero"><span class="num">' + round(totals.kcal) + ' <span style="font-size:16px;color:var(--text-muted);font-weight:400;">kcal</span></span><span class="target">objectif ' + targets.kcal + '</span></div>'
  h += '<div class="macro-row"><span class="label">&nbsp;</span><div class="bar-track"><div class="bar-fill" style="width:' + (pct * 100) + '%;background:var(--kcal)"></div></div><span class="amt"></span></div>'
  h += macroRow('Protéines', totals.protein, targets.protein, 'var(--protein)')
  h += macroRow('Glucides', totals.carbs, targets.carbs, 'var(--carbs)')
  h += macroRow('Lipides', totals.fat, targets.fat, 'var(--fat)')
  h += '</div>'
  h += '<div class="row2" style="margin-bottom:12px;"><button class="btn primary block" data-action="open-add-log">+ Ajouter au journal</button></div>'
  h += '<div class="card"><h3 style="margin:0 0 8px;font-size:15px;">Journal du jour</h3>'

  if (state.logs.length === 0) {
    h += '<div class="empty">Rien de mangé pour l\'instant. Ajoute une recette ou un ingrédient.</div>'
  } else {
    state.logs
      .slice()
      .reverse()
      .forEach(log => {
        h += '<div class="list-item">'
        h += '<div><div class="name">' + esc(log.name) + '</div><div class="sub">' + round(log.kcal) + ' kcal · ' + round(log.protein) + 'g P · ' + round(log.carbs) + 'g G · ' + round(log.fat) + 'g L</div></div>'
        h += '<div class="actions"><button class="icon-btn" data-action="del-log" data-id="' + log.id + '">✕</button></div>'
        h += '</div>'
      })
  }

  h += '</div></section>'
  return h
}

function macroRow(label, val, target, color) {
  const pct = clamp(val / Math.max(1, target), 0, 1)
  return `<div class="macro-row"><span class="label">${label}</span><div class="bar-track"><div class="bar-fill" style="width:${pct * 100}%;background:${color}"></div></div><span class="amt">${round(val)} / ${round(target)}g</span></div>`
}

// ========== INGREDIENTS ==========
function renderIngredients() {
  const q = state.ingSearch.toLowerCase()
  const filtered = state.ingredients.filter(i => i.name.toLowerCase().indexOf(q) > -1)

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

  let h = '<header class="top"><p class="eyebrow">Garde-manger</p><h1>Ingrédients</h1></header>'
  h += '<section>'
  h += '<div class="search-wrap"><input placeholder="Rechercher…" id="ing-search" value="' + esc(state.ingSearch) + '"/></div>'
  h += '<button class="btn primary block" data-action="open-add-ing" style="margin-bottom:14px;">+ Nouvel ingrédient</button>'
  h += '<div class="card">'

  if (filtered.length === 0) {
    h += '<div class="empty">Aucun ingrédient. Ajoute-en un pour commencer.</div>'
  } else {
    categories.forEach(cat => {
      h += '<h4 style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin:16px 0 8px;letter-spacing:0.5px;">' + esc(cat) + '</h4>'
      h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px;">'
      grouped[cat].forEach((i, idx) => {
        h += '<div class="list-item" style="cursor:pointer;padding:10px 12px;border-bottom:' + (idx < grouped[cat].length - 1 ? '1px solid var(--border)' : 'none') + ';" data-action="view-ing" data-id="' + i.id + '">'
        // Thumbnail
        h += '<div style="width:42px;height:42px;flex-shrink:0;border-radius:8px;overflow:hidden;margin-right:10px;background:var(--surface-raised);border:1px solid var(--border);">'
        if (i.photo) {
          h += '<img src="' + i.photo + '" style="width:100%;height:100%;object-fit:cover;"/>'
        } else {
          h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:18px;">🥘</div>'
        }
        h += '</div>'
        // Info
        h += '<div style="flex:1;"><div class="name" style="font-size:14px;">' + esc(i.name) + '</div>'
        if (i.brands && i.brands.length > 0) {
          h += '<div class="sub" style="font-size:10.5px;margin-bottom:2px;">' + i.brands.join(', ') + '</div>'
        }
        h += '<div class="sub" style="font-size:11px;">' + round(i.kcal) + ' kcal · P ' + round(i.protein) + 'g · G ' + round(i.carbs) + 'g · L ' + round(i.fat) + 'g</div></div>'
        h += '<div class="actions" onclick="event.stopPropagation();"><button class="icon-btn" data-action="edit-ing" data-id="' + i.id + '">✎</button><button class="icon-btn" data-action="del-ing" data-id="' + i.id + '">✕</button></div>'
        h += '</div>'
      })
      h += '</div>'
    })
  }

  h += '</div></section>'
  return h
}

// ========== RECIPES ==========
function renderRecipes() {
  let h = '<header class="top"><p class="eyebrow">Livre de recettes</p><h1>Recettes</h1></header>'
  h += '<section>'
  h += '<button class="btn primary block" data-action="open-add-recipe" style="margin-bottom:14px;">+ Nouvelle recette</button>'
  h += '<div class="card">'

  if (state.recipes.length === 0) {
    h += '<div class="empty">Aucune recette. Crée-en une à partir de tes ingrédients.</div>'
  } else {
    state.recipes
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(r => {
        const m = recipeMacrosPerServing(r, state.ingredients)
        h += '<div class="list-item">'
        h += '<div><div class="name">' + esc(r.name) + '</div><div class="sub">' + r.servings + ' part. · ' + round(m.kcal) + ' kcal/part · <span class="pill protein">P ' + round(m.protein) + 'g</span> <span class="pill carbs">G ' + round(m.carbs) + 'g</span> <span class="pill fat">L ' + round(m.fat) + 'g</span></div></div>'
        h += '<div class="actions"><button class="icon-btn" data-action="log-recipe-quick" data-id="' + r.id + '" title="Ajouter au journal">＋</button><button class="icon-btn" data-action="edit-recipe" data-id="' + r.id + '">✎</button><button class="icon-btn" data-action="del-recipe" data-id="' + r.id + '">✕</button></div>'
        h += '</div>'
      })
  }

  h += '</div></section>'
  return h
}

// ========== PROFILE ==========
function renderProfile() {
  const p = state.profile
  const targets = computeTargets(p)

  let h = '<header class="top"><p class="eyebrow">' + esc(p.display_name || 'Réglages') + '</p><h1>Profil</h1></header>'
  h += '<section>'

  // === SECTION PROFIL ===
  h += '<div class="card">'
  h += '<h3 style="margin:0 0 12px;font-size:15px;">Mon profil</h3>'
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
  h += '<div><div class="sub" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Poids</div><div style="font-size:16px;font-weight:600;">' + p.weight + ' kg</div></div>'
  h += '<div><div class="sub" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Taille</div><div style="font-size:16px;font-weight:600;">' + p.height + ' cm</div></div>'
  h += '<div><div class="sub" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Âge</div><div style="font-size:16px;font-weight:600;">' + p.age + ' ans</div></div>'
  h += '<div><div class="sub" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Sexe</div><div style="font-size:16px;font-weight:600;">' + (p.sex === 'f' ? 'Femme' : 'Homme') + '</div></div>'
  h += '</div>'

  const activityLabels = { 1.2: 'Sédentaire', 1.375: 'Légère', 1.55: 'Modérée', 1.725: 'Active', 1.9: 'Très active' }
  const goalLabels = { cut: 'Sèche', maintain: 'Maintien', bulk: 'Prise de masse' }
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
  h += '<div><div class="sub" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Activité</div><div style="font-size:14px;font-weight:600;">' + activityLabels[p.activity] + '</div></div>'
  h += '<div><div class="sub" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Objectif</div><div style="font-size:14px;font-weight:600;">' + goalLabels[p.goal] + '</div></div>'
  h += '</div>'

  h += '<button class="btn primary block" data-action="open-edit-profile">Modifier</button>'
  h += '</div>'

  // === SECTION OBJECTIFS ===
  h += '<div class="card"><h3 style="margin:0 0 12px;font-size:15px;">Objectifs</h3>'
  h += '<div style="margin-bottom:12px;">'
  h += '<div style="text-align:center;margin-bottom:12px;">'
  h += '<div class="sub" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Énergie</div>'
  h += '<div style="font-size:28px;font-weight:700;">' + targets.kcal + ' <span style="font-size:14px;color:var(--text-muted);">kcal</span></div>'
  h += '</div>'
  h += '<div style="display:flex;justify-content:space-around;align-items:center;gap:8px;">'
  h += '<div style="text-align:center;flex:1;"><div class="sub" style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">Protéines</div><div style="font-size:16px;font-weight:700;color:var(--protein);">' + targets.protein + 'g</div></div>'
  h += '<div style="text-align:center;flex:1;"><div class="sub" style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">Glucides</div><div style="font-size:16px;font-weight:700;color:var(--carbs);">' + targets.carbs + 'g</div></div>'
  h += '<div style="text-align:center;flex:1;"><div class="sub" style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">Lipides</div><div style="font-size:16px;font-weight:700;color:var(--fat);">' + targets.fat + 'g</div></div>'
  h += '</div>'
  h += '</div>'
  h += '<div class="sub" style="font-size:11px;text-align:center;color:var(--text-muted);">' + (p.use_custom ? '🔧 Mode manuel' : '📊 Calculé automatiquement') + '</div>'
  h += '</div>'

  // === SECTION CATÉGORIES ===
  h += '<div class="card"><h3 style="margin:0 0 12px;font-size:15px;">Catégories d\'ingrédients</h3>'
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">'
  state.categories.forEach((cat, idx) => {
    h += '<div style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:var(--surface-raised);border-radius:8px;font-size:12px;">'
    h += '<span>' + esc(cat) + '</span>'
    h += '<button class="icon-btn" data-action="edit-category" data-idx="' + idx + '" style="font-size:13px;padding:0;margin:0;opacity:0.6;">✎</button>'
    h += '<button class="icon-btn" data-action="rm-category" data-idx="' + idx + '" style="font-size:14px;padding:0;margin:0;">✕</button>'
    h += '</div>'
  })
  h += '</div>'
  h += '<div style="display:flex;gap:6px;">'
  h += '<input id="new-category-input" placeholder="Nouvelle catégorie" style="flex:1;"/>'
  h += '<button class="btn small" data-action="add-category">+</button>'
  h += '</div>'
  h += '</div>'

  // === APPARENCE ===
  h += '<div class="card"><h3 style="margin:0 0 12px;font-size:15px;">Apparence</h3>'
  h += '<div class="segmented">'
  h += '<button type="button" class="' + (state.theme === 'system' ? 'active' : '') + '" data-action="set-theme" data-theme="system">📱 Système</button>'
  h += '<button type="button" class="' + (state.theme === 'dark' ? 'active' : '') + '" data-action="set-theme" data-theme="dark">🌙 Sombre</button>'
  h += '<button type="button" class="' + (state.theme === 'light' ? 'active' : '') + '" data-action="set-theme" data-theme="light">☀️ Clair</button>'
  h += '</div>'
  h += '</div>'

  // === COMPTE ===
  h += '<div class="card">'
  h += '<button class="btn block" style="margin-bottom:10px;" data-action="switch-person">Changer de profil</button>'
  h += '<button class="btn danger-outline block" data-action="logout">Se déconnecter</button>'
  h += '</div>'

  h += '</section>'
  return h
}

// ========== TABS ==========
function tabIcon(name) {
  const icons = {
    today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    ingredients:
      '<path d="M6 3v18"/><path d="M6 3c0 3-2 3-2 6s2 3 2 3"/><path d="M18 3v7a3 3 0 0 1-3 3v8"/>',
    recipes:
      '<path d="M4 19.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13.5"/><path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H18"/>',
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
    ['today', 'Aujourd\'hui'],
    ['ingredients', 'Ingrédients'],
    ['recipes', 'Recettes'],
    ['profile', 'Profil']
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
    : { name: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '', sugar: '', salt: '', brands: [], photo: '', serving_size: '' }

  if (!state._draftIngredient) {
    state._draftIngredient = { ...ing }
  }
  const draft = state._draftIngredient

  let h = '<h2>' + (editId ? 'Modifier' : 'Nouvel') + ' ingrédient</h2>'
  h += '<p style="color:var(--text-muted);font-size:12.5px;margin-top:-8px;">Valeurs pour 100 g / 100 ml</p>'

  h += '<label class="field"><span class="lbl">Nom</span><input id="f-name" value="' + esc(draft.name) + '" placeholder="ex. Blanc de poulet"/></label>'

  h += '<label class="field"><span class="lbl">Catégorie</span><select id="f-category">'
  h += '<option value="">Sélectionner une catégorie</option>'
  state.categories.forEach(cat => {
    h += '<option value="' + cat + '" ' + (draft.category === cat ? 'selected' : '') + '>' + cat + '</option>'
  })
  h += '<option value="__new__">+ Ajouter une catégorie</option>'
  h += '</select></label>'
  h += '<input id="f-new-category" type="text" placeholder="Nouvelle catégorie" style="display:none;width:100%;padding:10px 11px;border:1px solid var(--border-strong);border-radius:9px;margin-bottom:10px;background:var(--bg);color:var(--text);font-size:14.5px;"/>'

  h += '<label class="field"><span class="lbl">Marques</span>'
  h += '<div style="margin-bottom:8px;">'
  if (draft.brands && draft.brands.length > 0) {
    draft.brands.forEach((brand, idx) => {
      h += '<div style="display:flex;gap:6px;margin-bottom:6px;"><span style="flex:1;padding:8px;background:var(--surface-raised);border-radius:6px;font-size:13px;">' + esc(brand) + '</span><button class="icon-btn" data-action="rm-brand" data-idx="' + idx + '">✕</button></div>'
    })
  }
  h += '</div>'
  h += '<div style="display:flex;gap:6px;"><input id="f-brand-input" placeholder="Ajouter une marque" style="flex:1;"/><button class="btn small" data-action="add-brand">+</button></div>'
  h += '</label>'

  h += '<label class="field"><span class="lbl">Photo</span>'
  h += '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;">'
  // Aperçu photo
  h += '<div style="width:80px;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--surface-raised);border:1px solid var(--border);flex-shrink:0;" id="photo-preview">'
  if (draft.photo) {
    h += '<img src="' + draft.photo + '" style="width:100%;height:100%;object-fit:cover;"/>'
  } else {
    h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:24px;">📷</div>'
  }
  h += '</div>'
  // Boutons
  h += '<div style="flex:1;">'
  h += '<button class="btn small" data-action="paste-photo" style="width:100%;margin-bottom:6px;">📋 Coller photo</button>'
  h += '<input type="file" id="f-photo" accept="image/*" style="cursor:pointer;width:100%;"/>'
  h += '</div>'
  h += '</div>'
  h += '</label>'

  h += '<label class="field"><span class="lbl">Portion type</span><input id="f-serving-size" value="' + esc(draft.serving_size || '') + '" placeholder="ex. 100g, 1 pomme, 1 verre"/></label>'

  h += '<label class="field"><span class="lbl">Calories (kcal)</span><input type="number" id="f-kcal" value="' + (draft.kcal || '') + '"/></label>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Protéines (g)</span><input type="number" id="f-protein" value="' + (draft.protein || '') + '"/></label>'
  h += '<label class="field"><span class="lbl">Glucides (g)</span><input type="number" id="f-carbs" value="' + (draft.carbs || '') + '"/></label>'
  h += '</div>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Lipides (g)</span><input type="number" id="f-fat" value="' + (draft.fat || '') + '"/></label>'
  h += '<label class="field"><span class="lbl">Fibres (g)</span><input type="number" id="f-fiber" value="' + (draft.fiber || '') + '"/></label>'
  h += '</div>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Sucres (g)</span><input type="number" id="f-sugar" value="' + (draft.sugar || '') + '"/></label>'
  h += '<label class="field"><span class="lbl">Sel (g)</span><input type="number" id="f-salt" value="' + (draft.salt || '') + '"/></label>'
  h += '</div>'

  h += '<button class="btn primary block" id="save-ing-btn" data-action="save-ing" data-id="' + (editId || '') + '">Enregistrer</button>'
  return h
}

function recipeForm(editId) {
  if (!state._draftRecipe || state._draftRecipe.__for !== editId) {
    const r = editId ? state.recipes.find(x => x.id === editId) : { name: '', servings: 4, items: [] }
    state._draftRecipe = {
      __for: editId,
      name: r.name,
      servings: r.servings,
      items: (r.items || []).map(i => ({ ingredient_id: i.ingredient_id, grams: i.grams }))
    }
  }

  const draft = state._draftRecipe

  let h = '<h2>' + (editId ? 'Modifier' : 'Nouvelle') + ' recette</h2>'
  h += '<label class="field"><span class="lbl">Nom</span><input id="rf-name" value="' + esc(draft.name) + '"/></label>'
  h += '<label class="field"><span class="lbl">Nombre de portions</span><input type="number" id="rf-servings" value="' + draft.servings + '" min="1"/></label>'
  h += '<span class="lbl" style="display:block;margin-bottom:6px;">Ingrédients</span>'

  if (state.ingredients.length === 0) {
    h += '<div class="empty">Ajoute d\'abord des ingrédients.</div>'
  } else {
    draft.items.forEach((it, idx) => {
      h += '<div class="ing-line">'
      h += '<select data-ridx="' + idx + '" data-field="ingredient_id">'
      state.ingredients.forEach(i => {
        h += '<option value="' + i.id + '" ' + (i.id === it.ingredient_id ? 'selected' : '') + '>' + esc(i.name) + '</option>'
      })
      h += '</select>'
      h += '<input type="number" placeholder="g" data-ridx="' + idx + '" data-field="grams" value="' + it.grams + '"/>'
      h += '<button class="icon-btn" data-action="rm-recipe-item" data-idx="' + idx + '">✕</button>'
      h += '</div>'
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

  h += '<button class="btn primary block" data-action="save-recipe" data-id="' + (editId || '') + '">Enregistrer la recette</button>'
  return h
}

function addLogForm() {
  let h = '<h2>Ajouter au journal</h2>'
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
      h += '<label class="field"><span class="lbl">Ingrédient</span><select id="log-ing">'
      state.ingredients.forEach(i => {
        h += '<option value="' + i.id + '">' + esc(i.name) + '</option>'
      })
      h += '</select></label>'
      h += '<label class="field"><span class="lbl">Quantité (g)</span><input type="number" id="log-grams" value="100"/></label>'
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
  h += '<label class="field"><span class="lbl">Âge</span><input type="number" id="p-age" value="' + p.age + '"/></label>'
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
  h += '<label class="field"><span class="lbl">Objectif</span><div class="segmented" id="p-goal">'
  ;[
    ['cut', 'Sèche'],
    ['maintain', 'Maintien'],
    ['bulk', 'Prise de masse']
  ].forEach(o => {
    h += '<button type="button" class="' + (p.goal === o[0] ? 'active' : '') + '" data-goal="' + o[0] + '">' + o[1] + '</button>'
  })
  h += '</div></label>'

  h += '<h3 style="margin-top:16px;margin-bottom:8px;font-size:14px;">Objectifs</h3>'
  h += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><input type="radio" id="p-auto" name="macro-mode" value="auto" style="width:auto;" ' + (!p.use_custom ? 'checked' : '') + '/> <span>Calculés automatiquement</span></label>'
  h += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><input type="radio" id="p-custom" name="macro-mode" value="custom" style="width:auto;" ' + (p.use_custom ? 'checked' : '') + '/> <span>Définis manuellement</span></label>'

  h += '<div id="custom-macros" style="display:' + (p.use_custom ? 'block' : 'none') + ';">'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Kcal</span><input type="number" id="c-kcal" value="' + p.custom_kcal + '"/></label>'
  h += '<label class="field"><span class="lbl">Protéines (g)</span><input type="number" id="c-protein" value="' + p.custom_protein + '"/></label>'
  h += '</div>'
  h += '<div class="row2">'
  h += '<label class="field"><span class="lbl">Glucides (g)</span><input type="number" id="c-carbs" value="' + p.custom_carbs + '"/></label>'
  h += '<label class="field"><span class="lbl">Lipides (g)</span><input type="number" id="c-fat" value="' + p.custom_fat + '"/></label>'
  h += '</div>'
  h += '</div>'

  h += '<button class="btn primary block" data-action="save-profile" style="margin-top:12px;">Enregistrer</button>'

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

function ingredientDetailModal(ingId) {
  const ing = state.ingredients.find(i => i.id === ingId)
  if (!ing) return ''

  let h = ''

  // Photo (carré arrondi très petit, centré)
  h += '<div style="width:80px;aspect-ratio:1;border-radius:10px;overflow:hidden;margin:0 auto 16px;background:var(--surface-raised);border:1px solid var(--border);">'
  if (ing.photo) {
    h += '<img src="' + ing.photo + '" style="width:100%;height:100%;object-fit:cover;"/>'
  } else {
    h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:28px;">🥘</div>'
  }
  h += '</div>'

  h += '<h2 style="margin:0 0 4px;">' + esc(ing.name) + '</h2>'

  // Serving size
  if (ing.serving_size) {
    h += '<div style="color:var(--text-muted);font-size:13px;margin-bottom:12px;font-weight:500;">Portion : ' + esc(ing.serving_size) + '</div>'
  }

  // Category + Brands
  if (ing.category) {
    h += '<div style="display:inline-block;padding:4px 10px;background:var(--protein);color:#221705;border-radius:6px;font-size:11px;font-weight:600;margin-bottom:12px;">' + esc(ing.category) + '</div>'
  }
  if (ing.brands && ing.brands.length > 0) {
    h += '<div style="color:var(--text-muted);font-size:12px;margin-bottom:16px;">' + ing.brands.join(', ') + '</div>'
  }

  // Macros en listing (style étiquette)
  h += '<div class="card" style="background:var(--surface-raised);padding:14px;margin-bottom:16px;">'
  h += '<div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">Valeurs nutritionnelles pour 100g / 100ml</div>'

  // Ligne principale : kcal
  h += '<div style="border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:10px;">'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;">'
  h += '<div style="font-size:13px;">Énergie</div>'
  h += '<div style="font-size:20px;font-weight:700;">' + round(ing.kcal) + ' <span style="font-size:13px;">kcal</span></div>'
  h += '</div></div>'

  // Macros principales
  h += '<div style="display:flex;flex-direction:column;gap:10px;">'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:13px;">Protéines</div><div style="font-weight:600;color:var(--protein);font-size:16px;">' + round(ing.protein) + ' <span style="font-size:12px;color:var(--text-muted);font-weight:400;">g</span></div></div>'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:13px;">Glucides</div><div style="font-weight:600;color:var(--carbs);font-size:16px;">' + round(ing.carbs) + ' <span style="font-size:12px;color:var(--text-muted);font-weight:400;">g</span></div></div>'
  h += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:13px;">Lipides</div><div style="font-weight:600;color:var(--fat);font-size:16px;">' + round(ing.fat) + ' <span style="font-size:12px;color:var(--text-muted);font-weight:400;">g</span></div></div>'

  // Détails supplémentaires
  if (ing.fiber || ing.sugar || ing.salt) {
    h += '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">'
    if (ing.fiber) h += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;"><div>Fibres</div><div style="font-weight:500;">' + round(ing.fiber) + ' g</div></div>'
    if (ing.sugar) h += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;"><div>Sucres</div><div style="font-weight:500;">' + round(ing.sugar) + ' g</div></div>'
    if (ing.salt) h += '<div style="display:flex;justify-content:space-between;font-size:12px;"><div>Sel</div><div style="font-weight:500;">' + round(ing.salt) + ' g</div></div>'
    h += '</div>'
  }

  h += '</div></div>'

  h += '<button class="btn primary block" data-action="edit-ing" data-id="' + ing.id + '">Modifier</button>'

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

  // Actions
  app.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.getAttribute('data-action')
      handleAction(action, el)
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
    { id: 'p-age', field: 'age', type: 'int' },
    { id: 'p-sex', field: 'sex', type: 'string' },
    { id: 'p-activity', field: 'activity', type: 'float' },
    { id: 'p-custom', field: 'use_custom', type: 'bool' },
    { id: 'c-kcal', field: 'custom_kcal', type: 'float' },
    { id: 'c-protein', field: 'custom_protein', type: 'float' },
    { id: 'c-carbs', field: 'custom_carbs', type: 'float' },
    { id: 'c-fat', field: 'custom_fat', type: 'float' }
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
    })
    customRadio.addEventListener('change', () => {
      state.profile.use_custom = true
      customMacrosDiv.style.display = 'block'
      saveProfile(state.profile)
    })
  }

  // Log type toggle
  app.querySelectorAll('[data-logtype]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.logType = btn.getAttribute('data-logtype')
      render()
    })
  })

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

  // Paste image support - attach to app so modal events are captured
  if (app && !app._pasteListenerAttached) {
    const handlePaste = (e) => {
      // Only process if we have a draft ingredient
      if (!state._draftIngredient) return

      const items = e.clipboardData?.items || []
      for (let item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) return

          const reader = new FileReader()
          reader.onload = () => {
            state._draftIngredient.photo = reader.result
            render()
            showToast('Photo collée ✓')
          }
          reader.readAsDataURL(file)
          return
        }
      }
    }

    app.addEventListener('paste', handlePaste)
    app._pasteListenerAttached = true
  }
}

function handleAction(action, el) {
  if (action === 'logout') {
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
  } else if (action === 'view-ing') {
    state.modal = { type: 'ing-detail', ingId: el.getAttribute('data-id') }
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
    render()
  } else if (action === 'paste-photo') {
    showToast('Colle une image (Ctrl+V)...')
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
  } else if (action === 'save-ing') {
    const editId = el.getAttribute('data-id')
    const name = document.getElementById('f-name').value.trim()
    if (!name) {
      showToast('Donne un nom à l\'ingrédient')
      return
    }

    const photoInput = document.getElementById('f-photo')
    let photo = state._draftIngredient?.photo || ''

    if (photoInput && photoInput.files.length > 0) {
      const file = photoInput.files[0]
      const reader = new FileReader()
      reader.onload = () => {
        photo = reader.result
        saveIngredientWithPhoto()
      }
      reader.readAsDataURL(file)
      return
    }

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
        serving_size: document.getElementById('f-serving-size').value.trim(),
        kcal: parseFloat(document.getElementById('f-kcal').value) || 0,
        protein: parseFloat(document.getElementById('f-protein').value) || 0,
        carbs: parseFloat(document.getElementById('f-carbs').value) || 0,
        fat: parseFloat(document.getElementById('f-fat').value) || 0,
        fiber: parseFloat(document.getElementById('f-fiber').value) || 0,
        sugar: parseFloat(document.getElementById('f-sugar').value) || 0,
        salt: parseFloat(document.getElementById('f-salt').value) || 0,
        brands: state._draftIngredient?.brands || [],
        photo: photo
      }
      if (editId) {
        state.ingredients = state.ingredients.map(i => (i.id === editId ? obj : i))
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
    render()
  } else if (action === 'add-recipe-item') {
    if (!state._draftRecipe) return
    const firstIng = state.ingredients[0]
    if (firstIng) {
      state._draftRecipe.items.push({ ingredient_id: firstIng.id, grams: 100 })
      render()
    }
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
    const servings = parseInt(document.getElementById('rf-servings').value) || 1
    const draft = state._draftRecipe
    const obj2 = {
      id: editId2 || uid(),
      name: name2,
      servings: servings,
      items: draft.items
    }
    if (editId2) {
      state.recipes = state.recipes.map(r => (r.id === editId2 ? obj2 : r))
    } else {
      state.recipes.push(obj2)
    }
    saveRecipe(obj2)
    state._draftRecipe = null
    state.modal = null
    render()
    showToast('Recette enregistrée')
  } else if (action === 'log-recipe-quick') {
    const rid2 = el.getAttribute('data-id')
    logRecipe(rid2, 1)
    showToast('Ajouté au journal')
  } else if (action === 'open-add-log') {
    state.logType = 'recipe'
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
    const grams = parseFloat(document.getElementById('log-grams').value) || 0
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
    p.age = parseInt(document.getElementById('p-age').value) || p.age
    p.sex = document.getElementById('p-sex').value
    p.activity = parseFloat(document.getElementById('p-activity').value)
    saveProfile(p)
    state.modal = null
    render()
    showToast('Profil enregistré')
  } else if (action === 'save-custom') {
    const p2 = state.profile
    p2.use_custom = document.getElementById('p-custom').checked
    p2.custom_kcal = parseFloat(document.getElementById('c-kcal').value) || 0
    p2.custom_protein = parseFloat(document.getElementById('c-protein').value) || 0
    p2.custom_carbs = parseFloat(document.getElementById('c-carbs').value) || 0
    p2.custom_fat = parseFloat(document.getElementById('c-fat').value) || 0
    saveProfile(p2)
    render()
    showToast('Objectifs enregistrés')
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
  } else if (action === 'close-modal' || action === 'close-modal-bg') {
    state.modal = null
    state._draftRecipe = null
    render()
  }
}

function logRecipe(recipeId, servings) {
  const r = state.recipes.find(x => x.id === recipeId)
  if (!r) return
  const m = recipeMacrosPerServing(r, state.ingredients)
  const entry = {
    id: uid(),
    log_date: todayStr(),
    person_id: state.currentPerson,
    kind: 'recipe',
    ref_id: r.id,
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
    log_date: todayStr(),
    person_id: state.currentPerson,
    kind: 'ingredient',
    ref_id: i.id,
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
    state.modal = null
    state._draftRecipe = null
    render()
  }
})

// Start app
init()
