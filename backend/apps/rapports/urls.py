from django.urls import path
from .views import GrandLivreView, BalanceView, BilanView, CompteResultatView, TFTView, NotesAnnexesView

urlpatterns = [
    path('grand-livre/', GrandLivreView.as_view(), name='grand_livre'),
    path('balance/', BalanceView.as_view(), name='balance'),
    path('bilan/', BilanView.as_view(), name='bilan'),
    path('compte-resultat/', CompteResultatView.as_view(), name='compte_resultat'),
    path('tft/', TFTView.as_view(), name='tft'),
    path('notes-annexes/', NotesAnnexesView.as_view(), name='notes_annexes'),
]
