# Report — Verifica partenze TEE UNICO (giro finale)

**Data**: 2026-05-26
**Scope**: 54 buche · giro finale (3°) + 54/72 buche con giro finale (variante 72 buche)
**Fonte di verità**: PDF in `Schemi partenze/`
**Codice esaminato**: `resources/js/quadranti/quadranti-logic.js` → `generateSingleTee()`
**Mirror sincronizzato**: `_overrides_quadranti/...` identico al main (`diff -q` ⇒ vuoto)

---

## 1. Esito sintetico

| Caso | Stato | Note |
|------|-------|------|
| Gara 54 buche · giro `finale` (3°) tee unico | ✅ ALLINEATO | Match perfetto con `54 buche.pdf` → "3° GIRO PER CLASSIFICA TEE 1" |
| Gara 72 buche · giro `terzo` (3°) tee unico | ✅ ALLINEATO | Match perfetto con `72 buche.pdf` → "3° GIRO PER CLASSIFICA" |
| Gara 72 buche · giro `quarto` (4°) tee unico | ⚠️ **DISCREPANZA** | Codice esclude le donne; PDF le include |
| Schema 54/72 con giro finale (annotation REVERSED) | ✅ ALLINEATO | Ordine decrescente di classifica rispettato per U e D |

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

## 6. Decisione richiesta

Solo per la **discrepanza §3** servono istruzioni:

- **Opzione A**: applichiamo le patch §3.4 (codice → segue PDF, donne giocano
  4 giri nel 72 buche).
- **Opzione B**: lasciamo il codice com'è, e tu correggi il PDF rimuovendo il
  blocco donne dal 4° giro.

Le altre voci (§4 commento fuorviante) sono opzionali — applicabili in qualsiasi
momento senza dipendenze.
