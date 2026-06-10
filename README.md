# Schema Partenze — Simulatore Tempi di Partenza Golf

Applicazione Laravel standalone per la simulazione dei tempi di partenza (quadranti) nelle gare di golf, estratta dal progetto `golf-arbitri-clean` e mantenuta in sincronia tramite le cartelle `_overrides_*`.

## Funzionalità

- **Simulatore quadranti** — generazione tempi di partenza per gare 36/54/72 buche, tee unico e doppio, gestione blocchi uomini/donne, calcolo effemeridi (alba/tramonto) per area geografica
- **Caricamento iscritti** — import da file Excel (fogli Atleti/Atlete) o direttamente da federgolf.it
- **Gestione utenti** — CRUD con ruoli (super_admin, admin, user), attivazione/disattivazione account
- **Aruba Tools** — pannello manutenzione per hosting condiviso: cache, log, permessi, backup/restore database, monitoraggio server (solo super_admin)

## Stack

Laravel 12 · PHP 8.2+ · MySQL · Vite · Tailwind CSS 3 · Alpine.js · jQuery UI (datepicker) · Vitest

## Installazione

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
# configurare DB in .env
php artisan migrate --seed
npm run build
```

Primo super admin: `php artisan db:seed --class=PromoteFirstSuperAdminSeeder`

## Sviluppo

```bash
php artisan serve
npm run dev
```

## Test

```bash
php artisan test   # test PHP (Feature: auth, access control, quadranti, federgolf)
npm test           # test JS (211 test, incluse suite di regressione quadranti)
```

## Struttura particolare

Le cartelle `_overrides_quadranti/` e `_overrides_admin/` sono mirror dei file condivisi con `golf-arbitri-clean` e vanno tenute in sincronia: ogni modifica ai file mirrorati va replicata nella copia corrispondente. I file fuori dai mirror (es. auth, bootstrap) vanno portati a mano nell'altro progetto.

Gli schemi di gara di riferimento (PDF) sono in `Schemi partenze/`.

## Licenza

Distribuito con licenza [MIT](LICENSE) — Copyright (c) 2026 Alberto Nelson.
