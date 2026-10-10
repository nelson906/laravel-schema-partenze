<?php

namespace App\Support;

use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Symfony\Component\Finder\Finder;

/**
 * Codice "orfano" (strumento comune ai progetti Laravel di Alberto, 2026-10): cio' che esiste ma non e' collegato a niente.
 * - rotte con nome che nessun link, pulsante, redirect o script richiama;
 * - viste Blade che nessuno apre (view(), @include, @extends, componenti);
 * - azioni pubbliche dei controller senza rotta.
 *
 * VS Code (Intelephense) segnala solo il codice privato non usato; queste
 * tre cose sono invece dove il codice morto si accumula. Usato dal test
 * OrfaniTest: un orfano nuovo fa diventare il test rosso.
 */
final class OrphanFinder
{
    /** Pagine d'ingresso: si raggiungono scrivendo l'indirizzo o dal login. */
    private const ENTRY_ROUTES = ['login', 'password.request', 'password.reset', 'dashboard', 'home'];

    /** @var array<string, string>|null percorso => contenuto */
    private ?array $files = null;

    /** @return array<string, string> app/, resources/, routes/ e config/, file per file */
    private function files(): array
    {
        if ($this->files === null) {
            $this->files = [];
            $finder = (new Finder)->files()->in([app_path(), resource_path(), base_path('routes'), config_path()])
                ->name(['*.php', '*.js', '*.jsx', '*.ts', '*.vue']);
            foreach ($finder as $file) {
                $this->files[$file->getRealPath() ?: $file->getPathname()] = $file->getContents();
            }
        }

        return $this->files;
    }

    /**
     * Tutto il testo insieme, tranne i file indicati.
     *
     * @param  list<string>  $except
     */
    private function sources(array $except = []): string
    {
        return implode("\n", array_diff_key($this->files(), array_flip($except)));
    }

    /**
     * Le viste aperte dall'azione della rotta: un link verso se stessa (es. il
     * form di filtro della pagina) non conta come collegamento.
     *
     * @return list<string>
     */
    private function ownViews(Route $route): array
    {
        $action = $route->getActionName();
        if (! str_contains($action, '@')) {
            return [];
        }
        [$class, $method] = explode('@', ltrim($action, '\\'));
        if (! method_exists($class, $method)) {
            return [];
        }
        $ref = new \ReflectionMethod($class, $method);
        $file = $ref->getFileName();
        if ($file === false) {
            return [];
        }
        $lines = array_slice(file($file) ?: [], $ref->getStartLine() - 1, $ref->getEndLine() - $ref->getStartLine() + 1);
        preg_match_all("/view\\(\\s*['\"]([^'\"]+)['\"]/", implode('', $lines), $m);

        $paths = [];
        foreach ($m[1] as $view) {
            $path = realpath(resource_path('views/'.str_replace('.', '/', $view).'.blade.php'));
            if ($path !== false) {
                $paths[] = $path;
            }
        }

        return $paths;
    }

    /** @return list<string> */
    public function routesWithoutLinks(): array
    {
        $orphans = [];
        /** @var Route $route */
        foreach (RouteFacade::getRoutes()->getRoutes() as $route) {
            $name = $route->getName();
            if ($name === null || in_array($name, self::ENTRY_ROUTES, true)
                || preg_match('#^(_|api/|sanctum|dev/|storage|up$)#', $route->uri())
                || str_starts_with($name, 'generated::')) {
                continue;
            }
            // view('admin.x') non e' un link anche se il nome della vista
            // coincide con quello della rotta
            $src = (string) preg_replace("/view\\(\\s*['\"][^'\"]+['\"]/", 'view(', $this->sources($this->ownViews($route)));
            $quoted = preg_quote($name, '/');
            if (preg_match("/['\"]{$quoted}['\"]/", $src) === 1) {
                continue;
            }
            // Indirizzo scritto a mano in uno script, es. fetch(`/admin/x/${id}/y`)
            $parts = preg_split('/\{[^}]+\}/', $route->uri()) ?: [];
            // I parametri devono essere valori calcolati (${...} in JS, {{ ... }} in Blade)
            $param = '(?:\$\{[^}]+\}|\{\{[^}]+\}\})';
            $uriRegex = '#/'.implode($param, array_map(fn (string $p) => preg_quote($p, '#'), $parts)).'[\'"`?]#';
            if (preg_match($uriRegex, $src) !== 1) {
                $orphans[] = $name;
            }
        }
        sort($orphans);

        return array_values(array_unique($orphans));
    }

    /** @return list<string> */
    public function viewsNeverOpened(): array
    {
        $src = $this->sources();
        $orphans = [];
        $finder = (new Finder)->files()->in(resource_path('views'))->name('*.blade.php');
        foreach ($finder as $file) {
            $dotted = str_replace(['/', '.blade.php'], ['.', ''], $file->getRelativePathname());
            if (str_starts_with($dotted, 'vendor.') || str_starts_with($dotted, 'errors.')) {
                continue;
            }
            $patterns = ["'".$dotted."'", '"'.$dotted.'"'];
            if (str_starts_with($dotted, 'components.')) {
                $component = substr($dotted, strlen('components.'));
                $patterns[] = '<x-'.$component;
                if (str_ends_with($component, '.index')) {
                    $patterns[] = '<x-'.substr($component, 0, -6);
                }
            }
            if (str_starts_with($dotted, 'layouts.')) {
                $patterns[] = '<x-'.str_replace('layouts.', '', $dotted).'-layout';
            }
            $found = false;
            foreach ($patterns as $p) {
                if (str_contains($src, $p)) {
                    $found = true;
                    break;
                }
            }
            if (! $found) {
                $orphans[] = $dotted;
            }
        }
        sort($orphans);

        return $orphans;
    }

    /** @return list<string> */
    public function controllerActionsWithoutRoute(): array
    {
        $routed = [];
        foreach (RouteFacade::getRoutes()->getRoutes() as $route) {
            $action = $route->getActionName();
            if (str_contains($action, '@')) {
                $routed[ltrim($action, '\\')] = true;
            } elseif (class_exists($action) && method_exists($action, '__invoke')) {
                $routed[$action.'@__invoke'] = true;
            }
        }

        $orphans = [];
        $finder = (new Finder)->files()->in(app_path('Http/Controllers'))->name('*.php');
        foreach ($finder as $file) {
            $class = 'App\\Http\\Controllers\\'.str_replace(['/', '.php'], ['\\', ''], $file->getRelativePathname());
            if (! class_exists($class)) {
                continue;
            }
            $reflection = new \ReflectionClass($class);
            if ($reflection->isAbstract()) {
                continue;
            }
            // I metodi dei trait (es. AuthorizesRequests, ValidatesRequests nel
            // Controller base) non sono azioni
            $fromTraits = [];
            $traits = $reflection->getTraits();
            while ($traits !== []) {
                $trait = array_pop($traits);
                foreach ($trait->getMethods() as $m) {
                    $fromTraits[$m->getName()] = true;
                }
                $traits = array_merge($traits, $trait->getTraits());
            }
            foreach ($reflection->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
                if ($method->getDeclaringClass()->getName() !== $class || $method->isStatic()
                    || isset($fromTraits[$method->getName()])
                    || str_starts_with($method->getName(), '__')) {
                    continue;
                }
                if (! isset($routed[$class.'@'.$method->getName()])) {
                    $orphans[] = class_basename($class).'@'.$method->getName();
                }
            }
        }
        sort($orphans);

        return $orphans;
    }
}
