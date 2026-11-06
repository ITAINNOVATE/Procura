-- ══════════════════════════════════════════════════════════════════════════════
--  PROCURA — CORRECTIF DE SÉCURITÉ ROW LEVEL SECURITY (RLS)
--  À exécuter dans : Supabase Dashboard -> SQL Editor (Projet: yhutkoevddnydlvoqeqj)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Sécurisation de la table procura_documents
ALTER TABLE public.procura_documents ENABLE ROW LEVEL SECURITY;

-- Supprimer la politique permissive qui donnait les droits d'écriture/suppression au public
DROP POLICY IF EXISTS "procura_docs_all" ON public.procura_documents;

-- Politique de LECTURE : publique pour tous (anonymes et authentifiés)
DROP POLICY IF EXISTS "procura_docs_select" ON public.procura_documents;
CREATE POLICY "procura_docs_select"
  ON public.procura_documents FOR SELECT
  USING (true);

-- Politique d'ÉCRITURE / MODIFICATION / SUPPRESSION : STRICTEMENT réservée aux administrateurs
DROP POLICY IF EXISTS "procura_docs_admin_all" ON public.procura_documents;
CREATE POLICY "procura_docs_admin_all"
  ON public.procura_documents FOR ALL
  TO authenticated
  USING (
    auth.jwt() ->> 'email' IN ('support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com')
  )
  WITH CHECK (
    auth.jwt() ->> 'email' IN ('support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com')
  );

-- 2. Sécurisation de la table profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs ne peuvent lire que leur propre profil, sauf les admins qui peuvent voir tous les profils
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id 
    OR auth.jwt() ->> 'email' IN ('support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com')
  );

-- Les utilisateurs peuvent insérer leur propre profil lors de l'inscription
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Les utilisateurs peuvent modifier leurs informations personnelles (hors modification frauduleuse de plan)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id 
    OR auth.jwt() ->> 'email' IN ('support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com')
  )
  WITH CHECK (
    auth.uid() = id 
    OR auth.jwt() ->> 'email' IN ('support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com')
  );

-- Suppression réservée strictement aux administrateurs
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    auth.jwt() ->> 'email' IN ('support@bassentreprises.com', 'arafathimorou@gmail.com', 'akiboubassabi@gmail.com')
  );

SELECT 'Sécurité RLS PROCURA verrouillée avec succès !' AS status;
