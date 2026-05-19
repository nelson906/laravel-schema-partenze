<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Helpers\SystemInfo;
use App\Helpers\SystemOperations;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

class ArubaToolsController extends Controller
{
    /**
     * Dashboard principale
     */
    public function dashboard()
    {
        $data = [
            'system_info' => SystemInfo::get(),
            'database_stats' => SystemInfo::getDatabaseStats(),
            'permissions' => SystemInfo::checkPermissions(),
            'linkStatus' => $this->checkStorageLinkStatus(),
        ];

        return view('aruba-admin.dashboard', $data);
    }

    /**
     * Gestione cache
     */
    public function cacheIndex()
    {
        return view('aruba-admin.cache');
    }

    /**
     * Pulisci cache specifiche
     */
    public function cacheClear(Request $request)
    {
        $type = $request->input('type', 'all');
        $output = [];

        try {
            switch ($type) {
                case 'config':
                    Artisan::call('config:clear');
                    $output[] = '✅ Config cache pulita';
                    break;

                case 'route':
                    Artisan::call('route:clear');
                    $output[] = '✅ Route cache pulita';
                    break;

                case 'view':
                    Artisan::call('view:clear');
                    $output[] = '✅ View cache pulita';
                    break;

                case 'cache':
                    Artisan::call('cache:clear');
                    $output[] = '✅ Application cache pulita';
                    break;

                case 'all':
                    Artisan::call('config:clear');
                    Artisan::call('route:clear');
                    Artisan::call('view:clear');
                    Artisan::call('cache:clear');
                    Artisan::call('clear-compiled');
                    Artisan::call('optimize:clear');
                    $output[] = '✅ Tutte le cache pulite';
                    break;

                default:
                    $output[] = '❌ Tipo cache non valido';
            }

            return back()->with('success', implode('<br>', $output));
        } catch (\Exception $e) {
            return back()->with('error', 'Errore: '.$e->getMessage());
        }
    }

    /**
     * Ottimizza applicazione
     */
    public function optimize()
    {
        try {
            Artisan::call('config:cache');
            Artisan::call('route:cache');
            Artisan::call('view:cache');

            return back()->with('success', '✅ Applicazione ottimizzata');
        } catch (\Exception $e) {
            return back()->with('error', 'Errore: '.$e->getMessage());
        }
    }

    /**
     * Pulisci assets vecchi (non in manifest.json)
     */
    public function cleanOldAssets()
    {
        try {
            $buildManifest = public_path('build/manifest.json');
            $assetsDir = public_path('build/assets');

            if (! File::exists($buildManifest) || ! File::isDirectory($assetsDir)) {
                return back()->with('warning', '⚠️ Build manifest o directory assets non trovati');
            }

            $manifestContent = File::get($buildManifest);
            $manifest = json_decode($manifestContent, true);

            if (! $manifest) {
                return back()->with('error', '❌ Errore lettura manifest.json');
            }

            // Estrai file referenziati nel manifest
            $referencedFiles = [];
            foreach ($manifest as $entry) {
                if (isset($entry['file'])) {
                    $referencedFiles[] = basename($entry['file']);
                }
                if (isset($entry['css'])) {
                    foreach ($entry['css'] as $css) {
                        $referencedFiles[] = basename($css);
                    }
                }
            }

            // Scansiona e rimuovi file vecchi
            $assetsFiles = File::files($assetsDir);
            $deletedCount = 0;
            $deletedFiles = [];

            foreach ($assetsFiles as $file) {
                $filename = $file->getFilename();

                if (! in_array($filename, $referencedFiles)) {
                    if (File::delete($file->getPathname())) {
                        $deletedCount++;
                        $deletedFiles[] = $filename;
                    }
                }
            }

            if ($deletedCount === 0) {
                return back()->with('success', '✅ Nessun asset vecchio da rimuovere');
            }

            $message = "✅ Rimossi {$deletedCount} file assets vecchi";

            return back()->with('success', $message);
        } catch (\Exception $e) {
            return back()->with('error', '❌ Errore: '.$e->getMessage());
        }
    }

    /**
     * PHPInfo
     */
    public function phpinfo()
    {
        return view('aruba-admin.phpinfo');
    }

    /**
     * Visualizza logs
     */
    public function logs()
    {
        $logs = SystemInfo::getLatestLogs(100);

        return view('aruba-admin.logs', compact('logs'));
    }

    /**
     * Pulisci log
     */
    public function clearLogs()
    {
        try {
            $logFile = storage_path('logs/laravel.log');

            if (File::exists($logFile)) {
                File::put($logFile, '');

                return back()->with('success', '✅ Log puliti');
            }

            return back()->with('error', 'File log non trovato');
        } catch (\Exception $e) {
            return back()->with('error', 'Errore: '.$e->getMessage());
        }
    }

    /**
     * Verifica permessi
     */
    public function permissions()
    {
        $permissions = SystemInfo::checkPermissions();
        $linkStatus = $this->checkStorageLinkStatus();
        $artisanAvailable = $this->isArtisanAvailable();

        return view('aruba-admin.permissions', compact('permissions', 'linkStatus', 'artisanAvailable'));
    }

    /**
     * Correggi permessi (tentativo)
     */
    public function fixPermissions()
    {
        $directories = [
            storage_path(),
            storage_path('framework/cache'),
            storage_path('framework/sessions'),
            storage_path('framework/views'),
            storage_path('logs'),
            base_path('bootstrap/cache'),
        ];

        $results = [];

        foreach ($directories as $dir) {
            try {
                if (File::exists($dir)) {
                    chmod($dir, 0775);
                    $results[] = "✅ Permessi aggiornati: {$dir}";
                } else {
                    File::makeDirectory($dir, 0775, true);
                    $results[] = "✅ Cartella creata: {$dir}";
                }
            } catch (\Exception $e) {
                $results[] = "❌ Errore su {$dir}: ".$e->getMessage();
            }
        }

        return back()->with('info', implode('<br>', $results));
    }

    // ================================
    // COMPOSER OPERATIONS
    // ================================

    public function composerIndex()
    {
        $composerVersion = SystemOperations::getComposerVersion();
        $outdated = SystemOperations::composerOutdated();

        return view('aruba-admin.composer', compact('composerVersion', 'outdated'));
    }

    public function composerDumpAutoload()
    {
        $result = SystemOperations::composerDumpAutoload();

        $message = $result['success']
            ? '✅ Autoload rigenerato'
            : '❌ Errore: '.$result['output'];

        return back()->with($result['success'] ? 'success' : 'error', $message);
    }

    /**
     * Diagnostica Composer
     */
    public function composerDiagnostic()
    {
        $possiblePaths = [
            'composer',
            '/usr/local/bin/composer',
            '/usr/bin/composer',
            base_path('composer.phar'),
            '/opt/alt/php81/usr/bin/composer',
            '/opt/alt/php82/usr/bin/composer',
            '/opt/alt/php83/usr/bin/composer',
            getenv('HOME').'/composer',
            getenv('HOME').'/bin/composer',
        ];

        $output = "🔍 RICERCA COMPOSER SUL SERVER\n";
        $output .= str_repeat('=', 50)."\n\n";

        $found = false;
        $foundPath = null;

        foreach ($possiblePaths as $path) {
            $output .= "Tentativo: {$path}\n";

            try {
                exec("{$path} --version 2>&1", $result, $returnCode);

                if ($returnCode === 0 && ! empty($result)) {
                    $output .= "  ✅ TROVATO!\n";
                    $output .= '  Versione: '.implode("\n", $result)."\n";
                    $found = true;
                    $foundPath = $path;
                    break;
                } else {
                    $output .= "  ❌ Non trovato (exit code: {$returnCode})\n";
                }
            } catch (\Exception $e) {
                $output .= '  ❌ Errore: '.$e->getMessage()."\n";
            }

            $output .= "\n";
        }

        $output .= str_repeat('=', 50)."\n";

        if ($found) {
            $output .= "\n✅ COMPOSER TROVATO IN: {$foundPath}\n";
            $output .= "\nPer usarlo, aggiorna il percorso nel codice.\n";
        } else {
            $output .= "\n❌ COMPOSER NON TROVATO\n";
            $output .= "\nPossibili soluzioni:\n";
            $output .= "1. Installa Composer locale: wget https://getcomposer.org/composer.phar\n";
            $output .= "2. Contatta supporto Aruba per verificare disponibilità\n";
            $output .= "3. Usa Composer in locale e carica vendor/ via FTP\n";
        }

        return response()->json([
            'found' => $found,
            'path' => $foundPath,
            'output' => $output,
        ]);
    }

    // ================================
    // DATABASE BACKUP
    // ================================

    public function databaseIndex()
    {
        $backups = SystemOperations::listDatabaseBackups();

        return view('aruba-admin.database', compact('backups'));
    }

    public function databaseBackup()
    {
        $result = SystemOperations::backupDatabase();

        if ($result['success']) {
            return back()->with('success', "✅ Backup creato: {$result['filename']} (".number_format($result['size'] / 1024 / 1024, 2).' MB)');
        }

        return back()->with('error', '❌ '.$result['output']);
    }

    public function databaseRestore(Request $request)
    {
        $filename = $request->input('filename');
        $result = SystemOperations::restoreDatabase($filename);

        return back()->with(
            $result['success'] ? 'success' : 'error',
            $result['success'] ? "✅ Database ripristinato da: {$filename}" : '❌ '.$result['output']
        );
    }

    // ================================
    // SERVER MONITORING
    // ================================

    public function serverMonitoring()
    {
        $serverLoad = SystemOperations::getServerLoad();
        $phpProcesses = SystemOperations::listPhpProcesses();
        $storageSize = SystemOperations::getDirectorySize(storage_path());

        return view('aruba-admin.monitoring', compact('serverLoad', 'phpProcesses', 'storageSize'));
    }

    // ================================
    // SECURITY
    // ================================

    public function securityIndex()
    {
        $sensitiveFiles = SystemOperations::checkSensitiveFiles();
        $suspiciousFiles = SystemOperations::scanForSuspiciousFiles();

        return view('aruba-admin.security', compact('sensitiveFiles', 'suspiciousFiles'));
    }

    // ================================
    // STORAGE LINK MANAGEMENT
    // ================================

    /**
     * Visualizza pagina gestione storage link (redirect a permissions)
     */
    public function storageLinkIndex()
    {
        return redirect()->route('aruba.admin.permissions');
    }

    /**
     * Test se Artisan è disponibile
     */
    private function isArtisanAvailable()
    {
        try {
            // Tenta di eseguire un comando innocuo
            Artisan::call('list');

            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Verifica stato storage link
     */
    private function checkStorageLinkStatus()
    {
        $publicStoragePath = public_path('storage');
        $targetPath = storage_path('app/public');

        $status = [
            'exists' => false,
            'is_link' => false,
            'is_valid' => false,
            'target' => null,
            'target_exists' => File::exists($targetPath),
            'public_path' => $publicStoragePath,
            'expected_target' => $targetPath,
            'writable' => false,
            'files_count' => 0,
        ];

        if (File::exists($publicStoragePath)) {
            $status['exists'] = true;
            $status['is_link'] = is_link($publicStoragePath);

            if ($status['is_link']) {
                $status['target'] = readlink($publicStoragePath);
                $status['is_valid'] = ($status['target'] === $targetPath);
            } else {
                // È una cartella normale, non un symlink
                $status['is_directory'] = is_dir($publicStoragePath);
            }

            if (is_writable($publicStoragePath)) {
                $status['writable'] = true;

                try {
                    $files = File::allFiles($publicStoragePath);
                    $status['files_count'] = count($files);
                } catch (\Exception $e) {
                    $status['files_count'] = 0;
                }
            }
        }

        return $status;
    }

    /**
     * Crea storage link
     */
    public function createStorageLink()
    {
        try {
            $publicStoragePath = public_path('storage');

            // Se esiste già come directory normale, fai backup
            if (File::exists($publicStoragePath) && ! is_link($publicStoragePath)) {
                $backupPath = public_path('storage_backup_'.date('Y-m-d_His'));
                File::move($publicStoragePath, $backupPath);

                $message = "⚠️ Cartella esistente spostata in: {$backupPath}<br>";
            } else {
                $message = '';
            }

            // Rimuovi symlink esistente se presente
            if (is_link($publicStoragePath)) {
                File::delete($publicStoragePath);
            }

            // Crea il link usando Artisan
            Artisan::call('storage:link');
            $output = Artisan::output();

            return back()->with('success', $message.'✅ Storage link creato:<br><pre>'.htmlspecialchars($output).'</pre>');
        } catch (\Exception $e) {
            return back()->with('error', '❌ Errore durante creazione storage link: '.$e->getMessage());
        }
    }

    /**
     * Rimuovi storage link
     */
    public function removeStorageLink()
    {
        try {
            $publicStoragePath = public_path('storage');

            if (! File::exists($publicStoragePath)) {
                return back()->with('warning', '⚠️ Storage link non esiste');
            }

            if (is_link($publicStoragePath)) {
                File::delete($publicStoragePath);

                return back()->with('success', '✅ Storage link rimosso');
            } else {
                return back()->with('warning', '⚠️ public/storage esiste ma non è un symlink. Rimuovilo manualmente se necessario.');
            }
        } catch (\Exception $e) {
            return back()->with('error', '❌ Errore: '.$e->getMessage());
        }
    }

    /**
     * Test storage link
     */
    public function testStorageLink()
    {
        $results = [];

        // 1. Verifica directory storage/app/public esiste
        $storagePath = storage_path('app/public');
        $results[] = [
            'test' => 'Directory storage/app/public esiste',
            'status' => File::exists($storagePath),
            'details' => $storagePath,
        ];

        // 2. Verifica directory storage/app/public è scrivibile
        $results[] = [
            'test' => 'Directory storage/app/public è scrivibile',
            'status' => File::exists($storagePath) && is_writable($storagePath),
            'details' => File::exists($storagePath) ? (is_writable($storagePath) ? 'Writable' : 'Not writable') : 'Not found',
        ];

        // 3. Verifica symlink esiste
        $publicStoragePath = public_path('storage');
        $results[] = [
            'test' => 'Symlink public/storage esiste',
            'status' => File::exists($publicStoragePath),
            'details' => $publicStoragePath,
        ];

        // 4. Verifica symlink è valido
        $isValidLink = is_link($publicStoragePath) && readlink($publicStoragePath) === $storagePath;
        $results[] = [
            'test' => 'Symlink punta a storage/app/public',
            'status' => $isValidLink,
            'details' => is_link($publicStoragePath) ? readlink($publicStoragePath) : 'Not a symlink',
        ];

        // 5. Test scrittura file
        $testFileName = 'test_'.time().'.txt';
        $testContent = 'Test storage link - '.now();
        try {
            File::put($storagePath.'/'.$testFileName, $testContent);

            $fileExistsViaLink = File::exists($publicStoragePath.'/'.$testFileName);
            $results[] = [
                'test' => 'File scritto in storage/app/public è accessibile via public/storage',
                'status' => $fileExistsViaLink,
                'details' => $fileExistsViaLink ? 'File accessibile' : 'File non accessibile',
            ];

            // Pulisci file test
            File::delete($storagePath.'/'.$testFileName);
        } catch (\Exception $e) {
            $results[] = [
                'test' => 'Test scrittura file',
                'status' => false,
                'details' => 'Errore: '.$e->getMessage(),
            ];
        }

        // 6. URL accessibile
        $testUrl = asset('storage/'.$testFileName);
        $results[] = [
            'test' => 'URL asset() funziona',
            'status' => true,
            'details' => $testUrl,
        ];

        return response()->json([
            'success' => true,
            'results' => $results,
            'summary' => [
                'total' => count($results),
                'passed' => collect($results)->where('status', true)->count(),
                'failed' => collect($results)->where('status', false)->count(),
            ],
        ]);
    }
}
