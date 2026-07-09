// Vercel Serverless Function - Wildcard Proxy for all Supabase traffic (Auth + REST)
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

    // Reconstruct path from Vercel query rewrite wildcard parameter
    const queryPath = req.query.path || '';
    const path = '/' + (Array.isArray(queryPath) ? queryPath.join('/') : queryPath).replace(/^\//, '');

    // Reconstruct query parameters (excluding the 'path' Vercel routing param)
    const queryParams = { ...req.query };
    delete queryParams.path;
    const queryString = new URLSearchParams(queryParams).toString();

    const targetUrl = SUPABASE_TARGET_URL + path + (queryString ? '?' + queryString : '');
    console.log(`[PROXY] ${req.method} ${targetUrl}`);

    // Build headers — always set apikey + authorization
    const headers = {
      'apikey': supabaseKey,
      'authorization': `Bearer ${supabaseKey}`,
      'content-type': 'application/json'
    };

    // Preserve any user-sent authorization (e.g. user JWT for authenticated requests)
    const incomingAuth = req.headers['authorization'] || req.headers['x-sb-auth'] || '';
    if (incomingAuth && !incomingAuth.includes(supabaseKey)) {
      headers['authorization'] = incomingAuth;
    }

    // Pass through optional headers
    const optionalHeaders = ['prefer', 'range', 'accept'];
    for (const h of optionalHeaders) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }

    const fetchOptions = {
      method: req.method,
      headers,
      redirect: 'manual'
    };

    // Serialize body correctly for POST/PUT/PATCH — never re-parse what Vercel already parsed
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.body !== undefined && req.body !== null) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseText = await response.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower !== 'content-encoding' && lower !== 'content-length' && lower !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }

    console.log(`[PROXY] Response: ${response.status}`);
    res.status(response.status).send(responseText);

  } catch (err) {
    console.error('[PROXY] Error:', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message });
  }
}
