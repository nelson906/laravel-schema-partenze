# Audit Quadranti — codice vs PDF ufficiali

Analisi ampia richiesta: i test sono verdi ma in realtà gli schemi prodotti
divergono dai PDF in `Schemi partenze/`. Confronto fatto generando l'output
reale del codice (`generateSingleTee` / `generateDoubleTee`) e mettendolo a
fianco delle tabelle PDF.

## STATO RISOLUZIONE (aggiornato)

Implementato il **motore unico** (`espandiSezione` / `renderQuadranti` /
`costruisciQuadrantiSingleTee`) e validato su fixture estratte dai PDF
(`__fixtures__pdf.json`, test `quadranti-engine.test.js`). 238 test verdi, build OK.

- **A1 (interno terzetto tee unico)** → RISOLTO: ora crescente (qualificazione).
- **A2 (twosome doppie)** → RISOLTO: ranghi alti, primo volo Tee 1 (scelta utente).
- **A3 (twosome tee unico)** → RISOLTO con A1.
- **B1 (ordine blocchi finale tee unico)** → era un BUG, RISOLTO: back-half a
  gruppi crescenti (`28→54`), come da PDF; validato su `g54_finale`.
- **B2 (righe vuote doppie qualificazione)** → NON è un bug: sono separatori
  Early/Late legittimi; twosome in testa a Q1 (§3.1), tutti i ranghi presenti,
  interno ascendente. Il flusso storico cerchio/clessidra è già PDF-corretto.

Rimossi i metodi morti `buildSingleTeeSection` e `buildBlock`. Restano sulla
logica storica (corretta, non ancora collassata nel motore) i giri doppi
54/72 1°/2° (cerchio/clessidra): migrarli sarebbe puro refactoring — NON
necessario per correttezza. Diagnosi originale qui sotto.

File analizzati: `resources/js/quadranti/quadranti-logic.js`, `config.js`,
snapshot `__snapshots__/quadranti-logic.test.js.snap`.
PDF di riferimento: `54 buche`, `72 buche`, `Gare Patrocinate`,
`Trofei Giovanili`, `Teodoro Soldati`, `TEE UNICO`, `Schema Partenze`.

---

## Regola di verità ricavata dai PDF

**Ordine interno del terzetto** (come si leggono i 3 numeri in una riga):

| Tipo di giro | Ordine interno | Esempio PDF |
|---|---|---|
| Ordine di merito (qualificazione 1°/2° giro, giovanili/trofei 1° giro) | **CRESCENTE** | `25 26 27` · `61 62 63` · `88 89 90` |
| Ordine di classifica / finale (patrocinate-trofei 2° giro, 3°/4° finale) | **DECRESCENTE** | `69 68 67` · `27 26 25` · `75 74 73` |

**Posizione del volo incompleto (twosome):** sempre il **primo volo** della
sezione che apre il programma (in alto a sinistra), mai in coda.

**Struttura blocchi single tee giovanili** (da `TEE UNICO.pdf`, schema a
quadranti): uomini-alti (Q4→Q3) → **donne** (Q4→Q3→Q2→Q1) → uomini-bassi
(Q2→Q1). Donne in mezzo. Terzetti interni crescenti.

---

## Anomalie confermate

### A1 — Ordine interno terzetti INVERTITO nei giri di qualificazione (tee unico) 🔴 alta gravità

Output reale del codice contro PDF:

```
Teodoro Soldati · tee unico · 1° giro
  CODICE: 90 89 88 / 87 86 85 / 84 83 82 ...   (decrescente)
  PDF   : 88 89 90 / ...        / 61 62 63 ...  (CRESCENTE)
```

Vale anche per Gara 54/72 buche tee unico (qualificazione) e Gara Giovanile.

- **Causa:** `buildSingleTeeSection` (righe 528–558) costruisce ogni gruppo
  scorrendo i rank dal più alto al più basso (`for r = ...; i--`). Il ramo
  `else` di `generateSingleTee` (righe 2183–2251) usa solo questo metodo per la
  tabella orari.
- **Perché i test non lo vedono:** i 4 golden snapshot single-tee
  (`quadranti-logic.test.js.snap`, righe 911/913/915/917 — 54/72 · prima/seconda)
  **congelano l'ordine decrescente sbagliato**. Sono verdi perché riproducono il
  bug, non perché sia corretto. → *test verde, realtà sbagliata*.

### A2 — Twosome in coda invece che al primo volo (doppie partenze) 🔴 alta gravità

```
Gara Giovanile · doppie · 1° giro · 62 uomini
  CODICE: ultimo volo (riga 12) = [31 32 ·]  ← twosome in fondo, Tee 1
  PDF   : il twosome apre la sezione Late (primo volo, alto)
```

- **Causa:** `arco` (righe 800–813): `cut = Math.floor(totFlights/2)*mod` e
  `chunk(...).reverse()` collocano il chunk parziale (2 giocatori) all'estremità
  sbagliata dell'arco. Il residuo non viene forzato in testa.
- Corrisponde ai 2 test marcati "BUG … rossi fino ad allora"
  (`quadranti-logic.test.js` righe 2170–2193): descrivono esattamente questo,
  e infatti **falliscono** già ora.

### A3 — Twosome single tee: posizione giusta, ordine sbagliato 🟠 media

```
Gara Giovanile · tee unico · 62 uomini
  CODICE: volo 1 = [62 61 ·]     (twosome in testa ✔, ma decrescente �’)
  ATTESO: volo 1 = [61 62 ·]      (crescente)
```

Il posizionamento in testa è corretto; resta solo l'ordine interno (stessa
radice di A1).

---

## Anomalie da verificare con te (media confidenza)

### B1 — Ordine dei blocchi nel finale tee unico

```
Gara 54 buche · tee unico · finale
  CODICE: 54 53 52 / 51 50 49 / ... / 30 29 28 / 27 26 25 ...  (gruppi 54→1)
  PDF (3° giro per classifica, Tee 1):
          30 29 28 / 33 32 31 / 36 35 34 ... (back-half a gruppi CRESCENTI)
          poi 27 26 25 / 24 23 22 ...        (front-half a gruppi decrescenti)
          poi donne
```

L'ordine **interno** (decrescente) è corretto; ma l'ordine dei **gruppi** del
blocco back-half è invertito rispetto al PDF. Da confermare se usi davvero il
tee unico per il finale (il PDF ne mostra una versione dedicata).

### B2 — Righe vuote / range nei giri doppi di qualificazione (cerchio/clessidra)

`generateDoubleTee('prima')` 54 buche produce righe-separatore vuote e una riga
con cella vuota iniziale (`[· 22 23 24]`). Va confrontato riga-per-riga col PDF
54/72 buche 1°/2° giro per stabilire se sono separatori legittimi (BLOCK_GAP) o
disallineamenti reali. Questo ramo (flusso storico cerchio/clessidra) non è
toccato dai casi sopra.

---

## Causa radice architetturale

Il sistema ha **più procedure parallele** che reimplementano ognuna a modo
proprio le stesse 3 decisioni — ordine interno terzetto, posizione twosome,
ordine blocchi:

- `buildSingleTeeSection` (tee unico qualificazione) → decrescente
- `buildBlock` direction `desc` (righe 457–510) → decrescente
- `arco` (doppie UR) → crescente, ma twosome mal collocato
- `desc()` + blocchi back/front (finale tee unico)
- flusso storico cerchio/clessidra (doppie 54/72 qualificazione)

Queste implementazioni **non concordano** tra loro: da qui le anomalie viste in
produzione. È esattamente la diagnosi di `MODELLO_QUADRANTI.md`, che propone un
**motore unico** (`renderQuadranti` su oggetti `Quadrante` con campi
`direzione` asc/desc e `terzetto` diretto/reversed) e le gare come soli dati.

Patchare le singole funzioni curerebbe il sintomo ma lascerebbe le 5 strade
divergenti. La correzione strutturale è collassarle nel motore unico, dove
ordine interno / twosome / numerazione si scrivono **una volta sola**.

---

## Nota sui golden snapshot

I 4 snapshot single-tee (54/72 · prima/seconda) **codificano il
comportamento errato** (terzetti decrescenti). Qualunque fix corretto li renderà
rossi: andranno **rigenerati** dopo aver verificato a mano che riflettano i PDF
(crescente). Finché restano così, mascherano A1.
