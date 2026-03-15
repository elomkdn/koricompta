import React, { useState } from 'react';
import { ConfigProvider, Spin } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { antTheme } from './theme';
import { useAuth } from './hooks/useAuth';
import { useSociete } from './hooks/useSociete';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './components/layout/LoginPage';
import Dashboard from './components/dashboard/Dashboard';
import SaisieEcritures from './components/ecritures/SaisieEcritures';
import AnalyseFacture from './components/factures/AnalyseFacture';
import ConsultationCompte from './components/ecritures/ConsultationCompte';
import ModelesEcriture from './components/ecritures/ModelesEcriture';
import PlanComptable from './components/plan-comptable/PlanComptable';
import Journaux from './components/journaux/Journaux';
import TiersList from './components/tiers/TiersList';
import RapprochementBancaire from './components/rapprochement/RapprochementBancaire';
import Immobilisations from './components/immobilisations/Immobilisations';
import Rapports from './components/rapports/Rapports';
import Outils from './components/layout/Outils';
import AuditLog from './components/outils/AuditLog';
import Parametres from './components/layout/Parametres';
import GestionUtilisateurs from './components/admin/GestionUtilisateurs';
import type { User } from './types';

function AuthenticatedApp({ onLogout, user }: { onLogout: () => void; user: User | null }) {
  const {
    societes, societeActive, setSocieteActive,
    exercices, exerciceActif, setExerciceActif,
    loading, refreshSocietes,
  } = useSociete();
  const [activeMenu, setActiveMenu] = useState('dashboard');

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Chargement des données..." />
      </div>
    );
  }

  const renderContent = () => {
    if (activeMenu === 'gestion-utilisateurs') {
      return <GestionUtilisateurs />;
    }

    if (!societeActive || !exerciceActif) {
      return (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <p>Veuillez sélectionner une société et un exercice pour commencer.</p>
          <p>Si aucune société n'existe, créez-en une dans les paramètres.</p>
        </div>
      );
    }

    switch (activeMenu) {
      case 'dashboard':
        return <Dashboard societe={societeActive} exercice={exerciceActif} />;
      case 'ecritures':
        return <SaisieEcritures societe={societeActive} exercice={exerciceActif} user={user} />;
      case 'factures':
        return <AnalyseFacture societe={societeActive} exercice={exerciceActif} exercices={exercices} />;
      case 'consultation':
        return <ConsultationCompte societe={societeActive} exercice={exerciceActif} />;
      case 'modeles':
        return <ModelesEcriture societe={societeActive} exercice={exerciceActif} />;
      case 'plan-comptable':
        return <PlanComptable societe={societeActive} />;
      case 'journaux':
        return <Journaux societe={societeActive} />;
      case 'tiers':
        return <TiersList societe={societeActive} />;
      case 'rapprochement':
        return <RapprochementBancaire societe={societeActive} exercice={exerciceActif} />;
      case 'immobilisations':
        return <Immobilisations societe={societeActive} exercice={exerciceActif} />;
      case 'rapports':
        return <Rapports societe={societeActive} exercice={exerciceActif} />;
      case 'outils':
        return <Outils societe={societeActive} exercice={exerciceActif} />;
      case 'audit':
        return <AuditLog societe={societeActive} />;
      case 'parametres':
        return (
          <Parametres
            societe={societeActive}
            exercices={exercices}
            exerciceActif={exerciceActif}
            onRefresh={() => window.location.reload()}
            onSocieteUpdated={() => refreshSocietes(societeActive?.id)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AppLayout
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      societes={societes}
      societeActive={societeActive}
      onSocieteChange={setSocieteActive}
      exercices={exercices}
      exerciceActif={exerciceActif}
      onExerciceChange={setExerciceActif}
      onLogout={onLogout}
      onSocieteCreated={refreshSocietes}
      user={user}
    >
      {renderContent()}
    </AppLayout>
  );
}

export default function App() {
  const { loading, login, logout, isAuthenticated, user } = useAuth();

  if (loading) {
    return (
      <ConfigProvider locale={frFR} theme={antTheme}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Spin size="large" />
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={frFR} theme={antTheme}>
      {isAuthenticated ? (
        <AuthenticatedApp onLogout={logout} user={user} />
      ) : (
        <LoginPage onLogin={login} />
      )}
    </ConfigProvider>
  );
}
