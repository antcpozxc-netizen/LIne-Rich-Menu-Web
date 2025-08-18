import React, { useMemo, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, Paper, TextField, Typography, Stack
} from '@mui/material';

// ใช้ localStorage ชุดเดียวกับหน้า RichMessage*
const KEY = 'richMessages';
const readAll = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
};

export default function RichMessagePicker({ open, onClose, onSelect }) {
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const rows = readAll();
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      String(r.id).toLowerCase().includes(s) ||   // ✅ กัน id ไม่ใช่ string
      (r.name || '').toLowerCase().includes(s)
    );
  }, [q]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Select a rich message</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            size="small"
            placeholder="Search by id or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {list.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              No rich message. Create one in “Rich messages” first.
            </Box>
          ) : (
            <Grid container spacing={2}>
              {list.map(item => {
                // ✅ ใช้ image ที่เซฟไว้ ถ้าไม่มีลองใช้ imagemap.urls (300/700/1040)
                const imgSrc =
                  item.image ||
                  item.imagemap?.urls?.[300] ||
                  item.imagemap?.urls?.[700] ||
                  item.imagemap?.urls?.[1040] ||
                  '';

                return (
                  <Grid item xs={12} sm={6} md={4} key={item.id}>
                    <Paper
                      variant="outlined"
                      sx={{ p: 1, cursor: 'pointer', '&:hover': { boxShadow: 2 } }}
                      onClick={() => onSelect?.(item)}
                    >
                      <Box sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden', background:'#f6f6f6' }}>
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={item.name}
                            style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <Box sx={{ height:140, display:'flex', alignItems:'center', justifyContent:'center', color:'text.secondary' }}>
                            No image
                          </Box>
                        )}
                      </Box>
                      <Typography variant="subtitle2" sx={{ mt: 1 }}>{item.name || '(Untitled)'}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.id}</Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
