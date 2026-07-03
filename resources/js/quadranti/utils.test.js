import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';

// Mock localStorage in-memory (jsdom non garantisce clear() in tutti gli ambienti)
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
import {
  range,
  formatMinutes,
  addTime,
  halfTime,
  chunkArray,
  debounce,
  formatDate,
  storage,
  escapeHtml,
} from './utils.js';

// ─── range ───────────────────────────────────────────────────────────────────
describe('range', () => {
  it('genera array da start a end inclusivo', () => {
    expect(range(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it('con un solo argomento genera da 0 a N', () => {
    expect(range(3)).toEqual([0, 1, 2, 3]);
  });

  it('start === end restituisce array con un solo elemento', () => {
    expect(range(5, 5)).toEqual([5]);
  });
});

// ─── formatMinutes ───────────────────────────────────────────────────────────
describe('formatMinutes', () => {
  it('converte minuti in HH:MM', () => {
    expect(formatMinutes(90)).toBe('1:30');
    expect(formatMinutes(60)).toBe('1:00');
    expect(formatMinutes(5)).toBe('0:05');
    expect(formatMinutes(0)).toBe('0:00');
  });
});

// ─── addTime ─────────────────────────────────────────────────────────────────
describe('addTime', () => {
  it('somma due orari senza riporto', () => {
    expect(addTime('08:00', '01:30')).toBe('09:30');
  });

  it('gestisce il riporto dei minuti', () => {
    expect(addTime('08:50', '00:20')).toBe('09:10');
  });

  it('somma ore e minuti misti', () => {
    expect(addTime('00:10', '00:10')).toBe('00:20');
    expect(addTime('04:30', '04:30')).toBe('09:00');
  });
});

// ─── halfTime ────────────────────────────────────────────────────────────────
describe('halfTime', () => {
  it('dimezza un orario pari', () => {
    expect(halfTime('04:30')).toBe('2:15');
  });

  it('tronca verso il basso per durate dispari', () => {
    expect(halfTime('00:09')).toBe('0:04');
  });

  it('gestisce ore intere', () => {
    expect(halfTime('02:00')).toBe('1:00');
  });
});

// ─── chunkArray ──────────────────────────────────────────────────────────────
describe('chunkArray', () => {
  it('divide array in chunk uguali', () => {
    expect(chunkArray([1, 2, 3, 4, 6], 2)).toEqual([[1, 2], [3, 4], [6]]);
  });

  it('chunk size maggiore della lunghezza array', () => {
    expect(chunkArray([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('array vuoto restituisce array vuoto', () => {
    expect(chunkArray([], 3)).toEqual([]);
  });
});

// ─── debounce ─────────────────────────────────────────────────────────────────
describe('debounce', () => {
  it('chiama la funzione una sola volta dopo il delay', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────
describe('formatDate', () => {
  it('formatta data in DD-MM-YYYY', () => {
    expect(formatDate(new Date(2025, 0, 5))).toBe('05-01-2025');  // Gennaio = 0
    expect(formatDate(new Date(2025, 11, 31))).toBe('31-12-2025');
  });
});

// ─── storage ─────────────────────────────────────────────────────────────────
describe('storage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('set e get di un oggetto JSON', () => {
    storage.set('test', { x: 1 });
    expect(storage.get('test', null)).toEqual({ x: 1 });
  });

  it('get restituisce default se chiave assente', () => {
    expect(storage.get('missing', 'default')).toBe('default');
  });

  it('remove elimina la chiave', () => {
    storage.set('key', 'val');
    storage.remove('key');
    expect(storage.get('key', null)).toBeNull();
  });

  it('clear svuota tutto', () => {
    storage.set('a', 1);
    storage.set('b', 2);
    storage.clear();
    expect(storage.get('a', null)).toBeNull();
    expect(storage.get('b', null)).toBeNull();
  });
});

// ─── escapeHtml (audit J1: dati esterni federgolf/Excel nel DOM) ─────────────
describe('escapeHtml', () => {
  it('neutralizza markup HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>'))
      .toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapa & (evita doppie entità al secondo giro di decode)', () => {
    expect(escapeHtml('Rossi & Bianchi')).toBe('Rossi &amp; Bianchi');
  });

  it('non altera nomi italiani con apostrofi e accenti', () => {
    expect(escapeHtml("D'Angelo Nicolò")).toBe("D'Angelo Nicolò");
  });

  it('stringifica numeri (modalità numerica quadranti)', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('null/undefined diventano stringa vuota', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
