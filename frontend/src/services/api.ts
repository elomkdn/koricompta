import axios from 'axios';

const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ---- Auth ----
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/api/auth/login/', { username, password }),
  logout: () => api.post('/api/auth/logout/'),
  status: () => api.get('/api/auth/status/'),
};

// ---- Users ----
export const userApi = {
  me: () => api.get('/api/users/me/'),
  list: () => api.get('/api/users/'),
  create: (data: object) => api.post('/api/users/', data),
  update: (id: number, data: object) => api.patch(`/api/users/${id}/`, data),
  delete: (id: number) => api.delete(`/api/users/${id}/`),
  listAccesses: (userId?: number) =>
    api.get('/api/users/accesses/', { params: userId ? { user: userId } : {} }),
  createAccess: (data: { user: number; societe: number }) =>
    api.post('/api/users/accesses/', data),
  deleteAccess: (id: number) => api.delete(`/api/users/accesses/${id}/`),
};

// ---- Societes & Exercices ----
export const societeApi = {
  list: () => api.get('/api/comptabilite/societes/'),
  create: (data: object) => api.post('/api/comptabilite/societes/', data),
  update: (id: number, data: object) => api.patch(`/api/comptabilite/societes/${id}/`, data),
  delete: (id: number) => api.delete(`/api/comptabilite/societes/${id}/`),
  provisionner: (id: number) => api.post(`/api/comptabilite/societes/${id}/provisionner/`),
};

export const exerciceApi = {
  list: (societeId: number) =>
    api.get('/api/comptabilite/exercices/', { params: { societe: societeId } }),
  create: (data: object) => api.post('/api/comptabilite/exercices/', data),
  cloturer: (id: number) => api.post(`/api/comptabilite/exercices/${id}/cloture/`),
};

// ---- Comptes ----
export const compteApi = {
  list: (societeId: number, params?: object) =>
    api.get('/api/comptabilite/comptes/', {
      params: { societe: societeId, page_size: 9999, ordering: 'numero', ...params },
    }),
  search: (societeId: number, q: string) =>
    api.get('/api/comptabilite/comptes/', {
      params: { societe: societeId, search: q, page_size: 50, ordering: 'numero' },
    }),
  tree: (societeId: number) =>
    api.get('/api/comptabilite/comptes/tree/', { params: { societe: societeId } }),
  create: (data: object) => api.post('/api/comptabilite/comptes/', data),
  update: (id: number, data: object) => api.patch(`/api/comptabilite/comptes/${id}/`, data),
  delete: (id: number) => api.delete(`/api/comptabilite/comptes/${id}/`),
};

// ---- Journaux ----
export const journalApi = {
  list: (societeId: number) =>
    api.get('/api/comptabilite/journaux/', { params: { societe: societeId } }),
  create: (data: object) => api.post('/api/comptabilite/journaux/', data),
  update: (id: number, data: object) => api.patch(`/api/comptabilite/journaux/${id}/`, data),
  delete: (id: number) => api.delete(`/api/comptabilite/journaux/${id}/`),
};

// ---- Pièces comptables ----
export const pieceApi = {
  list: (params: object) => api.get('/api/comptabilite/pieces/', { params }),
  create: (data: object) => api.post('/api/comptabilite/pieces/', data),
  valider: (id: number) => api.post(`/api/comptabilite/pieces/${id}/valider/`),
  delete: (id: number) => api.delete(`/api/comptabilite/pieces/${id}/`),
  forcerSuppression: (id: number) =>
    api.delete(`/api/comptabilite/pieces/${id}/forcer_suppression/`),
  modifier: (id: number, data: object) => api.patch(`/api/comptabilite/pieces/${id}/modifier/`, data),
};

// ---- Analyse facture ----
export const factureApi = {
  analyser: (formData: FormData) =>
    api.post('/api/comptabilite/factures/analyser/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ---- Tiers ----
export const tiersApi = {
  list: (societeId: number, params?: object) =>
    api.get('/api/comptabilite/tiers/', {
      params: { societe: societeId, page_size: 9999, ...params },
    }),
  create: (data: object) => api.post('/api/comptabilite/tiers/', data),
  update: (id: number, data: object) => api.patch(`/api/comptabilite/tiers/${id}/`, data),
  delete: (id: number) => api.delete(`/api/comptabilite/tiers/${id}/`),
};

// ---- Modèles d'écriture ----
export const modeleApi = {
  list: (societeId: number) =>
    api.get('/api/comptabilite/modeles-ecritures/', { params: { societe: societeId } }),
  create: (data: object) => api.post('/api/comptabilite/modeles-ecritures/', data),
  update: (id: number, data: object) =>
    api.patch(`/api/comptabilite/modeles-ecritures/${id}/`, data),
  delete: (id: number) => api.delete(`/api/comptabilite/modeles-ecritures/${id}/`),
  appliquer: (id: number, data: object) =>
    api.post(`/api/comptabilite/modeles-ecritures/${id}/appliquer/`, data),
};

// ---- Relevés bancaires ----
export const releveApi = {
  list: (societeId: number, exerciceId: number) =>
    api.get('/api/comptabilite/releves/', {
      params: { societe: societeId, exercice: exerciceId },
    }),
  create: (data: object) => api.post('/api/comptabilite/releves/', data),
  delete: (id: number) => api.delete(`/api/comptabilite/releves/${id}/`),
  importerLignes: (id: number, lignes: object[]) =>
    api.post(`/api/comptabilite/releves/${id}/importer_lignes/`, { lignes }),
  rapprocherAuto: (id: number) =>
    api.post(`/api/comptabilite/releves/${id}/rapprocher_auto/`),
  rapprocherManuel: (ligneReleveId: number, ligneEcritureId: number) =>
    api.post('/api/comptabilite/releves/rapprocher_manuel/', {
      ligne_releve_id: ligneReleveId,
      ligne_ecriture_id: ligneEcritureId,
    }),
  derapprocher: (ligneReleveId: number) =>
    api.post('/api/comptabilite/releves/derapprocher/', { ligne_releve_id: ligneReleveId }),
  ignorer: (ligneReleveId: number) =>
    api.post('/api/comptabilite/releves/ignorer/', { ligne_releve_id: ligneReleveId }),
};

// ---- Immobilisations ----
export const immobilisationApi = {
  list: (societeId: number, exerciceId: number) =>
    api.get('/api/comptabilite/immobilisations/', {
      params: { societe: societeId, exercice: exerciceId },
    }),
  create: (data: object) => api.post('/api/comptabilite/immobilisations/', data),
  update: (id: number, data: object) =>
    api.patch(`/api/comptabilite/immobilisations/${id}/`, data),
  delete: (id: number) => api.delete(`/api/comptabilite/immobilisations/${id}/`),
  tableauAmortissement: (id: number) =>
    api.get(`/api/comptabilite/immobilisations/${id}/tableau_amortissement/`),
  comptabiliser: (id: number, exerciceId: number) =>
    api.post(`/api/comptabilite/immobilisations/${id}/comptabiliser/`, {
      exercice_id: exerciceId,
    }),
  doterTout: (societeId: number, exerciceId: number) =>
    api.post('/api/comptabilite/immobilisations/doter_tout/', {
      societe_id: societeId,
      exercice_id: exerciceId,
    }),
};

// ---- Lettrage ----
export const ligneApi = {
  lettrer: (ligneIds: number[]) =>
    api.post('/api/comptabilite/lignes/lettrer/', { ligne_ids: ligneIds }),
  delettrer: (ligneIds: number[]) =>
    api.post('/api/comptabilite/lignes/delettrer/', { ligne_ids: ligneIds }),
};

// ---- Grand livre auxiliaire ----
export const grandLivreAuxiliaireApi = {
  get: (societeId: number, exerciceId: number, tiersId?: number) =>
    api.get('/api/comptabilite/grand-livre-auxiliaire/', {
      params: {
        societe: societeId,
        exercice: exerciceId,
        ...(tiersId ? { tiers: tiersId } : {}),
      },
    }),
};

// ---- Consultation ----
export const consultationApi = {
  get: (societeId: number, exerciceId: number, compteId?: number, compteNumero?: string) =>
    api.get('/api/comptabilite/consultation/', {
      params: {
        societe: societeId,
        exercice: exerciceId,
        ...(compteId ? { compte: compteId } : {}),
        ...(compteNumero ? { compte_numero: compteNumero } : {}),
      },
    }),
};

// ---- Outils ----
export const outilsApi = {
  declarationTVA: (societeId: number, exerciceId: number) =>
    api.get('/api/comptabilite/declaration-tva/', {
      params: { societe: societeId, exercice: exerciceId },
    }),
  balanceAgee: (societeId: number, exerciceId: number, typeTiers = 'client') =>
    api.get('/api/comptabilite/balance-agee/', {
      params: { societe: societeId, exercice: exerciceId, type_tiers: typeTiers },
    }),
  journalCentralisateur: (societeId: number, exerciceId: number) =>
    api.get('/api/comptabilite/journal-centralisateur/', {
      params: { societe: societeId, exercice: exerciceId },
    }),
  backupUrl: () => `${window.location.origin}/api/comptabilite/backup/`,
  restoreBackup: (file: File) => {
    const fd = new FormData();
    fd.append('backup_file', file);
    return api.post('/api/comptabilite/backup/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ---- Rapports ----
export const rapportsApi = {
  balance: (societeId: number, exerciceId: number, niveau?: number) =>
    api.get('/api/rapports/balance/', {
      params: { societe: societeId, exercice: exerciceId, ...(niveau ? { niveau } : {}) },
    }),
  grandLivre: (societeId: number, exerciceId: number, compteDebut?: string, compteFin?: string) =>
    api.get('/api/rapports/grand-livre/', {
      params: {
        societe: societeId,
        exercice: exerciceId,
        ...(compteDebut ? { compte_debut: compteDebut } : {}),
        ...(compteFin ? { compte_fin: compteFin } : {}),
      },
    }),
  bilan: (societeId: number, exerciceId: number) =>
    api.get('/api/rapports/bilan/', { params: { societe: societeId, exercice: exerciceId } }),
  compteResultat: (societeId: number, exerciceId: number) =>
    api.get('/api/rapports/compte-resultat/', {
      params: { societe: societeId, exercice: exerciceId },
    }),
  exportBalance: (societeId: number, exerciceId: number) =>
    `${window.location.origin}/api/rapports/balance/?societe=${societeId}&exercice=${exerciceId}&format=excel`,
  exportGrandLivre: (societeId: number, exerciceId: number) =>
    `${window.location.origin}/api/rapports/grand-livre/?societe=${societeId}&exercice=${exerciceId}&format=excel`,
  tft: (societeId: number, exerciceId: number) =>
    api.get('/api/rapports/tft/', { params: { societe: societeId, exercice: exerciceId } }),
  notesAnnexes: (societeId: number, exerciceId: number) =>
    api.get('/api/rapports/notes-annexes/', { params: { societe: societeId, exercice: exerciceId } }),
};

// ---- Audit Log ----
export const auditApi = {
  list: (societeId: number) =>
    api.get('/api/comptabilite/audit-log/', { params: { societe: societeId } }),
};

export default api;
