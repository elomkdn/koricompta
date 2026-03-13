import React, { useState } from 'react';
import { Select, Button, Dropdown, Space, Tag, Form, Input, Modal, DatePicker, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  EditOutlined, SearchOutlined, FileTextOutlined, UnorderedListOutlined,
  BookOutlined, TeamOutlined, BankOutlined, ToolOutlined, BarChartOutlined,
  SettingOutlined, LogoutOutlined, UserOutlined, PlusOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from '@ant-design/icons';
import type { Societe, ExerciceComptable } from '../../types';
import { societeApi, exerciceApi } from '../../services/api';
import dayjs from 'dayjs';

const { Text } = Typography;

const NAV = [
  { key: 'ecritures',      icon: <EditOutlined />,           label: 'Saisie des écritures' },
  { key: 'consultation',   icon: <SearchOutlined />,         label: 'Consultation' },
  { key: 'modeles',        icon: <FileTextOutlined />,       label: "Modèles d'écriture" },
  null,
  { key: 'plan-comptable', icon: <UnorderedListOutlined />,  label: 'Plan Comptable' },
  { key: 'journaux',       icon: <BookOutlined />,           label: 'Journaux' },
  { key: 'tiers',          icon: <TeamOutlined />,           label: 'Tiers' },
  null,
  { key: 'rapprochement',  icon: <BankOutlined />,           label: 'Rapprochement' },
  { key: 'immobilisations',icon: <ToolOutlined />,           label: 'Immobilisations' },
  null,
  { key: 'rapports',       icon: <BarChartOutlined />,       label: 'Rapports & États' },
  null,
  { key: 'outils',         icon: <ToolOutlined />,           label: 'Outils' },
  { key: 'parametres',     icon: <SettingOutlined />,        label: 'Paramètres' },
];

const LABELS: Record<string, string> = {
  ecritures: 'Saisie des écritures', consultation: 'Consultation',
  modeles: "Modèles d'écriture", 'plan-comptable': 'Plan Comptable',
  journaux: 'Journaux', tiers: 'Tiers', rapprochement: 'Rapprochement bancaire',
  immobilisations: 'Immobilisations', rapports: 'Rapports & États',
  outils: 'Outils', parametres: 'Paramètres',
};

interface Props {
  activeMenu: string;
  onMenuChange: (key: string) => void;
  societes: Societe[];
  societeActive: Societe | null;
  onSocieteChange: (s: Societe) => void;
  exercices: ExerciceComptable[];
  exerciceActif: ExerciceComptable | null;
  onExerciceChange: (e: ExerciceComptable) => void;
  onLogout: () => void;
  onSocieteCreated: (id?: number) => void;
  children: React.ReactNode;
}

export default function AppLayout({
  activeMenu, onMenuChange,
  societes, societeActive, onSocieteChange,
  exercices, exerciceActif, onExerciceChange,
  onLogout, onSocieteCreated, children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [modalSociete, setModalSociete] = useState(false);
  const [modalExercice, setModalExercice] = useState(false);
  const [societeForm] = Form.useForm();
  const [exerciceForm] = Form.useForm();

  const handleCreateSociete = async (values: { nom: string; sigle?: string }) => {
    const res = await societeApi.create(values);
    onSocieteCreated(res.data.id);
    setModalSociete(false);
    societeForm.resetFields();
  };

  const handleCreateExercice = async (values: {
    code: string; libelle: string;
    date_debut: dayjs.Dayjs; date_fin: dayjs.Dayjs;
  }) => {
    if (!societeActive) return;
    const res = await exerciceApi.create({
      societe: societeActive.id, code: values.code, libelle: values.libelle,
      date_debut: values.date_debut.format('YYYY-MM-DD'),
      date_fin: values.date_fin.format('YYYY-MM-DD'),
    });
    onExerciceChange(res.data);
    setModalExercice(false);
    exerciceForm.resetFields();
  };

  const userMenu: MenuProps = {
    items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Se déconnecter', danger: true }],
    onClick: () => onLogout(),
  };

  const sideW = collapsed ? 56 : 240;

  return (
    <>
      {/* ── Racine : flex horizontal pleine hauteur ── */}
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: sideW, minWidth: sideW, height: '100vh',
          background: '#001529', display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s, min-width 0.2s', overflow: 'hidden',
          flexShrink: 0,
          fontFamily: "'Inter Variable', Inter, sans-serif",
        }}>
          {/* Brand */}
          <div style={{
            height: 64, display: 'flex', alignItems: 'center',
            padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0, gap: 8,
            justifyContent: collapsed ? 'center' : undefined,
          }}>
            {!collapsed && (
              <img src="/logo.svg" alt="K" style={{ width: 36, height: 36, flexShrink: 0 }} />
            )}
            {!collapsed && (
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', flex: 1 }}>
                KoriCompta
              </span>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)', padding: 4, flexShrink: 0,
                display: 'flex', alignItems: 'center',
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 8 }}>
            {NAV.map((item, i) =>
              item === null ? (
                <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '6px 0' }} />
              ) : (
                <div
                  key={item.key}
                  onClick={() => onMenuChange(item.key)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: collapsed ? '10px 0' : '10px 16px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    cursor: 'pointer',
                    color: activeMenu === item.key ? '#fff' : 'rgba(255,255,255,0.6)',
                    background: activeMenu === item.key ? 'rgba(24,144,255,0.15)' : 'transparent',
                    borderLeft: activeMenu === item.key ? '3px solid #1890ff' : '3px solid transparent',
                    fontSize: 13.5, whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                </div>
              )
            )}
          </nav>
        </div>

        {/* ── Zone principale : flex colonne ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Topbar */}
          <div style={{
            height: 56, minHeight: 56, background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center',
            padding: '0 20px', gap: 12, flexShrink: 0,
          }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: '#111' }}>
              {LABELS[activeMenu] ?? 'KoriCompta'}
            </span>

            <Select
              value={societeActive?.id}
              placeholder="Société"
              style={{ width: 200 }}
              onChange={(id) => { const s = societes.find(x => x.id === id); if (s) onSocieteChange(s); }}
              options={societes.map(s => ({ value: s.id, label: s.nom }))}
              dropdownRender={(menu) => (
                <>{menu}
                  <div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0' }}>
                    <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setModalSociete(true)}>
                      Nouvelle société
                    </Button>
                  </div>
                </>
              )}
            />

            <Select
              value={exerciceActif?.id}
              placeholder="Exercice"
              style={{ width: 160 }}
              onChange={(id) => { const e = exercices.find(x => x.id === id); if (e) onExerciceChange(e); }}
              options={exercices.map(e => ({
                value: e.id,
                label: (
                  <Space size={4}>
                    <Text>{e.code}</Text>
                    <Tag color={e.statut === 'ouvert' ? 'green' : 'default'}
                      style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', marginInlineEnd: 0 }}>
                      {e.statut}
                    </Tag>
                  </Space>
                ),
              }))}
              dropdownRender={(menu) => (
                <>{menu}
                  <div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0' }}>
                    <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setModalExercice(true)}>
                      Nouvel exercice
                    </Button>
                  </div>
                </>
              )}
            />

            <Dropdown menu={userMenu} placement="bottomRight">
              <Button type="text" icon={<UserOutlined />} style={{ color: '#6b7280' }} />
            </Dropdown>
          </div>

          {/* Contenu */}
          <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#f5f5f5' }}>
            {children}
          </div>

        </div>
      </div>

      {/* Modals */}
      <Modal title="Nouvelle société" open={modalSociete}
        onCancel={() => setModalSociete(false)} onOk={() => societeForm.submit()} okText="Créer">
        <Form form={societeForm} layout="vertical" onFinish={handleCreateSociete} style={{ marginTop: 16 }}>
          <Form.Item name="nom" label="Raison sociale" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sigle" label="Sigle"><Input /></Form.Item>
          <Form.Item name="forme_juridique" label="Forme juridique">
            <Select placeholder="Sélectionner..." allowClear options={[
              { value: 'SARL', label: 'SARL' },
              { value: 'SA',   label: 'SA' },
              { value: 'SAS',  label: 'SAS' },
              { value: 'SNC',  label: 'SNC' },
              { value: 'EI',   label: 'Entreprise individuelle' },
              { value: 'GIE',  label: 'GIE' },
              { value: 'ONG',  label: 'ONG' },
              { value: 'AUTRE',label: 'Autre' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Nouvel exercice" open={modalExercice}
        onCancel={() => setModalExercice(false)} onOk={() => exerciceForm.submit()} okText="Créer">
        <Form form={exerciceForm} layout="vertical" onFinish={handleCreateExercice} style={{ marginTop: 16 }}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input placeholder="ex: 2024" /></Form.Item>
          <Form.Item name="libelle" label="Libellé" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="date_debut" label="Date de début" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="date_fin" label="Date de fin" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
