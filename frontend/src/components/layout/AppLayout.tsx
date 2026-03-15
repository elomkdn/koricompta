import React, { useState } from 'react';
import { Select, Button, Dropdown, Space, Tag, Form, Input, Modal, DatePicker, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  EditOutlined, SearchOutlined, FileTextOutlined, UnorderedListOutlined,
  BookOutlined, TeamOutlined, BankOutlined, BarChartOutlined, BuildOutlined,
  SettingOutlined, LogoutOutlined, UserOutlined, PlusOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, HistoryOutlined, HomeOutlined, ToolOutlined,
} from '@ant-design/icons';
import type { Societe, ExerciceComptable, User } from '../../types';
import { societeApi, exerciceApi } from '../../services/api';
import dayjs from 'dayjs';

const { Text } = Typography;

const NAV: (null | { key: string; icon: JSX.Element; label: string; adminOnly?: boolean })[] = [
  { key: 'dashboard',       icon: <HomeOutlined />,           label: 'Tableau de bord' },
  null,
  { key: 'ecritures',      icon: <EditOutlined />,           label: 'Saisie des écritures' },
  { key: 'factures',       icon: <FileTextOutlined />,       label: 'Saisie par facture' },
  { key: 'consultation',   icon: <SearchOutlined />,         label: 'Consultation' },
  { key: 'modeles',        icon: <FileTextOutlined />,       label: "Modèles d'écriture" },
  null,
  { key: 'plan-comptable', icon: <UnorderedListOutlined />,  label: 'Plan Comptable' },
  { key: 'journaux',       icon: <BookOutlined />,           label: 'Journaux' },
  { key: 'tiers',          icon: <TeamOutlined />,           label: 'Tiers' },
  null,
  { key: 'rapprochement',  icon: <BankOutlined />,           label: 'Rapprochement' },
  { key: 'immobilisations',icon: <BuildOutlined />,          label: 'Immobilisations' },
  null,
  { key: 'rapports',       icon: <BarChartOutlined />,       label: 'Rapports & États' },
  null,
  { key: 'outils',         icon: <ToolOutlined />,           label: 'Outils' },
  { key: 'audit',          icon: <HistoryOutlined />,        label: "Journal d'audit" },
  { key: 'gestion-utilisateurs', icon: <TeamOutlined />,     label: 'Gestion utilisateurs', adminOnly: true },
  { key: 'parametres',     icon: <SettingOutlined />,        label: 'Paramètres' },
];

const LABELS: Record<string, string> = {
  dashboard: 'Tableau de bord',
  ecritures: 'Saisie des écritures', factures: 'Saisie par facture',
  consultation: 'Consultation',
  modeles: "Modèles d'écriture", 'plan-comptable': 'Plan Comptable',
  journaux: 'Journaux', tiers: 'Tiers', rapprochement: 'Rapprochement bancaire',
  immobilisations: 'Immobilisations', rapports: 'Rapports & États',
  outils: 'Outils', audit: "Journal d'audit", parametres: 'Paramètres',
  'gestion-utilisateurs': 'Gestion des utilisateurs',
};

const ROLE_COLOR: Record<string, string> = {
  admin: '#7c3aed',
  comptable: '#1a56db',
  consultant: '#0891b2',
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
  user?: User | null;
}

export default function AppLayout({
  activeMenu, onMenuChange,
  societes, societeActive, onSocieteChange,
  exercices, exerciceActif, onExerciceChange,
  onLogout, onSocieteCreated, children, user,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
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

  const isAdmin = user?.role === 'admin';

  const userMenu: MenuProps = {
    items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Se déconnecter', danger: true }],
    onClick: () => onLogout(),
  };

  const sideW = collapsed ? 56 : 240;

  const visibleNav = NAV.filter(item => {
    if (item === null) return true;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  const userLabel = user
    ? (user.first_name || user.last_name
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.username)
    : null;

  return (
    <>
      {/* Root: full-height horizontal flex */}
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: sideW, minWidth: sideW, height: '100vh',
          background: '#0f172a', display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s, min-width 0.2s', overflow: 'hidden',
          flexShrink: 0,
          fontFamily: "'Inter Variable', Inter, sans-serif",
        }}>
          {/* Brand area */}
          <div style={{
            height: 64, display: 'flex', alignItems: 'center',
            padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0, gap: 10,
            justifyContent: collapsed ? 'center' : undefined,
          }}>
            {!collapsed && (
              <>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #1a56db 0%, #3b82f6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                }}>
                  K
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                    KoriCompta
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, whiteSpace: 'nowrap' }}>
                    Comptabilité SYSCOHADA
                  </div>
                </div>
              </>
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
            {visibleNav.map((item, i) =>
              item === null ? (
                <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 0' }} />
              ) : (
                <div
                  key={item.key}
                  onClick={() => onMenuChange(item.key)}
                  onMouseEnter={() => setHoveredKey(item.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: collapsed ? '10px 0' : '10px 16px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    cursor: 'pointer',
                    background: activeMenu === item.key
                      ? 'rgba(26,86,219,0.12)'
                      : hoveredKey === item.key
                        ? 'rgba(255,255,255,0.05)'
                        : 'transparent',
                    borderLeft: activeMenu === item.key
                      ? '3px solid #1a56db'
                      : '3px solid transparent',
                    color: activeMenu === item.key
                      ? '#fff'
                      : hoveredKey === item.key
                        ? 'rgba(255,255,255,0.85)'
                        : 'rgba(255,255,255,0.55)',
                    fontSize: 13, whiteSpace: 'nowrap',
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

        {/* Main area: column flex */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Topbar */}
          <div style={{
            height: 56, minHeight: 56, background: '#ffffff',
            boxShadow: '0 1px 0 #e2e8f0',
            display: 'flex', alignItems: 'center',
            padding: '0 20px', gap: 12, flexShrink: 0,
          }}>
            <Typography.Text strong style={{ flex: 1, fontSize: 15, color: '#0f172a' }}>
              {LABELS[activeMenu] ?? 'KoriCompta'}
            </Typography.Text>

            <Select
              value={societeActive?.id}
              placeholder="Société"
              style={{ width: 200 }}
              prefix={<BookOutlined style={{ color: '#94a3b8' }} />}
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
              <Button type="text" icon={<UserOutlined />} style={{ color: '#6b7280' }}>
                {userLabel && (
                  <Space size={6}>
                    <span style={{ marginLeft: 4, fontSize: 13 }}>{userLabel}</span>
                    {user?.role && (
                      <Tag
                        style={{
                          fontSize: 10, padding: '0 5px', lineHeight: '18px',
                          marginInlineEnd: 0, borderRadius: 4,
                          background: ROLE_COLOR[user.role] ?? '#64748b',
                          color: '#fff', border: 'none',
                        }}
                      >
                        {user.role}
                      </Tag>
                    )}
                  </Space>
                )}
              </Button>
            </Dropdown>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto', background: '#f1f5f9' }}>
            {/* Top accent bar */}
            <div style={{ height: 4, background: '#1a56db', flexShrink: 0 }} />
            <div style={{ padding: 24 }}>
              {children}
            </div>
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
