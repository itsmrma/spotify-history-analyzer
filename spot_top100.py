import json
import os
from collections import defaultdict

def get_artist_and_track(entry):
    # Recupera i dati sia dal formato esteso che da quello standard/ListenBrainz
    artist = entry.get('master_metadata_album_artist_name')
    track = entry.get('master_metadata_track_name')
    ms_played = entry.get('ms_played', 0)
    
    if not artist and not track:
        artist = entry.get('artistName')
        track = entry.get('trackName')
        ms_played = entry.get('msPlayed', 0)
        
    return artist, track, ms_played

def format_time(ms):
    # Converte i millisecondi in ore e minuti leggibili
    total_minutes = ms / (1000 * 60)
    hours = int(total_minutes // 60)
    minutes = int(total_minutes % 60)
    
    if hours > 0:
        return f"{hours}h e {minutes}m"
    else:
        return f"{minutes}m"

def top_100_songs(folder_path):
    all_entries = []
    
    # 1. Carica tutti i file JSON nella cartella (incluso quello di ListenBrainz se c'è)
    for filename in os.listdir(folder_path):
        if filename.endswith('.json'):
            file_path = os.path.join(folder_path, filename)
            with open(file_path, 'r', encoding='utf-8') as f:
                try:
                    all_entries.extend(json.load(f))
                except json.JSONDecodeError:
                    print(f"Errore nel leggere il file: {filename}")
                    
    if not all_entries:
        print("Nessun dato trovato. Assicurati che la cartella contenga i file JSON.")
        return

    # Usiamo una tupla (canzone, artista) come chiave per evitare di unire brani omonimi
    track_stats = defaultdict(lambda: {'count': 0, 'ms_played': 0})

    # 2. Analizza e somma gli ascolti
    for entry in all_entries:
        artist, track, ms_played = get_artist_and_track(entry)
        
        # Filtro: ascolto valido e di almeno 30 secondi
        if artist and track and ms_played >= 30000:
            chiave = (track, artist)
            track_stats[chiave]['count'] += 1
            track_stats[chiave]['ms_played'] += ms_played

    # 3. Ordina in base al numero di ascolti (dal più alto al più basso)
    top_tracks = sorted(track_stats.items(), key=lambda x: x[1]['count'], reverse=True)

    # 4. Mostra le Top 100
    print("\n" + "="*75)
    print("🏆 LE TUE TOP 100 CANZONI PIÙ ASCOLTATE 🏆")
    print("="*75)
    
    top_100 = top_tracks[:100]
    for i, ((track, artist), stats) in enumerate(top_100, 1):
        tempo_totale = format_time(stats['ms_played'])
        print(f"{i}. {track} - {artist} | {stats['count']} ascolti (Tempo: {tempo_totale})")

if __name__ == "__main__":
    print("🎵 BENVENUTO NEL TOP 100 SONGS ANALYZER 🎵")
    cartella_json = input("Inserisci il percorso della cartella con i file JSON (lascia vuoto se sono qui): ").strip()
    
    if not cartella_json:
        cartella_json = "."
        
    if os.path.exists(cartella_json):
        top_100_songs(cartella_json)
    else:
        print("Il percorso specificato non esiste.")