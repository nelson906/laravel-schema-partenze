@extends('aruba-admin.layout')

@section('title', 'Gestione Cache - Aruba Admin')

@section('content')
<div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h1 class="text-3xl font-bold text-gray-800">
            <i class="fas fa-broom text-blue-600"></i>
            Gestione Cache
        </h1>
        <p class="text-gray-600 mt-2">Pulisci le cache di Laravel per risolvere problemi o dopo deploy</p>
    </div>

    <!-- Cache Clear Options -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Config Cache -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <div class="text-center">
                <i class="fas fa-cog text-4xl text-blue-500 mb-4"></i>
                <h3 class="text-lg font-bold text-gray-800 mb-2">Config Cache</h3>
                <p class="text-sm text-gray-600 mb-4">Pulisce la cache delle configurazioni</p>
                <form method="POST" action="{{ route('aruba.admin.cache.clear') }}">
                    @csrf
                    <input type="hidden" name="type" value="config">
                    <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full">
                        <i class="fas fa-trash"></i> Pulisci Config
                    </button>
                </form>
            </div>
        </div>

        <!-- Route Cache -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <div class="text-center">
                <i class="fas fa-route text-4xl text-green-500 mb-4"></i>
                <h3 class="text-lg font-bold text-gray-800 mb-2">Route Cache</h3>
                <p class="text-sm text-gray-600 mb-4">Pulisce la cache delle rotte</p>
                <form method="POST" action="{{ route('aruba.admin.cache.clear') }}">
                    @csrf
                    <input type="hidden" name="type" value="route">
                    <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full">
                        <i class="fas fa-trash"></i> Pulisci Route
                    </button>
                </form>
            </div>
        </div>

        <!-- View Cache -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <div class="text-center">
                <i class="fas fa-eye text-4xl text-purple-500 mb-4"></i>
                <h3 class="text-lg font-bold text-gray-800 mb-2">View Cache</h3>
                <p class="text-sm text-gray-600 mb-4">Pulisce la cache delle viste Blade</p>
                <form method="POST" action="{{ route('aruba.admin.cache.clear') }}">
                    @csrf
                    <input type="hidden" name="type" value="view">
                    <button type="submit" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 w-full">
                        <i class="fas fa-trash"></i> Pulisci View
                    </button>
                </form>
            </div>
        </div>

        <!-- Application Cache -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <div class="text-center">
                <i class="fas fa-database text-4xl text-yellow-500 mb-4"></i>
                <h3 class="text-lg font-bold text-gray-800 mb-2">Application Cache</h3>
                <p class="text-sm text-gray-600 mb-4">Pulisce la cache dell'applicazione</p>
                <form method="POST" action="{{ route('aruba.admin.cache.clear') }}">
                    @csrf
                    <input type="hidden" name="type" value="cache">
                    <button type="submit" class="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 w-full">
                        <i class="fas fa-trash"></i> Pulisci Cache
                    </button>
                </form>
            </div>
        </div>

        <!-- Clear ALL -->
        <div class="bg-white rounded-lg shadow-md p-6 border-2 border-red-300">
            <div class="text-center">
                <i class="fas fa-fire text-4xl text-red-500 mb-4"></i>
                <h3 class="text-lg font-bold text-gray-800 mb-2">Pulisci Tutto</h3>
                <p class="text-sm text-gray-600 mb-4">Pulisce TUTTE le cache</p>
                <form method="POST" action="{{ route('aruba.admin.cache.clear') }}">
                    @csrf
                    <input type="hidden" name="type" value="all">
                    <button type="submit" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 w-full">
                        <i class="fas fa-trash-alt"></i> Pulisci Tutto
                    </button>
                </form>
            </div>
        </div>

        <!-- Optimize -->
        <div class="bg-white rounded-lg shadow-md p-6 border-2 border-green-300">
            <div class="text-center">
                <i class="fas fa-rocket text-4xl text-green-500 mb-4"></i>
                <h3 class="text-lg font-bold text-gray-800 mb-2">Ottimizza</h3>
                <p class="text-sm text-gray-600 mb-4">Cache config, route e view</p>
                <form method="POST" action="{{ route('aruba.admin.optimize') }}">
                    @csrf
                    <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full">
                        <i class="fas fa-bolt"></i> Ottimizza App
                    </button>
                </form>
            </div>
        </div>
    </div>

    <!-- Info Panel -->
    <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <div class="flex">
            <div class="flex-shrink-0">
                <i class="fas fa-info-circle text-blue-500 text-xl"></i>
            </div>
            <div class="ml-3">
                <h3 class="text-sm font-medium text-blue-800">Quando usare queste funzioni?</h3>
                <div class="mt-2 text-sm text-blue-700">
                    <ul class="list-disc list-inside space-y-1">
                        <li><strong>Config Cache:</strong> Dopo modifiche a file .env o config</li>
                        <li><strong>Route Cache:</strong> Dopo modifiche alle route</li>
                        <li><strong>View Cache:</strong> Dopo modifiche alle view Blade</li>
                        <li><strong>Application Cache:</strong> Per pulire dati temporanei</li>
                        <li><strong>Pulisci Tutto:</strong> In caso di problemi generali</li>
                        <li><strong>Ottimizza:</strong> Dopo deploy in produzione</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection
