from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from shop import views

router = DefaultRouter()
router.register("products", views.ProductViewSet, basename="product")

shop_patterns = [
    path("cart/", views.CartView.as_view(), name="cart"),
    path("checkout/", views.checkout, name="checkout"),
    path("profile/", views.profile, name="profile"),
    re_path(r"^legacy/(?P<year>[0-9]{4})/$", views.legacy, name="legacy"),
]

urlpatterns = [
    path("api/v1/", include((shop_patterns, "shop"), namespace="shop")),
    path("api/v1/", include(router.urls)),
]
