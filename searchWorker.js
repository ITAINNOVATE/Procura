// searchWorker.js
// Web Worker dédié à la recherche dans la base documentaire de PROCURA

let knowledgeBase = [];
let isLoaded = false;
let isFailed = false;

// Identifiants des catégories "bailleurs"
const BAILLEURS_KEYWORDS = ['banque mondiale', 'world bank', 'bad', 'afdb', 'boad', 'bidc', 'afd', 'bailleur', 'isdb', 'bid'];

// Liste des mots vides (stop-words) en français à ignorer dans la recherche
const STOP_WORDS = new Set([
    'est', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'cest', 'les', 'des', 'que', 'qui', 'dans', 'pour', 'sur', 'avec', 'par', 'aux', 'une', 'comment', 'pourquoi', 'combien', 'mais', 'donc', 'car', 'du', 'de', 'la', 'le', 'un', 'nos', 'vos', 'leur', 'leurs'
]);

// Normalisation et tokenisation avancée
const normalize = (str, keepStopWords = false) => {
    if (!str) return [];
    const tokens = str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 1);
    
    if (keepStopWords) return tokens;
    return tokens.filter(w => !STOP_WORDS.has(w) && w.length > 2);
};

const CACHE_NAME = 'procura-kb-v2';

// Fonction de chargement avec mise en cache ultra-rapide (Cache API)
async function fetchPartWithCache(partNum) {
    const url = `knowledge_base_part_${partNum}.json`;
    if ('caches' in self) {
        try {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(url);
            if (cachedResponse) {
                console.log(`[Worker] ⚡ Chargement instantané depuis le cache local (Partie ${partNum})`);
                return await cachedResponse.json();
            }
            console.log(`[Worker] Téléchargement réseau de la partie ${partNum}...`);
            const response = await fetch(url);
            if (response.ok) {
                cache.put(url, response.clone()).catch(() => {});
            }
            return await response.json();
        } catch (e) {
            console.warn(`[Worker] Fallback fetch direct (Partie ${partNum}):`, e);
        }
    }
    const response = await fetch(url);
    return await response.json();
}

// Fonction de chargement de la base documentaire
async function loadKnowledgeBase() {
    try {
        console.log("[Worker] Vérification des métadonnées de la base documentaire...");
        const metaResponse = await fetch('knowledge_base_meta.json');
        if (!metaResponse.ok) throw new Error("knowledge_base_meta.json introuvable");
        const meta = await metaResponse.json();
        
        console.log(`[Worker] Chargement des ${meta.num_parts} parties de la base documentaire...`);
        
        const fetchPromises = [];
        for (let i = 1; i <= meta.num_parts; i++) {
            fetchPromises.push(fetchPartWithCache(i));
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
                categoryRaw: (chunk.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
                titleRawLower: (chunk.title || '').toLowerCase(),
                contentRawLower: (chunk.content || '').toLowerCase()
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

// Fonction de recherche améliorée (BM25 + RAG hybride + Filtrage intelligent)
function searchKnowledge(query, accessLevel, currentPlan, userCountry, limit = 6) {
    if (!isLoaded || !query) return "";

    const queryWords = normalize(query);
    const rawQueryWords = normalize(query, true);
    if (queryWords.length === 0) return "";

    // 1. Détections spécifiques (Récence & Acronymes)
    const recencyTerms = ['derniere', 'dernier', 'recent', 'recente', 'jour', 'edition', 'revision', 'nouveau', 'nouvelle'];
    const isRecencyQuery = rawQueryWords.some(w => recencyTerms.includes(w));

    // Mots spécifiques (acronymes ou termes rares hors mots généraux)
    const genericWords = ['marches', 'publics', 'passation', 'republique', 'decret', 'loi', 'code', 'reglement', 'procedures'];
    const specificTokens = queryWords.filter(w => w.length >= 3 && !genericWords.includes(w));

    // Recherche si des acronymes ou termes spécifiques de la question existent dans la base
    const missingSpecificTokens = [];
    specificTokens.forEach(token => {
        const foundInCorpus = knowledgeBase.some(item => 
            item.titleRawLower.includes(token) || item.contentRawLower.includes(token) || item.categoryRaw.includes(token)
        );
        if (!foundInCorpus) {
            missingSpecificTokens.push(token);
        }
    });

    // 2. Filtrer selon le plan d'accès
    let filteredBase = knowledgeBase.filter(item => {
        const cat = item.categoryRaw;

        const isBailleur = BAILLEURS_KEYWORDS.some(kw => cat.includes(kw));
        if (isBailleur && accessLevel && !accessLevel.allowBailleurs) return false;

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

    // 3. Calcul du score pour chaque document
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
                score += 150; // Boost si la question nomme le pays ou le bailleur
                categoryMatch = true;
            }

            // Title match
            let titleMatches = 0;
            item.titleNorm.forEach(w => {
                if (w === word) titleMatches += 30;
                else if (w.includes(word) || word.includes(w)) titleMatches += 10;
            });
            score += Math.min(titleMatches, 90);

            // Content match
            let contentMatches = 0;
            item.contentNorm.forEach(w => {
                if (w === word) contentMatches += 3;
                else if (w.includes(word)) contentMatches += 1;
            });
            score += Math.min(contentMatches, 40);
        });

        // Exact query substring match bonus
        const queryRawNorm = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (item.contentRawLower.includes(queryRawNorm)) {
            score += 120;
        }

        // Boost chronologique pour les révisions / éditions récentes (ex: 2025 vs 2023 vs 2018)
        if (isRecencyQuery) {
            const fullTextForYear = (item.chunk.title + ' ' + (item.chunk.source || '') + ' ' + (item.chunk.path || ''));
            const yearMatches = fullTextForYear.match(/\b(20[1-2][0-9])\b/g);
            if (yearMatches) {
                const maxYear = Math.max(...yearMatches.map(y => parseInt(y, 10)));
                if (maxYear >= 2025) {
                    score += 350;
                    if (item.titleRawLower.includes('regulations') || item.titleRawLower.includes('reglement') || item.titleRawLower.includes('revisions')) {
                        score += 200; // Extra boost for 2025 regulation summary files
                    }
                }
                else if (maxYear >= 2023) score += 150;
                else if (maxYear >= 2020) score += 80;
                else if (maxYear >= 2018) score += 20;
            }
        }

        // Boost pour l'intention conceptuelle / comparaison / carrousels pédagogiques
        const definitionTerms = ['difference', 'differentes', 'comparaison', 'distinction', 'versus', 'entre', 'explication', 'signifie', 'definition', 'definir', 'erreur', 'erreurs', 'risques'];
        const isDefinitionQuery = rawQueryWords.some(w => definitionTerms.includes(w)) || queryWords.includes('quoi') || queryWords.includes('comment');

        if (item.categoryRaw.includes('carrousel') || item.titleRawLower.includes('carrousel') || item.titleRawLower.includes('difference') || item.titleRawLower.includes('erreurs')) {
            score += 50;
            if (isDefinitionQuery) {
                score += 120;
            }
        }

        // Pénalité de croisement de pays
        const countries = ["benin", "niger", "congo", "cameroun", "centrafique", "centrafrique", "ivoire", "rci", "togo", "mali", "tchad", "burkina", "senegal", "gabon", "guinee", "rdc", "uemoa"];
        const queryHasCountry = queryWords.some(w => countries.includes(w));
        const chunkHasCountry = countries.some(c => item.categoryRaw.includes(c));

        if (queryHasCountry && chunkHasCountry && !categoryMatch) {
            score -= 200;
        }

        return { chunk: item.chunk, score };
    });

    // Seuil de score minimal : plus strict si un acronyme demandé est absent de la base
    let minScore = 15;
    if (missingSpecificTokens.length > 0) {
        minScore = 200; // Bloquer les faux positifs génériques sur "marchés publics" si l'acronyme précis n'existe pas
    }

    const results = scoredChunks
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(r => r.chunk);

    // 4. Formater le contexte transmis à l'IA
    let contextMarkdown = "\n\n<context>\nVoici des informations et règles issues des documents officiels. Utilise-les pour répondre avec précision :\n\n";

    if (missingSpecificTokens.length > 0) {
        contextMarkdown += `⚠️ REMARQUE IMPORTANTE : Le(s) terme(s) ou sigle(s) [${missingSpecificTokens.join(', ')}] ne figure(nt) pas dans les documents officiels de la base documentaire. Si la question concerne la gestion des marchés publics, précise que le sigle officiel de la gestion informatique des marchés publics est généralement le SIGMAP (Système d'Information et de Gestion des Marchés Publics).\n\n`;
    }

    if (results.length > 0) {
        results.forEach((chunk, index) => {
            contextMarkdown += `--- SOURCE ${index + 1} : ${chunk.title} [Catégorie: ${chunk.category}] (Fichier: ${chunk.source}) ---\n`;
            contextMarkdown += `${chunk.content}\n\n`;
        });
    } else {
        contextMarkdown += "Aucun document directement pertinent n'a été trouvé dans la base documentaire pour cette requête spécifique.\n\n";
    }

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
