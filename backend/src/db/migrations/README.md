# Database Migrations

## How to run migrations

### Option 1: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy/paste the contents of the migration file
4. Click "Run"

### Option 2: Using psql
```bash
psql $DATABASE_URL -f src/db/migrations/001_add_notification_tracking.sql
```

### Option 3: Using Drizzle Kit
```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Push schema directly to database
npx drizzle-kit push
```

## Migration Files

| File | Description |
|------|-------------|
| `001_add_notification_tracking.sql` | Adds columns to track notification status |

## New Columns Added

| Column | Type | Description |
|--------|------|-------------|
| `whatsapp_confirmation_sent` | BOOLEAN | WhatsApp confirmation after payment |
| `whatsapp_confirmation_date` | TIMESTAMP | When confirmation was sent |
| `whatsapp_rappel_sent` | BOOLEAN | WhatsApp reminder J-1 |
| `whatsapp_rappel_date` | TIMESTAMP | When reminder was sent |
| `remerciement_envoye` | BOOLEAN | Thank you message J+1 |
| `remerciement_date` | TIMESTAMP | When thank you was sent |
| `demande_avis_envoyee` | BOOLEAN | Review request J+2 |
| `demande_avis_date` | TIMESTAMP | When review request was sent |
| `avis_token` | TEXT | Secure token for review form |
| `email_confirmation_sent` | BOOLEAN | Email confirmation sent |
| `email_rappel_sent` | BOOLEAN | Email reminder sent |

## Usage in Code

```javascript
// Check if notification already sent
const rdv = await db.query.rendezvous.findFirst({
  where: eq(rendezvous.id, rdvId)
});

if (!rdv.whatsappConfirmationSent) {
  await sendWhatsAppNotification(rdv);
  await db.update(rendezvous)
    .set({
      whatsappConfirmationSent: true,
      whatsappConfirmationDate: new Date()
    })
    .where(eq(rendezvous.id, rdvId));
}
```
