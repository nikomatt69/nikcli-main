# Database Migrations

Questa directory contiene le migrazioni SQL per il database Supabase di NikCLI.

## 🚨 Fix Urgente: Errore "user_profiles does not exist"

Se stai ricevendo l'errore:
```
ERROR: relation "user_profiles" does not exist (SQLSTATE 42P01)
```

Segui questi passaggi per risolvere immediatamente:

### Soluzione Rapida (5 minuti)

1. **Apri Supabase Dashboard**
   - Vai a: https://app.supabase.com
   - Seleziona il tuo progetto

2. **Vai al SQL Editor**
   - Nel menu laterale, clicca su "SQL Editor"
   - Oppure: https://app.supabase.com/project/YOUR_PROJECT/sql

3. **Esegui la Migration**
   - Copia TUTTO il contenuto di `001_create_user_profiles.sql`
   - Incolla nel SQL Editor
   - Clicca "Run" o premi `Ctrl+Enter`

4. **Verifica Installazione**
   ```sql
   -- Esegui questo nel SQL Editor per verificare
   SELECT * FROM public.user_profiles LIMIT 5;
   ```

   Se vedi la tabella (anche vuota), sei a posto! ✅

### Cosa Fa la Migration

La migration `001_create_user_profiles.sql` crea:

- ✅ **Tabella `user_profiles`** con tutti i campi necessari
- ✅ **Trigger automatico** che crea il profilo quando un utente si registra
- ✅ **Row Level Security (RLS)** policies per sicurezza
- ✅ **Indici ottimizzati** per performance
- ✅ **Funzioni utility** per reset usage mensile/orario

### Schema Tabella

```sql
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY,                      -- ID utente da auth.users
  email TEXT,                                -- Email
  username TEXT UNIQUE,                      -- Username univoco
  full_name TEXT,                            -- Nome completo
  avatar_url TEXT,                           -- URL avatar
  subscription_tier TEXT DEFAULT 'free',     -- free | pro | enterprise
  preferences JSONB,                         -- Preferenze utente
  quotas JSONB,                              -- Quote utilizzo
  usage JSONB,                               -- Tracking utilizzo corrente
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Dettagli Migration

### 001_create_user_profiles.sql

**Scopo**: Creare tabella profili utente con RLS e trigger automatici

**Features**:
- 🔐 Row Level Security abilitata
- ⚡ Trigger automatico alla creazione utente
- 📊 Tracking usage con reset automatico
- 🎯 Indici ottimizzati per query comuni
- 🔄 Auto-update `updated_at` timestamp

**Politiche RLS**:
```sql
-- Utenti possono leggere solo il proprio profilo
CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Utenti possono aggiornare solo il proprio profilo
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);
```

### Funzionalità Automatiche

#### 1. Creazione Automatica Profilo

Quando un utente si registra via `auth.users`, viene automaticamente creato il profilo:

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

#### 2. Reset Usage Automatico

Le funzioni `reset_monthly_usage_if_needed()` e `reset_hourly_usage_if_needed()` resettano automaticamente i contatori di utilizzo quando cambia mese/ora.

## Verifica e Testing

### 1. Verifica Tabella Creata

```sql
SELECT table_name, table_schema
FROM information_schema.tables
WHERE table_name = 'user_profiles';
```

### 2. Verifica Trigger

```sql
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'user_profiles';
```

### 3. Verifica Policies RLS

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'user_profiles';
```

### 4. Test Signup

Dopo aver applicato la migration, testa la registrazione:

```bash
# Nel tuo ambiente di test
POST /signup
{
  "email": "test@example.com",
  "password": "SecurePassword123!"
}
```

Verifica che il profilo sia stato creato:

```sql
SELECT id, email, username, subscription_tier, created_at
FROM public.user_profiles
WHERE email = 'test@example.com';
```

## Rollback (Se Necessario)

Se serve annullare la migration:

```sql
-- ⚠️ ATTENZIONE: Questo elimina TUTTI i dati dei profili!

-- Rimuovi trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;

-- Rimuovi funzioni
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.reset_monthly_usage_if_needed(UUID);
DROP FUNCTION IF EXISTS public.reset_hourly_usage_if_needed(UUID);

-- Rimuovi tabella
DROP TABLE IF EXISTS public.user_profiles CASCADE;
```

## Prossimi Steps

Dopo aver applicato questa migration:

1. ✅ Testa la registrazione di nuovi utenti
2. ✅ Verifica che i profili vengano creati automaticamente
3. ✅ Controlla i log per eventuali errori
4. ✅ Configura il monitoring delle quote di utilizzo

## Troubleshooting

### Errore: "permission denied for schema public"

**Soluzione**:
```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
```

### Errore: "function uuid_generate_v4() does not exist"

**Soluzione**:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Trigger non funziona

**Verifica**:
```sql
-- Controlla se il trigger esiste
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Test manuale funzione
SELECT public.handle_new_user();
```

## Supporto

Se incontri problemi:
1. Controlla i log Supabase: Dashboard → Database → Logs
2. Verifica le policies RLS: Dashboard → Authentication → Policies
3. Testa le query SQL direttamente nel SQL Editor
4. Controlla la documentazione Supabase: https://supabase.com/docs

## Migration Future

Le prossime migration verranno numerate sequenzialmente:
- `002_add_user_sessions.sql`
- `003_add_analytics_tracking.sql`
- etc.

Applica sempre le migration in ordine numerico.
