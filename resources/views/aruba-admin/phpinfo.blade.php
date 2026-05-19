@extends('aruba-admin.layout')

@section('title', 'PHP Info - Aruba Admin')

@section('content')
<div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h1 class="text-3xl font-bold text-gray-800">
            <i class="fab fa-php text-blue-600"></i>
            PHP Info
        </h1>
        <p class="text-gray-600 mt-2">Informazioni complete sulla configurazione PHP del server</p>
    </div>

    <!-- Warning -->
    <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
        <div class="flex">
            <div class="flex-shrink-0">
                <i class="fas fa-exclamation-triangle text-yellow-500 text-xl"></i>
            </div>
            <div class="ml-3">
                <h3 class="text-sm font-medium text-yellow-800">Attenzione alla Sicurezza</h3>
                <p class="mt-1 text-sm text-yellow-700">
                    Questa pagina mostra informazioni sensibili sul server. 
                    Assicurati che solo gli amministratori possano accedervi.
                </p>
            </div>
        </div>
    </div>

    <!-- PHPInfo Content -->
    <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <style>
            /* Override phpinfo styles to match Tailwind */
            #phpinfo table {
                width: 100%;
                border-collapse: collapse;
            }
            #phpinfo td, #phpinfo th {
                padding: 0.5rem;
                border: 1px solid #e5e7eb;
            }
            #phpinfo th {
                background-color: #f3f4f6;
                font-weight: 600;
                text-align: left;
            }
            #phpinfo tr:nth-child(even) {
                background-color: #f9fafb;
            }
            #phpinfo h1, #phpinfo h2 {
                background-color: #3b82f6;
                color: white;
                padding: 0.75rem 1rem;
                margin: 0;
                font-size: 1.25rem;
            }
            #phpinfo .center {
                text-align: center;
            }
            #phpinfo .e {
                background-color: #dbeafe;
                font-weight: 600;
            }
            #phpinfo .v {
                background-color: #f3f4f6;
            }
        </style>
        <div id="phpinfo" class="p-4">
            {!! phpinfo() !!}
        </div>
    </div>
</div>

@push('scripts')
<script>
    // Cleanup phpinfo output - remove inline styles
    document.addEventListener('DOMContentLoaded', function() {
        const phpinfoDiv = document.getElementById('phpinfo');
        if (phpinfoDiv) {
            // Remove body and head tags that phpinfo() adds
            let content = phpinfoDiv.innerHTML;
            content = content.replace(/<body>/gi, '');
            content = content.replace(/<\/body>/gi, '');
            content = content.replace(/<head>[\s\S]*?<\/head>/gi, '');
            content = content.replace(/<html[\s\S]*?>/gi, '');
            content = content.replace(/<\/html>/gi, '');
            phpinfoDiv.innerHTML = content;
        }
    });
</script>
@endpush
@endsection
