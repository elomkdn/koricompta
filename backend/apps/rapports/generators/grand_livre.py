from decimal import Decimal
from django.db.models import Sum
from apps.comptabilite.models import Compte, LigneEcriture


class GrandLivreGenerator:

    @staticmethod
    def generer(societe, exercice, compte_debut=None, compte_fin=None):
        comptes = Compte.objects.filter(
            societe=societe, type_compte='detail'
        ).order_by('numero')

        if compte_debut:
            comptes = comptes.filter(numero__gte=compte_debut)
        if compte_fin:
            comptes = comptes.filter(numero__lte=compte_fin)

        result = {
            'societe': societe.nom,
            'exercice': exercice.code,
            'periode': f'{exercice.date_debut} au {exercice.date_fin}',
            'comptes': [],
        }

        total_debit_general = Decimal('0')
        total_credit_general = Decimal('0')

        for compte in comptes:
            lignes = LigneEcriture.objects.filter(
                compte=compte,
                piece__exercice=exercice,
                piece__statut='valide',
            ).select_related('piece', 'piece__journal').order_by(
                'piece__date_piece', 'piece__numero_piece'
            )

            if not lignes.exists():
                continue

            total_debit = lignes.aggregate(s=Sum('debit'))['s'] or Decimal('0')
            total_credit = lignes.aggregate(s=Sum('credit'))['s'] or Decimal('0')
            solde = total_debit - total_credit

            solde_progressif = Decimal('0')
            lignes_data = []
            for l in lignes:
                solde_progressif += l.debit - l.credit
                lignes_data.append({
                    'date': l.piece.date_piece,
                    'journal': l.piece.journal.code,
                    'piece': l.piece.numero_piece,
                    'libelle': l.libelle or l.piece.libelle,
                    'debit': l.debit,
                    'credit': l.credit,
                    'lettrage': l.lettrage_code,
                    'solde': solde_progressif,
                })

            result['comptes'].append({
                'numero': compte.numero,
                'intitule': compte.intitule,
                'total_debit': total_debit,
                'total_credit': total_credit,
                'solde': solde,
                'lignes': lignes_data,
            })

            total_debit_general += total_debit
            total_credit_general += total_credit

        result['total_debit'] = total_debit_general
        result['total_credit'] = total_credit_general
        return result
