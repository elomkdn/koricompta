import React, { useEffect, useState } from 'react';
import {
  Table, Select, Typography, Row, Col, Card, Statistic, Empty, Spin,
  message, Button, Space, Tag, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Societe, ExerciceComptable, Compte } from '../../types';
import { compteApi, consultationApi, ligneApi } from '../../services/api';

const { Text } = Typography;

interface Props { societe: Societe; exercice: ExerciceComptable; }

interface LigneConsultation {
  id: number;
  date_piece: string;
  journal_code: string;
  numero_piece: string;
  libelle: string;
  debit: string;
  credit: string;
  lettrage_code: string;
  solde_progressif: number;
}

interface ConsultationData {
  compte: { id: number; numero: string; intitule: string };
  solde_debit: number;
  solde_credit: number;
  solde: number;
  lignes: LigneConsultation[];
}

const fmt = (n: number | string) =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function ConsultationCompte({ societe, exercice }: Props) {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loadingComptes, setLoadingComptes] = useState(false);
  const [selectedCompteId, setSelectedCompteId] = useState<number | undefined>();
  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [lettrageLoading, setLettrageLoading] = useState(false);

  useEffect(() => {
    setLoadingComptes(true);
    compteApi.list(societe.id)
      .then(res => setComptes(res.data.results ?? res.data))
      .catch(() => message.error('Erreur chargement comptes'))
      .finally(() => setLoadingComptes(false));
  }, [societe.id]);

  const loadConsultation = async (compteId: number) => {
    setLoadingData(true);
    setConsultation(null);
    setSelectedRowKeys([]);
    try {
      const res = await consultationApi.get(societe.id, exercice.id, compteId);
      const data = res.data[0];
      let running = 0;
      const lignes = (data.lignes || []).map((l: LigneConsultation) => {
        running += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        return { ...l, solde_progressif: running };
      });
      setConsultation({ ...data, lignes });
    } catch {
      message.error('Erreur consultation');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSelectCompte = (id: number) => {
    setSelectedCompteId(id);
    loadConsultation(id);
  };

  const handleLettrer = async () => {
    if (selectedRowKeys.length < 2) { message.warning('Sélectionnez au moins 2 lignes'); return; }
    setLettrageLoading(true);
    try {
      const res = await ligneApi.lettrer(selectedRowKeys);
      message.success(`Lettrage ${res.data.code} effectué`);
      setSelectedRowKeys([]);
      if (selectedCompteId) loadConsultation(selectedCompteId);
    } catch (e: any) {
      message.error(e.response?.data?.error || 'Erreur de lettrage');
    } finally {
      setLettrageLoading(false);
    }
  };

  const handleDelettrer = async () => {
    if (selectedRowKeys.length === 0) return;
    setLettrageLoading(true);
    try {
      await ligneApi.delettrer(selectedRowKeys);
      message.success('Lettrage annulé');
      setSelectedRowKeys([]);
      if (selectedCompteId) loadConsultation(selectedCompteId);
    } catch {
      message.error('Erreur de délettrage');
    } finally {
      setLettrageLoading(false);
    }
  };

  const totalDebit = consultation?.lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0) ?? 0;
  const totalCredit = consultation?.lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0) ?? 0;

  const columns: ColumnsType<LigneConsultation> = [
    { title: 'Date', dataIndex: 'date_piece', key: 'date_piece', width: 100 },
    { title: 'Journal', dataIndex: 'journal_code', key: 'journal_code', width: 75 },
    { title: 'N° Pièce', dataIndex: 'numero_piece', key: 'numero_piece', width: 110 },
    { title: 'Libellé', dataIndex: 'libelle', key: 'libelle' },
    {
      title: 'Débit', dataIndex: 'debit', key: 'debit', width: 120, align: 'right',
      render: (v: string) => Number(v) ? fmt(v) : null,
    },
    {
      title: 'Crédit', dataIndex: 'credit', key: 'credit', width: 120, align: 'right',
      render: (v: string) => Number(v) ? fmt(v) : null,
    },
    {
      title: 'Lettrage', dataIndex: 'lettrage_code', key: 'lettrage_code', width: 90,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : null,
    },
    {
      title: 'Solde progressif', dataIndex: 'solde_progressif', key: 'solde_progressif',
      width: 140, align: 'right',
      render: (v: number) => <Text type={v < 0 ? 'danger' : undefined}>{fmt(v)}</Text>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={24}>
        {/* Panneau gauche */}
        <Col span={6}>
          <Card title="Compte" size="small">
            <Select
              showSearch style={{ width: '100%' }}
              placeholder="Numéro ou intitulé..."
              loading={loadingComptes}
              value={selectedCompteId}
              onChange={handleSelectCompte}
              filterOption={(input, option) =>
                String(option?.label || '').toLowerCase().includes(input.toLowerCase())}
              options={comptes.map(c => ({ value: c.id, label: `${c.numero} — ${c.intitule}` }))}
            />
            {consultation && (
              <div style={{ marginTop: 16 }}>
                <Statistic title="Total débit" value={fmt(consultation.solde_debit)}
                  valueStyle={{ fontSize: 13, color: '#1890ff' }} />
                <Statistic title="Total crédit" value={fmt(consultation.solde_credit)}
                  valueStyle={{ fontSize: 13, color: '#52c41a' }} style={{ marginTop: 8 }} />
                <Statistic
                  title="Solde net"
                  value={fmt(Math.abs(consultation.solde))}
                  suffix={consultation.solde >= 0 ? 'D' : 'C'}
                  valueStyle={{ fontSize: 13, fontWeight: 700,
                    color: consultation.solde >= 0 ? '#1890ff' : '#52c41a' }}
                  style={{ marginTop: 8 }}
                />
              </div>
            )}
          </Card>
        </Col>

        {/* Panneau droit */}
        <Col span={18}>
          {!selectedCompteId ? (
            <Card><Empty description="Sélectionnez un compte" /></Card>
          ) : loadingData ? (
            <Card><div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div></Card>
          ) : consultation ? (
            <Card
              title={
                <span>
                  <Text strong>{consultation.compte.numero}</Text>
                  {' — '}
                  <Text>{consultation.compte.intitule}</Text>
                </span>
              }
              size="small"
              extra={
                selectedRowKeys.length > 0 && (
                  <Space>
                    <Text type="secondary">{selectedRowKeys.length} ligne(s) sélectionnée(s)</Text>
                    <Button size="small" type="primary" loading={lettrageLoading}
                      onClick={handleLettrer}>
                      Lettrer
                    </Button>
                    <Popconfirm title="Annuler le lettrage ?" onConfirm={handleDelettrer}>
                      <Button size="small" danger loading={lettrageLoading}>Délettrer</Button>
                    </Popconfirm>
                  </Space>
                )
              }
            >
              <Table
                columns={columns}
                dataSource={consultation.lignes}
                rowKey="id"
                size="small"
                pagination={false}
                rowSelection={{
                  selectedRowKeys,
                  onChange: keys => setSelectedRowKeys(keys as number[]),
                  getCheckboxProps: () => ({}),
                }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}><Text strong>TOTAUX</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right"><Text strong>{fmt(totalDebit)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right"><Text strong>{fmt(totalCredit)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={6} />
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong type={totalDebit - totalCredit < 0 ? 'danger' : undefined}>
                        {fmt(totalDebit - totalCredit)}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
                scroll={{ x: 900 }}
              />
            </Card>
          ) : null}
        </Col>
      </Row>
    </div>
  );
}
