import requests, json, os
from datetime import datetime, timedelta

GEO_USER="fincatolloche";GEO_PASS="geoagris2019"
GEO_BASE="https://s.agriexplorer.net/index.php/api/rest"
MS_TENANT="4a67ffcd-8647-4abd-91eb-105e4ff520c9"
MS_CLIENT_ID="4e025307-d4a3-4d48-8eb3-ca1a0861ee17"
MS_CLIENT_SECRET="fec8Q~MRhzlgz7mpmvw3pHEMvl2j2Ipsq3TzlbsD"
MS_SITE="liagargentina.sharepoint.com:/sites/ServiciosFT:"
MS_LIST_ID="1b181ab0-82f7-4026-852d-e9da0eca3a0b"
os.makedirs("data",exist_ok=True)
now=datetime.utcnow();now_str=now.strftime("%Y-%m-%d %H:%M")
print(f"[{now_str} UTC] Iniciando fetch...")

print("--- GeoAgris ---")
mobiles=[]
try:
    r=requests.post(f"{GEO_BASE}/login",json={"user_name":GEO_USER,"password":GEO_PASS},timeout=30)
    r.raise_for_status()
    session=r.json()["session_id"]
    print("Login OK")
    r2=requests.post(f"{GEO_BASE}/get_mobiles",json={"session_id":session,"version_id":"3.5"},timeout=30)
    print(f"get_mobiles status:{r2.status_code} len:{len(r2.text)}")
    if r2.status_code==200 and r2.text.strip():
        try:
            mobiles=r2.json().get("result",[])
            print(f"Equipos:{len(mobiles)}")
        except Exception as e:
            print(f"Error JSON get_mobiles:{e} resp:{r2.text[:200]}")
    else:
        print(f"Respuesta vacia:{r2.text[:100]}")
except Exception as e:
    print(f"ERROR GeoAgris:{e}")

with open("data/geoagris.json","w",encoding="utf-8") as f:
    json.dump({"updated_at":now_str+" UTC","mobiles":mobiles},f,ensure_ascii=False)
print("geoagris.json guardado")

try:
    hist={}
    if os.path.exists("data/historial.json"):
        with open("data/historial.json","r",encoding="utf-8") as f:hist=json.load(f)
    corte=(now-timedelta(days=7)).strftime("%Y-%m-%d %H:%M")
    for m in mobiles:
        mid=str(m.get("mobile_id"));nombre=m.get("mobile_name",mid)
        activo=(m.get("mobile_pseudostatus") or "").strip().lower()=="si"
        status=m.get("mobile_status","")
        po=next((x for x in m.get("measures",[]) if any(k in (x.get("name","")).lower() for k in ["pres","bar","psi"])),None)
        pv=round(float(po["value"]),1) if po and float(po.get("value",0))>1 else None
        pu=(po.get("unit","") or "").strip() if po else ""
        if mid not in hist:hist[mid]={"nombre":nombre,"registros":[]}
        hist[mid]["nombre"]=nombre
        hist[mid]["registros"].append({"t":now_str,"activo":activo,"status":status,"psi":pv,"unit":pu})
        hist[mid]["registros"]=[r for r in hist[mid]["registros"] if r["t"]>=corte]
    with open("data/historial.json","w",encoding="utf-8") as f:json.dump(hist,f,ensure_ascii=False)
    print(f"historial.json guardado ({len(hist)} equipos)")
except Exception as e:
    print(f"ERROR historial:{e}")

print("--- MS Forms / SharePoint ---")
try:
    tr=requests.post(f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/token",
        data={"grant_type":"client_credentials","client_id":MS_CLIENT_ID,"client_secret":MS_CLIENT_SECRET,"scope":"https://graph.microsoft.com/.default"},timeout=30)
    tr.raise_for_status()
    token=tr.json().get("access_token")
    if not token:
        print("ERROR: sin token MS Graph")
    else:
        print("Token OK")
        hdrs={"Authorization":f"Bearer {token}"}
        url=f"https://graph.microsoft.com/v1.0/sites/{MS_SITE}/lists/{MS_LIST_ID}/items?expand=fields&$top=999"
        r3=requests.get(url,headers=hdrs,timeout=30)
        print(f"SharePoint status:{r3.status_code}")
        r3.raise_for_status()
        items=r3.json().get("value",[])
        print(f"Registros:{len(items)}")
        regs=[]
        for item in items:
            f=item.get("fields",{})
            regs.append({"id":"ms_"+str(item.get("id","")),"equipo":f.get("Equipo",""),"fecha":f.get("Fecha",f.get("Created","")),"descripcion":f.get("Descripcion",""),"ubicacion":f.get("Ubicacion",""),"trabajo":f.get("Trabajos",""),"repuesto":f.get("Repuesto",""),"operario":f.get("Operario",""),"tipo":f.get("TipoMant",""),"gravedad":f.get("Gravedad",""),"horas":f.get("Horas",""),"pedido":f.get("Pedido",""),"queEs":f.get("QueEs",""),"ubicacionEsp":f.get("UbicacionEsp",""),"fuente":"MSForms"})
        with open("data/msforms.json","w",encoding="utf-8") as fo:
            json.dump({"updated_at":now_str+" UTC","registros":regs},fo,ensure_ascii=False)
        print(f"msforms.json guardado ({len(regs)} registros)")
except Exception as e:
    print(f"ERROR MS Forms:{e}")

print("Fetch completado.")
