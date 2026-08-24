-- ══════════════════════════════════════════════════════
--  MIGRATION PROCURA — Table procura_documents
--  A executer dans : Supabase Dashboard -> SQL Editor
--  Projet : yhutkoevddnydlvoqeqj
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.procura_documents (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text        NOT NULL,
  filename    text        NOT NULL DEFAULT '',
  category    text        NOT NULL DEFAULT '',
  path        text        DEFAULT '',
  chunks      integer     DEFAULT 0,
  storage_url text        DEFAULT '',
  first_page_preview text DEFAULT '',
  is_active   boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.procura_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "procura_docs_select" ON public.procura_documents;
CREATE POLICY "procura_docs_select"
  ON public.procura_documents FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "procura_docs_all" ON public.procura_documents;
CREATE POLICY "procura_docs_all"
  ON public.procura_documents FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS procura_documents_updated_at ON public.procura_documents;
CREATE TRIGGER procura_documents_updated_at
  BEFORE UPDATE ON public.procura_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

SELECT 'Table procura_documents creee avec succes !' AS status;
