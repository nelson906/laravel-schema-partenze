<?php

use App\Http\Controllers\FedergolfController;
use App\Http\Controllers\QuadrantiController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Routes Quadranti + Federgolf
|--------------------------------------------------------------------------
|
| Routes per il simulatore tempi di partenza (quadranti) e per il caricamento
| gare da federgolf.it. Tutte protette da auth (Breeze).
|
*/

Route::middleware(['auth'])->group(function () {

    // Quadranti
    Route::prefix('quadranti')->name('quadranti.')->group(function () {
        Route::get('/',             [QuadrantiController::class, 'index'])->name('index');
        Route::post('/upload-excel', [QuadrantiController::class, 'uploadExcel'])->name('upload-excel');
        Route::post('/coordinates',  [QuadrantiController::class, 'getCoordinates'])->name('coordinates');
    });

    // Federgolf (mantengo i path originali per non toccare il JS lato client)
    Route::prefix('user/federgolf')->group(function () {
        Route::post('/load-all',  [FedergolfController::class, 'loadAllCompetitions']);
        Route::post('/iscritti',  [FedergolfController::class, 'getIscritti']);
    });
});
