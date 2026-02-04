# Migration vers NEXUS Core Unifié

## Pourquoi cette migration ?

Avant, chaque canal avait sa propre logique :
- **halimahAI.js** : SERVICES locaux
- **nexusCore.js** : SERVICES locaux (différents!)
- **ai-tools.ts** : getServiceInfo() avec d'autres données
- **Résultat** : Incohérences entre canaux

Maintenant, tout passe par `businessRules.js` → `nexusCore.js`.

## Comment migrer chaque canal

### 1. WhatsApp

```javascript
// AVANT
import * as halimahAI from '../core/halimahAI.js';
const result = await halimahAI.chat(sessionId, message, 'whatsapp');

// APRÈS
import { processMessage } from '../core/unified/nexusCore.js';
const result = await processMessage(message, 'whatsapp', {
  conversationId: `whatsapp_${from}`,
  phone: from
});
```

### 2. Chat Web

```javascript
// AVANT (dans routes.ts)
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  messages: [...],
  tools: [...]
});

// APRÈS
import { processMessage } from './backend/src/core/unified/nexusCore.js';

app.post('/api/chat', async (req, res) => {
  const { message, conversationId } = req.body;

  const result = await processMessage(message, 'web', {
    conversationId: conversationId || `web_${Date.now()}`
  });

  res.json(result);
});
```

### 3. Téléphone (Twilio Voice)

```javascript
// AVANT
import * as halimahAI from '../core/halimahAI.js';
const result = await halimahAI.chat(sessionId, message, 'phone');

// APRÈS
import { processMessage } from '../core/unified/nexusCore.js';
const result = await processMessage(message, 'phone', {
  conversationId: `voice_${callSid}`,
  phone: from
});
```

### 4. SMS

```javascript
// APRÈS
import { processMessage, clearConversation } from '../core/unified/nexusCore.js';

const result = await processMessage(body, 'sms', {
  conversationId: `sms_${messageSid}`,
  phone: from
});

// Nettoyer après (SMS = conversation unique)
clearConversation(`sms_${messageSid}`);
```

### 5. Halimah Pro (Admin)

```javascript
// APRÈS
import { processMessage } from '../core/unified/nexusCore.js';

const result = await processMessage(message, 'admin', {
  conversationId: `admin_${sessionId}`,
  userId: adminId
});
```

## Fonctions utilitaires disponibles

```javascript
import {
  // Point d'entrée principal
  processMessage,

  // Données verrouillées
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  SALON_INFO,

  // Utilitaires
  findServiceByName,
  getAllServices,
  getServicesByCategory,
  clearConversation,
  invalidateCache
} from '../core/unified/nexusCore.js';
```

## Cache

Le cache est automatique pour :
- Disponibilités (5 min)
- Créneaux disponibles (5 min)

Invalider le cache après modification :
```javascript
invalidateCache('slots_2026-01-25'); // Invalide les créneaux de cette date
invalidateCache('availability_');    // Invalide toutes les disponibilités
```

## Logs

Tous les appels sont loggés avec :
```
[NEXUS CORE] ══════════════════════════════════════
[NEXUS CORE] 📨 WHATSAPP - whatsapp_+33612345678
[NEXUS CORE] Message: "je voudrais prendre rdv pour des locks"
[NEXUS CORE] 🔧 whatsapp → parse_date {"date_text":"demain"}
[NEXUS CORE] ✓ parse_date (2ms)
[NEXUS CORE] ✅ Réponse en 1523ms
[NEXUS CORE] ══════════════════════════════════════
```

## Vérification après migration

Exécuter les tests :
```bash
npm run test:rules
npm run verify
```
