<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware: consente accesso a super_admin e admin (non a user normali).
 *
 * Uso: ->middleware('admin')
 */
class AdminAccess
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): \Symfony\Component\HttpFoundation\Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User || ! $user->isAdmin()) {
            abort(403, 'Accesso non autorizzato (richiesto admin).');
        }

        return $next($request);
    }
}
