import os
import json
import re
import traceback
from pypdf import PdfReader
from docx import Document

# Configuration
DOCS_DIRS = ["Marchés Publics docs", "Documents utiles"]  # Répertoires sources
OUTPUT_JSON = "knowledge_base.json"
CHUNK_SIZE = 3000  # Target character size per chunk (optimized for loading speed)
CHUNK_OVERLAP = 300  # Character overlap between chunks

def clean_text(text):
    """Clean text by removing excessive whitespace and normalizing separators."""
    if not text:
        return ""
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\r\n|\r|\n', '\n', text)
    text = re.sub(r'\n+', '\n', text)
    return text.strip()

def get_chunks(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Split text into overlapping chunks of size characters."""
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
    """Determine category based on folder hierarchy."""
    parts = os.path.normpath(root_path).split(os.sep)
    if len(parts) > 1:
        # Chercher la partie significative du chemin (le sous-dossier thématique)
        for folder_name in parts[1:]:
            fn_upper = folder_name.upper()
            # Pays
            if "BENIN" in fn_upper or "BÉNIN" in fn_upper:
                return "Bénin"
            elif "NIGER" in fn_upper and "NIGERIA" not in fn_upper:
                return "Niger"
            elif "CONGO" in fn_upper:
                return "Congo"
            elif "CAMEROUN" in fn_upper:
                return "Cameroun"
            elif "CENTRAFIQUE" in fn_upper or "CENTRAFRIQUE" in fn_upper:
                return "Centrafique"
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
            elif "RDC" in fn_upper:
                return "RDC (Congo-Kinshasa)"
            # Bailleurs
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
            # Thématiques et autres
            elif "THEMATIQUES" in fn_upper or "THÉMATIQUES" in fn_upper:
                return "Thématiques"
            elif "CAROUSSELS" in fn_upper or "CAROUS" in fn_upper:
                return "Carrousels Pédagogiques"
            elif "AUDIT" in fn_upper and "CONTROLE" in fn_upper:
                return "Audit et Contrôle des Finances Publiques"
            elif "DURABILITE" in fn_upper or "DURABILITÉ" in fn_upper:
                return "Marchés Durables"
            elif "AUTRES DOCUMENTS" in fn_upper:
                return "Autres Documents"
    return "Général"

def extract_pdf_text(file_path):
    """Extract page-by-page text from a PDF."""
    pages = []
    try:
        reader = PdfReader(file_path)
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            cleaned = clean_text(text)
            if cleaned:
                pages.append((i + 1, cleaned))
    except Exception as e:
        print(f"Error reading PDF {file_path}: {e}")
    return pages

def extract_docx_text(file_path):
    """Extract text from a docx file as paragraphs."""
    paragraphs = []
    try:
        doc = Document(file_path)
        for p in doc.paragraphs:
            text = p.text.strip()
            if text:
                paragraphs.append(text)
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                if row_text:
                    paragraphs.append(row_text)
    except Exception as e:
        print(f"Error reading DOCX {file_path}: {e}")
    return "\n".join(paragraphs)

def main():
    print("Starting document parsing...")
    knowledge_base = []
    chunk_counter = 0
    file_counter = 0

    processed_files = set()
    processed_sizes = set()

    for DOCS_DIR in DOCS_DIRS:
        if not os.path.exists(DOCS_DIR):
            print(f"Directory {DOCS_DIR} does not exist, skipping.")
            continue

        print(f"\n=== Scanning: {DOCS_DIR} ===")

        for root, dirs, files in os.walk(DOCS_DIR):
            # Skip template directories dynamically
            dirs[:] = [d for d in dirs if not any(x in d.upper() for x in ["DOSSIERS TYPES", "DOSSIERS-TYPES", "DOSSIER_TYPE", "DOSSIER-TYPE"])]

            category = get_category(root)
            for file in files:
                file_path = os.path.join(root, file)
                ext = os.path.splitext(file)[1].lower()

                # Skip temp office files
                if file.startswith("~$") or file.startswith("._"):
                    continue

                file_upper = file.upper()

                # Skip images, Excel, PowerPoint, legacy .doc (non textuel exploitable)
                if ext in [".jpg", ".jpeg", ".png", ".gif", ".xls", ".xlsx", ".ppt", ".pptx", ".doc"]:
                    print(f"Skipping non-text file: {file}")
                    continue

                # Skip template, boilerplate and non-knowledge files
                if any(file_upper.startswith(prefix) for prefix in ["OPE-M", "AFD-M", "MODEL_TENDER_FILE", "DTAO", "TEMPLATE", "FORM-", "DDP-"]):
                    print(f"Skipping template file: {file}")
                    continue

                # Additional template keywords to skip
                template_keywords = [
                    "DEMANDE DE PROPOSITIONS", "DEMANDE_DE_PROPOSITIONS",
                    "DOSSIER D'APPEL", "DOSSIER_D_APPEL", "DOSSIER-D-APPEL",
                    "PREQUALIFICATION", "PRE-QUALIFICATION", "PRÉQUALIFICATION", "PRÉ-QUALIFICATION",
                    "TENDER FILE", "TENDER_FILE",
                    "MODELE D", "MODELE_D", "MODEL D", "MODEL_D", "MODEL-D", "MODÈLE D", "MODÈLE_D",
                    "ACTE DE NOTIFICATION", "DECISION ATTRIBUTION", "DÉCISION ATTRIBUTION",
                    "DECISION DECLARATION", "LETTRE D'INFORMATION", "LETTRE_D_INFORMATION",
                    "FORMULAIRES DE PASSATION", "ORDRE DE SERVICE",
                    "PLAN DE PASSATION", "PLAN_DE_PASSATION", "PLAN-DE-PASSATION",
                    "ANNEXE_A", "ANNEXE_B", "ANNEXE_C", "ANNEXE_D",
                    "PROCUREMENT_PLAN", "PROCUREMENTPLAN", "PPM ", "PPSD",
                    "LOGO", "SANS TITRE", "TEMPLATELETTEROF",
                ]
                if any(kw in file_upper for kw in template_keywords):
                    print(f"Skipping template/plan file: {file}")
                    continue

                # Skip Catalogue and English documents
                if "CATALOGUE" in file_upper:
                    print(f"Skipping Catalogue: {file}")
                    continue
                if any(x in file_upper for x in ["ENG", "ENGLISH", "_EN.", "-EN."]):
                    print(f"Skipping English file: {file}")
                    continue

                # Deduplicate files by name or size
                try:
                    file_size = os.path.getsize(file_path)
                except (OSError, FileNotFoundError) as e:
                    print(f"Skipping (path too long or inaccessible): {file_path[:80]}... ({e})")
                    continue

                if file in processed_files or file_size in processed_sizes:
                    print(f"Skipping duplicate file: {file} ({file_size} bytes)")
                    continue

                processed_files.add(file)
                processed_sizes.add(file_size)

                print(f"Parsing {file_path} [{category}]...")

                file_chunks = []

                try:
                    if ext == ".pdf":
                        pages = extract_pdf_text(file_path)
                        for page_num, page_text in pages:
                            chunks = get_chunks(page_text)
                            for idx, chunk in enumerate(chunks):
                                file_chunks.append({
                                    "id": f"chunk_{chunk_counter}",
                                    "source": file,
                                    "path": file_path.replace("\\", "/"),
                                    "category": category,
                                    "title": f"{file} - Page {page_num}" if len(chunks) == 1 else f"{file} - Page {page_num} (Partie {idx + 1})",
                                    "content": chunk
                                })
                                chunk_counter += 1
                        file_counter += 1

                    elif ext == ".docx":
                        full_text = extract_docx_text(file_path)
                        cleaned = clean_text(full_text)
                        if cleaned:
                            chunks = get_chunks(cleaned)
                            for idx, chunk in enumerate(chunks):
                                file_chunks.append({
                                    "id": f"chunk_{chunk_counter}",
                                    "source": file,
                                    "path": file_path.replace("\\", "/"),
                                    "category": category,
                                    "title": f"{file} - Partie {idx + 1}",
                                    "content": chunk
                                })
                                chunk_counter += 1
                        file_counter += 1

                    else:
                        continue

                except Exception as e:
                    print(f"⚠️  Erreur lors du traitement de {file}: {e}")
                    continue

                knowledge_base.extend(file_chunks)

    # Save to JSON in chunks to avoid GitHub 100MB limit
    CHUNK_SIZE = 8000
    total_chunks = len(knowledge_base)
    num_parts = (total_chunks + CHUNK_SIZE - 1) // CHUNK_SIZE

    for i in range(num_parts):
        part_data = knowledge_base[i*CHUNK_SIZE : (i+1)*CHUNK_SIZE]
        part_filename = f"knowledge_base_part_{i+1}.json"
        with open(part_filename, "w", encoding="utf-8") as f:
            json.dump(part_data, f, ensure_ascii=False, indent=2)
        print(f"Partie {i+1}/{num_parts} sauvegardée dans {part_filename} ({os.path.getsize(part_filename) / 1024 / 1024:.2f} MB)")

    # Write metadata
    meta = {
        "total_chunks": total_chunks,
        "num_parts": num_parts
    }
    with open("knowledge_base_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"\n✅ Parsing terminé. {file_counter} fichiers traités, {total_chunks} chunks générés en {num_parts} parties.")

if __name__ == "__main__":
    main()
