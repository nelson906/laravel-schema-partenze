@extends('aruba-admin.layout')

@section('title', 'Database Backup - Aruba Admin')

@section('content')
<div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold text-gray-800">
                    <i class="fas fa-database text-blue-600"></i>
                    Database Backup
                </h1>
                <p class="text-gray-600 mt-2">Gestione backup e ripristino database MySQL</p>
            </div>
            <form method="POST" action="{{ route('aruba.admin.database.backup') }}">
                @csrf
                <button type="submit" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition flex items-center space-x-2">
                    <i class="fas fa-download"></i>
                    <span>Crea Nuovo Backup</span>
                </button>
            </form>
        </div>
    </div>

    <!-- Database Info -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-info-circle text-blue-600"></i> Informazioni Database
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <p class="text-gray-600 text-sm">Database</p>
                <p class="text-lg font-semibold text-gray-800">{{ config('database.connections.mysql.database') }}</p>
            </div>
            <div>
                <p class="text-gray-600 text-sm">Driver</p>
                <p class="text-lg font-semibold text-gray-800">{{ config('database.default') }}</p>
            </div>
            <div>
                <p class="text-gray-600 text-sm">Host</p>
                <p class="text-lg font-semibold text-gray-800">{{ config('database.connections.mysql.host') }}</p>
            </div>
        </div>
    </div>

    <!-- Backup List -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-history text-blue-600"></i> Backup Disponibili
            <span class="text-sm font-normal text-gray-600">({{ count($backups) }} totali)</span>
        </h2>

        @if(count($backups) > 0)
            <div class="overflow-x-auto">
                <table class="min-w-full">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Filename</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Data/Ora</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Dimensione</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Azioni</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        @foreach($backups as $backup)
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-3">
                                    <span class="font-mono text-sm">{{ $backup['filename'] }}</span>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600">
                                    {{ $backup['date'] }}
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600">
                                    {{ number_format($backup['size'] / 1024 / 1024, 2) }} MB
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <div class="flex justify-center space-x-2">
                                        <!-- Download -->
                                        <a href="{{ asset('storage/backups/database/' . $backup['filename']) }}"
                                           download
                                           class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition"
                                           title="Download">
                                            <i class="fas fa-download"></i>
                                        </a>

                                        <!-- Restore -->
                                        <button type="button"
                                                onclick="confirmRestore('{{ $backup['filename'] }}')"
                                                class="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600 transition"
                                                title="Ripristina">
                                            <i class="fas fa-undo"></i>
                                        </button>

                                        <!-- Delete -->
                                        <button type="button"
                                                onclick="confirmDelete('{{ $backup['filename'] }}')"
                                                class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition"
                                                title="Elimina">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        @else
            <div class="text-center py-12">
                <i class="fas fa-inbox text-6xl text-gray-300 mb-4"></i>
                <p class="text-gray-600 text-lg">Nessun backup disponibile</p>
                <p class="text-gray-500 text-sm mt-2">Clicca su "Crea Nuovo Backup" per iniziare</p>
            </div>
        @endif
    </div>

    <!-- Warning Note -->
    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
        <div class="flex items-start">
            <i class="fas fa-exclamation-triangle text-yellow-600 text-xl mr-3 mt-1"></i>
            <div>
                <h3 class="text-yellow-800 font-semibold">⚠️ Attenzione</h3>
                <ul class="text-yellow-700 text-sm mt-2 space-y-1">
                    <li>• Il ripristino sovrascriverà TUTTI i dati correnti del database</li>
                    <li>• Si consiglia di creare un backup prima di ripristinare</li>
                    <li>• I backup sono salvati in <code class="bg-yellow-100 px-1 rounded">storage/backups/database/</code></li>
                    <li>• Verifica che la cartella storage/backups abbia permessi di scrittura (775)</li>
                </ul>
            </div>
        </div>
    </div>
</div>

<!-- Form nascosto per restore -->
<form id="restore-form" method="POST" action="{{ route('aruba.admin.database.restore') }}" style="display: none;">
    @csrf
    <input type="hidden" name="filename" id="restore-filename">
</form>
@endsection

@push('scripts')
<script>
function confirmRestore(filename) {
    if (confirm('⚠️ ATTENZIONE!\n\nSei sicuro di voler ripristinare il database dal backup:\n' + filename + '\n\nQuesta operazione sovrascriverà TUTTI i dati correnti!\n\nSi consiglia di creare un backup prima di procedere.')) {
        document.getElementById('restore-filename').value = filename;
        document.getElementById('restore-form').submit();
    }
}

function confirmDelete(filename) {
    if (confirm('Sei sicuro di voler eliminare il backup:\n' + filename + '?\n\nQuesta operazione è irreversibile.')) {
        // TODO: Implementare eliminazione backup
        alert('Funzionalità in sviluppo');
    }
}
</script>
@endpush
