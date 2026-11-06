// Vercel Serverless Function — Activation sécurisée du plan après paiement FedaPay
// Vérifie cryptographiquement la transaction FedaPay avant d'activer le profil
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userId, plan, transactionId } = req.body || {};

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
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ';
    const FEDAPAY_SECRET_KEY = process.env.FEDAPAY_SECRET_KEY;

    // Tarifs officiels en FCFA
    const PLAN_PRICES = {
      daily: 600,
      weekly: 1800,
      monthly: 9000,
      annual: 100000
    };

    const adminEmails = ['support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com'];

    // ── 1. Vérification de l'authentification de l'appelant ──
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    let callerUser = null;
    if (token) {
      try {
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
          }
        });
        if (userRes.ok) {
          callerUser = await userRes.json();
        }
      } catch (authErr) {
        console.warn('[activate-plan] Erreur vérification token:', authErr.message);
      }
    }

    const isCallerAdmin = callerUser && callerUser.email && adminEmails.includes(callerUser.email.toLowerCase());

    // Si non-admin, l'utilisateur ne peut activer qu'un plan pour son propre compte
    if (callerUser && callerUser.id !== userId && !isCallerAdmin) {
      return res.status(403).json({ error: 'Action non autorisée pour ce compte.' });
    }

    // ── 2. Vérification rigoureuse du paiement FedaPay pour les plans payants ──
    if (plan !== 'free') {
      const expectedPrice = PLAN_PRICES[plan];

      // Exception : les administrateurs authentifiés peuvent modifier un plan manuellement
      if (!isCallerAdmin) {
        if (!transactionId) {
          return res.status(400).json({ 
            error: 'Identifiant de transaction FedaPay (transactionId) obligatoire pour activer un plan payant.' 
          });
        }

        if (!FEDAPAY_SECRET_KEY) {
          console.error('[activate-plan] FEDAPAY_SECRET_KEY non configurée sur le serveur.');
          return res.status(500).json({ error: 'Configuration de paiement serveur incomplète.' });
        }

        // Interroger l'API officielle FedaPay pour valider la transaction
        const fedapayRes = await fetch(`https://api.fedapay.com/v1/transactions/${encodeURIComponent(transactionId)}`, {
          headers: {
            'Authorization': `Bearer ${FEDAPAY_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!fedapayRes.ok) {
          const fedaErr = await fedapayRes.text();
          console.error(`[activate-plan] FedaPay HTTP ${fedapayRes.status}:`, fedaErr);
          return res.status(402).json({ error: 'Transaction de paiement FedaPay introuvable ou invalide.' });
        }

        const fedapayData = await fedapayRes.json();
        const tx = fedapayData['v1/transaction'] || fedapayData.transaction || fedapayData;

        // Vérifier le statut
        if (!tx || (tx.status !== 'approved' && tx.status !== 'transferred')) {
          return res.status(402).json({ 
            error: `Paiement non confirmé. Statut actuel: ${tx ? tx.status : 'inconnu'}.` 
          });
        }

        // Vérifier que le montant payé correspond au tarif du plan
        if (Number(tx.amount) < expectedPrice) {
          return res.status(402).json({ 
            error: `Montant réglé (${tx.amount} FCFA) inférieur au tarif requis (${expectedPrice} FCFA) pour le plan ${plan}.` 
          });
        }

        console.log(`[activate-plan] ✅ Transaction FedaPay ${transactionId} validée avec succès pour le plan ${plan} (${tx.amount} FCFA).`);
      }
    }

    // ── 3. Mise à jour sécurisée du profil dans Supabase ──
    const supabaseKey = SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
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

    if (!updateRes.ok) {
      console.error(`[activate-plan] Supabase update failed (${updateRes.status}):`, responseText);
      return res.status(500).json({ 
        error: `Erreur lors de l'enregistrement en base: ${updateRes.status}`,
        details: responseText 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Plan ${plan} activé et validé avec succès pour l'utilisateur ${userId}.` 
    });

  } catch (err) {
    console.error('[activate-plan] Erreur inattendue:', err);
    return res.status(500).json({ error: err.message });
  }
}
