# Modello Quadranti Unificato — proposta

## Perché
Oggi il rendering degli orari di partenza ha **tre procedure separate**:
giro di qualificazione (`generate54/36HoleTableNew`), giro finale, distribuzione
U-rovesciata. Ognuna rifà a modo proprio la numerazione dei flight, il
bilanciamento tra i tee e gli stacchi temporali.

È la causa dei bug ricorrenti: numerazione flight sbagliata in Giovanili giro
unico, Patrocinate 2° giro e 54/72 3° giro; buchi tra i tee; comportamenti
divergenti tra una gara e l'altra.

La soluzione: **un solo oggetto `Quadrante` e un solo motore**. Ogni gara
diventa soltanto dati.

---

## 1. L'oggetto `Quadrante`
Un Quadrante è un gruppo di giocatori, su un tee, in una sessione:

```
Quadrante = {
  categoria : 'M' | 'F',
  sessione  : 'early' | 'late',
  tee       : 1 | 10,
  range     : [primoRango, ultimoRango],   // numeri dei giocatori
  direzione : 'asc' | 'desc',              // righe crescenti o calanti
  terzetto  : 'diretto' | 'reversed'       // ordine interno: 1·2·3 oppure 3·2·1
}
```

Tutto qui. Non esistono "quadranti del finale" o "quadranti giovanili": esiste
il Quadrante, e basta.

---

## 2. Il motore unico — `renderQuadranti(quadranti)`
Una sola funzione che, ricevuta la lista di Quadranti, fa **sempre** le stesse
quattro cose:

1. **Accoppia** Tee 1 e Tee 10 riga per riga.
2. **Numera i flight** — per categoria: prima tutto il Tee 1 (early → late)
   come 1, 2, 3 … k; poi tutto il Tee 10 (early → late) come k+1 … 2k.
   Uomini e donne hanno contatori separati.
3. **Bilancia** — Tee 1 e Tee 10 di ogni sessione hanno lo stesso numero di
   flight: niente buchi.
4. **Stacco Early → Late** — mezzo giro (tempo di attraversamento del campo).

Numerazione, bilanciamento e stacchi si scrivono **una volta sola**. I tre bug
di numerazione spariscono perché la numerazione non la fa più ogni formato:
la fa il motore.

---

## 3. Da gara a Quadranti — `costruisciQuadranti(descrittoreGiro, campo)`
Ogni giro di ogni gara è un piccolo descrittore:

```
{ forma: 'U' | 'U-rovesciata', verso: 'sn-dx' | 'dx-sn', reversed: true|false }
```

- `bilanciaQuadranti` (già esistente, **non si tocca**) divide il campo nei 4
  intervalli di range.
- `forma` + `verso` danno l'orientamento dei 4 quadranti (quale tee, asc/desc).
- `reversed` imposta il `terzetto` dei quadranti.

Una funzione `costruisciQuadranti` traduce il descrittore + il campo nella lista
di oggetti `Quadrante`, che il motore poi disegna.

### 3.1 Conteggi incompleti — regola di allocazione (`difference`)
Quando i giocatori non sono un multiplo di `mod` restano posti scoperti:

```
difference = (flight totali × mod) − giocatori        // vale 0, 1, 2, 3
```

La regola — **specifica iniziale, README modulo Quadranti §3.3**, già
implementata in `limitiQuadranti` + `generatePlayerGroups` — dice DOVE finiscono
i flight non pieni:

| difference | Allocazione |
|---|---|
| 0 | Tutti i flight pieni. |
| 1 | Il **primo flight di Q1** ha 2 giocatori invece di `mod`. |
| 2 | I **primi due flight di Q1** hanno 2 giocatori invece di `mod`. |
| 3 (mod = 3) | Q1 resta pieno; viene tagliato l'**ultimo flight di Q3** (riga vuota in fondo). |

`difference` si "scarica" su Q1 (`playersQ1 = playersQ1 − difference` in
`limitiQuadranti`): le righe corte stanno **in testa a Q1**, la riga vuota
**in coda a Q3**. Nel modello unificato questa regola appartiene al motore —
`costruisciQuadranti` la applica una volta sola, identica per ogni gara.

---

## 4. Le gare come DATI — notazione stringa `FORMA-VERSO`

Ogni sezione (Early/Late) di ogni giro è descritta da UNA stringa
(`parseForma` in config.js):

```
FORMA  'U' (∪) · 'UR' (∩, U rovesciata) · 'S' (entrambi i tee in giù)
VERSO  'L/R' (il percorso parte da Tee 1) · 'R/L' (parte da Tee 10)
```

| Gara                        | Giro             | Early    | Late     | reversed |
|-----------------------------|------------------|----------|----------|----------|
| 54 / 72 buche               | 1° giro          | UR-R/L   | U-R/L    | no       |
| 54 / 72 buche               | 2° giro          | U-L/R    | UR-L/R   | no       |
| 54 / 72 buche               | 3°/4° (finale)   | UR-L/R   | UR-L/R   | sì       |
| Gare Patrocinate / Trofei   | 1° giro          | UR-R/L   | U-R/L    | no       |
| Gare Patrocinate / Trofei   | 2° giro          | UR-L/R   | UR-L/R   | sì       |
| Gare Giovanili / T. Soldati | giro unico       | UR-L/R   | UR-L/R   | no       |
| Prova di gioco SNP          | 1° giro          | UR-R/L   | S-R/L    | no       |
| Prova di gioco SNP          | 2° giro          | S-L/R    | UR-L/R   | no       |
| Prova di gioco SNP          | 3°/4° (coppie)   | —        | —        | —        |

### 4.1 Prova di gioco Scuola Nazionale Professionisti (Appendice F)
- 132 uomini, nessuna donna; taglio FISSO a 52 dopo 2 giri (`cutFixed`).
- Giri 1-2 (ordine di merito, solo doppio tee): il campo è diviso in due metà
  per ranghi che ruotano tra le sessioni (`earlyHalf: 'bassa' | 'alta'`).
  La forma **S** = i due tee scorrono nella STESSA direzione (né ∪ né ∩):
  1° giro Late (Tee1 100→132 ↓ · Tee10 67→99 ↓) e 2° giro Early.
- Giri 3-4 (ordine di classifica, solo TEE UNICO): flight da 2 in classifica
  INVERSA (match 1 = 52·51 … match 26 = 2·1), gap 8′ con pausa extra di 5′
  ogni 8 match (non a ridosso della fine). Descrittore `coppie`.

---

## 5. Cosa cambia nel codice
- I tre rami separati (`isFinaleRound`, `u-rovesciata`, flusso qualificazione)
  → **un solo motore** `renderQuadranti`.
- `bilanciaQuadranti` e l'algoritmo dei quadranti del 54/72: **non si toccano**
  (restano la fonte dei range — sono già corretti).
- Ogni formato diventa **una riga** della tabella al punto 4.

## 6. Cosa serve da te
Conferma (o correggi) il modello: l'oggetto `Quadrante`, le quattro
responsabilità del motore, la tabella delle gare. Appena è giusto, riscrivo
l'engine su questo modello — una volta, e i tre bug spariscono per costruzione.
