import React, { useState } from 'react';
import { App, Modal, Upload, Button, Table, Tag, Dropdown } from 'antd';
import { UploadOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { importQuestionsFile } from '../../api/exams';
import { downloadTemplateFile } from '../../utils/templateDownload';
import type { ImportError } from '../../types/question';
import './index.css';

const { Dragger } = Upload;

interface ImportModalProps {
  open: boolean;
  examId: number;
  onClose: () => void;
  onSuccess: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ open, examId, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importResult, setImportResult] = useState<{ total: number; typeCounts: Record<string, number> } | null>(null);

  const handleDownloadTemplate = async (format: 'excel' | 'word') => {
    try {
      await downloadTemplateFile(format);
      message.success('模板下载成功');
    } catch (error) {
      message.error('模板下载失败');
    }
  };

  const uploadProps: UploadProps = {
    accept: '.xlsx,.docx',
    maxCount: 1,
    beforeUpload: (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'docx') {
        message.error('仅支持 .xlsx 或 .docx 格式');
        return false;
      }
      setFile(file);
      setErrors([]);
      setImportResult(null);
      return false;
    },
    onRemove: () => {
      setFile(null);
      setErrors([]);
      setImportResult(null);
    },
  };

  const handleImport = async () => {
    if (!file) {
      message.warning('请先选择文件');
      return;
    }

    setImporting(true);
    try {
      const res = await importQuestionsFile(examId, file);

      if ('data' in res && res.data && 'errors' in res.data) {
        // Error response
        setErrors(res.data.errors);
        message.error(`导入失败，发现 ${res.data.errors.length} 处错误`);
      } else if ('data' in res && res.data) {
        // Success response
        const data = res.data as any;
        setImportResult({
          total: data.imported_count,
          typeCounts: data.summary?.type_counts || {}
        });
        message.success(`成功导入 ${data.imported_count} 道题目`);
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 1500);
      }
    } catch (error) {
      message.error('导入失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setErrors([]);
    setImportResult(null);
    onClose();
  };

  const errorColumns = [
    { title: '行号', dataIndex: 'row', key: 'row', width: 60 },
    { title: '题型', dataIndex: 'type', key: 'type', width: 80 },
    {
      title: '题目内容',
      dataIndex: 'content_preview',
      key: 'content_preview',
      width: 150,
      ellipsis: true,
    },
    { title: '字段', dataIndex: 'field', key: 'field', width: 80 },
    {
      title: '当前值',
      dataIndex: 'current_value',
      key: 'current_value',
      width: 120,
      ellipsis: true,
    },
    { title: '错误原因', dataIndex: 'error', key: 'error', width: 200 },
    {
      title: '期望格式',
      dataIndex: 'expected',
      key: 'expected',
      width: 150,
      ellipsis: true,
    },
  ];

  const templateMenuItems = [
    {
      key: 'excel',
      label: 'Excel 模板 (.xlsx)',
      onClick: () => handleDownloadTemplate('excel'),
    },
    {
      key: 'word',
      label: 'Word 模板 (.docx)',
      onClick: () => handleDownloadTemplate('word'),
    },
  ];

  return (
    <Modal
      title="导入题目"
      open={open}
      onCancel={handleClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          取消
        </Button>,
        <Dropdown key="download" menu={{ items: templateMenuItems }} placement="topRight">
          <Button icon={<DownloadOutlined />}>下载模板</Button>
        </Dropdown>,
        <Button
          key="import"
          type="primary"
          icon={<UploadOutlined />}
          loading={importing}
          disabled={!file}
          onClick={handleImport}
        >
          确认导入
        </Button>,
      ]}
    >
      <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
        <p className="ant-upload-hint">支持 .xlsx 和 .docx 格式，请先下载模板按格式填写</p>
      </Dragger>

      {file && (
        <div style={{ marginBottom: 16 }}>
          <Tag color="blue">{file.name}</Tag>
        </div>
      )}

      {importResult && (
        <div className="import-result">
          <div className="import-result-title">导入成功</div>
          <div>共导入 {importResult.total} 道题目</div>
          {Object.entries(importResult.typeCounts).length > 0 && (
            <div style={{ marginTop: 8 }}>
              题型分布：
              {Object.entries(importResult.typeCounts).map(([type, count]) => (
                <Tag key={type} style={{ marginLeft: 4 }}>{type}: {count}</Tag>
              ))}
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div>
          <div className="import-error-title">
            发现 {errors.length} 处错误，请修改后重新上传
          </div>
          <Table
            columns={errorColumns}
            dataSource={errors.map((e, i) => ({ ...e, key: i }))}
            pagination={{ pageSize: 5 }}
            size="small"
            scroll={{ y: 300 }}
          />
        </div>
      )}
    </Modal>
  );
};

export default ImportModal;