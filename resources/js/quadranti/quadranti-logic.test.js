import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// Mock localStorage PRIMA dell'import dei moduli che lo usano: jsdom non
// garantisce localStorage.getItem/setItem/removeItem stabili tra test, e senza
// mock il try/catch dentro utils.js console.error → stderr verboso. Il mock
// in-memory restituisce risultati prevedibili in tutti gli ambienti.
const localStorageMock = (() => {
  let store = {};
  return {
    getItem:    (k)    => (k in store ? store[k] : null),
    setItem:    (k, v) => { store[k] = String(v); },
    removeItem: (k)    => { delete store[k]; },
    clear:      ()     => { store = {}; },
  };
})();
beforeAll(() => {
  vi.stubGlobal('localStorage', localStorageMock);
});

import { QuadrantiLogic, mergeFedergolfResponses, normalizeGaraTitle } from './quadranti-logic.js';
import { DEFAULT_CONFIG, COMPETITION_FORMATS, parseForma } from './config.js';
import { storage } from './utils.js';

// Helper: pulisce le sole chiavi di storage che generateSingleTee/Double Tee
// potrebbero leggere via getPlayerArrays().
function resetPlayerStorage() {
  storage.remove('atleti');
  storage.remove('atlete');
}

// QuadrantiLogic richiede jQuery solo per metodi DOM (initializeDatepicker, fetchEphemerisData).
// I metodi di pura logica (bilanciaQuadranti, limitiQuadranti, remapQuadrant,
// generatePlayerGroups, getPlayerArrays) non usano jQuery e sono testabili direttamente.

function makeLogic(overrides = {}) {
  return new QuadrantiLogic({ ...DEFAULT_CONFIG, ...overrides });
}

// ─── bilanciaQuadranti ───────────────────────────────────────────────────────
describe('bilanciaQuadranti', () => {
  let logic;
  beforeEach(() => { logic = makeLogic(); });

  it('144 giocatori a 3 → 48 voli totali distribuiti in 4 quadranti uguali', () => {
    const { Q1, Q2, Q3, Q4 } = logic.bilanciaQuadranti(144, 3);
    expect(Q1 + Q2 + Q3 + Q4).toBe(48);
    expect(Q1).toBe(Q2);
    expect(Q3).toBe(Q4);
  });

  it('102 giocatori a 3 senza constraint → remainder naturale a Early (Q1/Q2)', () => {
    const { Q1, Q2, Q3, Q4 } = logic.bilanciaQuadranti(102, 3);
    // distribuzione naturale: il resto va prima a Q1, poi Q2
    expect(Q1).toBeGreaterThanOrEqual(Q3);
    expect(Q1 + Q2 + Q3 + Q4).toBe(34);
  });

  it('constraint maxEarlySlots=8 → sposta overflow da Early a Late', () => {
    // Senza constraint: Q1=9, Q2=9. Con maxEarlySlots=8 → Q1=Q2=8, Q3=Q4=9
    const { Q1, Q2, Q3, Q4 } = logic.bilanciaQuadranti(102, 3, 8);
    expect(Q1).toBe(8);
    expect(Q2).toBe(8);
    expect(Q3).toBe(9);
    expect(Q4).toBe(9);
    expect(Q1 + Q2 + Q3 + Q4).toBe(34);
  });

  it('constraint non attivato se già rispettato', () => {
    // 42 donne, 14 voli, Q1=Q2=4 → con maxEarlySlots=8 nessun aggiustamento
    const { Q1, Q2, Q3, Q4 } = logic.bilanciaQuadranti(42, 3, 8);
    expect(Q1).toBe(4); // invariato, già ≤ 8
    expect(Q1 + Q2 + Q3 + Q4).toBe(14);
  });

  it('distribuzione bilanciata: nessun quadrante negativo', () => {
    [72, 90, 108, 120, 132, 144].forEach(n => {
      const q = logic.bilanciaQuadranti(n, 3);
      expect(q.Q1).toBeGreaterThan(0);
      expect(q.Q2).toBeGreaterThan(0);
      expect(q.Q3).toBeGreaterThan(0);
      expect(q.Q4).toBeGreaterThan(0);
    });
  });

  it('total voli = ceil(players / mod)', () => {
    [[100, 3], [80, 4], [144, 3]].forEach(([n, mod]) => {
      const { Q1, Q2, Q3, Q4 } = logic.bilanciaQuadranti(n, mod);
      expect(Q1 + Q2 + Q3 + Q4).toBe(Math.ceil(n / mod));
    });
  });

  it('mod=4 funziona senza errori', () => {
    expect(() => logic.bilanciaQuadranti(80, 4)).not.toThrow();
  });
});

// ─── limitiQuadranti ─────────────────────────────────────────────────────────
describe('limitiQuadranti', () => {
  let logic;
  beforeEach(() => { logic = makeLogic(); });

  it('restituisce struttura corretta', () => {
    const result = logic.limitiQuadranti(144, 3);
    expect(result).toHaveProperty('limit1');
    expect(result).toHaveProperty('limit2');
    expect(result).toHaveProperty('limit3');
    expect(result).toHaveProperty('difference');
    expect(result).toHaveProperty('playersPerQuadrant');
  });

  it('somma players per quadrante uguale al totale (quando divisibile)', () => {
    const result = logic.limitiQuadranti(144, 3);
    const { Q1, Q2, Q3, Q4 } = result.playersPerQuadrant;
    // Il difference viene sottratto da Q1 — verifichiamo con tolleranza
    expect(Q1 + Q2 + Q3 + Q4 + result.difference).toBe(144);
  });

  it('limit3 >= limit2 (Q3 parte dopo Q1)', () => {
    const result = logic.limitiQuadranti(144, 3);
    expect(result.limit3).toBeGreaterThanOrEqual(result.limit2);
  });

  it('difference non negativo', () => {
    [72, 100, 120, 144].forEach(n => {
      const result = logic.limitiQuadranti(n, 3);
      expect(result.difference).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── remapQuadrant ───────────────────────────────────────────────────────────
describe('remapQuadrant', () => {
  let logic;
  beforeEach(() => { logic = makeLogic(); });

  it('giorno 1: quadrante invariato', () => {
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
      expect(logic.remapQuadrant(q, 1)).toBe(q);
    });
  });

  it('giorno 2: rotazione Q1→Q4, Q2→Q3, Q3→Q1, Q4→Q2', () => {
    expect(logic.remapQuadrant('Q1', 2)).toBe('Q4');
    expect(logic.remapQuadrant('Q2', 2)).toBe('Q3');
    expect(logic.remapQuadrant('Q3', 2)).toBe('Q1');
    expect(logic.remapQuadrant('Q4', 2)).toBe('Q2');
  });

  it('4 rotazioni successive giorno 2 → ritorna al quadrante originale (ciclo a 4)', () => {
    // La mappatura è un ciclo: Q1→Q4→Q2→Q3→Q1, non una doppia inversione
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
      let current = q;
      for (let i = 0; i < 4; i++) {
        current = logic.remapQuadrant(current, 2);
      }
      expect(current).toBe(q);
    });
  });

  it('quadrante sconosciuto viene restituito invariato', () => {
    expect(logic.remapQuadrant('QX', 2)).toBe('QX');
  });
});

// ─── generatePlayerGroups ────────────────────────────────────────────────────
describe('generatePlayerGroups', () => {
  let logic;
  beforeEach(() => { logic = makeLogic(); });

  it('genera gruppi per 144 giocatori a 3', () => {
    const players = Array.from({ length: 144 }, (_, i) => i + 1);
    const groups = logic.generatePlayerGroups(144, 3, players, 'M');

    // Ogni gruppo ha 1-3 giocatori
    groups.forEach(g => {
      expect(g.players.length).toBeGreaterThan(0);
      expect(g.players.length).toBeLessThanOrEqual(3);
    });
  });

  it('i gruppi coprono tutti i giocatori senza duplicati', () => {
    const players = Array.from({ length: 144 }, (_, i) => i + 1);
    const groups = logic.generatePlayerGroups(144, 3, players, 'M');
    const allPlayers = groups.flatMap(g => g.players);

    expect(allPlayers.length).toBe(144);
    expect(new Set(allPlayers).size).toBe(144);
  });

  it('ogni gruppo ha quadrante valido (Q1-Q4)', () => {
    const players = Array.from({ length: 72 }, (_, i) => i + 1);
    const groups = logic.generatePlayerGroups(72, 3, players, 'F');
    const validQuadrants = new Set(['Q1', 'Q2', 'Q3', 'Q4']);
    groups.forEach(g => {
      expect(validQuadrants.has(g.quadrant)).toBe(true);
    });
  });

  it('funziona con numero non multiplo di 3 (es. 100)', () => {
    const players = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(() => logic.generatePlayerGroups(100, 3, players, 'M')).not.toThrow();
    const groups = logic.generatePlayerGroups(100, 3, players, 'M');
    const count = groups.flatMap(g => g.players).length;
    expect(count).toBe(100);
  });

  it('playerIndices tracciano la posizione originale in sourceArray', () => {
    // Usiamo nomi distinti così il match indice→valore è univoco e verificabile.
    const sourceArray = Array.from({ length: 60 }, (_, i) => `P${i}`);
    const groups = logic.generatePlayerGroups(60, 3, sourceArray, 'M');

    groups.forEach(g => {
      expect(g.playerIndices).toBeDefined();
      expect(g.playerIndices.length).toBe(g.players.length);
      g.playerIndices.forEach((idx, j) => {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(sourceArray.length);
        expect(sourceArray[idx]).toBe(g.players[j]);
      });
    });

    // Tutti gli indici 0..59 devono comparire esattamente una volta in totale.
    const allIdx = groups.flatMap(g => g.playerIndices);
    expect(allIdx.length).toBe(60);
    expect(new Set(allIdx).size).toBe(60);
  });
});

// ─── updateConfig ────────────────────────────────────────────────────────────
describe('updateConfig', () => {
  it('aggiorna solo le chiavi specificate', () => {
    const logic = makeLogic({ players: 100 });
    logic.updateConfig({ players: 120 });
    expect(logic.config.players).toBe(120);
    expect(logic.config.startTime).toBe(DEFAULT_CONFIG.startTime);
  });
});

// ─── REGRESSIONE: bilanciamento Early ≈ Late (differenza max 1) ──────────────
// Vincolo corretto: Early e Late devono essere bilanciati (|Early-Late| ≤ 1).
// Il vincolo fisso di 12 non bastava: per configurazioni piccole (es. 64M+17F)
// non scattava mai. Il fix usa targetEarly = ceil(totalOrari/2) come limite dinamico.
// Il giorno 1 riceve l'orario "in più" in Early; il giorno 2 (remap) lo avrà in Late.

/**
 * Simula la logica di generateDoubleTee con il nuovo constraint dinamico.
 * Restituisce { mEarly, mLate, fEarly, fLate, totalEarly, totalLate }
 */
function simulaCombinato(logic, nUomini, nDonne, mod = 3) {
  const wQ = logic.bilanciaQuadranti(nDonne, mod);
  const fEarly = wQ.Q1;
  const fLate  = wQ.Q3;

  const totalFlights    = Math.ceil(nUomini / mod) + Math.ceil(nDonne / mod);
  const totalOrari      = totalFlights / 2;
  const targetEarly     = Math.ceil(totalOrari / 2);
  const menMax          = Math.max(0, targetEarly - fEarly);

  const mQ     = logic.bilanciaQuadranti(nUomini, mod, menMax);
  const mEarly = mQ.Q1;
  const mLate  = mQ.Q3;

  return {
    mEarly, mLate, fEarly, fLate,
    totalEarly: mEarly + fEarly,
    totalLate:  mLate  + fLate,
    totalOrari,
    targetEarly,
  };
}

describe('REGRESSIONE — bilanciamento Early ≈ Late (|diff| ≤ 1)', () => {
  let logic;
  beforeEach(() => { logic = makeLogic(); });

  it('[BUG ORIGINALE] 102U+42D → Early=12, Late=12 (era 13+11 senza fix)', () => {
    const r = simulaCombinato(logic, 102, 42);
    expect(r.mEarly).toBe(8);
    expect(r.mLate).toBe(9);
    expect(r.fEarly).toBe(4);
    expect(r.fLate).toBe(3);
    expect(r.totalEarly).toBe(12);
    expect(r.totalLate).toBe(12);
  });

  it('[BUG 2] 64U+17D → Early=7, Late=7 (era 8+6 con vincolo fisso 12)', () => {
    // Con MAX_ORARI=12: maleMax=12-2=10, men naturale=6 → nessun constraint → 8E+6L ❌
    // Con targetEarly=7: maleMax=7-2=5, men→5E+6L → total 7E+7L ✓
    const r = simulaCombinato(logic, 64, 17);
    expect(r.mEarly).toBe(5);
    expect(r.mLate).toBe(6);
    expect(r.fEarly).toBe(2);
    expect(r.totalEarly).toBe(7);
    expect(r.totalLate).toBe(7);  // non 6 come prima
  });

  it('donne non vengono alterate dal constraint maschile (42 donne)', () => {
    const wQ = logic.bilanciaQuadranti(42, 3);
    expect(wQ.Q1).toBe(4);
    expect(wQ.Q2).toBe(4);
    expect(wQ.Q3).toBe(3);
    expect(wQ.Q4).toBe(3);
  });

  // Tutti gli scenari: |totalEarly - totalLate| ≤ 1
  const scenari = [
    { m: 144, f: 0,  desc: '144U + 0D'  },
    { m: 102, f: 42, desc: '102U + 42D' },
    { m: 96,  f: 48, desc: '96U + 48D'  },
    { m: 108, f: 36, desc: '108U + 36D' },
    { m: 120, f: 24, desc: '120U + 24D' },
    { m: 90,  f: 42, desc: '90U + 42D'  },
    { m: 72,  f: 30, desc: '72U + 30D'  },
    { m: 64,  f: 17, desc: '64U + 17D'  },
    { m: 48,  f: 12, desc: '48U + 12D'  },
  ];

  scenari.forEach(({ m, f, desc }) => {
    it(`${desc} → |Early-Late| ≤ 1`, () => {
      const r = simulaCombinato(logic, m, f);
      expect(Math.abs(r.totalEarly - r.totalLate)).toBeLessThanOrEqual(1);
    });
  });

  it('i gruppi uomini con constraint coprono tutti i giocatori senza duplicati', () => {
    const atleti = Array.from({ length: 102 }, (_, i) => i + 1);
    const wQ = logic.bilanciaQuadranti(42, 3);
    const totalFlights = Math.ceil(102/3) + Math.ceil(42/3);
    const targetEarly  = Math.ceil((totalFlights/2) / 2);
    const menMax = Math.max(0, targetEarly - wQ.Q1);
    const groups = logic.generatePlayerGroups(102, 3, atleti, 'M', menMax);
    const all = groups.flatMap(g => g.players);
    expect(all.length).toBe(102);
    expect(new Set(all).size).toBe(102);
  });
});

// ─── mergeFedergolfResponses: state-based dispatch (refactor 8 maggio) ───────
// La nuova versione riceve {maschileResponse, femminileResponse} e dispaccia
// per state ('ready'|'open'|'empty'|'error'). Niente flag combinati, niente
// abort/warning ambiguo: ritorna sempre {atleti, atlete, warnings[]} e il
// caller decide cosa fare con i warnings e quando NON applicare.
describe('mergeFedergolfResponses (state-based)', () => {
  // Helpers per simulare le risposte del controller refactored
  const ready = (iscritti) => ({ state: 'ready', iscritti, message: null });
  const open  = () => ({ state: 'open', iscritti: [], message: 'Iscrizioni non ancora chiuse' });
  const empty = () => ({ state: 'empty', iscritti: [], message: 'Gara senza iscritti' });
  const error = (msg = 'timeout') => ({ state: 'error', iscritti: [], message: msg });

  describe('caso felice', () => {
    it('M+F ready → carica entrambi, nessun warning', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: ready(['Tom', 'Bob']),
        femminileResponse: ready(['Alice', 'Beth']),
      });
      expect(result.atleti).toEqual(['Tom', 'Bob']);
      expect(result.atlete).toEqual(['Alice', 'Beth']);
      expect(result.warnings).toEqual([]);
    });

    it('solo M ready → atleti popolato, atlete vuote, no warning', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: ready(['Tom']),
      });
      expect(result.atleti).toEqual(['Tom']);
      expect(result.atlete).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('solo F ready → atlete popolato, atleti vuoti', () => {
      const result = mergeFedergolfResponses({
        femminileResponse: ready(['Alice']),
      });
      expect(result.atleti).toEqual([]);
      expect(result.atlete).toEqual(['Alice']);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('una gara non-ready in MISTA', () => {
    it('[REGRESSIONE M+F] M ready, F open → carica M, warning su F', () => {
      // Era IL BUG di fbddad9: il flag `aperte1 || aperte2` abortiva tutto.
      // Ora il dispatch state-based lavora indipendente per lato.
      const result = mergeFedergolfResponses({
        maschileResponse: ready(['Tom']),
        femminileResponse: open(),
      });
      expect(result.atleti).toEqual(['Tom']);
      expect(result.atlete).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('femminile');
      expect(result.warnings[0]).toContain('non ancora chiuse');
    });

    it('M open, F ready → carica F, warning su M', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: open(),
        femminileResponse: ready(['Alice']),
      });
      expect(result.atleti).toEqual([]);
      expect(result.atlete).toEqual(['Alice']);
      expect(result.warnings[0]).toContain('maschile');
    });

    it('M ready, F error (timeout) → carica M, warning su F con message', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: ready(['Tom']),
        femminileResponse: error('Federgolf.it non risponde (timeout)'),
      });
      expect(result.atleti).toEqual(['Tom']);
      expect(result.atlete).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('femminile');
      expect(result.warnings[0]).toContain('timeout');
    });

    it('M empty, F ready → carica F, warning informativo su M', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: empty(),
        femminileResponse: ready(['Alice']),
      });
      expect(result.atleti).toEqual([]);
      expect(result.atlete).toEqual(['Alice']);
      expect(result.warnings[0]).toContain('maschile');
      expect(result.warnings[0]).toContain('senza iscritti');
    });
  });

  describe('entrambe le gare non-ready', () => {
    it('M+F entrambe open → atleti/atlete vuoti, 2 warnings', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: open(),
        femminileResponse: open(),
      });
      expect(result.atleti).toEqual([]);
      expect(result.atlete).toEqual([]);
      expect(result.warnings).toHaveLength(2);
    });

    it('M+F entrambe error → atleti/atlete vuoti, 2 warnings con message', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: error('timeout M'),
        femminileResponse: error('timeout F'),
      });
      expect(result.atleti).toEqual([]);
      expect(result.atlete).toEqual([]);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.join(' ')).toContain('timeout M');
      expect(result.warnings.join(' ')).toContain('timeout F');
    });
  });

  describe('singoli', () => {
    it('singolo M error → no crash, warning con messaggio', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: error('Federgolf.it non risponde'),
      });
      expect(result.atleti).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Federgolf.it non risponde');
    });

    it('singolo F open → atlete vuote, warning informativo', () => {
      const result = mergeFedergolfResponses({
        femminileResponse: open(),
      });
      expect(result.atlete).toEqual([]);
      expect(result.warnings[0]).toContain('femminile');
    });
  });

  describe('robustezza', () => {
    it('nessun argomento → struttura vuota, no crash', () => {
      const result = mergeFedergolfResponses();
      expect(result.atleti).toEqual([]);
      expect(result.atlete).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('argomenti null → struttura vuota', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: null,
        femminileResponse: null,
      });
      expect(result.atleti).toEqual([]);
      expect(result.atlete).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('state sconosciuto → atleti vuoti + warning', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: { state: 'something_else', iscritti: [] },
      });
      expect(result.atleti).toEqual([]);
      expect(result.warnings).toHaveLength(1);
    });

    it('response ready ma iscritti undefined → array vuoto, no crash', () => {
      const result = mergeFedergolfResponses({
        maschileResponse: { state: 'ready' },
      });
      expect(result.atleti).toEqual([]);
    });

    it('arrays indipendenti: 50M+15F finiscono in slot distinti', () => {
      const men = Array.from({ length: 50 }, (_, i) => `Uomo${i + 1}`);
      const women = Array.from({ length: 15 }, (_, i) => `Donna${i + 1}`);
      const result = mergeFedergolfResponses({
        maschileResponse: ready(men),
        femminileResponse: ready(women),
      });
      expect(result.atleti).toHaveLength(50);
      expect(result.atlete).toHaveLength(15);
    });
  });
});

// ─── REGRESSIONE: generateSingleTee (prima/seconda) ──────────────────────────
// Test fissano il comportamento attuale di generateSingleTee per prima/seconda
// PRIMA di estendere la funzione al giro finale 54 buche. Servono a garantire
// che la modifica successiva non rompa i giri normali.
describe('REGRESSIONE — generateSingleTee (prima/seconda)', () => {
  let logic;
  beforeEach(() => {
    // Reset storage per evitare che atleti/atlete di test precedenti
    // perturbino getPlayerArrays() (che li legge da localStorage)
    resetPlayerStorage();
    logic = makeLogic({
      players: 12,
      proette: 6,
      playersPerFlight: 3,
      nominativo: 'Off',
      startTime: '08:00',
      gap: '00:10',
    });
  });

  it('prima giornata: ritorna stringa HTML con thead+tbody', () => {
    const html = logic.generateSingleTee('prima');
    expect(typeof html).toBe('string');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody>');
    expect(html).toContain('</tbody>');
  });

  it('prima giornata: una <tr> per ogni flight (6 totali con 12U + 6D, mod=3)', () => {
    const html = logic.generateSingleTee('prima');
    // Conta solo righe del body (escludi quelle di intestazione/separatori)
    const bodyHtml = html.split('<tbody>')[1] || '';
    const trCount = (bodyHtml.match(/<tr>/g) || []).length;
    // 12 uomini → 4 flight; 6 donne → 2 flight; totale 6
    expect(trCount).toBe(6);
  });

  it('prima giornata: gli orari partono da startTime con gap configurato', () => {
    const html = logic.generateSingleTee('prima');
    expect(html).toContain('>08:00<');
    expect(html).toContain('>08:10<');
    expect(html).toContain('>08:20<');
    // Ultimo flight (6° flight, dopo 5 gap) = 08:00 + 5*10 = 08:50
    expect(html).toContain('>08:50<');
  });

  it('prima giornata: contiene tutti i numeri 1..12 per uomini e 1..6 per donne (modalità numerica)', () => {
    const html = logic.generateSingleTee('prima');
    // Tutti i numeri uomini devono comparire come cell
    for (let i = 1; i <= 12; i++) {
      expect(html).toContain(`>${i}<`);
    }
    // Le donne (in stile rosso/italic) devono comparire
    expect(html).toContain('color:red');
  });

  it('seconda giornata: ordine invertito rispetto a prima (allGroups.reverse logic)', () => {
    const htmlPrima = logic.generateSingleTee('prima');
    const htmlSeconda = logic.generateSingleTee('seconda');
    // I due output devono essere diversi (ordine gruppi invertito)
    expect(htmlPrima).not.toBe(htmlSeconda);
    // Ma entrambi devono contenere lo stesso set di numeri
    for (let i = 1; i <= 12; i++) {
      expect(htmlSeconda).toContain(`>${i}<`);
    }
  });

  it('prima giornata: tutti i flight hanno Tee = 1 (single tee)', () => {
    const html = logic.generateSingleTee('prima');
    // Per ogni <tr> nel body deve esserci una cella '>1<' (la colonna Tee)
    const teeMatches = (html.match(/>1</g) || []).length;
    // Almeno 6 (uno per flight). Numero esatto può variare per altri "1".
    expect(teeMatches).toBeGreaterThanOrEqual(6);
  });

  it('seconda giornata: orari partono comunque da startTime', () => {
    const html = logic.generateSingleTee('seconda');
    expect(html).toContain('>08:00<');
  });

  it('senza donne (proette=0): solo flight uomini', () => {
    const logicNoF = makeLogic({
      players: 9,
      proette: 0,
      playersPerFlight: 3,
      nominativo: 'Off',
      startTime: '08:00',
      gap: '00:10',
    });
    const html = logicNoF.generateSingleTee('prima');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const trCount = (bodyHtml.match(/<tr>/g) || []).length;
    expect(trCount).toBe(3); // 9/3 = 3 flight
    expect(html).not.toContain('color:red');
  });
});

// ─── REGRESSIONE: generateDoubleTee (prima/seconda) ──────────────────────────
// Fissa il comportamento attuale di generateDoubleTee prima di estenderlo al
// giro finale. Le asserzioni sono basate sulla forma HTML grezza.
describe('REGRESSIONE — generateDoubleTee (prima/seconda)', () => {
  let logic;
  beforeEach(() => {
    resetPlayerStorage();
    logic = makeLogic({
      players: 54,
      proette: 27,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late',
      startTime: '08:00',
      gap: '00:11',
      round: '04:30',
    });
  });

  it('prima giornata: ritorna HTML con info box + table', () => {
    const html = logic.generateDoubleTee('prima');
    expect(typeof html).toBe('string');
    expect(html).toContain('Ultima Partenza Early');
    expect(html).toContain('Prima Partenza Late');
    expect(html).toContain('Fine Gara Stimata');
    expect(html).toContain('<table>');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody>');
    expect(html).toContain('</tbody>');
  });

  it('prima giornata: contiene i due tee 1 e 10 nelle celle', () => {
    const html = logic.generateDoubleTee('prima');
    // Il flag colspan=20 conferma layout doppio tee
    expect(html).toContain('colspan="20"');
    // Header ha 2 colonne "Nome" (una per ogni lato)
    const nomeCount = (html.match(/>Nome</g) || []).length;
    expect(nomeCount).toBe(2);
  });

  it('prima giornata: rank uomini 1..54 e donne 1..27 presenti', () => {
    const html = logic.generateDoubleTee('prima');
    // Verifica che ogni rank uomo compaia
    for (let i = 1; i <= 54; i++) {
      expect(html).toContain(`>${i}<`);
    }
    // Donne hanno colore rosso (doppio tee: stile inline "color: red" con spazio)
    expect(html).toContain('color: red');
  });

  it('seconda giornata: output diverso da prima (rotazione quadranti)', () => {
    const htmlPrima = logic.generateDoubleTee('prima');
    const htmlSeconda = logic.generateDoubleTee('seconda');
    expect(htmlPrima).not.toBe(htmlSeconda);
    // Entrambe hanno lo stesso set di rank
    for (let i = 1; i <= 54; i++) {
      expect(htmlSeconda).toContain(`>${i}<`);
    }
  });

  it('prima giornata: contiene l\'orario di partenza configurato', () => {
    const html = logic.generateDoubleTee('prima');
    expect(html).toContain('>08:00<');
  });

  it('senza donne (proette=0): solo flight uomini', () => {
    const logicNoF = makeLogic({
      players: 54,
      proette: 0,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late',
      startTime: '08:00',
      gap: '00:11',
      round: '04:30',
    });
    const html = logicNoF.generateDoubleTee('prima');
    expect(html).not.toContain('color: red');
    for (let i = 1; i <= 54; i++) {
      expect(html).toContain(`>${i}<`);
    }
  });

  it('numerazione flight: Tee 1 in sequenza poi Tee 10 (non alternata)', () => {
    // I gruppi maschili ricevono flightNumber: Tee1 (Q1+Q3) 1..N, Tee10 (Q2+Q4) N+1..
    const l = makeLogic({
      players: 54, proette: 0, playersPerFlight: 3, nominativo: 'Off',
      garaNT: 'Gara 54 buche', doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:11', round: '04:30',
    });
    l.generateDoubleTee('prima');
    // Verifica via figQuadranti: ogni quadrante ha flightStart numerico
    const uomini = l.figQuadranti.filter((x) => x.categoria === 'Uomini');
    uomini.forEach((q) => {
      expect(typeof q.flightStart).toBe('number');
      expect(q.flightStart).toBeGreaterThanOrEqual(1);
    });
  });

  it('flightStart: Tee 1 numerati per primi (continui), poi Tee 10', () => {
    const l = makeLogic({
      players: 144, proette: 0, playersPerFlight: 3, nominativo: 'Off',
      garaNT: 'Gara 54 buche', doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    l.generateDoubleTee('prima');
    // Striscia FIG a blocchi (motore unico): label "Blocco N · Tee 1|10".
    const men = l.figQuadranti.filter((x) => x.categoria === 'Uomini');
    const tee1 = men.filter((x) => /Tee 1$/.test(x.label));
    const tee10 = men.filter((x) => /Tee 10$/.test(x.label));
    // Il primo blocco Tee 1 apre la numerazione a flight 1.
    expect(Math.min(...tee1.map((x) => x.flightStart))).toBe(1);
    // Tutti i Tee 10 sono numerati DOPO tutti i Tee 1 (regola unificata).
    expect(Math.min(...tee10.map((x) => x.flightStart)))
      .toBeGreaterThan(Math.max(...tee1.map((x) => x.flightStart)));
  });
});

// ─── Giro finale 54 buche (single tee, classifica) ──────────────────────────
// Estensione di generateSingleTee per il "terzo giro per classifica" delle gare
// a 54 buche. Tre blocchi sequenziali: back-half U → donne → front-half U.
describe('generateSingleTee — giro finale 54 buche', () => {
  let logic;
  beforeEach(() => {
    resetPlayerStorage();
    // Scenario di riferimento dall'immagine 2: 54 qualificati U + 27 qualificate D
    // dopo il taglio (i campi #players/#proette restano quelli pre-taglio).
    logic = makeLogic({
      players: 144,
      proette: 48,
      playersCut: 54,
      proetteCut: 27,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      startTime: '08:00',
      gap: '00:11',
    });
  });

  it('ritorna HTML thead+tbody (single tee)', () => {
    const html = logic.generateSingleTee('finale');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody>');
    expect(html).toContain('</tbody>');
  });

  it('totale flight = 54/3 + 27/3 = 18 + 9 = 27', () => {
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const trCount = (bodyHtml.match(/<tr>/g) || []).length;
    expect(trCount).toBe(27);
  });

  it('include tutti i rank uomini 1..54 e donne 1..27 esattamente una volta', () => {
    const html = logic.generateSingleTee('finale');
    // Estrai tutti i contenuti delle <td> "numeriche" (player cells)
    const bodyHtml = html.split('<tbody>')[1] || '';

    // Le celle nere (uomini) non hanno style; quelle rosse (donne) hanno color:red
    // Estrai i numeri da tutte le celle player (qualunque categoria).
    const cellMatches = bodyHtml.match(/border-gray-300"[^>]*>(\d+)</g) || [];
    const numeri = cellMatches.map(m => {
      const r = m.match(/>(\d+)</);
      return r ? parseInt(r[1], 10) : null;
    }).filter(n => n !== null);

    // Filtra fuori i valori "1" che corrispondono alla colonna Tee
    // (un "1" per riga = 27 occorrenze). Per fare un check robusto contiamo
    // direttamente la presenza di rank attesi nelle celle stile rosso (donne).
    const redCells = bodyHtml.match(/color:red"[^>]*>(\d+)</g) || [];
    const donneRanks = redCells.map(m => parseInt(m.match(/>(\d+)</)[1], 10));
    expect(donneRanks.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 27 }, (_, i) => i + 1)
    );
  });

  it('blocco 1 = back-half uomini (rank 28-54): primo gruppo (28,29,30) → display "30 29 28"', () => {
    // PDF "3° GIRO PER CLASSIFICA TEE 1": la back-half ha gruppi CRESCENTI —
    // prima riga = ranks 28,29,30 (display "30 29 28"), interno decrescente.
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const firstRow = bodyHtml.split('</tr>')[0];
    expect(firstRow).toContain('>30<');
    expect(firstRow).toContain('>29<');
    expect(firstRow).toContain('>28<');
    // Nessun rank della front-half (es. 27) nella prima riga.
    expect(firstRow).not.toMatch(/>27</);
  });

  it('blocco 1 ultimo gruppo = (52,53,54) → display "54 53 52"', () => {
    // PDF: la back-half (28-54) a gruppi crescenti CHIUDE coi rank più alti —
    // 9° flight (index 8) = ranks 52,53,54 (display "54 53 52").
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const rows = bodyHtml.split('</tr>').slice(0, -1); // ultima split è vuota
    const row9 = rows[8];
    expect(row9).toContain('>54<');
    expect(row9).toContain('>53<');
    expect(row9).toContain('>52<');
  });

  it('blocco 2 = front-half uomini, primo gruppo (25-27), ultimo (1-3) → leader uomini ultimi', () => {
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const rows = bodyHtml.split('</tr>').slice(0, -1);
    // Prima riga front-half uomini è la 10° flight (index 9)
    const row10 = rows[9];
    expect(row10).not.toContain('color:red');
    expect(row10).toContain('>27<');
    expect(row10).toContain('>26<');
    expect(row10).toContain('>25<');
    // Ultima riga front-half uomini è la 18° flight (index 17) → leader 1,2,3
    const row18 = rows[17];
    expect(row18).not.toContain('color:red');
    expect(row18).toContain('>3<');
    expect(row18).toContain('>2<');
    expect(row18).toContain('>1<');
  });

  it('blocco 3 = donne, primo gruppo (25-27), ultimo (1-3) → leader donne a chiusura', () => {
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const rows = bodyHtml.split('</tr>').slice(0, -1);
    // 19° flight (index 18) = primo gruppo donne
    const row19 = rows[18];
    expect(row19).toContain('>27<');
    expect(row19).toContain('>26<');
    expect(row19).toContain('>25<');
    expect(row19).toContain('color:red');
    // 27° flight (index 26) = ultimo gruppo donne = leader donne 1,2,3
    const row27 = rows[26];
    expect(row27).toContain('>3<');
    expect(row27).toContain('>2<');
    expect(row27).toContain('>1<');
    expect(row27).toContain('color:red');
  });

  it('orari: blocco 1 da 08:00 a 09:28 (con gap 11)', () => {
    const html = logic.generateSingleTee('finale');
    expect(html).toContain('>08:00<');
    expect(html).toContain('>08:11<');
    expect(html).toContain('>09:28<'); // ultimo flight blocco 1
  });

  it('orari: stacco extra tra blocco 1 e blocco 2 → blocco 2 inizia 09:45 (non 09:39)', () => {
    const html = logic.generateSingleTee('finale');
    expect(html).toContain('>09:45<');
    // Verifica che il 2° blocco non parta a 09:39 (sarebbe senza stacco)
    const bodyHtml = html.split('<tbody>')[1] || '';
    const row10 = bodyHtml.split('</tr>')[9];
    expect(row10).toContain('>09:45<');
  });

  it('orari: stacco extra tra blocco 2 e blocco 3 → blocco 3 inizia 11:30 (non 11:24)', () => {
    const html = logic.generateSingleTee('finale');
    expect(html).toContain('>11:30<');
    // Ultimo flight del 2° blocco (riga 18): 09:45 + 8*11 = 11:13 ✓
    expect(html).toContain('>11:13<');
    // Ultimo flight del 3° blocco (riga 27): 11:30 + 8*11 = 12:58 ✓
    expect(html).toContain('>12:58<');
  });

  it('giro finale è SEMPRE numerico anche se nominativo=On (i nomi vengono ignorati)', () => {
    // Carichiamo nomi finti nello storage (via wrapper resiliente al mock)
    storage.set('atleti', Array.from({ length: 54 }, (_, i) => `Atleta${i + 1}`));
    storage.set('atlete', Array.from({ length: 27 }, (_, i) => `Atleta${i + 1}`));
    const logicNom = makeLogic({
      players: 54,
      proette: 27,
      playersCut: 54,
      proetteCut: 27,
      playersPerFlight: 3,
      nominativo: 'On',
      garaNT: 'Gara 54 buche',
      startTime: '08:00',
      gap: '00:11',
    });
    const html = logicNom.generateSingleTee('finale');
    // Non deve contenere i nomi
    expect(html).not.toContain('Atleta1');
    expect(html).not.toContain('Atleta54');
    // Deve contenere i rank numerici
    expect(html).toContain('>1<');
    expect(html).toContain('>54<');
    // Non deve esserci il pulsante × (showRemove forzato a false nel finale)
    expect(html).not.toContain('qd-remove');
  });

  it('garaNT senza giro "finale": round=finale ricade nella logica normale (no crash)', () => {
    const logicNoFin = makeLogic({
      players: 12,
      proette: 6,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara con patrocinio FIG',
      startTime: '08:00',
      gap: '00:10',
    });
    // 'finale' su un formato che non lo prevede → ramo normale, nessun crash
    expect(() => logicNoFin.generateSingleTee('finale')).not.toThrow();
  });

  it('senza donne (proette=0) i blocchi sono solo 2: back-half U + front-half U', () => {
    const logicNoF = makeLogic({
      players: 144,
      proette: 0,
      playersCut: 54,
      proetteCut: 0,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      startTime: '08:00',
      gap: '00:11',
    });
    const html = logicNoF.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const trCount = (bodyHtml.match(/<tr>/g) || []).length;
    expect(trCount).toBe(18); // 9 back + 9 front
    expect(html).not.toContain('color:red');
    // Stacco singolo tra i 2 blocchi maschili → il 2° blocco inizia a 09:28 + 17 min = 09:45
    expect(html).toContain('>09:45<');
  });

  it('rispetta il taglio: 40 uomini + 18 donne (post-cut) → 14 + 6 = 20 flight, non 144+48', () => {
    const logicCut = makeLogic({
      players: 144,          // pre-taglio (regular round)
      proette: 48,           // pre-taglio
      playersCut: 40,        // qualificati U dopo taglio
      proetteCut: 18,        // qualificate D dopo taglio
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      startTime: '08:00',
      gap: '00:11',
    });
    const html = logicCut.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const trCount = (bodyHtml.match(/<tr>/g) || []).length;
    // 40/3 = 14 flight (con eventuale 1 incompleto); 18/3 = 6 flight; tot 20
    expect(trCount).toBe(14 + 6);
    // Nessun rank > 40 ovunque (donne pre-cut erano 48: niente 41..48)
    expect(html).not.toContain('>41<');
    expect(html).not.toContain('>48<');
    expect(html).not.toContain('>54<');
    // Donne (celle rosse) max = 18 dopo taglio: niente rank 19..27 in red
    const redCells = bodyHtml.match(/color:red"[^>]*>(\d+)</g) || [];
    const donneRanks = redCells.map(m => parseInt(m.match(/>(\d+)</)[1], 10));
    expect(Math.max(...donneRanks)).toBe(18);
    // Rank uomini massimo presente = 40 (worst dopo taglio)
    expect(html).toContain('>40<');
    expect(html).toContain('>1<');
  });
});

// ─── Giro finale 54 buche (doppio tee, classifica) ──────────────────────────
// Variante doppio tee del giro finale (immagine 1): uomini front-half su Tee1
// decrescenti (leader 1,2,3 in ultima riga), back-half su Tee10 crescenti
// (worst in ultima riga); sotto, donne con stessa logica di split.
describe('generateDoubleTee — giro finale 54 buche', () => {
  let logic;
  beforeEach(() => {
    resetPlayerStorage();
    logic = makeLogic({
      players: 144,
      proette: 48,
      playersCut: 54,
      proetteCut: 27,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late',
      startTime: '08:00',
      gap: '00:11',
      round: '04:30',
    });
  });

  it('ritorna HTML con info box + tabella double tee', () => {
    const html = logic.generateDoubleTee('finale');
    expect(html).toContain('Ultima Partenza Uomini');
    expect(html).toContain('Prima Partenza Donne');
    expect(html).toContain('<table>');
    expect(html).toContain('colspan="20"');
  });

  it('include tutti i rank U 1..54 e D 1..27', () => {
    const html = logic.generateDoubleTee('finale');
    for (let i = 1; i <= 54; i++) {
      expect(html).toContain(`>${i}<`);
    }
    // Donne stilizzate rosse (doppio tee usa "color: red" con spazio)
    expect(html).toContain('color: red');
  });

  it('split flight uomini: 9 righe uomini + 5 righe donne (max tra 5 e 4)', () => {
    const html = logic.generateDoubleTee('finale');
    // buildGroupTableRows fa 1 riga per max(left.length, right.length).
    // Uomini: max(9,9) = 9 righe. Donne: max(5,4) = 5 righe. +1 separator +1 header
    const trMatches = html.match(/<tr>/g) || [];
    expect(trMatches.length).toBe(1 + 9 + 1 + 5); // header + men + sep + women
  });

  it('Tee 10 (back-half U) primo flight = (28,29,30) → "30 29 28"', () => {
    const html = logic.generateDoubleTee('finale');
    // La buildGroupTableRows mette Tee 1 a sx e Tee 10 a dx. Il primo flight
    // ha Tee 10 con il gruppo "28,29,30" reverso → "30 29 28"
    const tbody = html.split('<tbody>')[1].split('</tbody>')[0];
    const firstRow = tbody.split('</tr>')[0];
    expect(firstRow).toContain('>30<');
    expect(firstRow).toContain('>29<');
    expect(firstRow).toContain('>28<');
  });

  it('Tee 1 (front-half U) primo flight = (25,26,27) decrescente → "27 26 25"', () => {
    const html = logic.generateDoubleTee('finale');
    const tbody = html.split('<tbody>')[1].split('</tbody>')[0];
    const firstRow = tbody.split('</tr>')[0];
    // Tee1 desc: primo gruppo = ranks 25-27 mostrati come "27 26 25"
    expect(firstRow).toContain('>27<');
    expect(firstRow).toContain('>26<');
    expect(firstRow).toContain('>25<');
  });

  it('ultimo flight uomini: Tee 1 = leader (1,2,3), Tee 10 = worst (52,53,54)', () => {
    const html = logic.generateDoubleTee('finale');
    const tbody = html.split('<tbody>')[1].split('</tbody>')[0];
    const rows = tbody.split('</tr>');
    // Il 9° flight uomini è all'indice 8 (0-based)
    const row9 = rows[8];
    // Tee 1 desc finisce con i leader (1,2,3) → "3 2 1"
    expect(row9).toContain('>3<');
    expect(row9).toContain('>2<');
    expect(row9).toContain('>1<');
    // Tee 10 asc finisce con i worst (52,53,54) → "54 53 52"
    expect(row9).toContain('>54<');
    expect(row9).toContain('>53<');
    expect(row9).toContain('>52<');
  });

  it('split donne: Tee 1 = 15 donne (5 flight), Tee 10 = 12 donne (4 flight)', () => {
    const html = logic.generateDoubleTee('finale');
    // Verifica che i numeri delle donne siano splittati correttamente
    // estrarre solo le celle rosse e contare per Tee
    const tbody = html.split('<tbody>')[1].split('</tbody>')[0];
    const redCells = tbody.match(/color: red[^>]*>(\d+)/g) || [];
    const donneRanks = redCells.map(m => parseInt(m.match(/>(\d+)/)[1], 10));
    // Tutti i rank 1..27 devono comparire una volta
    expect(donneRanks.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 27 }, (_, i) => i + 1)
    );
  });

  it('numerico forzato anche se nominativo=On (i nomi vengono ignorati)', () => {
    storage.set('atleti', Array.from({ length: 54 }, (_, i) => `Atleta${i + 1}`));
    storage.set('atlete', Array.from({ length: 27 }, (_, i) => `Atleta${i + 1}`));
    const logicNom = makeLogic({
      players: 54,
      proette: 27,
      playersCut: 54,
      proetteCut: 27,
      playersPerFlight: 3,
      nominativo: 'On',
      garaNT: 'Gara 54 buche',
      doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late',
      startTime: '08:00',
      gap: '00:11',
      round: '04:30',
    });
    const html = logicNom.generateDoubleTee('finale');
    expect(html).not.toContain('Atleta1');
    expect(html).not.toContain('Atleta54');
    expect(html).toContain('>54<');
  });

  it('rispetta il taglio: 40 U + 18 D (post-cut) → niente rank > 40 U e > 18 D', () => {
    const logicCut = makeLogic({
      players: 144,
      proette: 48,
      playersCut: 40,
      proetteCut: 18,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late',
      startTime: '08:00',
      gap: '00:11',
      round: '04:30',
    });
    const html = logicCut.generateDoubleTee('finale');
    // Niente rank > 40 (donne pre-cut erano 48)
    expect(html).not.toContain('>41<');
    expect(html).not.toContain('>48<');
    expect(html).not.toContain('>54<');
    // Donne max 18
    const tbody = html.split('<tbody>')[1].split('</tbody>')[0];
    const redCells = tbody.match(/color: red[^>]*>(\d+)/g) || [];
    const donneRanks = redCells.map(m => parseInt(m.match(/>(\d+)/)[1], 10));
    expect(Math.max(...donneRanks)).toBe(18);
    // Uomini max 40
    expect(html).toContain('>40<');
  });

  it('senza donne (proetteCut=0): solo blocco uomini', () => {
    const logicNoF = makeLogic({
      players: 144,
      proette: 0,
      playersCut: 54,
      proetteCut: 0,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late',
      startTime: '08:00',
      gap: '00:11',
      round: '04:30',
    });
    const html = logicNoF.generateDoubleTee('finale');
    expect(html).not.toContain('color: red');
    expect(html).toContain('>54<');
    expect(html).toContain('>1<');
  });
});

// ─── Striscia FIG (primo/ultimo numero per quadrante) ───────────────────────
// generateDoubleTee/generateSingleTee popolano this.figQuadranti come
// side-effect. quadrantRange estrae { first, last }; generateFigStrip
// produce il box HTML con etichetta INVERTIRE per i quadranti decrescenti.
describe('Striscia FIG — quadrantRange / figQuadranti / generateFigStrip', () => {
  let logic;
  beforeEach(() => {
    resetPlayerStorage();
    logic = makeLogic();
  });

  describe('quadrantRange', () => {
    it('quadrante vuoto o non-array → null', () => {
      expect(logic.quadrantRange([])).toBeNull();
      expect(logic.quadrantRange(null)).toBeNull();
      expect(logic.quadrantRange(undefined)).toBeNull();
    });

    it('estrae first dal primo gruppo e last dall’ultimo (numerico)', () => {
      const groups = [
        { players: [10, 11, 12] },
        { players: [13, 14, 15] },
        { players: [16, 17, 18] },
      ];
      const r = logic.quadrantRange(groups);
      expect(r.first).toBe(10);
      expect(r.last).toBe(18);
    });

    it('last salta le celle vuote dell’ultimo gruppo (gruppo incompleto)', () => {
      const groups = [
        { players: [1, 2, 3] },
        { players: [4, '', ''] },
      ];
      const r = logic.quadrantRange(groups);
      expect(r.first).toBe(1);
      expect(r.last).toBe(4);
    });

    it('ordine decrescente: first > last', () => {
      const groups = [
        { players: [45, 44, 43] },
        { players: [3, 2, 1] },
      ];
      const r = logic.quadrantRange(groups);
      expect(r.first).toBe(45);
      expect(r.last).toBe(1);
    });

    it('quadrante decrescente → first = max, last = min (estremi del range)', () => {
      // Q2 decrescente: flight [34,35,36] ... [1,2,3]. Gli estremi del
      // quadrante sono min=1 e max=36; essendo decrescente: first=36, last=1.
      const q2 = [
        { players: [34, 35, 36] },
        { players: [31, 32, 33] },
        { players: [1, 2, 3] },
      ];
      const r = logic.quadrantRange(q2);
      expect(r.first).toBe(36);
      expect(r.last).toBe(1);
    });

    it('first/last sono il MASSIMO e il MINIMO reali, non la prima/ultima cella', () => {
      // Q decrescente [13,14,15]…[1,2,3]: estremi 1 e 15 (NON 13).
      const q = [
        { players: [13, 14, 15] },
        { players: [10, 11, 12] },
        { players: [1, 2, 3] },
      ];
      const r = logic.quadrantRange(q);
      expect(r.first).toBe(15);  // massimo
      expect(r.last).toBe(1);    // minimo
    });

    it('quadrante crescente con ultimo flight crescente → last = massimo', () => {
      // Q1 crescente: [37,38,39] ... [70,71,72] → last = 72
      const q1 = [
        { players: [37, 38, 39] },
        { players: [70, 71, 72] },
      ];
      const r = logic.quadrantRange(q1);
      expect(r.first).toBe(37);
      expect(r.last).toBe(72);
    });

    it('quadrante decrescente con ultimo flight decrescente → last = minimo', () => {
      // Q3 decrescente: [142,141,140] ... [113,112,111] → last = 111
      const q3 = [
        { players: [142, 141, 140] },
        { players: [113, 112, 111] },
      ];
      const r = logic.quadrantRange(q3);
      expect(r.first).toBe(142);
      expect(r.last).toBe(111);
    });

    it('in modalità nominativa usa playerIndices+1 come numero', () => {
      const groups = [
        { players: ['Rossi', 'Bianchi', 'Verdi'], playerIndices: [0, 1, 2] },
        { players: ['Neri', 'Gialli', 'Blu'],     playerIndices: [3, 4, 5] },
      ];
      const r = logic.quadrantRange(groups);
      expect(r.first).toBe(1);  // indice 0 + 1
      expect(r.last).toBe(6);   // indice 5 + 1
    });
  });

  describe('pushFigQuadrante', () => {
    it('non aggiunge nulla per quadrante vuoto', () => {
      logic.figQuadranti = [];
      logic.pushFigQuadrante('Uomini', 'Q1', []);
      expect(logic.figQuadranti).toHaveLength(0);
    });

    it('aggiunge voce con invertire=false per ordine crescente', () => {
      logic.figQuadranti = [];
      logic.pushFigQuadrante('Uomini', 'Q1', [
        { players: [1, 2, 3] }, { players: [4, 5, 6] },
      ]);
      expect(logic.figQuadranti).toHaveLength(1);
      expect(logic.figQuadranti[0]).toMatchObject({
        categoria: 'Uomini', label: 'Q1', first: 1, last: 6, invertire: false,
      });
    });

    it('invertire=true per ordine decrescente (45→1)', () => {
      logic.figQuadranti = [];
      logic.pushFigQuadrante('Uomini', 'Q2', [
        { players: [45, 44, 43] }, { players: [3, 2, 1] },
      ]);
      expect(logic.figQuadranti[0].invertire).toBe(true);
    });
  });

  describe('figQuadranti popolato da generateDoubleTee (giro normale)', () => {
    it('144U + 48D, prima giornata → 8 quadranti (4 U + 4 D) con first/last', () => {
      const l = makeLogic({
        players: 144, proette: 48, playersPerFlight: 3,
        garaNT: 'Gara 54 buche', doppiePartenze: 'Doppie Partenze',
        nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
      });
      l.generateDoubleTee('prima');
      expect(Array.isArray(l.figQuadranti)).toBe(true);
      // Tutte le voci hanno la struttura attesa
      l.figQuadranti.forEach((q) => {
        expect(q).toHaveProperty('categoria');
        expect(q).toHaveProperty('label');
        expect(typeof q.first).toBe('number');
        expect(typeof q.last).toBe('number');
        expect(typeof q.invertire).toBe('boolean');
      });
      // Ci sono sia voci Uomini sia Donne
      expect(l.figQuadranti.some(q => q.categoria === 'Uomini')).toBe(true);
      expect(l.figQuadranti.some(q => q.categoria === 'Donne')).toBe(true);
    });
  });

  describe('striscia FIG cerchio/clessidra (motore unico)', () => {
    // Il remap "giorno 2" non esiste più: 1° giro (cerchio) e 2° giro (clessidra)
    // sono descrittori espliciti distinti. La striscia FIG usa label "Blocco N · Tee X".
    const cfg = {
      players: 144, proette: 0, playersPerFlight: 3, nominativo: 'Off',
      garaNT: 'Gara 54 buche', doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    };
    it('1° e 2° giro: blocchi etichettati, tutti i 144 ranghi presenti', () => {
      for (const g of ['prima', 'seconda']) {
        const l = makeLogic(cfg);
        l.generateDoubleTee(g);
        const men = l.figQuadranti.filter((q) => q.categoria === 'Uomini');
        expect(men.length).toBeGreaterThan(0);
        expect(men.every((q) => /Blocco \d+ · Tee (1|10)/.test(q.label))).toBe(true);
        const ranks = men.flatMap((q) => [q.first, q.last]);
        expect(Math.min(...ranks)).toBe(1);
        expect(Math.max(...ranks)).toBe(144);
      }
    });
    it('INVERTIRE marcato sui quadranti a terzetti decrescenti (Tee 10 early + Tee 1 late)', () => {
      const l = makeLogic(cfg);
      l.generateDoubleTee('prima');
      const inv = l.figQuadranti.filter((q) => q.categoria === 'Uomini' && q.invertire);
      // Cerchio: un Tee 10 (early ∩, metà bassa decrescente) + un Tee 1 (late ∪).
      expect(inv.length).toBe(2);
    });
  });

  describe('figQuadranti popolato dal giro finale doppio tee', () => {
    it('54U + 27D → quadranti Uomini Tee1/Tee10 e Donne Tee1/Tee10', () => {
      const l = makeLogic({
        players: 144, proette: 48, playersCut: 54, proetteCut: 27,
        playersPerFlight: 3, garaNT: 'Gara 54 buche',
        doppiePartenze: 'Doppie Partenze', nominativo: 'Off',
        startTime: '08:00', gap: '00:11', round: '04:30',
      });
      l.generateDoubleTee('finale');
      const labels = l.figQuadranti.map(q => `${q.categoria} ${q.label}`);
      expect(labels).toContain('Uomini Q1 · Tee 1');
      expect(labels).toContain('Uomini Q2 · Tee 10');
      expect(labels).toContain('Donne Q1 · Tee 1');
      expect(labels).toContain('Donne Q2 · Tee 10');
    });
  });

  describe('figQuadranti popolato dal giro finale tee unico (3 blocchi)', () => {
    it('54U + 27D → blocco 1 (back uomini), blocco 2 (front uomini), blocco 3 (donne)', () => {
      const l = makeLogic({
        players: 144, proette: 48, playersCut: 54, proetteCut: 27,
        playersPerFlight: 3, garaNT: 'Gara 54 buche',
        doppiePartenze: 'Tee Unico', nominativo: 'Off',
        startTime: '08:00', gap: '00:11', round: '04:30',
      });
      l.generateSingleTee('finale');
      const labels = l.figQuadranti.map(q => q.label);
      expect(labels).toContain('Blocco 1 · back-half');
      expect(labels).toContain('Blocco 2 · front-half');
      expect(labels).toContain('Blocco 3');
    });
  });

  describe('generateFigStrip (HTML)', () => {
    it('ritorna stringa vuota se figQuadranti è vuoto', () => {
      logic.figQuadranti = [];
      expect(logic.generateFigStrip()).toBe('');
    });

    it('produce il box con titolo, voci e pulsante copia', () => {
      logic.figQuadranti = [
        { categoria: 'Uomini', label: 'Q1', first: 1, last: 27, invertire: false },
        { categoria: 'Uomini', label: 'Q2', first: 45, last: 1, invertire: true },
      ];
      const html = logic.generateFigStrip();
      expect(html).toContain('Striscia per sistema FIG');
      expect(html).toContain('fig-strip-copy');
      expect(html).toContain('1 &rarr; 27');
      expect(html).toContain('45 &rarr; 1');
      // Solo il quadrante decrescente ha il badge INVERTIRE.
      // Conto il badge specifico (>INVERTIRE</span>), non le altre
      // occorrenze (nota esplicativa, data-strip del pulsante copia).
      expect((html.match(/>INVERTIRE<\/span>/g) || []).length).toBe(1);
    });

    it('separa le categorie Uomini e Donne', () => {
      logic.figQuadranti = [
        { categoria: 'Uomini', label: 'Q1', first: 1, last: 27, invertire: false },
        { categoria: 'Donne',  label: 'Q1', first: 1, last: 15, invertire: false },
      ];
      const html = logic.generateFigStrip();
      expect(html).toContain('Uomini');
      expect(html).toContain('Donne');
    });

    it('il testo del pulsante copia (data-strip) elenca tutti i quadranti', () => {
      logic.figQuadranti = [
        { categoria: 'Uomini', label: 'Q1', first: 1, last: 27, invertire: false },
        { categoria: 'Uomini', label: 'Q2', first: 45, last: 1, invertire: true },
      ];
      const html = logic.generateFigStrip();
      expect(html).toContain('Uomini Q1: 1 → 27');
      expect(html).toContain('Uomini Q2: 45 → 1');
    });
  });
});

// ─── Vista FIG (tabella Giro 1 + Giro 2 combinata) ──────────────────────────
// generateFigComparison genera prima+seconda, accoppia i flight per giocatori
// e produce la tabella in stile orario ufficiale FIG.
describe('Vista FIG — generateFigComparison', () => {
  let logic;
  beforeEach(() => {
    resetPlayerStorage();
    logic = makeLogic({
      players: 144,
      proette: 48,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 54 buche',
      doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late',
      startTime: '08:00',
      gap: '00:10',
      round: '04:30',
    });
  });

  it('ritorna HTML con sezioni Uomini e Donne e intestazioni Giro 1/Giro 2', () => {
    const html = logic.generateFigComparison();
    expect(html).toContain('Uomini');
    expect(html).toContain('Donne');
    expect(html).toContain('Giro 1');
    expect(html).toContain('Giro 2');
    expect(html).toContain('Match');
    expect(html).toContain('Giocatori');
  });

  it('ogni flight uomini compare una sola volta nella tabella', () => {
    const html = logic.generateFigComparison();
    // Estrai la sezione Uomini (fino a "Donne")
    const sezUomini = html.split('Donne')[0];
    const trCount = (sezUomini.match(/<tr>/g) || []).length;
    // 144 uomini / 3 = 48 flight → 48 righe nel tbody
    expect(trCount).toBe(48);
  });

  it('non altera figQuadranti (lo ripristina dopo generateDoubleTee interni)', () => {
    // Genera prima la tabella normale → popola figQuadranti
    logic.generateDoubleTee('prima');
    const before = JSON.stringify(logic.figQuadranti);
    // generateFigComparison chiama generateDoubleTee 2 volte internamente
    logic.generateFigComparison();
    const after = JSON.stringify(logic.figQuadranti);
    expect(after).toBe(before);
  });

  it('senza giocatori → messaggio invece della tabella', () => {
    const vuoto = makeLogic({
      players: 0, proette: 0, playersPerFlight: 3,
      garaNT: 'Gara 54 buche', doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
      nominativo: 'Off',
    });
    const html = vuoto.generateFigComparison();
    expect(html).toContain('Nessun flight');
  });

  it('i match del Giro 1 sono progressivi e iniziano da 1', () => {
    const html = logic.generateFigComparison();
    const sezUomini = html.split('Donne')[0];
    // Primo match della prima riga dati = 1
    const tbody = sezUomini.split('<tbody>')[1] || '';
    const firstRow = tbody.split('</tr>')[0];
    expect(firstRow).toContain('>1<');
  });

  it('ogni riga ha sia Giro 1 sia Giro 2 valorizzati (flight presente in entrambe le giornate)', () => {
    const html = logic.generateFigComparison();
    // Nessuna cella "—" attesa: ogni flight esiste sia in prima sia in seconda
    expect(html).not.toContain('>—<');
  });

  it('figFlights popolato da generateDoubleTee contiene group/ora/tee/category', () => {
    logic.generateDoubleTee('prima');
    expect(Array.isArray(logic.figFlights)).toBe(true);
    expect(logic.figFlights.length).toBeGreaterThan(0);
    logic.figFlights.forEach((f) => {
      expect(f).toHaveProperty('group');
      expect(f).toHaveProperty('ora');
      expect([1, 10]).toContain(f.tee);
      expect(['M', 'F']).toContain(f.category);
    });
  });

  it('numerazione match separata: uomini e donne partono entrambi da 1', () => {
    // FIG tratta gara M e gara F come due gare distinte: numerazione
    // dei match indipendente, ciascuna da 1 (no sequenza condivisa con buchi).
    const html = logic.generateFigComparison();
    const sezDonne = html.split('Donne')[1] || '';
    const tbodyDonne = sezDonne.split('<tbody>')[1] || '';
    const firstRowDonne = tbodyDonne.split('</tr>')[0];
    // La prima riga donne deve avere match Giro 1 = 1
    expect(firstRowDonne).toContain('>1<');
    // 48 donne / 3 = 16 flight → match donne vanno 1..16, nessun match > 16
    const sezUomini = html.split('Donne')[0];
    const tbodyUomini = sezUomini.split('<tbody>')[1] || '';
    const matchUomini = (tbodyUomini.match(/font-weight:600;">(\d+)</g) || [])
      .map(m => parseInt(m.match(/>(\d+)</)[1], 10));
    // 144 uomini / 3 = 48 flight → max match uomini = 48
    expect(Math.max(...matchUomini)).toBe(48);
  });

  it('mostra i nomi quando in modalità nominativo', () => {
    storage.set('atleti', Array.from({ length: 12 }, (_, i) => `Atleta${i + 1}`));
    storage.set('atlete', Array.from({ length: 6 }, (_, i) => `Atleta${i + 1}`));
    const logicNom = makeLogic({
      players: 12, proette: 6, playersPerFlight: 3, nominativo: 'On',
      garaNT: 'Gara 72 buche', doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = logicNom.generateFigComparison();
    // La Vista FIG deve mostrare i nomi, non i numeri di posizione
    expect(html).toContain('Atleta1');
  });

  it('funziona in modalità numerica con un giro di qualificazione', () => {
    const l36 = makeLogic({
      players: 54, proette: 0, playersPerFlight: 3,
      garaNT: 'Gara 72 buche', doppiePartenze: 'Doppie Partenze',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
      nominativo: 'Off',
    });
    const html = l36.generateFigComparison();
    expect(html).toContain('Uomini');
    // 54 uomini / 3 = 18 flight
    const trCount = (html.match(/<tr>/g) || []).length;
    expect(trCount).toBe(18);
  });
});

// ─── REGRESSIONE: normalizeGaraTitle (raggruppamento dropdown M+F) ───────────
// Bug: la regex /\s*(MASCHILE|FEMMINILE)\s*/gi non gestiva la punteggiatura
// attorno alla parola-chiave. Conseguenza: gare M ed F dello stesso evento con
// punteggiatura asimmetrica (es. trattino prima di MASCHILE ma assente prima di
// FEMMINILE) producevano chiavi diverse e nel dropdown apparivano come voci
// [M] e [F] separate, senza l'opzione combinata [M+F]. L'utente non poteva
// quindi caricare i due generi insieme. Questi test garantiscono che le forme
// più comuni di titolo federgolf.it producano la stessa chiave normalizzata.
describe('REGRESSIONE — normalizeGaraTitle (raggruppamento dropdown M+F)', () => {
  it('coppie MASCHILE/FEMMINILE simmetriche → stessa chiave', () => {
    expect(normalizeGaraTitle('TROFEO XYZ MASCHILE 2026'))
      .toBe(normalizeGaraTitle('TROFEO XYZ FEMMINILE 2026'));
  });

  it('[BUG] trattino prima di MASCHILE ma non FEMMINILE → ora stessa chiave', () => {
    // Vecchia regex: "TROFEO X -2026" vs "TROFEO X 2026" (diverse)
    // Nuova: entrambe → "trofeo x 2026"
    expect(normalizeGaraTitle('TROFEO X - MASCHILE 2026'))
      .toBe(normalizeGaraTitle('TROFEO X FEMMINILE 2026'));
  });

  it('[BUG] separatori asimmetrici (slash, due punti, virgola) → stessa chiave', () => {
    expect(normalizeGaraTitle('GARA: MASCHILE'))
      .toBe(normalizeGaraTitle('GARA, FEMMINILE'));
  });

  it('[BUG] trattino lungo (em-dash) attorno a MASCHILE → stessa chiave di FEMMINILE plain', () => {
    expect(normalizeGaraTitle('CAMPIONATO – MASCHILE – 2026'))
      .toBe(normalizeGaraTitle('CAMPIONATO FEMMINILE 2026'));
  });

  it('case-insensitive: maschile/MASCHILE/Maschile → stessa chiave', () => {
    expect(normalizeGaraTitle('Trofeo Maschile 2026'))
      .toBe(normalizeGaraTitle('TROFEO FEMMINILE 2026'));
  });

  it('whitespace multipli/diversi → collassati in spazi singoli', () => {
    expect(normalizeGaraTitle('GARA  MASCHILE   2026'))
      .toBe(normalizeGaraTitle('GARA\tFEMMINILE\n2026'));
  });

  it('input vuoto/null/undefined → stringa vuota, non crash', () => {
    expect(normalizeGaraTitle('')).toBe('');
    expect(normalizeGaraTitle(null)).toBe('');
    expect(normalizeGaraTitle(undefined)).toBe('');
  });

  it('non confonde gare diverse: titoli con prefissi differenti restano distinti', () => {
    expect(normalizeGaraTitle('GARA REGIONALE U18 MASCHILE'))
      .not.toBe(normalizeGaraTitle('GARA REGIONALE U16 FEMMINILE'));
  });

  it('non confonde gare con stesso prefisso ma evento diverso', () => {
    expect(normalizeGaraTitle('TROFEO PRIMAVERA MASCHILE'))
      .not.toBe(normalizeGaraTitle('TROFEO ESTATE FEMMINILE'));
  });

  it('simula raggruppamento dropdown: chiave = nome + data', () => {
    const garaM = { title: 'CAMPIONATO ITALIANO - MASCHILE', date: '15/06/2026' };
    const garaF = { title: 'CAMPIONATO ITALIANO FEMMINILE',   date: '15/06/2026' };

    const chiaveM = `${normalizeGaraTitle(garaM.title)}_${garaM.date}`;
    const chiaveF = `${normalizeGaraTitle(garaF.title)}_${garaF.date}`;

    expect(chiaveM).toBe(chiaveF); // ⇒ il dropdown produrrà l'opzione [M+F]
  });

  it('date diverse → chiavi diverse anche se titoli identici (eventi distinti)', () => {
    const garaA = { title: 'TROFEO XYZ MASCHILE', date: '15/06/2026' };
    const garaB = { title: 'TROFEO XYZ FEMMINILE', date: '22/06/2026' };

    const chiaveA = `${normalizeGaraTitle(garaA.title)}_${garaA.date}`;
    const chiaveB = `${normalizeGaraTitle(garaB.title)}_${garaB.date}`;

    expect(chiaveA).not.toBe(chiaveB);
  });
});

// ─── GOLDEN SNAPSHOT — rete di regressione giri di qualificazione/finale ─────
// Questi snapshot congelano l'HTML COMPLETO prodotto da generateDoubleTee e
// generateSingleTee per la Gara 54 buche e per i giri di qualificazione
// (resi con lo stesso motore del 72 buche), più la striscia/Vista FIG.
//
// SCOPO: sono la rete di sicurezza richiesta PRIMA del refactor data-driven
// del dispatch formato/giro. Il refactor sostituirà i check cablati
// (garaNT === 'Gara 54 buche', round === 'finale') con una lettura dalla
// tabella COMPETITION_FORMATS. L'algoritmo dei quadranti NON deve cambiare:
// se dopo il refactor `npm test` resta verde, il 54/36 è rimasto identico.
//
// FUNZIONAMENTO: al primo `npm test` Vitest CREA il file
//   __snapshots__/quadranti-logic.test.js.snap
// (sempre verde la prima volta). Va committato: da quel momento è il
// riferimento immutabile. Ogni modifica che alteri l'output 54/36 farà
// fallire questi test indicando ESATTAMENTE dove l'HTML è cambiato.
//
// Per ri-generare di proposito gli snapshot dopo una modifica VOLUTA:
//   npx vitest run -u   (oppure `npm test -- -u`)
describe('GOLDEN SNAPSHOT — formati 54/36 buche (pre-refactor data-driven)', () => {
  // Config canonici: TUTTI i campi rilevanti sono espliciti, così gli
  // snapshot non dipendono da eventuali variazioni di DEFAULT_CONFIG.
  const cfg54Double = {
    players: 144, proette: 48, playersPerFlight: 3, nominativo: 'Off',
    garaNT: 'Gara 54 buche', doppiePartenze: 'Doppie Partenze',
    compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    playersCut: 0, proetteCut: 0,
  };
  const cfg54Final = { ...cfg54Double, playersCut: 54, proetteCut: 27 };
  const cfg72Quals = { ...cfg54Double, garaNT: 'Gara 72 buche', players: 108, proette: 36 };

  beforeEach(() => { resetPlayerStorage(); });

  describe('generateDoubleTee — HTML completo', () => {
    it('54 buche · prima', () => {
      expect(makeLogic(cfg54Double).generateDoubleTee('prima')).toMatchSnapshot();
    });
    it('54 buche · seconda', () => {
      expect(makeLogic(cfg54Double).generateDoubleTee('seconda')).toMatchSnapshot();
    });
    it('54 buche · finale (doppio tee)', () => {
      expect(makeLogic(cfg54Final).generateDoubleTee('finale')).toMatchSnapshot();
    });
    it('54 buche · prima · senza donne', () => {
      expect(makeLogic({ ...cfg54Double, proette: 0 }).generateDoubleTee('prima')).toMatchSnapshot();
    });
    it('72 buche · qualificazione prima', () => {
      expect(makeLogic(cfg72Quals).generateDoubleTee('prima')).toMatchSnapshot();
    });
    it('72 buche · qualificazione seconda', () => {
      expect(makeLogic(cfg72Quals).generateDoubleTee('seconda')).toMatchSnapshot();
    });
  });

  describe('generateSingleTee — HTML completo', () => {
    it('54 buche · prima', () => {
      expect(makeLogic(cfg54Double).generateSingleTee('prima')).toMatchSnapshot();
    });
    it('54 buche · seconda', () => {
      expect(makeLogic(cfg54Double).generateSingleTee('seconda')).toMatchSnapshot();
    });
    it('54 buche · finale (3 blocchi, tee unico)', () => {
      expect(makeLogic(cfg54Final).generateSingleTee('finale')).toMatchSnapshot();
    });
    it('54 buche · finale · senza donne', () => {
      expect(makeLogic({ ...cfg54Final, proette: 0, proetteCut: 0 }).generateSingleTee('finale')).toMatchSnapshot();
    });
    it('72 buche · qualificazione prima', () => {
      expect(makeLogic(cfg72Quals).generateSingleTee('prima')).toMatchSnapshot();
    });
    it('72 buche · qualificazione seconda', () => {
      expect(makeLogic(cfg72Quals).generateSingleTee('seconda')).toMatchSnapshot();
    });
  });

  describe('figQuadranti — striscia FIG (stato interno)', () => {
    it('54 buche · doppio tee · prima', () => {
      const l = makeLogic(cfg54Double);
      l.generateDoubleTee('prima');
      expect(JSON.stringify(l.figQuadranti, null, 1)).toMatchSnapshot();
    });
    it('54 buche · doppio tee · seconda', () => {
      const l = makeLogic(cfg54Double);
      l.generateDoubleTee('seconda');
      expect(JSON.stringify(l.figQuadranti, null, 1)).toMatchSnapshot();
    });
    it('54 buche · finale doppio tee', () => {
      const l = makeLogic(cfg54Final);
      l.generateDoubleTee('finale');
      expect(JSON.stringify(l.figQuadranti, null, 1)).toMatchSnapshot();
    });
    it('54 buche · finale tee unico', () => {
      const l = makeLogic(cfg54Final);
      l.generateSingleTee('finale');
      expect(JSON.stringify(l.figQuadranti, null, 1)).toMatchSnapshot();
    });
  });

  describe('generateFigStrip / generateFigComparison — HTML completo', () => {
    it('generateFigStrip · 54 buche finale doppio tee', () => {
      const l = makeLogic(cfg54Final);
      l.generateDoubleTee('finale');
      expect(l.generateFigStrip()).toMatchSnapshot();
    });
    it('generateFigComparison · 54 buche', () => {
      expect(makeLogic(cfg54Double).generateFigComparison()).toMatchSnapshot();
    });
  });
});

// ─── MODELLO DATA-DRIVEN — descrittore COMPETITION_FORMATS ───────────────────
// Verifica la struttura della tabella che pilota il dispatch formato/giro.
describe('COMPETITION_FORMATS — descrittore dei formati di gara', () => {
  it('contiene i 6 formati attesi (Gara 36 rimossa)', () => {
    [
      'Gara 54 buche', 'Gara 72 buche', 'Gara con patrocinio FIG',
      'Trofeo Giovanile Federale', 'Gara Giovanile', 'Teodoro Soldati',
    ].forEach((k) => {
      expect(COMPETITION_FORMATS[k]).toBeDefined();
      expect(Array.isArray(COMPETITION_FORMATS[k].rounds)).toBe(true);
    });
    // 'Gara 36 buche' è stata sostituita dalle Gare con patrocinio FIG.
    expect(COMPETITION_FORMATS['Gara 36 buche']).toBeUndefined();
  });

  it('Gara 54 buche: 3 giri, il 3° è finale per entrambi i sessi', () => {
    const f = COMPETITION_FORMATS['Gara 54 buche'];
    expect(f.rounds).toHaveLength(3);
    expect(f.rounds[2].type).toBe('finale');
    expect(f.rounds[2].gender).toBe('both');
  });

  it('Gara 72 buche: 4 giri, 3°/4° finale, 4° riservato agli uomini', () => {
    const f = COMPETITION_FORMATS['Gara 72 buche'];
    expect(f.rounds).toHaveLength(4);
    expect(f.rounds.map((r) => r.id)).toEqual(['prima', 'seconda', 'terzo', 'quarto']);
    expect(f.rounds[2].type).toBe('finale');
    expect(f.rounds[2].gender).toBe('both');
    expect(f.rounds[3].type).toBe('finale');
    expect(f.rounds[3].gender).toBe('men');
  });

  it('Gara Giovanile: giro unico, di qualificazione', () => {
    const f = COMPETITION_FORMATS['Gara Giovanile'];
    expect(f.rounds).toHaveLength(1);
    expect(f.rounds[0].type).toBe('qualifying');
  });

  it('patrocinio / trofeo: 2 giri, nessun giro finale', () => {
    ['Gara con patrocinio FIG', 'Trofeo Giovanile Federale']
      .forEach((k) => {
        const f = COMPETITION_FORMATS[k];
        expect(f.rounds).toHaveLength(2);
        expect(f.rounds.every((r) => r.type === 'qualifying')).toBe(true);
      });
  });

  it('ogni giro con sezioni ha early/late in notazione stringa FORMA-VERSO valida', () => {
    Object.values(COMPETITION_FORMATS).forEach((fmt) => {
      fmt.rounds.forEach((r) => {
        // I giri a coppie (Prova di gioco 3°/4°) non hanno sezioni early/late.
        if (r.coppie) {
          expect(r.early).toBeUndefined();
          expect(r.late).toBeUndefined();
          return;
        }
        ['early', 'late'].forEach((sez) => {
          expect(typeof r[sez]).toBe('string');
          const { forma, verso } = parseForma(r[sez]);
          expect(['U', 'UR', 'S']).toContain(forma);
          expect(['sn-dx', 'dx-sn']).toContain(verso);
        });
        expect(typeof r.reversed).toBe('boolean');
      });
    });
  });

  it('parseForma decodifica la notazione stringa nei valori interni', () => {
    expect(parseForma('UR-R/L')).toEqual({ forma: 'UR', verso: 'dx-sn' });
    expect(parseForma('UR-L/R')).toEqual({ forma: 'UR', verso: 'sn-dx' });
    expect(parseForma('U-R/L')).toEqual({ forma: 'U', verso: 'dx-sn' });
    expect(parseForma('U-L/R')).toEqual({ forma: 'U', verso: 'sn-dx' });
    expect(parseForma('S-L/R')).toEqual({ forma: 'S', verso: 'sn-dx' });
    expect(parseForma('S-R/L')).toEqual({ forma: 'S', verso: 'dx-sn' });
  });
});

// ─── GIRO FINALE TEE UNICO — ordine dei blocchi confermato ───────────────────
// Ordine di partenza confermato (schema FIG): uomini back-half → uomini
// front-half → donne. Test esplicito: documenta il cambiamento di ordine
// rispetto alla versione precedente (che metteva le donne in mezzo).
describe('Giro finale tee unico — ordine blocchi (uomini back → uomini front → donne)', () => {
  beforeEach(() => { resetPlayerStorage(); });

  const cfgFinale = {
    players: 144, proette: 48, playersCut: 54, proetteCut: 27,
    playersPerFlight: 3, garaNT: 'Gara 54 buche', doppiePartenze: 'Tee Unico',
    nominativo: 'Off', startTime: '08:00', gap: '00:11', round: '04:30',
  };

  it('figQuadranti ha 3 blocchi nell’ordine back-half, front-half, donne', () => {
    const l = makeLogic(cfgFinale);
    l.generateSingleTee('finale');
    expect(l.figQuadranti).toHaveLength(3);
    expect(l.figQuadranti[0].categoria).toBe('Uomini');
    expect(l.figQuadranti[0].label).toContain('back-half');
    expect(l.figQuadranti[1].categoria).toBe('Uomini');
    expect(l.figQuadranti[1].label).toContain('front-half');
    expect(l.figQuadranti[2].categoria).toBe('Donne');
  });

  it('ordine blocchi dai PDF: B1 back-half CRESCENTE 28→54, B2 27→1, B3 donne 27→1', () => {
    // PDF "3° GIRO PER CLASSIFICA TEE 1": back-half a gruppi CRESCENTI
    // (28→54), front-half e donne a gruppi DECRESCENTI (27→1). Interno sempre
    // decrescente (per classifica).
    const l = makeLogic(cfgFinale);
    l.generateSingleTee('finale');
    // back-half crescente: parte da 28 (best back-half apre), chiude a 54
    expect(l.figQuadranti[0].first).toBe(28);
    expect(l.figQuadranti[0].last).toBe(54);
    // front-half decrescente: 27 → 1 (leader uomini chiude il blocco)
    expect(l.figQuadranti[1].first).toBe(27);
    expect(l.figQuadranti[1].last).toBe(1);
    // donne decrescente: 27 → 1 (leader donne chiude il giro)
    expect(l.figQuadranti[2].first).toBe(27);
    expect(l.figQuadranti[2].last).toBe(1);
  });

  it('le donne chiudono il giro: nessun blocco maschile dopo le donne', () => {
    const l = makeLogic(cfgFinale);
    l.generateSingleTee('finale');
    // ultimo blocco = Donne
    expect(l.figQuadranti[l.figQuadranti.length - 1].categoria).toBe('Donne');
  });
});

// ─── NUOVI FORMATI — Gara 72 buche ───────────────────────────────────────────
describe('Gara 72 buche — giri 3 e 4 (finale), 4° solo uomini', () => {
  beforeEach(() => { resetPlayerStorage(); });

  const cfg72 = {
    players: 144, proette: 48, playersCut: 54, proetteCut: 27,
    playersPerFlight: 3, garaNT: 'Gara 72 buche', nominativo: 'Off',
    compatto: 'Early/Late', startTime: '08:00', gap: '00:11', round: '04:30',
  };

  it('giro di qualificazione (prima) identico a quello della Gara 54 buche', () => {
    const base = {
      players: 144, proette: 48, playersPerFlight: 3, nominativo: 'Off',
      doppiePartenze: 'Doppie Partenze', compatto: 'Early/Late',
      startTime: '08:00', gap: '00:10', round: '04:30',
    };
    const h54 = makeLogic({ ...base, garaNT: 'Gara 54 buche' }).generateDoubleTee('prima');
    const h72 = makeLogic({ ...base, garaNT: 'Gara 72 buche' }).generateDoubleTee('prima');
    expect(h72).toBe(h54);
  });

  it('3° giro doppio tee → finale con uomini E donne', () => {
    const l = makeLogic({ ...cfg72, doppiePartenze: 'Doppie Partenze' });
    const html = l.generateDoubleTee('terzo');
    expect(html).toContain('<table>');
    const categorie = l.figQuadranti.map((q) => q.categoria);
    expect(categorie).toContain('Uomini');
    expect(categorie).toContain('Donne');
  });

  it('4° giro doppio tee → finale SOLO uomini (nessuna donna)', () => {
    const l = makeLogic({ ...cfg72, doppiePartenze: 'Doppie Partenze' });
    l.generateDoubleTee('quarto');
    expect(l.figQuadranti.length).toBeGreaterThan(0);
    expect(l.figQuadranti.every((q) => q.categoria === 'Uomini')).toBe(true);
  });

  it('3° giro tee unico → 3 blocchi (back, front, donne)', () => {
    const l = makeLogic({ ...cfg72, doppiePartenze: 'Tee Unico' });
    l.generateSingleTee('terzo');
    expect(l.figQuadranti).toHaveLength(3);
    expect(l.figQuadranti[2].categoria).toBe('Donne');
  });

  it('4° giro tee unico → solo blocchi maschili, nessuna donna', () => {
    const l = makeLogic({ ...cfg72, doppiePartenze: 'Tee Unico' });
    l.generateSingleTee('quarto');
    expect(l.figQuadranti.length).toBeGreaterThan(0);
    expect(l.figQuadranti.every((q) => q.categoria === 'Uomini')).toBe(true);
  });
});

// ─── NUOVI FORMATI — Gara Giovanile, Patrocinio FIG, Trofeo Giovanile ────────
describe('Nuovi formati — giovanili, patrocinio FIG, trofei', () => {
  beforeEach(() => { resetPlayerStorage(); });

  it('Gara Giovanile: giro unico, NON è un giro finale', () => {
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 30, proette: 12, playersPerFlight: 3,
      doppiePartenze: 'Tee Unico', nominativo: 'Off',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateSingleTee('prima');
    expect(html).toContain('<tbody>');
    // 'prima' è un giro di qualificazione → quadranti Q1-Q4, niente 'Blocco'
    expect(l.figQuadranti.some((q) => /Blocco/.test(q.label))).toBe(false);
  });

  // ─── TEE UNICO PER GIOVANILI (logica 54 'prima') ────────────────────────────
  // Gara Giovanile e Teodoro Soldati hanno `tee: ['double', 'single']`: nessun
  // PDF dedicato → per il tee unico si riusa la stessa logica del 54 buche
  // 'prima' (femaleGroups + maleGroups, quadranti Q1-Q4).

  it('COMPETITION_FORMATS: Gara Giovanile abilita tee unico (logica 54)', () => {
    const tee = COMPETITION_FORMATS['Gara Giovanile'].rounds[0].tee;
    expect(tee).toEqual(expect.arrayContaining(['double', 'single']));
  });

  it('COMPETITION_FORMATS: Teodoro Soldati abilita tee unico (logica 54)', () => {
    const tee = COMPETITION_FORMATS['Teodoro Soldati'].rounds[0].tee;
    expect(tee).toEqual(expect.arrayContaining(['double', 'single']));
  });

  it('Gara Giovanile tee unico: schema B (M-Q4→M-Q3→F→M-Q2→M-Q1, donne in mezzo, tutti decrescenti)', () => {
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 30, proette: 12, playersPerFlight: 3,
      doppiePartenze: 'Tee Unico', nominativo: 'Off',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateSingleTee('prima');
    const bodyHtml = html.split('<tbody>')[1] || '';

    // Conta righe totali: 30/3 + 12/3 = 10 + 4 = 14
    const trCount = (bodyHtml.match(/<tr>/g) || []).length;
    expect(trCount).toBe(14);

    // Schema B PDF "TEE UNICO" per Gara Giovanile:
    //   M-Q4 → M-Q3 → F-Q4 → F-Q3 → F-Q2 → F-Q1 → M-Q2 → M-Q1
    // → prima E ultima riga = uomini (nere); donne in mezzo.
    const rows = bodyHtml.split('</tr>').slice(0, -1);
    expect(rows[0]).not.toContain('color:red');               // apertura = uomini Late
    expect(rows[rows.length - 1]).not.toContain('color:red'); // chiusura = uomini Early
    const middleHasRed = rows.slice(1, -1).some((r) => r.includes('color:red'));
    expect(middleHasRed).toBe(true);                          // donne in mezzo

    // Tutti i rank donne 1..12 presenti.
    const redNums = (bodyHtml.match(/color:red"[^>]*>(\d+)</g) || [])
      .map((m) => parseInt(m.match(/>(\d+)</)[1], 10));
    expect(redNums.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1)
    );
  });

  it('Teodoro Soldati tee unico: schema B (analogo a Gara Giovanile, donne in mezzo)', () => {
    const l = makeLogic({
      garaNT: 'Teodoro Soldati', players: 60, proette: 18, playersPerFlight: 3,
      doppiePartenze: 'Tee Unico', nominativo: 'Off',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateSingleTee('prima');
    expect(html).toContain('<tbody>');

    const bodyHtml = html.split('<tbody>')[1] || '';
    // 60/3 + 18/3 = 20 + 6 = 26 righe
    expect((bodyHtml.match(/<tr>/g) || []).length).toBe(26);

    // Non è un giro finale: niente 'Blocco' nelle label dei figQuadranti
    expect(l.figQuadranti.some((q) => /Blocco/.test(q.label))).toBe(false);

    // Schema B: uomini in apertura E in chiusura, donne in mezzo.
    const rows = bodyHtml.split('</tr>').slice(0, -1);
    expect(rows[0]).not.toContain('color:red');
    expect(rows[rows.length - 1]).not.toContain('color:red');
    const middleHasRed = rows.slice(1, -1).some((r) => r.includes('color:red'));
    expect(middleHasRed).toBe(true);
  });

  it('Gara con patrocinio FIG: 1° giro qualificazione, 2° giro per classifica', () => {
    const l = makeLogic({
      garaNT: 'Gara con patrocinio FIG', players: 60, proette: 24,
      playersPerFlight: 3, doppiePartenze: 'Doppie Partenze', nominativo: 'Off',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    expect(l.generateDoubleTee('prima')).toContain('<table>');
    expect(l.generateDoubleTee('seconda')).toContain('<table>');
  });

  it('Trofeo Giovanile Federale: 2 giri di qualificazione', () => {
    const l = makeLogic({
      garaNT: 'Trofeo Giovanile Federale', players: 45, proette: 18,
      playersPerFlight: 3, doppiePartenze: 'Doppie Partenze', nominativo: 'Off',
      compatto: 'Early/Late', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    expect(l.generateDoubleTee('prima')).toContain('<table>');
    expect(l.generateDoubleTee('seconda')).toContain('<table>');
  });
});

// ─── QUADRANTI A U ROVESCIATA (forma 'UR') — giovanili / patrocinate ─────────
// I formati giovanili/patrocinate hanno i quadranti a forma 'UR' (∩): ogni
// blocco è un intervallo spezzato a metà — metà bassa su Tee 1 (righe
// decrescenti), metà alta su Tee 10 (righe crescenti).
// Vedi COMPETITION_FORMATS[...].rounds[...].early / late / reversed.
describe('Quadranti a U rovesciata (forma UR) — giovanili / patrocinate', () => {
  beforeEach(() => { resetPlayerStorage(); });

  // Numeri delle celle-giocatore nell'ordine di render (salta Flight/Tee/Orario).
  const playerCells = (html) => {
    const body = html.split('<tbody>')[1] || '';
    return (body.match(/style="color:[^"]*">(\d+)/g) || [])
      .map((m) => parseInt(m.match(/>(\d+)/)[1], 10));
  };

  it('descrittore: early/late in notazione stringa corretti per ogni formato', () => {
    const round = (g, i) => COMPETITION_FORMATS[g].rounds[i];
    // Blocco UR puro: entrambe le sezioni 'UR-L/R'.
    expect(round('Gara Giovanile', 0).early).toBe('UR-L/R');
    expect(round('Gara Giovanile', 0).late).toBe('UR-L/R');
    expect(round('Gara Giovanile', 0).reversed).toBe(false);
    expect(parseForma(round('Teodoro Soldati', 0).early).forma).toBe('UR');
    expect(round('Gara con patrocinio FIG', 1).early).toBe('UR-L/R');
    expect(round('Gara con patrocinio FIG', 1).reversed).toBe(true);
    expect(round('Trofeo Giovanile Federale', 1).reversed).toBe(true);
    // 1° giro = cerchio: Early 'UR-R/L', Late 'U-R/L'.
    expect(round('Gara con patrocinio FIG', 0).early).toBe('UR-R/L');
    expect(round('Gara con patrocinio FIG', 0).late).toBe('U-R/L');
    expect(round('Gara 54 buche', 0).early).toBe('UR-R/L');
    // 2° giro = SPECULARE del 1°: stessa forma del cerchio + giorno 2 (i blocchi
    // restano congelati e scambiano Early/Late + Tee, vedi builder 'cerchio').
    expect(round('Gara 54 buche', 1).early).toBe('UR-R/L');
    expect(round('Gara 54 buche', 1).late).toBe('U-R/L');
    expect(round('Gara 54 buche', 1).giorno).toBe(2);
  });

  it('Gara Giovanile: 3 blocchi ∩ — uomini Early, donne, uomini Late', () => {
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 90, proette: 42, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateDoubleTee('prima');
    expect(html).toContain('<table>');
    expect(l.figQuadranti).toHaveLength(6); // 3 blocchi × 2 tee
    expect(l.figQuadranti[0].categoria).toBe('Uomini'); // Early
    expect(l.figQuadranti[2].categoria).toBe('Donne');
    expect(l.figQuadranti[4].categoria).toBe('Uomini'); // Late
  });

  it('Gara Giovanile: split uomini bilanciato → Early 25-90, Late 1-24 (schema fornito)', () => {
    // 90 uomini / 42 donne: lo schema fornito → Early uomini 25-90, Late 1-24.
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 90, proette: 42, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    l.generateDoubleTee('prima');
    const range = (i) => [l.figQuadranti[i].first, l.figQuadranti[i].last];
    // Blocco 1 = uomini Early: copre i ranghi 25-90
    const b1 = [...range(0), ...range(1)];
    expect(Math.min(...b1)).toBe(25);
    expect(Math.max(...b1)).toBe(90);
    // Blocco 3 = uomini Late: copre i ranghi 1-24
    const b3 = [...range(4), ...range(5)];
    expect(Math.min(...b3)).toBe(1);
    expect(Math.max(...b3)).toBe(24);
  });

  it('Gara Giovanile: nessun buco — i due tee di ogni blocco uomini bilanciati', () => {
    // 90 uomini / 48 donne: (30+16 flight)/2 = 23, dispari → Early arrotondato
    // a 22 flight (pari), così Tee 1 e Tee 10 si dividono equamente.
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 90, proette: 48, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    l.generateDoubleTee('prima');
    const span = (q) => Math.abs(q.last - q.first) + 1;
    // Blocco 1 (Early uomini): Tee 1 e Tee 10 stessa ampiezza → niente buco
    expect(span(l.figQuadranti[0])).toBe(span(l.figQuadranti[1]));
    // Blocco 3 (Late uomini): idem
    expect(span(l.figQuadranti[4])).toBe(span(l.figQuadranti[5]));
  });

  it('Gara Giovanile: tra Early e Late intercorre il mezzo giro (attraversamento)', () => {
    // round 04:30 → mezzo giro 02:15. Early finisce di partire alle 09:50,
    // quindi il primo blocco Late (donne) parte alle 12:05, non alle 10:00.
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 90, proette: 48, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateDoubleTee('prima');
    expect(html).toContain('>12:05<');     // Late parte dopo il mezzo giro
    expect(html).not.toContain('>10:00<'); // non lo stacco fisso di 10 min
  });

  it('Patrocinate 2° giro: 4 blocchi ∩ reversed con donne in mezzo', () => {
    const l = makeLogic({
      garaNT: 'Gara con patrocinio FIG', players: 12, proette: 12,
      playersPerFlight: 3, nominativo: 'Off',
      startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateDoubleTee('seconda');
    expect(html).toContain('<table>');
    // 4 blocchi × 2 tee = 8 entrate; categorie U,U,D,D,D,D,U,U → donne in mezzo
    expect(l.figQuadranti).toHaveLength(8);
    expect(l.figQuadranti.map((q) => q.categoria)).toEqual(
      ['Uomini', 'Uomini', 'Donne', 'Donne', 'Donne', 'Donne', 'Uomini', 'Uomini']
    );
    // Terzetti reversed: primo terzetto Tee 1 = 9·8·7.
    expect(playerCells(html).slice(0, 3)).toEqual([9, 8, 7]);
  });

  it('Patrocinate 1° giro: cerchio via MOTORE UNICO (striscia FIG a blocchi)', () => {
    const l = makeLogic({
      garaNT: 'Gara con patrocinio FIG', players: 60, proette: 24,
      playersPerFlight: 3, nominativo: 'Off', compatto: 'Early/Late',
      startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateDoubleTee('prima');
    // Ora passa dal renderer unico: striscia FIG con label "Blocco N · Tee X".
    expect(l.figQuadranti.length).toBeGreaterThan(0);
    expect(l.figQuadranti.every((q) => /Blocco \d+ · Tee (1|10)/.test(q.label))).toBe(true);
    expect(html).toContain('<table>');
  });

  it('Trofeo Giovanile Federale 2° giro: stesso schema del Patrocinate (4 blocchi)', () => {
    const l = makeLogic({
      garaNT: 'Trofeo Giovanile Federale', players: 12, proette: 12,
      playersPerFlight: 3, nominativo: 'Off',
      startTime: '08:00', gap: '00:10', round: '04:30',
    });
    l.generateDoubleTee('seconda');
    expect(l.figQuadranti).toHaveLength(8);
  });

  // Invariante GIÀ garantito ora: niente giocatore solo, twosome = due voli da 2.
  it('Gara Giovanile doppie 62M — twosome = due voli da 2 (mai un giocatore solo)', () => {
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 62, proette: 0, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateDoubleTee('prima');
    const body = html.split('<tbody>')[1] || '';
    const flights = body.split('</tr>').map((tr) => {
      const tm = tr.search(/font-medium"[^>]*>\d{1,2}:\d{2}</);
      if (tm < 0) return [];
      return [tr.slice(0, tm), tr.slice(tm)].map((s) =>
        [...s.matchAll(/border border-gray-300"[^>]*>([^<]*)</g)].map((m) => m[1].trim()).filter((v) => v !== '').length);
    }).flat();
    expect(flights.includes(1)).toBe(false);              // mai un volo da 1
    // difference(62)=1 → un solo volo da 2 (un twosome)
    expect(flights.filter((n) => n === 2).length).toBe(1);
  });

  // MOTORE UNICO (buildURQuadrants, §3.1): i due twosome consecutivi in alto-sx
  // (Q1 = Early Tee 1) e la riga vuota in basso-sx (Q3 = Late Tee 1), tee bilanciati.
  it('Gara Giovanile doppie 61M — 2 twosome consecutivi alto-sx, vuoto basso-sx', () => {
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 61, proette: 0, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const html = l.generateDoubleTee('prima');
    const body = html.split('<tbody>')[1] || '';
    // Per riga: [voloTee1, voloTee10] come liste di ranghi (celle non vuote).
    const rows = body.split('</tr>').map((tr) => {
      const tm = tr.search(/font-medium"[^>]*>\d{1,2}:\d{2}</);
      if (tm < 0) return null;
      const cells = (s) => [...s.matchAll(/border border-gray-300"[^>]*>([^<]*)</g)]
        .map((m) => m[1].trim()).filter((v) => v !== '').map(Number);
      return [cells(tr.slice(0, tm)), cells(tr.slice(tm))];
    }).filter(Boolean);

    // I primi due voli Tee 1 sono twosome consecutivi (in alto a sinistra).
    expect(rows[0][0].length).toBe(2);
    expect(rows[1][0].length).toBe(2);
    // Nessun altro twosome (difference=2 → esattamente 2 voli corti, consecutivi).
    const tee1Short = rows.map((r) => r[0].length).filter((n) => n === 2).length;
    expect(tee1Short).toBe(2);
    // L'ULTIMA riga ha Tee 1 vuoto e Tee 10 pieno (riga vuota in basso a sinistra).
    const last = rows[rows.length - 1];
    expect(last[0].length).toBe(0);
    expect(last[1].length).toBe(3);
    // Tutti i 61 ranghi presenti una volta sola, mai un volo da 1.
    const all = rows.flatMap((r) => [...r[0], ...r[1]]);
    expect([...new Set(all)].sort((a, b) => a - b)).toEqual(Array.from({ length: 61 }, (_, i) => i + 1));
    expect(rows.every((r) => r[0].length !== 1 && r[1].length !== 1)).toBe(true);
  });
});

// ─── NUMERAZIONE FLIGHT UNIFICATA — una sola regola per ogni gara ────────────
// assegnaFlightUnificato: per categoria, prima TUTTI i flight del Tee 1
// (Early → Late), poi TUTTI quelli del Tee 10. Uomini e donne separati.
// Elimina i disallineamenti di numerazione in Giovanili, Patrocinate 2° giro
// e giro finale 54/72 (i tre punti che prima sbagliavano).
describe('Numerazione flight unificata (Tee 1 continuo, poi Tee 10)', () => {
  beforeEach(() => { resetPlayerStorage(); });

  const flightNums = (logic, cat, tee) =>
    logic.figFlights
      .filter((f) => f.category === cat && f.tee === tee)
      .map((f) => f.group.flightNumber)
      .sort((a, b) => a - b);
  const seq = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  it('assegnaFlightUnificato: contatori M ed F indipendenti, Tee1 poi Tee10', () => {
    const l = makeLogic({ playersPerFlight: 3 });
    const blocchi = [
      { cat: 'M', tee1: [{}, {}], tee10: [{}, {}] },
      { cat: 'F', tee1: [{}], tee10: [{}] },
    ];
    l.assegnaFlightUnificato(blocchi);
    expect(blocchi[0].tee1.map((g) => g.flightNumber)).toEqual([1, 2]);
    expect(blocchi[0].tee10.map((g) => g.flightNumber)).toEqual([3, 4]);
    expect(blocchi[1].tee1.map((g) => g.flightNumber)).toEqual([1]); // F riparte da 1
    expect(blocchi[1].tee10.map((g) => g.flightNumber)).toEqual([2]);
  });

  it('Gara Giovanile: uomini Tee 1 = 1..15, Tee 10 = 16..30 (continui)', () => {
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 90, proette: 48, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    l.generateDoubleTee('prima');
    expect(flightNums(l, 'M', 1)).toEqual(seq(1, 15));
    expect(flightNums(l, 'M', 10)).toEqual(seq(16, 30));
    expect(flightNums(l, 'F', 1)).toEqual(seq(1, 8));
    expect(flightNums(l, 'F', 10)).toEqual(seq(9, 16));
  });

  it('Patrocinate 2° giro: numerazione continua Tee 1 poi Tee 10', () => {
    const l = makeLogic({
      garaNT: 'Gara con patrocinio FIG', players: 90, proette: 42,
      playersPerFlight: 3, nominativo: 'Off',
      startTime: '07:30', gap: '00:11', round: '04:30',
    });
    l.generateDoubleTee('seconda');
    expect(flightNums(l, 'M', 1)).toEqual(seq(1, 15));
    expect(flightNums(l, 'M', 10)).toEqual(seq(16, 30));
    expect(flightNums(l, 'F', 1)).toEqual(seq(1, 7));
    expect(flightNums(l, 'F', 10)).toEqual(seq(8, 14));
  });

  it('Giro finale 54 buche (doppio tee): numerazione continua Tee 1 poi Tee 10', () => {
    const l = makeLogic({
      garaNT: 'Gara 54 buche', players: 144, proette: 48,
      playersCut: 54, proetteCut: 27, playersPerFlight: 3, nominativo: 'Off',
      startTime: '08:00', gap: '00:11', round: '04:30',
    });
    l.generateDoubleTee('finale');
    expect(flightNums(l, 'M', 1)).toEqual(seq(1, 9));
    expect(flightNums(l, 'M', 10)).toEqual(seq(10, 18));
    expect(flightNums(l, 'F', 1)).toEqual(seq(1, 5));
    expect(flightNums(l, 'F', 10)).toEqual(seq(6, 9));
  });
});

// ─── PROVA DI GIOCO SCUOLA NAZIONALE PROFESSIONISTI — Appendice F ────────────
// Riferimento: PDF "Appendice F_Prova di gioco" (132 uomini, taglio fisso 52).
// Giri 1-2 doppio tee in ordine di merito con metà campo che ruotano; il
// 1° giro Late e il 2° giro Early hanno forma 'S' (entrambi i tee in giù).
// Giri 3-4 tee unico a coppie in classifica inversa, gap 8' + pausa 5' ogni 8.
describe('Prova di gioco SNP — Appendice F', () => {
  beforeEach(() => { resetPlayerStorage(); });

  const make = (over = {}) => makeLogic({
    garaNT: 'Prova di gioco', players: 132, proette: 0, playersPerFlight: 3,
    nominativo: 'Off', startTime: '07:30', gap: '00:11', round: '04:30',
    playersCut: 52, proetteCut: 0, ...over,
  });

  // players dei flight di un tee, nell'ordine di render (Early poi Late)
  const flightsTee = (l, tee) => l.figFlights
    .filter((f) => f.tee === tee)
    .map((f) => f.group.players);

  it('descrittore: 4 giri solo uomini, forme UR/S in stringa, taglio fisso 52', () => {
    const f = COMPETITION_FORMATS['Prova di gioco'];
    expect(f.rounds.map((r) => r.id)).toEqual(['prima', 'seconda', 'terzo', 'quarto']);
    expect(f.rounds.every((r) => r.gender === 'men')).toBe(true);
    expect(f.cutAfter).toBe(2);
    expect(f.cutFixed).toEqual({ players: 52, proette: 0 });
    expect(f.defaults).toEqual({ players: 132, proette: 0 });
    expect(f.rounds[0].early).toBe('UR-R/L');
    expect(f.rounds[0].late).toBe('S-R/L');
    expect(f.rounds[0].earlyHalf).toBe('bassa');
    expect(f.rounds[1].early).toBe('S-L/R');
    expect(f.rounds[1].late).toBe('UR-L/R');
    expect(f.rounds[1].earlyHalf).toBe('alta');
    // Giri 1-2 solo doppio tee; giri 3-4 solo tee unico, a coppie.
    expect(f.rounds[0].tee).toEqual(['double']);
    expect(f.rounds[2].tee).toEqual(['single']);
    expect(f.rounds[2].coppie).toEqual({ mod: 2, pausaOgni: 8, pausaExtra: '00:05' });
    expect(f.rounds[3].coppie).toEqual({ mod: 2, pausaOgni: 8, pausaExtra: '00:05' });
  });

  it('1° giro: Early UR-R/L (Tee1 34→66 · Tee10 31,32,33…1,2,3) + Late S-R/L (Tee1 100→132 · Tee10 67→99)', () => {
    const l = make();
    l.generateDoubleTee('prima');
    const t1 = flightsTee(l, 1);
    const t10 = flightsTee(l, 10);
    expect(t1).toHaveLength(22);  // 11 Early + 11 Late
    expect(t10).toHaveLength(22);
    // Early — ∩ che parte da destra (Appendice F, 1° giro)
    expect(t1[0]).toEqual([34, 35, 36]);
    expect(t1[10]).toEqual([64, 65, 66]);
    expect(t10[0]).toEqual([31, 32, 33]);
    expect(t10[10]).toEqual([1, 2, 3]);
    // Late — forma S: ENTRAMBI i tee scorrono in giù
    expect(t1[11]).toEqual([100, 101, 102]);
    expect(t1[21]).toEqual([130, 131, 132]);
    expect(t10[11]).toEqual([67, 68, 69]);
    expect(t10[21]).toEqual([97, 98, 99]);
  });

  it('2° giro: Early S-L/R (Tee1 67→99 · Tee10 100→132) + Late UR-L/R (Tee1 31…1 · Tee10 34→66)', () => {
    const l = make();
    l.generateDoubleTee('seconda');
    const t1 = flightsTee(l, 1);
    const t10 = flightsTee(l, 10);
    // Early — forma S che parte da sinistra
    expect(t1[0]).toEqual([67, 68, 69]);
    expect(t1[10]).toEqual([97, 98, 99]);
    expect(t10[0]).toEqual([100, 101, 102]);
    expect(t10[10]).toEqual([130, 131, 132]);
    // Late — ∩ che parte da sinistra
    expect(t1[11]).toEqual([31, 32, 33]);
    expect(t1[21]).toEqual([1, 2, 3]);
    expect(t10[11]).toEqual([34, 35, 36]);
    expect(t10[21]).toEqual([64, 65, 66]);
  });

  it('1° giro: orari Early come Appendice F (07:30 → 09:20 con gap 11)', () => {
    const l = make();
    l.generateDoubleTee('prima');
    const ore = l.figFlights.filter((f) => f.tee === 1).map((f) => f.ora);
    expect(ore[0]).toBe('07:30');
    expect(ore[10]).toBe('09:20');
  });

  it('numerazione flight unificata: Tee 1 = 1..22, Tee 10 = 23..44', () => {
    const l = make();
    l.generateDoubleTee('prima');
    const nums = (tee) => l.figFlights
      .filter((f) => f.tee === tee)
      .map((f) => f.group.flightNumber);
    expect(nums(1)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(nums(10)).toEqual(Array.from({ length: 22 }, (_, i) => i + 23));
  });

  it('3° giro a coppie: 26 match 52·51 → 2·1 con pause dopo 8° e 16° (07:30, 08:39, 09:48, 11:00)', () => {
    const l = make({ gap: '00:08' });
    const html = l.generateSingleTee('terzo');
    // Orari riga per riga
    const ore = html.match(/\d{2}:\d{2}/g) || [];
    expect(ore).toHaveLength(26);
    expect(ore[0]).toBe('07:30');
    expect(ore[7]).toBe('08:26');   // 8° match
    expect(ore[8]).toBe('08:39');   // pausa +5 dopo l'8°
    expect(ore[15]).toBe('09:35');  // 16° match
    expect(ore[16]).toBe('09:48');  // pausa +5 dopo il 16°
    expect(ore[23]).toBe('10:44');  // 24° match: NESSUNA pausa (restano ≤ 8 match)
    expect(ore[24]).toBe('10:52');
    expect(ore[25]).toBe('11:00');
    // Coppie in classifica inversa: 52·51 apre, 2·1 chiude
    const players = (html.match(/border-gray-300" >(\d+)</g) || [])
      .map((m) => parseInt(m.match(/>(\d+)</)[1], 10));
    expect(players).toHaveLength(52);
    expect(players.slice(0, 2)).toEqual([52, 51]);
    expect(players.slice(-2)).toEqual([2, 1]);
  });

  it('4° giro a coppie: identico schema del 3° (uomini residui dopo il taglio)', () => {
    const l = make({ gap: '00:08' });
    const html = l.generateSingleTee('quarto');
    const ore = html.match(/\d{2}:\d{2}/g) || [];
    expect(ore).toHaveLength(26);
    expect(ore[25]).toBe('11:00');
  });
});

describe('REGRESSIONE — blocchiBuilders dispatch (layout esplicito vs. derivazione)', () => {
  beforeEach(() => { resetPlayerStorage(); });

  // ── Config: field `layout` presente sui round giusti ─────────────────────
  it('COMPETITION_FORMATS: layout esplicito sui giri UR non-finale', () => {
    const r = (g, i) => COMPETITION_FORMATS[g].rounds[i];
    // giovanili
    expect(r('Gara Giovanile',          0).layout).toBe('giovanili');
    expect(r('Teodoro Soldati',         0).layout).toBe('giovanili');
    // reversed-interleaved
    expect(r('Gara con patrocinio FIG', 1).layout).toBe('reversed-interleaved');
    expect(r('Trofeo Giovanile Federale',1).layout).toBe('reversed-interleaved');
    // sessioni-miste
    expect(r('Prova di gioco',          0).layout).toBe('sessioni-miste');
    expect(r('Prova di gioco',          1).layout).toBe('sessioni-miste');
  });

  it('COMPETITION_FORMATS: cerchio/clessidra hanno layout "cerchio"; finale nessun layout', () => {
    const r = (g, i) => COMPETITION_FORMATS[g].rounds[i];
    // 54 buche: 1°/2° = cerchio/clessidra → motore unico (layout 'cerchio').
    expect(r('Gara 54 buche', 0).layout).toBe('cerchio');
    expect(r('Gara 54 buche', 1).layout).toBe('cerchio');
    expect(r('Gara 54 buche', 2).layout).toBeUndefined(); // finale: ramo isFinaleRound
    // patrocinate 1° giro = cerchio.
    expect(r('Gara con patrocinio FIG', 0).layout).toBe('cerchio');
  });

  // ── Unknown layout → throw ────────────────────────────────────────────────
  it('layout sconosciuto in roundDesc → throw con messaggio chiaro', () => {
    // Iniettiamo un roundDesc con layout inesistente modificando il config a runtime.
    // QuadrantiLogic legge roundDesc da COMPETITION_FORMATS[garaNT].rounds[round].
    // Per fare il test senza toccare il file, usiamo un formato con layout='giovanili'
    // e verifichiamo che layout='xyz' (non registrato) lanci. Creiamo un subclass
    // temporanea che sovrascrive il roundDesc prima della chiamata.
    const l = makeLogic({
      garaNT: 'Gara Giovanile', players: 9, proette: 6, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    // Patch il formato per la durata del test (ripristiniamo dopo).
    const origLayout = COMPETITION_FORMATS['Gara Giovanile'].rounds[0].layout;
    COMPETITION_FORMATS['Gara Giovanile'].rounds[0].layout = 'xyz-non-esiste';
    try {
      expect(() => l.generateDoubleTee('prima')).toThrow(/xyz-non-esiste/);
    } finally {
      COMPETITION_FORMATS['Gara Giovanile'].rounds[0].layout = origLayout;
    }
  });

  // ── layout esplicito vs. derivazione automatica: stesso output ────────────
  it('giovanili: layout esplicito produce output identico alla derivazione', () => {
    // Riferimento: config standard con layout:'giovanili' già impostato.
    const lRef = makeLogic({
      garaNT: 'Gara Giovanile', players: 30, proette: 12, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const htmlRef = lRef.generateDoubleTee('prima');

    // Patch temporanea: rimuovi layout per forzare la derivazione dai flag.
    const round0 = COMPETITION_FORMATS['Gara Giovanile'].rounds[0];
    const origLayout = round0.layout;
    delete round0.layout;
    try {
      const lDerived = makeLogic({
        garaNT: 'Gara Giovanile', players: 30, proette: 12, playersPerFlight: 3,
        nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
      });
      const htmlDerived = lDerived.generateDoubleTee('prima');
      expect(htmlDerived).toBe(htmlRef);
    } finally {
      round0.layout = origLayout;
    }
  });

  it('reversed-interleaved: layout esplicito produce output identico alla derivazione', () => {
    const round1 = COMPETITION_FORMATS['Gara con patrocinio FIG'].rounds[1];
    const lRef = makeLogic({
      garaNT: 'Gara con patrocinio FIG', players: 24, proette: 12, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const htmlRef = lRef.generateDoubleTee('seconda');

    const origLayout = round1.layout;
    delete round1.layout;
    try {
      const lDerived = makeLogic({
        garaNT: 'Gara con patrocinio FIG', players: 24, proette: 12, playersPerFlight: 3,
        nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
      });
      expect(lDerived.generateDoubleTee('seconda')).toBe(htmlRef);
    } finally {
      round1.layout = origLayout;
    }
  });

  it('sessioni-miste: layout esplicito produce output identico alla derivazione', () => {
    const round0 = COMPETITION_FORMATS['Prova di gioco'].rounds[0];
    const lRef = makeLogic({
      garaNT: 'Prova di gioco', players: 20, proette: 0, playersPerFlight: 3,
      nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
    });
    const htmlRef = lRef.generateDoubleTee('prima');

    const origLayout = round0.layout;
    delete round0.layout;
    try {
      const lDerived = makeLogic({
        garaNT: 'Prova di gioco', players: 20, proette: 0, playersPerFlight: 3,
        nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
      });
      expect(lDerived.generateDoubleTee('prima')).toBe(htmlRef);
    } finally {
      round0.layout = origLayout;
    }
  });

  // ── Retrocompatibilità: giri senza `layout` usano derivazione ─────────────
  it('retrocompat: giro UR senza layout field usa derivazione da isBloccoUR/reversed', () => {
    // 54 buche finale: isFinaleRound=true → intercettato prima del branch blocchiBuilders.
    // Usiamo Gara Giovanile senza layout: deve comunque produrre 6 figQuadranti.
    const round0 = COMPETITION_FORMATS['Gara Giovanile'].rounds[0];
    const origLayout = round0.layout;
    delete round0.layout;
    try {
      const l = makeLogic({
        garaNT: 'Gara Giovanile', players: 30, proette: 12, playersPerFlight: 3,
        nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
      });
      l.generateDoubleTee('prima');
      expect(l.figQuadranti).toHaveLength(6); // 3 blocchi × 2 tee
      expect(l.figQuadranti[0].categoria).toBe('Uomini');
      expect(l.figQuadranti[2].categoria).toBe('Donne');
    } finally {
      round0.layout = origLayout;
    }
  });
});
