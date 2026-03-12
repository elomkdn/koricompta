from decimal import Decimal
from django.db.models import Sum
from apps.comptabilite.models import LigneEcriture


class CompteResultatGenerator:

    @staticmethod
    def generer(societe, exercice):

        def get_montant(prefixes, sens='debit'):
            total = Decimal('0')
            for prefix in prefixes:
                lignes = LigneEcriture.objects.filter(
                    compte__societe=societe,
                    compte__numero__startswith=prefix,
                    piece__exercice=exercice,
                    piece__statut='valide',
                )
                if sens == 'debit':
                    total += lignes.aggregate(s=Sum('debit'))['s'] or Decimal('0')
                elif sens == 'credit':
                    total += lignes.aggregate(s=Sum('credit'))['s'] or Decimal('0')
                elif sens == 'net_debit':
                    # débit − crédit : positif si charge nette, négatif si réduction de charge
                    d = lignes.aggregate(s=Sum('debit'))['s'] or Decimal('0')
                    c = lignes.aggregate(s=Sum('credit'))['s'] or Decimal('0')
                    total += d - c
                elif sens == 'net_credit':
                    # crédit − débit : positif si produit net, négatif si diminution de produit
                    d = lignes.aggregate(s=Sum('debit'))['s'] or Decimal('0')
                    c = lignes.aggregate(s=Sum('credit'))['s'] or Decimal('0')
                    total += c - d
            return total

        # ── PRODUITS ───────────────────────────────────────────────────────
        ventes_marchandises    = get_montant(['701'], 'credit')
        ventes_produits        = get_montant(['702', '703', '704', '705', '706'], 'credit')
        # 709 = RRR accordés sur ventes accessoires → débiteur → soustrait
        produits_accessoires   = (get_montant(['707', '708'], 'credit')
                                  - get_montant(['709'], 'debit'))
        # Production stockée/immobilisée : net car peuvent être négatifs
        production_stockee     = get_montant(['73'], 'net_credit')
        production_immobilisee = get_montant(['72'], 'net_credit')
        subventions            = get_montant(['71'], 'credit')
        autres_produits        = get_montant(['75'], 'credit')
        reprises_provisions    = get_montant(['79'], 'credit')
        transferts_charges     = get_montant(['78'], 'credit')
        produits_financiers    = get_montant(['77'], 'credit')
        # 85 = Autres produits HAO (corrigé : était dans charges_hao par erreur)
        produits_hao           = get_montant(['84', '85', '86', '88'], 'credit')

        # ── CHARGES ────────────────────────────────────────────────────────
        achats_marchandises    = get_montant(['601'], 'debit')
        # Variation stocks : net_debit car crédit = réduction de charge (stock en hausse)
        variation_stocks_march = get_montant(['6031'], 'net_debit')
        # 606 = combustibles/lubrifiants, 607 = études et prestations
        achats_matieres        = get_montant(['602', '604', '605', '606', '607', '608'], 'debit')
        variation_stocks_mat   = get_montant(['6032', '6033'], 'net_debit')
        transports             = get_montant(['61'], 'debit')
        services_exterieurs    = get_montant(['62', '63'], 'debit')
        impots_taxes           = get_montant(['64'], 'debit')
        charges_personnel      = get_montant(['66'], 'debit')

        # 681 = dotations amortissements, 69 (inclut 691) = dotations provisions
        dotations_amortissements = get_montant(['681'], 'debit')
        dotations_provisions     = get_montant(['69'], 'debit')

        autres_charges      = get_montant(['65'], 'debit')
        charges_financieres = get_montant(['67'], 'debit')
        # 81 = VCEE, 82 = autres charges HAO (corrigé : 83/85/87 supprimés)
        charges_hao         = get_montant(['81', '82'], 'debit')
        # 89 couvre 891 + 892 : utiliser seulement ['89'] évite le double-comptage
        impots_benefice     = get_montant(['89'], 'debit')

        # ── MARGES SYSCOHADA ───────────────────────────────────────────────
        marge_brute_marchandises = ventes_marchandises - achats_marchandises - variation_stocks_march
        marge_brute_matieres     = ventes_produits - achats_matieres - variation_stocks_mat

        valeur_ajoutee = (
            marge_brute_marchandises + marge_brute_matieres
            + produits_accessoires + production_stockee + production_immobilisee
            + subventions - transports - services_exterieurs
        )
        ebe = valeur_ajoutee - impots_taxes - charges_personnel

        resultat_exploitation = (
            ebe + autres_produits + reprises_provisions + transferts_charges
            - dotations_amortissements - dotations_provisions - autres_charges
        )
        resultat_financier            = produits_financiers - charges_financieres
        resultat_activites_ordinaires = resultat_exploitation + resultat_financier
        resultat_hao                  = produits_hao - charges_hao
        resultat_net                  = resultat_activites_ordinaires + resultat_hao - impots_benefice

        total_produits = (
            ventes_marchandises + ventes_produits + produits_accessoires
            + production_stockee + production_immobilisee + subventions
            + autres_produits + reprises_provisions + transferts_charges
            + produits_financiers + produits_hao
        )
        total_charges = (
            achats_marchandises + variation_stocks_march
            + achats_matieres + variation_stocks_mat
            + transports + services_exterieurs + impots_taxes + charges_personnel
            + dotations_amortissements + dotations_provisions
            + autres_charges + charges_financieres + charges_hao + impots_benefice
        )

        return {
            'societe': societe.nom,
            'exercice': exercice.code,
            'marges': {
                'marge_brute_marchandises':      str(marge_brute_marchandises),
                'marge_brute_matieres':          str(marge_brute_matieres),
                'valeur_ajoutee':                str(valeur_ajoutee),
                'ebe':                           str(ebe),
                'resultat_exploitation':         str(resultat_exploitation),
                'resultat_financier':            str(resultat_financier),
                'resultat_activites_ordinaires': str(resultat_activites_ordinaires),
                'resultat_hao':                  str(resultat_hao),
                'resultat_net':                  str(resultat_net),
            },
            'produits': {
                'ventes_marchandises':  str(ventes_marchandises),
                'ventes_produits':      str(ventes_produits),
                'produits_accessoires': str(produits_accessoires),
                'autres_produits':      str(autres_produits),
                'produits_financiers':  str(produits_financiers),
                'produits_hao':         str(produits_hao),
                'total':                str(total_produits),
            },
            'charges': {
                'achats_marchandises':    str(achats_marchandises),
                'achats_matieres':        str(achats_matieres),
                'transports':             str(transports),
                'services_exterieurs':    str(services_exterieurs),
                'impots_taxes':           str(impots_taxes),
                'charges_personnel':      str(charges_personnel),
                'dotations':              str(dotations_amortissements + dotations_provisions),
                'autres_charges':         str(autres_charges),
                'charges_financieres':    str(charges_financieres),
                'charges_hao':            str(charges_hao),
                'impots_benefice':        str(impots_benefice),
                'total':                  str(total_charges),
            },
            'resultat': str(resultat_net),
        }
