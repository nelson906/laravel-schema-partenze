/**
 * Quadranti Logic Module - Updated Version
 * Contains the core business logic for calculating and generating tee times
 * with improved quadrant balancing algorithm
 */

import {
    DATEPICKER_IT,
    TABLE_COLORS,
    COMPETITION_TYPES,
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
            const response = await $.ajax({
                url: ($('meta[name="base-url"]').attr('content') || '') + '/user/quadranti/coordinates',
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
   * Generates double tee configuration with new logic
   * @param {string} round - 'prima', 'seconda' o 'finale'
   * @returns {string} HTML table content
   */
  generateDoubleTee(round) {
    const mod = parseInt(this.config.playersPerFlight) || 3;
    const players = parseInt(this.config.players) || 0;
    const proette = parseInt(this.config.proette) || 0;
    const garaNT = this.config.garaNT;

    // GIRO FINALE 54 buche: layout dedicato (immagine 1).
    // - Uomini Tee 1 = front-half (rank 1..frontM) decrescente, leader 1,2,3 ultimi
    // - Uomini Tee 10 = back-half (rank frontM+1..N) crescente, worst ultimi
    // - Sotto, donne con stessa logica: Tee 1 = front-half donne, Tee 10 = back-half donne
    // - Sempre numerico (ordine di classifica); usa playersCut/proetteCut.
    // Implementato inline (no nuove funzioni come richiesto).
    if (round === ROUND_TYPES.FINAL && garaNT === COMPETITION_TYPES.GARA_54) {
      const playersFinal = parseInt(this.config.playersCut) || players;
      const proetteFinal = parseInt(this.config.proetteCut) || proette;
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

        // Striscia FIG: primo/ultimo numero per quadrante (giro normale doppio tee).
        // Q1-Q4 sono i quadranti restituiti da generatePlayerGroups.
        this.figQuadranti = [];
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q) => {
            this.pushFigQuadrante('Uomini', q, maleGroups.filter(g => g.quadrant === q));
        });
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q) => {
            this.pushFigQuadrante('Donne', q, femaleGroups.filter(g => g.quadrant === q));
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

        for (let i = 0; i < maxGroups; i++) {
            html += '<tr>';

            // Left side
            if (leftGroups[i]) {
                html += `<td class="text-center px-2 py-1 border border-gray-300 font-medium" style="background-color:${leftBg}">${matchNumber++}</td>`;
                html += '<td class="text-center px-2 py-1 border border-gray-300 font-medium">1</td>';

                for (let j = 0; j < mod; j++) {
                    html += renderCell(leftGroups[i], j);
                }
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

                html += '<td class="text-center px-2 py-1 border border-gray-300 font-medium">10</td>';
                html += `<td class="text-center px-2 py-1 border border-gray-300 font-medium" style="background-color:${rightBg}">${matchNumber++}</td>`;
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
     * Calcola { first, last } di un quadrante (lista di gruppi in ordine di
     * display).
     *
     *   first = prima cella del primo gruppo (numero in alto a sinistra).
     *   last  = numero dell'ULTIMO gruppo più distante da first, cioè
     *           l'estremo del range. Per un quadrante crescente è il massimo
     *           dell'ultimo terzetto, per uno decrescente il minimo.
     *
     * Motivo del "più distante": l'ultimo terzetto può essere crescente o
     * decrescente al suo interno indipendentemente dalla direzione del
     * quadrante. Es. quadrante decrescente con ultimo flight [1,2,3]: l'ultimo
     * numero del quadrante è 1 (il più lontano da first), non 3.
     *
     * Ritorna null se il quadrante è vuoto.
     */
    quadrantRange(groups) {
        if (!Array.isArray(groups) || groups.length === 0) return null;

        const firstGroup = groups[0];
        const lastGroup = groups[groups.length - 1];

        const first = this.figPlayerNumber(firstGroup, 0);
        if (first == null) return null;

        let last = null;
        let maxDist = -1;
        for (let j = 0; j < lastGroup.players.length; j++) {
            const p = lastGroup.players[j];
            if (p === '' || p == null) continue;
            const num = this.figPlayerNumber(lastGroup, j);
            const dist = Math.abs(Number(num) - Number(first));
            if (dist > maxDist) {
                maxDist = dist;
                last = num;
            }
        }
        if (last == null) return null;

        return { first, last };
    }

    /**
     * Aggiunge una voce a this.figQuadranti se il quadrante non è vuoto.
     * invertire = true quando l'ordine è decrescente (first > last).
     */
    pushFigQuadrante(categoria, label, groups) {
        const r = this.quadrantRange(groups);
        if (!r) return;
        this.figQuadranti.push({
            categoria,
            label,
            first: r.first,
            last: r.last,
            invertire: Number(r.first) > Number(r.last),
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
            .map(q => `${q.categoria} ${q.label}: ${q.first} → ${q.last}${q.invertire ? '  INVERTIRE' : ''}`)
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
                html += `<span style="background:#fff; border:1px solid #c7d2fe; border-radius:6px; padding:4px 10px; font-size:13px;">
                  <span style="color:#64748b;">${v.label}:</span>
                  <strong style="color:#0f172a;">${v.first} &rarr; ${v.last}</strong>${invBadge}
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

    /**
     * Generates single tee configuration
     *
     * Per i giri normali ('prima'/'seconda') concatena femaleGroups + maleGroups
     * generati da generatePlayerGroups (4 quadranti).
     *
     * Per il giro finale 54 buche ('finale'): tee unico, ordine di classifica,
     * sempre numerico (i nomi non sono utili in una classifica). Tre blocchi
     * sequenziali con stacco extra tra l'uno e l'altro:
     *   Blocco 1 = Uomini back-half (rank halfM+1..N), gruppi in ordine
     *              CRESCENTE di rank (worst overall a fine blocco);
     *   Blocco 2 = Donne (tutte), gruppi in ordine DECRESCENTE di rank
     *              (leader donne a fine blocco);
     *   Blocco 3 = Uomini front-half (rank 1..halfM), gruppi in ordine
     *              DECRESCENTE di rank (leader uomini a fine blocco).
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
        const isFinal =
            round === ROUND_TYPES.FINAL &&
            garaNT === COMPETITION_TYPES.GARA_54;

        // Nel giro finale i partecipanti sono i QUALIFICATI dopo il taglio,
        // letti dai campi separati playersCut/proetteCut. Possono essere
        // inferiori a players/proette. Fallback su players/proette se zero
        // (utente non li ha ancora compilati).
        const playersFinal = isFinal
            ? (parseInt(this.config.playersCut) || players)
            : players;
        const proetteFinal = isFinal
            ? (parseInt(this.config.proetteCut) || proette)
            : proette;

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

            const block1 = asc(backMen, 'M');       // back-half asc
            const block2 = ranksF.length > 0 ? desc(ranksF, 'F') : [];  // donne desc (leader F ultime)
            const block3 = desc(frontMen, 'M');      // front-half desc (leader M ultimi)

            allGroups = [...block1, ...block2, ...block3];
            if (block1.length > 0) blockBoundaries.add(block1.length - 1);
            if (block2.length > 0) blockBoundaries.add(block1.length + block2.length - 1);

            // Striscia FIG: il giro finale tee unico ha 3 blocchi sequenziali
            this.figQuadranti = [];
            this.pushFigQuadrante('Uomini', 'Blocco 1 · back-half', block1);
            this.pushFigQuadrante('Donne',  'Blocco 2',            block2);
            this.pushFigQuadrante('Uomini', 'Blocco 3 · front-half', block3);
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
