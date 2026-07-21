import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, Check, ChevronDown, Clock3, ExternalLink, Link2, LoaderCircle, Play, Sparkles, Users, X } from 'lucide-react'
import './styles.css'
import { parseInBrowser } from './recipeParser.js'

const demoRecipes = {
  pasta: {
    title: 'Creamy garlic pasta',
    source: 'themodernproper.com',
    sourceLabel: 'The Modern Proper',
    time: '30 min',
    servings: 4,
    image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1100&q=85',
    ingredients: [
      ['12 oz', 'spaghetti'], ['4 tbsp', 'unsalted butter'], ['5 cloves', 'garlic, thinly sliced'],
      ['1 cup', 'heavy cream'], ['1 cup', 'finely grated Parmesan'], ['½ tsp', 'kosher salt'], ['¼ tsp', 'black pepper'], ['2 tbsp', 'fresh parsley, chopped']
    ],
    steps: ['Bring a large pot of salted water to a boil. Cook the spaghetti until al dente, then reserve ½ cup pasta water and drain.', 'Melt the butter in a large skillet over medium heat. Add the garlic and cook until fragrant, about 2 minutes.', 'Whisk in the cream and bring to a gentle simmer. Stir in the Parmesan until smooth.', 'Add the pasta and toss to coat, adding pasta water a splash at a time until glossy. Season and finish with parsley.']
  },
  chicken: {
    title: 'Sheet pan lemon chicken', source: 'food52.com', sourceLabel: 'Food52', time: '45 min', servings: 4,
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=1100&q=85',
    ingredients: [['4', 'boneless chicken thighs'], ['1 lb', 'baby potatoes, halved'], ['2 cups', 'broccoli florets'], ['2 tbsp', 'olive oil'], ['1', 'lemon, zested and juiced'], ['3 cloves', 'garlic, minced'], ['1 tsp', 'dried oregano'], ['½ tsp', 'salt']],
    steps: ['Heat oven to 425°F. Arrange the chicken, potatoes, and broccoli on a large sheet pan.', 'Whisk the oil, lemon zest, lemon juice, garlic, oregano, and salt. Pour over everything and toss.', 'Roast for 35–40 minutes, until the chicken is cooked through and the potatoes are golden. Rest for 5 minutes before serving.']
  }
}

function App() {
  const [url, setUrl] = useState('')
  const [recipe, setRecipe] = useState(null)
  const [status, setStatus] = useState('idle')
  const [servings, setServings] = useState(4)
  const [notice, setNotice] = useState('')

  async function parseUrl(event) {
    event?.preventDefault()
    const recipeUrl = url.trim()
    if (!recipeUrl) return setNotice('Paste a recipe link to get started.')
    try { new URL(recipeUrl) } catch { return setNotice('Enter a complete http or https recipe URL.') }
    setNotice('')
    setStatus('loading')
    try {
      let parsed
      try {
        const response = await fetch('/api/parse', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: recipeUrl })
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'The Python parser could not read this recipe.')
        parsed = body
      } catch (pythonError) {
        // A real JavaScript JSON-LD parser is the non-AI fallback. It works where the source permits CORS.
        try { parsed = await parseInBrowser(recipeUrl) }
        catch { throw pythonError }
      }
      setRecipe(parsed)
      setServings(parsed.servings)
      setStatus('done')
    } catch (error) {
      setStatus('idle')
      setNotice(error.message || 'We could not find a recipe at that URL.')
    }
  }

  function loadDemo(key) {
    setUrl(key === 'chicken' ? 'https://food52.com/recipes/sheet-pan-lemon-chicken' : 'https://themodernproper.com/creamy-garlic-pasta')
    setNotice('')
    setRecipe(null)
    setStatus('idle')
  }

  const scale = recipe ? servings / recipe.servings : 1
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark"><span /></span>decrumb</a>
      <nav><a href="#how">How it works</a><a href="#about">About</a></nav>
      <button className="ghost-button">Sign in <ArrowRight size={16} /></button>
    </header>

    <main id="top">
      {!recipe && <section className="hero">
        <div className="eyebrow"><Sparkles size={15} /> YOUR RECIPE, REFINED</div>
        <h1>Keep the good.<br /><em>Lose the crumb.</em></h1>
        <p className="hero-copy">Paste any recipe link and get straight to what matters: ingredients, steps, and a little more time around the table.</p>
        <form className="parse-form" onSubmit={parseUrl}>
          <Link2 size={19} className="input-icon" />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a recipe URL..." aria-label="Recipe URL" />
          <button className="parse-button" type="submit">{status === 'loading' ? <><LoaderCircle className="spin" size={18} /> Parsing</> : <>Parse recipe <ArrowRight size={18} /></>}</button>
        </form>
        {notice && <p className="notice"><X size={15} /> {notice}</p>}
        <p className="fine-print">Works with recipe pages across the web · No account needed</p>
        <div className="demo-row"><span>Try a demo</span><button onClick={() => loadDemo('pasta')}>Creamy garlic pasta <ExternalLink size={13} /></button><button onClick={() => loadDemo('chicken')}>Sheet pan chicken <ExternalLink size={13} /></button></div>
        <div className="hero-art"><div className="art-card back-card" /><div className="art-card main-card"><img src={demoRecipes.pasta.image} /><div className="floating-pill"><span className="pill-dot" /> Recipe parsed <Check size={14} /></div></div><div className="art-note">Less scrolling.<br /><strong>More cooking.</strong></div></div>
      </section>}

      {recipe && <RecipeView recipe={recipe} servings={servings} setServings={setServings} scale={scale} onReset={() => { setRecipe(null); setStatus('idle'); setUrl('') }} />}

      {!recipe && <section className="how" id="how"><div className="section-label">THE SIMPLE PART</div><h2>From page to plate<br />in a few seconds.</h2><div className="steps"><div><span>01</span><h3>Drop a link</h3><p>Find a recipe you love. We’ll handle the endless intro.</p></div><div><span>02</span><h3>We tidy it up</h3><p>Ingredients and instructions, neatly organized and ready to use.</p></div><div><span>03</span><h3>Get cooking</h3><p>Adjust servings and follow along without losing your place.</p></div></div></section>}
    </main>
    <footer id="about"><div className="brand"><span className="brand-mark"><span /></span>decrumb</div><span>Recipes, without the scroll.</span><span>Prototype · Built for curious cooks</span></footer>
  </div>
}

function RecipeView({ recipe, servings, setServings, scale, onReset }) {
  return <section className="recipe-page"><div className="recipe-toolbar"><button className="back-link" onClick={onReset}>← Parse another link</button><span className="parsed-badge"><Check size={14} /> Parsed successfully</span></div><div className="recipe-grid"><div className="recipe-intro"><div className="source-line"><span className="source-icon">{recipe.source[0].toUpperCase()}</span> From <strong>{recipe.sourceLabel}</strong> <ExternalLink size={13} /></div><h1>{recipe.title}</h1><p className="recipe-description">A clean, focused view of your recipe. No life story required.</p><div className="meta"><span><Clock3 size={17} /> {recipe.time}</span><span><Users size={17} /> {recipe.servings} servings</span></div><img className="recipe-image" src={recipe.image} alt={recipe.title} /></div><div className="recipe-content"><div className="content-heading"><h2>Ingredients <small>({recipe.ingredients.length})</small></h2><label>Servings <select value={servings} onChange={e => setServings(Number(e.target.value))}>{[2,3,4,5,6,8].map(n => <option key={n}>{n}</option>)}</select><ChevronDown size={14} /></label></div><ul className="ingredients">{recipe.ingredients.map(([amount, item], i) => <li key={i}><span className="check-box" /><strong>{scaleAmount(amount, scale)}</strong><span>{item}</span></li>)}</ul><div className="instructions-heading"><h2>Instructions <small>({recipe.steps.length} steps)</small></h2><button className="cook-button"><Play size={15} fill="currentColor" /> Cooking mode</button></div><ol className="instructions">{recipe.steps.map((step, i) => <li key={i}><span className="step-number">{String(i + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol></div></div></section>
}
function scaleAmount(amount, scale) { if (scale === 1) return amount; const match = amount.match(/^(\d+(?:\.\d+)?)(.*)$/); if (!match) return amount; const value = Number(match[1]) * scale; return `${Number.isInteger(value) ? value : value.toFixed(1).replace('.0','')}${match[2]}` }

createRoot(document.getElementById('root')).render(<App />)
