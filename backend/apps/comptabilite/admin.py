from django.contrib import admin
from mptt.admin import MPTTModelAdmin
from .models import (
    Societe, ClasseCompte, Compte,
    ExerciceComptable, JournalComptable,
    PieceComptable, LigneEcriture, Tiers,
    ReleveBancaire, LigneReleve,
    ModeleEcriture, LigneModeleEcriture,
    Immobilisation,
)


@admin.register(Societe)
class SocieteAdmin(admin.ModelAdmin):
    list_display = ['nom', 'sigle', 'regime_fiscal', 'devise']
    search_fields = ['nom', 'sigle']


@admin.register(ClasseCompte)
class ClasseCompteAdmin(admin.ModelAdmin):
    list_display = ['numero', 'intitule', 'societe']
    list_filter = ['societe']


@admin.register(Compte)
class CompteAdmin(MPTTModelAdmin):
    list_display = ['numero', 'intitule', 'classe', 'nature', 'type_compte', 'lettrable']
    list_filter = ['classe', 'nature', 'type_compte', 'societe']
    search_fields = ['numero', 'intitule']


@admin.register(ExerciceComptable)
class ExerciceComptableAdmin(admin.ModelAdmin):
    list_display = ['code', 'libelle', 'date_debut', 'date_fin', 'statut', 'societe']
    list_filter = ['statut', 'societe']


@admin.register(JournalComptable)
class JournalComptableAdmin(admin.ModelAdmin):
    list_display = ['code', 'intitule', 'type_journal', 'societe']
    list_filter = ['type_journal', 'societe']


class LigneEcritureInline(admin.TabularInline):
    model = LigneEcriture
    extra = 2


@admin.register(PieceComptable)
class PieceComptableAdmin(admin.ModelAdmin):
    list_display = ['numero_piece', 'date_piece', 'journal', 'libelle', 'statut']
    list_filter = ['statut', 'journal', 'exercice']
    search_fields = ['numero_piece', 'libelle']
    inlines = [LigneEcritureInline]


@admin.register(Tiers)
class TiersAdmin(admin.ModelAdmin):
    list_display = ['code', 'nom', 'type_tiers', 'compte_collectif', 'societe']
    list_filter = ['type_tiers', 'societe']
    search_fields = ['code', 'nom']


@admin.register(ReleveBancaire)
class ReleveBancaireAdmin(admin.ModelAdmin):
    list_display = ['societe', 'exercice', 'compte_banque', 'date_debut', 'date_fin']
    list_filter = ['societe']


@admin.register(LigneReleve)
class LigneReleveAdmin(admin.ModelAdmin):
    list_display = ['releve', 'date_operation', 'libelle', 'montant', 'statut']
    list_filter = ['statut']


class LigneModeleInline(admin.TabularInline):
    model = LigneModeleEcriture
    extra = 2


@admin.register(ModeleEcriture)
class ModeleEcritureAdmin(admin.ModelAdmin):
    list_display = ['code', 'libelle', 'journal', 'societe']
    list_filter = ['societe']
    inlines = [LigneModeleInline]


@admin.register(Immobilisation)
class ImmobilisationAdmin(admin.ModelAdmin):
    list_display = ['designation', 'date_acquisition', 'valeur_acquisition', 'taux_amortissement', 'societe']
    list_filter = ['societe', 'exercice']
    search_fields = ['designation']
