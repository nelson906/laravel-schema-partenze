# Schema Partenze — Simulatore Tempi di Partenza Golf

Applicazione Laravel standalone per la simulazione dei tempi di partenza (quadranti) nelle gare di golf, nata come spin-off di `golf-arbitri-clean`. Il simulatore esiste solo qui: golf-arbitri-clean lo apre con l'accesso automatico (vedi sotto).

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

## Accesso automatico da golf-arbitri-clean

La voce "Simulatore Tempi Partenza" di golf-arbitri-clean apre questa app con
l'utente gia' collegato (link firmato, valido 60 secondi e una volta sola).
Riconosce l'utente per email; se non esiste lo crea come Utente; un account
disattivato resta fuori. Configurazione, stesso valore nelle due app:

- qui: `SSO_SECRET=...`
- golf-arbitri-clean: `PARTENZE_URL=<indirizzo di questa app>` e `PARTENZE_SSO_SECRET=...`

Segreto vuoto = funzione spenta. Codice: `SsoController`, `App\Support\SsoToken`
(formato identico a `App\Support\PartenzeSsoToken` di golf-arbitri-clean).

## Struttura particolare

Nessuna sincronizzazione di codice con `golf-arbitri-clean` (dal 2026-10): il simulatore vive solo qui, gestione utenti e Aruba Tools evolvono separatamente nelle due app. L'unico punto di contatto è l'accesso automatico (`/sso`).

Gli schemi di gara di riferimento (PDF) sono in `Schemi partenze/`.

## Licenza

Distribuito con licenza [MIT](LICENSE) — Copyright (c) 2026 Alberto Nelson.
