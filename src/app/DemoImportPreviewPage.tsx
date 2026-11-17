import { useState } from 'react';
import { Alert, Button, Card, Popconfirm, Space, Table, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { previewDemoStaging, type DemoStagingPreview } from '../demo-import/staging';
import { PageHeader } from '../components/PageHeader';
import { Link, useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../services/demo-session';

const { Text, Paragraph } = Typography;
/** The selected file is parsed in the current browser only. Never persisted or uploaded. */
export function DemoImportPreviewPage() {
  const session = useOutletContext<DemoSession>();
  const [preview, setPreview] = useState<DemoStagingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const permitted = session.domain === 'all' && session.permits('demo:reset');
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const beforeUpload: NonNullable<UploadProps['beforeUpload']> = (file) => {
    setError('');
    setNotice('');
    setPreview(null);
    setFilename(file.name);
    if (!file.name.toLowerCase().endsWith('.json') || file.size > 5 * 1024 * 1024) {
      setError('请选择不超过 5MB 的内部 Demo JSON 文件。');
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
  const importCandidates = async () => {
    if (!preview || !permitted || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await session.api.importDemoSupplierCandidates(preview.supplierCandidates);
      setNotice(`已导入 ${result.created} 条供应商候选；跳过 ${result.skipped} 条已有同名候选。均处于停用、待核验状态。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '候选导入失败');
    } finally {
      setBusy(false);
    }
  };
  if (!permitted) {
    return <Alert type="error" showIcon title="当前演示身份无权使用供应商内部数据导入" description="请切换到全部业务域的产品运营演示身份。此处仅提供界面级演示权限，正式隔离仍须服务端认证。" />;
  }
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
        description="本地读取内部 JSON，先校验、后人工确认。只允许将供应商候选原子化写入本浏览器 Mock 主档，不自动生成渠道或测试结论。"
        actions={<Link to="/suppliers">返回供应商管理</Link>}
      />
      <Card title="选择内部数据包">
        <Space direction="vertical" size="middle">
          <Upload
            accept=".json,application/json"
            beforeUpload={beforeUpload}
            showUploadList={false}
            maxCount={1}
          >
            <Button>选择 JSON 文件进行校验</Button>
          </Upload>
          <Text type="secondary">浏览器本地解析；不会上传服务器。仅点击确认导入后，供应商候选才会写入本浏览器 LocalStorage。</Text>
          {filename && <Text>当前文件：{filename}</Text>}
          {error && <Alert type="error" showIcon title="校验失败" description={error} />}
        </Space>
      </Card>
      {preview && (
        <Card title="预览结果">
          <Alert type="warning" showIcon title="候选数据尚未导入，后续操作仅影响本浏览器 Mock 数据" />
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
          {permitted && <Space style={{ marginTop: 16 }}>
            <Popconfirm title="确认导入供应商候选？" description="一次性写入本浏览器 Mock 主档，默认停用、待核验；不创建渠道、不覆盖历史。若存在冲突，将整体失败。" okText="确认导入" cancelText="取消" onConfirm={() => void importCandidates()}>
              <Button type="primary" loading={busy}>导入 {preview.supplierCandidates.length} 条供应商候选</Button>
            </Popconfirm>
          </Space>}
          {notice && <Alert style={{ marginTop: 12 }} showIcon type="success" title={notice} />}
          {error && <Alert style={{ marginTop: 12 }} showIcon type="error" title={error} />}
          <Paragraph style={{ marginTop: 16 }}>
            {preview.warnings.map((warning) => <div key={warning}><Text>{warning}</Text></div>)}
          </Paragraph>
        </Card>
      )}
    </>
  );
}
