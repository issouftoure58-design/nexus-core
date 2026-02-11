# NEXUS Backend Dev

Workspace de developpement pour la plateforme NEXUS (Fat's Hair / Halimah Salon).

## Architecture

```
PRODUCTION (NE PAS TOUCHER)
===========================
/Users/hobb/Documents/halimah-project/
├── server/          # halimah-api (TypeScript)
│   └── Deploye sur: https://halimah-api.onrender.com
└── .claudeproject   # Lock de protection

DEVELOPPEMENT (TRAVAILLER ICI)
==============================
/Users/hobb/Documents/nexus-backend-dev/
├── backend/
│   └── src/
│       ├── routes/      # Routes API
│       ├── services/    # Services metier
│       ├── controllers/ # Controleurs
│       ├── middleware/  # Auth, rate limiting
│       ├── config/      # Supabase, Sentry, env
│       ├── jobs/        # Bull/Redis jobs
│       └── modules/     # AI, SEO modules
├── .claudeproject       # Config dev
├── check-workspace.sh   # Script verification
└── README.md            # Ce fichier
```

## Services Render

| Service | Type | URL | Status |
|---------|------|-----|--------|
| halimah-api | PRODUCTION | https://halimah-api.onrender.com | LIVE |
| nexus-backend-dev | DEV | https://nexus-backend-dev.onrender.com | LIVE |

## Routes API Disponibles

| Route | Description | Status |
|-------|-------------|--------|
| /health | Health check | Public |
| /api/auth | Authentification | Public |
| /api/crm | Gestion clients | Auth |
| /api/stock | Gestion stocks | Auth |
| /api/seo | Module SEO | Auth |
| /api/rh | Module RH | Auth |
| /api/marketing | Marketing automation | Auth |
| /api/commercial | Gestion commerciale | Auth |
| /api/comptabilite | Comptabilite | Auth |
| /api/factures | Facturation | Auth |
| /api/depenses | Gestion depenses | Auth |
| /api/relances | Relances clients | Auth |
| /api/analytics | Analytics | Auth |

## Workflow de Developpement

```
1. Verifier le workspace
   ./check-workspace.sh

2. Developper dans /backend/src/

3. Tester localement
   cd backend && npm run dev

4. Commit et push
   git add . && git commit -m "Description" && git push

5. Auto-deploy sur Render
   Render detecte le push et deploie automatiquement

6. Verifier le deploy
   curl https://nexus-backend-dev.onrender.com/health
```

## Variables d'Environnement (Render)

Les variables sont configurees sur Render Dashboard:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- JWT_SECRET
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- STRIPE_SECRET_KEY
- SENTRY_DSN
- RESEND_API_KEY
- TWILIO_*
- PAYPAL_*

## Commandes Utiles

```bash
# Verifier le workspace
./check-workspace.sh

# Developper localement
cd backend && npm run dev

# Voir les logs Render
# Via dashboard: https://dashboard.render.com

# Tester les endpoints
curl https://nexus-backend-dev.onrender.com/health
curl https://nexus-backend-dev.onrender.com/api/crm
```

## Regles Importantes

1. **JAMAIS modifier halimah-project** - C'est la production
2. **Toujours travailler dans nexus-backend-dev**
3. **Tester sur nexus-backend-dev.onrender.com avant migration**
4. **Commit regulierement avec messages clairs**

## Historique

- **2026-02-11**: Migration initiale depuis halimah-project
- **2026-02-11**: Creation service Render nexus-backend-dev
- **2026-02-11**: Configuration workspace permanent

## Contact

Repository: https://github.com/Ostive/nexus-backend-dev
