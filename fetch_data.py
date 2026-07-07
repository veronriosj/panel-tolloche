"""
Script que corre GitHub Actions cada 5 minutos.
- Guarda estado actual en datos/geoagris.json
- Acumula historial en data/historial.json (últimos 7 días)
"""
import requests, json, os
from datetime import datetime, timedelta

GEO_USER = "fincatolloche"
GEO_PASS = "geoagris2019"
BASE = "https://s.agriexplorer.net/index.php/api/rest"
HIST_FILE = "data/historial.json"
GEO_FILE  = "data/geoagris.json"
MAX_DIAS  = 7  # días de historial a conservar

def main():
    now = datetime.utcnow()
    now_str = now.strftime("%Y-%m-%d %H:%M")
    print(f"[{now_str} UTC] Iniciando fetch...")

    # Login
    r = requests.post(f"{BASE}/login",
        json={"user_name": GEO_USER, "password": GEO_PASS}, timeout=30)
    r.raise_for_status()
    session = r.json()["session_id"]
    print("Login OK")

    # Get mobiles
    r2 = requests.post(f"{BASE}/get_mobiles",
        json={"session_id": session, "version_id": "3.5"}, timeout=30)
    r2.raise_for_status()
    mobiles = r2.json().get("result", [])
    print(f"Equipos: {len(mobiles)}")

    os.makedirs("data", exist_ok=True)

    # 1. Guardar estado actual
    with open(GEO_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "updated_at": now_str + " UTC",
            "mobiles": mobiles
        }, f, ensure_ascii=False)
    print("Estado actual guardado")

    # 2. Cargar historial existente
    historial = {}
    if os.path.exists(HIST_FILE):
        with open(HIST_FILE, "r", encoding="utf-8") as f:
            historial = json.load(f)

    # 3. Agregar snapshot actual al historial
    corte = (now - timedelta(days=MAX_DIAS)).strftime("%Y-%m-%d %H:%M")
    for m in mobiles:
        mid = str(m.get("mobile_id"))
        nombre = m.get("mobile_name", mid)
        activo = (m.get("mobile_pseudostatus") or "").strip().lower() == "si"
        status = m.get("mobile_status", "")
        pres_obj = next((x for x in m.get("measures", [])
            if any(k in (x.get("name","")).lower() for k in ["pres","bar","psi"])), None)
        pres_val = round(float(pres_obj["value"]), 1) if pres_obj and float(pres_obj.get("value",0)) > 1 else None
        pres_unit = (pres_obj.get("unit","") or "").strip() if pres_obj else ""

        if mid not in historial:
            historial[mid] = {"nombre": nombre, "registros": []}

        historial[mid]["nombre"] = nombre
        historial[mid]["registros"].append({
            "t": now_str,
            "activo": activo,
            "status": status,
            "psi": pres_val,
            "unit": pres_unit
        })

        # Limpiar registros más viejos que MAX_DIAS
        historial[mid]["registros"] = [
            rec for rec in historial[mid]["registros"]
            if rec["t"] >= corte
        ]

    # 4. Guardar historial actualizado
    with open(HIST_FILE, "w", encoding="utf-8") as f:
        json.dump(historial, f, ensure_ascii=False)
    print(f"Historial guardado ({len(historial)} equipos)")

if __name__ == "__main__":
    main()
