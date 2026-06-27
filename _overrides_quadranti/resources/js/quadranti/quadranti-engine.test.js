// ════════════════════════════════════════════════════════════════════════
// Test del MOTORE UNICO (espandiSezione / renderQuadranti) validato contro
// le tabelle dei PDF ufficiali (Schemi partenze/), estratte in
// __fixtures__pdf.json. Verità INDIPENDENTE dal codice: niente snapshot
// auto-generati che potrebbero ricongelare un bug.
// ════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const localStorageMock = (() => {
  let s = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
    clear: () => { s = {}; },
  };
})();
beforeAll(() => vi.stubGlobal('localStorage', localStorageMock));

import { QuadrantiLogic } from './quadranti-logic.js';
import { DEFAULT_CONFIG } from './config.js';
import { storage } from './utils.js';
import fixtures from './__fixtures__pdf.json';

const mk = (o = {}) => new QuadrantiLogic({ ...DEFAULT_CONFIG, ...o });
const reset = () => { storage.remove('atleti'); storage.remove('atlete'); };

// Estrae, per ogni riga del body, i terzetti giocatore (uomini=nero, donne=rosso).
// Per il tee unico ogni riga ha 1 terzetto; per il doppio tee 2 (Tee1, Tee10).
function bodyRows(html) {
  const body = html.split('<tbody>')[1] || html;
  return body.split('</tr>').slice(0, -1).map((tr) => {
    const cells = [...tr.matchAll(/border border-gray-300"([^>]*)>([^<]*)</g)]
      .map((m) => (m[2].replace(/&times;.*$/, '').replace(/<.*$/, '').trim()))
      .filter((v) => v !== '');
    return cells.map(Number).filter((n) => !Number.isNaN(n));
  }).filter((r) => r.length > 0);
}

describe('MOTORE · espandiSezione (core)', () => {
  const l = mk();

  it('ordine di merito: gruppi e interno crescenti', () => {
    expect(l.espandiSezione(1, 9, 3, 'asc', 'asc')).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  });

  it('gruppi decrescenti, interno crescente (single tee qualificazione)', () => {
    expect(l.espandiSezione(1, 9, 3, 'asc', 'desc')).toEqual([[7, 8, 9], [4, 5, 6], [1, 2, 3]]);
  });

  it('ordine di classifica: interno decrescente', () => {
    expect(l.espandiSezione(1, 9, 3, 'desc', 'desc')).toEqual([[9, 8, 7], [6, 5, 4], [3, 2, 1]]);
  });

  it('twosome ai ranghi più alti, in TESTA (caso utente 62M, sezione 37..62)', () => {
    const rows = l.espandiSezione(37, 62, 3, 'asc', 'desc');
    expect(rows[0]).toEqual([61, 62]);     // volo 1 = twosome crescente
    expect(rows[1]).toEqual([58, 59, 60]); // volo 2 pieno
    expect(rows[rows.length - 1]).toEqual([37, 38, 39]);
  });

  it('twosome anche con sezione corta (1..8): [7,8] in testa', () => {
    expect(l.espandiSezione(1, 8, 3, 'asc', 'desc')).toEqual([[7, 8], [4, 5, 6], [1, 2, 3]]);
  });
});

describe('MOTORE · tee unico qualificazione (A1/A3 — interno crescente, twosome in testa)', () => {
  beforeEach(reset);

  it('Gara Giovanile 62M: volo 1 = [61,62], volo 2 = [58,59,60]', () => {
    const html = mk({ garaNT: 'Gara Giovanile', players: 62, proette: 0, doppiePartenze: 'Tee Unico' })
      .generateSingleTee('prima');
    const rows = bodyRows(html);
    expect(rows[0]).toEqual([61, 62]);
    expect(rows[1]).toEqual([58, 59, 60]);
  });

  it('tutti i terzetti pieni sono CRESCENTI (Teodoro 90M/42F tee unico)', () => {
    const html = mk({ garaNT: 'Teodoro Soldati', players: 90, proette: 42, doppiePartenze: 'Tee Unico' })
      .generateSingleTee('prima');
    const full = bodyRows(html).filter((r) => r.length === 3);
    const allAsc = full.every((r) => r[0] < r[1] && r[1] < r[2]);
    expect(allAsc).toBe(true);
  });

  it('54 buche tee unico: terzetti crescenti (era discendente — bug A1)', () => {
    const html = mk({ garaNT: 'Gara 54 buche', players: 54, proette: 27, doppiePartenze: 'Tee Unico' })
      .generateSingleTee('prima');
    const full = bodyRows(html).filter((r) => r.length === 3);
    expect(full.every((r) => r[0] < r[1] && r[1] < r[2])).toBe(true);
  });
});

describe('FIXTURE PDF · doppio tee UR (ordine combacia con i PDF ufficiali)', () => {
  beforeEach(reset);

  // Patrocinate 2° giro = "ORDINE DI CLASSIFICA": REGOLA per-tee (confermata
  // dall'utente; il PDF aveva il Tee 10 errato): Tee 1 'reversed' (decrescente),
  // Tee 10 crescente.
  it('Patrocinate 2° giro (90M/42F): Tee 1 reversed (desc), Tee 10 crescente', () => {
    const html = mk({ garaNT: 'Gara con patrocinio FIG', players: 90, proette: 42 })
      .generateDoubleTee('seconda');
    const rows = bodyRows(html).slice(0, 7); // uomini Early
    const tee1desc = rows.every((r) => r[0] > r[1] && r[1] > r[2]);
    const tee10asc = rows.every((r) => r[3] < r[4] && r[4] < r[5]);
    expect(tee1desc, 'Tee 1 deve essere decrescente (reversed)').toBe(true);
    expect(tee10asc, 'Tee 10 deve essere crescente').toBe(true);
  });

  // 54 buche · finale (3° giro per classifica) doppio tee: combacia col PDF.
  it('54 buche finale doppio tee: prime righe = PDF (TEE 1 E 10)', () => {
    const html = mk({
      garaNT: 'Gara 54 buche', players: 54, proette: 27, playersCut: 54, proetteCut: 27,
    }).generateDoubleTee('finale');
    const rows = bodyRows(html);
    fixtures.g54_finale.rows.slice(0, 4).forEach((pdf, i) => {
      expect(rows[i]).toEqual([...pdf[0].p, ...pdf[1].p]);
    });
  });
});

describe('FIXTURE PDF · 54 buche finale tee unico (B1 — back-half a gruppi crescenti)', () => {
  beforeEach(reset);

  it('back-half (28-54) gruppi CRESCENTI, interno decrescente: 30 29 28 → 54 53 52', () => {
    const html = mk({
      garaNT: 'Gara 54 buche', players: 54, proette: 27, playersCut: 54, proetteCut: 27,
      doppiePartenze: 'Tee Unico',
    }).generateSingleTee('finale');
    const rows = bodyRows(html);
    expect(rows[0]).toEqual([30, 29, 28]); // primo volo back-half = best back-half
    expect(rows[8]).toEqual([54, 53, 52]); // 9° volo = peggiori
    expect(rows[9]).toEqual([27, 26, 25]); // inizio front-half (decrescente)
  });
});

describe('REGOLE 54/72 cerchio · twosome in testa (1°) + 2° speculare', () => {
  beforeEach(reset);
  const cfg = {
    garaNT: 'Gara 54 buche', players: 61, proette: 19, playersPerFlight: 3,
    nominativo: 'Off', startTime: '08:00', gap: '00:10', round: '04:30',
  };
  // Voli per-tee (Tee 1 = prima dell'orario, Tee 10 = dopo); solo celle uomini (nere).
  const teeRows = (html) => {
    const body = html.split('<tbody>')[1] || '';
    return body.split('</tr>').map((tr) => {
      const tm = tr.search(/font-medium"[^>]*>\d{1,2}:\d{2}</);
      if (tm < 0) return null;
      const cell = (s) => [...s.matchAll(/border border-gray-300"([^>]*)>(\d+)</g)]
        .filter((m) => !/red/.test(m[1])).map((m) => Number(m[2]));
      return { t1: cell(tr.slice(0, tm)), t10: cell(tr.slice(tm)) };
    }).filter(Boolean);
  };

  it('Regola 2 — 1° giro: i due twosome uomini sono i PRIMI voli (Tee 1, in testa)', () => {
    const rows = teeRows(mk(cfg).generateDoubleTee('prima'));
    expect(rows[0].t1.length).toBe(2);   // flight 1 = twosome
    expect(rows[1].t1.length).toBe(2);   // flight 2 = twosome
    expect(rows[2].t1.length).toBe(3);   // poi voli pieni
    // difference(61)=2 → esattamente due voli corti uomini, entrambi in testa.
    const short = rows.filter((r) => r.t1.length === 2).length;
    expect(short).toBe(2);
  });

  it('Regola 1 — 2° giro SPECULARE: i twosome uomini NON sono in testa (vanno in Late Tee 10)', () => {
    const rows = teeRows(mk(cfg).generateDoubleTee('seconda'));
    // 2° giro: Early apre coi ranghi ALTI pieni (niente twosome in testa).
    expect(rows[0].t1.length).toBe(3);
    // I due twosome esistono ancora e sono su Tee 10 (remap Q1→Q4).
    const shortT10 = rows.filter((r) => r.t10.length === 2).length;
    expect(shortT10).toBe(2);
    expect(rows.some((r) => r.t1.length === 2)).toBe(false); // nessun twosome su Tee 1
  });
});

describe('REGOLE patrocinate/trofei · 2° giro = MIRROR bilanciato del 1°', () => {
  beforeEach(reset);
  // Conta righe Early/Late distinte per genere (uomini=nero, donne=rosso).
  // I blocchi sono sequenziali: la prima metà delle righe è Early, la seconda Late.
  const counts = (html) => {
    const body = html.split('<tbody>')[1] || '';
    const rows = body.split('</tr>').map((tr) => {
      if (!/font-medium"[^>]*>\d{1,2}:\d{2}</.test(tr)) return null;
      const cells = [...tr.matchAll(/border border-gray-300"([^>]*)>(\d+)</g)];
      return cells.length ? { donne: cells.some((m) => /red/.test(m[1])) } : null;
    }).filter(Boolean);
    const half = rows.length / 2;
    const c = { mE: 0, wE: 0, mL: 0, wL: 0 };
    rows.forEach((r, i) => {
      const early = i < half;
      if (r.donne) early ? c.wE++ : c.wL++;
      else early ? c.mE++ : c.mL++;
    });
    return c;
  };

  for (const [gara, P, W] of [
    ['Gara con patrocinio FIG', 102, 42],
    ['Trofeo Giovanile Federale', 90, 42],
  ]) {
    it(`${gara} ${P}/${W}: Early === Late e 2° = swap del 1° (uomini E donne)`, () => {
      const c1 = counts(mk({ garaNT: gara, players: P, proette: W }).generateDoubleTee('prima'));
      const c2 = counts(mk({ garaNT: gara, players: P, proette: W }).generateDoubleTee('seconda'));
      // Bilanciamento Early ≈ Late in entrambi i giri.
      expect(c1.mE + c1.wE).toBe(c1.mL + c1.wL);
      expect(c2.mE + c2.wE).toBe(c2.mL + c2.wL);
      // 2° giro = MIRROR esatto del 1°: Early↔Late scambiati per uomini E donne.
      expect(c2.mE).toBe(c1.mL);
      expect(c2.mL).toBe(c1.mE);
      expect(c2.wE).toBe(c1.wL);
      expect(c2.wL).toBe(c1.wE);
    });
  }
});
