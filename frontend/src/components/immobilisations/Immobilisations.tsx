import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber,
  Popconfirm, Tag, Space, message, Typography, Row, Col, Alert,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, TableOutlined, CalculatorOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Societe, ExerciceComptable, Immobilisation, Compte } from '../../types';
import { immobilisationApi, compteApi } from '../../services/api';

const { Title, Text } = Typography;

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

interface TableauRow {
  annee: number;
  valeur_debut: number;
  dotation: number;
  amortissement_cumule: number;
  valeur_nette: number;
}

const fmt = (n: number | string) =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

const Immobilisations: React.FC<Props> = ({ societe, exercice }) => {
  const [immobilisations, setImmobilisations] = useState<Immobilisation[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(false);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingImmo, setEditingImmo] = useState<Immobilisation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Tableau d'amortissement modal
  const [tableauModalOpen, setTableauModalOpen] = useState(false);
  const [tableauData, setTableauData] = useState<TableauRow[]>([]);
  const [tableauLoading, setTableauLoading] = useState(false);
  const [tableauTitle, setTableauTitle] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [immoRes, compteRes] = await Promise.all([
        immobilisationApi.list(societe.id, exercice.id),
        compteApi.list(societe.id),
      ]);
      setImmobilisations(immoRes.data.results ?? immoRes.data);
      setComptes(compteRes.data.results ?? compteRes.data);
    } catch {
      message.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [societe.id, exercice.id]);

  // Filter class 2x accounts
  const classe2Comptes = comptes.filter(c => c.numero.startsWith('2'));

  const openCreate = () => {
    setEditingImmo(null);
    form.resetFields();
    form.setFieldsValue({ methode_amortissement: 'lineaire' });
    setModalOpen(true);
  };

  const openEdit = (immo: Immobilisation) => {
    setEditingImmo(immo);
    form.setFieldsValue({
      compte: immo.compte,
      designation: immo.designation,
      reference: immo.reference,
      date_acquisition: immo.date_acquisition ? dayjs(immo.date_acquisition) : undefined,
      valeur_acquisition: immo.valeur_acquisition,
      taux_amortissement: immo.taux_amortissement,
      duree_amortissement: immo.duree_amortissement,
      methode_amortissement: immo.methode_amortissement,
      valeur_residuelle: immo.valeur_residuelle,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await immobilisationApi.delete(id);
      message.success('Immobilisation supprimée');
      loadData();
    } catch {
      message.error('Erreur lors de la suppression');
    }
  };

  const handleComptabiliser = async (id: number) => {
    try {
      await immobilisationApi.comptabiliser(id, exercice.id);
      message.success('Dotation comptabilisée');
      loadData();
    } catch {
      message.error('Erreur lors de la comptabilisation');
    }
  };

  const openTableau = async (immo: Immobilisation) => {
    setTableauTitle(immo.designation);
    setTableauModalOpen(true);
    setTableauLoading(true);
    try {
      const res = await immobilisationApi.tableauAmortissement(immo.id);
      setTableauData(res.data.results ?? res.data);
    } catch {
      message.error("Erreur lors du chargement du tableau d'amortissement");
    } finally {
      setTableauLoading(false);
    }
  };

  const handleDoterTout = async () => {
    try {
      const res = await immobilisationApi.doterTout(societe.id, exercice.id);
      const { pieces_creees, erreurs } = res.data;
      if (erreurs && erreurs.length > 0) {
        message.warning(`${pieces_creees} dotation(s) créée(s). Erreurs : ${erreurs.join(', ')}`);
      } else {
        message.success(`${pieces_creees} dotation(s) créée(s) avec succès`);
      }
      loadData();
    } catch {
      message.error('Erreur lors de la dotation en lot');
    }
  };

  const handleSave = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...values,
        societe: societe.id,
        exercice: exercice.id,
        date_acquisition: values.date_acquisition?.format('YYYY-MM-DD'),
      };
      if (editingImmo) {
        await immobilisationApi.update(editingImmo.id, payload);
        message.success('Immobilisation mise à jour');
      } else {
        await immobilisationApi.create(payload);
        message.success('Immobilisation créée');
      }
      setModalOpen(false);
      loadData();
    } catch {
      message.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const tableauColumns: ColumnsType<TableauRow> = [
    { title: 'Année', dataIndex: 'annee', key: 'annee', width: 80 },
    {
      title: 'Valeur début',
      dataIndex: 'valeur_debut',
      key: 'valeur_debut',
      align: 'right',
      render: (v: number) => fmt(v),
    },
    {
      title: 'Dotation',
      dataIndex: 'dotation',
      key: 'dotation',
      align: 'right',
      render: (v: number) => fmt(v),
    },
    {
      title: 'Amort. cumulé',
      dataIndex: 'amortissement_cumule',
      key: 'amortissement_cumule',
      align: 'right',
      render: (v: number) => fmt(v),
    },
    {
      title: 'Valeur nette',
      dataIndex: 'valeur_nette',
      key: 'valeur_nette',
      align: 'right',
      render: (v: number) => fmt(v),
    },
  ];

  const columns: ColumnsType<Immobilisation> = [
    {
      title: 'Désignation',
      dataIndex: 'designation',
      key: 'designation',
      sorter: (a, b) => a.designation.localeCompare(b.designation),
    },
    {
      title: 'Compte',
      dataIndex: 'compte_numero',
      key: 'compte_numero',
      width: 100,
    },
    {
      title: "Date d'acquisition",
      dataIndex: 'date_acquisition',
      key: 'date_acquisition',
      width: 130,
      sorter: (a, b) => a.date_acquisition.localeCompare(b.date_acquisition),
    },
    {
      title: 'Valeur',
      dataIndex: 'valeur_acquisition',
      key: 'valeur_acquisition',
      align: 'right',
      width: 130,
      render: (v: number) => fmt(v),
      sorter: (a, b) => Number(a.valeur_acquisition) - Number(b.valeur_acquisition),
    },
    {
      title: 'Taux (%)',
      dataIndex: 'taux_amortissement',
      key: 'taux_amortissement',
      width: 90,
      align: 'right',
      render: (v: number) => `${v} %`,
    },
    {
      title: 'Durée',
      dataIndex: 'duree_amortissement',
      key: 'duree_amortissement',
      width: 70,
      align: 'center',
    },
    {
      title: 'Méthode',
      dataIndex: 'methode_amortissement',
      key: 'methode_amortissement',
      width: 100,
      render: (m: string) => (
        <Tag color={m === 'lineaire' ? 'blue' : 'purple'}>
          {m === 'lineaire' ? 'Linéaire' : 'Dégressif'}
        </Tag>
      ),
    },
    {
      title: 'Val. résiduelle',
      dataIndex: 'valeur_residuelle',
      key: 'valeur_residuelle',
      align: 'right',
      width: 120,
      render: (v: number) => fmt(v),
    },
    {
      title: 'Actif',
      dataIndex: 'actif',
      key: 'actif',
      width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Oui' : 'Non'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<TableOutlined />}
            title="Tableau d'amortissement"
            onClick={() => openTableau(record)}
            style={{ color: '#1890ff' }}
          />
          <Popconfirm
            title="Comptabiliser la dotation ?"
            description={`Comptabiliser l'amortissement pour ${exercice.libelle} ?`}
            onConfirm={() => handleComptabiliser(record.id)}
            okText="Comptabiliser"
            cancelText="Annuler"
          >
            <Button
              type="text"
              size="small"
              icon={<CalculatorOutlined />}
              title="Comptabiliser la dotation"
              style={{ color: '#52c41a' }}
            />
          </Popconfirm>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            title="Modifier"
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Supprimer cette immobilisation ?"
            onConfirm={() => handleDelete(record.id)}
            okText="Oui"
            cancelText="Non"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} title="Supprimer" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            Immobilisations — {exercice.libelle}
          </Title>
        </Col>
        <Col>
          <Space>
            <Popconfirm
              title="Doter toutes les immobilisations ?"
              description={`Comptabiliser les dotations de toutes les immobilisations actives pour ${exercice.libelle} ?`}
              onConfirm={handleDoterTout}
              okText="Doter tout"
              cancelText="Annuler"
            >
              <Button icon={<ThunderboltOutlined />}>Tout doter</Button>
            </Popconfirm>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Nouvelle immobilisation
            </Button>
          </Space>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={immobilisations}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
        scroll={{ x: 1100 }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingImmo ? "Modifier l'immobilisation" : 'Nouvelle immobilisation'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="compte"
                label="Compte d'immobilisation"
                rules={[{ required: true, message: 'Compte requis' }]}
              >
                <Select
                  showSearch
                  placeholder="Classe 2..."
                  filterOption={(input, option) => {
                    const label = String(option?.label || '');
                    return label.toLowerCase().includes(input.toLowerCase());
                  }}
                  options={classe2Comptes.map(c => ({
                    value: c.id,
                    label: `${c.numero} — ${c.intitule}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="designation"
                label="Désignation"
                rules={[{ required: true, message: 'Désignation requise' }]}
              >
                <Input placeholder="Véhicule de service..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="reference" label="Référence">
                <Input placeholder="Réf. interne" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="date_acquisition"
                label="Date d'acquisition"
                rules={[{ required: true, message: 'Date requise' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="valeur_acquisition"
                label="Valeur d'acquisition"
                rules={[{ required: true, message: 'Valeur requise' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  placeholder="0,00"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="taux_amortissement"
                label="Taux (%)"
                rules={[{ required: true, message: 'Taux requis' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  max={100}
                  precision={2}
                  placeholder="20"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="duree_amortissement"
                label="Durée (années)"
                rules={[{ required: true, message: 'Durée requise' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} placeholder="5" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="methode_amortissement"
                label="Méthode"
                rules={[{ required: true, message: 'Méthode requise' }]}
              >
                <Select>
                  <Select.Option value="lineaire">Linéaire</Select.Option>
                  <Select.Option value="degressif">Dégressif</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="valeur_residuelle" label="Valeur résiduelle">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  placeholder="0,00"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Tableau d'amortissement Modal */}
      <Modal
        title={`Tableau d'amortissement — ${tableauTitle}`}
        open={tableauModalOpen}
        onCancel={() => setTableauModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setTableauModalOpen(false)}>
            Fermer
          </Button>,
        ]}
        width={640}
      >
        <Table
          columns={tableauColumns}
          dataSource={tableauData}
          rowKey="annee"
          loading={tableauLoading}
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  );
};

export default Immobilisations;
