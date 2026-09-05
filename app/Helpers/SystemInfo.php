<?php

namespace App\Helpers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class SystemInfo
{
    /**
     * Ottieni informazioni sul sistema
     *
     * @return array<string, mixed>
     */
    public static function get(): array
    {
        return [
            'laravel_version' => app()->version(),
            'php_version' => PHP_VERSION,
            'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'N/A',
            'disk_free_space' => self::formatBytes(disk_free_space(base_path())),
            'disk_total_space' => self::formatBytes(disk_total_space(base_path())),
            'memory_limit' => ini_get('memory_limit'),
            'max_execution_time' => ini_get('max_execution_time'),
            'upload_max_filesize' => ini_get('upload_max_filesize'),
            'timezone' => config('app.timezone'),
            'environment' => app()->environment(),
            'debug_mode' => config('app.debug') ? 'ON' : 'OFF',
        ];
    }

    /**
     * Verifica permessi cartelle critiche
     *
     * @return array<string, array{path: string, exists: bool, writable: bool, permissions: string}>
     */
    public static function checkPermissions(): array
    {
        $directories = [
            'storage' => storage_path(),
            'storage/framework/cache' => storage_path('framework/cache'),
            'storage/framework/sessions' => storage_path('framework/sessions'),
            'storage/framework/views' => storage_path('framework/views'),
            'storage/logs' => storage_path('logs'),
            'bootstrap/cache' => base_path('bootstrap/cache'),
        ];

        $results = [];

        foreach ($directories as $name => $path) {
            $results[$name] = [
                'path' => $path,
                'exists' => File::exists($path),
                'writable' => File::exists($path) && is_writable($path),
                'permissions' => File::exists($path) ? substr(sprintf('%o', fileperms($path)), -4) : 'N/A',
            ];
        }

        return $results;
    }

    /**
     * Ottieni statistiche database (compatibile con vari setup)
     *
     * @return array<string, mixed>
     */
    public static function getDatabaseStats(): array
    {
        try {
            $connection = self::configString('database.default');
            $driver = config("database.connections.{$connection}.driver");

            // Adatta query in base al driver
            if ($driver === 'mysql') {
                $tables = DB::select('SHOW TABLES');
            } elseif ($driver === 'pgsql') {
                $tables = DB::select("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
            } elseif ($driver === 'sqlite') {
                $tables = DB::select("SELECT name FROM sqlite_master WHERE type='table'");
            } else {
                $tables = [];
            }

            $dbName = config("database.connections.{$connection}.database");

            return [
                'connected' => true,
                'driver' => $driver,
                'database' => $dbName,
                'tables_count' => count($tables),
            ];
        } catch (\Exception $e) {
            return [
                'connected' => false,
                'driver' => config('database.default'),
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Legge una chiave di config garantendo una stringa.
     *
     * config() e' tipizzato mixed: il cast diretto e' vietato a livello 9 e
     * un valore non scalare (array di connessione mal configurato) darebbe
     * comunque "Array to string conversion" a runtime.
     */
    private static function configString(string $key, string $default = ''): string
    {
        $value = config($key);

        return is_scalar($value) ? (string) $value : $default;
    }

    /**
     * Formatta bytes in formato leggibile.
     *
     * Accetta anche `false`: disk_free_space()/File::size() lo restituiscono
     * quando il path non e' leggibile (tipico su hosting condiviso Aruba).
     */
    private static function formatBytes(float|int|false $bytes): string
    {
        if ($bytes === false) {
            return 'N/A';
        }

        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $value = (float) $bytes;

        for ($i = 0; $value > 1024 && $i < count($units) - 1; $i++) {
            $value /= 1024;
        }

        return round($value, 2).' '.$units[$i];
    }

    /**
     * Ottieni ultimi log
     *
     * @return array<string, mixed>
     */
    public static function getLatestLogs(int $lines = 50): array
    {
        $logFile = storage_path('logs/laravel.log');

        if (! File::exists($logFile)) {
            return ['error' => 'File log non trovato'];
        }

        $content = File::get($logFile);
        $logLines = explode("\n", $content);
        $latestLines = array_slice($logLines, -$lines);

        return [
            'lines' => array_reverse($latestLines),
            'file_size' => self::formatBytes(File::size($logFile)),
            'last_modified' => date('Y-m-d H:i:s', File::lastModified($logFile)),
        ];
    }
}
