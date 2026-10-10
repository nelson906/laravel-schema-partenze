<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Giro delle pagine (strumento comune ai progetti Laravel di Alberto, 2026-10).
 *
 * Apre ogni pagina GET con nome come ospite e come un utente per ciascun
 * ruolo, sul database in uso (MAMP), e segnala le pagine che vanno in errore
 * (500). Con --letture elenca anche le pagine che leggono di piu' il database
 * e la query piu' ripetuta (una lettura per riga = N+1).
 *
 * Ogni richiesta gira dentro una transazione annullata alla fine: le pagine
 * che scrivono (log, contatori) non lasciano traccia. Email, notifiche e
 * chiamate HTTP esterne sono finte. Non gira in produzione.
 */
class PageTourCommand extends Command
{
    protected $signature = 'verifica:giro-pagine {--letture : elenca le pagine con piu\' letture del database}';

    protected $description = 'Apre tutte le pagine per ogni ruolo e segnala quelle che vanno in errore';

    /** Colonne della tabella users da cui ricavare il ruolo, nell'ordine. */
    private const ROLE_COLUMNS = ['user_type', 'role', 'type', 'is_admin'];

    /** Pagine da non aprire: effetti fuori dal database o attese esterne. */
    private const SKIP_URI = '#^(_|api/|sanctum|dev/|storage|up$)|download|export|logout#';

    public function handle(Kernel $kernel): int
    {
        if (app()->environment('production')) {
            $this->error('Non in produzione.');

            return self::FAILURE;
        }

        Mail::fake();
        Notification::fake();
        Http::fake(['*' => Http::response([], 200)]);

        $users = ['ospite' => null] + $this->usersByRole();
        $countReads = (bool) $this->option('letture');
        $queries = [];
        if ($countReads) {
            DB::listen(function (QueryExecuted $q) use (&$queries): void {
                $queries[] = [$q->sql, $q->time];
            });
        }

        $requests = 0;
        $errors = [];
        $reads = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $name = $route->getName();
            if ($name === null || ! in_array('GET', $route->methods(), true)
                || preg_match(self::SKIP_URI, $route->uri()) === 1) {
                continue;
            }

            $params = [];
            foreach ($route->parameterNames() as $param) {
                $model = is_string($param) ? $this->sample($param) : null;
                if ($model === null) {
                    continue 2;
                }
                $params[$param] = $model;
            }
            $url = route($name, $params, false);

            foreach ($users as $who => $user) {
                $user === null ? auth()->logout() : auth()->login($user);
                $request = Request::create($url, 'GET');
                $session = app('session')->driver();
                if ($session instanceof \Illuminate\Contracts\Session\Session) {
                    $request->setLaravelSession($session);
                }

                $queries = [];
                DB::beginTransaction();
                try {
                    $response = $kernel->handle($request);
                } finally {
                    DB::rollBack();
                }
                $requests++;

                if ($response->getStatusCode() >= 500) {
                    $ex = $response->exception ?? null;
                    $errors[] = "{$who}  {$url}  ".($ex instanceof \Throwable ? class_basename($ex).': '.mb_substr($ex->getMessage(), 0, 150) : '');
                }
                if ($countReads) {
                    $same = array_count_values(array_column($queries, 0));
                    arsort($same);
                    $reads[] = [
                        'who' => $who,
                        'url' => $url,
                        'n' => count($queries),
                        'ms' => (int) array_sum(array_column($queries, 1)),
                        'top' => (int) reset($same),
                        'sql' => mb_substr((string) key($same), 0, 110),
                    ];
                }
            }
            auth()->logout();
        }

        $this->info("Pagine aperte: {$requests} con ".count($users).' utenti ('.implode(', ', array_keys($users)).')');
        if ($countReads) {
            usort($reads, fn (array $a, array $b): int => $b['n'] <=> $a['n']);
            $this->table(
                ['Letture', 'ms', 'Ripetuta', 'Pagina', 'Utente', 'Query piu\' ripetuta'],
                array_map(fn (array $r): array => [$r['n'], $r['ms'], $r['top'].'x', $r['url'], $r['who'], $r['sql']], array_slice($reads, 0, 25))
            );
        }
        if ($errors === []) {
            $this->info('Nessuna pagina in errore.');

            return self::SUCCESS;
        }
        $this->error('Pagine in errore: '.count($errors));
        foreach ($errors as $e) {
            $this->line('  '.$e);
        }

        return self::FAILURE;
    }

    /**
     * Un utente per ciascun valore della colonna del ruolo (il primo attivo).
     *
     * @return array<string, User>
     */
    private function usersByRole(): array
    {
        $column = null;
        foreach (self::ROLE_COLUMNS as $candidate) {
            if (Schema::hasColumn('users', $candidate)) {
                $column = $candidate;
                break;
            }
        }
        $active = Schema::hasColumn('users', 'is_active');

        if ($column === null) {
            $first = User::query()->orderBy('id')->first();

            return $first ? ['utente' => $first] : [];
        }

        $users = [];
        foreach (User::query()->select($column)->distinct()->pluck($column) as $value) {
            $raw = $value instanceof \BackedEnum ? $value->value : $value;
            if (! is_scalar($raw)) {
                continue;
            }
            $user = User::query()->where($column, $raw)
                ->when($active, fn ($q) => $q->orderByDesc('is_active'))
                ->orderBy('id')->first();
            if ($user !== null) {
                $users[$column.'='.(is_bool($raw) ? ($raw ? '1' : '0') : (string) $raw)] = $user;
            }
        }

        return $users;
    }

    /** Il primo record del modello che ha il nome del parametro (es. {course} -> Course). */
    private function sample(string $param): ?Model
    {
        $class = 'App\\Models\\'.Str::studly(Str::singular($param));
        if (! class_exists($class) || ! is_subclass_of($class, Model::class)) {
            return null;
        }

        return $class::query()->first();
    }
}
