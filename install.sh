#!/bin/bash
#
# KoriCompta — Installeur
# Installe les dépendances et configure l'application
#
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$APP_DIR/backend/venv"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       KoriCompta — Installation      ║"
echo "  ║    Développé par Elom Systems        ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Vérifier Python
PYTHON=""
for py in python3.12 python3.11 python3.10 python3; do
    if command -v "$py" &>/dev/null; then
        PYTHON="$py"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "ERREUR : Python 3.10+ est requis."
    echo "Installez-le avec : sudo apt install python3 python3-venv python3-pip"
    exit 1
fi

echo "Python trouvé : $($PYTHON --version)"

# Vérifier les dépendances système GTK (pour pywebview)
if ! python3 -c "import gi; gi.require_version('Gtk', '3.0')" 2>/dev/null; then
    echo ""
    echo "Installation des dépendances système (GTK)..."
    if command -v apt &>/dev/null; then
        sudo apt install -y python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1 2>/dev/null || \
        sudo apt install -y python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.0 2>/dev/null || true
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm python-gobject gtk3 webkit2gtk 2>/dev/null || true
    fi
fi

# Créer le venv avec accès aux packages système (pour GTK)
echo ""
echo "Création de l'environnement Python..."
$PYTHON -m venv --system-site-packages "$VENV_DIR"
source "$VENV_DIR/bin/activate"

echo "Installation des dépendances Python..."
pip install --upgrade pip -q
pip install -r "$APP_DIR/requirements.txt" -q

echo ""
echo "Application des migrations..."
cd "$APP_DIR/backend"
python manage.py migrate --run-syncdb -v0

# Créer un raccourci bureau
DESKTOP_FILE="$HOME/.local/share/applications/koricompta.desktop"
mkdir -p "$(dirname "$DESKTOP_FILE")"
cat > "$DESKTOP_FILE" << DESKTOP
[Desktop Entry]
Name=KoriCompta
Comment=Comptabilité OHADA — Développé par Elom Systems
Exec=bash -c 'cd "$APP_DIR" && source backend/venv/bin/activate && python kompta.py'
Terminal=false
Type=Application
Categories=Office;Finance;
StartupWMClass=KoriCompta
DESKTOP

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       Installation terminée !        ║"
echo "  ╠══════════════════════════════════════╣"
echo "  ║  Lancer : ./koricompta              ║"
echo "  ║  Ou depuis le menu Applications      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
