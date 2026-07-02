# Audit comunicazioni con l'esterno — 02/07/2026

Esame mirato ai bug latenti (non ancora emersi) nella componente che dialoga con l'esterno:
integrazione **federgolf.it** (`FedergolfController` + lato client `quadranti.js`),
**mail** (reset password Breeze), **DB/shell** (`SystemOperations`). Documentazione di
riferimento: `README.md`, `STORICO.md`, `AUDIT_QUADRANTI.md`, test `FedergolfTest.php`.

Legenda: 🔴 alta (rottura o dato falso all'utente) · 🟡 media · 🟢 bassa/igiene.

---

## FedergolfController — lato server

### ✅ C1. `gara_id` non validato → RISOLTO 02/07
*(criticità bassa: serve login, il JS normale manda sempre un id valido)*
Fix applicato: `$request->validate(['gara_id' => 'required|integer'])`.
`getIscritti()` usa `$request->input('gara_id')` senza validazione.

- `gara_id[]=1` (array): l'interpolazione `"federgolf.iscritti.{$garaId}"` genera
  *Array to string conversion* → Laravel la converte in `ErrorException` → **500**
  (nessun payload `state: error`, il JS mostra solo l'alert generico).
  Anche superando l'interpolazione, `fetchIscritti(string|int|null)` lancerebbe `TypeError`.
- `gara_id` assente: chiave cache `federgolf.iscritti.` **condivisa** tra tutte le
  richieste senza id; la risposta (probabile `empty`) resta in cache 60s per tutti.

**Fix**: `$request->validate(['gara_id' => 'required|integer'])` in testa a `getIscritti()`.

### ✅ C2. Risposta 200 non-JSON classificata come "Gara senza iscritti" → RISOLTO 02/07
*(scenario concreto: federgolf in manutenzione o dietro WAF risponde 200 con
pagina HTML → l'app diceva "gara senza iscritti" invece di "errore di rete")*
Fix applicato: guard `! is_array($data)` → `state: 'error'` in `fetchIscritti`;
stesso guard in `fetchCompetitionsYear` per load-all.
Riga 86–87: se federgolf risponde 200 con HTML (pagina manutenzione, WAF, redirect
login WordPress), `$response->json()` restituisce `null`, il `??` produce `[]`,
`$totale === 0` → stato **`empty`** con messaggio *"Gara senza iscritti."*
Dato **falso** mostrato all'utente e **cacheato 60s** (solo `error` viene dimenticato,
`empty` no).

**Fix**: dopo `$response->json()`, se `$data === null` (o manca `data.processedData`
come chiave) → ritornare `state: 'error'`.

### ⚪ C3. Paginazione a 250 — NON è un problema (verificato 02/07)
`page_size => 250` fisso. Vincolo di dominio: il campo non può superare **154
giocatori** per esigenze temporali (oltre, i tempi di partenza si
accavallerebbero). 250 > 154 → il taglio non è mai raggiungibile. Nessun intervento.

### ✅ C4. Parsing fuori dal `try` → RISOLTO 02/07
Fix applicato: parsing in try/catch `\Throwable` + guard `is_string()` su
`$entry[8]`/`$entry[1]` → `state: 'error'` invece di 500. Diagnosi originale:
In `fetchIscritti` il `try/catch` (righe 50–76) copre **solo** la chiamata HTTP.
Il parsing (86–102) è scoperto: se federgolf cambia formato e `$entry[8]` o
`$entry[1]` non sono stringhe (array, int), `strpos()`/`preg_match()` lanciano
`TypeError` → **500**, mai `state: 'error'`. La macchina a stati progettata apposta
per gli errori non viene esercitata proprio nel punto più esposto al cambiamento
esterno.

**Fix**: estendere il try al parsing, oppure `is_string()` guard; in catch → `state: 'error'`.

### ✅ C5. `anno => date('Y')`: gare di gennaio invisibili a fine anno → RISOLTO 02/07
Fix applicato: estratto helper `fetchCompetitionsYear(int $anno)`; da novembre
(`date('n') >= 11`) seconda chiamata con `anno+1` e merge (fallimento della
seconda non blocca). Gestione resta per anno. Bonus: `ConnectionException` su
load-all ora → "Errore connessione" pulito invece del leak `getMessage()`.
Diagnosi originale:
`loadAllCompetitions` cerca solo `anno = anno corrente`. A dicembre le gare di
gennaio/febbraio dell'anno successivo **non compaiono** — proprio nel periodo in
cui si preparano. Bug stagionale: emergerà a dicembre 2026.

**Fix** (decisione 02/07: la gestione resta per anno): da novembre/dicembre
interrogare anche `anno+1` e unire i risultati; in alternativa parametro anno
nella UI con default anno corrente.

### 🟡 C6. `getMessage()` al client + shape mismatch (già segnalato, ancora aperto)
Catch generico `\Exception` in `loadAllCompetitions` ritorna `$e->getMessage()` al
client. Nota: Laravel converte i warning in `ErrorException`, quindi anche una
semplice chiave mancante (`annullata`, `nome`, `data`) in una gara → messaggio
interno (path, riga) esposto al browser. Già in `STORICO.md` come suggerimento,
qui confermato come vettore concreto.

**Fix**: log server-side, al client solo `['success' => false, 'message' => 'Errore di comunicazione con Federgolf']`.

### 🟡 C7. Timeout 60s sincrono su hosting condiviso
`Http::timeout(60)` dentro una richiesta web: su Aruba `max_execution_time`
tipico 30–60s. Se federgolf è lento il PHP muore a metà → risposta vuota/504,
il JS mostra errore generico e il messaggio curato ("riprovare tra qualche
secondo") non arriva mai.

**Fix**: timeout ≤ (max_execution_time − margine), es. 20s, o verificare il limite Aruba.

### 🟡 C8. `load-all` mai cacheato, nessun throttle
Gli iscritti hanno cache 60s (esplicitamente anti rate-limit), ma
`loadAllCompetitions` **no**: ogni click = richiesta live a federgolf. Nessun
`throttle:` sulle due route. Rischio rate-limit/ban dell'IP condiviso Aruba.

**Fix**: `Cache::remember('federgolf.competitions.'.date('Y'), 300, ...)` + `->middleware('throttle:10,1')`.

### 🟢 C9. Dettagli minori
- `Cache::remember` senza lock: due richieste simultanee = due chiamate a federgolf
  (stampede); il payload `error` viene scritto e subito dimenticato (finestra
  minima in cui terzi leggono l'errore cacheato). Cosmetico.
- `DateTime::createFromFormat('d/m/Y', ...)` senza `!`: l'ora viene riempita con
  quella corrente → il filtro "gare passate" per la gara di **oggi** dipende da
  microsecondi; con data malformata ritorna `false`, la gara passa il filtro e
  `usort` confronta `false <=> DateTime`. Usare formato `'!d/m/Y'` e confrontare
  con `(new DateTime('today'))`.
- `$gara['annullata'] == 1` loose compare: ok oggi, fragile se diventa `"1"`/`true`/assente (vedi C6).

---

## Lato client (`quadranti.js` / `quadranti-logic.js`)

### ✅ J1. XSS da dati esterni (federgolf → DOM senza escaping) → RISOLTO 02/07
Fix applicato: nuova `escapeHtml()` in `utils.js` (escape minimale `& < >`,
apostrofi/accenti intatti) usata su label dropdown (`quadranti.js`) e sui 3
sink nomi (`quadranti-logic.js`: renderCell double tee, single tee, prova di
gioco `giocatori`). `html_entity_decode` server-side RESTA (accenti). +5 test
in `utils.test.js`; suite 424/424 verde, snapshot invariati. Diagnosi originale:
Due sink:

1. `populateFedergolfDropdown`:
   `$dropdown.append(`<option value="${idx}">${g.label}</option>`)` — `label`
   contiene `title` e `club` presi **as-is** dal JSON di federgolf.
2. Nomi giocatori: `quadranti-logic.js` riga ~1161 `${player}${btn}` e riga ~1567
   `${r.giocatori.join('<br>')}` dentro HTML.

Il server estrae i nomi con regex `[^<]+` (niente `<` letterali), **ma poi applica
`html_entity_decode`**: un nome contenente `&lt;img src=x onerror=...&gt;` viene
decodificato in markup reale e arriva al DOM. Titoli/club non passano nemmeno dalla
regex. Chiunque controlli o comprometta i dati federgolf (o un MITM se l'URL venisse
mai degradato a http) esegue script nella sessione autenticata. Stesso sink vale per
i nomi da Excel caricato.

**Fix**: `html_entity_decode` RESTA (necessario per gli accenti: `&agrave;` → à).
L'intervento è solo in uscita: funzione `escapeHtml()` su `label`, `player`,
`giocatori` prima dell'interpolazione nell'HTML (o costruire le option con
`$('<option>').text(...)`). Opzionale server-side: `strip_tags()` dopo il decode
come cintura extra.

### 🟡 J2. `Promise.all`: un lato fallisce, si perdono entrambi
`handleFedergolfGaraSelected` usa `Promise.all` sui fetch M/F: se **una** delle due
`$.ajax` fallisce a livello HTTP (non i casi `state:error`, che sono 200), il catch
globale butta via anche il lato riuscito. Con `Promise.allSettled` il lato buono
sopravvive e il warning è mirato — coerente con la filosofia di `mergeFedergolfResponses`.

### 🟢 J3. Messaggi server scartati
`handleLoadFedergolfGare`: con `success:false` mostra "Nessuna gara disponibile"
(fuorviante: era un errore di comunicazione) e il `message` del server non viene
mai mostrato. Distinguere `success:false` da `gare.length === 0`.

### 🟢 J4. Raggruppamento M+F: sovrascrittura silenziosa
Due gare MASCHILE (o MISTA) con stessa chiave normalizzata+data → la seconda
sovrascrive `gruppi[chiave].maschile` senza avviso. Raro ma silenzioso.

---

## Mail (reset password)

### 🟡 M1. Configurazione consegna mai verificata
`.env` locale: `MAIL_MAILER=log`, `MAIL_FROM_ADDRESS=hello@example.com`. Le route
`forgot-password` sono attive: se la produzione Aruba ha gli stessi valori, il
reset password **sembra funzionare** (messaggio "link inviato") ma la mail finisce
nel log o viene respinta per il from fasullo. Bug invisibile finché un utente non
si blocca fuori. Verificare `.env` di produzione: SMTP reale + from del dominio.

### 🟢 M2. Route di verifica email morte
`User` non implementa `MustVerifyEmail`, quindi il middleware `verified` sulla
dashboard è un no-op e le route `verification.*` sono codice morto (ma
`verification.send` invia davvero la mail se chiamata). Rimuoverle o implementare
l'interfaccia — allineare all'intento.

---

## SystemOperations (comunicazione con MySQL)

### 🟢 S1. Password su riga di comando (già noto, ancora aperto)
`backupDatabase()/restoreDatabase()`: `mysqldump ... -p<password>` visibile in
`ps aux` sull'hosting condiviso. Già in `STORICO.md`; resta il fix
`--defaults-extra-file` con file temporaneo 0600.

---

## Stato interventi (02/07/2026)

- ✅ Risolti e replicati in `_overrides_quadranti`: **C1, C2, C4, C5, J1**
  (file toccati: `FedergolfController.php`, `utils.js`, `utils.test.js`,
  `quadranti.js`, `quadranti-logic.js`). Test JS: 424/424 verdi, snapshot
  invariati. `php artisan test`: verde (confermato 02/07).
- ✅ Porto in `golf-arbitri-clean` fatto 02/07: stessi fix su
  `app/Http/Controllers/User/FedergolfController.php` (adattati a namespace
  `User` e config `golf.fig.ajax_url`; guard C2 anche sul metodo extra
  `searchCompetitions`) + copiati i 4 JS (`utils.js`, `utils.test.js`,
  `quadranti.js`, `quadranti-logic.js` — verificato: pre-porto erano identici
  alle versioni pre-fix). Vitest golf-arbitri-clean: 424/424 verdi.
  Nota: golf-arbitri-clean non ha `FedergolfTest.php` PHP; lanciare comunque
  `php artisan test` lì. Il suo sistema notifiche/mail (assente qui) NON è
  coperto da questo audit.
- ⚪ C3 chiuso: vincolo dominio 154 giocatori max, non raggiungibile.
- Restano aperti: **M1** (verifica mail produzione — un controllo, zero
  codice), C6 (getMessage al client — mitigato per errori rete), C7 (timeout
  60s), C8 (throttle/cache load-all), C9, J2–J4, M2, S1 — quando si tocca l'area.

✅ Divergenze mirror pre-esistenti risolte 02/07 (decisione: il progetto è
l'origine): `quadranti-regression.test.js`, `index.blade.php`, `vite.config.js`
copiati dal progetto nel mirror. **Diff mirror = 0 su tutti i file.**

Nota mirror: `FedergolfController` e i file in `resources/js/quadranti/` sono
condivisi con `golf-arbitri-clean` — ogni fix va replicato in `_overrides_quadranti`
e portato a mano nell'altro progetto (vedi `README.md` §Struttura particolare).
