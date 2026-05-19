<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Dashboard') }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="bg-white overflow-hidden shadow-sm sm:rounded-lg">
                <div class="p-6 text-gray-900 space-y-4">
                    <p class="text-lg">Benvenuto. Apri il simulatore Quadranti:</p>
                    <a href="{{ route('quadranti.index') }}"
                       class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-md">
                        <i class="fas fa-clock mr-2"></i> Apri Simulatore Tempi di Partenza
                    </a>
                </div>
            </div>
        </div>
    </div>
</x-app-layout>
