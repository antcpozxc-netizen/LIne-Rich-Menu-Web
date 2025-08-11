import React from 'react';
import { Card, CardContent, CardActions, Typography, Box, Button } from '@mui/material';

/**
 * QuickActionCard
 * props:
 * - title: string
 * - description: string
 * - Icon: React component (เช่น SendIcon)
 * - buttonText: string
 * - onCardClick: () => void
 * - onButtonClick: (event) => void
 */
export default function QuickActionCard({
  title,
  description,
  Icon,
  buttonText,
  onCardClick,
  onButtonClick,
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        cursor: 'pointer',
        transition: 'transform .08s ease, box-shadow .2s ease',
        '&:hover': { transform: 'translateY(-1px)', boxShadow: 1 },
      }}
      onClick={onCardClick}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </Box>
          {Icon ? <Icon /> : null}
        </Box>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          variant="contained"
          size="small"
          sx={{ bgcolor: '#66bb6a', textTransform: 'none', '&:hover': { bgcolor: '#57aa5b' } }}
          onClick={(e) => {
            e.stopPropagation();
            onButtonClick?.(e);
          }}
        >
          {buttonText}
        </Button>
      </CardActions>
    </Card>
  );
}
