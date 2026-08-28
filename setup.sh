#!/usr/bin/env bash
#
# setup.sh — Installa Laravel 12 standalone con il modulo Quadranti estratto
# da golf-arbitri-clean. Esegui DALLA CARTELLA del progetto:
#
#     cd /Users/iMac/Sites/laravel-schema-partenze
#     chmod +x setup.sh
#     ./setup.sh
#
# Richiede: php 8.2+, composer, node, npm sul sistema host (Mac).
# Idempotente: se rieseguito, non rifa create-project ma riapplica override.
#
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
OVERRIDES="$ROOT/_overrides_quadranti"

echo "════════════════════════════════════════════════════════════════"
echo "  Setup laravel-schema-partenze (Quadranti standalone)"
echo "  Root: $ROOT"
echo "════════════════════════════════════════════════════════════════"

# ─── Sanity checks ──────────────────────────────────────────────────────
command -v composer >/dev/null 2>&1 || { echo "✗ composer non trovato"; exit 1; }
command -v php      >/dev/null 2>&1 || { echo "✗ php non trovato"; exit 1; }
command -v node     >/dev/null 2>&1 || { echo "✗ node non trovato"; exit 1; }
command -v npm      >/dev/null 2>&1 || { echo "✗ npm non trovato"; exit 1; }

if [ ! -d "$OVERRIDES" ]; then
    echo "✗ Cartella _overrides_quadranti/ non trovata: ti aspettavo a $OVERRIDES"
    exit 1
fi

# ─── STEP 1: composer create-project laravel/laravel ─────────────────────
if [ ! -f "$ROOT/artisan" ]; then
    echo ""
    echo "▶ STEP 1/8: composer create-project laravel/laravel (^12)"
    # Trick: create-project richiede cartella vuota. Sposto temporaneamente
    # gli override fuori, poi li riporto dentro.
    TMP_OVERRIDES="$(mktemp -d)/_overrides_quadranti"
    mv "$OVERRIDES" "$TMP_OVERRIDES"

    # Sposto anche setup.sh fuori per non lasciare residui
    mv "$ROOT/setup.sh" "$(dirname "$TMP_OVERRIDES")/setup.sh"

    # Esegui in cartella ora vuota
    cd "$ROOT"
    composer create-project laravel/laravel:^12 . --no-interaction --prefer-dist

    # Riporta override e setup.sh
    mv "$TMP_OVERRIDES" "$OVERRIDES"
    mv "$(dirname "$TMP_OVERRIDES")/setup.sh" "$ROOT/setup.sh"
    rmdir "$(dirname "$TMP_OVERRIDES")"
else
    echo "▶ STEP 1/8: Laravel già installato, skip create-project"
fi

# ─── STEP 2: composer require phpoffice/phpspreadsheet ───────────────────
echo ""
echo "▶ STEP 2/8: composer require phpoffice/phpspreadsheet"
if ! composer show phpoffice/phpspreadsheet >/dev/null 2>&1; then
    composer require phpoffice/phpspreadsheet --no-interaction
else
    echo "  phpoffice/phpspreadsheet già presente, skip"
fi

# ─── STEP 3: composer require laravel/breeze --dev + install ─────────────
echo ""
echo "▶ STEP 3/8: laravel/breeze (auth blade)"
if ! composer show laravel/breeze >/dev/null 2>&1; then
    composer require laravel/breeze --dev --no-interaction
    php artisan breeze:install blade --no-interaction
else
    echo "  laravel/breeze già presente, skip"
fi

# ─── STEP 4: applica gli override (controller, routes, view, JS) ─────────
echo ""
echo "▶ STEP 4/8: applica override quadranti"
cp -R "$OVERRIDES/app/."                  "$ROOT/app/"
cp -R "$OVERRIDES/routes/."               "$ROOT/routes/"
cp -R "$OVERRIDES/resources/."            "$ROOT/resources/"
cp    "$OVERRIDES/vite.config.js"         "$ROOT/vite.config.js"
cp    "$OVERRIDES/vitest.config.js"       "$ROOT/vitest.config.js"
# Test PHP dei moduli mirrorati (FedergolfTest, QuadrantiTest): senza questa
# riga viaggiava il codice ma non i test che lo proteggono.
# NB: `if`, non `[ ... ] && cp`: con `set -e` un test falso farebbe uscire
# l'intero script.
if [ -d "$OVERRIDES/tests" ]; then
    cp -R "$OVERRIDES/tests/." "$ROOT/tests/"
fi

# ─── STEP 5: patch routes/web.php (require quadranti.php) ────────────────
echo ""
echo "▶ STEP 5/8: patch routes/web.php"
if ! grep -q "require __DIR__.'/quadranti.php'" "$ROOT/routes/web.php"; then
    # Inserisce DOPO le route esistenti, prima di require auth.php
    if grep -q "require __DIR__.'/auth.php'" "$ROOT/routes/web.php"; then
        sed -i.bak "/require __DIR__.'\/auth.php'/i\\
require __DIR__.'/quadranti.php';\\
" "$ROOT/routes/web.php"
    else
        printf "\nrequire __DIR__.'/quadranti.php';\n" >> "$ROOT/routes/web.php"
    fi
    rm -f "$ROOT/routes/web.php.bak"
    echo "  Aggiunto require __DIR__.'/quadranti.php' a routes/web.php"
else
    echo "  routes/web.php già contiene quadranti, skip"
fi

# ─── STEP 6: patch dashboard.blade.php (link a /quadranti) ───────────────
echo ""
echo "▶ STEP 6/8: patch resources/views/dashboard.blade.php"
DASH="$ROOT/resources/views/dashboard.blade.php"
if [ -f "$DASH" ] && ! grep -q "quadranti.index" "$DASH"; then
    # Sostituisce il "You're logged in!" con un link grosso
    cat > "$DASH" << 'EOF'
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Dashboard') }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="bg-white overflow-hidden shadow-sm sm:rounded-lg">
                <div class="p-6 text-gray-900 space-y-4">
                    <p class="text-lg">Benvenuto. Apri il simulatore Quadranti:</p>
                    <a href="{{ route('quadranti.index') }}"
                       class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-md">
                        <i class="fas fa-clock mr-2"></i> Apri Simulatore Tempi di Partenza
                    </a>
                </div>
            </div>
        </div>
    </div>
</x-app-layout>
EOF
    echo "  Aggiornata dashboard con link a Quadranti"
else
    echo "  dashboard.blade.php già patchata, skip"
fi

# ─── STEP 7: php artisan migrate ─────────────────────────────────────────
echo ""
echo "▶ STEP 7/8: php artisan migrate (SQLite di default)"
# Crea database SQLite se manca (Laravel 12 di default)
if [ ! -f "$ROOT/database/database.sqlite" ]; then
    touch "$ROOT/database/database.sqlite"
fi
php artisan migrate --force

# ─── STEP 8: npm install + vitest + build ────────────────────────────────
echo ""
echo "▶ STEP 8/8: npm install + vitest + npm run build"
npm install
# Vitest non è in Breeze di default
if ! npm ls vitest >/dev/null 2>&1; then
    npm install -D vitest jsdom @vitest/coverage-v8
fi

echo ""
echo "▶ Esecuzione test vitest"
npx vitest run || { echo "✗ Test falliti — controlla output"; exit 1; }

echo ""
echo "▶ Build asset Vite (produzione)"
npm run build

# ─── Final summary ───────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✓ Setup completato"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Per avviare:"
echo "    php artisan serve"
echo ""
echo "  Poi apri http://127.0.0.1:8000 — Breeze ti farà registrare."
echo "  Una volta loggato, /quadranti è linkato dalla dashboard."
echo ""
echo "  Per cancellare gli override quando hai finito:"
echo "    rm -rf _overrides_quadranti setup.sh"
echo ""
