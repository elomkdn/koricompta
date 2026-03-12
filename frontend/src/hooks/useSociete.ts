import { useState, useEffect, useCallback } from 'react';
import { societeApi, exerciceApi } from '../services/api';
import type { Societe, ExerciceComptable } from '../types';

export function useSociete() {
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [societeActive, setSocieteActiveState] = useState<Societe | null>(null);
  const [exercices, setExercices] = useState<ExerciceComptable[]>([]);
  const [exerciceActif, setExerciceActifState] = useState<ExerciceComptable | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSocietes = useCallback(async (activeSocieteId?: number) => {
    try {
      const res = await societeApi.list();
      const list: Societe[] = res.data.results ?? res.data;
      setSocietes(list);
      if (list.length > 0) {
        const target = activeSocieteId
          ? list.find((s) => s.id === activeSocieteId) ?? list[0]
          : list[0];
        setSocieteActiveState(target);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadExercices = useCallback(async (societeId: number) => {
    try {
      const res = await exerciceApi.list(societeId);
      const list: ExerciceComptable[] = res.data.results ?? res.data;
      setExercices(list);
      const ouvert = list.find((e) => e.statut === 'ouvert') ?? list[0] ?? null;
      setExerciceActifState(ouvert);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadSocietes().finally(() => setLoading(false));
  }, [loadSocietes]);

  useEffect(() => {
    if (societeActive) loadExercices(societeActive.id);
  }, [societeActive, loadExercices]);

  const setSocieteActive = useCallback(
    (societe: Societe) => {
      setSocieteActiveState(societe);
      setExercices([]);
      setExerciceActifState(null);
    },
    [],
  );

  const setExerciceActif = useCallback((exercice: ExerciceComptable) => {
    setExerciceActifState(exercice);
  }, []);

  const refreshSocietes = useCallback(
    (activeSocieteId?: number) => loadSocietes(activeSocieteId),
    [loadSocietes],
  );

  return {
    societes,
    societeActive,
    setSocieteActive,
    exercices,
    exerciceActif,
    setExerciceActif,
    loading,
    refreshSocietes,
  };
}
