// Browser fallback for pages that permit cross-origin reads. The Python API is primary.
const text = value => {
  if (value && typeof value === 'object') value = value.text || value.name || ''
  const element = document.createElement('div')
  element.innerHTML = String(value || '')
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

function walk(value, output = []) {
  if (Array.isArray(value)) value.forEach(item => walk(item, output))
  else if (value && typeof value === 'object') {
    const type = value['@type']
    if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) output.push(value)
    Object.values(value).forEach(item => walk(item, output))
  }
  return output
}

function steps(value) {
  if (typeof value === 'string') return value.split(/\n+/).map(text).filter(Boolean)
  if (!Array.isArray(value)) return value ? [text(value)].filter(Boolean) : []
  return value.flatMap(item => item?.itemListElement ? steps(item.itemListElement) : [text(item)]).filter(Boolean)
}

function splitIngredient(value) {
  const line = text(value)
  const match = line.match(/^((?:\d+[\s-]+)?(?:\d+\s*\/\s*\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(?:\s*(?:cups?|tbsp|tsp|oz|ounces?|lbs?|pounds?|g|kg|ml|l|cloves?|cans?))?\b)\s*(.*)$/i)
  return match && match[2] ? [match[1], match[2]] : ['', line]
}

function formatDuration(value) {
  const match = String(value || '').match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?$/i)
  if (!match) return text(value) || 'Time not listed'
  return [match[1] && `${Number(match[1])} hr`, match[2] && `${Number(match[2])} min`].filter(Boolean).join(' ')
}

export function parseRecipeHtml(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const recipes = [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap(script => {
    try { return walk(JSON.parse(script.textContent)) } catch { return [] }
  })
  const recipe = recipes.sort((a, b) => (b.recipeIngredient?.length || 0) - (a.recipeIngredient?.length || 0))[0]
  if (!recipe) throw new Error('No structured recipe was found on that page.')
  const instructionList = steps(recipe.recipeInstructions)
  const ingredients = (recipe.recipeIngredient || []).map(splitIngredient)
  if (!text(recipe.name) || !instructionList.length || !ingredients.length) throw new Error("The page's recipe data is incomplete.")
  const url = new URL(pageUrl)
  const source = url.hostname.replace(/^www\./, '')
  const image = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image
  const imageValue = typeof image === 'object' ? image.url || image.contentUrl : image
  const yieldMatch = text(recipe.recipeYield).match(/\d+/)
  return { title: text(recipe.name), source, sourceLabel: text(recipe.publisher) || source,
    time: formatDuration(recipe.totalTime || recipe.cookTime || recipe.prepTime),
    servings: yieldMatch ? Number(yieldMatch[0]) : 4,
    image: imageValue ? new URL(imageValue, pageUrl).href : '', ingredients, steps: instructionList, url: pageUrl }
}

export async function parseInBrowser(url) {
  const response = await fetch(url, { headers: { Accept: 'text/html' } })
  if (!response.ok) throw new Error('The recipe page could not be downloaded.')
  return parseRecipeHtml(await response.text(), response.url || url)
}
