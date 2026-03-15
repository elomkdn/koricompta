export interface Societe {
  id: number;
  nom: string;
  sigle: string;
  regime_fiscal: string;
  devise: string;
  adresse: string;
  telephone: string;
  email: string;
  rccm: string;
  nif: string;
}

export interface ExerciceComptable {
  id: number;
  societe: number;
  code: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
  statut: 'ouvert' | 'cloture';
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'comptable' | 'consultant';
  societe_ids: number[];
}

export interface UserSocieteAccess {
  id: number;
  user: number;
  societe: number;
  societe_nom: string;
}

export interface Compte {
  id: number;
  societe: number;
  classe: number;
  classe_numero: number;
  parent: number | null;
  numero: string;
  intitule: string;
  nature: 'debit' | 'credit';
  type_compte: 'detail' | 'collectif';
  lettrable: boolean;
  est_tiers: boolean;
  actif: boolean;
}

export interface Journal {
  id: number;
  societe: number;
  code: string;
  intitule: string;
  type_journal: 'achat' | 'vente' | 'banque' | 'caisse' | 'od' | 'an';
  compte_contrepartie: number | null;
  actif: boolean;
}

export interface LigneEcriture {
  id: number;
  piece: number;
  compte: number;
  compte_numero: string;
  compte_intitule: string;
  libelle: string;
  debit: string;
  credit: string;
  tiers: number | null;
  tiers_nom: string | null;
  lettrage_code: string;
  ordre: number;
}

export interface PieceComptable {
  id: number;
  exercice: number;
  journal: number;
  journal_code: string;
  journal_intitule: string;
  numero_piece: string;
  date_piece: string;
  libelle: string;
  reference: string;
  statut: 'brouillard' | 'valide';
  total_debit: string;
  total_credit: string;
  est_equilibree: boolean;
  lignes: LigneEcriture[];
  created_at: string;
}

export interface Tiers {
  id: number;
  societe: number;
  code: string;
  nom: string;
  type_tiers: 'client' | 'fournisseur' | 'autre';
  compte_collectif: number | null;
  compte_collectif_numero: string | null;
  telephone: string;
  email: string;
  adresse: string;
  actif: boolean;
}

export interface LigneReleve {
  id: number;
  releve: number;
  date_operation: string;
  libelle: string;
  reference: string;
  montant: string;
  statut: 'non_rapproche' | 'rapproche' | 'ignore';
  ligne_ecriture: number | null;
  ecriture_libelle: string | null;
}

export interface ReleveBancaire {
  id: number;
  societe: number;
  exercice: number;
  compte_banque: number;
  compte_banque_numero: string;
  date_debut: string;
  date_fin: string;
  solde_initial: string;
  solde_final: string;
  nb_rapproches: number;
  nb_non_rapproches: number;
  lignes: LigneReleve[];
  created_at: string;
}

export interface LigneModele {
  id: number;
  modele: number;
  compte: number | null;
  compte_numero: string | null;
  compte_intitule: string | null;
  libelle: string;
  debit: string;
  credit: string;
  ordre: number;
}

export interface ModeleEcriture {
  id: number;
  societe: number;
  journal: number | null;
  journal_code: string | null;
  code: string;
  libelle: string;
  description: string;
  lignes: LigneModele[];
}

export interface Immobilisation {
  id: number;
  societe: number;
  exercice: number;
  compte: number;
  compte_numero: string;
  designation: string;
  reference: string;
  date_acquisition: string;
  valeur_acquisition: string;
  taux_amortissement: string;
  duree_amortissement: number;
  methode_amortissement: 'lineaire' | 'degressif';
  valeur_residuelle: string;
  actif: boolean;
  created_at: string;
}

// ---- Rapports ----

export interface LigneBalance {
  numero: string;
  intitule: string;
  total_debit: string;
  total_credit: string;
  solde_debiteur: string;
  solde_crediteur: string;
}

export interface BalanceData {
  societe: string;
  exercice: string;
  lignes: LigneBalance[];
  total_debit: string;
  total_credit: string;
  total_solde_debiteur: string;
  total_solde_crediteur: string;
}

export interface LigneGrandLivre {
  date: string;
  journal: string;
  piece: string;
  libelle: string;
  debit: string;
  credit: string;
  solde_progressif: string;
}

export interface CompteGrandLivre {
  numero: string;
  intitule: string;
  solde_initial: string;
  lignes: LigneGrandLivre[];
  total_debit: string;
  total_credit: string;
  solde_final: string;
}

export interface GrandLivreData {
  societe: string;
  exercice: string;
  comptes: CompteGrandLivre[];
}

export interface BilanActif {
  immobilise: string;
  stocks: string;
  creances_clients: string;
  avances_fournisseurs: string;
  autres_creances: string;
  tresorerie: string;
  total: string;
}

export interface BilanPassif {
  capitaux_propres: string;
  provisions_risques: string;
  dettes_financieres: string;
  fournisseurs: string;
  avances_clients: string;
  dettes_fiscales_sociales: string;
  autres_dettes: string;
  tresorerie: string;
  total: string;
}

export interface BilanData {
  societe: string;
  exercice: string;
  actif: BilanActif;
  passif: BilanPassif;
  resultat_net: string;
}

export interface CompteResultatMarges {
  marge_brute_marchandises: string;
  marge_brute_matieres: string;
  valeur_ajoutee: string;
  ebe: string;
  resultat_exploitation: string;
  resultat_financier: string;
  resultat_activites_ordinaires: string;
  resultat_hao: string;
  resultat_net: string;
}

export interface CompteResultatProduits {
  ventes_marchandises: string;
  ventes_produits: string;
  produits_accessoires: string;
  autres_produits: string;
  produits_financiers: string;
  produits_hao: string;
  total: string;
}

export interface CompteResultatCharges {
  achats_marchandises: string;
  achats_matieres: string;
  transports: string;
  services_exterieurs: string;
  impots_taxes: string;
  charges_personnel: string;
  dotations: string;
  autres_charges: string;
  charges_financieres: string;
  charges_hao: string;
  impots_benefice: string;
  total: string;
}

export interface CompteResultatData {
  societe: string;
  exercice: string;
  marges: CompteResultatMarges;
  produits: CompteResultatProduits;
  charges: CompteResultatCharges;
  resultat: string;
}
