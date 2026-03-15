from decimal import Decimal
from django.db.models import Sum
from apps.comptabilite.models import LigneEcriture


class TFTGenerator:
    """
    Tableau de Flux de Trésorerie - méthode indirecte (SYSCOHADA).

    A  Flux liés aux activités opérationnelles
    B  Flux liés aux activités d'investissement
    C  Flux liés aux activités de financement
    ΔT = A + B + C  =  Trésorerie fin − Trésorerie début
    """

    @staticmethod
    def generer(societe, exercice):

        def debit(prefixes):
            total = Decimal('0')
            for p in prefixes:
                qs = LigneEcriture.objects.filter(
                    compte__societe=societe,
                    compte__numero__startswith=p,
                    piece__exercice=exercice,
                    piece__statut='valide',
                )
                total += qs.aggregate(s=Sum('debit'))['s'] or Decimal('0')
            return total

        def credit(prefixes):
            total = Decimal('0')
            for p in prefixes:
                qs = LigneEcriture.objects.filter(
                    compte__societe=societe,
                    compte__numero__startswith=p,
                    piece__exercice=exercice,
                    piece__statut='valide',
                )
                total += qs.aggregate(s=Sum('credit'))['s'] or Decimal('0')
            return total

        def solde(prefixes):
            """débit − crédit"""
            return debit(prefixes) - credit(prefixes)

        # ── Résultat net (depuis le CR) ────────────────────────────────────
        from .compte_resultat import CompteResultatGenerator
        cr = CompteResultatGenerator.generer(societe, exercice)
        resultat_net = Decimal(cr['marges']['resultat_net'])

        # ── Ajustements pour charges/produits non décaissables ─────────────
        # Dotations aux amortissements (681x : charge, non décaissée → +)
        dotations_amort = debit(['681', '682', '683', '684', '685', '686', '687', '688'])
        # Reprises sur amortissements (781x : produit, non encaissé → −)
        reprises_amort = credit(['781', '782', '783', '784', '785', '786', '787', '788'])
        # Dotations aux provisions (691x, 6941, 695-698 → +)
        dotations_prov = debit(['691', '692', '693', '694', '695', '697', '698'])
        # Reprises sur provisions (791x → −)
        reprises_prov = credit(['791', '792', '793', '794', '795', '797', '798'])
        # Valeur comptable des éléments cédés (HAO 811x → +)
        vcee = debit(['811', '812', '813', '814', '815'])
        # Produits de cession (HAO 821x → −)
        produits_cessions = credit(['821', '822', '823', '824', '825'])

        ajustements = (dotations_amort - reprises_amort
                       + dotations_prov - reprises_prov
                       + vcee - produits_cessions)

        # ── Variation du Besoin en Fonds de Roulement ─────────────────────
        # Pour un actif : augmentation (débit > crédit) = emploi de trésorerie (−)
        # Pour un passif : augmentation (crédit > débit) = ressource de trésorerie (+)

        # Stocks (3x) : solde = débit − crédit ; augmentation → négative
        var_stocks = -solde(['3'])

        # Créances clients (41x hors 419)
        var_clients = -solde(['411', '412', '413', '414', '416', '417', '418'])

        # Avances et acomptes versés fournisseurs (409)
        var_avances_fourn = -solde(['409'])

        # Autres créances (42x à 48x, partie débitrice uniquement)
        var_autres_creances = -solde(['42', '43', '44', '45', '46', '47', '48'])

        # Dettes fournisseurs (40x hors 409) : augmentation (crédit > débit) → +
        var_fournisseurs = -solde(['401', '402', '403', '404', '405', '406', '407', '408'])

        # Avances clients reçues (419)
        var_avances_clients = -solde(['419'])

        variation_bfr = (var_stocks + var_clients + var_avances_fourn
                         + var_autres_creances + var_fournisseurs + var_avances_clients)

        flux_operations = resultat_net + ajustements + variation_bfr

        # ── B — Flux d'investissement ───────────────────────────────────────
        # Acquisitions = débits sur immobilisations brutes (2x hors 28x/29x)
        acquisitions = debit(['20', '21', '22', '23', '24', '25', '26', '27'])
        # Sorties = crédits sur immobilisations brutes (cessions, mises au rebut)
        sorties_immo = credit(['20', '21', '22', '23', '24', '25', '26', '27'])
        # Encaissements sur cessions (déjà inclus dans produits_cessions HAO ci-dessus)

        flux_investissement = -acquisitions + sorties_immo

        # ── C — Flux de financement ─────────────────────────────────────────
        # Augmentations de capital (crédits sur 10x, 11x : apports nouveaux)
        augm_capital = credit(['101', '102', '103', '104', '105']) - debit(['101', '102', '103', '104', '105'])
        # Emprunts obtenus (crédits sur 16x)
        emprunts_obtenus = credit(['161', '162', '163', '164', '165', '166', '167', '168'])
        # Remboursements d'emprunts (débits sur 16x)
        rembt_emprunts = debit(['161', '162', '163', '164', '165', '166', '167', '168'])
        # Dividendes versés (débits sur 131, 139, 465 = dividendes à payer)
        dividendes = debit(['131', '139', '465'])

        flux_financement = augm_capital + emprunts_obtenus - rembt_emprunts - dividendes

        # ── Variation et niveaux de trésorerie ─────────────────────────────
        variation_tresorerie = flux_operations + flux_investissement + flux_financement

        # Trésorerie d'ouverture = solde des comptes 5x dans le journal A-NOUVEAU
        qs_an = LigneEcriture.objects.filter(
            compte__societe=societe,
            compte__numero__startswith='5',
            piece__exercice=exercice,
            piece__journal__type_journal='an',
            piece__statut='valide',
        )
        td = qs_an.aggregate(s=Sum('debit'))['s'] or Decimal('0')
        tc = qs_an.aggregate(s=Sum('credit'))['s'] or Decimal('0')
        tresorerie_debut = td - tc

        # Trésorerie de clôture = solde total des comptes 5x sur tout l'exercice
        qs_5 = LigneEcriture.objects.filter(
            compte__societe=societe,
            compte__numero__startswith='5',
            piece__exercice=exercice,
            piece__statut='valide',
        )
        t5d = qs_5.aggregate(s=Sum('debit'))['s'] or Decimal('0')
        t5c = qs_5.aggregate(s=Sum('credit'))['s'] or Decimal('0')
        tresorerie_fin = t5d - t5c

        return {
            'societe': societe.nom,
            'exercice': exercice.code,
            'activites_operationnelles': {
                'resultat_net':               str(resultat_net),
                'dotations_amortissements':   str(dotations_amort),
                'reprises_amortissements':    str(-reprises_amort),
                'dotations_provisions':       str(dotations_prov),
                'reprises_provisions':        str(-reprises_prov),
                'vcee':                       str(vcee),
                'produits_cessions':          str(-produits_cessions),
                'ajustements':                str(ajustements),
                'variation_stocks':           str(var_stocks),
                'variation_clients':          str(var_clients),
                'variation_fournisseurs':     str(var_fournisseurs),
                'variation_autres':           str(var_avances_fourn + var_avances_clients + var_autres_creances),
                'variation_bfr':              str(variation_bfr),
                'total':                      str(flux_operations),
            },
            'activites_investissement': {
                'acquisitions':               str(-acquisitions),
                'cessions':                   str(sorties_immo),
                'total':                      str(flux_investissement),
            },
            'activites_financement': {
                'augmentation_capital':       str(augm_capital),
                'emprunts_obtenus':           str(emprunts_obtenus),
                'remboursements_emprunts':    str(-rembt_emprunts),
                'dividendes':                 str(-dividendes),
                'total':                      str(flux_financement),
            },
            'variation_tresorerie': str(variation_tresorerie),
            'tresorerie_debut':     str(tresorerie_debut),
            'tresorerie_fin':       str(tresorerie_fin),
            'controle':             str(tresorerie_fin - tresorerie_debut),
        }
