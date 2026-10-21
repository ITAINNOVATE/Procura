// Vercel Edge Function (Multi-Provider API Proxy: Gemini -> Groq -> OpenAI Fallback)
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

async function callGroq(messages, payload, groqKey) {
  // Le palier gratuit de Groq impose une limite stricte de 7 000 tokens/minute.
  // On calibre le message système RAG à max 14 000 caractères (~3 500 tokens)
  // pour garantir que le total reste toujours sous 5 000 tokens et ne bloque jamais.
  const safeMessages = messages.map(msg => {
    if (msg.role === 'system' && msg.content && msg.content.length > 14000) {
      return {
        ...msg,
        content: msg.content.slice(0, 14000) + '\n\n[...Extraits documentaires synthétisés pour le relais rapide Groq...]'
      };
    }
    return msg;
  });

  return await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
      messages: safeMessages,
      temperature: payload.generationConfig?.temperature ?? 0.3,
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

    // ── ÉTAPE 2 : Groq (Secours 1 - Vitesse extrême) ──
    if (groqKey) {
      try {
        console.log('[Proxy] Activating Groq fallback...');
        const groqResponse = await callGroq(getMessages(), payload, groqKey);
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
        return new Response(openAiErr, {
          status: openAiResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (openAiErr) {
        console.error('[Proxy] OpenAI fetch error:', openAiErr.message);
      }
    }

    return new Response(JSON.stringify({
      error: 'Tous les fournisseurs d\'IA ont échoué ou aucune clé n\'est configurée (GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY).'
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
