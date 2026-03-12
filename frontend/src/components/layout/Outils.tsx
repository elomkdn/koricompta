import React, { useState, useRef } from 'react';
import {
  Card, Button, Table, Select, Tag, message, Typography, Row, Col,
  Popconfirm, Upload, Statistic, Space,
} from 'antd';
import {
  DownloadOutlined, UploadOutlined, FileTextOutlined,
  BarChartOutlined, BankOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Societe, ExerciceComptable } from '../../types';
import { outilsApi } from '../../services/api';

const { Title, Text } = Typography;

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

interface TVAData {
  tva_collectee: number;
  tva_deductible: number;
  tva_a_payer: number;
}

interface JournalCentralisateurRow {
  journal_code: string;
  journal_intitule: string;
  nb_pieces: number;
  total_debit: number;
  total_credit: number;
  solde: number;
}

interface BalanceAgeeRow {
  compte_numero: string;
  compte_intitule: string;
  non_echues: number;
  tranche_0_30: number;
  tranche_30_60: number;
  tranche_60_90: number;
  tranche_plus_90: number;
  total: number;
}

const fmt = (n: number | string) =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

const Outils: React.FC<Props> = ({ societe, exercice }) => {
  // TVA state
  const [tvaData, setTvaData] = useState<TVAData | null>(null);
  const [loadingTva, setLoadingTva] = useState(false);

  // Journal centralisateur state
  const [journalData, setJournalData] = useState<JournalCentralisateurRow[]>([]);
  const [loadingJournal, setLoadingJournal] = useState(false);

  // Balance agee state
  const [typeTiers, setTypeTiers] = useState<'client' | 'fournisseur'>('client');
  const [balanceData, setBalanceData] = useState<BalanceAgeeRow[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Backup/restore state
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadTva = async () => {
    setLoadingTva(true);
    try {
      const res = await outilsApi.declarationTVA(societe.id, exercice.id);
      setTvaData(res.data);
    } catch {
      message.error('Erreur lors du chargement de la TVA');
    } finally {
      setLoadingTva(false);
    }
  };

  const handleLoadJournal = async () => {
    setLoadingJournal(true);
    try {
      const res = await outilsApi.journalCentralisateur(societe.id, exercice.id);
      setJournalData(res.data.results ?? res.data);
    } catch {
      message.error('Erreur lors du chargement du journal centralisateur');
    } finally {
      setLoadingJournal(false);
    }
  };

  const handleLoadBalance = async () => {
    setLoadingBalance(true);
    try {
      const res = await outilsApi.balanceAgee(societe.id, exercice.id, typeTiers);
      setBalanceData(res.data.results ?? res.data);
    } catch {
      message.error('Erreur lors du chargement de la balance âgée');
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleRestore = async (file: File) => {
    setRestoring(true);
    try {
      await outilsApi.restoreBackup(file);
      message.success('Base de données restaurée avec succès');
    } catch {
      message.error('Erreur lors de la restauration');
    } finally {
      setRestoring(false);
    }
    return false; // prevent default upload
  };

  const journalColumns: ColumnsType<JournalCentralisateurRow> = [
    { title: 'Code', dataIndex: 'journal_code', key: 'journal_code', width: 80 },
    { title: 'Journal', dataIndex: 'journal_intitule', key: 'journal_intitule' },
    {
      title: 'Nb pièces',
      dataIndex: 'nb_pieces',
      key: 'nb_pieces',
      width: 90,
      align: 'center',
    },
    {
      title: 'Total Débit',
      dataIndex: 'total_debit',
      key: 'total_debit',
      align: 'right',
      width: 140,
      render: (v: number) => fmt(v),
    },
    {
      title: 'Total Crédit',
      dataIndex: 'total_credit',
      key: 'total_credit',
      align: 'right',
      width: 140,
      render: (v: number) => fmt(v),
    },
    {
      title: 'Solde',
      dataIndex: 'solde',
      key: 'solde',
      align: 'right',
      width: 130,
      render: (v: number) => (
        <Text type={v < 0 ? 'danger' : undefined}>{fmt(v)}</Text>
      ),
    },
  ];

  const balanceColumns: ColumnsType<BalanceAgeeRow> = [
    { title: 'Compte', dataIndex: 'compte_numero', key: 'compte_numero', width: 90 },
    { title: 'Intitulé', dataIndex: 'compte_intitule', key: 'compte_intitule' },
    {
      title: 'Non échues',
      dataIndex: 'non_echues',
      key: 'non_echues',
      align: 'right',
      width: 110,
      render: (v: number) => fmt(v),
    },
    {
      title: '0-30 j',
      dataIndex: 'tranche_0_30',
      key: 'tranche_0_30',
      align: 'right',
      width: 100,
      render: (v: number) => v ? <Text type="warning">{fmt(v)}</Text> : '',
    },
    {
      title: '30-60 j',
      dataIndex: 'tranche_30_60',
      key: 'tranche_30_60',
      align: 'right',
      width: 100,
      render: (v: number) => v ? <Text type="warning">{fmt(v)}</Text> : '',
    },
    {
      title: '60-90 j',
      dataIndex: 'tranche_60_90',
      key: 'tranche_60_90',
      align: 'right',
      width: 100,
      render: (v: number) => v ? <Text type="danger">{fmt(v)}</Text> : '',
    },
    {
      title: '+90 j',
      dataIndex: 'tranche_plus_90',
      key: 'tranche_plus_90',
      align: 'right',
      width: 100,
      render: (v: number) => v ? <Text type="danger">{fmt(v)}</Text> : '',
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 120,
      render: (v: number) => <Text strong>{fmt(v)}</Text>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        Outils — {exercice.libelle}
      </Title>

      <Row gutter={[24, 24]}>
        {/* 1. Sauvegarde */}
        <Col span={12}>
          <Card title={<Space><DownloadOutlined /> Sauvegarde</Space>} style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  Télécharger une copie de la base de données SQLite.
                </Text>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  href={outilsApi.backupUrl()}
                  download
                >
                  Télécharger la base de données
                </Button>
              </div>

              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  Restaurer depuis une sauvegarde. Toutes les données actuelles seront remplacées.
                </Text>
                <Popconfirm
                  title="Restaurer la base de données ?"
                  description={
                    <span>
                      <WarningOutlined style={{ color: '#ff4d4f' }} />
                      {' '}Toutes les données actuelles seront écrasées. Cette action est irréversible.
                    </span>
                  }
                  onConfirm={() => fileInputRef.current?.click()}
                  okText="Continuer"
                  cancelText="Annuler"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    icon={<UploadOutlined />}
                    loading={restoring}
                    danger
                  >
                    Restaurer une sauvegarde
                  </Button>
                </Popconfirm>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sqlite3,.db,.sqlite"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleRestore(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </Space>
          </Card>
        </Col>

        {/* 2. Déclaration TVA */}
        <Col span={12}>
          <Card
            title={<Space><FileTextOutlined /> Déclaration TVA</Space>}
            style={{ height: '100%' }}
            extra={
              <Button type="primary" onClick={handleLoadTva} loading={loadingTva}>
                Calculer
              </Button>
            }
          >
            {tvaData ? (
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="TVA collectée"
                    value={fmt(tvaData.tva_collectee)}
                    valueStyle={{ color: '#52c41a', fontSize: 16 }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="TVA déductible"
                    value={fmt(tvaData.tva_deductible)}
                    valueStyle={{ color: '#1890ff', fontSize: 16 }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="TVA à payer"
                    value={fmt(tvaData.tva_a_payer)}
                    valueStyle={{
                      color: tvaData.tva_a_payer >= 0 ? '#ff4d4f' : '#52c41a',
                      fontSize: 16,
                      fontWeight: 'bold',
                    }}
                  />
                </Col>
              </Row>
            ) : (
              <Text type="secondary">
                Cliquez sur "Calculer" pour obtenir la déclaration TVA de l'exercice.
              </Text>
            )}
          </Card>
        </Col>

        {/* 3. Journal centralisateur */}
        <Col span={12}>
          <Card
            title={<Space><BarChartOutlined /> Journal centralisateur</Space>}
            extra={
              <Button type="primary" onClick={handleLoadJournal} loading={loadingJournal}>
                Charger
              </Button>
            }
          >
            {journalData.length > 0 ? (
              <Table
                columns={journalColumns}
                dataSource={journalData}
                rowKey="journal_code"
                pagination={false}
                size="small"
                summary={() => {
                  const totalDebit = journalData.reduce((s, r) => s + Number(r.total_debit), 0);
                  const totalCredit = journalData.reduce((s, r) => s + Number(r.total_credit), 0);
                  return (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={3}>
                        <Text strong>TOTAUX</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        <Text strong>{fmt(totalDebit)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong>{fmt(totalCredit)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Text strong>{fmt(totalDebit - totalCredit)}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  );
                }}
              />
            ) : (
              <Text type="secondary">
                Cliquez sur "Charger" pour afficher le journal centralisateur.
              </Text>
            )}
          </Card>
        </Col>

        {/* 4. Balance âgée */}
        <Col span={12}>
          <Card
            title={<Space><BankOutlined /> Balance âgée</Space>}
            extra={
              <Space>
                <Select
                  value={typeTiers}
                  onChange={v => setTypeTiers(v)}
                  style={{ width: 140 }}
                >
                  <Select.Option value="client">Clients</Select.Option>
                  <Select.Option value="fournisseur">Fournisseurs</Select.Option>
                </Select>
                <Button type="primary" onClick={handleLoadBalance} loading={loadingBalance}>
                  Charger
                </Button>
              </Space>
            }
          >
            {balanceData.length > 0 ? (
              <Table
                columns={balanceColumns}
                dataSource={balanceData}
                rowKey="compte_numero"
                pagination={false}
                size="small"
                scroll={{ x: 900 }}
                summary={() => {
                  const totals = balanceData.reduce(
                    (acc, r) => ({
                      non_echues: acc.non_echues + Number(r.non_echues),
                      t0: acc.t0 + Number(r.tranche_0_30),
                      t30: acc.t30 + Number(r.tranche_30_60),
                      t60: acc.t60 + Number(r.tranche_60_90),
                      t90: acc.t90 + Number(r.tranche_plus_90),
                      total: acc.total + Number(r.total),
                    }),
                    { non_echues: 0, t0: 0, t30: 0, t60: 0, t90: 0, total: 0 }
                  );
                  return (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={2}>
                        <Text strong>TOTAUX</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <Text strong>{fmt(totals.non_echues)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        <Text strong>{fmt(totals.t0)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong>{fmt(totals.t30)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Text strong>{fmt(totals.t60)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right">
                        <Text strong>{fmt(totals.t90)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={7} align="right">
                        <Text strong>{fmt(totals.total)}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  );
                }}
              />
            ) : (
              <Text type="secondary">
                Sélectionnez le type de tiers et cliquez sur "Charger".
              </Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Outils;
