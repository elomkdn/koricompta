from decimal import Decimal
from django.db import models
from mptt.models import MPTTModel, TreeForeignKey


class FormeJuridique(models.TextChoices):
    SARL  = 'SARL',  'SARL'
    SA    = 'SA',    'SA'
    SAS   = 'SAS',   'SAS'
    SNC   = 'SNC',   'SNC'
    EI    = 'EI',    'Entreprise individuelle'
    GIE   = 'GIE',   'GIE'
    ONG   = 'ONG',   'ONG'
    AUTRE = 'AUTRE', 'Autre'


class Societe(models.Model):
    nom = models.CharField(max_length=200)
    sigle = models.CharField(max_length=20, blank=True)
    forme_juridique = models.CharField(
        max_length=10, choices=FormeJuridique.choices,
        blank=True, default='',
    )
    regime_fiscal = models.CharField(max_length=100, blank=True)
    devise = models.CharField(max_length=10, default='XOF')
    adresse = models.TextField(blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    rccm = models.CharField(max_length=100, blank=True)
    nif = models.CharField(max_length=100, blank=True, verbose_name='NIF')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Société'
        verbose_name_plural = 'Sociétés'
        ordering = ['nom']

    def __str__(self):
        return self.nom


class ClasseCompte(models.Model):
    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='classes_comptes')
    numero = models.IntegerField()
    intitule = models.CharField(max_length=200)

    class Meta:
        verbose_name = 'Classe de compte'
        verbose_name_plural = 'Classes de comptes'
        ordering = ['numero']
        unique_together = ('societe', 'numero')

    def __str__(self):
        return f'{self.numero} - {self.intitule}'


class Compte(MPTTModel):
    class Nature(models.TextChoices):
        DEBIT = 'debit', 'Débit'
        CREDIT = 'credit', 'Crédit'

    class TypeCompte(models.TextChoices):
        DETAIL = 'detail', 'Détail'
        COLLECTIF = 'collectif', 'Collectif'

    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='comptes')
    classe = models.ForeignKey(ClasseCompte, on_delete=models.CASCADE, related_name='comptes')
    parent = TreeForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='sous_comptes', db_index=True,
    )
    numero = models.CharField(max_length=20)
    intitule = models.CharField(max_length=200)
    nature = models.CharField(max_length=10, choices=Nature.choices, default=Nature.DEBIT)
    type_compte = models.CharField(max_length=20, choices=TypeCompte.choices, default=TypeCompte.DETAIL)
    lettrable = models.BooleanField(default=False)
    est_tiers = models.BooleanField(default=False)
    actif = models.BooleanField(default=True)

    class MPTTMeta:
        order_insertion_by = ['numero']

    class Meta:
        verbose_name = 'Compte'
        verbose_name_plural = 'Comptes'
        ordering = ['numero']
        unique_together = ('societe', 'numero')

    def __str__(self):
        return f'{self.numero} - {self.intitule}'


class ExerciceComptable(models.Model):
    class Statut(models.TextChoices):
        OUVERT = 'ouvert', 'Ouvert'
        CLOTURE = 'cloture', 'Clôturé'

    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='exercices')
    code = models.CharField(max_length=20)
    libelle = models.CharField(max_length=200)
    date_debut = models.DateField()
    date_fin = models.DateField()
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.OUVERT)

    class Meta:
        verbose_name = 'Exercice comptable'
        verbose_name_plural = 'Exercices comptables'
        ordering = ['-date_debut']
        unique_together = ('societe', 'code')

    def __str__(self):
        return f'{self.code} - {self.libelle}'


class JournalComptable(models.Model):
    class TypeJournal(models.TextChoices):
        ACHAT = 'achat', 'Achats'
        VENTE = 'vente', 'Ventes'
        BANQUE = 'banque', 'Banque'
        CAISSE = 'caisse', 'Caisse'
        OD = 'od', 'Opérations Diverses'
        AN = 'an', 'À Nouveau'

    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='journaux')
    code = models.CharField(max_length=20)
    intitule = models.CharField(max_length=200)
    type_journal = models.CharField(max_length=20, choices=TypeJournal.choices)
    compte_contrepartie = models.ForeignKey(
        Compte, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='journaux_contrepartie',
    )
    actif = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Journal comptable'
        verbose_name_plural = 'Journaux comptables'
        ordering = ['code']
        unique_together = ('societe', 'code')

    def __str__(self):
        return f'{self.code} - {self.intitule}'


class PieceComptable(models.Model):
    class Statut(models.TextChoices):
        BROUILLARD = 'brouillard', 'Brouillard'
        VALIDE = 'valide', 'Validé'

    exercice = models.ForeignKey(ExerciceComptable, on_delete=models.CASCADE, related_name='pieces')
    journal = models.ForeignKey(JournalComptable, on_delete=models.CASCADE, related_name='pieces')
    numero_piece = models.CharField(max_length=20)
    date_piece = models.DateField()
    libelle = models.CharField(max_length=300)
    reference = models.CharField(max_length=100, blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.BROUILLARD)
    total_debit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    total_credit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Pièce comptable'
        verbose_name_plural = 'Pièces comptables'
        ordering = ['journal', 'numero_piece']
        unique_together = ('exercice', 'journal', 'numero_piece')

    def __str__(self):
        return f'{self.journal.code}/{self.numero_piece} - {self.libelle}'

    @property
    def est_equilibree(self):
        return self.total_debit == self.total_credit

    def recalculer_totaux(self):
        from django.db.models import Sum
        totaux = self.lignes.aggregate(
            total_debit=Sum('debit'),
            total_credit=Sum('credit'),
        )
        self.total_debit = totaux['total_debit'] or Decimal('0')
        self.total_credit = totaux['total_credit'] or Decimal('0')
        self.save(update_fields=['total_debit', 'total_credit'])


class Tiers(models.Model):
    class TypeTiers(models.TextChoices):
        CLIENT = 'client', 'Client'
        FOURNISSEUR = 'fournisseur', 'Fournisseur'
        AUTRE = 'autre', 'Autre'

    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='tiers')
    code = models.CharField(max_length=20)
    nom = models.CharField(max_length=200)
    type_tiers = models.CharField(max_length=20, choices=TypeTiers.choices)
    compte_collectif = models.ForeignKey(
        Compte, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='tiers_associes',
    )
    telephone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    adresse = models.TextField(blank=True)
    actif = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Tiers'
        verbose_name_plural = 'Tiers'
        ordering = ['nom']
        unique_together = ('societe', 'code')

    def __str__(self):
        return f'{self.code} - {self.nom}'


class LigneEcriture(models.Model):
    piece = models.ForeignKey(PieceComptable, on_delete=models.CASCADE, related_name='lignes')
    compte = models.ForeignKey(Compte, on_delete=models.CASCADE, related_name='lignes_ecriture')
    libelle = models.CharField(max_length=300, blank=True)
    debit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    credit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    tiers = models.ForeignKey(Tiers, null=True, blank=True, on_delete=models.SET_NULL, related_name='lignes_ecriture')
    lettrage_code = models.CharField(max_length=10, blank=True, default='')
    ordre = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'Ligne d\'écriture'
        verbose_name_plural = 'Lignes d\'écriture'
        ordering = ['ordre', 'id']
        constraints = [
            models.CheckConstraint(
                check=~(models.Q(debit__gt=0) & models.Q(credit__gt=0)),
                name='ligne_no_debit_and_credit',
            ),
            models.CheckConstraint(
                check=models.Q(debit__gte=0) & models.Q(credit__gte=0),
                name='ligne_no_negative_amounts',
            ),
        ]

    def __str__(self):
        return f'{self.compte.numero} D:{self.debit} C:{self.credit}'


class ReleveBancaire(models.Model):
    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='releves_bancaires')
    exercice = models.ForeignKey(ExerciceComptable, on_delete=models.CASCADE, related_name='releves_bancaires')
    compte_banque = models.ForeignKey(Compte, on_delete=models.CASCADE, related_name='releves_bancaires')
    date_debut = models.DateField()
    date_fin = models.DateField()
    solde_initial = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    solde_final = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    nb_rapproches = models.IntegerField(default=0)
    nb_non_rapproches = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Relevé bancaire'
        verbose_name_plural = 'Relevés bancaires'
        ordering = ['-date_fin']

    def __str__(self):
        return f'Relevé {self.compte_banque.numero} du {self.date_debut} au {self.date_fin}'

    def mettre_a_jour_stats(self):
        self.nb_rapproches = self.lignes.filter(statut='rapproche').count()
        self.nb_non_rapproches = self.lignes.filter(statut='non_rapproche').count()
        self.save(update_fields=['nb_rapproches', 'nb_non_rapproches'])


class LigneReleve(models.Model):
    class Statut(models.TextChoices):
        NON_RAPPROCHE = 'non_rapproche', 'Non rapproché'
        RAPPROCHE = 'rapproche', 'Rapproché'
        IGNORE = 'ignore', 'Ignoré'

    releve = models.ForeignKey(ReleveBancaire, on_delete=models.CASCADE, related_name='lignes')
    date_operation = models.DateField()
    libelle = models.CharField(max_length=300)
    reference = models.CharField(max_length=100, blank=True)
    montant = models.DecimalField(max_digits=15, decimal_places=2)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.NON_RAPPROCHE)
    ligne_ecriture = models.ForeignKey(
        LigneEcriture, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='lignes_releve',
    )

    class Meta:
        verbose_name = 'Ligne de relevé'
        verbose_name_plural = 'Lignes de relevé'
        ordering = ['date_operation', 'id']

    def __str__(self):
        return f'{self.date_operation} {self.libelle} {self.montant}'


class ModeleEcriture(models.Model):
    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='modeles_ecritures')
    journal = models.ForeignKey(
        JournalComptable, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='modeles_ecritures',
    )
    code = models.CharField(max_length=20)
    libelle = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Modèle d\'écriture'
        verbose_name_plural = 'Modèles d\'écriture'
        ordering = ['code']
        unique_together = ('societe', 'code')

    def __str__(self):
        return f'{self.code} - {self.libelle}'


class LigneModeleEcriture(models.Model):
    modele = models.ForeignKey(ModeleEcriture, on_delete=models.CASCADE, related_name='lignes')
    compte = models.ForeignKey(
        Compte, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='lignes_modeles',
    )
    libelle = models.CharField(max_length=300, blank=True)
    debit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    credit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    ordre = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'Ligne de modèle d\'écriture'
        verbose_name_plural = 'Lignes de modèles d\'écriture'
        ordering = ['ordre', 'id']

    def __str__(self):
        return f'{self.modele.code} - {self.compte}'


class Immobilisation(models.Model):
    class MethodeAmortissement(models.TextChoices):
        LINEAIRE = 'lineaire', 'Linéaire'
        DEGRESSIF = 'degressif', 'Dégressif'

    societe = models.ForeignKey(Societe, on_delete=models.CASCADE, related_name='immobilisations')
    exercice = models.ForeignKey(ExerciceComptable, on_delete=models.CASCADE, related_name='immobilisations')
    compte = models.ForeignKey(Compte, on_delete=models.CASCADE, related_name='immobilisations')
    designation = models.CharField(max_length=300)
    reference = models.CharField(max_length=100, blank=True)
    date_acquisition = models.DateField()
    valeur_acquisition = models.DecimalField(max_digits=15, decimal_places=2)
    taux_amortissement = models.DecimalField(max_digits=5, decimal_places=2)
    duree_amortissement = models.IntegerField(help_text='Durée en années')
    methode_amortissement = models.CharField(
        max_length=20, choices=MethodeAmortissement.choices,
        default=MethodeAmortissement.LINEAIRE,
    )
    valeur_residuelle = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Immobilisation'
        verbose_name_plural = 'Immobilisations'
        ordering = ['designation']

    def __str__(self):
        return self.designation

    def calculer_amortissement_annuel(self):
        base = self.valeur_acquisition - self.valeur_residuelle
        if self.methode_amortissement == 'degressif':
            taux_lineaire = Decimal('1') / self.duree_amortissement
            if self.duree_amortissement <= 4:
                coeff = Decimal('1.5')
            elif self.duree_amortissement <= 6:
                coeff = Decimal('2')
            else:
                coeff = Decimal('2.5')
            return base * taux_lineaire * coeff
        return base / self.duree_amortissement

    def tableau_amortissement(self):
        """Retourne le tableau d'amortissement annuel."""
        lignes = []
        valeur_nette = self.valeur_acquisition
        base = self.valeur_acquisition - self.valeur_residuelle
        amortissement_cumule = Decimal('0')
        annee_debut = self.date_acquisition.year

        for i in range(self.duree_amortissement):
            if self.methode_amortissement == 'degressif':
                annees_restantes = self.duree_amortissement - i
                taux_lineaire = Decimal('1') / self.duree_amortissement
                if self.duree_amortissement <= 4:
                    coeff = Decimal('1.5')
                elif self.duree_amortissement <= 6:
                    coeff = Decimal('2')
                else:
                    coeff = Decimal('2.5')
                taux_degressif = taux_lineaire * coeff
                amort_degressif = (valeur_nette - self.valeur_residuelle) * taux_degressif
                amort_lineaire = (valeur_nette - self.valeur_residuelle) / annees_restantes if annees_restantes > 0 else Decimal('0')
                amort = max(amort_degressif, amort_lineaire)
            else:
                amort = base / self.duree_amortissement

            amort = min(amort, valeur_nette - self.valeur_residuelle)
            amort = max(amort, Decimal('0'))
            valeur_nette -= amort
            amortissement_cumule += amort
            lignes.append({
                'annee': annee_debut + i,
                'valeur_debut': str(valeur_nette + amort),
                'dotation': str(amort),
                'amortissement_cumule': str(amortissement_cumule),
                'valeur_nette': str(valeur_nette),
            })
        return lignes
