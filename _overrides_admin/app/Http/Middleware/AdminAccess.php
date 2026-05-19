<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Middleware: consente accesso a super_admin e admin (non a user normali).
 *
 * Uso: ->middleware('admin')
 */
class AdminAccess
{
    public function handle(Request $request, Closure $next)
    {
        if (! auth()->check() || ! auth()->user()->isAdmin()) {
            abort(403, 'Accesso non autorizzato (richiesto admin).');
        }

        return $next($request);
    }
}
