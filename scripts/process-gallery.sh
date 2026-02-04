#!/bin/bash
# Script pour traiter les photos de la galerie

SOURCE_DIR="/Users/hobb/Desktop/photos"
DEST_DIR="/Users/hobb/Documents/halimah-project/client/public/gallery"

mkdir -p "$DEST_DIR"

counter=1

echo "=== Traitement des images ==="

# Traiter les JPG
for file in "$SOURCE_DIR"/*.JPG "$SOURCE_DIR"/*.jpg; do
    if [ -f "$file" ]; then
        filename=$(printf "coiffure-%03d.jpg" $counter)
        echo "Converting: $(basename "$file") -> $filename"
        sips -s format jpeg -Z 1200 "$file" --out "$DEST_DIR/$filename" 2>/dev/null
        ((counter++))
    fi
done

# Traiter les PNG
for file in "$SOURCE_DIR"/*.PNG "$SOURCE_DIR"/*.png; do
    if [ -f "$file" ]; then
        filename=$(printf "coiffure-%03d.jpg" $counter)
        echo "Converting: $(basename "$file") -> $filename"
        sips -s format jpeg -Z 1200 "$file" --out "$DEST_DIR/$filename" 2>/dev/null
        ((counter++))
    fi
done

# Traiter les HEIC
for file in "$SOURCE_DIR"/*.HEIC "$SOURCE_DIR"/*.heic; do
    if [ -f "$file" ]; then
        filename=$(printf "coiffure-%03d.jpg" $counter)
        echo "Converting: $(basename "$file") -> $filename"
        sips -s format jpeg -Z 1200 "$file" --out "$DEST_DIR/$filename" 2>/dev/null
        ((counter++))
    fi
done

echo "=== Terminé: $((counter-1)) images traitées ==="
ls -la "$DEST_DIR" | head -20
