<?php

use App\Http\Controllers\Admin\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin Routes — CRUD utenti per super_admin/admin
|--------------------------------------------------------------------------
| Middleware 'admin' (definito in bootstrap/app.php) consente accesso a
| super_admin e admin. Solo super_admin può creare/modificare super_admin
| (logica nel controller, non nel routing).
*/

Route::middleware(['auth', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    // Nessuna pagina di dettaglio: UserController non ha show() (2026-10-10)
    Route::resource('users', UserController::class)->except(['show']);
    Route::patch('users/{user}/toggle-active', [UserController::class, 'toggleActive'])
        ->name('users.toggle-active');
});
