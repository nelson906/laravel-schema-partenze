<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserType;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * CRUD utenti — visibile solo agli admin (middleware 'admin' a livello route).
 *
 * Regole di sicurezza:
 *  - Un super_admin può fare tutto.
 *  - Un admin (non super_admin) NON può creare/modificare super_admin.
 *  - Un user non super_admin non può eliminare se stesso? Sì può, ma non può
 *    cambiare il proprio user_type (per evitare auto-promozione).
 */
class UserController extends Controller
{
    public function index()
    {
        $users = User::orderBy('user_type')->orderBy('name')->paginate(20);

        return view('admin.users.index', compact('users'));
    }

    public function create()
    {
        return view('admin.users.create', [
            'userTypes' => $this->allowedUserTypes(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'      => 'required|string|max:255',
            'email'     => 'required|email|max:255|unique:users,email',
            'password'  => ['required', 'confirmed', Password::min(8)],
            'user_type' => ['required', Rule::in(array_keys($this->allowedUserTypes()))],
            'is_active' => 'sometimes|boolean',
        ]);

        $data['password']  = Hash::make($data['password']);
        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        User::create($data);

        return redirect()->route('admin.users.index')->with('success', 'Utente creato.');
    }

    public function edit(User $user)
    {
        $this->guardCanEdit($user);

        return view('admin.users.edit', [
            'user'      => $user,
            'userTypes' => $this->allowedUserTypes(),
        ]);
    }

    public function update(Request $request, User $user)
    {
        $this->guardCanEdit($user);

        $data = $request->validate([
            'name'      => 'required|string|max:255',
            'email'     => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password'  => ['nullable', 'confirmed', Password::min(8)],
            'user_type' => ['required', Rule::in(array_keys($this->allowedUserTypes()))],
            'is_active' => 'sometimes|boolean',
        ]);

        // L'utente loggato NON può cambiare il proprio user_type (anti-promozione)
        if ($user->id === auth()->id() && $data['user_type'] !== $user->user_type?->value) {
            return back()->withErrors(['user_type' => 'Non puoi cambiare il tuo stesso ruolo.']);
        }

        $update = [
            'name'      => $data['name'],
            'email'     => $data['email'],
            'user_type' => $data['user_type'],
            'is_active' => (bool) ($data['is_active'] ?? false),
        ];
        if (! empty($data['password'])) {
            $update['password'] = Hash::make($data['password']);
        }

        $user->update($update);

        return redirect()->route('admin.users.index')->with('success', 'Utente aggiornato.');
    }

    public function destroy(User $user)
    {
        $this->guardCanEdit($user);

        if ($user->id === auth()->id()) {
            return back()->with('error', 'Non puoi eliminare te stesso.');
        }

        $user->delete();

        return redirect()->route('admin.users.index')->with('success', 'Utente eliminato.');
    }

    public function toggleActive(User $user)
    {
        $this->guardCanEdit($user);

        if ($user->id === auth()->id()) {
            return back()->with('error', 'Non puoi disattivare te stesso.');
        }

        $user->update(['is_active' => ! $user->is_active]);

        return back()->with('success', $user->is_active ? 'Utente attivato.' : 'Utente disattivato.');
    }

    /* ─── helpers ─────────────────────────────────────────── */

    /**
     * Lista dei ruoli che l'utente CORRENTE può assegnare.
     * - super_admin: tutti
     * - admin:       può creare admin/user, NON super_admin
     */
    protected function allowedUserTypes(): array
    {
        if (auth()->user()?->isSuperAdmin()) {
            return UserType::options();
        }

        return [
            UserType::Admin->value => UserType::Admin->label(),
            UserType::User->value  => UserType::User->label(),
        ];
    }

    /**
     * Un admin non-super non può modificare super_admin.
     */
    protected function guardCanEdit(User $user): void
    {
        if ($user->isSuperAdmin() && ! auth()->user()->isSuperAdmin()) {
            abort(403, 'Solo un super_admin può modificare un altro super_admin.');
        }
    }
}
