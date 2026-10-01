"""Validation shared by the legacy command-line analyzers."""
import json
import math
from datetime import date
from pathlib import Path


def get_artist_track_and_date(entry):
    if not isinstance(entry, dict):
        return None, None, 0, None
    artist = entry.get('master_metadata_album_artist_name', entry.get('artistName'))
    track = entry.get('master_metadata_track_name', entry.get('trackName'))
    ms = entry.get('ms_played', entry.get('msPlayed', 0))
    if (not isinstance(artist, str) or not artist.strip()
            or not isinstance(track, str) or not track.strip()
            or isinstance(ms, bool) or not isinstance(ms, (int, float))
            or not math.isfinite(ms) or ms < 0):
        return None, None, 0, None
    timestamp = entry.get('ts', entry.get('endTime'))
    date_str = None
    if isinstance(timestamp, str):
        try:
            candidate = timestamp[:10]
            if len(candidate) == 10 and date.fromisoformat(candidate).isoformat() == candidate:
                date_str = candidate
        except ValueError:
            pass
    return artist.strip(), track.strip(), ms, date_str


def load_history(folder_path):
    entries = []
    for file in sorted(Path(folder_path).iterdir()):
        if not file.is_file() or file.suffix.lower() != '.json':
            continue
        try:
            with file.open(encoding='utf-8-sig') as stream:
                data = json.load(stream)
            if not isinstance(data, list):
                print(f'Ignorato {file.name}: non è una cronologia JSON.')
                continue
            entries.extend(data)
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            print(f'Errore nel leggere {file.name}: {error}')
    return entries
