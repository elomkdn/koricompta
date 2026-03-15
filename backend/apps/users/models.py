from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Administrateur'
        COMPTABLE = 'comptable', 'Comptable'
        CONSULTANT = 'consultant', 'Consultant (lecture seule)'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.COMPTABLE,
        verbose_name='Rôle',
    )

    class Meta:
        verbose_name = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"


class UserSocieteAccess(models.Model):
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='societe_accesses',
    )
    societe = models.ForeignKey(
        'comptabilite.Societe',
        on_delete=models.CASCADE,
        related_name='user_accesses',
    )

    class Meta:
        unique_together = ['user', 'societe']
        verbose_name = 'Accès société'
        verbose_name_plural = 'Accès sociétés'

    def __str__(self):
        return f"{self.user} → {self.societe}"
