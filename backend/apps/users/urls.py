from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, UserSocieteAccessViewSet

router = DefaultRouter()
router.register('accesses', UserSocieteAccessViewSet, basename='user-societe-access')
router.register('', UserViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
