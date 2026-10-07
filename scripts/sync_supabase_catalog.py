import os
import sys
import json
import time
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SUPABASE_URL = "https://yhutkoevddnydlvoqeqj.supabase.co"
SUPABASE_KEY = "sb_publishable__joMXcg0O_T1FSwR_3241g_x0MSmaqJ"
CATALOG_FILE = "documents_catalog.json"

def main():
    print("=" * 65)
    print("🚀 SYNCHRONISATION DU CATALOGUE VERS SUPABASE (ESPACE ADMIN)")
    print("=" * 65)

    if not os.path.exists(CATALOG_FILE):
        print(f"❌ {CATALOG_FILE} introuvable.")
        return

    with open(CATALOG_FILE, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    print(f"📖 {len(catalog)} documents chargés depuis {CATALOG_FILE}.")

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 1. Vider les anciens documents de procura_documents pour repartir sur une base propre
    print("\n🧹 Nettoyage des anciens enregistrements dans procura_documents...")
    del_url = f"{SUPABASE_URL}/rest/v1/procura_documents?id=not.is.null"
    del_req = urllib.request.Request(del_url, headers=headers, method="DELETE")
    try:
        with urllib.request.urlopen(del_req) as del_res:
            print("✅ Table procura_documents réinitialisée.")
    except Exception as e:
        print(f"⚠️ Erreur lors de la réinitialisation : {e}")

    # 2. Insérer les 1 420 documents par lots de 100
    insert_url = f"{SUPABASE_URL}/rest/v1/procura_documents"
    BATCH_SIZE = 100
    total = len(catalog)
    inserted_count = 0

    print(f"\n📤 Envoi des {total} documents vers Supabase par lots de {BATCH_SIZE}...")
    t0 = time.time()

    for i in range(0, total, BATCH_SIZE):
        batch_slice = catalog[i : i + BATCH_SIZE]
        payload = []
        for d in batch_slice:
            payload.append({
                "title": d.get("title") or d.get("filename") or "Document sans titre",
                "filename": d.get("filename", ""),
                "category": d.get("category", "Général"),
                "path": d.get("path", ""),
                "chunks": d.get("chunks", 1),
                "storage_url": "",
                "first_page_preview": d.get("first_page_preview", "")[:500],
                "is_active": True
            })

        data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(insert_url, data=data_bytes, headers=headers, method="POST")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req) as res:
                    inserted_count += len(payload)
                    percent = (inserted_count / total) * 100
                    print(f"  [{inserted_count}/{total}] ({percent:.1f}%) insérés avec succès.")
                    break
            except Exception as ex:
                if attempt < max_retries - 1:
                    time.sleep(1)
                else:
                    print(f"  ❌ Erreur lot {i} : {ex}")

    dur = time.time() - t0
    print("\n" + "=" * 65)
    print(f"🏁 SYNCHRONISATION TERMINÉE en {dur:.1f}s !")
    print(f"   ✅ {inserted_count} documents actifs dans Supabase pour l'Espace Admin.")
    print("=" * 65)

if __name__ == "__main__":
    main()
