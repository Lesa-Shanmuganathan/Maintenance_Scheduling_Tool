# Design System Guide

This document reverse-engineers the UI/UX design system of the Calibration Issue Tracker Tool. It details all visual styling, layout paradigms, and interactive behaviors necessary to replicate its "look and feel."

## 1. Color Palette

The project utilizes a custom color palette defined primarily in standard CSS variables, complemented by inline styling for specific components.

### AVL Primary Palette
*   **Dark Blue:** `#005A99` (Used for Navbar, primary gradients, and active links)
*   **Turquoise:** `#00A4C7` (Used for accents, focus rings, and primary gradients)
*   **Navy/Cyan:** `#01C9B2` (Used in large background gradients)
*   **Teal:** `#698E6D`
*   **Dark Green:** `#028550` (Used in button hover gradients)
*   **Green:** `#8BD94B`

### UI/Surface Colors (Light Theme)
*   **Background:** `#f0f4f8` (Main application background)
*   **Surface:** `#ffffff` (Cards, sidebars, dropdowns)
*   **Surface Border:** `rgba(0, 90, 153, 0.12)` (Standard component border)
*   **Sidebar Border:** `rgba(0, 90, 153, 0.1)`
*   **Input Background:** `#f8fafc`
*   **Input Border:** `#e2e8f0`

### Typography Colors
*   **Text Dark:** `#1e293b` (Primary text color for body and headings)
*   **Text Muted:** `#64748b` (Secondary text, descriptions, inactive links)
*   **Text Subdued (Inputs):** `#334155` (Form labels)
*   **Placeholder/Icons:** `#94a3b8`

### Semantic Colors
*   **Danger/Error:** `#ef4444` (Used for destructive actions like "Sign out")
*   **Primary Action/Info:** Handled by Dark Blue (`#005A99`) and Turquoise (`#00A4C7`)

---

## 2. Typography

The application uses standard web-safe fonts with a modern aesthetic, relying primarily on `Inter`.

*   **Font Families:** `'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
*   **Base Line Height:** `1.6`
*   **Base Font Size:** `1rem` (16px) for standard body text and inputs.

### Specific Elements
*   **H1 (Login Tagline):** `2rem` (32px), Font Weight `700`, Line Height `1.3`, Color `white`
*   **H2 (Form Headers):** `1.75rem` (28px), Font Weight `700`, Color `#1e293b`
*   **H2 (Navbar Title):** `1.15rem`, Font Weight `600`, Color `white`
*   **Paragraphs/Subtitles:** `1rem` or `0.95rem`, Color `#64748b` or `rgba(255,255,255,0.8)`
*   **Form Labels:** `0.85rem` or `0.875rem`, Font Weight `600`, Color `#334155`
*   **Buttons:** `1rem`, Font Weight `600`
*   **Small/Muted Text:** `0.8rem` (e.g., Footer copyright, user perimeter details)

---

## 3. Spacing & Layout

The UI relies heavily on CSS Flexbox for structure and spacing.

### Container Layouts
*   **Main Application Shell:** Flex column, `100vh`.
    *   **Navbar:** Fixed at the top, Height `60px`, Padding `0 2rem`.
    *   **Body Container:** Flex row to hold Sidebar and Main Content.
    *   **Sidebar:** Fixed width `240px`, Padding `1.5rem 0.75rem`.
    *   **Main Content Area:** `flex: 1`, Padding `2rem`, Scrollable (`overflow-y: auto`).
*   **Split Screen (Login):** Flex row, `100vh` min-height.
    *   Left Branded Panel: `flex: 0 0 45%`, Padding `3rem`.
    *   Right Form Panel: `flex: 1`, Padding `3rem`, form container `max-width: 400px`.

### Spacing Scale (Margins & Padding)
*   **Inputs:** `0.75rem 1rem` (Standard) or `0.85rem 1rem 0.85rem 3rem` (With leading icon)
*   **Buttons:** `0.75rem 1.5rem` (Standard inline) or `0.9rem` (Full width block)
*   **Form Groups:** Bottom margin of `1.5rem` (`margin-bottom: 24px`) between input groups.
*   **Label to Input:** Gap of `0.5rem` (`8px`).
*   **Component Gaps:** Use of Flex `gap` properties (`0.5rem`, `0.75rem`, `1rem`).

---

## 4. Component Anatomy (The "Look")

### Borders & Radii
*   **Rounded vs Sharp:** The design favors rounded corners for a soft, modern feel.
*   **Buttons & Inputs:** `8px` (Standard) or `10px` (Login Form variants).
*   **Cards/Glass Panels:** `12px`.
*   **Badges/Pills:** `20px` (e.g., "Secure Login" badge).
*   **Avatars:** `50%` (Perfect circles).
*   **Borders:** Subtle `1px solid var(--color-surface-border)` for structural elements. Form inputs use a slightly thicker `1.5px solid #e2e8f0`.

### Shadows & Elevation
*   **Navbar (Sticky):** `0 2px 8px rgba(0, 90, 153, 0.15)`
*   **Sidebar:** `2px 0 8px rgba(0, 0, 0, 0.03)`
*   **Glass Panels/Cards:** `0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 90, 153, 0.04)`
*   **Primary Buttons:** `0 4px 15px rgba(0, 90, 153, 0.25)`
*   **Dropdowns/Modals:** `0 10px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)`

### Glassmorphism & Effects
*   **Gradients:**
    *   **Primary Button:** `linear-gradient(135deg, var(--color-dark-blue), var(--color-turquoise))`
    *   **Login Splash Background:** `linear-gradient(160deg, #005A99 0%, #00A4C7 35%, #01C9B2 65%, #028550 100%)`
*   **Overlay Shapes:** Uses absolutely positioned divs with low-opacity white backgrounds (`rgba(255,255,255,0.06)`, `0.04`, `0.03`) and `50%` border-radius to create depth on dark gradient backgrounds.

---

## 5. Interactive States (The "Feel")

The system uses smooth transitions to provide immediate feedback to user actions.

### CSS Transitions
*   Standard property transition: `transition: all 0.2s ease` or `transition: all 0.3s ease`.

### Hover States
*   **Links (`<a>`):** Color transition to `var(--color-dark-blue)`.
*   **Primary Buttons:**
    *   Gradient shift to: `linear-gradient(135deg, var(--color-turquoise), var(--color-dark-green))`
    *   Elevation lift: `transform: translateY(-2px)`
    *   Shadow expansion: `box-shadow: 0 6px 20px rgba(0, 164, 199, 0.3)` or `rgba(0, 90, 153, 0.35)`
*   **Secondary Buttons/Links:** Background darkens (e.g., `#f1f5f9` to `#e2e8f0`) and border color shifts to Turquoise.
*   **Sidebar Links:** Background color changes to `rgba(0, 90, 153, 0.08)` and border-left highlights with `3px solid var(--color-dark-blue)`.
*   **Cards/Glass Panels:** Hover increases shadow (`0 4px 16px rgba(0, 90, 153, 0.08)`) and border opacity (`rgba(0, 90, 153, 0.18)`).

### Active & Focus Rings
*   **Inputs:** Outline is removed. Border color shifts to Turquoise (`#00A4C7`), paired with an outer box-shadow ring for accessibility: `box-shadow: 0 0 0 3px rgba(0, 164, 199, 0.12)` (or `0.1` opacity).
*   **Buttons (Active):** `transform: translateY(0)` to simulate a physical button press.

### Disabled States
*   **Buttons:** `opacity: 0.6`, `cursor: not-allowed`, no transform effects.

### Animations
*   **Fade In (`.animate-fade-in`):** Used for page loads and component mounting.
    `@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }` (Duration: `0.5s ease-out forwards`).
*   **Spinners:** Loader icons use standard `rotate` keyframes (`animation: spin 1s linear infinite`).
