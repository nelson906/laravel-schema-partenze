<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Middleware: consente accesso solo a chi è super_admin.
 *
 * Uso (bootstrap/app.php):
 *   ->withMiddleware(function (Middleware $middleware) {
 *       $middleware->alias([
 *           'super_admin' => \App\Http\Middleware\SuperAdmin::class,
 *           'admin'       => \App\Http\Middleware\AdminAccess::class,
 *       ]);
 *   })
 */
class SuperAdmin
{
    public function handle(Request $request, Closure $next)
    {
        if (! auth()->check() || ! auth()->user()->isSuperAdmin()) {
            abort(403, 'Accesso non autorizzato (richiesto super_admin).');
        }

        return $next($request);
    }
}
