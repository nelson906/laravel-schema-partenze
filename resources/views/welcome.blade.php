<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name', 'Simulatore Partenze') }} — Simulatore Tempi di Partenza</title>

    <link rel="icon" href="{{ asset('favicon.svg') }}" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=figtree:400,500,600&display=swap" rel="stylesheet" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="font-sans antialiased bg-gradient-to-br from-green-50 via-white to-indigo-50 min-h-screen">

    <div class="min-h-screen flex flex-col">

        {{-- Header --}}
        <header class="w-full">
            <div class="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
                <div class="flex items-center gap-2 text-green-700 font-semibold text-lg">
                    <i class="fas fa-golf-ball-tee"></i>
                    <span>{{ config('app.name', 'Simulatore Partenze') }}</span>
                </div>
                <nav class="flex items-center gap-3">
                    @auth
                        <a href="{{ route('dashboard') }}"
                           class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-md">
                            Dashboard
                        </a>
                    @else
                        <a href="{{ route('login') }}"
                           class="text-gray-700 hover:text-gray-900 text-sm font-medium py-2 px-4">
                            Accedi
                        </a>
                        @if (Route::has('register'))
                            <a href="{{ route('register') }}"
                               class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-md">
                                Registrati
                            </a>
                        @endif
                    @endauth
                </nav>
            </div>
        </header>

        {{-- Hero --}}
        <main class="flex-1 flex items-center">
            <div class="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-12 items-center">

                <div>
                    <h1 class="text-4xl sm:text-5xl font-semibold text-gray-900 leading-tight">
                        Simulatore Tempi<br>di Partenza
                    </h1>
                    <p class="mt-5 text-lg text-gray-600">
                        Calcolo automatico degli orari di partenza per gare di golf:
                        prima e seconda giornata, giro finale per classifica,
                        tee unico o doppie partenze. Con gestione del taglio e
                        import iscritti da Federgolf.
                    </p>

                    <div class="mt-8 flex flex-wrap gap-3">
                        @auth
                            <a href="{{ route('quadranti.index') }}"
                               class="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-md">
                                <i class="fas fa-clock"></i> Apri il simulatore
                            </a>
                        @else
                            <a href="{{ route('login') }}"
                               class="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-md">
                                <i class="fas fa-clock"></i> Inizia ora
                            </a>
                        @endauth
                    </div>
                </div>

                {{-- Feature card --}}
                <div class="bg-white rounded-xl shadow-xl p-8 space-y-5">
                    <div class="flex items-start gap-3">
                        <div class="text-green-600 text-xl"><i class="fas fa-table"></i></div>
                        <div>
                            <h3 class="font-medium text-gray-900">Routine quadranti</h3>
                            <p class="text-sm text-gray-600">Distribuzione bilanciata Early/Late con incrocio.</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="text-green-600 text-xl"><i class="fas fa-trophy"></i></div>
                        <div>
                            <h3 class="font-medium text-gray-900">Giro finale per classifica</h3>
                            <p class="text-sm text-gray-600">Tee unico o doppio, ordine di classifica, taglio FIG.</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="text-green-600 text-xl"><i class="fas fa-globe"></i></div>
                        <div>
                            <h3 class="font-medium text-gray-900">Import Federgolf</h3>
                            <p class="text-sm text-gray-600">Carica gare e iscritti direttamente da federgolf.it.</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="text-green-600 text-xl"><i class="fas fa-file-excel"></i></div>
                        <div>
                            <h3 class="font-medium text-gray-900">Excel &amp; stampa PDF</h3>
                            <p class="text-sm text-gray-600">Import nomi da .xlsx, export tabella e stampa A4.</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        {{-- Footer --}}
        <footer class="w-full border-t border-gray-200">
            <div class="max-w-6xl mx-auto px-6 py-5 text-sm text-gray-500 flex justify-between">
                <span>{{ config('app.name', 'Simulatore Partenze') }}</span>
                <span>Laravel v{{ Illuminate\Foundation\Application::VERSION }}</span>
            </div>
        </footer>
    </div>
</body>
</html>
