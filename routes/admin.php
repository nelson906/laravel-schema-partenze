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
    Route::resource('users', UserController::class);
    Route::patch('users/{user}/toggle-active', [UserController::class, 'toggleActive'])
        ->name('users.toggle-active');
});
