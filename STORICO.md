# Storico interventi e decisioni

Traccia condensata dei report eliminati: `AUDIT_2026-05-23.md`, `REPORT_TEE_UNICO_2026-05-26.md`, `AUDIT_2026-06-10.md`.

---

## Audit 23/05/2026 → 10/06/2026

Due audit completi. Esito 10/06: **mantenere e rifinire, non riscrivere**. Stratificazione bassa (CSS 1/10, JS 3/10, Blade 2/10, PHP 4/10, Architettura 4/10).

### Risolto (verificato 10/06 e in sessione pomeriggio)

- `composer.json`/`.lock` rimossi da `.gitignore`, ora tracciati
- Copertura test PHP: aggiunti `AccessControlTest`, `FedergolfTest`, `QuadrantiTest`, `ProfileTest`, `Admin/UserManagementTest`
- Registrazione pubblica disattivata (route `register` rimosse) + cancellati file morti `RegisteredUserController.php` e `register.blade.php`
- Mirror `_overrides_*` riallineati (diff = 0)
- `database.sqlite` rimosso dal repo; `DatabaseSeeder` ripulito (niente Test User)
- Fix `is_active` al login (utente disattivato bloccato)
- Path traversal in `databaseRestore()`: `basename()` + whitelist `.sql`
- `@tailwindcss/vite` disinstallato (dipendenza morta v4 vs build v3)
- `.ftp-deploy-sync-state.json` in `.gitignore`
- jQuery UI aggiornato + SRI su script CDN
- Route legacy `storage-link.index` rimossa

### Ancora aperto

- 🟢 Password MySQL su riga di comando in `SystemOperations::backupDatabase()/restoreDatabase()` (visibile in `ps aux`) → usare `--defaults-extra-file`
- 🟢 Naming route misto: `admin.users.*` vs `aruba.admin.*`; prefisso Federgolf `user/federgolf` residuo di golf-arbitri-clean

### Suggerimenti non urgenti (da audit, quando si tocca l'area)

- Estrarre `getCoordinates()` (effemeridi ~90 righe) in service; tabelle FIG da `quadranti.js` a `config.js`
- Valutare estrazione/riduzione "Aruba Tools" (~1.200 righe fuori dominio)
- Eventuale split `quadranti-logic.js` (1.888 righe) solo con test a copertura
- Niente fallback silenziosi (`getCoordinates` → 06:30/18:30) né `getMessage()` al client (`loadAllCompetitions`)

---

## Verifica TEE UNICO 26/05/2026

Verifica di tutti i formati con tee unico contro i PDF in `Schemi partenze/`. Suite finale: 183/183 test (oggi 211).

### Decisioni registrate (vincolanti)

- **72 buche, 4° giro**: scelta **Opzione B** — resta `gender: 'men'` (donne 54 buche, non giocano il 4° giro). La doppia tabella nel `72 buche.pdf` è duplicato di layout (sezione 4° giro identica byte-per-byte alla 3°). Nessuna modifica codice. 2 test di regressione impongono il men-only.
- **Direttiva**: per i formati senza PDF tee unico dedicato si applica la logica del 54 buche.
- **Patrocinate/Trofei Giovanili 2° giro tee unico**: segue 54 `'seconda'` (qualifying-reverse), interpretazione testuale della direttiva. Zona grigia documentata, nessun PDF la smentisce.

### Modifiche applicate

- Tee unico **abilitato** per Gara Giovanile e Teodoro Soldati (`tee: ['double','single']` in `config.js`, logica 54 `'prima'`) + 4 test di regressione. Replicato nel mirror `_overrides_quadranti`.
- Corretti 4 assert vacui dual-tee: `'color:red'` → `'color: red'` (con spazio) — i test passavano senza verificare nulla.

### Note tecniche utili

- `BLOCK_GAP = '00:06'` hardcoded: stacco tra blocchi = gap + 6 min
- Formati CSS donne diversi: `generateDoubleTee` → `color: red` (spazio), `generateSingleTee` → `color:red`
- Commento fuorviante in `quadranti-logic.js` ~riga 1901 (split asimmetrico vale solo per uomini, non donne) — patch opzionale mai applicata

---

*File attivi: `README.md` (panoramica), `MODELLO_QUADRANTI.md` (proposta motore unico renderQuadranti, non implementata, mantenuta valida), `CLAUDE.md` (istruzioni).*
