from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.http import HttpResponse

from apps.comptabilite.models import Societe, ExerciceComptable
from apps.comptabilite.permissions import get_accessible_societe_ids
from .generators.grand_livre import GrandLivreGenerator
from .generators.balance import BalanceGenerator
from .generators.bilan import BilanGenerator
from .generators.compte_resultat import CompteResultatGenerator
from .generators.tft import TFTGenerator
from .generators.notes_annexes import NotesAnnexesGenerator
from .exports.excel_export import ExcelExporter


class GrandLivreView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')
        compte_debut = request.query_params.get('compte_debut')
        compte_fin = request.query_params.get('compte_fin')
        export_format = request.query_params.get('format')

        if not societe_id or not exercice_id:
            return Response(
                {'error': 'Les paramètres societe et exercice sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = get_accessible_societe_ids(request.user)
        if ids is not None and int(societe_id) not in ids:
            return Response({'error': 'Accès refusé'}, status=403)

        societe = Societe.objects.get(id=societe_id)
        exercice = ExerciceComptable.objects.get(id=exercice_id)

        data = GrandLivreGenerator.generer(societe, exercice, compte_debut, compte_fin)

        if export_format == 'excel':
            excel_data = ExcelExporter.exporter_grand_livre(data, societe.nom, exercice.code)
            response = HttpResponse(
                excel_data,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = f'attachment; filename="grand_livre_{exercice.code}.xlsx"'
            return response

        # Sérialiser les Decimal pour JSON
        return Response(_serialize_data(data))


class BalanceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')
        niveau = request.query_params.get('niveau')
        export_format = request.query_params.get('format')

        if not societe_id or not exercice_id:
            return Response(
                {'error': 'Les paramètres societe et exercice sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = get_accessible_societe_ids(request.user)
        if ids is not None and int(societe_id) not in ids:
            return Response({'error': 'Accès refusé'}, status=403)

        societe = Societe.objects.get(id=societe_id)
        exercice = ExerciceComptable.objects.get(id=exercice_id)

        data = BalanceGenerator.generer(
            societe, exercice,
            niveau=int(niveau) if niveau else None,
        )

        if export_format == 'excel':
            excel_data = ExcelExporter.exporter_balance(data, societe.nom, exercice.code)
            response = HttpResponse(
                excel_data,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = f'attachment; filename="balance_{exercice.code}.xlsx"'
            return response

        return Response(_serialize_data(data))


class BilanView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')

        if not societe_id or not exercice_id:
            return Response(
                {'error': 'Les paramètres societe et exercice sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = get_accessible_societe_ids(request.user)
        if ids is not None and int(societe_id) not in ids:
            return Response({'error': 'Accès refusé'}, status=403)

        societe = Societe.objects.get(id=societe_id)
        exercice = ExerciceComptable.objects.get(id=exercice_id)

        data = BilanGenerator.generer(societe, exercice)
        return Response(_serialize_data(data))


class CompteResultatView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')

        if not societe_id or not exercice_id:
            return Response(
                {'error': 'Les paramètres societe et exercice sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = get_accessible_societe_ids(request.user)
        if ids is not None and int(societe_id) not in ids:
            return Response({'error': 'Accès refusé'}, status=403)

        societe = Societe.objects.get(id=societe_id)
        exercice = ExerciceComptable.objects.get(id=exercice_id)

        data = CompteResultatGenerator.generer(societe, exercice)
        return Response(_serialize_data(data))


class TFTView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')

        if not societe_id or not exercice_id:
            return Response(
                {'error': 'Les paramètres societe et exercice sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = get_accessible_societe_ids(request.user)
        if ids is not None and int(societe_id) not in ids:
            return Response({'error': 'Accès refusé'}, status=403)

        societe = Societe.objects.get(id=societe_id)
        exercice = ExerciceComptable.objects.get(id=exercice_id)

        data = TFTGenerator.generer(societe, exercice)
        return Response(_serialize_data(data))


class NotesAnnexesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        societe_id = request.query_params.get('societe')
        exercice_id = request.query_params.get('exercice')

        if not societe_id or not exercice_id:
            return Response(
                {'error': 'Les paramètres societe et exercice sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = get_accessible_societe_ids(request.user)
        if ids is not None and int(societe_id) not in ids:
            return Response({'error': 'Accès refusé'}, status=403)

        societe = Societe.objects.get(id=societe_id)
        exercice = ExerciceComptable.objects.get(id=exercice_id)

        data = NotesAnnexesGenerator.generer(societe, exercice)
        return Response(_serialize_data(data))


def _serialize_data(obj):
    """Convertit récursivement les Decimal en str pour la sérialisation JSON."""
    from decimal import Decimal
    from datetime import date

    if isinstance(obj, dict):
        return {k: _serialize_data(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_serialize_data(item) for item in obj]
    elif isinstance(obj, Decimal):
        return str(obj)
    elif isinstance(obj, date):
        return obj.isoformat()
    return obj
