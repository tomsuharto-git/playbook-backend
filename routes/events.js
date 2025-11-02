const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

// POST /api/events/:id/complete
// Mark event as completed (manual or auto)
router.post('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const { auto = false } = req.body;

  try {
    const { data, error } = await supabase
      .from('event_actions')
      .upsert({
        event_id: id,
        action_type: 'completed',
        auto_completed: auto
      }, {
        onConflict: 'event_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error completing event:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error in complete endpoint:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/events/:id/dismiss
// Dismiss event (hide from view)
router.post('/:id/dismiss', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('event_actions')
      .upsert({
        event_id: id,
        action_type: 'dismissed'
      }, {
        onConflict: 'event_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error dismissing event:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error in dismiss endpoint:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/events/:id/action
// Undo action (remove from event_actions)
router.delete('/:id/action', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('event_actions')
      .delete()
      .eq('event_id', id);

    if (error) {
      console.error('Error undoing event action:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in undo endpoint:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/events/:id
// Update event overrides (title, project, context)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, project_id, context } = req.body;

  try {
    const updates = {
      event_id: id,
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updates.title = title;
    if (project_id !== undefined) updates.project_id = project_id;
    if (context !== undefined) updates.context = context;

    const { data, error } = await supabase
      .from('event_overrides')
      .upsert(updates, {
        onConflict: 'event_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating event overrides:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error in update endpoint:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events/actions
// Get all actions for given event IDs
router.get('/actions', async (req, res) => {
  const { ids } = req.query; // comma-separated event IDs

  if (!ids) {
    return res.json({ success: true, data: [] });
  }

  try {
    const eventIds = ids.split(',').filter(id => id.trim());

    if (eventIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const { data, error } = await supabase
      .from('event_actions')
      .select('*')
      .in('event_id', eventIds);

    if (error) {
      console.error('Error fetching event actions:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('Error in actions endpoint:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events/overrides
// Get all overrides for given event IDs
router.get('/overrides', async (req, res) => {
  const { ids } = req.query; // comma-separated event IDs

  if (!ids) {
    return res.json({ success: true, data: [] });
  }

  try {
    const eventIds = ids.split(',').filter(id => id.trim());

    if (eventIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const { data, error } = await supabase
      .from('event_overrides')
      .select('*')
      .in('event_id', eventIds);

    if (error) {
      console.error('Error fetching event overrides:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('Error in overrides endpoint:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
