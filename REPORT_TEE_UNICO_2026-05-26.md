# Report — Verifica partenze TEE UNICO

**Data**: 2026-05-26 (aggiornato dopo estensione a Patrocinate / Giovanili)
**Scope**: tutti i formati con tee unico supportato in `COMPETITION_FORMATS`
**Fonte di verità**: PDF in `Schemi partenze/` — per i casi senza PDF dedicato,
si applica la stessa logica del 54 buche (direttiva utente).
**Codice esaminato**: `resources/js/quadranti/quadranti-logic.js` → `generateSingleTee()`
**Mirror sincronizzato**: `_overrides_quadranti/...` identico al main (`diff -q` ⇒ vuoto)

> **Decisione utente (registrata)**: per la voce §3 (72 buche, 4° giro) è stata
> scelta l'**Opzione B** — il codice resta `gender: 'men'`, la doppia tabella nel
> `72 buche.pdf` viene considerata un duplicato di layout (la sezione "4° giro"
> è identica byte-per-byte a "3° giro", quindi mostra il template strutturale,
> non un giro effettivo per le donne). Nessuna modifica al codice per questa voce.

---

## 1. Esito sintetico

| Formato | Giro | Tee unico ammesso? | Stato | Note |
|---------|------|--------------------|-------|------|
| **Gara 54 buche** | 3° (finale) | ✅ sì | ✅ ALLINEATO | Match perfetto con `54 buche.pdf` → "3° GIRO PER CLASSIFICA TEE 1" |
| **Gara 72 buche** | 3° (finale) | ✅ sì | ✅ ALLINEATO | Match perfetto con `72 buche.pdf` → "3° GIRO PER CLASSIFICA" |
| **Gara 72 buche** | 4° (finale) | ✅ sì | ✅ ACCETTATO (Opz. B) | Codice esclude le donne come da scelta utente; PDF doppia tabella ⇒ duplicato di layout |
| **Schema 54/72 con giro finale** | 3° | n/a | ✅ ALLINEATO | Annotation `REVERSED` rispettata per U e D |
| **Gara con patrocinio FIG** | 1° (qualif.) | ✅ sì | ✅ ALLINEATO (logica 54) | Vedi §6 — PDF mostra solo dual tee 18-buche; tee unico segue 54 `'prima'` |
| **Gara con patrocinio FIG** | 2° (per classifica) | ✅ sì | ⚠️ AMBIGUITÀ (logica 54) | Vedi §6 — segue 54 `'seconda'` ma il giro è "per classifica" come il finale |
| **Trofeo Giovanile Federale** | 1° / 2° | ✅ sì | come Patrocinate | Stessa entry in `COMPETITION_FORMATS` (struttura identica) |
| **Gara Giovanile** | Giro unico | ✅ sì *(abilitato)* | ✅ ALLINEATO (logica 54) | Vedi §7 — `tee` aggiornato a `['double','single']`; usa logica 54 `'prima'` |
| **Teodoro Soldati** | Giro unico | ✅ sì *(abilitato)* | ✅ ALLINEATO (logica 54) | Vedi §7 — `tee` aggiornato a `['double','single']`; usa logica 54 `'prima'` |

---

## 2. Verifica caso per caso (54 buche · finale, tee unico)

Confronto riga per riga tra l'output del codice (`generateSingleTee('finale')` con
`playersCut=54`, `proetteCut=27`, `mod=3`, `startTime=08:00`, `gap=00:11`) e
`54 buche.pdf` → "3° GIRO PER CLASSIFICA TEE 1":

```
Flight  Tee  Display      Orario   PDF?
1       1    30 29 28     08:00    ✓
2       1    33 32 31     08:11    ✓
...
9       1    54 53 52     09:28    ✓   ← fine Blocco 1 (uomini back 28-54 asc)
10      1    27 26 25     09:45    ✓   ← +17 min (gap 11 + BLOCK_GAP 6)
...
18      1    3 2 1        11:13    ✓   ← fine Blocco 2 (uomini front 1-27 desc, leader U ultimo)
19      1    27 26 25     11:30    ✓   ← +17 min
...
27      1    3 2 1        12:58    ✓   ← fine Blocco 3 (donne 1-27 desc, leader D ultima)
```

Tutti i 27 flight, tutte le 4 transizioni di blocco, tutti gli orari combaciano. ✅

**Snapshot di test esistente** (`quadranti-logic.test.js.snap` riga 178-205) conferma:
```json
[
  { "categoria": "Uomini", "label": "Blocco 1 · back-half",  "first": 28, "last": 54, "invertire": false },
  { "categoria": "Uomini", "label": "Blocco 2 · front-half", "first": 27, "last": 1,  "invertire": true  },
  { "categoria": "Donne",  "label": "Blocco 3",              "first": 27, "last": 1,  "invertire": true  }
]
```

Il codice e il PDF dicono la stessa cosa.

---

## 3. ⚠️ DISCREPANZA — 72 buche, 4° giro tee unico

### 3.1 Cosa dice il PDF

`72 buche.pdf` espone DUE tabelle affiancate: "3° GIRO PER CLASSIFICA" (sinistra)
e "4° GIRO PER CLASSIFICA" (destra). **Entrambe**:

- riportano l'intestazione **"54 GIOCATORI E 27 GIOCATRICI"**;
- contengono **27 flight** in 3 blocchi: U back (1-9), U front (1-9), **Donne (10-18)**;
- l'ultimo flight è alle 12:58 con i rank `3 2 1` delle donne (leader D che chiude).

Estratto fedele (pdftotext -layout):
```
              3° GIRO PER CLASSIFICA                                4° GIRO PER CLASSIFICA
        54 GIOCATORI E 27 GIOCATRICI                             54 GIOCATORI E 27 GIOCATRICI
...
 10     11:30       1       27         26    25     10     11:30         1        27         26     25
 ...
 18     12:58       1       3          2     1      18     12:58         1         3          2      1
```

### 3.2 Cosa fa il codice

`resources/js/quadranti/config.js` riga 132-133 definisce:

```js
{ id: 'quarto',  label: '4° giro (finale, uomini)', type: 'finale',
  gender: 'men',  tee: ['double', 'single'], ... }
```

→ `generateSingleTee` legge `gender:'men'` ⇒ `isMenOnlyRound = true`
   ⇒ `proetteFinal = 0` ⇒ `blockWomen = []`
   ⇒ il giro produce **solo 18 flight** (Blocchi 1 e 2 uomini), nessuna donna.

Il commento a `ROUND_TYPES.FOURTH` (config.js riga 60) e la label
`"Gara 72 buche (uomini 72 / donne 54)"` (riga 127) documentano la scelta come
**deliberata**: le donne giocano 54 buche, quindi non si presentano al 4° giro.

### 3.3 Domande aperte prima della patch

La discrepanza può essere risolta in due modi opposti — sono **incompatibili** e
serve la tua decisione:

**Opzione A** — Aggiornare il codice per allinearlo al PDF (donne in 4° giro).
Implica: il 72 buche è una gara unica 72/72, le donne giocano 4 giri come gli
uomini. Comporta modificare `COMPETITION_FORMATS['Gara 72 buche'].rounds[3].gender`
da `'men'` a `'both'`, eliminare i 2 test di regressione che impongono il
men-only (riga 1882 e 1896 di `quadranti-logic.test.js`), e aggiornare label e
commenti.

**Opzione B** — Tenere il codice com'è (donne non giocano il 4° giro) e
considerare la doppia tabella nel PDF un artefatto di copia (la sezione "4° giro"
del PDF è identica byte-per-byte alla "3° giro" → potrebbe essere un layout
duplicato per illustrare che lo schema/template è il medesimo, non che le donne
giochino davvero un 4° giro).

La label nel codice e il commento "uomini 72 / donne 54" sembrano riflettere una
regola di torneo voluta, mentre l'identità byte-per-byte delle due tabelle nel
PDF è sospetta. Ma tu hai indicato il PDF come fonte di verità.

### 3.4 Patch proposta — Opzione A (allineamento al PDF)

**File 1**: `resources/js/quadranti/config.js`

```diff
@@ ROUND_TYPES (riga 59-63) @@
   FINAL: 'finale',
-  // Giri 3 e 4 della Gara 72 buche: entrambi usano il template del giro
-  // finale. Il 4° giro è SOLO uomini (le donne giocano 54 buche = 3 giri).
-  // Vedi COMPETITION_FORMATS['Gara 72 buche'].
+  // Giri 3 e 4 della Gara 72 buche: entrambi usano il template del giro
+  // finale (3 blocchi: U back asc → U front desc → Donne desc).
+  // Vedi COMPETITION_FORMATS['Gara 72 buche'].
   THIRD: 'terzo',
   FOURTH: 'quarto'

@@ COMPETITION_FORMATS['Gara 72 buche'] (riga 126-135) @@
   'Gara 72 buche': {
-    label: 'Gara 72 buche (uomini 72 / donne 54)',
+    label: 'Gara 72 buche (72/72)',
     cutAfter: 2,
     rounds: [
       { id: 'prima',   label: '1° giro',                  type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'dx-sn' }, late: { forma: 'U',  verso: 'dx-sn' }, reversed: false },
       { id: 'seconda', label: '2° giro',                  type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'U',  verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: false },
       { id: 'terzo',   label: '3° giro (finale)',         type: 'finale',     gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true },
-      { id: 'quarto',  label: '4° giro (finale, uomini)', type: 'finale',     gender: 'men',  tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true }
+      { id: 'quarto',  label: '4° giro (finale)',         type: 'finale',     gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true }
     ]
   },
```

**File 2**: `resources/js/quadranti/quadranti-logic.js` (commento, righe 1843-1845)

```diff
-     *   Blocco 3 = Donne (tutte), gruppi in ordine DECRESCENTE di rank
-     *              (leader donne a chiusura del giro). Assente nei giri
-     *              'men-only' (4° giro della Gara 72 buche).
+     *   Blocco 3 = Donne (tutte), gruppi in ordine DECRESCENTE di rank
+     *              (leader donne a chiusura del giro). Assente solo per i
+     *              formati con `gender: 'men'` in COMPETITION_FORMATS
+     *              (oggi: nessuno).
```

**File 3**: `resources/js/quadranti/quadranti-logic.test.js` — i 2 test che fissano il men-only diventano obsoleti:

```diff
@@ riga 1882-1887 @@
-  it('4° giro doppio tee → finale SOLO uomini (nessuna donna)', () => {
-    const l = makeLogic({ ...cfg72, doppiePartenze: 'Doppie Partenze' });
-    l.generateDoubleTee('quarto');
-    expect(l.figQuadranti.length).toBeGreaterThan(0);
-    expect(l.figQuadranti.every((q) => q.categoria === 'Uomini')).toBe(true);
-  });
+  it('4° giro doppio tee → finale uomini + donne (allineato schema FIG)', () => {
+    const l = makeLogic({ ...cfg72, doppiePartenze: 'Doppie Partenze' });
+    l.generateDoubleTee('quarto');
+    expect(l.figQuadranti.length).toBeGreaterThan(0);
+    expect(l.figQuadranti.some((q) => q.categoria === 'Donne')).toBe(true);
+  });

@@ riga 1896-1901 @@
-  it('4° giro tee unico → solo blocchi maschili, nessuna donna', () => {
-    const l = makeLogic({ ...cfg72, doppiePartenze: 'Tee Unico' });
-    l.generateSingleTee('quarto');
-    expect(l.figQuadranti.length).toBeGreaterThan(0);
-    expect(l.figQuadranti.every((q) => q.categoria === 'Uomini')).toBe(true);
-  });
+  it('4° giro tee unico → 3 blocchi identici al 3° giro (back, front, donne)', () => {
+    const l = makeLogic({ ...cfg72, doppiePartenze: 'Tee Unico' });
+    l.generateSingleTee('quarto');
+    expect(l.figQuadranti).toHaveLength(3);
+    expect(l.figQuadranti[2].categoria).toBe('Donne');
+  });
```

**Stesse patch** vanno replicate in `_overrides_quadranti/resources/js/quadranti/`
(file mirror identici).

### 3.5 Patch proposta — Opzione B (mantenere men-only)

Nessuna modifica al codice. Aggiornare **solo il PDF** (`72 buche.pdf`) per
togliere il blocco donne (righe 10-18) dalla sezione "4° GIRO PER CLASSIFICA" e
correggere l'intestazione in "54 GIOCATORI".

---

## 4. Nota documentazione (bassa priorità)

`resources/js/quadranti/quadranti-logic.js` riga 1901-1903:

```js
// Split per FLIGHT count, ceil sul front (asimmetrico per N dispari
// di flight, come da immagine donne 27 → 5 front + 4 back).
```

Il commento giustifica lo split con un esempio sulle donne — ma nel codice
**le donne non vengono mai splittate** (`blockWomen = desc(ranksF, 'F')` è un
blocco unico). Lo split asimmetrico vale solo per gli uomini.

**Patch proposta** (riallineamento commento alla realtà):

```diff
-            // Split per FLIGHT count, ceil sul front (asimmetrico per N dispari
-            // di flight, come da immagine donne 27 → 5 front + 4 back).
+            // Split men in front/back blocks per FLIGHT count, ceil sul front
+            // (asimmetrico quando totalFlightsM è dispari: es. 17 flight →
+            // 9 front + 8 back). Le donne restano in un blocco unico.
```

Nessun cambio comportamentale, solo chiarezza per chi mantiene il codice.

---

## 5. Cose verificate ma SENZA discrepanze

Annotate per completezza (così sai che le ho controllate):

- **Ordine intra-gruppo** (rank alto a sinistra, es. "30 29 28"): ✅ corretto in
  tutti e 3 i blocchi e in entrambe le funzioni helper `asc`/`desc`.
- **Stacco tra blocchi**: `BLOCK_GAP = '00:06'` hardcoded. Con `gap=11` produce
  i 17 min richiesti dal PDF. Con altri gap il totale sarà `gap + 6` (non c'è
  un altro esempio nel PDF per controllare; lascio invariato).
- **Fallback `playersCut/proetteCut → players/proette`** quando l'utente non li
  ha compilati: ragionevole, non rompe nulla.
- **`showRemove = false` nei giri finali** (riga 1981): coerente, il giro
  finale è numerico per definizione.
- **Match counter sequenziale 1-27 nel codice** vs **1-9 / 1-9 reset / 10-18
  continuato del PDF**: il PDF sembra avere un artefatto di numerazione (Blocco
  2 resetta a 1, Blocco 3 prosegue da 10 invece di 19). La numerazione 1-N del
  codice è più pulita; non è un bug.

---

## 6. Gare Patrocinate / Trofei Giovanili Federali — tee unico

I due formati condividono la stessa entry in `COMPETITION_FORMATS` (label diversa,
struttura identica): 2 giri, `cutAfter: null`, `tee: ['double', 'single']` per
entrambi i giri.

### 6.1 Cosa dicono i PDF

| PDF | 1° giro | 2° giro | Note |
|-----|---------|---------|------|
| `Gare Patrocinate.pdf` | DOUBLE tee (campo 18) | DOUBLE tee (campo 18) | Anche varianti CAMPO 9 BUCHE single tee |
| `Trofei Giovanili.pdf` | DOUBLE tee (campo 18) | DOUBLE tee (campo 18) | Anche varianti CAMPO 9 BUCHE single tee |
| `Gare Patrocinate:Trofei Giovanili.drawio.pdf` | schema U/REVERSED | schema U/REVERSED | Diagramma, non tabella |

I PDF **non contengono tabelle tee unico per il campo 18 buche**. Mostrano solo:
- il dual tee per le 18 buche (che il codice replica correttamente nella branch
  `generateDoubleTee` — fuori scope per questa verifica);
- un schema concettuale (Early/Late + REVERSED) che spiega il 2° giro per
  classifica con i blocchi `∩` reversed.

### 6.2 Cosa fa il codice (tee unico)

`generateSingleTee` non ha un ramo dedicato per Patrocinate/Trofei: il dispatch
in `COMPETITION_FORMATS[garaNT].rounds[*].type` restituisce `'qualifying'` per
entrambi i giri (anche il 2° "per classifica"), quindi finisce nel ramo `else`:

```js
allGroups = round === ROUND_TYPES.FIRST
    ? [...femaleGroups, ...maleGroups]              // 1°: D poi U
    : [...maleGroups.reverse(), ...femaleGroups.reverse()];   // 2°: U rev poi D rev
```

→ Per il **1° giro** Patrocinate tee unico applica la stessa identica logica del
54 buche `'prima'` tee unico (donne, poi uomini, quadranti Q1-Q4). ✅ Coerente
con la direttiva "usa logica 54 quando manca PDF".

→ Per il **2° giro** Patrocinate tee unico applica la logica del 54 buche
`'seconda'` (reverse dei due array). ⚠️ Sotto-caso interessante: il 54 buche
`'seconda'` è "ORDINE DI MERITO" (continuazione del 1° giro), mentre il 2° giro
di Patrocinate è "ORDINE DI CLASSIFICA" (per classifica, `reversed: true` nella
config). La direttiva utente "usa logica 54" è ambigua qui:

| Interpretazione | Cosa applicare | Cosa fa il codice oggi |
|-----------------|----------------|------------------------|
| "Stessa funzione del 54 `'seconda'`" | reverse dei quadranti di qualificazione | ✅ è quello che fa |
| "Stesso pattern del giro per classifica del 54" (finale, 3 blocchi) | back-half asc → front-half desc → donne desc | ✗ non lo fa |

Il codice segue oggi la **prima** interpretazione (testuale: "stessa funzione").
Coerente anche col `reversed: true` del dual tee Patrocinate, che il dual tee
gestisce con i 4 blocchi `∩` (vedi test riga 2033 di `quadranti-logic.test.js`),
mentre il tee unico applica un reverse più semplice. Nessun PDF lo smentisce.

### 6.3 Stato

✅ **Allineato alla direttiva** "se manca PDF usa la logica del 54" — il codice
già la applica per entrambi i giri di Patrocinate/Trofei. La sotto-ambiguità del
2° giro (qualifying-reverse vs finale-3-block) resta una zona grigia, ma è
documentata e non c'è PDF che imponga la seconda interpretazione.

Nessuna patch proposta.

---

## 7. Gara Giovanile / Teodoro Soldati — tee unico (ABILITATO)

> **Modifica applicata** (2026-05-26, su richiesta utente): tee unico abilitato
> per Gara Giovanile e Teodoro Soldati con la stessa logica del 54 buche
> `'prima'` (giro di qualificazione, donne prima poi uomini, quadranti Q1-Q4).

### 7.1 Cosa dicono i PDF

| PDF | Contenuto |
|-----|-----------|
| `Gare Giovanili.pdf` | Solo schema concettuale Early/Late con range 1-90 e 1-42 (no tabelle) |
| `Gare Giovanili.drawio.pdf` | Versione drawio dello stesso schema |
| `Teodoro Soldati.pdf` | Tabelle DUAL TEE (Tee 1 + Tee 10) per 18 buche e single tee per CAMPO 9 BUCHE |
| `Schema Partenze.pdf` (sezione Gara Giovanile/Teodoro Soldati) | Schema con 3 archi: U Early 37→90, F 1→42, U Late 1→36 |

Nessun PDF mostra un tee unico per il campo 18 buche → si applica la direttiva
"usa logica del 54" indicata dall'utente.

### 7.2 Modifica applicata

**File 1**: `resources/js/quadranti/config.js` (riga 158-174)

```diff
-  // Gara Giovanile: giro unico, quadranti tutti a U rovesciata, doppio tee.
+  // Gara Giovanile: giro unico, quadranti tutti a U rovesciata.
+  // Tee unico abilitato: nessun PDF dedicato → segue la logica del 54 buche
+  // 'prima' (qualifying), cioè femaleGroups + maleGroups generati da
+  // generatePlayerGroups (quadranti Q1-Q4 su singolo tee).
   'Gara Giovanile': {
     label: 'Gara Giovanile (giro unico)',
     cutAfter: null,
     rounds: [
-      { id: 'prima', label: 'Giro unico', type: 'qualifying', gender: 'both', tee: ['double'], early: ..., late: ..., reversed: false }
+      { id: 'prima', label: 'Giro unico', type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: ..., late: ..., reversed: false }
     ]
   },

-  // Teodoro Soldati: stesso schema della Gara Giovanile.
+  // Teodoro Soldati: stesso schema della Gara Giovanile (incluso tee unico
+  // che segue la logica del 54 buche 'prima').
   'Teodoro Soldati': {
     label: 'Teodoro Soldati (giro unico)',
     cutAfter: null,
     rounds: [
-      { id: 'prima', label: 'Giro unico', type: 'qualifying', gender: 'both', tee: ['double'], early: ..., late: ..., reversed: false }
+      { id: 'prima', label: 'Giro unico', type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: ..., late: ..., reversed: false }
     ]
   }
```

**File 2**: stessa modifica in `_overrides_quadranti/resources/js/quadranti/config.js`
(verifica `diff -q` mirror = OK).

### 7.3 Come funziona ora il dispatch

```
garaNT = 'Gara Giovanile' (o 'Teodoro Soldati')
round  = 'prima'
↓
COMPETITION_FORMATS[garaNT].rounds[0].type === 'qualifying'  → isFinal = false
↓
generateSingleTee va al ramo "qualifying":
  maleGroups   = generatePlayerGroups(players, mod, atleti, 'M')   // Q1-Q4
  femaleGroups = generatePlayerGroups(proette, mod, atlete, 'F')   // Q1-Q4
  allGroups    = [...femaleGroups, ...maleGroups]                  // donne, poi uomini
↓
Stessa identica logica del 54 buche generateSingleTee('prima'). ✓
```

### 7.4 Test di regressione aggiunti

In `resources/js/quadranti/quadranti-logic.test.js` (e mirror) sono stati
aggiunti 4 nuovi test nel `describe('Nuovi formati …')` dopo riga 1918:

1. `COMPETITION_FORMATS: Gara Giovanile abilita tee unico (logica 54)` — verifica
   che `tee` includa `'single'`.
2. `COMPETITION_FORMATS: Teodoro Soldati abilita tee unico (logica 54)` — idem.
3. `Gara Giovanile tee unico: stessa logica 54 prima (donne prima, poi uomini)`
   — con `players=30, proette=12, mod=3` verifica: 14 righe totali, prima riga
   con celle rosse (donne), ultima riga senza rosso (uomini), tutti i rank donne
   1..12 presenti.
4. `Teodoro Soldati tee unico: stessa logica 54 prima` — con `players=60,
   proette=18` verifica 26 righe e l'ordine donne→uomini.

**Risultato suite completa**: 183/183 test passati (zero regressioni).

```
$ vitest run resources/js/quadranti/quadranti-logic.test.js
Test Files  1 passed (1)
     Tests  183 passed (183)
```

### 7.5 Correzione collaterale dei test esistenti

Durante l'aggiunta dei test ho scoperto che `generateDoubleTee` e
`generateSingleTee` usano **due formati CSS diversi** per il colore delle donne:

- `generateDoubleTee` → `style="color: red"` (con spazio)
- `generateSingleTee` → `style="font-style:italic; color:red"` (senza spazio)

Alcuni test esistenti che usano `expect(html).not.toContain('color:red')` su
output `generateDoubleTee` passavano in modo **vacuamente positivo** (l'html
contiene `color: red` con spazio, ma `not.toContain('color:red')` controlla la
versione senza spazio, quindi passa pur senza verificare nulla di sensato).

Ho normalizzato i 4 assert dual-tee per usare il formato corretto `'color: red'`
con spazio (righe 664, 696, 1010, 1139 del test file). Questo era un bug
silenzioso di tipo "test che non testa quello che dice di testare".

---

## 8. Riassunto patch proposte vs decisioni

| § | Voce | Stato decisione |
|---|------|-----------------|
| §3 | 72 buche · 4° giro · donne | **Opzione B** scelta → nessuna modifica al codice |
| §4 | Commento fuorviante riga 1901-1902 | Patch opzionale chiarificatrice, applicabile in qualsiasi momento |
| §6 | Patrocinate / Trofei tee unico | Nessuna patch — già allineato alla direttiva "logica 54" |
| §7 | Gara Giovanile / Teodoro Soldati tee unico | ✅ **PATCH APPLICATA** — tee unico abilitato con logica 54 'prima' + 4 test di regressione + correzione di 4 assert vacui dual-tee |

Suite completa: **183/183 test passati**, zero regressioni.
