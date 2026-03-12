import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Checkbox, Popconfirm,
  Tag, Space, message, Typography, Row, Col,
} from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Societe, Tiers, Compte } from '../../types';
import { tiersApi, compteApi } from '../../services/api';

const { Title } = Typography;
const { Option } = Select;

interface Props {
  societe: Societe;
}

const typeColors: Record<string, string> = {
  client: 'blue',
  fournisseur: 'orange',
  autre: 'default',
};

const typeLabels: Record<string, string> = {
  client: 'Client',
  fournisseur: 'Fournisseur',
  autre: 'Autre',
};

const TiersList: React.FC<Props> = ({ societe }) => {
  const [tiers, setTiers] = useState<Tiers[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTiers, setEditingTiers] = useState<Tiers | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [tiersData, comptesData] = await Promise.all([
        tiersApi.list(societe.id),
        compteApi.list(societe.id),
      ]);
      setTiers(tiersData.data.results ?? tiersData.data);
      setComptes(comptesData.data.results ?? comptesData.data);
    } catch {
      message.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [societe.id]);

  const filteredTiers = tiers.filter(t =>
    t.code.toLowerCase().includes(search.toLowerCase()) ||
    t.nom.toLowerCase().includes(search.toLowerCase())
  );

  const collectifComptes = comptes.filter(c => !c.est_tiers);

  const openCreate = () => {
    setEditingTiers(null);
    form.resetFields();
    form.setFieldsValue({ actif: true });
    setModalOpen(true);
  };

  const openEdit = (t: Tiers) => {
    setEditingTiers(t);
    form.setFieldsValue({
      code: t.code,
      nom: t.nom,
      type_tiers: t.type_tiers,
      compte_collectif: t.compte_collectif,
      telephone: t.telephone,
      email: t.email,
      adresse: t.adresse,
      actif: t.actif,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await tiersApi.delete(id);
      message.success('Tiers supprimé');
      loadData();
    } catch {
      message.error('Erreur lors de la suppression');
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
      const payload = { ...values, societe: societe.id };
      if (editingTiers) {
        await tiersApi.update(editingTiers.id, payload);
        message.success('Tiers mis à jour');
      } else {
        await tiersApi.create(payload);
        message.success('Tiers créé');
      }
      setModalOpen(false);
      loadData();
    } catch {
      message.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<Tiers> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      sorter: (a, b) => a.code.localeCompare(b.code),
    },
    {
      title: 'Nom',
      dataIndex: 'nom',
      key: 'nom',
      sorter: (a, b) => a.nom.localeCompare(b.nom),
    },
    {
      title: 'Type',
      dataIndex: 'type_tiers',
      key: 'type_tiers',
      width: 130,
      render: (type: string) => (
        <Tag color={typeColors[type]}>{typeLabels[type] || type}</Tag>
      ),
      filters: [
        { text: 'Client', value: 'client' },
        { text: 'Fournisseur', value: 'fournisseur' },
        { text: 'Autre', value: 'autre' },
      ],
      onFilter: (value, record) => record.type_tiers === value,
    },
    {
      title: 'Compte collectif',
      dataIndex: 'compte_collectif_numero',
      key: 'compte_collectif',
      width: 160,
    },
    {
      title: 'Téléphone',
      dataIndex: 'telephone',
      key: 'telephone',
      width: 140,
    },
    {
      title: 'Actif',
      dataIndex: 'actif',
      key: 'actif',
      width: 80,
      render: (actif: boolean) => (
        <Tag color={actif ? 'green' : 'red'}>{actif ? 'Oui' : 'Non'}</Tag>
      ),
      filters: [
        { text: 'Actif', value: true },
        { text: 'Inactif', value: false },
      ],
      onFilter: (value, record) => record.actif === value,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
            title="Modifier"
          />
          <Popconfirm
            title="Supprimer ce tiers ?"
            description="Cette action est irréversible."
            onConfirm={() => handleDelete(record.id)}
            okText="Oui"
            cancelText="Non"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} title="Supprimer" />
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
            Tiers — {societe.nom}
          </Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nouveau tiers
          </Button>
        </Col>
      </Row>

      <Row style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input.Search
            placeholder="Rechercher par code ou nom..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            allowClear
          />
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={filteredTiers}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: 20,
          total: filteredTiers.length,
          onChange: setCurrentPage,
          showSizeChanger: false,
          showTotal: total => `${total} tiers`,
        }}
        size="middle"
      />

      <Modal
        title={editingTiers ? 'Modifier le tiers' : 'Nouveau tiers'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="code"
                label="Code"
                rules={[{ required: true, message: 'Code requis' }]}
              >
                <Input placeholder="CLI001" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item
                name="nom"
                label="Nom"
                rules={[{ required: true, message: 'Nom requis' }]}
              >
                <Input placeholder="Nom du tiers" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type_tiers"
                label="Type"
                rules={[{ required: true, message: 'Type requis' }]}
              >
                <Select placeholder="Sélectionner un type">
                  <Option value="client">Client</Option>
                  <Option value="fournisseur">Fournisseur</Option>
                  <Option value="autre">Autre</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="compte_collectif" label="Compte collectif">
                <Select
                  showSearch
                  allowClear
                  placeholder="Rechercher un compte..."
                  filterOption={(input, option) => {
                    const label = String(option?.label || '');
                    return label.toLowerCase().includes(input.toLowerCase());
                  }}
                  options={collectifComptes.map(c => ({
                    value: c.id,
                    label: `${c.numero} — ${c.intitule}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="telephone" label="Téléphone">
                <Input placeholder="+228 XX XX XX XX" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: 'email', message: 'Email invalide' }]}
              >
                <Input placeholder="contact@exemple.com" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="adresse" label="Adresse">
            <Input.TextArea rows={2} placeholder="Adresse complète" />
          </Form.Item>

          <Form.Item name="actif" valuePropName="checked">
            <Checkbox>Actif</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TiersList;
