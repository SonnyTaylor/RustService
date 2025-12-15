/**
 * Animation Context
 * 
 * Provides application-wide animation controls and reusable animation presets.
 * Respects the user's animation preference setting.
 * 
 * @example
 * ```tsx
 * import { useAnimation, Motion, AnimatedList } from '@/components/animation-context';
 * 
 * function MyComponent() {
 *   const { animationsEnabled, fadeIn } = useAnimation();
 *   
 *   return (
 *     <Motion {...fadeIn}>
 *       <div>Animated content</div>
 *     </Motion>
 *   );
 * }
 * ```
 */

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { motion, AnimatePresence, MotionProps, Variants } from 'framer-motion';
import { useSettings } from './settings-context';

// =============================================================================
// Animation Presets
// =============================================================================

/** Standard duration for animations (in seconds) */
const DURATION = 0.2;

/** Faster duration for hover/micro-interactions */
const FAST_DURATION = 0.15;

/** Easing curve for smooth animations */
const EASE = [0.4, 0, 0.2, 1];

/**
 * Animation preset definitions
 */
export const ANIMATION_PRESETS = {
  /** Fade in from transparent */
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: DURATION, ease: EASE },
  },
  
  /** Fade in with slight upward movement */
  fadeInUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: DURATION, ease: EASE },
  },
  
  /** Fade in with scale */
  fadeInScale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: DURATION, ease: EASE },
  },
  
  /** Slide in from left */
  slideInLeft: {
    initial: { opacity: 0, x: -12 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 12 },
    transition: { duration: DURATION, ease: EASE },
  },
  
  /** Slide in from right */
  slideInRight: {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 },
    transition: { duration: DURATION, ease: EASE },
  },
  
  /** Container for staggered children */
  staggerContainer: {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.02,
      },
    },
    exit: {},
  },
  
  /** Child item for stagger container */
  staggerItem: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: { duration: DURATION, ease: EASE },
  },
  
  /** Hover scale for interactive elements */
  hoverScale: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { duration: FAST_DURATION },
  },
  
  /** Subtle hover lift for cards */
  hoverLift: {
    whileHover: { y: -2 },
    transition: { duration: FAST_DURATION },
  },
} as const;

// =============================================================================
// Framer Motion Variants
// =============================================================================

/** Stagger container variants for use with motion.div */
export const staggerContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

/** Stagger item variants for use with motion.div */
export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { duration: DURATION, ease: 'easeOut' },
  },
};

/** Tab content transition variants */
export const tabContentVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { duration: DURATION, ease: 'easeOut' },
  },
  exit: { 
    opacity: 0, 
    y: -6,
    transition: { duration: FAST_DURATION, ease: 'easeOut' },
  },
};

// =============================================================================
// Context
// =============================================================================

interface AnimationContextValue {
  /** Whether animations are enabled in settings */
  animationsEnabled: boolean;
  /** All animation presets */
  presets: typeof ANIMATION_PRESETS;
  /** Get motion props for a preset (returns empty if disabled) */
  getMotionProps: (presetName: keyof typeof ANIMATION_PRESETS) => MotionProps;
  /** Shorthand for common presets - safely returns empty props if disabled */
  fadeIn: MotionProps;
  fadeInUp: MotionProps;
  fadeInScale: MotionProps;
  slideInLeft: MotionProps;
  slideInRight: MotionProps;
  staggerContainer: MotionProps;
  staggerItem: MotionProps;
  hoverScale: MotionProps;
  hoverLift: MotionProps;
}

const AnimationContext = createContext<AnimationContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface AnimationProviderProps {
  children: ReactNode;
}

/**
 * Animation provider component
 * 
 * Wraps the app to provide animation context based on user settings
 */
export function AnimationProvider({ children }: AnimationProviderProps) {
  const { settings } = useSettings();
  const animationsEnabled = settings.appearance?.enableAnimations ?? true;

  const value = useMemo<AnimationContextValue>(() => {
    const getMotionProps = (presetName: keyof typeof ANIMATION_PRESETS): MotionProps => {
      if (!animationsEnabled) return {};
      return ANIMATION_PRESETS[presetName] as MotionProps;
    };

    return {
      animationsEnabled,
      presets: ANIMATION_PRESETS,
      getMotionProps,
      fadeIn: getMotionProps('fadeIn'),
      fadeInUp: getMotionProps('fadeInUp'),
      fadeInScale: getMotionProps('fadeInScale'),
      slideInLeft: getMotionProps('slideInLeft'),
      slideInRight: getMotionProps('slideInRight'),
      staggerContainer: getMotionProps('staggerContainer'),
      staggerItem: getMotionProps('staggerItem'),
      hoverScale: getMotionProps('hoverScale'),
      hoverLift: getMotionProps('hoverLift'),
    };
  }, [animationsEnabled]);

  return (
    <AnimationContext.Provider value={value}>
      {children}
    </AnimationContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Use animation context
 * 
 * @returns Animation context with presets and enabled state
 * @throws Error if used outside AnimationProvider
 */
export function useAnimation(): AnimationContextValue {
  const context = useContext(AnimationContext);
  
  if (!context) {
    throw new Error('useAnimation must be used within an AnimationProvider');
  }
  
  return context;
}

// =============================================================================
// Convenience Components
// =============================================================================

interface MotionDivProps extends MotionProps {
  children: ReactNode;
  className?: string;
  /** Animation preset to use */
  preset?: keyof typeof ANIMATION_PRESETS;
}

/**
 * Motion div that respects animation settings
 * 
 * Automatically disables animations when setting is off
 */
export function Motion({ children, className, preset, ...props }: MotionDivProps) {
  const { animationsEnabled, getMotionProps } = useAnimation();
  
  const motionProps = preset ? getMotionProps(preset) : props;
  
  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }
  
  return (
    <motion.div className={className} {...motionProps}>
      {children}
    </motion.div>
  );
}

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
}

/**
 * Animated list container with staggered children
 * 
 * Wrap list items with this for staggered entrance animations
 */
export function AnimatedList({ children, className }: AnimatedListProps) {
  const { animationsEnabled } = useAnimation();
  
  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }
  
  return (
    <motion.div
      className={className}
      variants={staggerContainerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

interface AnimatedItemProps {
  children: ReactNode;
  className?: string;
}

/**
 * Animated list item for use inside AnimatedList
 */
export function AnimatedItem({ children, className }: AnimatedItemProps) {
  const { animationsEnabled } = useAnimation();
  
  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }
  
  return (
    <motion.div className={className} variants={staggerItemVariants}>
      {children}
    </motion.div>
  );
}

// Re-export Framer Motion utilities for convenience
export { motion, AnimatePresence };
