from django.utils.deprecation import MiddlewareMixin


class DisableCSRFForAPI(MiddlewareMixin):
    """Désactive le CSRF pour les endpoints API en mode desktop local."""

    def process_request(self, request):
        if request.path.startswith('/api/'):
            setattr(request, '_dont_enforce_csrf_checks', True)


class NoCacheHTMLMiddleware(MiddlewareMixin):
    """Force no-cache sur les réponses HTML (index.html SPA)."""

    def process_response(self, request, response):
        content_type = response.get('Content-Type', '')
        if 'text/html' in content_type:
            response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response
