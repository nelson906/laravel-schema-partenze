#!/usr/bin/env bash
#
# migrate-users.sh — Crea il database della nuova app, applica migrations
# di Breeze, e copia la tabella `users` (+ `password_reset_tokens`) dal DB
# di golf-arbitri-clean.
#
# Esegui DALLA CARTELLA del nuovo progetto:
#
#     cd /Users/iMac/Sites/laravel-schema-partenze
#     chmod +x migrate-users.sh
#     ./migrate-users.sh
#
# Idempotente: ricrea le tabelle e re-importa gli users a ogni esecuzione.
# Le password (hash bcrypt) restano valide tra i due database.
#
set -euo pipefail

cd "$(dirname "$0")"

# ─── Config ─────────────────────────────────────────────────────────────
SOURCE_DB="golf_arbitri_clean"   # DB sorgente (riferito da .env del progetto vecchio)
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    echo "✗ .env non trovato in $(pwd) — esegui prima setup.sh"
    exit 1
fi

# Leggi i parametri DB dal .env locale (target)
extract_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'; }
TARGET_DB=$(extract_env DB_DATABASE)
DB_USER=$(extract_env DB_USERNAME)
DB_PASS=$(extract_env DB_PASSWORD)
DB_HOST=$(extract_env DB_HOST)
DB_PORT=$(extract_env DB_PORT)
DB_SOCKET=$(extract_env DB_SOCKET)

if [ -z "$TARGET_DB" ] || [ -z "$DB_USER" ]; then
    echo "✗ DB_DATABASE / DB_USERNAME mancanti in .env"
    exit 1
fi

if [ "$TARGET_DB" = "$SOURCE_DB" ]; then
    echo "✗ DB_DATABASE in .env è '$SOURCE_DB' (uguale al sorgente!)."
    echo "  Cambialo in qualcosa di diverso (es. schema_partenze) prima di proseguire."
    exit 1
fi

# ─── Trova il binario mysql (MAMP) ──────────────────────────────────────
MYSQL_BIN="${MYSQL_BIN:-/Applications/MAMP/Library/bin/mysql}"
if [ ! -x "$MYSQL_BIN" ]; then
    MYSQL_BIN=$(command -v mysql || echo "")
fi
if [ -z "$MYSQL_BIN" ] || [ ! -x "$MYSQL_BIN" ]; then
    echo "✗ Eseguibile 'mysql' non trovato (provo /Applications/MAMP/Library/bin/mysql e PATH)"
    echo "  Imposta MYSQL_BIN=/path/to/mysql ed esegui di nuovo lo script."
    exit 1
fi

# Connection args: privilegia socket MAMP se disponibile, altrimenti host:port
if [ -n "$DB_SOCKET" ] && [ -S "$DB_SOCKET" ]; then
    MYSQL_ARGS=(--socket="$DB_SOCKET" -u "$DB_USER")
else
    MYSQL_ARGS=(-h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER")
fi
if [ -n "$DB_PASS" ]; then
    MYSQL_ARGS+=("-p$DB_PASS")
fi

mysql_exec() { "$MYSQL_BIN" "${MYSQL_ARGS[@]}" "$@"; }

# ─── Sanity: source DB esiste? ──────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Migrazione users: $SOURCE_DB  →  $TARGET_DB"
echo "════════════════════════════════════════════════════════════════"
echo ""

EXISTS=$(mysql_exec -N -B -e "SHOW DATABASES LIKE '$SOURCE_DB';" | wc -l | tr -d ' ')
if [ "$EXISTS" -lt 1 ]; then
    echo "✗ Database sorgente '$SOURCE_DB' non trovato sul server MySQL."
    echo "  Avvia MAMP e verifica che il DB di golf-arbitri-clean esista."
    exit 1
fi

# ─── STEP 1: Crea database target ───────────────────────────────────────
echo "▶ STEP 1/4: CREATE DATABASE IF NOT EXISTS $TARGET_DB"
mysql_exec -e "CREATE DATABASE IF NOT EXISTS \`$TARGET_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# ─── STEP 2: migrate:fresh ──────────────────────────────────────────────
echo ""
echo "▶ STEP 2/4: php artisan migrate:fresh --force"
echo "  (ricrea tutte le tabelle Breeze nel DB target)"
php artisan migrate:fresh --force

# ─── STEP 3: Copia users (solo colonne base Breeze) ─────────────────────
echo ""
echo "▶ STEP 3/4: Copia users da \`$SOURCE_DB\`.users → \`$TARGET_DB\`.users"
SRC_USERS_COUNT=$(mysql_exec -N -B "$SOURCE_DB" -e "SELECT COUNT(*) FROM users;" | tr -d ' ')
echo "  Trovati $SRC_USERS_COUNT user nel DB sorgente"

mysql_exec "$TARGET_DB" <<SQL
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE users;
INSERT INTO users (id, name, email, email_verified_at, password, remember_token, created_at, updated_at)
SELECT id, name, email, email_verified_at, password, remember_token, created_at, updated_at
FROM \`$SOURCE_DB\`.users;
SET FOREIGN_KEY_CHECKS=1;
SQL

DST_USERS_COUNT=$(mysql_exec -N -B "$TARGET_DB" -e "SELECT COUNT(*) FROM users;" | tr -d ' ')
echo "  Importati $DST_USERS_COUNT user nel DB target"
if [ "$SRC_USERS_COUNT" != "$DST_USERS_COUNT" ]; then
    echo "  ⚠ Conteggio diverso (atteso $SRC_USERS_COUNT, ottenuto $DST_USERS_COUNT)"
fi

# ─── STEP 4: Copia password_reset_tokens (se la tabella esiste sul source) ─
echo ""
echo "▶ STEP 4/4: Copia password_reset_tokens (se presenti)"
HAS_PRT=$(mysql_exec -N -B "$SOURCE_DB" -e "SHOW TABLES LIKE 'password_reset_tokens';" | wc -l | tr -d ' ')
if [ "$HAS_PRT" -ge 1 ]; then
    mysql_exec "$TARGET_DB" <<SQL
TRUNCATE TABLE password_reset_tokens;
INSERT INTO password_reset_tokens (email, token, created_at)
SELECT email, token, created_at
FROM \`$SOURCE_DB\`.password_reset_tokens;
SQL
    PRT_COUNT=$(mysql_exec -N -B "$TARGET_DB" -e "SELECT COUNT(*) FROM password_reset_tokens;" | tr -d ' ')
    echo "  Copiati $PRT_COUNT token di reset password"
else
    echo "  Tabella password_reset_tokens non presente sul source, skip"
fi

# ─── Final ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✓ Migrazione completata"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Ora puoi accedere a $TARGET_DB con le STESSE credenziali"
echo "  (email + password) che usi su golf-arbitri-clean."
echo ""
echo "  Per testare:"
echo "    php artisan serve"
echo "    open http://127.0.0.1:8000/login"
echo ""
