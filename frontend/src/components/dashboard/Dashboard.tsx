import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Table, Tag, Space, Typography, Alert, Spin, Empty } from 'antd';
import {
  BankOutlined, FileTextOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { Societe, ExerciceComptable } from '../../types';
import { pieceApi, rapportsApi, immobilisationApi } from '../../services/api';
import { SUCCESS, DANGER } from '../../theme';

const { Title, Text } = Typography;

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

export default function Dashboard({ societe, exercice }: Props) {
  const [balance, setBalance] = useState<any[]>([]);
  const [pieces, setPieces] = useState<any[]>([]);
  const [immobilisations, setImmobilisations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      rapportsApi.balance(societe.id, exercice.id).catch(() => ({ data: {} })),
      pieceApi.list({ exercice: exercice.id, page_size: 10, ordering: '-date_piece' }).catch(() => ({ data: { results: [] } })),
      immobilisationApi.list(societe.id, exercice.id).catch(() => ({ data: [] })),
    ]).then(([balRes, pieceRes, immoRes]) => {
      // BalanceData shape: { lignes: LigneBalance[], ... }
      const balData = balRes.data;
      setBalance(Array.isArray(balData) ? balData : (balData.lignes ?? balData.comptes ?? []));
      setPieces(pieceRes.data.results ?? pieceRes.data ?? []);
      setImmobilisations(Array.isArray(immoRes.data) ? immoRes.data : (immoRes.data.results ?? []));
    }).finally(() => setLoading(false));
  }, [societe.id, exercice.id]);

  // Compute metrics from balance (solde_debiteur / solde_crediteur are strings)
  const parseNum = (v: any) => parseFloat(v) || 0;

  const tresorerie = balance
    .filter((c: any) => c.numero?.startsWith('5'))
    .reduce((s: number, c: any) => s + (parseNum(c.solde_debiteur) - parseNum(c.solde_crediteur)), 0);

  const produits = balance
    .filter((c: any) => c.numero?.startsWith('7'))
    .reduce((s: number, c: any) => s + parseNum(c.solde_crediteur), 0);

  const charges = balance
    .filter((c: any) => c.numero?.startsWith('6'))
    .reduce((s: number, c: any) => s + parseNum(c.solde_debiteur), 0);

  const resultat = produits - charges;

  const brouillons = pieces.filter((p: any) => p.statut === 'brouillard');
  const immoSansDotation = immobilisations.filter((i: any) => !i.derniere_dotation);

  const fmtMoney = (n: number) =>
    n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' FCFA';

  const statCards = [
    {
      title: 'Trésorerie',
      value: tresorerie,
      icon: <BankOutlined />,
      color: tresorerie >= 0 ? SUCCESS : DANGER,
      bg: tresorerie >= 0 ? '#f0fdf4' : '#fef2f2',
    },
    {
      title: 'Produits (CA)',
      value: produits,
      icon: <ArrowUpOutlined />,
      color: SUCCESS,
      bg: '#f0fdf4',
    },
    {
      title: 'Charges',
      value: charges,
      icon: <ArrowDownOutlined />,
      color: DANGER,
      bg: '#fef2f2',
    },
    {
      title: 'Résultat net',
      value: resultat,
      icon: <FileTextOutlined />,
      color: resultat >= 0 ? SUCCESS : DANGER,
      bg: resultat >= 0 ? '#f0fdf4' : '#fef2f2',
    },
  ];

  const pieceColumns = [
    { title: 'Date', dataIndex: 'date_piece', width: 100 },
    {
      title: 'Journal', dataIndex: 'journal', width: 80,
      render: (j: any) => j?.code || '—',
    },
    { title: 'Réf.', dataIndex: 'reference', width: 120, render: (v: any) => v || '—' },
    { title: 'Libellé', dataIndex: 'libelle', ellipsis: true },
    {
      title: 'Statut', dataIndex: 'statut', width: 100,
      render: (s: string) => (
        <Tag color={s === 'valide' ? 'success' : 'warning'}>
          {s === 'valide' ? 'Validé' : 'Brouillon'}
        </Tag>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
          Tableau de bord
        </Title>
        <Text style={{ color: '#64748b', fontSize: 13 }}>
          {societe.nom} — Exercice {exercice.code}
        </Text>
      </div>

      {/* Alerts */}
      {brouillons.length > 0 && (
        <Alert
          type="warning"
          icon={<ClockCircleOutlined />}
          showIcon
          message={`${brouillons.length} écriture${brouillons.length > 1 ? 's' : ''} en brouillon à valider`}
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}
      {immoSansDotation.length > 0 && (
        <Alert
          type="info"
          icon={<ExclamationCircleOutlined />}
          showIcon
          message={`${immoSansDotation.length} immobilisation${immoSansDotation.length > 1 ? 's' : ''} sans dotation enregistrée`}
          style={{ marginBottom: 24, borderRadius: 8 }}
        />
      )}

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCards.map(card => (
          <Col key={card.title} xs={24} sm={12} xl={6}>
            <Card
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text style={{
                    fontSize: 12, color: '#64748b', fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    display: 'block',
                  }}>
                    {card.title}
                  </Text>
                  <div style={{
                    fontSize: 20, fontWeight: 700, color: card.color,
                    marginTop: 4, lineHeight: 1.2, wordBreak: 'break-word',
                  }}>
                    {fmtMoney(card.value)}
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0, marginLeft: 12,
                  background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, color: card.color,
                }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Recent pieces */}
      <Card
        title={<span style={{ fontWeight: 600, fontSize: 14 }}>Écritures récentes</span>}
        style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
        styles={{ body: { padding: 0 } }}
      >
        {pieces.length === 0 ? (
          <Empty description="Aucune écriture pour cet exercice" style={{ padding: 40 }} />
        ) : (
          <Table
            dataSource={pieces}
            columns={pieceColumns}
            rowKey="id"
            size="small"
            pagination={false}
            style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden' }}
          />
        )}
      </Card>

      {/* Summary info */}
      {balance.length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
            Données issues de la balance — {balance.length} compte{balance.length > 1 ? 's' : ''} mouvementé{balance.length > 1 ? 's' : ''}
          </Text>
        </div>
      )}
    </div>
  );
}
