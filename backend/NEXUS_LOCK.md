# NEXUS CORE - SYSTEME VERROUILLE

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   ██╗      ██████╗  ██████╗██╗  ██╗███████╗██████╗                            ║
║   ██║     ██╔═══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗                           ║
║   ██║     ██║   ██║██║     █████╔╝ █████╗  ██║  ██║                           ║
║   ██║     ██║   ██║██║     ██╔═██╗ ██╔══╝  ██║  ██║                           ║
║   ███████╗╚██████╔╝╚██████╗██║  ██╗███████╗██████╔╝                           ║
║   ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═════╝                            ║
║                                                                               ║
║   SYSTEME NEXUS CORE - ARCHITECTURE VERROUILLEE                               ║
║   Date de verrouillage : 25 janvier 2025                                      ║
║   Validé par : Issouf                                                         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

## AVERTISSEMENT

**CE SYSTEME EST VERROUILLE. TOUTE MODIFICATION NON AUTORISEE EST INTERDITE.**

Pour modifier quoi que ce soit dans ce système, vous devez :
1. Obtenir l'autorisation écrite du propriétaire (Issouf/Fatou)
2. Comprendre l'impact sur TOUS les composants dépendants
3. Mettre à jour ce document après modification
4. Faire valider par le SENTINEL avant déploiement

---

## FICHIERS VERROUILLES - NIVEAU CRITIQUE

### 1. SOURCE UNIQUE DE VERITE
```
backend/src/config/businessRules.js  [LOCKED - NIVEAU MAXIMUM]
```
- Contient : SERVICES, TRAVEL_FEES, BUSINESS_HOURS, BOOKING_RULES
- Statut : **Object.freeze() appliqué - IMMUTABLE**
- Toute modification = INTERDIT sans autorisation

### 2. FICHIERS DEPENDANTS (NIVEAU HAUT)
```
backend/src/core/nexusCore.js        [LOCKED]
backend/src/core/halimahAI.js        [LOCKED]
backend/src/services/bookingService.js [LOCKED]
backend/src/utils/tarification.js    [LOCKED]
backend/src/services/aiGeneratorService.js [LOCKED]
```

Ces fichiers IMPORTENT depuis businessRules.js et ne doivent PAS :
- Redéfinir des constantes de prix
- Hardcoder des valeurs de frais de déplacement
- Créer de nouvelles sources de vérité

---

## VALEURS OFFICIELLES VERROUILLEES

### Frais de déplacement
```javascript
TRAVEL_FEES = {
  BASE_DISTANCE_KM: 8,      // Kilomètres inclus dans le forfait
  BASE_FEE: 10,             // Euros - forfait de base
  PER_KM_BEYOND: 1.10       // Euros par km au-delà de 8km
}
```
**Formule : 10€ (0-8km) + 1.10€/km au-delà**

### Horaires
```javascript
BUSINESS_HOURS = {
  Lundi:    09:00 - 18:00
  Mardi:    09:00 - 18:00
  Mercredi: 09:00 - 18:00
  Jeudi:    09:00 - 13:00  (demi-journée)
  Vendredi: 13:00 - 18:00  (après-midi)
  Samedi:   09:00 - 18:00
  Dimanche: FERME
}
```

### Services et Prix
| Service | Prix | Durée |
|---------|------|-------|
| Création crochet locks | 200€ | 8h |
| Création microlocks crochet | 300€+ | 16h (2j) |
| Création microlocks twist | 150€+ | 8h |
| Reprise racines locks | 50€ | 2h |
| Reprise racines micro-locks | 100€ | 4h |
| Décapage de locks | 35€ | 1h |
| Soin complet | 50€ | 1h |
| Soin hydratant | 40€ | 1h |
| Shampoing | 10€ | 30min |
| Braids | 60€+ | 5h |
| Nattes collées sans rajout | 20€+ | 1h |
| Nattes collées avec rajout | 40€+ | 2h |
| Teinture sans ammoniaque | 40€ | 40min |
| Décoloration | 20€ | 10min |
| Brushing cheveux afro | 20€ | 1h |

---

## ARCHITECTURE DU VERROUILLAGE

```
                    ┌─────────────────────────────────┐
                    │      businessRules.js           │
                    │   [LOCKED - SOURCE UNIQUE]      │
                    │                                 │
                    │  • SERVICES (Object.freeze)     │
                    │  • TRAVEL_FEES (Object.freeze)  │
                    │  • BUSINESS_HOURS (Object.freeze)│
                    │  • BOOKING_RULES (Object.freeze)│
                    └───────────────┬─────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │  nexusCore.js   │   │  halimahAI.js   │   │ bookingService  │
    │    [LOCKED]     │   │    [LOCKED]     │   │    [LOCKED]     │
    │                 │   │                 │   │                 │
    │ import depuis   │   │ import depuis   │   │ import depuis   │
    │ businessRules   │   │ businessRules   │   │ businessRules   │
    └─────────────────┘   └─────────────────┘   └─────────────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │         SENTINEL.js             │
                    │   [VALIDATEUR AU DEMARRAGE]     │
                    │                                 │
                    │  Vérifie la cohérence de        │
                    │  toutes les dépendances         │
                    └─────────────────────────────────┘
```

---

## REGLES DE VERROUILLAGE

### INTERDIT
- Ajouter des constantes de prix dans d'autres fichiers
- Modifier les valeurs sans mettre à jour businessRules.js
- Créer de nouvelles "sources de vérité"
- Hardcoder des valeurs (10€, 1.10€, 8km, etc.)
- Copier-coller des valeurs au lieu d'importer

### OBLIGATOIRE
- Toujours importer depuis businessRules.js
- Utiliser TRAVEL_FEES.calculate() pour les frais
- Utiliser BUSINESS_HOURS.SCHEDULE pour les horaires
- Utiliser SERVICES pour les prix et durées
- Exécuter SENTINEL avant tout déploiement

---

## PROCEDURE DE MODIFICATION (si autorisée)

1. **Demande d'autorisation**
   - Contacter Issouf/Fatou
   - Expliquer la raison de la modification
   - Obtenir validation écrite

2. **Modification**
   - Modifier UNIQUEMENT businessRules.js
   - Exécuter les tests de validation
   - Vérifier que SENTINEL passe

3. **Documentation**
   - Mettre à jour ce fichier NEXUS_LOCK.md
   - Ajouter la date et la raison de modification
   - Commit avec message explicite

4. **Déploiement**
   - Tester en staging
   - Valider avec le propriétaire
   - Déployer en production

---

## HISTORIQUE DES MODIFICATIONS

| Date | Modification | Validé par |
|------|--------------|------------|
| 25/01/2025 | Création du système de verrouillage | Issouf |
| 25/01/2025 | Refactoring NEXUS Core compliance | Issouf |

---

## CONTACT

Pour toute demande de modification :
- **Propriétaire** : Issouf
- **Business** : Fat's Hair-Afro
- **Téléphone** : 07 82 23 50 20
