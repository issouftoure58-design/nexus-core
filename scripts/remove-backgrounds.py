#!/usr/bin/env python3
"""
Script de suppression de fond pour les photos de la galerie Fat's Hair-Afro
- Lit les images de client/public/gallery/
- Supprime le fond avec rembg
- Ajoute un fond crème #FFF8DC
- Écrase les fichiers existants
"""

import os
import sys
from pathlib import Path
from PIL import Image
from rembg import remove
import io

# Configuration
GALLERY_DIR = Path(__file__).parent.parent / "client" / "public" / "gallery"
BACKGROUND_COLOR = (255, 248, 220)  # Crème #FFF8DC
WEBP_QUALITY = 85

def process_image(image_path: Path) -> bool:
    """Traite une image: supprime le fond et ajoute un fond crème."""
    try:
        print(f"  Traitement: {image_path.name}...", end=" ", flush=True)

        # Lire l'image
        with open(image_path, "rb") as f:
            input_data = f.read()

        # Supprimer le fond
        output_data = remove(input_data)

        # Ouvrir l'image résultante (avec transparence)
        img_no_bg = Image.open(io.BytesIO(output_data))

        # Créer un nouveau fond crème
        if img_no_bg.mode == 'RGBA':
            background = Image.new('RGB', img_no_bg.size, BACKGROUND_COLOR)
            background.paste(img_no_bg, mask=img_no_bg.split()[3])
            final_img = background
        else:
            final_img = img_no_bg.convert('RGB')

        # Sauvegarder en écrasant le fichier original
        final_img.save(image_path, "WEBP", quality=WEBP_QUALITY, method=6)

        print("OK")
        return True

    except Exception as e:
        print(f"ERREUR: {e}")
        return False

def main():
    """Point d'entrée principal."""
    print("=" * 60)
    print("Suppression des fonds - Fat's Hair-Afro Gallery")
    print("=" * 60)
    print(f"Dossier: {GALLERY_DIR}")
    print(f"Fond: #FFF8DC (crème)")
    print("-" * 60)

    if not GALLERY_DIR.exists():
        print(f"ERREUR: Le dossier {GALLERY_DIR} n'existe pas!")
        sys.exit(1)

    # Lister les images WebP
    images = sorted(GALLERY_DIR.glob("*.webp"))

    if not images:
        print("Aucune image trouvée dans le dossier!")
        sys.exit(1)

    print(f"Nombre d'images: {len(images)}")
    print("-" * 60)

    success_count = 0
    error_count = 0

    for i, image_path in enumerate(images, 1):
        print(f"[{i:03d}/{len(images)}]", end=" ")
        if process_image(image_path):
            success_count += 1
        else:
            error_count += 1

    print("-" * 60)
    print(f"Terminé: {success_count} réussies, {error_count} erreurs")
    print("=" * 60)

if __name__ == "__main__":
    main()
