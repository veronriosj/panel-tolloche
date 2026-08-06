"""
Script GitHub Actions - Finca Tolloche
- GeoAgris: estado actual + historial 7 dias
- SharePoint: registros MS Forms -> data/msforms.json
"""
import requests, json, os, re
from datetime import datetime, timedelta

# JSONBin (mismo bin de estados/turnos que usa el dashboard)
JSONBIN_KEY = "$2a$10$yvsvPG1yZjdF7yzSo2XohO/g.vdj.1D4Nmy40d.FK21tjKyzGgglC"
ESTADOS_BIN_ID = "6a425e98da38895dfe0fadcf"
ESTADOS_BIN_API = f"https://api.jsonbin.io/v3/b/{ESTADOS_BIN_ID}"

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
        lote_actual = (m.get("field_name") or "").strip()
        pres_obj = next((x for x in m.get("measures", [])
            if any(k in (x.get("name","")).lower() for k in ["pres","bar","psi"])), None)
        pres_val = round(float(pres_obj["value"]), 1) if pres_obj and float(pres_obj.get("value", 0)) > 1 else None
        pres_unit = (pres_obj.get("unit","") or "").strip() if pres_obj else ""

        if mid not in historial:
            historial[mid] = {"nombre": nombre, "registros": []}
        historial[mid]["nombre"] = nombre
        historial[mid]["registros"].append({
            "t": now_str, "activo": activo, "status": status,
            "lote": lote_actual,
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
# ══════════════════════════════════════════
# 3. RIEGO FT (Balance Hídrico - Pepe Aguilar) - SOLO LECTURA
# ══════════════════════════════════════════
print("--- Riego FT (Balance Hídrico) ---")
SUPA_URL_FT = "https://bnaurkovjdnclxtzvdsf.supabase.co"
SUPA_KEY_FT = "sb_publishable_xKVmeWVkpwJIKNW7P98wNQ_gaMppuM1"
RIEGO_FT_FILE = "data/riego_ft.json"
try:
    headers_supa = {"apikey": SUPA_KEY_FT, "Authorization": f"Bearer {SUPA_KEY_FT}"}
    r4 = requests.get(
        f"{SUPA_URL_FT}/rest/v1/riegos?select=*&order=orden.desc",
        headers=headers_supa, timeout=30
    )
    r4.raise_for_status()
    riego_ft = r4.json()
    print(f"Programas de riego FT: {len(riego_ft)}")
    with open(RIEGO_FT_FILE, "w", encoding="utf-8") as f:
        json.dump({"updated_at": now_str + " UTC", "registros": riego_ft}, f, ensure_ascii=False)
    print("riego_ft.json guardado")
except Exception as e:
    print(f"ERROR Riego FT: {e}")
    

# ══════════════════════════════════════════
# 4. ALERTAS: equipos por terminar el lote (envío por WhatsApp)
# ══════════════════════════════════════════
print("--- Alertas de fin de lote ---")

ALERTAS_FILE = "data/alertas_ft.json"
ALERTAS_ESTADO_FILE = "data/alertas_estado.json"
UMBRAL_HORAS_ALERTA = 1.5  # avisa cuando falten esta cantidad de horas o menos

# Metros de recorrido reales por lote (misma tabla que usa el dashboard,
# calculada de la planimetría oficial Planimetria_unida_FT_Iri.shp)
METROS_POR_LOTE_FT = {"r21":1150,"r22":1202,"r25":1204,"r26":1189,"r23":1200,"r24":1196,"r32":1213,"r33":1209,"r31":1212,"r36":1214,"r37":1207,"r34":1213,"r35":1214,"q11":1229,"q12":1230,"q15":1226,"q16":1173,"q13":1233,"q14":1221,"q22":1231,"q23":1232,"q21":1227,"q26":1200,"q24":1222,"q25":1226,"q33":1232,"q34":1223,"q31":1225,"q32":1231,"q35":1227,"q36":1315,"p12":1226,"p13":1236,"p11":1202,"p16":1201,"j01d":1596,"p14":1220,"j01b":1720,"p15":1228,"j01c":1672,"q44":1223,"q45":1227,"q42":1231,"q43":1231,"j01a":1679,"q46":1395,"q41":1220,"p23":1238,"p24":1222,"nna":1057,"p21":1213,"nnb":1055,"p22":1227,"nne":1056,"p25":1224,"j02c":1678,"p26":1199,"j02d":1697,"nnc":1056,"nnd":1057,"q55":1227,"q56":1098,"q53":1230,"q54":1223,"j02a":1719,"j02b":1717,"q51":1217,"q52":1231,"p34":1219,"p35":1226,"p32":1227,"p33":1236,"p36":1026,"p31":1202,"o13":1721,"o14":1912,"o11":1700,"o12":1227,"p45":1227,"p46":1210,"p43":1235,"p44":1224,"p41":1222,"p42":1228,"o24":1990,"o22":1269,"l01d":944,"o23":1709,"l01e":854,"l01b":1271,"o21":1487,"l01c":1134,"p56":1202,"l01a":889,"p54":1222,"p55":1225,"p52":1227,"p53":1236,"p51":1221,"l02e":1040,"l02c":912,"l02d":1192,"l02a":1452,"l02b":913,"m01c":1980,"m01d":1345,"m01a":1513,"m01b":1837,"l03a":1201,"l03d":993,"l03e":1201,"l03b":991,"l03c":918,"m02a":920,"m02d":2094,"m02e":1255,"m02b":1340,"m02c":1190,"kb":1790,"kc":1119,"ka":1222,"r16":1210,"r17":1209,"p1":1190,"r11":1230,"r14":1209,"r15":1209,"r12":1205,"r13":1207,"nc":1213,"nd":1620,"na":1447,"nb":1209,"r27":1150}

def equipo_desde_nombre_geo(nombre):
    n = re.sub(r"^_?Riego-?", "", nombre or "", flags=re.IGNORECASE).strip()
    if re.fullmatch(r"Q1\s*Sur", n, re.IGNORECASE):
        return "Q1sur"
    if re.fullmatch(r"Q1", n, re.IGNORECASE):
        return "Q1norte"
    return re.sub(r"\s+", "", n)

def detectar_transiciones_lote(registros):
    transiciones = []
    anterior = None
    for r in registros or []:
        lote = (r.get("lote") or "").strip()
        if not lote:
            continue
        if lote != anterior:
            transiciones.append({"t": r["t"], "lote": lote})
            anterior = lote
    return transiciones

def horas_teoricas(lote, pct):
    metros = METROS_POR_LOTE_FT.get((lote or "").strip().lower())
    if metros is None or not pct or pct <= 0:
        return None
    velocidad = pct * 2.25  # m/h
    return metros / velocidad

try:
    alertas = []
    ahora = datetime.utcnow()
    # Turno según hora local Argentina (UTC-3): día 7:30-17:30, noche 19:00-4:00
    hora_local = (ahora - timedelta(hours=3)).time()
    def turno_actual():
        from datetime import time as dtime
        if dtime(7, 30) <= hora_local <= dtime(17, 30):
            return "dia"
        if hora_local >= dtime(19, 0) or hora_local <= dtime(4, 0):
            return "noche"
        return None  # fuera de ambos turnos (4:00-7:30)

    turno = turno_actual()

    # Traer asignación de turnos (JSONBin, mismo bin que usa el dashboard)
    turnos_ft = {}
    try:
        r5 = requests.get(
            f"{ESTADOS_BIN_API}/latest",
            headers={"X-Master-Key": JSONBIN_KEY}, timeout=20
        )
        if r5.ok:
            turnos_ft = (r5.json().get("record") or {}).get("turnosFT") or {}
    except Exception as e:
        print(f"No se pudo traer turnosFT: {e}")

    # Cargar estado previo de avisos ya mandados (para no repetir cada 5 min)
    try:
        with open(ALERTAS_ESTADO_FILE, "r", encoding="utf-8") as f:
            estado_previo = json.load(f)
    except Exception:
        estado_previo = {}
    estado_nuevo = {}

    if turno:
        for mid, info in historial.items():
            nombre = info.get("nombre", "")
            if "riego" not in nombre.lower():
                continue
            equipo = equipo_desde_nombre_geo(nombre)
            transiciones = detectar_transiciones_lote(info.get("registros", []))
            if not transiciones:
                continue
            ultima = transiciones[-1]
            lote_actual = ultima["lote"]
            inicio = datetime.strptime(ultima["t"], "%Y-%m-%d %H:%M")
            horas_transcurridas = (ahora - inicio).total_seconds() / 3600

            # Buscar el % avance configurado para este lote en riego_ft (semana más reciente)
            candidatos = [r for r in riego_ft if (r.get("equipo","").lower()==equipo.lower()
                          and (r.get("lote","").lower()==lote_actual.lower()))]
            if not candidatos:
                continue
            reg = sorted(candidatos, key=lambda r: r.get("wk",0), reverse=True)[0]
            h_teoricas = horas_teoricas(lote_actual, reg.get("pct"))
            if h_teoricas is None:
                continue
            h_restantes = max(0, h_teoricas - horas_transcurridas)

            clave = f"{equipo}|{lote_actual}"
            estado_nuevo[clave] = {"avisado": estado_previo.get(clave, {}).get("avisado", False)}

            if h_restantes <= UMBRAL_HORAS_ALERTA and not estado_previo.get(clave, {}).get("avisado"):
                info_equipo = (turnos_ft.get("porEquipo") or {}).get(equipo, {})
                if turno == "dia":
                    operador_nombre = info_equipo.get("diaNombre", "")
                    operador_tg = info_equipo.get("diaTg", "")
                    capataz = turnos_ft.get("capatazDia", {})
                else:
                    operador_nombre = info_equipo.get("nocheNombre", "")
                    operador_tg = info_equipo.get("nocheTg", "")
                    capataz = turnos_ft.get("capatazNoche", {})

                mensaje = (f"⚠️ El equipo {equipo} está por terminar el lote {lote_actual}. "
                           f"Quedan aprox. {h_restantes:.1f} hs.")

                alertas.append({
                    "equipo": equipo, "lote": lote_actual,
                    "horas_restantes": round(h_restantes, 1),
                    "turno": turno,
                    "operador": operador_nombre, "operador_telegram": operador_tg,
                    "capataz": capataz.get("nombre",""), "capataz_telegram": capataz.get("telegram",""),
                    "mensaje": mensaje, "generado": now_str + " UTC"
                })
                estado_nuevo[clave]["avisado"] = True

                # --- Envío real por Telegram ---
                destinatarios_tg = set()
                if operador_tg: destinatarios_tg.add(operador_tg)
                if capataz.get("telegram"): destinatarios_tg.add(capataz["telegram"])
                for c in (turnos_ft.get("mantenimiento") or []):
                    if c.get("telegram"): destinatarios_tg.add(c["telegram"])
                for c in (turnos_ft.get("encargados") or []):
                    if c.get("telegram"): destinatarios_tg.add(c["telegram"])
                miguel_tg = (turnos_ft.get("miguel") or {}).get("telegram")
                if miguel_tg: destinatarios_tg.add(miguel_tg)
                for chat_id in destinatarios_tg:
                    enviar_telegram(chat_id, mensaje)
            elif h_restantes > UMBRAL_HORAS_ALERTA:
                estado_nuevo[clave]["avisado"] = False  # se resetea si vuelve a haber margen (ej. nuevo lote)

    with open(ALERTAS_FILE, "w", encoding="utf-8") as f:
        json.dump({"updated_at": now_str + " UTC", "alertas": alertas}, f, ensure_ascii=False)
    with open(ALERTAS_ESTADO_FILE, "w", encoding="utf-8") as f:
        json.dump(estado_nuevo, f, ensure_ascii=False)
    print(f"Alertas detectadas: {len(alertas)} (turno actual: {turno})")

except Exception as e:
    print(f"ERROR Alertas: {e}")

# Envío por Telegram: usa el bot creado con @BotFather. El token va como
# secret de GitHub Actions (TELEGRAM_BOT_TOKEN), no queda expuesto en el código.
def enviar_telegram(chat_id, mensaje):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token or not chat_id:
        return
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": mensaje},
            timeout=15
        )
        if not r.ok:
            print(f"Error Telegram a {chat_id}: {r.status_code} {r.text[:150]}")
    except Exception as e:
        print(f"Error enviando Telegram a {chat_id}: {e}")

print("Fetch completado.")
