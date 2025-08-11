// src/pages/BroadcastPage.js
import React, { useMemo, useState } from 'react';
import {
  Box, Button, Container, Divider, FormControl, FormControlLabel, FormHelperText,
  Grid, IconButton, InputAdornment, MenuItem, Paper, Radio, RadioGroup,
  Select, Stack, TextField, Tooltip, Typography
} from '@mui/material';
import {
  Save as SaveIcon,
  Send as SendIcon,
  Schedule as ScheduleIcon,
  Image as ImageIcon,
  InsertEmoticon as InsertEmoticonIcon,
  AttachFile as AttachFileIcon,
  Link as LinkIcon,
  ContentCopy as ContentCopyIcon,
  Close as CloseIcon,
  TextFormat as TextFormatIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const MAX_CHARS = 500;

const timezoneOptions = [
  { label: 'UTC −12:00', value: '-12:00' },
  { label: 'UTC −08:00', value: '-08:00' },
  { label: 'UTC −05:00', value: '-05:00' },
  { label: 'UTC +00:00', value: '+00:00' },
  { label: 'UTC +07:00', value: '+07:00' }, // TH default
  { label: 'UTC +08:00', value: '+08:00' },
  { label: 'UTC +09:00', value: '+09:00' },
];

export default function BroadcastPage() {
  const navigate = useNavigate();

  // recipients
  const [recipient, setRecipient] = useState('all'); // 'all' | 'target'
  // schedule
  const [sendType, setSendType] = useState('now');   // 'now' | 'schedule'
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [tz, setTz] = useState('+07:00');

  // message blocks
  const [blocks, setBlocks] = useState([
    { id: 1, type: 'text', value: '' },
  ]);

  const canSend = useMemo(() => {
    const hasText = blocks.some(b => b.value.trim().length > 0);
    const validSchedule = sendType === 'now' || (date && time);
    return hasText && validSchedule;
  }, [blocks, sendType, date, time]);

  const addBlock = () => {
    const nextId = (blocks.at(-1)?.id || 0) + 1;
    setBlocks(prev => [...prev, { id: nextId, type: 'text', value: '' }]);
  };

  const removeBlock = (id) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const updateBlock = (id, newValue) => {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, value: newValue.slice(0, MAX_CHARS) } : b)));
  };

  const insertEmoji = (id, emoji = '😀') => {
    setBlocks(prev =>
      prev.map(b => (b.id === id ? { ...b, value: (b.value + ' ' + emoji).slice(0, MAX_CHARS) } : b))
    );
  };

  const onSaveDraft = () => {
    // TODO: connect API
    console.log('save draft', { recipient, sendType, date, time, tz, blocks });
  };

  const onSendTest = () => {
    // TODO: connect API
    console.log('send test', { blocks });
  };

  const onSubmit = () => {
    // TODO: connect API
    console.log('send broadcast', { recipient, sendType, date, time, tz, blocks });
  };

  return (
    <Container sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h4" fontWeight="bold">Broadcast</Typography>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<SaveIcon />} variant="contained" sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' }}} onClick={onSaveDraft}>
            save draft
          </Button>
          <Button startIcon={<SendIcon />} variant="contained" sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' }}} onClick={onSendTest}>
            send test
          </Button>
        </Stack>
      </Stack>

      {/* Recipients */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: .5 }}>Recipients</Typography>
        <FormControl>
          <RadioGroup row value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <FormControlLabel value="all" control={<Radio />} label="All friends" />
            <FormControlLabel value="target" control={<Radio />} label="Targeting" />
          </RadioGroup>
          <FormHelperText sx={{ ml: 0, color: 'text.secondary' }}>
            You can narrow down your friends into smaller groups based on demographics or past actions. This can make your broadcasts more effective.
          </FormHelperText>
        </FormControl>
      </Box>

      {/* Broadcast time */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: .5 }}>Broadcast time</Typography>
        <FormControl>
          <RadioGroup value={sendType} onChange={(e) => setSendType(e.target.value)}>
            <FormControlLabel value="now" control={<Radio />} label="Send now" />
            <FormControlLabel
              value="schedule"
              control={<Radio />}
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    sx={{ width: 170 }}
                    disabled={sendType !== 'schedule'}
                    InputProps={{ startAdornment: <InputAdornment position="start"><ScheduleIcon fontSize="small" /></InputAdornment> }}
                  />
                  <TextField
                    size="small"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    sx={{ width: 120 }}
                    disabled={sendType !== 'schedule'}
                  />
                  <Select
                    size="small"
                    value={tz}
                    onChange={(e) => setTz(e.target.value)}
                    sx={{ minWidth: 120 }}
                    disabled={sendType !== 'schedule'}
                  >
                    {timezoneOptions.map(z => (
                      <MenuItem key={z.value} value={z.value}>
                        UTC {z.value}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>
              }
            />
          </RadioGroup>
        </FormControl>
      </Box>

      {/* Composer blocks */}
      <Stack spacing={2}>
        {blocks.map((b, idx) => (
          <Paper key={b.id} variant="outlined" sx={{ p: 1.5 }}>
            {/* Toolbar (mock icons) */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, px: .5 }}>
              <Tooltip title="Text"><IconButton size="small"><TextFormatIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Image"><IconButton size="small"><ImageIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="File"><IconButton size="small"><AttachFileIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Link"><IconButton size="small"><LinkIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Duplicate">
                <IconButton size="small" onClick={() => setBlocks(prev => {
                  const copy = { ...b, id: (prev.at(-1)?.id || 0) + 1 };
                  return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
                })}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Remove block">
                <span>
                  <IconButton size="small" disabled={blocks.length === 1} onClick={() => removeBlock(b.id)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>

            {/* Text area */}
            <TextField
              placeholder="Enter text"
              multiline
              minRows={5}
              value={b.value}
              onChange={(e) => updateBlock(b.id, e.target.value)}
              fullWidth
              inputProps={{ maxLength: MAX_CHARS }}
            />
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: .5 }}>
              <Button
                size="small"
                startIcon={<InsertEmoticonIcon />}
                onClick={() => insertEmoji(b.id, '😀')}
                sx={{ textTransform: 'none' }}
              >
                Emoji
              </Button>
              <Typography variant="caption" color="text.secondary">
                {b.value.length}/{MAX_CHARS}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Add block + Send */}
      <Grid container alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
        <Grid item>
          <Button variant="outlined" onClick={addBlock}>+ Add</Button>
        </Grid>
        <Grid item>
          <Button
            variant="contained"
            size="large"
            endIcon={<SendIcon />}
            disabled={!canSend}
            onClick={onSubmit}
            sx={{ bgcolor: '#66bb6a', px: 4, '&:hover': { bgcolor: '#57aa5b' } }}
          >
            send
          </Button>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Button variant="text" onClick={() => navigate(-1)}>Back</Button>
    </Container>
  );
}
