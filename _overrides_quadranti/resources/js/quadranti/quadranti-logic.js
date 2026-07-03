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
    parseForma,
    ROUND_TYPES,
    COMPACT_TYPES
} from './config.js';

import {
    range,
    addTime,
    halfTime,
    storage,
    formatDate,
    chunkArray,
    escapeHtml
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

        // Regola speciale storica sul modulo del campo — SOLO mod 3 e 4
        // (verificata sui PDF ufficiali): se il resto di players % (mod·4)
        // è in 1..mod, sposta un volo da Q3 a Q2. Formula identica alle
        // regole storiche esplicite (mod 3: rem12 1-3; mod 4: rem16 1-4).
        // NON si applica ai flight da 2: sbilancerebbe Early/Late senza
        // motivo (es. 33 giocatori → 10/7 invece del naturale 9/8 —
        // segnalato da Alberto 02/07/2026, nessun PDF a supporto per mod 2).
        if (mod >= 3) {
            const remQ = players % (mod * 4);
            if (remQ >= 1 && remQ <= mod && Q3 > 0) {
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
     * ════════════════════════════════════════════════════════════════════════
     * MOTORE UNICO — espandiSezione + renderQuadranti + costruisciQuadranti*
     *
     * Una sola implementazione di: ordine interno del terzetto, posizione del
     * volo incompleto (twosome), ordine dei gruppi. Sostituisce le regole
     * duplicate (buildSingleTeeSection, buildBlock, arco) — vedi
     * MODELLO_QUADRANTI.md. bilanciaQuadranti / limitiQuadranti NON si toccano:
     * restano la fonte dei range.
     * ════════════════════════════════════════════════════════════════════════
     */

    /**
     * CORE del motore. Espande l'intervallo di ranghi [lo..hi] in righe (gruppi
     * da `mod`). Regole universali (dai PDF ufficiali in Schemi partenze/):
     *   - il volo incompleto (twosome) prende i ranghi più ALTI ed è messo in
     *     TESTA alla sezione (primo volo) — regola `difference` MODELLO §3.1;
     *   - `internal` = ordine dentro il gruppo: 'asc' → [70,71,72] (ordine di
     *     merito/qualificazione), 'desc' → [72,71,70] (ordine di classifica);
     *   - `groupOrder` = ordine dei gruppi: 'desc' parte dai ranghi alti.
     *
     * @returns {Array<number[]>} righe di RANGHI (1-based), nell'ordine di partenza
     */
    espandiSezione(lo, hi, mod, internal = 'asc', groupOrder = 'desc') {
        const count = hi - lo + 1;
        if (count <= 0) return [];
        const inc  = mod - 1;
        const diff = Math.ceil(count / mod) * mod - count; // 0,1,2 voli corti

        // Ranghi nell'ordine di GIOCO (ordine dei gruppi):
        //   'asc'  → dal più basso al più alto;  'desc' → dal più alto al più basso.
        const seq = [];
        if (groupOrder === 'asc') { for (let r = lo; r <= hi; r++) seq.push(r); }
        else { for (let r = hi; r >= lo; r--) seq.push(r); }

        // I voli CORTI (twosome) sono i PRIMI `diff` voli → SEMPRE in TESTA al
        // blocco (regola: twosome in testa). Poi i voli pieni. I ranghi del
        // twosome dipendono dall'ordine: 'asc' → i più bassi; 'desc' → i più alti.
        const rows = [];
        let i = 0;
        for (let d = 0; d < diff; d++) { rows.push(seq.slice(i, i + inc)); i += inc; }
        for (; i < seq.length; i += mod) rows.push(seq.slice(i, i + mod));

        // Ordine INTERNO del terzetto: crescente (merito) o decrescente (classifica).
        return rows.map((g) => { const s = [...g].sort((a, b) => a - b); return internal === 'asc' ? s : s.reverse(); });
    }

    /** Nome (nominativo) o numero di rango per la cella giocatore. */
    _playerOf(source, rank) {
        return (source && source[rank - 1] !== undefined && source[rank - 1] !== '')
            ? source[rank - 1]
            : String(rank);
    }

    /**
     * MOTORE. Espande una lista di Quadrante in gruppi pronti per il rendering.
     * Un Quadrante = { categoria:'M'|'F', sessione:'early'|'late', tee:1|10,
     *                  lo, hi, internal:'asc'|'desc', groupOrder:'asc'|'desc',
     *                  source:Array }.
     * I quadranti vuoti (lo>hi) sono saltati. L'ordine della lista è l'ordine
     * di partenza (per il tee unico è anche l'ordine dei voli).
     *
     * @returns {Array} gruppi { players, playerIndices, category, tee, sessione }
     */
    renderQuadranti(quadranti, mod) {
        const out = [];
        quadranti.forEach((q) => {
            const rows = this.espandiSezione(q.lo, q.hi, mod, q.internal, q.groupOrder);
            rows.forEach((r) => {
                out.push({
                    players:       r.map((rank) => this._playerOf(q.source, rank)),
                    playerIndices: r.map((rank) => rank - 1),
                    category:      q.categoria,
                    tee:           q.tee,
                    sessione:      q.sessione,
                });
            });
        });
        return out;
    }

    /**
     * Costruisce i Quadrante per il TEE UNICO di qualificazione (giri normali).
     *
     * Struttura (schema B / 2° giro, highLeads): uomini-alti → donne → uomini-bassi
     * (donne in mezzo, vedi TEE UNICO.pdf). 1° giro standard (lowLeads): l'ordine
     * è invertito. Il confine low/high (`limit2`) è spostato da computeSplit così
     * che la sezione che APRE assorba il twosome dai ranghi più alti.
     * Ordine interno SEMPRE crescente (qualificazione = ordine di merito).
     */
    costruisciQuadrantiSingleTee(round, garaNT, players, proette, mod, atleti, atlete) {
        const isSchemaB = (
            garaNT === COMPETITION_TYPES.GARA_GIOVANILE ||
            garaNT === COMPETITION_TYPES.TEODORO_SOLDATI
        );
        const highLeads = isSchemaB || round !== ROUND_TYPES.FIRST;

        // Sposta il confine così che la sezione di apertura abbia esattamente
        // `diff` voli corti (twosome ai ranghi più alti della sezione).
        const computeSplit = (total, natLimit2, diff) => {
            if (!highLeads || diff === 0) return natLimit2;
            const highCount     = total - natLimit2;
            const currHighRem   = highCount % mod;
            const targetHighRem = (diff * (mod - 1)) % mod;
            const adj = ((currHighRem - targetHighRem) % mod + mod) % mod;
            return natLimit2 + adj;
        };

        const mLim   = this.limitiQuadranti(players, mod);
        const mSplit = computeSplit(players, mLim.limit2, mLim.difference);
        const fLim   = proette > 0 ? this.limitiQuadranti(proette, mod) : { limit2: 0, difference: 0 };
        const fSplit = proette > 0 ? computeSplit(proette, fLim.limit2, fLim.difference) : 0;

        const mk = (categoria, lo, hi, source, sessione) => ({
            categoria, sessione, tee: 1, lo, hi,
            internal: 'asc', groupOrder: 'desc', source,
        });

        const mLow  = mk('M', 1,          mSplit,  atleti, 'late');
        const mHigh = mk('M', mSplit + 1, players, atleti, 'early');
        const fLow  = mk('F', 1,          fSplit,  atlete, 'late');
        const fHigh = mk('F', fSplit + 1, proette, atlete, 'early');

        return highLeads
            ? [mHigh, fHigh, fLow, mLow]   // uomini alti → donne → uomini bassi
            : [mLow, fLow, fHigh, mHigh];  // 1° giro standard: invertito
    }

    /**
     * MOTORE — costruisce i 4 quadranti a forma ∩ (U-rovesciata) per un campo di
     * N giocatori, applicando la regola §3.1 (README §3.2/§3.3) UNA volta sola.
     *
     * Modello canonico (README §3):
     *   Q1 → Tee1 Early (alto-sx)    Q2 → Tee10 Early
     *   Q3 → Tee1 Late  (basso-sx)   Q4 → Tee10 Late
     * I conteggi vengono da bilanciaQuadranti (NON toccato). La `difference`:
     *   - d=1 → 1° volo di Q1 da (mod-1);  d=2 → primi due voli di Q1 da (mod-1);
     *   - d=3 → ultimo volo di Q3 tagliato (riga vuota in basso-sx).
     * Lo sbilancio Tee1/Tee10 (Q1+Q3 vs Q2+Q4) fa cadere il vuoto residuo in
     * coda a Q3 = basso-sx, esattamente come il 54 buche.
     *
     * Geometria ∩: Tee1 = metà bassa, gruppi DECRESCENTI; Tee10 = metà alta,
     * gruppi CRESCENTI. Ordine interno del terzetto = `internal` ('asc' per i
     * giri di merito, 'desc' per i giri di classifica).
     *
     * @param {number} earlyFlights  voli totali in sessione Early (Tee1+Tee10).
     *   È deciso dal chiamante (women-aware nei giri con donne); il resto va Late.
     * @returns {{early:{tee1:[],tee10:[]}, late:{tee1:[],tee10:[]}}}
     */
    buildURQuadrants(N, mod, source, internal = 'asc', earlyFlights = null, opts = {}) {
        const empty = { early: { tee1: [], tee10: [] }, late: { tee1: [], tee10: [] } };
        if (!N || N <= 0) return empty;

        // Parametri di FORMA (default = ∩ giovanili, comportamento storico):
        //   forma 'UR' (∩): metà bassa gruppi DECRESCENTI, metà alta CRESCENTI.
        //   forma 'U'  (∪): metà bassa CRESCENTI, metà alta DECRESCENTI.
        //   forma 'S'      : entrambe CRESCENTI.
        //   verso 'sn-dx' (L/R): metà bassa su Tee 1; 'dx-sn' (R/L): su Tee 10.
        //   earlyIsHigh: true → Early prende i ranghi ALTI (giovanili); false → bassi (cerchio).
        // forma può essere per-sessione: {early, late} (cerchio = early 'UR' + late 'U').
        const { forma = 'UR', verso = 'sn-dx', earlyIsHigh = true } = opts;
        const earlyForma = (forma && forma.early) || (typeof forma === 'string' ? forma : 'UR');
        const lateForma  = (forma && forma.late)  || (typeof forma === 'string' ? forma : 'UR');
        // Per una forma, ritorna ordine GRUPPI e INTERNO per Tee 1 / Tee 10.
        const layoutOf = (f) => {
            const lowG  = f === 'UR' ? 'desc' : 'asc';   // metà bassa
            const highG = f === 'U'  ? 'desc' : 'asc';   // metà alta
            const t1g  = verso === 'dx-sn' ? highG : lowG;   // Tee 1 = alta (dx-sn) o bassa
            const t10g = verso === 'dx-sn' ? lowG  : highG;  // Tee 10 = bassa (dx-sn) o alta
            return { t1g, t10g, t1i: t1g === 'desc' ? internal : 'asc', t10i: t10g === 'desc' ? internal : 'asc' };
        };
        const eLay = layoutOf(earlyForma), lLay = layoutOf(lateForma);

        const F = Math.ceil(N / mod);
        const d = F * mod - N;                       // 0,1,2 (mai 3 con questa def.)
        let eF = earlyFlights == null ? Math.round(F / 2) : earlyFlights;
        eF = Math.max(0, Math.min(F, eF));
        if (eF % 2 !== 0) eF -= 1;                    // Early bilanciato → vuoto in Late Tee 1
        eF = Math.max(0, eF);
        const lF = F - eF;

        // Conteggi per quadrante. Il twosome (difference) va in Q1 (Tee 1 Early) se
        // c'è Early, altrimenti in Q3 (Tee 1 Late). Q1/Q3 = Tee 1 = SEMPRE la metà
        // del proprio lato che apre quel tee (mappata su ranghi via verso più sotto).
        const q1f = Math.floor(eF / 2), q2f = eF - q1f;   // Early: Q1 Tee1, Q2 Tee10
        const q3f = Math.floor(lF / 2), q4f = lF - q3f;   // Late:  Q3 Tee1, Q4 Tee10
        const earlyPlayers = eF > 0 ? Math.max(0, eF * mod - d) : 0;
        const latePlayers  = N - earlyPlayers;
        let q1p, q2p, q3p, q4p;
        if (eF > 0) {
            q1p = Math.max(0, q1f * mod - d); q2p = earlyPlayers - q1p;  // twosome in Q1
            q3p = q3f * mod;                  q4p = latePlayers - q3p;
        } else {
            q1p = 0; q2p = 0;
            q3p = Math.max(0, q3f * mod - d); q4p = latePlayers - q3p;   // twosome in Q3
        }

        // Assegnazione RANGHI ai quadranti.
        //   earlyIsHigh: Early = ranghi alti. Ordine crescente dei ranghi:
        //     Late(Q3 bassi, Q4) poi Early(Q1, Q2 alti).
        //   !earlyIsHigh (cerchio): Early = ranghi bassi → Early(Q1,Q2) poi Late(Q3,Q4).
        // Dentro una sessione, Tee 1 (Q1/Q3) prende la metà BASSA o ALTA secondo `verso`:
        //   sn-dx → Tee 1 = metà bassa; dx-sn → Tee 1 = metà alta.
        // Quindi l'ordine dei ranghi all'interno della sessione dipende da verso.
        let lo = 1;
        const rng = (n) => { const r = [lo, lo + n - 1]; lo += n; return r; };
        // Costruisce le due fasce (Tee1/Tee10) di una sessione rispettando verso:
        // ritorna { rTee1, rTee10 } come intervalli di rango già ordinati.
        const sessRanges = (tee1Players, tee10Players) => {
            // metà bassa = ranghi più bassi della sessione; metà alta = più alti.
            // verso sn-dx: Tee1=bassa, Tee10=alta → assegno prima Tee1.
            // verso dx-sn: Tee1=alta,  Tee10=bassa → assegno prima Tee10 (bassa).
            if (verso === 'dx-sn') {
                const rTee10 = rng(tee10Players); // bassa
                const rTee1  = rng(tee1Players);  // alta
                return { rTee1, rTee10 };
            }
            const rTee1  = rng(tee1Players);  // bassa
            const rTee10 = rng(tee10Players); // alta
            return { rTee1, rTee10 };
        };

        let rQ3, rQ4, rQ1, rQ2;
        if (earlyIsHigh) {
            // ranghi crescenti: Late prima (bassi), Early dopo (alti).
            ({ rTee1: rQ3, rTee10: rQ4 } = sessRanges(q3p, q4p));
            ({ rTee1: rQ1, rTee10: rQ2 } = sessRanges(q1p, q2p));
        } else {
            // cerchio: Early prima (bassi), Late dopo (alti).
            ({ rTee1: rQ1, rTee10: rQ2 } = sessRanges(q1p, q2p));
            ({ rTee1: rQ3, rTee10: rQ4 } = sessRanges(q3p, q4p));
        }

        const grp = ([a, b], groupOrder, internalOrder) => {
            if (b < a) return [];
            return this.espandiSezione(a, b, mod, internalOrder, groupOrder).map((r) => ({
                players:       r.map((rank) => this._playerOf(source, rank)),
                playerIndices: r.map((rank) => rank - 1),
            }));
        };

        return {
            early: { tee1: grp(rQ1, eLay.t1g, eLay.t1i), tee10: grp(rQ2, eLay.t10g, eLay.t10i) }, // Q1 alto-sx, Q2
            late:  { tee1: grp(rQ3, lLay.t1g, lLay.t1i), tee10: grp(rQ4, lLay.t10g, lLay.t10i) }, // Q3 basso-sx, Q4
        };
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
   * RENDERER UNICO a blocchi (doppio tee). Riceve i blocchi GIÀ costruiti
   * (`{cat, session, tee1[], tee10[]}`), assegna i flightNumber (regola unica),
   * impagina la tabella, calcola gli orari (stacco incrocio Early→Late = mezzo
   * giro; stacco breve tra blocchi della stessa sessione) e popola la striscia
   * FIG. È il punto di rendering condiviso da tutti i formati a blocchi.
   *
   * @param {Array} costruiti  blocchi con tee1/tee10 già pronti
   * @param {boolean} reversedTriplet  se true la riga vuota separa solo Early/Late
   * @returns {string} HTML (info box + tabella)
   */
  renderBlocchi(costruiti, blankAtCrossingOnly = false) {
    const colors = TABLE_COLORS.teeColors;
    const gap = this.config.gap;
    this.assegnaFlightUnificato(costruiti);

    this.figQuadranti = [];
    let bodyHtml = this.generateTableHeader(true);
    let blockTime = this.config.startTime;
    let lastEarlyTime = '', firstLateTime = '', lastDeparture = this.config.startTime;

    costruiti.forEach((b, bi) => {
      const { tee1, tee10 } = b;
      const colore = b.cat === 'F' ? TABLE_COLORS.women : TABLE_COLORS.men;
      const lbg = b.cat === 'F' ? 'transparent' : colors.orange;
      const rbg = b.cat === 'F' ? 'transparent' : colors.lightGreen;
      if (bi > 0) {
        const sessionChange = costruiti[bi - 1].session !== b.session;
        const addBlank = blankAtCrossingOnly ? sessionChange : true;
        if (addBlank) bodyHtml += '<tr><td colspan="20" class="py-2">&nbsp;</td></tr>';
      }
      const firstDep = blockTime;
      bodyHtml += this.buildGroupTableRows(tee1, tee10, colore, lbg, rbg, blockTime, gap, b.cat, 1);
      const catLabel = b.cat === 'F' ? 'Donne' : 'Uomini';
      this.pushFigQuadrante(catLabel, `Blocco ${bi + 1} · Tee 1`, tee1);
      this.pushFigQuadrante(catLabel, `Blocco ${bi + 1} · Tee 10`, tee10);
      const rows = Math.max(tee1.length, tee10.length);
      // Ultima partenza del blocco = firstDep + (rows-1) stacchi.
      let blockLastDep = blockTime;
      for (let i = 0; i < rows - 1; i++) blockLastDep = addTime(blockLastDep, gap);
      if (rows > 0) {
        if (b.session === 'early') lastEarlyTime = blockLastDep;
        if (b.session === 'late' && !firstLateTime) firstLateTime = firstDep;
        lastDeparture = blockLastDep;
      }
      for (let i = 0; i < rows; i++) blockTime = addTime(blockTime, gap);
      const next = costruiti[bi + 1];
      if (next) {
        const crossing = b.session === 'early' && next.session === 'late';
        blockTime = addTime(blockTime, crossing ? halfTime(this.config.round) : '00:10');
      }
    });
    bodyHtml += '</tbody>';

    // Info box a 3 campi (doppio tee): Ultima Early, Prima Late, Fine Gara.
    if (!lastEarlyTime) lastEarlyTime = this.config.startTime;
    if (!firstLateTime) firstLateTime = lastEarlyTime;
    const finishTime = addTime(lastDeparture, this.config.round);
    const infoHTML = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; padding: 15px; background: #e8f5e8; border-radius: 8px;">
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${lastEarlyTime}</strong>
          <span>Ultima Partenza Early</span>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${firstLateTime}</strong>
          <span>Prima Partenza Late</span>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
          <strong style="display: block; font-size: 18px; color: #2c5530;">${finishTime}</strong>
          <span>Fine Gara Stimata</span>
        </div>
      </div>
    `;
    this.figFlights = this._figFlightsBuffer;
    return infoHTML + `<table>${bodyHtml}</table>`;
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
    // Forma dei quadranti per sezione: stringhe 'FORMA-VERSO' del descrittore
    // (es. 'UR-R/L', 'S-L/R') decodificate da parseForma. Un giro con ENTRAMBE
    // le sezioni di forma 'UR' è un blocco a U rovesciata ∩ (giovanili /
    // patrocinate 2° giro) → ramo blocchi qui sotto. Stessa strada per i giri
    // a "sessioni miste" (earlyHalf nel descrittore, es. Prova di gioco, con
    // forme UR + S). Gli altri giri a forma mista (cerchio/clessidra) vanno al
    // flusso di qualificazione storico.
    const sezEarly = roundDesc && roundDesc.early ? parseForma(roundDesc.early) : null;
    const sezLate  = roundDesc && roundDesc.late  ? parseForma(roundDesc.late)  : null;
    const isBloccoUR = !!(
      sezEarly && sezLate
      && sezEarly.forma === 'UR' && sezLate.forma === 'UR'
    );
    // Giri a sessioni miste (Prova di gioco): metà campo per ranghi a sessione,
    // forma per-sessione anche 'S' (entrambi i tee nella stessa direzione).
    const isSessioniMiste = !!(roundDesc && roundDesc.earlyHalf && sezEarly && sezLate);
    // Cerchio/clessidra (54/72 1°-2°, patrocinate/trofei 1°): forma mista (∩+∪).
    // Ora passa dal MOTORE UNICO (buildURQuadrants + renderBlocchi), non più dal
    // vecchio generate54/36HoleTableNew.
    const isCerchio = !!(roundDesc && roundDesc.layout === 'cerchio');

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

      // Finale per classifica, doppio tee — via MOTORE UNICO (renderQuadranti).
      // Tee 1 (Q1, front) DECRESCENTE; Tee 10 (back) a gruppi CRESCENTI, interno
      // decrescente (PDF "3°/4° giro per classifica"). Il resto (difference §3.1)
      // va al Tee 1 (Q1): mai un giocatore solo — d voli da (mod-1).
      const buildFinaleTees = (nPlayers, cat) => {
        if (nPlayers <= 0) return { tee1: [], tee10: [] };
        const totalFlights = Math.ceil(nPlayers / mod);
        const frontFlights = Math.ceil(totalFlights / 2);
        const backCount = Math.min((totalFlights - frontFlights) * mod, nPlayers);
        const frontCount = nPlayers - backCount; // Q1 (Tee 1) assorbe il resto
        const tee1 = this.renderQuadranti(
          [{ categoria: cat, tee: 1, lo: 1, hi: frontCount, internal: 'desc', groupOrder: 'desc', source: null }], mod);
        const tee10 = this.renderQuadranti(
          [{ categoria: cat, tee: 10, lo: frontCount + 1, hi: nPlayers, internal: 'desc', groupOrder: 'asc', source: null }], mod);
        return { tee1, tee10 };
      };
      const mTees = buildFinaleTees(playersFinal, 'M');
      const fTees = proetteFinal > 0 ? buildFinaleTees(proetteFinal, 'F') : { tee1: [], tee10: [] };
      const maleTee1  = mTees.tee1;
      const maleTee10 = mTees.tee10;
      const femTee1   = fTees.tee1;
      const femTee10  = fTees.tee10;

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
    // Formati giovanili/patrocinate/SNP. Ogni blocco è un intervallo di ranghi
    // spezzato a metà: metà bassa → Tee 1, metà alta → Tee 10 → forma ∩.
    // Lo schema di campo (quanti blocchi, in quale ordine) è pilotato dal
    // campo `layout` del round descriptor in config.js:
    //   'giovanili'           → 3 blocchi: uomini alta (Early), donne, uomini bassa (Late)
    //   'reversed-interleaved'→ 4 blocchi: uomini alta, donne alta, donne bassa, uomini bassa
    //   'sessioni-miste'      → 2 blocchi (solo uomini): earlyHalf/lateHalf ruotano tra giri
    // Aggiungere un nuovo tipo = nuova voce in blocchiBuilders + layout:'nome' in config.js.
    // Numerico o nominativo secondo config. I giri 'finale' sono già intercettati da isFinaleRound.
    if (isBloccoUR || isSessioniMiste || isCerchio) {
      const reversedTriplet = roundDesc ? !!roundDesc.reversed : false;
      const colors = TABLE_COLORS.teeColors;
      const gap = this.config.gap;

      // Dati giocatori: nomi (nominativo='On') o numeri di rango (nominativo='Off').
      const { atleti: menRanks, atlete: womenRanks } = this.getPlayerArrays();

      // Determina il layout: campo esplicito in config.js (preferito) o
      // derivazione automatica dai flag (retrocompatibilità con giri senza `layout`).
      const layout = (roundDesc && roundDesc.layout)
        || (isSessioniMiste ? 'sessioni-miste' : null)
        || (reversedTriplet ? 'reversed-interleaved' : null)
        || 'giovanili';

      // ── BUILDER DI LAYOUT ─────────────────────────────────────────────────
      // Ogni voce costruisce i blocchi per il proprio schema di campo.
      // Aggiungere un nuovo tipo di gara = una nuova voce qui + layout:'nome'
      // nel round descriptor in config.js. Nessuna modifica al motore sotto.
      const blocchiBuilders = {

        // Prova di gioco SNP (giri 1-2): campo SOLO UOMINI diviso in due metà
        // per ranghi. earlyHalf dice quale metà gioca Early (ruota tra giri).
        // Ogni sessione è un blocco con la propria forma ('UR' o 'S').
        'sessioni-miste': () => {
          // MOTORE UNICO: Prova di gioco 1°/2° (solo uomini). Campo diviso in due
          // metà al confine `limit2`; `earlyHalf` dice quale gioca Early. Forma
          // per-sessione dal descrittore (es. early 'UR' + late 'S'). Niente arco.
          const limit2 = players > 0 ? this.limitiQuadranti(players, mod).limit2 : 0;
          const earlyIsHigh = roundDesc.earlyHalf === 'alta';
          const earlyPlayers = earlyIsHigh ? (players - limit2) : limit2;
          const earlyFl = Math.ceil(earlyPlayers / mod);
          const forma = { early: sezEarly.forma, late: sezLate.forma };
          const verso = sezEarly.verso;
          const men = this.buildURQuadrants(players, mod, menRanks, 'asc', earlyFl, { forma, verso, earlyIsHigh });
          const bl = [];
          if (men.early.tee1.length || men.early.tee10.length)
            bl.push({ cat: 'M', session: 'early', tee1: men.early.tee1, tee10: men.early.tee10 });
          if (men.late.tee1.length || men.late.tee10.length)
            bl.push({ cat: 'M', session: 'late', tee1: men.late.tee1, tee10: men.late.tee10 });
          return bl;
        },

        // Patrocinate/Trofei 2° giro: 4 blocchi ∩ reversed, donne IN MEZZO.
        // Ordine: uomini metà alta → donne metà alta → donne metà bassa → uomini metà bassa.
        // È il MIRROR del 1° giro (cerchio): vedi sotto.
        'reversed-interleaved': () => {
          // MOTORE UNICO — 2° giro = MIRROR esatto del 1° (cerchio).
          // Si calcola lo split BILANCIATO del 1° giro (IDENTICO al builder
          // 'cerchio': uomini late-heavy, donne early-heavy, Early ≈ Late) e si
          // SCAMBIA Early↔Late per entrambi. Così UOMINI E DONNE seguono la
          // STESSA logica e il bilanciamento è preservato (lo swap di un
          // bilanciato resta bilanciato). Es. 90/42: 1° = uomini 7E/8L + donne
          // 4E/3L (11/11) ⇒ 2° = uomini 8E/7L + donne 3E/4L (11/11).
          const menFlights = Math.ceil(players / mod);
          const womenTotFlights = Math.ceil(proette / mod);
          // --- split del 1° giro (stessa formula del builder 'cerchio') ---
          const target = Math.ceil(((menFlights + womenTotFlights) / 2) / 2);
          const wEarly1 = proette > 0
            ? (() => { const wq = this.bilanciaQuadranti(proette, mod); return wq.Q1 + wq.Q2; })()
            : 0;
          const maleMaxEarly = Math.max(0, target - Math.ceil(wEarly1 / 2));
          const mq = this.bilanciaQuadranti(players, mod, maleMaxEarly);
          const mEarly1 = mq.Q1 + mq.Q2;
          // --- 2° giro = MIRROR: scambio Early↔Late ---
          const menUpperFlights   = menFlights - mEarly1;        // uomini early-heavy
          const womenEarlyFlights = womenTotFlights - wEarly1;    // donne late-heavy
          const men = this.buildURQuadrants(players, mod, menRanks, 'desc', menUpperFlights);
          const women = proette > 0
            ? this.buildURQuadrants(proette, mod, womenRanks, 'desc', womenEarlyFlights)
            : null;
          const bl = [];
          if (men.early.tee1.length || men.early.tee10.length)
            bl.push({ cat: 'M', session: 'early', tee1: men.early.tee1, tee10: men.early.tee10 });
          if (women && (women.early.tee1.length || women.early.tee10.length))
            bl.push({ cat: 'F', session: 'early', tee1: women.early.tee1, tee10: women.early.tee10 });
          if (women && (women.late.tee1.length || women.late.tee10.length))
            bl.push({ cat: 'F', session: 'late', tee1: women.late.tee1, tee10: women.late.tee10 });
          if (men.late.tee1.length || men.late.tee10.length)
            bl.push({ cat: 'M', session: 'late', tee1: men.late.tee1, tee10: men.late.tee10 });
          return bl;
        },

        // Gara Giovanile / Teodoro Soldati: 3 blocchi ∩ —
        // uomini metà alta (Early), donne (Late), uomini metà bassa (Late).
        // Flight Early pari così Tee 1 = Tee 10 senza buchi.
        'giovanili': () => {
          const menFlights   = Math.ceil(players / mod);
          const womenFlights = Math.ceil(proette / mod);
          let earlyMenFlights = Math.round((menFlights + womenFlights) / 2);
          if (earlyMenFlights % 2 !== 0) earlyMenFlights -= 1; // a pari → Tee1 = Tee10
          earlyMenFlights = Math.max(0, Math.min(menFlights, earlyMenFlights));
          // MOTORE UNICO: i quadranti uomini via buildURQuadrants (§3.1: twosome
          // in Q1 alto-sx, vuoto in Q3 basso-sx, tee bilanciati). Niente più arco.
          // earlyMenFlights (women-aware, pari) decide lo split Early/Late.
          const internal = reversedTriplet ? 'desc' : 'asc';
          const men = this.buildURQuadrants(players, mod, menRanks, internal, earlyMenFlights);
          // Donne TUTTE in Late (giovanili): motore unico con earlyFlights=0 →
          // la difference va in Q3 (testa Late Tee 1), vuoto in coda, bilanciato.
          const women = proette > 0
            ? this.buildURQuadrants(proette, mod, womenRanks, internal, 0)
            : null;
          const bl = [];
          if (men.early.tee1.length || men.early.tee10.length)
            bl.push({ cat: 'M', session: 'early', tee1: men.early.tee1, tee10: men.early.tee10 });
          if (women && (women.late.tee1.length || women.late.tee10.length))
            bl.push({ cat: 'F', session: 'late', tee1: women.late.tee1, tee10: women.late.tee10 });
          if (men.late.tee1.length || men.late.tee10.length)
            bl.push({ cat: 'M', session: 'late', tee1: men.late.tee1, tee10: men.late.tee10 });
          return bl;
        },

        // Cerchio (1° giro) / clessidra (2° giro) di 54/72 e patrocinate/trofei 1°.
        // Forma MISTA dal descrittore: early ∩ + late ∪ (cerchio) oppure early ∪ +
        // late ∩ (clessidra). earlyIsHigh derivato: clessidra (early 'U') = Early
        // ranghi ALTI; cerchio (early 'UR') = Early ranghi bassi. Split uomini
        // women-aware (come il vecchio flusso); blocchi: M-early, F-early, F-late,
        // M-late. Sostituisce generate54/36HoleTableNew.
        'cerchio': () => {
          // 1° giro = cerchio (Early = ranghi BASSI, forma ∩ early + ∪ late).
          const forma = { early: sezEarly.forma, late: sezLate.forma };
          const verso = sezEarly.verso;
          const earlyIsHigh = false;
          // Split women-aware: le donne prendono i loro slot Early naturali, gli
          // uomini riempiono il resto della mattina (vincolo maxEarlySlots).
          const mf = Math.ceil(players / mod), wf = Math.ceil(proette / mod);
          const target = Math.ceil(((mf + wf) / 2) / 2);
          const wEarlyFl = proette > 0
            ? (() => { const wq = this.bilanciaQuadranti(proette, mod); return wq.Q1 + wq.Q2; })()
            : 0;
          const maleMaxEarly = Math.max(0, target - Math.ceil(wEarlyFl / 2));
          const mq = this.bilanciaQuadranti(players, mod, maleMaxEarly);
          const mEarlyFl = mq.Q1 + mq.Q2;

          const men1 = this.buildURQuadrants(players, mod, menRanks, 'asc', mEarlyFl, { forma, verso, earlyIsHigh });
          const women1 = proette > 0
            ? this.buildURQuadrants(proette, mod, womenRanks, 'asc', wEarlyFl, { forma, verso, earlyIsHigh })
            : null;
          // 2° giro = SPECULARE (giorno 2): i blocchi del 1° restano CONGELATI e
          // scambiano posizione Early↔Late e Tee1↔Tee10 (remap Q1↔Q4, Q2↔Q3).
          // Il twosome (1° in testa Early-Tee1) finisce in Late-Tee10.
          const remap = (q) => ({
            early: { tee1: q.late.tee10,  tee10: q.late.tee1 },
            late:  { tee1: q.early.tee10, tee10: q.early.tee1 },
          });
          const giorno2 = roundDesc.giorno === 2;
          const men = giorno2 ? remap(men1) : men1;
          const women = women1 ? (giorno2 ? remap(women1) : women1) : null;
          const bl = [];
          if (men.early.tee1.length || men.early.tee10.length)
            bl.push({ cat: 'M', session: 'early', tee1: men.early.tee1, tee10: men.early.tee10 });
          if (women && (women.early.tee1.length || women.early.tee10.length))
            bl.push({ cat: 'F', session: 'early', tee1: women.early.tee1, tee10: women.early.tee10 });
          if (women && (women.late.tee1.length || women.late.tee10.length))
            bl.push({ cat: 'F', session: 'late', tee1: women.late.tee1, tee10: women.late.tee10 });
          if (men.late.tee1.length || men.late.tee10.length)
            bl.push({ cat: 'M', session: 'late', tee1: men.late.tee1, tee10: men.late.tee10 });
          return bl;
        }

      };

      const builder = blocchiBuilders[layout];
      if (!builder) throw new Error(`Layout sconosciuto: "${layout}". Aggiungere una voce in blocchiBuilders.`);
      const blocchi = builder();

      // Tutti i builder producono già blocchi { tee1, tee10 } (motore unico):
      // niente più espansione `arco`. Numerazione+impaginazione+orari+FIG: renderBlocchi.
      // Riga vuota solo all'incrocio Early→Late per reversed (classifica) e cerchio.
      return this.renderBlocchi(blocchi, reversedTriplet || isCerchio);
    }

    // MOTORE UNICO: ogni formato noto è gestito sopra (finale, ∩ giovanili/
    // trofei/patrocinate, cerchio/clessidra 54-72, sessioni-miste Prova). Se si
    // arriva qui il `garaNT` non è in COMPETITION_FORMATS: errore esplicito
    // (il vecchio flusso generate54/36HoleTableNew è stato rimosso).
    throw new Error(`Formato gara non riconosciuto per doppio tee: "${garaNT}". Aggiungerlo a COMPETITION_FORMATS (config.js).`);
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
            // escapeHtml: nomi da fonti esterne (federgolf/Excel) — audit J1
            return `<td class="text-center px-2 py-1 border border-gray-300" style="color: ${color}">${escapeHtml(player)}${btn}</td>`;
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
    generateTableHeader(doubleTee, modOverride) {
        // modOverride: usato dai giri con mod proprio (es. finale a coppie,
        // flight da 2) al posto del playersPerFlight di config.
        const mod = parseInt(modOverride) || parseInt(this.config.playersPerFlight);
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
                  <td style="${td} text-align:left;">${r.giocatori.map(escapeHtml).join('<br>')}</td>
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
     * l'altro. REGOLA UNIFORME: ogni blocco parte dal rank più ALTO (= peggior
     * classificato del blocco) e finisce col rank più BASSO (= miglior
     * classificato del blocco). Il leader del giro (rank 1 dell'ultimo blocco
     * presente) chiude sempre l'intero giro.
     *   Blocco 1 = Uomini back-half (rank halfM+1..N), gruppi in ordine
     *              DECRESCENTE di rank: il rank più alto N apre il blocco,
     *              il rank halfM+1 chiude il blocco;
     *   Blocco 2 = Uomini front-half (rank 1..halfM), gruppi in ordine
     *              DECRESCENTE di rank (leader uomini rank 1 a fine blocco);
     *   Blocco 3 = Donne (tutte), gruppi in ordine DECRESCENTE di rank
     *              (leader donne rank 1 a chiusura del giro). Assente nei
     *              giri 'men-only' (4° giro della Gara 72 buche).
     * Combinando Blocco 1 + Blocco 2 il campo uomini scorre con continuità
     * dal peggior classificato (rank N) al leader (rank 1).
     * Display intra-gruppo: rank alto a sinistra, rank basso a destra
     * (es. gruppo 28-30 → "30 29 28"). Riusa la stessa "logica dei quadranti"
     * dei giri normali ma applicata a un singolo tee.
     *
     * @param {string} round - 'prima', 'seconda' o 'finale'
     * @returns {string} HTML table content
     */
    generateSingleTee(round) {
        let mod = parseInt(this.config.playersPerFlight);
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
        // Giro finale "a coppie" (Prova di gioco 3°/4° giro): flight da
        // `coppie.mod` giocatori in classifica INVERSA, pausa extra ogni
        // `coppie.pausaOgni` match. Il mod del descrittore SOSTITUISCE il
        // playersPerFlight di config per questo giro.
        const coppie = roundDesc && roundDesc.coppie ? roundDesc.coppie : null;
        if (coppie) mod = parseInt(coppie.mod) || 2;

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
        // Nei giri a coppie lo stacco è quello del descrittore (Appendice F:
        // +5 min ogni `pausaOgni` match).
        const BLOCK_GAP = coppie ? (coppie.pausaExtra || '00:05') : '00:06';

        if (isFinal && coppie) {
            // ── GIRO FINALE A COPPIE (Prova di gioco 3°/4° giro) ──────────
            // Tee unico, sempre numerico: classifica INVERSA a flight da
            // `mod` (2). Il peggior classificato apre, i leader chiudono:
            // match 1 = 52·51 … match 26 = 2·1 (Appendice F). Display
            // intra-flight: rank alto a sinistra. Pausa extra di `pausaExtra`
            // ogni `pausaOgni` match, ma NON a ridosso della fine (Appendice F:
            // 26 match, pause solo dopo l'8° e il 16° — dopo il 24° i match
            // restanti sono ≤ pausaOgni e si prosegue senza stacco).
            const ranksM = range(1, playersFinal);
            allGroups = [];
            for (let i = ranksM.length - 1; i >= 0; i -= mod) {
                const group = [];
                for (let j = 0; j < mod && (i - j) >= 0; j++) group.push(ranksM[i - j]);
                allGroups.push({ players: group, category: 'M' });
            }
            const ogni = parseInt(coppie.pausaOgni) || 0;
            if (ogni > 0) {
                for (let i = ogni - 1; i < allGroups.length - 1; i += ogni) {
                    const restanti = allGroups.length - (i + 1);
                    if (restanti > ogni) blockBoundaries.add(i);
                }
            }

            // Striscia FIG: blocco unico in classifica inversa.
            this.figQuadranti = [];
            this.pushFigQuadrante('Uomini', 'Classifica inversa · Tee 1', allGroups);
        } else if (isFinal) {
            // ── GIRO FINALE per classifica (tee unico) — via MOTORE UNICO ──
            // Sempre numerico (ranks 1..N, N = qualificati dopo il taglio).
            // 3 blocchi nell'ordine di partenza: uomini back-half → uomini
            // front-half → donne. Ordine interno DECRESCENTE (per classifica:
            // rank alto a sinistra). Ordine dei GRUPPI dai PDF (54/72 buche
            // "3° GIRO PER CLASSIFICA TEE 1"):
            //   back-half  → gruppi CRESCENTI ([30,29,28],[33,32,31]…[54,53,52])
            //   front-half → gruppi DECRESCENTI ([27,26,25]…[3,2,1])
            //   donne      → gruppi DECRESCENTI
            // (Il back-half a gruppi crescenti era il bug B1: il codice li
            // produceva decrescenti, divergendo dal PDF.)
            const totalFlightsM = Math.ceil(playersFinal / mod);
            const frontFlightsM = Math.ceil(totalFlightsM / 2);
            const frontCountM = Math.min(frontFlightsM * mod, playersFinal);

            const buildSec = (categoria, lo, hi, groupOrder) =>
                this.renderQuadranti(
                    [{ categoria, tee: 1, lo, hi, internal: 'desc', groupOrder, source: null }],
                    mod
                );
            const blockMenBack  = buildSec('M', frontCountM + 1, playersFinal, 'asc');
            const blockMenFront = buildSec('M', 1, frontCountM, 'desc');
            const blockWomen    = proetteFinal > 0 ? buildSec('F', 1, proetteFinal, 'desc') : [];

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
            // Giri normali (prima/seconda) — tee unico
            const { atleti, atlete } = this.getPlayerArrays();

            // generatePlayerGroups usato SOLO per la striscia FIG (visualizzazione quadranti).
            // Per la tabella orari si usa il MOTORE UNICO (renderQuadranti, sotto).
            const maleGroupsForFig  = this.generatePlayerGroups(players, mod, atleti, 'M');
            const femaleGroupsForFig = proette > 0
                ? this.generatePlayerGroups(proette, mod, atlete, 'F') : [];

            // Striscia FIG
            this.figQuadranti = [];
            ['Q2', 'Q1', 'Q4', 'Q3'].forEach((q) => {
                this.pushFigQuadrante('Uomini', q, maleGroupsForFig.filter(g => g.quadrant === q));
            });
            ['Q2', 'Q1', 'Q4', 'Q3'].forEach((q) => {
                this.pushFigQuadrante('Donne', q, femaleGroupsForFig.filter(g => g.quadrant === q));
            });

            // Costruzione allGroups via MOTORE UNICO (renderQuadranti).
            // costruisciQuadrantiSingleTee decide le 4 sezioni e l'ordine
            // (uomini-alti → donne → uomini-bassi per schema B / 2° giro; invertito
            // al 1° giro). espandiSezione applica ordine interno CRESCENTE
            // (qualificazione = ordine di merito, vedi TEE UNICO.pdf) e mette il
            // twosome in testa alla sezione di apertura. Sostituisce
            // buildSingleTeeSection + l'assemblaggio manuale di allGroups.
            const quadranti = this.costruisciQuadrantiSingleTee(
                round, garaNT, players, proette, mod, atleti, atlete
            );
            allGroups = this.renderQuadranti(quadranti, mod);
        }

        // Build single tee table (mod può differire da config nei giri a coppie)
        let tableHTML = this.generateTableHeader(false, mod);
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
                // escapeHtml: nomi da fonti esterne (federgolf/Excel) — audit J1
                let cellContent = escapeHtml(player);
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
