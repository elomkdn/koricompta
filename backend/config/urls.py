from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views
from django.views.static import serve as static_serve

from .views import session_login, session_logout, session_status

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth par session (desktop offline)
    path('api/auth/login/', session_login, name='session_login'),
    path('api/auth/logout/', session_logout, name='session_logout'),
    path('api/auth/status/', session_status, name='session_status'),

    # API
    path('api/users/', include('apps.users.urls')),
    path('api/comptabilite/', include('apps.comptabilite.urls')),
    path('api/rapports/', include('apps.rapports.urls')),
]

# Servir les assets statiques du frontend
if settings.FRONTEND_DIR.exists():
    urlpatterns += static('/assets/', document_root=settings.FRONTEND_DIR / 'assets')
    # Servir logo.svg à la racine
    urlpatterns += [
        path('logo.svg', static_serve, {'document_root': settings.FRONTEND_DIR, 'path': 'logo.svg'}),
    ]
    # Toute route non-API → index.html du frontend (SPA routing)
    urlpatterns += [
        re_path(r'^(?!api/|admin/|static/).*$',
                TemplateView.as_view(template_name='index.html'),
                name='frontend'),
    ]
