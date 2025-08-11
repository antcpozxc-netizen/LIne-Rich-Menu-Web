import React from 'react';
import { Box, Typography, Avatar, Grid } from '@mui/material';
import QuickActionCard from '../components/QuickActionCard';
import { useNavigate } from 'react-router-dom';
import {
  Send as SendIcon, Image as ImageIcon, Chat as ChatIcon,
  TableChart as TableChartIcon
} from '@mui/icons-material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AppsIcon from '@mui/icons-material/Apps';

export default function DashboardHome() {
  const navigate = useNavigate();
  return (
    <>
      {/* Header โปรไฟล์สั้นๆ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar sx={{ bgcolor: '#66bb6a', width: 48, height: 48 }}>T</Avatar>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Test Rich Menu Account
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
            <PeopleAltIcon fontSize="small" />
            <Typography variant="body2">10</Typography>
          </Box>
        </Box>
      </Box>

      {/* การ์ด 2 ต่อแถว */}
      <Grid container spacing={2}>
        {/* แถว 1 */}
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Broadcast"
            description="Broadcast messages to friends"
            Icon={SendIcon}
            buttonText="Send a broadcast"
            onCardClick={() => navigate('broadcast')}
            onButtonClick={() => navigate('broadcast')}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Rich Message"
            description="Use big pics to get more clicks"
            Icon={ImageIcon}
            buttonText="Create rich message"
            onCardClick={() => navigate('rich-message')}
            onButtonClick={() => navigate('rich-message')}
          />
        </Grid>

        {/* แถว 2 */}
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Greeting message"
            description="This message will be sent automatically to users when they add you as a friend."
            Icon={ChatIcon}
            buttonText="Create Greeting message"
            onCardClick={() => navigate('greeting-message')}
            onButtonClick={() => navigate('greeting-message')}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Rich Menus"
            description="Create Menus for our company or etc."
            Icon={AppsIcon}
            buttonText="Create rich menus"
            onCardClick={() => navigate('rich-menus')}
            onButtonClick={() => navigate('rich-menus')}
          />
        </Grid>

        {/* แถว 3 */}
        <Grid item xs={12} md={6}>
          <QuickActionCard
            title="Friends"
            description="Manage your friends list and segments"
            Icon={TableChartIcon}
            buttonText="Open friends"
            onCardClick={() => navigate('friends')}
            onButtonClick={() => navigate('friends')}
          />
        </Grid>
      </Grid>
    </>
  );
}
