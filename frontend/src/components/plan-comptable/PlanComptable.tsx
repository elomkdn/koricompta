import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Checkbox, Popconfirm,
  Tag, Space, message, Typography, Row, Col,
} from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import { Societe, Compte } from '../../types';
import { compteApi } from '../../services/api';

const { Title } = Typography;
const { Option } = Select;

interface Props {
  societe: Societe;
}

interface Classe {
  id: number;
  numero: string;
  intitule: string;
}

const natureColors: Record<string, string> = {
  debiteur: 'blue',
  crediteur: 'green',
};
const natureLabels: Record<string, string> = {
  debiteur: 'Débiteur',
  crediteur: 'Créditeur',
};

const PlanComptable: React.FC<Props> = ({ societe }) => {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterClasse, setFilterClasse] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompte, setEditingCompte] = useState<Compte | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [comptesRes, classesResp] = await Promise.all([
        compteApi.list(societe.id),
        axios.get(`/api/comptabilite/classes/?societe=${societe.id}`),
      ]);
      setComptes(comptesRes.data.results ?? comptesRes.data);
      setClasses(classesResp.data?.results ?? classesResp.data ?? []);
    } catch {
      message.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [societe.id]);

  const filtered = comptes.filter(c => {
    const matchSearch =
      !search ||
      c.numero.toLowerCase().includes(search.toLowerCase()) ||
      c.intitule.toLowerCase().includes(search.toLowerCase());
    const matchClasse =
      !filterClasse || c.numero.startsWith(filterClasse);
    return matchSearch && matchClasse;
  });

  const openCreate = () => {
    setEditingCompte(null);
    form.resetFields();
    form.setFieldsValue({ actif: true, lettrable: false, est_tiers: false });
    setModalOpen(true);
  };

  const openEdit = (c: Compte) => {
    setEditingCompte(c);
    form.setFieldsValue({
      numero: c.numero,
      intitule: c.intitule,
      nature: c.nature,
      type_compte: c.type_compte,
      lettrable: c.lettrable,
      est_tiers: c.est_tiers,
      actif: c.actif,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/api/comptabilite/comptes/${id}/`);
      message.success('Compte supprimé');
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
      if (editingCompte) {
        await axios.patch(`/api/comptabilite/comptes/${editingCompte.id}/`, payload);
        message.success('Compte mis à jour');
      } else {
        await axios.post('/api/comptabilite/comptes/', payload);
        message.success('Compte créé');
      }
      setModalOpen(false);
      loadData();
    } catch {
      message.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<Compte> = [
    {
      title: 'Numéro',
      dataIndex: 'numero',
      key: 'numero',
      width: 120,
      sorter: (a, b) => a.numero.localeCompare(b.numero),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Intitulé',
      dataIndex: 'intitule',
      key: 'intitule',
      sorter: (a, b) => a.intitule.localeCompare(b.intitule),
    },
    {
      title: 'Classe',
      key: 'classe',
      width: 80,
      render: (_, r) => r.numero.charAt(0),
      sorter: (a, b) => a.numero.charAt(0).localeCompare(b.numero.charAt(0)),
    },
    {
      title: 'Nature',
      dataIndex: 'nature',
      key: 'nature',
      width: 110,
      render: (n: string) => (
        <Tag color={natureColors[n] || 'default'}>{natureLabels[n] || n}</Tag>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type_compte',
      key: 'type_compte',
      width: 110,
    },
    {
      title: 'Lettrable',
      dataIndex: 'lettrable',
      key: 'lettrable',
      width: 90,
      render: (v: boolean) => v ? <Tag color="blue">Oui</Tag> : <Tag>Non</Tag>,
    },
    {
      title: 'Actif',
      dataIndex: 'actif',
      key: 'actif',
      width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Oui' : 'Non'}</Tag>,
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
            title="Supprimer ce compte ?"
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
            Plan comptable — {societe.nom}
          </Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nouveau compte
          </Button>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input.Search
            placeholder="Rechercher numéro ou intitulé..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            allowClear
          />
        </Col>
        <Col span={4}>
          <Select
            allowClear
            placeholder="Filtrer par classe"
            style={{ width: '100%' }}
            value={filterClasse}
            onChange={v => { setFilterClasse(v); setCurrentPage(1); }}
          >
            {classes.map(cl => (
              <Option key={cl.id} value={cl.numero}>{cl.numero} — {cl.intitule}</Option>
            ))}
          </Select>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: 50,
          total: filtered.length,
          onChange: setCurrentPage,
          showSizeChanger: false,
          showTotal: total => `${total} comptes`,
        }}
        size="small"
      />

      <Modal
        title={editingCompte ? 'Modifier le compte' : 'Nouveau compte'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
        width={580}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item
                name="numero"
                label="Numéro"
                rules={[{ required: true, message: 'Numéro requis' }]}
              >
                <Input placeholder="401000" />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item
                name="intitule"
                label="Intitulé"
                rules={[{ required: true, message: 'Intitulé requis' }]}
              >
                <Input placeholder="Fournisseurs" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="nature"
                label="Nature"
                rules={[{ required: true, message: 'Nature requise' }]}
              >
                <Select placeholder="Sélectionner">
                  <Option value="debiteur">Débiteur</Option>
                  <Option value="crediteur">Créditeur</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type_compte" label="Type de compte">
                <Input placeholder="bilan / resultat / trésorerie..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="lettrable" valuePropName="checked">
                <Checkbox>Lettrable</Checkbox>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="est_tiers" valuePropName="checked">
                <Checkbox>Est tiers</Checkbox>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="actif" valuePropName="checked">
                <Checkbox>Actif</Checkbox>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default PlanComptable;
