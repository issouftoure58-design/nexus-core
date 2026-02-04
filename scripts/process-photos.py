#!/usr/bin/env python3
"""
Script de traitement des photos pour Fat's Hair-Afro
- Liste les images JPG/PNG du dossier Téléchargements
- Optimise (redimensionnement, compression WebP)
- Évite les doublons (fichiers avec " 2" dans le nom)
- Sauvegarde dans client/public/gallery/
- Génère gallery.json avec métadonnées
"""

import os
import sys
from pathlib import Path
import json

# Vérifier si Pillow est disponible
try:
    from PIL import Image
except ImportError:
    print("❌ Pillow n'est pas installé.")
    print("Installation en cours...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "pillow", "--break-system-packages"])
    from PIL import Image

# Configuration
SOURCE_DIR = Path.home() / "Downloads"
OUTPUT_DIR = Path(__file__).parent.parent / "client" / "public" / "gallery"
JSON_PATH = Path(__file__).parent.parent / "client" / "src" / "data" / "gallery.json"
BACKGROUND_COLOR = (255, 248, 220)  # Crème #FFF8DC
MAX_WIDTH = 1200
MAX_HEIGHT = 1600
WEBP_QUALITY = 85

def process_images():
    """Traite toutes les images du dossier source."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Liste des fichiers à traiter (éviter les doublons " 2")
    image_files = []
    for ext in ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']:
        for file in SOURCE_DIR.glob(f"*{ext}"):
            # Ignorer les doublons (fichiers avec " 2" dans le nom)
            if " 2" in file.stem:
                continue
            # Vérifier que c'est bien une image de coiffure (IMG_xxxx)
            if file.stem.startswith("IMG_"):
                image_files.append(file)

    # Trier par nom
    image_files.sort(key=lambda x: x.name)

    print(f"📷 {len(image_files)} photos trouvées (sans doublons)")
    print(f"📁 Source: {SOURCE_DIR}")
    print(f"📁 Destination: {OUTPUT_DIR}")
    print("-" * 50)

    gallery_data = []
    count = 1

    for file in image_files:
        try:
            print(f"[{count:03d}] Traitement: {file.name}...", end=" ")

            # Ouvrir l'image
            img = Image.open(file)

            # Convertir en RGB si nécessaire (pour RGBA ou autres modes)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Créer un fond crème et coller l'image dessus
                background = Image.new('RGB', img.size, BACKGROUND_COLOR)
                if img.mode == 'P':
                    img = img.convert('RGBA')
                if img.mode in ('RGBA', 'LA'):
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Redimensionner si trop grand
            original_size = img.size
            if img.width > MAX_WIDTH or img.height > MAX_HEIGHT:
                ratio_w = MAX_WIDTH / img.width
                ratio_h = MAX_HEIGHT / img.height
                ratio = min(ratio_w, ratio_h)
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)

            # Sauvegarder en WebP
            output_name = f"coiffure-{count:03d}.webp"
            output_path = OUTPUT_DIR / output_name
            img.save(output_path, "WEBP", quality=WEBP_QUALITY, method=6)

            # Calculer la taille du fichier
            file_size = output_path.stat().st_size / 1024  # Ko

            # Ajouter aux métadonnées
            gallery_data.append({
                "id": count,
                "src": f"/gallery/{output_name}",
                "alt": f"Réalisation coiffure {count} - Fat's Hair-Afro",
                "category": "all",  # À catégoriser manuellement après
                "originalFile": file.name
            })

            print(f"✅ {output_name} ({img.size[0]}x{img.size[1]}, {file_size:.1f}Ko)")
            count += 1

        except Exception as e:
            print(f"❌ Erreur: {e}")
            continue

    # Sauvegarder le JSON
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(gallery_data, f, indent=2, ensure_ascii=False)

    print("-" * 50)
    print(f"✅ {count-1} photos traitées avec succès !")
    print(f"📁 Images: {OUTPUT_DIR}")
    print(f"📄 JSON: {JSON_PATH}")
    print()
    print("💡 Les catégories sont définies sur 'all' par défaut.")
    print("   Modifiez gallery.json pour assigner: locks, tresses, soins, coiffure")

if __name__ == "__main__":
    process_images()
