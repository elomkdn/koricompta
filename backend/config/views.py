import json
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_GET


@csrf_exempt
@require_POST
def session_login(request):
    """Login par session — pour l'application desktop."""
    data = json.loads(request.body)
    username = data.get('username', '')
    password = data.get('password', '')

    user = authenticate(request, username=username, password=password)
    if user is not None:
        login(request, user)
        societe_ids = list(user.societe_accesses.values_list('societe_id', flat=True))
        return JsonResponse({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': user.role,
            'societe_ids': societe_ids,
        })
    return JsonResponse({'error': 'Identifiants incorrects.'}, status=401)


@csrf_exempt
@require_POST
def session_logout(request):
    logout(request)
    return JsonResponse({'message': 'Déconnecté.'})


@require_GET
def session_status(request):
    """Vérifie si l'utilisateur est connecté."""
    if request.user.is_authenticated:
        societe_ids = list(request.user.societe_accesses.values_list('societe_id', flat=True))
        return JsonResponse({
            'id': request.user.id,
            'username': request.user.username,
            'email': request.user.email,
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
            'role': request.user.role,
            'societe_ids': societe_ids,
        })
    return JsonResponse({'error': 'Non authentifié.'}, status=401)
