"""
Flota (telemetria de camiones de riego) -> data/jdlink.json
Corre cada 1 hora desde GitHub Actions (.github/workflows/jdlink.yml).
Llamadas por corrida: 1 token + 1 equipos + 3 por camion (horas motor,
horas de operacion, ultimo reporte) = 11. Si algo falla NO pisa el json anterior.
"""
import os, sys, json, base64, requests
from datetime import datetime

TOKEN_URL = "https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/v1/token"
API = "https://api.deere.com"
ORG = "9953940"
OUT = "data/jdlink.json"
ACCEPT = "application/vnd.deere.axiom.v3+json"


def renovar_token():
    r = requests.post(
        TOKEN_URL,
        auth=(os.environ["DEERE_CLIENT_ID"], os.environ["DEERE_CLIENT_SECRET"]),
        headers={"Accept": "application/json"},
        data={"grant_type": "refresh_token",
              "refresh_token": os.environ["DEERE_REFRESH_TOKEN"],
              "scope": "offline_access org1 eq1"},
        timeout=30)
    j = r.json()
    if r.status_code != 200 or "access_token" not in j:
        sys.exit(f"Token Deere HTTP {r.status_code}: {j.get('error')} {j.get('error_description')}")
    print(f"::add-mask::{j['access_token']}")
    nuevo = j.get("refresh_token")
    if nuevo and nuevo != os.environ["DEERE_REFRESH_TOKEN"]:
        print(f"::add-mask::{nuevo}")
        guardar_secret(nuevo)
    return j["access_token"]


def guardar_secret(valor):
    """Si Deere rota el refresh token, guardar el nuevo como secret."""
    from nacl import encoding, public
    H = {"Authorization": f"Bearer {os.environ['GH_PAT']}",
         "Accept": "application/vnd.github+json"}
    repo = os.environ["REPO"]
    k = requests.get(f"https://api.github.com/repos/{repo}/actions/secrets/public-key",
                     headers=H, timeout=30).json()
    pk = public.PublicKey(k["key"].encode(), encoding.Base64Encoder())
    enc = base64.b64encode(public.SealedBox(pk).encrypt(valor.encode())).decode()
    p = requests.put(f"https://api.github.com/repos/{repo}/actions/secrets/DEERE_REFRESH_TOKEN",
                     headers=H, json={"encrypted_value": enc, "key_id": k["key_id"]}, timeout=30)
    print("Refresh token rotado, guardado HTTP:", p.status_code)
    p.raise_for_status()


def get(url, hd):
    r = requests.get(url, headers=hd, timeout=40)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code} en {url.replace(API, '')}")
    return r.json().get("values", [])


def ultimo(lista, campo):
    """Registro con la fecha mas reciente (no asumo el orden de la API)."""
    lista = [x for x in lista if x.get(campo)]
    return max(lista, key=lambda x: x[campo]) if lista else None


def procesar_equipo(m, hd):
    pid = m.get("principalId")
    e = {
        "id": m.get("id"),
        "principalId": pid,
        "nombre": m.get("name"),
        "modelo": (m.get("model") or {}).get("name"),
    }
    base = f"{API}/platform/machines/{pid}"

    h = ultimo(get(f"{base}/engineHours", hd), "reportTime")
    if h:
        e["horas_motor"] = round((h.get("reading") or {}).get("valueAsDouble", 0), 1)
        e["horas_motor_fecha"] = h["reportTime"]

    t = ultimo(get(f"{base}/hoursOfOperation", hd), "endDate")
    if t:
        # engineState: 1 = motor encendido, 0 = apagado (confirmar contra Operations Center)
        e["tramo"] = {"inicio": t.get("startDate"), "fin": t.get("endDate"),
                      "estado": t.get("engineState")}

    d = ultimo(get(f"{base}/deviceStateReports", hd), "time")
    if d:
        loc = d.get("location") or {}
        e["ultimo_reporte"] = d["time"]
        try:
            e["lat"] = float(loc["lat"])
            e["lon"] = float(loc["lon"])
        except (KeyError, TypeError, ValueError):
            pass
    return e


def main():
    at = renovar_token()
    hd = {"Authorization": f"Bearer {at}", "Accept": ACCEPT}
    maquinas = get(f"{API}/isg/equipment?organizationIds={ORG}", hd)
    print("Equipos:", len(maquinas))
    equipos, errores = [], []
    for m in maquinas:
        if m.get("archived"):
            continue
        try:
            equipos.append(procesar_equipo(m, hd))
        except Exception as ex:
            errores.append({"equipo": m.get("name"), "error": str(ex)})
            print("ERROR", m.get("name"), ex)
    if not equipos:
        sys.exit("Sin datos: no se actualiza jdlink.json")
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M") + " UTC",
                   "equipos": equipos, "errores": errores}, f, ensure_ascii=False)
    print(f"{OUT} guardado ({len(equipos)} equipos, {len(errores)} errores)")


if __name__ == "__main__":
    main()
