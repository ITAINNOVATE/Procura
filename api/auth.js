// Vercel Edge Function - Supabase Auth Proxy to bypass AdBlock / Antivirus blocks
export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = 'https://yhutkoevddnydlvoqeqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { action, email, password, data: signUpData } = await req.json();

    if (!action || !email || !password) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 });
    }

    let targetUrl = '';
    let payload = {};

    if (action === 'login') {
      targetUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
      payload = { email, password };
    } else if (action === 'signup') {
      targetUrl = `${SUPABASE_URL}/auth/v1/signup`;
      payload = { email, password, data: signUpData };
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const resBody = await response.json();

    return new Response(JSON.stringify(resBody), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
