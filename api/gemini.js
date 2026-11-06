// Vercel Edge Function (Multi-Provider API Proxy: Gemini -> Groq -> OpenAI Fallback avec Authentification et Quota Serveur)
export const config = {
  runtime: 'edge',
};

function convertGeminiToOpenAIMessages(payload) {
  const messages = [];

  // 1. System instruction
  if (payload.system_instruction?.parts) {
    const sysText = payload.system_instruction.parts
      .map(p => (typeof p === 'string' ? p : p.text || ''))
      .filter(Boolean)
      .join('\n\n');
    if (sysText) {
      messages.push({ role: 'system', content: sysText });
    }
  }

  // 2. Chat history & conversation
  if (Array.isArray(payload.contents)) {
    for (const item of payload.contents) {
      const role = item.role === 'model' ? 'assistant' : 'user';
      const content = (item.parts || [])
        .map(p => (typeof p === 'string' ? p : p.text || ''))
        .filter(Boolean)
        .join('\n\n');
      if (content) {
        messages.push({ role, content });
      }
    }
  }

  return messages;
}

async function callGroq(messages, payload, groqKey, modelOverride = null, maxCharLimit = 8000) {
  // Le palier gratuit de Groq impose une limite stricte de 7 000 - 8 000 tokens/minute.
  // On calibre le contenu système et contexte RAG à max 8 000 caractères (~2 000 tokens)
  // pour garantir que le total de la requête reste toujours sous 3 000 tokens et ne bloque jamais.
  const safeMessages = messages.map(msg => {
    if (msg.role === 'system' && msg.content && msg.content.length > maxCharLimit) {
      return {
        ...msg,
        content: msg.content.slice(0, maxCharLimit) + '\n\n[...Extraits documentaires synthétisés pour le relais rapide Groq...]'
      };
    }
    return msg;
  });

  const model = modelOverride || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

  return await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: safeMessages,
      temperature: payload.generationConfig?.temperature ?? 0.2,
      max_tokens: Math.min(payload.generationConfig?.maxOutputTokens ?? 2048, 2048),
      stream: true
    })
  });
}

async function callOpenAI(messages, payload, openAiKey) {
  return await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: payload.generationConfig?.temperature ?? 0.3,
      max_tokens: payload.generationConfig?.maxOutputTokens ?? 2048,
      stream: true
    })
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  const sseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  try {
    const payload = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    // ── VÉRIFICATION DE SÉCURITÉ & DE QUOTA (CÔTÉ SERVEUR) ──
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yhutkoevddnydlvoqeqj.supabase.co';
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const adminEmails = ['support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com'];

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Connexion obligatoire pour utiliser l'IA PROCURA
    if (!token) {
      return new Response(JSON.stringify({
        error: { message: "Connexion requise pour interroger l'assistant PROCURA. Veuillez vous connecter ou créer un compte." }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Valider le jeton avec Supabase
    let authenticatedUser = null;
    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      if (userRes.ok) {
        authenticatedUser = await userRes.json();
      }
    } catch (e) {
      console.warn('[Proxy] Erreur validation JWT:', e.message);
    }

    if (!authenticatedUser || !authenticatedUser.id) {
      return new Response(JSON.stringify({
        error: { message: "Session expirée ou invalide. Veuillez vous reconnecter à PROCURA." }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isUserAdmin = authenticatedUser.email && adminEmails.includes(authenticatedUser.email.toLowerCase());

    // Vérifier les quotas en base de données si l'utilisateur n'est pas admin
    if (!isUserAdmin) {
      try {
        const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(authenticatedUser.id)}&select=*`, {
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
          }
        });
        if (profileRes.ok) {
          const profiles = await profileRes.json();
          const userProfile = profiles && profiles[0];
          const plan = (userProfile?.plan || 'free').toLowerCase();
          const asked = Number(userProfile?.questions_asked || 0);

          let maxAllowed = 1; // free
          if (plan === 'annual' || plan === 'monthly') maxAllowed = Infinity;
          else if (plan === 'weekly') maxAllowed = 20;
          else if (plan === 'daily') maxAllowed = 3;

          if (asked >= maxAllowed) {
            return new Response(JSON.stringify({
              error: { message: `Quota de questions atteint pour votre plan actuel (${plan}). Veuillez passer au plan supérieur pour continuer à bénéficier de l'expertise PROCURA.` }
            }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          // Décompter la question de manière asynchrone
          fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(authenticatedUser.id)}`, {
            method: 'PATCH',
            headers: {
              'apikey': SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ questions_asked: asked + 1, updated_at: new Date().toISOString() })
          }).catch(err => console.warn('[Proxy] Erreur incrément quota:', err.message));
        }
      } catch (profErr) {
        console.warn('[Proxy] Erreur vérification quota profil:', profErr.message);
      }
    }

    // ── ÉTAPE 1 : Google Gemini (Principal) ──
    if (geminiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${geminiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          return new Response(response.body, { status: 200, headers: sseHeaders });
        }

        console.warn(`[Proxy] Gemini returned HTTP ${response.status}. Attempting Groq fallback...`);
      } catch (geminiErr) {
        console.warn('[Proxy] Gemini fetch error:', geminiErr.message);
      }
    }

    // Convertir les messages pour les fournisseurs compatibles OpenAI (Groq / OpenAI)
    let openAiMessages = null;
    function getMessages() {
      if (!openAiMessages) openAiMessages = convertGeminiToOpenAIMessages(payload);
      return openAiMessages;
    }

    // ── ÉTAPE 2 : Groq (Secours 1 - Vitesse extrême & multi-modèles) ──
    if (groqKey) {
      try {
        console.log('[Proxy] Activating Groq fallback (Primary: qwen/qwen3.8-27b)...');
        let groqResponse = await callGroq(getMessages(), payload, groqKey, 'qwen/qwen3.8-27b', 8000);
        
        // Si dépassement de quota (HTTP 413 / 429) ou erreur, basculer immédiatement sur openai/gpt-oss-120b
        if (!groqResponse.ok && (groqResponse.status === 413 || groqResponse.status === 429 || groqResponse.status === 400)) {
          console.warn(`[Proxy] Groq primary returned HTTP ${groqResponse.status}. Retrying with openai/gpt-oss-120b and compact context...`);
          groqResponse = await callGroq(getMessages(), payload, groqKey, 'openai/gpt-oss-120b', 5500);
        }

        // Si gpt-oss-120b échoue aussi, tenter openai/gpt-oss-20b
        if (!groqResponse.ok && (groqResponse.status === 413 || groqResponse.status === 429 || groqResponse.status === 400)) {
          console.warn(`[Proxy] Groq secondary returned HTTP ${groqResponse.status}. Retrying with openai/gpt-oss-20b...`);
          groqResponse = await callGroq(getMessages(), payload, groqKey, 'openai/gpt-oss-20b', 4000);
        }

        if (groqResponse.ok) {
          return new Response(groqResponse.body, { status: 200, headers: sseHeaders });
        }
        const groqErr = await groqResponse.text();
        console.warn(`[Proxy] Groq returned HTTP ${groqResponse.status}: ${groqErr}. Attempting OpenAI fallback...`);
      } catch (groqErr) {
        console.warn('[Proxy] Groq fetch error:', groqErr.message);
      }
    }

    // ── ÉTAPE 3 : OpenAI ChatGPT (Secours 2 - Haute robustesse) ──
    if (openAiKey) {
      try {
        console.log('[Proxy] Activating OpenAI fallback...');
        const openAiResponse = await callOpenAI(getMessages(), payload, openAiKey);
        if (openAiResponse.ok) {
          return new Response(openAiResponse.body, { status: 200, headers: sseHeaders });
        }
        const openAiErr = await openAiResponse.text();
        console.error(`[Proxy] OpenAI failed HTTP ${openAiResponse.status}:`, openAiErr);
        // Si OpenAI a un problème de quota, ne pas afficher d'URL brute à l'utilisateur
        let cleanError = "Le service d'assistance IA est temporairement très sollicité. Veuillez patienter 20 à 30 secondes avant de reformuler votre question.";
        try {
          const parsed = JSON.parse(openAiErr);
          if (parsed.error?.code === 'credit_balance_exhausted' || parsed.error?.code === 'insufficient_quota') {
            cleanError = "Les serveurs d'IA rencontrent une forte affluence momentanée. Bass Consulting vous invite à réessayer dans quelques instants.";
          } else if (parsed.error?.message) {
            cleanError = parsed.error.message;
          }
        } catch (_) {}

        return new Response(JSON.stringify({ error: { message: cleanError } }), {
          status: openAiResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (openAiErr) {
        console.error('[Proxy] OpenAI fetch error:', openAiErr.message);
      }
    }

    return new Response(JSON.stringify({
      error: 'Le service IA PROCURA est temporairement indisponible. Veuillez réessayer dans quelques instants ou contacter le support Bass Consulting.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err.message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
