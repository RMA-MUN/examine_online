import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Drawer, Transfer } from 'antd';
import type { TransferProps } from 'antd';
import { batchUpdateClassStudents, getAvailableStudents, getClassStudents } from '../../api/classes';
import type { ClassStudent } from '../../api/classes';
import './index.css';

interface ClassStudentsDrawerProps {
  open: boolean;
  onClose: () => void;
  classId: number;
  className?: string;
  onChanged?: () => void;
}

interface TransferItem {
  key: number;
  title: string;
}

const toTransferItem = (s: ClassStudent): TransferItem => ({
  key: s.id,
  title: `${s.name} (${s.username})`,
});

const ClassStudentsDrawer = ({ open, onClose, classId, className, onChanged }: ClassStudentsDrawerProps) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<TransferItem[]>([]);
  const [targetKeys, setTargetKeys] = useState<number[]>([]);
  const loadSeqRef = useRef(0);

  const load = async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [inClass, available] = await Promise.all([
        getClassStudents(classId),
        getAvailableStudents(classId),
      ]);
      if (seq !== loadSeqRef.current) {
        return;
      }
      const inClassItems = (inClass.data || []).map(toTransferItem);
      const availableItems = (available.data || []).map(toTransferItem);
      setDataSource([...inClassItems, ...availableItems]);
      setTargetKeys(inClassItems.map((i) => i.key));
    } catch (error) {
      if (seq !== loadSeqRef.current) {
        return;
      }
      message.error('获取班级学生失败');
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open, classId]);

  const handleChange: TransferProps<TransferItem>['onChange'] = async (nextKeys) => {
    const next = new Set(nextKeys as number[]);
    const prev = new Set(targetKeys);
    const toAdd = dataSource.filter((i) => next.has(i.key) && !prev.has(i.key)).map((i) => i.key);
    const toRemove = dataSource.filter((i) => !next.has(i.key) && prev.has(i.key)).map((i) => i.key);

    if (toAdd.length === 0 && toRemove.length === 0) {
      return;
    }

    setTargetKeys(nextKeys as number[]);
    try {
      if (toAdd.length > 0) {
        await batchUpdateClassStudents(classId, 'add', toAdd);
      }
      if (toRemove.length > 0) {
        await batchUpdateClassStudents(classId, 'remove', toRemove);
      }
      message.success('更新成功');
      onChanged?.();
    } catch (error) {
      message.error('更新失败');
    }
    await load();
  };

  const options = useMemo(
    () => ({
      dataSource,
      targetKeys,
      onChange: handleChange,
      showSearch: true,
      filterOption: (input: string, item: TransferItem) =>
        item.title.toLowerCase().includes(input.toLowerCase()),
      titles: ['可加入学生', '班级学生'],
      render: (item: TransferItem) => item.title,
    }),
    [dataSource, targetKeys, classId]
  );

  return (
    <Drawer
      title={className ? `管理班级学生：${className}` : '管理班级学生'}
      open={open}
      onClose={onClose}
      width={840}
      size="large"
    >
      <div className="class-students-transfer">
        <Transfer
          {...options}
          rowKey={(i) => i.key}
          listStyle={{
            flex: '1 1 0',
            minWidth: 0,
            height: '100%',
          }}
        />
      </div>
    </Drawer>
  );
};

export default ClassStudentsDrawer;
