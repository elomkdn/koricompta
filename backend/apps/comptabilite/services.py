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
            # (numero, classe_num, intitule, nature, type_compte, lettrable, est_tiers)
            # ═══════════════════════════════════════════════════════════════
            # CLASSE 1 - COMPTES DE RESSOURCES DURABLES
            # ═══════════════════════════════════════════════════════════════
            # 10 CAPITAL
            ('101', 1, 'Capital social', 'credit', 'detail', False, False),
            ('1011', 1, 'Capital souscrit, non appelé', 'credit', 'detail', False, False),
            ('1012', 1, 'Capital souscrit, appelé, non versé', 'credit', 'detail', False, False),
            ('1013', 1, 'Capital souscrit, appelé, versé', 'credit', 'detail', False, False),
            ('1014', 1, 'Capital en nature', 'credit', 'detail', False, False),
            ('1018', 1, 'Autres formes de capital', 'credit', 'detail', False, False),
            ('102', 1, 'Capital par dotation', 'credit', 'detail', False, False),
            ('1021', 1, 'Capital par dotation initial', 'credit', 'detail', False, False),
            ('1022', 1, 'Capital par dotation complémentaire', 'credit', 'detail', False, False),
            ('1028', 1, 'Autres capitaux par dotation', 'credit', 'detail', False, False),
            ('103', 1, 'Capital personnel', 'credit', 'detail', False, False),
            ('104', 1, 'Primes liées au capital social', 'credit', 'detail', False, False),
            ('1041', 1, "Primes d'émission", 'credit', 'detail', False, False),
            ('1042', 1, 'Primes de fusion', 'credit', 'detail', False, False),
            ('1043', 1, "Primes d'apport", 'credit', 'detail', False, False),
            ('1047', 1, 'Primes de conversion', 'credit', 'detail', False, False),
            ('1048', 1, 'Autres primes', 'credit', 'detail', False, False),
            ('105', 1, 'Écart de réévaluation', 'credit', 'detail', False, False),
            ('1051', 1, 'Écart de réévaluation légale', 'credit', 'detail', False, False),
            ('1052', 1, 'Écart de réévaluation libre', 'credit', 'detail', False, False),
            ('1053', 1, 'Écart de réévaluation sur terrains', 'credit', 'detail', False, False),
            ('1054', 1, 'Écart de réévaluation sur bâtiments', 'credit', 'detail', False, False),
            ('1058', 1, 'Autres écarts de réévaluation', 'credit', 'detail', False, False),
            ('106', 1, 'Réserves', 'credit', 'detail', False, False),
            ('1061', 1, 'Réserve légale', 'credit', 'detail', False, False),
            ('1062', 1, 'Réserve statutaire ou contractuelle', 'credit', 'detail', False, False),
            ('109', 1, 'Actionnaires, capital souscrit non appelé', 'debit', 'detail', False, False),
            # 11 RÉSERVES
            ('111', 1, 'Réserves indisponibles', 'credit', 'detail', False, False),
            ('112', 1, 'Réserves libres', 'credit', 'detail', False, False),
            ('113', 1, 'Réserves statutaires ou contractuelles', 'credit', 'detail', False, False),
            ('1131', 1, 'Réserves statutaires', 'credit', 'detail', False, False),
            ('1133', 1, 'Réserves contractuelles', 'credit', 'detail', False, False),
            ('1138', 1, 'Autres réserves statutaires ou contractuelles', 'credit', 'detail', False, False),
            ('118', 1, 'Autres réserves', 'credit', 'detail', False, False),
            ('1181', 1, 'Réserves facultatives', 'credit', 'detail', False, False),
            ('1188', 1, 'Réserves diverses', 'credit', 'detail', False, False),
            # 12 REPORT À NOUVEAU
            ('121', 1, 'Report à nouveau (solde créditeur)', 'credit', 'detail', False, False),
            ('129', 1, 'Report à nouveau (solde débiteur)', 'debit', 'detail', False, False),
            ('1291', 1, "Report à nouveau débiteur - résultat en instance d'affectation", 'debit', 'detail', False, False),
            ('1292', 1, 'Report à nouveau débiteur - autres reports', 'debit', 'detail', False, False),
            # 13 RÉSULTAT NET
            ('130', 1, "Résultat net de l'exercice", 'credit', 'detail', False, False),
            ('1301', 1, "Résultat net de l'exercice (bénéfice)", 'credit', 'detail', False, False),
            ('1309', 1, "Résultat net de l'exercice (perte)", 'debit', 'detail', False, False),
            ('131', 1, "Résultat net en instance d'affectation", 'credit', 'detail', False, False),
            ('132', 1, 'Résultat en instance de consolidation', 'credit', 'detail', False, False),
            ('1321', 1, 'Résultat en instance de consolidation (bénéfice)', 'credit', 'detail', False, False),
            ('1322', 1, 'Résultat en instance de consolidation (perte)', 'debit', 'detail', False, False),
            ('133', 1, 'Résultat net des entreprises intégrées globalement', 'credit', 'detail', False, False),
            ('134', 1, 'Résultat net des entreprises intégrées proportionnellement', 'credit', 'detail', False, False),
            ('135', 1, 'Résultat net des entreprises mises en équivalence', 'credit', 'detail', False, False),
            ('136', 1, 'Part du résultat revenant aux minoritaires', 'credit', 'detail', False, False),
            ('137', 1, 'Part du résultat revenant au groupe', 'credit', 'detail', False, False),
            ('138', 1, 'Autres résultats nets', 'credit', 'detail', False, False),
            ('139', 1, "Résultat net de l'exercice (perte)", 'debit', 'detail', False, False),
            # 14 SUBVENTIONS D'INVESTISSEMENT
            ('141', 1, "Subventions d'investissement reçues de l'État", 'credit', 'detail', False, False),
            ('1411', 1, "Subventions d'équipement de l'État", 'credit', 'detail', False, False),
            ('1412', 1, "Subventions d'équipement des collectivités publiques", 'credit', 'detail', False, False),
            ('1413', 1, "Subventions d'équipement des organismes internationaux", 'credit', 'detail', False, False),
            ('1414', 1, "Subventions d'équipement reçues de tiers", 'credit', 'detail', False, False),
            ('1415', 1, "Subventions pour études reçues de l'État", 'credit', 'detail', False, False),
            ('1416', 1, "Subventions pour études reçues de collectivités", 'credit', 'detail', False, False),
            ('1417', 1, "Subventions pour études reçues d'organismes internationaux", 'credit', 'detail', False, False),
            ('1418', 1, "Autres subventions d'investissement", 'credit', 'detail', False, False),
            ('142', 1, "Subventions d'investissement reçues d'autres organismes", 'credit', 'detail', False, False),
            ('148', 1, "Autres subventions d'investissement", 'credit', 'detail', False, False),
            # 15 PROVISIONS RÉGLEMENTÉES
            ('151', 1, 'Provisions pour investissement', 'credit', 'detail', False, False),
            ('152', 1, 'Provisions pour hausse des prix', 'credit', 'detail', False, False),
            ('153', 1, 'Amortissements dérogatoires', 'credit', 'detail', False, False),
            ('1531', 1, 'Amortissements dérogatoires sur immobilisations incorporelles', 'credit', 'detail', False, False),
            ('1532', 1, 'Amortissements dérogatoires sur immobilisations corporelles', 'credit', 'detail', False, False),
            ('154', 1, 'Provisions spéciales de réévaluation', 'credit', 'detail', False, False),
            ('155', 1, 'Plus-values de cession réinvesties', 'credit', 'detail', False, False),
            ('1551', 1, 'Plus-values de cession à court terme réinvesties', 'credit', 'detail', False, False),
            ('156', 1, 'Provisions pour reconstitution de gisements', 'credit', 'detail', False, False),
            ('1561', 1, 'Provisions pour reconstitution de gisements miniers', 'credit', 'detail', False, False),
            ('1562', 1, 'Provisions pour reconstitution de gisements pétroliers', 'credit', 'detail', False, False),
            ('157', 1, 'Provisions pour risques afférents à des opérations de crédit à moyen et long terme', 'credit', 'detail', False, False),
            ('158', 1, 'Autres provisions réglementées', 'credit', 'detail', False, False),
            # 16 EMPRUNTS
            ('161', 1, 'Emprunts obligataires', 'credit', 'detail', False, False),
            ('1611', 1, 'Emprunts obligataires convertibles', 'credit', 'detail', False, False),
            ('1612', 1, 'Autres emprunts obligataires', 'credit', 'detail', False, False),
            ('1618', 1, 'Intérêts courus sur emprunts obligataires', 'credit', 'detail', False, False),
            ('162', 1, 'Emprunts et dettes auprès des établissements de crédit', 'credit', 'detail', False, False),
            ('163', 1, "Emprunts et dettes financières divers auprès de l'État", 'credit', 'detail', False, False),
            ('164', 1, 'Emprunts et dettes financières divers', 'credit', 'detail', False, False),
            ('165', 1, 'Dépôts et cautionnements reçus', 'credit', 'detail', False, False),
            ('1651', 1, 'Dépôts reçus', 'credit', 'detail', False, False),
            ('1652', 1, 'Cautionnements reçus', 'credit', 'detail', False, False),
            ('166', 1, 'Intérêts courus sur emprunts et dettes', 'credit', 'detail', False, False),
            ('1661', 1, 'Intérêts courus sur emprunts obligataires', 'credit', 'detail', False, False),
            ('1662', 1, "Intérêts courus sur emprunts auprès d'établissements de crédit", 'credit', 'detail', False, False),
            ('1663', 1, "Intérêts courus sur emprunts auprès de l'État", 'credit', 'detail', False, False),
            ('1664', 1, 'Intérêts courus sur emprunts et dettes financières divers', 'credit', 'detail', False, False),
            ('1665', 1, 'Intérêts courus sur dépôts et cautionnements', 'credit', 'detail', False, False),
            ('1667', 1, 'Intérêts courus sur crédit-bail', 'credit', 'detail', False, False),
            ('1668', 1, "Intérêts courus sur dettes envers des entreprises liées", 'credit', 'detail', False, False),
            ('167', 1, 'Dettes sur contrats de location-acquisition', 'credit', 'detail', False, False),
            ('1671', 1, 'Dettes sur contrats de crédit-bail immobilier', 'credit', 'detail', False, False),
            ('1672', 1, 'Dettes sur contrats de crédit-bail mobilier', 'credit', 'detail', False, False),
            ('1673', 1, 'Dettes sur contrats de location-vente', 'credit', 'detail', False, False),
            ('1674', 1, 'Dettes sur contrats de crédit-bail sur fonds de commerce', 'credit', 'detail', False, False),
            ('1676', 1, 'Dettes sur autres contrats de location-acquisition', 'credit', 'detail', False, False),
            ('168', 1, 'Autres emprunts et dettes financières', 'credit', 'detail', False, False),
            ('1681', 1, 'Billets de fonds', 'credit', 'detail', False, False),
            ('1682', 1, 'Dettes sur acquisitions de valeurs mobilières', 'credit', 'detail', False, False),
            ('1683', 1, 'Avances remboursables non productives', 'credit', 'detail', False, False),
            ('1684', 1, 'Emprunts participatifs', 'credit', 'detail', False, False),
            ('1685', 1, 'Dettes de financement sur actifs biologiques', 'credit', 'detail', False, False),
            ('1686', 1, 'Autres dettes financières', 'credit', 'detail', False, False),
            # 17 CRÉDIT-BAIL
            ('172', 1, 'Dettes de crédit-bail immobilier', 'credit', 'detail', False, False),
            ('173', 1, 'Dettes de crédit-bail mobilier', 'credit', 'detail', False, False),
            ('176', 1, 'Intérêts courus sur dettes de crédit-bail', 'credit', 'detail', False, False),
            ('1762', 1, 'Intérêts courus sur crédit-bail immobilier', 'credit', 'detail', False, False),
            ('1763', 1, 'Intérêts courus sur crédit-bail mobilier', 'credit', 'detail', False, False),
            ('1768', 1, 'Autres intérêts courus sur crédit-bail', 'credit', 'detail', False, False),
            ('178', 1, 'Autres dettes de location-acquisition', 'credit', 'detail', False, False),
            # 18 DETTES PARTICIPATIONS
            ('181', 1, 'Dettes envers des entreprises liées', 'credit', 'detail', False, False),
            ('1811', 1, 'Emprunts auprès des entreprises liées', 'credit', 'detail', False, False),
            ('1812', 1, 'Dettes sur acquisition de titres de participation', 'credit', 'detail', False, False),
            ('182', 1, 'Dettes envers des entreprises avec lesquelles existe un lien de participation', 'credit', 'detail', False, False),
            ('183', 1, 'Comptes courants de groupements', 'credit', 'detail', False, False),
            ('184', 1, 'Comptes de liaison des établissements et succursales', 'credit', 'detail', False, False),
            ('185', 1, 'Comptes de liaison des sociétés en participation', 'credit', 'detail', False, False),
            ('186', 1, 'Dettes envers les sociétés en participation', 'credit', 'detail', False, False),
            ('187', 1, 'Intérêts courus sur dettes envers des entreprises liées', 'credit', 'detail', False, False),
            ('188', 1, 'Autres dettes de participations', 'credit', 'detail', False, False),
            # 19 PROVISIONS FINANCIÈRES
            ('191', 1, 'Provisions pour risques sur filiales et participations', 'credit', 'detail', False, False),
            ('192', 1, 'Provisions pour risques sur entreprises liées', 'credit', 'detail', False, False),
            ('193', 1, 'Provisions pour risques sur participations', 'credit', 'detail', False, False),
            ('194', 1, 'Provisions pour pertes de change', 'credit', 'detail', False, False),
            ('195', 1, 'Provisions pour charges financières', 'credit', 'detail', False, False),
            ('196', 1, 'Provisions pour pensions et obligations similaires', 'credit', 'detail', False, False),
            ('197', 1, 'Provisions pour charges à répartir sur plusieurs exercices', 'credit', 'detail', False, False),
            ('1971', 1, 'Provisions pour grosses réparations', 'credit', 'detail', False, False),
            ('198', 1, 'Autres provisions financières pour risques et charges', 'credit', 'detail', False, False),
            ('1981', 1, 'Provisions pour litiges', 'credit', 'detail', False, False),
            ('1982', 1, 'Provisions pour garanties données', 'credit', 'detail', False, False),
            ('1983', 1, 'Provisions pour amendes et pénalités', 'credit', 'detail', False, False),
            ('1988', 1, 'Autres provisions pour risques et charges', 'credit', 'detail', False, False),
            ('1011', 1, 'Capital souscrit, non appelé', 'credit', 'detail', False, False),
            ('1012', 1, 'Capital souscrit, appelé, non versé', 'credit', 'detail', False, False),
            ('1013', 1, 'Capital souscrit, appelé, versé', 'credit', 'detail', False, False),
            ('1014', 1, 'Capital en nature', 'credit', 'detail', False, False),
            ('1018', 1, 'Autres formes de capital', 'credit', 'detail', False, False),
            ('102', 1, 'Capital par dotation', 'credit', 'detail', False, False),
            ('104', 1, 'Primes liées au capital social', 'credit', 'detail', False, False),
            ('1041', 1, "Primes d'émission", 'credit', 'detail', False, False),
            ('1042', 1, 'Primes de fusion', 'credit', 'detail', False, False),
            ('1043', 1, "Primes d'apport", 'credit', 'detail', False, False),
            ('105', 1, 'Écart de réévaluation', 'credit', 'detail', False, False),
            ('106', 1, 'Réserves', 'credit', 'detail', False, False),
            ('1061', 1, 'Réserve légale', 'credit', 'detail', False, False),
            ('1062', 1, 'Réserve statutaire ou contractuelle', 'credit', 'detail', False, False),
            ('1064', 1, 'Réserves facultatives', 'credit', 'detail', False, False),
            ('1068', 1, 'Autres réserves', 'credit', 'detail', False, False),
            ('109', 1, 'Actionnaires, capital souscrit non appelé', 'debit', 'detail', False, False),
            ('111', 1, 'Report à nouveau (solde créditeur)', 'credit', 'detail', False, False),
            ('119', 1, 'Report à nouveau (solde débiteur)', 'debit', 'detail', False, False),
            ('121', 1, "Résultat en instance d'affectation (bénéfice)", 'credit', 'detail', False, False),
            ('129', 1, "Résultat en instance d'affectation (perte)", 'debit', 'detail', False, False),
            ('130', 1, "Résultat net de l'exercice (bénéfice)", 'credit', 'detail', False, False),
            ('139', 1, "Résultat net de l'exercice (perte)", 'debit', 'detail', False, False),
            ('131', 1, "Subventions d'équipement", 'credit', 'detail', False, False),
            ('132', 1, "Subventions d'investissement pour étude", 'credit', 'detail', False, False),
            ('138', 1, "Autres subventions d'investissement", 'credit', 'detail', False, False),
            ('143', 1, 'Provisions pour hausse des prix', 'credit', 'detail', False, False),
            ('147', 1, 'Amortissements dérogatoires', 'credit', 'detail', False, False),
            ('148', 1, 'Autres provisions réglementées', 'credit', 'detail', False, False),
            ('151', 1, 'Emprunts obligataires', 'credit', 'detail', False, False),
            ('152', 1, 'Emprunts et dettes auprès des établissements de crédit', 'credit', 'detail', False, False),
            ('1521', 1, 'Emprunts', 'credit', 'detail', False, False),
            ('1522', 1, 'Découverts bancaires', 'credit', 'detail', False, False),
            ('153', 1, "Avances reçues de l'État et des collectivités publiques", 'credit', 'detail', False, False),
            ('154', 1, 'Avances reçues des associés', 'credit', 'detail', False, False),
            ('155', 1, 'Dépôts et cautionnements reçus', 'credit', 'detail', False, False),
            ('156', 1, 'Intérêts courus sur emprunts', 'credit', 'detail', False, False),
            ('158', 1, 'Autres dettes financières', 'credit', 'detail', False, False),
            ('161', 1, 'Dettes de leasing', 'credit', 'detail', False, False),
            ('1611', 1, 'Dettes de leasing immobilier', 'credit', 'detail', False, False),
            ('1612', 1, 'Dettes de leasing mobilier', 'credit', 'detail', False, False),
            ('164', 1, 'Emprunts', 'credit', 'detail', False, False),
            ('171', 1, 'Emprunts liés à des participations', 'credit', 'detail', False, False),
            ('172', 1, 'Dettes envers des entreprises liées', 'credit', 'detail', False, False),
            ('181', 1, 'Comptes de liaison des établissements et succursales', 'credit', 'detail', False, False),
            ('191', 1, 'Provisions pour risques financiers', 'credit', 'detail', False, False),
            ('194', 1, 'Provisions pour pertes de change', 'credit', 'detail', False, False),
            ('197', 1, 'Provisions pour charges à répartir sur plusieurs exercices', 'credit', 'detail', False, False),
            ('198', 1, 'Autres provisions financières pour risques et charges', 'credit', 'detail', False, False),
            # CLASSE 2 - ACTIF IMMOBILISÉ
            ('201', 2, "Frais d'établissement et charges à répartir", 'debit', 'detail', False, False),
            ('2011', 2, 'Frais de constitution', 'debit', 'detail', False, False),
            ('2012', 2, 'Frais de démarrage', 'debit', 'detail', False, False),
            ('2016', 2, "Frais d'augmentation de capital", 'debit', 'detail', False, False),
            ('2018', 2, "Autres frais d'établissement", 'debit', 'detail', False, False),
            ('202', 2, 'Charges à répartir sur plusieurs exercices', 'debit', 'detail', False, False),
            ('204', 2, 'Brevets, licences, logiciels et droits similaires', 'debit', 'detail', False, False),
            ('2041', 2, 'Brevets', 'debit', 'detail', False, False),
            ('2042', 2, 'Licences', 'debit', 'detail', False, False),
            ('2043', 2, 'Logiciels', 'debit', 'detail', False, False),
            ('2044', 2, 'Marques', 'debit', 'detail', False, False),
            ('2048', 2, 'Autres droits et valeurs similaires', 'debit', 'detail', False, False),
            ('205', 2, 'Fonds commercial', 'debit', 'detail', False, False),
            ('208', 2, 'Autres immobilisations incorporelles', 'debit', 'detail', False, False),
            ('211', 2, 'Terrains nus', 'debit', 'detail', False, False),
            ('212', 2, 'Terrains aménagés', 'debit', 'detail', False, False),
            ('213', 2, 'Terrains bâtis', 'debit', 'detail', False, False),
            ('218', 2, 'Autres terrains', 'debit', 'detail', False, False),
            ('221', 2, 'Bâtiments sur sol propre', 'debit', 'detail', False, False),
            ('222', 2, "Bâtiments sur sol d'autrui", 'debit', 'detail', False, False),
            ('223', 2, "Ouvrages d'infrastructure", 'debit', 'detail', False, False),
            ('224', 2, 'Aménagements et agencements', 'debit', 'detail', False, False),
            ('228', 2, 'Autres bâtiments', 'debit', 'detail', False, False),
            ('231', 2, 'Matériel et outillage industriel', 'debit', 'detail', False, False),
            ('232', 2, 'Matériel de transport', 'debit', 'detail', False, False),
            ('233', 2, 'Matériel de bureau et informatique', 'debit', 'detail', False, False),
            ('234', 2, 'Mobilier', 'debit', 'detail', False, False),
            ('238', 2, 'Autres matériels', 'debit', 'detail', False, False),
            ('241', 2, 'Matériel et mobilier', 'debit', 'detail', False, False),
            ('2411', 2, 'Matériel', 'debit', 'detail', False, False),
            ('2412', 2, 'Mobilier', 'debit', 'detail', False, False),
            ('242', 2, 'Matériel informatique', 'debit', 'detail', False, False),
            ('244', 2, 'Matériel de transport', 'debit', 'detail', False, False),
            ('248', 2, 'Autres matériels', 'debit', 'detail', False, False),
            ('251', 2, "Avances et acomptes versés sur immobilisations", 'debit', 'detail', False, False),
            ('261', 2, 'Titres de participation', 'debit', 'detail', False, False),
            ('2611', 2, 'Participations dans des entreprises liées', 'debit', 'detail', False, False),
            ('2618', 2, 'Autres titres de participation', 'debit', 'detail', False, False),
            ('265', 2, 'Dépôts et cautionnements versés', 'debit', 'detail', False, False),
            ('267', 2, 'Créances liées à des participations', 'debit', 'detail', False, False),
            ('268', 2, 'Autres immobilisations financières', 'debit', 'detail', False, False),
            ('271', 2, 'Titres immobilisés', 'debit', 'detail', False, False),
            ('272', 2, 'Prêts', 'debit', 'detail', False, False),
            ('273', 2, 'Dépôts et cautionnements versés', 'debit', 'detail', False, False),
            ('276', 2, 'Intérêts courus', 'debit', 'detail', False, False),
            ('278', 2, 'Autres immobilisations financières', 'debit', 'detail', False, False),
            ('281', 2, 'Amortissements des immobilisations incorporelles', 'credit', 'detail', False, False),
            ('2814', 2, 'Amortissements des brevets, licences, logiciels', 'credit', 'detail', False, False),
            ('2818', 2, 'Amortissements des autres immobilisations incorporelles', 'credit', 'detail', False, False),
            ('282', 2, 'Amortissements des bâtiments', 'credit', 'detail', False, False),
            ('283', 2, 'Amortissements des autres immobilisations corporelles', 'credit', 'detail', False, False),
            ('2831', 2, 'Amortissements du matériel et outillage industriel', 'credit', 'detail', False, False),
            ('2832', 2, 'Amortissements du matériel de transport', 'credit', 'detail', False, False),
            ('2833', 2, 'Amortissements du matériel de bureau', 'credit', 'detail', False, False),
            ('2834', 2, 'Amortissements du mobilier', 'credit', 'detail', False, False),
            ('2838', 2, 'Amortissements des autres matériels', 'credit', 'detail', False, False),
            ('284', 2, 'Amortissements du matériel', 'credit', 'detail', False, False),
            ('288', 2, 'Amortissements des autres immobilisations', 'credit', 'detail', False, False),
            ('291', 2, 'Dépréciations des immobilisations incorporelles', 'credit', 'detail', False, False),
            ('292', 2, 'Dépréciations des bâtiments', 'credit', 'detail', False, False),
            ('293', 2, 'Dépréciations des autres immobilisations corporelles', 'credit', 'detail', False, False),
            ('294', 2, 'Dépréciations du matériel', 'credit', 'detail', False, False),
            ('296', 2, 'Dépréciations des titres de participation', 'credit', 'detail', False, False),
            ('297', 2, 'Dépréciations des autres immobilisations financières', 'credit', 'detail', False, False),
            ('298', 2, 'Dépréciations des autres immobilisations', 'credit', 'detail', False, False),
            # CLASSE 3 - ACTIF CIRCULANT (HORS TRÉSORERIE)
            ('311', 3, 'Marchandises A', 'debit', 'detail', False, False),
            ('3111', 3, 'Marchandises A', 'debit', 'detail', False, False),
            ('312', 3, 'Marchandises B', 'debit', 'detail', False, False),
            ('318', 3, 'Autres marchandises', 'debit', 'detail', False, False),
            ('321', 3, 'Matières premières A', 'debit', 'detail', False, False),
            ('3211', 3, 'Matières premières A', 'debit', 'detail', False, False),
            ('322', 3, 'Matières premières B', 'debit', 'detail', False, False),
            ('328', 3, 'Autres matières premières et fournitures', 'debit', 'detail', False, False),
            ('331', 3, 'Fournitures diverses', 'debit', 'detail', False, False),
            ('332', 3, 'Fournitures consommables', 'debit', 'detail', False, False),
            ('333', 3, 'Emballages commerciaux', 'debit', 'detail', False, False),
            ('334', 3, 'Emballages récupérables', 'debit', 'detail', False, False),
            ('338', 3, 'Autres approvisionnements', 'debit', 'detail', False, False),
            ('351', 3, 'Produits en cours', 'debit', 'detail', False, False),
            ('352', 3, 'Produits en cours de services', 'debit', 'detail', False, False),
            ('361', 3, 'Produits finis', 'debit', 'detail', False, False),
            ('362', 3, 'Produits intermédiaires', 'debit', 'detail', False, False),
            ('363', 3, 'Produits résiduels', 'debit', 'detail', False, False),
            ('368', 3, 'Autres produits finis', 'debit', 'detail', False, False),
            ('371', 3, 'Produits intermédiaires', 'debit', 'detail', False, False),
            ('372', 3, 'Produits résiduels', 'debit', 'detail', False, False),
            ('381', 3, 'Actifs biologiques circulants animaux', 'debit', 'detail', False, False),
            ('382', 3, 'Actifs biologiques circulants végétaux', 'debit', 'detail', False, False),
            ('388', 3, 'Autres actifs biologiques circulants', 'debit', 'detail', False, False),
            ('391', 3, 'Dépréciations des marchandises', 'credit', 'detail', False, False),
            ('392', 3, 'Dépréciations des matières premières', 'credit', 'detail', False, False),
            ('393', 3, 'Dépréciations des autres approvisionnements', 'credit', 'detail', False, False),
            ('395', 3, 'Dépréciations des produits en cours', 'credit', 'detail', False, False),
            ('396', 3, 'Dépréciations des produits finis', 'credit', 'detail', False, False),
            ('397', 3, 'Dépréciations des produits intermédiaires et résiduels', 'credit', 'detail', False, False),
            ('398', 3, 'Dépréciations des actifs biologiques circulants', 'credit', 'detail', False, False),
            # CLASSE 4 - PASSIF CIRCULANT (TIERS)
            ('401', 4, 'Fournisseurs', 'credit', 'detail', True, True),
            ('4011', 4, 'Fournisseurs, achats de biens et prestations de services', 'credit', 'detail', True, True),
            ('4012', 4, "Fournisseurs d'investissements", 'credit', 'detail', True, True),
            ('402', 4, 'Fournisseurs, effets à payer', 'credit', 'detail', True, True),
            ('404', 4, "Fournisseurs d'immobilisations", 'credit', 'detail', True, True),
            ('408', 4, 'Fournisseurs, factures non parvenues', 'credit', 'detail', False, False),
            ('409', 4, 'Fournisseurs débiteurs', 'debit', 'detail', False, False),
            ('4091', 4, 'Fournisseurs, avances et acomptes versés', 'debit', 'detail', False, False),
            ('4098', 4, 'Rabais, remises et ristournes à obtenir', 'debit', 'detail', False, False),
            ('411', 4, 'Clients', 'debit', 'detail', True, True),
            ('4111', 4, 'Clients', 'debit', 'detail', True, True),
            ('412', 4, 'Clients, effets à recevoir', 'debit', 'detail', True, True),
            ('413', 4, 'Clients, effets escomptés non échus', 'debit', 'detail', False, False),
            ('414', 4, 'Clients douteux ou litigieux', 'debit', 'detail', True, True),
            ('416', 4, 'Créances sur travaux non encore facturables', 'debit', 'detail', False, False),
            ('418', 4, 'Clients, factures à établir', 'debit', 'detail', False, False),
            ('419', 4, 'Clients créditeurs', 'credit', 'detail', False, False),
            ('4191', 4, 'Clients, avances et acomptes reçus', 'credit', 'detail', False, False),
            ('4198', 4, 'Rabais, remises et ristournes à accorder', 'credit', 'detail', False, False),
            ('421', 4, 'Personnel, avances et acomptes', 'debit', 'detail', False, True),
            ('422', 4, 'Personnel, rémunérations dues', 'credit', 'detail', True, True),
            ('423', 4, 'Personnel, opposition sur salaires', 'credit', 'detail', False, False),
            ('424', 4, 'Personnel, participation aux bénéfices', 'credit', 'detail', False, False),
            ('425', 4, 'Personnel, congés payés', 'credit', 'detail', False, False),
            ('426', 4, 'Personnel, dépôts', 'credit', 'detail', False, False),
            ('428', 4, 'Personnel, charges à payer et produits à recevoir', 'credit', 'detail', False, False),
            ('431', 4, 'Cotisations sociales', 'credit', 'detail', False, False),
            ('4311', 4, 'Cotisations à la CNPS', 'credit', 'detail', False, False),
            ('4318', 4, 'Autres cotisations sociales', 'credit', 'detail', False, False),
            ('432', 4, 'Cotisations mutuelles', 'credit', 'detail', False, False),
            ('437', 4, 'Autres organismes sociaux', 'credit', 'detail', False, False),
            ('438', 4, 'Organismes sociaux, charges à payer', 'credit', 'detail', False, False),
            ('441', 4, 'État, impôts et taxes à payer', 'credit', 'detail', False, False),
            ('4411', 4, 'État, impôt sur les bénéfices', 'credit', 'detail', False, False),
            ('4412', 4, 'État, acomptes provisionnels IS', 'debit', 'detail', False, False),
            ('4416', 4, 'État, retenues à la source', 'credit', 'detail', False, False),
            ('4418', 4, 'État, autres impôts', 'credit', 'detail', False, False),
            ('442', 4, 'État, recouvrements des impôts', 'debit', 'detail', False, False),
            ('443', 4, 'État, TVA facturée', 'credit', 'detail', False, False),
            ('4431', 4, 'TVA sur ventes', 'credit', 'detail', False, False),
            ('4432', 4, 'TVA sur prestations de services', 'credit', 'detail', False, False),
            ('4433', 4, 'TVA sur importations', 'credit', 'detail', False, False),
            ('444', 4, 'État, TVA due ou crédit de TVA', 'credit', 'detail', False, False),
            ('4441', 4, 'TVA due', 'credit', 'detail', False, False),
            ('4449', 4, 'Crédit de TVA', 'debit', 'detail', False, False),
            ('445', 4, 'État, TVA récupérable', 'debit', 'detail', False, False),
            ('4451', 4, 'TVA récupérable sur immobilisations', 'debit', 'detail', False, False),
            ('4452', 4, 'TVA récupérable sur ABS', 'debit', 'detail', False, False),
            ('4453', 4, 'TVA récupérable sur biens et services', 'debit', 'detail', False, False),
            ('4456', 4, 'TVA déductible', 'debit', 'detail', False, False),
            ('4457', 4, 'TVA collectée', 'credit', 'detail', False, False),
            ('4458', 4, 'TVA à régulariser', 'credit', 'detail', False, False),
            ('446', 4, 'État, autres taxes', 'credit', 'detail', False, False),
            ('447', 4, 'État, retenues à la source sur revenus de capitaux', 'credit', 'detail', False, False),
            ('448', 4, 'État, charges à payer et produits à recevoir', 'credit', 'detail', False, False),
            ('461', 4, 'Associés, comptes courants', 'credit', 'detail', False, True),
            ('462', 4, 'Associés, dividendes à payer', 'credit', 'detail', False, True),
            ('463', 4, 'Associés, apports en nature et en numéraire', 'debit', 'detail', False, False),
            ('465', 4, 'Associés, capital à rembourser', 'credit', 'detail', False, False),
            ('467', 4, 'Comptes courants de groupe', 'credit', 'detail', False, False),
            ('468', 4, 'Associés, autres opérations', 'credit', 'detail', False, False),
            ('471', 4, 'Débiteurs divers', 'debit', 'detail', False, False),
            ('4711', 4, "Comptes d'attente débiteurs", 'debit', 'detail', False, False),
            ('4714', 4, "Créances sur cession d'immobilisations", 'debit', 'detail', False, False),
            ('4718', 4, 'Autres débiteurs divers', 'debit', 'detail', False, False),
            ('472', 4, 'Créditeurs divers', 'credit', 'detail', False, False),
            ('4721', 4, "Comptes d'attente créditeurs", 'credit', 'detail', False, False),
            ('4724', 4, "Dettes sur acquisitions d'immobilisations", 'credit', 'detail', False, False),
            ('4728', 4, 'Autres créditeurs divers', 'credit', 'detail', False, False),
            ('476', 4, "Charges constatées d'avance", 'debit', 'detail', False, False),
            ('477', 4, "Produits constatés d'avance", 'credit', 'detail', False, False),
            ('481', 4, 'Créances H.A.O.', 'debit', 'detail', False, False),
            ('485', 4, 'Dettes H.A.O.', 'credit', 'detail', False, False),
            ('488', 4, 'Intérêts courus non échus', 'debit', 'detail', False, False),
            ('491', 4, 'Dépréciations des comptes clients', 'credit', 'detail', False, False),
            ('4911', 4, 'Dépréciations des clients', 'credit', 'detail', False, False),
            ('4914', 4, 'Dépréciations des clients douteux', 'credit', 'detail', False, False),
            ('495', 4, 'Dépréciations des comptes organismes', 'credit', 'detail', False, False),
            ('496', 4, 'Dépréciations des comptes débiteurs divers', 'credit', 'detail', False, False),
            ('497', 4, 'Provisions pour risques à court terme', 'credit', 'detail', False, False),
            ('4971', 4, 'Provisions pour litiges', 'credit', 'detail', False, False),
            ('4972', 4, 'Provisions pour garanties données aux clients', 'credit', 'detail', False, False),
            ('4976', 4, 'Provisions pour charges sur congés payés', 'credit', 'detail', False, False),
            ('4978', 4, 'Autres provisions pour risques à court terme', 'credit', 'detail', False, False),
            ('498', 4, 'Intérêts courus et produits à recevoir', 'debit', 'detail', False, False),
            # CLASSE 5 - TRÉSORERIE
            ('501', 5, 'Titres de placement', 'debit', 'detail', False, False),
            ('5011', 5, 'Obligations', 'debit', 'detail', False, False),
            ('5012', 5, 'Bons du Trésor', 'debit', 'detail', False, False),
            ('5018', 5, 'Autres titres de placement', 'debit', 'detail', False, False),
            ('509', 5, 'Dépréciations des titres de placement', 'credit', 'detail', False, False),
            ('511', 5, 'Chèques à encaisser', 'debit', 'detail', False, False),
            ('514', 5, 'Effets à encaisser', 'debit', 'detail', False, False),
            ('515', 5, "Effets remis à l'escompte", 'debit', 'detail', False, False),
            ('521', 5, 'Banque', 'debit', 'detail', True, False),
            ('5211', 5, 'Banque A', 'debit', 'detail', True, False),
            ('5214', 5, 'Dépôts à terme', 'debit', 'detail', False, False),
            ('522', 5, 'Banque B', 'debit', 'detail', False, False),
            ('528', 5, 'Autres banques', 'debit', 'detail', False, False),
            ('531', 5, 'Compte de chèques postaux', 'debit', 'detail', False, False),
            ('532', 5, 'Trésor Public', 'debit', 'detail', False, False),
            ('538', 5, 'Autres établissements financiers', 'debit', 'detail', False, False),
            ('548', 5, "Autres instruments de trésorerie", 'debit', 'detail', False, False),
            ('571', 5, 'Caisse siège', 'debit', 'detail', False, False),
            ('572', 5, 'Caisse succursale', 'debit', 'detail', False, False),
            ('578', 5, 'Autres caisses', 'debit', 'detail', False, False),
            ('581', 5, "Régies d'avances", 'debit', 'detail', False, False),
            ('582', 5, 'Accréditifs', 'debit', 'detail', False, False),
            ('591', 5, 'Dépréciations des titres de placement', 'credit', 'detail', False, False),
            ('597', 5, 'Provisions pour risques sur trésorerie', 'credit', 'detail', False, False),
            # CLASSE 6 - CHARGES DES ACTIVITÉS ORDINAIRES
            ('601', 6, 'Achats de marchandises', 'debit', 'detail', False, False),
            ('6011', 6, 'Achats de marchandises dans la Région', 'debit', 'detail', False, False),
            ('6012', 6, 'Achats de marchandises hors Région', 'debit', 'detail', False, False),
            ('602', 6, 'Achats de matières premières et fournitures liées', 'debit', 'detail', False, False),
            ('6021', 6, 'Achats de matières premières', 'debit', 'detail', False, False),
            ('6022', 6, 'Achats de fournitures liées', 'debit', 'detail', False, False),
            ('603', 6, 'Achats de matières et fournitures consommables', 'debit', 'detail', False, False),
            ('6031', 6, 'Fournitures de bureau', 'debit', 'detail', False, False),
            ('6032', 6, "Fournitures d'atelier", 'debit', 'detail', False, False),
            ('6033', 6, 'Fournitures de magasin', 'debit', 'detail', False, False),
            ('6038', 6, 'Autres achats', 'debit', 'detail', False, False),
            ('604', 6, 'Variations de stocks de marchandises', 'debit', 'detail', False, False),
            ('605', 6, 'Variations de stocks de matières premières', 'debit', 'detail', False, False),
            ('606', 6, 'Variations de stocks de matières et fournitures consommables', 'debit', 'detail', False, False),
            ('608', 6, 'Autres achats', 'debit', 'detail', False, False),
            ('611', 6, 'Transports sur achats', 'debit', 'detail', False, False),
            ('612', 6, 'Transports sur ventes', 'debit', 'detail', False, False),
            ('613', 6, 'Transports pour le compte de tiers', 'debit', 'detail', False, False),
            ('614', 6, 'Transports du personnel', 'debit', 'detail', False, False),
            ('618', 6, 'Autres frais de transport', 'debit', 'detail', False, False),
            ('621', 6, 'Sous-traitance générale', 'debit', 'detail', False, False),
            ('622', 6, 'Locations et charges locatives', 'debit', 'detail', False, False),
            ('6221', 6, 'Locations de terrains', 'debit', 'detail', False, False),
            ('6222', 6, 'Locations de bâtiments', 'debit', 'detail', False, False),
            ('6223', 6, 'Locations de matériels et outillages', 'debit', 'detail', False, False),
            ('6225', 6, 'Charges de crédit-bail', 'debit', 'detail', False, False),
            ('623', 6, 'Redevances de crédit-bail', 'debit', 'detail', False, False),
            ('624', 6, 'Entretien, réparations et maintenance', 'debit', 'detail', False, False),
            ('6241', 6, 'Entretien et réparations de bâtiments', 'debit', 'detail', False, False),
            ('6242', 6, 'Entretien et réparations de matériels', 'debit', 'detail', False, False),
            ('6245', 6, 'Entretien et réparations de matériels informatiques', 'debit', 'detail', False, False),
            ('6248', 6, "Entretien et réparations d'autres biens", 'debit', 'detail', False, False),
            ('625', 6, "Primes d'assurance", 'debit', 'detail', False, False),
            ('6251', 6, "Primes d'assurance multirisque", 'debit', 'detail', False, False),
            ('6252', 6, "Primes d'assurance transport", 'debit', 'detail', False, False),
            ('6253', 6, "Primes d'assurance-vie", 'debit', 'detail', False, False),
            ('6258', 6, "Autres primes d'assurance", 'debit', 'detail', False, False),
            ('626', 6, 'Études, recherches et documentation', 'debit', 'detail', False, False),
            ('627', 6, 'Publicité, publication, relations publiques', 'debit', 'detail', False, False),
            ('628', 6, 'Autres charges externes', 'debit', 'detail', False, False),
            ('6281', 6, 'Frais de télécommunications', 'debit', 'detail', False, False),
            ('6282', 6, 'Frais postaux', 'debit', 'detail', False, False),
            ('6283', 6, 'Catalogues, imprimés et fournitures de bureau', 'debit', 'detail', False, False),
            ('6284', 6, 'Services bancaires', 'debit', 'detail', False, False),
            ('6285', 6, 'Cotisations et dons', 'debit', 'detail', False, False),
            ('6286', 6, 'Frais de contentieux', 'debit', 'detail', False, False),
            ('6288', 6, 'Autres charges de gestion courante', 'debit', 'detail', False, False),
            ('631', 6, 'Frais bancaires', 'debit', 'detail', False, False),
            ('6311', 6, 'Commissions et frais bancaires', 'debit', 'detail', False, False),
            ('6312', 6, 'Agios', 'debit', 'detail', False, False),
            ('6313', 6, 'Frais de tenue de compte', 'debit', 'detail', False, False),
            ('632', 6, "Rémunérations d'intermédiaires et honoraires", 'debit', 'detail', False, False),
            ('6321', 6, 'Commissions', 'debit', 'detail', False, False),
            ('6322', 6, 'Courtages', 'debit', 'detail', False, False),
            ('6323', 6, 'Honoraires', 'debit', 'detail', False, False),
            ('6324', 6, 'Rémunérations des avoués et avocats', 'debit', 'detail', False, False),
            ('6325', 6, "Frais d'actes et de contentieux", 'debit', 'detail', False, False),
            ('6326', 6, 'Rémunérations de notaires', 'debit', 'detail', False, False),
            ('6328', 6, "Autres rémunérations d'intermédiaires", 'debit', 'detail', False, False),
            ('633', 6, 'Redevances pour brevets, licences', 'debit', 'detail', False, False),
            ('6331', 6, 'Redevances pour brevets', 'debit', 'detail', False, False),
            ('6332', 6, 'Redevances pour licences', 'debit', 'detail', False, False),
            ('6336', 6, 'Redevances pour logiciels', 'debit', 'detail', False, False),
            ('634', 6, 'Dépenses de formation du personnel', 'debit', 'detail', False, False),
            ('635', 6, 'Impôts et taxes', 'debit', 'detail', False, False),
            ('6351', 6, 'Impôts fonciers et taxes foncières', 'debit', 'detail', False, False),
            ('6352', 6, 'Patentes et licences', 'debit', 'detail', False, False),
            ('6353', 6, 'Taxe sur les salaires', 'debit', 'detail', False, False),
            ('6354', 6, 'Autres impôts locaux', 'debit', 'detail', False, False),
            ('6355', 6, 'Amendes et pénalités', 'debit', 'detail', False, False),
            ('6356', 6, "Droits d'enregistrement et de timbre", 'debit', 'detail', False, False),
            ('6358', 6, 'Autres taxes et impôts', 'debit', 'detail', False, False),
            ('636', 6, 'Cotisations professionnelles', 'debit', 'detail', False, False),
            ('637', 6, 'Frais divers', 'debit', 'detail', False, False),
            ('6371', 6, 'Frais de formation', 'debit', 'detail', False, False),
            ('6372', 6, 'Frais de réception', 'debit', 'detail', False, False),
            ('6373', 6, 'Dépenses de représentation', 'debit', 'detail', False, False),
            ('6374', 6, 'Frais de déplacement', 'debit', 'detail', False, False),
            ('6375', 6, 'Voyages et déplacements', 'debit', 'detail', False, False),
            ('641', 6, 'Impôts et taxes directs', 'debit', 'detail', False, False),
            ('6411', 6, 'Impôts sur les bénéfices', 'debit', 'detail', False, False),
            ('6412', 6, 'Taxe professionnelle', 'debit', 'detail', False, False),
            ('6413', 6, "Taxe d'apprentissage", 'debit', 'detail', False, False),
            ('6414', 6, 'Contribution foncière des propriétés bâties', 'debit', 'detail', False, False),
            ('6415', 6, 'Taxes sur les véhicules de société', 'debit', 'detail', False, False),
            ('6418', 6, 'Autres impôts et taxes directs', 'debit', 'detail', False, False),
            ('642', 6, 'Impôts et taxes indirects', 'debit', 'detail', False, False),
            ('6421', 6, 'Taxe sur la valeur ajoutée', 'debit', 'detail', False, False),
            ('6422', 6, 'Droits de douane', 'debit', 'detail', False, False),
            ('643', 6, 'Taxes assises sur les salaires', 'debit', 'detail', False, False),
            ('6431', 6, 'Contribution forfaitaire patronale', 'debit', 'detail', False, False),
            ('6434', 6, "Taxe d'apprentissage", 'debit', 'detail', False, False),
            ('645', 6, 'Cotisations sociales patronales', 'debit', 'detail', False, False),
            ('6451', 6, 'Cotisations à la CNSS/CNPS', 'debit', 'detail', False, False),
            ('6452', 6, 'Cotisations mutuelles', 'debit', 'detail', False, False),
            ('646', 6, 'Charges sociales sur congés payés', 'debit', 'detail', False, False),
            ('651', 6, 'Pertes sur créances clients', 'debit', 'detail', False, False),
            ('652', 6, 'Pertes sur prêts et créances diverses', 'debit', 'detail', False, False),
            ('653', 6, "Charges d'intérêts", 'debit', 'detail', False, False),
            ('6531', 6, 'Intérêts des emprunts et dettes', 'debit', 'detail', False, False),
            ('6532', 6, 'Intérêts bancaires', 'debit', 'detail', False, False),
            ('6533', 6, 'Intérêts des comptes courants', 'debit', 'detail', False, False),
            ('657', 6, 'Charges exceptionnelles', 'debit', 'detail', False, False),
            ('658', 6, 'Autres charges diverses', 'debit', 'detail', False, False),
            ('661', 6, 'Rémunérations directes versées au personnel national', 'debit', 'detail', False, False),
            ('6611', 6, 'Appointements et salaires', 'debit', 'detail', False, False),
            ('6612', 6, 'Primes et gratifications', 'debit', 'detail', False, False),
            ('6613', 6, 'Congés payés', 'debit', 'detail', False, False),
            ('6614', 6, 'Indemnités et avantages divers', 'debit', 'detail', False, False),
            ('6615', 6, 'Commissions au personnel', 'debit', 'detail', False, False),
            ('662', 6, 'Rémunérations directes versées au personnel non national', 'debit', 'detail', False, False),
            ('663', 6, 'Indemnités forfaitaires', 'debit', 'detail', False, False),
            ('6631', 6, 'Indemnités journalières', 'debit', 'detail', False, False),
            ('6632', 6, 'Indemnités de transport', 'debit', 'detail', False, False),
            ('6633', 6, 'Indemnités de logement', 'debit', 'detail', False, False),
            ('6634', 6, 'Indemnités de licenciement', 'debit', 'detail', False, False),
            ('664', 6, 'Charges sociales', 'debit', 'detail', False, False),
            ('6641', 6, 'Charges sociales patronales CNSS/CNPS', 'debit', 'detail', False, False),
            ('6642', 6, 'Autres charges sociales patronales', 'debit', 'detail', False, False),
            ('665', 6, 'Charges de prévoyance sociale', 'debit', 'detail', False, False),
            ('6651', 6, 'Cotisations au fonds de pension', 'debit', 'detail', False, False),
            ('6652', 6, 'Mutuelles', 'debit', 'detail', False, False),
            ('666', 6, "Rémunérations d'administrateurs", 'debit', 'detail', False, False),
            ('667', 6, 'Charges de formation', 'debit', 'detail', False, False),
            ('668', 6, 'Autres charges de personnel', 'debit', 'detail', False, False),
            ('671', 6, 'Intérêts des emprunts', 'debit', 'detail', False, False),
            ('6711', 6, 'Intérêts des emprunts obligataires', 'debit', 'detail', False, False),
            ('6712', 6, 'Intérêts des emprunts bancaires', 'debit', 'detail', False, False),
            ('6713', 6, 'Intérêts des CB et effets', 'debit', 'detail', False, False),
            ('6718', 6, 'Autres intérêts', 'debit', 'detail', False, False),
            ('672', 6, 'Charges sur titres de placement', 'debit', 'detail', False, False),
            ('673', 6, 'Pertes sur cessions de titres de placement', 'debit', 'detail', False, False),
            ('674', 6, 'Escomptes accordés', 'debit', 'detail', False, False),
            ('675', 6, 'Pertes de change', 'debit', 'detail', False, False),
            ('676', 6, 'Charges sur risques financiers', 'debit', 'detail', False, False),
            ('678', 6, 'Autres charges financières', 'debit', 'detail', False, False),
            ('681', 6, 'Dotations aux amortissements des immobilisations incorporelles', 'debit', 'detail', False, False),
            ('6811', 6, 'Dotations aux amortissements des logiciels', 'debit', 'detail', False, False),
            ('6812', 6, 'Dotations aux amortissements des brevets', 'debit', 'detail', False, False),
            ('6818', 6, "Dotations aux amortissements d'autres incorporelles", 'debit', 'detail', False, False),
            ('682', 6, 'Dotations aux amortissements des immobilisations corporelles', 'debit', 'detail', False, False),
            ('6821', 6, 'Dotations aux amortissements des bâtiments', 'debit', 'detail', False, False),
            ('6822', 6, 'Dotations aux amortissements du matériel', 'debit', 'detail', False, False),
            ('6823', 6, 'Dotations aux amortissements du mobilier', 'debit', 'detail', False, False),
            ('6824', 6, 'Dotations aux amortissements du matériel informatique', 'debit', 'detail', False, False),
            ('6828', 6, 'Dotations aux amortissements des autres immobilisations', 'debit', 'detail', False, False),
            ('683', 6, 'Dotations aux amortissements des actifs biologiques', 'debit', 'detail', False, False),
            ('686', 6, 'Dotations aux provisions', 'debit', 'detail', False, False),
            ('6861', 6, "Dotations aux provisions pour risques et charges d'exploitation", 'debit', 'detail', False, False),
            ('6862', 6, 'Dotations aux provisions pour risques financiers', 'debit', 'detail', False, False),
            ('6864', 6, 'Dotations pour dépréciation des immobilisations', 'debit', 'detail', False, False),
            ('6865', 6, 'Dotations pour dépréciation des stocks', 'debit', 'detail', False, False),
            ('6866', 6, 'Dotations pour dépréciation des comptes de tiers', 'debit', 'detail', False, False),
            ('691', 6, 'Impôts sur les bénéfices', 'debit', 'detail', False, False),
            ('6911', 6, "Impôts sur les bénéfices de l'exercice", 'debit', 'detail', False, False),
            ('695', 6, 'Impôt minimum forfaitaire', 'debit', 'detail', False, False),
            ('699', 6, "Dégrèvements sur impôts sur résultats antérieurs", 'credit', 'detail', False, False),
            # CLASSE 7 - PRODUITS DES ACTIVITÉS ORDINAIRES
            ('701', 7, 'Ventes de marchandises', 'credit', 'detail', False, False),
            ('7011', 7, 'Ventes de marchandises dans la Région', 'credit', 'detail', False, False),
            ('7012', 7, 'Ventes de marchandises hors Région', 'credit', 'detail', False, False),
            ('7013', 7, 'Ventes de marchandises aux entreprises du groupe dans la Région', 'credit', 'detail', False, False),
            ('7014', 7, 'Ventes de marchandises aux entreprises du groupe hors Région', 'credit', 'detail', False, False),
            ('702', 7, 'Ventes de produits finis', 'credit', 'detail', False, False),
            ('7021', 7, 'Ventes de produits finis dans la Région', 'credit', 'detail', False, False),
            ('7022', 7, 'Ventes de produits finis hors Région', 'credit', 'detail', False, False),
            ('703', 7, 'Ventes de produits intermédiaires', 'credit', 'detail', False, False),
            ('7031', 7, 'Ventes de produits intermédiaires dans la Région', 'credit', 'detail', False, False),
            ('7032', 7, 'Ventes de produits intermédiaires hors Région', 'credit', 'detail', False, False),
            ('704', 7, 'Ventes de produits résiduels', 'credit', 'detail', False, False),
            ('705', 7, 'Travaux facturés', 'credit', 'detail', False, False),
            ('7051', 7, 'Travaux facturés dans la Région', 'credit', 'detail', False, False),
            ('7052', 7, 'Travaux facturés hors Région', 'credit', 'detail', False, False),
            ('706', 7, 'Services vendus', 'credit', 'detail', False, False),
            ('7061', 7, 'Services vendus dans la Région', 'credit', 'detail', False, False),
            ('7062', 7, 'Services vendus hors Région', 'credit', 'detail', False, False),
            ('707', 7, 'Produits accessoires', 'credit', 'detail', False, False),
            ('7071', 7, 'Ports, emballages perdus et autres frais facturés', 'credit', 'detail', False, False),
            ('7072', 7, 'Commissions et courtages', 'credit', 'detail', False, False),
            ('7073', 7, 'Locations', 'credit', 'detail', False, False),
            ('7074', 7, "Bonis sur reprises et cessions d'emballages", 'credit', 'detail', False, False),
            ('7075', 7, 'Mise à disposition de personnel', 'credit', 'detail', False, False),
            ('7076', 7, 'Redevances pour brevets, logiciels, marques', 'credit', 'detail', False, False),
            ('7078', 7, 'Autres produits accessoires', 'credit', 'detail', False, False),
            ('711', 7, "Subventions d'exploitation sur produits à l'exportation", 'credit', 'detail', False, False),
            ('712', 7, "Subventions d'exploitation sur produits à l'importation", 'credit', 'detail', False, False),
            ('713', 7, "Subventions d'exploitation sur produits de péréquation", 'credit', 'detail', False, False),
            ('718', 7, "Autres subventions d'exploitation", 'credit', 'detail', False, False),
            ('7181', 7, "Subventions versées par l'État et les collectivités publiques", 'credit', 'detail', False, False),
            ('7182', 7, 'Subventions versées par les organismes internationaux', 'credit', 'detail', False, False),
            ('7183', 7, 'Subventions versées par des tiers', 'credit', 'detail', False, False),
            ('721', 7, 'Production immobilisée - immobilisations incorporelles', 'credit', 'detail', False, False),
            ('722', 7, 'Production immobilisée - immobilisations corporelles', 'credit', 'detail', False, False),
            ('726', 7, 'Production immobilisée - immobilisations financières', 'credit', 'detail', False, False),
            ('734', 7, 'Variations des stocks de produits en cours', 'credit', 'detail', False, False),
            ('7341', 7, 'Produits en cours', 'credit', 'detail', False, False),
            ('7342', 7, 'Travaux en cours', 'credit', 'detail', False, False),
            ('735', 7, "Variations des en-cours de services", 'credit', 'detail', False, False),
            ('7351', 7, 'Études en cours', 'credit', 'detail', False, False),
            ('7352', 7, 'Prestations de services en cours', 'credit', 'detail', False, False),
            ('736', 7, 'Variations des stocks de produits finis', 'credit', 'detail', False, False),
            ('737', 7, 'Variations des stocks de produits intermédiaires et résiduels', 'credit', 'detail', False, False),
            ('7371', 7, 'Produits intermédiaires', 'credit', 'detail', False, False),
            ('7372', 7, 'Produits résiduels', 'credit', 'detail', False, False),
            ('752', 7, 'Quote-part de résultat sur opérations faites en commun', 'credit', 'detail', False, False),
            ('753', 7, 'Quote-part de résultat sur exécution partielle de contrats', 'credit', 'detail', False, False),
            ('754', 7, "Produits des cessions courantes d'immobilisations", 'credit', 'detail', False, False),
            ('758', 7, 'Produits divers', 'credit', 'detail', False, False),
            ('7581', 7, "Jetons de présence et autres rémunérations d'administrateurs", 'credit', 'detail', False, False),
            ('7582', 7, "Indemnités d'assurances reçues", 'credit', 'detail', False, False),
            ('759', 7, "Reprises de charges provisionnées d'exploitation", 'credit', 'detail', False, False),
            ('7591', 7, 'Reprises sur risques à court terme', 'credit', 'detail', False, False),
            ('7593', 7, 'Reprises sur stocks', 'credit', 'detail', False, False),
            ('7594', 7, 'Reprises sur créances', 'credit', 'detail', False, False),
            ('7598', 7, 'Reprises sur autres charges provisionnées', 'credit', 'detail', False, False),
            ('771', 7, 'Intérêts de prêts', 'credit', 'detail', False, False),
            ('772', 7, 'Revenus de participations', 'credit', 'detail', False, False),
            ('773', 7, 'Escomptes obtenus', 'credit', 'detail', False, False),
            ('774', 7, 'Revenus de titres de placement', 'credit', 'detail', False, False),
            ('776', 7, 'Gains de change', 'credit', 'detail', False, False),
            ('777', 7, 'Gains sur cessions de titres de placement', 'credit', 'detail', False, False),
            ('778', 7, 'Gains sur risques financiers', 'credit', 'detail', False, False),
            ('7781', 7, 'Gains sur rentes viagères', 'credit', 'detail', False, False),
            ('7782', 7, 'Gains sur opérations financières', 'credit', 'detail', False, False),
            ('7784', 7, 'Gains sur instruments de trésorerie', 'credit', 'detail', False, False),
            ('779', 7, 'Reprises de charges provisionnées financières', 'credit', 'detail', False, False),
            ('7791', 7, 'Reprises sur risques financiers', 'credit', 'detail', False, False),
            ('7795', 7, 'Reprises sur titres de placement', 'credit', 'detail', False, False),
            ('781', 7, "Transferts de charges d'exploitation", 'credit', 'detail', False, False),
            ('787', 7, 'Transferts de charges financières', 'credit', 'detail', False, False),
            ('791', 7, "Reprises de provisions d'exploitation", 'credit', 'detail', False, False),
            ('7911', 7, 'Reprises de provisions pour risques et charges', 'credit', 'detail', False, False),
            ('7912', 7, 'Reprises de provisions pour grosses réparations', 'credit', 'detail', False, False),
            ('7913', 7, 'Reprises de provisions pour dépréciation des incorporelles', 'credit', 'detail', False, False),
            ('7914', 7, 'Reprises de provisions pour dépréciation des corporelles', 'credit', 'detail', False, False),
            ('797', 7, 'Reprises de provisions financières', 'credit', 'detail', False, False),
            ('7971', 7, 'Reprises de provisions pour risques financiers', 'credit', 'detail', False, False),
            ('7972', 7, 'Reprises de provisions pour dépréciation financières', 'credit', 'detail', False, False),
            ('798', 7, "Reprises d'amortissements", 'credit', 'detail', False, False),
            # CLASSE 8 - AUTRES CHARGES ET AUTRES PRODUITS (HAO)
            ('811', 8, "Valeurs comptables des cessions d'immobilisations incorporelles", 'debit', 'detail', False, False),
            ('812', 8, "Valeurs comptables des cessions d'immobilisations corporelles", 'debit', 'detail', False, False),
            ('816', 8, "Valeurs comptables des cessions d'immobilisations financières", 'debit', 'detail', False, False),
            ('821', 8, "Produits des cessions d'immobilisations incorporelles", 'credit', 'detail', False, False),
            ('822', 8, "Produits des cessions d'immobilisations corporelles", 'credit', 'detail', False, False),
            ('826', 8, "Produits des cessions d'immobilisations financières", 'credit', 'detail', False, False),
            ('831', 8, 'Charges H.A.O. constatées', 'debit', 'detail', False, False),
            ('834', 8, 'Pertes sur créances H.A.O.', 'debit', 'detail', False, False),
            ('835', 8, 'Dons et libéralités accordés', 'debit', 'detail', False, False),
            ('836', 8, 'Abandons de créances consentis', 'debit', 'detail', False, False),
            ('839', 8, 'Charges provisionnées H.A.O.', 'debit', 'detail', False, False),
            ('841', 8, 'Produits H.A.O. constatés', 'credit', 'detail', False, False),
            ('845', 8, 'Dons et libéralités obtenus', 'credit', 'detail', False, False),
            ('846', 8, 'Abandons de créances obtenus', 'credit', 'detail', False, False),
            ('848', 8, 'Transferts de charges H.A.O.', 'credit', 'detail', False, False),
            ('849', 8, 'Reprises des charges provisionnées H.A.O.', 'credit', 'detail', False, False),
            ('851', 8, 'Dotations aux provisions réglementées', 'debit', 'detail', False, False),
            ('852', 8, 'Dotations aux amortissements H.A.O.', 'debit', 'detail', False, False),
            ('853', 8, 'Dotations aux provisions pour dépréciation H.A.O.', 'debit', 'detail', False, False),
            ('854', 8, 'Dotations aux provisions pour risques et charges H.A.O.', 'debit', 'detail', False, False),
            ('858', 8, 'Autres dotations H.A.O.', 'debit', 'detail', False, False),
            ('861', 8, 'Reprises de provisions réglementées', 'credit', 'detail', False, False),
            ('862', 8, "Reprises d'amortissements H.A.O.", 'credit', 'detail', False, False),
            ('863', 8, 'Reprises de provisions pour dépréciation H.A.O.', 'credit', 'detail', False, False),
            ('864', 8, 'Reprises de provisions pour risques et charges H.A.O.', 'credit', 'detail', False, False),
            ('865', 8, "Reprises de subventions d'investissement", 'credit', 'detail', False, False),
            ('868', 8, 'Autres reprises H.A.O.', 'credit', 'detail', False, False),
            ('871', 8, 'Participation légale aux bénéfices', 'debit', 'detail', False, False),
            ('874', 8, 'Participation contractuelle aux bénéfices', 'debit', 'detail', False, False),
            ('878', 8, 'Autres participations', 'debit', 'detail', False, False),
            ('881', 8, "Subventions d'équilibre - État", 'credit', 'detail', False, False),
            ('884', 8, "Subventions d'équilibre - Collectivités publiques", 'credit', 'detail', False, False),
            ('886', 8, "Subventions d'équilibre - Groupe", 'credit', 'detail', False, False),
            ('888', 8, "Subventions d'équilibre - Autres", 'credit', 'detail', False, False),
            ('891', 8, "Impôts sur les bénéfices de l'exercice", 'debit', 'detail', False, False),
            ('8911', 8, "Impôts - activités exercées dans l'État", 'debit', 'detail', False, False),
            ('8912', 8, "Impôts - activités exercées dans les autres États de la Région", 'debit', 'detail', False, False),
            ('8913', 8, 'Impôts - activités exercées hors Région', 'debit', 'detail', False, False),
            ('892', 8, "Rappel d'impôts sur résultats antérieurs", 'debit', 'detail', False, False),
            ('895', 8, 'Impôt minimum forfaitaire (I.M.F.)', 'debit', 'detail', False, False),
            ('899', 8, "Dégrèvements et annulations d'impôts sur résultats antérieurs", 'credit', 'detail', False, False),
            ('8991', 8, 'Dégrèvements', 'credit', 'detail', False, False),
            ('8994', 8, 'Annulations pour pertes rétroactives', 'credit', 'detail', False, False),
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
