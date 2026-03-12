from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.core.exceptions import ValidationError

from apps.comptabilite.models import (
    Societe, ClasseCompte, Compte, ExerciceComptable,
    JournalComptable, PieceComptable, LigneEcriture, Tiers,
)
from apps.comptabilite.services import EcritureService, LettrageService, ClotureService


class BaseComptaTestCase(TestCase):
    """Classe de base avec les données de test communes."""

    def setUp(self):
        self.societe = Societe.objects.create(
            nom='Société Test SARL',
            sigle='TEST',
            devise='XOF',
        )

        # Classes de comptes
        self.classe1 = ClasseCompte.objects.create(societe=self.societe, numero=1, intitule='Ressources durables')
        self.classe4 = ClasseCompte.objects.create(societe=self.societe, numero=4, intitule='Tiers')
        self.classe5 = ClasseCompte.objects.create(societe=self.societe, numero=5, intitule='Trésorerie')
        self.classe6 = ClasseCompte.objects.create(societe=self.societe, numero=6, intitule='Charges')
        self.classe7 = ClasseCompte.objects.create(societe=self.societe, numero=7, intitule='Produits')

        # Comptes
        self.compte_capital = Compte.objects.create(
            societe=self.societe, classe=self.classe1,
            numero='101', intitule='Capital social', nature='credit', type_compte='detail',
        )
        self.compte_resultat_ex = Compte.objects.create(
            societe=self.societe, classe=self.classe1,
            numero='130', intitule='Résultat net', nature='credit', type_compte='detail',
        )
        self.compte_fournisseur = Compte.objects.create(
            societe=self.societe, classe=self.classe4,
            numero='401', intitule='Fournisseurs', nature='credit', type_compte='detail',
            lettrable=True, est_tiers=True,
        )
        self.compte_client = Compte.objects.create(
            societe=self.societe, classe=self.classe4,
            numero='411', intitule='Clients', nature='debit', type_compte='detail',
            lettrable=True, est_tiers=True,
        )
        self.compte_banque = Compte.objects.create(
            societe=self.societe, classe=self.classe5,
            numero='521', intitule='Banque', nature='debit', type_compte='detail',
            lettrable=True,
        )
        self.compte_caisse = Compte.objects.create(
            societe=self.societe, classe=self.classe5,
            numero='571', intitule='Caisse', nature='debit', type_compte='detail',
        )
        self.compte_achats = Compte.objects.create(
            societe=self.societe, classe=self.classe6,
            numero='601', intitule='Achats de marchandises', nature='debit', type_compte='detail',
        )
        self.compte_charges_personnel = Compte.objects.create(
            societe=self.societe, classe=self.classe6,
            numero='661', intitule='Rémunérations', nature='debit', type_compte='detail',
        )
        self.compte_ventes = Compte.objects.create(
            societe=self.societe, classe=self.classe7,
            numero='701', intitule='Ventes de marchandises', nature='credit', type_compte='detail',
        )

        # Exercice
        self.exercice = ExerciceComptable.objects.create(
            societe=self.societe,
            code='2025',
            libelle='Exercice 2025',
            date_debut=date(2025, 1, 1),
            date_fin=date(2025, 12, 31),
        )

        # Journaux
        self.journal_achat = JournalComptable.objects.create(
            societe=self.societe, code='ACH', intitule='Achats', type_journal='achat',
        )
        self.journal_vente = JournalComptable.objects.create(
            societe=self.societe, code='VTE', intitule='Ventes', type_journal='vente',
        )
        self.journal_banque = JournalComptable.objects.create(
            societe=self.societe, code='BQ', intitule='Banque', type_journal='banque',
            compte_contrepartie=self.compte_banque,
        )
        self.journal_od = JournalComptable.objects.create(
            societe=self.societe, code='OD', intitule='Opérations Diverses', type_journal='od',
        )


class EcritureServiceTest(BaseComptaTestCase):
    """Tests pour le service d'écritures."""

    def test_creer_piece_equilibree(self):
        """Une pièce équilibrée doit être créée avec succès."""
        piece = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_achat,
            date_piece=date(2025, 3, 15),
            libelle='Achat de marchandises',
            lignes_data=[
                {'compte': self.compte_achats, 'debit': Decimal('100000'), 'credit': Decimal('0'), 'libelle': 'Achats'},
                {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('100000'), 'libelle': 'Fournisseur X'},
            ],
        )
        self.assertEqual(piece.lignes.count(), 2)
        self.assertTrue(piece.est_equilibree)
        self.assertEqual(piece.statut, PieceComptable.Statut.BROUILLARD)
        self.assertEqual(piece.numero_piece, '000001')

    def test_creer_piece_desequilibree_echoue(self):
        """Une pièce déséquilibrée doit lever une erreur."""
        with self.assertRaises(ValidationError):
            EcritureService.creer_piece(
                exercice=self.exercice,
                journal=self.journal_achat,
                date_piece=date(2025, 3, 15),
                libelle='Achat incorrect',
                lignes_data=[
                    {'compte': self.compte_achats, 'debit': Decimal('100000'), 'credit': Decimal('0')},
                    {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('50000')},
                ],
            )

    def test_creer_piece_exercice_cloture_echoue(self):
        """Créer une écriture sur un exercice clôturé doit échouer."""
        self.exercice.statut = ExerciceComptable.Statut.CLOTURE
        self.exercice.save()

        with self.assertRaises(ValidationError):
            EcritureService.creer_piece(
                exercice=self.exercice,
                journal=self.journal_achat,
                date_piece=date(2025, 3, 15),
                libelle='Achat',
                lignes_data=[
                    {'compte': self.compte_achats, 'debit': Decimal('100000'), 'credit': Decimal('0')},
                    {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('100000')},
                ],
            )

    def test_creer_piece_date_hors_exercice_echoue(self):
        """La date de pièce doit être dans la période de l'exercice."""
        with self.assertRaises(ValidationError):
            EcritureService.creer_piece(
                exercice=self.exercice,
                journal=self.journal_achat,
                date_piece=date(2024, 12, 31),
                libelle='Achat hors exercice',
                lignes_data=[
                    {'compte': self.compte_achats, 'debit': Decimal('100000'), 'credit': Decimal('0')},
                    {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('100000')},
                ],
            )

    def test_creer_piece_moins_de_deux_lignes_echoue(self):
        """Une pièce doit avoir au moins 2 lignes."""
        with self.assertRaises(ValidationError):
            EcritureService.creer_piece(
                exercice=self.exercice,
                journal=self.journal_achat,
                date_piece=date(2025, 3, 15),
                libelle='Achat incomplet',
                lignes_data=[
                    {'compte': self.compte_achats, 'debit': Decimal('100000'), 'credit': Decimal('0')},
                ],
            )

    def test_valider_piece(self):
        """La validation d'une pièce en brouillard doit fonctionner."""
        piece = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_vente,
            date_piece=date(2025, 4, 1),
            libelle='Vente',
            lignes_data=[
                {'compte': self.compte_client, 'debit': Decimal('200000'), 'credit': Decimal('0')},
                {'compte': self.compte_ventes, 'debit': Decimal('0'), 'credit': Decimal('200000')},
            ],
        )
        EcritureService.valider_piece(piece)
        piece.refresh_from_db()
        self.assertEqual(piece.statut, PieceComptable.Statut.VALIDE)

    def test_supprimer_piece_brouillard(self):
        """On peut supprimer une pièce en brouillard."""
        piece = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_achat,
            date_piece=date(2025, 3, 15),
            libelle='À supprimer',
            lignes_data=[
                {'compte': self.compte_achats, 'debit': Decimal('50000'), 'credit': Decimal('0')},
                {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('50000')},
            ],
        )
        piece_id = piece.id
        EcritureService.supprimer_piece(piece)
        self.assertFalse(PieceComptable.objects.filter(id=piece_id).exists())

    def test_supprimer_piece_validee_echoue(self):
        """On ne peut pas supprimer une pièce validée."""
        piece = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_vente,
            date_piece=date(2025, 4, 1),
            libelle='Vente validée',
            lignes_data=[
                {'compte': self.compte_client, 'debit': Decimal('100000'), 'credit': Decimal('0')},
                {'compte': self.compte_ventes, 'debit': Decimal('0'), 'credit': Decimal('100000')},
            ],
        )
        EcritureService.valider_piece(piece)
        with self.assertRaises(ValidationError):
            EcritureService.supprimer_piece(piece)

    def test_numerotation_automatique(self):
        """Les numéros de pièce s'incrémentent automatiquement."""
        for i in range(3):
            piece = EcritureService.creer_piece(
                exercice=self.exercice,
                journal=self.journal_achat,
                date_piece=date(2025, 3, 15),
                libelle=f'Achat {i+1}',
                lignes_data=[
                    {'compte': self.compte_achats, 'debit': Decimal('10000'), 'credit': Decimal('0')},
                    {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('10000')},
                ],
            )

        pieces = PieceComptable.objects.filter(
            exercice=self.exercice, journal=self.journal_achat
        ).order_by('numero_piece')
        self.assertEqual(pieces[0].numero_piece, '000001')
        self.assertEqual(pieces[1].numero_piece, '000002')
        self.assertEqual(pieces[2].numero_piece, '000003')


class LettrageServiceTest(BaseComptaTestCase):
    """Tests pour le service de lettrage."""

    def _creer_ecritures_test(self):
        """Crée des écritures pour tester le lettrage."""
        # Facture client
        piece_facture = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_vente,
            date_piece=date(2025, 3, 1),
            libelle='Facture client',
            lignes_data=[
                {'compte': self.compte_client, 'debit': Decimal('150000'), 'credit': Decimal('0')},
                {'compte': self.compte_ventes, 'debit': Decimal('0'), 'credit': Decimal('150000')},
            ],
        )

        # Règlement client
        piece_reglement = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_banque,
            date_piece=date(2025, 3, 15),
            libelle='Règlement client',
            lignes_data=[
                {'compte': self.compte_banque, 'debit': Decimal('150000'), 'credit': Decimal('0')},
                {'compte': self.compte_client, 'debit': Decimal('0'), 'credit': Decimal('150000')},
            ],
        )

        ligne_facture = piece_facture.lignes.get(compte=self.compte_client)
        ligne_reglement = piece_reglement.lignes.get(compte=self.compte_client)
        return ligne_facture, ligne_reglement

    def test_lettrer_lignes_equilibrees(self):
        """Le lettrage de lignes équilibrées fonctionne."""
        ligne1, ligne2 = self._creer_ecritures_test()
        code = LettrageService.lettrer([ligne1, ligne2])
        self.assertEqual(code, 'AA')

        ligne1.refresh_from_db()
        ligne2.refresh_from_db()
        self.assertEqual(ligne1.lettrage_code, 'AA')
        self.assertEqual(ligne2.lettrage_code, 'AA')

    def test_lettrer_lignes_desequilibrees_echoue(self):
        """Le lettrage de lignes non équilibrées échoue."""
        piece = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_vente,
            date_piece=date(2025, 3, 1),
            libelle='Facture',
            lignes_data=[
                {'compte': self.compte_client, 'debit': Decimal('100000'), 'credit': Decimal('0')},
                {'compte': self.compte_ventes, 'debit': Decimal('0'), 'credit': Decimal('100000')},
            ],
        )
        piece2 = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_banque,
            date_piece=date(2025, 3, 15),
            libelle='Règlement partiel',
            lignes_data=[
                {'compte': self.compte_banque, 'debit': Decimal('50000'), 'credit': Decimal('0')},
                {'compte': self.compte_client, 'debit': Decimal('0'), 'credit': Decimal('50000')},
            ],
        )
        ligne1 = piece.lignes.get(compte=self.compte_client)
        ligne2 = piece2.lignes.get(compte=self.compte_client)

        with self.assertRaises(ValidationError):
            LettrageService.lettrer([ligne1, ligne2])

    def test_lettrer_comptes_differents_echoue(self):
        """Le lettrage entre comptes différents échoue."""
        piece = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_achat,
            date_piece=date(2025, 3, 1),
            libelle='Test',
            lignes_data=[
                {'compte': self.compte_achats, 'debit': Decimal('100000'), 'credit': Decimal('0')},
                {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('100000')},
            ],
        )
        ligne1 = piece.lignes.get(compte=self.compte_achats)
        ligne2 = piece.lignes.get(compte=self.compte_fournisseur)

        with self.assertRaises(ValidationError):
            LettrageService.lettrer([ligne1, ligne2])

    def test_delettrer(self):
        """La suppression du lettrage fonctionne."""
        ligne1, ligne2 = self._creer_ecritures_test()
        LettrageService.lettrer([ligne1, ligne2])
        LettrageService.delettrer([ligne1, ligne2])

        ligne1.refresh_from_db()
        ligne2.refresh_from_db()
        self.assertEqual(ligne1.lettrage_code, '')
        self.assertEqual(ligne2.lettrage_code, '')


class ClotureServiceTest(BaseComptaTestCase):
    """Tests pour le service de clôture."""

    def _creer_ecritures_exercice(self):
        """Crée des écritures validées pour tester la clôture."""
        # Vente
        piece1 = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_vente,
            date_piece=date(2025, 6, 1),
            libelle='Vente',
            lignes_data=[
                {'compte': self.compte_client, 'debit': Decimal('500000'), 'credit': Decimal('0')},
                {'compte': self.compte_ventes, 'debit': Decimal('0'), 'credit': Decimal('500000')},
            ],
        )
        EcritureService.valider_piece(piece1)

        # Achat
        piece2 = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_achat,
            date_piece=date(2025, 6, 15),
            libelle='Achat',
            lignes_data=[
                {'compte': self.compte_achats, 'debit': Decimal('300000'), 'credit': Decimal('0')},
                {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('300000')},
            ],
        )
        EcritureService.valider_piece(piece2)

        # Encaissement
        piece3 = EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_banque,
            date_piece=date(2025, 7, 1),
            libelle='Encaissement',
            lignes_data=[
                {'compte': self.compte_banque, 'debit': Decimal('500000'), 'credit': Decimal('0')},
                {'compte': self.compte_client, 'debit': Decimal('0'), 'credit': Decimal('500000')},
            ],
        )
        EcritureService.valider_piece(piece3)

    def test_cloturer_exercice(self):
        """La clôture crée un nouvel exercice et les reports à nouveau."""
        self._creer_ecritures_exercice()

        nouvel_exercice, piece_report = ClotureService.cloturer_exercice(self.exercice)

        self.exercice.refresh_from_db()
        self.assertEqual(self.exercice.statut, ExerciceComptable.Statut.CLOTURE)
        self.assertEqual(nouvel_exercice.date_debut, date(2026, 1, 1))
        self.assertIsNotNone(piece_report)
        self.assertTrue(piece_report.est_equilibree)

    def test_cloturer_exercice_deja_cloture_echoue(self):
        """Clôturer un exercice déjà clôturé échoue."""
        self.exercice.statut = ExerciceComptable.Statut.CLOTURE
        self.exercice.save()

        with self.assertRaises(ValidationError):
            ClotureService.cloturer_exercice(self.exercice)

    def test_cloturer_avec_brouillards_echoue(self):
        """La clôture échoue s'il reste des pièces en brouillard."""
        EcritureService.creer_piece(
            exercice=self.exercice,
            journal=self.journal_achat,
            date_piece=date(2025, 3, 15),
            libelle='Brouillard',
            lignes_data=[
                {'compte': self.compte_achats, 'debit': Decimal('10000'), 'credit': Decimal('0')},
                {'compte': self.compte_fournisseur, 'debit': Decimal('0'), 'credit': Decimal('10000')},
            ],
        )

        with self.assertRaises(ValidationError):
            ClotureService.cloturer_exercice(self.exercice)


class ContraintesDBTest(BaseComptaTestCase):
    """Tests pour les contraintes de base de données."""

    def test_ligne_debit_et_credit_echoue(self):
        """Une ligne ne peut pas avoir à la fois débit et crédit."""
        piece = PieceComptable.objects.create(
            exercice=self.exercice,
            journal=self.journal_achat,
            numero_piece='TEST01',
            date_piece=date(2025, 3, 15),
            libelle='Test contrainte',
        )

        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            LigneEcriture.objects.create(
                piece=piece,
                compte=self.compte_achats,
                libelle='Ligne invalide',
                debit=Decimal('100000'),
                credit=Decimal('50000'),
            )

    def test_ligne_montants_negatifs_echoue(self):
        """Les montants négatifs sont interdits."""
        piece = PieceComptable.objects.create(
            exercice=self.exercice,
            journal=self.journal_achat,
            numero_piece='TEST02',
            date_piece=date(2025, 3, 15),
            libelle='Test contrainte',
        )

        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            LigneEcriture.objects.create(
                piece=piece,
                compte=self.compte_achats,
                libelle='Ligne invalide',
                debit=Decimal('-100000'),
                credit=Decimal('0'),
            )
