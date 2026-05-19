@extends('aruba-admin.layout')

@section('title', 'Logs - Aruba Admin')

@section('content')
<div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold text-gray-800">
                    <i class="fas fa-file-alt text-blue-600"></i>
                    Log Applicazione
                </h1>
                <p class="text-gray-600 mt-2">Ultimi errori e messaggi di log di Laravel</p>
            </div>
            <div>
                <form method="POST" action="{{ route('aruba.admin.logs.clear') }}"
                      onsubmit="return confirm('Sei sicuro di voler cancellare tutti i log?')">
                    @csrf
                    <button type="submit" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
                        <i class="fas fa-trash"></i> Cancella Log
                    </button>
                </form>
            </div>
        </div>
    </div>

    @if(isset($logs['error']))
        <!-- Error Message -->
        <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <div class="flex">
                <div class="flex-shrink-0">
                    <i class="fas fa-exclamation-circle text-red-500 text-xl"></i>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">Errore</h3>
                    <p class="mt-1 text-sm text-red-700">{{ $logs['error'] }}</p>
                </div>
            </div>
        </div>
    @else
        <!-- Log Info -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <p class="text-gray-600 text-sm">Dimensione File</p>
                    <p class="text-lg font-semibold text-gray-800">{{ $logs['file_size'] }}</p>
                </div>
                <div>
                    <p class="text-gray-600 text-sm">Ultima Modifica</p>
                    <p class="text-lg font-semibold text-gray-800">{{ $logs['last_modified'] }}</p>
                </div>
            </div>
        </div>

        <!-- Log Content -->
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
            <div class="bg-gray-800 text-white px-4 py-3 flex justify-between items-center">
                <span class="font-mono text-sm">storage/logs/laravel.log (ultimi 100 righe)</span>
                <div class="flex gap-2">
                    <button onclick="copyLogs()" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs">
                        <i class="fas fa-copy"></i> Copia
                    </button>
                    <form method="POST" action="{{ route('aruba.admin.logs.clear') }}"
                          onsubmit="return confirm('Sei sicuro di voler cancellare tutti i log?')" class="inline">
                        @csrf
                        <button type="submit" class="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs">
                            <i class="fas fa-trash"></i> Cancella
                        </button>
                    </form>
                </div>            </div>
            <div class="bg-gray-900 text-gray-100 p-4" style="max-height: 600px; overflow-y: auto;">
                <pre id="log-content" class="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">@if(empty($logs['lines']) || (count($logs['lines']) === 1 && empty($logs['lines'][0])))
<span class="text-green-400">✓ Nessun log presente (tutto ok!)</span>
@else
@foreach($logs['lines'] as $line)
@if(!empty(trim($line)))
<span class="@if(str_contains($line, 'ERROR')) text-red-400 @elseif(str_contains($line, 'WARNING')) text-yellow-400 @elseif(str_contains($line, 'INFO')) text-blue-400 @else text-gray-300 @endif">{{ $line }}</span>
@endif
@endforeach
@endif</pre>
            </div>
        </div>

        <!-- Info Panel -->
        <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div class="flex">
                <div class="flex-shrink-0">
                    <i class="fas fa-info-circle text-blue-500 text-xl"></i>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">Come leggere i log</h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <ul class="list-disc list-inside space-y-1">
                            <li><span class="text-red-600 font-bold">Rosso:</span> Errori critici (ERROR)</li>
                            <li><span class="text-yellow-600 font-bold">Giallo:</span> Warning e avvisi (WARNING)</li>
                            <li><span class="text-blue-600 font-bold">Blu:</span> Informazioni (INFO)</li>
                            <li>I log più recenti sono in alto</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    @endif
</div>

@push('scripts')
<script>
function copyLogs() {
    const logContent = document.getElementById('log-content');
    const textArea = document.createElement('textarea');
    textArea.value = logContent.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);

    // Show feedback
    alert('✓ Log copiati negli appunti');
}
</script>
@endpush
@endsection
