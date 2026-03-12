#!/usr/bin/env python3
"""
KoriCompta — Application de Comptabilité Desktop
Développé par Elom Systems
Lance Django en arrière-plan + ouvre une fenêtre native via pywebview.
"""
import os
import sys
import time
import socket
import threading
import subprocess
from pathlib import Path

# Chemins
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / 'backend'
FRONTEND_DIR = ROOT_DIR / 'frontend'
DATA_DIR = BACKEND_DIR / 'data'

# S'assurer que le dossier data existe
DATA_DIR.mkdir(exist_ok=True)

# Ajouter le backend au PYTHONPATH
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(str(BACKEND_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

HOST = '127.0.0.1'
PORT = 18741  # Port local non standard pour éviter les conflits


def find_free_port(start=18741):
    """Trouve un port libre."""
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    return start


def init_database():
    """Initialise la base de données et crée l'admin si premier lancement."""
    import django
    django.setup()

    from django.core.management import call_command
    from apps.users.models import User

    # Migrations automatiques
    call_command('migrate', '--run-syncdb', verbosity=0)

    # Premier lancement : créer l'utilisateur admin
    if not User.objects.exists():
        print("[KoriCompta] Premier lancement — création de l'utilisateur admin...")
        admin = User.objects.create_superuser(
            username='admin',
            password='admin',
            email='admin@local',
            first_name='Administrateur',
            role='admin',
        )

        # Créer une société de démo
        from apps.comptabilite.models import Societe, ExerciceComptable, JournalComptable
        from datetime import date

        societe = Societe.objects.create(
            nom='Ma Société',
            sigle='SOCIETE',
            devise='XOF',
            regime_fiscal='reel_normal',
        )
        admin.societe = societe
        admin.save()

        # Exercice courant
        annee = date.today().year
        ExerciceComptable.objects.create(
            societe=societe,
            code=str(annee),
            libelle=f'Exercice {annee}',
            date_debut=date(annee, 1, 1),
            date_fin=date(annee, 12, 31),
        )

        # Journaux de base
        for code, intitule, type_j in [
            ('ACH', 'Achats', 'achat'),
            ('VTE', 'Ventes', 'vente'),
            ('BQ', 'Banque', 'banque'),
            ('CAI', 'Caisse', 'caisse'),
            ('OD', 'Opérations Diverses', 'od'),
        ]:
            JournalComptable.objects.create(
                societe=societe, code=code, intitule=intitule, type_journal=type_j
            )

        # Charger le plan comptable OHADA
        call_command('charger_plan_ohada', societe.id, verbosity=0)

        print("[KoriCompta] Base initialisée : admin/admin, plan OHADA chargé.")


def run_django(port):
    """Lance le serveur Django dans un thread."""
    from django.core.management import call_command
    call_command('runserver', f'{HOST}:{port}', '--noreload', verbosity=0)


def wait_for_server(port, timeout=15):
    """Attend que le serveur Django soit prêt."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((HOST, port), timeout=1):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.2)
    return False


def main():
    import webbrowser

    port = find_free_port(PORT)
    url = f'http://{HOST}:{port}'

    print(f"[KoriCompta] Initialisation de la base de données...")
    init_database()

    print(f"[KoriCompta] Démarrage du serveur sur {url}...")
    server_thread = threading.Thread(target=run_django, args=(port,), daemon=True)
    server_thread.start()

    if not wait_for_server(port):
        print("[KoriCompta] ERREUR: Le serveur n'a pas démarré.")
        sys.exit(1)

    print(f"[KoriCompta] Ouverture dans le navigateur : {url}")
    webbrowser.open(url)

    print("[KoriCompta] Serveur actif. Fermez ce terminal pour arrêter.")
    try:
        server_thread.join()
    except KeyboardInterrupt:
        print("\n[KoriCompta] Arrêt.")


if __name__ == '__main__':
    main()
