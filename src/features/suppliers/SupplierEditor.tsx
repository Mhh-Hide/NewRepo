import { useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Typography,
} from 'antd';
import type { ApiAdapter } from '../../services/api-adapter';
import type { SupplierView } from '../../auth/view-models';
import type { SupplierInput } from '../../domain/suppliers';
import {
  cooperationStatusLabels,
  supplierCategoryLabels,
} from '../../domain/suppliers';
import { supplierErrorMessage } from '../../services/supplier-types';
import type { SupplierOwner } from '../../services/supplier-types';
interface Props {
  api: ApiAdapter;
  initial: SupplierView | null;
  owners: readonly SupplierOwner[];
  canAssign: boolean;
  onClose: () => void;
  onSaved: (supplier: SupplierView) => void;
  onConflict: () => void;
}
export function SupplierEditor({
  api,
  initial,
  owners,
  canAssign,
  onClose,
  onSaved,
  onConflict,
}: Props) {
  const [form] = Form.useForm<SupplierInput>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialValues: Partial<SupplierInput> = {
    name: initial?.name ?? '',
    shortCode: initial?.shortCode ?? '',
    supplierCategory: initial?.supplierCategory ?? 'third_party',
    cooperationStatus: initial?.cooperationStatus ?? 'potential',
    ...(initial?.ownerUserId ? { ownerUserId: initial.ownerUserId } : {}),
    countryOrRegion: initial?.countryOrRegion ?? '',
    description: initial?.description ?? '',
    contactName: initial?.contactName ?? '',
    contactEmail: initial?.contactEmail ?? '',
    contactPhone: initial?.contactPhone ?? '',
    contactPosition: initial?.contactPosition ?? '',
    alternativeContact: initial?.alternativeContact ?? '',
    remark: initial?.remark ?? '',
  };
  const save = async (input: SupplierInput) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const result = initial
        ? await api.updateSupplier(initial.id, initial.version, input)
        : await api.createSupplier(input);
      onSaved(result);
    } catch (e) {
      setError(supplierErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      title={initial ? '编辑供应商资料' : '新增供应商'}
      open
      size={620}
      onClose={() => {
        if (!saving) onClose();
      }}
      extra={
        <Space>
          <Button onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            保存供应商
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        title="仅填写虚构演示资料"
        description="禁止输入真实客户或供应商敏感信息、密码、API Key 或密钥。"
      />
      {initial && (
        <Typography.Paragraph className="supplier-id">
          内部 ID：<Typography.Text code>{initial.id}</Typography.Text> · 版本{' '}
          {initial.version}
        </Typography.Paragraph>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            error.includes('重新加载') ? (
              <Button onClick={onConflict} size="small">
                重新加载最新资料
              </Button>
            ) : undefined
          }
        />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={save}
        disabled={saving}
        className="supplier-form"
      >
        <div className="supplier-form-grid">
          <Form.Item
            name="name"
            label="供应商名称"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请填写供应商正式名称',
              },
            ]}
          >
            <Input maxLength={160} />
          </Form.Item>
          <Form.Item
            name="shortCode"
            label="内部缩写"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请填写供应商内部缩写',
              },
            ]}
          >
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item
            name="supplierCategory"
            label="供应商类别"
            rules={[{ required: true, message: '请选择供应商类别' }]}
          >
            <Select
              options={Object.entries(supplierCategoryLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <Form.Item
            name="cooperationStatus"
            label="合作状态"
            rules={[{ required: true, message: '请选择合作状态' }]}
          >
            <Select
              options={Object.entries(cooperationStatusLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <Form.Item
            name="ownerUserId"
            label="主要采购负责人"
            rules={[{ required: true, message: '请选择主要采购负责人' }]}
          >
            <Select
              disabled={!!initial && !canAssign}
              options={owners.map((o) => ({ value: o.id, label: o.name }))}
            />
          </Form.Item>
          <Form.Item name="countryOrRegion" label="注册国家或地区">
            <Input maxLength={100} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="供应商简介">
          <Input.TextArea rows={2} maxLength={1000} showCount />
        </Form.Item>
        <div className="supplier-form-grid">
          <Form.Item name="contactName" label="主要联系人">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="contactPosition" label="联系人职务">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="contactEmail"
            label="联系人邮箱"
            rules={[{ type: 'email', message: '请输入有效的联系人邮箱' }]}
          >
            <Input maxLength={160} />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话">
            <Input maxLength={64} />
          </Form.Item>
        </div>
        <Form.Item name="alternativeContact" label="备用联系人">
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="remark" label="内部备注">
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
