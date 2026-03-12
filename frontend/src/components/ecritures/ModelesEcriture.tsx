import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber,
  Popconfirm, Space, message, Typography, Row, Col, Divider,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Societe, ExerciceComptable, ModeleEcriture, LigneModele, Journal, Compte } from '../../types';
import { modeleApi, journalApi, compteApi } from '../../services/api';

const { Title } = Typography;

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

interface LigneModeleForm {
  key: string;
  compte_id: number | undefined;
  libelle: string;
  debit: number;
  credit: number;
  ordre: number;
}

const generateKey = () => Math.random().toString(36).slice(2);

const newLigneForm = (ordre: number): LigneModeleForm => ({
  key: generateKey(),
  compte_id: undefined,
  libelle: '',
  debit: 0,
  credit: 0,
  ordre,
});

const ModelesEcriture: React.FC<Props> = ({ societe, exercice }) => {
  const [modeles, setModeles] = useState<ModeleEcriture[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit/create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModele, setEditingModele] = useState<ModeleEcriture | null>(null);
  const [lignesForm, setLignesForm] = useState<LigneModeleForm[]>([newLigneForm(1), newLigneForm(2)]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Apply modal
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyingModele, setApplyingModele] = useState<ModeleEcriture | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [modelesRes, journalRes, compteRes] = await Promise.all([
        modeleApi.list(societe.id),
        journalApi.list(societe.id),
        compteApi.list(societe.id),
      ]);
      setModeles(modelesRes.data.results ?? modelesRes.data);
      setJournals(journalRes.data.results ?? journalRes.data);
      setComptes(compteRes.data.results ?? compteRes.data);
    } catch {
      message.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [societe.id]);

  const openCreate = () => {
    setEditingModele(null);
    form.resetFields();
    setLignesForm([newLigneForm(1), newLigneForm(2)]);
    setModalOpen(true);
  };

  const openEdit = (m: ModeleEcriture) => {
    setEditingModele(m);
    form.setFieldsValue({
      code: m.code,
      libelle: m.libelle,
      description: m.description,
      journal: m.journal,
    });
    setLignesForm(
      (m.lignes || []).map((l, i) => ({
        key: generateKey(),
        compte_id: l.compte ?? undefined,
        libelle: l.libelle,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        ordre: l.ordre ?? i + 1,
      }))
    );
    setModalOpen(true);
  };

  const openApply = (m: ModeleEcriture) => {
    setApplyingModele(m);
    applyForm.resetFields();
    setApplyModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await modeleApi.delete(id);
      message.success('Modèle supprimé');
      loadData();
    } catch {
      message.error('Erreur lors de la suppression');
    }
  };

  const updateLigne = (key: string, field: keyof LigneModeleForm, value: any) => {
    setLignesForm(prev =>
      prev.map(l => (l.key === key ? { ...l, [field]: value } : l))
    );
  };

  const removeLigne = (key: string) => {
    setLignesForm(prev => {
      if (prev.length <= 2) {
        message.warning('Minimum 2 lignes requises');
        return prev;
      }
      return prev.filter(l => l.key !== key);
    });
  };

  const addLigne = () => {
    setLignesForm(prev => [...prev, newLigneForm(prev.length + 1)]);
  };

  const handleSave = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    for (const l of lignesForm) {
      if (!l.compte_id) {
        message.error('Toutes les lignes doivent avoir un compte');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...values,
        societe: societe.id,
        lignes: lignesForm.map((l, i) => ({
          compte: l.compte_id,
          libelle: l.libelle,
          debit: l.debit || 0,
          credit: l.credit || 0,
          ordre: i + 1,
        })),
      };
      if (editingModele) {
        await modeleApi.update(editingModele.id, payload);
        message.success('Modèle mis à jour');
      } else {
        await modeleApi.create(payload);
        message.success('Modèle créé');
      }
      setModalOpen(false);
      loadData();
    } catch {
      message.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    let values: any;
    try {
      values = await applyForm.validateFields();
    } catch {
      return;
    }
    if (!applyingModele) return;
    setApplying(true);
    try {
      await modeleApi.appliquer(applyingModele.id, {
        exercice_id: exercice.id,
        journal_id: applyingModele.journal,
        date_piece: values.date_piece.format('YYYY-MM-DD'),
        libelle: values.libelle,
      });
      message.success('Modèle appliqué — pièce créée en brouillard');
      setApplyModalOpen(false);
    } catch {
      message.error("Erreur lors de l'application du modèle");
    } finally {
      setApplying(false);
    }
  };

  const ligneColumns = [
    {
      title: '#',
      key: 'idx',
      width: 40,
      render: (_: any, __: any, idx: number) => idx + 1,
    },
    {
      title: 'Compte',
      key: 'compte_id',
      width: 240,
      render: (_: any, record: LigneModeleForm) => (
        <Select
          showSearch
          size="small"
          style={{ width: '100%' }}
          placeholder="Compte..."
          value={record.compte_id}
          onChange={v => updateLigne(record.key, 'compte_id', v)}
          filterOption={(input, option) => {
            const label = String(option?.label || '');
            return label.toLowerCase().includes(input.toLowerCase());
          }}
          options={comptes.map(c => ({
            value: c.id,
            label: `${c.numero} — ${c.intitule}`,
          }))}
        />
      ),
    },
    {
      title: 'Libellé',
      key: 'libelle',
      render: (_: any, record: LigneModeleForm) => (
        <Input
          size="small"
          value={record.libelle}
          onChange={e => updateLigne(record.key, 'libelle', e.target.value)}
          placeholder="Libellé"
        />
      ),
    },
    {
      title: 'Débit',
      key: 'debit',
      width: 110,
      render: (_: any, record: LigneModeleForm) => (
        <InputNumber
          size="small"
          style={{ width: '100%' }}
          value={record.debit || undefined}
          onChange={v => updateLigne(record.key, 'debit', v || 0)}
          min={0}
          precision={2}
          placeholder="0,00"
        />
      ),
    },
    {
      title: 'Crédit',
      key: 'credit',
      width: 110,
      render: (_: any, record: LigneModeleForm) => (
        <InputNumber
          size="small"
          style={{ width: '100%' }}
          value={record.credit || undefined}
          onChange={v => updateLigne(record.key, 'credit', v || 0)}
          min={0}
          precision={2}
          placeholder="0,00"
        />
      ),
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_: any, record: LigneModeleForm) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeLigne(record.key)}
        />
      ),
    },
  ];

  const columns: ColumnsType<ModeleEcriture> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      sorter: (a, b) => a.code.localeCompare(b.code),
    },
    {
      title: 'Libellé',
      dataIndex: 'libelle',
      key: 'libelle',
      sorter: (a, b) => a.libelle.localeCompare(b.libelle),
    },
    {
      title: 'Journal',
      dataIndex: 'journal_code',
      key: 'journal_code',
      width: 90,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Lignes',
      key: 'nb_lignes',
      width: 70,
      render: (_, record) => (record.lignes || []).length,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            title="Appliquer"
            onClick={() => openApply(record)}
            style={{ color: '#1890ff' }}
          />
          <Button
            type="text"
            icon={<EditOutlined />}
            title="Modifier"
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Supprimer ce modèle ?"
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
            {"Modèles d'écriture — "}{societe.nom}
          </Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nouveau modèle
          </Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={modeles}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingModele ? 'Modifier le modèle' : "Nouveau modèle d'écriture"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
        width={900}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="code"
                label="Code"
                rules={[{ required: true, message: 'Code requis' }]}
              >
                <Input placeholder="ACH001" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item
                name="libelle"
                label="Libellé"
                rules={[{ required: true, message: 'Libellé requis' }]}
              >
                <Input placeholder="Achat de marchandises" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="journal" label="Journal">
                <Select
                  allowClear
                  placeholder="Journal par défaut"
                  options={journals.map(j => ({
                    value: j.id,
                    label: `${j.code} — ${j.intitule}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Description du modèle" />
          </Form.Item>
        </Form>

        <Divider style={{ margin: '8px 0' }} />
        <Table
          dataSource={lignesForm}
          rowKey="key"
          columns={ligneColumns}
          pagination={false}
          size="small"
          style={{ marginBottom: 8 }}
        />
        <Button
          type="dashed"
          block
          icon={<PlusOutlined />}
          onClick={addLigne}
        >
          Ajouter une ligne
        </Button>
      </Modal>

      {/* Apply Modal */}
      <Modal
        title={`Appliquer le modèle : ${applyingModele?.libelle}`}
        open={applyModalOpen}
        onCancel={() => setApplyModalOpen(false)}
        onOk={handleApply}
        confirmLoading={applying}
        okText="Appliquer"
        cancelText="Annuler"
        width={440}
        destroyOnClose
      >
        <Form form={applyForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="date_piece"
            label="Date de la pièce"
            rules={[{ required: true, message: 'Date requise' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            name="libelle"
            label="Libellé de la pièce"
            rules={[{ required: true, message: 'Libellé requis' }]}
            initialValue={applyingModele?.libelle}
          >
            <Input placeholder="Libellé" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ModelesEcriture;
