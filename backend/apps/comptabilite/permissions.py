from rest_framework import permissions


def get_accessible_societe_ids(user):
    """Returns list of societe IDs accessible to the user, or None for superuser (all)."""
    if user.is_superuser:
        return None
    return list(user.societe_accesses.values_list('societe_id', flat=True))


class SocieteFilterMixin:
    """
    Mixin for ViewSets that restricts queryset to societes the current user can access.
    Set `societe_lookup` to the field path from the model to societe (default: 'societe_id').
    For SocieteViewSet itself, use societe_lookup = 'id'.
    """
    societe_lookup = 'societe_id'

    def get_queryset(self):
        qs = super().get_queryset()
        ids = get_accessible_societe_ids(self.request.user)
        if ids is None:
            return qs
        if not ids:
            return qs.none()
        return qs.filter(**{f'{self.societe_lookup}__in': ids})


class IsNotConsultantOrReadOnly(permissions.BasePermission):
    """
    Consultants have read-only access. Admins and comptables have full access.
    Superusers always have full access.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        return request.user.role != 'consultant'
