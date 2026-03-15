from rest_framework import serializers
from .models import User, UserSocieteAccess


class UserSocieteAccessSerializer(serializers.ModelSerializer):
    societe_nom = serializers.CharField(source='societe.nom', read_only=True)

    class Meta:
        model = UserSocieteAccess
        fields = ['id', 'user', 'societe', 'societe_nom']


class UserSerializer(serializers.ModelSerializer):
    societe_ids = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'societe_ids']
        read_only_fields = ['id']

    def get_societe_ids(self, obj):
        return list(obj.societe_accesses.values_list('societe_id', flat=True))


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'password', 'role']
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
