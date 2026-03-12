import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Select, DatePicker, InputNumber,
  Popconfirm, Tag, Space, message, Typography, Row, Col, Card, Statistic,
} from 'antd';
import { PlusOutlined, DeleteOutlined, LinkOutlined, DisconnectOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Societe, ExerciceComptable, ReleveBancaire, LigneReleve, Compte } from '../../types';
import { releveApi, compteApi, consultationApi } from '../../services/api';

const { Title, Text } = Typography;

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

interface EcritureLigne {
  id: number;
  date_piece: string;
  journal_code: string;
  libelle: string;
  debit: number;
  credit: number;
}

const fmt = (n: number | string) =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

const statutColors: Record<string, string> = {
  non_rapproche: 'orange',
  rapproche: 'green',
  ignore: 'default',
};
const statutLabels: Record<string, string> = {
  non_rapproche: 'Non rapproché',
  rapproche: 'Rapproché',
  ignore: 'Ignoré',
};

const RapprochementBancaire: React.FC<Props> = ({ societe, exercice }) => {
  const [releves, setReleves] = useState<ReleveBancaire[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReleve, setSelectedReleve] = useState<ReleveBancaire | null>(null);

  // For the selected releve detail
  const [lignesReleve, setLignesReleve] = useState<LigneReleve[]>([]);
  const [ecritures, setEcritures] = useState<EcritureLigne[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Selection for manual rapprochement
  const [selectedLigneReleve, setSelectedLigneReleve] = useState<number | null>(null);
  const [selectedEcriture, setSelectedEcriture] = useState<number | null>(null);
  const [rapproching, setRapproching] = useState(false);

  // New releve modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const comptesBanque = comptes.filter(c => c.numero.startsWith('5'));

  const loadData = async () => {
    setLoading(true);
    try {
      const [relevesRes, comptesRes] = await Promise.all([
        releveApi.list(societe.id, exercice.id),
        compteApi.list(societe.id),
      ]);
      setReleves(relevesRes.data.results ?? relevesRes.data);
      setComptes(comptesRes.data.results ?? comptesRes.data);
    } catch {
      message.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [societe.id, exercice.id]);

  const loadReleveDetail = async (releve: ReleveBancaire) => {
    setSelectedReleve(releve);
    setSelectedLigneReleve(null);
    setSelectedEcriture(null);
    setLoadingDetail(true);
    try {
      // Reload the releve to get fresh ligne data
      const relevesRes = await releveApi.list(societe.id, exercice.id);
      const relevesData: ReleveBancaire[] = relevesRes.data.results ?? relevesRes.data;
      const fresh = relevesData.find((r: ReleveBancaire) => r.id === releve.id) || releve;
      setSelectedReleve(fresh);
      setLignesReleve(fresh.lignes || []);

      // Load ecritures for this compte_banque
      const consulRes = await consultationApi.get(
        societe.id,
        exercice.id,
        fresh.compte_banque,
      );
      const consulData = consulRes.data[0];
      setEcritures(consulData?.lignes || []);
    } catch {
      message.error('Erreur lors du chargement du détail');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeleteReleve = async (id: number) => {
    try {
      await releveApi.delete(id);
      message.success('Relevé supprimé');
      if (selectedReleve?.id === id) {
        setSelectedReleve(null);
        setLignesReleve([]);
        setEcritures([]);
      }
      loadData();
    } catch {
      message.error('Erreur lors de la suppression');
    }
  };

  const handleRapprocherAuto = async () => {
    if (!selectedReleve) return;
    setRapproching(true);
    try {
      await releveApi.rapprocherAuto(selectedReleve.id);
      message.success('Rapprochement automatique effectué');
      await loadReleveDetail(selectedReleve);
      loadData();
    } catch {
      message.error('Erreur lors du rapprochement automatique');
    } finally {
      setRapproching(false);
    }
  };

  const handleRapprocherManuel = async () => {
    if (!selectedLigneReleve || !selectedEcriture) return;
    setRapproching(true);
    try {
      await releveApi.rapprocherManuel(selectedLigneReleve, selectedEcriture);
      message.success('Rapprochement effectué');
      setSelectedLigneReleve(null);
      setSelectedEcriture(null);
      if (selectedReleve) await loadReleveDetail(selectedReleve);
      loadData();
    } catch {
      message.error('Erreur lors du rapprochement');
    } finally {
      setRapproching(false);
    }
  };

  const handleDerapprocher = async (ligneReleveId: number) => {
    try {
      await releveApi.derapprocher(ligneReleveId);
      message.success('Désapprochement effectué');
      if (selectedReleve) await loadReleveDetail(selectedReleve);
      loadData();
    } catch {
      message.error('Erreur lors du désapprochement');
    }
  };

  const handleSaveReleve = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await releveApi.create({
        ...values,
        societe: societe.id,
        exercice: exercice.id,
        date_debut: values.date_debut.format('YYYY-MM-DD'),
        date_fin: values.date_fin.format('YYYY-MM-DD'),
      });
      message.success('Relevé créé');
      setModalOpen(false);
      loadData();
    } catch {
      message.error('Erreur lors de la création du relevé');
    } finally {
      setSaving(false);
    }
  };

  const releveColumns: ColumnsType<ReleveBancaire> = [
    {
      title: 'Compte',
      dataIndex: 'compte_banque_numero',
      key: 'compte_banque_numero',
      width: 100,
    },
    {
      title: 'Période',
      key: 'periode',
      render: (_, r) => `${r.date_debut} → ${r.date_fin}`,
    },
    {
      title: 'Solde initial',
      dataIndex: 'solde_initial',
      key: 'solde_initial',
      align: 'right',
      render: (v: number) => fmt(v),
    },
    {
      title: 'Solde final',
      dataIndex: 'solde_final',
      key: 'solde_final',
      align: 'right',
      render: (v: number) => fmt(v),
    },
    {
      title: 'Rappr.',
      dataIndex: 'nb_rapproches',
      key: 'nb_rapproches',
      width: 70,
      align: 'center',
      render: (v: number) => <Tag color="green">{v}</Tag>,
    },
    {
      title: 'Non rappr.',
      dataIndex: 'nb_non_rapproches',
      key: 'nb_non_rapproches',
      width: 90,
      align: 'center',
      render: (v: number) => <Tag color="orange">{v}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space>
          <Button
            type={selectedReleve?.id === record.id ? 'primary' : 'default'}
            size="small"
            onClick={() => loadReleveDetail(record)}
          >
            Ouvrir
          </Button>
          <Popconfirm
            title="Supprimer ce relevé ?"
            onConfirm={() => handleDeleteReleve(record.id)}
            okText="Oui"
            cancelText="Non"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const ligneReleveColumns: ColumnsType<LigneReleve> = [
    {
      title: 'Date',
      dataIndex: 'date_operation',
      key: 'date_operation',
      width: 95,
    },
    {
      title: 'Libellé',
      dataIndex: 'libelle',
      key: 'libelle',
    },
    {
      title: 'Montant',
      dataIndex: 'montant',
      key: 'montant',
      width: 110,
      align: 'right',
      render: (v: number) => (
        <Text type={v >= 0 ? undefined : 'danger'}>{fmt(v)}</Text>
      ),
    },
    {
      title: 'Statut',
      dataIndex: 'statut',
      key: 'statut',
      width: 110,
      render: (s: string) => (
        <Tag color={statutColors[s]}>{statutLabels[s] || s}</Tag>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_, record) => {
        if (record.statut === 'rapproche') {
          return (
            <Popconfirm
              title="Désapprocher cette ligne ?"
              onConfirm={() => handleDerapprocher(record.id)}
              okText="Oui"
              cancelText="Non"
            >
              <Button type="text" size="small" icon={<DisconnectOutlined />} title="Désapprocher" />
            </Popconfirm>
          );
        }
        return null;
      },
    },
  ];

  const ecritureColumns: ColumnsType<EcritureLigne> = [
    {
      title: 'Date',
      dataIndex: 'date_piece',
      key: 'date_piece',
      width: 95,
    },
    {
      title: 'Journal',
      dataIndex: 'journal_code',
      key: 'journal_code',
      width: 70,
    },
    {
      title: 'Libellé',
      dataIndex: 'libelle',
      key: 'libelle',
    },
    {
      title: 'Débit',
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      width: 100,
      render: (v: number) => v ? fmt(v) : '',
    },
    {
      title: 'Crédit',
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      width: 100,
      render: (v: number) => v ? fmt(v) : '',
    },
  ];

  const nonRapprochesEcritures = ecritures.filter((e: any) => !e.lettrage_code);

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            Rapprochement bancaire — {exercice.libelle}
          </Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
            Nouveau relevé
          </Button>
        </Col>
      </Row>

      {/* Relevés list */}
      <Card title="Relevés bancaires" size="small" style={{ marginBottom: 16 }}>
        <Table
          columns={releveColumns}
          dataSource={releves}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          rowClassName={record =>
            selectedReleve?.id === record.id ? 'ant-table-row-selected' : ''
          }
        />
      </Card>

      {/* Detail panel */}
      {selectedReleve && (
        <>
          {/* Stats bar */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={24}>
              <Col>
                <Statistic
                  title="Rapprochés"
                  value={selectedReleve.nb_rapproches}
                  valueStyle={{ color: '#52c41a', fontSize: 20 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="Non rapprochés"
                  value={selectedReleve.nb_non_rapproches}
                  valueStyle={{ color: '#fa8c16', fontSize: 20 }}
                />
              </Col>
              <Col flex="auto" style={{ textAlign: 'right', paddingTop: 4 }}>
                <Space>
                  <Button
                    type="default"
                    icon={<ThunderboltOutlined />}
                    onClick={handleRapprocherAuto}
                    loading={rapproching}
                  >
                    Rapprochement automatique
                  </Button>
                  <Button
                    type="primary"
                    icon={<LinkOutlined />}
                    disabled={!selectedLigneReleve || !selectedEcriture}
                    onClick={handleRapprocherManuel}
                    loading={rapproching}
                  >
                    Rapprocher
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          <Row gutter={16}>
            {/* Lignes du relevé */}
            <Col span={12}>
              <Card
                title="Lignes du relevé"
                size="small"
              >
                <Table
                  columns={ligneReleveColumns}
                  dataSource={lignesReleve}
                  rowKey="id"
                  loading={loadingDetail}
                  pagination={false}
                  size="small"
                  rowSelection={{
                    type: 'radio',
                    selectedRowKeys: selectedLigneReleve ? [selectedLigneReleve] : [],
                    onChange: keys => setSelectedLigneReleve(keys[0] as number ?? null),
                    getCheckboxProps: record => ({
                      disabled: record.statut === 'rapproche' || record.statut === 'ignore',
                    }),
                  }}
                  scroll={{ y: 400 }}
                />
              </Card>
            </Col>

            {/* Écritures comptables */}
            <Col span={12}>
              <Card
                title="Écritures comptables (non lettrées)"
                size="small"
              >
                <Table
                  columns={ecritureColumns}
                  dataSource={nonRapprochesEcritures}
                  rowKey="id"
                  loading={loadingDetail}
                  pagination={false}
                  size="small"
                  rowSelection={{
                    type: 'radio',
                    selectedRowKeys: selectedEcriture ? [selectedEcriture] : [],
                    onChange: keys => setSelectedEcriture(keys[0] as number ?? null),
                  }}
                  scroll={{ y: 400 }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* New releve modal */}
      <Modal
        title="Nouveau relevé bancaire"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSaveReleve}
        confirmLoading={saving}
        okText="Créer"
        cancelText="Annuler"
        width={500}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="compte_banque"
            label="Compte bancaire"
            rules={[{ required: true, message: 'Compte requis' }]}
          >
            <Select
              showSearch
              placeholder="Compte commençant par 5..."
              filterOption={(input, option) => {
                const label = String(option?.label || '');
                return label.toLowerCase().includes(input.toLowerCase());
              }}
              options={comptesBanque.map(c => ({
                value: c.id,
                label: `${c.numero} — ${c.intitule}`,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="date_debut"
                label="Date début"
                rules={[{ required: true, message: 'Date requise' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="date_fin"
                label="Date fin"
                rules={[{ required: true, message: 'Date requise' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="solde_initial"
                label="Solde initial"
                rules={[{ required: true, message: 'Solde requis' }]}
              >
                <InputNumber style={{ width: '100%' }} precision={2} placeholder="0,00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="solde_final"
                label="Solde final"
                rules={[{ required: true, message: 'Solde requis' }]}
              >
                <InputNumber style={{ width: '100%' }} precision={2} placeholder="0,00" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default RapprochementBancaire;
