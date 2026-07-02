<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            <i class="fas fa-clock mr-2"></i> Simulatore Tempi di Partenza (Quadranti)
        </h2>
    </x-slot>

    {{-- Stili custom (la view originale li metteva in @push('styles'); qui inline) --}}
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://code.jquery.com/ui/1.13.3/themes/base/jquery-ui.css"
          integrity="sha256-DcjZoj+4EdXndbnrXsdWkiAgx9N0PiUYY0cPl2ni7vg=" crossorigin="anonymous">
    <style>
        .ui-datepicker { @apply bg-white shadow-lg rounded-lg p-4; }
        .ui-datepicker-header { @apply bg-indigo-600 text-white rounded-t-lg p-2 mb-2; }
        .ui-datepicker-title { @apply text-center font-semibold; }
        .ui-datepicker-calendar th { @apply text-gray-600 font-medium text-sm; }
        .ui-datepicker-calendar td a { @apply text-gray-700 hover:bg-indigo-100 rounded p-1; }
        .ui-datepicker-current-day a { @apply bg-indigo-600 text-white; }

        @media print {
            body * { visibility: hidden; }
            #print-area, #print-area * { visibility: visible; }
            #print-area { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; }
            #print-area .qd-remove { display: none !important; }
            @page { size: A4 landscape; margin: 1cm; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            #first_table { font-size: 11px; }
            #first_table td, #first_table th { padding: 2px 4px !important; }
        }
    </style>

    <meta name="base-url" content="{{ url('/') }}">
    {{-- URL endpoint quadranti per il JS (route() → path corretto). --}}
    <meta name="quadranti-upload-url" content="{{ route('quadranti.upload-excel') }}">
    <meta name="quadranti-coordinates-url" content="{{ route('quadranti.coordinates') }}">

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {{-- ============ Pannello Configurazione ============ --}}
                <div class="lg:col-span-1">
                    <div class="bg-white overflow-hidden shadow-xl sm:rounded-lg">
                        <div class="bg-indigo-600 px-4 py-3">
                            <h5 class="text-lg font-medium text-white"><i class="fas fa-cog mr-2"></i> Configurazione</h5>
                        </div>
                        <div class="p-6 space-y-4">

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Data Gara:</label>
                                <input type="text" id="start"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 datepicker"
                                    value="{{ date('d/m/Y') }}">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Area Geografica:</label>
                                <select id="geo_area"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="NORD OVEST">Nord Ovest</option>
                                    <option value="NORD">Nord</option>
                                    <option value="NORD EST">Nord Est</option>
                                    <option value="CENTRO">Centro</option>
                                    <option value="CENTRO SUD">Centro Sud</option>
                                    <option value="SUD EST">Sud Est</option>
                                    <option value="SUD OVEST">Sud Ovest</option>
                                    <option value="SARDEGNA">Sardegna</option>
                                </select>
                            </div>

                            <div class="grid grid-cols-2 gap-4 text-sm text-gray-600">
                                <div><span>Alba: <span id="sunrise" class="font-bold">--:--</span></span></div>
                                <div><span>Tramonto: <span id="sunset" class="font-bold">--:--</span></span></div>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Tipo Gara:</label>
                                {{-- Le giornate disponibili per ogni formato sono ricavate
                                     da COMPETITION_FORMATS (config.js): #giornata viene
                                     ripopolato via JS quando cambia il formato. --}}
                                <select id="gara_NT"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="Gara 54 buche">Gara 54 buche</option>
                                    <option value="Gara 72 buche">Gara 72 buche</option>
                                    <option value="Gara con patrocinio FIG">Gara con patrocinio FIG</option>
                                    <option value="Trofeo Giovanile Federale">Trofeo Giovanile Federale</option>
                                    <option value="Gara Giovanile">Gara Giovanile</option>
                                    <option value="Teodoro Soldati">Teodoro Soldati</option>
                                    <option value="Prova di gioco">Prova di gioco SNP</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Giornata:</label>
                                <select id="giornata"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="prima">Prima Giornata</option>
                                    <option value="seconda">Seconda Giornata</option>
                                    <option value="finale">Giro Finale (classifica)</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Giocatori Uomini:</label>
                                <input type="number" id="players"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value="102" min="0" max="200">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Giocatrici Donne:</label>
                                <input type="number" id="proette"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value="42" min="0" max="100">
                            </div>

                            {{-- Campi cut FIG (visibili solo se giornata=finale) --}}
                            <div class="finale-only" style="display:none;">
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Qualificati Uomini (post-taglio):
                                    <span class="text-xs text-gray-500 italic">default tabella FIG, modificabile per pari merito</span>
                                </label>
                                <input type="number" id="players_cut"
                                    class="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    value="0" min="0" max="200">
                            </div>

                            <div class="finale-only" style="display:none;">
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Qualificate Donne (post-taglio):
                                    <span class="text-xs text-gray-500 italic">default tabella FIG, modificabile per pari merito</span>
                                </label>
                                <input type="number" id="proette_cut"
                                    class="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    value="0" min="0" max="100">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Giocatori per Flight:</label>
                                <select id="players_x_flight"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Configurazione Tee:</label>
                                <select id="doppie_partenze"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="Doppie Partenze">Doppie Partenze</option>
                                    <option value="Tee Unico">Tee Unico</option>
                                </select>
                            </div>

                            <div class="compatto">
                                <label class="block text-sm font-medium text-gray-700 mb-2">Modalità:</label>
                                <select id="compatto"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="Early/Late">Early/Late</option>
                                    <option value="Early(<14)">Early(&lt;14)</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Orario Prima Partenza:</label>
                                <select id="start_time"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    @foreach (['07:00', '07:10', '07:20', '07:30', '07:40', '07:50', '08:00', '08:10', '08:20', '08:30', '08:40', '08:50', '09:00'] as $time)
                                        <option value="{{ $time }}" {{ $time == '08:00' ? 'selected' : '' }}>{{ $time }}</option>
                                    @endforeach
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Intervallo tra Partenze:</label>
                                <select id="gap"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    @foreach (['00:08', '00:09', '00:10', '00:11', '00:12', '00:13', '00:14', '00:15'] as $gap)
                                        <option value="{{ $gap }}" {{ $gap == '00:10' ? 'selected' : '' }}>{{ $gap }}</option>
                                    @endforeach
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Tempo di Gioco:</label>
                                <select id="round"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                    @foreach (['04:10', '04:20', '04:30', '04:40', '04:50'] as $round)
                                        <option value="{{ $round }}" {{ $round == '04:30' ? 'selected' : '' }}>{{ $round }}</option>
                                    @endforeach
                                </select>
                            </div>

                            <div class="text-sm text-gray-600">
                                <span>Orario Incrocio: <span id="cross" class="font-bold">--:--</span></span>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Carica Nomi Giocatori (Excel):</label>
                                <form id="upload-form" method="POST" enctype="multipart/form-data" action="{{ route('quadranti.upload-excel') }}">
                                    @csrf
                                    <input type="file" id="file" name="file" class="mb-2 text-sm text-gray-600" accept=".xlsx,.xls,.csv">
                                    <button type="submit" id="upload" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md">
                                        <i class="fas fa-upload mr-2"></i> Carica File
                                    </button>
                                </form>
                            </div>

                            <div class="grid grid-cols-2 gap-2">
                                <button id="refresh" class="bg-yellow-500 hover:bg-yellow-600 text-white font-medium py-2 px-4 rounded-md">
                                    <i class="fas fa-redo mr-2"></i> Reset
                                </button>
                                <button id="excel" class="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-md">
                                    <i class="fas fa-file-excel mr-2"></i> Excel
                                </button>
                            </div>

                            <div>
                                <button id="pdf" class="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-md">
                                    <i class="fas fa-file-pdf mr-2"></i> Stampa / PDF
                                </button>
                            </div>

                            <div>
                                <button id="fig-view-btn" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded-md">
                                    <i class="fas fa-table-list mr-2"></i> Vista FIG (confronto)
                                </button>
                            </div>

                            <div class="mt-4">
                                <button type="button" id="load-federgolf-btn" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md">
                                    <i class="fas fa-globe mr-2"></i> Carica Lista Gare da Federgolf
                                </button>
                            </div>

                            <div class="mt-3" id="federgolf-container" style="display:none;">
                                <label class="block text-sm font-medium text-gray-700 mb-2">Seleziona Gara</label>
                                <select id="federgolf-gare-select"
                                    class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    style="display:none;">
                                    <option value="">-- Seleziona una gara --</option>
                                </select>
                            </div>

                            <div class="space-y-2">
                                <div id="1">
                                    <button id="btnClick" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md">
                                        <i class="fas fa-user mr-2"></i> Nominativo
                                    </button>
                                </div>
                                <div id="2" style="display:none;">
                                    <button id="btnClock" class="w-full bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-md">
                                        <i class="fas fa-hashtag mr-2"></i> Numerico
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {{-- ============ Tabella Tempi di Partenza ============ --}}
                <div class="lg:col-span-2">
                    <div id="print-area" class="bg-white overflow-hidden shadow-xl sm:rounded-lg">
                        <div class="bg-green-600 px-4 py-3">
                            <h5 class="text-lg font-medium text-white">
                                <i class="fas fa-table mr-2"></i> Tabella Orari di Partenza
                                <span id="titolo_giornata" class="ml-2"></span>
                            </h5>
                        </div>
                        <div class="p-6">
                            {{-- Avviso modalità nominativa: visibile solo quando nominativo='On' --}}
                            <div id="nominativo-hint" style="display:none;"
                                class="mb-3 px-3 py-2 bg-amber-50 border border-amber-300 rounded text-sm text-amber-800">
                                <i class="fas fa-circle text-red-600 mr-1" style="font-size:9px; vertical-align:middle;"></i>
                                Modalità Nominativo: per eliminare un iscritto clicca sulla
                                <span class="text-red-600 font-bold">&times;</span> rossa accanto al nome.
                                Lo schema verrà ricalcolato automaticamente.
                            </div>
                            <div class="overflow-x-auto">
                                <div id="first_table" class="min-w-full">
                                    {{-- Table content will be generated by JavaScript --}}
                                </div>
                            </div>
                            {{-- Striscia numeri per sistema FIG (generata da generateFigStrip) --}}
                            <div id="fig-strip"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    {{-- Modal Vista FIG: tabella Giro 1 + Giro 2 in stile orario ufficiale FIG,
         da affiancare al PDF pubblicato per la verifica. --}}
    <div id="fig-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:50;">
        <div style="background:#fff; max-width:920px; margin:32px auto; border-radius:8px; max-height:86vh; display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-bottom:1px solid #e2e8f0;">
                <strong style="color:#1e293b;">
                    <i class="fas fa-table-list mr-1"></i> Vista FIG — Orario di partenza Giro 1 e Giro 2
                </strong>
                <button type="button" id="fig-modal-close"
                    style="border:none; background:none; font-size:24px; line-height:1; cursor:pointer; color:#64748b;">&times;</button>
            </div>
            <div id="fig-modal-body" style="padding:18px; overflow:auto;"></div>
        </div>
    </div>

    {{-- Overlay di caricamento full-screen (attese lunghe Federgolf) --}}
    <div id="loading-overlay"
        style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:60; align-items:center; justify-content:center;">
        <div style="background:#fff; padding:24px 32px; border-radius:10px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
            <i class="fas fa-spinner fa-spin" style="font-size:32px; color:#4f46e5;"></i>
            <div id="loading-overlay-text" style="margin-top:12px; color:#1e293b; font-weight:500;">Caricamento…</div>
        </div>
    </div>

    {{-- Script CDN (jQuery, jQuery UI, SheetJS) + bootstrap modulo quadranti --}}
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"
            integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" crossorigin="anonymous"></script>
    <script src="https://code.jquery.com/ui/1.13.3/jquery-ui.min.js"
            integrity="sha256-sw0iNNXmOJbQhYFuC9OF2kOlD5KQKe1y5lfBn4C9Sjg=" crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>

    @vite(['resources/js/quadranti/quadranti.js'])
</x-app-layout>
