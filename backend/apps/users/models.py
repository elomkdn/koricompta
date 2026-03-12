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
    societe = models.ForeignKey(
        'comptabilite.Societe',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Société',
        related_name='utilisateurs',
    )

    class Meta:
        verbose_name = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
