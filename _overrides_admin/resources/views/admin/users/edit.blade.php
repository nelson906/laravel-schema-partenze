<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">Modifica utente: {{ $user->email }}</h2>
    </x-slot>

    <div class="py-8">
        <div class="max-w-2xl mx-auto sm:px-6 lg:px-8">
            <div class="bg-white shadow-sm sm:rounded-lg p-6">
                <form action="{{ route('admin.users.update', $user) }}" method="POST" class="space-y-4">
                    @csrf @method('PUT')

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Nome</label>
                        <input type="text" name="name" value="{{ old('name', $user->name) }}" required
                               class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md">
                        @error('name')<p class="text-red-600 text-sm mt-1">{{ $message }}</p>@enderror
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Email</label>
                        <input type="email" name="email" value="{{ old('email', $user->email) }}" required
                               class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md">
                        @error('email')<p class="text-red-600 text-sm mt-1">{{ $message }}</p>@enderror
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Nuova password <span class="text-gray-400 text-xs">(lascia vuoto per non cambiare)</span></label>
                        <input type="password" name="password" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md">
                        @error('password')<p class="text-red-600 text-sm mt-1">{{ $message }}</p>@enderror
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Conferma nuova password</label>
                        <input type="password" name="password_confirmation" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Ruolo</label>
                        <select name="user_type" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
                                @if ($user->id === auth()->id()) disabled @endif>
                            @foreach ($userTypes as $value => $label)
                                <option value="{{ $value }}" {{ old('user_type', $user->user_type?->value) === $value ? 'selected' : '' }}>{{ $label }}</option>
                            @endforeach
                        </select>
                        @if ($user->id === auth()->id())
                            <p class="text-xs text-gray-500 mt-1 italic">Non puoi cambiare il tuo stesso ruolo.</p>
                            {{-- Quando il select è disabled non viene postato; rinviamo il valore originale. --}}
                            <input type="hidden" name="user_type" value="{{ $user->user_type?->value }}">
                        @endif
                        @error('user_type')<p class="text-red-600 text-sm mt-1">{{ $message }}</p>@enderror
                    </div>

                    <div class="flex items-center">
                        <input type="hidden" name="is_active" value="0">
                        <input type="checkbox" id="is_active" name="is_active" value="1" {{ $user->is_active ? 'checked' : '' }} class="mr-2">
                        <label for="is_active" class="text-sm text-gray-700">Attivo</label>
                    </div>

                    <div class="flex justify-end space-x-2 pt-4">
                        <a href="{{ route('admin.users.index') }}" class="px-4 py-2 border border-gray-300 rounded-md text-sm">Annulla</a>
                        <button class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm">Salva</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
