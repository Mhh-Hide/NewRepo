import { Alert, Card, Typography } from 'antd';
export function WelcomePage() {
  return (
    <main className="welcome">
      <Card>
        <Typography.Text type="secondary">
          MaaS Resource Lifecycle Management
        </Typography.Text>
        <Typography.Title level={1}>
          MaaS 模型资源全生命周期管理平台
        </Typography.Title>
        <Typography.Paragraph>
          欢迎使用。第 00 阶段：项目初始化与 Engineering Harness。
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          title="独立前端 Demo · 所有展示数据均为模拟数据"
          description="当前仅建立工程基础，未连接生产系统，尚未开发业务模块。"
        />
      </Card>
    </main>
  );
}
