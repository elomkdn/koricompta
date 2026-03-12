from decimal import Decimal
from django.db.models import Sum
from apps.comptabilite.models import LigneEcriture


class BilanGenerator:

    @staticmethod
    def generer(societe, exercice):

        def get_solde_compte(prefix, exclude_prefixes=None):
            """Retourne débit - crédit pour un préfixe de compte."""
            qs = LigneEcriture.objects.filter(
                compte__societe=societe,
                compte__numero__startswith=prefix,
                piece__exercice=exercice,
                piece__statut='valide',
            )
            if exclude_prefixes:
                for ep in exclude_prefixes:
                    qs = qs.exclude(compte__numero__startswith=ep)
            d = qs.aggregate(s=Sum('debit'))['s'] or Decimal('0')
            c = qs.aggregate(s=Sum('credit'))['s'] or Decimal('0')
            return d - c

        def get_solde(prefixes, exclude_prefixes=None):
            return sum(
                (get_solde_compte(p, exclude_prefixes) for p in prefixes),
                Decimal('0')
            )

        def solde_actif(prefixes, exclude_prefixes=None):
            """Solde débiteur uniquement (actif)."""
            return max(get_solde(prefixes, exclude_prefixes), Decimal('0'))

        def solde_passif(prefixes, exclude_prefixes=None):
            """Solde créditeur uniquement (passif), retourné positif."""
            return max(-get_solde(prefixes, exclude_prefixes), Decimal('0'))

        # ── ACTIF ──────────────────────────────────────────────────────────

        immobilisations_brutes = get_solde(['2'], exclude_prefixes=['28', '29'])
        amortissements = get_solde(['28', '29'])  # négatif car comptes créditeurs
        actif_immobilise = immobilisations_brutes + amortissements  # net

        stocks = solde_actif(['3'])

        # 416 = clients douteux, 417 = factures à établir, 418 = produits non facturés
        creances_clients = solde_actif(['411', '412', '413', '414', '416', '417', '418'])

        # 409 = fournisseurs débiteurs (avances et acomptes versés) → actif
        avances_fournisseurs = solde_actif(['409'])

        # Comptes 42-48 : uniquement la part débitrice (à l'actif)
        autres_creances_actif = solde_actif(['42', '43', '44', '45', '46', '47', '48'])

        tresorerie_solde = get_solde(['5'])
        tresorerie_actif = max(tresorerie_solde, Decimal('0'))

        total_actif = (actif_immobilise + stocks + creances_clients
                       + avances_fournisseurs + autres_creances_actif + tresorerie_actif)

        # ── PASSIF ─────────────────────────────────────────────────────────

        from apps.rapports.generators.compte_resultat import CompteResultatGenerator
        cr = CompteResultatGenerator.generer(societe, exercice)
        resultat_net = Decimal(cr['marges']['resultat_net'])

        capitaux_propres = solde_passif(['10', '11', '12', '13', '14', '15']) + resultat_net

        # 19 = provisions pour risques et charges (ligne distincte des emprunts)
        provisions_risques = solde_passif(['19'])
        dettes_financieres = solde_passif(['16', '17', '18'])

        fournisseurs = solde_passif(['401', '402', '403', '404', '405', '408'])

        # 419 = clients créditeurs (avances reçues des clients) → passif
        avances_clients = solde_passif(['419'])

        # Comptes 42-48 : uniquement la part créditrice (au passif)
        dettes_fiscales_sociales = solde_passif(['42', '43', '44'])
        autres_dettes            = solde_passif(['45', '46', '47', '48'])

        tresorerie_passif = max(-tresorerie_solde, Decimal('0'))

        total_passif = (capitaux_propres + provisions_risques + dettes_financieres
                        + fournisseurs + avances_clients
                        + dettes_fiscales_sociales + autres_dettes + tresorerie_passif)

        return {
            'societe': societe.nom,
            'exercice': exercice.code,
            'actif': {
                'immobilise':         str(actif_immobilise),
                'stocks':             str(stocks),
                'creances_clients':   str(creances_clients),
                'avances_fournisseurs': str(avances_fournisseurs),
                'autres_creances':    str(autres_creances_actif),
                'tresorerie':         str(tresorerie_actif),
                'total':              str(total_actif),
            },
            'passif': {
                'capitaux_propres':        str(capitaux_propres),
                'provisions_risques':      str(provisions_risques),
                'dettes_financieres':      str(dettes_financieres),
                'fournisseurs':            str(fournisseurs),
                'avances_clients':         str(avances_clients),
                'dettes_fiscales_sociales': str(dettes_fiscales_sociales),
                'autres_dettes':           str(autres_dettes),
                'tresorerie':              str(tresorerie_passif),
                'total':                   str(total_passif),
            },
            'resultat_net': str(resultat_net),
        }
