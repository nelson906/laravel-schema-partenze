@extends('aruba-admin.layout')

@section('title', 'Server Monitoring - Aruba Admin')

@section('content')
<div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold text-gray-800">
                    <i class="fas fa-chart-line text-blue-600"></i>
                    Server Monitoring
                </h1>
                <p class="text-gray-600 mt-2">Monitoraggio risorse server e processi attivi</p>
            </div>
            <button onclick="location.reload()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition flex items-center space-x-2">
                <i class="fas fa-sync-alt"></i>
                <span>Aggiorna</span>
            </button>
        </div>
    </div>

    <!-- Load Average -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-tachometer-alt text-green-600"></i> Carico Sistema (Load Average)
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-green-700 text-sm font-semibold mb-1">1 Minuto</p>
                        <p class="text-4xl font-bold text-green-800">{{ number_format($serverLoad['load_average']['1min'], 2) }}</p>
                    </div>
                    <i class="fas fa-clock text-3xl text-green-400"></i>
                </div>
            </div>

            <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-blue-700 text-sm font-semibold mb-1">5 Minuti</p>
                        <p class="text-4xl font-bold text-blue-800">{{ number_format($serverLoad['load_average']['5min'], 2) }}</p>
                    </div>
                    <i class="fas fa-hourglass-half text-3xl text-blue-400"></i>
                </div>
            </div>

            <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-purple-700 text-sm font-semibold mb-1">15 Minuti</p>
                        <p class="text-4xl font-bold text-purple-800">{{ number_format($serverLoad['load_average']['15min'], 2) }}</p>
                    </div>
                    <i class="fas fa-history text-3xl text-purple-400"></i>
                </div>
            </div>
        </div>
        <div class="mt-4 bg-blue-50 border border-blue-200 rounded p-3">
            <p class="text-sm text-blue-800">
                <i class="fas fa-info-circle"></i>
                <strong>Info:</strong> Il load average rappresenta il numero medio di processi in attesa di CPU.
                Un valore inferiore al numero di core CPU è considerato normale.
            </p>
        </div>
    </div>

    <!-- Memory Usage -->
    @if(!empty($serverLoad['memory']))
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-memory text-purple-600"></i> Utilizzo Memoria RAM
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p class="text-gray-600 text-sm mb-1">Totale</p>
                <p class="text-2xl font-bold text-gray-800">{{ $serverLoad['memory']['total'] }}</p>
            </div>
            <div class="bg-red-50 rounded-lg p-4 border border-red-200">
                <p class="text-red-600 text-sm mb-1">Utilizzata</p>
                <p class="text-2xl font-bold text-red-700">{{ $serverLoad['memory']['used'] }}</p>
            </div>
            <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                <p class="text-green-600 text-sm mb-1">Libera</p>
                <p class="text-2xl font-bold text-green-700">{{ $serverLoad['memory']['free'] }}</p>
            </div>
        </div>
    </div>
    @endif

    <!-- Disk Usage -->
    @if(!empty($serverLoad['disk']))
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-hdd text-orange-600"></i> Utilizzo Disco
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p class="text-gray-600 text-sm mb-1">Filesystem</p>
                <p class="text-sm font-bold text-gray-800 break-all">{{ $serverLoad['disk']['filesystem'] }}</p>
            </div>
            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p class="text-blue-600 text-sm mb-1">Dimensione</p>
                <p class="text-2xl font-bold text-blue-700">{{ $serverLoad['disk']['size'] }}</p>
            </div>
            <div class="bg-red-50 rounded-lg p-4 border border-red-200">
                <p class="text-red-600 text-sm mb-1">Utilizzato</p>
                <p class="text-2xl font-bold text-red-700">{{ $serverLoad['disk']['used'] }}</p>
            </div>
            <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                <p class="text-green-600 text-sm mb-1">Disponibile</p>
                <p class="text-2xl font-bold text-green-700">{{ $serverLoad['disk']['available'] }}</p>
            </div>
            <div class="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <p class="text-yellow-600 text-sm mb-1">% Utilizzato</p>
                <p class="text-2xl font-bold text-yellow-700">{{ $serverLoad['disk']['use_percent'] }}</p>
            </div>
        </div>
    </div>
    @endif

    <!-- Storage Directory Size -->
    @if($storageSize['success'])
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-folder text-yellow-600"></i> Dimensione Directory Storage
        </h2>
        <div class="bg-yellow-50 rounded-lg p-6 border border-yellow-200">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-yellow-700 text-sm mb-1">Percorso</p>
                    <p class="font-mono text-sm text-gray-700">{{ $storageSize['path'] }}</p>
                </div>
                <div class="text-right">
                    <p class="text-yellow-700 text-sm mb-1">Dimensione</p>
                    <p class="text-3xl font-bold text-yellow-800">{{ $storageSize['size'] }}</p>
                </div>
            </div>
        </div>
    </div>
    @endif

    <!-- PHP Processes -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fab fa-php text-indigo-600"></i> Processi PHP Attivi
            <span class="text-sm font-normal text-gray-600">({{ $phpProcesses['count'] }} processi)</span>
        </h2>

        @if($phpProcesses['count'] > 0)
            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 overflow-x-auto">
                <pre class="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words">@foreach($phpProcesses['processes'] as $process){{ $process }}
@endforeach</pre>
            </div>
        @else
            <div class="text-center py-8">
                <i class="fas fa-check-circle text-6xl text-green-300 mb-4"></i>
                <p class="text-gray-600">Nessun processo PHP attivo al momento</p>
            </div>
        @endif
    </div>

    <!-- Auto Refresh Note -->
    <div class="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
        <div class="flex items-start">
            <i class="fas fa-info-circle text-blue-600 text-xl mr-3 mt-1"></i>
            <div>
                <h3 class="text-blue-800 font-semibold">💡 Suggerimento</h3>
                <p class="text-blue-700 text-sm mt-1">
                    I dati di monitoraggio sono aggiornati al momento del caricamento della pagina.
                    Clicca su "Aggiorna" per ottenere i dati più recenti.
                </p>
            </div>
        </div>
    </div>
</div>
@endsection

@push('scripts')
<script>
// Auto-refresh ogni 30 secondi (opzionale)
// setTimeout(() => location.reload(), 30000);
</script>
@endpush
