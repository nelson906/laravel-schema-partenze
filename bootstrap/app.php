<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Logout forzato per utenti disattivati con sessione ancora aperta.
        $middleware->web(append: [
            \App\Http\Middleware\EnsureUserIsActive::class,
        ]);

        $middleware->alias([
            'super_admin' => \App\Http\Middleware\SuperAdmin::class,
            'admin'       => \App\Http\Middleware\AdminAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
