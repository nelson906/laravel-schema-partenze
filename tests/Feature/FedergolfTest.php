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
     *
     * @return list<string>
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

    /**
     * @param  array<string, mixed>  $body
     */
    private function fakeFedergolf(array $body, int $status = 200): void
    {
        // Da novembre loadAllCompetitions interroga anche l'anno successivo
        // (C5): con un fake a risposta fissa le gare risulterebbero duplicate
        // e i test fallirebbero solo a novembre/dicembre. La prima chiamata
        // riceve il body, le successive un elenco vuoto.
        Http::fake([
            'www.federgolf.it/*' => Http::sequence()
                ->push($body, $status)
                ->whenEmpty(Http::response(['data' => []], 200)),
        ]);
    }

    /**
     * Data futura in formato federgolf (d/m/Y). I test sulle gare devono
     * restare verdi col passare del tempo: le date fisse "31/12/2026"
     * diventano passate e il filtro le scarta (regressione 28/08/2026).
     */
    private function futureDate(int $days): string
    {
        return (new \DateTime("+{$days} days"))->format('d/m/Y');
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

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1003])
            ->assertOk()
            ->assertJsonPath('state', 'empty')
            ->assertJsonPath('totale', 0);

        // Il messaggio non deve affermare che la gara è "senza iscritti" e
        // basta: le iscrizioni potrebbero semplicemente non essere aperte.
        $this->assertStringContainsString('ancora aperte', $this->jsonString($response, 'message'));
    }

    public function test_iscritti_error_when_federgolf_returns_http_error(): void
    {
        $this->fakeFedergolf([], 500);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1004])
            ->assertOk()
            ->assertJsonPath('state', 'error')
            ->assertJsonPath('reason', 'http');

        // Il messaggio dice che è federgolf a non essere disponibile e cosa fare.
        $this->assertStringContainsString('non è al momento disponibile', $this->jsonString($response, 'message'));
        $this->assertStringContainsString('500', $this->jsonString($response, 'message'));
    }

    public function test_iscritti_not_found_when_federgolf_returns_404(): void
    {
        // Gara rimossa/rinviata: stato dedicato, non un generico errore.
        $this->fakeFedergolf([], 404);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1104])
            ->assertOk()
            ->assertJsonPath('state', 'not_found');

        $this->assertStringContainsString('non trovata', $this->jsonString($response, 'message'));
    }

    public function test_iscritti_rate_limit_when_federgolf_returns_429(): void
    {
        $this->fakeFedergolf([], 429);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1204])
            ->assertOk()
            ->assertJsonPath('state', 'error')
            ->assertJsonPath('reason', 'rate_limit');

        $this->assertStringContainsString('Troppe richieste', $this->jsonString($response, 'message'));
    }

    public function test_iscritti_forbidden_when_federgolf_returns_403(): void
    {
        $this->fakeFedergolf([], 403);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1304])
            ->assertOk()
            ->assertJsonPath('state', 'error')
            ->assertJsonPath('reason', 'forbidden');
    }

    public function test_iscritti_unpublished_when_payload_has_no_processed_data(): void
    {
        // JSON valido ma senza data.processedData: la lista non è ancora
        // pubblicata. Prima finiva in 'empty' → "Gara senza iscritti", falso.
        $this->fakeFedergolf(['data' => ['totalRecords' => 0]]);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1404])
            ->assertOk()
            ->assertJsonPath('state', 'unpublished')
            ->assertJsonPath('reason', 'no_data');

        $this->assertStringContainsString('non ancora pubblicata', $this->jsonString($response, 'message'));
    }

    public function test_iscritti_unpublished_when_wordpress_answers_zero(): void
    {
        // admin-ajax risponde letteralmente "0" quando l'action non è gestita
        // o la gara non è consultabile: distinto dal corpo HTML di manutenzione.
        Http::fake([
            'www.federgolf.it/*' => Http::response('0', 200),
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1504])
            ->assertOk()
            ->assertJsonPath('state', 'unpublished')
            ->assertJsonPath('reason', 'no_handler');
    }

    public function test_iscritti_open_reports_counts(): void
    {
        // Il messaggio deve dire QUANTI iscritti ci sono: è la prova che le
        // iscrizioni sono aperte e non che la gara è vuota.
        $this->fakeFedergolf([
            'data' => ['processedData' => [
                $this->entry('Mario Rossi', ammesso: false),
                $this->entry('Luigi Bianchi', ammesso: false),
                $this->entry('Anna Verdi', ammesso: false),
            ]],
        ]);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1604])
            ->assertOk()
            ->assertJsonPath('state', 'open')
            ->assertJsonPath('totale', 3)
            ->assertJsonPath('ammessi', 0);

        $this->assertStringContainsString('3 iscritti', $this->jsonString($response, 'message'));
        $this->assertStringContainsString('non ancora chiuse', $this->jsonString($response, 'message'));
    }

    public function test_iscritti_ready_exposes_counts(): void
    {
        $this->fakeFedergolf([
            'data' => ['processedData' => [
                $this->entry('Mario Rossi'),
                $this->entry('Luigi Bianchi', ammesso: false),
            ]],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1704])
            ->assertOk()
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('totale', 2)
            ->assertJsonPath('ammessi', 1);
    }

    public function test_iscritti_not_found_is_not_cached(): void
    {
        // Una gara pubblicata subito dopo il 404 deve essere ricaricabile.
        Http::fake([
            'www.federgolf.it/*' => Http::sequence()
                ->push([], 404)
                ->push(['data' => ['processedData' => [$this->entry('Mario Rossi')]]], 200),
        ]);

        $user = User::factory()->create();
        $this->actingAs($user)->post('/user/federgolf/iscritti', ['gara_id' => 1804])
            ->assertJsonPath('state', 'not_found');
        $this->actingAs($user)->post('/user/federgolf/iscritti', ['gara_id' => 1804])
            ->assertJsonPath('state', 'ready');
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

    public function test_iscritti_admitted_without_any_readable_name_is_a_parse_error(): void
    {
        // Ammessi presenti ma entry[1] senza <span class="nome-giocatore">:
        // prima era 'ready' con lista vuota, che a valle diventava un generico
        // "nessun nominativo trovato". Ora è un errore di parsing esplicito:
        // il formato di federgolf è cambiato e va detto.
        $row = array_fill(0, 9, '');
        $row[1] = 'Mario Senza Span';
        $row[8] = '<i class="icona-ammesso"></i>';

        $this->fakeFedergolf(['data' => ['processedData' => [$row]]]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1008])
            ->assertOk()
            ->assertJsonPath('state', 'error')
            ->assertJsonPath('reason', 'parse')
            ->assertJsonPath('ammessi', 1)
            ->assertJsonPath('iscritti', []);
    }

    public function test_iscritti_partial_names_still_ready(): void
    {
        // Un ammesso leggibile e uno no: non è un cambio di formato, si carica
        // quello che c'è (nessuna regressione sulle liste miste).
        $illeggibile = array_fill(0, 9, '');
        $illeggibile[1] = 'Senza Span';
        $illeggibile[8] = '<i class="icona-ammesso"></i>';

        $this->fakeFedergolf(['data' => ['processedData' => [
            $this->entry('Mario Rossi'),
            $illeggibile,
        ]]]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => 1108])
            ->assertOk()
            ->assertJsonPath('state', 'ready')
            ->assertJsonPath('ammessi', 2)
            ->assertJsonPath('iscritti.0', 'Mario Rossi');
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

    public function test_iscritti_rejects_empty_gara_id(): void
    {
        // Campo assente, stringa vuota e soli spazi: i middleware TrimStrings
        // + ConvertEmptyStringsToNull li riducono tutti a null, quindi scatta
        // 'required'. Il messaggio deve essere in italiano — senza messaggio
        // custom uscirebbe la chiave grezza "validation.required" (il progetto
        // non ha lang/it) e il frontend la mostrerebbe tale e quale.
        $user = User::factory()->create();

        foreach ([[], ['gara_id' => ''], ['gara_id' => '   ']] as $payload) {
            $response = $this->actingAs($user)
                ->postJson('/user/federgolf/iscritti', $payload)
                ->assertStatus(422)
                ->assertJsonValidationErrors('gara_id');

            $this->assertStringContainsString(
                'mancante',
                $this->jsonString($response, 'errors.gara_id.0'),
                'Payload: '.json_encode($payload)
            );
        }
    }

    public function test_iscritti_rejects_oversized_gara_id(): void
    {
        $response = $this->actingAs(User::factory()->create())
            ->postJson('/user/federgolf/iscritti', ['gara_id' => str_repeat('a', 201)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('gara_id');

        $this->assertStringContainsString('troppo lungo', $this->jsonString($response, 'errors.gara_id.0'));
    }

    public function test_iscritti_rejects_control_characters_in_gara_id(): void
    {
        // Un a-capo nell'id avvelenerebbe le righe di log.
        $this->actingAs(User::factory()->create())
            ->postJson('/user/federgolf/iscritti', ['gara_id' => "123\nINJECT"])
            ->assertStatus(422)
            ->assertJsonValidationErrors('gara_id');
    }

    public function test_iscritti_accepts_any_opaque_id_format(): void
    {
        // Il formato dell'id NON si valida: è un token opaco di federgolf.
        // Se domani FIG passa a base64, slug o id compositi, questo endpoint
        // deve continuare a funzionare senza modifiche (28/08/2026: la regola
        // 'integer' bloccò l'intera applicazione al passaggio ai GUID).
        $this->fakeFedergolf([
            'data' => ['processedData' => [$this->entry('Mario Rossi')]],
        ]);

        $strano = 'gara/2026:Q1+abc=';

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => $strano])
            ->assertOk()
            ->assertJsonPath('state', 'ready');

        // Passa a federgolf inalterato e non finisce grezzo nella chiave di
        // cache (cacheKeyFor lo passa per sha1): nessun path traversal.
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request) => $request['competition_id'] === $strano);
    }

    public function test_iscritti_accepts_guid_gara_id(): void
    {
        // REGRESSIONE 28/08/2026: federgolf usa GUID come competition_id
        // ("6b01aebc-f3f1-f011-8406-7ced8d5cadb4"). La vecchia regola
        // 'integer' li bocciava con un 422 che l'utente vedeva come
        // "Errore di rete nel caricamento degli iscritti".
        $guid = '6b01aebc-f3f1-f011-8406-7ced8d5cadb4';

        $this->fakeFedergolf([
            'data' => ['processedData' => [
                $this->entry('Mario Rossi', ammesso: false),
            ]],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/iscritti', ['gara_id' => $guid])
            ->assertOk()
            ->assertJsonPath('state', 'open');

        // L'id deve arrivare a federgolf così com'è, non convertito a intero.
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request) => $request['competition_id'] === $guid);
    }

    public function test_iscritti_rejects_array_gara_id(): void
    {
        // C1: un array non deve mai arrivare a costruire la chiave di cache.
        $this->actingAs(User::factory()->create())
            ->postJson('/user/federgolf/iscritti', ['gara_id' => [1, 2]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('gara_id');
    }

    public function test_iscritti_accepts_numeric_id_with_leading_zeros_and_spaces(): void
    {
        // Gli id numerici storici restano supportati: "0912" e " 912 " sono
        // la stessa gara e devono condividere la chiave di cache (cacheKeyFor
        // normalizza prima di hashare).
        $this->fakeFedergolf([
            'data' => ['processedData' => [$this->entry('Mario Rossi')]],
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->post('/user/federgolf/iscritti', ['gara_id' => '0912'])
            ->assertOk()
            ->assertJsonPath('state', 'ready');

        $this->actingAs($user)
            ->post('/user/federgolf/iscritti', ['gara_id' => ' 912 '])
            ->assertOk()
            ->assertJsonPath('state', 'ready');

        // Stesso id normalizzato -> stessa chiave di cache: una sola chiamata.
        Http::assertSentCount(1);
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
                ['annullata' => 0, 'nome' => 'TROFEO FUTURO MASCHILE', 'data' => $this->futureDate(30), 'competition_id' => 111, 'club' => 'Golf Club Test'],
                ['annullata' => 0, 'nome' => 'GARA PASSATA', 'data' => '01/01/2020', 'competition_id' => 222, 'club' => 'Club X'],
                ['annullata' => 1, 'nome' => 'GARA SOPPRESSA', 'data' => $this->futureDate(30), 'competition_id' => 333, 'club' => 'Club Y'],
            ],
        ]);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonFragment(['id' => 111])
            ->assertJsonMissing(['id' => 222])
            ->assertJsonMissing(['id' => 333]);

        $this->assertCount(1, $this->jsonList($response, 'gare'));
    }

    public function test_load_all_competitions_excludes_postponed_by_name(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'GARA ANNULLATA PER MALTEMPO', 'data' => $this->futureDate(30), 'competition_id' => 401],
                ['annullata' => 0, 'nome' => 'Gara rinviata a data da destinarsi', 'data' => $this->futureDate(30), 'competition_id' => 402],
                ['annullata' => 0, 'nome' => 'TROFEO RINVIATO', 'data' => $this->futureDate(30), 'competition_id' => 403],
                ['annullata' => 0, 'nome' => 'TROFEO VALIDO', 'data' => $this->futureDate(30), 'competition_id' => 404],
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

        $this->assertCount(1, $this->jsonList($response, 'gare'));
    }

    public function test_load_all_competitions_detects_tipo_from_name(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'Campionato maschile', 'data' => $this->futureDate(30), 'competition_id' => 501],
                ['annullata' => 0, 'nome' => 'Trofeo FEMMINILE', 'data' => $this->futureDate(30), 'competition_id' => 502],
                ['annullata' => 0, 'nome' => 'Open di Natale', 'data' => $this->futureDate(30), 'competition_id' => 503],
            ],
        ]);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk();

        $gare = collect($this->jsonList($response, 'gare'))->keyBy('id');

        // get() invece di [] : su una gara assente l'assert fallisce con
        // "atteso MASCHILE, ricevuto null" invece di un errore di offset.
        $this->assertSame('MASCHILE', $gare->get(501)['tipo'] ?? null);
        $this->assertSame('FEMMINILE', $gare->get(502)['tipo'] ?? null);
        $this->assertSame('MISTA', $gare->get(503)['tipo'] ?? null);
    }

    public function test_load_all_competitions_sorts_by_date_ascending(): void
    {
        $this->fakeFedergolf([
            'data' => [
                ['annullata' => 0, 'nome' => 'GARA PIU LONTANA', 'data' => $this->futureDate(90), 'competition_id' => 601],
                ['annullata' => 0, 'nome' => 'GARA PIU VICINA', 'data' => $this->futureDate(10), 'competition_id' => 602],
                ['annullata' => 0, 'nome' => 'GARA INTERMEDIA', 'data' => $this->futureDate(45), 'competition_id' => 603],
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
                ['annullata' => 0, 'nome' => 'GARA SENZA CLUB', 'data' => $this->futureDate(30), 'competition_id' => 701],
            ],
        ]);

        $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('gare.0.club', null)
            ->assertJsonPath('gare.0.title', 'GARA SENZA CLUB')
            ->assertJsonPath('gare.0.date', $this->futureDate(30));
    }

    public function test_load_all_competitions_fails_gracefully_on_http_error(): void
    {
        $this->fakeFedergolf([], 500);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', false)
            ->assertJsonPath('reason', 'http');

        // Non più "Errore connessione": il messaggio dice cosa è successo.
        $this->assertStringContainsString('non è al momento disponibile', $this->jsonString($response, 'message'));
    }

    public function test_load_all_competitions_reports_rate_limit(): void
    {
        $this->fakeFedergolf([], 429);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', false)
            ->assertJsonPath('reason', 'rate_limit');

        $this->assertStringContainsString('Troppe richieste', $this->jsonString($response, 'message'));
    }

    public function test_load_all_competitions_fails_gracefully_on_non_json_body(): void
    {
        Http::fake([
            'www.federgolf.it/*' => Http::response('<html>manutenzione</html>', 200),
        ]);

        $response = $this->actingAs(User::factory()->create())
            ->post('/user/federgolf/load-all')
            ->assertOk()
            ->assertJsonPath('success', false)
            ->assertJsonPath('reason', 'invalid_format');

        $this->assertStringContainsString('formato inatteso', $this->jsonString($response, 'message'));
    }
}
