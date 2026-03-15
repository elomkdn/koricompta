from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserSocieteAccess


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'role']
    list_filter = ['role']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('KoriCompta', {'fields': ('role',)}),
    )


@admin.register(UserSocieteAccess)
class UserSocieteAccessAdmin(admin.ModelAdmin):
    list_display = ['user', 'societe']
    list_filter = ['societe']
