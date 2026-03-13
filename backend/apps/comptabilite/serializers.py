from rest_framework import serializers
from .models import (
    Societe, ClasseCompte, Compte, ExerciceComptable, JournalComptable,
    PieceComptable, LigneEcriture, Tiers, ReleveBancaire, LigneReleve,
    ModeleEcriture, LigneModeleEcriture, Immobilisation,
)


class SocieteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Societe
        fields = '__all__'


class ClasseCompteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClasseCompte
        fields = '__all__'


class CompteSerializer(serializers.ModelSerializer):
    sous_comptes = serializers.SerializerMethodField()
    classe_numero = serializers.IntegerField(source='classe.numero', read_only=True)

    class Meta:
        model = Compte
        fields = [
            'id', 'societe', 'classe', 'classe_numero', 'parent',
            'numero', 'intitule', 'nature', 'type_compte',
            'lettrable', 'est_tiers', 'actif', 'sous_comptes',
        ]

    def get_sous_comptes(self, obj):
        children = obj.sous_comptes.all()
        if children.exists():
            return CompteSerializer(children, many=True).data
        return []


class CompteListSerializer(serializers.ModelSerializer):
    """Serializer plat sans récursion pour les listes."""
    classe_numero = serializers.IntegerField(source='classe.numero', read_only=True)

    class Meta:
        model = Compte
        fields = [
            'id', 'societe', 'classe', 'classe_numero', 'parent',
            'numero', 'intitule', 'nature', 'type_compte',
            'lettrable', 'est_tiers', 'actif',
        ]


class ExerciceComptableSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciceComptable
        fields = '__all__'


class JournalComptableSerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalComptable
        fields = '__all__'


class LigneEcritureSerializer(serializers.ModelSerializer):
    compte_numero = serializers.CharField(source='compte.numero', read_only=True)
    compte_intitule = serializers.CharField(source='compte.intitule', read_only=True)
    tiers_nom = serializers.CharField(source='tiers.nom', read_only=True, allow_null=True)

    class Meta:
        model = LigneEcriture
        fields = [
            'id', 'piece', 'compte', 'compte_numero', 'compte_intitule',
            'libelle', 'debit', 'credit', 'tiers', 'tiers_nom',
            'lettrage_code', 'ordre',
        ]


class PieceComptableSerializer(serializers.ModelSerializer):
    lignes = LigneEcritureSerializer(many=True, read_only=True)
    est_equilibree = serializers.BooleanField(read_only=True)
    journal_code = serializers.CharField(source='journal.code', read_only=True)
    journal_intitule = serializers.CharField(source='journal.intitule', read_only=True)

    class Meta:
        model = PieceComptable
        fields = [
            'id', 'exercice', 'journal', 'journal_code', 'journal_intitule',
            'numero_piece', 'date_piece', 'libelle', 'reference',
            'statut', 'total_debit', 'total_credit', 'est_equilibree',
            'lignes', 'created_at',
        ]


class PieceComptableCreateSerializer(serializers.Serializer):
    exercice_id = serializers.IntegerField()
    journal_id = serializers.IntegerField()
    date_piece = serializers.DateField()
    libelle = serializers.CharField(max_length=300)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    lignes = serializers.ListField(child=serializers.DictField())

    def validate_lignes(self, value):
        if len(value) < 2:
            raise serializers.ValidationError("Il faut au moins 2 lignes d'écriture.")
        for ligne in value:
            if 'compte_id' not in ligne:
                raise serializers.ValidationError("Chaque ligne doit avoir un compte_id.")
        return value


class TiersSerializer(serializers.ModelSerializer):
    compte_collectif_numero = serializers.CharField(
        source='compte_collectif.numero', read_only=True, allow_null=True
    )

    class Meta:
        model = Tiers
        fields = [
            'id', 'societe', 'code', 'nom', 'type_tiers',
            'compte_collectif', 'compte_collectif_numero',
            'telephone', 'email', 'adresse', 'actif',
        ]


class LigneReleveSerializer(serializers.ModelSerializer):
    ecriture_libelle = serializers.SerializerMethodField()

    class Meta:
        model = LigneReleve
        fields = [
            'id', 'releve', 'date_operation', 'libelle', 'reference',
            'montant', 'statut', 'ligne_ecriture', 'ecriture_libelle',
        ]

    def get_ecriture_libelle(self, obj):
        if obj.ligne_ecriture:
            return obj.ligne_ecriture.libelle
        return None


class ReleveBancaireSerializer(serializers.ModelSerializer):
    lignes = LigneReleveSerializer(many=True, read_only=True)
    compte_banque_numero = serializers.CharField(source='compte_banque.numero', read_only=True)

    class Meta:
        model = ReleveBancaire
        fields = [
            'id', 'societe', 'exercice', 'compte_banque', 'compte_banque_numero',
            'date_debut', 'date_fin', 'solde_initial', 'solde_final',
            'nb_rapproches', 'nb_non_rapproches', 'lignes', 'created_at',
        ]


class LigneModeleSerializer(serializers.ModelSerializer):
    compte_numero = serializers.CharField(source='compte.numero', read_only=True, allow_null=True)
    compte_intitule = serializers.CharField(source='compte.intitule', read_only=True, allow_null=True)

    class Meta:
        model = LigneModeleEcriture
        fields = [
            'id', 'modele', 'compte', 'compte_numero', 'compte_intitule',
            'libelle', 'debit', 'credit', 'ordre',
        ]


class ModeleEcritureSerializer(serializers.ModelSerializer):
    lignes = LigneModeleSerializer(many=True, read_only=True)
    journal_code = serializers.CharField(source='journal.code', read_only=True, allow_null=True)

    class Meta:
        model = ModeleEcriture
        fields = [
            'id', 'societe', 'journal', 'journal_code',
            'code', 'libelle', 'description', 'lignes',
        ]

    def create(self, validated_data):
        lignes_data = self.initial_data.get('lignes', [])
        modele = super().create(validated_data)
        self._save_lignes(modele, lignes_data)
        return modele

    def update(self, instance, validated_data):
        lignes_data = self.initial_data.get('lignes', [])
        modele = super().update(instance, validated_data)
        self._save_lignes(modele, lignes_data)
        return modele

    def _save_lignes(self, modele, lignes_data):
        if lignes_data is not None:
            modele.lignes.all().delete()
            from .models import Compte
            for i, l in enumerate(lignes_data):
                compte_id = l.get('compte_id') or l.get('compte')
                try:
                    compte = Compte.objects.get(id=compte_id) if compte_id else None
                except Compte.DoesNotExist:
                    compte = None
                LigneModeleEcriture.objects.create(
                    modele=modele,
                    compte=compte,
                    libelle=l.get('libelle', ''),
                    debit=l.get('debit', 0),
                    credit=l.get('credit', 0),
                    ordre=l.get('ordre', i),
                )


class ImmobilisationSerializer(serializers.ModelSerializer):
    compte_numero = serializers.CharField(source='compte.numero', read_only=True)

    class Meta:
        model = Immobilisation
        fields = [
            'id', 'societe', 'exercice', 'compte', 'compte_numero',
            'designation', 'reference', 'date_acquisition', 'valeur_acquisition',
            'taux_amortissement', 'duree_amortissement', 'methode_amortissement',
            'valeur_residuelle', 'actif', 'created_at',
        ]
