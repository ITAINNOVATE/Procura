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

const CACHE_NAME = 'procura-kb-v9';

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
function searchKnowledge(query, accessLevel, currentPlan, userCountry, limit = 10) {
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
            const countryList = ['benin', 'togo', 'niger', 'burkina', 'senegal', 'mali', 'guinee', 'congo', 'cameroun', 'gabon', 'rdc', 'tchad', 'centrafique', 'ivoire', 'mauritanie', 'uemoa'];
            const chunkHasCountry = countryList.some(c => cat.includes(c));
            if (chunkHasCountry) {
                const matchesUserCountry = cat.includes(userCountry) ||
                    (userCountry.includes('benin') && cat.includes('benin')) ||
                    (userCountry.includes('togo') && cat.includes('togo')) ||
                    (userCountry.includes('mauritanie') && cat.includes('mauritanie')) ||
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
                if (w === word) titleMatches += 40;
                else if (w.includes(word) || word.includes(w)) titleMatches += 15;
            });
            score += Math.min(titleMatches, 120);

            // Content match
            let contentMatches = 0;
            item.contentNorm.forEach(w => {
                if (w === word) contentMatches += 4;
                else if (w.includes(word)) contentMatches += 1;
            });
            score += Math.min(contentMatches, 50);
        });

        // Multi-word title match boost (e.g. "addendum" and "avenant" both in title)
        const titleMatchCount = queryWords.filter(w => item.titleRawLower.includes(w)).length;
        if (titleMatchCount >= 2) {
            score += titleMatchCount * 150;
        } else if (titleMatchCount === 1 && queryWords.length <= 3) {
            score += 100;
        }

        // Exact query substring match bonus
        const queryRawNorm = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (item.contentRawLower.includes(queryRawNorm)) {
            score += 150;
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
        const isDefinitionQuery = rawQueryWords.some(w => definitionTerms.includes(w)) || rawQueryWords.includes('quoi') || rawQueryWords.includes('comment') || rawQueryWords.includes('cest');

        const isCarrouselChunk = item.categoryRaw.includes('carrousel') || item.titleRawLower.includes('carrousel');
        const isOffTopicCarrousel = isCarrouselChunk && (
            item.titleRawLower.includes('cv') ||
            item.titleRawLower.includes('emploi') ||
            item.titleRawLower.includes('recrutement') ||
            item.titleRawLower.includes('entretien') ||
            item.titleRawLower.includes('lettre') ||
            item.titleRawLower.includes('linkedin') ||
            item.categoryRaw.includes('emploi') ||
            item.categoryRaw.includes('aide emploi')
        );

        if (isCarrouselChunk || item.titleRawLower.includes('difference') || item.titleRawLower.includes('erreurs')) {
            // Vérifier que le carrousel est réellement pertinent pour la question
            const carrouselRelevant = queryWords.some(w =>
                item.titleRawLower.includes(w) || item.contentRawLower.includes(w)
            );
            if (carrouselRelevant) {
                score += 150;
                if (isDefinitionQuery) {
                    score += 250;
                }
            } else if (isOffTopicCarrousel) {
                // Pénaliser les carrousels hors-sujet (CV, emploi) si la question n'est pas sur l'emploi
                score -= 100;
            }
        }

        // Boost pour l'intention Aide Emploi, CV et Recrutement
        const employmentTerms = ['emploi', 'recrutement', 'cv', 'entretien', 'lettre', 'motivation', 'embauche', 'salaries', 'contrat', 'travail', 'recruteur', 'poste', 'linkedin', 'rqth'];
        const isEmploymentQuery = rawQueryWords.some(w => employmentTerms.includes(w));

        if (item.categoryRaw.includes('emploi') || item.categoryRaw.includes('recrutement') || item.titleRawLower.includes('cv') || item.titleRawLower.includes('entretien')) {
            if (isEmploymentQuery) {
                score += 180;
            } else {
                // Pénaliser fortement les documents emploi/CV pour les questions non-emploi
                score -= 80;
            }
        }

        // Pénalité de croisement de pays
        const countries = ["benin", "niger", "congo", "cameroun", "centrafique", "centrafrique", "ivoire", "rci", "togo", "mali", "tchad", "burkina", "senegal", "gabon", "guinee", "mauritanie", "rdc", "uemoa"];
        const queryHasCountry = queryWords.some(w => countries.includes(w));
        const chunkHasCountry = countries.some(c => item.categoryRaw.includes(c));

        if (queryHasCountry && chunkHasCountry && !categoryMatch) {
            score -= 200;
        }

        return { chunk: item.chunk, score };
    });

    const minScore = 15;

    const results = scoredChunks
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(r => r.chunk);

    // 4. Formater le contexte transmis à l'IA
    let contextMarkdown = "\n\n<context>\nVoici des extraits documentaires et carrousels pertinents issus de la base officielle :\n\n";

    if (results.length > 0) {
        results.forEach((chunk, index) => {
            contextMarkdown += `--- DOCUMENT ${index + 1} : ${chunk.title} [Catégorie: ${chunk.category}] ---\n`;
            contextMarkdown += `${chunk.content}\n\n`;
        });
    }

    contextMarkdown += "</context>";

    return contextMarkdown;
}

// Helper pour pré-indexer un chunk
function indexChunkItem(chunk) {
    return {
        chunk: chunk,
        contentNorm: normalize(chunk.content || ""),
        titleNorm: normalize(chunk.title || ""),
        categoryNorm: normalize(chunk.category || ""),
        categoryRaw: (chunk.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        titleRawLower: (chunk.title || '').toLowerCase(),
        contentRawLower: (chunk.content || '').toLowerCase()
    };
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
    } else if (type === 'ADD_CHUNKS') {
        const newChunks = e.data.chunks || [];
        if (newChunks.length > 0) {
            const indexed = newChunks.map(indexChunkItem);
            knowledgeBase.unshift(...indexed);
            console.log(`[Worker] 📥 +${newChunks.length} nouveaux fragments (chunks RAG) indexés en direct ! Total base: ${knowledgeBase.length}`);
            postMessage({ type: 'CHUNKS_ADDED', count: newChunks.length, total: knowledgeBase.length });
        }
    } else if (type === 'REMOVE_DOC_CHUNKS') {
        const { docTitle, filename } = e.data;
        if (docTitle || filename) {
            const beforeCount = knowledgeBase.length;
            knowledgeBase = knowledgeBase.filter(item => {
                const matchTitle = docTitle && item.chunk.title === docTitle;
                const matchFile = filename && (item.chunk.path?.includes(filename) || item.chunk.title?.includes(filename));
                return !(matchTitle || matchFile);
            });
            const removed = beforeCount - knowledgeBase.length;
            console.log(`[Worker] 🗑️ ${removed} fragments supprimés du RAG pour "${docTitle || filename}". Total restant: ${knowledgeBase.length}`);
            postMessage({ type: 'CHUNKS_REMOVED', count: removed, total: knowledgeBase.length });
        }
    } else if (type === 'SYNC_CUSTOM_CHUNKS') {
        const customChunks = e.data.chunks || [];
        if (customChunks.length > 0) {
            const existingIds = new Set(knowledgeBase.map(k => k.chunk.id).filter(Boolean));
            const toAdd = customChunks.filter(c => !existingIds.has(c.id));
            if (toAdd.length > 0) {
                const indexed = toAdd.map(indexChunkItem);
                knowledgeBase.unshift(...indexed);
                console.log(`[Worker] 🔄 Synchronisation de ${toAdd.length} fragments RAG personnalisés. Total base: ${knowledgeBase.length}`);
            }
        }
        postMessage({ type: 'STATUS', status: 'SYNCED', total: knowledgeBase.length });
    }
});
