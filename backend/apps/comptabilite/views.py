import csv
import io
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db.models import Sum, Q
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import (
    Societe, ClasseCompte, Compte, ExerciceComptable, JournalComptable,
    PieceComptable, LigneEcriture, Tiers, ReleveBancaire, LigneReleve,
    ModeleEcriture, LigneModeleEcriture, Immobilisation,
)
from .serializers import (
    SocieteSerializer, ClasseCompteSerializer, CompteSerializer, CompteListSerializer,
    ExerciceComptableSerializer, JournalComptableSerializer,
    PieceComptableSerializer, PieceComptableCreateSerializer,
    TiersSerializer, ReleveBancaireSerializer, LigneReleveSerializer,
    ModeleEcritureSerializer, LigneModeleSerializer, ImmobilisationSerializer,
)
from .services import EcritureService, LettrageService, ClotureService, RapprochementService, ProvisionService


class SocieteViewSet(viewsets.ModelViewSet):
    queryset = Societe.objects.all()
    serializer_class = SocieteSerializer
    pagination_class = None
    filter_backends = [SearchFilter]
    search_fields = ['nom', 'sigle']

    def perform_create(self, serializer):
        societe = serializer.save()
        ProvisionService.provisionner_plan_ohada(societe)

    @action(detail=True, methods=['post'])
    def provisionner(self, request, pk=None):
        """Provisioner une société avec le plan OHADA de base."""
        societe = self.get_object()
        ProvisionService.provisionner_plan_ohada(societe)
        return Response({'status': 'provisionné'})


class ClasseCompteViewSet(viewsets.ModelViewSet):
    queryset = ClasseCompte.objects.all()
    serializer_class = ClasseCompteSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['societe']


class CompteViewSet(viewsets.ModelViewSet):
    queryset = Compte.objects.select_related('classe', 'parent').all()
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['societe', 'classe', 'type_compte', 'nature', 'lettrable', 'est_tiers', 'actif']
    search_fields = ['numero', 'intitule']
    ordering_fields = ['numero', 'intitule']
    ordering = ['numero']

    def get_serializer_class(self):
        if self.action in ['list']:
            return CompteListSerializer
        return CompteSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        page_size = self.request.query_params.get('page_size')
        if page_size == '9999':
            self.pagination_class = None
        return qs

    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Retourne l'arbre complet des comptes (racines avec sous_comptes imbriqués)."""
        societe_id = request.query_params.get('societe')
        if not societe_id:
            return Response({'error': 'societe requis'}, status=400)
        racines = Compte.objects.filter(
            societe=societe_id, parent=None
        ).order_by('numero')
        serializer = CompteSerializer(racines, many=True)
        return Response(serializer.data)


class ExerciceComptableViewSet(viewsets.ModelViewSet):
    queryset = ExerciceComptable.objects.all()
    serializer_class = ExerciceComptableSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['societe', 'statut']

    @action(detail=True, methods=['post'])
    def cloture(self, request, pk=None):
        exercice = self.get_object()
        try:
            nouvel_exercice, piece = ClotureService.cloturer_exercice(exercice)
            return Response({
                'nouvel_exercice': ExerciceComptableSerializer(nouvel_exercice).data,
                'piece_report_id': piece.id if piece else None,
            })
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class JournalComptableViewSet(viewsets.ModelViewSet):
    queryset = JournalComptable.objects.all()
    serializer_class = JournalComptableSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['societe', 'type_journal', 'actif']
    search_fields = ['code', 'intitule']


class PieceComptableViewSet(viewsets.ModelViewSet):
    queryset = PieceComptable.objects.select_related('journal', 'exercice').prefetch_related('lignes__compte', 'lignes__tiers').all()
    serializer_class = PieceComptableSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['exercice', 'journal', 'statut']
    search_fields = ['numero_piece', 'libelle', 'reference']
    ordering_fields = ['date_piece', 'numero_piece', 'created_at']
    ordering = ['-date_piece', '-numero_piece']

    def get_queryset(self):
        qs = super().get_queryset()
        page_size = self.request.query_params.get('page_size')
        if page_size:
            try:
                self.paginator.page_size = int(page_size)
            except (AttributeError, ValueError):
                pass
        return qs

    def create(self, request, *args, **kwargs):
        serializer = PieceComptableCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            exercice = ExerciceComptable.objects.get(id=data['exercice_id'])
            journal = JournalComptable.objects.get(id=data['journal_id'])
        except (ExerciceComptable.DoesNotExist, JournalComptable.DoesNotExist) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        lignes_data = []
        for ligne in data['lignes']:
            try:
                compte = Compte.objects.get(id=ligne['compte_id'])
            except Compte.DoesNotExist:
                return Response(
                    {'error': f"Compte {ligne.get('compte_id')} introuvable."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            tiers = None
            if ligne.get('tiers_id'):
                try:
                    tiers = Tiers.objects.get(id=ligne['tiers_id'])
                except Tiers.DoesNotExist:
                    pass

            lignes_data.append({
                'compte': compte,
                'libelle': ligne.get('libelle', data['libelle']),
                'debit': Decimal(str(ligne.get('debit', '0'))),
                'credit': Decimal(str(ligne.get('credit', '0'))),
                'tiers': tiers,
            })

        try:
            piece = EcritureService.creer_piece(
                exercice=exercice,
                journal=journal,
                date_piece=data['date_piece'],
                libelle=data['libelle'],
                reference=data.get('reference', ''),
                lignes_data=lignes_data,
            )
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PieceComptableSerializer(piece).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        piece = self.get_object()
        try:
            EcritureService.supprimer_piece(piece)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def valider(self, request, pk=None):
        piece = self.get_object()
        try:
            EcritureService.valider_piece(piece)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PieceComptableSerializer(piece).data)

    @action(detail=True, methods=['delete'], url_path='forcer_suppression')
    def forcer_suppression(self, request, pk=None):
        """Suppression forcée même pour les pièces validées."""
        piece = self.get_object()
        try:
            EcritureService.supprimer_piece(piece, force=True)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LigneEcritureViewSet(viewsets.ModelViewSet):
    queryset = LigneEcriture.objects.select_related('compte', 'tiers').all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['piece', 'compte', 'lettrage_code']

    def get_serializer_class(self):
        from .serializers import LigneEcritureSerializer
        return LigneEcritureSerializer

    @action(detail=False, methods=['post'])
    def lettrer(self, request):
        ids = request.data.get('ligne_ids', [])
        if len(ids) < 2:
            return Response({'error': 'Au moins 2 lignes requises.'}, status=400)
        lignes = list(LigneEcriture.objects.filter(id__in=ids))
        try:
            code = LettrageService.lettrer(lignes)
        except ValidationError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'code': code})

    @action(detail=False, methods=['post'])
    def delettrer(self, request):
        ids = request.data.get('ligne_ids', [])
        lignes = list(LigneEcriture.objects.filter(id__in=ids))
        LettrageService.delettrer(lignes)
        return Response({'status': 'ok'})


class TiersViewSet(viewsets.ModelViewSet):
    queryset = Tiers.objects.select_related('compte_collectif').all()
    serializer_class = TiersSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['societe', 'type_tiers', 'actif']
    search_fields = ['code', 'nom']

    def get_queryset(self):
        qs = super().get_queryset()
        page_size = self.request.query_params.get('page_size')
        if page_size == '9999':
            self.pagination_class = None
        return qs


class ReleveBancaireViewSet(viewsets.ModelViewSet):
    queryset = ReleveBancaire.objects.prefetch_related('lignes').all()
    serializer_class = ReleveBancaireSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['societe', 'exercice', 'compte_banque']

    @action(detail=True, methods=['post'])
    def importer_lignes(self, request, pk=None):
        releve = self.get_object()
        lignes_data = request.data.get('lignes', [])
        for l in lignes_data:
            LigneReleve.objects.create(
                releve=releve,
                date_operation=l['date_operation'],
                libelle=l['libelle'],
                reference=l.get('reference', ''),
                montant=Decimal(str(l['montant'])),
            )
        releve.mettre_a_jour_stats()
        return Response(ReleveBancaireSerializer(releve).data)

    @action(detail=True, methods=['post'])
    def rapprocher_auto(self, request, pk=None):
        releve = self.get_object()
        nb = RapprochementService.rapprocher_auto(releve)
        return Response({'rapproches': nb, 'releve': ReleveBancaireSerializer(releve).data})

    @action(detail=False, methods=['post'])
    def rapprocher_manuel(self, request):
        ligne_releve_id = request.data.get('ligne_releve_id')
        ligne_ecriture_id = request.data.get('ligne_ecriture_id')
        try:
            ligne_releve = LigneReleve.objects.get(id=ligne_releve_id)
            ligne_ecriture = LigneEcriture.objects.get(id=ligne_ecriture_id)
        except (LigneReleve.DoesNotExist, LigneEcriture.DoesNotExist) as e:
            return Response({'error': str(e)}, status=400)
        RapprochementService.rapprocher_manuel(ligne_releve, ligne_ecriture)
        return Response({'status': 'ok'})

    @action(detail=False, methods=['post'])
    def derapprocher(self, request):
        ligne_releve_id = request.data.get('ligne_releve_id')
        try:
            ligne_releve = LigneReleve.objects.get(id=ligne_releve_id)
        except LigneReleve.DoesNotExist as e:
            return Response({'error': str(e)}, status=400)
        RapprochementService.derapprocher(ligne_releve)
        return Response({'status': 'ok'})


class ImmobilisationViewSet(viewsets.ModelViewSet):
    queryset = Immobilisation.objects.select_related('compte').all()
    serializer_class = ImmobilisationSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['societe', 'exercice', 'actif']
    search_fields = ['designation', 'reference']

    @action(detail=True, methods=['get'])
    def tableau_amortissement(self, request, pk=None):
        immo = self.get_object()
        return Response(immo.tableau_amortissement())

    @action(detail=True, methods=['post'])
    def comptabiliser(self, request, pk=None):
        immo = self.get_object()
        exercice_id = request.data.get('exercice_id')
        try:
            exercice = ExerciceComptable.objects.get(id=exercice_id)
        except ExerciceComptable.DoesNotExist:
            return Response({'error': 'Exercice introuvable.'}, status=400)

        annuite = immo.calculer_amortissement_annuel()
        compte_amort = Compte.objects.filter(
            societe=immo.societe, numero__startswith='28'
        ).first()
        compte_dotation = Compte.objects.filter(
            societe=immo.societe, numero__startswith='68'
        ).first()

        if not compte_amort or not compte_dotation:
            return Response({'error': 'Comptes d\'amortissement introuvables (28x, 68x).'}, status=400)

        journal_od = JournalComptable.objects.filter(
            societe=immo.societe, type_journal='od'
        ).first()
        if not journal_od:
            return Response({'error': 'Journal OD introuvable.'}, status=400)

        try:
            piece = EcritureService.creer_piece(
                exercice=exercice,
                journal=journal_od,
                date_piece=exercice.date_fin,
                libelle=f'Dotation amortissement {immo.designation}',
                lignes_data=[
                    {'compte': compte_dotation, 'debit': annuite, 'credit': Decimal('0'),
                     'libelle': f'Dotation {immo.designation}'},
                    {'compte': compte_amort, 'debit': Decimal('0'), 'credit': annuite,
                     'libelle': f'Amortissement {immo.designation}'},
                ],
            )
        except ValidationError as e:
            return Response({'error': str(e)}, status=400)

        return Response({'piece_id': piece.id, 'annuite': str(annuite)})


class ModeleEcritureViewSet(viewsets.ModelViewSet):
    queryset = ModeleEcriture.objects.prefetch_related('lignes__compte').all()
    serializer_class = ModeleEcritureSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['societe', 'journal']
    search_fields = ['code', 'libelle']

    @action(detail=True, methods=['post'])
    def appliquer(self, request, pk=None):
        modele = self.get_object()
        exercice_id = request.data.get('exercice_id')
        journal_id = request.data.get('journal_id')
        date_piece = request.data.get('date_piece')
        libelle = request.data.get('libelle', modele.libelle)

        try:
            exercice = ExerciceComptable.objects.get(id=exercice_id)
            journal = JournalComptable.objects.get(id=journal_id)
        except (ExerciceComptable.DoesNotExist, JournalComptable.DoesNotExist) as e:
            return Response({'error': str(e)}, status=400)

        from datetime import date as date_type
        try:
            from datetime import datetime
            date_obj = datetime.strptime(date_piece, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response({'error': 'Format de date invalide (YYYY-MM-DD).'}, status=400)

        lignes_data = []
        for ligne in modele.lignes.all().order_by('ordre'):
            if ligne.compte:
                lignes_data.append({
                    'compte': ligne.compte,
                    'libelle': ligne.libelle or libelle,
                    'debit': ligne.debit,
                    'credit': ligne.credit,
                })

        if not lignes_data:
            return Response({'error': 'Le modèle n\'a pas de lignes.'}, status=400)

        try:
            piece = EcritureService.creer_piece(
                exercice=exercice,
                journal=journal,
                date_piece=date_obj,
                libelle=libelle,
                lignes_data=lignes_data,
            )
        except ValidationError as e:
            return Response({'error': str(e)}, status=400)

        return Response(PieceComptableSerializer(piece).data, status=201)


class ConsultationCompteView(APIView):
    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')
        compte_id = request.query_params.get('compte')
        compte_numero = request.query_params.get('compte_numero')

        if not societe_id or not exercice_id:
            return Response({'error': 'societe et exercice requis.'}, status=400)

        from .models import Compte as CompteModel
        comptes = CompteModel.objects.filter(societe=societe_id)
        if compte_id:
            comptes = comptes.filter(id=compte_id)
        elif compte_numero:
            comptes = comptes.filter(numero=compte_numero)

        exercice = ExerciceComptable.objects.get(id=exercice_id)
        results = []

        for compte in comptes:
            lignes = LigneEcriture.objects.filter(
                compte=compte,
                piece__exercice=exercice,
                piece__statut='valide',
            ).select_related('piece', 'piece__journal').order_by('piece__date_piece', 'piece__numero_piece')

            total_debit = lignes.aggregate(s=Sum('debit'))['s'] or Decimal('0')
            total_credit = lignes.aggregate(s=Sum('credit'))['s'] or Decimal('0')
            solde = total_debit - total_credit

            solde_progressif = Decimal('0')
            lignes_data = []
            for l in lignes:
                solde_progressif += l.debit - l.credit
                lignes_data.append({
                    'id': l.id,
                    'date_piece': str(l.piece.date_piece),
                    'numero_piece': l.piece.numero_piece,
                    'journal_code': l.piece.journal.code,
                    'libelle': l.libelle or l.piece.libelle,
                    'debit': str(l.debit),
                    'credit': str(l.credit),
                    'lettrage_code': l.lettrage_code,
                    'solde_progressif': str(solde_progressif),
                })

            from .serializers import CompteListSerializer as CLS
            results.append({
                'compte': CLS(compte).data,
                'solde_debit': str(total_debit),
                'solde_credit': str(total_credit),
                'solde': str(solde),
                'lignes': lignes_data,
            })

        return Response(results)




class DeclarationTVAView(APIView):
    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')
        if not societe_id or not exercice_id:
            return Response({'error': 'societe et exercice requis.'}, status=400)

        exercice = ExerciceComptable.objects.get(id=exercice_id)

        tva_collectee = LigneEcriture.objects.filter(
            piece__exercice=exercice,
            piece__statut='valide',
            compte__numero__startswith='443',
        ).aggregate(total=Sum('credit'))['total'] or Decimal('0')

        tva_deductible = LigneEcriture.objects.filter(
            piece__exercice=exercice,
            piece__statut='valide',
            compte__numero__startswith='445',
        ).aggregate(total=Sum('debit'))['total'] or Decimal('0')

        return Response({
            'tva_collectee': str(tva_collectee),
            'tva_deductible': str(tva_deductible),
            'tva_a_payer': str(tva_collectee - tva_deductible),
        })


class BackupView(APIView):
    def get(self, request):
        import shutil
        from django.conf import settings
        db_path = settings.DATABASES['default']['NAME']
        response = HttpResponse(content_type='application/octet-stream')
        response['Content-Disposition'] = 'attachment; filename="kompta_backup.db"'
        with open(db_path, 'rb') as f:
            response.write(f.read())
        return response

    def post(self, request):
        import shutil
        from django.conf import settings
        backup_file = request.FILES.get('backup_file')
        if not backup_file:
            return Response({'error': 'Fichier backup requis.'}, status=400)
        db_path = settings.DATABASES['default']['NAME']
        with open(db_path, 'wb') as f:
            for chunk in backup_file.chunks():
                f.write(chunk)
        return Response({'status': 'restauré'})


class BalanceAgeeView(APIView):
    def get(self, request):
        from datetime import date as date_type
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')
        type_tiers = request.query_params.get('type_tiers', 'client')
        if not societe_id or not exercice_id:
            return Response({'error': 'societe et exercice requis.'}, status=400)

        exercice = ExerciceComptable.objects.get(id=exercice_id)
        today = date_type.today()

        if type_tiers == 'client':
            prefixes = ['411', '412', '413']
        else:
            prefixes = ['401', '402', '403']

        q_filter = Q()
        for p in prefixes:
            q_filter |= Q(numero__startswith=p)
        comptes = Compte.objects.filter(societe=societe_id).filter(q_filter)

        results = []
        for compte in comptes:
            lignes = LigneEcriture.objects.filter(
                compte=compte,
                piece__exercice=exercice,
                piece__statut='valide',
                lettrage_code='',
            ).select_related('piece')

            non_echues = Decimal('0')
            tranche_0_30 = Decimal('0')
            tranche_30_60 = Decimal('0')
            tranche_60_90 = Decimal('0')
            tranche_90_plus = Decimal('0')

            for l in lignes:
                solde = l.debit - l.credit
                jours = (today - l.piece.date_piece).days
                if jours <= 0:
                    non_echues += solde
                elif jours <= 30:
                    tranche_0_30 += solde
                elif jours <= 60:
                    tranche_30_60 += solde
                elif jours <= 90:
                    tranche_60_90 += solde
                else:
                    tranche_90_plus += solde

            total = non_echues + tranche_0_30 + tranche_30_60 + tranche_60_90 + tranche_90_plus
            if total != Decimal('0'):
                results.append({
                    'compte_numero': compte.numero,
                    'compte_intitule': compte.intitule,
                    'non_echues': str(non_echues),
                    'tranche_0_30': str(tranche_0_30),
                    'tranche_30_60': str(tranche_30_60),
                    'tranche_60_90': str(tranche_60_90),
                    'tranche_90_plus': str(tranche_90_plus),
                    'total': str(total),
                })

        return Response(results)


class JournalCentralisateurView(APIView):
    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')
        if not societe_id or not exercice_id:
            return Response({'error': 'societe et exercice requis.'}, status=400)

        exercice = ExerciceComptable.objects.get(id=exercice_id)
        journaux = JournalComptable.objects.filter(societe=societe_id, actif=True)
        results = []
        total_general_debit = Decimal('0')
        total_general_credit = Decimal('0')

        for journal in journaux:
            pieces = PieceComptable.objects.filter(
                exercice=exercice, journal=journal, statut='valide'
            )
            nb_pieces = pieces.count()
            totaux = LigneEcriture.objects.filter(
                piece__in=pieces
            ).aggregate(total_debit=Sum('debit'), total_credit=Sum('credit'))
            td = totaux['total_debit'] or Decimal('0')
            tc = totaux['total_credit'] or Decimal('0')
            total_general_debit += td
            total_general_credit += tc

            results.append({
                'journal_code': journal.code,
                'journal_intitule': journal.intitule,
                'nb_pieces': nb_pieces,
                'total_debit': str(td),
                'total_credit': str(tc),
                'solde': str(td - tc),
            })

        return Response({
            'journaux': results,
            'total_debit': str(total_general_debit),
            'total_credit': str(total_general_credit),
        })


class GrandLivreAuxiliaireView(APIView):
    def get(self, request):
        from itertools import groupby
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')
        tiers_id = request.query_params.get('tiers')
        if not societe_id or not exercice_id:
            return Response({'error': 'societe et exercice requis.'}, status=400)

        exercice = ExerciceComptable.objects.get(id=exercice_id)
        qs = LigneEcriture.objects.filter(
            piece__exercice=exercice,
            piece__statut='valide',
            tiers__isnull=False,
            compte__societe=societe_id,
        ).select_related('piece', 'piece__journal', 'compte', 'tiers')

        if tiers_id:
            qs = qs.filter(tiers_id=tiers_id)

        qs = qs.order_by('tiers__nom', 'piece__date_piece')

        results = []
        for tiers_obj, group in groupby(qs, key=lambda l: l.tiers):
            lignes_list = list(group)
            total_debit = sum(l.debit for l in lignes_list)
            total_credit = sum(l.credit for l in lignes_list)
            results.append({
                'tiers_id': tiers_obj.id,
                'tiers_code': tiers_obj.code,
                'tiers_nom': tiers_obj.nom,
                'solde_debit': str(total_debit),
                'solde_credit': str(total_credit),
                'solde': str(total_debit - total_credit),
                'lignes': [{
                    'date_piece': str(l.piece.date_piece),
                    'numero_piece': l.piece.numero_piece,
                    'journal_code': l.piece.journal.code,
                    'compte_numero': l.compte.numero,
                    'libelle': l.libelle or l.piece.libelle,
                    'debit': str(l.debit),
                    'credit': str(l.credit),
                } for l in lignes_list],
            })

        return Response(results)


