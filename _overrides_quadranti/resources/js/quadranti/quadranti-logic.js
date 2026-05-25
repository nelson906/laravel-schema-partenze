/**
 * Quadranti Logic Module - Updated Version
 * Contains the core business logic for calculating and generating tee times
 * with improved quadrant balancing algorithm
 */

import {
    DATEPICKER_IT,
    TABLE_COLORS,
    COMPETITION_TYPES,
    COMPETITION_FORMATS,
    ROUND_TYPES,
    COMPACT_TYPES
} from './config.js';

import {
    range,
    addTime,
    halfTime,
    storage,
    formatDate,
    chunkArray
} from './utils.js';

/**
 * Class representing the quadranti logic for tee time calculations
 */
export class QuadrantiLogic {
    constructor(config) {
        this.config = config;
        this.tableHTML = '';
    }

    /**
     * Updates configuration
     * @param {Object} newConfig - New configuration values
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Initializes datepicker with Italian localization
     * @param {jQuery} $ - jQuery instance
     */
    initializeDatepicker($) {
        $.datepicker.regional['it'] = DATEPICKER_IT;
        $.datepicker.setDefaults($.datepicker.regional['it']);

        $('.datepicker').datepicker({
            dateFormat: 'dd-mm-yy'
        });
    }

    /**
     * Fetches sunrise and sunset times via AJAX
     * @param {string} geoArea - Geographic area
     * @param {string} date - Date in DD-MM-YYYY format
     * @returns {Promise<Object>} Promise resolving to ephemeris data
     */
    async fetchEphemerisData(geoArea, date) {
        try {
            // L'URL è iniettato dalla view via meta tag (route() di Laravel),
            // così quadranti-logic.js resta identico tra progetti con prefissi
            // di route diversi. Fallback al vecchio path per retrocompatibilità.
            const coordUrl = $('meta[name="quadranti-coordinates-url"]').attr('content')
                || (($('meta[name="base-url"]').attr('content') || '') + '/user/quadranti/coordinates');
            const response = await $.ajax({
                url: coordUrl,
                type: 'POST',
                dataType: 'json',
                headers: {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
                },
                data: { geo_area: geoArea, start: date }
            });
            return response;
        } catch (error) {
            console.error('Error fetching ephemeris data:', error);
            return { sunrise: 'N/A', sunset: 'N/A' };
        }
    }

    /**
     * NEW: Balances quadrants for optimal distribution
     * @param {number} players - Total number of players
     * @param {number} mod - Players per flight (3 or 4)
     * @returns {Object} Quadrant distribution
     */
    bilanciaQuadranti(players, mod = 3, maxEarlySlots = null) {
        let totalMatches = Math.ceil(players / mod);

        // Start with equal distribution
        let Q1 = Math.floor(totalMatches / 4);
        let Q2 = Math.floor(totalMatches / 4);
        let Q3 = Math.floor(totalMatches / 4);
        let Q4 = Math.floor(totalMatches / 4);

        // Distribute remainder (natural: Early first)
        let remainder = totalMatches % 4;
        if (remainder > 0) Q1++;
        if (remainder > 1) Q2++;
        if (remainder > 2) Q4++;

        // Constraint: max orari Early (uomini+donne combined ≤ 12 per session)
        // Se Q1 supera il limite, sposta l'eccesso su Late (Q3/Q4)
        if (maxEarlySlots !== null && Q1 > maxEarlySlots) {
            const overflow = Q1 - maxEarlySlots;
            Q1 -= overflow;
            Q2 -= overflow;
            Q3 += overflow;
            Q4 += overflow;
        }

        // Apply special rules based on player count modulo
        const rem12 = players % 12;

        if (mod === 3) {
            if ((rem12 === 1 || rem12 === 2 || rem12 === 3) && Q3 > 0) {
                Q3--;
                Q2++;
            }
        } else if (mod === 4) {
            const rem16 = players % 16;
            if ((rem16 === 1 || rem16 === 2 || rem16 === 3 || rem16 === 4) && Q3 > 0) {
                Q3--;
                Q2++;
            }
        }

        return { Q1, Q2, Q3, Q4 };
    }

    /**
     * NEW: Calculates quadrant limits based on balanced distribution
     * @param {number} players - Total number of players
     * @param {number} mod - Players per flight
     * @returns {Object} Limits and quadrant info
     */
    limitiQuadranti(players, mod, maxEarlySlots = null) {
        const quadranti = this.bilanciaQuadranti(players, mod, maxEarlySlots);

        // Calculate total flights
        let sumQuadranti = quadranti.Q1 + quadranti.Q2 + quadranti.Q3 + quadranti.Q4;

        // Calculate players per quadrant
        let playersQ1 = mod * quadranti.Q1;
        let playersQ2 = mod * quadranti.Q2;
        let playersQ3 = mod * quadranti.Q3;
        let playersQ4 = mod * quadranti.Q4;

        // Handle incomplete flights (difference between full capacity and actual players)
        let fullPlayers = sumQuadranti * mod;
        let difference = fullPlayers - players;

        // Remove difference from Q1 (incomplete flight handling)
        playersQ1 = playersQ1 - difference;

        // Calculate limits for player distribution
        let limit1 = playersQ2;                           // End of Q2
        let limit2 = playersQ2 + playersQ1;              // End of Q1 (Q2+Q1)
        let limit3 = players - playersQ3;                // Start of Q3

        return {
            limit1,
            limit2,
            limit3,
            players,
            quadranti,
            difference,
            playersPerQuadrant: {
                Q1: playersQ1,
                Q2: playersQ2,
                Q3: playersQ3,
                Q4: playersQ4
            }
        };
    }

    /**
     * NEW: Remaps quadrants for day 2 rotation
     * @param {string} originalQuadrant - Original quadrant (Q1-Q4)
     * @param {number} dayNumber - Day number (1 or 2)
     * @returns {string} Remapped quadrant
     */
    remapQuadrant(originalQuadrant, dayNumber) {
        if (dayNumber === 1) {
            return originalQuadrant;
        }

        // Day 2 mapping: Q1->Q4, Q2->Q3, Q3->Q1, Q4->Q2
        const mapping = {
            'Q1': 'Q4',
            'Q2': 'Q3',
            'Q3': 'Q1',
            'Q4': 'Q2'
        };

        return mapping[originalQuadrant] || originalQuadrant;
    }

    /**
     * Restituisce gli array di giocatori da usare per la generazione tabella.
     *
     * Fonte di verità unica:
     *   - storage.atleti / storage.atlete  ← nomi (quando nominativo='On')
     *   - this.config.players / proette    ← conteggio numerico
     *
     * I vecchi `storedPlayersCount`/`storedProetteCount` erano ridondanti con
     * `atleti.length`/`atlete.length` e sono stati rimossi (state sprawl
     * cleanup, refactor 8 maggio).
     *
     * Logica:
     *   - se nominativo='On' E i nomi salvati combaciano con i counter → usa nomi
     *   - altrimenti → array numerico [1..N], e se nominativo='Off' pulisce i
     *     nomi dallo storage
     */
    getPlayerArrays() {
        const nominativo = this.config.nominativo;
        const players = parseInt(this.config.players) || 0;
        const proette = parseInt(this.config.proette) || 0;

        let atleti = storage.get('atleti', []);
        let atlete = storage.get('atlete', []);

        const namesValid = (
            nominativo === 'On' &&
            atleti.length === players &&
            atlete.length === proette
        );

        if (!namesValid) {
            atleti = range(1, players);
            atlete = range(1, proette);
            if (nominativo !== 'On') {
                storage.remove('atleti');
                storage.remove('atlete');
            }
        }

        return { atleti, atlete };
    }

    /**
     * NEW: Generates player groups based on new quadrant logic
     * @param {number} players - Total players
     * @param {number} mod - Players per flight
     * @param {Array} sourceArray - Source array of player names/numbers
     * @param {string} category - 'M' for men, 'F' for women
     * @returns {Array} Array of player groups with quadrant info
     */
    generatePlayerGroups(players, mod, sourceArray, category = 'M', maxEarlySlots = null) {
        const limits = this.limitiQuadranti(players, mod, maxEarlySlots);
        const groups = [];
        const difference = limits.difference;

        // Indici originali nell'array sorgente (atleti/atlete), allineati a sourceArray.
        // Servono al pulsante "rimuovi" della UI per identificare univocamente la riga
        // da cancellare anche in presenza di omonimie.
        const sourceIndices = sourceArray.map((_, i) => i);

        // Q2: Players 1 to limit1 (descending order, from largest to smallest)
        const q2Players = sourceArray.slice(0, limits.limit1);
        const q2Indices = sourceIndices.slice(0, limits.limit1);
        const q2Groups = [];
        for (let i = q2Players.length - 1; i >= 0; i -= mod) {
            const group = [];
            const groupIdx = [];
            for (let j = 0; j < mod && (i - j) >= 0; j++) {
                group.push(q2Players[i - j]);
                groupIdx.push(q2Indices[i - j]);
            }
            if (group.length > 0) {
                q2Groups.push({
                    players: group.reverse(),
                    playerIndices: groupIdx.reverse(),
                    quadrant: 'Q2',
                    type: 'Early',
                    category: category
                });
            }
        }
        groups.push(...q2Groups);

        // Q1: Players from limit1+1 to limit2 (ascending order, handling difference)
        const q1Players = sourceArray.slice(limits.limit1, limits.limit2);
        const q1Indices = sourceIndices.slice(limits.limit1, limits.limit2);
        const q1Groups = [];

        if (difference === 1 && q1Players.length > 0) {
            // First group has 2 players only
            if (q1Players.length >= 2) {
                q1Groups.push({
                    players: [q1Players[0], q1Players[1]],
                    playerIndices: [q1Indices[0], q1Indices[1]],
                    quadrant: 'Q1',
                    type: 'Early',
                    category: category
                });
            }
            // Rest in groups of mod
            for (let i = 2; i < q1Players.length; i += mod) {
                const group = q1Players.slice(i, Math.min(i + mod, q1Players.length));
                const groupIdx = q1Indices.slice(i, Math.min(i + mod, q1Players.length));
                if (group.length > 0) {
                    q1Groups.push({
                        players: group,
                        playerIndices: groupIdx,
                        quadrant: 'Q1',
                        type: 'Early',
                        category: category
                    });
                }
            }
        } else if (difference === 2 && q1Players.length > 0) {
            // First two groups have 2 players each
            if (q1Players.length >= 2) {
                q1Groups.push({
                    players: [q1Players[0], q1Players[1]],
                    playerIndices: [q1Indices[0], q1Indices[1]],
                    quadrant: 'Q1',
                    type: 'Early',
                    category: category
                });
            }
            if (q1Players.length >= 4) {
                q1Groups.push({
                    players: [q1Players[2], q1Players[3]],
                    playerIndices: [q1Indices[2], q1Indices[3]],
                    quadrant: 'Q1',
                    type: 'Early',
                    category: category
                });
            }
            // Rest in groups of mod
            for (let i = 4; i < q1Players.length; i += mod) {
                const group = q1Players.slice(i, Math.min(i + mod, q1Players.length));
                const groupIdx = q1Indices.slice(i, Math.min(i + mod, q1Players.length));
                if (group.length > 0) {
                    q1Groups.push({
                        players: group,
                        playerIndices: groupIdx,
                        quadrant: 'Q1',
                        type: 'Early',
                        category: category
                    });
                }
            }
        } else if (difference === 3 && mod === 3) {
            // Special case: remove last flight from Q3, not from Q1
            // Q1 keeps normal grouping
            for (let i = 0; i < q1Players.length; i += mod) {
                const group = q1Players.slice(i, Math.min(i + mod, q1Players.length));
                const groupIdx = q1Indices.slice(i, Math.min(i + mod, q1Players.length));
                if (group.length > 0) {
                    q1Groups.push({
                        players: group,
                        playerIndices: groupIdx,
                        quadrant: 'Q1',
                        type: 'Early',
                        category: category
                    });
                }
            }
        } else {
            // Normal grouping
            for (let i = 0; i < q1Players.length; i += mod) {
                const group = q1Players.slice(i, Math.min(i + mod, q1Players.length));
                const groupIdx = q1Indices.slice(i, Math.min(i + mod, q1Players.length));
                if (group.length > 0) {
                    q1Groups.push({
                        players: group,
                        playerIndices: groupIdx,
                        quadrant: 'Q1',
                        type: 'Early',
                        category: category
                    });
                }
            }
        }
        groups.push(...q1Groups);

        // Q3: Players from limit3+1 to players (descending order)
        // Special handling for difference=3 case
        let q3Players = sourceArray.slice(limits.limit3);
        let q3Indices = sourceIndices.slice(limits.limit3);
        if (difference === 3 && mod === 3) {
            // Remove last player(s) to avoid incomplete flight
            const trimmed = q3Players.length - (q3Players.length % mod);
            q3Players = q3Players.slice(0, trimmed);
            q3Indices = q3Indices.slice(0, trimmed);
        }

        const q3Groups = [];
        for (let i = q3Players.length - 1; i >= 0; i -= mod) {
            const group = [];
            const groupIdx = [];
            for (let j = 0; j < mod && (i - j) >= 0; j++) {
                group.push(q3Players[i - j]);
                groupIdx.push(q3Indices[i - j]);
            }
            if (group.length === mod) { // Only add complete groups
                q3Groups.push({
                    players: group.reverse(),
                    playerIndices: groupIdx.reverse(),
                    quadrant: 'Q3',
                    type: 'Late',
                    category: category
                });
            }
        }
        groups.push(...q3Groups);

        // Q4: Players from limit2+1 to limit3 (ascending order)
        const q4Players = sourceArray.slice(limits.limit2, limits.limit3);
        const q4Indices = sourceIndices.slice(limits.limit2, limits.limit3);
        for (let i = 0; i < q4Players.length; i += mod) {
            const group = q4Players.slice(i, Math.min(i + mod, q4Players.length));
            const groupIdx = q4Indices.slice(i, Math.min(i + mod, q4Players.length));
            if (group.length > 0) {
                groups.push({
                    players: group,
                    playerIndices: groupIdx,
                    quadrant: 'Q4',
                    type: 'Late',
                    category: category
                });
            }
        }

        return groups;
    }

  /**
   * Numerazione flight UNIFICATA — una sola regola per ogni gara.
   *
   * Dato l'elenco dei blocchi (ognuno con i gruppi `tee1[]` e `tee10[]`),
   * assegna il `flightNumber` così: per ciascuna categoria, prima TUTTI i
   * flight del Tee 1 — nell'ordine dei blocchi, quindi Early poi Late —
   * numerati 1..k; poi TUTTI quelli del Tee 10, k+1..2k. Uomini e donne
   * hanno contatori separati.
   *
   * È la regola unica del modello quadranti: la numerazione non è più
   * responsabilità del singolo formato, ma di questa funzione. Elimina i
   * disallineamenti di numerazione nei giri finale / giovanili / patrocinate.
   *
   * @param {Array<{cat:('M'|'F'), tee1:Array, tee10:Array}>} blocchi
   */
  assegnaFlightUnificato(blocchi) {
    ['M', 'F'].forEach((cat) => {
      let n = 1;
      const cb = blocchi.filter((b) => b.cat === cat);
      cb.forEach((b) => b.tee1.forEach((g) => { g.flightNumber = n++; }));
      cb.forEach((b) => b.tee10.forEach((g) => { g.flightNumber = n++; }));
    });
  }

  /**
   * Generates double tee configuration with new logic
   * @param {string} round - 'prima', 'seconda' o 'finale'
   * @returns {string} HTML table content
   */
  generateDoubleTee(round) {
    const mod = parseInt(this.config.playersPerFlight) || 3;
    const players = parseInt(this.config.players) || 0;
    const proette = parseInt(this.config.proette) || 0;
    const garaNT = this.config.garaNT;

    // ── Dispatch data-driven formato/giro ──────────────────────────────
    // Il descrittore COMPETITION_FORMATS sostituisce i check cablati: per la
    // coppia (formato, giro) dice se il giro è di tipo 'finale' e se è
    // riservato ai soli uomini (4° giro della Gara 72 buche). Se il formato
    // non è in tabella si ricade nel comportamento storico 54 buche.
    const formatDesc = COMPETITION_FORMATS[garaNT] || null;
    const roundDesc = formatDesc
      ? formatDesc.rounds.find((r) => r.id === round)
      : null;
    const isFinaleRound = roundDesc
      ? roundDesc.type === 'finale'
      : (round === ROUND_TYPES.FINAL && garaNT === COMPETITION_TYPES.GARA_54);
    const isMenOnlyRound = roundDesc ? roundDesc.gender === 'men' : false;
    // Forma dei quadranti del giro (vedi COMPETITION_FORMATS): 'U' = giri di
    // qualificazione 54/72 (flusso storico, nessun ramo dedicato); 'UR' = U
    // rovesciata, layout ∩ dei formati giovanili/patrocinate (ramo qui sotto).
    const forma = roundDesc ? roundDesc.forma : null;

    // Reset buffer Vista FIG: buildGroupTableRows lo riempie durante il render.
    this._figFlightsBuffer = [];

    // GIRO FINALE (54 buche: 3° giro; 72 buche: 3° e 4° giro): layout dedicato.
    // - Uomini Tee 1 = front-half (rank 1..frontM) decrescente, leader 1,2,3 ultimi
    // - Uomini Tee 10 = back-half (rank frontM+1..N) crescente, worst ultimi
    // - Sotto, donne con stessa logica: Tee 1 = front-half donne, Tee 10 = back-half donne
    // - Sempre numerico (ordine di classifica); usa playersCut/proetteCut.
    // - Giro 'men-only' (4° giro 72 buche): nessuna donna (proetteFinal = 0).
    // Implementato inline (no nuove funzioni come richiesto).
    if (isFinaleRound) {
      const playersFinal = parseInt(this.config.playersCut) || players;
      const proetteFinal = isMenOnlyRound
        ? 0
        : (parseInt(this.config.proetteCut) || proette);
      const colors = TABLE_COLORS.teeColors;

      // Helper closures locali a generateDoubleTee (NON nuovi metodi del modulo)
      // Costruisce gruppi in ordine DECRESCENTE (worst first, leader last) — Tee 1
      const descGroups = (arr, cat) => {
        const groups = [];
        for (let i = arr.length - 1; i >= 0; i -= mod) {
          const g = [];
          for (let j = 0; j < mod && (i - j) >= 0; j++) g.push(arr[i - j]);
          // g.length può essere < mod (gruppo incompleto), va comunque pushed
          // ma per il display rank alto a sinistra è già [27,26,25].
          groups.push({ players: g, category: cat, quadrant: 'Q1', type: 'Early' });
        }
        return groups;
      };
      // Costruisce gruppi in ordine CRESCENTE (best of back first, worst last) — Tee 10
      // Display intra-gruppo: rank alto a sinistra (gruppo 28-30 mostrato "30 29 28").
      const ascGroups = (arr, cat) => {
        const groups = [];
        for (let i = 0; i < arr.length; i += mod) {
          const slice = arr.slice(i, Math.min(i + mod, arr.length));
          groups.push({ players: slice.slice().reverse(), category: cat, quadrant: 'Q2', type: 'Early' });
        }
        return groups;
      };

      // Split per FLIGHT count (ceil sul front), come da immagine
      const rankM = range(1, playersFinal);
      const totalFlightsM = Math.ceil(playersFinal / mod);
      const frontFlightsM = Math.ceil(totalFlightsM / 2);
      const frontCountM = Math.min(frontFlightsM * mod, playersFinal);
      const frontMen = rankM.slice(0, frontCountM);
      const backMen = rankM.slice(frontCountM);

      const rankF = range(1, proetteFinal);
      const totalFlightsF = Math.ceil(proetteFinal / mod);
      const frontFlightsF = Math.ceil(totalFlightsF / 2);
      const frontCountF = Math.min(frontFlightsF * mod, proetteFinal);
      const frontWomen = rankF.slice(0, frontCountF);
      const backWomen = rankF.slice(frontCountF);

      const maleTee1  = descGroups(frontMen, 'M');
      const maleTee10 = ascGroups(backMen, 'M');
      const femTee1   = proetteFinal > 0 ? descGroups(frontWomen, 'F') : [];
      const femTee10  = proetteFinal > 0 ? ascGroups(backWomen, 'F')  : [];

      // Numerazione flight UNIFICATA — stessa regola di ogni gara: per
      // categoria, prima tutto il Tee 1, poi tutto il Tee 10 (contatori
      // uomini/donne separati). buildGroupTableRows userà questi flightNumber.
      this.assegnaFlightUnificato([
        { cat: 'M', tee1: maleTee1, tee10: maleTee10 },
        { cat: 'F', tee1: femTee1,  tee10: femTee10 },
      ]);

      // Striscia FIG: primo/ultimo numero per quadrante (giro finale doppio tee)
      this.figQuadranti = [];
      this.pushFigQuadrante('Uomini', 'Q1 · Tee 1',  maleTee1);
      this.pushFigQuadrante('Uomini', 'Q2 · Tee 10', maleTee10);
      this.pushFigQuadrante('Donne',  'Q1 · Tee 1',  femTee1);
      this.pushFigQuadrante('Donne',  'Q2 · Tee 10', femTee10);

      const gap = this.config.gap;
      const startTime = this.config.startTime;

      // Il giro finale è per definizione numerico (ordine di classifica):
      // disabilita temporaneamente il pulsante × (qd-remove) che buildGroupTableRows
      // attiva quando nominativo='On'. Ripristina dopo il render.
      const savedNominativo = this.config.nominativo;
      this.config.nominativo = 'Off';

      // Riusiamo buildGroupTableRows che già esiste e gestisce display+orari
      let bodyHtml = this.generateTableHeader(true);
      // Blocco 1: uomini (entrambi tee simultanei) — partono da startTime
      bodyHtml += this.buildGroupTableRows(
        maleTee1, maleTee10,
        TABLE_COLORS.men,
        colors.orange, colors.lightGreen,
        startTime, gap, 'M', 1
      );

      // Calcola fine blocco uomini (tempo dopo l'ultimo flight del lato più lungo)
      const maleMatches = Math.max(maleTee1.length, maleTee10.length);
      let currentTime = startTime;
      for (let i = 0; i < maleMatches; i++) currentTime = addTime(currentTime, gap);
      // Stacco extra tra blocco uomini e blocco donne (1 gap + ~10 min, in linea
      // con il pattern usato altrove tra gruppi M e F). Senza halftime crossing.
      const womenStart = addTime(currentTime, '00:00');

      // Blocco 2: donne (entrambi tee simultanei) — partono dopo gli uomini
      if (proetteFinal > 0) {
        bodyHtml += '<tr><td colspan="20" class="py-2">&nbsp;</td></tr>';
        const startMaleNum = maleTee1.length + maleTee10.length + 1;
        bodyHtml += this.buildGroupTableRows(
          femTee1, femTee10,
          TABLE_COLORS.women,
          'transparent', 'transparent',
          womenStart, gap, 'F', 1
        );
      }
      bodyHtml += '</tbody>';
      // Ripristina nominativo (potrebbe servire ad altre chiamate successive)
      this.config.nominativo = savedNominativo;

      // Info box ridotto: niente "Late" nel finale (un solo blocco continuo).
      // Riporta solo l'ultima partenza per uomini e per donne.
      const fHomMatches = Math.max(femTee1.length, femTee10.length);
      let endTime = womenStart;
      for (let i = 0; i < fHomMatches; i++) endTime = addTime(endTime, gap);
      const infoHTML = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; padding: 15px; background: #e8f5e8; border-radius: 8px;">
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${currentTime}</strong>
          <span>Ultima Partenza Uomini</span>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${womenStart}</strong>
          <span>Prima Partenza Donne</span>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${endTime}</strong>
          <span>Fine Gara Stimata</span>
        </div>
      </div>
    `;

      this.figFlights = this._figFlightsBuffer;
      return infoHTML + `<table>${bodyHtml}</table>`;
    }

    // ── QUADRANTI A "U ROVESCIATA" (forma 'UR') — doppio tee ────────────
    // Formati giovanili/patrocinate. Ogni blocco è un intervallo di ranghi
    // spezzato a metà: metà bassa → Tee 1 (terzetti in righe DECRESCENTI),
    // metà alta → Tee 10 (terzetti in righe CRESCENTI) → forma ∩. Terzetto
    // interno crescente, oppure 3·2·1 se il giro è `reversed` (2° giro "per
    // classifica" di Patrocinate/Trofei). Blocchi sequenziali:
    //   - giro NON reversed (Gara Giovanile/Teodoro Soldati): 3 blocchi —
    //     uomini metà alta, donne, uomini metà bassa;
    //   - giro reversed (Patrocinate/Trofei, 2° giro): 4 blocchi, donne IN
    //     MEZZO — uomini metà alta, donne metà alta, donne metà bassa, uomini
    //     metà bassa. Lo split metà alta/bassa è bilanciaQuadranti
    //     (Q1+Q2 = ranghi bassi, Q3+Q4 = ranghi alti).
    // Sempre numerico (ordine di merito/classifica). I giri 'finale' (forma
    // 'UR' anch'essi) sono già intercettati sopra da isFinaleRound.
    if (forma === 'UR') {
      const reversedTriplet = roundDesc ? !!roundDesc.reversed : false;
      const colors = TABLE_COLORS.teeColors;
      const gap = this.config.gap;

      // chunk: spezza un array in terzetti da `mod`.
      const chunk = (a) => {
        const out = [];
        for (let i = 0; i < a.length; i += mod) out.push(a.slice(i, i + mod));
        return out;
      };
      // arcoU: costruisce un blocco ∩. Metà bassa dell'intervallo → Tee 1
      // (terzetti in righe decrescenti); metà alta → Tee 10 (righe crescenti).
      // La numerazione flight NON si fa qui: la assegna assegnaFlightUnificato
      // su TUTTI i blocchi insieme (regola unica: Tee 1 continuo, poi Tee 10).
      const arcoU = (arr) => {
        const totFlights = Math.ceil(arr.length / mod);
        const cut = Math.floor(totFlights / 2) * mod;
        const tee1Tri = chunk(arr.slice(0, cut)).reverse(); // righe decrescenti
        const tee10Tri = chunk(arr.slice(cut));             // righe crescenti
        const mk = (t) => ({ players: reversedTriplet ? t.slice().reverse() : t.slice() });
        return { tee1: tee1Tri.map(mk), tee10: tee10Tri.map(mk) };
      };

      // Definizione dei blocchi (sempre numerici: ordine di merito/classifica).
      const menRanks = range(1, players);
      const womenRanks = range(1, proette);
      const blocchi = [];
      if (reversedTriplet) {
        // Patrocinate/Trofei 2° giro: 4 blocchi a ∩ reversed, donne IN MEZZO.
        // Lo split metà alta / metà bassa segue bilanciaQuadranti: i ranghi
        // bassi (Q1+Q2, = limit2) e i ranghi alti (Q3+Q4). Ordine di partenza:
        //   uomini metà alta → donne metà alta → donne metà bassa → uomini metà bassa.
        const menLimit = players > 0 ? this.limitiQuadranti(players, mod).limit2 : 0;
        const womenLimit = proette > 0 ? this.limitiQuadranti(proette, mod).limit2 : 0;
        const menUpper = menRanks.slice(menLimit);
        const menLower = menRanks.slice(0, menLimit);
        const womenUpper = womenRanks.slice(womenLimit);
        const womenLower = womenRanks.slice(0, womenLimit);
        if (menUpper.length > 0)   blocchi.push({ cat: 'M', arr: menUpper,   session: 'early' });
        if (womenUpper.length > 0) blocchi.push({ cat: 'F', arr: womenUpper, session: 'early' });
        if (womenLower.length > 0) blocchi.push({ cat: 'F', arr: womenLower, session: 'late' });
        if (menLower.length > 0)   blocchi.push({ cat: 'M', arr: menLower,   session: 'late' });
      } else {
        // Gara Giovanile / Teodoro Soldati: 3 blocchi ∩ in sequenza —
        // uomini metà alta (Early), donne, uomini metà bassa (Late).
        // Lo split uomini punta a metà di (uomini + donne): la sessione Early
        // (soli uomini) pareggia la Late (donne + uomini bassi). I flight
        // uomini in Early sono arrotondati a un valore PARI, così che il
        // blocco si divida equamente tra Tee 1 e Tee 10 senza lasciare "buchi".
        const menFlights = Math.ceil(players / mod);
        const womenFlights = Math.ceil(proette / mod);
        let earlyMenFlights = Math.round((menFlights + womenFlights) / 2);
        if (earlyMenFlights % 2 !== 0) earlyMenFlights -= 1; // a pari → Tee1 = Tee10
        earlyMenFlights = Math.max(0, Math.min(menFlights, earlyMenFlights));
        const earlyCount = Math.min(earlyMenFlights * mod, menRanks.length);
        const menEarly = menRanks.slice(menRanks.length - earlyCount); // ranghi alti
        const menLate = menRanks.slice(0, menRanks.length - earlyCount); // ranghi bassi
        if (menEarly.length > 0) blocchi.push({ cat: 'M', arr: menEarly,   session: 'early' });
        if (proette > 0)         blocchi.push({ cat: 'F', arr: womenRanks, session: 'late' });
        if (menLate.length > 0)  blocchi.push({ cat: 'M', arr: menLate,    session: 'late' });
      }

      // Costruisce i gruppi Tee 1 / Tee 10 di ogni blocco, POI numera i flight
      // con la regola unificata (Tee 1 continuo Early→Late, poi Tee 10), uguale
      // per ogni gara: la numerazione non dipende più dal singolo formato.
      const costruiti = blocchi.map((b) => ({ ...b, ...arcoU(b.arr) }));
      this.assegnaFlightUnificato(costruiti);

      this.figQuadranti = [];
      let bodyHtml = this.generateTableHeader(true);
      let blockTime = this.config.startTime;

      costruiti.forEach((b, bi) => {
        const { tee1, tee10 } = b;
        const colore = b.cat === 'F' ? TABLE_COLORS.women : TABLE_COLORS.men;
        const lbg = b.cat === 'F' ? 'transparent' : colors.orange;
        const rbg = b.cat === 'F' ? 'transparent' : colors.lightGreen;
        if (bi > 0) bodyHtml += '<tr><td colspan="20" class="py-2">&nbsp;</td></tr>';
        bodyHtml += this.buildGroupTableRows(
          tee1, tee10, colore, lbg, rbg, blockTime, gap, b.cat, 1
        );
        // Striscia FIG: un'entrata per tee del blocco.
        const catLabel = b.cat === 'F' ? 'Donne' : 'Uomini';
        this.pushFigQuadrante(catLabel, `Blocco ${bi + 1} · Tee 1`, tee1);
        this.pushFigQuadrante(catLabel, `Blocco ${bi + 1} · Tee 10`, tee10);
        // Avanza il tempo: righe del blocco.
        const rows = Math.max(tee1.length, tee10.length);
        for (let i = 0; i < rows; i++) blockTime = addTime(blockTime, gap);
        // Stacco prima del blocco successivo: nel passaggio Early → Late serve
        // il tempo di attraversamento (mezzo giro), come nei giri 54/72; tra
        // blocchi della stessa sessione basta uno stacco breve.
        const next = costruiti[bi + 1];
        if (next) {
          const crossing = b.session === 'early' && next.session === 'late';
          blockTime = addTime(
            blockTime,
            crossing ? halfTime(this.config.round) : '00:10'
          );
        }
      });
      bodyHtml += '</tbody>';

      const infoHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; padding: 15px; background: #e8f5e8; border-radius: 8px;">
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${this.config.startTime}</strong>
          <span>Prima Partenza</span>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${blockTime}</strong>
          <span>Fine Gara Stimata</span>
        </div>
      </div>
    `;
      this.figFlights = this._figFlightsBuffer;
      return infoHTML + `<table>${bodyHtml}</table>`;
    }

    const { atleti, atlete } = this.getPlayerArrays();
    const dayNumber = round === ROUND_TYPES.SECOND ? 2 : 1;

    // Calcola le donne prima (distribuzione naturale, senza vincoli)
    const femaleGroups = (proette > 0) ? this.generatePlayerGroups(proette, mod, atlete, 'F') : [];

    // Ricava quanti orari Early occupano le donne (ogni coppia Tee1+Tee10 = 1 orario)
    const femaleEarlySlots = Math.ceil(femaleGroups.filter(g => g.type === 'Early').length / 2);

    // Constraint bilanciamento: Early ≈ Late (differenza max 1 orario)
    // Il giorno 1 assegna l'orario in più a Early; il giorno 2 (remap) lo avrà in Late.
    const totalFlights = Math.ceil(players / mod) + Math.ceil(proette / mod);
    const totalOrari   = totalFlights / 2;
    const targetEarlySlots  = Math.ceil(totalOrari / 2);   // ceil: il "±1" va a Early il giorno 1
    const maleMaxEarlySlots = Math.max(0, targetEarlySlots - femaleEarlySlots);

    // Calcola gli uomini applicando il constraint
    const maleGroups = (players > 0) ? this.generatePlayerGroups(players, mod, atleti, 'M', maleMaxEarlySlots) : [];

        // Assegna il flightNumber a ogni gruppo: prima TUTTI i flight di Tee 1
        // (quadranti 1 e 3 in sequenza), poi TUTTI quelli di Tee 10 (2 e 4).
        // Il giorno 2 ruota i quadranti, quindi Tee 1 = Q4+Q2, Tee 10 = Q3+Q1.
        // Numerazione separata per uomini e donne.
        const assignFlightNumbers = (groups) => {
            const byQ = (q) => groups.filter(g => g.quadrant === q);
            const tee1  = dayNumber === 1
                ? [...byQ('Q1'), ...byQ('Q3')]
                : [...byQ('Q4'), ...byQ('Q2')];
            const tee10 = dayNumber === 1
                ? [...byQ('Q2'), ...byQ('Q4')]
                : [...byQ('Q3'), ...byQ('Q1')];
            let n = 1;
            tee1.forEach((g) => { g.flightNumber = n++; });
            tee10.forEach((g) => { g.flightNumber = n++; });
        };
        assignFlightNumbers(maleGroups);
        assignFlightNumbers(femaleGroups);

        // Striscia FIG: estremi (min/max) per quadrante (giro normale doppio tee).
        // Il giorno 2 i quadranti ruotano di posizione: nella striscia vanno
        // rietichettati affinché l'etichetta INVERTIRE segua i numeri.
        // Mappa giorno 2: l'etichetta Qx mostra i giocatori del quadrante
        // figSource[Qx] (Q1←Q3, Q2←Q4, Q3←Q1, Q4←Q2).
        const figSource = dayNumber === 1
            ? { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4' }
            : { Q1: 'Q3', Q2: 'Q4', Q3: 'Q1', Q4: 'Q2' };
        this.figQuadranti = [];
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach((label) => {
            this.pushFigQuadrante('Uomini', label, maleGroups.filter(g => g.quadrant === figSource[label]));
        });
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach((label) => {
            this.pushFigQuadrante('Donne', label, femaleGroups.filter(g => g.quadrant === figSource[label]));
        });

        // Filter groups by type
        const maleEarlyGroups = maleGroups.filter(g => g.type === 'Early');
        const maleLateGroups = maleGroups.filter(g => g.type === 'Late');
        const femaleEarlyGroups = femaleGroups.filter(g => g.type === 'Early');
        const femaleLateGroups = femaleGroups.filter(g => g.type === 'Late');

        // Generate table based on competition type
        const gara = this.config.garaNT;
        let tableHTML = '';

        if (gara === COMPETITION_TYPES.GARA_54) {
            tableHTML = this.generate54HoleTableNew(
                maleEarlyGroups, maleLateGroups,
                femaleEarlyGroups, femaleLateGroups,
                dayNumber
            );
        } else {
            // GARA_36 or default
            tableHTML = this.generate36HoleTableNew(
                maleEarlyGroups, maleLateGroups,
                femaleEarlyGroups, femaleLateGroups,
                dayNumber
            );
        }

        // Calculate and display timing info
        const timingInfo = this.calculateTimingInfo(maleGroups, femaleGroups);
        const infoHTML = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; padding: 15px; background: #e8f5e8; border-radius: 8px;">
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${timingInfo.lastEarlyTime}</strong>
          <span>Ultima Partenza Early</span>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${timingInfo.firstLateTime}</strong>
          <span>Prima Partenza Late</span>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${timingInfo.finishTime}</strong>
          <span>Fine Gara Stimata</span>
        </div>
      </div>
    `;

        this.figFlights = this._figFlightsBuffer;
        return infoHTML + `<table>${tableHTML}</table>`;
    }

    /**
     * Calculates timing information for display
     */
    /**
     * Calculates timing information for display
     */
    calculateTimingInfo(maleGroups, femaleGroups) {
        const startTime = this.config.startTime;
        const gap = this.config.gap;
        const roundTime = this.config.round;
        const compatto = this.config.compatto;

        // Calcola early groups
        const maleEarlyCount = maleGroups.filter(g => g.type === 'Early').length;
        const femaleEarlyCount = femaleGroups.filter(g => g.type === 'Early').length;
        const totalEarlyFlights = Math.ceil((maleEarlyCount + femaleEarlyCount) / 2);

        // Calcola ultima partenza early
        let currentTime = startTime;
        for (let i = 0; i < totalEarlyFlights; i++) {
            currentTime = addTime(currentTime, gap);
        }
        const lastEarlyTime = currentTime;

    // Calculate first late time
    let firstLateTime = lastEarlyTime;
    if (compatto === COMPACT_TYPES.EARLY_LATE) {
      firstLateTime = addTime(firstLateTime, halfTime(roundTime));
    } else {
    // Early(<12): partenza immediata o con gap minimo (solo 10 minuti extra)
    firstLateTime = addTime(lastEarlyTime, '00:10');
    }

        // Calcola fine gara
        const totalGroups = maleGroups.length + femaleGroups.length;
        const totalFlights = Math.ceil(totalGroups / 2);
        let finishTime = startTime;
        for (let i = 0; i < totalFlights; i++) {
            finishTime = addTime(finishTime, gap);
        }
        finishTime = addTime(finishTime, roundTime);

        return {
            lastEarlyTime,
            firstLateTime,
            finishTime
        };
    }

    /**
     * NEW: Generates 54-hole table with new quadrant logic
     * Correct order: Early Male -> Early Female -> (wait crossing) -> Late Female -> Late Male
     */
    generate54HoleTableNew(maleEarlyGroups, maleLateGroups, femaleEarlyGroups, femaleLateGroups, dayNumber) {
        let html = this.generateTableHeader(true);
        let currentTime = this.config.startTime;
        const gap = this.config.gap;
        const compatto = this.config.compatto;
        const roundTime = this.config.round;
        const colors = TABLE_COLORS.teeColors;

        let maleMatchNumber = 1;
        let femaleMatchNumber = 1;
        let lastEarlyTime = '';
        let firstLateTime = '';

        if (dayNumber === 1) {
            // Day 1: Standard order
            // 1. EARLY MALE: Q1->Tee1, Q2->Tee10
            let maleEarlyQ1 = maleEarlyGroups.filter(g => g.quadrant === 'Q1');
            let maleEarlyQ2 = maleEarlyGroups.filter(g => g.quadrant === 'Q2');

            html += this.buildGroupTableRows(
                maleEarlyQ1,
                maleEarlyQ2,
                TABLE_COLORS.men,
                colors.orange,
                colors.lightGreen,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );

            // Calculate time correctly
            const maleEarlyMatches = Math.max(maleEarlyQ1.length, maleEarlyQ2.length);
            for (let i = 0; i < maleEarlyMatches; i++) {
                currentTime = addTime(currentTime, gap);
            }
            currentTime = addTime(currentTime, '00:10');
            maleMatchNumber += maleEarlyQ1.length + maleEarlyQ2.length;

            // 2. EARLY FEMALE: Q1->Tee1, Q2->Tee10
            if (femaleEarlyGroups.length > 0) {
                let femaleEarlyQ1 = femaleEarlyGroups.filter(g => g.quadrant === 'Q1');
                let femaleEarlyQ2 = femaleEarlyGroups.filter(g => g.quadrant === 'Q2');

                html += this.buildGroupTableRows(
                    femaleEarlyQ1,
                    femaleEarlyQ2,
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleEarlyMatches = Math.max(femaleEarlyQ1.length, femaleEarlyQ2.length);
                for (let i = 0; i < femaleEarlyMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                femaleMatchNumber += femaleEarlyQ1.length + femaleEarlyQ2.length;
            }

            lastEarlyTime = currentTime;

            // Add spacing and wait for crossing
            html += '<tr><td colspan="20" class="py-2">&nbsp;</td></tr>';

      // Wait for early players to pass through
      if (compatto === COMPACT_TYPES.EARLY_LATE) {
        currentTime = addTime(currentTime, halfTime(roundTime));
      } else {
  // Early(<12): partenza immediata con gap minimo (nessun crossing)
  currentTime = addTime(lastEarlyTime, '00:10');
      }

            firstLateTime = currentTime;

            // 3. LATE FEMALE: Q3->Tee1, Q4->Tee10
            if (femaleLateGroups.length > 0) {
                let femaleLateQ3 = femaleLateGroups.filter(g => g.quadrant === 'Q3');
                let femaleLateQ4 = femaleLateGroups.filter(g => g.quadrant === 'Q4');

                html += this.buildGroupTableRows(
                    femaleLateQ3,
                    femaleLateQ4,
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleLateMatches = Math.max(femaleLateQ3.length, femaleLateQ4.length);
                for (let i = 0; i < femaleLateMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                currentTime = addTime(currentTime, '00:10');
                femaleMatchNumber += femaleLateQ3.length + femaleLateQ4.length;
            }

            // 4. LATE MALE: Q3->Tee1, Q4->Tee10
            let maleLateQ3 = maleLateGroups.filter(g => g.quadrant === 'Q3');
            let maleLateQ4 = maleLateGroups.filter(g => g.quadrant === 'Q4');

            html += this.buildGroupTableRows(
                maleLateQ3,
                maleLateQ4,
                TABLE_COLORS.men,
                colors.lightGray,
                colors.yellow,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );

        } else {
            // Day 2: Rotated order
            // 1. Men Late groups (Q3,Q4) go Early: Q4->Tee1, Q3->Tee10
            let maleLateQ3 = maleLateGroups.filter(g => g.quadrant === 'Q3');
            let maleLateQ4 = maleLateGroups.filter(g => g.quadrant === 'Q4');

            html += this.buildGroupTableRows(
                maleLateQ4,  // Q4 to Tee1
                maleLateQ3,  // Q3 to Tee10
                TABLE_COLORS.men,
                colors.orange,
                colors.lightGreen,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );

            const maleLateMatches = Math.max(maleLateQ3.length, maleLateQ4.length);
            for (let i = 0; i < maleLateMatches; i++) {
                currentTime = addTime(currentTime, gap);
            }
            currentTime = addTime(currentTime, '00:10');
            maleMatchNumber += maleLateQ3.length + maleLateQ4.length;

            // 2. Female Late groups (Q3,Q4) go Early: Q4->Tee1, Q3->Tee10
            if (femaleLateGroups.length > 0) {
                let femaleLateQ3 = femaleLateGroups.filter(g => g.quadrant === 'Q3');
                let femaleLateQ4 = femaleLateGroups.filter(g => g.quadrant === 'Q4');

                html += this.buildGroupTableRows(
                    femaleLateQ4,  // Q4 to Tee1
                    femaleLateQ3,  // Q3 to Tee10
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleLateMatches = Math.max(femaleLateQ3.length, femaleLateQ4.length);
                for (let i = 0; i < femaleLateMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                femaleMatchNumber += femaleLateQ3.length + femaleLateQ4.length;
            }

            lastEarlyTime = currentTime;

            // Add spacing and wait
            html += '<tr><td colspan="20" class="py-2">&nbsp;</td></tr>';

  if (compatto === COMPACT_TYPES.EARLY_LATE) {
    currentTime = addTime(currentTime, halfTime(roundTime));
  } else {
  // Early(<12): partenza immediata con gap minimo (nessun crossing)
  currentTime = addTime(lastEarlyTime, '00:10');
  }

            firstLateTime = currentTime;

            // 3. Female Early groups (Q1,Q2) go Late: Q2->Tee1, Q1->Tee10
            if (femaleEarlyGroups.length > 0) {
                let femaleEarlyQ1 = femaleEarlyGroups.filter(g => g.quadrant === 'Q1');
                let femaleEarlyQ2 = femaleEarlyGroups.filter(g => g.quadrant === 'Q2');

                html += this.buildGroupTableRows(
                    femaleEarlyQ2,  // Q2 to Tee1
                    femaleEarlyQ1,  // Q1 to Tee10
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleEarlyMatches = Math.max(femaleEarlyQ1.length, femaleEarlyQ2.length);
                for (let i = 0; i < femaleEarlyMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                currentTime = addTime(currentTime, '00:10');
                femaleMatchNumber += femaleEarlyQ1.length + femaleEarlyQ2.length;
            }

            // 4. Male Early groups (Q1,Q2) go Late: Q2->Tee1, Q1->Tee10
            let maleEarlyQ1 = maleEarlyGroups.filter(g => g.quadrant === 'Q1');
            let maleEarlyQ2 = maleEarlyGroups.filter(g => g.quadrant === 'Q2');

            html += this.buildGroupTableRows(
                maleEarlyQ2,  // Q2 to Tee1
                maleEarlyQ1,  // Q1 to Tee10
                TABLE_COLORS.men,
                colors.lightGray,
                colors.yellow,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );
        }
        // Store timing info for display
        this.lastEarlyTime = lastEarlyTime;
        this.firstLateTime = firstLateTime;

        return html + '</tbody>';
    }

    /**
     * NEW: Generates 36-hole table with new quadrant logic
     */
    generate36HoleTableNew(maleEarlyGroups, maleLateGroups, femaleEarlyGroups, femaleLateGroups, dayNumber) {
        let html = this.generateTableHeader(true);
        let currentTime = this.config.startTime;
        const gap = this.config.gap;
        const compatto = this.config.compatto;
        const roundTime = this.config.round;
        const colors = TABLE_COLORS.teeColors;

        let maleMatchNumber = 1;
        let femaleMatchNumber = 1;
        let lastEarlyTime = '';
        let firstLateTime = '';

        // Similar logic to 54-hole but with different arrangement
        // Implementation follows the same pattern as generate54HoleTableNew
        // but with different quadrant assignments for 36-hole competition

        if (dayNumber === 1) {
            // Day 1: Standard order
            // 1. EARLY MALE: Q1->Tee1, Q2->Tee10
            let maleEarlyQ1 = maleEarlyGroups.filter(g => g.quadrant === 'Q1');
            let maleEarlyQ2 = maleEarlyGroups.filter(g => g.quadrant === 'Q2');

            html += this.buildGroupTableRows(
                maleEarlyQ1,
                maleEarlyQ2,
                TABLE_COLORS.men,
                colors.orange,
                colors.lightGreen,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );

            // Calculate time correctly
            const maleEarlyMatches = Math.max(maleEarlyQ1.length, maleEarlyQ2.length);
            for (let i = 0; i < maleEarlyMatches; i++) {
                currentTime = addTime(currentTime, gap);
            }
            currentTime = addTime(currentTime, '00:10');
            maleMatchNumber += maleEarlyQ1.length + maleEarlyQ2.length;

            // 2. EARLY FEMALE: Q1->Tee1, Q2->Tee10
            if (femaleEarlyGroups.length > 0) {
                let femaleEarlyQ1 = femaleEarlyGroups.filter(g => g.quadrant === 'Q1');
                let femaleEarlyQ2 = femaleEarlyGroups.filter(g => g.quadrant === 'Q2');

                html += this.buildGroupTableRows(
                    femaleEarlyQ1,
                    femaleEarlyQ2,
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleEarlyMatches = Math.max(femaleEarlyQ1.length, femaleEarlyQ2.length);
                for (let i = 0; i < femaleEarlyMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                femaleMatchNumber += femaleEarlyQ1.length + femaleEarlyQ2.length;
            }

            lastEarlyTime = currentTime;

            // Add spacing and wait for crossing
            html += '<tr><td colspan="20" class="py-2">&nbsp;</td></tr>';

      // Wait for early players to pass through
      if (compatto === COMPACT_TYPES.EARLY_LATE) {
        currentTime = addTime(currentTime, halfTime(roundTime));
      } else {
  // Early(<12): partenza immediata con gap minimo (nessun crossing)
  currentTime = addTime(lastEarlyTime, '00:10');
      }

            firstLateTime = currentTime;

            // 3. LATE FEMALE: Q3->Tee1, Q4->Tee10
            if (femaleLateGroups.length > 0) {
                let femaleLateQ3 = femaleLateGroups.filter(g => g.quadrant === 'Q3');
                let femaleLateQ4 = femaleLateGroups.filter(g => g.quadrant === 'Q4');

                html += this.buildGroupTableRows(
                    femaleLateQ3,
                    femaleLateQ4,
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleLateMatches = Math.max(femaleLateQ3.length, femaleLateQ4.length);
                for (let i = 0; i < femaleLateMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                currentTime = addTime(currentTime, '00:10');
                femaleMatchNumber += femaleLateQ3.length + femaleLateQ4.length;
            }

            // 4. LATE MALE: Q3->Tee1, Q4->Tee10
            let maleLateQ3 = maleLateGroups.filter(g => g.quadrant === 'Q3');
            let maleLateQ4 = maleLateGroups.filter(g => g.quadrant === 'Q4');

            html += this.buildGroupTableRows(
                maleLateQ3,
                maleLateQ4,
                TABLE_COLORS.men,
                colors.lightGray,
                colors.yellow,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );

        } else {
            // Day 2: Rotated order
            // 1. Men Late groups (Q3,Q4) go Early: Q4->Tee1, Q3->Tee10
            let maleLateQ3 = maleLateGroups.filter(g => g.quadrant === 'Q3');
            let maleLateQ4 = maleLateGroups.filter(g => g.quadrant === 'Q4');

            html += this.buildGroupTableRows(
                maleLateQ4,  // Q4 to Tee1
                maleLateQ3,  // Q3 to Tee10
                TABLE_COLORS.men,
                colors.orange,
                colors.lightGreen,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );

            const maleLateMatches = Math.max(maleLateQ3.length, maleLateQ4.length);
            for (let i = 0; i < maleLateMatches; i++) {
                currentTime = addTime(currentTime, gap);
            }
            currentTime = addTime(currentTime, '00:10');
            maleMatchNumber += maleLateQ3.length + maleLateQ4.length;

            // 2. Female Late groups (Q3,Q4) go Early: Q4->Tee1, Q3->Tee10
            if (femaleLateGroups.length > 0) {
                let femaleLateQ3 = femaleLateGroups.filter(g => g.quadrant === 'Q3');
                let femaleLateQ4 = femaleLateGroups.filter(g => g.quadrant === 'Q4');

                html += this.buildGroupTableRows(
                    femaleLateQ4,  // Q4 to Tee1
                    femaleLateQ3,  // Q3 to Tee10
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleLateMatches = Math.max(femaleLateQ3.length, femaleLateQ4.length);
                for (let i = 0; i < femaleLateMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                femaleMatchNumber += femaleLateQ3.length + femaleLateQ4.length;
            }

            lastEarlyTime = currentTime;

            // Add spacing and wait
            html += '<tr><td colspan="20" class="py-2">&nbsp;</td></tr>';

  if (compatto === COMPACT_TYPES.EARLY_LATE) {
    currentTime = addTime(currentTime, halfTime(roundTime));
  } else {
  // Early(<12): partenza immediata con gap minimo (nessun crossing)
  currentTime = addTime(lastEarlyTime, '00:10');
  }

            firstLateTime = currentTime;

            // 3. Female Early groups (Q1,Q2) go Late: Q2->Tee1, Q1->Tee10
            if (femaleEarlyGroups.length > 0) {
                let femaleEarlyQ1 = femaleEarlyGroups.filter(g => g.quadrant === 'Q1');
                let femaleEarlyQ2 = femaleEarlyGroups.filter(g => g.quadrant === 'Q2');

                html += this.buildGroupTableRows(
                    femaleEarlyQ2,  // Q2 to Tee1
                    femaleEarlyQ1,  // Q1 to Tee10
                    TABLE_COLORS.women,
                    'transparent',
                    'transparent',
                    currentTime,
                    gap,
                    'F',
                    femaleMatchNumber
                );

                const femaleEarlyMatches = Math.max(femaleEarlyQ1.length, femaleEarlyQ2.length);
                for (let i = 0; i < femaleEarlyMatches; i++) {
                    currentTime = addTime(currentTime, gap);
                }
                currentTime = addTime(currentTime, '00:10');
                femaleMatchNumber += femaleEarlyQ1.length + femaleEarlyQ2.length;
            }

            // 4. Male Early groups (Q1,Q2) go Late: Q2->Tee1, Q1->Tee10
            let maleEarlyQ1 = maleEarlyGroups.filter(g => g.quadrant === 'Q1');
            let maleEarlyQ2 = maleEarlyGroups.filter(g => g.quadrant === 'Q2');

            html += this.buildGroupTableRows(
                maleEarlyQ2,  // Q2 to Tee1
                maleEarlyQ1,  // Q1 to Tee10
                TABLE_COLORS.men,
                colors.lightGray,
                colors.yellow,
                currentTime,
                gap,
                'M',
                maleMatchNumber
            );
        }
        // Store timing info for display
        this.lastEarlyTime = lastEarlyTime;
        this.firstLateTime = firstLateTime;

        return html + '</tbody>';
    }

    /**
     * NEW: Helper to build table rows from groups
     */
    buildGroupTableRows(leftGroups, rightGroups, color, leftBg, rightBg, startTime, gap, category, startNumber) {
        let html = '';
        let currentTime = startTime;
        let matchNumber = startNumber;
        const mod = parseInt(this.config.playersPerFlight);
        const showRemove = this.config.nominativo === 'On';

        const renderCell = (group, j) => {
            const player = (group && group.players[j]) || '';
            if (player === '') {
                return `<td class="text-center px-2 py-1 border border-gray-300" style="color: ${color}"></td>`;
            }
            const idx = group.playerIndices ? group.playerIndices[j] : '';
            const btn = showRemove
                ? ` <button type="button" class="qd-remove excludeThisClass ml-1 text-xs text-red-600 hover:text-red-800" data-cat="${group.category}" data-idx="${idx}" title="Rimuovi iscritto e ridisegna lo schema">&times;</button>`
                : '';
            return `<td class="text-center px-2 py-1 border border-gray-300" style="color: ${color}">${player}${btn}</td>`;
        };

        const maxGroups = Math.max(leftGroups.length, rightGroups.length);

        // Buffer per la Vista FIG: registra ogni flight renderizzato con
        // orario e tee. Popolato come side-effect (non altera l'HTML).
        // generateDoubleTee resetta/consuma this._figFlightsBuffer.
        if (!Array.isArray(this._figFlightsBuffer)) this._figFlightsBuffer = [];

        for (let i = 0; i < maxGroups; i++) {
            html += '<tr>';

            // Left side
            if (leftGroups[i]) {
                // Usa il flightNumber pre-assegnato (numerazione Tee 1 → Tee 10).
                // Fallback al contatore incrementale per i gruppi che non lo
                // hanno (es. giro finale doppio tee).
                const leftNum = leftGroups[i].flightNumber != null
                    ? leftGroups[i].flightNumber : matchNumber++;
                html += `<td class="text-center px-2 py-1 border border-gray-300 font-medium" style="background-color:${leftBg}">${leftNum}</td>`;
                html += '<td class="text-center px-2 py-1 border border-gray-300 font-medium">1</td>';

                for (let j = 0; j < mod; j++) {
                    html += renderCell(leftGroups[i], j);
                }
                this._figFlightsBuffer.push({ group: leftGroups[i], ora: currentTime, tee: 1, category });
            } else {
                html += `<td colspan="${mod + 2}" class="text-center px-2 py-1 border border-gray-300"></td>`;
            }

            // Time
            html += `<td class="text-center px-2 py-1 border border-gray-300 font-medium">${currentTime}</td>`;

            // Right side
            if (rightGroups[i]) {
                for (let j = 0; j < mod; j++) {
                    html += renderCell(rightGroups[i], j);
                }

                const rightNum = rightGroups[i].flightNumber != null
                    ? rightGroups[i].flightNumber : matchNumber++;
                html += '<td class="text-center px-2 py-1 border border-gray-300 font-medium">10</td>';
                html += `<td class="text-center px-2 py-1 border border-gray-300 font-medium" style="background-color:${rightBg}">${rightNum}</td>`;
                this._figFlightsBuffer.push({ group: rightGroups[i], ora: currentTime, tee: 10, category });
            } else {
                html += `<td colspan="${mod + 2}" class="text-center px-2 py-1 border border-gray-300"></td>`;
            }

            html += '</tr>';
            currentTime = addTime(currentTime, gap);
        }

        return html;
    }

    /**
     * Generates table header
     * @param {boolean} doubleTee - Whether double tee configuration
     * @returns {string} HTML table header
     */
    generateTableHeader(doubleTee) {
        const mod = parseInt(this.config.playersPerFlight);
        let header = '<thead class="bg-gray-50"><tr>';
        header += '<th class="text-center px-2 py-2 border border-gray-300">Flight</th>';
        header += '<th class="text-center px-2 py-2 border border-gray-300">Tee</th>';
        header += `<th colspan="${mod}" class="text-center px-2 py-2 border border-gray-300">Nome</th>`;
        header += '<th class="text-center px-2 py-2 border border-gray-300">Orario</th>';

        if (doubleTee) {
            header += `<th colspan="${mod}" class="text-center px-2 py-2 border border-gray-300">Nome</th>`;
            header += '<th class="text-center px-2 py-2 border border-gray-300">Tee</th>';
            header += '<th class="text-center px-2 py-2 border border-gray-300">Flight</th>';
        }

        header += '</tr></thead><tbody>';
        return header;
    }

    /* ════════════════════════════════════════════════════════════════════
     * STRISCIA FIG — estrazione primo/ultimo numero per quadrante.
     *
     * Il sistema FIG richiede, per ogni quadrante, il range dei giocatori.
     * Questi metodi producono una "striscia" leggibile: per ogni quadrante
     * il primo e l'ultimo numero così come appaiono in tabella. Se il
     * quadrante è in ordine decrescente (primo > ultimo) viene segnalato
     * con l'etichetta "INVERTIRE" (i terzetti vanno invertiti nel FIG).
     * ════════════════════════════════════════════════════════════════════ */

    /**
     * Estrae il numero "FIG" di un giocatore dentro un gruppo alla posizione j.
     * In modalità nominativa usa playerIndices (posizione in classifica + 1);
     * altrimenti i players sono già numeri.
     */
    figPlayerNumber(group, j) {
        if (group.playerIndices && group.playerIndices[j] != null) {
            return group.playerIndices[j] + 1;
        }
        return group.players[j];
    }

    /**
     * Calcola { first, last } di un quadrante = gli ESTREMI del range di
     * numeri del quadrante (il minimo e il massimo tra TUTTI i giocatori).
     *
     * L'ordine in cui sono restituiti riflette la direzione di percorrenza:
     *   - quadrante crescente  → { first: min, last: max }
     *   - quadrante decrescente → { first: max, last: min }  (INVERTIRE)
     *
     * La direzione si determina confrontando il numero più basso del PRIMO
     * flight con quello dell'ULTIMO: se il primo flight ha numeri più alti,
     * il quadrante è percorso in ordine decrescente.
     *
     * Ritorna null se il quadrante è vuoto.
     */
    quadrantRange(groups) {
        if (!Array.isArray(groups) || groups.length === 0) return null;

        // Numeri "FIG" non vuoti di un gruppo
        const numbersOf = (group) => {
            const out = [];
            for (let j = 0; j < group.players.length; j++) {
                const p = group.players[j];
                if (p === '' || p == null) continue;
                out.push(Number(this.figPlayerNumber(group, j)));
            }
            return out;
        };

        const allNums = [];
        groups.forEach((g) => { allNums.push(...numbersOf(g)); });
        if (allNums.length === 0) return null;

        const min = Math.min(...allNums);
        const max = Math.max(...allNums);

        // Direzione: confronta il minimo del primo flight con quello dell'ultimo
        const firstNums = numbersOf(groups[0]);
        const lastNums = numbersOf(groups[groups.length - 1]);
        const decrescente = firstNums.length > 0 && lastNums.length > 0
            && Math.min(...firstNums) > Math.min(...lastNums);

        return decrescente
            ? { first: max, last: min }
            : { first: min, last: max };
    }

    /**
     * Aggiunge una voce a this.figQuadranti se il quadrante non è vuoto.
     * invertire = true quando l'ordine è decrescente (first > last).
     */
    pushFigQuadrante(categoria, label, groups) {
        const r = this.quadrantRange(groups);
        if (!r) return;
        // flightStart = numero di flight con cui inizia il quadrante (se i
        // gruppi hanno il flightNumber pre-assegnato da generateDoubleTee).
        const flightStart = (groups[0] && groups[0].flightNumber != null)
            ? groups[0].flightNumber
            : null;
        this.figQuadranti.push({
            categoria,
            label,
            first: r.first,
            last: r.last,
            invertire: Number(r.first) > Number(r.last),
            flightStart,
        });
    }

    /**
     * Genera l'HTML del box "Striscia per sistema FIG".
     * Legge this.figQuadranti popolato da generateDoubleTee/generateSingleTee.
     * Ritorna stringa vuota se non ci sono quadranti.
     */
    generateFigStrip() {
        const quad = this.figQuadranti || [];
        if (quad.length === 0) return '';

        // Raggruppa per categoria mantenendo l'ordine di inserimento
        const categorie = [];
        quad.forEach((q) => {
            let bucket = categorie.find(c => c.nome === q.categoria);
            if (!bucket) {
                bucket = { nome: q.categoria, voci: [] };
                categorie.push(bucket);
            }
            bucket.voci.push(q);
        });

        // Testo piatto per il pulsante "Copia" (una riga per quadrante)
        const plain = quad
            .map((q) => {
                const fl = q.flightStart != null ? ` [flight ${q.flightStart}]` : '';
                return `${q.categoria} ${q.label}: ${q.first} → ${q.last}${fl}${q.invertire ? '  INVERTIRE' : ''}`;
            })
            .join('\n');

        let html = `
        <div id="fig-strip-box" style="margin-top:20px; padding:15px; background:#eef2ff; border:1px solid #c7d2fe; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="color:#3730a3; font-size:15px;">
              <i class="fas fa-list-ol mr-1"></i> Striscia per sistema FIG
            </strong>
            <button type="button" id="fig-strip-copy"
              class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-3 rounded"
              data-strip="${plain.replace(/"/g, '&quot;')}">
              Copia
            </button>
          </div>`;

        categorie.forEach((cat) => {
            html += `<div style="margin-bottom:8px;">
              <div style="font-weight:600; font-size:13px; color:#1e293b; margin-bottom:4px;">${cat.nome}</div>
              <div style="display:flex; flex-wrap:wrap; gap:8px;">`;
            cat.voci.forEach((v) => {
                const invBadge = v.invertire
                    ? ` <span style="background:#dc2626; color:#fff; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; margin-left:6px;">INVERTIRE</span>`
                    : '';
                const flightInfo = v.flightStart != null
                    ? ` <span style="color:#475569; font-size:11px;">· flight&nbsp;${v.flightStart}</span>`
                    : '';
                html += `<span style="background:#fff; border:1px solid #c7d2fe; border-radius:6px; padding:4px 10px; font-size:13px;">
                  <span style="color:#64748b;">${v.label}:</span>
                  <strong style="color:#0f172a;">${v.first} &rarr; ${v.last}</strong>${flightInfo}${invBadge}
                </span>`;
            });
            html += `</div></div>`;
        });

        html += `
          <div style="font-size:11px; color:#64748b; margin-top:8px;">
            "INVERTIRE" = quadrante in ordine decrescente: invertire i numeri all'interno di ogni terzetto.
          </div>
        </div>`;

        return html;
    }

    /* ════════════════════════════════════════════════════════════════════
     * VISTA FIG — tabella Giro 1 + Giro 2 affiancati, nel layout dell'orario
     * ufficiale FIG (vedi PDF "Orario di partenza giro 1 e giro 2").
     *
     * Per ogni flight mostra Match/Ora/Tee del giro 1 e del giro 2 (con la
     * rotazione), così da poter confrontare a vista con il PDF ufficiale.
     * ════════════════════════════════════════════════════════════════════ */

    /**
     * Estrae i numeri "FIG" di tutti i giocatori di un gruppo (salta i vuoti).
     */
    figGroupNumbers(group) {
        const nums = [];
        for (let j = 0; j < group.players.length; j++) {
            const p = group.players[j];
            if (p === '' || p == null) continue;
            nums.push(this.figPlayerNumber(group, j));
        }
        return nums;
    }

    /**
     * Etichette dei giocatori di un gruppo COSÌ COME VANNO MOSTRATE: i nomi
     * se caricati (modalità nominativo), altrimenti i numeri. Salta i vuoti.
     * Usato dalla Vista FIG per assomigliare all'orario ufficiale (che ha i nomi).
     */
    figGroupLabels(group) {
        const out = [];
        for (let j = 0; j < group.players.length; j++) {
            const p = group.players[j];
            if (p === '' || p == null) continue;
            out.push(p);
        }
        return out;
    }

    /**
     * Chiave univoca di un flight, stabile tra Giro 1 e Giro 2 e indipendente
     * dalla modalità (nominativo/numerico). Usa playerIndices (indici nella
     * lista iscritti) quando disponibili, altrimenti i players grezzi.
     */
    figFlightKey(f) {
        const g = f.group;
        let ids;
        if (g.playerIndices && g.playerIndices.length) {
            ids = g.playerIndices.slice().sort((a, b) => a - b);
        } else {
            ids = g.players.filter((p) => p !== '' && p != null).slice().sort();
        }
        return f.category + '|' + ids.join(',');
    }

    /**
     * Genera l'HTML della Vista FIG: tabella combinata Giro 1 + Giro 2.
     *
     * Funzionamento:
     *   1. Genera generateDoubleTee('prima') e ('seconda'); ciascuna popola
     *      this.figFlights con i flight renderizzati (group, ora, tee, cat).
     *   2. Accoppia i flight delle due giornate per insieme di giocatori.
     *   3. Rinumera i match in stile FIG: Tee 1 prima (ordinati per ora),
     *      poi Tee 10. Numerazione indipendente per Giro 1 e Giro 2.
     *   4. Rende una tabella per categoria (Uomini, Donne), righe ordinate
     *      per match del Giro 1.
     *
     * @returns {string} HTML della Vista FIG (o messaggio se non disponibile)
     */
    generateFigComparison() {
        // Preserva figQuadranti: generateDoubleTee lo sovrascrive.
        const savedFigQuadranti = this.figQuadranti;

        this.generateDoubleTee(ROUND_TYPES.FIRST);
        const flights1 = (this.figFlights || []).slice();
        this.generateDoubleTee(ROUND_TYPES.SECOND);
        const flights2 = (this.figFlights || []).slice();

        this.figQuadranti = savedFigQuadranti;

        if (flights1.length === 0) {
            return '<p style="padding:20px; color:#64748b;">Nessun flight da mostrare. Imposta giocatori e configurazione Doppie Partenze.</p>';
        }

        // Minuti da "HH:MM" per ordinamento orari
        const toMin = (t) => {
            const [h, m] = String(t).split(':').map(Number);
            return h * 60 + m;
        };
        const keyOf = (f) => this.figFlightKey(f);

        // Rinumera i match in stile FIG. IMPORTANTE: la FIG tratta la gara
        // maschile e quella femminile come DUE gare separate, ognuna con la
        // propria numerazione che riparte da 1. Quindi numeriamo per categoria.
        // Ordine: Tee 1 prima (per ora), poi Tee 10.
        const assignMatches = (flights) => {
            const map = {};
            ['M', 'F'].forEach((cat) => {
                flights
                    .filter((f) => f.category === cat)
                    .slice()
                    .sort((a, b) => (a.tee - b.tee) || (toMin(a.ora) - toMin(b.ora)))
                    .forEach((f, i) => { map[keyOf(f)] = i + 1; });
            });
            return map;
        };

        const match1 = assignMatches(flights1);
        const match2 = assignMatches(flights2);

        // Indicizza giorno 2 per chiave
        const g2byKey = {};
        flights2.forEach((f) => { g2byKey[keyOf(f)] = f; });

        // Costruisce le righe combinate. I "giocatori" sono le etichette così
        // come vanno mostrate: nomi se caricati, altrimenti numeri.
        const righe = flights1.map((f1) => {
            const k = keyOf(f1);
            const f2 = g2byKey[k] || null;
            return {
                category: f1.category,
                giocatori: this.figGroupLabels(f1.group),
                g1: { match: match1[k], ora: f1.ora, tee: f1.tee },
                g2: f2 ? { match: match2[k], ora: f2.ora, tee: f2.tee } : null,
            };
        });

        // Raggruppa per categoria, ordina per match Giro 1
        const sezioni = [
            { nome: 'Uomini', cat: 'M' },
            { nome: 'Donne',  cat: 'F' },
        ];

        let html = '';
        sezioni.forEach((sez) => {
            const rows = righe
                .filter((r) => r.category === sez.cat)
                .sort((a, b) => a.g1.match - b.g1.match);
            if (rows.length === 0) return;

            html += `<h4 style="margin:14px 0 6px; font-weight:600; color:#1e293b;">${sez.nome}</h4>`;
            html += `<table style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead>
                <tr style="background:#eef2ff;">
                  <th colspan="3" style="border:1px solid #c7d2fe; padding:4px;">Giro 1</th>
                  <th colspan="3" style="border:1px solid #c7d2fe; padding:4px;">Giro 2</th>
                  <th rowspan="2" style="border:1px solid #c7d2fe; padding:4px;">Giocatori</th>
                </tr>
                <tr style="background:#f1f5f9;">
                  <th style="border:1px solid #c7d2fe; padding:3px;">Match</th>
                  <th style="border:1px solid #c7d2fe; padding:3px;">Ora</th>
                  <th style="border:1px solid #c7d2fe; padding:3px;">Tee</th>
                  <th style="border:1px solid #c7d2fe; padding:3px;">Match</th>
                  <th style="border:1px solid #c7d2fe; padding:3px;">Ora</th>
                  <th style="border:1px solid #c7d2fe; padding:3px;">Tee</th>
                </tr>
              </thead>
              <tbody>`;

            rows.forEach((r) => {
                const td = 'border:1px solid #e2e8f0; padding:3px 6px; text-align:center;';
                const g2 = r.g2;
                html += `<tr>
                  <td style="${td} font-weight:600;">${r.g1.match}</td>
                  <td style="${td}">${r.g1.ora}</td>
                  <td style="${td}">${r.g1.tee}</td>
                  <td style="${td} font-weight:600;">${g2 ? g2.match : '—'}</td>
                  <td style="${td}">${g2 ? g2.ora : '—'}</td>
                  <td style="${td}">${g2 ? g2.tee : '—'}</td>
                  <td style="${td} text-align:left;">${r.giocatori.join('<br>')}</td>
                </tr>`;
            });

            html += `</tbody></table>`;
        });

        return html;
    }

    /**
     * Generates single tee configuration
     *
     * Per i giri normali ('prima'/'seconda') concatena femaleGroups + maleGroups
     * generati da generatePlayerGroups (4 quadranti).
     *
     * Per il giro finale (54 buche: 3° giro; 72 buche: 3°/4° giro): tee unico,
     * ordine di classifica, sempre numerico (i nomi non sono utili in una
     * classifica). Tre blocchi sequenziali con stacco extra tra l'uno e
     * l'altro, nell'ordine di partenza confermato (schema FIG):
     *   Blocco 1 = Uomini back-half (rank halfM+1..N), gruppi in ordine
     *              CRESCENTE di rank (worst overall a fine blocco);
     *   Blocco 2 = Uomini front-half (rank 1..halfM), gruppi in ordine
     *              DECRESCENTE di rank (leader uomini a fine blocco);
     *   Blocco 3 = Donne (tutte), gruppi in ordine DECRESCENTE di rank
     *              (leader donne a chiusura del giro). Assente nei giri
     *              'men-only' (4° giro della Gara 72 buche).
     * Display intra-gruppo: rank alto a sinistra, rank basso a destra
     * (es. gruppo 28-30 → "30 29 28"). Riusa la stessa "logica dei quadranti"
     * dei giri normali (un quadrante ascendente Q1-like + uno discendente
     * Q2-like) ma applicata a un singolo tee.
     *
     * @param {string} round - 'prima', 'seconda' o 'finale'
     * @returns {string} HTML table content
     */
    generateSingleTee(round) {
        const mod = parseInt(this.config.playersPerFlight);
        const players = parseInt(this.config.players);
        const proette = parseInt(this.config.proette);
        const garaNT = this.config.garaNT;

        // Dispatch data-driven: il descrittore COMPETITION_FORMATS dice se il
        // giro è di tipo 'finale' e se è riservato ai soli uomini. Fallback al
        // comportamento storico 54 buche se il formato non è in tabella.
        const formatDesc = COMPETITION_FORMATS[garaNT] || null;
        const roundDesc = formatDesc
            ? formatDesc.rounds.find((r) => r.id === round)
            : null;
        const isFinal = roundDesc
            ? roundDesc.type === 'finale'
            : (round === ROUND_TYPES.FINAL && garaNT === COMPETITION_TYPES.GARA_54);
        const isMenOnlyRound = roundDesc ? roundDesc.gender === 'men' : false;

        // Nel giro finale i partecipanti sono i QUALIFICATI dopo il taglio,
        // letti dai campi separati playersCut/proetteCut. Possono essere
        // inferiori a players/proette. Fallback su players/proette se zero
        // (utente non li ha ancora compilati). Nei giri 'men-only' (4° giro
        // della Gara 72 buche) non ci sono donne: proetteFinal = 0.
        const playersFinal = isFinal
            ? (parseInt(this.config.playersCut) || players)
            : players;
        const proetteFinal = isMenOnlyRound
            ? 0
            : (isFinal
                ? (parseInt(this.config.proetteCut) || proette)
                : proette);

        let allGroups;
        // Indici (dopo i quali) avviene il passaggio tra blocchi: la riga
        // successiva avrà un gap maggiore (BLOCK_GAP) per simulare la pausa
        // di transizione mostrata nello schema cartaceo.
        const blockBoundaries = new Set();
        // Stacco extra tra blocchi del giro finale. Empirico dall'immagine
        // di riferimento: con gap 11 min, l'inizio del blocco successivo è
        // a +17 min dall'ultima partenza (gap + 6). Manteniamo +6 fisso.
        const BLOCK_GAP = '00:06';

        if (isFinal) {
            // Sempre numerico: ranks 1..N indipendentemente da nominativo.
            // N qui è il numero di qualificati dopo il taglio.
            const ranksM = range(1, playersFinal);
            const ranksF = range(1, proetteFinal);
            // Split per FLIGHT count, ceil sul front (asimmetrico per N dispari
            // di flight, come da immagine donne 27 → 5 front + 4 back).
            const totalFlightsM = Math.ceil(playersFinal / mod);
            const frontFlightsM = Math.ceil(totalFlightsM / 2);
            const frontCountM = Math.min(frontFlightsM * mod, playersFinal);
            const backMen = ranksM.slice(frontCountM);   // rank frontCountM+1..N (back)
            const frontMen = ranksM.slice(0, frontCountM); // rank 1..frontCountM (front)

            // Helper inline (non sono "nuove funzioni" del modulo: sono
            // closure locali a generateSingleTee).
            const asc = (arr, cat) => {
                const groups = [];
                for (let i = 0; i < arr.length; i += mod) {
                    const slice = arr.slice(i, Math.min(i + mod, arr.length));
                    // Display intra-gruppo: rank più alto a sinistra
                    groups.push({ players: slice.slice().reverse(), category: cat });
                }
                return groups;
            };
            const desc = (arr, cat) => {
                const groups = [];
                for (let i = arr.length - 1; i >= 0; i -= mod) {
                    const group = [];
                    for (let j = 0; j < mod && (i - j) >= 0; j++) {
                        group.push(arr[i - j]);
                    }
                    // group è già [27,26,25] al primo step: rank alto a sinistra
                    groups.push({ players: group, category: cat });
                }
                return groups;
            };

            // Ordine di partenza confermato (schema FIG, tee unico):
            //   uomini back-half → uomini front-half → donne.
            const blockMenBack  = asc(backMen, 'M');    // 28-54: back-half crescente
            const blockMenFront = desc(frontMen, 'M');  // 1-27: front-half decrescente
            const blockWomen    = ranksF.length > 0     // donne decrescente (chiudono)
                ? desc(ranksF, 'F')
                : [];

            allGroups = [...blockMenBack, ...blockMenFront, ...blockWomen];
            if (blockMenBack.length > 0) {
                blockBoundaries.add(blockMenBack.length - 1);
            }
            if (blockMenFront.length > 0) {
                blockBoundaries.add(blockMenBack.length + blockMenFront.length - 1);
            }

            // Striscia FIG: 3 blocchi sequenziali, nell'ordine di partenza.
            this.figQuadranti = [];
            this.pushFigQuadrante('Uomini', 'Blocco 1 · back-half',  blockMenBack);
            this.pushFigQuadrante('Uomini', 'Blocco 2 · front-half', blockMenFront);
            this.pushFigQuadrante('Donne',  'Blocco 3',              blockWomen);
        } else {
            // Giri normali (prima/seconda) — comportamento storico invariato
            const { atleti, atlete } = this.getPlayerArrays();
            const maleGroups = this.generatePlayerGroups(players, mod, atleti, 'M');
            const femaleGroups = proette > 0 ? this.generatePlayerGroups(proette, mod, atlete, 'F') : [];

            // Striscia FIG: tee unico, quadranti Q1-Q4 da generatePlayerGroups
            this.figQuadranti = [];
            ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q) => {
                this.pushFigQuadrante('Uomini', q, maleGroups.filter(g => g.quadrant === q));
            });
            ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q) => {
                this.pushFigQuadrante('Donne', q, femaleGroups.filter(g => g.quadrant === q));
            });

            allGroups = round === ROUND_TYPES.FIRST
                ? [...femaleGroups, ...maleGroups]
                : [...maleGroups.reverse(), ...femaleGroups.reverse()];
        }

        // Build single tee table
        let tableHTML = this.generateTableHeader(false);
        let currentTime = this.config.startTime;
        const gap = this.config.gap;

        // Il pulsante "rimuovi iscritto" non ha senso nel giro finale (è
        // numerico per definizione, non c'è uno storage di nomi su cui agire).
        const showRemove = this.config.nominativo === 'On' && !isFinal;

        allGroups.forEach((group, index) => {
            tableHTML += '<tr>';
            tableHTML += `<td class="text-center px-2 py-1 border border-gray-300 font-medium">${index + 1}</td>`;
            tableHTML += '<td class="text-center px-2 py-1 border border-gray-300 font-medium">1</td>';

            for (let j = 0; j < mod; j++) {
                const player = group.players[j] || '';
                const style = group.category === 'F' ? 'style="font-style:italic; color:red"' : '';
                let cellContent = player;
                if (showRemove && player !== '') {
                    const idx = group.playerIndices ? group.playerIndices[j] : '';
                    cellContent += ` <button type="button" class="qd-remove excludeThisClass ml-1 text-xs text-red-600 hover:text-red-800" data-cat="${group.category}" data-idx="${idx}" title="Rimuovi iscritto e ridisegna lo schema">&times;</button>`;
                }
                tableHTML += `<td class="text-center px-2 py-1 border border-gray-300" ${style}>${cellContent}</td>`;
            }

            tableHTML += `<td class="text-center px-2 py-1 border border-gray-300 font-medium">${currentTime}</td>`;
            tableHTML += '</tr>';

            currentTime = addTime(currentTime, gap);
            // Stacco extra tra blocchi nel giro finale
            if (blockBoundaries.has(index)) {
                currentTime = addTime(currentTime, BLOCK_GAP);
            }
        });

        tableHTML += '</tbody>';
        return tableHTML;
    }
}

/**
 * Normalizza il titolo di una gara Federgolf per consentire il raggruppamento
 * delle versioni MASCHILE-FEMMINILE della stessa gara.
 *
 * REGRESSIONE: la vecchia regex (con punteggiatura attorno alla keyword non
 * gestita) faceva sì che, ad esempio, "TROFEO X - MASCHILE 2026" si
 * normalizzasse a "TROFEO X -2026" mentre "TROFEO X FEMMINILE 2026" diventava
 * "TROFEO X 2026". I due titoli risultavano diversi e il dropdown mostrava
 * voci separate (M) e (F) invece dell'opzione combinata (M+F). Questa
 * funzione riduce il titolo a soli caratteri alfanumerici minuscoli, dopo
 * aver rimosso la parola-chiave di genere.
 *
 * @param {string} title - Titolo originale della gara
 * @returns {string} Titolo normalizzato (lowercase, alfanumerico+spazi singoli)
 */
export function normalizeGaraTitle(title) {
    if (!title) return '';
    return String(title)
        // 1. Rimuove la parola-chiave di genere ovunque appaia
        .replace(/(MASCHILE|FEMMINILE)/gi, ' ')
        // 2. Collassa qualunque sequenza di non-alfanumerici (spazi, dash,
        //    parentesi, punteggiatura, accenti speciali) in uno spazio
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Combina due risposte Federgolf (state-based) in array atleti/atlete + warnings.
 *
 * Funzione pura: niente DOM, niente jQuery, niente AJAX. Riceve risposte già
 * dispatchate dalla logica di selezione del dropdown (la quale sa quale
 * response è M e quale F via la struttura dati indicizzata, NON via marker
 * stringa nel value dell'option).
 *
 * SHAPE atteso per le response (da FedergolfController::getIscritti):
 *   { state: 'ready'|'open'|'empty'|'error', iscritti: string[], message?: string }
 *
 * SEMANTICA degli stati:
 *   - 'ready'  → usa iscritti
 *   - 'open'   → iscrizioni non chiuse, nomi non disponibili (warning)
 *   - 'empty'  → gara senza iscritti (warning informativo)
 *   - 'error'  → rete/timeout (warning con messaggio)
 *   - null/missing → side non richiesto (nessun warning)
 *
 * REGOLA di merge:
 *   - Per ogni lato richiesto raccogli i nomi (solo se state='ready')
 *   - Per ogni lato non-ready raccogli un warning con messaggio diagnostico
 *   - Il caller decide se applicare i risultati guardando atleti+atlete e
 *     warnings (semplice e prevedibile, niente flag "abort" da interpretare).
 *
 * @param {Object} args
 * @param {Object|null} args.maschileResponse - Response per la gara maschile (o null se non richiesta)
 * @param {Object|null} args.femminileResponse - Response per la gara femminile (o null se non richiesta)
 * @returns {{atleti: string[], atlete: string[], warnings: string[]}}
 */
export function mergeFedergolfResponses({ maschileResponse = null, femminileResponse = null } = {}) {
    const dispatch = (response, label) => {
        if (!response) {
            return { names: [], warning: null };
        }
        switch (response.state) {
            case 'ready':
                return { names: response.iscritti || [], warning: null };
            case 'open':
                return { names: [], warning: `Iscrizioni gara ${label} non ancora chiuse.` };
            case 'empty':
                return { names: [], warning: `Gara ${label} senza iscritti.` };
            case 'error':
                return {
                    names: [],
                    warning: `Errore caricamento iscritti ${label}: ${response.message || 'rete non disponibile'}`,
                };
            default:
                return {
                    names: [],
                    warning: `Risposta ${label} non riconosciuta.`,
                };
        }
    };

    const m = dispatch(maschileResponse, 'maschile');
    const f = dispatch(femminileResponse, 'femminile');

    const warnings = [];
    if (m.warning) warnings.push(m.warning);
    if (f.warning) warnings.push(f.warning);

    return {
        atleti: m.names,
        atlete: f.names,
        warnings,
    };
}
