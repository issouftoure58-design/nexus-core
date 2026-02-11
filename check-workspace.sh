#!/bin/bash
# ============================================
# SCRIPT DE VERIFICATION WORKSPACE
# ============================================
# Vérifie que l'environnement de travail est correct
# Usage: ./check-workspace.sh

echo "========================================"
echo "VERIFICATION WORKSPACE NEXUS"
echo "========================================"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# 1. Vérifier le répertoire courant
echo "1. Vérification du répertoire de travail..."
CURRENT_DIR=$(pwd)
if [[ "$CURRENT_DIR" == *"nexus-backend-dev"* ]]; then
    echo -e "   ${GREEN}OK${NC} - Workspace nexus-backend-dev"
elif [[ "$CURRENT_DIR" == *"halimah-project"* ]]; then
    echo -e "   ${RED}ATTENTION${NC} - Vous êtes dans halimah-project (PRODUCTION)"
    echo -e "   ${YELLOW}>>> Passez à nexus-backend-dev pour développer${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "   ${YELLOW}WARNING${NC} - Répertoire inconnu: $CURRENT_DIR"
fi
echo ""

# 2. Vérifier les fichiers .claudeproject
echo "2. Vérification des fichiers .claudeproject..."
if [ -f "/Users/hobb/Documents/halimah-project/.claudeproject" ]; then
    echo -e "   ${GREEN}OK${NC} - halimah-project/.claudeproject existe"
else
    echo -e "   ${YELLOW}WARNING${NC} - halimah-project/.claudeproject manquant"
fi

if [ -f "/Users/hobb/Documents/nexus-backend-dev/.claudeproject" ]; then
    echo -e "   ${GREEN}OK${NC} - nexus-backend-dev/.claudeproject existe"
else
    echo -e "   ${RED}ERREUR${NC} - nexus-backend-dev/.claudeproject manquant"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Vérifier les services Render
echo "3. Vérification des services Render..."
echo "   Production: https://halimah-api.onrender.com"
PROD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://halimah-api.onrender.com/health 2>/dev/null)
if [ "$PROD_STATUS" == "200" ]; then
    echo -e "   ${GREEN}OK${NC} - halimah-api en ligne (HTTP $PROD_STATUS)"
else
    echo -e "   ${YELLOW}WARNING${NC} - halimah-api status: HTTP $PROD_STATUS"
fi

echo "   Dev: https://nexus-backend-dev.onrender.com"
DEV_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://nexus-backend-dev.onrender.com/health 2>/dev/null)
if [ "$DEV_STATUS" == "200" ]; then
    echo -e "   ${GREEN}OK${NC} - nexus-backend-dev en ligne (HTTP $DEV_STATUS)"
else
    echo -e "   ${YELLOW}WARNING${NC} - nexus-backend-dev status: HTTP $DEV_STATUS"
fi
echo ""

# 4. Vérifier la structure backend
echo "4. Vérification de la structure backend..."
REQUIRED_DIRS=(
    "backend/src/routes"
    "backend/src/services"
    "backend/src/controllers"
    "backend/src/middleware"
    "backend/src/config"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "/Users/hobb/Documents/nexus-backend-dev/$dir" ]; then
        echo -e "   ${GREEN}OK${NC} - $dir"
    else
        echo -e "   ${RED}ERREUR${NC} - $dir manquant"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# 5. Vérifier les routes critiques
echo "5. Vérification des routes critiques..."
REQUIRED_ROUTES=(
    "crm.js"
    "stock.js"
    "seo.js"
    "rh.js"
    "marketing.js"
    "comptabilite.js"
)

for route in "${REQUIRED_ROUTES[@]}"; do
    if [ -f "/Users/hobb/Documents/nexus-backend-dev/backend/src/routes/$route" ]; then
        echo -e "   ${GREEN}OK${NC} - routes/$route"
    else
        echo -e "   ${RED}ERREUR${NC} - routes/$route manquant"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# 6. Vérifier Git
echo "6. Vérification Git..."
if [ -d ".git" ]; then
    BRANCH=$(git branch --show-current 2>/dev/null)
    echo -e "   ${GREEN}OK${NC} - Repo Git initialisé"
    echo "   Branche: $BRANCH"

    REMOTE=$(git remote get-url origin 2>/dev/null)
    if [ -n "$REMOTE" ]; then
        echo "   Remote: $REMOTE"
    fi
else
    echo -e "   ${YELLOW}WARNING${NC} - Pas de repo Git"
fi
echo ""

# Résumé
echo "========================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}WORKSPACE VALIDE - Pret pour le developpement${NC}"
else
    echo -e "${RED}$ERRORS ERREUR(S) DETECTEE(S)${NC}"
    echo "Corrigez les erreurs avant de continuer"
fi
echo "========================================"

exit $ERRORS
