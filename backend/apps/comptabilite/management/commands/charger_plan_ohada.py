from django.core.management.base import BaseCommand
from apps.comptabilite.models import Societe
from apps.comptabilite.services import ProvisionService


class Command(BaseCommand):
    help = 'Charge le plan comptable OHADA pour une société'

    def add_arguments(self, parser):
        parser.add_argument('societe_id', type=int)

    def handle(self, *args, **options):
        societe = Societe.objects.get(id=options['societe_id'])
        ProvisionService.provisionner_plan_ohada(societe)
        self.stdout.write(self.style.SUCCESS(f'Plan OHADA chargé pour {societe.nom}'))
