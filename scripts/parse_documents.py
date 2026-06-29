import os
import json
import re
import traceback
from pypdf import PdfReader
from docx import Document

# Configuration
DOCS_DIR = "Marchés Publics docs"
OUTPUT_JSON = "knowledge_base.json"
CHUNK_SIZE = 3000  # Target character size per chunk (optimized for loading speed)
CHUNK_OVERLAP = 300  # Character overlap between chunks

def clean_text(text):
    """Clean text by removing excessive whitespace and normalizing separators."""
    if not text:
        return ""
    # Replace multiple spaces/newlines with a single space or newline
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\r\n|\r|\n', '\n', text)
    text = re.sub(r'\n+', '\n', text)
    return text.strip()

def get_chunks(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Split text into overlapping chunks of size characters."""
    chunks = []
    if not text:
        return chunks
    
    # If text is smaller than target chunk size, return it as single chunk
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
        folder_name = parts[1]
        if "Bénin" in folder_name:
            return "Bénin"
        elif "Niger" in folder_name:
            return "Niger"
        elif "Congo" in folder_name:
            return "Congo"
        elif "Cameroun" in folder_name:
            return "Cameroun"
        elif "Centrafique" in folder_name:
            return "Centrafique"
        elif "RCI" in folder_name:
            return "Côte d'Ivoire"
        elif "AFD" in folder_name:
            return "AFD (Agence Française de Développement)"
        elif "BAD" in folder_name:
            return "BAD (Banque Africaine de Développement)"
        elif "BID" in folder_name or "IsDB" in folder_name:
            return "BID (Banque Islamique de Développement)"
        elif "THEMATIQUES" in folder_name or "00. THEMATIQUES" in folder_name:
            return "Thématiques"
        elif "caroussels" in folder_name or "Nos caroussels" in folder_name:
            return "Carrousels Pédagogiques"
        else:
            return folder_name
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
        # Extract text from paragraphs
        for p in doc.paragraphs:
            text = p.text.strip()
            if text:
                paragraphs.append(text)
        # Extract text from tables if any
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

    if not os.path.exists(DOCS_DIR):
        print(f"Directory {DOCS_DIR} does not exist!")
        return

    processed_files = set()
    processed_sizes = set()

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

            # Skip template, boilerplate and non-knowledge files
            if any(file_upper.startswith(prefix) for prefix in ["OPE-M", "AFD-M", "MODEL_TENDER_FILE", "DTAO", "TEMPLATE", "FORM-", "DDP-"]):
                print(f"Skipping template file: {file}")
                continue

            # Additional template keywords to skip
            template_keywords = [
                "DEMANDE DE PROPOSITIONS", "DEMANDE_DE_PROPOSITIONS", "DEMANDE-DE-PROPOSITIONS",
                "DOSSIER D'APPEL", "DOSSIER D’APPEL", "DOSSIER_D_APPEL", "DOSSIER-D-APPEL",
                "PREQUALIFICATION", "PRE-QUALIFICATION", "PRÉQUALIFICATION", "PRÉ-QUALIFICATION",
                "TENDER FILE", "TENDER_FILE", "PLAN DE PASSATION", "PLAN_DE_PASSATION", "PLAN-DE-PASSATION",
                "MODELE D", "MODELE_D", "MODEL D", "MODEL_D", "MODEL-D", "MODÈLE D", "MODÈLE_D",
                "ACTE DE NOTIFICATION", "ACTE_DE_NOTIFICATION", "DECISION ATTRIBUTION", "DECISION_ATTRIBUTION",
                "DÉCISION ATTRIBUTION", "DÉCISION_ATTRIBUTION", "DECISION DECLARATION", "DECISION_DECLARATION",
                "LETTRE D'INFORMATION", "LETTRE_D_INFORMATION", "LETTRE D’INFORMATION", "LETTRE_D’INFORMATION",
                "FORMULAIRES DE PASSATION", "FORMULAIRES_DE_PASSATION", "ORDRE DE SERVICE", "ORDRE_DE_SERVICE"
            ]
            if any(kw in file_upper for kw in template_keywords):
                print(f"Skipping template file by keyword: {file}")
                continue

            # Skip Catalogue and English documents
            if "CATALOGUE" in file_upper:
                print(f"Skipping Catalogue: {file}")
                continue
            if any(x in file_upper for x in ["ENG", "ENGLISH", "_EN.", "-EN."]):
                print(f"Skipping English file: {file}")
                continue

            # Deduplicate files by name or size
            file_size = os.path.getsize(file_path)
            if file in processed_files or file_size in processed_sizes:
                print(f"Skipping duplicate file: {file} ({file_size} bytes)")
                continue

            processed_files.add(file)
            processed_sizes.add(file_size)

            print(f"Parsing {file_path} ({category})...")
            
            file_chunks = []
            
            if ext == ".pdf":
                pages = extract_pdf_text(file_path)
                for page_num, page_text in pages:
                    # Split page into chunks if it is too large
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
            
            elif ext == ".doc":
                # doc files are skipped as per implementation plan
                print(f"Skipping legacy format: {file}")
                continue
            
            else:
                # Other non-text files are skipped
                continue

            knowledge_base.extend(file_chunks)

    # Save to JSON
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(knowledge_base, f, ensure_ascii=False, indent=2)

    print(f"Parsing completed. Processed {file_counter} files, generated {len(knowledge_base)} chunks.")
    print(f"Knowledge base saved to {OUTPUT_JSON} (size: {os.path.getsize(OUTPUT_JSON) / 1024 / 1024:.2f} MB).")

if __name__ == "__main__":
    main()
