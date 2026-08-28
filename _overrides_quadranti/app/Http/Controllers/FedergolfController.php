<?php

namespace App\Http\Controllers;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * FedergolfController — Integrazione con federgolf.it via WordPress admin-ajax.
 *
 * Estratto dal progetto golf-arbitri-clean e riadattato a namespace
 * App\Http\Controllers per uso standalone.
 *
 * Endpoint:
 *   POST /user/federgolf/load-all  → tutte le gare federgolf future dell'anno
 *                                     (da novembre anche quelle dell'anno dopo)
 *   POST /user/federgolf/iscritti  → iscritti ammessi per una gara
 *
 * Cache 60s per gara_id sugli iscritti (evita rate-limit di federgolf.it).
 */
class FedergolfController extends Controller
{
    /** Lunghezza massima accettata per un id gara. */
    private const GARA_ID_MAX = 200;

    /**
     * Chiave di cache per un id gara.
     *
     * L'id è un token OPACO emesso da federgolf: numerico ieri, GUID oggi
     * ("6b01aebc-f3f1-f011-8406-7ced8d5cadb4"), chissà domani. Non ne
     * validiamo la forma (ogni whitelist di formato è una bomba a
     * orologeria: la regola 'integer' ha bloccato tutte le gare nuove il
     * 28/08/2026) e non lo usiamo mai grezzo come chiave: lo normalizziamo
     * solo per evitare doppioni e poi lo passiamo per sha1, così qualunque
     * carattere futuro è innocuo per lo store di cache.
     */
    protected function cacheKeyFor(string $garaId): string
    {
        $normalized = ctype_digit($garaId)
            ? (string) (int) $garaId          // "0912" e "912" = stessa gara
            : strtolower($garaId);            // GUID case-insensitive

        return 'federgolf.iscritti.'.sha1($normalized);
    }

    /**
     * Carica iscritti di una gara specifica.
     *
     * Stati possibili (campo `state`):
     *   - 'ready'       : gara chiusa con iscritti ammessi -> usa $iscritti
     *   - 'open'        : ci sono iscritti ma nessuno ancora ammesso
     *                     (iscrizioni non ancora chiuse)
     *   - 'empty'       : lista pubblicata ma vuota (iscrizioni non ancora
     *                     aperte, oppure nessuno si e' iscritto)
     *   - 'unpublished' : federgolf risponde ma senza la struttura della lista
     *                     (lista non ancora pubblicata per quella gara)
     *   - 'not_found'   : gara inesistente/rimossa (HTTP 404)
     *   - 'error'       : rete/timeout/HTTP/formato inatteso
     *
     * Il campo `reason` e' la chiave macchina dell'errore (timeout,
     * rate_limit, forbidden, http, invalid_format, no_handler, parse),
     * `message` il testo gia' pronto per l'utente, `totale`/`ammessi` i
     * conteggi che permettono al frontend di essere specifico.
     *
     * `gara_id` e' trattato come token opaco: nessun vincolo di formato,
     * vedi cacheKeyFor().
     */
    public function getIscritti(Request $request)
    {
        // C1: senza validazione un gara_id array/assente produce 500
        // (Array to string conversion) o chiave cache condivisa.
        //
        // ATTENZIONE: `competition_id` NON è un intero. Federgolf usava id
        // numerici, oggi manda GUID ("6b01aebc-f3f1-f011-8406-7ced8d5cadb4").
        // La regola 'integer' bocciava tutte le gare nuove con un 422 che il
        // frontend mostrava come "Errore di rete nel caricamento degli
        // iscritti" (28/08/2026). Lezione: l'id è un token opaco di terzi,
        // non si valida per forma — si validano solo tipo, lunghezza e
        // caratteri di controllo. La sicurezza della chiave di cache la dà
        // l'hash in cacheKeyFor(), non una whitelist di caratteri.
        $validated = $request->validate([
            'gara_id' => ['required', function (string $attribute, mixed $value, \Closure $fail) {
                // Volutamente NESSUN vincolo di formato: si controlla solo
                // ciò che serve a non farsi male (tipo, lunghezza, caratteri
                // di controllo che avvelenerebbero i log).
                if (! is_scalar($value)) {
                    $fail('Identificativo della gara non valido: atteso un valore singolo.');

                    return;
                }

                // Difesa in profondità: via HTTP il middleware TrimStrings +
                // ConvertEmptyStringsToNull trasforma "   " in null, quindi
                // qui ci arriva solo una chiamata interna.
                $id = trim((string) $value);

                if ($id === '') {
                    $fail('Identificativo della gara mancante: riselezionare la gara dall\'elenco.');

                    return;
                }

                if (mb_strlen($id) > self::GARA_ID_MAX) {
                    $fail('Identificativo della gara troppo lungo (oltre '.self::GARA_ID_MAX.' caratteri).');

                    return;
                }

                if (preg_match('/[\x00-\x1F\x7F]/', $id)) {
                    $fail('Identificativo della gara non valido: contiene caratteri di controllo.');
                }
            }],
        ], [
            // Senza questo messaggio uscirebbe la chiave grezza
            // "validation.required": il progetto non ha lang/it.
            'gara_id.required' => 'Identificativo della gara mancante: riselezionare la gara dall\'elenco.',
        ]);

        // Verso federgolf l'id va ESATTAMENTE come ricevuto (a parte gli
        // spazi): non sappiamo se in futuro sarà case-sensitive.
        $garaId = trim((string) $validated['gara_id']);

        $cacheKey = $this->cacheKeyFor($garaId);
        $payload = Cache::remember($cacheKey, 60, fn () => $this->fetchIscritti($garaId));

        // Gli esiti transitori non vanno cacheati: l'utente riprova subito.
        if (in_array($payload['state'] ?? null, ['error', 'not_found'], true)) {
            Cache::forget($cacheKey);
        }

        return response()->json($payload);
    }

    /**
     * Costruisce il payload di risposta con tutte le chiavi sempre presenti,
     * cosi il frontend non deve mai fare guardie su campi mancanti.
     */
    protected function payload(string $state, ?string $message = null, array $extra = []): array
    {
        return array_merge([
            'state' => $state,
            'reason' => null,
            'iscritti' => [],
            'totale' => 0,
            'ammessi' => 0,
            'message' => $message,
        ], $extra);
    }

    protected function fetchIscritti(string|int|null $garaId): array
    {
        try {
            $response = Http::timeout(60)
                ->connectTimeout(10)
                ->asForm()
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept' => 'application/json',
                    'X-Requested-With' => 'XMLHttpRequest',
                ])
                ->post(config('services.federgolf.ajax_url'), [
                    'action' => 'competition-player-list',
                    'competition_id' => $garaId,
                    'page_number' => 1,
                    'page_size' => 250,
                ]);
        } catch (ConnectionException $e) {
            Log::warning('Federgolf timeout/connect getIscritti', [
                'gara_id' => $garaId,
                'error' => $e->getMessage(),
            ]);

            return $this->payload(
                'error',
                'Federgolf.it non ha risposto entro il tempo massimo. Riprovare tra qualche secondo.',
                ['reason' => 'timeout']
            );
        }

        if (! $response->successful()) {
            return $this->httpErrorPayload($response->status(), $garaId);
        }

        $data = $response->json();

        // C2: 200 con corpo non-JSON (manutenzione/WAF federgolf) -> json() = null.
        // Senza questo guard verrebbe classificato 'empty' ("Gara senza iscritti")
        // e cacheato 60s: dato falso all'utente.
        if (! is_array($data)) {
            // WordPress admin-ajax risponde letteralmente "0" quando l'action
            // non e' gestita o la gara non e' consultabile: caso distinto dal
            // corpo HTML di manutenzione.
            if ($data === 0 || $data === '0') {
                Log::warning('Federgolf admin-ajax ha risposto 0', ['gara_id' => $garaId]);

                return $this->payload(
                    'unpublished',
                    'Federgolf.it non espone la lista iscritti per questa gara: probabilmente non è ancora stata pubblicata.',
                    ['reason' => 'no_handler']
                );
            }

            Log::warning('Federgolf corpo non-JSON in getIscritti', ['gara_id' => $garaId]);

            return $this->payload(
                'error',
                'Federgolf.it ha risposto in un formato inatteso (sito in manutenzione?). Riprovare tra qualche minuto.',
                ['reason' => 'invalid_format']
            );
        }

        // Lista non ancora pubblicata: la risposta e' JSON valido ma senza la
        // struttura data.processedData. Prima finiva in 'empty' ("Gara senza
        // iscritti"), messaggio falso per una gara con iscrizioni aperte.
        if (! isset($data['data']) || ! is_array($data['data'])
            || ! isset($data['data']['processedData']) || ! is_array($data['data']['processedData'])) {
            return $this->payload(
                'unpublished',
                'Lista iscritti non ancora pubblicata su Federgolf.it per questa gara.',
                ['reason' => 'no_data']
            );
        }

        $entries = $data['data']['processedData'];

        $iscritti = [];
        $totale = count($entries);
        $ammessi = 0;

        // C4: il parsing dipende dalla shape esterna ($entry[8]/$entry[1] stringhe).
        // Se federgolf cambia formato -> TypeError: meglio 'state: error' che un 500.
        try {
            foreach ($entries as $entry) {
                $isAmmesso = isset($entry[8]) && is_string($entry[8])
                    && (strpos($entry[8], 'icona-ammesso') !== false || strpos($entry[8], 'icona-wildcard') !== false);
                if (! $isAmmesso) {
                    continue;
                }
                $ammessi++;
                if (isset($entry[1]) && is_string($entry[1])
                    && preg_match('/<span class="nome-giocatore">([^<]+)<\/span>/', $entry[1], $matches)) {
                    $iscritti[] = trim(html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Federgolf shape inattesa in getIscritti', [
                'gara_id' => $garaId,
                'error' => $e->getMessage(),
            ]);

            return $this->payload(
                'error',
                'Risposta di Federgolf.it in formato inatteso.',
                ['reason' => 'parse']
            );
        }

        if ($totale === 0) {
            return $this->payload(
                'empty',
                'Nessun iscritto presente su Federgolf.it: le iscrizioni potrebbero non essere ancora aperte.',
                ['totale' => 0, 'ammessi' => 0]
            );
        }

        if ($ammessi === 0) {
            return $this->payload(
                'open',
                "Iscrizioni non ancora chiuse: {$totale} iscritti, nessuno ancora ammesso. Riprovare dopo la chiusura delle iscrizioni.",
                ['totale' => $totale]
            );
        }

        // Ammessi presenti ma nessun nome estratto: il formato di federgolf e'
        // cambiato. Segnalarlo come errore di parsing e' piu' onesto di un
        // 'ready' con lista vuota, che a valle diventava "nessun nominativo".
        if ($iscritti === []) {
            Log::warning('Federgolf: ammessi senza nomi leggibili', [
                'gara_id' => $garaId,
                'ammessi' => $ammessi,
            ]);

            return $this->payload(
                'error',
                "Federgolf.it segnala {$ammessi} ammessi ma nessun nome è leggibile: il formato della pagina è cambiato.",
                ['reason' => 'parse', 'totale' => $totale, 'ammessi' => $ammessi]
            );
        }

        return $this->payload('ready', null, [
            'iscritti' => $iscritti,
            'totale' => $totale,
            'ammessi' => $ammessi,
        ]);
    }

    /**
     * Traduce lo status HTTP di federgolf.it in stato + messaggio utile.
     * Prima era un unico "errore HTTP nnn" che non diceva cosa fare.
     */
    protected function httpErrorPayload(int $status, string|int|null $garaId): array
    {
        Log::warning('Federgolf HTTP error getIscritti', [
            'gara_id' => $garaId,
            'status' => $status,
        ]);

        if ($status === 404) {
            return $this->payload(
                'not_found',
                'Gara non trovata su Federgolf.it: potrebbe essere stata rimossa, rinviata o sostituita.',
                ['reason' => 'http']
            );
        }

        if ($status === 429) {
            return $this->payload(
                'error',
                'Troppe richieste a Federgolf.it in poco tempo. Attendere un minuto e riprovare.',
                ['reason' => 'rate_limit']
            );
        }

        if ($status === 401 || $status === 403) {
            return $this->payload(
                'error',
                'Federgolf.it ha rifiutato la richiesta (HTTP '.$status.'): accesso bloccato o richiesta non autorizzata.',
                ['reason' => 'forbidden']
            );
        }

        if ($status >= 500) {
            return $this->payload(
                'error',
                'Federgolf.it non è al momento disponibile (HTTP '.$status.'). Riprovare più tardi.',
                ['reason' => 'http']
            );
        }

        return $this->payload(
            'error',
            'Federgolf.it ha risposto con errore HTTP '.$status.'.',
            ['reason' => 'http']
        );
    }

    public function loadAllCompetitions(Request $request)
    {
        try {
            $annoCorrente = (int) date('Y');
            $entries = $this->fetchCompetitionsYear($annoCorrente);

            if ($entries === null) {
                return response()->json([
                    'success' => false,
                    'reason' => $this->lastCompetitionsReason,
                    'message' => $this->lastCompetitionsMessage
                        ?? 'Impossibile contattare Federgolf.it.',
                ]);
            }

            // C5: la ricerca federgolf è per anno solare. Da novembre in poi si
            // preparano le gare di gennaio/febbraio: interroghiamo anche anno+1
            // e uniamo. Se la seconda chiamata fallisce, l'anno corrente basta.
            if ((int) date('n') >= 11) {
                $entriesNextYear = $this->fetchCompetitionsYear($annoCorrente + 1);
                if ($entriesNextYear !== null) {
                    $entries = array_merge($entries, $entriesNextYear);
                } else {
                    Log::warning('Federgolf: caricamento gare anno successivo fallito', [
                        'anno' => $annoCorrente + 1,
                    ]);
                }
            }

            $oggi = new \DateTime;
            $gare = [];

            foreach ($entries as $gara) {
                if ($gara['annullata'] == 1) {
                    continue;
                }
                if (
                    stripos($gara['nome'], 'ANNULLATA') !== false ||
                    stripos($gara['nome'], 'RINVIATA') !== false ||
                    stripos($gara['nome'], 'RINVIATO') !== false
                ) {
                    continue;
                }

                $dataGara = \DateTime::createFromFormat('d/m/Y', $gara['data']);
                if ($dataGara && $dataGara < $oggi) {
                    continue;
                }

                $tipo = 'MISTA';
                if (stripos($gara['nome'], 'MASCHILE') !== false) {
                    $tipo = 'MASCHILE';
                } elseif (stripos($gara['nome'], 'FEMMINILE') !== false) {
                    $tipo = 'FEMMINILE';
                }

                $gare[] = [
                    'id' => $gara['competition_id'],
                    'title' => $gara['nome'],
                    'tipo' => $tipo,
                    'date' => $gara['data'],
                    'club' => $gara['club'] ?? null,
                ];
            }

            usort($gare, function ($a, $b) {
                $dateA = \DateTime::createFromFormat('d/m/Y', $a['date']);
                $dateB = \DateTime::createFromFormat('d/m/Y', $b['date']);

                return $dateA <=> $dateB;
            });

            return response()->json(['success' => true, 'gare' => $gare]);
        } catch (\Throwable $e) {
            Log::warning('Federgolf loadAllCompetitions fallita', ['error' => $e->getMessage()]);

            // Il dettaglio dell'eccezione resta nel log, non va al client
            // (decisione audit 10/06: niente getMessage() verso il browser).
            return response()->json([
                'success' => false,
                'reason' => 'exception',
                'message' => 'Errore imprevisto nel caricamento delle gare. Il dettaglio è in storage/logs/laravel.log.',
            ]);
        }
    }

    /** Motivo macchina dell'ultimo fallimento di fetchCompetitionsYear. */
    protected ?string $lastCompetitionsReason = null;

    /** Messaggio utente dell'ultimo fallimento di fetchCompetitionsYear. */
    protected ?string $lastCompetitionsMessage = null;

    /**
     * Chiama competitions-search per un anno. Ritorna l'array 'data' della
     * risposta, oppure null su errore rete/HTTP/corpo non-JSON (C2/C5).
     * In caso di null valorizza lastCompetitionsReason/Message, cosi il
     * chiamante puo' dire all'utente COSA e' andato storto.
     */
    protected function fetchCompetitionsYear(int $anno): ?array
    {
        try {
            $response = Http::timeout(30)
                ->asForm()
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept' => 'application/json',
                    'X-Requested-With' => 'XMLHttpRequest',
                ])
                ->post(config('services.federgolf.ajax_url'), [
                    'action' => 'competitions-search',
                    'tipo' => '',
                    'keyword' => '',
                    'anno' => (string) $anno,
                    'mese' => '',
                ]);
        } catch (ConnectionException $e) {
            Log::warning('Federgolf timeout/connect loadAllCompetitions', [
                'anno' => $anno,
                'error' => $e->getMessage(),
            ]);

            return $this->failCompetitions('timeout',
                'Federgolf.it non ha risposto entro il tempo massimo. Riprovare tra qualche secondo.');
        }

        if (! $response->successful()) {
            Log::warning('Federgolf HTTP error loadAllCompetitions', [
                'anno' => $anno,
                'status' => $response->status(),
            ]);

            if ($response->status() === 429) {
                return $this->failCompetitions('rate_limit',
                    'Troppe richieste a Federgolf.it. Attendere un minuto e riprovare.');
            }

            if ($response->status() >= 500) {
                return $this->failCompetitions('http',
                    'Federgolf.it non è al momento disponibile (HTTP '.$response->status().'). Riprovare più tardi.');
            }

            return $this->failCompetitions('http',
                'Federgolf.it ha risposto con errore HTTP '.$response->status().'.');
        }

        $data = $response->json();
        if (! is_array($data) || ! isset($data['data']) || ! is_array($data['data'])) {
            Log::warning('Federgolf formato inatteso loadAllCompetitions', ['anno' => $anno]);

            return $this->failCompetitions('invalid_format',
                'Federgolf.it ha risposto in un formato inatteso (sito in manutenzione?). Riprovare tra qualche minuto.');
        }

        return $data['data'];
    }

    /** Registra il motivo del fallimento e ritorna null (helper di leggibilita'). */
    protected function failCompetitions(string $reason, string $message): ?array
    {
        $this->lastCompetitionsReason = $reason;
        $this->lastCompetitionsMessage = $message;

        return null;
    }
}
