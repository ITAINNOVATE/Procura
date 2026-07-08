// Vercel Edge Function - Wildcard Proxy for all Supabase traffic (Auth + REST)
// Bypasses AdBlock / Antivirus blocks by proxying all requests through the same domain.
export const config = {
  runtime: 'edge',
};

const SUPABASE_TARGET_URL = 'https://yhutkoevddnydlvoqeqj.supabase.co';

export default async function handler(req) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    const url = new URL(req.url);
    // Extract the path after /api/supabase
    // e.g. /api/supabase/auth/v1/token -> /auth/v1/token
    let path = url.pathname.replace(/^\/api\/supabase/, '');
    
    // Dé-obfusquer le chemin
    if (path.includes('/secure-t')) {
      path = path.replace('/secure-t', '/auth/v1/token');
    } else if (path.includes('/secure-s')) {
      path = path.replace('/secure-s', '/auth/v1/signup');
    } else if (path.includes('/secure-u')) {
      path = path.replace('/secure-u', '/auth/v1/user');
    }
    
    // Construct target URL
    const targetUrl = new URL(path + url.search, SUPABASE_TARGET_URL).toString();

    // Prepare headers - only forward safe and standard headers to avoid CDN/WAF blockages (like spoofed CF/Vercel headers)
    const headers = new Headers();
    const allowedHeaders = [
      'content-type',
      'apikey',
      'x-sb-key', // Notre entête obfusquée
      'authorization',
      'prefer',
      'range',
      'accept',
      'user-agent'
    ];
    for (const [key, value] of req.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey)) {
        if (lowerKey === 'x-sb-key') {
          headers.set('apikey', value); // Restaurer apikey
        } else {
          headers.set(key, value);
        }
      }
    }

    // Stream the body directly to avoid memory buffering hangs
    const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? null : req.body;

    // Forward request to Supabase
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: body,
      redirect: 'manual'
    });

    // Copy response headers, omitting compression and encoding headers that are handled by the runtime
    const resHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== 'content-encoding' &&
        lowerKey !== 'content-length' &&
        lowerKey !== 'transfer-encoding'
      ) {
        resHeaders.set(key, value);
      }
    }
    // Ensure CORS is allowed
    resHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders
    });

  } catch (err) {
    console.error("Supabase Proxy Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
