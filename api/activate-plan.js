// Vercel Serverless Function — Activation sécurisée du plan après paiement FedaPay
// Utilise la clé service_role pour bypasser les règles RLS de Supabase
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userId, plan } = req.body;

    if (!userId || !plan) {
      return res.status(400).json({ error: 'userId et plan sont requis.' });
    }

    // Valider que le plan est autorisé
    const validPlans = ['free', 'daily', 'weekly', 'monthly', 'annual'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: `Plan invalide: ${plan}` });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yhutkoevddnydlvoqeqj.supabase.co';
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SERVICE_ROLE_KEY) {
      // Fallback: utiliser la clé anon si pas de service role key configurée
      console.warn('[activate-plan] SUPABASE_SERVICE_ROLE_KEY non configurée, utilisation de la clé anon.');
    }

    const supabaseKey = SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';

    // Mettre à jour le plan dans la table profiles avec la clé service_role (bypass RLS)
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ 
        plan: plan,
        questions_asked: 0,
        updated_at: new Date().toISOString()
      })
    });

    const responseText = await updateRes.text();
    console.log(`[activate-plan] Supabase response ${updateRes.status}:`, responseText);

    if (!updateRes.ok) {
      return res.status(500).json({ 
        error: `Erreur Supabase: ${updateRes.status}`,
        details: responseText 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Plan ${plan} activé avec succès pour l'utilisateur ${userId}.` 
    });

  } catch (err) {
    console.error('[activate-plan] Erreur:', err);
    return res.status(500).json({ error: err.message });
  }
}
