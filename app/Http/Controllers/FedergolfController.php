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
    /**
     * Carica iscritti di una gara specifica.
     *
     * Stati possibili:
     *   - 'ready': gara chiusa con iscritti ammessi → usa $iscritti
     *   - 'open':  ci sono iscritti ma nessuno ancora ammesso (lista non chiusa)
     *   - 'empty': gara senza iscritti
     *   - 'error': rete/timeout/HTTP error (federgolf.it non risponde)
     */
    public function getIscritti(Request $request)
    {
        // C1: senza validazione un gara_id array/assente produce 500
        // (Array to string conversion) o chiave cache condivisa.
        $validated = $request->validate(['gara_id' => 'required|integer']);
        $garaId = $validated['gara_id'];

        $cacheKey = "federgolf.iscritti.{$garaId}";
        $payload = Cache::remember($cacheKey, 60, fn () => $this->fetchIscritti($garaId));

        if (($payload['state'] ?? null) === 'error') {
            Cache::forget($cacheKey);
        }

        return response()->json($payload);
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

            return [
                'state' => 'error',
                'iscritti' => [],
                'message' => 'Federgolf.it non risponde (timeout). Riprovare tra qualche secondo.',
            ];
        }

        if (! $response->successful()) {
            return [
                'state' => 'error',
                'iscritti' => [],
                'message' => 'Federgolf.it ha risposto con errore HTTP '.$response->status().'.',
            ];
        }

        $data = $response->json();

        // C2: 200 con corpo non-JSON (manutenzione/WAF federgolf) → json() = null.
        // Senza questo guard verrebbe classificato 'empty' ("Gara senza iscritti")
        // e cacheato 60s: dato falso all'utente.
        if (! is_array($data)) {
            return [
                'state' => 'error',
                'iscritti' => [],
                'message' => 'Federgolf.it ha risposto in un formato inatteso. Riprovare tra qualche secondo.',
            ];
        }

        $entries = $data['data']['processedData'] ?? [];

        $iscritti = [];
        $totale = count($entries);
        $ammessi = 0;

        // C4: il parsing dipende dalla shape esterna ($entry[8]/$entry[1] stringhe).
        // Se federgolf cambia formato → TypeError: meglio 'state: error' che un 500.
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

            return [
                'state' => 'error',
                'iscritti' => [],
                'message' => 'Risposta di Federgolf.it in formato inatteso.',
            ];
        }

        if ($totale === 0) {
            return [
                'state' => 'empty',
                'iscritti' => [],
                'message' => 'Gara senza iscritti.',
            ];
        }
        if ($ammessi === 0) {
            return [
                'state' => 'open',
                'iscritti' => [],
                'message' => 'Iscrizioni non ancora chiuse: nessun iscritto ammesso. Riprovare dopo la chiusura.',
            ];
        }

        return [
            'state' => 'ready',
            'iscritti' => $iscritti,
            'message' => null,
        ];
    }

    public function loadAllCompetitions(Request $request)
    {
        try {
            $annoCorrente = (int) date('Y');
            $entries = $this->fetchCompetitionsYear($annoCorrente);

            if ($entries === null) {
                return response()->json(['success' => false, 'message' => 'Errore connessione']);
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
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    /**
     * Chiama competitions-search per un anno. Ritorna l'array 'data' della
     * risposta, oppure null su errore rete/HTTP/corpo non-JSON (C2/C5).
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

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $data = $response->json();
        if (! is_array($data) || ! isset($data['data']) || ! is_array($data['data'])) {
            return null;
        }

        return $data['data'];
    }
}
