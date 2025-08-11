import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import RichMessageEditor from '../components/RichMessageEditor'

// localStorage helpers
const KEY = 'richMessages';
const readAll = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const writeAll = (rows) => localStorage.setItem(KEY, JSON.stringify(rows));
const clone = (obj) => JSON.parse(JSON.stringify(obj));
const genId = () => 'RM-' + Math.random().toString(36).slice(2, 8).toUpperCase();

export default function RichMessageDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const item = useMemo(() => {
    const list = readAll();
    return list.find(r => r.id === id) || { id, name: '', image: '', areas: [] };
  }, [id]);

  const handleSave = (data) => {
    const list = readAll();
    const idx = list.findIndex(r => r.id === id);
    const now = new Date().toISOString().replace('T',' ').slice(0,16);
    const updated = {
      ...list[idx],
      name: data.name,
      image: data.image,
      areas: data.areas || [],
      actionLabel: data.areas?.[0]?.label || '',
      actionUrl: data.areas?.[0]?.url || '',
      createdAt: list[idx]?.createdAt || now,
      updatedAt: now,
    };
    if (idx >= 0) list[idx] = updated; else list.unshift(updated);
    writeAll(list);
    navigate('/homepage/rich-message');
  };

  const handleDelete = () => {
    const list = readAll().filter(r => r.id !== id);
    writeAll(list);
    navigate('/homepage/rich-message');
  };

  const handleDuplicate = () => {
    const list = readAll();
    const original = list.find(r => r.id === id);
    if (!original) return;
    const copy = clone(original);
    copy.id = genId();
    copy.name = copy.name ? copy.name + ' (copy)' : 'Untitled (copy)';
    copy.createdAt = new Date().toISOString().replace('T',' ').slice(0,16);
    delete copy.updatedAt;
    list.unshift(copy);
    writeAll(list);
    navigate(`/homepage/rich-message/${copy.id}`);
  };

  return (
    <RichMessageEditor
      mode="edit"
      initialData={item}
      onSave={handleSave}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
    />
  );
}
