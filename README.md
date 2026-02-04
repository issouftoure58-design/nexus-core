# NEXUS Core - Backend API universel

Backend multi-tenant pour la plateforme NEXUS SaaS.

## Stack

- Express.js + TypeScript
- PostgreSQL (Supabase)
- Anthropic Claude (IA)
- Drizzle ORM

## Scripts

```bash
npm run dev       # Serveur de developpement (port 5000)
npm run build     # Build production
npm run start     # Demarrer en production
npm run db:push   # Pousser schema vers DB
```

## Variables d'environnement

Copier `.env.example` vers `.env` et remplir les valeurs.
