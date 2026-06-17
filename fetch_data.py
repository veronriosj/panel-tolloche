"""
Script que corre GitHub Actions cada 5 minutos.
Obtiene datos de GeoAgris y los guarda en data/geoagris.json
"""
import requests, json, os
from datetime import datetime

GEO_USER = "fincatolloche"
GEO_PASS = "geoagris2019"
BASE = "https://s.agriexplorer.net/index.php/api/rest"

def main():
    print(f"[{datetime.now()}] Iniciando fetch...")
    
    # Login GeoAgris
    r = requests.post(f"{BASE}/login", json={"user_name": GEO_USER, "password": GEO_PASS}, timeout=30)
    r.raise_for_status()
    session = r.json()["session_id"]
    print("Login GeoAgris OK")

    # Get mobiles
    r2 = requests.post(f"{BASE}/get_mobiles", json={"session_id": session, "version_id": "3.5"}, timeout=30)
    r2.raise_for_status()
    mobiles = r2.json().get("result", [])
    print(f"Equipos: {len(mobiles)}")

    # Guardar
    os.makedirs("data", exist_ok=True)
    payload = {
        "updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "mobiles": mobiles
    }
    with open("data/geoagris.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    print("Guardado en data/geoagris.json")

if __name__ == "__main__":
    main()
