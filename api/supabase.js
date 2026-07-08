// Vercel Serverless Function - Wildcard Proxy for all Supabase traffic (Auth + REST)
// Uses Node.js runtime for stable body buffering and proxying.
export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  try {
    const SUPABASE_TARGET_URL = process.env.SUPABASE_URL || 'https://yhutkoevddnydlvoqeqj.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';

    // Extract path: e.g. /api/supabase/auth/v1/token -> /auth/v1/token
    const path = req.url.replace(/^\/api\/supabase/, '');
    const targetUrl = SUPABASE_TARGET_URL + path;

    // Prepare headers
    const headers = {};
    const allowedHeaders = [
      'content-type',
      'apikey',
      'x-sb-key',
      'authorization',
      'x-sb-auth',
      'prefer',
      'range',
      'accept',
      'user-agent'
    ];

    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey)) {
        if (lowerKey === 'x-sb-key') {
          headers['apikey'] = value;
        } else if (lowerKey === 'x-sb-auth') {
          headers['authorization'] = value;
        } else {
          headers[key] = value;
        }
      }
    }

    // Force/inject API key headers if missing in the incoming request
    if (!headers['apikey']) {
      headers['apikey'] = supabaseKey;
    }
    if (!headers['authorization']) {
      headers['authorization'] = `Bearer ${supabaseKey}`;
    }

    // Forward the request using standard node fetch
    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'manual'
    };

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // req.body is already parsed as an object or string by Vercel
      fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseText = await response.text();

    // Copy response headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== 'content-encoding' &&
        lowerKey !== 'content-length' &&
        lowerKey !== 'transfer-encoding'
      ) {
        res.setHeader(key, value);
      }
    }

    res.status(response.status).send(responseText);

  } catch (err) {
    console.error("Supabase Proxy Error:", err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message });
  }
}
