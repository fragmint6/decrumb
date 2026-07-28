const $ = (id) => document.getElementById(id);

const API = "https://decrumb.onrender.com";

const form = $("form");
const urlInput = $("url");
const goBtn = $("go");
const statusBox = $("status");
const recipeEl = $("recipe");
const themeToggle = $("theme-toggle");
const signInBtn = $("sign-in-btn");
const savedBtn = $("saved-btn");
const savedCount = $("saved-count");
const signOutBtn = $("sign-out-btn");
const authModal = $("auth-modal");
const authClose = $("auth-close");
const authForm = $("auth-form");
const authSubmit = $("auth-submit");
const authToggleMode = $("auth-toggle-mode");
const authError = $("auth-error");
const authHeading = $("auth-heading");
const authSubheading = $("auth-subheading");
const authEmail = $("auth-email");
const authPassword = $("auth-password");
const authGoogle = $("auth-google");
const savedPopup = $("saved-popup");
const savedList = $("saved-list");
const savedEmpty = $("saved-empty");
const savedClose = $("saved-close");
const saveRecipeBtn = $("save-recipe-btn");

const firebaseConfig = {
  apiKey: "AIzaSyAM87IEWBd2WkgeOBDyMguv3ZyP7pr5NqY",
  authDomain: "decrumb.firebaseapp.com",
  projectId: "decrumb",
  storageBucket: "decrumb.firebasestorage.app",
  messagingSenderId: "1096984784056",
  appId: "1:1096984784056:web:e699fe93ae3b94662bd84d",
  measurementId: "G-C8N9SBZN07"
};

let current = null;
let scale = 1;
let baseServings = null;
let isSigningUp = true;
let pendingSaveUrl = null;
let savedRecipesCache = null;

/* ---------------- firebase ---------------- */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ---------------- theme ---------------- */

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  setTheme(cur === "dark" ? "light" : "dark");
}

function initTheme() {
  setTheme(localStorage.getItem("theme") || "light");
}

initTheme();
themeToggle.addEventListener("click", toggleTheme);

/* ---------------- auth state ---------------- */

function updateNavbar(user) {
  if (user) {
    signInBtn.hidden = true;
    signOutBtn.hidden = false;
    savedBtn.hidden = false;
    loadSavedCount();
  } else {
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
    savedBtn.hidden = true;
    savedCount.hidden = true;
  }
}

auth.onAuthStateChanged((user) => {
  updateNavbar(user);
  if (user && pendingSaveUrl) {
    saveRecipe(user);
    pendingSaveUrl = null;
  }
});

signInBtn.addEventListener("click", () => openAuthModal("Sign in to Decrumb", "Sign in to save and manage your recipes."));
signOutBtn.addEventListener("click", () => auth.signOut());

function openAuthModal(heading, subheading) {
  authHeading.textContent = heading;
  authSubheading.textContent = subheading;
  authModal.hidden = false;
  resetAuthForm();
}

function closeAuthModal() {
  authModal.hidden = true;
}

authClose.addEventListener("click", closeAuthModal);
authModal.querySelector(".modal-backdrop").addEventListener("click", closeAuthModal);

function resetAuthForm() {
  authError.hidden = true;
  authError.textContent = "";
  authForm.reset();
  isSigningUp = true;
  authSubmit.textContent = "Create account";
  authToggleMode.textContent = "Already have an account? Sign in";
}

authToggleMode.addEventListener("click", () => {
  isSigningUp = !isSigningUp;
  authSubmit.textContent = isSigningUp ? "Create account" : "Sign in";
  authToggleMode.textContent = isSigningUp ? "Already have an account? Sign in" : "Need an account? Sign up";
  authError.hidden = true;
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;
  authSubmit.disabled = true;
  try {
    if (isSigningUp) {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    closeAuthModal();
  } catch (err) {
    authError.textContent = err.message;
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
  }
});

authGoogle.addEventListener("click", async () => {
  authError.hidden = true;
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    closeAuthModal();
  } catch (err) {
    authError.textContent = err.message;
    authError.hidden = false;
  }
});

/* ---------------- save recipe ---------------- */

saveRecipeBtn.addEventListener("click", async () => {
  if (!current) return;
  const user = auth.currentUser;
  if (!user) {
    pendingSaveUrl = current.url;
    openAuthModal("Save this recipe", "Sign in or create a free account to save recipes.");
    return;
  }
  await saveRecipe(user);
});

async function saveRecipe(user) {
  const recipeId = hashString(current.url || "");
  const recipeData = {
    title: current.title || "",
    url: current.url || "",
    author: current.author || "",
    description: current.description || "",
    ingredient_groups: current.ingredient_groups || [],
    instruction_groups: current.instruction_groups || [],
    image: current.image || "",
    total_time: current.total_time || null,
    prep_time: current.prep_time || null,
    cook_time: current.cook_time || null,
    yields: current.yields || "",
    category: current.category || "",
    cuisine: current.cuisine || "",
    ratings: current.ratings || null,
    host: current.host || "",
    savedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const token = await user.getIdToken();
    const res = await fetch(API + "/api/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ recipeId, recipeData })
    });
    if (!res.ok) throw new Error("Failed to save");
    showToast("Recipe saved ✓");
    updateSaveButton(true);
    savedRecipesCache = null;
    if (auth.currentUser) loadSavedCount();
  } catch (err) {
    showToast("Could not save recipe.");
  }
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function updateSaveButton(saved) {
  const icon = saveRecipeBtn.querySelector("i");
  const label = saveRecipeBtn.querySelector(".icon-btn-label");
  if (saved) {
    icon.className = "fa-solid fa-bookmark";
    saveRecipeBtn.classList.add("saved");
    if (label) label.textContent = "Saved";
  } else {
    icon.className = "fa-regular fa-bookmark";
    saveRecipeBtn.classList.remove("saved");
    if (label) label.textContent = "Save";
  }
}

/* ---------------- saved recipes popup ---------------- */

savedBtn.addEventListener("click", () => {
  loadSavedRecipes();
  savedPopup.hidden = false;
});

savedClose.addEventListener("click", closeSavedPopup);
savedPopup.querySelector(".popup-backdrop").addEventListener("click", closeSavedPopup);

function closeSavedPopup() {
  savedPopup.hidden = true;
}

async function loadSavedRecipes() {
  const user = auth.currentUser;
  if (!user) return;

  if (!savedRecipesCache) {
    savedList.innerHTML = "";
    savedList.style.display = "";
    for (let i = 0; i < 5; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton-item";
      sk.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-host"></div>';
      savedList.appendChild(sk);
    }
    savedEmpty.hidden = true;
  } else {
    renderSavedRecipes(savedRecipesCache);
  }

  try {
    const token = await user.getIdToken();
    const res = await fetch(API + "/api/saved", {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) return;
    const recipes = await res.json();
    savedRecipesCache = recipes;
    renderSavedRecipes(recipes);
  } catch (err) {
    if (!savedRecipesCache) {
      savedList.innerHTML = "";
      savedEmpty.hidden = false;
    }
  }
}

function renderSavedRecipes(recipes) {
  savedList.innerHTML = "";
  if (!recipes.length) {
    savedList.style.display = "none";
    savedEmpty.hidden = false;
    return;
  }
  savedList.style.display = "";
  savedEmpty.hidden = true;
  recipes.forEach((r) => {
    const item = document.createElement("div");
    item.className = "saved-item";
    const img = document.createElement("img");
    img.className = "saved-item-img";
    img.src = r.data && r.data.image ? r.data.image : "";
    img.alt = "";
    img.loading = "lazy";
    item.appendChild(img);
    const body = document.createElement("div");
    body.className = "saved-item-body";
    const title = document.createElement("span");
    title.className = "saved-item-title";
    title.textContent = r.data && r.data.title ? r.data.title : "Untitled recipe";
    body.appendChild(title);
    const src = document.createElement("span");
    src.className = "saved-item-host";
    src.textContent = r.data && r.data.host ? r.data.host : "";
    body.appendChild(src);
    item.appendChild(body);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "saved-item-del";
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRecipe(auth.currentUser.uid, r.id);
    });
    item.appendChild(del);
    item.addEventListener("click", () => {
      if (r.data && r.data.url) {
        closeSavedPopup();
        urlInput.value = r.data.url;
        form.requestSubmit();
      }
    });
    savedList.appendChild(item);
  });
}

async function deleteRecipe(uid, recipeId) {
  if (!(await showConfirm("Remove this recipe from your saved recipes?"))) return;
  try {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(API + "/api/save/" + encodeURIComponent(recipeId), {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) throw new Error("Delete failed");
    showToast("Recipe removed.");
    savedRecipesCache = null;
    loadSavedRecipes();
    if (auth.currentUser) loadSavedCount();
    updateSaveButton(false);
  } catch (err) {
    showToast("Could not remove recipe.");
  }
}

async function loadSavedCount() {
  if (savedRecipesCache) {
    savedCount.textContent = savedRecipesCache.length;
    savedCount.hidden = savedRecipesCache.length === 0;
    return;
  }
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(API + "/api/saved", {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) return;
    const recipes = await res.json();
    savedRecipesCache = recipes;
    savedCount.textContent = recipes.length;
    savedCount.hidden = recipes.length === 0;
  } catch (err) {
    // silently fail
  }
}

/* ---------------- toast ---------------- */

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/* ---------------- networking ---------------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  setStatus("Fetching and crumbling", "loading");
  recipeEl.hidden = true;
  goBtn.disabled = true;
  updateSaveButton(false);

    try {
    const res = await fetch(API + "/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    current = data;
    scale = 1;
    baseServings = parseYield(data.yields);
    render(data);
    setStatus(null);
    history.replaceState(null, "", "?url=" + encodeURIComponent(url));
    pendingSaveUrl = null;
    const user = auth.currentUser;
    if (user) {
      const recipeId = hashString(data.url || "");
      const cacheHit = savedRecipesCache && savedRecipesCache.some((r) => r.id === recipeId);
      if (savedRecipesCache) {
        updateSaveButton(cacheHit);
      } else {
        try {
          const token = await user.getIdToken();
          const res2 = await fetch(API + "/api/saved", {
            headers: { "Authorization": "Bearer " + token }
          });
          if (res2.ok) {
            const recipes = await res2.json();
            savedRecipesCache = recipes;
            updateSaveButton(recipes.some((r) => r.id === recipeId));
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    goBtn.disabled = false;
  }
});

/* ---------------- status ---------------- */

function setStatus(msg, kind) {
  if (!msg) { statusBox.hidden = true; return; }
  statusBox.hidden = false;
  statusBox.className = "status" + (kind === "error" ? " error" : "");
  statusBox.innerHTML = kind === "loading"
    ? `<span class="dots">${escapeHtml(msg)}</span>`
    : escapeHtml(msg);
}

/* ---------------- rendering ---------------- */

function render(r) {
  $("r-title").textContent = r.title || "Untitled recipe";

  const bits = [];
  if (r.author) bits.push("By " + r.author);
  if (r.host) bits.push(r.host);
  if (r.ratings) {
    bits.push(`★ ${Number(r.ratings).toFixed(1)}` +
      (r.ratings_count ? ` (${r.ratings_count})` : ""));
  }
  $("r-byline").textContent = bits.join(" · ");

  const desc = $("r-desc");
  desc.textContent = trim(r.description, 320);
  desc.hidden = !r.description;

  const meta = $("r-meta");
  meta.innerHTML = "";
  addMeta(meta, "Prep", minutes(r.prep_time));
  addMeta(meta, "Cook", minutes(r.cook_time));
  addMeta(meta, "Total", minutes(r.total_time));
  addMeta(meta, "Yield", r.yields);
  addMeta(meta, "Course", r.category);
  addMeta(meta, "Cuisine", r.cuisine);

  const img = $("r-image");
  if (r.image) { img.src = r.image; img.hidden = false; img.alt = r.title || ""; }
  else { img.hidden = true; img.removeAttribute("src"); }

  const src = $("r-source");
  src.href = r.url;

  renderIngredients(r);
  renderSteps(r);
  renderNutrition(r);

  recipeEl.hidden = false;
  updateServingsBtn();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderIngredients(r) {
  const host = $("r-ingredients");
  host.innerHTML = "";
  (r.ingredient_groups || []).forEach((g) => {
    if (g.heading) host.appendChild(el("h3", "group-heading", g.heading));
    const ul = el("ul", "ing");
    g.items.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = scaleText(item, scale);
      li.addEventListener("click", () => li.classList.toggle("done"));
      ul.appendChild(li);
    });
    host.appendChild(ul);
  });
  if (!host.children.length) host.appendChild(el("p", "byline", "No ingredients found."));
}

function renderSteps(r) {
  const host = $("r-steps");
  host.innerHTML = "";
  (r.instruction_groups || []).forEach((g) => {
    if (g.heading) host.appendChild(el("h3", "group-heading", g.heading));
    const ol = el("ol", "steps");
    g.steps.forEach((s) => {
      const li = el("li", "", s);
      li.addEventListener("click", () => li.classList.toggle("done"));
      ol.appendChild(li);
    });
    host.appendChild(ol);
  });
  if (!host.children.length) host.appendChild(el("p", "byline", "No method found."));
}

function renderNutrition(r) {
  const wrap = $("r-nutrition-wrap");
  const list = $("r-nutrition");
  list.innerHTML = "";
  const n = r.nutrients || {};
  const keys = Object.keys(n);
  if (!keys.length) { wrap.hidden = true; return; }
  keys.forEach((k) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(humanise(k))}</span><b>${escapeHtml(String(n[k]))}</b>`;
    list.appendChild(li);
  });
  wrap.hidden = false;
}

/* ---------------- toolbar ---------------- */

document.querySelector(".toolbar").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === "print") window.print();

  if (act === "share") {
    if (navigator.share) {
      navigator.share({ title: document.title, url: location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(location.href).then(() => {
        showToast("Link copied ✓");
      });
    }
  }

  if (act === "servings-up" || act === "servings-down") {
    const mults = [0.5, 1, 2, 3];
    const idx = mults.indexOf(scale);
    if (act === "servings-up") {
      scale = mults[(idx + 1) % mults.length];
    } else {
      scale = mults[(idx - 1 + mults.length) % mults.length];
    }
    updateServingsBtn();
    renderIngredients(current);
  }

  if (act === "copy") {
    navigator.clipboard.writeText(asPlainText(current)).then(() => {
      const old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = old), 1400);
    });
  }
});

function asPlainText(r) {
  const out = [r.title || "Recipe", r.url, ""];
  if (r.yields) out.push("Yield: " + r.yields);
  if (r.total_time) out.push("Total time: " + minutes(r.total_time));
  out.push("", "INGREDIENTS");
  (r.ingredient_groups || []).forEach((g) => {
    if (g.heading) out.push("", g.heading);
    g.items.forEach((i) => out.push("- " + stripTags(scaleText(i, scale))));
  });
  out.push("", "METHOD");
  let n = 1;
  (r.instruction_groups || []).forEach((g) => {
    if (g.heading) out.push("", g.heading);
    g.steps.forEach((s) => out.push(`${n++}. ${s}`));
  });
  return out.join("\n");
}

/* ---------------- ingredient scaling ---------------- */

const VULGAR = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
  "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

const QTY = /(\d+\s+\d+\/\d+|\d+\/\d+|\d*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:[.,]\d+)?)/g;

function parseQty(token) {
  token = token.trim();
  let total = 0;
  const vul = token.match(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/);
  if (vul) {
    const lead = token.replace(vul[0], "").trim();
    if (lead) total += parseFloat(lead) || 0;
    return total + VULGAR[vul[0]];
  }
  const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  return parseFloat(token.replace(",", ".")) || 0;
}

function fmtQty(v) {
  if (!isFinite(v) || v <= 0) return "";
  const whole = Math.floor(v + 1e-9);
  const rest = v - whole;
  const table = [[0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.375, "⅜"], [0.5, "½"],
                 [0.625, "⅝"], [2 / 3, "⅔"], [0.75, "¾"], [0.875, "⅞"]];
  for (const [val, glyph] of table) {
    if (Math.abs(rest - val) < 0.02) return (whole ? whole + " " : "") + glyph;
  }
  if (rest < 0.02) return String(whole);
  return String(Math.round(v * 100) / 100);
}

function scaleText(text, factor) {
  const safe = escapeHtml(text);
  return safe.replace(QTY, (m) => {
    const n = parseQty(m);
    if (!n) return m;
    const out = factor === 1 ? m.trim() : fmtQty(n * factor);
    return `<span class="qty">${out || m}</span>`;
  });
}

/* ---------------- helpers ---------------- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function addMeta(host, label, value) {
  if (!value) return;
  const li = document.createElement("li");
  li.innerHTML = `${escapeHtml(label)} <b>${escapeHtml(String(value))}</b>`;
  host.appendChild(li);
}

function minutes(m) {
  if (!m) return "";
  const n = Number(m);
  if (!isFinite(n) || n <= 0) return "";
  if (n < 60) return n + " min";
  const h = Math.floor(n / 60), r = n % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function humanise(k) {
  return String(k).replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

function trim(s, n) {
  if (!s) return "";
  s = String(s).trim();
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s;
}

function parseYield(y) {
  if (!y) return null;
  const m = String(y).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function updateServingsBtn() {
  const label = document.querySelector("[data-servings-label]");
  if (!label) return;
  if (baseServings) {
    const v = baseServings * scale;
    const valSpan = label.querySelector("[data-servings-value]");
    if (valSpan) valSpan.textContent = fmtQty(v);
    else label.textContent = "Serves " + fmtQty(v);
  } else {
    const valSpan = label.querySelector("[data-servings-value]");
    if (valSpan) valSpan.textContent = "?";
    else label.textContent = "Serves ?";
  }
}

function setupEditableServings() {
  const valSpan = document.querySelector("[data-servings-value]");
  if (!valSpan) return;
  valSpan.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      valSpan.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      const v = baseServings ? baseServings * scale : 0;
      valSpan.textContent = v ? fmtQty(v) : "?";
      valSpan.blur();
    }
  });
  valSpan.addEventListener("blur", () => {
    const val = parseFloat(valSpan.textContent);
    if (val && val > 0 && baseServings) {
      scale = val / baseServings;
      updateServingsBtn();
      renderIngredients(current);
    } else {
      updateServingsBtn();
    }
  });
  valSpan.addEventListener("focus", () => {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(valSpan);
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

function showConfirm(msg) {
  return new Promise(function (resolve) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="modal-backdrop"></div><div class="modal-content" style="text-align:center;max-width:400px"><p style="margin:0 0 var(--space-lg);font:0.95rem system-ui,sans-serif;line-height:1.5">' +
      escapeHtml(msg) +
      '</p><div style="display:flex;gap:0.75rem;justify-content:center"><button class="btn-primary" data-confirm-yes>Remove</button><button class="btn-primary" data-confirm-no style="background:var(--bg);color:var(--text);border:1px solid var(--border)">Cancel</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector("[data-confirm-yes]").onclick = function () { overlay.remove(); resolve(true); };
    overlay.querySelector("[data-confirm-no]").onclick = function () { overlay.remove(); resolve(false); };
    overlay.querySelector(".modal-backdrop").onclick = function () { overlay.remove(); resolve(false); };
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent;
}

setupEditableServings();

const preset = new URLSearchParams(location.search).get("url");
if (preset) {
  urlInput.value = preset;
  form.requestSubmit();
}