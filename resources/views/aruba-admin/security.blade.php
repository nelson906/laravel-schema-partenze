@extends('aruba-admin.layout')

@section('title', 'Security Check - Aruba Admin')

@section('content')
<div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold text-gray-800">
                    <i class="fas fa-shield-alt text-blue-600"></i>
                    Security Check
                </h1>
                <p class="text-gray-600 mt-2">Verifica sicurezza file e permessi del sistema</p>
            </div>
            <button onclick="location.reload()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition flex items-center space-x-2">
                <i class="fas fa-sync-alt"></i>
                <span>Riesegui Check</span>
            </button>
        </div>
    </div>

    <!-- Security Score -->
    @php
        $secureCount = 0;
        $totalCount = count($sensitiveFiles);
        foreach($sensitiveFiles as $file) {
            if(isset($file['secure']) && $file['secure']) $secureCount++;
        }
        $securityScore = $totalCount > 0 ? round(($secureCount / $totalCount) * 100) : 0;

        if($securityScore >= 80) {
            $scoreColor = 'green';
            $scoreIcon = 'fa-check-circle';
            $scoreText = 'Ottimo';
        } elseif($securityScore >= 60) {
            $scoreColor = 'yellow';
            $scoreIcon = 'fa-exclamation-triangle';
            $scoreText = 'Discreto';
        } else {
            $scoreColor = 'red';
            $scoreIcon = 'fa-times-circle';
            $scoreText = 'Critico';
        }
    @endphp

    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-award text-{{ $scoreColor }}-600"></i> Security Score
        </h2>
        <div class="flex items-center justify-between bg-{{ $scoreColor }}-50 rounded-lg p-6 border border-{{ $scoreColor }}-200">
            <div>
                <p class="text-{{ $scoreColor }}-700 text-sm font-semibold mb-1">Livello di Sicurezza</p>
                <p class="text-4xl font-bold text-{{ $scoreColor }}-800">{{ $securityScore }}%</p>
                <p class="text-{{ $scoreColor }}-600 text-sm mt-2">{{ $scoreText }}</p>
            </div>
            <i class="fas {{ $scoreIcon }} text-6xl text-{{ $scoreColor }}-400"></i>
        </div>
    </div>

    <!-- Sensitive Files Check -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-file-shield text-red-600"></i> File Sensibili
        </h2>
        <div class="overflow-x-auto">
            <table class="min-w-full">
                <thead>
                    <tr class="bg-gray-100">
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">File</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Esiste</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Permessi</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Scrivibile</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Leggibile</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    @foreach($sensitiveFiles as $name => $info)
                        @php
                            if (!$info['exists']) {
                                $statusColor = 'gray';
                                $statusIcon = 'fa-question';
                                $statusText = 'N/A';
                            } elseif (isset($info['secure']) && $info['secure']) {
                                $statusColor = 'green';
                                $statusIcon = 'fa-check-circle';
                                $statusText = 'Sicuro';
                            } else {
                                $statusColor = 'red';
                                $statusIcon = 'fa-exclamation-triangle';
                                $statusText = 'Attenzione';
                            }
                        @endphp
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3">
                                <span class="font-mono text-sm font-semibold">{{ $name }}</span>
                            </td>
                            <td class="px-4 py-3 text-center">
                                @if($info['exists'])
                                    <span class="text-green-600 text-xl">✅</span>
                                @else
                                    <span class="text-gray-400 text-xl">❌</span>
                                @endif
                            </td>
                            <td class="px-4 py-3 text-center">
                                @if($info['exists'])
                                    <code class="bg-gray-100 px-2 py-1 rounded text-sm">{{ $info['permissions'] }}</code>
                                @else
                                    <span class="text-gray-400">-</span>
                                @endif
                            </td>
                            <td class="px-4 py-3 text-center">
                                @if($info['exists'])
                                    @if($info['writable'])
                                        <span class="text-yellow-600 text-xl">✏️</span>
                                    @else
                                        <span class="text-gray-400 text-xl">🔒</span>
                                    @endif
                                @else
                                    <span class="text-gray-400">-</span>
                                @endif
                            </td>
                            <td class="px-4 py-3 text-center">
                                @if($info['exists'])
                                    @if($info['readable'])
                                        <span class="text-green-600 text-xl">👁️</span>
                                    @else
                                        <span class="text-red-600 text-xl">🚫</span>
                                    @endif
                                @else
                                    <span class="text-gray-400">-</span>
                                @endif
                            </td>
                            <td class="px-4 py-3 text-center">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-{{ $statusColor }}-100 text-{{ $statusColor }}-800">
                                    <i class="fas {{ $statusIcon }} mr-1"></i>
                                    {{ $statusText }}
                                </span>
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>

    <!-- Suspicious Files -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-search text-orange-600"></i> File Sospetti
            <span class="text-sm font-normal text-gray-600">({{ $suspiciousFiles['count'] }} trovati)</span>
        </h2>

        @if($suspiciousFiles['count'] > 0)
            <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div class="flex items-start">
                    <i class="fas fa-exclamation-triangle text-red-600 text-2xl mr-3"></i>
                    <div>
                        <h3 class="text-red-800 font-semibold">⚠️ Attenzione</h3>
                        <p class="text-red-700 text-sm mt-1">
                            Sono stati trovati file potenzialmente pericolosi o non necessari.
                            Si consiglia di rimuoverli per aumentare la sicurezza.
                        </p>
                    </div>
                </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <pre class="text-xs font-mono text-gray-700 overflow-x-auto">@foreach($suspiciousFiles['suspicious_files'] as $file){{ $file }}
@endforeach</pre>
            </div>
        @else
            <div class="text-center py-12">
                <i class="fas fa-check-circle text-6xl text-green-300 mb-4"></i>
                <p class="text-gray-600 text-lg">Nessun file sospetto trovato</p>
                <p class="text-gray-500 text-sm mt-2">Il sistema appare pulito</p>
            </div>
        @endif
    </div>

    <!-- Security Recommendations -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">
            <i class="fas fa-lightbulb text-yellow-600"></i> Raccomandazioni di Sicurezza
        </h2>
        <div class="space-y-4">
            <div class="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <i class="fas fa-lock text-blue-600 text-xl mt-1"></i>
                <div>
                    <h3 class="font-semibold text-blue-800">File .env</h3>
                    <p class="text-sm text-blue-700 mt-1">
                        Il file .env deve avere permessi 600 o 640 e NON deve essere scrivibile dal webserver.
                        Contiene credenziali sensibili e deve essere protetto.
                    </p>
                </div>
            </div>

            <div class="flex items-start space-x-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <i class="fas fa-folder text-green-600 text-xl mt-1"></i>
                <div>
                    <h3 class="font-semibold text-green-800">Directory storage/</h3>
                    <p class="text-sm text-green-700 mt-1">
                        La directory storage/ DEVE essere scrivibile (775) per permettere a Laravel di creare cache e log.
                        Assicurati che non sia accessibile direttamente via web.
                    </p>
                </div>
            </div>

            <div class="flex items-start space-x-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <i class="fas fa-code text-yellow-600 text-xl mt-1"></i>
                <div>
                    <h3 class="font-semibold text-yellow-800">File Composer</h3>
                    <p class="text-sm text-yellow-700 mt-1">
                        I file composer.json e composer.lock dovrebbero essere in sola lettura (644) dopo il deployment.
                        Non devono essere modificabili dal webserver.
                    </p>
                </div>
            </div>

            <div class="flex items-start space-x-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <i class="fas fa-trash text-red-600 text-xl mt-1"></i>
                <div>
                    <h3 class="font-semibold text-red-800">File di Backup</h3>
                    <p class="text-sm text-red-700 mt-1">
                        Rimuovi tutti i file .bak, .php~, .DS_Store e altri file temporanei.
                        Possono contenere informazioni sensibili o codice sorgente.
                    </p>
                </div>
            </div>

            <div class="flex items-start space-x-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <i class="fas fa-shield-alt text-purple-600 text-xl mt-1"></i>
                <div>
                    <h3 class="font-semibold text-purple-800">Debug Mode</h3>
                    <p class="text-sm text-purple-700 mt-1">
                        Assicurati che APP_DEBUG sia impostato su <code class="bg-purple-100 px-1 rounded">false</code> in produzione.
                        Il debug mode espone informazioni sensibili sul sistema.
                    </p>
                </div>
            </div>
        </div>
    </div>

    <!-- Quick Actions -->
    <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
        <h2 class="text-xl font-bold mb-4">
            <i class="fas fa-bolt"></i> Azioni Rapide
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a href="{{ route('aruba.admin.permissions') }}"
               class="bg-white text-blue-600 px-6 py-4 rounded-lg hover:bg-blue-50 transition text-center font-semibold flex items-center justify-center space-x-2">
                <i class="fas fa-wrench"></i>
                <span>Correggi Permessi</span>
            </a>
            <a href="{{ route('aruba.admin.logs') }}"
               class="bg-white text-blue-600 px-6 py-4 rounded-lg hover:bg-blue-50 transition text-center font-semibold flex items-center justify-center space-x-2">
                <i class="fas fa-file-alt"></i>
                <span>Verifica Log</span>
            </a>
        </div>
    </div>
</div>
@endsection
