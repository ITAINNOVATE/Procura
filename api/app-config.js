// Vercel Serverless Function - Dynamic configuration provider
// Bridges Vercel environment variables to the static frontend client.
export default async function handler(req, res) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://yhutkoevddnydlvoqeqj.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';

  const jsContent = `window.CONFIG = {
    SUPABASE_URL: "${url}",
    SUPABASE_ANON_KEY: "${key}"
  };`;

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(jsContent);
}
