import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber,
  Popconfirm, Tag, Space, message, Typography, Row, Col, Divider,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CheckOutlined, DeleteFilled,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Societe, ExerciceComptable, PieceComptable, LigneEcriture, Journal, Compte, Tiers } from '../../types';
import { pieceApi, journalApi, compteApi, tiersApi } from '../../services/api';

const { Title, Text } = Typography;

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

interface LigneForm {
  key: string;
  compte_id: number | undefined;
  libelle: string;
  debit: number;
  credit: number;
  tiers_id: number | undefined;
}

const fmt = (n: number | string) =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

const generateKey = () => Math.random().toString(36).slice(2);

const newLigne = (): LigneForm => ({
  key: generateKey(),
  compte_id: undefined,
  libelle: '',
  debit: 0,
  credit: 0,
  tiers_id: undefined,
});

const SaisieEcritures: React.FC<Props> = ({ societe, exercice }) => {
  const [pieces, setPieces] = useState<PieceComptable[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [tiers, setTiers] = useState<Tiers[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [filterJournal, setFilterJournal] = useState<number | undefined>(undefined);
  const [filterStatut, setFilterStatut] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  // New piece modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [lignes, setLignes] = useState<LigneForm[]>([newLigne(), newLigne()]);

  const PAGE_SIZE = 20;

  const loadRefData = async () => {
    try {
      const [journalRes, compteRes, tiersRes] = await Promise.all([
        journalApi.list(societe.id),
        compteApi.list(societe.id),
        tiersApi.list(societe.id),
      ]);
      setJournals(journalRes.data.results ?? journalRes.data);
      setComptes(compteRes.data.results ?? compteRes.data);
      setTiers(tiersRes.data.results ?? tiersRes.data);
    } catch {
      message.error('Erreur lors du chargement des données de référence');
    }
  };

  const loadPieces = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = {
        exercice: exercice.id,
        page,
        page_size: PAGE_SIZE,
      };
      if (filterJournal) params.journal = filterJournal;
      if (filterStatut) params.statut = filterStatut;
      if (search) params.search = search;

      const res = await pieceApi.list(params);
      setPieces(res.data.results ?? res.data);
      setTotal(res.data.count ?? (res.data.results ?? res.data).length);
    } catch {
      message.error('Erreur lors du chargement des pièces');
    } finally {
      setLoading(false);
    }
  }, [exercice.id, filterJournal, filterStatut, search]);

  useEffect(() => {
    loadRefData();
  }, [societe.id]);

  useEffect(() => {
    setCurrentPage(1);
    loadPieces(1);
  }, [exercice.id, filterJournal, filterStatut, search]);

  const handleValider = async (id: number) => {
    try {
      await pieceApi.valider(id);
      message.success('Pièce validée');
      loadPieces(currentPage);
    } catch {
      message.error('Erreur lors de la validation');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await pieceApi.delete(id);
      message.success('Pièce supprimée');
      loadPieces(currentPage);
    } catch {
      message.error('Erreur lors de la suppression');
    }
  };

  const handleForcerSuppression = async (id: number) => {
    try {
      await pieceApi.forcerSuppression(id);
      message.success('Pièce supprimée (forcé)');
      loadPieces(currentPage);
    } catch {
      message.error('Erreur lors de la suppression forcée');
    }
  };

  const openNewPiece = () => {
    form.resetFields();
    setLignes([newLigne(), newLigne()]);
    setModalOpen(true);
  };

  const updateLigne = (key: string, field: keyof LigneForm, value: any) => {
    setLignes(prev =>
      prev.map(l => {
        if (l.key !== key) return l;
        const updated = { ...l, [field]: value };
        // If compte changed, reset tiers
        if (field === 'compte_id') {
          updated.tiers_id = undefined;
        }
        return updated;
      })
    );
  };

  const removeLigne = (key: string) => {
    setLignes(prev => {
      if (prev.length <= 2) {
        message.warning('Minimum 2 lignes requises');
        return prev;
      }
      return prev.filter(l => l.key !== key);
    });
  };

  const addLigne = () => {
    setLignes(prev => [...prev, newLigne()]);
  };

  const totalDebit = lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const solde = totalDebit - totalCredit;

  const getCompteById = (id: number | undefined) =>
    comptes.find(c => c.id === id);

  const handleSave = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    // Validate lignes
    for (const l of lignes) {
      if (!l.compte_id) {
        message.error('Toutes les lignes doivent avoir un compte');
        return;
      }
    }
    if (Math.abs(solde) > 0.01) {
      message.error('La pièce n\'est pas équilibrée (débit ≠ crédit)');
      return;
    }

    setSaving(true);
    try {
      await pieceApi.create({
        exercice_id: exercice.id,
        journal_id: values.journal_id,
        date_piece: values.date_piece.format('YYYY-MM-DD'),
        libelle: values.libelle,
        reference: values.reference,
        lignes: lignes.map(l => ({
          compte_id: l.compte_id,
          libelle: l.libelle,
          debit: l.debit || 0,
          credit: l.credit || 0,
          ...(l.tiers_id ? { tiers_id: l.tiers_id } : {}),
        })),
      });
      message.success('Pièce créée');
      setModalOpen(false);
      loadPieces(currentPage);
    } catch {
      message.error('Erreur lors de la création de la pièce');
    } finally {
      setSaving(false);
    }
  };

  const expandedRowRender = (piece: PieceComptable) => {
    const ligneColumns: ColumnsType<LigneEcriture> = [
      { title: 'Compte', dataIndex: 'compte_numero', key: 'compte_numero', width: 100 },
      { title: 'Intitulé', dataIndex: 'compte_intitule', key: 'compte_intitule' },
      { title: 'Libellé', dataIndex: 'libelle', key: 'libelle' },
      {
        title: 'Débit',
        dataIndex: 'debit',
        key: 'debit',
        align: 'right',
        width: 120,
        render: (v: number) => v ? fmt(v) : '',
      },
      {
        title: 'Crédit',
        dataIndex: 'credit',
        key: 'credit',
        align: 'right',
        width: 120,
        render: (v: number) => v ? fmt(v) : '',
      },
      { title: 'Tiers', dataIndex: 'tiers_nom', key: 'tiers_nom', width: 150 },
      { title: 'Lettrage', dataIndex: 'lettrage_code', key: 'lettrage_code', width: 90 },
    ];
    return (
      <Table
        columns={ligneColumns}
        dataSource={piece.lignes || []}
        rowKey="id"
        pagination={false}
        size="small"
        style={{ margin: '0 0 0 48px' }}
      />
    );
  };

  const columns: ColumnsType<PieceComptable> = [
    {
      title: 'Date',
      dataIndex: 'date_piece',
      key: 'date_piece',
      width: 100,
      sorter: (a, b) => a.date_piece.localeCompare(b.date_piece),
    },
    {
      title: 'Journal',
      dataIndex: 'journal_code',
      key: 'journal_code',
      width: 80,
    },
    {
      title: 'N° Pièce',
      dataIndex: 'numero_piece',
      key: 'numero_piece',
      width: 110,
    },
    {
      title: 'Libellé',
      dataIndex: 'libelle',
      key: 'libelle',
    },
    {
      title: 'Référence',
      dataIndex: 'reference',
      key: 'reference',
      width: 120,
    },
    {
      title: 'Débit',
      dataIndex: 'total_debit',
      key: 'total_debit',
      align: 'right',
      width: 130,
      render: (v: number) => fmt(v),
    },
    {
      title: 'Crédit',
      dataIndex: 'total_credit',
      key: 'total_credit',
      align: 'right',
      width: 130,
      render: (v: number) => fmt(v),
    },
    {
      title: '=',
      dataIndex: 'est_equilibree',
      key: 'est_equilibree',
      width: 50,
      render: (v: boolean) =>
        v ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
        ),
    },
    {
      title: 'Statut',
      dataIndex: 'statut',
      key: 'statut',
      width: 100,
      render: (s: string) => (
        <Tag color={s === 'valide' ? 'green' : 'orange'}>
          {s === 'valide' ? 'Validé' : 'Brouillard'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          {record.statut === 'brouillard' && (
            <Popconfirm
              title="Valider cette pièce ?"
              description="La pièce sera définitivement validée."
              onConfirm={() => handleValider(record.id)}
              okText="Valider"
              cancelText="Annuler"
            >
              <Button
                type="text"
                size="small"
                icon={<CheckOutlined />}
                title="Valider"
                style={{ color: '#52c41a' }}
              />
            </Popconfirm>
          )}
          {record.statut === 'brouillard' && (
            <Popconfirm
              title="Supprimer cette pièce ?"
              onConfirm={() => handleDelete(record.id)}
              okText="Oui"
              cancelText="Non"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                title="Supprimer"
              />
            </Popconfirm>
          )}
          <Popconfirm
            title="Forcer la suppression ?"
            description="Cette pièce sera supprimée même si validée. Irréversible."
            onConfirm={() => handleForcerSuppression(record.id)}
            okText="Forcer"
            cancelText="Annuler"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteFilled />}
              title="Forcer la suppression"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const ligneTableColumns = [
    {
      title: '#',
      key: 'idx',
      width: 40,
      render: (_: any, __: any, idx: number) => idx + 1,
    },
    {
      title: 'Compte',
      key: 'compte_id',
      width: 220,
      render: (_: any, record: LigneForm) => (
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Numéro ou intitulé..."
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
          size="small"
        />
      ),
    },
    {
      title: 'Libellé',
      key: 'libelle',
      render: (_: any, record: LigneForm) => (
        <Input
          size="small"
          value={record.libelle}
          onChange={e => updateLigne(record.key, 'libelle', e.target.value)}
          placeholder="Libellé de la ligne"
        />
      ),
    },
    {
      title: 'Débit',
      key: 'debit',
      width: 120,
      render: (_: any, record: LigneForm) => (
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
      width: 120,
      render: (_: any, record: LigneForm) => (
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
      title: 'Tiers',
      key: 'tiers_id',
      width: 160,
      render: (_: any, record: LigneForm) => {
        const compte = getCompteById(record.compte_id);
        if (!compte?.est_tiers) return null;
        return (
          <Select
            showSearch
            allowClear
            size="small"
            style={{ width: '100%' }}
            placeholder="Tiers..."
            value={record.tiers_id}
            onChange={v => updateLigne(record.key, 'tiers_id', v)}
            filterOption={(input, option) => {
              const label = String(option?.label || '');
              return label.toLowerCase().includes(input.toLowerCase());
            }}
            options={tiers.map(t => ({
              value: t.id,
              label: `${t.code} — ${t.nom}`,
            }))}
          />
        );
      },
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_: any, record: LigneForm) => (
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

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            Saisie des écritures — {exercice.libelle}
          </Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNewPiece}>
            Nouvelle pièce
          </Button>
        </Col>
      </Row>

      {/* Filter bar */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={5}>
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder="Tous les journaux"
            value={filterJournal}
            onChange={v => setFilterJournal(v)}
            options={journals.map(j => ({
              value: j.id,
              label: `${j.code} — ${j.intitule}`,
            }))}
          />
        </Col>
        <Col span={4}>
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder="Tous statuts"
            value={filterStatut}
            onChange={v => setFilterStatut(v)}
          >
            <Select.Option value="brouillard">Brouillard</Select.Option>
            <Select.Option value="valide">Validé</Select.Option>
          </Select>
        </Col>
        <Col span={6}>
          <Input.Search
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
          />
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={pieces}
        rowKey="id"
        loading={loading}
        expandable={{ expandedRowRender }}
        pagination={{
          current: currentPage,
          pageSize: PAGE_SIZE,
          total,
          onChange: p => {
            setCurrentPage(p);
            loadPieces(p);
          },
          showSizeChanger: false,
          showTotal: t => `${t} pièces`,
        }}
        size="middle"
      />

      {/* New piece modal */}
      <Modal
        title="Nouvelle pièce comptable"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
        width={980}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="journal_id"
                label="Journal"
                rules={[{ required: true, message: 'Journal requis' }]}
              >
                <Select
                  placeholder="Sélectionner un journal"
                  options={journals.map(j => ({
                    value: j.id,
                    label: `${j.code} — ${j.intitule}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item
                name="date_piece"
                label="Date"
                rules={[{ required: true, message: 'Date requise' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="libelle"
                label="Libellé"
                rules={[{ required: true, message: 'Libellé requis' }]}
              >
                <Input placeholder="Libellé de la pièce" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="reference" label="Référence">
                <Input placeholder="Référence" />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Divider style={{ margin: '8px 0' }} />

        <Table
          dataSource={lignes}
          rowKey="key"
          columns={ligneTableColumns}
          pagination={false}
          size="small"
          style={{ marginBottom: 8 }}
        />

        <Button
          type="dashed"
          block
          icon={<PlusOutlined />}
          onClick={addLigne}
          style={{ marginBottom: 12 }}
        >
          Ajouter une ligne
        </Button>

        <Row gutter={16} justify="end">
          <Col>
            <Text>Total Débit : </Text>
            <Text strong>{fmt(totalDebit)}</Text>
          </Col>
          <Col>
            <Text>Total Crédit : </Text>
            <Text strong>{fmt(totalCredit)}</Text>
          </Col>
          <Col>
            <Text>Solde : </Text>
            <Text strong style={{ color: Math.abs(solde) < 0.01 ? '#52c41a' : '#ff4d4f' }}>
              {fmt(solde)}
            </Text>
          </Col>
        </Row>
      </Modal>
    </div>
  );
};

export default SaisieEcritures;
