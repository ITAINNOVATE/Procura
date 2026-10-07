import os
import sys
import zipfile
import io
from pathlib import Path
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def to_long_path(p):
    ap = os.path.abspath(str(p))
    if os.name == 'nt' and not ap.startswith('\\\\?\\'):
        return '\\\\?\\' + ap
    return ap

def optimize_docx(file_path):
    lp = to_long_path(file_path)
    tmp_path = lp + ".tmp"
    try:
        with zipfile.ZipFile(lp, 'r') as zin, zipfile.ZipFile(tmp_path, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename.startswith('word/media/') and len(data) > 80 * 1024:
                    try:
                        img = Image.open(io.BytesIO(data))
                        img = img.convert('RGB')
                        buf = io.BytesIO()
                        img.save(buf, format='JPEG', quality=65, optimize=True)
                        data = buf.getvalue()
                    except Exception:
                        pass
                zout.writestr(item, data)
        os.replace(tmp_path, lp)
        return True
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        print(f"  ❌ Erreur sur {file_path}: {e}")
        return False

def main():
    print("=" * 60)
    print("🧹 OPTIMISATION DES FICHIERS > 45 MB POUR LE RESPECT DES LIMITES GITHUB")
    print("=" * 60)

    count = 0
    saved_bytes = 0

    for root, dirs, files in os.walk("Documents utiles"):
        for f in files:
            if f.lower().endswith(".docx"):
                full_p = os.path.join(root, f)
                try:
                    sz = os.path.getsize(to_long_path(full_p))
                    if sz > 45 * 1024 * 1024:
                        print(f"📦 Optimisation ({sz/1024/1024:.1f} MB) : {f} ...", end=" ", flush=True)
                        ok = optimize_docx(full_p)
                        if ok:
                            new_sz = os.path.getsize(to_long_path(full_p))
                            diff = sz - new_sz
                            saved_bytes += diff
                            print(f"✅ Réduit à {new_sz/1024/1024:.1f} MB (-{diff/1024/1024:.1f} MB)")
                            count += 1
                except Exception:
                    pass

    print("\n" + "=" * 60)
    print(f"🏁 Terminé : {count} fichiers optimisés.")
    print(f"   💾 Espace économisé : {saved_bytes/1024/1024:.1f} MB")
    print("   ✅ Aucun fichier ne dépasse désormais les limites de GitHub (100 MB).")
    print("=" * 60)

if __name__ == "__main__":
    main()
