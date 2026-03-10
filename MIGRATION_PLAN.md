# Complexity → Scira Visual Migration Plan

> **Goal**: Restyle the Complexity Next.js app to closely match Scira's visual design and UI patterns, without touching backend logic, API routes, database schema, or auth flows.

> [!CAUTION]
> ## 🛑 MANDATORY: STOP BEFORE IMPLEMENTATION
> Any coding agent MUST NOT proceed with any file modifications or package installs until the USER provides explicit answers to the following three questions. These decisions dictate the core design system and dependency tree.
>
> 1. **Typography Choice**: Scira uses Apple's proprietary **SF Pro**. Choose one:
>    - **SF Pro** (Match Scira exactly, but carries licensing risk/proprietary files)
>    - **Geist Sans** (Matches the aesthetic, open-source, highly recommended)
>    - **Inter** (Keep existing Complexity font, but less "Scira-like")
>
> 2. **Dependency Approval**: Review the 8 new packages in **Section 1**. Are all approved, or should any be removed?
>
> 3. **Optional Scope**: Is **Phase 6 (Command Palette / Cmd+K)** included in the initial migration, or should it be skipped?

---

## 1. Dependency & Version Audit

Both projects use **Tailwind CSS v4** and **Next.js (Complexity: 16.1.6, Scira: 16.1.1-canary.10)** — no framework-level conflicts.

| Package | Complexity | Scira | Action |
|---|---|---|---|
| `tailwindcss` | `^4` | `^4.1.17` | ✅ Compatible |
| `next` | `16.1.6` | `16.1.1-canary.10` | ✅ Complexity is newer — keep as-is |
| `react` / `react-dom` | `19.2.3` | `^19.2.3` | ✅ Match |
| `next-themes` | `^0.4.6` | `0.4.6` | ✅ Match |
| `motion` (framer-motion) | `^12.35.1` | `^12.23.26` | ✅ Compatible |
| `lucide-react` | `^0.577.0` | `0.562.0` | ✅ Complexity is newer |
| `sonner` | `^2.0.7` | `^2.0.7` | ✅ Match |
| `tailwind-merge` | `^3.5.0` | `^3.4.0` | ✅ Compatible |
| `class-variance-authority` | `^0.7.1` | `^0.7.1` | ✅ Match |
| `clsx` | `^2.1.1` | `^2.1.1` | ✅ Match |

### Packages to add (requires approval)

| Package | Purpose | Notes |
|---|---|---|
| `tw-animate-css` | shadcn/ui animation utilities (accordion, sheet, etc.) | Required by Scira's component library |
| `tailwind-scrollbar` | Custom scrollbar styling | Used in Scira's `globals.css` (`@plugin`) |
| `@radix-ui/react-collapsible` | Collapsible sidebar sections | Scira sidebar pattern |
| `@radix-ui/react-popover` | Popover menus for settings/profile | Used in Scira's sidebar footer |
| `@radix-ui/react-tabs` | Tabbed views (library, settings) | Scira uses for search mode switching |
| `@radix-ui/react-select` | Select menus (model picker upgrade) | Richer than current DropdownMenu approach |
| `vaul` | Mobile drawer component | Scira uses for mobile-responsive sheets |
| `cmdk` | Command palette (Cmd+K search history) | Scira's `ChatHistoryDialog` pattern |

> [!IMPORTANT]
> All new packages above require your approval before install. None are heavy or exotic — all are standard shadcn/ui ecosystem dependencies.

### Packages Complexity already has that align
`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-avatar`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-tooltip` — all match Scira's Radix usage.

---

## 2. Design Token Migration

### Colour System

Scira uses **oklch** colour space; Complexity uses **hsl**. Below is the side-by-side mapping:

#### Light Mode

| Variable | Complexity (hsl) | Scira (oklch) | Notes |
|---|---|---|---|
| `--background` | `hsl(0 0% 98%)` | `oklch(0.9821 0 0)` | Very close — near-white. Scira is marginally warmer |
| `--foreground` | `hsl(0 0% 9%)` | `oklch(0.2435 0 0)` | Near-identical |
| `--card` | `hsl(0 0% 100%)` | `oklch(0.9911 0 0)` | Scira slightly off-white |
| `--muted` | `hsl(0 0% 96%)` | `oklch(0.9521 0 0)` | Close |
| `--muted-foreground` | `hsl(0 0% 45%)` | `oklch(0.5032 0 0)` | Close |
| `--border` | `hsl(0 0% 90%)` | `oklch(0.8822 0 0)` | Close |
| `--primary` | ❌ Missing | `oklch(0.4341 0.0392 41.99)` | **Warm brown/amber** — Scira's signature |
| `--primary-foreground` | ❌ Missing | `oklch(1 0 0)` | White |
| `--secondary` | ❌ Missing | `oklch(0.92 0.0651 74.37)` | Light gold |
| `--accent` | ❌ Missing | `oklch(0.931 0 0)` | Light grey |
| `--popover` | ❌ Missing | `oklch(0.9911 0 0)` | Same as card |
| `--destructive` | ❌ Missing | `oklch(0.6271 0.1936 33.34)` | Red |
| `--ring` | ❌ Missing | `oklch(0.4341 0.0392 41.99)` | Matches primary |
| `--input` | ❌ Missing | `oklch(0.8822 0 0)` | Same as border |
| `--sidebar` | ❌ Missing | `oklch(0.9881 0 0)` | Near-white |

#### Dark Mode

| Variable | Complexity (hsl) | Scira (oklch) | Notes |
|---|---|---|---|
| `--background` | `hsl(0 0% 7%)` | `oklch(0.1776 0 0)` | Very close |
| `--foreground` | `hsl(0 0% 95%)` | `oklch(0.9491 0 0)` | Match |
| `--card` | `hsl(0 0% 10%)` | `oklch(0.2134 0 0)` | Scira slightly lighter |
| `--primary` | ❌ Missing | `oklch(0.9247 0.0524 66.17)` | **Light gold** (inverted from light mode) |
| `--border` | `hsl(0 0% 18%)` | `oklch(0.2351 0.0115 91.75)` | Scira has slight warm tint |

### What to change in `globals.css`

1. **Switch colour space** from hsl to oklch across all variables
2. **Add missing variables**: `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--accent`, `--accent-foreground`, `--popover`, `--popover-foreground`, `--destructive`, `--destructive-foreground`, `--ring`, `--input`, `--sidebar-*` (full set), `--chart-*`, `--radius`, `--shadow-*`
3. **Register all tokens** in `@theme inline` block (Scira pattern)
4. **Add radius tokens**: `--radius: 0.875rem` + computed `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`
5. **Add shadow tokens**: `--shadow-2xs` through `--shadow-2xl`
6. **Add base layer rules**: `* { @apply border-border }` and `body { @apply bg-background text-foreground }`

### Typography

| Aspect | Complexity | Scira | Change |
|---|---|---|---|
| Primary font | Inter (Google Fonts) | SF Pro (local `.ttf`) | Ship SF Pro font files to `public/fonts/` and register as `--font-sans` local font; fall back to Inter |
| Secondary font | None | Be Vietnam Pro (Google) | Add for accent/heading use |
| Logo font | None | Baumans (Google) | Optional — only for branding |
| `font-sans` variable | `--font-inter` | `--font-sans` | Rename |

> [!WARNING]
> SF Pro is Apple's proprietary font. For a self-hosted project, you may want to stick with Inter or use an open alternative like Geist Sans. Flag for your decision.

### Border Radius

Scira uses `--radius: 0.875rem` (14px) — significantly rounder than Tailwind defaults. This gives the soft, modern pill-shaped look. Currently Complexity hardcodes `rounded-2xl`, `rounded-xl`, `rounded-md` etc. ad-hoc. Adopting the token system means components will use `rounded-lg` (which maps to `--radius-lg`) consistently.

---

## 3. Layout & Shell Components

### Structural differences

| Aspect | Complexity | Scira |
|---|---|---|
| Sidebar system | Custom `Sidebar.tsx` (260px fixed) | shadcn/ui `SidebarProvider` + `AppSidebar` (collapsible, keyboard shortcut) |
| Mobile nav | Custom overlay `MobileNav.tsx` | shadcn/ui `Sheet`-based drawer |
| App shell | `AppShell.tsx` wraps sidebar + content | `SidebarLayout.tsx` → `SidebarInset` |
| Root layout | `AppProviders` → `AppShell` | `Providers` → `SidebarProvider` → `Toaster` |
| Theme toggle | Custom `ThemeToggle.tsx` | `theme-switcher.tsx` (dropdown with system option) |
| Chat history | Sidebar thread list via `useEffect` fetch | `ChatHistoryDialog` (Cmd+K command palette) |

### Components to restyle (ranked by visual impact)

1. **`AppShell.tsx`** → Adopt shadcn/ui `SidebarProvider` pattern with collapsible sidebar, glassmorphism mobile header
2. **`Sidebar.tsx`** → Restructure to match `app-sidebar.tsx`: grouped sections (New Search, Recent, Pinned), avatar footer, collapsible groups
3. **`MobileNav.tsx`** → Replace with `Sheet`/`Drawer` component from vaul
4. **`page.tsx` (home)** → Centre-aligned search with category suggestions, Scira's orb animation (optional)
5. **`ThemeToggle.tsx`** → Upgrade to dropdown with Light/Dark/System options

---

## 4. Feature Component Migration

### Search Input (`SearchBar.tsx`)

| Aspect | Complexity | Scira |
|---|---|---|
| Container | `rounded-2xl bg-white p-3 shadow-md` | Dynamic `form-component.tsx` (175KB!) with mode tabs, file upload, voice input |
| Text input | `TextareaAutosize` with basic styling | `whatsize` CSS utility for auto-sizing textarea with `field-sizing: content` |
| Model selector | Radix DropdownMenu with grouped categories | Inline mode selector (tabs at top of input) |
| Actions | Attach + Submit buttons | Attach, Voice, Search mode tabs, Submit |
| Animation | `motion.div` layoutId | Framer Motion with complex transitions |

**Changes needed**:
- Style the container with Scira's rounded card + subtle shadow
- Add border-radius tokens instead of hardcoded `rounded-2xl`
- Style the model selector as a pill-style selector
- Add hover/focus states matching Scira's warm accent palette

### Message Rendering (`MessageList.tsx`)

| Aspect | Complexity | Scira |
|---|---|---|
| User messages | Dark-bg pill (`bg-zinc-900 text-white`) | Similar dark bubble pattern |
| AI messages | `MarkdownRenderer` + Copy button | `markdown.tsx` (80KB) with sugar-high syntax highlighting, KaTeX math, rich media embeds |
| Citations | `SourceCarousel` (horizontal scroll) | Inline citations with numbered superscripts + expandable source cards |
| Related questions | `RelatedQuestions.tsx` (simple list) | Inline suggestion chips with accent colour |

**Changes needed**:
- Update user message bubble colours to use `--primary` token
- Add sugar-high syntax highlighting for code blocks (replaces `rehype-highlight`)
- Style citations to match Scira's inline superscript pattern
- Update related questions to chip-style layout
- Apply markdown heading/list styles from Scira's `globals.css` utilities

### Spaces / Library Views

Complexity's `SpaceCard.tsx`, `DocumentList.tsx`, `FileUploader.tsx`, `CreateSpaceDialog.tsx`, `ProcessingBadge.tsx` have no direct Scira equivalents (Scira doesn't have a spaces/library concept). These should be restyled visually to match Scira's design language:
- Apply Scira's card styles (`bg-card`, `border-border`, `rounded-lg`)
- Use `--primary` accents for action buttons
- Apply consistent shadows from the token system
- Update dialogs to use Scira-style modal patterns

---

## 5. Components Scira Has That Complexity Lacks

### Worth adopting

| Component | Complexity | New dependency? | Effort |
|---|---|---|---|
| **Command palette** (`chat-history-dialog.tsx`) | High — Cmd+K search through threads | `cmdk` package | Medium |
| **shadcn/ui sidebar** (`components/ui/sidebar.tsx`) | High — collapsible, responsive, accessible | No new — uses existing Radix | Medium-High |
| **Toast system** (`components/ui/sonner.tsx`) | Low — already have `sonner` | No | Low |
| **Keyboard shortcuts dialog** (`keyboard-shortcuts-dialog.tsx`) | Medium — UX polish | No | Low |
| **Theme switcher** (`theme-switcher.tsx`) | Medium — Light/Dark/System dropdown | No | Low |
| **Loading spinner** (`components/ui/loading.tsx`) | Medium — polished loading states | No | Low |
| **Skeleton** (`components/ui/skeleton.tsx`) | Low — already have `LoadingSkeleton.tsx` | No | Low |

### Not worth adopting (Scira-specific features)

These are Scira-specific features with heavy backend coupling and no relevance to Complexity:
- `extreme-search.tsx`, `multi-search.tsx` (94KB, 29KB) — search orchestration
- `weather-chart.tsx`, `crypto-charts.tsx`, `flight-tracker.tsx` — specialised widgets
- `lookout/` feature — scheduled search monitoring
- `voice/` feature — ElevenLabs TTS
- `xql/` feature — Twitter/X query language
- Pricing, subscription, payment components

---

## 6. Risk & Constraint Flags

> [!CAUTION]
> **No-go zones — do not modify:**

| Risk Area | Files | Why |
|---|---|---|
| **Auth configuration** | `src/auth.ts`, `src/app/(auth)/`, `src/app/api/auth/` | NextAuth setup — any change to providers or callbacks breaks login |
| **API routes** | `src/app/api/*` | Backend endpoints for threads, chat, spaces, library, models |
| **Database schema** | `drizzle.config.ts`, `src/lib/db/` | Schema changes would require migration |
| **Environment variables** | `.env`, `.env.example` | Backend service credentials |
| **Docker config** | `docker-compose.yml`, `Dockerfile` | Infrastructure — unrelated to styling |

### Lower-risk concerns

| Risk | Description | Mitigation |
|---|---|---|
| **`next-themes` hydration** | Scira uses `suppressHydrationWarning`; Complexity doesn't | Add it to `<html>` and `<body>` tags |
| **CSS variable naming** | Renaming `--font-inter` → `--font-sans` could break any inline references | Grep for usage before renaming |
| **oklch browser support** | oklch is supported in all modern browsers but not IE11 | Acceptable — Next.js 16 doesn't target IE11 anyway |
| **Existing tests** | `SearchBar.test.tsx`, `MessageList.test.tsx`, `Sidebar.test.tsx`, `FollowUpInput.test.tsx` may assert specific class names | Review and update test expectations |

---

## 7. Phased Execution Order

### Phase 1: Design Foundation (Highest impact, lowest risk)
**Files**: `globals.css`, `layout.tsx`

- [ ] Migrate `globals.css` to full Scira token system (oklch colours, radius, shadows)
- [ ] Register all tokens in `@theme inline` block
- [ ] Add base layer rules (`border-border`, `bg-background text-foreground`)
- [ ] Update `layout.tsx` font setup (Inter → system font preference)
- [ ] Add `suppressHydrationWarning` to html/body
- [ ] Install approved new packages

**Testable**: App renders with new colour palette; light/dark mode works; no layout break.

---

### Phase 2: Shell & Navigation (High impact, medium risk)
**Files**: `AppShell.tsx`, `Sidebar.tsx`, `MobileNav.tsx`, `ThemeToggle.tsx`

- [ ] Restyle `Sidebar.tsx` with Scira's visual language (oklch card background, accent borders, rounded nav items)
- [ ] Restyle `AppShell.tsx` container and mobile header
- [ ] Upgrade `MobileNav.tsx` to shadcn/ui Sheet/Drawer pattern
- [ ] Upgrade `ThemeToggle.tsx` to dropdown with Light/Dark/System
- [ ] Apply new design tokens throughout

**Testable**: Sidebar looks polished; mobile nav works; theme switching works on all three modes.

---

### Phase 3: Search & Input Components (High impact, low risk)
**Files**: `SearchBar.tsx`, `FollowUpInput.tsx`

- [ ] Restyle search bar container (tokens, shadows, radius)
- [ ] Update model selector pill styling
- [ ] Update button accent colours to `--primary`
- [ ] Add hover/focus ring states using `--ring`

**Testable**: Home page search bar matches Scira aesthetic; model selector dropdown works.

---

### Phase 4: Message & Content Rendering (Medium impact, medium risk)
**Files**: `MessageList.tsx`, `MarkdownRenderer.tsx`, `SourceCarousel.tsx`, `RelatedQuestions.tsx`

- [ ] Update user/assistant message bubble styling
- [ ] Apply Scira's markdown typography rules (headings, lists, code, blockquotes)
- [ ] Restyle citation/source cards
- [ ] Update related questions to chip layout
- [ ] Apply syntax highlighting theme from Scira's sugar-high variables

**Testable**: Chat thread renders with polished typography; citations display correctly.

---

### Phase 5: Spaces & Library (Lower impact, low risk)
**Files**: `SpaceCard.tsx`, `DocumentList.tsx`, `FileUploader.tsx`, `CreateSpaceDialog.tsx`, `ProcessingBadge.tsx`

- [ ] Apply design tokens to all cards, buttons, and dialogs
- [ ] Standardise border radius and shadow usage
- [ ] Update dialog styles

**Testable**: Spaces and library pages look cohesive with rest of the restyled app.

---

### Phase 6: New Capabilities (Optional, medium risk)
**Files**: New files

- [ ] Add Cmd+K command palette for thread search (using `cmdk`)
- [ ] Add keyboard shortcuts dialog
- [ ] Add enhanced loading/skeleton states

**Testable**: Cmd+K opens history search; keyboard shortcuts display correctly.

---

## Verification Plan

### Automated Tests
Complexity has existing tests at `src/test/` and component-level tests:
- `src/components/search/SearchBar.test.tsx`
- `src/components/chat/MessageList.test.tsx`
- `src/components/chat/FollowUpInput.test.tsx`
- `src/components/layout/Sidebar.test.tsx`

**Command**: `cd /home/gary/complexity/app && npm test`

After each phase, run existing tests to check for regressions. Tests that assert specific Tailwind class names will need updating to reflect new token-based classes.

### Manual Verification
After each phase:
1. Start the dev server: `cd /home/gary/complexity/app && npm run dev`
2. Check both light and dark mode in the browser
3. Verify mobile responsiveness (resize browser below 768px)
4. Check sidebar collapse/expand functionality
5. Verify theme switching works (if in Phase 2+)
6. Test a full search flow: home page → enter query → view results
7. Test spaces page: view cards, create space dialog

> [!NOTE]
> Since this is a visual migration, the primary verification is **visual inspection** in the browser. I recommend doing this together after each phase so you can provide feedback on the aesthetic direction.
