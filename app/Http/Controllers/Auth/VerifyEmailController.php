<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Auth\Events\Verified;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\RedirectResponse;

class VerifyEmailController extends Controller
{
    /**
     * Mark the authenticated user's email address as verified.
     */
    public function __invoke(EmailVerificationRequest $request): RedirectResponse
    {
        // Foundation\Auth\User USA il trait MustVerifyEmail ma non ne
        // dichiara l'interfaccia: l'intersection dice a PHPStan cio' che a
        // runtime e' gia' vero, senza attivare la verifica obbligatoria che
        // `implements MustVerifyEmail` su User imporrebbe a tutte le rotte.
        /** @var \App\Models\User&\Illuminate\Contracts\Auth\MustVerifyEmail $user */
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return redirect()->intended(route('dashboard', absolute: false).'?verified=1');
        }

        if ($user->markEmailAsVerified()) {
            event(new Verified($user));
        }

        return redirect()->intended(route('dashboard', absolute: false).'?verified=1');
    }
}
