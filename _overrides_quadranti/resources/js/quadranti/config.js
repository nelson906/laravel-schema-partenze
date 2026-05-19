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
  garaNT36: 'Normale',
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

export const GEO_AREAS = [
  'NORD OVEST',
  'NORD',
  'NORD EST',
  'CENTRO',
  'CENTRO SUD',
  'SUD EST',
  'SUD OVEST',
  'SARDEGNA'
];

export const TIME_OPTIONS = {
  startTimes: [
    '07:00', '07:10', '07:20', '07:30', '07:40', '07:50',
    '08:00', '08:10', '08:20', '08:30', '08:40', '08:50', '09:00'
  ],
  gaps: [
    '00:08', '00:09', '00:10', '00:11', '00:12', '00:13', '00:14', '00:15'
  ],
  rounds: [
    '04:10', '04:20', '04:30', '04:40', '04:50'
  ]
};

export const COMPETITION_TYPES = {
  GARA_54: 'Gara 54 buche',
  GARA_36: 'Gara 36 buche'
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
  FINAL: 'finale'
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
