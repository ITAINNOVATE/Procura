// Vercel Edge Function - Dynamic configuration provider
// Bridges Vercel environment variables to the static frontend client.
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://yhutkoevddnydlvoqeqj.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';

  const jsContent = `window.CONFIG = {
    SUPABASE_URL: "${url}",
    SUPABASE_ANON_KEY: "${key}"
  };`;

  return new Response(jsContent, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
