import os
from collections import defaultdict
from datetime import datetime, timedelta
from history_utils import get_artist_track_and_date, load_history

def format_time(ms):
    # Converte i millisecondi in ore e minuti
    total_minutes = ms / (1000 * 60)
    hours = int(total_minutes // 60)
    minutes = int(total_minutes % 60)
    
    if hours > 0:
        return f"{hours}h e {minutes}m"
    else:
        return f"{minutes}m"

def get_all_streaks(listening_dates):
    # Funzione di supporto per calcolare tutte le streak da un set di date
    valid_dates = []
    for d in set(listening_dates):
        try:
            valid_dates.append(datetime.strptime(d, '%Y-%m-%d').date())
        except (ValueError, TypeError):
            continue
            
    valid_dates.sort()
    streaks = []
    
    if valid_dates:
        current_start = valid_dates[0]
        current_len = 1
        
        for i in range(1, len(valid_dates)):
            if valid_dates[i] == valid_dates[i-1] + timedelta(days=1):
                current_len += 1
            else:
                streaks.append((current_start, valid_dates[i-1], current_len))
                current_start = valid_dates[i]
                current_len = 1
                
        streaks.append((current_start, valid_dates[-1], current_len))
        
    return streaks

def analyze_spotify_history(folder_path):
    all_entries = load_history(folder_path)
                    
    if not all_entries:
        print("Nessun dato trovato. Assicurati che la cartella contenga i file JSON.")
        return

    artist_stats = defaultdict(lambda: {'count': 0, 'ms_played': 0})
    artist_dates = defaultdict(set) 

    # 2. Raccogliamo i dati degli artisti
    for entry in all_entries:
        artist, track, ms_played, date_str = get_artist_track_and_date(entry)
        
        if artist and track and ms_played >= 30000:
            artist_stats[artist]['count'] += 1
            artist_stats[artist]['ms_played'] += ms_played
            if date_str:
                artist_dates[artist].add(date_str)

    # Ordiniamo gli artisti in base al numero di ascolti (decrescente)
    top_artists = sorted(artist_stats.items(), key=lambda x: x[1]['count'], reverse=True)

    # 3. Mostra i Top 10 artisti
    print("\n" + "="*55)
    print("🏆 I TUOI TOP 10 ARTISTI 🏆")
    print("="*55)
    top_10_artists = top_artists[:10]
    for i, (artist, stats) in enumerate(top_10_artists, 1):
        tempo_totale = format_time(stats['ms_played'])
        print(f"{i}. {artist} - {stats['count']} ascolti (Tempo totale: {tempo_totale})")

    # 4. Calcoliamo e mostriamo la Top 5 Streak GLOBALE
    all_global_streaks = []
    for artist, dates in artist_dates.items():
        artist_streaks = get_all_streaks(dates)
        for start, end, length in artist_streaks:
            if length > 1: # Consideriamo solo vere streak (almeno 2 giorni)
                all_global_streaks.append((artist, length, start, end))
                
    # Ordiniamo per lunghezza della streak decrescente
    all_global_streaks.sort(key=lambda x: x[1], reverse=True)

    print("\n" + "="*55)
    print("🔥 TOP 5 STREAK GLOBALI (GIORNI CONSECUTIVI) 🔥")
    print("="*55)
    if all_global_streaks:
        top_5_global = all_global_streaks[:5]
        for i, (artist, length, start, end) in enumerate(top_5_global, 1):
            print(f"{i}. {artist}: {length} giorni (dal {start.strftime('%d/%m/%Y')} al {end.strftime('%d/%m/%Y')})")
    else:
        print("Nessuna streak di più giorni trovata nei tuoi dati.")

    # 5. Input dell'utente
    print("\n" + "-"*55)
    print("Scegli un artista per vedere le sue Top 25 canzoni e il suo record di giorni.")
    print("Puoi inserire il NUMERO (1-10) oppure scrivere direttamente il NOME di qualsiasi altro artista.")
    scelta = input("La tua scelta: ").strip()

    selected_artist = None

    if scelta.isdigit() and 1 <= int(scelta) <= len(top_10_artists):
        selected_artist = top_10_artists[int(scelta) - 1][0]
        display_name = selected_artist 
    else:
        selected_artist = scelta
        display_name = selected_artist

    print(f"\nAnalizzando le canzoni e i record per: {display_name}...")

    # Raccogliamo i dati delle canzoni per l'artista selezionato
    track_stats = defaultdict(lambda: {'count': 0, 'ms_played': 0})
    actual_artist_name = None
    
    for entry in all_entries:
        artist, track, ms_played, _ = get_artist_track_and_date(entry)
        
        if artist and track and ms_played >= 30000:
            if artist.lower() == selected_artist.lower():
                track_stats[track]['count'] += 1
                track_stats[track]['ms_played'] += ms_played
                actual_artist_name = artist 

    if not track_stats:
        print(f"\nNessun risultato per '{display_name}'. Verifica di aver scritto il nome correttamente!")
        return

    # Ordiniamo le canzoni dell'artista
    top_tracks = sorted(track_stats.items(), key=lambda x: x[1]['count'], reverse=True)

    # 6. Mostra le Top 25 canzoni
    print("\n" + "="*55)
    print(f"🎵 TOP 25 CANZONI DI {display_name.upper()} 🎵")
    print("="*55)
    top_25_tracks = top_tracks[:25]
    for i, (track, stats) in enumerate(top_25_tracks, 1):
        tempo_totale = format_time(stats['ms_played'])
        print(f"{i}. {track} - {stats['count']} ascolti (Tempo totale: {tempo_totale})")

    # 7. Mostra la STREAK PIÙ LUNGA per l'artista selezionato
    print("\n" + "="*55)
    print(f"👑 RECORD ASSOLUTO PER {display_name.upper()} 👑")
    print("="*55)
    
    if actual_artist_name and artist_dates[actual_artist_name]:
        specific_streaks = get_all_streaks(artist_dates[actual_artist_name])
        if specific_streaks:
            # Prende la streak con la lunghezza massima
            top_specific_streak = max(specific_streaks, key=lambda x: x[2])
            start, end, length = top_specific_streak
            
            if length > 1:
                print(f"Record: {length} giorni consecutivi!")
                print(f"🗓️  Dal {start.strftime('%d/%m/%Y')} al {end.strftime('%d/%m/%Y')}")
            else:
                print(f"Nessuna vera e propria streak. Ascoltato in giorni singoli, ad esempio il {start.strftime('%d/%m/%Y')}")
        else:
            print("Date non valide o insufficienti trovate nei dati.")
    else:
        print("Nessuna data di ascolto trovata per calcolare le streak.")

if __name__ == "__main__":
    print("🎵 BENVENUTO NELLO SPOTIFY HISTORY ANALYZER 🎵")
    cartella_json = input("Inserisci il percorso della cartella con i file JSON (lascia vuoto se sono qui): ").strip()
    
    if not cartella_json:
        cartella_json = "."
        
    if os.path.isdir(cartella_json):
        analyze_spotify_history(cartella_json)
    else:
        print("Il percorso specificato non esiste.")
