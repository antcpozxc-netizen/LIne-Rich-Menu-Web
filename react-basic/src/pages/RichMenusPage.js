// src/pages/RichMenusPage.js
import React, { useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Container, Divider, Grid,
  IconButton, MenuItem, Radio, RadioGroup, Select, Stack,
  TextField, Typography, Dialog, DialogTitle, DialogContent,
  DialogActions, Paper, FormControlLabel
} from '@mui/material';

import {
  Save as SaveIcon,
  SaveAlt as SaveDraftIcon,
  Image as ImageIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'richMenuDraft';

// -------- Template presets (ตัวอย่าง)
const TEMPLATES = [
  {
    id: 'large-6', label: 'Large (2500×1686)', cells: 6,
    preview: [[0,0,2,2],[2,0,2,2],[4,0,2,2],[0,2,2,2],[2,2,2,2],[4,2,2,2]],
  },
  {
    id: 'large-3', label: 'Large (3 blocks)', cells: 3,
    preview: [[0,0,3,2],[3,0,3,2],[0,2,6,2]],
  },
  {
    id: 'compact-4', label: 'Compact (2500×843)', cells: 4,
    preview: [[0,0,3,2],[3,0,3,2],[0,2,3,2],[3,2,3,2]],
  },
  {
    id: 'compact-1', label: 'Compact (1 block)', cells: 1,
    preview: [[0,0,6,4]],
  },
];

// -------- ตัวเลือก Action
const ACTION_OPTIONS = ['Select', 'Link', 'Text', 'QnA', 'Live Chat', 'No action'];

// -------- Helper เก็บ/อ่าน localStorage
const readDraft = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
};
const writeDraft = (obj) => localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));

// -------- แสดง editor ของ action ตามชนิด
function ActionEditor({ idx, action, onChange }) {
  const update = (patch) => onChange({ ...action, ...patch });

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">
          {String.fromCharCode(65 + idx)} {/* A, B, C... */}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Select
          size="small"
          value={action.type}
          onChange={(e) => update({ type: e.target.value })}
          sx={{ minWidth: 200 }}
        >
          {ACTION_OPTIONS.map((opt) => (
            <MenuItem key={opt} value={opt}>
              {opt}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      {/* ฟิลด์ตามชนิด */}
      {action.type === 'Link' && (
        <Stack spacing={1}>
          <TextField
            label="Enter URL"
            value={action.url || ''}
            onChange={(e) => update({ url: e.target.value })}
          />
          <TextField
            label="Action label"
            helperText="เช่น Open link, Home page ฯลฯ (0/20)"
            value={action.label || ''}
            onChange={(e) => update({ label: e.target.value.slice(0, 20) })}
          />
        </Stack>
      )}

      {action.type === 'Text' && (
        <TextField
          label="Enter text"
          helperText="ข้อความหรือคีย์เวิร์ด (≤ 50 ตัวอักษร)"
          value={action.text || ''}
          onChange={(e) => update({ text: e.target.value.slice(0, 50) })}
          fullWidth
        />
      )}

      {action.type === 'QnA' && (
        <Stack spacing={1}>
          {(action.qas || [{ q: '', a: '' }]).map((qa, i) => (
            <Grid container spacing={1} key={i}>
              <Grid item xs={12} md={6}>
                <TextField
                  label={`Question ${i + 1}`}
                  placeholder="#menu"
                  value={qa.q}
                  onChange={(e) => {
                    const next = [...(action.qas || [{ q: '', a: '' }])];
                    next[i] = { ...next[i], q: e.target.value.slice(0, 50) };
                    update({ qas: next });
                  }}
                  fullWidth
                  helperText={`${qa.q.length}/50`}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Answer"
                  placeholder="Enter text"
                  value={qa.a}
                  onChange={(e) => {
                    const next = [...(action.qas || [{ q: '', a: '' }])];
                    next[i] = { ...next[i], a: e.target.value.slice(0, 180) };
                    update({ qas: next });
                  }}
                  fullWidth
                  helperText={`${qa.a.length}/180`}
                />
              </Grid>
            </Grid>
          ))}
          <Button
            variant="outlined"
            onClick={() => update({ qas: [...(action.qas || []), { q: '', a: '' }] })}
          >
            add Question
          </Button>
        </Stack>
      )}

      {action.type === 'Live Chat' && (
        <TextField
          label="Action label"
          placeholder="Open Live Chat Session"
          value={action.label || ''}
          onChange={(e) => update({ label: e.target.value.slice(0, 20) })}
          helperText="≤20 ตัวอักษร"
          fullWidth
        />
      )}

      {action.type === 'No action' && (
        <Typography variant="body2" color="text.secondary">
          This block has no action.
        </Typography>
      )}
    </Paper>
  );
}

// -------- Modal เลือก Template
function TemplateModal({ open, onClose, value, onApply }) {
  const [selected, setSelected] = useState(value?.id || TEMPLATES[0].id);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Select a template</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          {TEMPLATES.map((t) => (
            <Grid item xs={12} sm={6} md={4} key={t.id}>
              <Paper
                variant="outlined"
                onClick={() => setSelected(t.id)}
                sx={{
                  p: 1, cursor: 'pointer',
                  outline: selected === t.id ? '2px solid #66bb6a' : 'none',
                  borderRadius: 2,
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t.label}
                </Typography>
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    pt: '66%', // aspect
                    bgcolor: '#f5f5f5',
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  {/* วาดช่องตัวอย่างแบบหยาบ ๆ */}
                  {t.preview.map((cell, i) => {
                    const [x, y, w, h] = cell; // หน่วย grid 6×4
                    const left = (x / 6) * 100;
                    const top = (y / 4) * 100;
                    const width = (w / 6) * 100;
                    const height = (h / 4) * 100;
                    return (
                      <Box
                        key={i}
                        sx={{
                          position: 'absolute',
                          left: `${left}%`, top: `${top}%`,
                          width: `${width}%`, height: `${height}%`,
                          border: '2px solid rgba(76,175,80,.9)',
                          background: 'rgba(76,175,80,.15)',
                          borderRadius: 1,
                        }}
                      />
                    );
                  })}
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => {
            const t = TEMPLATES.find((x) => x.id === selected) || TEMPLATES[0];
            onApply(t);
          }}
          sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function RichMenusPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('test rich menus');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [image, setImage] = useState('');
  const [actions, setActions] = useState(() =>
    Array.from({ length: template.cells }, () => ({ type: 'Select' }))
  );
  const [menuBarLabel, setMenuBarLabel] = useState('');
  const [behavior, setBehavior] = useState('shown');

  const fileRef = useRef(null);

  const clearPeriod = () => {
    setStartDate(''); setStartTime(''); setEndDate(''); setEndTime('');
  };

  const pickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(f);
  };

  const openTemplate = useRef(null);
  const [openTpl, setOpenTpl] = useState(false);

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  const handleApplyTemplate = (tpl) => {
    setTemplate(tpl);
    // ปรับจำนวน actions ตาม template
    setActions((prev) => {
      const next = [...prev];
      if (tpl.cells > next.length) {
        return [...next, ...Array.from({ length: tpl.cells - next.length }, () => ({ type: 'Select' }))];
      }
      return next.slice(0, tpl.cells);
    });
    setOpenTpl(false);
  };

  const updateActionAt = (i, next) => {
    setActions((prev) => prev.map((a, idx) => (idx === i ? next : a)));
  };

  const saveDraft = () => {
    writeDraft({
      title, startDate, startTime, endDate, endTime,
      templateId: template.id, image, actions, menuBarLabel, behavior,
    });
    alert('Draft saved (local)');
  };

  const save = () => {
    // TODO: call backend API
    console.log('SAVE rich menu', { title, startDate, startTime, endDate, endTime, template, image, actions, menuBarLabel, behavior });
    alert('Saved (mock)');
  };

  return (
    <Container sx={{ py: 3 }}>
      {/* Top bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<SaveDraftIcon />} onClick={saveDraft}>
          Save draft
        </Button>
        <Typography variant="h4" fontWeight="bold">Rich menu</Typography>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!canSave}
          onClick={save}
          sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
        >
          Save
        </Button>
      </Stack>

      {/* Main settings */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
            Main settings
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12}>
              <TextField
                label="Title"
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 30))}
                helperText={`${title.length}/30 (Titles are only for management purposes)`}
              />
            </Grid>
            <Grid item xs={12} md={5.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  label="Start date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Start time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <Typography>~</Typography>
                <TextField
                  label="End date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="End time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <IconButton onClick={clearPeriod} title="Clear">
                  <ClearIcon />
                </IconButton>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Content area */}
      <Grid container spacing={2} alignItems="flex-start">
        {/* Preview (ซ้าย) */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Menu content</Typography>
              <Typography variant="caption" color="text.secondary">Preview</Typography>
              <Box sx={{ mt: 1, width: '100%', border: '1px solid #eee', borderRadius: 1, p: 1 }}>
                <Box sx={{ height: 280, bgcolor: '#cfe2f3', borderRadius: 1, mb: 1, position: 'relative' }}>
                  {/* Avatar dot */}
                  <Box sx={{ position: 'absolute', top: 8, left: 8, width: 28, height: 28, bgcolor: '#ddd', borderRadius: '50%' }} />
                </Box>

                {/* Rich menu image */}
                <Box sx={{ border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
                  {image ? (
                    <img src={image} alt="richmenu" style={{ width: '100%', display: 'block' }} />
                  ) : (
                    <Box sx={{ height: 160, bgcolor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="body2" color="text.secondary">No image</Typography>
                    </Box>
                  )}
                </Box>

                <Typography variant="caption" color="text.secondary">Show template outlines</Typography>
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button variant="outlined" onClick={() => setOpenTpl(true)}>Template</Button>
                <Button variant="outlined" startIcon={<ImageIcon />} onClick={() => fileRef.current?.click()}>
                  Change
                </Button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickImage(e)} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Actions + Chat bar settings (ขวา) */}
        <Grid item xs={12} md={8}>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Actions</Typography>

              {actions.map((ac, i) => (
                <ActionEditor
                  key={i}
                  idx={i}
                  action={ac}
                  onChange={(next) => updateActionAt(i, next)}
                />
              ))}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                Chat bar settings
              </Typography>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ minWidth: 120 }}>Menu bar</Typography>
                <Select
                  size="small"
                  value={menuBarLabel ? 'custom' : 'none'}
                  onChange={(e) => {
                    if (e.target.value === 'none') setMenuBarLabel('');
                  }}
                  sx={{ width: 160 }}
                >
                  <MenuItem value="none">No custom label</MenuItem>
                  <MenuItem value="custom">Custom label</MenuItem>
                </Select>
                <TextField
                  placeholder="Enter custom label"
                  size="small"
                  value={menuBarLabel}
                  onChange={(e) => setMenuBarLabel(e.target.value.slice(0, 14))}
                  disabled={!menuBarLabel && true}
                  sx={{ ml: 1 }}
                  helperText={`${menuBarLabel.length}/14`}
                />
              </Stack>

              <Stack direction="row" spacing={2} alignItems="center">
                <Typography sx={{ minWidth: 120 }}>Default behavior</Typography>
                <RadioGroup
                  row
                  value={behavior}
                  onChange={(e) => setBehavior(e.target.value)}
                >
                  <FormControlLabel value="shown" control={<Radio />} label="Shown" />
                  <FormControlLabel value="collapsed" control={<Radio />} label="Collapsed" />
                </RadioGroup>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Template modal */}
      <TemplateModal
        open={openTpl}
        onClose={() => setOpenTpl(false)}
        value={template}
        onApply={handleApplyTemplate}
      />
    </Container>
  );
}
