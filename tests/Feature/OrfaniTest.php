<?php

namespace Tests\Feature;

use App\Support\OrphanFinder;
use Tests\TestCase;

/**
 * Codice orfano (strumento comune ai progetti Laravel di Alberto, 2026-10):
 * rotte senza link, viste mai aperte, azioni dei controller senza rotta.
 *
 * Un orfano NUOVO fa fallire il test: o lo si collega, o lo si toglie, o (se
 * e' voluto) lo si aggiunge qui sotto con il motivo. Anche una voce che non
 * e' piu' orfana fa fallire il test, cosi' la lista resta pulita.
 *
 * Le voci presenti al 2026-10-10 sono da verificare una per una.
 */
class OrfaniTest extends TestCase
{
    /** Orfani noti. */
    private const KNOWN = [
        'routes' => [
            'aruba.admin.storage-link.index',
        ],
        'views' => [],
        'actions' => [],
    ];

    public function test_no_new_orphan_routes(): void
    {
        $this->assertSame(self::KNOWN['routes'], (new OrphanFinder)->routesWithoutLinks());
    }

    public function test_no_new_orphan_views(): void
    {
        $this->assertSame(self::KNOWN['views'], (new OrphanFinder)->viewsNeverOpened());
    }

    public function test_no_controller_action_without_route(): void
    {
        $this->assertSame(self::KNOWN['actions'], (new OrphanFinder)->controllerActionsWithoutRoute());
    }
}
