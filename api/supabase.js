// Vercel Edge Function - Wildcard Proxy for all Supabase traffic (Auth + REST)
// Bypasses AdBlock / Antivirus blocks by proxying all requests through the same domain.
export const config = {
  runtime: 'edge',
};

const SUPABASE_TARGET_URL = process.env.SUPABASE_URL || 'https://yhutkoevddnydlvoqeqj.supabase.co';

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
    const path = url.pathname.replace(/^\/api\/supabase/, '');
    
    // Construct target URL
    const targetUrl = new URL(path + url.search, SUPABASE_TARGET_URL).toString();

    // Prepare headers
    const headers = new Headers();
    const allowedHeaders = [
      'content-type',
      'apikey',
      'authorization',
      'prefer',
      'range',
      'accept',
      'user-agent'
    ];
    for (const [key, value] of req.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey)) {
        headers.set(key, value);
      }
    }

    // Read body if method has one (arrayBuffer resolves without stream hangs in Vercel Edge functions)
    let body = null;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      body = await req.arrayBuffer();
    }

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
