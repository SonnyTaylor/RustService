# Animation System

RustService uses Framer Motion for smooth, polished UI animations with a user-toggleable setting.

## Quick Start

### Using the `useAnimation` Hook

```tsx
import { useAnimation, motion } from '@/components/animation-context';

function MyComponent() {
  const { animationsEnabled, fadeInUp, hoverScale } = useAnimation();
  
  return (
    <motion.div {...fadeInUp}>
      <motion.button {...hoverScale}>
        Click me
      </motion.button>
    </motion.div>
  );
}
```

### Using Convenience Components

```tsx
import { AnimatedList, AnimatedItem, Motion } from '@/components/animation-context';

// Staggered list animation
function CardGrid({ items }) {
  return (
    <AnimatedList className="grid grid-cols-3 gap-4">
      {items.map(item => (
        <AnimatedItem key={item.id}>
          <Card>{item.name}</Card>
        </AnimatedItem>
      ))}
    </AnimatedList>
  );
}

// Simple fade-in with preset
function Panel() {
  return (
    <Motion preset="fadeInUp">
      <div className="p-4">Content</div>
    </Motion>
  );
}
```

## Available Presets

| Preset | Effect |
|--------|--------|
| `fadeIn` | Opacity 0 → 1 |
| `fadeInUp` | Opacity + Y translate (8px up) |
| `fadeInScale` | Opacity + scale (0.95 → 1) |
| `slideInLeft` | Opacity + X translate from left |
| `slideInRight` | Opacity + X translate from right |
| `staggerContainer` | Parent container for staggered children |
| `staggerItem` | Child item for stagger effect |
| `hoverScale` | Scale 1.02 on hover, 0.98 on tap |
| `hoverLift` | Y -2px on hover |

## Animation Context API

### `useAnimation()` Hook

Returns:
- `animationsEnabled: boolean` — Current setting state
- `presets` — All animation preset objects
- `getMotionProps(presetName)` — Get motion props for a preset
- Shorthand props: `fadeIn`, `fadeInUp`, `fadeInScale`, etc.

### Components

- **`<Motion>`** — Wrapper that respects animation setting
  - Props: `preset?: string`, `className?: string`, `children`
- **`<AnimatedList>`** — Container with staggered entrance
- **`<AnimatedItem>`** — List item for stagger animation

## Disabling Animations

Users can toggle animations in **Settings → Appearance → Animations**.

When disabled:
- All `motion.div` elements render as plain `div`
- No transitions or animations run
- Performance improves slightly

## Adding New Animations

1. Add preset to `ANIMATION_PRESETS` in `animation-context.tsx`:

```ts
export const ANIMATION_PRESETS = {
  // ... existing presets
  myNewPreset: {
    initial: { opacity: 0, rotate: -5 },
    animate: { opacity: 1, rotate: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};
```

2. Add to context interface if you want shorthand access:

```ts
interface AnimationContextValue {
  // ... existing
  myNewPreset: MotionProps;
}
```

3. Add to value object in `AnimationProvider`:

```ts
myNewPreset: getMotionProps('myNewPreset'),
```

## Best Practices

1. **Always check `animationsEnabled`** for raw motion.div usage
2. **Use convenience components** (`Motion`, `AnimatedList`) when possible
3. **Keep durations short** (0.15-0.3s) for snappy feel
4. **Use `easeOut`** for most animations
5. **Stagger sparingly** — only for grids/lists, not every component

## Examples

### Tab Content Animation (App.tsx)

```tsx
<AnimatePresence mode="wait" initial={false}>
  {activeTab === id && (
    <motion.div
      key={id}
      variants={tabContentVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <Component />
    </motion.div>
  )}
</AnimatePresence>
```

### Card with Hover Effect

```tsx
const { hoverLift, fadeInUp } = useAnimation();

<motion.div {...fadeInUp} {...hoverLift}>
  <Card>...</Card>
</motion.div>
```
