<?php

use App\Http\Controllers\SuperAdmin\ArubaToolsController;
use Illuminate\Support\Facades\Route;

// ========================================
// ARUBA ADMIN TOOLS - Solo Super Admin
// ========================================
Route::prefix('aruba-admin')
    ->name('aruba.admin.')
    ->middleware(['auth', 'super_admin'])
    ->group(function () {

        Route::get('/', [ArubaToolsController::class, 'dashboard'])
            ->name('dashboard');

        Route::get('/cache', [ArubaToolsController::class, 'cacheIndex'])
            ->name('cache.index');
        Route::post('/cache/clear', [ArubaToolsController::class, 'cacheClear'])
            ->name('cache.clear');
        Route::post('/optimize', [ArubaToolsController::class, 'optimize'])
            ->name('optimize');
        Route::post('/assets/clean', [ArubaToolsController::class, 'cleanOldAssets'])
            ->name('assets.clean');

        Route::get('/phpinfo', [ArubaToolsController::class, 'phpinfo'])
            ->name('phpinfo');

        Route::get('/logs', [ArubaToolsController::class, 'logs'])
            ->name('logs');
        Route::post('/logs/clear', [ArubaToolsController::class, 'clearLogs'])
            ->name('logs.clear');

        Route::get('/permissions', [ArubaToolsController::class, 'permissions'])
            ->name('permissions');
        Route::post('/permissions/fix', [ArubaToolsController::class, 'fixPermissions'])
            ->name('permissions.fix');

        // Composer
        Route::get('/composer', [ArubaToolsController::class, 'composerIndex'])
            ->name('composer.index');
        Route::post('/composer/dump-autoload', [ArubaToolsController::class, 'composerDumpAutoload'])
            ->name('composer.dump');

        // Database Backup
        Route::get('/database', [ArubaToolsController::class, 'databaseIndex'])
            ->name('database.index');
        Route::post('/database/backup', [ArubaToolsController::class, 'databaseBackup'])
            ->name('database.backup');
        Route::post('/database/restore', [ArubaToolsController::class, 'databaseRestore'])
            ->name('database.restore');

        // Server Monitoring
        Route::get('/monitoring', [ArubaToolsController::class, 'serverMonitoring'])
            ->name('monitoring');

        // Security
        Route::get('/security', [ArubaToolsController::class, 'securityIndex'])
            ->name('security');

        // Composer Diagnostic
        Route::post('/composer/diagnostic', [ArubaToolsController::class, 'composerDiagnostic'])
            ->name('composer.diagnostic');

        // Storage Link Management
        Route::get('/storage-link', [ArubaToolsController::class, 'storageLinkIndex'])
            ->name('storage-link.index');
        Route::post('/storage-link/create', [ArubaToolsController::class, 'createStorageLink'])
            ->name('storage-link.create');
        Route::post('/storage-link/remove', [ArubaToolsController::class, 'removeStorageLink'])
            ->name('storage-link.remove');
        Route::post('/storage-link/test', [ArubaToolsController::class, 'testStorageLink'])
            ->name('storage-link.test');
    });
