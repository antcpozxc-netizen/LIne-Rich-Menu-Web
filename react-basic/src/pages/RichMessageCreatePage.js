// RichMessageCreatePage.js

import React from 'react';
import { useNavigate } from 'react-router-dom';
import RichMessageEditor from '../components/RichMessageEditor'

// localStorage helpers
const KEY = 'richMessages';
const readAll = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const writeAll = (rows) => localStorage.setItem(KEY, JSON.stringify(rows));
const genId = () => 'RM-' + Math.random().toString(36).slice(2, 8).toUpperCase();

export default function RichMessageCreatePage() {
  const navigate = useNavigate();

  const handleSave = (data) => {
    const list = readAll();
    const id = data.id || genId();
    const now = new Date().toISOString().replace('T',' ').slice(0,16);
    list.unshift({
      id,
      name: data.name,
      image: data.image,
      areas: data.areas || [],
      actionLabel: data.areas?.[0]?.label || '',
      actionUrl: data.areas?.[0]?.url || '',
      imagemap: data.imagemap || null,
      createdAt: now,
      updatedAt: now,
    });
    writeAll(list);
    navigate('/homepage/rich-message'); // back to list
  };

  return (
    <RichMessageEditor
      mode="create"
      initialData={{ name: '', image: '', areas: [] }}
      onSave={handleSave}
    />
  );
}
