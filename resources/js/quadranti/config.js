/**
 * Configuration module for Quadranti (Starting Times Simulator)
 * Contains all default values and constants used throughout the application
 */

export const DEFAULT_CONFIG = {
  // Player configuration
  players: 144,
  proette: 48,
  playersPerFlight: 3,

  // Giro finale (post-taglio) — numero di qualificati per il terzo giro.
  // Validi solo quando giornata === 'finale': sono distinti da players/proette
  // perché dopo le 36 buche il taglio riduce il campo (es. da 144 a 54 uomini).
  // Default 0 = nessun taglio impostato (l'utente li edita quando passa al finale).
  playersCut: 0,
  proetteCut: 0,
  
  // Competition configuration
  giornata: 'prima',
  garaNT: 'Gara 54 buche',
  doppiePartenze: 'Doppie Partenze',
  compatto: 'Early/Late',
  
  // Time configuration
  round: '04:30',
  startTime: '08:00',
  gap: '00:10',
  
  // Display configuration
  nominativo: 'Off',
  
  // Geographic areas for ephemeris calculation
  geoArea: 'NORD OVEST'
};

export const COMPETITION_TYPES = {
  GARA_54: 'Gara 54 buche',
  GARA_72: 'Gara 72 buche',
  PATROCINIO: 'Gara con patrocinio FIG',
  TROFEO_GIOVANILE: 'Trofeo Giovanile Federale',
  GARA_GIOVANILE: 'Gara Giovanile',
  TEODORO_SOLDATI: 'Teodoro Soldati'
};

export const TEE_TYPES = {
  DOUBLE: 'Doppie Partenze',
  SINGLE: 'Tee Unico'
};


export const ROUND_TYPES = {
  FIRST: 'prima',
  SECOND: 'seconda',
  // Giro finale 54 buche: tee unico, ordine di classifica, sempre numerico.
  // Struttura a 3 blocchi (back-half U → donne → front-half U) descritta in
  // generateSingleTee. Visibile solo quando garaNT === 'Gara 54 buche'.
  FINAL: 'finale',
  // Giri 3 e 4 della Gara 72 buche: entrambi usano il template del giro
  // finale. Il 4° giro è SOLO uomini (le donne giocano 54 buche = 3 giri).
  // Vedi COMPETITION_FORMATS['Gara 72 buche'].
  THIRD: 'terzo',
  FOURTH: 'quarto'
};

/**
 * ════════════════════════════════════════════════════════════════════════
 * COMPETITION_FORMATS — tabella delle caratteristiche delle gare.
 *
 * Tabella di SOLI DATI: per ogni formato elenca i giri, e per ogni giro
 * descrive COME sono disposti i quadranti. È il descrittore che pilota il
 * motore di rendering — nessuna procedura per-formato cablata nel codice.
 *
 * CAMPI DI OGNI GIRO (round):
 *   - id        chiave interna del giro (combacia con ROUND_TYPES)
 *   - label     etichetta mostrata all'utente
 *   - type      'qualifying' = campo pieno ; 'finale' = campo ridotto post-taglio
 *   - gender    'both' = uomini + donne ; 'men' = solo uomini
 *   - tee       varianti tee ammesse: 'double' e/o 'single'
 *   - early     quadranti della sezione Early: { forma, verso }
 *   - late      quadranti della sezione Late:  { forma, verso }
 *               forma : 'U' (∪) oppure 'UR' (∩) — la curvatura dell'arco.
 *               verso : 'sn-dx' oppure 'dx-sn' — la direzione di lettura,
 *                       cioè se la sequenza dei numeri cresce verso destra
 *                       o verso sinistra.
 *               forma e verso sono INDIPENDENTI: una UR può essere sn-dx o
 *               dx-sn, e così una U. (NON si usa "clockwise": il senso orario
 *               si legge sn→dx su una ∩ ma dx→sn su una ∪ — ambiguo.) Esempi:
 *                 cerchio   (1° giro) = early {UR,dx-sn} · late {U, dx-sn}
 *                 clessidra (2° giro) = early {U, sn-dx} · late {UR,sn-dx}
 *                 blocco UR (giovanili/patrocinate 2°/finale) = entrambe {UR,sn-dx}
 *   - reversed  true = terzetto interno invertito (3·2·1 invece di 1·2·3)
 *
 * Il motore manda al ramo "∩" i giri con entrambe le sezioni di forma 'UR';
 * gli altri (sezioni miste = cerchio/clessidra) vanno al flusso di
 * qualificazione storico. Il `verso` orienta l'arco ∩ (quale tee prende la
 * metà bassa dei ranghi).
 *
 * CAMPI DI OGNI FORMATO:
 *   - label     nome esteso mostrato all'utente
 *   - cutAfter  numero di giri di qualificazione dopo cui scatta il taglio
 *               (null = nessun taglio)
 *   - rounds    sequenza ordinata dei giri
 *
 * Conteggi incompleti (difference): regola in MODELLO_QUADRANTI.md §3.1.
 * Numerazione flight: regola unica in assegnaFlightUnificato (quadranti-logic.js)
 * — Tee 1 continuo poi Tee 10, contatori uomini/donne separati.
 *
 * NOTA: la "Gara 36 buche" è stata RIMOSSA — sostituita dalle Gare con
 * patrocinio FIG, che hanno lo stesso schema a 2 giri.
 * ════════════════════════════════════════════════════════════════════════
 */
export const COMPETITION_FORMATS = {
  // 54 / 72 buche: 1° giro = cerchio (Early ∩ + Late ∪), 2° giro = clessidra
  // (Early ∪ + Late ∩, la rotazione del cerchio). Algoritmo storico invariato.
  'Gara 54 buche': {
    label: 'Gara 54 buche (54/54)',
    cutAfter: 2,
    defaults: { players: 144, proette: 48 },
    rounds: [
      { id: 'prima',   label: '1° giro',          type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'dx-sn' }, late: { forma: 'U',  verso: 'dx-sn' }, reversed: false },
      { id: 'seconda', label: '2° giro',          type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'U',  verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: false },
      { id: 'finale',  label: '3° giro (finale)', type: 'finale',     gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true }
    ]
  },

  'Gara 72 buche': {
    label: 'Gara 72 buche (uomini 72 / donne 54)',
    cutAfter: 2,
    defaults: { players: 144, proette: 48 },
    rounds: [
      { id: 'prima',   label: '1° giro',                  type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'dx-sn' }, late: { forma: 'U',  verso: 'dx-sn' }, reversed: false },
      { id: 'seconda', label: '2° giro',                  type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'U',  verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: false },
      { id: 'terzo',   label: '3° giro (finale)',         type: 'finale',     gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true },
      { id: 'quarto',  label: '4° giro (finale, uomini)', type: 'finale',     gender: 'men',  tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true }
    ]
  },

  // Gare con patrocinio FIG (sostituiscono la Gara 36 buche):
  // 1° giro = cerchio; 2° giro "per classifica" = blocchi tutti ∩, reversed.
  'Gara con patrocinio FIG': {
    label: 'Gara con patrocinio FIG (2 giri)',
    cutAfter: null,
    defaults: { players: 90, proette: 42 },
    rounds: [
      { id: 'prima',   label: '1° giro',                  type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'dx-sn' }, late: { forma: 'U',  verso: 'dx-sn' }, reversed: false },
      { id: 'seconda', label: '2° giro (per classifica)', type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true }
    ]
  },

  // Trofei Giovanili Federali: stesso schema delle Gare con patrocinio FIG.
  'Trofeo Giovanile Federale': {
    label: 'Trofeo Giovanile Federale (2 giri)',
    cutAfter: null,
    defaults: { players: 90, proette: 42 },
    rounds: [
      { id: 'prima',   label: '1° giro',                  type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'dx-sn' }, late: { forma: 'U',  verso: 'dx-sn' }, reversed: false },
      { id: 'seconda', label: '2° giro (per classifica)', type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: true }
    ]
  },

  // Gara Giovanile: giro unico, quadranti tutti a U rovesciata.
  // Tee unico abilitato: nessun PDF dedicato → segue la logica del 54 buche
  // 'prima' (qualifying), cioè femaleGroups + maleGroups generati da
  // generatePlayerGroups (quadranti Q1-Q4 su singolo tee).
  'Gara Giovanile': {
    label: 'Gara Giovanile (giro unico)',
    cutAfter: null,
    defaults: { players: 90, proette: 42 },
    rounds: [
      { id: 'prima', label: 'Giro unico', type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: false }
    ]
  },

  // Teodoro Soldati: stesso schema della Gara Giovanile (incluso tee unico
  // che segue la logica del 54 buche 'prima').
  'Teodoro Soldati': {
    label: 'Teodoro Soldati (giro unico)',
    cutAfter: null,
    defaults: { players: 90, proette: 42 },
    rounds: [
      { id: 'prima', label: 'Giro unico', type: 'qualifying', gender: 'both', tee: ['double', 'single'], early: { forma: 'UR', verso: 'sn-dx' }, late: { forma: 'UR', verso: 'sn-dx' }, reversed: false }
    ]
  }
};

export const COMPACT_TYPES = {
  EARLY_LATE: 'Early/Late',
  CONTINUOUS: 'Early(<14)'
};

// Colors for table display
export const TABLE_COLORS = {
  women: 'red',
  men: 'black',
  teeColors: {
    orange: '#ed7d31',
    lightGreen: '#c6e0b4',
    lightGray: '#e7e6e6',
    yellow: '#ffff00'
  }
};

// Limits for Technical Rules
export const TECHNICAL_LIMITS = {
  maxMenDoubleTee: 36,
  maxWomenDoubleTee: 18,
  maxSingleTeeRecommended: 93,
  minSingleTeeMandatory: 78
};

// Datepicker Italian localization
export const DATEPICKER_IT = {
  closeText: "Chiudi",
  prevText: "&#x3c;Prec",
  nextText: "Succ&#x3e;",
  currentText: "Oggi",
  monthNames: [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ],
  monthNamesShort: [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic"
  ],
  dayNames: [
    "Domenica", "Lunedì", "Martedì", "Mercoledì", 
    "Giovedì", "Venerdì", "Sabato"
  ],
  dayNamesShort: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
  dayNamesMin: ["Do", "Lu", "Ma", "Me", "Gi", "Ve", "Sa"],
  weekHeader: "Sm",
  dateFormat: "dd/mm/yy",
  firstDay: 1,
  isRTL: false,
  showMonthAfterYear: false,
  yearSuffix: ""
};
