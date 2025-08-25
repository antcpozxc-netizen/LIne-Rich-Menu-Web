// src/pages/DashboardHome.jsx
import React from 'react';
import { Box, Typography, Avatar, Grid, Chip, Stack, Button } from '@mui/material';
import QuickActionCard from '../components/QuickActionCard';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Send as SendIcon, Image as ImageIcon, Chat as ChatIcon,
  TableChart as TableChartIcon,
} from '@mui/icons-material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AppsIcon from '@mui/icons-material/Apps';

export default function DashboardHome() {
  const navigate = useNavigate();
  const { tenantId, tenant } = useOutletContext() || {};
  const friends = (tenant?.friendsCount ?? tenant?.stats?.friends);
  const go = (path) => navigate(tenantId ? `${path}?tenant=${tenantId}` : path);

  return (
    <>
      {/* Header OA */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar
          src={tenant?.pictureUrl || undefined}
          sx={{ bgcolor: '#66bb6a', width: 56, height: 56, fontWeight: 700 }}
        >
          {!tenant?.pictureUrl && (tenant?.displayName?.[0] || 'O')}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }} noWrap>
              {tenant?.displayName || 'No OA selected'}
            </Typography>
            {tenant?.basicId && <Chip size="small" label={tenant.basicId} />}
          </Stack>
          {typeof friends !== 'undefined' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <PeopleAltIcon fontSize="small" />
              <Typography variant="body2">{friends}</Typography>
            </Box>
          )}
          {!tenant && (
            <Typography variant="body2" color="text.secondary">
              กรุณาเลือก OA จากเมนู <strong>Accounts</strong> ก่อนเริ่มใช้งาน
            </Typography>
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={() => go('/accounts')}>
          {tenant ? 'Switch OA' : 'Select OA'}
        </Button>
      </Box>

      {/* Quick actions */}
      <Grid container spacing={2}>
        {/* แถว 1 */}
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Broadcast"
            description="Broadcast messages to friends"
            Icon={SendIcon}
            buttonText="Send a broadcast"
            onCardClick={() => go('/homepage/broadcast')}
            onButtonClick={() => go('/homepage/broadcast')}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Rich Message"
            description="Use big pics to get more clicks"
            Icon={ImageIcon}
            buttonText="Create rich message"
            onCardClick={() => go('/homepage/rich-message')}
            onButtonClick={() => go('/homepage/rich-message')}
          />
        </Grid>

        {/* แถว 2 */}
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Greeting message"
            description="Auto-sent when users add you as a friend"
            Icon={ChatIcon}
            buttonText="Create Greeting message"
            onCardClick={() => go('/homepage/greeting-message')}
            onButtonClick={() => go('/homepage/greeting-message')}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Rich Menus"
            description="Create menus for your OA"
            Icon={AppsIcon}
            buttonText="Create rich menus"
            onCardClick={() => go('/homepage/rich-menus')}
            onButtonClick={() => go('/homepage/rich-menus')}
          />
        </Grid>
      </Grid>
    </>
  );
}
