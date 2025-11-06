/**
 * Claude Podcast Script Writer
 *
 * Uses Claude Sonnet 4 to write a full conversational podcast script
 * with two hosts discussing your daily briefing.
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger').service('claude-podcast-writer');

class ClaudePodcastWriter {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Generate full podcast script with dialogue
   * @param {string} markdown - The briefing markdown
   * @param {string} date - Date string
   * @returns {Promise<Object>} Script with dialogue array
   */
  async writeScript(markdown, date) {
    const dateObj = new Date(date + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const prompt = `You are writing a FAST-PACED, HIGHLY ENTERTAINING podcast script inspired by "The Best One Yet" podcast style - two friends briefing Tom on his day with rapid-fire banter.

# BRIEFING CONTENT:
${markdown}

# YOUR TASK:
Write a 7-10 minute conversation between HOST 1 and HOST 2 for ${dateStr} using rapid-fire exchanges.

# CHARACTER PROFILES (DEEP PERSONALITIES):

**HOST 1 - "THE STRATEGIST"**

Background:
- Early 30s, former management consultant turned creative strategist
- Has MBA but finds it pretentious to mention
- Works in brand strategy, has seen enough corporate BS to be skeptical but not jaded

Core Personality:
- Analytical but playful - sees patterns everywhere, loves connecting dots
- Dry humor delivered with straight face
- Competitive about everything (even friendly conversations)
- Pop culture obsessed - references movies, shows, memes constantly
- Strategic thinker - always thinking 3 steps ahead
- Slightly cynical but in a fun way

Speaking Patterns:
- Uses business jargon ironically ("synergy," "leverage," "circle back")
- Interrupts with "Wait, but here's the thing..."
- Says "Honestly?" and "Real talk" when being serious
- Questions everything: "Why though?" "But is it though?"
- Drops references to obscure podcasts/books

Quirks & Opinions:
- Thinks most meetings could be emails
- Strong opinions about coffee (pour-over only)
- Secretly loves reality TV but calls it "anthropological research"
- Weirdly competitive about time management
- Believes in systems and frameworks
- Low-key obsessed with productivity hacks

Relationship with Host 2:
- Best friends, constantly roasting each other
- Respects Host 2's creative chaos while mocking it
- Goes to Host 2 for life advice despite seeming more "together"
- Sometimes finishes each other's sentences

**HOST 2 - "THE MAKER"**

Background:
- Late 20s/Early 30s, designer/developer who fell into product management
- Art school background, learned to code on the side
- Product designer at a tech startup

Core Personality:
- Enthusiastic maximalist - everything is "the best" or "absolutely wild"
- Curious to a fault - asks a million follow-up questions
- Genuinely empathetic - cares about feelings and motivations
- Creative problem solver - sees possibilities everywhere
- Scattered but brilliant - 10 browser tabs open, 5 projects going
- Optimistic - believes things can always be better

Speaking Patterns:
- Interrupts with excitement: "Wait wait wait!" "Hold on!" "No way!"
- Uses "dude," "man," "honestly" constantly
- Speaks in run-on sentences when excited
- Makes everything sound dramatic or epic
- Says "You know what's interesting?" before observations
- References hand gestures (even though this is audio)

Quirks & Opinions:
- Always has a side project (usually 80% done, then abandoned)
- Thinks constraints breed creativity
- Gets irrationally excited about good UX design
- Will derail conversations to talk about cool things just learned
- Believes in "vibes" and "energy" unironically
- Drinks too much coffee, acknowledges it's a problem

Relationship with Host 1:
- Looks up to Host 1's organizational skills
- Loves teasing Host 1 for being "too serious"
- Brings chaos to Host 1's order
- They balance each other perfectly

**DYNAMIC BETWEEN HOSTS:**

Natural Patterns:
- Playful disagreement on small things (best time for coffee, whether task is urgent)
- Building on each other's ideas - one starts, other takes it somewhere unexpected
- Shared references and inside jokes
- Mutual roasting as a love language
- Genuine curiosity - they ask each other questions, not just talk about Tom
- They have OPINIONS about Tom's day, not just report facts

Example Interactions:
- On busy calendar: "Six meetings? That's not a day, that's a hostage situation"
- On simple task: "This is adorable. 'Send iPhone to Dad.' We're helping Tom be a good son" / "It's a task. You're being weird" / "You're being weird. Let me have this"
- On weather: "Perfect human temperature. Not too hot, not too cold" / "That's not a thing" / "58-62 degrees is the Goldilocks zone" / "You just made that up" / "Prove me wrong"

They Should:
- Have opinions and reactions, not just state facts
- Disagree playfully on small things
- Show their expertise (Host 1 on strategy, Host 2 on creative/people stuff)
- Reference each other's quirks
- Feel like real people Tom would want to hang out with

# CRITICAL STYLE RULES (MANDATORY):

**PACE & RHYTHM (NATURAL CONVERSATION):**
- VARIED TURN LENGTH: Mix longer thoughts (20-50 words) with shorter reactions (5-15 words)
- ONE PERSON HOLDS FLOOR: Let one host speak for 2-4 sentences before the other responds
- NOT PING-PONG: Avoid constant back-and-forth - create actual conversational rhythm
- NATURAL PAUSES: Give space for ideas to land before responding
- OCCASIONAL QUICK EXCHANGES: Save rapid back-and-forth for moments of agreement or excitement
- REAL CONVERSATION FLOW: One person makes a point, the other processes and responds thoughtfully

**LANGUAGE STYLE:**
- ULTRA CASUAL: "dude," "man," "honestly," "literally," "basically"
- CONTRACTIONS ALWAYS: Never say "you are" when you can say "you're"
- RHETORICAL QUESTIONS: "Right?" "You know what I mean?" "Are you kidding?"
- INTERNET SPEAK: Use brand names as verbs, meme language
- DIRECT ADDRESS: Say "you" and "Tom" constantly

**BANTER PATTERNS:**
- One host makes an observation, the other builds on it
- Playful disagreement that develops over multiple exchanges
- Let jokes breathe - don't rush to the next thing
- Stories and tangents (2-3 sentences) are GOOD
- Occasional rapid agreement ("Right" "Exactly" "Yeah")
- Meta commentary about the day itself
- Natural thinking pauses: "Let me think..." "You know what's interesting..."
- Use filler words naturally: "um," "like," "you know"
- Let one person finish their thought before responding

**CONVERSATION FLOW:**

Opening (8-10 exchanges):
HOST 2: "Okay okay okay, Tom, it's [DAY]"
HOST 1: "And honestly? Might be the best briefing yet"
HOST 2: "You say that every day"
HOST 1: "Because it's true every day. Anyway—"
HOST 2: "Weather check: [WEATHER]"
HOST 1: "Which means [JACKET/NO JACKET JOKE]"
HOST 2: "Here's what we're looking at today..."
[Continue with fast preview]

Calendar (20-30 exchanges):
HOST 1: "First meeting: [TIME] - [NAME]"
HOST 2: "Wait, the [FUNNY DESCRIPTION]?"
HOST 1: "Yep. With [ATTENDEES]"
HOST 2: "So basically [JOKE ABOUT MEETING]"
HOST 1: "Exactly. Here's the thing though..."
HOST 2: "You need to prep [THING]?"
HOST 1: "Nah, just [QUICK TIP]"
HOST 2: "Classic. Next meeting?"
[Repeat for each meeting - keep it tight]

Tasks (12-18 exchanges):
HOST 2: "Tasks. What's actually urgent?"
HOST 1: "Only one thing: [TASK]"
HOST 2: "That's it?"
HOST 1: "Well, there's also [OTHER TASKS]"
HOST 2: "How long does [TASK] take?"
HOST 1: "Like 15 minutes, max"
HOST 2: "Boom. Do it between meetings"
HOST 1: "Exactly"

Projects (15-25 exchanges):
HOST 1: "[PROJECT] just got interesting"
HOST 2: "Define interesting"
HOST 1: "[UPDATE]"
HOST 2: "No way"
HOST 1: "Way"
HOST 2: "So this is basically [ANALOGY]"
HOST 1: "Ha! Yeah. And here's the thing..."
[Continue with rapid back-and-forth]

Time Management (8-12 exchanges):
HOST 2: "Looking at the whole day, what's the vibe?"
HOST 1: "Honestly? [METAPHOR] kind of day"
HOST 2: "Meaning?"
HOST 1: "You've got [FREE TIME] - that's your golden hour"
HOST 2: "Protect that time, Tom"
HOST 1: "Like it's the last slice of pizza"

Closing (6-8 exchanges):
HOST 1: "Bottom line: [KEY TAKEAWAY]"
HOST 2: "Weather's [WEATHER], calendar's [PACKED/LIGHT]"
HOST 1: "One more thing though"
HOST 2: "Oh here we go"
HOST 1: "[FINAL TIP]"
HOST 2: "Alright Tom, let's do this"
HOST 1: "Lock in"

# SPECIFIC TECHNIQUES TO USE:

**NATURAL CONVERSATION PATTERNS:**

One person develops an idea:
HOST 1: "So looking at your calendar today, you've got this interesting mix of family stuff and work tasks. The soccer tournament is obviously the main event, but there's also that iPhone you need to ship to your dad, and honestly that should probably happen sooner rather than later since it's due tomorrow."
HOST 2: "Right, and that's like a 15-minute thing max. Box it up, print a label, done."
HOST 1: "Exactly. So do that first thing this morning, get it off your plate."

Storytelling moment:
HOST 2: "You know what's funny about youth soccer tournaments? The parents always get way more stressed than the kids. Like, the kids are just happy to be playing, meanwhile the adults are over here planning logistics like it's D-Day."
HOST 1: "Ha! Accurate. But in Tom's case, he's got two potential games in different towns, so..."
HOST 2: "Fair, that's actually legit planning."

Quick agreement exchanges:
HOST 1: "Weather's not terrible"
HOST 2: "Could be way worse"
HOST 1: "Light rain beats heavy rain"
HOST 2: "Absolutely"

**BEING CURIOUS & INTERESTING:**
- Ask "why" questions: "Why is that meeting an hour long?" "Why three sessions with the same people?"
- Notice patterns: "Wait, all your urgent tasks are admin stuff. When did you become an admin assistant?"
- Make connections: "This reminds me of..." or "That's like when..."
- Challenge assumptions: "Do you actually need to do that today?"
- Get philosophical: "What even is productivity, you know?"
- Share mini-tangents about their own lives/work
- Debate trivial things passionately (best meeting length, ideal calendar density)
- Notice weird/funny details: "SC Vistula Garfield is the most specific team name I've ever heard"

**SHOWING PERSONALITY THROUGH OPINIONS:**
- HOST 1 might critique Tom's calendar strategy: "This is inefficient but I respect the chaos"
- HOST 2 might get excited about mundane tasks: "Sending an iPhone to your dad is wholesome content"
- They debate task priority: "That's urgent?" / "Everything's urgent if you wait long enough"
- They question Tom's choices: "Why schedule that for 5pm?" / "That's prime focus time you're wasting"
- They react to project names: "Retirement Community App? Tell me more!" / "That's either genius or insane"
- They have hot takes: "Soccer on Sunday morning is the best use of time" / "Hard disagree, sleep is better"

**CUTTING EACH OTHER OFF (NATURALLY):**
- When genuinely excited: "Wait wait—" / "Hold on, let me—"
- When disagreeing: "Yeah but—" / "Okay but—"
- When adding important info: "Oh! And also—"
- When making a joke: "You know what this is—" / "It's like—"
- DO NOT cut off mid-word, but DO interrupt mid-sentence when natural
- The interrupted person can acknowledge: "Okay fine" / "Go ahead" / "Let me finish!"

**Excitement Building:**
"And then... and THEN..."
"Get this..."
"Plot twist..."
"Here's the crazy part..."

**Reactions (Must React to Each Other's Lines):**
"No way"
"Way"
"For real?"
"Are you kidding me?"
"That's wild"
"Classic"
"Love it"
"Obsessed"
"Wait, what?"
"Hold on"
"Okay okay"
"Yeah yeah yeah"
"Mmhmm"
"Right right"
"Oh for sure"
"Totally"
"I know, right?"

**Transitions:**
"Moving on..."
"Next up..."
"Okay, so..."
"Real talk..."
"Here's the thing..."

**Emphasis:**
"Literally"
"Honestly"
"Basically"
"Actually"
"Totally"

# OUTPUT FORMAT:
Return ONLY a JSON array. Each dialogue must have:
- "host": 1 or 2
- "text": 10-20 words MAX (1-2 short sentences)

Example of CORRECT pacing with NATURAL CONVERSATIONAL RHYTHM:
[
  {"host": 2, "text": "Okay Tom, it's Sunday October 12th, and honestly looking at your day, this might actually be one of the better setups we've seen in a while."},
  {"host": 1, "text": "Yeah? What makes you say that?"},
  {"host": 2, "text": "Well, you've got basically four calendar items, but three of them are soccer-related for Kasper's tournament. So it's not like four separate work meetings scattered throughout the day."},
  {"host": 1, "text": "Oh that's way more manageable. And the fourth thing?"},
  {"host": 2, "text": "Lexie's visiting for 48 hours starting tonight at 8pm. So you've got the whole tournament day, then family time kicks in after."},
  {"host": 1, "text": "Nice. That's actually a pretty solid Sunday. What about tasks?"},
  {"host": 2, "text": "Only one urgent thing, which is shipping that old iPhone to your dad. Due tomorrow, but it's literally a 15-minute task."},
  {"host": 1, "text": "Do that first thing this morning, get it done, then you're free for soccer."},
  {"host": 2, "text": "Exactly my thinking."}
]

NOTICE:
- Varied lengths (20-50 words for main points, 5-15 for reactions)
- One person holds the floor for a complete thought
- Natural back-and-forth rhythm, not ping-pong
- Space for ideas to land before responding

**CRITICAL REQUIREMENTS:**
- 40-60 dialogue exchanges total (quality over quantity)
- VARIED exchange length:
  - Main points: 20-50 words (2-4 sentences)
  - Reactions: 5-15 words (1-2 sentences)
  - Quick agreements: 2-5 words
- Let one person speak for 2-4 sentences before switching
- Think REAL PODCAST CONVERSATION, not Abbott & Costello routine
- NO constant ping-pong - create natural rhythm and flow
- Occasionally one host can tell a brief story or make an observation (3-4 sentences)
- Use filler words naturally to show thinking ("um," "like," "you know")
- Return ONLY valid JSON, no markdown formatting

**MOST IMPORTANT:**
- This should sound like TWO FRIENDS HAVING A REAL CONVERSATION
- NOT a scripted back-and-forth where each person races to hit their line
- Let ideas breathe - don't rush from point to point
- Vary the rhythm: sometimes quick exchanges, sometimes longer thoughts
- Quality conversation > quantity of exchanges

Write the full script now:`;

    logger.info('   🤖 Asking Claude to write podcast script...');

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      temperature: 0.8, // Higher for more creative dialogue
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const scriptText = response.content[0].text;

    // Parse JSON from response
    let dialogue;
    try {
      // Remove any markdown code blocks if present
      const cleanedText = scriptText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      dialogue = JSON.parse(cleanedText);
      logger.info('✅ Script generated:  dialogue exchanges', { length: dialogue.length });
    } catch (error) {
      logger.error('   ❌ Failed to parse dialogue JSON:', { arg0: error.message });
      logger.error('   Raw response:');
      throw new Error('Failed to parse Claude script response');
    }

    return {
      date,
      dialogue,
      estimatedDuration: Math.round(dialogue.length * 5) // ~5 seconds per exchange (faster pace)
    };
  }
}

module.exports = new ClaudePodcastWriter();
