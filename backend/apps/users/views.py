from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import User, UserSocieteAccess
from .serializers import UserSerializer, UserCreateSerializer, UserSocieteAccessSerializer


class IsAdminRoleOrSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_superuser or request.user.role == 'admin'


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.prefetch_related('societe_accesses').all()
    serializer_class = UserSerializer

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsAdminRoleOrSuperuser()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)


class UserSocieteAccessViewSet(viewsets.ModelViewSet):
    serializer_class = UserSocieteAccessSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRoleOrSuperuser]

    def get_queryset(self):
        qs = UserSocieteAccess.objects.select_related('user', 'societe').all()
        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)
        return qs
