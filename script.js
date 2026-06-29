document.addEventListener('DOMContentLoaded', () => {

    // ══════════════════════════════════════════════════════════
    //  CONFIGURATION — Remplacez par votre clé API Gemini
    //  Obtenez-la gratuitement sur : https://aistudio.google.com/
    // ══════════════════════════════════════════════════════════
    const GEMINI_API_KEY = (window.CONFIG && window.CONFIG.GEMINI_API_KEY) ? window.CONFIG.GEMINI_API_KEY : ((typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY) ? CONFIG.GEMINI_API_KEY : 'VOTRE_CLE_API_GEMINI_ICI');
    const GEMINI_MODEL   = 'gemini-2.5-flash';

    // ══════════════════════════════════════════════════════════
    //  SUPABASE CONFIGURATION & CLIENT INITIALIZATION
    // ══════════════════════════════════════════════════════════
    const SUPABASE_URL = 'https://yhutkoevddnydlvoqeqj.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';
    const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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

💬 COMPORTEMENT ET TON GÉNÉRAL :
- Professionnel, pédagogique et précis.
- Utilise la terminologie technique : DAO, TDR, BPU, DQE, CCTP, CCAP, Attribution, Recours, DPAO, etc.
- TOUJOURS fournir une réponse technique complète et immédiate, avec des données réelles.
- Structurer les réponses avec des titres markdown (##), sous-titres (###), listes (-), et gras (**).
- À la fin de chaque réponse, ajouter : "💡 Pour une analyse approfondie, connectez-vous à votre espace PROCURA."

📌 STRUCTURE OBLIGATOIRE DES RÉPONSES :
1. **Définition / Réponse directe** : réponse claire et immédiate
2. **Base légale** : article de loi, directive, ou source officielle applicable
3. **Explication détaillée** : contexte, mécanisme, conditions
4. **Mise en œuvre pratique** : étapes concrètes, délais, montants, formulaires
5. **Conseils Bass Consulting** : recommandations stratégiques basées sur l'expertise du cabinet

⚠️ RÈGLES STRICTES :
- Ne jamais inventer de procédure inexistante.
- Toujours préciser l'origine de la règle (pays, bailleur, loi).
- Utiliser en priorité absolue les informations du bloc <context> fourni pour répondre de manière exacte et à jour.
- Citer explicitement le document source et la page si disponible (ex: "Source: Décret seuils Bénin (Page 2)" ou "Source: Directives BAD (Page 15)").
- Répondre en français sauf si l'utilisateur écrit en anglais.`;

    // Historique de conversation pour le contexte multi-tour
    let conversationHistory = [];

    // Base de connaissances locale (RAG client-side)
    let knowledgeBase = null;


    // ── Freemium — Compteur de questions gratuites (Reset journalier) ─────────
    const FREE_LIMIT = 1;
    let questionsUsed = 0;
    
    function initQuota() {
        const lastDate = localStorage.getItem('procura_last_date');
        const today = new Date().toLocaleDateString();
        
        if (lastDate !== today) {
            // Nouveau jour : reset
            localStorage.setItem('procura_q_count', '0');
            localStorage.setItem('procura_last_date', today);
            questionsUsed = 0;
        } else {
            questionsUsed = parseInt(localStorage.getItem('procura_q_count') || '0');
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
    function searchKnowledge(query, limit = 4) {
        if (!knowledgeBase || !query) return "";

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

        // Calcul de pertinence pour chaque chunk
        const scoredChunks = knowledgeBase.map(chunk => {
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
                    score += 100; // Big bonus for category match!
                    categoryMatch = true;
                }

                // Title match (higher weight, max 3 matches)
                let titleMatches = 0;
                titleNorm.forEach(w => {
                    if (w === word) titleMatches += 5;
                    else if (w.includes(word)) titleMatches += 1.5;
                });
                score += Math.min(titleMatches, 15);

                // Content match (cap to avoid long files dominating)
                let contentMatches = 0;
                contentNorm.forEach(w => {
                    if (w === word) contentMatches += 1;
                    else if (w.includes(word)) contentMatches += 0.2;
                });
                score += Math.min(contentMatches, 5);
            });

            // If the query mentions a country but this chunk is from a different country category, penalize it!
            const countries = ["benin", "niger", "congo", "cameroun", "centrafique", "centrafrique", "ivoire", "rci"];
            const queryHasCountry = queryWords.some(w => countries.includes(w));
            const chunkCategory = chunk.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const chunkHasCountry = countries.some(c => chunkCategory.includes(c));

            if (queryHasCountry && chunkHasCountry && !categoryMatch) {
                score -= 80; // Penalize mismatching country
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
        let contextMarkdown = "\n\n<context>\nVoici des informations et règles issues des documents officiels de Bass Consulting et des régulateurs. Utilise-les pour répondre avec précision :\n\n";
        results.forEach((chunk, index) => {
            contextMarkdown += `--- SOURCE ${index + 1} : ${chunk.title} [Catégorie: ${chunk.category}] (Fichier: ${chunk.source}) ---\n`;
            contextMarkdown += `${chunk.content}\n\n`;
        });
        contextMarkdown += "</context>";

        return contextMarkdown;
    }

    loadKnowledgeBase();

    function hasAccess() {
        if (!userProfile) {
            return questionsUsed < FREE_LIMIT;
        }

        const plan = userProfile.plan || 'free';
        if (plan === 'monthly' || plan === 'annual') {
            return true;
        }
        if (plan === 'weekly') {
            return questionsUsed < 20;
        }
        if (plan === 'daily') {
            return questionsUsed < 3;
        }
        return questionsUsed < FREE_LIMIT;
    }

    function updateCounter() {
        const counterText = document.getElementById('counterText');
        const counterEl   = document.getElementById('questionCounter');
        if (!counterText) return;

        let plan = 'free';
        let limit = FREE_LIMIT;

        if (userProfile) {
            plan = userProfile.plan || 'free';
            if (plan === 'monthly' || plan === 'annual') {
                counterText.innerHTML = `🌟 <strong>Plan ${plan === 'monthly' ? 'Mensuel' : 'Annuel'}</strong> — Questions illimitées`;
                counterEl.classList.remove('counter-exhausted');
                return;
            }
            if (plan === 'weekly') limit = 20;
            if (plan === 'daily') limit = 3;
        }

        const remaining = Math.max(0, limit - questionsUsed);

        if (remaining === 0) {
            counterText.innerHTML = '🔒 Quota gratuit épuisé — <strong>Choisissez un plan</strong> pour continuer';
            counterEl.classList.add('counter-exhausted');
        } else {
            const color = remaining === 1 ? '#e55' : 'var(--color-gold)';
            counterText.innerHTML = `💡 <strong style="color:${color}">${remaining} question${remaining > 1 ? 's' : ''} ${plan === 'free' ? 'gratuite' : 'restante'}${remaining > 1 ? 's' : ''}</strong> restante${remaining > 1 ? 's' : ''}`;
            counterEl.classList.remove('counter-exhausted');
        }
    }

    function lockInput() {
        const box   = document.getElementById('chatInputBox');
        const input = document.getElementById('chatInput');
        const btn   = document.getElementById('chatSendBtn');
        if (box)   box.classList.add('input-locked');
        if (input) { input.disabled = true; input.placeholder = 'Inscrivez-vous pour continuer...'; }
        if (btn)   btn.disabled = true;
    }

    function showPaywall() {
        const modal = document.getElementById('paywallModal');
        const backTop = document.getElementById('paywallBackTop');
        if (modal) {
            modal.classList.remove('hidden');
            modal.scrollTop = 0;
        }
        if (backTop) backTop.classList.remove('visible');
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
                localStorage.setItem('procura_q_count', questionsUsed);
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
        if (userEmailEl) userEmailEl.textContent = currentUser.email;
        
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

        updateCounter();
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
        const allSteps = ['stepPlans', 'stepProfile', 'stepForm'];
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
        const badge     = document.getElementById('regProfileBadge');
        if (profile === 'agent') {
            badge.textContent  = 'AGENT PUBLIC / PROFESSIONNEL';
            badge.className    = 'reg-profile-badge badge-agent';
        } else {
            badge.textContent  = 'OPÉRATEUR ÉCONOMIQUE / ENTREPRENEUR';
            badge.className    = 'reg-profile-badge badge-operateur';
        }
        // Clear previous email / confirmation
        document.getElementById('regEmail').value = '';
        document.getElementById('regConfirmation').classList.add('hidden');

        document.getElementById('stepProfile').classList.add('hidden');
        document.getElementById('stepForm').classList.remove('hidden');
    };

    window.handleRegSubmit = async function() {
        const emailInput = document.getElementById('regEmail');
        const email = emailInput.value.trim();
        const submitBtn = document.querySelector('.reg-submit-btn');
        const confirmationEl = document.getElementById('regConfirmation');

        if (!email || !email.includes('@')) {
            emailInput.focus();
            emailInput.style.borderColor = '#e55';
            return;
        }
        emailInput.style.borderColor = '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Envoi en cours...';
        }

        if (supabase) {
            try {
                const { error } = await supabase.auth.signInWithOtp({
                    email: email,
                    options: {
                        emailRedirectTo: window.location.origin,
                        data: {
                            plan: selectedPlan || 'free',
                            profile_type: selectedProfile || 'agent'
                        }
                    }
                });

                if (error) throw error;

                if (confirmationEl) {
                    confirmationEl.textContent = "✅ Un lien d'accès sécurisé a été envoyé par email. Ouvrez-le pour vous connecter.";
                    confirmationEl.classList.remove('hidden');
                }
                emailInput.disabled = true;
            } catch (err) {
                console.error("Supabase signin error:", err);
                alert("Erreur d'authentification : " + err.message);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Recevoir le lien d'accès";
                }
            }
        } else {
            if (confirmationEl) {
                confirmationEl.classList.remove('hidden');
            }
            emailInput.disabled = true;
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
            goToStep('stepPlans');
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
        if (!hasAccess()) { showPaywall(); return; }
        addMessage(message, 'user');
        getBotResponse(message);
        chatInput.style.height = 'auto';
    }

    // ── Message rendering ──────────────────────────────────────
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
        const dynamicSystemPrompt = retrievedContext 
            ? `${SYSTEM_PROMPT}\n\n${retrievedContext}`
            : SYSTEM_PROMPT;

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
                    temperature: 0.4,
                    maxOutputTokens: 2048,
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
            localStorage.setItem('procura_q_count', questionsUsed);
            localStorage.setItem('procura_last_date', new Date().toLocaleDateString());
            
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
