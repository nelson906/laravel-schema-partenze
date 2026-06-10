<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * EnsureUserIsActive — forza il logout delle sessioni di utenti disattivati.
 *
 * Il vincolo is_active=true in LoginRequest blocca i nuovi login, ma una
 * sessione già aperta sopravvivrebbe alla disattivazione: questo middleware
 * chiude il buco. Applicato globalmente al gruppo web in bootstrap/app.php.
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->is_active) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()->route('login')
                ->withErrors(['email' => 'Account disattivato. Contatta un amministratore.']);
        }

        return $next($request);
    }
}
