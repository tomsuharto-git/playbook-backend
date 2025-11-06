# Three-Entity Architecture Implementation Plan
**Version:** 1.0
**Created:** October 28, 2025
**Author:** Claude (Opus 4.1)
**Vision:** Transform the AI Task Manager into a unified project intelligence system

---

## Executive Summary

This plan restructures the AI Task Manager around a **clean three-entity architecture** where Projects are the foundation and Tasks, Events, and Narratives are discrete, first-class entities. A placeholder for News (4th entity) will be created for future expansion.

**Core Principle:** `Projects → [Tasks | Events | Narratives | (News)]`

**Key Benefits:**
- Eliminates 50% false positive rate through unified processing
- Fixes narrative system (currently ~80% broken)
- Creates consistent data model for all entity types
- Enables rich podcast content generation
- Prepares for News entity without implementation complexity

---

## Part 1: Architecture Design

### Current vs. Target Architecture

**CURRENT (Fragmented):**
```
Projects Table
├── tasks (separate table) ✅ Good
├── events (in daily_briefs JSONB) ❌ Buried
├── narratives (in projects.narrative JSONB) ❌ Trapped
└── news (doesn't exist) ❌
```

**TARGET (Unified):**
```
                    PROJECTS (Foundation)
                           │
        ┌──────────────────┼──────────────────┬──────────────────┐
        ▼                  ▼                  ▼                  ▼
     TASKS             EVENTS            NARRATIVES          [NEWS]
  (discrete table)  (discrete table)  (discrete table)   (placeholder)
```

### Database Schema

```sql
-- 1. PROJECTS (existing, enhanced)
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT[],
  status TEXT,
  color TEXT,
  -- Remove narrative JSONB field (moving to separate table)
  -- Keep other fields
);

-- 2. TASKS (existing, already good)
-- No changes needed

-- 3. EVENTS (NEW - extracted from daily_briefs)
CREATE TABLE events (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),

  -- Core fields
  title TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,

  -- Event details
  location TEXT,
  attendees JSONB, -- [{name, email, responseStatus}]
  description TEXT,
  calendar_source TEXT, -- 'google', 'outlook'
  calendar_id TEXT, -- Original calendar event ID

  -- AI-generated content
  briefing TEXT,
  briefing_type TEXT, -- 'work_project', 'work_general', 'life'

  -- Categorization
  category TEXT CHECK (category IN ('work', 'life')),
  significance_score DECIMAL, -- 0-1

  -- Relationships
  related_tasks UUID[], -- Links to tasks table
  related_narratives UUID[], -- Links to narratives table

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicates
  UNIQUE(calendar_id, calendar_source)
);

-- 4. NARRATIVES (NEW - extracted from projects.narrative)
CREATE TABLE narratives (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),

  -- Core content
  date DATE NOT NULL,
  headline TEXT NOT NULL,
  bullets TEXT[], -- Array of bullet points

  -- Source tracking
  source TEXT CHECK (source IN ('meeting', 'email', 'note', 'manual', 'event')),
  source_file TEXT, -- Path to source file if applicable
  source_id TEXT, -- Email ID, event ID, etc.

  -- Quality metrics
  significance_score DECIMAL DEFAULT 0.5, -- 0-1
  auto_generated BOOLEAN DEFAULT true,

  -- Rich metadata
  participants TEXT[], -- People involved
  keywords TEXT[], -- For searching

  -- Relationships
  related_tasks UUID[],
  related_events UUID[],
  parent_narrative UUID, -- For narrative threads

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. NEWS (PLACEHOLDER - not implemented yet)
CREATE TABLE news (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),

  -- Core fields
  headline TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  source_name TEXT, -- 'TechCrunch', 'AdAge', etc.

  -- Metadata
  published_date TIMESTAMP,
  relevance_score DECIMAL, -- 0-1
  keywords TEXT[],

  -- Relationships
  related_tasks UUID[],
  related_events UUID[],
  related_narratives UUID[],

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  -- Placeholder flag
  is_active BOOLEAN DEFAULT false -- Will be false until News is implemented
);

-- Create indexes for performance
CREATE INDEX idx_events_project_date ON events(project_id, start_time DESC);
CREATE INDEX idx_narratives_project_date ON narratives(project_id, date DESC);
CREATE INDEX idx_narratives_significance ON narratives(significance_score DESC);
CREATE INDEX idx_news_project_relevance ON news(project_id, relevance_score DESC);

-- Full-text search indexes
CREATE INDEX idx_narratives_search ON narratives USING gin(to_tsvector('english', headline || ' ' || array_to_string(bullets, ' ')));
CREATE INDEX idx_events_search ON events USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));
```

---

## Part 2: Central Processor Architecture

### Unified Processing Pipeline

```javascript
// backend/services/central-processor.js

class CentralProcessor {
  constructor() {
    this.projectDetector = new ProjectDetector();
    this.duplicateDetector = new DuplicateDetector();
    this.significanceScorer = new SignificanceScorer();
  }

  async process(input) {
    // Step 1: Identify source type
    const sourceType = this.identifySource(input);

    // Step 2: Extract content
    const content = await this.extractContent(input, sourceType);

    // Step 3: Detect project (with fallbacks)
    const project = await this.detectProject(content);

    // Step 4: Analyze and classify
    const entities = await this.analyzeContent(content, project);

    // Step 5: Process each entity
    const results = {
      tasks: [],
      events: [],
      narratives: [],
      news: [] // Ready but not used yet
    };

    for (const entity of entities) {
      // Check for duplicates
      if (await this.isDuplicate(entity)) continue;

      // Score significance
      entity.significance = await this.scoreSignificance(entity);

      // Skip low-significance items (except tasks)
      if (entity.type !== 'task' && entity.significance < 0.5) continue;

      // Create entity
      const created = await this.createEntity(entity);
      results[entity.type + 's'].push(created);

      // Create relationships
      await this.linkEntities(created, entities);
    }

    return results;
  }

  async detectProject(content) {
    // Multi-strategy project detection
    const strategies = [
      () => this.detectByPath(content.filepath),
      () => this.detectByKeywords(content.text),
      () => this.detectByAI(content.text),
      () => this.detectByFuzzyMatch(content.text),
      () => this.getFallbackProject(content)
    ];

    for (const strategy of strategies) {
      const project = await strategy();
      if (project) return project;
    }

    return null; // Allow null projects (orphan entities)
  }

  async analyzeContent(content, project) {
    // AI analysis returns multiple entity types
    const analysis = await this.aiAnalyzer.analyze(content, project);

    const entities = [];

    // Extract tasks
    if (analysis.tasks) {
      for (const task of analysis.tasks) {
        entities.push({
          type: 'task',
          project_id: project?.id,
          ...task,
          source: content.source,
          detected_from: content.filepath || content.id
        });
      }
    }

    // Extract events
    if (analysis.events) {
      for (const event of analysis.events) {
        entities.push({
          type: 'event',
          project_id: project?.id,
          ...event,
          calendar_source: content.source
        });
      }
    }

    // Extract narratives
    if (analysis.narrative) {
      entities.push({
        type: 'narrative',
        project_id: project?.id,
        ...analysis.narrative,
        source: content.source,
        source_file: content.filepath,
        source_id: content.id
      });
    }

    // News extraction (placeholder - not active)
    // if (analysis.news) { ... }

    return entities;
  }
}
```

### Input Source Handlers

```javascript
// backend/sources/source-handlers.js

// Email Handler (Gmail + Outlook unified)
class EmailHandler {
  async process(email) {
    // Check if already processed
    if (await this.isProcessed(email.id)) {
      return { skipped: true };
    }

    // Extract content
    const content = {
      source: email.source, // 'gmail' or 'outlook'
      id: email.id,
      text: email.subject + '\n' + email.body,
      from: email.from,
      date: email.received_date,
      attachments: email.attachments
    };

    // Process through central processor
    const results = await centralProcessor.process(content);

    // Mark as processed
    await this.markProcessed(email.id, results);

    // Create Obsidian note (optional)
    if (config.createEmailNotes) {
      await this.createObsidianNote(email, results);
    }

    return results;
  }
}

// Vault Handler (Obsidian files)
class VaultHandler {
  async process(filepath, content) {
    // Age check (24-hour recency)
    if (await this.isTooOld(filepath)) {
      return { skipped: true, reason: 'file_too_old' };
    }

    // Smart filtering (less aggressive)
    if (this.shouldSkip(filepath, content)) {
      return { skipped: true, reason: 'filtered' };
    }

    // Extract content
    const extractedContent = {
      source: 'vault',
      filepath: filepath,
      text: content,
      date: await this.extractDate(filepath, content)
    };

    // Process through central processor
    return await centralProcessor.process(extractedContent);
  }

  shouldSkip(filepath, content) {
    // Whitelist valuable patterns
    const valuablePatterns = [
      'milestone', 'completion', 'decision', 'deployment',
      'meeting', 'strategy', 'review', 'update'
    ];

    if (valuablePatterns.some(p => filepath.toLowerCase().includes(p))) {
      return false; // Don't skip
    }

    // Skip pure technical files
    if (this.isPureTechnical(content)) {
      return true;
    }

    // Skip conversational prompts
    if (this.hasConversationalPrompts(content)) {
      return true;
    }

    return false;
  }
}

// Calendar Handler
class CalendarHandler {
  async process(events) {
    const results = [];

    for (const event of events) {
      // Deduplicate calendar events
      if (await this.isDuplicate(event)) continue;

      // Extract content
      const content = {
        source: 'calendar',
        id: event.id,
        text: event.summary + '\n' + event.description,
        attendees: event.attendees,
        date: event.start.dateTime
      };

      // Process through central processor
      const processed = await centralProcessor.process(content);
      results.push(processed);
    }

    return results;
  }
}
```

---

## Part 3: Implementation Phases

### Phase 1: Critical Fixes + Foundation (Week 1)
**Time:** 8 hours
**Goal:** Fix immediate issues while preparing for new architecture

#### 1.1 Fix False Positive Issues (2 hours)
- Add 24-hour recency filter to vault-watcher ✅
- Implement due date parsing ✅
- Fix delegation detection ✅
- Enhance Claude Code filtering ✅

#### 1.2 Fix Project Detection (2 hours)
- Add fuzzy matching for project names
- Implement AI fallback for unmatched projects
- Allow orphan entities (null project_id)
- Fix Claude Code subfolder detection

#### 1.3 Create Database Migration (2 hours)
- Create new events table
- Create new narratives table
- Create news placeholder table
- Add necessary indexes

#### 1.4 Build Central Processor Core (2 hours)
- Create central-processor.js
- Implement project detection pipeline
- Add significance scoring
- Create entity factory methods

### Phase 2: Entity Migration (Week 2)
**Time:** 10 hours
**Goal:** Migrate existing data to new structure

#### 2.1 Extract Events from daily_briefs (3 hours)
- Parse calendar_events JSONB
- Create event records
- Link to projects
- Preserve briefings

#### 2.2 Extract Narratives from projects (3 hours)
- Parse narrative JSONB arrays
- Create narrative records
- Link to projects
- Preserve significance

#### 2.3 Unify Email Processing (2 hours)
- Merge Gmail and Outlook handlers
- Implement consistent processing
- Add narrative creation for both
- Fix deduplication

#### 2.4 Update Vault Watcher (2 hours)
- Use central processor
- Reduce filtering aggressiveness
- Always create narratives
- Better project detection

### Phase 3: Frontend Integration (Week 3)
**Time:** 8 hours
**Goal:** Update UI to work with new architecture

#### 3.1 Create Unified Entity Components (3 hours)
```typescript
// components/EntityCard.tsx
interface EntityCardProps {
  type: 'task' | 'event' | 'narrative' | 'news';
  entity: any;
  projectId: string;
}

export function EntityCard({ type, entity, projectId }: EntityCardProps) {
  // Render based on type
  switch(type) {
    case 'task': return <TaskCard {...entity} />;
    case 'event': return <EventCard {...entity} />;
    case 'narrative': return <NarrativeCard {...entity} />;
    case 'news': return <NewsCard {...entity} />; // Placeholder
  }
}
```

#### 3.2 Update Project Dashboard (2 hours)
- Show all three entity types
- Add narrative timeline
- Display upcoming events
- Show task progress

#### 3.3 Create Narrative UI (3 hours)
- Timeline view
- Search and filter
- Manual entry form
- Edit capabilities

### Phase 4: Relationships & Intelligence (Week 4)
**Time:** 6 hours
**Goal:** Connect entities and add intelligence

#### 4.1 Implement Entity Relationships (2 hours)
- Link events to tasks they generate
- Connect narratives to source events
- Associate tasks with narratives
- Build relationship graph

#### 4.2 Add Cross-Entity Search (2 hours)
```sql
-- Unified search across all entities
CREATE VIEW project_activity AS
SELECT project_id, 'task' as type, title as content, created_at
FROM tasks
UNION ALL
SELECT project_id, 'event' as type, title as content, start_time
FROM events
UNION ALL
SELECT project_id, 'narrative' as type, headline as content, created_at
FROM narratives;
```

#### 4.3 Enhance Podcast Generation (2 hours)
```javascript
async function generatePodcastContent() {
  const today = new Date();

  // Pull from all three entities
  const [tasks, events, narratives] = await Promise.all([
    getTasksForPodcast(today),
    getEventsForPodcast(today),
    getNarrativesForPodcast(today, 5) // Last 5
  ]);

  // Generate rich podcast script
  return {
    intro: generateIntro(today),
    taskSection: generateTaskNarrative(tasks),
    eventSection: generateEventBriefings(events),
    narrativeSection: generateContextSummary(narratives),
    // newsSection: generateNewsUpdate(news), // Future
    outro: generateOutro()
  };
}
```

### Phase 5: Optimization & Polish (Month 2)
**Time:** 8 hours
**Goal:** Optimize performance and user experience

#### 5.1 Performance Optimization (3 hours)
- Add caching layers
- Optimize queries with proper indexes
- Batch entity creation
- Implement connection pooling

#### 5.2 Add Analytics Dashboard (3 hours)
```javascript
// Analytics queries
const analytics = {
  // Entity creation over time
  creationTrends: `
    SELECT date_trunc('day', created_at) as day,
           type, COUNT(*) as count
    FROM project_activity
    GROUP BY day, type
  `,

  // Project health scores
  projectHealth: `
    SELECT p.id, p.name,
           COUNT(DISTINCT t.id) as task_count,
           COUNT(DISTINCT e.id) as event_count,
           COUNT(DISTINCT n.id) as narrative_count,
           AVG(n.significance_score) as avg_significance
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN events e ON e.project_id = p.id
    LEFT JOIN narratives n ON n.project_id = p.id
    GROUP BY p.id, p.name
  `
};
```

#### 5.3 Implement News Scanning (2 hours) - OPTIONAL
- Design RSS feed ingestion
- Create relevance scoring
- Link to projects
- Test with limited sources

---

## Part 4: Migration Strategy

### Data Migration Plan

```javascript
// backend/scripts/migrate-to-three-entity.js

async function migrateToThreeEntityArchitecture() {
  console.log('Starting Three-Entity Architecture Migration...');

  // Step 1: Create new tables
  await createNewTables();

  // Step 2: Migrate events from daily_briefs
  const eventCount = await migrateEvents();
  console.log(`✅ Migrated ${eventCount} events`);

  // Step 3: Migrate narratives from projects
  const narrativeCount = await migrateNarratives();
  console.log(`✅ Migrated ${narrativeCount} narratives`);

  // Step 4: Create relationships
  await createEntityRelationships();

  // Step 5: Verify migration
  await verifyMigration();

  console.log('✅ Migration complete!');
}

async function migrateEvents() {
  const { data: briefs } = await supabase
    .from('daily_briefs')
    .select('*');

  let count = 0;
  for (const brief of briefs) {
    const events = brief.calendar_events || [];

    for (const event of events) {
      // Detect project for this event
      const project = await detectProject({
        summary: event.summary,
        description: event.description
      });

      await supabase.from('events').insert({
        title: event.summary,
        start_time: event.start?.dateTime,
        end_time: event.end?.dateTime,
        project_id: project?.id,
        attendees: event.attendees,
        location: event.location,
        briefing: event.briefing,
        category: event.category,
        calendar_source: event.calendar_source,
        calendar_id: event.id
      });

      count++;
    }
  }

  return count;
}

async function migrateNarratives() {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, narrative');

  let count = 0;
  for (const project of projects) {
    const narratives = project.narrative || [];

    for (const narrative of narratives) {
      await supabase.from('narratives').insert({
        project_id: project.id,
        date: narrative.date,
        headline: narrative.headline,
        bullets: narrative.bullets,
        source: narrative.source,
        significance_score: 0.7, // Default
        auto_generated: true
      });

      count++;
    }
  }

  return count;
}
```

### Rollback Plan

```sql
-- Rollback script if needed
-- backend/scripts/rollback-migration.sql

-- Restore narratives to projects table
UPDATE projects p
SET narrative = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', n.date,
      'headline', n.headline,
      'bullets', n.bullets,
      'source', n.source
    ) ORDER BY n.date DESC
  )
  FROM narratives n
  WHERE n.project_id = p.id
);

-- Restore events to daily_briefs
-- (More complex, would need script)

-- Drop new tables
DROP TABLE IF EXISTS narratives CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS news CASCADE;
```

---

## Part 5: Testing Strategy

### Unit Tests

```javascript
// backend/tests/central-processor.test.js

describe('CentralProcessor', () => {
  describe('Project Detection', () => {
    test('detects project by exact name match', async () => {
      const content = { text: 'Meeting about ITA Airways project' };
      const project = await processor.detectProject(content);
      expect(project.name).toBe('ITA Airways');
    });

    test('detects project by fuzzy match', async () => {
      const content = { text: 'Retirement Communities research' };
      const project = await processor.detectProject(content);
      expect(project.name).toBe('SRCE Retirement Evaluator');
    });

    test('falls back to AI detection', async () => {
      const content = { text: 'Discussion about Italian airline campaign' };
      const project = await processor.detectProject(content);
      expect(project.name).toBe('ITA Airways');
    });
  });

  describe('Entity Creation', () => {
    test('creates multiple entity types from one input', async () => {
      const input = mockMeetingNote();
      const results = await processor.process(input);

      expect(results.tasks).toHaveLength(2);
      expect(results.narratives).toHaveLength(1);
      expect(results.events).toHaveLength(0);
    });

    test('filters low-significance narratives', async () => {
      const input = mockRoutineEmail();
      const results = await processor.process(input);

      expect(results.narratives).toHaveLength(0); // Below threshold
      expect(results.tasks).toHaveLength(1); // Tasks always created
    });
  });
});
```

### Integration Tests

```javascript
// backend/tests/integration/three-entity-flow.test.js

describe('Three Entity Flow', () => {
  test('Email creates task + narrative', async () => {
    const email = mockImportantEmail();

    const handler = new EmailHandler();
    const results = await handler.process(email);

    // Verify task created
    const task = await supabase
      .from('tasks')
      .select('*')
      .eq('detected_from', email.id)
      .single();
    expect(task.data).toBeTruthy();

    // Verify narrative created
    const narrative = await supabase
      .from('narratives')
      .select('*')
      .eq('source_id', email.id)
      .single();
    expect(narrative.data).toBeTruthy();

    // Verify they're linked to same project
    expect(task.data.project_id).toBe(narrative.data.project_id);
  });

  test('Meeting note creates all three entity types', async () => {
    const filepath = '/Notion/WORK/Clients/ITA/meeting-2025-10-28.md';
    const content = mockMeetingWithCalendarEvent();

    const handler = new VaultHandler();
    const results = await handler.process(filepath, content);

    expect(results.tasks).toHaveLength(2);
    expect(results.events).toHaveLength(1);
    expect(results.narratives).toHaveLength(1);
  });
});
```

---

## Part 6: Success Metrics

### Week 1 Success Criteria
- [ ] False positive rate: 50% → 30%
- [ ] All three new tables created
- [ ] Central processor handling 1+ source
- [ ] Project detection success rate > 90%

### Week 2 Success Criteria
- [ ] All narratives migrated to new table
- [ ] All events extracted from daily_briefs
- [ ] Email processing unified
- [ ] Vault watcher using central processor

### Week 3 Success Criteria
- [ ] Frontend showing all three entities
- [ ] Narrative timeline visible
- [ ] Manual narrative entry working
- [ ] Project dashboard updated

### Month 1 Complete Success
- [ ] False positive rate < 20%
- [ ] 100% of inputs processed through central processor
- [ ] All three entities fully operational
- [ ] Podcast pulling from all entities
- [ ] News table ready (not active)

### Long-term Success (Month 2-3)
- [ ] Analytics dashboard operational
- [ ] Entity relationships tracked
- [ ] Performance < 2s per operation
- [ ] User satisfaction > 90%
- [ ] News scanning tested (optional)

---

## Part 7: Risk Mitigation

### Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Data migration fails | Low | High | Comprehensive backup, rollback script ready |
| Performance degrades | Medium | Medium | Indexes designed, caching planned |
| Frontend breaks | Low | Medium | Incremental updates, feature flags |
| Project detection still fails | Medium | High | Multiple fallback strategies, AI backup |
| Users confused by changes | Medium | Low | Clear documentation, gradual rollout |

### Contingency Plans

1. **If migration fails:**
   - Immediate rollback using prepared script
   - Investigate issue in development environment
   - Re-attempt with fixes

2. **If performance is poor:**
   - Add database indexes incrementally
   - Implement Redis caching layer
   - Optimize queries with EXPLAIN ANALYZE

3. **If project detection still fails:**
   - Allow manual project assignment UI
   - Create "Inbox" project for unknowns
   - Implement learning from corrections

---

## Appendix A: Quick Start Commands

```bash
# Run migration
npm run migrate:three-entity

# Test central processor
npm test -- central-processor

# Verify migration
npm run verify:migration

# Rollback if needed
npm run migrate:rollback

# Start with new architecture
npm run dev
```

## Appendix B: Configuration Changes

```javascript
// backend/config/entity-config.js

module.exports = {
  entities: {
    tasks: {
      enabled: true,
      significanceThreshold: 0.0, // Always create tasks
      deduplicationWindow: 7 * 24 * 60 * 60 * 1000 // 7 days
    },
    events: {
      enabled: true,
      significanceThreshold: 0.3,
      briefingGeneration: true
    },
    narratives: {
      enabled: true,
      significanceThreshold: 0.5,
      maxBullets: 5,
      maxPerProject: 150
    },
    news: {
      enabled: false, // Not yet implemented
      significanceThreshold: 0.7,
      sources: [] // Will add RSS feeds, APIs later
    }
  },

  centralProcessor: {
    maxRetries: 3,
    timeoutMs: 10000,
    batchSize: 10
  },

  projectDetection: {
    strategies: ['path', 'keywords', 'fuzzy', 'ai', 'fallback'],
    confidenceThreshold: 0.6
  }
};
```

---

## Document Complete

This implementation plan provides a clear path from the current fragmented system to a clean, three-entity architecture with Projects as the foundation. The plan addresses all identified issues while building toward your vision of a comprehensive project intelligence system.

**Next Steps:**
1. Review and approve plan
2. Begin Phase 1 implementation
3. Test incrementally
4. Iterate based on results

Ready to transform your AI Task Manager into a unified intelligence system.