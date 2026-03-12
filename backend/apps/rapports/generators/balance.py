from decimal import Decimal
from django.db.models import Sum
from apps.comptabilite.models import Compte, LigneEcriture


class BalanceGenerator:

    @staticmethod
    def generer(societe, exercice, niveau=None):
        comptes = Compte.objects.filter(
            societe=societe, type_compte='detail'
        ).order_by('numero')

        result = {
            'societe': societe.nom,
            'exercice': exercice.code,
            'lignes': [],
        }

        total_debit = Decimal('0')
        total_credit = Decimal('0')
        total_solde_debiteur = Decimal('0')
        total_solde_crediteur = Decimal('0')

        for compte in comptes:
            if niveau and len(compte.numero) > niveau:
                continue

            totaux = LigneEcriture.objects.filter(
                compte=compte,
                piece__exercice=exercice,
                piece__statut='valide',
            ).aggregate(
                total_debit=Sum('debit'),
                total_credit=Sum('credit'),
            )

            d = totaux['total_debit'] or Decimal('0')
            c = totaux['total_credit'] or Decimal('0')

            if d == 0 and c == 0:
                continue

            solde = d - c
            solde_debiteur = max(solde, Decimal('0'))
            solde_crediteur = max(-solde, Decimal('0'))

            result['lignes'].append({
                'numero': compte.numero,
                'intitule': compte.intitule,
                'total_debit': d,
                'total_credit': c,
                'solde_debiteur': solde_debiteur,
                'solde_crediteur': solde_crediteur,
            })

            total_debit += d
            total_credit += c
            total_solde_debiteur += solde_debiteur
            total_solde_crediteur += solde_crediteur

        result['total_debit'] = total_debit
        result['total_credit'] = total_credit
        result['total_solde_debiteur'] = total_solde_debiteur
        result['total_solde_crediteur'] = total_solde_crediteur
        return result
