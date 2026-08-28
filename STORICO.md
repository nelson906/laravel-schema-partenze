# Storico interventi e decisioni

Traccia condensata dei report eliminati: `AUDIT_2026-05-23.md`, `REPORT_TEE_UNICO_2026-05-26.md`, `AUDIT_2026-06-10.md`.

---

## Messaggi Federgolf 28/08/2026

Caricando in `/quadranti` una gara con **iscrizioni non ancora chiuse** compariva
`⚠ Errore di rete nel caricamento degli iscritti`: messaggio falso (la rete
funzionava) e inutile. Causa: in `handleFedergolfGaraSelected()` un unico
`try/catch` copriva fetch **e** interpretazione, e qualsiasi rigetto di `$.ajax`
(sessione scaduta 419, 401, 422, 500…) diventava "errore di rete".

### Backend (`FedergolfController`)

- `getIscritti` ora restituisce sempre `state`, `reason`, `message`, `totale`,
  `ammessi` (helper `payload()`)
- Nuovi stati: `unpublished` (JSON senza `data.processedData`, oppure admin-ajax
  che risponde `0`) e `not_found` (HTTP 404). Prima entrambi finivano in `empty`
  → "Gara senza iscritti", affermazione falsa a iscrizioni aperte
- `httpErrorPayload()` distingue 404 / 429 / 401-403 / 5xx / altro
- `open` riporta il conteggio: "Iscrizioni non ancora chiuse: N iscritti…"
- Ammessi > 0 ma nessun nome leggibile → `error`/`parse` (formato federgolf
  cambiato) invece di `ready` con lista vuota
- `error` e `not_found` non vengono cacheati
- `loadAllCompetitions` restituisce `reason` + messaggio specifico (timeout /
  rate limit / HTTP / formato) invece di "Errore connessione"; l'eccezione resta
  nel log, non va al client

### Frontend (`quadranti-logic.js`, `quadranti.js`)

- Nuova `describeAjaxFailure(jqXHR, textStatus, contesto)`: distingue abort,
  timeout, status 0 (unico vero errore di rete), 419, 401/403, 404, 422 (con
  dettagli di validazione), 429, 5xx
- `mergeFedergolfResponses` usa il `message` del backend come unica fonte di
  verità e ritorna `severity` (`info` per open/empty/unpublished, `error` per i
  guasti) e `states`
- `handleFedergolfGaraSelected` separa fase fetch e fase interpretazione: un
  errore di rendering non viene più etichettato come errore di rete
- Alert con ℹ per le condizioni normali della gara, ⚠ solo per i guasti

### Causa radice: `competition_id` è un GUID, non un intero

Con i messaggi nuovi l'alert è diventato `Richiesta non valida: validation.integer`,
poi — con il valore in chiaro — `Identificativo della gara non valido (ricevuto:
"6b01aebc-f3f1-f011-8406-7ced8d5cadb4")`. **Federgolf usa GUID** come
`competition_id` accanto ai vecchi id numerici: la regola `gara_id => integer`
bocciava tutte le gare nuove con un 422, che il frontend mostrava come "errore
di rete". Ora:

- **l'id è trattato come token opaco**: nessun vincolo di formato. Si valida
  solo che sia scalare, non vuoto, ≤ 200 caratteri e senza caratteri di
  controllo (log poisoning). Una whitelist di caratteri sarebbe la stessa
  bomba a orologeria della regola `integer`: al prossimo cambio FIG
  (base64, slug, id compositi) l'applicazione si bloccherebbe di nuovo
- la sicurezza della chiave di cache la dà `cacheKeyFor()`, che normalizza
  (trim, zeri iniziali sugli id numerici, minuscolo) e poi passa per `sha1`:
  qualunque carattere futuro è innocuo per lo store. L'id viaggia verso
  federgolf **esattamente come ricevuto**, mai castato
- messaggi di validazione custom in italiano con il valore ricevuto (`:input`):
  il progetto non ha `lang/it`, quindi senza messaggi espliciti usciva la chiave
  grezza `validation.integer`
- `Log::warning` con il valore grezzo quando non combacia, e `console.debug`
  degli id lato client

### Test resi indipendenti dalla data

- `fakeFedergolf()` usa `Http::sequence()->push(...)->whenEmpty(elenco vuoto)`:
  da novembre il controller interroga anche anno+1 (C5) e il fake a risposta
  fissa duplicava le gare
- le gare di prova usano `futureDate($giorni)` invece di date fisse: `10/08/2026`
  era diventata passata e faceva fallire l'ordinamento

### Attesa lunga: feedback invece di apparente blocco

`showLoading(msg, { withElapsed: true })` mostra i secondi trascorsi e, oltre i
10 secondi, avverte che federgolf.it può metterci fino a un minuto. Senza
contatore l'attesa (due chiamate M+F, timeout 60s ciascuna) sembrava un blocco.

### Mirror

I 4 file modificati sono tutti in `_overrides_quadranti` (metodo di
trasferimento verso golf-arbitri-clean). Aggiunto al mirror anche
`tests/Feature/` — prima viaggiava il codice ma non i test che lo proteggono —
e la riga corrispondente in `setup.sh` (STEP 4).

Test: `FedergolfTest` esteso (404, 429, 403, unpublished, admin-ajax `0`,
conteggi, cache, GUID, id opaco `gara/2026:Q1+abc=`, id numerici con zeri
iniziali/spazi, id vuoto/troppo lungo/con caratteri di controllo, array),
`quadranti-logic.test.js` con la suite `describeAjaxFailure`.

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
