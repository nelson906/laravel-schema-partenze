<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SsoController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/dashboard', function () {
    return view('dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

// Ingresso automatico da golf-arbitri-clean (link firmato, vedi SsoController).
Route::get('/sso', SsoController::class)->middleware('throttle:30,1')->name('sso');

require __DIR__.'/quadranti.php';

require __DIR__.'/admin.php';

require __DIR__.'/maintenance.php';

require __DIR__.'/auth.php';
