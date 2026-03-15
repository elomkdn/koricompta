from decimal import Decimal
from django.db.models import Sum
from apps.comptabilite.models import LigneEcriture, Compte, Immobilisation


class NotesAnnexesGenerator:
    """
    Notes annexes obligatoires SYSCOHADA :
      1. Tableau des immobilisations (mouvements valeurs brutes)
      2. Tableau des amortissements
      3. Tableau des provisions
      4. Tableau des créances et dettes (par échéance)
    """

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _mouvement(societe, exercice, prefixes, sens='debit', exclude_an=False):
        total = Decimal('0')
        for p in prefixes:
            qs = LigneEcriture.objects.filter(
                compte__societe=societe,
                compte__numero__startswith=p,
                piece__exercice=exercice,
                piece__statut='valide',
            )
            if exclude_an:
                qs = qs.exclude(piece__journal__type_journal='an')
            if sens == 'debit':
                total += qs.aggregate(s=Sum('debit'))['s'] or Decimal('0')
            else:
                total += qs.aggregate(s=Sum('credit'))['s'] or Decimal('0')
        return total

    @staticmethod
    def _solde_ouverture(societe, exercice, prefixes, sens_ouverture='debit'):
        """Solde à l'ouverture = pièces du journal A-NOUVEAU."""
        total = Decimal('0')
        for p in prefixes:
            qs = LigneEcriture.objects.filter(
                compte__societe=societe,
                compte__numero__startswith=p,
                piece__exercice=exercice,
                piece__journal__type_journal='an',
                piece__statut='valide',
            )
            d = qs.aggregate(s=Sum('debit'))['s'] or Decimal('0')
            c = qs.aggregate(s=Sum('credit'))['s'] or Decimal('0')
            if sens_ouverture == 'debit':
                total += d - c
            else:
                total += c - d
        return max(total, Decimal('0'))

    # ── 1. Tableau des immobilisations ───────────────────────────────────

    CATEGORIES_IMMO = [
        ('Immobilisations incorporelles',    ['20', '21']),
        ('Terrains',                         ['22']),
        ('Bâtiments et aménagements',        ['23']),
        ('Matériel et mobilier',             ['24']),
        ('Matériel de transport',            ['245', '246', '247', '248']),
        ('Matériel informatique',            ['2441', '2442']),
        ('Avances et acomptes sur immo.',    ['25']),
        ('Titres de participation',          ['26']),
        ('Autres immobilisations financières', ['27']),
    ]

    @classmethod
    def _tableau_immobilisations(cls, societe, exercice):
        lignes = []
        tot_debut = tot_acq = tot_cess = tot_fin = Decimal('0')

        for intitule, prefixes in cls.CATEGORIES_IMMO:
            debut  = cls._solde_ouverture(societe, exercice, prefixes, 'debit')
            acqui  = cls._mouvement(societe, exercice, prefixes, 'debit', exclude_an=True)
            cess   = cls._mouvement(societe, exercice, prefixes, 'credit', exclude_an=True)
            fin    = debut + acqui - cess

            if debut != 0 or acqui != 0 or cess != 0:
                lignes.append({
                    'intitule':     intitule,
                    'debut':        str(debut),
                    'acquisitions': str(acqui),
                    'cessions':     str(cess),
                    'fin':          str(fin),
                })
                tot_debut += debut
                tot_acq   += acqui
                tot_cess  += cess
                tot_fin   += fin

        return {
            'lignes': lignes,
            'total': {
                'debut': str(tot_debut), 'acquisitions': str(tot_acq),
                'cessions': str(tot_cess), 'fin': str(tot_fin),
            },
        }

    # ── 2. Tableau des amortissements ────────────────────────────────────

    CATEGORIES_AMORT = [
        ('Amort. immo. incorporelles',       ['280', '281']),
        ('Amort. bâtiments et aménagements', ['283']),
        ('Amort. matériel et mobilier',      ['284']),
        ('Amort. matériel de transport',     ['2845', '2846', '2847', '2848']),
        ('Amort. matériel informatique',     ['28441', '28442']),
        ('Amort. autres immobilisations',    ['285', '286', '287', '288']),
    ]

    @classmethod
    def _tableau_amortissements(cls, societe, exercice):
        lignes = []
        tot_debut = tot_dot = tot_rep = tot_fin = Decimal('0')

        for intitule, prefixes in cls.CATEGORIES_AMORT:
            # Comptes 28x sont créditeurs : sens_ouverture='credit'
            debut  = cls._solde_ouverture(societe, exercice, prefixes, 'credit')
            dotations = cls._mouvement(societe, exercice, prefixes, 'credit', exclude_an=True)
            reprises  = cls._mouvement(societe, exercice, prefixes, 'debit',  exclude_an=True)
            fin    = debut + dotations - reprises

            if debut != 0 or dotations != 0 or reprises != 0:
                lignes.append({
                    'intitule':  intitule,
                    'debut':     str(debut),
                    'dotations': str(dotations),
                    'reprises':  str(reprises),
                    'fin':       str(fin),
                })
                tot_debut += debut
                tot_dot   += dotations
                tot_rep   += reprises
                tot_fin   += fin

        return {
            'lignes': lignes,
            'total': {
                'debut': str(tot_debut), 'dotations': str(tot_dot),
                'reprises': str(tot_rep), 'fin': str(tot_fin),
            },
        }

    # ── 3. Tableau des provisions ────────────────────────────────────────

    CATEGORIES_PROV = [
        ('Provisions pour risques et charges', ['19']),
        ('Dépréciations des stocks',           ['39']),
        ('Dépréciations des créances clients', ['491', '492', '495']),
        ('Dépréciations autres créances',      ['496', '497', '498']),
        ('Dépréciations immobilisations',      ['29']),
        ('Dépréciations titres et placements', ['59']),
    ]

    @classmethod
    def _tableau_provisions(cls, societe, exercice):
        lignes = []
        tot_debut = tot_dot = tot_rep = tot_fin = Decimal('0')

        for intitule, prefixes in cls.CATEGORIES_PROV:
            debut     = cls._solde_ouverture(societe, exercice, prefixes, 'credit')
            dotations = cls._mouvement(societe, exercice, prefixes, 'credit', exclude_an=True)
            reprises  = cls._mouvement(societe, exercice, prefixes, 'debit',  exclude_an=True)
            fin       = debut + dotations - reprises

            if debut != 0 or dotations != 0 or reprises != 0:
                lignes.append({
                    'intitule':  intitule,
                    'debut':     str(debut),
                    'dotations': str(dotations),
                    'reprises':  str(reprises),
                    'fin':       str(fin),
                })
                tot_debut += debut
                tot_dot   += dotations
                tot_rep   += reprises
                tot_fin   += fin

        return {
            'lignes': lignes,
            'total': {
                'debut': str(tot_debut), 'dotations': str(tot_dot),
                'reprises': str(tot_rep), 'fin': str(tot_fin),
            },
        }

    # ── 4. Tableau des créances et dettes ────────────────────────────────

    CREANCES = [
        ('Clients et comptes rattachés',    ['411', '412', '413', '414', '416', '417', '418']),
        ('Avances versées fournisseurs',    ['409']),
        ('Personnel – avances et acomptes', ['421', '423', '424', '425', '426']),
        ('État et collectivités',           ['441', '442', '443', '444', '445', '446', '447', '448']),
        ('Débiteurs divers',                ['461', '462', '466', '467', '468']),
        ('Charges constatées d\'avance',    ['476']),
    ]

    DETTES = [
        ('Fournisseurs et comptes rattachés', ['401', '402', '403', '404', '405', '406', '407', '408']),
        ('Avances reçues des clients',        ['419']),
        ('Personnel – rémunérations dues',    ['422', '427', '428']),
        ('Organismes sociaux',                ['43']),
        ('État – impôts et taxes dus',        ['441', '442', '444', '447', '448']),
        ('Emprunts et dettes financières',    ['16', '17', '18']),
        ('Créditeurs divers',                 ['461', '462', '466', '467', '468']),
        ('Produits constatés d\'avance',      ['477']),
    ]

    @classmethod
    def _tableau_creances_dettes(cls, societe, exercice):
        from datetime import date as date_type
        from apps.comptabilite.models import Compte

        today = date_type.today()

        def solde_compte(compte):
            qs = LigneEcriture.objects.filter(
                compte=compte,
                piece__exercice=exercice,
                piece__statut='valide',
            )
            d = qs.aggregate(s=Sum('debit'))['s'] or Decimal('0')
            c = qs.aggregate(s=Sum('credit'))['s'] or Decimal('0')
            return d - c

        def repartition_echeance(compte):
            """Répartit le solde en < 1 an / > 1 an selon les pièces non lettrées."""
            qs = LigneEcriture.objects.filter(
                compte=compte,
                piece__exercice=exercice,
                piece__statut='valide',
                lettrage_code='',
            ).select_related('piece')
            inf_1an = Decimal('0')
            sup_1an = Decimal('0')
            for l in qs:
                s = l.debit - l.credit
                jours = (today - l.piece.date_piece).days
                if jours <= 365:
                    inf_1an += s
                else:
                    sup_1an += s
            return inf_1an, sup_1an

        def build_section(categories, sens='debit'):
            lignes = []
            tot_total = tot_inf = tot_sup = Decimal('0')
            for intitule, prefixes in categories:
                comptes = Compte.objects.filter(societe=societe).filter(
                    **{'numero__startswith': p} if len(prefixes) == 1
                    else {}
                )
                # rebuild filter properly
                from django.db.models import Q
                q = Q()
                for p in prefixes:
                    q |= Q(numero__startswith=p)
                comptes = Compte.objects.filter(societe=societe).filter(q)

                total_cat = Decimal('0')
                inf_cat   = Decimal('0')
                sup_cat   = Decimal('0')

                for compte in comptes:
                    s = solde_compte(compte)
                    if sens == 'debit' and s > 0:
                        inf, sup = repartition_echeance(compte)
                        # Ajuster aux montants positifs
                        if inf + sup == 0:
                            inf = s
                        total_cat += s
                        inf_cat   += max(inf, Decimal('0'))
                        sup_cat   += max(sup, Decimal('0'))
                    elif sens == 'credit' and s < 0:
                        s_abs = -s
                        inf, sup = repartition_echeance(compte)
                        inf_abs = max(-inf, Decimal('0'))
                        sup_abs = max(-sup, Decimal('0'))
                        if inf_abs + sup_abs == 0:
                            inf_abs = s_abs
                        total_cat += s_abs
                        inf_cat   += inf_abs
                        sup_cat   += sup_abs

                if total_cat != 0:
                    lignes.append({
                        'intitule':  intitule,
                        'total':     str(total_cat),
                        'inf_1an':   str(inf_cat),
                        'sup_1an':   str(sup_cat),
                    })
                    tot_total += total_cat
                    tot_inf   += inf_cat
                    tot_sup   += sup_cat

            return {
                'lignes': lignes,
                'total': {
                    'total': str(tot_total),
                    'inf_1an': str(tot_inf),
                    'sup_1an': str(tot_sup),
                },
            }

        return {
            'creances': build_section(cls.CREANCES, 'debit'),
            'dettes':   build_section(cls.DETTES,   'credit'),
        }

    # ── Point d'entrée ───────────────────────────────────────────────────

    @classmethod
    def generer(cls, societe, exercice):
        return {
            'societe':                  societe.nom,
            'exercice':                 exercice.code,
            'immobilisations':          cls._tableau_immobilisations(societe, exercice),
            'amortissements':           cls._tableau_amortissements(societe, exercice),
            'provisions':               cls._tableau_provisions(societe, exercice),
            'creances_dettes':          cls._tableau_creances_dettes(societe, exercice),
        }
