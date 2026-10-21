// Vercel Edge Function (Secure Multi-Provider API Proxy: Gemini + Groq Fallback)
export const config = {
  runtime: 'edge',
};

function convertGeminiToGroq(payload) {
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

  return {
    model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
    messages,
    temperature: payload.generationConfig?.temperature ?? 0.3,
    max_tokens: payload.generationConfig?.maxOutputTokens ?? 2048,
    stream: true
  };
}

async function callGroq(payload, groqKey) {
  const groqBody = convertGeminiToGroq(payload);
  return await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify(groqBody)
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

    // 1. Essayer d'abord Google Gemini si la clé est présente
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

        // Si Gemini échoue (ex: 429 quota dépassé, 403, 500)
        console.warn(`[Gemini Proxy] Gemini returned HTTP ${response.status}. Attempting fallback...`);
      } catch (geminiErr) {
        console.warn('[Gemini Proxy] Gemini fetch failed:', geminiErr.message);
      }
    }

    // 2. Basculer de manière transparente sur Groq si disponible
    if (groqKey) {
      console.log('[Gemini Proxy] Activating Groq fallback stream...');
      const groqResponse = await callGroq(payload, groqKey);
      if (groqResponse.ok) {
        return new Response(groqResponse.body, { status: 200, headers: sseHeaders });
      }

      const groqErrText = await groqResponse.text();
      console.error('[Gemini Proxy] Groq fallback also failed:', groqResponse.status, groqErrText);
      return new Response(groqErrText, {
        status: groqResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: 'Aucun fournisseur d\'IA configuré ou disponible (GEMINI_API_KEY / GROQ_API_KEY).'
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
