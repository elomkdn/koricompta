"""
Analyseur de factures — KoriCompta
===================================
1. Parser MECeF (factures normalisées DGI Bénin) — sans IA, via pdfplumber
2. Fallback Gemini pour les autres formats (images, PDFs non-MECeF)
"""

import io
import re
import json
import base64
from decimal import Decimal, InvalidOperation


# ─────────────────────────────────────────────────────────────
# CLASSIFICATION DES COMPTES PAR MOTS-CLÉS
# ─────────────────────────────────────────────────────────────

KEYWORDS_COMPTE = [
    # (mots-clés, compte, libellé)
    (['travaux', 'aménagement', 'construction', 'bâtiment', 'génie civil',
      'contrôle', 'suivi', 'surveillance', 'maîtrise d\'œuvre', 'moe',
      'inspection', 'supervision'], '6326', 'Honoraires'),

    (['honoraires', 'consulting', 'conseil', 'audit', 'expertise',
      'étude', 'mission', 'prestation intellectuelle', 'assistance technique'],
     '6326', 'Honoraires'),

    (['sous-traitance', 'sous traitance', 'prestation de service',
      'prestations de service'], '604', 'Sous-traitance générale'),

    (['formation', 'séminaire', 'atelier', 'stage'], '6321', 'Formation du personnel'),

    (['loyer', 'location', 'bail', 'locatif'], '6221', 'Loyers et charges locatives'),

    (['transport', 'livraison', 'fret', 'expédition', 'transitaire'],
     '6111', 'Transports sur achats'),

    (['carburant', 'gasoil', 'essence', 'combustible'], '6053', 'Carburants et lubrifiants'),

    (['électricité', 'eau', 'sbee', 'soneb'], '6054', 'Eau et énergie'),

    (['téléphone', 'internet', 'télécommunication', 'mobile', 'mtn', 'moov'],
     '6254', 'Télécommunications'),

    (['assurance'], '6251', 'Assurances'),

    (['publicité', 'communication', 'marketing', 'impression', 'affichage'],
     '6234', 'Publicité et relations publiques'),

    (['fournitures', 'papeterie', 'bureau', 'cartouche', 'toner'],
     '6064', 'Fournitures de bureau'),

    (['informatique', 'logiciel', 'matériel informatique', 'ordinateur',
      'serveur', 'maintenance informatique'], '6228', 'Divers services extérieurs'),

    (['marchandises', 'produits finis', 'articles'], '601', 'Achats de marchandises'),

    (['matières premières', 'matières', 'matériaux', 'intrants'],
     '602', 'Achats de matières premières et fournitures liées'),

    (['alimentation', 'restauration', 'repas', 'traiteur'],
     '6065', 'Fournitures pour entretien et petit équipement'),
]

DEFAULT_COMPTE = ('628', 'Autres charges externes')


def _classifier_compte(description: str) -> tuple[str, str]:
    """Choisit le compte de charge le plus adapté selon les mots-clés."""
    desc = description.lower()
    for keywords, compte, libelle in KEYWORDS_COMPTE:
        if any(kw in desc for kw in keywords):
            return compte, libelle
    return DEFAULT_COMPTE


# ─────────────────────────────────────────────────────────────
# TVA / TPS — Groupes MECeF Bénin
# ─────────────────────────────────────────────────────────────

# Groupe → (taux_tva, compte_tva ou None)
GROUPES_TVA_MECEF = {
    'A': (Decimal('18'), '4456'),   # TVA 18% déductible
    'B': (Decimal('10'), '4456'),   # TVA taux réduit 10%
    'C': (Decimal('0'),  None),     # Exportations (TVA 0%)
    'D': (Decimal('0'),  None),     # Exonéré (loi spéciale)
    'E': (Decimal('0'),  None),     # TPS — exonéré en pratique
    'F': (Decimal('0'),  None),     # Hors champ
}


def _parse_montant(s: str) -> Decimal:
    """Convertit '1.997.100' ou '998 550' ou '998,550' → Decimal."""
    if not s:
        return Decimal('0')
    # Supprime espaces insécables et espaces
    s = s.replace('\xa0', '').replace(' ', '')
    # Format béninois : séparateur milliers = '.' ou ' ', décimal = ','
    # Ex : '998.550' = 998550  /  '1.997.100' = 1997100  /  '998,55' = 998.55
    if ',' in s:
        # virgule = décimale
        s = s.replace('.', '').replace(',', '.')
    else:
        # points = séparateurs milliers (pas de décimale)
        s = s.replace('.', '')
    try:
        return Decimal(s)
    except InvalidOperation:
        return Decimal('0')


# ─────────────────────────────────────────────────────────────
# PARSER MECeF (PDF)
# ─────────────────────────────────────────────────────────────

def _est_mecef(texte: str) -> bool:
    return bool(re.search(r'MECeF|NIM\s*:|FACTURE NORMALIS', texte, re.I))


def _parser_mecef(texte: str) -> dict | None:
    """
    Extrait les champs d'une facture normalisée MECeF/DGI Bénin.
    Retourne None si le parsing échoue.
    """
    t = texte

    # ── Numéro de facture ────────────────────────────────────
    m = re.search(r'Facture\s*#\s*([\w\-]+)', t, re.I)
    numero_facture = m.group(1).strip() if m else None

    # ── Date ────────────────────────────────────────────────
    m = re.search(r'(?:Date|MECeF Heure)\s*[:\s]+(\d{2}/\d{2}/\d{4})', t, re.I)
    date_str = None
    if m:
        j, mo, a = m.group(1).split('/')
        date_str = f'{a}-{mo}-{j}'

    # ── Fournisseur (émetteur) ───────────────────────────────
    # Le nom apparaît avant "FACTURE DE VENTE" ou "IFU"
    m = re.search(r'^(.+?)\n.*?(?:FACTURE DE VENTE|IFU\s*:)', t, re.M | re.S)
    fournisseur = m.group(1).strip().split('\n')[0].strip() if m else ''

    # ── IFU fournisseur ──────────────────────────────────────
    m = re.search(r'IFU\s*[:\s]+([\d]+)', t, re.I)
    ifu_fournisseur = m.group(1).strip() if m else ''

    # ── Client ──────────────────────────────────────────────
    m = re.search(r'(?:CLIENT|Nom\s*CLIENT)\s*[\n\r]+.*?Nom\s+([\w\s\-\']+)', t, re.I)
    if not m:
        m = re.search(r'CLIENT.*?Nom\s+([\w\s\-\'À-ÿ]+)', t, re.I | re.S)
    client = m.group(1).strip() if m else ''

    # ── Description (première ligne article) ────────────────
    # Chercher la ligne après le numéro d'article "1 ... "
    m = re.search(r'^\s*1\s+(.+?)(?:\d[\d\s.,]*\d\s+[\d,]+\s+[\d.,]+)', t, re.M | re.S)
    description = m.group(1).strip().replace('\n', ' ')[:200] if m else ''

    # ── Montant total TTC ────────────────────────────────────
    m = re.search(r'Total\s*:\s*([\d\s.,]+)', t, re.I)
    montant_ttc = _parse_montant(m.group(1).strip()) if m else Decimal('0')

    # ── Ventilation des impôts ───────────────────────────────
    # Groupe  Total  Imposable  Impôt
    groupes = re.findall(
        r'([A-F])\s*[-–]\s*(?:TVA|TPS|Exon[eé]r[eé]|Hors champ)?\s*([\d\s.,]+)\s+([-\d\s.,]+)\s+([-\d\s.,]+)',
        t, re.I
    )

    taux_tva = Decimal('0')
    montant_tva = Decimal('0')
    compte_tva = None

    for groupe, total_str, imposable_str, impot_str in groupes:
        groupe = groupe.upper()
        impot_val = _parse_montant(impot_str) if impot_str.strip() != '-' else Decimal('0')
        if impot_val > 0:
            taux, cpt = GROUPES_TVA_MECEF.get(groupe, (Decimal('0'), None))
            montant_tva += impot_val
            taux_tva = taux
            compte_tva = cpt

    # Recalcul HT
    montant_ht = montant_ttc - montant_tva

    # ── Paiement ─────────────────────────────────────────────
    deja_paye = bool(re.search(r'RÉPARTITION DES PAIEMENTS|VIREMENT|ESPÈCES|CHÈQUE', t, re.I))
    mode_paiement = None
    if deja_paye:
        if re.search(r'VIREMENT', t, re.I):
            mode_paiement = 'virement'
        elif re.search(r'ESPÈCES|CASH', t, re.I):
            mode_paiement = 'especes'
        elif re.search(r'CHÈQUE|CHEQUE', t, re.I):
            mode_paiement = 'cheque'

    if not date_str or montant_ttc == 0:
        return None

    return {
        'numero_facture': numero_facture,
        'date': date_str,
        'fournisseur': fournisseur,
        'ifu_fournisseur': ifu_fournisseur,
        'client': client,
        'description': description,
        'montant_ht': float(montant_ht),
        'taux_tva': float(taux_tva),
        'montant_tva': float(montant_tva),
        'montant_ttc': float(montant_ttc),
        'deja_paye': deja_paye,
        'mode_paiement': mode_paiement,
        'source': 'mecef',
    }


# ─────────────────────────────────────────────────────────────
# CONSTRUCTION DES LIGNES COMPTABLES
# ─────────────────────────────────────────────────────────────

def _construire_lignes(data: dict, societe_id: int | None) -> list[dict]:
    """Construit les lignes de l'écriture comptable à partir des données extraites."""

    # Choisir le meilleur compte de charge disponible dans la société
    compte_charge, libelle_charge = _meilleur_compte(
        data.get('description', ''), societe_id
    )

    montant_ht = round(float(data.get('montant_ht', 0)), 2)
    montant_tva = round(float(data.get('montant_tva', 0)), 2)
    montant_ttc = round(float(data.get('montant_ttc', 0)), 2)
    description = data.get('description', 'Facture fournisseur')
    fournisseur = data.get('fournisseur', 'Fournisseur')
    deja_paye = data.get('deja_paye', False)
    mode_paiement = data.get('mode_paiement', 'virement')

    lignes = []

    # Débit charge
    lignes.append({
        'sens': 'debit',
        'compte_numero': compte_charge,
        'compte_libelle': libelle_charge,
        'libelle': description,
        'montant': montant_ht if montant_ht > 0 else montant_ttc,
    })

    # Débit TVA déductible
    if montant_tva > 0:
        lignes.append({
            'sens': 'debit',
            'compte_numero': '4456',
            'compte_libelle': 'TVA déductible sur achats',
            'libelle': f'TVA {data.get("taux_tva", 18)}%',
            'montant': montant_tva,
        })

    # Crédit : fournisseur ou trésorerie si déjà payé
    if deja_paye:
        compte_tresorerie = '521' if mode_paiement in ('virement', 'cheque') else '571'
        libelle_tresorerie = 'Banques locales' if mode_paiement in ('virement', 'cheque') else 'Caisse siège'
        lignes.append({
            'sens': 'credit',
            'compte_numero': compte_tresorerie,
            'compte_libelle': libelle_tresorerie,
            'libelle': f'Règlement {fournisseur}',
            'montant': montant_ttc,
        })
    else:
        lignes.append({
            'sens': 'credit',
            'compte_numero': '401',
            'compte_libelle': 'Fournisseurs',
            'libelle': fournisseur,
            'montant': montant_ttc,
        })

    return lignes


def _meilleur_compte(description: str, societe_id: int | None) -> tuple[str, str]:
    """Choisit le compte le plus précis existant dans la société."""
    compte_ideal, libelle = _classifier_compte(description)

    if not societe_id:
        return compte_ideal, libelle

    try:
        from apps.comptabilite.models import Compte
        # Cherche le compte exact ou le plus proche (par préfixe décroissant)
        for longueur in range(len(compte_ideal), 1, -1):
            prefix = compte_ideal[:longueur]
            c = Compte.objects.filter(
                societe_id=societe_id, numero__startswith=prefix, actif=True
            ).order_by('numero').first()
            if c:
                return c.numero, c.intitule
    except Exception:
        pass

    return compte_ideal, libelle


# ─────────────────────────────────────────────────────────────
# FALLBACK GEMINI (images et PDFs non-MECeF)
# ─────────────────────────────────────────────────────────────

def _analyser_avec_gemini(fichier_bytes: bytes, mime_type: str, societe_id: int | None) -> dict:
    import google.generativeai as genai
    from django.conf import settings

    def charger_plan():
        if not societe_id:
            return "(plan non disponible)"
        try:
            from apps.comptabilite.models import Compte
            comptes = Compte.objects.filter(
                societe_id=societe_id, actif=True,
                numero__regex=r'^[46]'
            ).order_by('numero').values('numero', 'intitule')
            return "\n".join(f"{c['numero']} – {c['intitule']}" for c in comptes) or "(vide)"
        except Exception:
            return "(erreur)"

    prompt = f"""Tu es expert-comptable OHADA. Analyse cette facture.
Retourne UNIQUEMENT un objet JSON (sans markdown) avec :
{{
  "date": "YYYY-MM-DD",
  "numero_facture": "string ou null",
  "fournisseur": "nom",
  "description": "description courte",
  "montant_ht": 0.00,
  "taux_tva": 0,
  "montant_tva": 0.00,
  "montant_ttc": 0.00,
  "deja_paye": false,
  "mode_paiement": "virement|especes|cheque|null"
}}

Règles : ne jamais inventer de TVA non indiquée. Si groupe TPS/exonéré → taux_tva=0.

COMPTES DISPONIBLES (choisir le plus précis) :
{charger_plan()}"""

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-3.1-pro-preview")
    response = model.generate_content([
        {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(fichier_bytes).decode()}},
        prompt,
    ])
    text = response.text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    data = json.loads(text)
    data['source'] = 'gemini'
    return data


# ─────────────────────────────────────────────────────────────
# POINT D'ENTRÉE PRINCIPAL
# ─────────────────────────────────────────────────────────────

def analyser_facture(fichier_bytes: bytes, mime_type: str, societe_id: int | None = None) -> dict:
    data = None
    methode = 'inconnu'

    # ── Tentative parser MECeF (PDF uniquement) ──────────────
    if mime_type == 'application/pdf':
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(fichier_bytes)) as pdf:
                texte = '\n'.join(
                    page.extract_text() or '' for page in pdf.pages
                )
            if _est_mecef(texte):
                data = _parser_mecef(texte)
                methode = 'mecef'
        except Exception:
            data = None

    # ── Fallback Gemini ──────────────────────────────────────
    if data is None:
        data = _analyser_avec_gemini(fichier_bytes, mime_type, societe_id)
        methode = 'gemini'

    # ── Lignes comptables ────────────────────────────────────
    lignes = _construire_lignes(data, societe_id)

    total_debit = round(sum(l['montant'] for l in lignes if l['sens'] == 'debit'), 2)
    total_credit = round(sum(l['montant'] for l in lignes if l['sens'] == 'credit'), 2)

    return {
        'extraction': {
            'date': data.get('date'),
            'numero_facture': data.get('numero_facture'),
            'fournisseur': data.get('fournisseur'),
            'description': data.get('description'),
            'montant_ht': data.get('montant_ht', 0),
            'taux_tva': data.get('taux_tva', 0),
            'montant_tva': data.get('montant_tva', 0),
            'montant_ttc': data.get('montant_ttc', 0),
            'deja_paye': data.get('deja_paye', False),
            'mode_paiement': data.get('mode_paiement'),
        },
        'lignes_proposees': lignes,
        'equilibre': abs(total_debit - total_credit) < 0.10,
        'total_debit': total_debit,
        'total_credit': total_credit,
        'methode': methode,
    }
