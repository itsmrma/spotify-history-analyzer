"""Download public ListenBrainz history as Spotify-compatible JSON (UTC)."""
import json
import math
import re
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


def convert_listen(listen):
    if not isinstance(listen, dict):
        return None
    timestamp = listen.get('listened_at')
    metadata = listen.get('track_metadata')
    if (isinstance(timestamp, bool) or not isinstance(timestamp, int) or timestamp <= 0
            or not isinstance(metadata, dict)):
        return None
    artist = metadata.get('artist_name')
    track = metadata.get('track_name')
    if not isinstance(artist, str) or not artist.strip() or not isinstance(track, str) or not track.strip():
        return None
    additional = metadata.get('additional_info')
    additional = additional if isinstance(additional, dict) else {}
    duration = additional.get('duration_ms')
    if duration is None:
        seconds = additional.get('duration')
        if isinstance(seconds, (int, float)) and not isinstance(seconds, bool):
            duration = seconds * 1000
    estimated = (isinstance(duration, bool) or not isinstance(duration, (int, float))
                 or not math.isfinite(duration) or duration <= 0)
    try:
        date = datetime.fromtimestamp(timestamp, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    except (ValueError, OverflowError, OSError):
        return None
    return {'ts': date, 'master_metadata_album_artist_name': artist.strip(),
            'master_metadata_track_name': track.strip(),
            'ms_played': 180000 if estimated else duration,
            'duration_estimated': estimated, 'source': 'listenbrainz'}


def estrai_da_listenbrainz_per_data(username, data_inizio_str):
    username = username.strip()
    if not username:
        print('Inserisci un username valido.')
        return
    try:
        start = datetime.strptime(data_inizio_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        if start.strftime('%Y-%m-%d') != data_inizio_str or start > datetime.now(timezone.utc):
            raise ValueError
    except ValueError:
        print('Usa una data valida non futura nel formato AAAA-MM-GG.')
        return
    target_ts = int(start.timestamp())
    url = f'https://api.listenbrainz.org/1/user/{quote(username, safe="")}/listens'
    headers = {'Accept': 'application/json', 'User-Agent': 'MusicHistoryAnalyzer/1.0 (https://github.com/itsmrma/spotify-history-analyzer)'}
    entries = []
    max_ts = None
    print(f'\nScaricando gli ascolti di {username} dal {data_inizio_str} (UTC)...')
    try:
        while True:
            params = {'count': 1000}
            if max_ts is not None:
                params['max_ts'] = max_ts
            request = Request(f'{url}?{urlencode(params)}', headers=headers)
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
            payload = data.get('payload') if isinstance(data, dict) else None
            listens = payload.get('listens') if isinstance(payload, dict) else None
            if not isinstance(listens, list):
                raise ValueError('Risposta API non valida')
            if not listens:
                break
            oldest = None
            for listen in listens:
                timestamp = listen.get('listened_at') if isinstance(listen, dict) else None
                if isinstance(timestamp, bool) or not isinstance(timestamp, int) or timestamp <= 0:
                    continue
                oldest = timestamp if oldest is None else min(oldest, timestamp)
                if timestamp >= target_ts:
                    entry = convert_listen(listen)
                    if entry:
                        entries.append(entry)
            if oldest is None or (max_ts is not None and oldest >= max_ts):
                raise ValueError('La paginazione API non avanza')
            print(f'Scaricati {len(entries)} ascolti...')
            if oldest <= target_ts:
                break
            max_ts = oldest  # max_ts is exclusive in the ListenBrainz API.
            time.sleep(1)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        print(f'Errore durante il download: {error}. Nessun file parziale salvato.')
        return
    if not entries:
        print('Nessun ascolto trovato dopo la data specificata.')
        return
    safe_username = re.sub(r'[^a-zA-Z0-9_-]', '_', username)
    filename = f'Streaming_History_ListenBrainz_{safe_username}_{data_inizio_str}.json'
    try:
        with open(filename, 'w', encoding='utf-8') as stream:
            json.dump(entries, stream, ensure_ascii=False, indent=2)
    except OSError as error:
        print(f'Impossibile salvare il file: {error}')
        return
    print(f'\nFatto! {len(entries)} ascolti salvati in {filename}.')
    print('Le durate mancanti sono stimate a 3 minuti e contrassegnate nel JSON.')
    return filename


if __name__ == '__main__':
    username = input('Inserisci il tuo username di ListenBrainz: ').strip()
    start_date = input('Da quale data vuoi scaricare? (AAAA-MM-GG, UTC): ').strip()
    estrai_da_listenbrainz_per_data(username, start_date)
