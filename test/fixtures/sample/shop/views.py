from django.http import JsonResponse
from django.views import View
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet


class ProductViewSet(ViewSet):
    def list(self, request):
        return Response([])

    def retrieve(self, request, pk=None):
        return Response({})

    def create(self, request):
        return Response({})


class CartView(View):
    def get(self, request):
        return JsonResponse({})

    def post(self, request):
        return JsonResponse({})


@api_view(["GET", "PUT"])
def profile(request):
    return Response({})


@require_POST
def checkout(request):
    return JsonResponse({})


def legacy(request, year):
    return JsonResponse({})
