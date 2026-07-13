"""
Script GitHub Actions - Finca Tolloche
- GeoAgris: estado actual + historial 7 dias
- SharePoint: registros MS Forms -> data/msforms.json
"""
import requests, json, os
from datetime import datetime, timedelta

# GeoAgris
GEO_USER = "fincatolloche"
GEO_PASS = "geoagris2019"
GEO_BASE = "https://s.agriexplorer.net/index.php/api/rest"

# Microsoft Graph
MS_TENANT = "4a67ffcd-8647-4abd-91eb-105e4ff520c9"
MS_CLIENT_ID = "4e025307-d4a3-4d48-8eb3-ca1a0861ee17"
MS_CLIENT_SECRET = "fec8Q~MRhzlgz7mpmvw3pHEMvl2j2Ipsq3TzlbsD"
MS_SITE = "liagargentina.sharepoint.com:/sites/ServiciosFT:"
MS_LIST_ID = "1b181ab0-82f7-4026-852d-e9da0eca3a0b"

# Archivos de salida
GEO_FILE  = "data/geoagris.json"
HIST_FILE = "data/historial.json"
MS_FILE   = "data/msforms.json"
MAX_DIAS  = 7

os.makedirs("data", exist_ok=True)
now = datetime.utcnow()
now_str = now.strftime("%Y-%m-%d %H:%M")
print(f"[{now_str} UTC] Iniciando fetch...")

# ══════════════════════════════════════════
# 1. GEOAGRIS
# ══════════════════════════════════════════
print("--- GeoAgris ---")
mobiles = []
try:
    r = requests.post(f"{GEO_BASE}/login",
        json={"user_name": GEO_USER, "password": GEO_PASS}, timeout=30)
    r.raise_for_status()
    session = r.json()["session_id"]
    print(f"Login OK, session: {session[:8]}...")

    r2 = requests.post(f"{GEO_BASE}/get_mobiles",
        json={"session_id": session, "version_id": "3.5"}, timeout=30)
    print(f"get_mobiles status: {r2.status_code}, len: {len(r2.text)}")

    if r2.status_code == 200 and r2.text.strip():
        try:
            mobiles = r2.json().get("result", [])
            print(f"Equipos: {len(mobiles)}")
        except Exception as e:
            print(f"Error parseando JSON de get_mobiles: {e}")
            print(f"Respuesta: {r2.text[:300]}")
    else:
        print(f"Respuesta vacía o error en get_mobiles: {r2.text[:200]}")

except Exception as e:
    print(f"ERROR GeoAgris: {e}")

# Guardar estado actual
with open(GEO_FILE, "w", encoding="utf-8") as f:
    json.dump({"updated_at": now_str + " UTC", "mobiles": mobiles}, f, ensure_ascii=False)
print("geoagris.json guardado")

# Historial
try:
    historial = {}
    if os.path.exists(HIST_FILE):
        with open(HIST_FILE, "r", encoding="utf-8") as f:
            historial = json.load(f)

    corte = (now - timedelta(days=MAX_DIAS)).strftime("%Y-%m-%d %H:%M")
    for m in mobiles:
        mid = str(m.get("mobile_id"))
        nombre = m.get("mobile_name", mid)
        activo = (m.get("mobile_pseudostatus") or "").strip().lower() == "si"
        status = m.get("mobile_status", "")
        pres_obj = next((x for x in m.get("measures", [])
            if any(k in (x.get("name","")).lower() for k in ["pres","bar","psi"])), None)
        pres_val = round(float(pres_obj["value"]), 1) if pres_obj and float(pres_obj.get("value", 0)) > 1 else None
        pres_unit = (pres_obj.get("unit","") or "").strip() if pres_obj else ""

        if mid not in historial:
            historial[mid] = {"nombre": nombre, "registros": []}
        historial[mid]["nombre"] = nombre
        historial[mid]["registros"].append({
            "t": now_str, "activo": activo, "status": status,
            "psi": pres_val, "unit": pres_unit
        })
        historial[mid]["registros"] = [
            r for r in historial[mid]["registros"] if r["t"] >= corte
        ]

    with open(HIST_FILE, "w", encoding="utf-8") as f:
        json.dump(historial, f, ensure_ascii=False)
    print(f"historial.json guardado ({len(historial)} equipos)")
except Exception as e:
    print(f"ERROR historial: {e}")

# ══════════════════════════════════════════
# 2. MICROSOFT FORMS / SHAREPOINT
# ══════════════════════════════════════════
print("--- Microsoft Forms / SharePoint ---")
try:
    token_r = requests.post(
        f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "scope": "https://graph.microsoft.com/.default"
        }, timeout=30)
    token_r.raise_for_status()
    token = token_r.json().get("access_token")
    if not token:
        print("ERROR: no se obtuvo token MS Graph")
    else:
        print("Token MS Graph OK")
        headers = {"Authorization": f"Bearer {token}"}
        url = (f"https://graph.microsoft.com/v1.0/sites/{MS_SITE}"
               f"/lists/{MS_LIST_ID}/items?expand=fields&$top=999")
        r3 = requests.get(url, headers=headers, timeout=30)
        print(f"SharePoint status: {r3.status_code}")
        r3.raise_for_status()
        items = r3.json().get("value", [])
        print(f"Registros SharePoint: {len(items)}")

        registros = []
        for item in items:
            f = item.get("fields", {})
            registros.append({
                "id": "ms_" + str(item.get("id", "")),
                "equipo": f.get("Equipo", ""),
                "fecha": f.get("Fecha", f.get("Created", "")),
                "descripcion": f.get("Descripcion", ""),
                "ubicacion": f.get("Ubicacion", ""),
                "trabajo": f.get("Trabajos", ""),
                "repuesto": f.get("Repuesto", ""),
                "operario": f.get("Operario", ""),
                "tipo": f.get("TipoMant", ""),
                "gravedad": f.get("Gravedad", ""),
                "horas": f.get("Horas", ""),
                "pedido": f.get("Pedido", ""),
                "queEs": f.get("QueEs", ""),
                "ubicacionEsp": f.get("UbicacionEsp", ""),
                "fuente": "MSForms"
            })

        with open(MS_FILE, "w", encoding="utf-8") as f_out:
            json.dump({
                "updated_at": now_str + " UTC",
                "registros": registros
            }, f_out, ensure_ascii=False)
        print(f"msforms.json guardado ({len(registros)} registros)")

except Exception as e:
    print(f"ERROR MS Forms: {e}")

print("Fetch completado.")
