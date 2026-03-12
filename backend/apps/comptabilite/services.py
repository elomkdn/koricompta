from decimal import Decimal
from datetime import date, timedelta
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum


class EcritureService:

    @staticmethod
    @transaction.atomic
    def creer_piece(exercice, journal, date_piece, libelle, reference='', lignes_data=None):
        from .models import PieceComptable, LigneEcriture

        if lignes_data is None or len(lignes_data) < 2:
            raise ValidationError("Il faut au moins 2 lignes d'écriture.")

        if exercice.statut == 'cloture':
            raise ValidationError("Impossible de créer une écriture sur un exercice clôturé.")

        if not (exercice.date_debut <= date_piece <= exercice.date_fin):
            raise ValidationError(
                f"La date doit être comprise entre {exercice.date_debut} et {exercice.date_fin}."
            )

        # Vérifier que tous les comptes appartiennent à la même société
        societe_id = exercice.societe_id
        for l in lignes_data:
            if hasattr(l['compte'], 'societe_id') and l['compte'].societe_id != societe_id:
                raise ValidationError(
                    f"Le compte {l['compte'].numero} n'appartient pas à cette société."
                )

        total_debit = sum(Decimal(str(l.get('debit', 0))) for l in lignes_data)
        total_credit = sum(Decimal(str(l.get('credit', 0))) for l in lignes_data)
        if total_debit != total_credit:
            raise ValidationError(
                f"La pièce n'est pas équilibrée (débit: {total_debit}, crédit: {total_credit})."
            )

        # Numérotation automatique
        last = PieceComptable.objects.filter(
            exercice=exercice, journal=journal
        ).order_by('-numero_piece').first()

        if last:
            try:
                last_num = int(last.numero_piece)
            except (ValueError, TypeError):
                last_num = 0
        else:
            last_num = 0

        numero_piece = str(last_num + 1).zfill(6)

        piece = PieceComptable.objects.create(
            exercice=exercice,
            journal=journal,
            numero_piece=numero_piece,
            date_piece=date_piece,
            libelle=libelle,
            reference=reference,
            total_debit=total_debit,
            total_credit=total_credit,
        )

        for i, ligne_data in enumerate(lignes_data):
            LigneEcriture.objects.create(
                piece=piece,
                compte=ligne_data['compte'],
                libelle=ligne_data.get('libelle', libelle),
                debit=Decimal(str(ligne_data.get('debit', 0))),
                credit=Decimal(str(ligne_data.get('credit', 0))),
                tiers=ligne_data.get('tiers'),
                ordre=i,
            )

        return piece

    @staticmethod
    @transaction.atomic
    def valider_piece(piece):
        if piece.statut == 'valide':
            raise ValidationError("Cette pièce est déjà validée.")
        if not piece.est_equilibree:
            raise ValidationError("Impossible de valider une pièce déséquilibrée.")
        piece.statut = 'valide'
        piece.save(update_fields=['statut'])
        return piece

    @staticmethod
    @transaction.atomic
    def supprimer_piece(piece, force=False):
        if piece.statut == 'valide' and not force:
            raise ValidationError(
                "Impossible de supprimer une pièce validée. "
                "Utilisez force=True pour forcer la suppression."
            )
        piece.delete()

    @staticmethod
    @transaction.atomic
    def modifier_piece_brouillard(piece, date_piece=None, libelle=None, reference=None, lignes_data=None):
        from .models import LigneEcriture

        if piece.statut == 'valide':
            raise ValidationError("Impossible de modifier une pièce validée.")

        if date_piece:
            if not (piece.exercice.date_debut <= date_piece <= piece.exercice.date_fin):
                raise ValidationError("La date doit être dans la période de l'exercice.")
            piece.date_piece = date_piece
        if libelle:
            piece.libelle = libelle
        if reference is not None:
            piece.reference = reference

        if lignes_data is not None:
            if len(lignes_data) < 2:
                raise ValidationError("Il faut au moins 2 lignes d'écriture.")

            total_debit = sum(Decimal(str(l.get('debit', 0))) for l in lignes_data)
            total_credit = sum(Decimal(str(l.get('credit', 0))) for l in lignes_data)
            if total_debit != total_credit:
                raise ValidationError("La pièce n'est pas équilibrée.")

            piece.lignes.all().delete()
            for i, ligne_data in enumerate(lignes_data):
                LigneEcriture.objects.create(
                    piece=piece,
                    compte=ligne_data['compte'],
                    libelle=ligne_data.get('libelle', piece.libelle),
                    debit=Decimal(str(ligne_data.get('debit', 0))),
                    credit=Decimal(str(ligne_data.get('credit', 0))),
                    tiers=ligne_data.get('tiers'),
                    ordre=i,
                )
            piece.total_debit = total_debit
            piece.total_credit = total_credit

        piece.save()
        return piece


class LettrageService:

    @staticmethod
    @transaction.atomic
    def lettrer(lignes):
        from .models import LigneEcriture

        if len(lignes) < 2:
            raise ValidationError("Le lettrage nécessite au moins 2 lignes.")

        comptes = set(l.compte_id for l in lignes)
        if len(comptes) > 1:
            raise ValidationError("Toutes les lignes doivent appartenir au même compte.")

        total_debit = sum(l.debit for l in lignes)
        total_credit = sum(l.credit for l in lignes)
        if total_debit != total_credit:
            raise ValidationError(
                f"Les lignes ne sont pas équilibrées (D:{total_debit} C:{total_credit})."
            )

        # Générer le prochain code de lettrage
        compte = lignes[0].compte
        dernier = LigneEcriture.objects.filter(
            compte=compte
        ).exclude(lettrage_code='').order_by('-lettrage_code').first()

        if dernier and dernier.lettrage_code:
            code = LettrageService._incrementer_code(dernier.lettrage_code)
        else:
            code = 'AA'

        for ligne in lignes:
            ligne.lettrage_code = code
            ligne.save(update_fields=['lettrage_code'])

        return code

    @staticmethod
    @transaction.atomic
    def delettrer(lignes):
        for ligne in lignes:
            ligne.lettrage_code = ''
            ligne.save(update_fields=['lettrage_code'])

    @staticmethod
    def _incrementer_code(code):
        """Incrémente un code de lettrage alphabétique (AA -> AB -> ... -> AZ -> BA -> ...)"""
        code = code.upper()
        if len(code) != 2:
            return 'AA'
        c1, c2 = code[0], code[1]
        if c2 < 'Z':
            return c1 + chr(ord(c2) + 1)
        elif c1 < 'Z':
            return chr(ord(c1) + 1) + 'A'
        else:
            return 'AA'


class ClotureService:

    @staticmethod
    @transaction.atomic
    def cloturer_exercice(exercice):
        from .models import ExerciceComptable, JournalComptable, PieceComptable, LigneEcriture, Compte
        from django.db.models import Sum

        if exercice.statut == 'cloture':
            raise ValidationError("Cet exercice est déjà clôturé.")

        brouillards = PieceComptable.objects.filter(
            exercice=exercice, statut='brouillard'
        ).count()
        if brouillards > 0:
            raise ValidationError(
                f"Impossible de clôturer : {brouillards} pièce(s) en brouillard."
            )

        # Calculer les soldes par compte
        comptes_bilan = []  # Classes 1-5
        resultat_net = Decimal('0')  # Charges (6,8) - Produits (7)

        for compte in Compte.objects.filter(societe=exercice.societe, type_compte='detail'):
            totaux = LigneEcriture.objects.filter(
                piece__exercice=exercice,
                piece__statut='valide',
                compte=compte,
            ).aggregate(total_debit=Sum('debit'), total_credit=Sum('credit'))
            debit = totaux['total_debit'] or Decimal('0')
            credit = totaux['total_credit'] or Decimal('0')
            solde = debit - credit
            if solde == Decimal('0'):
                continue

            classe_num = int(compte.numero[0]) if compte.numero else 0
            if classe_num in (6, 7, 8):
                # P&L: accumulate into résultat
                resultat_net += solde
            elif 1 <= classe_num <= 5:
                comptes_bilan.append((compte, solde))

        # Clôturer
        exercice.statut = 'cloture'
        exercice.save(update_fields=['statut'])

        # Nouvel exercice
        if exercice.code.isdigit():
            new_code = str(int(exercice.code) + 1)
            new_libelle = f'Exercice {new_code}'
        else:
            new_code = f'{exercice.code}_N'
            new_libelle = 'Exercice suivant'

        nouvel_exercice = ExerciceComptable.objects.create(
            societe=exercice.societe,
            code=new_code,
            libelle=new_libelle,
            date_debut=exercice.date_fin + timedelta(days=1),
            date_fin=date(exercice.date_fin.year + 1, 12, 31),
        )

        # Journal À Nouveau
        journal_an, _ = JournalComptable.objects.get_or_create(
            societe=exercice.societe, code='AN',
            defaults={'intitule': 'À Nouveau', 'type_journal': 'an'},
        )

        # Construire les lignes AN (classes 1-5 seulement)
        piece_report = None
        lignes_data = []

        for compte, solde in comptes_bilan:
            if solde > 0:
                lignes_data.append({
                    'compte': compte, 'debit': solde, 'credit': Decimal('0'),
                    'libelle': f'À nouveau {compte.numero}',
                })
            else:
                lignes_data.append({
                    'compte': compte, 'debit': Decimal('0'), 'credit': abs(solde),
                    'libelle': f'À nouveau {compte.numero}',
                })

        # Affecter le résultat au compte 130
        if resultat_net != Decimal('0'):
            compte_resultat = Compte.objects.filter(
                societe=exercice.societe, numero='130'
            ).first()
            if compte_resultat:
                if resultat_net > 0:
                    lignes_data.append({
                        'compte': compte_resultat, 'debit': resultat_net, 'credit': Decimal('0'),
                        'libelle': 'Résultat net (perte)',
                    })
                else:
                    lignes_data.append({
                        'compte': compte_resultat, 'debit': Decimal('0'), 'credit': abs(resultat_net),
                        'libelle': 'Résultat net (bénéfice)',
                    })

        if lignes_data:
            piece_report = EcritureService.creer_piece(
                exercice=nouvel_exercice,
                journal=journal_an,
                date_piece=nouvel_exercice.date_debut,
                libelle='Report à nouveau',
                lignes_data=lignes_data,
            )
            EcritureService.valider_piece(piece_report)

        return nouvel_exercice, piece_report


class ProvisionService:

    @staticmethod
    @transaction.atomic
    def provisionner_plan_ohada(societe):
        """Crée le plan comptable OHADA de base pour une société."""
        from .models import ClasseCompte, Compte, JournalComptable

        classes_data = [
            (1, 'Ressources durables'),
            (2, 'Actif immobilisé'),
            (3, 'Actif circulant (hors trésorerie)'),
            (4, 'Passif circulant (hors trésorerie)'),
            (5, 'Trésorerie'),
            (6, 'Charges des activités ordinaires'),
            (7, 'Produits des activités ordinaires'),
            (8, 'Autres charges et autres produits'),
            (9, 'Comptes des engagements hors bilan et comptes analytiques'),
        ]

        for numero, intitule in classes_data:
            ClasseCompte.objects.get_or_create(
                societe=societe, numero=numero,
                defaults={'intitule': intitule},
            )

        comptes_data = [
            ('101', 1, 'Capital social', 'credit', 'detail', False, False),
            ('106', 1, 'Réserves', 'credit', 'detail', False, False),
            ('130', 1, 'Résultat net de l\'exercice', 'credit', 'detail', False, False),
            ('164', 1, 'Emprunts', 'credit', 'detail', False, False),
            ('211', 2, 'Terrains', 'debit', 'detail', False, False),
            ('221', 2, 'Bâtiments', 'debit', 'detail', False, False),
            ('231', 2, 'Matériel et outillage industriel', 'debit', 'detail', False, False),
            ('241', 2, 'Matériel et mobilier', 'debit', 'detail', False, False),
            ('281', 2, 'Amortissements des immobilisations corporelles', 'credit', 'detail', False, False),
            ('311', 3, 'Marchandises', 'debit', 'detail', False, False),
            ('411', 4, 'Clients', 'debit', 'detail', True, True),
            ('401', 4, 'Fournisseurs', 'credit', 'detail', True, True),
            ('421', 4, 'Personnel - Rémunérations dues', 'credit', 'detail', True, False),
            ('431', 4, 'Organismes sociaux', 'credit', 'detail', False, False),
            ('441', 4, 'État, impôts et taxes', 'credit', 'detail', False, False),
            ('443', 4, 'État, TVA facturée', 'credit', 'detail', False, False),
            ('445', 4, 'État, TVA récupérable', 'debit', 'detail', False, False),
            ('521', 5, 'Banque', 'debit', 'detail', True, False),
            ('571', 5, 'Caisse', 'debit', 'detail', False, False),
            ('601', 6, 'Achats de marchandises', 'debit', 'detail', False, False),
            ('602', 6, 'Achats de matières premières', 'debit', 'detail', False, False),
            ('624', 6, 'Transports', 'debit', 'detail', False, False),
            ('625', 6, 'Déplacements, missions et réceptions', 'debit', 'detail', False, False),
            ('631', 6, 'Frais bancaires', 'debit', 'detail', False, False),
            ('641', 6, 'Impôts et taxes', 'debit', 'detail', False, False),
            ('661', 6, 'Rémunérations du personnel', 'debit', 'detail', False, False),
            ('671', 6, 'Pertes sur créances', 'debit', 'detail', False, False),
            ('681', 6, 'Dotations aux amortissements', 'debit', 'detail', False, False),
            ('701', 7, 'Ventes de marchandises', 'credit', 'detail', False, False),
            ('702', 7, 'Ventes de produits finis', 'credit', 'detail', False, False),
            ('707', 7, 'Produits accessoires', 'credit', 'detail', False, False),
            ('771', 7, 'Gains sur créances', 'credit', 'detail', False, False),
        ]

        for numero, classe_num, intitule, nature, type_compte, lettrable, est_tiers in comptes_data:
            try:
                classe = ClasseCompte.objects.get(societe=societe, numero=classe_num)
                Compte.objects.get_or_create(
                    societe=societe, numero=numero,
                    defaults={
                        'classe': classe,
                        'intitule': intitule,
                        'nature': nature,
                        'type_compte': type_compte,
                        'lettrable': lettrable,
                        'est_tiers': est_tiers,
                    },
                )
            except ClasseCompte.DoesNotExist:
                pass

        journaux_data = [
            ('ACH', 'Achats', 'achat'),
            ('VTE', 'Ventes', 'vente'),
            ('BQ', 'Banque', 'banque'),
            ('CAI', 'Caisse', 'caisse'),
            ('OD', 'Opérations Diverses', 'od'),
            ('AN', 'À Nouveau', 'an'),
        ]

        compte_banque = Compte.objects.filter(societe=societe, numero='521').first()
        for code, intitule, type_j in journaux_data:
            defaults = {'intitule': intitule, 'type_journal': type_j}
            if type_j == 'banque' and compte_banque:
                defaults['compte_contrepartie'] = compte_banque
            JournalComptable.objects.get_or_create(
                societe=societe, code=code,
                defaults=defaults,
            )


class RapprochementService:

    @staticmethod
    @transaction.atomic
    def rapprocher_auto(releve):
        from .models import LigneReleve, LigneEcriture

        rapproches = 0
        for ligne_releve in releve.lignes.filter(statut='non_rapproche'):
            # Rechercher une écriture correspondante (même montant, même période approximative)
            montant = ligne_releve.montant
            compte_banque = releve.compte_banque

            if montant >= 0:
                # Crédit sur le relevé = débit en compta
                ecritures = LigneEcriture.objects.filter(
                    compte=compte_banque,
                    debit=montant,
                    piece__statut='valide',
                    lettrage_code='',
                ).exclude(lignes_releve__isnull=False)
            else:
                # Débit sur le relevé = crédit en compta
                ecritures = LigneEcriture.objects.filter(
                    compte=compte_banque,
                    credit=abs(montant),
                    piece__statut='valide',
                    lettrage_code='',
                ).exclude(lignes_releve__isnull=False)

            if ecritures.count() == 1:
                ecriture = ecritures.first()
                ligne_releve.statut = 'rapproche'
                ligne_releve.ligne_ecriture = ecriture
                ligne_releve.save(update_fields=['statut', 'ligne_ecriture'])
                rapproches += 1

        releve.mettre_a_jour_stats()
        return rapproches

    @staticmethod
    @transaction.atomic
    def rapprocher_manuel(ligne_releve, ligne_ecriture):
        ligne_releve.statut = 'rapproche'
        ligne_releve.ligne_ecriture = ligne_ecriture
        ligne_releve.save(update_fields=['statut', 'ligne_ecriture'])
        ligne_releve.releve.mettre_a_jour_stats()

    @staticmethod
    @transaction.atomic
    def derapprocher(ligne_releve):
        ligne_releve.statut = 'non_rapproche'
        ligne_releve.ligne_ecriture = None
        ligne_releve.save(update_fields=['statut', 'ligne_ecriture'])
        ligne_releve.releve.mettre_a_jour_stats()
