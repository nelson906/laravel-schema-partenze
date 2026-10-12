<?php

namespace App\Http\Controllers;

use App\Enums\UserType;
use App\Models\User;
use App\Support\SsoToken;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * GET /sso?token=...  — ingresso automatico da golf-arbitri-clean.
 *
 * Chi clicca "Simulatore Tempi Partenza" in golf-arbitri-clean arriva qui con
 * un link firmato: viene riconosciuto per email ed entra senza password.
 * Se l'utente non esiste ancora lo crea (ruolo Utente); un account
 * disattivato resta fuori.
 */
class SsoController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        $secret = config('services.sso.secret');
        if (! is_string($secret) || $secret === '') {
            abort(404);
        }

        $ttl    = (int) config('services.sso.ttl', 60);
        $claims = SsoToken::verify($request->string('token')->toString(), $secret, $ttl, time());
        if ($claims === null) {
            abort(403, 'Link di accesso non valido o scaduto: riaprilo da golf-arbitri-clean.');
        }

        // Un link vale una volta sola.
        if (! Cache::add('sso-nonce:'.$claims['nonce'], true, now()->addSeconds(2 * $ttl + 60))) {
            abort(403, 'Link di accesso gia\' usato: riaprilo da golf-arbitri-clean.');
        }

        $user = User::query()->whereRaw('LOWER(email) = ?', [Str::lower($claims['email'])])->first();

        if ($user === null) {
            $user = User::create([
                'name'      => $claims['name'],
                'email'     => Str::lower($claims['email']),
                'password'  => Str::random(40),
                'user_type' => UserType::User,
                'is_active' => true,
            ]);
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        if (! $user->is_active) {
            abort(403, 'Account disattivato.');
        }

        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->route('quadranti.index');
    }
}
