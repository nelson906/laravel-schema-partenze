# Audit Funzioni + Dead Code — laravel-schema-partenze

Data: 2026-07-02 · Linguaggi: PHP (Laravel 12) + JavaScript (Vite/Vitest)

## 1. Azioni disponibili per ruolo

### Guest (non autenticato)
| Azione | Route | Controller |
|---|---|---|
| Pagina welcome | `GET /` | closure |
| Login | `GET/POST /login` | `AuthenticatedSessionController` |
| Recupero password | `GET/POST /forgot-password` | `PasswordResetLinkController` |
| Reset password | `GET /reset-password/{token}`, `POST /reset-password` | `NewPasswordController` |

Registrazione pubblica **disabilitata**: utenti creati solo da admin.

### Utente autenticato
| Azione | Route | Controller |
|---|---|---|
| Dashboard | `GET /dashboard` | closure |
| Profilo: modifica/aggiorna/elimina | `GET/PATCH/DELETE /profile` | `ProfileController@edit/update/destroy` |
| Verifica email + reinvio | `GET /verify-email*`, `POST /email/verification-notification` | controller Breeze |
| Conferma password | `GET/POST /confirm-password` | `ConfirmablePasswordController` |
| Cambio password | `PUT /password` | `PasswordController@update` |
| Logout | `POST /logout` | `AuthenticatedSessionController@destroy` |
| **Quadranti**: pagina simulatore | `GET /quadranti` | `QuadrantiController@index` |
| **Quadranti**: upload Excel iscritti | `POST /quadranti/upload-excel` | `QuadrantiController@uploadExcel` |
| **Quadranti**: coordinate/effemeridi | `POST /quadranti/coordinates` | `QuadrantiController@getCoordinates` |
| **Federgolf**: carica gare anno | `POST /user/federgolf/load-all` | `FedergolfController@loadAllCompetitions` |
| **Federgolf**: lista iscritti gara | `POST /user/federgolf/iscritti` | `FedergolfController@getIscritti` |

### Admin (admin + super_admin, middleware `admin`)
| Azione | Route | Controller |
|---|---|---|
| CRUD utenti completo | `resource /admin/users` | `Admin\UserController` (index/create/store/edit/update/destroy) |
| Attiva/disattiva utente | `PATCH /admin/users/{user}/toggle-active` | `@toggleActive` |

Guardie nel controller: `allowedUserTypes()` + `guardCanEdit()` — solo super_admin gestisce super_admin.

### Super Admin (middleware `super_admin`, prefix `/aruba-admin`)
`ArubaToolsController`: dashboard, cache (index/clear), optimize, pulizia assets, phpinfo, logs (view/clear), permissions (check/fix), composer (index/dump-autoload/diagnostic), database (index/backup/restore), monitoring server, security, storage-link (index/create/remove/test).

## 2. Copertura route ↔ controller

**100% allineata.** Ogni metodo pubblico dei controller ha una route; ogni route punta a metodo esistente. Nessuna route orfana, nessun metodo pubblico non raggiungibile.

Helpers `SystemInfo` / `SystemOperations`: tutti i metodi statici usati da `ArubaToolsController` (`commandExists` usato internamente da `SystemOperations`).

Test: Feature per auth (5 file), admin users, quadranti, federgolf, profile, access control. JS: 4 file test Vitest incl. regressione + snapshot.

`_overrides_quadranti/resources/js/quadranti` **in sync** con `resources/js/quadranti` (diff pulito).

## 3. Dead code / surplus

### PHP — nessun dead code reale
71 finding grezzi, 69 falsi positivi noti (metodi test PHPUnit, Form Request DI, Eloquent magic). Unici 2 "reali" segnalati: `casts()` in `app/Models/User.php:43` e copia in `_overrides_admin` → **falso positivo**: convenzione Laravel 11+, chiamato dal framework. Da NON rimuovere.

### JavaScript — surplus modesto
| Simbolo | File | Stato |
|---|---|---|
| `TECHNICAL_LIMITS` | `resources/js/quadranti/config.js:270` | **mai usato** (né app né test) |
| `deepClone` | `utils.js:206` | solo test (5 ref) |
| `formatMinutes` | `utils.js:41` | solo test (7 ref) |
| `isBetween` | `utils.js:88` | solo test (8 ref) |
| `isValidTime` | `utils.js:215` | solo test (11 ref) |
| `timeDifferenceInMinutes` | `utils.js:226` | solo test (7 ref) |
| `remapQuadrant` | `quadranti-logic.js:187` | solo test |
| `figGroupNumbers` | `quadranti-logic.js:1413` | solo test |

Nota knip: crash in sandbox (memoria) — analisi fatta manualmente su export/uso, affidabile dato codebase JS contenuto (~6.700 righe).

### Priorità rimozione
1. `TECHNICAL_LIMITS` — rimozione sicura (zero riferimenti). Confidenza alta.
2. Utility "solo test" — decidere: se libreria utils intenzionale, tenere; altrimenti rimuovere simbolo + relativi test. Confidenza media.
3. `remapQuadrant` / `figGroupNumbers` — verificare se previsti per stage 2 motore quadranti prima di toccare. Confidenza bassa.

**Attenzione**: ogni rimozione in `resources/js/quadranti` va replicata in `_overrides_quadranti` (sync con golf-arbitri-clean).

## 4. Rimozione eseguita (2026-07-02)

Rimossi: `TECHNICAL_LIMITS` (config.js), `deepClone`/`isBetween`/`isValidTime`/`timeDifferenceInMinutes` (utils.js), `remapQuadrant`/`figGroupNumbers` (quadranti-logic.js) + test collegati. `formatMinutes` **mantenuto** (usato da `halfTime`). README aggiornato (§5, §7). Vitest: 426/426 verdi. `_overrides_quadranti` sincronizzato (diff pulito). Da fare in golf-arbitri-clean: copiare i 6 file da `_overrides_quadranti/resources/js/quadranti/` e rilanciare `npm run build`.

### Falsi positivi da NON rimuovere
Metodi `test_*` (PHPUnit), `rules()/authorize()/ensureIsNotRateLimited()` (Form Request), `casts()` (Laravel 11+), metodi controller (chiamati dal router), `commandExists` (uso interno helper).
