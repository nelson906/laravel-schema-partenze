// ════════════════════════════════════════════════════════════════════════
// TEST DI REGRESSIONE — invarianti universali §3.1 su TUTTI i formati.
//
// Questi test NON guardano il layout esatto: verificano le REGOLE che devono
// valere SEMPRE, qualunque sia il motore. Catturano i bug che gli snapshot non
// segnalavano (es. il "giocatore solo").
//
// Invarianti (MODELLO_QUADRANTI.md §3.1):
//   I1. MAI un volo con UN solo giocatore (un giocatore non può giocare solo).
//   I2. Tutti i ranghi 1..N (uomini) e 1..M (donne) presenti ESATTAMENTE una volta.
//   I3. Numero di voli corti (mod-1 giocatori) coerente con la difference.
//   I4. Ordine interno del terzetto: crescente (merito) o decrescente (classifica).
// ════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const localStorageMock = (() => {
  let s = {};
  return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; }, clear: () => { s = {}; } };
})();
beforeAll(() => vi.stubGlobal('localStorage', localStorageMock));

import { QuadrantiLogic } from './quadranti-logic.js';
import { DEFAULT_CONFIG } from './config.js';
import { storage } from './utils.js';

const mk = (o = {}) => new QuadrantiLogic({ ...DEFAULT_CONFIG, ...o });
const reset = () => { storage.remove('atleti'); storage.remove('atlete'); };

// Estrae i VOLI dal corpo tabella. Ogni cella-giocatore ha
// `border-gray-300" style="color: black|red"`; le celle flight/tee/orario hanno
// `font-medium`. Le celle vuote di un volo corto restano (contenuto ""); il lato
// tee vuoto usa colspan (non è cella-giocatore). Raggruppa per `mod`.
function parseFlights(html, mod) {
  const body = html.includes('<tbody>') ? html.split('<tbody>')[1] : html;
  const flights = [];
  // Celle-giocatore: classe `border-gray-300"` (flight/tee/orario hanno
  // `border-gray-300 font-medium"`). Il volo Tee 1 sono le celle PRIMA della cella
  // Orario (HH:MM, font-medium); il volo Tee 10 quelle DOPO. Così le celle vuote
  // (volo corto o lato vuoto in colspan) non disallineano il raggruppamento.
  const cellsOf = (s) => [...s.matchAll(/border border-gray-300"([^>]*)>([^<]*)</g)]
    .map((m) => ({ cat: /red/.test(m[1]) ? 'F' : 'M', val: m[2].trim() }));
  const pushFlight = (cells, tee) => {
    if (cells.length === 0) return;
    const ranks = cells.map((c) => c.val).filter((v) => v !== '').map(Number);
    const cat = (cells.find((c) => c.val !== '') || cells[0]).cat;
    flights.push({ cat, ranks, size: ranks.length, tee });
  };
  body.split('</tr>').forEach((tr) => {
    const tm = tr.search(/font-medium"[^>]*>\d{1,2}:\d{2}</);
    if (tm < 0) return; // intestazione o riga separatore
    pushFlight(cellsOf(tr.slice(0, tm)), 1);   // Tee 1 (prima dell'orario)
    pushFlight(cellsOf(tr.slice(tm)), 10);     // Tee 10 (dopo l'orario)
  });
  return flights;
}

function checkInvariants(html, { players, proette, mod = 3, internal }) {
  const flights = parseFlights(html, mod);

  // I1 — nessun volo con UN solo giocatore
  const lone = flights.filter((f) => f.size === 1);
  expect(lone, `volo con un solo giocatore: ${JSON.stringify(lone)}`).toEqual([]);

  // I2 — tutti i ranghi presenti una volta sola, per categoria
  const ranksOf = (cat) => flights.filter((f) => f.cat === cat).flatMap((f) => f.ranks);
  const men = ranksOf('M'); const women = ranksOf('F');
  const expectSet = (arr, n, label) => {
    const sorted = [...arr].sort((a, b) => a - b);
    expect(sorted.length, `${label}: conteggio`).toBe(n);
    expect(new Set(arr).size, `${label}: duplicati`).toBe(n);
    expect(sorted, `${label}: set`).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  };
  expectSet(men, players, 'uomini');
  if (proette > 0) expectSet(women, proette, 'donne');

  // I4 — ordine interno dei voli PIENI, PER-TEE. `internal` = {tee1, tee10}.
  if (internal) {
    const asc  = (f) => f.ranks.every((v, i) => i === 0 || f.ranks[i - 1] < v);
    const desc = (f) => f.ranks.every((v, i) => i === 0 || f.ranks[i - 1] > v);
    const chk = { asc, desc };
    const full = flights.filter((f) => f.size === mod);
    const t1 = full.filter((f) => f.tee === 1).every(chk[internal.tee1]);
    const t10 = full.filter((f) => f.tee === 10).every(chk[internal.tee10]);
    expect(t1, `Tee 1: terzetti devono essere ${internal.tee1}`).toBe(true);
    expect(t10, `Tee 10: terzetti devono essere ${internal.tee10}`).toBe(true);
  }

  // I3 — voli corti coerenti con difference
  const diff = (Math.ceil(players / mod) * mod) - players;
  const shortMen = flights.filter((f) => f.cat === 'M' && f.size === mod - 1).length;
  // diff voli corti (mod-1 giocatori). diff∈{0,1,2} per mod=3.
  expect(shortMen, `voli corti uomini attesi=${diff}`).toBe(diff);

  return flights;
}

// ─── SWEEP doppio tee: tutti i formati × conteggi (incl. non-multipli) ───────
// internal = { tee1, tee10 }. Tee 10 sempre crescente nelle UR; Tee 1 'desc'
// (reversed) nei giri di classifica, 'asc' nei giri di merito. Cerchio (54/72)
// = entrambi crescenti (generatePlayerGroups).
const ASC = { tee1: 'asc', tee10: 'asc' };
const CLASSIFICA_UR = { tee1: 'desc', tee10: 'asc' };
const DOUBLE_CASES = [
  ['Gara Giovanile', 'prima', ASC],
  ['Teodoro Soldati', 'prima', ASC],
  ['Gara con patrocinio FIG', 'prima', ASC],
  ['Gara con patrocinio FIG', 'seconda', CLASSIFICA_UR],
  ['Trofeo Giovanile Federale', 'prima', ASC],
  ['Trofeo Giovanile Federale', 'seconda', CLASSIFICA_UR],
  ['Gara 54 buche', 'prima', ASC],
  ['Gara 54 buche', 'seconda', ASC],
  ['Gara 72 buche', 'prima', ASC],
  ['Gara 72 buche', 'seconda', ASC],
];
const COUNTS = [60, 61, 62, 63, 64, 65, 66];

describe('REGRESSIONE — invarianti doppio tee (no giocatore solo, ranghi completi)', () => {
  beforeEach(reset);
  DOUBLE_CASES.forEach(([garaNT, round, internal]) => {
    COUNTS.forEach((players) => {
      [0, 24].forEach((proette) => {
        it(`${garaNT} · ${round} · ${players}U/${proette}D`, () => {
          const html = mk({
            garaNT, players, proette, playersPerFlight: 3, nominativo: 'Off',
            startTime: '08:00', gap: '00:10', round: '04:30',
          }).generateDoubleTee(round);
          checkInvariants(html, { players, proette, internal });
        });
      });
    });
  });
});

// ─── SWEEP tee unico: qualificazione ─────────────────────────────────────────
describe('REGRESSIONE — invarianti tee unico qualificazione', () => {
  beforeEach(reset);
  [['Gara Giovanile', 'prima', ASC], ['Teodoro Soldati', 'prima', ASC],
   ['Gara 54 buche', 'prima', ASC], ['Gara 54 buche', 'seconda', ASC]]
    .forEach(([garaNT, round, internal]) => {
      COUNTS.forEach((players) => {
        it(`${garaNT} · ${round} · tee unico · ${players}U`, () => {
          const html = mk({
            garaNT, players, proette: 0, playersPerFlight: 3,
            doppiePartenze: 'Tee Unico', nominativo: 'Off',
            startTime: '08:00', gap: '00:10', round: '04:30',
          }).generateSingleTee(round);
          checkInvariants(html, { players, proette: 0, internal });
        });
      });
    });
});

// ─── Finale per classifica (interno decrescente) ─────────────────────────────
describe('REGRESSIONE — invarianti finale per classifica', () => {
  beforeEach(reset);
  [52, 53, 54, 55].forEach((cut) => {
    it(`Gara 54 finale · tee unico · ${cut} qualificati`, () => {
      const html = mk({
        garaNT: 'Gara 54 buche', players: 144, proette: 48,
        playersCut: cut, proetteCut: 0, playersPerFlight: 3,
        doppiePartenze: 'Tee Unico', nominativo: 'Off',
        startTime: '08:00', gap: '00:11', round: '04:30',
      }).generateSingleTee('finale');
      checkInvariants(html, { players: cut, proette: 0, internal: { tee1: 'desc', tee10: 'desc' } });
    });
    it(`Gara 54 finale · doppio tee · ${cut} qualificati`, () => {
      const html = mk({
        garaNT: 'Gara 54 buche', players: 144, proette: 48,
        playersCut: cut, proetteCut: 0, playersPerFlight: 3,
        nominativo: 'Off', startTime: '08:00', gap: '00:11', round: '04:30',
      }).generateDoubleTee('finale');
      checkInvariants(html, { players: cut, proette: 0, internal: { tee1: 'desc', tee10: 'desc' } });
    });
  });
});
