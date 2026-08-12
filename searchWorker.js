// searchWorker.js
// Web Worker dédié à la recherche dans la base documentaire de PROCURA

let knowledgeBase = [];
let isLoaded = false;
let isFailed = false;

// Identifiants des catégories "bailleurs"
const BAILLEURS_KEYWORDS = ['banque mondiale', 'world bank', 'bad', 'afdb', 'boad', 'bidc', 'afd', 'bailleur', 'isdb', 'bid'];

// Normalisation et tokenisation simple
const normalize = (str) => {
    if (!str) return [];
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2);
};

// Fonction de chargement de la base documentaire
async function loadKnowledgeBase() {
    try {
        console.log("[Worker] Téléchargement des métadonnées de la base documentaire...");
        const metaResponse = await fetch('knowledge_base_meta.json');
        if (!metaResponse.ok) throw new Error("knowledge_base_meta.json introuvable");
        const meta = await metaResponse.json();
        
        console.log(`[Worker] Métadonnées chargées. Téléchargement des ${meta.num_parts} parties en parallèle...`);
        
        const fetchPromises = [];
        for (let i = 1; i <= meta.num_parts; i++) {
            fetchPromises.push(fetch(`knowledge_base_part_${i}.json`).then(res => res.json()));
        }
        
        const parts = await Promise.all(fetchPromises);
        const rawBase = parts.flat();
        
        console.log(`[Worker] Base chargée (${rawBase.length} chunks). Pré-indexation en cours...`);
        
        // Pré-indexation : on normalise les contenus une seule fois
        knowledgeBase = rawBase.map(chunk => {
            return {
                chunk: chunk,
                contentNorm: normalize(chunk.content || ""),
                titleNorm: normalize(chunk.title || ""),
                categoryNorm: normalize(chunk.category || ""),
                categoryRaw: (chunk.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            };
        });
        
        isLoaded = true;
        console.log("[Worker] Pré-indexation terminée ! Prêt pour la recherche.");
        postMessage({ type: 'STATUS', status: 'READY' });

    } catch (err) {
        console.error("[Worker] Erreur lors du chargement:", err);
        isFailed = true;
        postMessage({ type: 'STATUS', status: 'FAILED' });
    }
}

// Fonction de recherche améliorée (style BM25)
function searchKnowledge(query, accessLevel, currentPlan, userCountry, limit = 4) {
    if (!isLoaded || !query) return "";

    const queryWords = normalize(query);
    if (queryWords.length === 0) return "";

    // 1. Filtrer selon le plan d'accès
    let filteredBase = knowledgeBase.filter(item => {
        const cat = item.categoryRaw;

        const isBailleur = BAILLEURS_KEYWORDS.some(kw => cat.includes(kw));
        if (isBailleur && !accessLevel.allowBailleurs) return false;

        if (currentPlan === 'daily' && userCountry) {
            const countryList = ['benin', 'togo', 'niger', 'burkina', 'senegal', 'mali', 'guinee', 'congo', 'cameroun', 'gabon', 'rdc', 'tchad', 'centrafique', 'ivoire', 'uemoa'];
            const chunkHasCountry = countryList.some(c => cat.includes(c));
            if (chunkHasCountry) {
                const matchesUserCountry = cat.includes(userCountry) ||
                    (userCountry.includes('benin') && cat.includes('benin')) ||
                    (userCountry.includes('togo') && cat.includes('togo')) ||
                    (userCountry.includes('ivoire') && (cat.includes('ivoire') || cat.includes('rci')));
                if (!matchesUserCountry) return false;
            }
        }
        return true;
    });

    // 2. Calcul du score pour chaque document (RAG intelligent)
    const scoredChunks = filteredBase.map(item => {
        let score = 0;
        let categoryMatch = false;

        queryWords.forEach(word => {
            let matchesCategory = false;
            if (item.categoryNorm.includes(word)) {
                matchesCategory = true;
            } else if (word === "centrafrique" && item.categoryNorm.includes("centrafique")) {
                matchesCategory = true;
            } else if ((word === "ivoire" || word === "rci") && (item.categoryNorm.includes("ivoire") || item.categoryNorm.includes("rci"))) {
                matchesCategory = true;
            }

            if (matchesCategory) {
                score += 150; // Boost massif si la question nomme le pays ou bailleur
                categoryMatch = true;
            }

            // Title match (poids très fort)
            let titleMatches = 0;
            item.titleNorm.forEach(w => {
                if (w === word) titleMatches += 20; // Mot exact dans le titre
                else if (w.includes(word) || word.includes(w)) titleMatches += 5; // Sous-chaîne
            });
            score += Math.min(titleMatches, 60);

            // Content match
            let contentMatches = 0;
            item.contentNorm.forEach(w => {
                if (w === word) contentMatches += 2; // Mot exact
                else if (w.includes(word)) contentMatches += 0.5;
            });
            score += Math.min(contentMatches, 30);
        });

        // Boost de proximité ou de phrase exacte (si la requête complète apparait)
        const queryRawNorm = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const contentRawNorm = (item.chunk.content || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (contentRawNorm.includes(queryRawNorm)) {
            score += 100;
        }

        // Pénalité pays
        const countries = ["benin", "niger", "congo", "cameroun", "centrafique", "centrafrique", "ivoire", "rci", "togo", "mali", "tchad", "burkina", "senegal", "gabon", "guinee", "rdc", "uemoa"];
        const queryHasCountry = queryWords.some(w => countries.includes(w));
        const chunkHasCountry = countries.some(c => item.categoryRaw.includes(c));

        if (queryHasCountry && chunkHasCountry && !categoryMatch) {
            score -= 200; // Forte pénalité si le chunk parle d'un autre pays que celui demandé
        }

        return { chunk: item.chunk, score };
    });

    // 3. Trier et garder les meilleurs résultats
    const results = scoredChunks
        .filter(r => r.score > 10) // Ignorer les faux positifs faibles
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(r => r.chunk);

    if (results.length === 0) return "";

    // 4. Formater le contexte
    let contextMarkdown = "\n\n<context>\nVoici des informations et règles issues des documents officiels. Utilise-les pour répondre avec précision :\n\n";
    results.forEach((chunk, index) => {
        contextMarkdown += `--- SOURCE ${index + 1} : ${chunk.title} [Catégorie: ${chunk.category}] (Fichier: ${chunk.source}) ---\n`;
        contextMarkdown += `${chunk.content}\n\n`;
    });
    contextMarkdown += "</context>";

    return contextMarkdown;
}

// Initialisation dès le lancement du worker
loadKnowledgeBase();

// Écoute des requêtes depuis le fil principal
self.addEventListener('message', async (e) => {
    const { type, query, accessLevel, currentPlan, userCountry, queryId } = e.data;
    
    if (type === 'SEARCH') {
        if (!isLoaded && !isFailed) {
            // Attendre un peu si pas encore chargé
            let retries = 0;
            while (!isLoaded && !isFailed && retries < 20) { // Max 10s d'attente
                await new Promise(r => setTimeout(r, 500));
                retries++;
            }
        }
        
        const result = searchKnowledge(query, accessLevel, currentPlan, userCountry);
        postMessage({ type: 'SEARCH_RESULT', queryId, result });
    }
});
