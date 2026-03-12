from django.urls import path
from .views import GrandLivreView, BalanceView, BilanView, CompteResultatView

urlpatterns = [
    path('grand-livre/', GrandLivreView.as_view(), name='grand_livre'),
    path('balance/', BalanceView.as_view(), name='balance'),
    path('bilan/', BilanView.as_view(), name='bilan'),
    path('compte-resultat/', CompteResultatView.as_view(), name='compte_resultat'),
]
