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

## 4. Le sei gare come DATI
Dai tuoi tre schemi (54/72, Patrocinate/Trofei, Giovanili):

| Gara                        | Giro            | forma         | reversed |
|-----------------------------|-----------------|---------------|----------|
| 54 / 72 buche               | 1° giro         | U             | no       |
| 54 / 72 buche               | 2° giro         | U-rovesciata  | no       |
| 54 / 72 buche               | 3° giro (finale)| U-rovesciata  | sì       |
| Gare Patrocinate / Trofei   | 1° giro         | U             | no       |
| Gare Patrocinate / Trofei   | 2° giro         | U-rovesciata  | sì       |
| Gare Giovanili / T. Soldati | giro unico      | U-rovesciata  | no       |

(il `verso` sn-dx / dx-sn di ciascun giro lo fissiamo insieme leggendo gli
schemi; la tabella sopra è la struttura, da confermare.)

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
