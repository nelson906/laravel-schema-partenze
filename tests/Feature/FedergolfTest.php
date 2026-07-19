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
            ->assertJsonPath('state', 'error')
            ->assertJsonPath('message', 'Federgolf.it ha risposto con errore HTTP 500.');
    }

    public function test_iscritti_error_when_body_is_not_json(): void
    {
        // C2: 200 con corpo HTML (manutenzione/WAF) NON deve diventare 'empty'.
        Http::fake([
            'www.federgolf.it/*' => Http::response('<html>manutenzione</html>', 200),
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1005])
            ->assertOk()
            ->assertJsonPath('state', 'error');
    }

    public function test_iscritti_wildcard_counts_as_admitted(): void
    {
        $row = array_fill(0, 9, '');
        $row[1] = '<span class="nome-giocatore">Carla Wild</span>';
        $row[8] = '<i class="icona-wildcard"></i>';

        $this->fakeFedergolf(['data' => ['processedData' => [$row]]]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1006])
            ->assertOk()
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('iscritti.0', 'Carla Wild');
    }

    public function test_iscritti_name_is_decoded_and_trimmed(): void
    {
        $row = array_fill(0, 9, '');
        $row[1] = '<span class="nome-giocatore">  D&#039;Angelo Mario </span>';
        $row[8] = '<i class="icona-ammesso"></i>';

        $this->fakeFedergolf(['data' => ['processedData' => [$row]]]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1007])
            ->assertOk()
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('iscritti.0', "D'Angelo Mario");
    }

    public function test_iscritti_admitted_without_span_yields_ready_without_name(): void
    {
        // Ammesso ma entry[1] senza <span class="nome-giocatore">: contato
        // fra gli ammessi (state ready) ma nessun nome estratto.
        $row = array_fill(0, 9, '');
        $row[1] = 'Mario Senza Span';
        $row[8] = '<i class="icona-ammesso"></i>';

        $this->fakeFedergolf(['data' => ['processedData' => [$row]]]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1008])
            ->assertOk()
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('iscritti', []);
    }

    public function test_iscritti_entry_without_status_column_is_not_admitted(): void
    {
        // entry[8] mancante o non stringa: non ammesso → state open.
        $short = ['', '<span class="nome-giocatore">Mario Corto</span>'];        // niente indice 8
        $notString = array_fill(0, 9, '');
        $notString[1] = '<span class="nome-giocatore">Mario Numerico</span>';
        $notString[8] = 42;                                                       // indice 8 non stringa

        $this->fakeFedergolf(['data' => ['processedData' => [$short, $notString]]]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1009])
            ->assertOk()
            ->assertJsonPath('state', 'open')
            ->assertJsonPath('iscritti', []);
    }

    public function test_iscritti_requires_integer_gara_id(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/user/federgolf/iscritti', ['gara_id' => 'abc'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('gara_id');
    }

    /* ─── getIscritti: comportamento cache ───────────────── */

    public function test_iscritti_success_is_cached_for_same_gara(): void
    {
        $this->fakeFedergolf([
            'data' => ['processedData' => [$this->entry('Mario Rossi')]],
        ]);

        $user = User::factory()->create();
        $this->actingAs($user)->post('/user/federgolf/iscritti', ['gara_id' => 2001])->assertOk();
        $this->actingAs($user)->post('/user/federgolf/iscritti', ['gara_id' => 2001])->assertOk();

        // Seconda chiamata servita dalla cache: una sola richiesta HTTP.
        Http::assertSentCount(1);
    }

    public function test_iscritti_error_is_not_cached(): void
    {
        // Prima risposta: 500 (error, cache svuotata). Seconda: gara pronta.
        Http::fake([
            'www.federgolf.it/*' => Http::sequence()
                ->push([], 500)
                ->push(['data' => ['processedData' => [$this->entry('Mario Rossi')]]], 200),
        ]);

        $user = User::factory()->create();
        $this->actingAs($user)->post('/user/federgolf/iscritti', ['gara_id' => 2002])
            ->assertJsonPath('state', 'error');

        // L'errore NON è in cache: la chiamata successiva ritenta e vede ready.
        $this->actingAs($user)->post('/user/federgolf/iscritti', ['gara_id' => 2002])
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('iscritti.0', 'Mario Rossi');
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

    public function test_load_all_competitions_excludes_postponed_by_name(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'GARA ANNULLATA PER MALTEMPO', 'data' => '31/12/2026', 'competition_id' => 401],
                ['annullata' => 0, 'nome' => 'Gara rinviata a data da destinarsi', 'data' => '31/12/2026', 'competition_id' => 402],
                ['annullata' => 0, 'nome' => 'TROFEO RINVIATO', 'data' => '31/12/2026', 'competition_id' => 403],
                ['annullata' => 0, 'nome' => 'TROFEO VALIDO', 'data' => '31/12/2026', 'competition_id' => 404],
            ],
        ]);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonMissing(['id' => 401])   // stripos: match case-insensitive
            ->assertJsonMissing(['id' => 402])
            ->assertJsonMissing(['id' => 403])
            ->assertJsonFragment(['id' => 404]);

        $this->assertCount(1, $response->json('gare'));
    }

    public function test_load_all_competitions_detects_tipo_from_name(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'Campionato maschile', 'data' => '30/12/2026', 'competition_id' => 501],
                ['annullata' => 0, 'nome' => 'Trofeo FEMMINILE', 'data' => '30/12/2026', 'competition_id' => 502],
                ['annullata' => 0, 'nome' => 'Open di Natale', 'data' => '30/12/2026', 'competition_id' => 503],
            ],
        ]);

        $gare = collect($this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->json('gare'))->keyBy('id');

        $this->assertSame('MASCHILE', $gare[501]['tipo']);
        $this->assertSame('FEMMINILE', $gare[502]['tipo']);
        $this->assertSame('MISTA', $gare[503]['tipo']);
    }

    public function test_load_all_competitions_sorts_by_date_ascending(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'GARA DICEMBRE', 'data' => '15/12/2026', 'competition_id' => 601],
                ['annullata' => 0, 'nome' => 'GARA AGOSTO', 'data' => '10/08/2026', 'competition_id' => 602],
                ['annullata' => 0, 'nome' => 'GARA OTTOBRE', 'data' => '05/10/2026', 'competition_id' => 603],
            ],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('gare.0.id', 602)
            ->assertJsonPath('gare.1.id', 603)
            ->assertJsonPath('gare.2.id', 601);
    }

    public function test_load_all_competitions_club_defaults_to_null(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'GARA SENZA CLUB', 'data' => '30/12/2026', 'competition_id' => 701],
            ],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('gare.0.club', null)
            ->assertJsonPath('gare.0.title', 'GARA SENZA CLUB')
            ->assertJsonPath('gare.0.date', '30/12/2026');
    }

    public function test_load_all_competitions_fails_gracefully_on_http_error(): void
    {
        $this->fakeFedergolf([], 500);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', false);
    }

    public function test_load_all_competitions_fails_gracefully_on_non_json_body(): void
    {
        Http::fake([
            'www.federgolf.it/*' => Http::response('<html>manutenzione</html>', 200),
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', false);
    }
}
