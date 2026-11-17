import { useState } from 'react';
import { Alert, Button, Card, Space, Table, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { previewDemoStaging, type DemoStagingPreview } from '../demo-import/staging';
import { PageHeader } from '../components/PageHeader';
import { Link } from 'react-router-dom';

const { Text, Paragraph } = Typography;
/** The selected file is parsed in the current browser only. Never persisted or uploaded. */
export function DemoImportPreviewPage() {
  const [preview, setPreview] = useState<DemoStagingPreview | null>(null);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const beforeUpload: NonNullable<UploadProps['beforeUpload']> = (file) => {
    setError('');
    setPreview(null);
    setFilename(file.name);
    if (!file.name.toLowerCase().endsWith('.json') || file.size > 5 * 1024 * 1024) {
      setError('请选择不超过 5MB 的脱敏 Demo JSON 文件。');
      return false;
    }
    void file.text().then((text) => {
      const parsed: unknown = JSON.parse(text);
      setPreview(previewDemoStaging(parsed));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : '导入包无法解析');
    });
    return false;
  };
  const rows = preview ? [
    { key: 'suppliers', label: '供应商候选', count: preview.summary.suppliers },
    { key: 'resourceIntake', label: '资源线索', count: preview.summary.resourceIntake },
    { key: 'purchaseDemands', label: '采购需求线索', count: preview.summary.purchaseDemands },
    { key: 'supplierTests', label: '测试历史线索', count: preview.summary.supplierTests },
    { key: 'customers', label: '匿名客户', count: preview.summary.customers },
    { key: 'customerModelEconomics', label: '模拟经营记录', count: preview.summary.customerModelEconomics },
  ] : [];
  return (
    <>
      <PageHeader
        group="资源管理"
        title="Demo 数据导入预览"
        description="仅本地读取脱敏 JSON，检查字段和关联。不保存、不修改任何现有供应商、渠道或测试记录。"
        actions={<Link to="/suppliers">返回供应商管理</Link>}
      />
      <Card title="选择脱敏数据包">
        <Space direction="vertical" size="middle">
          <Upload
            accept=".json,application/json"
            beforeUpload={beforeUpload}
            showUploadList={false}
            maxCount={1}
          >
            <Button>选择 JSON 文件进行校验</Button>
          </Upload>
          <Text type="secondary">浏览器本地解析；不会上传服务器，也不会写入 LocalStorage。</Text>
          {filename && <Text>当前文件：{filename}</Text>}
          {error && <Alert type="error" showIcon title="校验失败" description={error} />}
        </Space>
      </Card>
      {preview && (
        <Card title="预览结果">
          <Alert type="warning" showIcon title="当前仅为候选数据预览，尚未导入系统" />
          <Table
            style={{ marginTop: 16 }}
            pagination={false}
            rowKey="key"
            dataSource={rows}
            columns={[
              { title: '集合', dataIndex: 'label', key: 'label' },
              { title: '记录数', dataIndex: 'count', key: 'count' },
            ]}
          />
          <Paragraph style={{ marginTop: 16 }}>
            {preview.warnings.map((warning) => <div key={warning}><Text>{warning}</Text></div>)}
          </Paragraph>
        </Card>
      )}
    </>
  );
}
