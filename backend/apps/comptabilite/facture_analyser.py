import base64
import json
import re
import google.generativeai as genai
from django.conf import settings


PROMPT = """Tu es un assistant comptable OHADA. Analyse cette facture et retourne UNIQUEMENT un objet JSON valide (sans markdown, sans explication) avec cette structure exacte :

{
  "date": "YYYY-MM-DD",
  "numero_facture": "string ou null",
  "fournisseur": "nom du fournisseur",
  "description": "description courte des achats",
  "montant_ht": 0.00,
  "taux_tva": 18,
  "montant_tva": 0.00,
  "montant_ttc": 0.00,
  "type_charge": "marchandises|matieres|services|transport|autre"
}

Règles :
- montant_ht + montant_tva = montant_ttc
- taux_tva : 0 si pas de TVA, sinon le taux réel (18 par défaut en Afrique de l'Ouest)
- type_charge : déduis-le du contenu de la facture
- Tous les montants sont des nombres décimaux (pas de chaînes)
"""

TYPE_CHARGE_TO_COMPTE = {
    "marchandises": ("601", "Achats de marchandises"),
    "matieres": ("602", "Achats de matières premières"),
    "services": ("622", "Locations et charges locatives"),
    "transport": ("624", "Transports de biens"),
    "autre": ("628", "Autres charges externes"),
}


def analyser_facture(fichier_bytes: bytes, mime_type: str) -> dict:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.0-flash")

    response = model.generate_content([
        {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(fichier_bytes).decode()}},
        PROMPT,
    ])

    text = response.text.strip()
    # Strip markdown code blocks if present
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    data = json.loads(text)

    # Build proposed accounting lines
    compte_num, compte_lib = TYPE_CHARGE_TO_COMPTE.get(data.get("type_charge", "autre"), ("628", "Autres charges externes"))
    montant_ht = float(data.get("montant_ht", 0))
    montant_tva = float(data.get("montant_tva", 0))
    montant_ttc = float(data.get("montant_ttc", 0))

    lignes_proposees = []

    # Debit: charge account
    lignes_proposees.append({
        "sens": "debit",
        "compte_numero": compte_num,
        "compte_libelle": compte_lib,
        "libelle": data.get("description", "Facture fournisseur"),
        "montant": round(montant_ht, 2),
    })

    # Debit: TVA deductible (if any)
    if montant_tva > 0:
        lignes_proposees.append({
            "sens": "debit",
            "compte_numero": "4456",
            "compte_libelle": "TVA déductible",
            "libelle": f"TVA {data.get('taux_tva', 18)}%",
            "montant": round(montant_tva, 2),
        })

    # Credit: supplier
    lignes_proposees.append({
        "sens": "credit",
        "compte_numero": "401",
        "compte_libelle": "Fournisseurs",
        "libelle": data.get("fournisseur", "Fournisseur"),
        "montant": round(montant_ttc, 2),
    })

    return {
        "extraction": data,
        "lignes_proposees": lignes_proposees,
    }
