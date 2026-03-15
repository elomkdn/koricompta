from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SocieteViewSet, ClasseCompteViewSet, CompteViewSet,
    ExerciceComptableViewSet,
    JournalComptableViewSet,
    PieceComptableViewSet, LigneEcritureViewSet,
    TiersViewSet,
    ReleveBancaireViewSet,
    ImmobilisationViewSet,
    ModeleEcritureViewSet,
    ConsultationCompteView,
    DeclarationTVAView, BackupView,
    BalanceAgeeView, JournalCentralisateurView, GrandLivreAuxiliaireView,
    AnalyserFactureView, AuditLogView,
)

router = DefaultRouter()
router.register('societes', SocieteViewSet)
router.register('classes', ClasseCompteViewSet)
router.register('comptes', CompteViewSet)
router.register('exercices', ExerciceComptableViewSet)
router.register('journaux', JournalComptableViewSet)
router.register('pieces', PieceComptableViewSet)
router.register('lignes', LigneEcritureViewSet)
router.register('tiers', TiersViewSet)
router.register('releves', ReleveBancaireViewSet)
router.register('immobilisations', ImmobilisationViewSet)
router.register('modeles-ecritures', ModeleEcritureViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('consultation/', ConsultationCompteView.as_view(), name='consultation_compte'),
path('declaration-tva/', DeclarationTVAView.as_view(), name='declaration_tva'),
    path('backup/', BackupView.as_view(), name='backup'),
    path('balance-agee/', BalanceAgeeView.as_view(), name='balance_agee'),
    path('journal-centralisateur/', JournalCentralisateurView.as_view(), name='journal_centralisateur'),
    path('grand-livre-auxiliaire/', GrandLivreAuxiliaireView.as_view(), name='grand_livre_auxiliaire'),
    path('factures/analyser/', AnalyserFactureView.as_view(), name='analyser_facture'),
    path('audit-log/', AuditLogView.as_view(), name='audit_log'),
]
