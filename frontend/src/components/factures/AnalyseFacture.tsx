import React, { useState } from 'react';
import {
  Card, Upload, Button, Table, Form, Input, InputNumber, Select,
  Space, Tag, message, Spin, Alert, Row, Col, Divider, Typography,
} from 'antd';
import { InboxOutlined, CheckOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Societe, ExerciceComptable, Journal } from '../../types';
import { factureApi, journalApi, compteApi, pieceApi } from '../../services/api';
import dayjs from 'dayjs';

const { Dragger } = Upload;
const { Title, Text } = Typography;

interface LigneProposee {
  key: string;
  sens: 'debit' | 'credit';
  compte_numero: string;
  compte_libelle: string;
  libelle: string;
  montant: number;
}

const genKey = () => Math.random().toString(36).slice(2);

interface Extraction {
  date: string;
  numero_facture: string | null;
  fournisseur: string;
  description: string;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  deja_paye: boolean;
  mode_paiement: string | null;
}

interface AnalyseResult {
  extraction: Extraction;
  lignes_proposees: LigneProposee[];
  equilibre: boolean;
  total_debit: number;
  total_credit: number;
}

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
  exercices: ExerciceComptable[];
}

export default function AnalyseFacture({ societe, exercice, exercices }: Props) {
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<any[]>([]);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [exerciceId, setExerciceId] = useState<number>(exercice.id);
  const [saving, setSaving] = useState(false);
  const [lignes, setLignes] = useState<LigneProposee[]>([]);
  const [form] = Form.useForm();

  React.useEffect(() => {
    journalApi.list(societe.id).then(r => {
      const jList = r.data.results ?? r.data;
      setJournaux(jList);
      const achat = jList.find((j: Journal) => j.type_journal === 'achat');
      if (achat) setJournalId(achat.id);
    });
    compteApi.list(societe.id).then(r => setComptes(r.data.results ?? r.data));
  }, [societe.id]);

  const handleUpload = async (file: File) => {
    setAnalysing(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('fichier', file);
      fd.append('societe_id', String(societe.id));
      const res = await factureApi.analyser(fd);
      setResult(res.data);
      setLignes((res.data.lignes_proposees as any[]).map(l => ({ ...l, key: genKey() })));
      form.setFieldsValue({
        date: res.data.extraction.date,
        piece_ref: res.data.extraction.numero_facture || '',
        libelle: `Facture ${res.data.extraction.fournisseur}${res.data.extraction.numero_facture ? ' N°' + res.data.extraction.numero_facture : ''}`,
      });
    } catch (e: any) {
      message.error(e?.response?.data?.error || "Erreur lors de l'analyse");
    } finally {
      setAnalysing(false);
    }
  };

  const findCompteId = (numero: string): number | null => {
    // Try progressively shorter prefixes
    for (let len = numero.length; len >= 2; len--) {
      const prefix = numero.substring(0, len);
      const c = comptes.find((c: any) => c.numero.startsWith(prefix));
      if (c) return c.id;
    }
    return null;
  };

  const handleValider = async () => {
    if (!journalId) { message.error('Sélectionnez un journal'); return; }
    const values = await form.validateFields();
    const lignesApi = lignes.map(l => ({
      compte_id: findCompteId(l.compte_numero),
      libelle: l.libelle,
      debit: l.sens === 'debit' ? l.montant : 0,
      credit: l.sens === 'credit' ? l.montant : 0,
    }));
    const manquants = lignes.filter((l, i) => !lignesApi[i].compte_id);
    if (manquants.length > 0) {
      message.error(`Compte(s) introuvable(s) : ${manquants.map(l => l.compte_numero).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      await pieceApi.create({
        exercice_id: exerciceId,
        journal_id: journalId,
        date_piece: values.date,
        reference: values.piece_ref,
        libelle: values.libelle,
        lignes: lignesApi,
      });
      message.success('Écriture créée avec succès');
      setResult(null);
      setLignes([]);
      form.resetFields();

    } catch (e: any) {
      const err = e?.response?.data?.error || e?.response?.data?.detail || JSON.stringify(e?.response?.data) || "Erreur lors de la création de l'écriture";
      message.error(err, 6);
    } finally {
      setSaving(false);
    }
  };

  const updateLigne = (key: string, field: keyof LigneProposee, value: any) => {
    setLignes(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));
  };

  const removeLigne = (key: string) => {
    setLignes(prev => prev.filter(l => l.key !== key));
  };

  const addLigne = () => {
    setLignes(prev => [...prev, {
      key: genKey(), sens: 'debit', compte_numero: '', compte_libelle: '', libelle: '', montant: 0,
    }]);
  };

  const totalDebit = lignes.reduce((s, l) => s + (l.sens === 'debit' ? Number(l.montant) || 0 : 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (l.sens === 'credit' ? Number(l.montant) || 0 : 0), 0);
  const equilibre = Math.abs(totalDebit - totalCredit) < 0.01;

  const columns = [
    {
      title: 'Sens', dataIndex: 'sens', width: 100,
      render: (s: string, record: LigneProposee) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={s}
          onChange={v => updateLigne(record.key, 'sens', v)}
          options={[
            { value: 'debit', label: 'Débit' },
            { value: 'credit', label: 'Crédit' },
          ]}
        />
      ),
    },
    {
      title: 'Compte', dataIndex: 'compte_numero', width: 180,
      render: (val: string, record: LigneProposee) => (
        <Select
          showSearch
          size="small"
          style={{ width: '100%' }}
          value={val || undefined}
          placeholder="Numéro..."
          onChange={(v: string) => {
            const c = comptes.find((c: any) => c.numero === v);
            updateLigne(record.key, 'compte_numero', v);
            if (c) updateLigne(record.key, 'compte_libelle', c.intitule);
          }}
          filterOption={(input, option) =>
            String(option?.label || '').toLowerCase().includes(input.toLowerCase())
          }
          options={comptes.map((c: any) => ({ value: c.numero, label: `${c.numero} — ${c.intitule}` }))}
        />
      ),
    },
    {
      title: 'Libellé', dataIndex: 'libelle',
      render: (val: string, record: LigneProposee) => (
        <Input
          size="small"
          value={val}
          onChange={e => updateLigne(record.key, 'libelle', e.target.value)}
        />
      ),
    },
    {
      title: 'Montant', dataIndex: 'montant', width: 130, align: 'right' as const,
      render: (val: number, record: LigneProposee) => (
        <InputNumber
          size="small"
          style={{ width: '100%' }}
          value={val || undefined}
          onChange={v => updateLigne(record.key, 'montant', v || 0)}
          min={0}
          precision={2}
          placeholder="0,00"
        />
      ),
    },
    {
      title: '', key: 'del', width: 40,
      render: (_: any, record: LigneProposee) => (
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
      <Title level={4} style={{ marginBottom: 24 }}>Saisie automatique par facture</Title>

      {!result && (
        <Card>
          <Dragger
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            showUploadList={false}
            beforeUpload={file => { handleUpload(file); return false; }}
            disabled={analysing}
            style={{ padding: 24 }}
          >
            {analysing ? (
              <div style={{ padding: 32 }}>
                <Spin size="large" />
                <p style={{ marginTop: 16, color: '#666' }}>Analyse de la facture en cours...</p>
              </div>
            ) : (
              <>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">Glissez une facture ici ou cliquez pour sélectionner</p>
                <p className="ant-upload-hint">Formats supportés : JPEG, PNG, WebP, PDF</p>
              </>
            )}
          </Dragger>
        </Card>
      )}

      {result && (
        <>
          <Alert
            type="success"
            message="Facture analysée"
            description={`${result.extraction.fournisseur} — ${result.extraction.montant_ttc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} TTC`}
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={() => { setResult(null); setLignes([]); form.resetFields(); }}>
                Nouvelle facture
              </Button>
            }
          />

          {!result.equilibre && (
            <Alert
              type="warning"
              message={`Écriture déséquilibrée — Débit : ${result.total_debit.toLocaleString('fr-FR')} / Crédit : ${result.total_credit.toLocaleString('fr-FR')} — Vérifiez les lignes avant de valider.`}
              style={{ marginBottom: 12 }}
              showIcon
            />
          )}
          {result.extraction.deja_paye && (
            <Alert
              type="info"
              message={`Facture déjà payée par ${result.extraction.mode_paiement || 'virement'} — l'écriture inclut le compte de trésorerie.`}
              style={{ marginBottom: 12 }}
              showIcon
            />
          )}

          <Card title="Écriture proposée" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                <Col span={5}>
                  <Form.Item label="Exercice">
                    <Select
                      value={exerciceId}
                      onChange={setExerciceId}
                      options={exercices.filter(e => e.statut === 'ouvert').map(e => ({ value: e.id, label: e.libelle }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item name="piece_ref" label="N° facture">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label="Journal">
                    <Select
                      value={journalId}
                      onChange={setJournalId}
                      options={journaux.map((j: Journal) => ({ value: j.id, label: `${j.code} — ${j.intitule}` }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="libelle" label="Libellé" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            <Divider orientation="left" plain>Lignes comptables</Divider>
            <Table
              dataSource={lignes}
              columns={columns}
              rowKey="key"
              pagination={false}
              size="small"
            />

            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={addLigne}
              style={{ marginTop: 8, marginBottom: 8 }}
            >
              Ajouter une ligne
            </Button>

            <Row gutter={16} justify="end" style={{ marginBottom: 8 }}>
              <Col>
                <Text>Total Débit : <Text strong>{totalDebit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</Text></Text>
              </Col>
              <Col>
                <Text>Total Crédit : <Text strong>{totalCredit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</Text></Text>
              </Col>
              <Col>
                <Text style={{ color: equilibre ? '#52c41a' : '#ff4d4f' }}>
                  {equilibre ? 'Equilibré' : 'Déséquilibré'}
                </Text>
              </Col>
            </Row>

            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => { setResult(null); setLignes([]); form.resetFields(); }}>
                  Annuler
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={saving}
                  onClick={handleValider}
                >
                  Valider l'écriture
                </Button>
              </Space>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
