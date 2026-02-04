/**
 * Outil de recherche web pour Halimah Pro
 * Utilise Tavily API - optimisé pour les agents IA
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

/**
 * Recherche sur internet en temps réel
 * @param {string} query - La recherche à effectuer
 * @param {number} maxResults - Nombre max de résultats (1-10)
 */
export async function rechercheWeb({ query, maxResults = 5 }) {
  if (!TAVILY_API_KEY) {
    return {
      success: false,
      error: "Clé API Tavily non configurée. Ajoutez TAVILY_API_KEY dans .env"
    };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: 'advanced',
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      throw new Error(`Erreur API Tavily: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      answer: data.answer,
      results: data.results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content
      }))
    };

  } catch (error) {
    console.error('[RECHERCHE WEB] Erreur:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Recherche d'actualités récentes
 * @param {string} query - Le sujet à rechercher
 * @param {number} maxResults - Nombre max de résultats
 */
export async function rechercheActualites({ query, maxResults = 5 }) {
  if (!TAVILY_API_KEY) {
    return {
      success: false,
      error: "Clé API Tavily non configurée"
    };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: 'basic',
        topic: 'news',
        max_results: maxResults,
        include_answer: true
      })
    });

    if (!response.ok) {
      throw new Error(`Erreur API Tavily: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      answer: data.answer,
      articles: data.results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        published_date: r.published_date || null
      }))
    };

  } catch (error) {
    console.error('[RECHERCHE ACTU] Erreur:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Recherche d'informations sur un concurrent/entreprise
 * @param {string} name - Nom de l'entreprise
 * @param {string} location - Localisation (optionnel)
 */
export async function rechercheEntreprise({ name, location = '' }) {
  const query = location
    ? `${name} ${location} avis prix services`
    : `${name} avis prix services`;

  return await rechercheWeb({ query, maxResults: 5 });
}

/**
 * Recherche de tendances dans un domaine
 * @param {string} domain - Le domaine (ex: "coiffure afro", "beauté")
 * @param {string} year - Année (optionnel, défaut: année courante)
 */
export async function rechercheTendances({ domain, year = new Date().getFullYear() }) {
  const query = `tendances ${domain} ${year}`;
  return await rechercheWeb({ query, maxResults: 7 });
}
