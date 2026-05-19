@extends('aruba-admin.layout')

@section('title', 'Permessi - Aruba Admin')

@section('content')
<div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold text-gray-800">
                    <i class="fas fa-lock text-blue-600"></i>
                    Verifica Permessi
                </h1>
                <p class="text-gray-600 mt-2">Controlla e correggi i permessi delle cartelle critiche</p>
            </div>
            <div>
                <form method="POST" action="{{ route('aruba.admin.permissions.fix') }}"
                      onsubmit="return confirm('Tentare di correggere i permessi? (potrebbe non funzionare su alcuni hosting)')">
                    @csrf
                    <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        <i class="fas fa-wrench"></i> Correggi Permessi
                    </button>
                </form>
            </div>
        </div>
    </div>

    <!-- Permissions Table -->
    <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <i class="fas fa-folder"></i> Cartella
                        </th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <i class="fas fa-check-circle"></i> Esiste
                        </th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <i class="fas fa-pencil-alt"></i> Scrivibile
                        </th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <i class="fas fa-key"></i> Permessi
                        </th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <i class="fas fa-info-circle"></i> Stato
                        </th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    @foreach($permissions as $name => $info)
                        <tr class="hover:bg-gray-50">
                            <td class="px-6 py-4">
                                <div class="text-sm font-medium text-gray-900">{{ $name }}</div>
                                <div class="text-xs text-gray-500 font-mono truncate" style="max-width: 400px;">
                                    {{ $info['path'] }}
                                </div>
                            </td>
                            <td class="px-6 py-4 text-center">
                                @if($info['exists'])
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <i class="fas fa-check mr-1"></i> Sì
                                    </span>
                                @else
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        <i class="fas fa-times mr-1"></i> No
                                    </span>
                                @endif
                            </td>
                            <td class="px-6 py-4 text-center">
                                @if($info['writable'])
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <i class="fas fa-check mr-1"></i> Sì
                                    </span>
                                @else
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        <i class="fas fa-times mr-1"></i> No
                                    </span>
                                @endif
                            </td>
                            <td class="px-6 py-4 text-center">
                                <span class="font-mono text-sm {{ $info['permissions'] === '0775' || $info['permissions'] === '0755' ? 'text-green-600' : 'text-orange-600' }}">
                                    {{ $info['permissions'] }}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-center">
                                @if($info['exists'] && $info['writable'])
                                    <i class="fas fa-check-circle text-green-500 text-xl"></i>
                                @elseif($info['exists'] && !$info['writable'])
                                    <i class="fas fa-exclamation-triangle text-yellow-500 text-xl"></i>
                                @else
                                    <i class="fas fa-times-circle text-red-500 text-xl"></i>
                                @endif
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>

    <!-- Legend -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h3 class="text-lg font-bold text-gray-800 mb-4">
            <i class="fas fa-book"></i> Legenda Permessi
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
                <h4 class="font-semibold text-gray-700 mb-2">Permessi consigliati:</h4>
                <ul class="space-y-1 text-gray-600">
                    <li><span class="font-mono font-bold">0775</span> - Lettura/scrittura per owner e gruppo</li>
                    <li><span class="font-mono font-bold">0755</span> - Lettura/scrittura per owner, solo lettura per altri</li>
                </ul>
            </div>
            <div>
                <h4 class="font-semibold text-gray-700 mb-2">Cartelle critiche:</h4>
                <ul class="space-y-1 text-gray-600">
                    <li><strong>storage/*</strong> - Cache, sessioni, log, upload</li>
                    <li><strong>bootstrap/cache</strong> - File di ottimizzazione Laravel</li>
                </ul>
            </div>
        </div>
    </div>

    <!-- Warning Info -->
    <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
        <div class="flex">
            <div class="flex-shrink-0">
                <i class="fas fa-exclamation-triangle text-yellow-500 text-xl"></i>
            </div>
            <div class="ml-3">
                <h3 class="text-sm font-medium text-yellow-800">Nota Importante su Aruba</h3>
                <div class="mt-2 text-sm text-yellow-700">
                    <p class="mb-2">Su hosting condivisi come Aruba, la correzione automatica dei permessi potrebbe non funzionare.</p>
                    <p class="mb-2"><strong>Se hai problemi di permessi:</strong></p>
                    <ol class="list-decimal list-inside space-y-1">
                        <li>Usa il File Manager di Aruba</li>
                        <li>Seleziona la cartella <code class="bg-yellow-100 px-1 rounded">storage</code></li>
                        <li>Clicca "Cambia permessi" e imposta <code class="bg-yellow-100 px-1 rounded">755</code> ricorsivamente</li>
                        <li>Ripeti per <code class="bg-yellow-100 px-1 rounded">bootstrap/cache</code></li>
                    </ol>
                </div>
            </div>
        </div>
    </div>

    <!-- STORAGE LINK SECTION -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
            <i class="fas fa-link text-purple-600"></i>
            Storage Link
        </h2>

        <!-- Artisan Status -->
        @if(!$artisanAvailable)
            <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas fa-exclamation-circle text-red-500 text-xl"></i>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-800">⚠️ Artisan Non Disponibile</h3>
                        <div class="mt-2 text-sm text-red-700">
                            <p>Il comando Artisan non è disponibile su questo server. Dovrai creare il symlink manualmente.</p>
                            <p class="mt-2"><strong>Metodo manuale (via FTP o File Manager):</strong></p>
                            <p class="mt-1">Crea un file <code class="bg-red-100 px-1 rounded">public/create-symlink.php</code> con questo codice:</p>
                            <pre class="bg-red-100 p-2 rounded font-mono text-xs mt-2 overflow-x-auto">&lt;?php
$target = realpath(__DIR__ . '/../storage/app/public');
$link = __DIR__ . '/storage';
symlink($target, $link);
echo "✅ Symlink creato!";
?&gt;</pre>
                            <p class="mt-2">Poi visita: <code class="bg-red-100 px-1 rounded">https://tuosito.it/create-symlink.php</code></p>
                        </div>
                    </div>
                </div>
            </div>
        @endif

        <!-- Storage Link Status -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="border rounded-lg p-4 {{ $linkStatus['exists'] && $linkStatus['is_valid'] ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300' }}">
                <div class="flex items-center justify-between mb-2">
                    <span class="font-semibold">Symlink</span>
                    <span class="text-2xl">
                        @if($linkStatus['exists'] && $linkStatus['is_link'] && $linkStatus['is_valid'])
                            <i class="fas fa-check-circle text-green-500"></i>
                        @else
                            <i class="fas fa-times-circle text-red-500"></i>
                        @endif
                    </span>
                </div>
                <div class="text-sm text-gray-600">
                    @if($linkStatus['exists'] && $linkStatus['is_link'] && $linkStatus['is_valid'])
                        ✅ Attivo e funzionante
                    @elseif($linkStatus['exists'] && !$linkStatus['is_link'])
                        ⚠️ Esiste come cartella normale
                    @else
                        ❌ Non presente
                    @endif
                </div>
            </div>

            <div class="border rounded-lg p-4 {{ $linkStatus['target_exists'] ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300' }}">
                <div class="flex items-center justify-between mb-2">
                    <span class="font-semibold">Target Directory</span>
                    <span class="text-2xl">
                        @if($linkStatus['target_exists'])
                            <i class="fas fa-check-circle text-green-500"></i>
                        @else
                            <i class="fas fa-times-circle text-red-500"></i>
                        @endif
                    </span>
                </div>
                <div class="text-sm text-gray-600">
                    storage/app/public {{ $linkStatus['target_exists'] ? 'esiste' : 'mancante' }}
                </div>
            </div>

            <div class="border rounded-lg p-4 bg-blue-50 border-blue-300">
                <div class="flex items-center justify-between mb-2">
                    <span class="font-semibold">File Accessibili</span>
                    <span class="text-2xl font-bold text-blue-600">{{ $linkStatus['files_count'] }}</span>
                </div>
                <div class="text-sm text-gray-600">
                    File pubblici
                </div>
            </div>
        </div>

        <!-- Actions -->
        @if($artisanAvailable)
            <div class="flex flex-wrap gap-3 mb-6">
                <form method="POST" action="{{ route('aruba.admin.storage-link.create') }}" class="inline" onsubmit="return confirm('Creare lo storage link?')">
                    @csrf
                    <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-semibold">
                        <i class="fas fa-link"></i> Crea Storage Link
                    </button>
                </form>

                <button onclick="testStorageLink()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-semibold">
                    <i class="fas fa-flask"></i> Testa Funzionamento
                </button>

                @if($linkStatus['exists'])
                    <form method="POST" action="{{ route('aruba.admin.storage-link.remove') }}" class="inline" onsubmit="return confirm('Rimuovere lo storage link?')">
                        @csrf
                        <button type="submit" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-semibold">
                            <i class="fas fa-unlink"></i> Rimuovi Link
                        </button>
                    </form>
                @endif
            </div>
        @endif

        <!-- Test Results -->
        <div id="testResults" class="hidden mb-6">
            <h3 class="font-bold text-gray-800 mb-2">Risultati Test:</h3>
            <div id="testResultsContent" class="space-y-2"></div>
        </div>

        <!-- Info Box -->
        <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div class="flex">
                <div class="flex-shrink-0">
                    <i class="fas fa-info-circle text-blue-500 text-xl"></i>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">Cos'è lo Storage Link?</h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <p class="mb-2">
                            Il <strong>storage link</strong> è un symbolic link che collega <code class="bg-blue-100 px-1 rounded">public/storage</code>
                            a <code class="bg-blue-100 px-1 rounded">storage/app/public</code>.
                        </p>
                        <p class="mb-2">
                            Permette ai file caricati (immagini, documenti) di essere accessibili pubblicamente tramite URL.
                        </p>
                        <p>
                            <strong>Quando serve:</strong> Dopo il primo deploy, quando gli upload non sono accessibili.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- SSH Commands -->
    <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <div class="flex">
            <div class="flex-shrink-0">
                <i class="fas fa-terminal text-blue-500 text-xl"></i>
            </div>
            <div class="ml-3">
                <h3 class="text-sm font-medium text-blue-800">Se hai accesso SSH</h3>
                <div class="mt-2 text-sm text-blue-700">
                    <p class="mb-2">Puoi correggere permessi e storage link manualmente:</p>
                    <pre class="bg-blue-100 p-2 rounded font-mono text-xs overflow-x-auto">chmod -R 775 storage bootstrap/cache
php artisan storage:link</pre>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function testStorageLink() {
    const resultsDiv = document.getElementById('testResults');
    const contentDiv = document.getElementById('testResultsContent');

    resultsDiv.classList.remove('hidden');
    contentDiv.innerHTML = '<div class="text-center py-2"><i class="fas fa-spinner fa-spin text-blue-500"></i> Test in corso...</div>';

    fetch('{{ route('aruba.admin.storage-link.test') }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            let html = '';
            data.results.forEach(result => {
                const icon = result.status ? '<i class="fas fa-check-circle text-green-500"></i>' : '<i class="fas fa-times-circle text-red-500"></i>';
                const bgColor = result.status ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
                html += `<div class="border ${bgColor} rounded p-2 flex items-start">`;
                html += `<span class="mr-2">${icon}</span>`;
                html += `<div><strong>${result.test}</strong><br><small class="text-gray-600">${result.details}</small></div>`;
                html += `</div>`;
            });
            contentDiv.innerHTML = html;
        }
    })
    .catch(error => {
        contentDiv.innerHTML = '<div class="text-red-600">Errore: ' + error.message + '</div>';
    });
}
</script>
@endsection
