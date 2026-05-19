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
import { DEFAULT_CONFIG } from './config.js';
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
    // Donne hanno colore rosso
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
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const firstRow = bodyHtml.split('</tr>')[0];
    // Prima riga: Flight 1, Tee 1, poi i 3 player nel gruppo (28-30) → "30,29,28"
    expect(firstRow).toContain('>30<');
    expect(firstRow).toContain('>29<');
    expect(firstRow).toContain('>28<');
    // Non deve esserci nessun rank della front-half (1-27) nella prima riga
    expect(firstRow).not.toMatch(/>27</);
  });

  it('blocco 1 ultimo gruppo = (52,53,54) → display "54 53 52"', () => {
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const rows = bodyHtml.split('</tr>').slice(0, -1); // ultima split è vuota
    // 9° flight (index 8): back-half ultimo gruppo
    const row9 = rows[8];
    expect(row9).toContain('>54<');
    expect(row9).toContain('>53<');
    expect(row9).toContain('>52<');
  });

  it('blocco 2 = donne, primo gruppo (25-27), ultimo (1-3) → leader donne ultime', () => {
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const rows = bodyHtml.split('</tr>').slice(0, -1);
    // Prima riga donne è la 10° flight (index 9)
    const row10 = rows[9];
    expect(row10).toContain('color:red');
    expect(row10).toContain('>27<');
    expect(row10).toContain('>26<');
    expect(row10).toContain('>25<');
    // Ultima riga donne è la 18° flight (index 17)
    const row18 = rows[17];
    expect(row18).toContain('color:red');
    expect(row18).toContain('>3<');
    expect(row18).toContain('>2<');
    expect(row18).toContain('>1<');
  });

  it('blocco 3 = front-half uomini, primo (25-27) ultimo (1-3) → leader uomini ultimi', () => {
    const html = logic.generateSingleTee('finale');
    const bodyHtml = html.split('<tbody>')[1] || '';
    const rows = bodyHtml.split('</tr>').slice(0, -1);
    // 19° flight (index 18) = primo gruppo front-half
    const row19 = rows[18];
    expect(row19).toContain('>27<');
    expect(row19).toContain('>26<');
    expect(row19).toContain('>25<');
    expect(row19).not.toContain('color:red');
    // 27° flight (index 26) = ultimo gruppo front-half = leader 1,2,3
    const row27 = rows[26];
    expect(row27).toContain('>3<');
    expect(row27).toContain('>2<');
    expect(row27).toContain('>1<');
    expect(row27).not.toContain('color:red');
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
    // Verifica che NON ci sia il flight delle donne a 09:39 (sarebbe senza stacco)
    const bodyHtml = html.split('<tbody>')[1] || '';
    const row10 = bodyHtml.split('</tr>')[9];
    expect(row10).toContain('>09:45<');
  });

  it('orari: stacco extra tra blocco 2 e blocco 3 → blocco 3 inizia 11:30 (non 11:24)', () => {
    const html = logic.generateSingleTee('finale');
    expect(html).toContain('>11:30<');
    // Ultimo flight donne (riga 18): 09:45 + 8*11 = 11:13 ✓
    expect(html).toContain('>11:13<');
    // Ultimo flight uomini front (riga 27): 11:30 + 8*11 = 12:58 ✓
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

  it('se garaNT != "Gara 54 buche", round=finale ricade nella logica normale (no crash)', () => {
    const logic36 = makeLogic({
      players: 12,
      proette: 6,
      playersPerFlight: 3,
      nominativo: 'Off',
      garaNT: 'Gara 36 buche',
      startTime: '08:00',
      gap: '00:10',
    });
    // 'finale' su 36 buche → ricade nel ramo seconda (l'unico altro ramo)
    expect(() => logic36.generateSingleTee('finale')).not.toThrow();
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
    // Stacco singolo: tra blocco1 e blocco3 → blocco3 inizia a 09:28 + 17 min = 09:45
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
    // Donne stilizzate rosse
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
