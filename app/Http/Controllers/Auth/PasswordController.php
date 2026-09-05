<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class PasswordController extends Controller
{
    /**
     * Update the user's password.
     */
    public function update(Request $request): RedirectResponse
    {
        $request->validateWithBag('updatePassword', [
            'current_password' => ['required', 'current_password'],
            'password' => ['required', Password::defaults(), 'confirmed'],
        ]);

        /** @var \App\Models\User $user */
        $user = $request->user();

        // validateWithBag() torna mixed: la password si rilegge dal getter
        // tipizzato, gia' validata qui sopra.
        $user->update([
            'password' => Hash::make($request->string('password')->toString()),
        ]);

        return back()->with('status', 'password-updated');
    }
}
