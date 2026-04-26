# Scrum Poker — React Layout Refactor: Migration Plan

> **Branch**: `design/react-layout-refactor`  
> **Goal**: Migrate from vanilla-TS + drag-and-drop card dashboard to React + static three-pane layout (as shown in reference screenshot).  
> **Reference**: Screenshot provided by Goldenhunter — clean, Jira-inspired top nav + fixed sidebar + focused main area.

---

## 1. Why This Change?

| Current Pain | Target Fix |
|-------------|-----------|
| Draggable dashboard cards feel clever but create accidental layout messes | **Static, predictable layout** — everything has a fixed place |
| Sidebar + main area both have draggables, causing cognitive overload | **Left sidebar = controls/config only**, **main area = content only** |
| Mobile: floating action button hack for facilitator controls | **Responsive sidebar collapses to hamburger** naturally |
| 2900+ lines of vanilla TS in `main.ts` = unmaintainable | **Componentized React** with clear separation of concerns |
| shadcn/ui components exist but aren't used | **Wire them in** — proper design system |
| Heavy emerald green branding feels dated | **Modern, neutral palette** (blue primary, clean grays) |

---

## 2. Layout Architecture (Reference-Driven)

The reference screenshot shows a **classic three-pane app** layout. Here's the target structure:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOP NAV BAR (fixed, full-width)                                            │
│  [Logo "Scrum Poker" | Facilitator] [≡]  Planning Session  [v Sprint 24]   │
│                                  [⏱ 00:42:18] [☁ Connected to Jira] [⚙]   │
├──────────┬──────────────────────────────────────────────────────────────────┤
│          │  MAIN CONTENT AREA                                               │
│  LEFT    │  ┌──────────────────────────────────────────────────────────┐  │
│  SIDEBAR │  │  METRICS RIBBON (average, agreement %, consensus, count) │  │
│          │  └──────────────────────────────────────────────────────────┘  │
│  ────    │                                                                │
│  Session │  ┌──────────────────────────────────────────────────────────┐  │
│  Settings│  │  CURRENT ISSUE / VOTING STAGE                            │  │
│  (voting │  │  ┌────────────────────────────────────────────────────────┐│  │
│  system, │  │  │  Issue card: title, description, metadata               ││  │
│  auto-   │  │  │  [Voting cards row: 0, 1, 2, 3, 5, 8, 13, ?, ☕]     ││  │
│  reveal, │  │  └────────────────────────────────────────────────────────┘│  │
│  timer)  │  │  [Reveal Votes] [Start Timer] [Skip to Next]              │  │
│  ────    │  └──────────────────────────────────────────────────────────┘  │
│  Moderator│                                                               │
│  Controls │  ┌──────────────────────────────────────────────────────────┐  │
│  (lock,   │  │  ESTIMATION HISTORY                                      │  │
│  skip,    │  │  ┌──┬────┬──────┬─────────┬─────────┬──────────┬─────┐  │  │
│  settings)│  │  │ #│ key│ title│ estimate│ voter A │ voter B  │ …   │  │  │
│  ────    │  │  └──┴────┴──────┴─────────┴─────────┴──────────┴─────┘  │  │
│  Participants│                                                             │
│  (7 online)  │                                                           │
│              │                                                           │
└──────────┴──────────────────────────────────────────────────────────────────┘
```

### Sidebar Sections (left-to-right, always visible):

| Section | Content |
|---------|---------|
| **Session Settings** | Voting system dropdown, sequence display, auto-reveal toggle, voting timer stepper |
| **Moderator Controls** | Lock voting toggle, skip to next, add blank issue, session settings link |
| **Participants** | Avatar list with status dots, vote indicators, role badges |

### Main Content (vertical flow):

| Section | Content |
|---------|---------|
| **Metrics Ribbon** | Average story points, agreement %, most common, total voters |
| **Current Issue Card** | Jira issue details or manual ticket, voting cards (0, 1, 2, 3, 5, 8, 13, ?, ☕) |
| **Action Bar** | Reveal Votes, Start Timer, Skip to Next, Update Jira, Reset |
| **Estimation History** | Table/grid of completed estimations with per-voter breakdown |
| **Chat** | Optional collapsible bottom panel or sidebar tab |

---

## 3. Component Architecture

Use the existing `src/client/components/ui/` shadcn components + create new page-level components.

### Existing shadcn/ui (ready to use):
- `card`, `button`, `badge`, `avatar`, `tabs`, `dialog`, `select`, `input`, `textarea`, `label`, `separator`, `tooltip`, `progress`, `alert`, `sheet`

### New page-level components:

```
src/client/
├── App.tsx                          ← Root: layout shell + routing state
├── main.tsx                         ← Entry point (replaces main.ts)
├── index.html                       ← Update script src
│
├── components/
│   ├── layout/
│   │   ├── TopNav.tsx               ← Logo, session selector, timer, Jira status
│   │   ├── Sidebar.tsx              ← Fixed left panel container
│   │   ├── SidebarSection.tsx       ← Collapsible section wrapper
│   │   └── MainContent.tsx          ← Scrollable central area
│   │
│   ├── session/
│   │   ├── SessionSettings.tsx      ← Voting system, auto-reveal, timer config
│   │   ├── ModeratorControls.tsx    ← Lock, skip, add issue, settings
│   │   └── ParticipantsList.tsx     ← Avatar grid + status
│   │
│   ├── voting/
│   │   ├── MetricsRibbon.tsx        ← Average, agreement, consensus stats
│   │   ├── CurrentIssueCard.tsx     ← Jira/manual ticket display
│   │   ├── VotingCards.tsx          ← Fibonacci cards + ? + ☕
│   │   ├── ActionBar.tsx            ← Reveal, timer, skip, update, reset
│   │   └── VotingResults.tsx        ← Post-reveal breakdown
│   │
│   ├── history/
│   │   └── EstimationHistory.tsx    ← Table/grid of past votes
│   │
│   ├── jira/
│   │   ├── JiraStatus.tsx           ← "Connected to Jira" badge in top nav
│   │   ├── JiraSetupDialog.tsx      ← Connect/config modal
│   │   ├── BoardSelector.tsx        ← Board dropdown
│   │   └── IssuesList.tsx           ← Backlog/issues panel
│   │
│   └── chat/
│       └── ChatPanel.tsx            ← Messages + input (sidebar or bottom)
│
├── context/
│   └── SessionContext.tsx           ← Global session state (replaces GameState.ts)
│
├── hooks/
│   ├── useSocket.ts                 ← Socket.IO wrapper
│   ├── useSession.ts                ← Session CRUD
│   ├── useVoting.ts                 ← Voting lifecycle
│   ├── useJira.ts                   ← Jira integration
│   └── useParticipants.ts         ← Participant tracking
│
└── lib/
    └── utils.ts                     ← cn() + helpers (exists)
```

---

## 4. State Migration Strategy

### From `GameState.ts` (111 lines, imperative) → React Context

Current `GameState` state (from `components/GameState.ts`):
```ts
interface State {
  myName: string;
  myVote: null | number | string;
  isViewer: boolean;
  isFacilitator: boolean;
  currentSession: SessionData | null;
  currentJiraIssue: JiraIssue | null;
  jiraBoards: JiraBoard[];
  jiraIssues: JiraIssue[];
  chatMessages: ChatMessage[];
  typingUsers: string[];
  // ... + card layout persistence
}
```

**Target**: Split into domain-specific contexts:

| Context | State | Consumers |
|---------|-------|-----------|
| `SessionContext` | session, myName, myRole, isFacilitator | App, Sidebar, TopNav |
| `VotingContext` | currentVote, votesRevealed, results, votingTimer | VotingCards, MetricsRibbon, ActionBar |
| `JiraContext` | boards, issues, selectedBoard, currentIssue, connected | JiraStatus, CurrentIssueCard, IssuesList |
| `ChatContext` | messages, typingUsers, unreadCount | ChatPanel |
| `UIContext` | sidebarOpen, activeTab, expandedSections | Layout components |

### From `SocketManager.ts` (420 lines) → `useSocket` hook

Wrap all socket events in a single hook that bridges Socket.IO → React state:
```tsx
export function useSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Event handlers dispatch to contexts
  // Methods: createSession, joinSession, submitVote, revealVotes, resetVoting, etc.
}
```

---

## 5. Color & Design Tokens (New)

Move away from heavy emerald green to the reference's clean, neutral palette:

```css
:root {
  /* Primary — Jira-style blue */
  --primary: #0052CC;
  --primary-hover: #0747A6;
  --primary-muted: #DEEBFF;
  
  /* Success — Green for acceptance */
  --success: #36B37E;
  --success-bg: #E3FCEF;
  
  /* Warning — Amber for estimates */
  --warning: #FF991F;
  --warning-bg: #FFFAE6;
  
  /* Surfaces */
  --background: #FFFFFF;
  --canvas: #F4F5F7;          /* Page bg like reference */
  --surface: #FFFFFF;         /* Card backgrounds */
  --surface-hover: #F4F5F7;
  
  /* Text */
  --text-primary: #172B4D;
  --text-secondary: #5E6C84;
  --text-muted: #97A0AF;
  
  /* Borders */
  --border: #DFE1E6;
  --border-light: #EBECF0;
  
  /* Voting */
  --vote-neutral: #FFFFFF;
  --vote-selected: #0052CC;
  --vote-disabled: #F4F5F7;
}

.dark {
  --background: #1D2125;
  --canvas: #161A1D;
  --surface: #22272B;
  --text-primary: #DEE4EA;
  --text-secondary: #9FADBC;
  --border: #454F59;
}
```

---

## 6. Implementation Phases

### Phase 0: Toolchain ✅ (DONE)
- [x] Create branch `design/react-layout-refactor`
- [x] Install `react`, `react-dom`, `@types/react`, `@types/react-dom`

### Phase 1: Foundation (Week 1)
- [ ] Update `vite.config.ts` — add `@vitejs/plugin-react` for JSX transform
- [ ] Update `tsconfig.json` — add `"jsx": "react-jsx"`
- [ ] Rename `src/client/main.ts` → `src/client/main.tsx` (entry point)
- [ ] Create `src/client/App.tsx` — top-level layout shell (TopNav + Sidebar + MainContent)
- [ ] Create layout primitives: `TopNav`, `Sidebar`, `SidebarSection`, `MainContent`
- [ ] Wire up `src/client/index.html` → `main.tsx`
- [ ] **Test**: App renders empty layout without errors

### Phase 2: State & Socket (Week 1-2)
- [ ] Create `src/client/context/SessionContext.tsx` — session state
- [ ] Create `src/client/hooks/useSocket.ts` — Socket.IO bridge
- [ ] Port socket event handlers from `SocketManager.ts` → context + hook
- [ ] **Test**: Can create/join session, see participants update in real-time

### Phase 3: Sidebar (Week 2)
- [ ] Build `SessionSettings` — voting system dropdown, auto-reveal toggle, timer
- [ ] Build `ModeratorControls` — lock, skip, add issue (facilitator-only visibility)
- [ ] Build `ParticipantsList` — avatars with status dots, vote indicators
- [ ] **Test**: All sidebar controls functional, role-based visibility works

### Phase 4: Main Content — Voting (Week 2-3)
- [ ] Build `MetricsRibbon` — average, agreement%, consensus, voter count
- [ ] Build `CurrentIssueCard` — display Jira/manual ticket
- [ ] Build `VotingCards` — static row of Fibonacci cards (no drag!)
- [ ] Build `ActionBar` — reveal, timer, skip, reset, update Jira
- [ ] Build `VotingResults` — post-reveal breakdown
- [ ] **Test**: Full voting flow works end-to-end

### Phase 5: Main Content — History & Jira (Week 3)
- [ ] Build `EstimationHistory` — table of completed estimates
- [ ] Build `JiraStatus` badge + `JiraSetupDialog`
- [ ] Build `BoardSelector` + `IssuesList`
- [ ] **Test**: Jira import, history tracking, CSV export

### Phase 6: Chat (Week 3)
- [ ] Build `ChatPanel` (sidebar bottom or collapsible)
- [ ] **Test**: Real-time messages, typing indicators

### Phase 7: Polish (Week 4)
- [ ] Dark mode toggle + `:root` / `.dark` tokens
- [ ] Responsive: sidebar → hamburger on mobile
- [ ] Animations: reveal flips, card select, toast notifications
- [ ] Accessibility: keyboard nav, ARIA, focus management
- [ ] PWA: service worker, offline page
- [ ] **Test**: Lighthouse score ≥ 90

### Phase 8: Cleanup
- [ ] Delete `src/client/main.ts` (superseded by `main.tsx`)
- [ ] Delete `src/client/styles/layout.css`, `components.css` (migrated or deprecated)
- [ ] Remove old drag-and-drop utilities (`domBatcher.ts`, `listRenderer.ts` if unused)
- [ ] Archive `CLAUDE.md` → `CLAUDE.md.bak`
- [ ] **Final integration test**

---

## 7. File Inventory (What Stays / Goes / Changes)

### Stays (reused as-is or with minor updates):
| File | Action |
|------|--------|
| `src/server/index.ts` | ✅ **Keep** — backend is untouched |
| `src/server/socketHandlers.ts` | ✅ **Keep** — socket events unchanged |
| `src/shared/types/index.ts` | ✅ **Keep** — types reused |
| `src/client/assets/*` | ✅ **Keep** — favicons, icons |
| `src/client/components/ui/*` | ✅ **Keep** — shadcn components ready to import |
| `src/client/styles/globals.css` | 🔄 **Update** — new CSS vars, keep `@tailwindcss` imports |

### Goes (deprecated):
| File | Action |
|------|--------|
| `src/client/main.ts` | 🗑️ **Delete** — replace with `main.tsx` + `App.tsx` |
| `src/client/components/GameState.ts` | 🗑️ **Delete** — replaced by React Context |
| `src/client/components/SocketManager.ts` | 🗑️ **Delete** — replaced by `useSocket` hook |
| `src/client/styles/layout.css` | 🗑️ **Delete** — old drag-and-drop + split-screen styles |
| `src/client/styles/components.css` | 🗑️ **Delete** — old card styles |
| `src/client/styles/main.css` | 🗑️ **Delete** — old Tailwind component classes |
| `src/client/utils/domBatcher.ts` | 🗑️ **Delete** — vanilla DOM optimization |
| `src/client/utils/ui.ts` | 🗑️ **Delete** — vanilla utility functions |
| `src/client/utils/security.ts` | 🔄 **Move** — helper functions → `src/client/lib/security.ts` |
| `src/client/utils/storage.ts` | 🔄 **Keep** — rename to `src/client/lib/storage.ts`, adapt |
| `src/client/utils/eventManager.ts` | 🗑️ **Delete** — React handles cleanup |
| `src/client/utils/listRenderer.ts` | 🗑️ **Delete** — React diffing replaces this |

---

## 8. Key Design Decisions

### No Drag-and-Drop
The reference screenshot has a **rigid, predictable layout** — everything has a fixed place. This is *better* for a productivity tool. Sidebar sections can **collapse/expand** but not reorder.

### Static Sidebar
Fixed-width left sidebar (280px desktop), collapses to hamburger drawer on mobile (`< 768px`).

### Voting Cards as Horizontal Strip
In the reference, voting cards are a single horizontal row within the current issue card — not a sprawling grid. Much more focused.

### Metrics First
Post-reveal stats appear in a horizontal metrics ribbon *before* the detailed breakdown — immediate at-a-glance comprehension.

### Jira as First-Class
The reference shows "Connected to Jira" as a persistent status badge in the top nav. Jira integration is always visible, not hidden in a collapsed card.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Large refactor breaks existing features | Phase-by-phase migration, test after each phase. Keep old branch (`main`) as rollback. |
| Socket.IO events out of sync with new state | Maintain event map 1:1, update `SessionContext` dispatchers to match existing server events. |
| Performance: React context causing re-renders | Use `useMemo`/`useCallback`, split contexts by domain, consider Zustand if needed. |
| shadcn/ui components are React but app logic is vanilla | This is the point — we're React-ifying the whole app. No hybrid. |
| Tailwind v4 + React compatibility | Use `@tailwindcss/vite` plugin (already configured), ensure PostCSS runs. |

---

## 10. Success Criteria

- [ ] All existing features work (create/join, vote, reveal, reset, Jira, chat, history, export)
- [ ] No drag-and-drop cards anywhere
- [ ] Reference layout parity (top nav, sidebar, main content)
- [ ] Mobile-responsive (sidebar collapses, cards stack)
- [ ] Dark mode functional
- [ ] `main.ts` deleted, zero TypeScript errors
- [ ] Lighthouse score ≥ 90

---

## Appendix: React + Vite Config Changes

### `vite.config.ts` updates:
```ts
import react from '@vitejs/plugin-react';
// ...
plugins: [react(), htmlTemplatePlugin(env), tailwindcss()],
```

### `tsconfig.json` additions:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["react", "react-dom"]
  }
}
```

---

*Plan written by: Hermes, Sun Apr 26 2026*  
*Reference: Goldenhunter's screenshot + existing codebase audit*
