#!/usr/bin/env bash
#
# setup-admin.sh — Aggiunge al progetto Laravel standalone:
#   - Sistema super_admin + admin (UserType enum, middleware, CRUD users)
#   - Aruba Tools (pannello manutenzione completo)
#   - Patch bootstrap/app.php per registrare middleware alias
#   - Patch routes/web.php per includere admin.php e maintenance.php
#   - Migration user_type + is_active sulla tabella users
#   - Seeder che promuove il primo user a super_admin
#
# Esegui DALLA CARTELLA del progetto:
#
#     cd /Users/iMac/Sites/laravel-schema-partenze
#     chmod +x setup-admin.sh
#     ./setup-admin.sh
#
# Richiede: setup.sh già eseguito + migrate-users.sh già eseguito.
# Idempotente: se rieseguito, non duplica nulla.
#
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
OVERRIDES="$ROOT/_overrides_admin"

echo "════════════════════════════════════════════════════════════════"
echo "  Setup admin + Aruba Tools (laravel-schema-partenze)"
echo "════════════════════════════════════════════════════════════════"

# ─── Sanity ─────────────────────────────────────────────────────────────
if [ ! -f "$ROOT/artisan" ]; then
    echo "✗ Laravel non installato in $ROOT — esegui prima ./setup.sh"
    exit 1
fi
if [ ! -d "$OVERRIDES" ]; then
    echo "✗ _overrides_admin/ non trovato — assicurati che la cartella sia stata creata"
    exit 1
fi

# ─── STEP 1: Copia override (enum, middleware, model, controller, view) ─
echo ""
echo "▶ STEP 1/6: Copia file admin + aruba-admin"
cp -R "$OVERRIDES/app/."                    "$ROOT/app/"
cp -R "$OVERRIDES/resources/."              "$ROOT/resources/"
cp -R "$OVERRIDES/routes/."                 "$ROOT/routes/"
cp -R "$OVERRIDES/database/."               "$ROOT/database/"
echo "  ✓ File copiati"

# ─── STEP 2: Patch bootstrap/app.php (registrazione middleware alias) ───
echo ""
echo "▶ STEP 2/6: patch bootstrap/app.php (alias middleware)"
BOOTSTRAP="$ROOT/bootstrap/app.php"
if grep -q "'super_admin' => " "$BOOTSTRAP"; then
    echo "  Già patchato, skip"
else
    # Inserisce alias dentro withMiddleware closure
    # Cerco il pattern ->withMiddleware(function (Middleware $middleware) {
    # e ci inserisco $middleware->alias([...]); subito dopo l'apertura.
    php -r "
\$file = '$BOOTSTRAP';
\$src  = file_get_contents(\$file);
\$insert = \"\\n        \\\$middleware->alias([\\n            'super_admin' => \\\\App\\\\Http\\\\Middleware\\\\SuperAdmin::class,\\n            'admin'       => \\\\App\\\\Http\\\\Middleware\\\\AdminAccess::class,\\n        ]);\\n\";
if (preg_match('/->withMiddleware\\(function \\(Middleware \\\$middleware\\) \\{/', \$src)) {
    \$src = preg_replace(
        '/(->withMiddleware\\(function \\(Middleware \\\$middleware\\) \\{)/',
        '\$1'.\$insert,
        \$src
    );
} else {
    fwrite(STDERR, 'Pattern withMiddleware non trovato, patch manuale necessaria.\\n');
    exit(1);
}
file_put_contents(\$file, \$src);
echo 'Patch applicata.\\n';
"
fi

# ─── STEP 3: Patch routes/web.php (require admin.php + maintenance.php) ─
echo ""
echo "▶ STEP 3/6: patch routes/web.php"
WEB="$ROOT/routes/web.php"
for INCLUDE in 'admin' 'maintenance'; do
    if ! grep -q "require __DIR__.'/$INCLUDE.php'" "$WEB"; then
        if grep -q "require __DIR__.'/auth.php'" "$WEB"; then
            sed -i.bak "/require __DIR__.'\\/auth.php'/i\\
require __DIR__.'/${INCLUDE}.php';\\
" "$WEB"
        else
            printf "\nrequire __DIR__.'/%s.php';\n" "$INCLUDE" >> "$WEB"
        fi
        echo "  ✓ Aggiunto require __DIR__.'/${INCLUDE}.php'"
    else
        echo "  - require __DIR__.'/${INCLUDE}.php' già presente"
    fi
done
rm -f "$WEB.bak"

# ─── STEP 4: migrate (solo le nuove migration) ──────────────────────────
echo ""
echo "▶ STEP 4/6: php artisan migrate (aggiunge user_type + is_active)"
php artisan migrate --force

# ─── STEP 5: promuovi primo user a super_admin ──────────────────────────
echo ""
echo "▶ STEP 5/6: php artisan db:seed PromoteFirstSuperAdminSeeder"
if [ -n "${SUPERADMIN_EMAIL:-}" ]; then
    echo "  Userò SUPERADMIN_EMAIL=$SUPERADMIN_EMAIL"
fi
php artisan db:seed --class=PromoteFirstSuperAdminSeeder --force

# ─── STEP 6: clear cache route/view ─────────────────────────────────────
echo ""
echo "▶ STEP 6/6: clear cache route/view/config"
php artisan optimize:clear

# ─── Final ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✓ Admin + Aruba Tools installati"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Login con l'utente che hai promosso a super_admin."
echo "  Nel menu troverai 'Utenti' (admin/super_admin) e 'Aruba Tools' (super_admin)."
echo ""
echo "  Se devi promuovere un altro user a super_admin:"
echo "    SUPERADMIN_EMAIL=mario@example.com php artisan db:seed --class=PromoteFirstSuperAdminSeeder"
echo "  (funziona solo se nessuno è super_admin; altrimenti edita via /admin/users)"
echo ""
