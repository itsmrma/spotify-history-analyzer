import requests
import json
import time
from datetime import datetime, timezone

def estrai_da_listenbrainz_per_data(username, data_inizio_str):
    # 1. Convertiamo la data inserita in un timestamp UNIX[cite: 3]
    try:
        data_inizio = datetime.strptime(data_inizio_str, "%Y-%m-%d")
        target_ts = int(data_inizio.timestamp())
    except ValueError:
        print("Formato data non valido. Usa AAAA-MM-GG (es. 2026-03-01).")
        return

    print(f"\nScaricando gli ascolti di {username} dal {data_inizio_str} ad oggi...")
    
    url = f"https://api.listenbrainz.org/1/user/{username}/listens"
    headers = {"Accept": "application/json"}
    
    tutti_gli_ascolti = []
    max_ts = None
    raggiunta_data = False
    
    # 2. Ciclo per scaricare i dati a blocchi di 100 andando indietro nel tempo[cite: 3]
    while not raggiunta_data:
        params = {"count": 100} 
        if max_ts:
            params["max_ts"] = max_ts
            
        risposta = requests.get(url, headers=headers, params=params)
        
        if risposta.status_code != 200:
            print(f"Errore {risposta.status_code} da ListenBrainz.")
            break
            
        dati = risposta.json()
        listens = dati.get('payload', {}).get('listens', [])
        
        if not listens:
            break 
            
        for ascolto in listens:
            listened_at = ascolto.get('listened_at')
            
            # Se l'ascolto è più vecchio della data scelta, fermiamo tutto![cite: 3]
            if listened_at < target_ts:
                raggiunta_data = True
                break
                
            metadata = ascolto.get('track_metadata', {})
            artista = metadata.get('artist_name')
            canzone = metadata.get('track_name')
            
            if artista and canzone:
                # NOVITÀ: Convertiamo il listened_at (UNIX) nel formato ts di Spotify (ISO 8601)
                data_formattata = datetime.fromtimestamp(listened_at, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
                
                # Creiamo un dizionario identico al formato Spotify[cite: 3]
                spotify_format = {
                    "ts": data_formattata, # <- Aggiunta del timestamp!
                    "master_metadata_album_artist_name": artista,
                    "master_metadata_track_name": canzone,
                    "ms_played": 180000 
                }
                tutti_gli_ascolti.append(spotify_format)
                
        # Impostiamo il timestamp dell'ultimo ascolto per chiedere la pagina precedente[cite: 3]
        max_ts = listens[-1].get('listened_at')
        
        if not raggiunta_data:
            print(f"Scaricati {len(tutti_gli_ascolti)} ascolti finora... procedo...")
            
        # Pausa di cortesia per non farsi bloccare dall'API[cite: 3]
        time.sleep(1)

    # 3. Salviamo i dati in un file JSON compatibile[cite: 3]
    if tutti_gli_ascolti:
        nome_file = f"Streaming_History_ListenBrainz_{username}_{data_inizio_str}.json"
        with open(nome_file, 'w', encoding='utf-8') as f:
            json.dump(tutti_gli_ascolti, f, ensure_ascii=False, indent=4)
            
        print(f"\n✅ Fatto! Scaricati {len(tutti_gli_ascolti)} ascolti a partire dal {data_inizio_str}.")
        print(f"Il file è stato salvato come: {nome_file}")
        print("Spostalo nella stessa cartella della tua cronologia Spotify per unirli.")
    else:
        print("\nNessun ascolto trovato dopo la data specificata.")

if __name__ == "__main__":
    tuo_username = input("Inserisci il tuo username di ListenBrainz: ").strip()
    data_input = input("Da quale data vuoi scaricare? (Usa il formato AAAA-MM-GG, es. 2026-02-28): ").strip()
    
    estrai_da_listenbrainz_per_data(tuo_username, data_input)