@extends('aruba-admin.layout')

@section('title', 'Composer Management - Aruba Admin')

@section('content')
    <div class="space-y-6">
        <!-- Header -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800">
                        <i class="fas fa-box text-blue-600"></i>
                        Composer Management
                    </h1>
                    <p class="text-gray-600 mt-2">Gestione pacchetti e dipendenze PHP</p>
                </div>
            </div>
        </div>

        <!-- Composer Status -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-info-circle text-blue-600"></i> Stato Composer
            </h2>

            @if ($composerVersion)
                <div class="bg-green-50 border-l-4 border-green-400 p-4 rounded">
                    <div class="flex items-center">
                        <i class="fas fa-check-circle text-green-600 text-2xl mr-3"></i>
                        <div>
                            <h3 class="text-green-800 font-semibold">✅ Composer Disponibile</h3>
                            <p class="text-green-700 text-sm mt-1 font-mono">{{ $composerVersion }}</p>
                        </div>
                    </div>
                </div>
            @else
                <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                    <div class="flex items-center">
                        <i class="fas fa-times-circle text-red-600 text-2xl mr-3"></i>
                        <div>
                            <h3 class="text-red-800 font-semibold">❌ Composer Non Disponibile</h3>
                            <p class="text-red-700 text-sm mt-1">
                                Composer non è installato o non è accessibile dal server.
                                Contatta il supporto Aruba per verificare la disponibilità.
                            </p>
                        </div>
                    </div>
                </div>
            @endif
        </div>
        <!-- Diagnostic Tool -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-stethoscope text-orange-600"></i> Diagnostica Composer
            </h2>

            <button type="button" onclick="runDiagnostic()"
                class="bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition mb-4">
                <i class="fas fa-search mr-2"></i>
                Cerca Composer sul Server
            </button>

            <div id="diagnosticResult" class="hidden">
                <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 class="font-semibold text-gray-800 mb-2">Risultato Ricerca:</h3>
                    <pre id="diagnosticOutput" class="text-xs font-mono text-gray-700 whitespace-pre-wrap overflow-x-auto"></pre>
                </div>
            </div>
        </div>
        @if ($composerVersion)
            <!-- Quick Actions -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-bolt text-yellow-600"></i> Azioni Rapide
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <!-- Dump Autoload -->
                    <form method="POST" action="{{ route('aruba.admin.composer.dump') }}">
                        @csrf
                        <button type="submit"
                            onclick="return confirm('Rigenerare l\'autoload di Composer?\n\nQuesta operazione è sicura e veloce.')"
                            class="w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center space-x-3 shadow-md hover:shadow-lg">
                            <i class="fas fa-sync-alt text-2xl"></i>
                            <div class="text-left">
                                <div class="font-semibold">Dump Autoload</div>
                                <div class="text-xs opacity-90">Rigenera autoload classi</div>
                            </div>
                        </button>
                    </form>

                    <!-- Install -->
                    <button type="button" onclick="showInstallModal()"
                        class="w-full bg-green-600 text-white px-6 py-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center space-x-3 shadow-md hover:shadow-lg">
                        <i class="fas fa-download text-2xl"></i>
                        <div class="text-left">
                            <div class="font-semibold">Install</div>
                            <div class="text-xs opacity-90">Installa dipendenze</div>
                        </div>
                    </button>

                    <!-- Update -->
                    <button type="button" onclick="showUpdateModal()"
                        class="w-full bg-orange-600 text-white px-6 py-4 rounded-lg hover:bg-orange-700 transition flex items-center justify-center space-x-3 shadow-md hover:shadow-lg">
                        <i class="fas fa-arrow-up text-2xl"></i>
                        <div class="text-left">
                            <div class="font-semibold">Update</div>
                            <div class="text-xs opacity-90">Aggiorna pacchetti</div>
                        </div>
                    </button>
                </div>
            </div>

            <!-- Outdated Packages -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-exclamation-triangle text-yellow-600"></i> Pacchetti Non Aggiornati
                    @if ($outdated['success'] && count($outdated['packages']) > 0)
                        <span class="text-sm font-normal text-red-600">({{ count($outdated['packages']) }}
                            disponibili)</span>
                    @endif
                </h2>

                @if ($outdated['success'])
                    @if (count($outdated['packages']) > 0)
                        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                            <div class="flex items-start">
                                <i class="fas fa-info-circle text-yellow-600 text-xl mr-3 mt-1"></i>
                                <div>
                                    <h3 class="text-yellow-800 font-semibold">Aggiornamenti Disponibili</h3>
                                    <p class="text-yellow-700 text-sm mt-1">
                                        Sono disponibili aggiornamenti per alcuni pacchetti.
                                        Verifica la compatibilità prima di procedere con l'aggiornamento.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 overflow-x-auto">
                            <pre class="text-sm font-mono text-gray-700 whitespace-pre-wrap">
@foreach ($outdated['packages'] as $package)
{{ $package }}
@endforeach
</pre>
                        </div>

                        <div class="mt-4 flex space-x-3">
                            <button type="button" onclick="showUpdateModal()"
                                class="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 transition">
                                <i class="fas fa-arrow-up mr-2"></i>
                                Aggiorna Tutti
                            </button>
                            <button type="button" onclick="location.reload()"
                                class="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition">
                                <i class="fas fa-sync-alt mr-2"></i>
                                Ricontrolla
                            </button>
                        </div>
                    @else
                        <div class="text-center py-12">
                            <i class="fas fa-check-circle text-6xl text-green-300 mb-4"></i>
                            <p class="text-gray-600 text-lg">Tutti i pacchetti sono aggiornati</p>
                            <p class="text-gray-500 text-sm mt-2">Nessun aggiornamento disponibile</p>
                        </div>
                    @endif
                @else
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div class="flex items-start">
                            <i class="fas fa-exclamation-circle text-red-600 text-xl mr-3 mt-1"></i>
                            <div>
                                <h3 class="text-red-800 font-semibold">Errore nel controllo</h3>
                                <p class="text-red-700 text-sm mt-1">Non è stato possibile verificare i pacchetti non
                                    aggiornati.</p>
                            </div>
                        </div>
                    </div>
                @endif
            </div>

            <!-- Project Information -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-project-diagram text-purple-600"></i> Informazioni Progetto
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- composer.json -->
                    <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="font-semibold text-purple-800">
                                <i class="fas fa-file-code mr-2"></i>composer.json
                            </h3>
                            @php
                                $composerJsonPath = base_path('composer.json');
                                $composerJsonExists = file_exists($composerJsonPath);
                            @endphp
                            @if ($composerJsonExists)
                                <span class="text-green-600 text-xl">✅</span>
                            @else
                                <span class="text-red-600 text-xl">❌</span>
                            @endif
                        </div>
                        @if ($composerJsonExists)
                            <p class="text-sm text-purple-700">
                                <strong>Dimensione:</strong> {{ number_format(filesize($composerJsonPath) / 1024, 2) }} KB
                            </p>
                            <p class="text-sm text-purple-700 mt-1">
                                <strong>Modificato:</strong> {{ date('Y-m-d H:i:s', filemtime($composerJsonPath)) }}
                            </p>
                        @endif
                    </div>

                    <!-- composer.lock -->
                    <div class="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="font-semibold text-indigo-800">
                                <i class="fas fa-lock mr-2"></i>composer.lock
                            </h3>
                            @php
                                $composerLockPath = base_path('composer.lock');
                                $composerLockExists = file_exists($composerLockPath);
                            @endphp
                            @if ($composerLockExists)
                                <span class="text-green-600 text-xl">✅</span>
                            @else
                                <span class="text-red-600 text-xl">❌</span>
                            @endif
                        </div>
                        @if ($composerLockExists)
                            <p class="text-sm text-indigo-700">
                                <strong>Dimensione:</strong> {{ number_format(filesize($composerLockPath) / 1024, 2) }} KB
                            </p>
                            <p class="text-sm text-indigo-700 mt-1">
                                <strong>Modificato:</strong> {{ date('Y-m-d H:i:s', filemtime($composerLockPath)) }}
                            </p>
                        @endif
                    </div>

                    <!-- vendor directory -->
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="font-semibold text-blue-800">
                                <i class="fas fa-folder mr-2"></i>vendor/
                            </h3>
                            @php
                                $vendorPath = base_path('vendor');
                                $vendorExists = is_dir($vendorPath);
                            @endphp
                            @if ($vendorExists)
                                <span class="text-green-600 text-xl">✅</span>
                            @else
                                <span class="text-red-600 text-xl">❌</span>
                            @endif
                        </div>
                        @if ($vendorExists)
                            @php
                                $vendorSize = 0;
                                try {
                                    exec('du -sh ' . escapeshellarg($vendorPath), $output);
                                    if (!empty($output)) {
                                        $parts = explode("\t", $output[0]);
                                        $vendorSize = $parts[0] ?? '0';
                                    }
                                } catch (\Exception $e) {
                                    $vendorSize = 'N/A';
                                }
                            @endphp
                            <p class="text-sm text-blue-700">
                                <strong>Dimensione:</strong> {{ $vendorSize }}
                            </p>
                            <p class="text-sm text-blue-700 mt-1">
                                <strong>Pacchetti installati:</strong> Presente
                            </p>
                        @else
                            <p class="text-sm text-red-700">
                                Directory vendor non trovata. Eseguire <code class="bg-red-100 px-1 rounded">composer
                                    install</code>
                            </p>
                        @endif
                    </div>

                    <!-- autoload -->
                    <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="font-semibold text-green-800">
                                <i class="fas fa-cog mr-2"></i>Autoload
                            </h3>
                            @php
                                $autoloadPath = base_path('vendor/autoload.php');
                                $autoloadExists = file_exists($autoloadPath);
                            @endphp
                            @if ($autoloadExists)
                                <span class="text-green-600 text-xl">✅</span>
                            @else
                                <span class="text-red-600 text-xl">❌</span>
                            @endif
                        </div>
                        @if ($autoloadExists)
                            <p class="text-sm text-green-700">
                                <strong>File:</strong> vendor/autoload.php
                            </p>
                            <p class="text-sm text-green-700 mt-1">
                                <strong>Modificato:</strong> {{ date('Y-m-d H:i:s', filemtime($autoloadPath)) }}
                            </p>
                            <form method="POST" action="{{ route('aruba.admin.composer.dump') }}" class="mt-3">
                                @csrf
                                <button type="submit"
                                    class="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">
                                    <i class="fas fa-sync-alt mr-1"></i> Rigenera
                                </button>
                            </form>
                        @endif
                    </div>
                </div>
            </div>

            <!-- Warning Notes -->
            <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                <div class="flex items-start">
                    <i class="fas fa-exclamation-triangle text-red-600 text-xl mr-3 mt-1"></i>
                    <div>
                        <h3 class="text-red-800 font-semibold">⚠️ Attenzione</h3>
                        <ul class="text-red-700 text-sm mt-2 space-y-1">
                            <li>• <strong>composer install</strong>: Installa le dipendenze dal composer.lock (sicuro in
                                produzione)</li>
                            <li>• <strong>composer update</strong>: Aggiorna i pacchetti e modifica composer.lock (⚠️
                                PERICOLOSO in produzione)</li>
                            <li>• <strong>composer dump-autoload</strong>: Rigenera solo l'autoload (sempre sicuro)</li>
                            <li>• Prima di eseguire update, crea un backup del database e verifica la compatibilità</li>
                            <li>• Le operazioni possono richiedere diversi minuti su hosting condiviso</li>
                        </ul>
                    </div>
                </div>
            </div>
        @endif
    </div>

    <!-- Modal Install -->
    <div id="installModal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-96 shadow-lg rounded-lg bg-white">
            <div class="mt-3">
                <div class="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mx-auto">
                    <i class="fas fa-download text-green-600 text-2xl"></i>
                </div>
                <h3 class="text-lg leading-6 font-medium text-gray-900 text-center mt-4">Composer Install</h3>
                <div class="mt-2 px-7 py-3">
                    <p class="text-sm text-gray-600 text-center">
                        Vuoi installare le dipendenze da composer.lock?
                    </p>
                    <div class="mt-4 space-y-2">
                        <label class="flex items-center text-sm">
                            <input type="checkbox" id="installNoDev" checked class="mr-2">
                            <span>Escludi dipendenze dev (--no-dev)</span>
                        </label>
                    </div>
                </div>
                <div class="flex justify-center space-x-3 px-4 py-3">
                    <button onclick="hideInstallModal()"
                        class="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md shadow-sm hover:bg-gray-600">
                        Annulla
                    </button>
                    <button onclick="confirmInstall()"
                        class="px-4 py-2 bg-green-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-green-700">
                        Installa
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal Update -->
    <div id="updateModal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-96 shadow-lg rounded-lg bg-white">
            <div class="mt-3">
                <div class="flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mx-auto">
                    <i class="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
                </div>
                <h3 class="text-lg leading-6 font-medium text-gray-900 text-center mt-4">⚠️ Composer Update</h3>
                <div class="mt-2 px-7 py-3">
                    <p class="text-sm text-red-600 text-center font-semibold mb-2">
                        OPERAZIONE PERICOLOSA
                    </p>
                    <p class="text-sm text-gray-600 text-center">
                        L'update aggiornerà i pacchetti e modificherà composer.lock.
                        Questo può causare problemi di compatibilità.
                    </p>
                    <div class="mt-4 bg-yellow-50 border border-yellow-200 rounded p-3">
                        <p class="text-xs text-yellow-800">
                            <strong>Prima di procedere:</strong><br>
                            • Crea un backup del database<br>
                            • Verifica la compatibilità<br>
                            • Testa in ambiente di sviluppo
                        </p>
                    </div>
                </div>
                <div class="flex justify-center space-x-3 px-4 py-3">
                    <button onclick="hideUpdateModal()"
                        class="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md shadow-sm hover:bg-gray-600">
                        Annulla
                    </button>
                    <button onclick="confirmUpdate()"
                        class="px-4 py-2 bg-orange-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-orange-700">
                        Procedi
                    </button>
                </div>
            </div>
        </div>
    </div>
@endsection

@push('scripts')
    <script>
        function showInstallModal() {
            document.getElementById('installModal').classList.remove('hidden');
        }

        function hideInstallModal() {
            document.getElementById('installModal').classList.add('hidden');
        }

        function confirmInstall() {
            const noDev = document.getElementById('installNoDev').checked;
            alert('Funzionalità in sviluppo\n\nPer ora usa solo "Dump Autoload"');
            hideInstallModal();

            // TODO: Implementare chiamata al controller per composer install
            // form.submit();
        }

        function showUpdateModal() {
            document.getElementById('updateModal').classList.remove('hidden');
        }

        function hideUpdateModal() {
            document.getElementById('updateModal').classList.add('hidden');
        }

        function confirmUpdate() {
            if (confirm(
                    '⚠️ ULTIMA CONFERMA\n\nSei assolutamente sicuro di voler aggiornare i pacchetti?\n\nQuesta operazione modificherà composer.lock e potrebbe causare incompatibilità.'
                    )) {
                alert(
                    'Funzionalità in sviluppo\n\nPer sicurezza, questa funzione è disabilitata.\nUsa "composer update" da locale e poi carica i file aggiornati via FTP.');
                hideUpdateModal();

                // TODO: Implementare chiamata al controller per composer update
                // form.submit();
            } else {
                hideUpdateModal();
            }
        }

        // Chiudi modal cliccando fuori
        window.onclick = function(event) {
            const installModal = document.getElementById('installModal');
            const updateModal = document.getElementById('updateModal');

            if (event.target == installModal) {
                hideInstallModal();
            }
            if (event.target == updateModal) {
                hideUpdateModal();
            }
        }
    </script>
    <script>
        function runDiagnostic() {
            const resultDiv = document.getElementById('diagnosticResult');
            const outputPre = document.getElementById('diagnosticOutput');

            resultDiv.classList.remove('hidden');
            outputPre.textContent = 'Ricerca in corso...';

            fetch('{{ route('aruba.admin.composer.diagnostic') }}', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    outputPre.textContent = data.output;

                    if (data.found) {
                        outputPre.classList.add('text-green-700');
                        outputPre.classList.remove('text-red-700');
                    } else {
                        outputPre.classList.add('text-red-700');
                        outputPre.classList.remove('text-green-700');
                    }
                })
                .catch(error => {
                    outputPre.textContent = 'Errore nella diagnostica: ' + error.message;
                    outputPre.classList.add('text-red-700');
                });
        }
    </script>
@endpush
