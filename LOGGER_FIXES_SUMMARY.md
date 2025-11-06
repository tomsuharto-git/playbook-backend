# Logger Malformed Calls - Fix Summary

## Problem
The Winston migration created invalid JavaScript syntax in logger calls with malformed object keys:

```javascript
// INVALID - object keys cannot be function calls or expressions
logger.info('Time window:  to now', { toISOString(): sevenDaysAgo.toISOString() });
logger.debug('Found  existing tasks', { length || 0: existingTasks?.length || 0 });
logger.info('Duration: ms', { now() - startTime: Date.now() - startTime });
```

## Solution Pattern
Extract values to variables first, then use them in metadata objects:

```javascript
// VALID - extract value first
const timeWindow = sevenDaysAgo.toISOString();
logger.info('Time window to now', { timeWindow: timeWindow });

const taskCount = existingTasks?.length || 0;
logger.debug('Found existing tasks in time window', { taskCount: taskCount });

const duration = Date.now() - startTime;
logger.info('Duration ms', { duration: duration });
```

## Files Fixed

### Priority Files (Main Application)
1. **services/data-processor.js** - 15 fixes
   - Time window calculations
   - Task counts
   - Duration measurements
   - Similarity percentages
   - Email processing counts

2. **services/podcast-generator.js** - 5 fixes
   - Dialogue counts
   - Duration calculations (minutes/seconds)
   - Event counts
   - Audio segment counts

3. **jobs/generate-briefings.js** - 12 fixes
   - Event source counts (Google + Outlook)
   - Categorization counts (Work/Life)
   - Project enrichment metadata
   - Event validation results
   - Failure rate calculations
   - Merge statistics

4. **routes/calendar.js** - 7 fixes
   - Date/time displays
   - Event ID counts
   - Override counts
   - Duplicate cleanup counts
   - Grand total calculations

### Script Files (Partial Fixes)
5. **scripts/cleanup/auto-cleanup-duplicates.js** - 1 fix
   - Created timestamp formatting

## Verification
All priority files pass Node.js syntax checks:
```bash
node -c services/data-processor.js       ✅
node -c services/podcast-generator.js    ✅
node -c jobs/generate-briefings.js       ✅
node -c routes/calendar.js               ✅
```

## Remaining Work
Additional script files in `/scripts/cleanup/` and `/scripts/diagnostics/` have similar issues but were not prioritized as they are utility scripts, not production code.

## Pattern Reference
### Common Patterns Fixed

**Before:**
```javascript
logger.info('Text: %', { toFixed(1): value.toFixed(1) });
logger.info('Items:', { length: array.length });
logger.info('Time: ms', { now() - start: Date.now() - start });
logger.info('Name:', { toLowerCase(): name.toLowerCase() });
```

**After:**
```javascript
const percent = value.toFixed(1);
logger.info('Text %', { percent: percent });

const itemCount = array.length;
logger.info('Items:', { itemCount: itemCount });

const duration = Date.now() - start;
logger.info('Time ms', { duration: duration });

const normalizedName = name.toLowerCase();
logger.info('Name:', { normalizedName: normalizedName });
```

## Date: 2025-11-06
## Fixed by: Claude Code (Sonnet 4.5)
