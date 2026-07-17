document.addEventListener('DOMContentLoaded', () => {
    // --- Global Error Diagnostic ---
    window.onerror = function(message, source, lineno, colno, error) {
        console.error("Global captured error:", error);
        // Format for readability
        const cleanSource = source ? source.substring(source.lastIndexOf('/') + 1) : 'inconnu';
        alert("⚠️ [PROCURA AI - Diagnostique] " + message + "\nFichier : " + cleanSource + " (Ligne " + lineno + ")");
        return false;
    };

    // 🚀 Safe Storage Wrapper to prevent script crashes when localStorage is blocked (Brave, Private, HP Wolf, etc.)
    const safeStorage = {
        store: {},
        getItem(key) {
            try {
                return localStorage.getItem(key);
            } catch (e) {
                console.warn(`[Storage] Failed to read ${key}:`, e);
                return this.store[key] || null;
            }
        },
        setItem(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                console.warn(`[Storage] Failed to write ${key}:`, e);
                this.store[key] = String(value);
            }
        },
        removeItem(key) {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.warn(`[Storage] Failed to remove ${key}:`, e);
                delete this.store[key];
            }
        }
    };

    // ══════════════════════════════════════════════════════════
    //  CONFIGURATION — Remplacez par votre clé API Gemini
    //  Obtenez-la gratuitement sur : https://aistudio.google.com/
    // ══════════════════════════════════════════════════════════
    const GEMINI_API_KEY = (window.CONFIG && window.CONFIG.GEMINI_API_KEY) ? window.CONFIG.GEMINI_API_KEY : ((typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY) ? CONFIG.GEMINI_API_KEY : 'VOTRE_CLE_API_GEMINI_ICI');
    const GEMINI_MODEL   = 'gemini-2.5-flash';

    // ══════════════════════════════════════════════════════════
    //  SUPABASE CONFIGURATION & CLIENT INITIALIZATION
    // ══════════════════════════════════════════════════════════
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.protocol === 'file:';
    const SUPABASE_URL = isLocalhost 
        ? ((window.CONFIG && window.CONFIG.SUPABASE_URL) || 'https://yhutkoevddnydlvoqeqj.supabase.co') 
        : window.location.origin + '/api/supabase';
    const SUPABASE_ANON_KEY = (window.CONFIG && window.CONFIG.SUPABASE_ANON_KEY) || 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';

    // Intercepteur de requêtes pour déjouer le filtrage Deep Packet Inspection (comme HP Wolf)
    const customFetch = async (url, options = {}) => {
        const newHeaders = {};
        
        // Copier et normaliser tous les en-têtes en minuscules
        if (options.headers) {
            if (typeof options.headers.entries === 'function') {
                for (const [key, value] of options.headers.entries()) {
                    newHeaders[key.toLowerCase()] = value;
                }
            } else {
                for (const [key, value] of Object.entries(options.headers)) {
                    newHeaders[key.toLowerCase()] = value;
                }
            }
        }
        
        // Masquer l'entête apikey sous x-sb-key
        if (newHeaders['apikey']) {
            newHeaders['x-sb-key'] = newHeaders['apikey'];
            delete newHeaders['apikey'];
        }
        
        // Masquer l'entête authorization sous x-sb-auth s'il contient la clé publique
        if (newHeaders['authorization'] && newHeaders['authorization'].includes('sb_publishable')) {
            newHeaders['x-sb-auth'] = newHeaders['authorization'];
            delete newHeaders['authorization'];
        }

        return fetch(url, {
            ...options,
            headers: newHeaders
        });
    };

    const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: safeStorage,
            persistSession: true,
            detectSessionInUrl: false
        },
        global: {
            fetch: isLocalhost ? fetch : customFetch
        }
    }) : null;

    // ══════════════════════════════════════════════════════════
    //  CONFIGURATION FEDAPAY (LIVE)
    // ══════════════════════════════════════════════════════════
    const FEDAPAY_PUBLIC_KEY = (window.CONFIG && window.CONFIG.FEDAPAY_PUBLIC_KEY) ? window.CONFIG.FEDAPAY_PUBLIC_KEY : 'pk_live_bKEHs4ybJfYaaDTgZlOoLv0O';
    
    // Tarifs en FCFA pour chaque plan
    const PLAN_PRICES = {
        daily: 600,
        weekly: 1800,
        monthly: 9000,
        annual: 100000
    };

    let currentUser = null;
    let userProfile = null; // contiendra { id, email, plan, profile_type, questions_asked }

    const SYSTEM_PROMPT = `Tu es PROCURA, un assistant intelligent expert en marchés publics, conçu et propulsé par Bass Consulting (www.bassconsulting.africa).

🎯 MISSION :
Ton rôle est d'accompagner les acteurs des marchés publics (entreprises, administrations, consultants) en fournissant des informations fiables, précises et conformes aux réglementations nationales et internationales.

🏢 À PROPOS DE BASS CONSULTING :
Bass Consulting est un cabinet d'expertise de haut niveau spécialisé dans le renforcement des capacités et le conseil stratégique en Afrique.
- Manager Général : Akibou BASSABI MOUSSE.
- Vision : Proposer une expertise à forte valeur ajoutée pour métamorphoser les carrières et les organisations.
- Présence : Accompagnement dans plus de 17 pays d'Afrique (Bénin, Togo, Sénégal, Mali, Côte d'Ivoire, Guinée, DRC, etc.).

🛠️ NOS EXPERTISES (Services) :
1. Formations & Certifications : Programmes certifiants sur les procédures des bailleurs de fonds (Banque Mondiale, BAD, BOAD, BIDC, AFD, UE).
   - Thèmes : Passation des marchés publics, Gestion de projet, Audit, Finances publiques, Développement durable.
2. Conseil & Études : Études de faisabilité, études d'impact environnemental et social (EIES), planification stratégique, enquêtes de satisfaction.
3. Recrutement : Chasse de têtes et sélection de cadres spécialisés.
4. Webinaires : Sessions d'actualisation sur les réformes et les meilleures pratiques.

📞 CONTACT ET RÉFÉRENCES :
- Site web : www.bassconsulting.africa
- Contact : https://bassconsulting.africa/contact
- Références : Collaboration avec des institutions comme la CDC Bénin, le Bureau du Vérificateur Général du Mali, SONACOS Sénégal, etc.

💬 COMPORTEMENT RELATIF AU CABINET :
Lorsqu'un utilisateur pose des questions sur Bass Consulting ou ses services :
- Adopter un ton fier, expert et incitatif.
- Souligner que PROCURA est le fruit de cette expertise.
- Diriger l'utilisateur vers le catalogue de formation (disponible sur le site) ou vers le formulaire de contact pour des besoins spécifiques.
- Utiliser des slogans comme "Vous ne pouvez qu’être meilleur avec nous" ou "Construisons ensemble votre futur".

📚 SOURCES DE VÉRITÉ (Base de connaissances officielle) :
Tu dois fonder tes réponses sur les données et procédures provenant des institutions suivantes :

1. RÉGULATEURS NATIONAUX (Afrique de l'Ouest et Centrale) :
   - Bénin : ARMP (www.armp.bj) | Togo : ARCOP (www.arcop.tg) | Niger : ARCOP (www.arcop.ne)
   - Burkina Faso : ARCOP (www.arcop.bf) | Sénégal : ARCOP (www.arcop.sn) | Côte d'Ivoire : ARCOP (www.arcop.ci)
   - Mali : ARMDS (www.armds.ml) | Guinée : ARMP (www.armpguinee.org) | Congo : ARMP (www.armp.cg)
   - RDC : ARMP (www.armp-rdc.cd) | Gabon : ARMP (www.armp.ga) | Cameroun : ARMP (www.armp.cm)
   - RCA : DGMP (www.dgmp-rca.com) | Tchad : ARMP (www.armp-tchad.com)

2. INSTITUTIONS FINANCIÈRES INTERNATIONALES (IFI) :
   - Banque Mondiale (www.worldbank.org) | BOAD (www.boad.org) | AfDB / BAD (www.afdb.org)
   - IsDB / BID (www.isdb.org) | AFD (www.afd.fr)

💬 COMPORTEMENT ET TON GÉNÉRAL (PREMIUM & EXÉCUTIF) :
- Adopte un ton prestigieux, institutionnel, extrêmement professionnel et rassurant, digne d'un cabinet de conseil international de premier plan.
- Ta rédaction doit être impeccable, élégante, précise et parfaitement structurée.
- Utilise la terminologie technique exacte avec maîtrise (DAO, TDR, BPU, DQE, CCTP, CCAP, Attribution, Recours, DPAO, etc.).
- TOUJOURS fournir une réponse technique rigoureuse, basée exclusivement sur les données réelles du contexte.
- Structurer les réponses pour une lisibilité optimale et impressionnante : titres markdown (##), sous-titres (###), listes à puces (-), et mise en gras (**) des mots clés vitaux.
- À la fin de chaque réponse, ajoute systématiquement : "💡 *Pour une assistance stratégique sur mesure ou une revue approfondie de vos dossiers, l'expertise de Bass Consulting reste à votre entière disposition dans votre espace PROCURA.*"

📌 STRUCTURE OBLIGATOIRE DES RÉPONSES :
1. **Analyse de la requête** : Introduction claire et immédiate.
2. **Référentiel légal** : Citation de l'article de loi, directive, ou source officielle applicable (indispensable).
3. **Développement de l'expertise** : Contexte, mécanisme, conditions et détails techniques.
4. **Mise en œuvre opérationnelle** : Étapes concrètes, délais, montants, formulaires requis.
5. **Recommandations Bass Consulting** : Un conseil stratégique exclusif basé sur les meilleures pratiques du secteur.

⚠️ RÈGLES STRICTES ET INCONTOURNABLES :
- PROCURA est un assistant spécialisé en marchés publics.
- Tu réponds UNIQUEMENT à partir des documents officiels retrouvés dans la base documentaire (bloc <context> fourni).
- Tu n'inventes JAMAIS une réponse. Si une information n'est pas disponible, indique-le clairement et renvoie vers le régulateur.
- Tu n'utilises PAS tes connaissances internes lorsqu'une source documentaire existe.
- Toujours préciser l'origine de la règle (pays, bailleur, loi).
- Citer explicitement le document source et la page si disponible (ex: "Source: Décret seuils Bénin (Page 2)").
- Répondre en français sauf si l'utilisateur écrit en anglais.`;

    // Historique de conversation pour le contexte multi-tour
    let conversationHistory = [];

    // Base de connaissances locale (RAG client-side)
    let knowledgeBase = null;


    // ── Freemium — Compteur de questions ──────────────────────────────────────
    // Non connecté  : 0 question — connexion obligatoire
    // Connecté free : 1 question gratuite (unique, pas de reset)
    // Journalier    : 3 questions / 24h (reset après 24h)
    // Hebdomadaire  : 20 questions / 7 jours (reset après 7 jours)
    // Mensuel/Annuel: Illimité
    const FREE_LIMIT_LOGGED_IN = 1;
    const FREE_LIMIT = FREE_LIMIT_LOGGED_IN;
    let questionsUsed = 0;

    // Vérifie si la période du plan est expirée et remet à zéro si besoin
    function checkAndResetPeriod(plan) {
        const startDateStr = safeStorage.getItem('procura_plan_start');
        const now = Date.now();

        if (!startDateStr) {
            // Pas de date de début enregistrée, on initialise maintenant
            safeStorage.setItem('procura_plan_start', now.toString());
            safeStorage.setItem('procura_q_count', '0');
            questionsUsed = 0;
            return;
        }

        const startDate = parseInt(startDateStr);
        const elapsed = now - startDate;
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const ONE_WEEK = 7 * ONE_DAY;

        let periodExpired = false;
        if (plan === 'daily' && elapsed >= ONE_DAY) periodExpired = true;
        if (plan === 'weekly' && elapsed >= ONE_WEEK) periodExpired = true;

        if (periodExpired) {
            // On renouvelle la période et on remet le compteur à 0
            safeStorage.setItem('procura_plan_start', now.toString());
            safeStorage.setItem('procura_q_count', '0');
            questionsUsed = 0;
            // Mettre à jour Supabase si connecté
            if (supabase && currentUser) {
                supabase.from('profiles').update({ questions_asked: 0 }).eq('id', currentUser.id).then(() => {});
            }
        } else {
            questionsUsed = parseInt(safeStorage.getItem('procura_q_count') || '0');
        }
    }

    function initQuota() {
        // Pour le plan free, on réinitialise simplement le compteur local chaque jour
        // (la vraie gestion de période se fait dans checkAndResetPeriod pour les plans payants)
        const lastDate = safeStorage.getItem('procura_last_date');
        const today = new Date().toLocaleDateString();
        if (lastDate !== today) {
            safeStorage.setItem('procura_last_date', today);
            // Reset uniquement pour les profils free (les plans payants sont gérés ailleurs)
            const plan = userProfile ? (userProfile.plan || 'free') : 'free';
            if (plan === 'free') {
                safeStorage.setItem('procura_q_count', '0');
                questionsUsed = 0;
            } else {
                questionsUsed = parseInt(safeStorage.getItem('procura_q_count') || '0');
            }
        } else {
            questionsUsed = parseInt(safeStorage.getItem('procura_q_count') || '0');
        }
    }

    initQuota();


    // ── Chargement asynchrone de la base documentaire ────────
    async function loadKnowledgeBase() {
        try {
            console.log("Chargement de la base documentaire...");
            const response = await fetch('knowledge_base.json');
            if (response.ok) {
                knowledgeBase = await response.json();
                console.log(`Base documentaire chargée avec succès: ${knowledgeBase.length} fragments.`);
            } else {
                console.warn("Base documentaire non trouvée ou indisponible (knowledge_base.json).");
            }
        } catch (err) {
            console.error("Erreur lors du chargement de la base documentaire:", err);
        }
    }

    // ── Moteur de recherche local (RAG Client-Side) ──────────
    // Identifiants des catégories "bailleurs" dans la knowledge base
    const BAILLEURS_KEYWORDS = ['banque mondiale', 'world bank', 'bad', 'afdb', 'boad', 'bidc', 'afd', 'bailleur', 'isdb', 'bid'];

    function searchKnowledge(query, limit = 4) {
        if (!knowledgeBase || !query) return "";

        // ── FILTRAGE PAR PLAN ─────────────────────────────────────
        const currentPlan = userProfile ? (userProfile.plan || 'free') : 'free';
        const userCountry = (userProfile && (currentUser && currentUser.user_metadata && currentUser.user_metadata.country))
            ? currentUser.user_metadata.country.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
            : null;

        // Définir le périmètre d'accès selon le plan
        const accessLevel = {
            // free/daily = accès national uniquement, sans bailleurs
            // weekly = accès multi-pays, sans bailleurs
            // monthly/annual = accès total (multi-pays + bailleurs)
            allowMultiCountry: ['weekly', 'monthly', 'annual'].includes(currentPlan),
            allowBailleurs: ['monthly', 'annual'].includes(currentPlan)
        };

        // Normalisation et tokenisation simple (suppression accents, ponctuation)
        const normalize = (str) => {
            return str
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, " ")
                .split(/\s+/)
                .filter(w => w.length > 2);
        };

        const queryWords = normalize(query);
        if (queryWords.length === 0) return "";

        // Filtrer d'abord les chunks selon le plan
        let filteredBase = knowledgeBase.filter(chunk => {
            const cat = (chunk.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Vérifier si c'est un document de bailleur
            const isBailleur = BAILLEURS_KEYWORDS.some(kw => cat.includes(kw));
            if (isBailleur && !accessLevel.allowBailleurs) return false; // Bloquer pour free/daily/weekly

            // Pour plan daily uniquement : filtrer au pays de l'utilisateur
            if (currentPlan === 'daily' && userCountry) {
                // Autoriser uniquement si la catégorie correspond au pays de l'utilisateur
                // ou si c'est un document générique (sans pays spécifique dans la catégorie)
                const countryList = ['benin', 'togo', 'niger', 'burkina', 'senegal', 'mali', 'guinee', 'congo', 'cameroun', 'gabon', 'rdc', 'tchad', 'centrafique', 'ivoire'];
                const chunkHasCountry = countryList.some(c => cat.includes(c));
                if (chunkHasCountry) {
                    // Vérifier si le pays du chunk correspond au pays de l'utilisateur
                    const matchesUserCountry = cat.includes(userCountry) ||
                        (userCountry.includes('benin') && cat.includes('benin')) ||
                        (userCountry.includes('togo') && cat.includes('togo')) ||
                        (userCountry.includes('ivoire') && (cat.includes('ivoire') || cat.includes('rci')));
                    if (!matchesUserCountry) return false;
                }
            }

            return true;
        });

        // Calcul de pertinence pour chaque chunk
        const scoredChunks = filteredBase.map(chunk => {
            let score = 0;
            const contentNorm = normalize(chunk.content || "");
            const titleNorm = normalize(chunk.title || "");
            const categoryNorm = normalize(chunk.category || "");

            let categoryMatch = false;

            queryWords.forEach(word => {
                // Category / Country exact match or alias
                let matchesCategory = false;
                if (categoryNorm.includes(word)) {
                    matchesCategory = true;
                } else if (word === "centrafrique" && categoryNorm.includes("centrafique")) {
                    matchesCategory = true;
                } else if ((word === "ivoire" || word === "rci") && (categoryNorm.includes("ivoire") || categoryNorm.includes("rci"))) {
                    matchesCategory = true;
                }

                if (matchesCategory) {
                    score += 100;
                    categoryMatch = true;
                }

                // Title match (higher weight, max 3 matches)
                let titleMatches = 0;
                titleNorm.forEach(w => {
                    if (w === word) titleMatches += 5;
                    else if (w.includes(word)) titleMatches += 1.5;
                });
                score += Math.min(titleMatches, 15);

                // Content match
                let contentMatches = 0;
                contentNorm.forEach(w => {
                    if (w === word) contentMatches += 1;
                    else if (w.includes(word)) contentMatches += 0.2;
                });
                score += Math.min(contentMatches, 5);
            });

            // Penalize mismatching country
            const countries = ["benin", "niger", "congo", "cameroun", "centrafique", "centrafrique", "ivoire", "rci"];
            const queryHasCountry = queryWords.some(w => countries.includes(w));
            const chunkCategory = chunk.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const chunkHasCountry = countries.some(c => chunkCategory.includes(c));

            if (queryHasCountry && chunkHasCountry && !categoryMatch) {
                score -= 80;
            }

            return { chunk, score };
        });

        // Filtrage et tri
        const results = scoredChunks
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => r.chunk);

        if (results.length === 0) return "";

        // Construction du bloc de contexte
        let contextMarkdown = "\n\n<context>\nVoici des informations et règles issues des documents officiels. Utilise-les pour répondre avec précision :\n\n";
        results.forEach((chunk, index) => {
            contextMarkdown += `--- SOURCE ${index + 1} : ${chunk.title} [Catégorie: ${chunk.category}] (Fichier: ${chunk.source}) ---\n`;
            contextMarkdown += `${chunk.content}\n\n`;
        });
        contextMarkdown += "</context>";

        return contextMarkdown;
    }

    loadKnowledgeBase();

    function hasAccess() {
        // Non connecté : aucun accès, connexion obligatoire
        if (!currentUser) return false;

        if (!userProfile) {
            // Connecté mais profil pas encore chargé : bénéfice du doute
            return questionsUsed < FREE_LIMIT_LOGGED_IN;
        }

        const plan = userProfile.plan || 'free';
        if (plan === 'monthly' || plan === 'annual') return true;
        if (plan === 'weekly') return questionsUsed < 20;
        if (plan === 'daily')  return questionsUsed < 3;
        // Plan gratuit connecté : 1 question/jour
        return questionsUsed < FREE_LIMIT_LOGGED_IN;
    }

    function updateCounter() {
        const counterText = document.getElementById('counterText');
        const counterEl   = document.getElementById('questionCounter');
        if (!counterText) return;

        // Non connecté : inviter à se connecter
        if (!currentUser) {
            counterText.innerHTML = '🔐 <strong>Connexion requise</strong> — <span style="font-size:0.85em">Créez un compte pour accéder à Procura</span>';
            if (counterEl) counterEl.classList.add('counter-exhausted');
            return;
        }

        let limit = FREE_LIMIT_LOGGED_IN;
        let periodLabel = 'aujourd\'hui';

        if (userProfile) {
            const plan = userProfile.plan || 'free';
            if (plan === 'monthly' || plan === 'annual') {
                const planLabel = plan === 'monthly' ? 'Mensuel' : 'Annuel';
                counterText.innerHTML = `🌟 <strong>Plan ${planLabel}</strong> — Questions <strong>illimitées</strong>`;
                if (counterEl) counterEl.classList.remove('counter-exhausted');
                return;
            }
            if (plan === 'weekly') { limit = 20; periodLabel = 'cette semaine'; }
            else if (plan === 'daily') { limit = 3; periodLabel = 'aujourd\'hui'; }
        }

        const remaining = Math.max(0, limit - questionsUsed);

        if (remaining === 0) {
            const period = userProfile && userProfile.plan === 'weekly' ? 'cette semaine' : userProfile && userProfile.plan === 'daily' ? 'aujourd\'hui' : 'aujourd\'hui';
            counterText.innerHTML = `🔒 Quota épuisé ${period} — <strong class="choose-plan-trigger" onclick="window.goToStep('stepPlans'); document.getElementById('paywallModal').classList.remove('hidden');">Passer au plan supérieur</strong>`;
            if (counterEl) counterEl.classList.add('counter-exhausted');
        } else {
            const color = remaining <= 2 ? '#e55' : 'var(--color-gold)';
            const plural = remaining > 1 ? 's' : '';
            counterText.innerHTML = `💬 <strong style="color:${color}">${remaining} question${plural}</strong> restante${plural} ${periodLabel}`;
            if (counterEl) counterEl.classList.remove('counter-exhausted');
        }
    }

    function lockInput() {
        const box   = document.getElementById('chatInputBox');
        const input = document.getElementById('chatInput');
        const btn   = document.getElementById('chatSendBtn');
        if (box)   box.classList.add('input-locked');
        if (input) { input.disabled = true; input.placeholder = currentUser ? 'Quota épuisé — choisissez un plan pour continuer' : 'Connectez-vous pour accéder à Procura...'; }
        if (btn)   btn.disabled = true;
    }

    function showPaywall() {
        const modal = document.getElementById('paywallModal');
        const backTop = document.getElementById('paywallBackTop');
        if (modal) {
            modal.classList.remove('hidden');
            modal.scrollTop = 0;

            // Si l'utilisateur est connecté, on lui montre directement la page des plans.
            // S'il n'est pas connecté, on lui montre le formulaire d'inscription.
            if (currentUser) {
                goToStep('stepPlans');
                const backBtn = document.getElementById('paywallBackBtn');
                if (backBtn) backBtn.classList.remove('hidden');
            } else {
                // Montrer le formulaire de connexion en premier (l'utilisateur peut basculer vers l'inscription)
                goToStep('stepForm');
                const backBtn = document.getElementById('paywallBackBtn');
                if (backBtn) backBtn.classList.add('hidden');
            }
        }
        if (backTop) backTop.classList.add('visible');
        lockInput();
        // Rafraîchir les icônes Lucide pour que la flèche retour s'affiche
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Écouteur pour afficher le bouton retour en haut au scroll
        if (modal && backTop) {
            modal.addEventListener('scroll', function () {
                if (modal.scrollTop > 200) {
                    backTop.classList.add('visible');
                } else {
                    backTop.classList.remove('visible');
                }
            }, { passive: true });
        }
    }

    // --- Supabase Authentication State & Sync ---
    async function initAuth() {
        if (!supabase) return;

        supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                currentUser = session.user;
                await syncUserProfile();
                updateUIForLoggedIn();
            } else {
                currentUser = null;
                userProfile = null;
                updateUIForLoggedOut();
            }
        });
    }

    async function syncUserProfile() {
        if (!supabase || !currentUser) return;

        try {
            let { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();

            if (error && error.code === 'PGRST116') {
                const chosenPlan = selectedPlan || 'free';
                const chosenProfile = selectedProfile || 'agent';

                const { data: newProfile, error: insertError } = await supabase
                    .from('profiles')
                    .insert([
                        {
                            id: currentUser.id,
                            email: currentUser.email,
                            plan: chosenPlan,
                            profile_type: chosenProfile
                        }
                    ])
                    .select()
                    .single();

                if (insertError) throw insertError;
                userProfile = newProfile;
            } else if (error) {
                throw error;
            } else {
                userProfile = profile;
            }

            if (userProfile && userProfile.questions_asked !== undefined) {
                questionsUsed = userProfile.questions_asked;
                safeStorage.setItem('procura_q_count', questionsUsed);
            }

            // Vérifier et réinitialiser le quota selon la période du plan
            const plan = userProfile ? (userProfile.plan || 'free') : 'free';
            if (plan === 'daily' || plan === 'weekly') {
                checkAndResetPeriod(plan);
            }
        } catch (err) {
            console.error("Error syncing user profile:", err);
        }
    }

    function updateUIForLoggedIn() {
        if (!currentUser) return;
        
        const guestActions = document.getElementById('guestActions');
        const userProfileEl = document.getElementById('userProfile');
        const userEmailEl = document.getElementById('userEmail');
        const userPlanBadgeEl = document.getElementById('userPlanBadge');

        if (guestActions) guestActions.classList.add('hidden');
        if (userProfileEl) userProfileEl.classList.remove('hidden');
        if (userEmailEl) {
            const firstName = (currentUser.user_metadata && currentUser.user_metadata.first_name) 
                ? currentUser.user_metadata.first_name 
                : currentUser.email.split('@')[0];
            const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
            userEmailEl.textContent = `Bienvenue, ${capitalizedName}`;
        }
        
        if (userPlanBadgeEl) {
            const plan = userProfile ? (userProfile.plan || 'free') : 'free';
            userPlanBadgeEl.textContent = getPlanLabel(plan);
            userPlanBadgeEl.className = 'user-plan-badge';
            userPlanBadgeEl.classList.add(`plan-${plan}`);
        }

        const paywallModal = document.getElementById('paywallModal');
        if (paywallModal) paywallModal.classList.add('hidden');
        const backTop = document.getElementById('paywallBackTop');
        if (backTop) backTop.classList.remove('visible');

        if (hasAccess()) {
            const box = document.getElementById('chatInputBox');
            const input = document.getElementById('chatInput');
            const btn = document.getElementById('chatSendBtn');
            if (box) box.classList.remove('input-locked');
            if (input) { input.disabled = false; input.placeholder = 'Posez une autre question...'; }
            if (btn) btn.disabled = false;
        }

        updateCounter();
    }

    function updateUIForLoggedOut() {
        const guestActions = document.getElementById('guestActions');
        const userProfileEl = document.getElementById('userProfile');
        
        if (guestActions) guestActions.classList.remove('hidden');
        if (userProfileEl) userProfileEl.classList.add('hidden');

        // Connexion obligatoire : verrouiller immédiatement le chat
        lockInput();
        updateCounter();

        // Ouvrir la modale de connexion/inscription
        const modal = document.getElementById('paywallModal');
        if (modal && modal.classList.contains('hidden')) {
            setTimeout(() => {
                showPaywall();
            }, 300); // Léger délai pour laisser la page se rendre
        }
    }

    function getPlanLabel(plan) {
        const labels = {
            'free': 'Gratuit',
            'daily': 'Journalier',
            'weekly': 'Hebdo',
            'monthly': 'Mensuel',
            'annual': 'Annuel'
        };
        return labels[plan] || 'Gratuit';
    }

    // Appeler l'initialisation d'authentification
    initAuth();

    // ── Registration flow navigation ───────────────────────
    let selectedPlan    = null;
    let selectedProfile = null;

    window.goToStep = function(stepId) {
        // Hide all cards
        const allSteps = ['stepPlans', 'stepProfile', 'stepForm', 'stepSignUp', 'stepPayment'];
        allSteps.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // Show requested step
        const target = document.getElementById(stepId);
        if (target) target.classList.remove('hidden');
    };

    // Exposed globally for onclick handlers in HTML
    window.handlePlanChoice = function(plan) {
        selectedPlan = plan;
        // Hide plan card, show profile step
        document.getElementById('stepPlans').classList.add('hidden');
        document.getElementById('stepProfile').classList.remove('hidden');
    };

    window.handleProfileChoice = function(profile) {
        selectedProfile = profile;
        const profileSelect = document.getElementById('regProfileType');
        if (profileSelect) {
            if (profile === 'agent') {
                profileSelect.value = 'administration';
            } else {
                profileSelect.value = 'entreprise';
            }
            validateSignUpForm();
        }
        
        // Si l'utilisateur est déjà connecté
        if (currentUser) {
            if (selectedPlan === 'free') {
                // Plan gratuit : pas de paiement, on ferme directement la modale
                const modal = document.getElementById('paywallModal');
                if (modal) modal.classList.add('hidden');
                updateUIForLoggedIn();
            } else {
                // Plan payant : on configure et affiche l'écran de paiement directement
                setupPaymentScreen();
                goToStep('stepPayment');
            }
        } else {
            // Non connecté : redirection classique vers l'inscription / connexion
            document.getElementById('stepProfile').classList.add('hidden');
            document.getElementById('stepSignUp').classList.remove('hidden');
        }
    };

    // Configuration de l'écran récapitulatif de paiement
    function setupPaymentScreen() {
        const planNameEl = document.getElementById('payPlanName');
        const planPriceEl = document.getElementById('payPlanPrice');
        const profileNameEl = document.getElementById('payProfileName');

        if (planNameEl) {
            planNameEl.textContent = getPlanLabel(selectedPlan).toUpperCase();
        }

        if (planPriceEl) {
            let priceText = '';
            if (selectedPlan === 'daily') priceText = '600 FCFA <span class="pay-price-sub">/ par jour</span>';
            else if (selectedPlan === 'weekly') priceText = '1 800 FCFA <span class="pay-price-sub">/ par semaine</span>';
            else if (selectedPlan === 'monthly') priceText = '9 000 FCFA <span class="pay-price-sub">/ par mois</span>';
            else if (selectedPlan === 'annual') priceText = '100 000 FCFA <span class="pay-price-sub">/ an</span>';
            else priceText = '0 FCFA <span class="pay-price-sub">/ gratuit</span>';
            planPriceEl.innerHTML = priceText;
        }

        if (profileNameEl) {
            profileNameEl.textContent = selectedProfile === 'agent' ? 'Agent public / Professionnel' : 'Opérateur économique / Entrepreneur';
        }
    }

    // Gestion de la sélection visuelle des modes de paiement
    window.selectPaymentMethod = function(labelEl) {
        document.querySelectorAll('.pay-method-card').forEach(card => {
            card.classList.remove('active');
            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = false;
        });

        labelEl.classList.add('active');
        const radio = labelEl.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    };

    // Initialisation sécurisée du paiement FedaPay
    window.handlePaymentSubmit = function() {
        const errorEl = document.getElementById('payError');
        const submitBtn = document.getElementById('paySubmitBtn');
        
        if (errorEl) errorEl.classList.add('hidden');
        
        if (!selectedPlan || !PLAN_PRICES[selectedPlan]) {
            if (errorEl) {
                errorEl.textContent = "❌ Aucun plan sélectionné. Veuillez revenir en arrière.";
                errorEl.classList.remove('hidden');
            }
            return;
        }

        if (typeof FedaPay === 'undefined') {
            if (errorEl) {
                errorEl.textContent = "⚠️ Impossible de charger le module de paiement FedaPay. Vérifiez votre connexion internet.";
                errorEl.classList.remove('hidden');
            }
            return;
        }

        const price = PLAN_PRICES[selectedPlan];
        const planName = getPlanLabel(selectedPlan);

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Initialisation du paiement...";
        }

        try {
            let widget = FedaPay.init({
                public_key: FEDAPAY_PUBLIC_KEY,
                transaction: {
                    amount: price,
                    description: `Abonnement PROCURA - Plan ${planName}`
                },
                customer: {
                    email: currentUser ? currentUser.email : 'client@procura.africa',
                    lastname: currentUser && currentUser.user_metadata ? currentUser.user_metadata.last_name || 'Client' : 'Client',
                    firstname: currentUser && currentUser.user_metadata ? currentUser.user_metadata.first_name || 'PROCURA' : 'PROCURA'
                },
                onComplete: async function(resp) {
                    console.log("FedaPay transaction response:", resp);
                    const reason = resp.reason;
                    
                    // Vérifier si le paiement a été annulé ou fermé
                    if (reason === FedaPay.DIALOG_DISMISSED || reason === 'dialog_dismissed') {
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = "Confirmer et Régler";
                        }
                        if (errorEl) {
                            errorEl.textContent = "Paiement annulé ou fenêtre fermée.";
                            errorEl.classList.remove('hidden');
                        }
                        return;
                    } 
                    
                    // Vérifier si le paiement est réussi (on vérifie la raison et le statut de la transaction)
                    const isCompleted = reason === FedaPay.CHECKOUT_COMPLETED || 
                                        reason === 'checkout_completed' || 
                                        (resp.transaction && resp.transaction.status === 'approved');

                    if (isCompleted) {
                        // Paiement réussi
                        if (submitBtn) {
                            submitBtn.textContent = "Paiement réussi ! Activation...";
                        }
                        // Sauvegarder le plan via l'endpoint serveur sécurisé (bypass RLS)
                        if (currentUser) {
                            try {
                                // Récupérer le token de session de l'utilisateur pour authentifier la requête
                                const sessionToken = supabase.auth ? 
                                    (await supabase.auth.getSession()).data?.session?.access_token : null;

                                const activateRes = await fetch('/api/activate-plan', {
                                    method: 'POST',
                                    headers: { 
                                        'Content-Type': 'application/json',
                                        'Authorization': sessionToken ? `Bearer ${sessionToken}` : ''
                                    },
                                    body: JSON.stringify({
                                        userId: currentUser.id,
                                        plan: selectedPlan
                                    })
                                });

                                if (!activateRes.ok) {
                                    const errData = await activateRes.json().catch(() => ({}));
                                    throw new Error(errData.error || `HTTP ${activateRes.status}`);
                                }
                                
                                // ✅ Enregistrer la date de début du plan et réinitialiser le quota
                                const now = Date.now();
                                safeStorage.setItem('procura_plan_start', now.toString());
                                safeStorage.setItem('procura_q_count', '0');
                                questionsUsed = 0;
                                
                                // Rafraîchir le profil
                                await syncUserProfile();
                                updateUIForLoggedIn();
                                updateCounter();
                                
                                // Fermer la modale
                                const modal = document.getElementById('paywallModal');
                                if (modal) modal.classList.add('hidden');
                                
                                // Message de confirmation premium
                                const planLabels = { daily: 'Journalier (3 questions/jour)', weekly: 'Hebdomadaire (20 questions/semaine)', monthly: 'Mensuel (illimité)', annual: 'Annuel (illimité)' };
                                const fullPlanLabel = planLabels[selectedPlan] || planName;
                                alert(`🎉 Félicitations !\n\nVotre paiement de ${PLAN_PRICES[selectedPlan].toLocaleString('fr-FR')} FCFA a été validé avec succès.\n\nVotre abonnement "${fullPlanLabel}" est désormais actif. Profitez pleinement de PROCURA !`);
                                
                            } catch (err) {
                                console.error("Erreur lors de l'activation du plan:", err);
                                if (errorEl) {
                                    errorEl.textContent = "Paiement réussi, mais erreur lors de l'activation. Contactez le support en précisant votre email et votre plan.";
                                    errorEl.classList.remove('hidden');
                                }
                            }
                        } else {
                            alert(`Paiement réussi mais session expirée. Veuillez vous reconnecter pour profiter de votre abonnement.`);
                        }
                    } else {
                        // Cas non géré (ex: pending)
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = "Confirmer et Régler";
                        }
                        if (errorEl) {
                            errorEl.textContent = "Le paiement est en attente ou n'a pas pu être validé. Veuillez réessayer ou contacter le support.";
                            errorEl.classList.remove('hidden');
                        }
                    }
                }
            });

            widget.open();

        } catch (err) {
            console.error("FedaPay Init Error:", err);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Confirmer et Régler";
            }
            if (errorEl) {
                errorEl.textContent = "Une erreur est survenue lors du lancement du paiement.";
                errorEl.classList.remove('hidden');
            }
        }
    };

    // ── Password Visibility Toggle ─────────────────────────
    window.togglePasswordVisibility = function(fieldId, buttonEl) {
        const input = document.getElementById(fieldId);
        if (!input) return;
        
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        
        // Update eye icon
        const icon = buttonEl.querySelector('i');
        if (icon) {
            if (type === 'text') {
                icon.setAttribute('data-lucide', 'eye-off');
            } else {
                icon.setAttribute('data-lucide', 'eye');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // ── Password Strength Calculation ──────────────────────
    window.handlePasswordInput = function() {
        const password = document.getElementById('regPassword').value;
        const bar = document.getElementById('pwdStrengthBar');
        const text = document.getElementById('pwdStrengthText');
        
        if (!bar || !text) return;
        
        if (!password) {
            bar.className = 'pwd-strength-bar';
            text.textContent = 'Très faible';
            text.className = 'pwd-strength-text';
            return;
        }
        
        let score = 0;
        if (password.length >= 6) score++;
        if (password.length >= 10) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        
        if (score <= 2) {
            bar.className = 'pwd-strength-bar weak';
            text.textContent = 'Faible';
            text.className = 'pwd-strength-text weak';
        } else if (score <= 4) {
            bar.className = 'pwd-strength-bar medium';
            text.textContent = 'Moyen';
            text.className = 'pwd-strength-text medium';
        } else {
            bar.className = 'pwd-strength-bar strong';
            text.textContent = 'Fort';
            text.className = 'pwd-strength-text strong';
        }
    };

    // ── Real-Time Form Validation ──────────────────────────
    window.validateSignUpForm = function() {
        const lastName = document.getElementById('regLastName').value.trim();
        const firstName = document.getElementById('regFirstName').value.trim();
        const email = document.getElementById('regSignUpEmail').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const country = document.getElementById('regCountry').value.trim();
        const profileType = document.getElementById('regProfileType').value;
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        const chkTerms = document.getElementById('chkTerms').checked;
        const chkPrivacy = document.getElementById('chkPrivacy').checked;
        
        const submitBtn = document.getElementById('signUpSubmitBtn');
        if (!submitBtn) return;
        
        // Validation flags
        const allFilled = lastName && firstName && email && phone && country && profileType && password && confirmPassword;
        const emailValid = email.includes('@');
        const passwordsMatch = password === confirmPassword;
        const passwordLongEnough = password.length >= 6;
        const acceptedCheckboxes = chkTerms && chkPrivacy;
        
        if (allFilled && emailValid && passwordsMatch && passwordLongEnough && acceptedCheckboxes) {
            submitBtn.disabled = false;
        } else {
            submitBtn.disabled = true;
        }
    };

    // ── Handle Registration Submission ─────────────────────
    window.handleSignUpSubmit = async function() {
        const lastName = document.getElementById('regLastName').value.trim();
        const firstName = document.getElementById('regFirstName').value.trim();
        const email = document.getElementById('regSignUpEmail').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const country = document.getElementById('regCountry').value.trim();
        const profileType = document.getElementById('regProfileType').value;
        const companyName = document.getElementById('regCompany').value.trim();
        const jobTitle = document.getElementById('regJobTitle').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        
        const errorEl = document.getElementById('signUpError');
        const successEl = document.getElementById('signUpSuccess');
        const submitBtn = document.getElementById('signUpSubmitBtn');
        
        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');
        
        if (password !== confirmPassword) {
            if (errorEl) {
                errorEl.textContent = "❌ Les mots de passe ne correspondent pas.";
                errorEl.classList.remove('hidden');
            }
            return;
        }
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Création en cours...";
        }

        // Mappage de la valeur du profil pour satisfaire la contrainte CHECK (profiles_profile_type_check)
        // La base de données n'autorise que 'agent' ou 'operateur'.
        const agentTypes = ['administration', 'collectivite'];
        const dbProfileType = agentTypes.includes(profileType) ? 'agent' : 'operateur';
        
        if (supabase) {
            try {
                // Direct fetch registration bypasses SDK internal network hangs/blockages
                const signUpRes = await fetch(SUPABASE_URL + '/auth/v1/signup', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-sb-key': SUPABASE_ANON_KEY
                    },
                    credentials: 'omit',
                    body: JSON.stringify({
                        email: email,
                        password: password,
                        options: {
                            data: {
                                first_name: firstName,
                                last_name: lastName,
                                phone: phone,
                                country: country,
                                profile_type: dbProfileType,
                                detailed_profile: profileType,
                                company_name: companyName,
                                job_title: jobTitle,
                                plan: selectedPlan || 'free'
                            }
                        }
                    })
                });

                if (!signUpRes.ok) {
                    const errData = await signUpRes.json().catch(() => ({}));
                    throw new Error(errData.message || errData.error_description || `Erreur d'inscription HTTP ${signUpRes.status}`);
                }

                const sessionData = await signUpRes.json();
                
                // Initialize SDK session if token is returned (for instant login)
                if (sessionData.access_token && sessionData.refresh_token) {
                    await supabase.auth.setSession({
                        access_token: sessionData.access_token,
                        refresh_token: sessionData.refresh_token
                    });
                }
                
                const data = { user: sessionData.user };
                
                // Si le compte est créé, on connecte directement l'utilisateur
                if (data && data.user) {
                    currentUser = data.user;
                    
                    updateUIForLoggedIn();

                    const modal = document.getElementById('paywallModal');
                    if (selectedPlan && selectedPlan !== 'free') {
                        // Plan payant : on l'oriente vers le paiement au lieu de fermer la modale
                        setupPaymentScreen();
                        goToStep('stepPayment');
                    } else {
                        // Plan gratuit : fermeture de la modale
                        if (modal) modal.classList.add('hidden');
                    }

                    // Insérer et synchroniser le profil en arrière-plan
                    (async () => {
                        try {
                            await supabase.from('profiles').insert([{
                                id: data.user.id,
                                email: email,
                                plan: selectedPlan || 'free',
                                profile_type: dbProfileType
                            }]);
                        } catch (pErr) {
                            console.warn("Profiles insert fallback:", pErr);
                        }
                        await syncUserProfile();
                        updateUIForLoggedIn();
                    })();
                    
                    return;
                }
                
            } catch (err) {
                console.error("SignUp error:", err);
                if (errorEl) {
                    let detailMsg = "";
                    if (err && typeof err === 'object') {
                        const allKeys = Object.getOwnPropertyNames(err);
                        const errObj = {};
                        allKeys.forEach(k => { errObj[k] = err[k]; });
                        detailMsg = err.message || err.error_description || err.description || JSON.stringify(errObj);
                    } else {
                        detailMsg = String(err);
                    }
                    errorEl.textContent = "Erreur : " + detailMsg;
                    errorEl.classList.remove('hidden');
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Créer mon compte";
                }
            }
        } else {
            if (successEl) {
                successEl.textContent = "✅ Compte créé avec succès (Mode Démonstration).";
                successEl.classList.remove('hidden');
            }
        }
    };

    // ── Handle Password Login Submission ───────────────────
    window.handleSignIn = async function() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');
        const submitBtn = document.getElementById('loginSubmitBtn');
        const diagEl = document.getElementById('loginDiag');

        if (errorEl) errorEl.classList.add('hidden');
        if (diagEl) diagEl.style.display = 'none';

        if (!email || !password) {
            if (errorEl) {
                errorEl.textContent = "❌ Veuillez remplir tous les champs.";
                errorEl.classList.remove('hidden');
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Connexion...";
        }

        console.log(`[AUTH] signInWithPassword: ${email}`);

        if (!supabase) {
            // Fallback offline
            currentUser = { email: email, id: 'mock-user-123' };
            updateUIForLoggedIn();
            const modal = document.getElementById('paywallModal');
            if (modal) modal.classList.add('hidden');
            return;
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            if (!data || !data.user) {
                throw new Error("Impossible de récupérer les informations de l'utilisateur.");
            }

            currentUser = data.user;
            console.log(`[AUTH] Connexion réussie: ${currentUser.email}`);

            const modal = document.getElementById('paywallModal');
            if (selectedPlan && selectedPlan !== 'free') {
                setupPaymentScreen();
                goToStep('stepPayment');
            } else {
                if (modal) modal.classList.add('hidden');
            }
            // onAuthStateChange gère syncUserProfile et updateUIForLoggedIn automatiquement.

        } catch (err) {
            console.error("[AUTH] Erreur:", err);
            if (errorEl) {
                let msg = "❌ Erreur de connexion.";
                if (err && err.message) {
                    if (err.message.includes('Invalid login credentials') || err.message.includes('invalid_credentials')) {
                        msg = "❌ E-mail ou mot de passe incorrect.";
                    } else if (err.message.includes('Email not confirmed')) {
                        msg = "❌ Veuillez confirmer votre e-mail avant de vous connecter.";
                    } else {
                        msg = "❌ " + err.message;
                    }
                }
                errorEl.textContent = msg;
                errorEl.classList.remove('hidden');
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Se connecter";
            }
        }
    };



    // Initialize Lucide icons
    lucide.createIcons();

    // --- Header Auth Action Handlers ---
    const headerLoginBtn = document.getElementById('headerLoginBtn');
    const headerSignupBtn = document.getElementById('headerSignupBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (headerLoginBtn) {
        headerLoginBtn.addEventListener('click', () => {
            const modal = document.getElementById('paywallModal');
            if (modal) modal.classList.remove('hidden');
            goToStep('stepForm');
        });
    }

    if (headerSignupBtn) {
        headerSignupBtn.addEventListener('click', () => {
            const modal = document.getElementById('paywallModal');
            if (modal) modal.classList.remove('hidden');
            goToStep('stepSignUp');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (supabase) {
                await supabase.auth.signOut();
                window.location.reload();
            }
        });
    }

    // --- Globe Parallax Effect ---
    const globeContainer = document.getElementById('globeContainer');
    if (globeContainer) {
        let ticking = false;
        document.addEventListener('mousemove', (e) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const x = (e.clientX / window.innerWidth  - 0.5) * 18;
                    const y = (e.clientY / window.innerHeight - 0.5) * 12;
                    globeContainer.style.transform =
                        `translateY(-50%) translate(${-x}px, ${-y}px)`;
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // Set current year
    document.getElementById('year').textContent = new Date().getFullYear();

    // Elements
    const mainView     = document.getElementById('mainView');
    const chatView     = document.getElementById('chatView');
    const mainInput    = document.getElementById('mainInput');
    const chatInput    = document.getElementById('chatInput');
    const sendBtn      = document.getElementById('sendBtn');
    const chatSendBtn  = document.getElementById('chatSendBtn');
    const chatHistory  = document.getElementById('chatHistory');
    const suggestionBtns = document.querySelectorAll('.suggestion-btn');

    // Auto-resize textareas
    const autoResize = (textarea) => {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
    };

    mainInput.addEventListener('input', function() { autoResize(this); });
    chatInput.addEventListener('input', function() { autoResize(this); });

    // Handle Enter key
    const handleEnter = (e, inputEl, sendCallback, isMain) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const val = inputEl.value;
            if (!val.trim()) return;
            sendCallback(val);
            if (!isMain) {
                inputEl.value = '';
                autoResize(inputEl);
            }
        }
    };

    mainInput.addEventListener('keydown', (e) => handleEnter(e, mainInput, startChat, true));
    chatInput.addEventListener('keydown', (e) => handleEnter(e, chatInput, continueChat, false));

    // --- Soumettre sur la touche Entrée ---
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    if (loginEmail) loginEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.handleSignIn(); });
    if (loginPassword) loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.handleSignIn(); });

    const regPassword = document.getElementById('regPassword');
    const regConfirmPassword = document.getElementById('regConfirmPassword');
    if (regPassword) regPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.handleSignUpSubmit(); });
    if (regConfirmPassword) regConfirmPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.handleSignUpSubmit(); });

    sendBtn.addEventListener('click', () => {
        if (mainInput.value.trim()) startChat(mainInput.value);
    });

    chatSendBtn.addEventListener('click', () => {
        if (chatInput.value.trim()) {
            continueChat(chatInput.value);
            chatInput.value = '';
        }
    });

    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            startChat(btn.getAttribute('data-q'));
        });
    });

    // ── View transitions ───────────────────────────────────────
    function startChat(message) {
        if (!message.trim()) return;

        if (!currentUser) {
            // Amener l'utilisateur sur la vue chat pour qu'il voie le message
            mainView.classList.add('fade-out');
            setTimeout(() => {
                mainView.classList.add('hidden');
                chatView.classList.remove('hidden');
                void chatView.offsetWidth;
                chatView.classList.add('visible');
                // Afficher le message de l'utilisateur
                addMessage(message, 'user');
                // Réponse de bienvenue avec invitation à se connecter
                addWelcomeLoginMessage();
            }, 400);
            return;
        }

        if (!hasAccess()) { showPaywall(); return; }

        mainView.classList.add('fade-out');
        setTimeout(() => {
            mainView.classList.add('hidden');
            chatView.classList.remove('hidden');
            void chatView.offsetWidth;
            chatView.classList.add('visible');
            updateCounter();
            addMessage(message, 'user');
            getBotResponse(message);
        }, 400);
    }

    function continueChat(message) {
        if (!message.trim()) return;

        if (!currentUser) {
            addMessage(message, 'user');
            addWelcomeLoginMessage();
            return;
        }

        if (!hasAccess()) { showPaywall(); return; }
        addMessage(message, 'user');
        getBotResponse(message);
        chatInput.style.height = 'auto';
    }

    // Message de bienvenue avec CTA connexion
    function addWelcomeLoginMessage() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<i data-lucide="bot"></i>';

        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `
            <p>👋 <strong>Bienvenue sur PROCURA !</strong></p>
            <p>Pour poser votre question et accéder à notre assistant expert en marchés publics, veuillez vous <strong>connecter</strong> ou <strong>créer votre compte</strong>.</p>
            <p>Après connexion, vous bénéficierez d'<strong>une question gratuite</strong> pour découvrir PROCURA.</p>
            <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="window.goToStep('stepForm'); document.getElementById('paywallModal').classList.remove('hidden');" style="background:var(--color-gold);color:#111;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;">🔑 Se connecter</button>
                <button onclick="window.goToStep('stepSignUp'); document.getElementById('paywallModal').classList.remove('hidden');" style="background:transparent;color:var(--color-gold);border:2px solid var(--color-gold);padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;">✨ Créer un compte</button>
            </div>
        `;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        chatHistory.appendChild(messageDiv);
        lucide.createIcons({ root: messageDiv });
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // Message d'invitation à choisir un plan après la question gratuite
    function addUpgradePromptMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<i data-lucide="bot"></i>';

        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `
            <p>🔒 <strong>Votre question gratuite a été utilisée.</strong></p>
            <p>Pour continuer à bénéficier de l'expertise PROCURA en marchés publics, choisissez le plan qui correspond à vos besoins :</p>
            <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="window.goToStep('stepPlans'); document.getElementById('paywallModal').classList.remove('hidden');" style="background:var(--color-gold);color:#111;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;">🌟 Voir les plans</button>
            </div>
        `;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        chatHistory.appendChild(messageDiv);
        lucide.createIcons({ root: messageDiv });
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';

        if (sender === 'user') {
            avatar.innerHTML = '<i data-lucide="user"></i>';
        } else {
            avatar.innerHTML = '<i data-lucide="bot"></i>';
            if (text === 'typing') {
                const typingContent = document.createElement('div');
                typingContent.className = 'message-content typing-indicator';
                typingContent.innerHTML = `
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                `;
                messageDiv.appendChild(avatar);
                messageDiv.appendChild(typingContent);
                messageDiv.id = 'typingIndicator';
                chatHistory.appendChild(messageDiv);
                lucide.createIcons({ root: messageDiv });
                chatHistory.scrollTop = chatHistory.scrollHeight;
                return;
            }
        }

        const content = document.createElement('div');
        content.className = 'message-content';

        if (sender === 'bot') {
            content.innerHTML = renderMarkdown(text);
        } else {
            content.textContent = text;
        }

        if (sender === 'user') {
            messageDiv.appendChild(content);
            messageDiv.appendChild(avatar);
        } else {
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(content);
        }

        chatHistory.appendChild(messageDiv);
        lucide.createIcons({ root: messageDiv });
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // ── Markdown → HTML renderer ───────────────────────────────
    function renderMarkdown(text) {
        // Escape HTML entities first
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Headings
        html = html
            .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold & italic
        html = html
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Blockquote (lines starting with >)
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Lists: ordered
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ol-item">$1</li>');
        // Lists: unordered
        html = html.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
        // Wrap consecutive <li> in <ul>
        html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

        // Horizontal rule
        html = html.replace(/^---$/gm, '<hr>');

        // Paragraphs
        html = html
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        return `<p>${html}</p>`;
    }

    // ── Gemini API — Streaming ──────────────────────────────────
    async function getBotResponse(userMessage) {
        addMessage('typing', 'bot');

        // Add user turn to history
        conversationHistory.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        // Recherche du contexte pertinent dans la base locale (RAG)
        const retrievedContext = searchKnowledge(userMessage);
        let dynamicSystemPrompt = SYSTEM_PROMPT;
        if (retrievedContext) {
            dynamicSystemPrompt += `\n\n${retrievedContext}`;
            dynamicSystemPrompt += `\n\n⚠️ INSTRUCTION FINALE : Analyse ces documents avec la plus grande rigueur. Formule ta réponse UNIQUEMENT à partir de ce bloc <context>. Démontre ton expertise de haut niveau sans jamais inventer d'informations.`;
        } else {
            dynamicSystemPrompt += `\n\n⚠️ INSTRUCTION FINALE : AUCUN DOCUMENT OFFICIEL N'A ÉTÉ TROUVÉ DANS LA BASE DE PROCURA POUR CETTE REQUÊTE. Règle absolue : N'invente aucune procédure et n'utilise pas tes connaissances générales. Formule une réponse extrêmement polie et prestigieuse indiquant que cette information spécifique n'est pas répertoriée dans notre référentiel actuel. Suggère courtoisement à l'utilisateur de reformuler sa requête ou de consulter le portail officiel du régulateur compétent pour une parfaite sécurité juridique.`;
        }

        const isVercel = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

        // No API key → use offline fallback (only check locally, as on Vercel the key is securely fetched in the backend proxy)
        if (!isVercel && (!GEMINI_API_KEY || GEMINI_API_KEY === 'VOTRE_CLE_API_GEMINI_ICI' || GEMINI_API_KEY === 'VOTRE_CLE_API_ICI')) {
            const fallback = getFallbackResponse(userMessage);
            showBotMessage(fallback);
            conversationHistory.push({ role: 'model', parts: [{ text: fallback }] });
            return;
        }

        try {
            // Use streamGenerateContent for real-time streaming (call secure Vercel Edge Function in prod, direct Google API in dev)
            const url = isVercel 
                ? '/api/gemini'
                : `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

            const body = {
                system_instruction: {
                    parts: [{ text: dynamicSystemPrompt }]
                },
                contents: conversationHistory,
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192,
                    topP: 0.9,
                    thinkingConfig: { thinkingBudget: 0 }  // Désactive le thinking pour réponses rapides
                }
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error?.message || `HTTP ${res.status}`);
            }

            // Remove typing indicator and create the bot message bubble
            const indicator = document.getElementById('typingIndicator');
            if (indicator) indicator.remove();

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message bot';
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.innerHTML = '<i data-lucide="bot"></i>';
            const content = document.createElement('div');
            content.className = 'message-content streaming';
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(content);
            chatHistory.appendChild(messageDiv);
            lucide.createIcons({ root: messageDiv });

            // Stream the response
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr || jsonStr === '[DONE]') continue;
                        try {
                            const chunk = JSON.parse(jsonStr);
                            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            if (text) {
                                fullText += text;
                                content.innerHTML = renderMarkdown(fullText);
                                chatHistory.scrollTop = chatHistory.scrollHeight;
                            }
                        } catch (_) { /* skip malformed chunks */ }
                    }
                }
            }

            // Finalize
            content.classList.remove('streaming');

            // ── Increment question counter ──
            questionsUsed++;
            safeStorage.setItem('procura_q_count', questionsUsed);
            safeStorage.setItem('procura_last_date', new Date().toLocaleDateString());
            
            // Synchroniser le compteur de questions dans Supabase si l'utilisateur est connecté
            if (supabase && currentUser) {
                try {
                    await supabase
                        .from('profiles')
                        .update({ questions_asked: questionsUsed })
                        .eq('id', currentUser.id);
                } catch (dbErr) {
                    console.error("Erreur lors de la mise à jour des questions dans la base de données :", dbErr);
                }
            }

            updateCounter();

            // Si le quota est maintenant épuisé, afficher un message d'invitation aux plans
            if (!hasAccess()) {
                addUpgradePromptMessage();
                lockInput();
            }

            conversationHistory.push({
                role: 'model',
                parts: [{ text: fullText }]
            });
            chatInput.focus();

        } catch (err) {
            console.error('PROCURA AI error:', err);
            showBotMessage(
                `## ⚠️ Erreur de connexion\n\nImpossible de joindre le service PROCURA AI.\n\n**Détail :** ${err.message}\n\n---\n💡 Vérifiez votre clé API ou contactez Bass Consulting.`
            );
        }
    }

    function showBotMessage(text) {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.remove();
        addMessage(text, 'bot');
        chatInput.focus();
    }

    // ── Fallback offline (sans clé API) ───────────────────────
    function getFallbackResponse(userMessage) {
        const q = userMessage.toLowerCase();

        if (q.includes('marché public') && (q.includes("c'est quoi") || q.includes("qu'est") || q.includes('définition') || q.includes('definition'))) {
            return `## 1. Définition\n\nUn **marché public** est un contrat écrit passé à titre onéreux entre une **Autorité Contractante** (État, collectivité, établissement public) et un **opérateur économique** (entreprise, prestataire, fournisseur), en vue de réaliser des travaux, fournir des biens ou des services.\n\n## 2. Base légale\n\n**Article 1er :** *"Au sens de la présente loi, un marché public est un contrat écrit, passé par lequel une ou plusieurs autorités contractantes s'engagent envers un ou plusieurs opérateurs économiques à réaliser des travaux, à fournir des biens ou des services moyennant rémunération."*\n*(Loi n°2020-26 du 29 sept. 2020 — Togo/ARCOP, Titre I, Chapitre I, Art. 1)*\n\n## 3. Les 3 catégories\n\n- **Marchés de Travaux** : construction, réhabilitation, génie civil, routes\n- **Marchés de Fournitures** : acquisition de biens, équipements, matériels\n- **Marchés de Services** : prestations intellectuelles (études, audit, conseil) et services courants (gardiennage, nettoyage)\n\n## 4. Mise en œuvre pratique\n\n- L'autorité contractante identifie un besoin et le planifie dans le PPMP\n- Elle prépare le DAO et lance l'appel d'offres au Journal des marchés publics\n- Les soumissionnaires déposent leurs offres dans les délais\n- La commission d'évaluation analyse les offres selon des critères objectifs\n- Le marché est attribué, signé, exécuté et réceptionné\n\n---\n💡 Pour une analyse approfondie, connectez-vous à votre espace PROCURA.`;
        }

        if (q.includes("appel d'offre") || q.includes('soumission') || q.includes('soumissionner')) {
            return `## Structure d'un DAO (Dossier d'Appel d'Offres)\n\nEn zone UEMOA/ARCOP, un DAO comprend :\n\n- **Volume 1 — Instructions** : Avis d'Appel d'Offres, Instructions aux Candidats (IC), Données Particulières (DPAO)\n- **Volume 2 — Cahier des charges** : CCTP (Clauses Techniques), CCAP (Clauses Administratives et Financières)\n- **Volume 3 — Formulaires** : Lettre de soumission, BPU, DQE, actes d'engagement, modèles de cautions\n\n## Points de vigilance critiques\n\n- Visite de site obligatoire → absence = **rejet immédiat**\n- Garantie de Soumission : 1 à 3% du montant de l'offre\n- Date et heure limite de dépôt à respecter scrupuleusement\n- Validité des offres selon DPAO (généralement 90 à 120 jours)\n\n---\n💡 Pour une analyse approfondie, connectez-vous à votre espace PROCURA.`;
        }

        if (q.includes('recours') || q.includes('contester') || q.includes('plainte')) {
            return `## Procédure de recours (Zone ARCOP/UEMOA)\n\n**Étape 1 — Recours Gracieux**\nDélai : **5 jours ouvrables** après publication des résultats provisoires\nDestinataire : Autorité Contractante par courrier recommandé\n\n**Étape 2 — Recours devant le CRD**\nSi pas de réponse sous **3 jours** ou réponse insatisfaisante :\nDélai : **2 jours ouvrables** pour saisir le CRD de l'ARMP/ARCOP\nLe CRD dispose de **5 jours** pour statuer\n\n**⚠️ Effet suspensif** : la signature du marché est bloquée jusqu'à la décision\n\n**Étape 3 — Recours juridictionnel**\nEn dernier ressort : tribunal administratif compétent\n\n---\n💡 Pour une analyse approfondie, connectez-vous à votre espace PROCURA.`;
        }

        if (q.includes('garantie') || q.includes('caution')) {
            return `## Les garanties dans les marchés publics\n\n- **Garantie de Soumission (Bid Bond)** : 1-3% du montant de l'offre — garantit le sérieux de la candidature\n- **Garantie de Bonne Exécution (Performance Bond)** : 5-10% du marché — remise à la signature\n- **Garantie de Restitution d'Avance** : égale à l'avance reçue — amortie avec les décomptes\n- **Retenue de garantie** : 5-10% prélevés sur chaque paiement — libérée à la réception définitive\n\n---\n💡 Pour une analyse approfondie, connectez-vous à votre espace PROCURA.`;
        }

        if (q.includes('seuil') || q.includes('montant') || q.includes('plafond')) {
            return `## Seuils de passation des marchés publics\n\n**Exemple — Togo (ARCOP, Décret n°2020-091)**\n\n- Moins de 5M FCFA : Bon de commande\n- 5M à 25M FCFA : Demande de Cotation (DC) — 3 fournisseurs minimum\n- 25M à 200M FCFA : Appel d'Offres National (AON)\n- Au-dessus de 200M FCFA : Appel d'Offres International (AOI)\n\n⚠️ Ces seuils varient selon les pays et sont révisés par décret. Précisez votre pays pour les valeurs exactes.\n\n---\n💡 Pour une analyse approfondie, connectez-vous à votre espace PROCURA.`;
        }

        // Generic fallback
        return `## Votre question : "${userMessage}"\n\nPour obtenir une réponse technique précise et en temps réel sur ce sujet, la clé API PROCURA AI doit être activée.\n\nContactez **Bass Consulting** (www.bassconsulting.africa) pour configurer l'assistant intelligent complet.\n\n---\n💡 Connectez-vous à votre espace PROCURA pour accéder à toutes les fonctionnalités.`;
    }

});
