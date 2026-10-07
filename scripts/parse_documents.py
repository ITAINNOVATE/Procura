import os
import sys
import json
import re
import time
from pathlib import Path
from docx import Document

try:
    import pymupdf
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    from pypdf import PdfReader
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

try:
    import olefile
    HAS_OLEFILE = True
except ImportError:
    HAS_OLEFILE = False

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DOCS_DIRS = ["Documents utiles"]
PART_CHUNK_SIZE = 8000
CHUNK_SIZE = 2500
CHUNK_OVERLAP = 250

def to_long_path(p):
    """Gère les chemins longs (> 260 caractères) sous Windows."""
    ap = os.path.abspath(str(p))
    if os.name == 'nt' and not ap.startswith('\\\\?\\'):
        return '\\\\?\\' + ap
    return ap

def clean_text(text):
    """Nettoie le texte en normalisant les espaces et les sauts de ligne."""
    if not text:
        return ""
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\r\n|\r|\n', '\n', text)
    text = re.sub(r'\n+', '\n', text)
    return text.strip()

def get_chunks(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Découpe un texte linéaire en tranches régulières avec chevauchement."""
    chunks = []
    if not text:
        return chunks
    if len(text) <= size:
        return [text]
    start = 0
    while start < len(text):
        end = start + size
        chunk = text[start:end]
        chunks.append(chunk)
        start += (size - overlap)
    return chunks

def get_category(root_path):
    """Détermine la catégorie géographique ou thématique selon l'arborescence."""
    parts = os.path.normpath(root_path).split(os.sep)
    if len(parts) > 1:
        for folder_name in parts[1:]:
            fn_upper = folder_name.upper()
            if "BENIN" in fn_upper or "BÉNIN" in fn_upper:
                return "Bénin"
            elif "NIGER" in fn_upper and "NIGERIA" not in fn_upper:
                return "Niger"
            elif "CONGO" in fn_upper:
                return "Congo"
            elif "CAMEROUN" in fn_upper:
                return "Cameroun"
            elif "CENTRAFIQUE" in fn_upper or "CENTRAFRIQUE" in fn_upper:
                return "Centrafrique"
            elif "TOGO" in fn_upper:
                return "Togo"
            elif "MALI" in fn_upper:
                return "Mali"
            elif "TCHAD" in fn_upper:
                return "Tchad"
            elif "RCI" in fn_upper or "IVOIRE" in fn_upper:
                return "Côte d'Ivoire"
            elif "SENEGAL" in fn_upper or "SÉNÉGAL" in fn_upper:
                return "Sénégal"
            elif "BURKINA" in fn_upper:
                return "Burkina Faso"
            elif "GUINEE" in fn_upper or "GUINÉE" in fn_upper:
                return "Guinée"
            elif "GABON" in fn_upper:
                return "Gabon"
            elif "MAURITANIE" in fn_upper or "MAURITAN" in fn_upper:
                return "Mauritanie"
            elif "RDC" in fn_upper:
                return "RDC (Congo-Kinshasa)"
            elif "BANQUE MONDIALE" in fn_upper or "WORLD BANK" in fn_upper:
                return "Banque Mondiale"
            elif "BOAD" in fn_upper:
                return "BOAD (Banque Ouest-Africaine de Développement)"
            elif "AFD" in fn_upper:
                return "AFD (Agence Française de Développement)"
            elif "BAD" in fn_upper:
                return "BAD (Banque Africaine de Développement)"
            elif "BID" in fn_upper or "ISDB" in fn_upper:
                return "BID (Banque Islamique de Développement)"
            elif "UEMOA" in fn_upper:
                return "UEMOA"
            elif "AIDE EMPLOI" in fn_upper or "EMPLOI" in fn_upper:
                return "Aide Emploi et Recrutement"
            elif "THEMATIQUE" in fn_upper or "THÉMATIQUE" in fn_upper:
                return "Thématiques & Études"
            elif "CERTIFICATION" in fn_upper or "RECHERCHE" in fn_upper:
                return "Certifications & Recherches"
            elif "CARROUSEL" in fn_upper or "CAROUSEL" in fn_upper or "CAROUSSEL" in fn_upper:
                return "Carrousels Pédagogiques"
            elif "AUDIT" in fn_upper and "CONTROLE" in fn_upper:
                return "Audit et Contrôle des Finances Publiques - Normes INTOSAI"
            elif "DURABILITE" in fn_upper or "DURABILITÉ" in fn_upper:
                return "Marchés Durables"
            elif "AUTRES DOCUMENTS" in fn_upper:
                return "Autres Documents"
    return "Général"

def extract_docx_semantic_chunks(file_path, file_title, category):
    """
    Segmentation sémantique avancée pour documents Word (.docx) :
    - Détecte les Articles, Chapitres, Sections, Titres légaux et repères de pages.
    - Transforme les tableaux en Markdown pour une lisibilité parfaite dans l'IA.
    - Regroupe les paragraphes par unité sémantique sans coupure au milieu d'une phrase.
    """
    chunks = []
    try:
        doc = Document(to_long_path(file_path))
    except Exception as e:
        print(f"⚠️ Erreur d'ouverture DOCX {file_path}: {e}")
        return chunks

    # Extraire les paragraphes et les tableaux
    elements = []
    for p in doc.paragraphs:
        t = p.text.strip()
        if not t:
            continue
        style = p.style.name.lower() if p.style else ""
        elements.append(('p', t, style))

    for table in doc.tables:
        rows_txt = []
        for row in table.rows:
            cells = [c.text.strip().replace('\n', ' ') for c in row.cells if c.text.strip()]
            if cells:
                rows_txt.append(' | '.join(cells))
        if rows_txt:
            table_md = '\n'.join(rows_txt)
            elements.append(('table', table_md, 'table'))

    current_chapter = ""
    current_heading = ""
    current_buffer = []
    current_len = 0

    def flush_buffer():
        nonlocal current_buffer, current_len
        if not current_buffer:
            return
        content = "\n".join(current_buffer).strip()
        if content:
            parts = [file_title]
            if current_chapter and current_chapter != current_heading:
                parts.append(current_chapter)
            if current_heading:
                parts.append(current_heading)
            chunk_title = " > ".join(parts)
            chunks.append({
                "title": chunk_title[:200],
                "content": content
            })
        current_buffer = []
        current_len = 0

    re_article = re.compile(r'^(?:article|art\.?)\s*\d+.*', re.IGNORECASE)
    re_chapitre = re.compile(r'^(?:chapitre|section|titre|livre)\s+[IVXLCDM\d]+.*', re.IGNORECASE)
    re_page = re.compile(r'^===\s*Page\s+\d+\s*===', re.IGNORECASE)

    for el_type, text, style in elements:
        is_heading_style = any(h in style for h in ['heading 1', 'heading 2', 'heading 3', 'titre 1', 'titre 2'])
        is_art = bool(re_article.match(text)) and len(text) < 130
        is_chap = bool(re_chapitre.match(text)) and len(text) < 130
        is_page = bool(re_page.match(text))

        # Changement de chapitre ou titre majeur
        if is_chap or (is_heading_style and len(text) < 100):
            flush_buffer()
            current_chapter = text
            current_heading = text
            current_buffer.append(text)
            current_len = len(text)
            continue

        # Changement d'article
        if is_art:
            flush_buffer()
            current_heading = text
            current_buffer.append(text)
            current_len = len(text)
            continue

        # Repère de page (documents issus de conversion PyMuPDF)
        if is_page:
            if current_len > 1500:
                flush_buffer()
                current_heading = text
            current_buffer.append(text)
            current_len += len(text)
            continue

        # Texte normal / tableau
        current_buffer.append(text)
        current_len += len(text)

        # Taille idéale par fragment ~2 500 caractères
        if current_len >= 2500:
            flush_buffer()

    flush_buffer()
    return chunks

def extract_doc_legacy_text(file_path):
    """Extrait le texte brut des fichiers Word 97-2003 (.doc)."""
    try:
        if HAS_OLEFILE and olefile.isOleFile(to_long_path(file_path)):
            ole = olefile.OleFileIO(to_long_path(file_path))
            if ole.exists('WordDocument'):
                stream = ole.openstream('WordDocument').read()
                text_pieces = []
                runs16 = re.findall(rb'(?:[\x20-\x7E\xA0-\xFF\x0A\x0D]\x00){4,}', stream)
                for r in runs16:
                    t = r.decode('utf-16le', errors='ignore').strip()
                    if len(t) > 10 and any(c.isalpha() for c in t):
                        text_pieces.append(t)
                runs8 = re.findall(rb'[\x20-\x7E\xA0-\xFF\x0A\x0D]{5,}', stream)
                for r in runs8:
                    try:
                        t = r.decode('cp1252', errors='ignore').strip()
                        if len(t) > 10 and any(c.isalpha() for c in t):
                            text_pieces.append(t)
                    except Exception:
                        pass
                if text_pieces:
                    seen = set()
                    unique = []
                    for p in text_pieces:
                        if p not in seen:
                            seen.add(p)
                            unique.append(p)
                    joined = "\n".join(unique)
                    if len(joined) > 80:
                        return clean_text(joined)

        with open(to_long_path(file_path), 'rb') as f:
            data = f.read()
        u16 = re.findall(rb'(?:[\x20-\x7E\xA0-\xFF]\x00){4,}', data)
        parts = [s.decode('utf-16le', errors='ignore') for s in u16]
        if not parts or sum(len(p) for p in parts) < 100:
            ascii_s = re.findall(rb'[\x20-\x7E\xA0-\xFF]{4,}', data)
            parts = [s.decode('latin1', errors='ignore') for s in ascii_s]
        return clean_text("\n".join(parts))
    except Exception as e:
        print(f"⚠️ Erreur lecture legacy DOC {file_path}: {e}")
        return ""

def extract_xlsx_text(file_path):
    """Extrait le texte des feuilles de calcul XLSX."""
    if not HAS_OPENPYXL:
        return ""
    try:
        wb = openpyxl.load_workbook(to_long_path(file_path), read_only=True, data_only=True)
        lines = []
        for sheetname in wb.sheetnames:
            ws = wb[sheetname]
            lines.append(f"--- Feuille: {sheetname} ---")
            for row in ws.iter_rows(values_only=True):
                vals = [str(v).strip() for v in row if v is not None and str(v).strip()]
                if vals:
                    lines.append(" | ".join(vals))
        return clean_text("\n".join(lines))
    except Exception as e:
        print(f"⚠️ Erreur lecture XLSX {file_path}: {e}")
        return ""

def extract_pdf_fallback(file_path):
    """Extraction texte pour tout PDF résiduel."""
    pages = []
    if HAS_PYMUPDF:
        try:
            doc = pymupdf.open(to_long_path(file_path))
            for i, p in enumerate(doc):
                t = clean_text(p.get_text() or "")
                if t:
                    pages.append((i + 1, t))
            if pages:
                return pages
        except Exception:
            pass
    if HAS_PYPDF:
        try:
            reader = PdfReader(to_long_path(file_path), strict=False)
            for i, p in enumerate(reader.pages):
                t = clean_text(p.extract_text() or "")
                if t:
                    pages.append((i + 1, t))
        except Exception:
            pass
    return pages

def main():
    print("=" * 75)
    print("🚀 PROCURA - SEGMENTATION SÉMANTIQUE & RÉ-INDEXATION COMPLÈTE")
    print("📌 Traitement prioritaire des documents Word (.docx) avec segmentation juridique")
    print("=" * 75)

    start_time = time.time()
    knowledge_base = []
    chunk_counter = 0
    processed_files = {}

    for docs_dir in DOCS_DIRS:
        if not os.path.exists(docs_dir):
            continue

        print(f"\n📂 Analyse et segmentation dans : {docs_dir}...")

        for root, dirs, files in os.walk(docs_dir):
            category = get_category(root)
            for file in files:
                ext = os.path.splitext(file)[1].lower()

                # Ignorer les fichiers temporaires système
                if file.startswith("~$") or file.startswith("._") or file == "Thumbs.db":
                    continue
                # Ignorer les images pures hors texte
                if ext in [".png", ".jpg", ".jpeg", ".gif", ".webp"]:
                    continue

                file_path = os.path.join(root, file)

                # Dédoublonnage par nom de fichier
                if file in processed_files:
                    continue

                title = file.replace("_", " ").replace("-", " ").rsplit(".", 1)[0].strip()

                catalog_entry = {
                    "filename": file,
                    "title": title,
                    "category": category,
                    "path": file_path.replace("\\", "/"),
                    "chunks": 0,
                    "first_page_preview": ""
                }

                file_chunks = []

                try:
                    # 1. Documents Word DOCX (priorité absolue)
                    if ext == ".docx":
                        raw_chunks = extract_docx_semantic_chunks(file_path, title, category)
                        for idx, rc in enumerate(raw_chunks):
                            file_chunks.append({
                                "id": f"chunk_{chunk_counter}",
                                "source": file,
                                "path": file_path.replace("\\", "/"),
                                "category": category,
                                "title": rc["title"],
                                "content": rc["content"]
                            })
                            chunk_counter += 1
                        if raw_chunks:
                            catalog_entry["first_page_preview"] = raw_chunks[0]["content"][:350]

                    # 2. Documents Word legacy .doc
                    elif ext == ".doc":
                        doc_text = extract_doc_legacy_text(file_path)
                        if doc_text:
                            chunks = get_chunks(doc_text)
                            for idx, c in enumerate(chunks):
                                file_chunks.append({
                                    "id": f"chunk_{chunk_counter}",
                                    "source": file,
                                    "path": file_path.replace("\\", "/"),
                                    "category": category,
                                    "title": f"{title} - Partie {idx + 1}",
                                    "content": c
                                })
                                chunk_counter += 1
                            catalog_entry["first_page_preview"] = doc_text[:350]

                    # 3. Tableurs Excel (.xlsx, .xls)
                    elif ext in [".xlsx", ".xls"]:
                        xlsx_text = extract_xlsx_text(file_path)
                        if xlsx_text:
                            chunks = get_chunks(xlsx_text)
                            for idx, c in enumerate(chunks):
                                file_chunks.append({
                                    "id": f"chunk_{chunk_counter}",
                                    "source": file,
                                    "path": file_path.replace("\\", "/"),
                                    "category": category,
                                    "title": f"{title} - Données Tableur (Partie {idx + 1})",
                                    "content": c
                                })
                                chunk_counter += 1
                            catalog_entry["first_page_preview"] = xlsx_text[:350]

                    # 4. Fichiers texte (.rtf, .txt)
                    elif ext in [".rtf", ".txt"]:
                        try:
                            with open(to_long_path(file_path), "r", encoding="utf-8", errors="ignore") as f:
                                t = clean_text(f.read())
                            if t:
                                chunks = get_chunks(t)
                                for idx, c in enumerate(chunks):
                                    file_chunks.append({
                                        "id": f"chunk_{chunk_counter}",
                                        "source": file,
                                        "path": file_path.replace("\\", "/"),
                                        "category": category,
                                        "title": f"{title} - Texte (Partie {idx + 1})",
                                        "content": c
                                    })
                                    chunk_counter += 1
                                catalog_entry["first_page_preview"] = t[:350]
                        except Exception:
                            pass

                    # 5. Fichiers PDF résiduels
                    elif ext == ".pdf":
                        pages = extract_pdf_fallback(file_path)
                        for page_num, page_text in pages:
                            chunks = get_chunks(page_text)
                            for idx, c in enumerate(chunks):
                                file_chunks.append({
                                    "id": f"chunk_{chunk_counter}",
                                    "source": file,
                                    "path": file_path.replace("\\", "/"),
                                    "category": category,
                                    "title": f"{title} - Page {page_num}" if len(chunks) == 1 else f"{title} - Page {page_num} (Partie {idx + 1})",
                                    "content": c
                                })
                                chunk_counter += 1
                        if pages:
                            catalog_entry["first_page_preview"] = pages[0][1][:350]

                except Exception as ex:
                    print(f"⚠️ Erreur lors du traitement de {file}: {ex}")

                # Si aucun fragment n'a pu être extrait (document scanné sans texte, etc.),
                # créer un fragment sémantique enrichi afin que le document soit trouvable
                if len(file_chunks) == 0:
                    clean_t = title.replace("_", " ").replace("-", " ").strip()
                    doc_content = (
                        f"Document officiel de référence : {clean_t}.\n"
                        f"Catégorie juridique : {category}.\n"
                        f"Fichier source : {file}.\n"
                        f"Ce document est répertorié dans la base documentaire PROCURA pour la juridiction ou le domaine {category}."
                    )
                    file_chunks.append({
                        "id": f"chunk_{chunk_counter}",
                        "source": file,
                        "path": file_path.replace("\\", "/"),
                        "category": category,
                        "title": f"{clean_t} - Référence Officielle ({category})",
                        "content": doc_content
                    })
                    chunk_counter += 1
                    catalog_entry["first_page_preview"] = doc_content[:350]

                catalog_entry["chunks"] = len(file_chunks)
                if not catalog_entry["first_page_preview"]:
                    catalog_entry["first_page_preview"] = f"Document officiel {title} ({category})"

                processed_files[file] = catalog_entry
                knowledge_base.extend(file_chunks)

    # Sauvegarde des parties de la base de connaissances
    total_chunks = len(knowledge_base)
    num_parts = (total_chunks + PART_CHUNK_SIZE - 1) // PART_CHUNK_SIZE if total_chunks > 0 else 1

    print(f"\n💾 Sauvegarde de {total_chunks} chunks sémantiques en {num_parts} parties...")

    for i in range(num_parts):
        part_data = knowledge_base[i*PART_CHUNK_SIZE : (i+1)*PART_CHUNK_SIZE]
        part_filename = f"knowledge_base_part_{i+1}.json"
        with open(part_filename, "w", encoding="utf-8") as f:
            json.dump(part_data, f, ensure_ascii=False, indent=2)
        sz_mb = os.path.getsize(part_filename) / (1024 * 1024)
        print(f"  ✅ {part_filename} : {len(part_data)} chunks ({sz_mb:.2f} MB)")

    # Nettoyer les anciennes parties orphelines éventuelles (ex: si avant il y avait 8 parties et maintenant 5)
    part_idx = num_parts + 1
    while os.path.exists(f"knowledge_base_part_{part_idx}.json"):
        os.remove(f"knowledge_base_part_{part_idx}.json")
        print(f"  🧹 Ancienne partie knowledge_base_part_{part_idx}.json supprimée.")
        part_idx += 1

    # Metadata
    meta = {
        "total_chunks": total_chunks,
        "num_parts": num_parts
    }
    with open("knowledge_base_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    # Catalogue des documents
    catalog = list(processed_files.values())
    catalog.sort(key=lambda x: (x["category"], x["title"]))
    with open("documents_catalog.json", "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    total_time = time.time() - start_time
    print("\n" + "=" * 75)
    print("🎉 INDEXATION SÉMANTIQUE TERMINÉE AVEC SUCCÈS !")
    print(f" - Documents uniques indexés dans le catalogue : {len(catalog)}")
    print(f" - Chunks sémantiques RAG créés                : {total_chunks}")
    print(f" - Fichiers de partition générés               : {num_parts} parties")
    print(f" - Temps total d'exécution                     : {total_time/60:.1f} minutes")
    print("=" * 75)

if __name__ == "__main__":
    main()
