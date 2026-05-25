/**
 * Quadranti Application
 * Main entry point for the Quadranti (Starting Times Simulator) application
 */

import {
  DEFAULT_CONFIG,
  TEE_TYPES,
  ROUND_TYPES,
  COMPETITION_FORMATS
} from './config.js';

import {
  storage,
  formatDate,
  addTime,
  halfTime,
  debounce
} from './utils.js';

import { QuadrantiLogic, mergeFedergolfResponses, normalizeGaraTitle } from './quadranti-logic.js';

/**
 * Main Quadranti Application Class
 */
class QuadrantiApp {
  constructor() {
    this.config = this.loadConfiguration();
    this.logic = new QuadrantiLogic(this.config);
    this.isInitialized = false;
    // Cache in-memory delle gare Federgolf caricate dal dropdown.
    // Le option mostrano un indice intero come value; selezionata l'option
    // l'handler legge questo array per recuperare ID maschile/femminile.
    // Niente più "value=id1,id2" magico.
    this.federgolfGare = [];
  }

  /**
   * Loads configuration from localStorage with defaults
   * @returns {Object} Configuration object
   */
  loadConfiguration() {
    const config = {};

    // Load each config value from storage with default fallback
    Object.keys(DEFAULT_CONFIG).forEach(key => {
      config[key] = storage.get(key, DEFAULT_CONFIG[key]);
    });

    return config;
  }

  /**
   * Saves configuration to localStorage
   */
  saveConfiguration() {
    Object.keys(this.config).forEach(key => {
      storage.set(key, this.config[key]);
    });
  }

  /**
   * Initializes the application
   */
  async init() {
    if (this.isInitialized) return;

    try {
      this.initializeUI();
      this.attachEventHandlers();
      await this.updateEphemerisData();
      this.generateTable();
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing Quadranti app:', error);
    }
  }

  /**
   * Initializes UI elements with stored values
   */
  initializeUI() {
    // Initialize datepicker
    this.logic.initializeDatepicker($);

    // Set form values from configuration
    $('#geo_area').val(this.config.geoArea);
    $('#start').val(storage.get('start', formatDate(new Date())));
    $('#gara_NT').val(this.config.garaNT);
    // Popola #giornata con i giri del formato selezionato (data-driven)
    this.refreshGiornataOptions();
    $('#players').val(this.config.players);
    $('#proette').val(this.config.proette);
    // Campi qualificati post-taglio (visibili solo nel giro finale)
    $('#players_cut').val(this.config.playersCut || this.config.players);
    $('#proette_cut').val(this.config.proetteCut || this.config.proette);
    $('#players_x_flight').val(this.config.playersPerFlight);
    $('#giornata').val(this.config.giornata);
    $('#round').val(this.config.round);
    $('#start_time').val(this.config.startTime);
    $('#gap').val(this.config.gap);
    $('#compatto').val(this.config.compatto);
    $('#doppie_partenze').val(this.config.doppiePartenze);

    // Show/hide compact option based on player count
    this.toggleCompactOption();

    // Update cross time display
    this.updateCrossTime();

    // Show/hide nominativo buttons
    this.updateNominativoButtons();

    // Show/hide campi taglio (visibili solo quando giornata=finale)
    this.toggleFinalCutFields();

    // Update title based on round
    this.updateTableTitle();
  }

  /**
   * Ripopola il menu #giornata con i giri del formato di gara selezionato,
   * leggendo COMPETITION_FORMATS (modello data-driven). Esempi: la Gara 72
   * buche espone prima/seconda/terzo/quarto; la Gara Giovanile il solo giro
   * unico; le Gare con patrocinio FIG prima/seconda. Mantiene la selezione se
   * ancora valida per il nuovo formato, altrimenti seleziona il primo giro.
   */
  refreshGiornataOptions() {
    const fmt = COMPETITION_FORMATS[this.config.garaNT];
    const rounds = (fmt && fmt.rounds && fmt.rounds.length)
      ? fmt.rounds
      : [
          { id: 'prima',   label: 'Prima Giornata' },
          { id: 'seconda', label: 'Seconda Giornata' },
          { id: 'finale',  label: 'Giro Finale (classifica)' },
        ];

    const $giornata = $('#giornata');
    const previous = this.config.giornata;
    $giornata.empty();
    rounds.forEach((r) => {
      $giornata.append(`<option value="${r.id}">${r.label}</option>`);
    });

    const selected = rounds.some((r) => r.id === previous)
      ? previous
      : rounds[0].id;
    $giornata.val(selected);
    this.config.giornata = selected;
    storage.set('giornata', selected);
  }

  /**
   * Mostra/nasconde i campi del taglio (qualificati uomini/donne) in base alla
   * giornata selezionata. Visibili solo per giornata='finale'.
   *
   * Quando si entra in 'finale', auto-popola i campi cut leggendo la tabella
   * FIG basata sugli iscritti correnti (players/proette). L'utente può poi
   * modificare per pari merito; le modifiche saranno preservate finché resta
   * sul giro finale. Cambiando giornata e tornando indietro, il default viene
   * ricalcolato (in linea con il principio "default = tabella, override = pari
   * merito espliciti").
   */
  toggleFinalCutFields() {
    // Data-driven: i campi del taglio si mostrano quando il giro corrente è
    // di tipo 'finale' secondo COMPETITION_FORMATS (54 buche: 'finale';
    // 72 buche: 'terzo'/'quarto'). Fallback al check storico se il formato
    // non è in tabella.
    const fmt = COMPETITION_FORMATS[this.config.garaNT];
    const roundDesc = fmt
      ? fmt.rounds.find((r) => r.id === this.config.giornata)
      : null;
    const isFinale = roundDesc
      ? roundDesc.type === 'finale'
      : this.config.giornata === ROUND_TYPES.FINAL;

    if (isFinale) {
      $('.finale-only').show();
      // Auto-popola dal lookup FIG basato sugli iscritti correnti.
      // L'evento si scatena ogni volta che si entra in un giro finale.
      this.applyFigCutFormula('M');
      this.applyFigCutFormula('F');
    } else {
      $('.finale-only').hide();
    }
  }

  /**
   * Applica la tabella FIG (allegato regolamento) per il calcolo dei
   * qualificati al terzo giro.
   *
   * Tabella maschile: ammessi al 3° giro = primi 54 + pari merito al 54° posto,
   * o secondo tabella se iscritti < 67.
   * Tabella femminile: ammessi al 3° giro = prime 27 + pari merito al 27° posto,
   * o secondo tabella se iscritte < 33.
   *
   * Lookup hardcoded: la formula matematica esatta non è univoca, quindi usiamo
   * una mappa diretta. Per N > soglia, ritorna 54 (M) o 27 (F).
   *
   * @param {'M'|'F'} cat - Categoria da ricalcolare
   */
  applyFigCutFormula(cat) {
    // Tabella maschile FIG (iscritti → ammessi). N >= 67 → 54.
    const TABELLA_M = {
      8: 7, 9: 8, 10: 8, 11: 9, 12: 10, 13: 11, 14: 12, 15: 12,
      16: 13, 17: 14, 18: 15, 19: 16, 20: 16, 21: 17, 22: 18, 23: 19,
      24: 20, 25: 20, 26: 21, 27: 22, 28: 23, 29: 24, 30: 24, 31: 25,
      32: 26, 33: 27, 34: 28, 35: 28, 36: 29, 37: 30, 38: 31, 39: 32,
      40: 32, 41: 33, 42: 34, 43: 35, 44: 36, 45: 36, 46: 37, 47: 38,
      48: 39, 49: 40, 50: 40, 51: 41, 52: 42, 53: 43, 54: 44, 55: 44,
      56: 45, 57: 46, 58: 47, 59: 48, 60: 48, 61: 49, 62: 50, 63: 51,
      64: 52, 65: 52, 66: 53,
    };
    // Tabella femminile FIG (iscritte → ammesse). N >= 33 → 27.
    const TABELLA_F = {
      8: 7, 9: 8, 10: 8, 11: 9, 12: 10, 13: 11, 14: 12, 15: 12,
      16: 13, 17: 14, 18: 15, 19: 16, 20: 16, 21: 17, 22: 18, 23: 19,
      24: 20, 25: 20, 26: 21, 27: 22, 28: 23, 29: 24, 30: 24, 31: 25,
      32: 26,
    };

    if (cat === 'M') {
      const reg = parseInt(this.config.players) || 0;
      let cut;
      if (reg <= 0) cut = 0;
      else if (reg >= 67) cut = 54;
      else if (reg < 8) cut = reg; // sotto la soglia tabella → tutti passano
      else cut = TABELLA_M[reg];
      this.config.playersCut = cut;
      storage.set('playersCut', cut);
      $('#players_cut').val(cut);
    } else {
      const reg = parseInt(this.config.proette) || 0;
      let cut;
      if (reg <= 0) cut = 0;
      else if (reg >= 33) cut = 27;
      else if (reg < 8) cut = reg;
      else cut = TABELLA_F[reg];
      this.config.proetteCut = cut;
      storage.set('proetteCut', cut);
      $('#proette_cut').val(cut);
    }
  }

  /**
   * Attaches event handlers to UI elements
   */
  attachEventHandlers() {
    // Geographic area change
    $('#geo_area').on('change', () => this.handleGeoAreaChange());

    // Date change
    $('.datepicker').on('change', () => this.handleDateChange());

    // Form input changes (debounced to prevent rapid reloads)
    const handleFormChange = debounce(() => this.handleFormChange(), 300);
    $('input[type="text"], select').on('change', handleFormChange);

    // Specific handlers for numeric inputs (incluso i campi post-taglio del giro finale)
    $('#players, #proette, #players_cut, #proette_cut').on('input change', handleFormChange);

    // Formato gara cambiato → ripopola le giornate disponibili (data-driven).
    // Handler sincrono: aggiorna #giornata PRIMA che handleFormChange (debounced)
    // legga la giornata selezionata.
    $('#gara_NT').on('change', () => {
      this.config.garaNT = $('#gara_NT').val();
      this.refreshGiornataOptions();
    });

    // Button clicks
    $('#refresh').on('click', () => this.handleReset());
    $('#excel').on('click', () => this.handleExcelExport());
    $('#pdf').on('click', () => this.handlePdfPrint());
    $('#btnClick').on('click', (e) => this.handleNominativoToggle(e, 'On'));
    $('#btnClock').on('click', (e) => this.handleNominativoToggle(e, 'Off'));

    // File upload form submit
    $('#upload-form').on('submit', (e) => this.handleFileUpload(e));

    // Pulsante carica gare Federgolf
$('#load-federgolf-btn').on('click', () => this.handleLoadFedergolfGare());

// Selezione gara
$('#federgolf-gare-select').on('change', () => this.handleFedergolfGaraSelected());

// Rimozione di un singolo nominativo dalla tabella (modalità Nominativo).
// Delegato sul container perché la tabella viene rigenerata da generateTable()
// e i pulsanti × vengono ricreati a ogni render.
$('#first_table').on('click', '.qd-remove', (e) => this.handleRemovePlayer(e));

// Vista FIG: apre il modal con la tabella Giro 1 + Giro 2 affiancati,
// nel layout dell'orario ufficiale FIG, da confrontare col PDF pubblicato.
$('#fig-view-btn').on('click', () => {
  $('#fig-modal-body').html(this.logic.generateFigComparison());
  $('#fig-modal').css('display', 'block');
});
$('#fig-modal-close').on('click', () => $('#fig-modal').hide());
// Chiusura cliccando sullo sfondo scuro (non sul contenuto del modal)
$('#fig-modal').on('click', (e) => {
  if (e.target === e.currentTarget) $('#fig-modal').hide();
});

// Copia la striscia FIG negli appunti. Delegato perché #fig-strip-copy
// viene ricreato a ogni render di generateFigStrip().
$('#fig-strip').on('click', '#fig-strip-copy', (e) => {
  const $btn = $(e.currentTarget);
  const text = $btn.data('strip') || '';
  const done = () => {
    const orig = $btn.text();
    $btn.text('Copiato!');
    setTimeout(() => $btn.text(orig), 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      window.prompt('Copia la striscia FIG:', text);
    });
  } else {
    window.prompt('Copia la striscia FIG:', text);
  }
});

  }

  /**
   * Handles geographic area change
   */
  async handleGeoAreaChange() {
    this.config.geoArea = $('#geo_area').val();
    storage.set('geo_area', this.config.geoArea);
    storage.set('start', $('#start').val());
    await this.updateEphemerisData();
  }

  /**
   * Handles date change
   */
  async handleDateChange() {
    storage.set('start', $('#start').val());
    await this.updateEphemerisData();
  }

  /**
   * Handles form input changes
   */
  handleFormChange() {
    // Update configuration from form values - handle empty fields
    const playersVal = $('#players').val();
    const proetteVal = $('#proette').val();
    const playersCutVal = $('#players_cut').val();
    const proetteCutVal = $('#proette_cut').val();

    this.config.players = playersVal === '' ? 0 : playersVal;
    this.config.proette = proetteVal === '' ? 0 : proetteVal;
    this.config.playersCut = playersCutVal === '' ? 0 : playersCutVal;
    this.config.proetteCut = proetteCutVal === '' ? 0 : proetteCutVal;
    this.config.playersPerFlight = $('#players_x_flight').val();
    this.config.giornata = $('#giornata').val();
    this.config.garaNT = $('#gara_NT').val();
    this.config.round = $('#round').val();
    this.config.startTime = $('#start_time').val();
    this.config.gap = $('#gap').val();
    this.config.compatto = $('#compatto').val();
    this.config.doppiePartenze = $('#doppie_partenze').val();

  // Save configuration
  this.saveConfiguration();

  // Update UI elements (IMPORTANTE: toggleCompactOption usa doppiePartenze!)
  this.toggleCompactOption();
  this.toggleFinalCutFields();
  this.updateCrossTime();
  this.updateTableTitle();

  // Update logic configuration
  this.logic.updateConfig(this.config);

  // Regenerate table
  this.generateTable();
}

  /**
   * Handles reset button click
   */
  handleReset() {
    if (confirm('Sei sicuro di voler cancellare tutti i dati?')) {
      storage.clear();
      window.location.reload();
    }
  }

  /**
   * Esporta la tabella delle partenze in un vero file .xlsx tramite SheetJS.
   * Sostituisce la vecchia implementazione con jquery-table2excel, che produceva
   * un .xls "fasullo" (HTML rinominato) facendo apparire l'avviso di Excel
   * "il formato e l'estensione non corrispondono".
   */
  handleExcelExport() {
    if (typeof XLSX === 'undefined') {
      alert('La libreria di esportazione Excel non è caricata.');
      return;
    }

    // Cerca la <table> dentro #first_table (in tee unico è figlia diretta;
    // in doppio tee è figlia di #first_table dopo il box riepilogo).
    const target = document.querySelector('#first_table table');
    if (!target) {
      alert('Nessuna tabella da esportare.');
      return;
    }

    // Cloniamo per rimuovere i pulsanti × dal foglio Excel senza toccare la UI.
    const clone = target.cloneNode(true);
    clone.querySelectorAll('.qd-remove').forEach(el => el.remove());

    const wb = XLSX.utils.table_to_book(clone, { sheet: 'Partenze' });

    // Nome file parlante (giornata + data)
    const giornata = this.config.giornata === 'seconda' ? 'Seconda' : 'Prima';
    const date = ($('#start').val() || '').replace(/\//g, '-');
    const filename = `Partenze_${giornata}Giornata${date ? '_' + date : ''}.xlsx`;

    XLSX.writeFile(wb, filename);
  }

  /**
   * Apre il dialogo di stampa del browser sulla sola area #print-area.
   * L'utente può scegliere "Salva come PDF" come destinazione per ottenere
   * un PDF della tabella senza dipendenze esterne. Il document.title viene
   * temporaneamente sostituito con un nome significativo perché molti
   * browser lo usano come nome file di default in "Salva come PDF".
   */
  handlePdfPrint() {
    const originalTitle = document.title;
    const giornata = this.config.giornata === 'seconda' ? 'Seconda' : 'Prima';
    const date = ($('#start').val() || '').replace(/\//g, '-');
    const newTitle = `Partenze_${giornata}Giornata${date ? '_' + date : ''}`;
    document.title = newTitle;

    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    // Fallback nel caso afterprint non venga emesso (alcune versioni di Safari)
    setTimeout(restore, 5000);

    window.print();
  }

  /**
   * Handles nominativo/numeric toggle
   */
  handleNominativoToggle(e, mode) {
    e.preventDefault();

    this.config.nominativo = mode;
    storage.set('nominativo', mode);

    if (mode === 'On') {
      storage.set('display1', 'false');
      storage.set('display2', 'true');
    } else {
      storage.set('display1', 'true');
      storage.set('display2', 'false');
    }

    this.updateNominativoButtons();
    this.logic.updateConfig(this.config);
    this.generateTable();
  }

  /**
   * Rimuove un singolo iscritto dall'array atleti/atlete e ridisegna lo schema.
   * Visibile solo in modalità Nominativo. Dopo la rimozione il flow passa per
   * applyPlayers() — stesso state update di Excel/Federgolf, niente duplicazione.
   */
  handleRemovePlayer(e) {
    e.preventDefault();
    if (this.config.nominativo !== 'On') return;

    const $btn = $(e.currentTarget);
    const cat  = $btn.data('cat');                  // 'M' | 'F'
    const idx  = parseInt($btn.data('idx'), 10);

    const atleti = (storage.get('atleti', []) || []).slice();
    const atlete = (storage.get('atlete', []) || []).slice();
    const list = cat === 'F' ? atlete : atleti;

    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
      console.warn('handleRemovePlayer: indice non valido', { cat, idx, listLength: list.length });
      return;
    }

    const removedName = list[idx];
    const remaining = list.length - 1;
    const labelGen = cat === 'F' ? 'atlete' : 'atleti';
    if (!confirm(`Rimuovere "${removedName}" dall'elenco?\nLo schema verrà ridisegnato con ${remaining} ${labelGen}.`)) {
      return;
    }

    list.splice(idx, 1);
    this.applyPlayers({ atleti, atlete });
  }

  /**
   * Single source of truth per "ho un nuovo set atleti/atlete da applicare".
   *
   * Sostituisce la sequenza di 13 righe che era duplicata in handleFileUpload,
   * handleFedergolfGaraSelected e (parzialmente) handleRemovePlayer. Tutti i
   * loader passano per qui: storage, config, DOM e tabella sono aggiornati in
   * un unico posto.
   *
   * mode='nominativo' (default): atleti/atlete sono nomi, salva in storage.
   * mode='numerico': pulisce i nomi dallo storage; il render userà [1..N].
   *
   * @param {{atleti?: string[], atlete?: string[], mode?: 'nominativo'|'numerico'}} args
   */
  applyPlayers({ atleti = [], atlete = [], mode = 'nominativo' } = {}) {
    if (mode === 'nominativo') {
      storage.set('atleti', atleti);
      storage.set('atlete', atlete);
      this.config.players = atleti.length;
      this.config.proette = atlete.length;
      this.config.nominativo = 'On';
    } else {
      storage.remove('atleti');
      storage.remove('atlete');
      this.config.nominativo = 'Off';
      // players/proette restano com'erano (l'utente li edita manualmente)
    }

    // Persist scalari in storage
    storage.set('players', this.config.players);
    storage.set('proette', this.config.proette);
    storage.set('nominativo', this.config.nominativo);

    // DOM sync
    $('#players').val(this.config.players);
    $('#proette').val(this.config.proette);

    // Refresh UI dipendente
    this.updateNominativoButtons();
    this.toggleCompactOption();
    this.logic.updateConfig(this.config);
    this.generateTable();
  }

  /**
   * Handles file upload for player names
   */
  async handleFileUpload(e) {
    e.preventDefault();

    const file = $('#file')[0].files[0];
    if (!file) {
      alert('Seleziona un file Excel');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      // URL iniettato dalla view via meta tag (route() di Laravel): mantiene
      // quadranti.js identico tra progetti con prefissi di route diversi.
      const uploadUrl = $('meta[name="quadranti-upload-url"]').attr('content')
        || (($('meta[name="base-url"]').attr('content') || '') + '/user/quadranti/upload-excel');
      const response = await $.ajax({
        url: uploadUrl,
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        headers: {
          'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
        }
      });

      // Controller restituisce un array [atlete, atleti]
      const atlete = (response && response[0]) || [];
      const atleti = (response && response[1]) || [];

      if (atleti.length === 0 && atlete.length === 0) {
        alert('⚠ Nessun nominativo trovato nel file Excel.');
        return;
      }

      this.applyPlayers({ atleti, atlete });
      alert(`File caricato con successo!\n${atleti.length} atleti\n${atlete.length} atlete`);
    } catch (error) {
      console.error('Error uploading file:', error);
      if (error.responseJSON && error.responseJSON.message) {
        alert('Errore: ' + error.responseJSON.message);
      } else {
        alert('Errore durante il caricamento del file');
      }
    }
  }

  /**
   * Mostra l'overlay di caricamento full-screen con un messaggio.
   * Overlay robusto: copre tutta la pagina, impossibile non vederlo
   * durante le attese lunghe (fetch da federgolf.it).
   */
  showLoading(message) {
    $('#loading-overlay-text').text(message || 'Caricamento…');
    $('#loading-overlay').css('display', 'flex');
  }

  /**
   * Nasconde l'overlay di caricamento.
   */
  hideLoading() {
    $('#loading-overlay').hide();
  }

  /**
   * Updates ephemeris data (sunrise/sunset)
   */
  async updateEphemerisData() {
    const geoArea = this.config.geoArea;
    const date = $('#start').val() || formatDate(new Date());

    const data = await this.logic.fetchEphemerisData(geoArea, date);

    $('#sunrise').html(data.sunrise);
    $('#sunset').html(data.sunset);
  }

  /**
   * Toggles compact option visibility based on player count
   */
  toggleCompactOption() {
    const players = parseInt(this.config.players) || 0;
    const proette = parseInt(this.config.proette) || 0;
    const totalPlayers = players + proette;
    const mod = parseInt(this.config.playersPerFlight);
    
    if (totalPlayers <= mod * 32) {
      $('.compatto').show();
    } else {
      $('.compatto').hide();
    }
  }

  /**
   * Updates cross time display
   */
  updateCrossTime() {
    const crossTime = addTime(this.config.startTime, halfTime(this.config.round));
    $('#cross').html(crossTime);
  }

  /**
   * Updates nominativo/numeric button visibility
   */
  updateNominativoButtons() {
    const displayNominativo = storage.get('display1', 'true');
    const displayNumerico = storage.get('display2', 'false');

    if (displayNominativo === 'true') {
      $('#2').hide();
      $('#1').show();
    } else {
      $('#1').hide();
      $('#2').show();
    }

    // Avviso modalità nominativa: spiega che la × rossa elimina l'iscritto.
    // Visibile solo quando la modalità nominativo è attiva.
    if (this.config.nominativo === 'On') {
      $('#nominativo-hint').show();
    } else {
      $('#nominativo-hint').hide();
    }
  }

  /**
   * Updates table title based on configuration
   */
  updateTableTitle() {
    const giornata = this.config.giornata;
    const gara = this.config.garaNT;

    let title = '';

    if (giornata === ROUND_TYPES.FIRST) {
      title = 'Prima Giornata';
    } else if (giornata === ROUND_TYPES.SECOND) {
      title = 'Seconda Giornata';
      // 2° giro "per classifica": i giri marcati reversed nel descrittore
      // (Gare con patrocinio FIG / Trofei Giovanili).
      const fmt2 = COMPETITION_FORMATS[gara];
      const rd2 = fmt2 ? fmt2.rounds.find((r) => r.id === giornata) : null;
      if (rd2 && rd2.reversed) title += ' per classifica';
    } else if (giornata === ROUND_TYPES.FINAL) {
      // Coerente con l'header dell'immagine di riferimento: "3° GIRO PER CLASSIFICA TEE 1"
      title = '3° Giro per classifica (Tee 1)';
    } else {
      // Giri introdotti dai nuovi formati (es. 3°/4° giro della Gara 72 buche):
      // etichetta presa dal descrittore COMPETITION_FORMATS.
      const fmt = COMPETITION_FORMATS[gara];
      const roundDesc = fmt ? fmt.rounds.find((r) => r.id === giornata) : null;
      title = roundDesc ? roundDesc.label : '';
    }

    $('#titolo_giornata').html(title);
  }

  /**
   * Generates and displays the tee time table.
   *
   * Note: #first_table è ora un <div>. generateDoubleTee ritorna già
   * (infoBox + <table>...</table>); generateSingleTee ritorna solo
   * <thead>...<tbody>... e va wrappato esplicitamente in <table>.
   */
  generateTable() {
    const doppiePartenze = this.config.doppiePartenze;
    const giornata = this.config.giornata;
    // Il giro finale supporta entrambe le varianti (doppio tee + tee unico).
    // L'utente sceglie via #doppie_partenze. Il render discriminerà internamente
    // il ramo 'finale' in generateDoubleTee / generateSingleTee.
    let html;

    if (doppiePartenze === TEE_TYPES.DOUBLE) {
      html = this.logic.generateDoubleTee(giornata);
    } else {
      html = `<table class="min-w-full divide-y divide-gray-200">${this.logic.generateSingleTee(giornata)}</table>`;
    }

    $('#first_table').html(html);

    // Striscia FIG: generateDoubleTee/generateSingleTee hanno popolato
    // this.logic.figQuadranti come side-effect; ora ne rendiamo il box.
    $('#fig-strip').html(this.logic.generateFigStrip());
  }

/**
 * Carica TUTTE le gare da Federgolf
 */
async handleLoadFedergolfGare() {
  // Overlay full-screen + spinner sul pulsante: l'attesa da federgolf.it è lunga.
  this.showLoading('Caricamento lista gare da Federgolf…');
  $('#load-federgolf-btn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-2"></i> Caricamento...');

  try {
    const response = await $.ajax({
      url: ($('meta[name="base-url"]').attr('content') || '') + '/user/federgolf/load-all',
      type: 'POST',
      headers: {
        'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
      }
    });

    if (response.success && response.gare.length > 0) {
      this.populateFedergolfDropdown(response.gare);
      alert(`Trovate ${response.gare.length} gare`);
    } else {
      alert('Nessuna gara disponibile');
    }
  } catch (error) {
    console.error('Errore:', error);
    alert('Errore nel caricamento delle gare');
  } finally {
    this.hideLoading();
    $('#load-federgolf-btn').prop('disabled', false).html('<i class="fas fa-globe mr-2"></i> Carica da Federgolf');
  }
}

/**
 * Popola il dropdown con le gare e memorizza la struttura dati corrispondente
 * in `this.federgolfGare`. L'option ha come `value` l'indice nell'array — il
 * suo handler legge `this.federgolfGare[idx]` per gli ID effettivi.
 *
 * Niente più value="id1,id2" + split('','). La struttura dati esplicita
 * elimina la stringa magica e rende il flow di selezione lineare.
 *
 * Raggruppamento M+F: chiave = normalizeGaraTitle(title) + date. La
 * normalizzazione riduce il titolo a soli caratteri alfanumerici minuscoli,
 * tollerando punteggiatura asimmetrica attorno a MASCHILE/FEMMINILE.
 */
populateFedergolfDropdown(gare) {
  const $dropdown = $('#federgolf-gare-select');
  $dropdown.empty().append('<option value="">-- Seleziona una gara --</option>');

  // 1. Raggruppa per chiave normalizzata
  const gruppi = {};
  gare.forEach(gara => {
    const chiave = `${normalizeGaraTitle(gara.title)}_${gara.date}`;
    if (!gruppi[chiave]) {
      gruppi[chiave] = {
        nome: gara.title.replace(/\s*(MASCHILE|FEMMINILE)\s*/gi, ' ').replace(/\s+/g, ' ').trim(),
        data: gara.date,
        maschile: null,
        femminile: null,
        club: gara.club,
      };
    }
    if (gara.tipo === 'FEMMINILE') {
      gruppi[chiave].femminile = gara.id;
    } else {
      // MASCHILE o MISTA → entrambi vanno nello slot maschile
      gruppi[chiave].maschile = gara.id;
    }
  });

  // 2. Costruisci la struttura dati esposta all'handler di selezione
  this.federgolfGare = Object.values(gruppi)
    .filter(g => g.maschile || g.femminile)
    .map(g => {
      const tag = (g.maschile && g.femminile) ? '[M+F]' :
                  (g.maschile ? '[M]' : '[F]');
      const label = `${g.nome} - ${g.data}${g.club ? ` (${g.club})` : ''} ${tag}`;
      return { label, maschile: g.maschile, femminile: g.femminile };
    });

  // 3. Popola le option (value = indice nell'array)
  this.federgolfGare.forEach((g, idx) => {
    $dropdown.append(`<option value="${idx}">${g.label}</option>`);
  });

  $('#federgolf-container').show();
  $dropdown.show();
}

  /**
   * Carica gli iscritti per la gara selezionata.
   *
   * Flow lineare:
   *   1. Recupera struttura della gara da `this.federgolfGare[idx]`
   *      (esplicita: maschile, femminile possono essere null o ID).
   *   2. Fetch in parallelo (Promise.all) per maschile e femminile presenti.
   *   3. Combina con mergeFedergolfResponses (state-based, niente flag).
   *   4. Mostra warnings (se ci sono) ma NON aborta solo per quelli.
   *   5. Se nessun nome è disponibile → notifica e non tocca lo storage.
   *   6. Altrimenti → applyPlayers (single state update).
   */
  async handleFedergolfGaraSelected() {
    const $dropdown = $('#federgolf-gare-select');
    const idx = parseInt($dropdown.val(), 10);
    const gara = this.federgolfGare[idx];
    if (!gara) return;

    // Indicatore di caricamento: il fetch iscritti da federgolf.it può
    // richiedere parecchi secondi. Overlay full-screen + dropdown bloccato.
    this.showLoading('Caricamento iscritti gara da Federgolf…');
    $dropdown.prop('disabled', true);

    const fetchIscritti = (garaId) => $.ajax({
      url: ($('meta[name="base-url"]').attr('content') || '') + '/user/federgolf/iscritti',
      type: 'POST',
      data: { gara_id: garaId },
      headers: { 'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content') },
    });

    try {
      // Parallelizziamo: per MISTA eravamo seriali (sommando i tempi),
      // ora richiediamo M e F insieme.
      const [maschileResponse, femminileResponse] = await Promise.all([
        gara.maschile  ? fetchIscritti(gara.maschile)  : Promise.resolve(null),
        gara.femminile ? fetchIscritti(gara.femminile) : Promise.resolve(null),
      ]);

      const { atleti, atlete, warnings } = mergeFedergolfResponses({
        maschileResponse,
        femminileResponse,
      });

      if (warnings.length) {
        alert('⚠ ' + warnings.join('\n'));
      }

      if (atleti.length === 0 && atlete.length === 0) {
        // Nessun dato: NON tocchiamo storage/contatori.
        if (warnings.length === 0) {
          alert('⚠ Nessun nominativo trovato per la gara selezionata.');
        }
        $dropdown.val('');
        return;
      }

      this.applyPlayers({ atleti, atlete });
      alert(`Iscritti caricati!\n${atleti.length} atleti\n${atlete.length} atlete`);

    } catch (error) {
      console.error('Errore caricamento iscritti:', error);
      alert('⚠ Errore di rete nel caricamento degli iscritti.');
    } finally {
      // Ripristina UI sia in caso di successo sia di errore
      this.hideLoading();
      $dropdown.prop('disabled', false);
    }
  }

}
// Initialize application when DOM is ready
$(document).ready(() => {
  const app = new QuadrantiApp();
  app.init();

  // Make app available globally for debugging
  window.quadrantiApp = app;
});
