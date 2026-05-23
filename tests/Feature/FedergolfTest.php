<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Copre App\Http\Controllers\FedergolfController.
 *
 * Le chiamate verso federgolf.it sono simulate con Http::fake(), cosi i test
 * non dipendono dalla rete. Verifica la macchina a stati degli iscritti
 * (ready / open / empty / error) e il filtro delle gare passate/annullate.
 */
class FedergolfTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush(); // la cache 60s per gara_id non deve sporcare i test
    }

    /**
     * Costruisce una riga 'processedData' come la restituisce federgolf.it.
     * Indici significativi per il controller: [1] = nome, [8] = stato.
     */
    private function entry(string $name, bool $ammesso = true): array
    {
        $row = array_fill(0, 9, '');
        $row[1] = '<span class="nome-giocatore">'.$name.'</span>';
        $row[8] = $ammesso
            ? '<i class="icona-ammesso"></i>'
            : '<i class="icona-iscritto"></i>';

        return $row;
    }

    private function fakeFedergolf(array $body, int $status = 200): void
    {
        Http::fake([
            'www.federgolf.it/*' => Http::response($body, $status),
        ]);
    }

    /* ─── getIscritti: macchina a stati ──────────────────── */

    public function test_iscritti_ready_when_there_are_admitted_players(): void
    {
        $this->fakeFedergolf([
            'data' => ['processedData' => [
                $this->entry('Mario Rossi'),
                $this->entry('Luigi Bianchi'),
            ]],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1001])
            ->assertOk()
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('iscritti.0', 'Mario Rossi')
            ->assertJsonPath('iscritti.1', 'Luigi Bianchi');
    }

    public function test_iscritti_open_when_nobody_is_admitted_yet(): void
    {
        $this->fakeFedergolf([
            'data' => ['processedData' => [
                $this->entry('Mario Rossi', ammesso: false),
            ]],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1002])
            ->assertOk()
            ->assertJsonPath('state', 'open')
            ->assertJsonPath('iscritti', []);
    }

    public function test_iscritti_empty_when_there_are_no_entries(): void
    {
        $this->fakeFedergolf([
            'data' => ['processedData' => []],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1003])
            ->assertOk()
            ->assertJsonPath('state', 'empty');
    }

    public function test_iscritti_error_when_federgolf_returns_http_error(): void
    {
        $this->fakeFedergolf([], 500);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1004])
            ->assertOk()
            ->assertJsonPath('state', 'error');
    }

    /* ─── loadAllCompetitions: filtri ────────────────────── */

    public function test_load_all_competitions_excludes_past_and_cancelled(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'TROFEO FUTURO MASCHILE', 'data' => '31/12/2026', 'competition_id' => 111, 'club' => 'Golf Club Test'],
                ['annullata' => 0, 'nome' => 'GARA PASSATA', 'data' => '01/01/2020', 'competition_id' => 222, 'club' => 'Club X'],
                ['annullata' => 1, 'nome' => 'GARA SOPPRESSA', 'data' => '31/12/2026', 'competition_id' => 333, 'club' => 'Club Y'],
            ],
        ]);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonFragment(['id' => 111])
            ->assertJsonMissing(['id' => 222])
            ->assertJsonMissing(['id' => 333]);

        $this->assertCount(1, $response->json('gare'));
    }
}
