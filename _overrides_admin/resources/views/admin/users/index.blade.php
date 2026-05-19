<x-app-layout>
    <x-slot name="header">
        <div class="flex justify-between items-center">
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">Gestione Utenti</h2>
            <a href="{{ route('admin.users.create') }}"
               class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md text-sm">
                + Nuovo utente
            </a>
        </div>
    </x-slot>

    <div class="py-8">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">

            @if (session('success'))
                <div class="mb-4 bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded">
                    {{ session('success') }}
                </div>
            @endif
            @if (session('error'))
                <div class="mb-4 bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded">
                    {{ session('error') }}
                </div>
            @endif

            <div class="bg-white shadow-sm sm:rounded-lg overflow-hidden">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ruolo</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stato</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Azioni</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        @forelse ($users as $user)
                            <tr class="{{ $user->is_active ? '' : 'opacity-50' }}">
                                <td class="px-4 py-2">{{ $user->name }}</td>
                                <td class="px-4 py-2 text-sm text-gray-700">{{ $user->email }}</td>
                                <td class="px-4 py-2">
                                    @php $type = $user->user_type; @endphp
                                    <span class="px-2 py-1 text-xs rounded
                                        @if ($type?->value === 'super_admin') bg-red-100 text-red-800
                                        @elseif ($type?->value === 'admin') bg-blue-100 text-blue-800
                                        @else bg-gray-100 text-gray-700 @endif">
                                        {{ $type?->label() ?? '—' }}
                                    </span>
                                </td>
                                <td class="px-4 py-2 text-sm">
                                    {{ $user->is_active ? '✓ Attivo' : '✗ Disattivato' }}
                                </td>
                                <td class="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                                    <a href="{{ route('admin.users.edit', $user) }}"
                                       class="text-indigo-600 hover:text-indigo-900 text-sm">Modifica</a>
                                    <form action="{{ route('admin.users.toggle-active', $user) }}" method="POST" class="inline">
                                        @csrf @method('PATCH')
                                        <button class="text-yellow-600 hover:text-yellow-800 text-sm">
                                            {{ $user->is_active ? 'Disattiva' : 'Attiva' }}
                                        </button>
                                    </form>
                                    <form action="{{ route('admin.users.destroy', $user) }}" method="POST" class="inline"
                                          onsubmit="return confirm('Eliminare {{ $user->email }}?')">
                                        @csrf @method('DELETE')
                                        <button class="text-red-600 hover:text-red-800 text-sm">Elimina</button>
                                    </form>
                                </td>
                            </tr>
                        @empty
                            <tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">Nessun utente.</td></tr>
                        @endforelse
                    </tbody>
                </table>
                <div class="px-4 py-3 border-t border-gray-200">{{ $users->links() }}</div>
            </div>
        </div>
    </div>
</x-app-layout>
