<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware: consente accesso solo a chi e' super_admin.
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
    /**
     * @param  \Closure(\Illuminate\Http\Request): \Symfony\Component\HttpFoundation\Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User || ! $user->isSuperAdmin()) {
            abort(403, 'Accesso non autorizzato (richiesto super_admin).');
        }

        return $next($request);
    }
}
